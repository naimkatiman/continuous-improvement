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
 * Law 1, research before executing. Research is a read-only lookup, whatever
 * tool carried it: Read, Grep, Glob, NotebookRead, WebFetch, WebSearch, an
 * Agent or Task call, and a Bash or PowerShell call that runs a reader at a
 * command position of its command line (cat, rg, git log, gh pr view,
 * Get-Content and the rest of the list in lib/shell-intent.mjs). Research is
 * tracked per session id. A session whose first write comes before its first
 * lookup is one HIGH violation, however many writes came first; a researched
 * session with more than three writes per lookup is one MEDIUM. A transcript
 * that picks up a session which began before the file did (it opens with a
 * compaction summary, or with the result of a call the file does not hold) is
 * not flagged for the writes at its head: the research, if any, is in rows the
 * file does not have.
 *
 * Law 4, verify before reporting. A code change is a write to a source or
 * config file. A write that is only a note or a doc needs no test run:
 * anything under a .claude/ directory (memory notes, plans, settings), a
 * Markdown file, a file under a tmp, temp, scratch or scratchpad directory
 * (also one named with a suffix: scratch-2026-11-20, tmp.x1). A
 * git worktree under .claude/worktrees/<name>/ is a checkout of the source, so
 * a path inside one is judged by the rest of the path. A write whose path was
 * not recorded counts as a code change. Verification is a test, build or
 * check runner at a command position of a Bash or PowerShell command line
 * (npm test, npx tsc, node --test, python -m pytest, cargo clippy,
 * Invoke-Pester and the rest of the list in lib/shell-intent.mjs). The word
 * test or build in a path, a search pattern or a quoted string does not
 * count. A file with at least one code change and no verification run is one
 * HIGH violation.
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
import { isReadOnlyLookup, isVerificationRun } from "../lib/shell-intent.mjs";
const LAWS = {
    1: { name: "Research Before Executing", patterns: [] },
    2: { name: "Plan Is Sacred", patterns: [] },
    3: { name: "One Thing at a Time", patterns: [] },
    4: { name: "Verify Before Reporting", patterns: [] },
    5: { name: "Reflect After Sessions", patterns: [] },
    6: { name: "Iterate One Change", patterns: [] },
    7: { name: "Learn From Every Session", patterns: [] },
};
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
 * The tool name the rules know for `tool`. Claude Code on Windows has a
 * first-class PowerShell tool with the same { command } input as Bash, so a
 * test run through it is the same verification. MultiEdit and NotebookEdit
 * change a file exactly as Edit does.
 */
