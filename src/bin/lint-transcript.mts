#!/usr/bin/env node

/**
 * Agent Transcript Linter
 *
 * Analyzes AI agent transcripts/observations for compliance with
 * the 7 Laws of AI Agent Discipline.
 *
 * Accepted input is JSONL, one JSON object per line, in any of three row
 * shapes. Rows are normalised one at a time, so a file may mix them. A line
 * that is JSON but not an object (null, a number, a string, an array) is
 * skipped; a line that is not JSON is counted as a parse failure.
 *
 *   1. Claude Code transcript (~/.claude/projects/<project>/<session>.jsonl)
 *        {"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{...}}]}}
 *      Each tool_use block of an assistant row is one tool call. Every other
 *      row (user/tool_result, system, summary, ...) is not a tool call. A block
 *      whose id was already seen is the same call written again (Claude Code
 *      rewrites earlier rows into the file on a long or resumed session) and
 *      is counted once.
 *   2. observations.jsonl, written by this plugin's observer (bin/observe.mjs)
 *        {"ts":"...","event":"tool_complete","session":"...","tool":"Bash","input_summary":"npm test",...}
 *      A tool_start row followed by its tool_complete row (the observer wired
 *      on both PreToolUse and PostToolUse) is one tool call, not two.
 *      A thin row, which the legacy bash observer wrote, names the tool and
 *      records no input: {"ts":"...","event":"tool_start","session":"...","tool":"Bash","project_id":"..."}.
 *      It is not counted as a tool call. Beside rich rows it repeats a call
 *      they already record; a session that has only thin rows cannot be
 *      judged, because no rule can tell a test run from a listing or a source
 *      file from a note without the input. The report states how many thin
 *      rows were set aside.
 *   3. Flat tool events
 *        {"tool":"Edit","tool_input":{"file_path":"..."}}   (tool_name / input also read)
 *
 * A write is a Write, Edit, MultiEdit or NotebookEdit call. Known gap: a file
 * written through a shell command (a redirect, Set-Content, sed -i) is a Bash
 * or PowerShell call and is not counted as a write.
 *
 * Usage:
 *   node bin/lint-transcript.mjs <file.jsonl>         # Lint a transcript file
 *   cat observations.jsonl | node bin/lint-transcript.mjs --stdin  # Pipe input
 *   node bin/lint-transcript.mjs --help
 *
 * Exit codes:
 *   0 — no violations (or --strict not set)
 *   1 — violations found (with --strict)
 */

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

type LawNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type Severity = "high" | "medium";

interface ToolPayload {
  command?: string;
  file_path?: string;
  [key: string]: unknown;
}

interface TranscriptEvent {
  event?: string;
  input?: ToolPayload;
  session_id?: string;
  tool?: string;
  tool_input?: ToolPayload;
  tool_name?: string;
}

interface Violation {
  event?: number;
  law: LawNumber;
  message: string;
  severity: Severity;
}

interface TranscriptStats {
  researchTools: number;
  /** Thin observation rows: a tool name and no input. Not counted as tool calls. */
  rowsWithoutInput: number;
  sessions: Set<string>;
  toolCalls: number;
  totalEvents: number;
  parseFailures: number;
  verifyTools: number;
  writeTools: number;
}

interface AnalysisResult {
  score: number;
  stats: TranscriptStats;
  violations: Violation[];
  parseFailures: number;
}

