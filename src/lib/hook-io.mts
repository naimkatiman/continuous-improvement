// hook-io.mts — One event shape in, one decision shape out, one encoder per agent.
//
// A hook is: read stdin, normalize it into a NeutralEvent, decide, encode the
// Decision into the bytes the agent reads ({stdout, stderr, exitCode}). The
// deciders never see an agent's output format, so a new agent needs an encoder,
// not a new copy of every hook (docs/plans/2026-11-21-all-agents.md,
// Architecture item 2).
//
// The claude encoder is the Claude Code output code the hooks already had,
// moved, not rewritten: the deny JSON is gateguard's emitDeny, the context
// shapes are session.mts (SessionStart, plain stdout) and recall-briefing /
// query-cost-nudge (hookSpecificOutput.additionalContext), and the continue
// shape is the Stop hooks' {decision:"block"}. fixtures/agent-hooks/claude.json
// pins those bytes. Encoders for the other agents come in plan PR 8. Until
// then an agent id with no encoder fails closed: a deny or a continue is exit 2
// with the reason on stderr and nothing on stdout, which the plan's research
// found Claude Code, Codex, Cursor, Copilot, Devin, Grok, Qwen, Kiro, Droid,
// Auggie, Junie and Goose honour ("What the research found" item 2). Context
// for an unknown agent is dropped, because stray stdout blocks every tool call
// on Cursor 3.x (item 3).

import { readFileSync } from "node:fs";
import { inboundCommand, inboundPaths, resolveInboundTool, type ShellFlavor, type ToolKind } from "./agent-profiles.mjs";

/** The agents with an encoder. */
export type AgentId = "claude";

/** What a tool call does, whatever the agent calls the tool. */
export type EventKind = ToolKind | "skill";

export interface NeutralEvent {
  agent: string;
  /** The event the hook is wired to, by its Claude Code name (PreToolUse, Stop, ...). */
  event: string;
  toolName: string;
  /** The tool input object; {} when the payload has none or it is not an object. */
  toolInput: Record<string, unknown>;
  kind: EventKind;
  /** Shell tools only; null otherwise. */
  shellFlavor: ShellFlavor | null;
  command: string | null;
  filePaths: string[];
  prompt: string | null;
  sessionId: string | undefined;
  /** The payload cwd when it is a non-empty string. */
  cwd: string | undefined;
  /** Claude Code's stop_hook_active: a Stop hook already re-prompted this turn. */
  stopActive: boolean;
  /** The parsed stdin, for the resolvers that read cwd, working_dir and workspace_roots (lib/agent-paths.mjs). */
  payload: unknown;
}

/**
 * allow: no opinion, the call proceeds. deny: block the tool call. context:
 * text the agent adds to the model's context. continue: a Stop hook asks for
 * another turn. `notices` are stderr lines for the user, any decision.
 */
export type Decision =
  | { kind: "allow"; notices?: readonly string[] }
  | { kind: "deny"; reason: string; notices?: readonly string[] }
  | { kind: "context"; text: string; notices?: readonly string[] }
  | { kind: "continue"; reason: string; notices?: readonly string[] };

export interface EncodedOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// The Claude Code tool names the hooks route, by kind: gateguard TOOL_ROUTE and
// SHELL_TOOLS, the plugin matchers, and the Skill tool companion-preference
// reads. Every other Claude name is `other`. Another agent's name goes through
// its profile alias (lib/agent-profiles.mjs), which never holds a Claude name.
const CLAUDE_TOOLS: ReadonlyMap<string, { kind: EventKind; flavor?: ShellFlavor }> = new Map([
  ["Bash", { kind: "shell", flavor: "posix" }],
  ["PowerShell", { kind: "shell", flavor: "powershell" }],
  // Monitor runs its { command } in the same shell as Bash.
  ["Monitor", { kind: "shell", flavor: "posix" }],
  ["Write", { kind: "file-write" }],
  ["Edit", { kind: "file-write" }],
  ["MultiEdit", { kind: "file-write" }],
  ["NotebookEdit", { kind: "file-write" }],
  ["Read", { kind: "file-read" }],
  ["NotebookRead", { kind: "file-read" }],
  ["Grep", { kind: "search" }],
  ["Glob", { kind: "search" }],
  ["LS", { kind: "search" }],
  ["Skill", { kind: "skill" }],
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

// file_path, or each MultiEdit edit's file_path. NotebookEdit's notebook_path
// is not read, the same as gateguard (open defect, docs/deferred.md).
function claudeFilePaths(input: Record<string, unknown>): string[] {
  if (typeof input.file_path === "string") return [input.file_path];
  if (!Array.isArray(input.edits)) return [];
  return input.edits
    .map((edit) => asRecord(edit)?.file_path)
    .filter((path): path is string => typeof path === "string" && path !== "");
}

/** stdin as text, or null when it cannot be read. */
export function readStdin(): string | null {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return null;
  }
}

/** JSON-parse stdin. Empty, malformed or unread stdin is not ok; JSON null and arrays are ok. */
export function parsePayload(raw: string | null): { ok: true; value: unknown } | { ok: false } {
  if (raw === null) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false };
  }
}