const TOOL_ALIASES = new Map([
    ["PowerShell", "Bash"],
    ["MultiEdit", "Edit"],
    ["NotebookEdit", "Edit"],
]);
function canonicalTool(tool) {
    return TOOL_ALIASES.get(tool) ?? tool;
}
/** NotebookEdit names its file `notebook_path`; the rules read `file_path`. */
function withFilePath(input) {
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
 * left that JSON unterminated the leading field is read out of the head.
 */
function observationInput(tool, inputSummary) {
    if (tool === "Bash") {
        return { command: inputSummary };
    }
    if (tool === "Write" || tool === "Edit" || tool === "NotebookEdit") {
        return { file_path: inputSummary };
    }
    try {
        const parsed = JSON.parse(inputSummary);
        if (isObject(parsed)) {
            return withFilePath(parsed);
        }
    }
    catch {
        // not JSON, or cut off mid-value
    }
    if (tool === "PowerShell") {
        return { command: leadingStringField(inputSummary, "command") ?? inputSummary };
    }
    const filePath = leadingStringField(inputSummary, "file_path");
    return filePath === null ? {} : { file_path: filePath };
}
/**
 * The first field of a JSON object whose text was cut before its end, when
 * that field is `key` and holds a string: {"command":"npm test -- --grep ...
 * Returns null for any other text.
 */
function leadingStringField(cutJson, key) {
    const opener = new RegExp(`^\\{\\s*"${key}"\\s*:\\s*"`).exec(cutJson);
    if (!opener) {
        return null;
    }
    let end = opener[0].length;
    while (end < cutJson.length && cutJson[end] !== '"') {
        end += cutJson[end] === "\\" ? 2 : 1;
    }
    // The cut can land inside an escape sequence: shorten until the string parses.
    let body = cutJson.slice(opener[0].length, end);
    for (let attempt = 0; attempt < 8 && body.length > 0; attempt++) {
        try {
            return JSON.parse(`"${body}"`);
        }
        catch {
            body = body.slice(0, -1);
        }
    }
    return null;
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
function isCompletionOfCountedStart(row, pendingStarts) {
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
function isThinObservationRow(row) {
    return typeof row.tool === "string"
        && typeof row.input_summary !== "string"
        && !isObject(row.tool_input)
        && !isObject(row.input)
        && (row.schema === "thin" || (typeof row.event === "string" && typeof row.project_id === "string"));
}
function newNormaliseState() {
    return {
        continuedSessions: new Set(),
        pendingStarts: new Map(),
        rowsWithoutInput: 0,
        seenToolUseIds: new Set(),
        sessionsWithCalls: new Set(),
    };
}
/**
 * True for a transcript row which shows that its session began before the
 * file did: a compaction boundary or the summary that follows it, or the
 * result of a tool call the file has not shown. Read before the session's
 * first tool call, such a row means the lookups that led to the next write
 * may sit in rows the file does not hold.
 */
function startsBeforeFile(row, content, seenToolUseIds) {
    if (row.isCompactSummary === true || (row.type === "system" && row.subtype === "compact_boundary")) {
        return true;
    }
    return row.type === "user" && Array.isArray(content) && content.some((block) => isObject(block)
        && block.type === "tool_result"
        && typeof block.tool_use_id === "string"
        && !seenToolUseIds.has(block.tool_use_id));
}
/**
 * Turn one parsed JSONL row into the tool events the rules consume. See the
 * header comment for the three accepted row shapes.
 */
function normaliseRow(row, state) {
    // A line that is valid JSON but not an object (null, a number, a string, an
    // array) is not a tool call.
    if (!isObject(row)) {
        return [];
    }
    const hasToolName = typeof row.tool === "string" || typeof row.tool_name === "string";
    // Claude Code transcript: every row is an envelope with a `type`, and only
    // the tool_use blocks of an assistant message are tool calls.
    if (!hasToolName && typeof row.type === "string") {
        const sessionId = typeof row.sessionId === "string" ? row.sessionId : undefined;
        const sessionKey = sessionId ?? "";
        const content = isObject(row.message) ? row.message.content : undefined;
        if (!state.sessionsWithCalls.has(sessionKey) && startsBeforeFile(row, content, state.seenToolUseIds)) {
            state.continuedSessions.add(sessionKey);
        }
        if (row.type !== "assistant" || !Array.isArray(content)) {
            return [];
        }
        const events = [];
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
                    tool_input: isObject(block.input) ? withFilePath(block.input) : {},
                    session_id: sessionId,
                });
            }
        }
        if (events.length > 0) {
            state.sessionsWithCalls.add(sessionKey);
        }
        return events;
    }
    // observations.jsonl: the tool input is a summary string, not an object.
    if (typeof row.tool === "string"
        && typeof row.input_summary === "string"
        && !isObject(row.tool_input)
        && !isObject(row.input)) {
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
                ...row,
                tool: canonicalTool(flatTool),
                tool_input: withFilePath(flatInput),
            }];
    }
    // Every other flat tool event, and anything unrecognised, passes through untouched.
    return [row];
}
/** A lookup that changes nothing is research, whatever tool carried it. */
const RESEARCH_TOOLS = new Set([
    "Read", "Grep", "Glob", "NotebookRead", "WebFetch", "WebSearch", "Agent", "Task",
]);
const WRITE_TOOLS = new Set(["Write", "Edit"]);
/** `command` is the command line of a Bash call (PowerShell is read as Bash). */
function isResearchCall(tool, command) {
    return RESEARCH_TOOLS.has(tool) || (tool === "Bash" && isReadOnlyLookup(command));
}
/**
 * True for a write that Law 4 wants verified: a write to a source or config
 * file. A note or a doc needs no test run: anything under a .claude/
 * directory, a Markdown file, a scratch or temp file (a directory named tmp,
 * temp, scratch or scratchpad, with or without a suffix such as
 * scratch-2026-11-20 or tmp.x1, and the macOS /var/folders). A git worktree
 * under .claude/worktrees/<name>/ is a checkout of the source, so a path
 * inside one is judged by what follows the worktree. A write whose path was
 * not recorded counts as a code change.
 */