const LAWS: Record<LawNumber, { name: string; patterns: string[] }> = {
  1: { name: "Research Before Executing", patterns: [] },
  2: { name: "Plan Is Sacred", patterns: [] },
  3: { name: "One Thing at a Time", patterns: [] },
  4: { name: "Verify Before Reporting", patterns: [] },
  5: { name: "Reflect After Sessions", patterns: [] },
  6: { name: "Iterate One Change", patterns: [] },
  7: { name: "Learn From Every Session", patterns: [] },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The tool name the rules know for `tool`. Claude Code on Windows has a
 * first-class PowerShell tool with the same { command } input as Bash, so a
 * test run through it is the same verification. MultiEdit and NotebookEdit
 * change a file exactly as Edit does.
 */
const TOOL_ALIASES: ReadonlyMap<string, string> = new Map([
  ["PowerShell", "Bash"],
  ["MultiEdit", "Edit"],
  ["NotebookEdit", "Edit"],
]);

function canonicalTool(tool: string): string {
  return TOOL_ALIASES.get(tool) ?? tool;
}

/** NotebookEdit names its file `notebook_path`; the rules read `file_path`. */
function withFilePath(input: ToolPayload): ToolPayload {
  if (typeof input.file_path !== "string" && typeof input.notebook_path === "string") {
    return { ...input, file_path: input.notebook_path };
  }
  return input;
}

/**
 * Rebuild the tool input the rules read from an observation row. The observer
 * (summariseInput in src/lib/observe-event.mts) keeps one field per tool: the
 * command for Bash, the file path for Edit/Write/NotebookEdit. For every other
 * tool it keeps the head of the JSON-serialised input, which holds the command
 * for PowerShell and the file path for MultiEdit; when the 500-character cut
 * left that JSON unterminated the raw head still contains the command text.
 */
function observationInput(tool: string, inputSummary: string): ToolPayload {
  if (tool === "Bash") {
    return { command: inputSummary };
  }
  if (tool === "Write" || tool === "Edit" || tool === "NotebookEdit") {
    return { file_path: inputSummary };
  }
  try {
    const parsed: unknown = JSON.parse(inputSummary);
    if (isObject(parsed)) {
      return withFilePath(parsed as ToolPayload);
    }
  } catch {
    // not JSON, or cut off mid-value
  }
  return tool === "PowerShell" ? { command: inputSummary } : {};
}

/**
 * An observation row is a hook event, not a tool call. The npm installer wires
 * the observer on PreToolUse and PostToolUse, so one call is two rows:
 * tool_start, then tool_complete with the same session, tool and
 * input_summary. The plugin wires PostToolUse only, one row per call.
 *
 * Returns true for a tool_complete row that answers a pending tool_start: the
 * same call seen a second time. A row with no partner stays a call of its own,
 * which covers a PostToolUse-only log and a start that never completed (a
 * command that exited non-zero, a call a hook denied). `pendingStarts` carries
 * the open starts from row to row.
 */
function isCompletionOfCountedStart(row: Record<string, unknown>, pendingStarts: Map<string, number>): boolean {
  const key = JSON.stringify([row.session ?? "", row.tool, row.input_summary]);
  const open = pendingStarts.get(key) ?? 0;
  if (row.event === "tool_start") {
    pendingStarts.set(key, open + 1);
    return false;
  }
  if (row.event === "tool_complete" && open > 0) {
    pendingStarts.set(key, open - 1);
    return true;
  }
  return false;
}

/**
 * A thin row is what the legacy bash observer wrote: the tool name inside the
 * observer's envelope (an event and a project id) and no tool input. The
 * backfill (bin/backfill.mjs) tags such a row `schema: "thin"`. A flat tool
 * event that happens to have no input carries no such envelope and stays a
 * call.
 */
function isThinObservationRow(row: Record<string, unknown>): boolean {
  return typeof row.tool === "string"
    && typeof row.input_summary !== "string"
    && !isObject(row.tool_input)
    && !isObject(row.input)
    && (row.schema === "thin" || (typeof row.event === "string" && typeof row.project_id === "string"));
}

/** What normaliseRow carries from one row of a file to the next. */
interface NormaliseState {
  /** Open tool_start rows of an observation log, see isCompletionOfCountedStart. */
  pendingStarts: Map<string, number>;
  /** Thin observation rows set aside so far, see isThinObservationRow. */
  rowsWithoutInput: number;
  /** The tool_use ids of a transcript that are already counted. */
  seenToolUseIds: Set<string>;
}

function newNormaliseState(): NormaliseState {
  return { pendingStarts: new Map<string, number>(), rowsWithoutInput: 0, seenToolUseIds: new Set<string>() };
}

/**
 * Turn one parsed JSONL row into the tool events the rules consume. See the
 * header comment for the three accepted row shapes.
 */
function normaliseRow(row: unknown, state: NormaliseState): TranscriptEvent[] {
  // A line that is valid JSON but not an object (null, a number, a string, an
  // array) is not a tool call.
  if (!isObject(row)) {
    return [];
  }

  const hasToolName = typeof row.tool === "string" || typeof row.tool_name === "string";

  // Claude Code transcript: every row is an envelope with a `type`, and only
  // the tool_use blocks of an assistant message are tool calls.
  if (!hasToolName && typeof row.type === "string") {
    const content = row.type === "assistant" && isObject(row.message) ? row.message.content : undefined;
    if (!Array.isArray(content)) {
      return [];
    }
    const events: TranscriptEvent[] = [];
    for (const block of content) {
      if (isObject(block) && block.type === "tool_use" && typeof block.name === "string") {
        // The same id again is the same call, written into the file a second time.
        if (typeof block.id === "string") {
          if (state.seenToolUseIds.has(block.id)) {
            continue;
          }
          state.seenToolUseIds.add(block.id);
        }
        events.push({
          tool: canonicalTool(block.name),
          tool_input: isObject(block.input) ? withFilePath(block.input as ToolPayload) : {},
          session_id: typeof row.sessionId === "string" ? row.sessionId : undefined,
        });
      }
    }
    return events;
  }

  // observations.jsonl: the tool input is a summary string, not an object.
  if (
    typeof row.tool === "string"
    && typeof row.input_summary === "string"
    && !isObject(row.tool_input)
    && !isObject(row.input)
  ) {
    if (isCompletionOfCountedStart(row, state.pendingStarts)) {
      return [];
    }
    return [{
      tool: canonicalTool(row.tool),
      tool_input: observationInput(row.tool, row.input_summary),
      session_id: typeof row.session === "string" ? row.session : undefined,
    }];
  }

  // A thin observation row is not a call the rules can read: beside rich rows
  // it repeats one of theirs, and alone it names a tool and nothing else.
  if (isThinObservationRow(row)) {
    state.rowsWithoutInput++;
    return [];
  }

  // Flat tool events keep their fields; only an aliased tool is rewritten.
  const flatTool = typeof row.tool === "string" ? row.tool : row.tool_name;
  if (typeof flatTool === "string" && canonicalTool(flatTool) !== flatTool) {
    const flatInput = isObject(row.tool_input) ? row.tool_input : isObject(row.input) ? row.input : {};
    return [{
      ...(row as TranscriptEvent),
      tool: canonicalTool(flatTool),
      tool_input: withFilePath(flatInput as ToolPayload),
    }];
  }

  // Every other flat tool event, and anything unrecognised, passes through untouched.
  return [row as TranscriptEvent];
}

function analyzeTranscript(events: TranscriptEvent[], parseFailures: number, rowsWithoutInput: number): AnalysisResult {
  const violations: Violation[] = [];
  const stats: TranscriptStats = {
    totalEvents: events.length,
    toolCalls: 0,
    rowsWithoutInput,
    researchTools: 0,
    writeTools: 0,
    verifyTools: 0,
    sessions: new Set<string>(),
    parseFailures,
  };

  for (const event of events) {
    stats.toolCalls++;
    if (event.session_id) {
      stats.sessions.add(event.session_id);
    }

    const tool = event.tool || event.tool_name || "";
    const input = event.tool_input || event.input || {};
    const command = typeof input.command === "string" ? input.command : "";

    if (["Grep", "Glob", "Read"].includes(tool)) {
      stats.researchTools++;
    }
    if (["Write", "Edit"].includes(tool)) {
      stats.writeTools++;
    }
    if (tool === "Bash" && /\b(test|build|npm run|jest|vitest|bun test|deno test|ava|tap|mocha|pytest|go test|cargo test|gradle test|mvn test)\b/.test(command)) {
      stats.verifyTools++;
    }
  }

  let lastResearchIdx = -1;
  for (let index = 0; index < events.length; index++) {
    const tool = events[index]?.tool || events[index]?.tool_name || "";
    if (["Grep", "Glob", "Read"].includes(tool)) {
      lastResearchIdx = index;
    }
    if (["Write", "Edit"].includes(tool) && lastResearchIdx === -1) {
      violations.push({
        law: 1,
        severity: "high",
        message: `Write/Edit at event ${index} without any prior research (Grep/Glob/Read)`,
        event: index,
      });
      // Continue checking for more violations
    }
  }

  if (stats.writeTools > 0 && stats.researchTools === 0) {
    violations.push({
      law: 1,
      severity: "high",
      message: `${stats.writeTools} writes with 0 research operations. Agent likely skipped research.`,
    });
  } else if (stats.writeTools > stats.researchTools * 3) {
    violations.push({
      law: 1,
      severity: "medium",
      message: `Write-to-research ratio is ${stats.writeTools}:${stats.researchTools}. Consider more research.`,
    });
  }

  let consecutiveEdits = 0;
  const editedFiles = new Set<string>();
  for (const event of events) {
    const tool = event.tool || event.tool_name || "";
    const input = event.tool_input || event.input || {};

    if (["Write", "Edit"].includes(tool)) {
      consecutiveEdits++;
      if (typeof input.file_path === "string") {
        editedFiles.add(input.file_path);
      }
    } else {
      // Reset on any non-write tool (verification, research, etc.)
      consecutiveEdits = 0;
    }

    if (consecutiveEdits > 5) {
      violations.push({
        law: 3,
        severity: "medium",
        message: `${consecutiveEdits} consecutive edits without verification. Editing multiple files at once.`,
      });
      consecutiveEdits = 0;
    }
  }

  if (stats.writeTools > 0 && stats.verifyTools === 0) {
    violations.push({
      law: 4,
      severity: "high",
      message: `${stats.writeTools} code changes with 0 verification commands (test/build). Agent may have declared done without verifying.`,
    });
  }

  if (editedFiles.size > 8) {
    violations.push({
      law: 6,
      severity: "medium",
      message: `${editedFiles.size} different files modified. Consider smaller, focused iterations.`,
    });
  }

  const maxViolations = 7;
  const violationWeight = violations.reduce<number>((sum, violation) => {
    return sum + (violation.severity === "high" ? 2 : 1);
  }, 0);
  const score = Math.max(0, Math.round(100 - (violationWeight / maxViolations) * 100));

  return { violations, stats, score, parseFailures };
}

const THIN_ROWS_NOTE = "written by the legacy observer, not counted as tool calls and not linted";

function formatReport(result: AnalysisResult): string {
  const { violations, stats, score, parseFailures } = result;
  const lines: string[] = [];

  lines.push("## Agent Discipline Report");
  lines.push("");
  lines.push(`**Score:** ${score}/100`);
  lines.push(`**Events analyzed:** ${stats.totalEvents}`);
  lines.push(`**Tool calls:** ${stats.toolCalls}`);
  lines.push(`**Research ops:** ${stats.researchTools} | **Write ops:** ${stats.writeTools} | **Verify ops:** ${stats.verifyTools}`);
  if (parseFailures > 0) {
    lines.push(`**Parse failures:** ${parseFailures} (malformed JSON lines skipped)`);
  }
  if (stats.rowsWithoutInput > 0) {
    lines.push(`**Rows without tool input:** ${stats.rowsWithoutInput} (${THIN_ROWS_NOTE})`);
  }
  lines.push("");

  if (violations.length === 0) {
    lines.push("No law violations detected. Good discipline!");
  } else {
    lines.push(`### Violations (${violations.length})`);
    lines.push("");
    for (const violation of violations) {
      const severity = violation.severity === "high" ? "HIGH" : "MEDIUM";
      lines.push(`- **[${severity}] Law ${violation.law}: ${LAWS[violation.law].name}**`);
      lines.push(`  ${violation.message}`);
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("*Generated by [continuous-improvement](https://github.com/naimkatiman/continuous-improvement) transcript linter*");

  return lines.join("\n");
}

const args = process.argv.slice(2);

function actionInput(name: string): string {
  return (process.env[`INPUT_${name.toUpperCase()}`] ?? "").trim();
}

function actionInputBoolean(name: string): boolean {
  return /^(1|true|yes)$/i.test(actionInput(name));
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Agent Transcript Linter — The 7 Laws of AI Agent Discipline

Usage:
  node bin/lint-transcript.mjs <file.jsonl>         Lint a transcript file
  cat obs.jsonl | node bin/lint-transcript.mjs --stdin  Pipe input
  node bin/lint-transcript.mjs --help               Show help

Accepted input (JSONL, one JSON object per line, shapes may be mixed):
  Claude Code transcript   ~/.claude/projects/<project>/<session>.jsonl
                           each tool_use block of an assistant row is a tool call;
                           a block whose id was already seen is counted once
  observations.jsonl       rows written by this plugin's observer
                           {"tool":"Bash","input_summary":"npm test",...}
                           a row with a tool name and no input_summary (the
                           legacy observer wrote these) is not counted and
                           not linted; the report says how many there were
  Flat tool events         {"tool":"Edit","tool_input":{"file_path":"..."}}
A line that is JSON but not an object (null, a number, an array) is skipped.

A write is a Write, Edit, MultiEdit or NotebookEdit call.
Not counted as a write: a file written through a shell command
(a redirect, Set-Content, sed -i).

Options:
  --stdin     Read from stdin
  --strict    Exit 1 if violations found
  --json      Output as JSON instead of markdown
`);
  process.exit(0);
}

const isStrict = args.includes("--strict") || actionInputBoolean("strict");
const isJson = args.includes("--json");
const isStdin = args.includes("--stdin");

async function main(): Promise<void> {
  let lines: string[] = [];

  if (isStdin) {
    const rl = createInterface({ input: process.stdin, terminal: false });
    for await (const line of rl) {
      if (line.trim()) {
        lines.push(line.trim());
      }
    }
  } else {
    const filePath = args.find((arg) => !arg.startsWith("--"))
      || actionInput("transcript-path")
      || actionInput("observations-path");
    if (!filePath) {
      console.error("Error: provide a file path or use --stdin");
      process.exit(1);
    }

    const content = readFileSync(filePath, "utf8");
    lines = content.split("\n").filter((line) => line.trim().length > 0);
  }

  const events: TranscriptEvent[] = [];
  const state = newNormaliseState();
  let parseFailures = 0;
  for (const line of lines) {
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      parseFailures++;
      continue;
    }
    events.push(...normaliseRow(row, state));
  }

  if (events.length === 0) {
    console.log("No events found to analyze.");
    if (state.rowsWithoutInput > 0) {
      console.log(`${state.rowsWithoutInput} rows carry a tool name and no tool input (${THIN_ROWS_NOTE}).`);
    }
    process.exit(0);
  }

  const result = analyzeTranscript(events, parseFailures, state.rowsWithoutInput);
  const report = formatReport(result);

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(report);
  }

  if (process.env.GITHUB_OUTPUT) {
    const outputLines = [
      `violations=${result.violations.length}`,
      `score=${result.score}`,
      `report<<CI_REPORT_EOF`,
      report,
      "CI_REPORT_EOF",
    ];
    const { appendFileSync } = await import("node:fs");
    for (const line of outputLines) {
      appendFileSync(process.env.GITHUB_OUTPUT, line + "\n");
    }
  }

  if (isStrict && result.violations.length > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