/**
 * The neutral event for a parsed payload. Total: a payload that is not an
 * object (null, an array, a number) gives an event with no tool, and a field
 * of the wrong type reads as absent. The keys are Claude Code's
 * (tool_name, tool_input, session_id, cwd, prompt, stop_hook_active); other
 * agents' tool names resolve through their profile alias. Per-agent payload
 * keys come with the encoders (plan PR 8).
 */
export function normalizeEvent(agent: string, event: string, payload: unknown): NeutralEvent {
  const fields = asRecord(payload) ?? {};
  const toolName = typeof fields.tool_name === "string" ? fields.tool_name : "";
  const toolInput = asRecord(fields.tool_input) ?? {};
  const claude = CLAUDE_TOOLS.get(toolName);
  const alias = claude ? null : resolveInboundTool(toolName);
  const kind: EventKind = claude?.kind ?? alias?.kind ?? "other";
  let command: string | null = null;
  let filePaths: string[] = [];
  if (claude) {
    if (kind === "shell" && typeof toolInput.command === "string") command = toolInput.command;
    if (kind === "file-write" || kind === "file-read") filePaths = claudeFilePaths(toolInput);
  } else if (alias) {
    command = inboundCommand(alias, toolInput);
    filePaths = inboundPaths(alias, toolInput);
  }
  return {
    agent,
    event,
    toolName,
    toolInput,
    kind,
    shellFlavor: kind === "shell" ? (claude?.flavor ?? alias?.flavor ?? "unknown") : null,
    command,
    filePaths,
    prompt: typeof fields.prompt === "string" ? fields.prompt : null,
    sessionId: typeof fields.session_id === "string" ? fields.session_id : undefined,
    cwd: nonEmptyString(fields.cwd),
    stopActive: fields.stop_hook_active === true,
    payload,
  };
}

function noticeLines(decision: Decision): string {
  return (decision.notices ?? []).map((notice) => `${notice}\n`).join("");
}

function encodeClaude(event: string, decision: Decision, stderr: string): EncodedOutput {
  switch (decision.kind) {
    case "allow":
      // Allow = empty stdout + exit 0. PreToolUse has no { decision: "allow" }
      // shape, and invalid output surfaces as a per-call "Hook JSON output
      // validation failed" error in the client.
      return { stdout: "", stderr, exitCode: 0 };
    case "deny":
      return {
        stdout: `${JSON.stringify({
          hookSpecificOutput: {
            hookEventName: event,
            permissionDecision: "deny",
            permissionDecisionReason: decision.reason,
          },
        })}\n`,
        stderr,
        exitCode: 0,
      };
    case "context":
      if (event === "SessionStart") return { stdout: decision.text, stderr, exitCode: 0 };
      return {
        stdout: `${JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: decision.text } })}\n`,
        stderr,
        exitCode: 0,
      };
    case "continue":
      return { stdout: `${JSON.stringify({ decision: "block", reason: decision.reason })}\n`, stderr, exitCode: 0 };
  }
}

// No encoder for this agent: never let a deny read as an allow.
function encodeUnknown(decision: Decision, stderr: string): EncodedOutput {
  if (decision.kind === "deny" || decision.kind === "continue") {
    return { stdout: "", stderr: `${stderr}${decision.reason}\n`, exitCode: 2 };
  }
  return { stdout: "", stderr, exitCode: 0 };
}

/** The bytes `agent` reads for `decision` on the hook event `event`. */
export function encode(agent: string, event: string, decision: Decision): EncodedOutput {
  const stderr = noticeLines(decision);
  return agent === "claude" ? encodeClaude(event, decision, stderr) : encodeUnknown(decision, stderr);
}

export interface HookStreams {
  writeStdout(text: string): void;
  writeStderr(text: string): void;
  exit(code: number): void;
}

const PROCESS_STREAMS: HookStreams = {
  writeStdout: (text) => {
    process.stdout.write(text);
  },
  writeStderr: (text) => {
    process.stderr.write(text);
  },
  exit: (code) => process.exit(code),
};

/** Write an encoded output and exit with its code. */
export function emit(output: EncodedOutput, streams: HookStreams = PROCESS_STREAMS): void {
  if (output.stderr !== "") streams.writeStderr(output.stderr);
  if (output.stdout !== "") streams.writeStdout(output.stdout);
  streams.exit(output.exitCode);
}

/**
 * Run a hook body and emit what it returns. Any throw ends as exit 0 with empty
 * stdout and the error on stderr: on Kiro an exit 1 from a Stop hook starts
 * another turn, and on Cursor 3.x non-JSON stdout blocks every tool call
 * (plan, "What the research found" item 3). Nothing the body encoded before the
 * throw is printed.
 */
export async function runHook(
  body: () => EncodedOutput | Promise<EncodedOutput>,
  streams: HookStreams = PROCESS_STREAMS,
): Promise<void> {
  let output: EncodedOutput;
  try {
    output = await body();
  } catch (error) {
    const text = error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);
    output = { stdout: "", stderr: `[continuous-improvement] hook error: ${text}\n`, exitCode: 0 };
  }
  emit(output, streams);
}