function isCodeChange(filePath) {
    if (typeof filePath !== "string" || filePath === "") {
        return true;
    }
    const path = filePath.replace(/\\/g, "/");
    const insideCheckout = path.replace(/^(?:.*\/)?\.claude\/worktrees\/[^/]+\//, "");
    return !(/(?:^|\/)\.claude\//.test(insideCheckout)
        || /\.(?:md|markdown)$/i.test(path)
        || /(?:^|\/)(?:tmp|temp|scratch|scratchpad)(?:[-_.][^/]*)?\//i.test(path)
        || path.includes("/var/folders/"));
}
function plural(count, noun) {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
function analyzeTranscript(events, context) {
    const { parseFailures, rowsWithoutInput } = context;
    const violations = [];
    const stats = {
        totalEvents: events.length,
        toolCalls: 0,
        rowsWithoutInput,
        researchTools: 0,
        writeTools: 0,
        codeWrites: 0,
        verifyTools: 0,
        sessions: new Set(),
        parseFailures,
    };
    const researchBySession = new Map();
    for (let index = 0; index < events.length; index++) {
        const event = events[index];
        stats.toolCalls++;
        if (event.session_id) {
            stats.sessions.add(event.session_id);
        }
        const tool = event.tool || event.tool_name || "";
        const input = event.tool_input || event.input || {};
        const command = typeof input.command === "string" ? input.command : "";
        // A flat log may carry any value as its session id: only a string names a session.
        const sessionKey = typeof event.session_id === "string" ? event.session_id : "";
        let session = researchBySession.get(sessionKey);
        if (!session) {
            session = { research: 0, writes: 0, writesBeforeResearch: 0, firstWriteBeforeResearch: -1 };
            researchBySession.set(sessionKey, session);
        }
        if (isResearchCall(tool, command)) {
            stats.researchTools++;
            session.research++;
        }
        if (WRITE_TOOLS.has(tool)) {
            stats.writeTools++;
            if (isCodeChange(input.file_path)) {
                stats.codeWrites++;
            }
            session.writes++;
            if (session.research === 0) {
                session.writesBeforeResearch++;
                if (session.firstWriteBeforeResearch === -1) {
                    session.firstWriteBeforeResearch = index;
                }
            }
        }
        if (tool === "Bash" && isVerificationRun(command)) {
            stats.verifyTools++;
        }
    }
    // Law 1: at most one violation per session.
    for (const [sessionKey, session] of researchBySession) {
        const label = researchBySession.size > 1 ? `Session ${sessionKey.slice(0, 8) || "(none)"}: ` : "";
        // The lookups of a session the file picks up part-way may be in rows it does not hold.
        const continued = context.continuedSessions.has(sessionKey);
        if (session.writesBeforeResearch > 0 && !continued) {
            const at = session.firstWriteBeforeResearch;
            violations.push({
                law: 1,
                severity: "high",
                message: label + (session.research === 0
                    ? `${plural(session.writes, "write")} with 0 research operations (first at event ${at}). Agent likely skipped research.`
                    : `Write/Edit at event ${at} without any prior research (${session.writesBeforeResearch} of ${plural(session.writes, "write")} came before the first lookup).`),
                event: at,
            });
        }
        else if (session.writes > session.research * 3 && !(continued && session.research === 0)) {
            violations.push({
                law: 1,
                severity: "medium",
                message: `${label}Write-to-research ratio is ${session.writes}:${session.research}. Consider more research.`,
            });
        }
    }
    let consecutiveEdits = 0;
    const editedFiles = new Set();
    for (const event of events) {
        const tool = event.tool || event.tool_name || "";
        const input = event.tool_input || event.input || {};
        if (WRITE_TOOLS.has(tool)) {
            consecutiveEdits++;
            if (typeof input.file_path === "string") {
                editedFiles.add(input.file_path);
            }
        }
        else {
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
    if (stats.codeWrites > 0 && stats.verifyTools === 0) {
        violations.push({
            law: 4,
            severity: "high",
            message: `${plural(stats.codeWrites, "code change")} with 0 verification commands (test/build). Agent may have declared done without verifying.`,
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
    const violationWeight = violations.reduce((sum, violation) => {
        return sum + (violation.severity === "high" ? 2 : 1);
    }, 0);
    const score = Math.max(0, Math.round(100 - (violationWeight / maxViolations) * 100));
    return { violations, stats, score, parseFailures };
}
const THIN_ROWS_NOTE = "written by the legacy observer, not counted as tool calls and not linted";
function formatReport(result) {
    const { violations, stats, score, parseFailures } = result;
    const lines = [];
    lines.push("## Agent Discipline Report");
    lines.push("");
    lines.push(`**Score:** ${score}/100`);
    lines.push(`**Events analyzed:** ${stats.totalEvents}`);
    lines.push(`**Tool calls:** ${stats.toolCalls}`);
    lines.push(`**Research ops:** ${stats.researchTools} | **Write ops:** ${stats.writeTools} (${stats.codeWrites} to source or config files) | **Verify ops:** ${stats.verifyTools}`);
    if (parseFailures > 0) {
        lines.push(`**Parse failures:** ${parseFailures} (malformed JSON lines skipped)`);
    }
    if (stats.rowsWithoutInput > 0) {
        lines.push(`**Rows without tool input:** ${stats.rowsWithoutInput} (${THIN_ROWS_NOTE})`);
    }
    lines.push("");
    if (violations.length === 0) {
        lines.push("No law violations detected. Good discipline!");
    }
    else {
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
function actionInput(name) {
    return (process.env[`INPUT_${name.toUpperCase()}`] ?? "").trim();
}
function actionInputBoolean(name) {
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

Law 1, research before executing:
  Research is a read-only lookup, whatever tool carried it: Read, Grep, Glob,
  NotebookRead, WebFetch, WebSearch, an Agent or Task call, or a
  read-only shell command through Bash or PowerShell, at a command position
  of the line: cat, head, tail, less, sed -n, rg, grep, ls, find without
  -delete, git grep/show/log/diff/status/blame, gh view/list and a gh api
  call that sends nothing, curl without an upload, Get-Content,
  Select-String, Get-ChildItem, Test-Path.
  Judged once per session id: a session whose first write comes before its
  first lookup is one HIGH violation, however many writes came first.
  Not flagged: the writes at the head of a transcript whose session began
  before the file did (it opens with a compaction summary).

Law 4, verify before reporting:
  A code change is a write to a source or config file. A note or a doc needs
  no test run: anything under a .claude/ directory (memory notes, settings),
  a *.md file, a file under a tmp, temp, scratch or scratchpad directory
  (also one named with a suffix: scratch-2026-11-20, tmp.x1).
  A path inside a git worktree under .claude/worktrees/<name>/ is judged by
  the rest of the path. A write with no recorded path is a code change.
  Verification is a runner at a command position of a Bash or PowerShell
  command line: npm/pnpm/yarn/bun test or run <script>; vitest, jest, mocha,
  tsc, eslint, playwright test, craco or react-scripts test/build, vite
  build or next build/lint, direct or through npx; node --test; pytest,
  python -m pytest or unittest; go test/vet/build; cargo
  test/build/check/clippy; dotnet test/build; mvn test or verify; gradle or
  make test/check/build; deno test; Invoke-Pester.
  The word test or build in a path, a search pattern or a quoted string does
  not count. Code changes with no verification run are one HIGH violation.

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
async function main() {
    let lines = [];
    if (isStdin) {
        const rl = createInterface({ input: process.stdin, terminal: false });
        for await (const line of rl) {
            if (line.trim()) {
                lines.push(line.trim());
            }
        }
    }
    else {
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
    const events = [];
    const state = newNormaliseState();
    let parseFailures = 0;
    for (const line of lines) {
        let row;
        try {
            row = JSON.parse(line);
        }
        catch {
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
    const result = analyzeTranscript(events, {
        continuedSessions: state.continuedSessions,
        parseFailures,
        rowsWithoutInput: state.rowsWithoutInput,
    });
    const report = formatReport(result);
    if (isJson) {
        console.log(JSON.stringify(result, null, 2));
    }
    else {
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
main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
