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
// shape is the Stop hooks' {decision:"block"}. Every hook but
// companion-preference and bin/observe writes through encode (plan PR 7), so
// fixtures/agent-hooks/claude.json pins all four shapes end to end: allow and
// the PreToolUse deny through gateguard, hook-pack and config-guard, context
// through session, route-prompt, recall-briefing and query-cost-nudge, and
// continue through the Stop hooks. The other agents' encoders (plan PR 8,
// Architecture item 7) are the table below. An agent id with no encoder fails
// closed: a deny or a continue is exit 2 with the reason on stderr and nothing
// on stdout, which the plan's research found Claude Code, Codex, Cursor,
// Copilot, Devin, Grok, Qwen, Kiro, Droid, Auggie, Junie and Goose honour
// ("What the research found" item 2). Context for an unknown agent is dropped,
// because stray stdout blocks every tool call on Cursor 3.x (item 3).
//
// A hook picks its agent with hookAgent(): an explicit `--agent <id>`, then
// CI_AGENT, then a sniff that needs an agent env var and that agent's payload
// shape together, else claude (Architecture item 6). A payload that is clearly
// not Claude's but matches no sniff gets the fail-closed id, so a misdetection
// cannot turn a deny into an allow.
import { readFileSync } from "node:fs";
import { inboundCommand, inboundPaths, profileTool, resolveInboundTool, } from "./agent-profiles.mjs";
/** The agents with an encoder. */
export const AGENT_IDS = [
    "claude", "codex", "qwen", "grok", "droid", "auggie", "gemini", "cursor", "copilot", "devin", "kiro", "junie", "goose", "cline",
];
/** What selectAgent returns for a clearly non-Claude payload that no sniff matches. It has no encoder. */
export const FALLBACK_AGENT = "unknown";
// The Claude Code tool names the hooks route, by kind: gateguard TOOL_ROUTE and
// SHELL_TOOLS, the plugin matchers, and the Skill tool companion-preference
// reads. Every other Claude name is `other`. Another agent's name goes through
// its profile alias (lib/agent-profiles.mjs), which never holds a Claude name.
const CLAUDE_TOOLS = new Map([
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
function asRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function nonEmptyString(value) {
    return typeof value === "string" && value !== "" ? value : undefined;
}
// file_path, or each MultiEdit edit's file_path. NotebookEdit's notebook_path
// is not read, the same as gateguard (open defect, docs/deferred.md).
function claudeFilePaths(input) {
    if (typeof input.file_path === "string")
        return [input.file_path];
    if (!Array.isArray(input.edits))
        return [];
    return input.edits
        .map((edit) => asRecord(edit)?.file_path)
        .filter((path) => typeof path === "string" && path !== "");
}
let stdinText;
/** stdin as text, or null when it cannot be read. Read once; later calls return the same text. */
export function readStdin() {
    if (stdinText === undefined) {
        try {
            stdinText = readFileSync(0, "utf8");
        }
        catch {
            stdinText = null;
        }
    }
    return stdinText;
}
// The env var and payload shape that, together, identify an agent that runs our
// unchanged Claude hooks (verified research, 2026-11-21, skeptic corrections
// applied; fixtures/agent-matrix/<agent>.json cites each). Either signal alone
// is not enough.
const CURSOR_EVENTS = new Set([
    "preToolUse", "postToolUse", "postToolUseFailure", "sessionStart", "sessionEnd", "stop", "subagentStop",
    "beforeSubmitPrompt", "beforeShellExecution", "beforeMCPExecution", "beforeReadFile", "afterFileEdit",
    "afterShellExecution", "afterMCPExecution", "preCompact",
]);
const GEMINI_EVENTS = new Set([
    "BeforeTool", "AfterTool", "BeforeAgent", "AfterAgent", "BeforeModel", "AfterModel", "BeforeToolSelection", "PreCompress",
]);
// hook_event_name values no Claude Code payload carries: Cursor's and Copilot's
// camelCase events, Gemini's, Kiro's agentSpawn.
const NON_CLAUDE_EVENTS = new Set([
    ...CURSOR_EVENTS, ...GEMINI_EVENTS, "agentStop", "userPromptSubmitted", "errorOccurred", "agentSpawn", "AgentSpawn",
]);
// A hook_event_name that names a Claude Code event, as Qwen and Devin send.
function claudeNamed(fields) {
    return typeof fields.hook_event_name === "string" && !NON_CLAUDE_EVENTS.has(fields.hook_event_name);
}
// Qwen's createBaseInput adds a string timestamp and its tool calls add
// tool_call_id. Neither is in Claude Code's or Devin's documented payloads.
function qwenMarked(fields) {
    return typeof fields.timestamp === "string" || "tool_call_id" in fields;
}
const DEVIN_KEYS = ["prompt_id", "tool_provenance", "trajectory_id", "execution_id"];
const SNIFFS = [
    // Cursor: CURSOR_VERSION / CURSOR_PROJECT_DIR; payloads carry cursor_version and camelCase events.
    { agent: "cursor", env: ["CURSOR_VERSION", "CURSOR_PROJECT_DIR"], foreign: true, shape: (f) => typeof f.cursor_version === "string" || CURSOR_EVENTS.has(String(f.hook_event_name)) },
    // Gemini: GEMINI_SESSION_ID / GEMINI_CWD (Qwen also sets GEMINI_PROJECT_DIR, so it is not used); Gemini's own event names.
    { agent: "gemini", env: ["GEMINI_SESSION_ID", "GEMINI_CWD"], foreign: true, shape: (f) => GEMINI_EVENTS.has(String(f.hook_event_name)) },
    // Gemini keeps the Claude names SessionStart and SessionEnd; its base payload adds a string timestamp.
    { agent: "gemini", env: ["GEMINI_SESSION_ID", "GEMINI_CWD"], shape: (f) => (f.hook_event_name === "SessionStart" || f.hook_event_name === "SessionEnd") && typeof f.timestamp === "string" },
    // Devin: DEVIN_PROJECT_DIR; Claude-named events whose payloads add prompt_id, tool_provenance, trajectory_id
    // or execution_id. Qwen payloads carry prompt_id too, so Qwen's own keys rule Devin out.
    { agent: "devin", env: ["DEVIN_PROJECT_DIR"], shape: (f) => claudeNamed(f) && !qwenMarked(f) && DEVIN_KEYS.some((key) => key in f) },
    // Devin's SessionStart has no prompt_id ("Absent for events that fire before the first user prompt"): it
    // carries source startup or resume and session_id, with no transcript_path (which Claude Code always sends).
    { agent: "devin", env: ["DEVIN_PROJECT_DIR"], shape: (f) => f.hook_event_name === "SessionStart" && (f.source === "startup" || f.source === "resume") && !("transcript_path" in f) && !qwenMarked(f) },
    // Grok: GROK_SESSION_ID / GROK_WORKSPACE_ROOT / GROK_HOOK_EVENT; payloads carry the camelCase hookEventName too.
    { agent: "grok", env: ["GROK_SESSION_ID", "GROK_WORKSPACE_ROOT", "GROK_HOOK_EVENT"], shape: (f) => typeof f.hookEventName === "string" },
    // Qwen: QWEN_PROJECT_DIR; a Claude event name plus createBaseInput's timestamp or a tool call's tool_call_id.
    { agent: "qwen", env: ["QWEN_PROJECT_DIR"], shape: (f) => claudeNamed(f) && qwenMarked(f) },
];
function isSet(value) {
    return typeof value === "string" && value.trim() !== "";
}
// A positive non-Claude signal: a non-Claude event name, or no hook_event_name
// and another agent's own keys (Copilot toolName, Cline hookName, Goose event).
function clearlyNotClaude(fields) {
    if (typeof fields.hook_event_name === "string")
        return NON_CLAUDE_EVENTS.has(fields.hook_event_name);
    return ["toolName", "hookName", "event"].some((key) => typeof fields[key] === "string");
}
function flagValue(args) {
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === "--agent")
            return args[index + 1] ?? "";
        if (arg.startsWith("--agent="))
            return arg.slice("--agent=".length);
    }
    return undefined;
}
/**
 * The agent a hook answers: `--agent <id>` (or `--agent=<id>`), then CI_AGENT,
 * then a two-signal sniff, else claude. An explicit id is returned trimmed and
 * lower-cased even when no encoder has it, so an empty or mistyped id fails
 * closed instead of reading as claude. A payload that is clearly not Claude's
 * and matches no sniff gets FALLBACK_AGENT.
 */
export function selectAgent(args, env, payload) {
    const flag = flagValue(args);
    if (flag !== undefined)
        return flag.trim().toLowerCase();
    if (isSet(env.CI_AGENT))
        return env.CI_AGENT.trim().toLowerCase();
    const fields = asRecord(payload);
    if (fields === null)
        return "claude";
    // On a payload that is clearly not Claude's, only a sniff whose shape is
    // itself non-Claude may name the agent. A stray env var must not move another
    // agent's payload (Goose's tool_call_id, Cline's string timestamp) off the
    // exit 2 fallback into output that agent does not read as a deny.
    const notClaude = clearlyNotClaude(fields);
    const sniffed = SNIFFS.find((sniff) => (sniff.foreign || !notClaude) && sniff.env.some((name) => isSet(env[name])) && sniff.shape(fields));
    if (sniffed)
        return sniffed.agent;
    return notClaude ? FALLBACK_AGENT : "claude";
}
/** The agent for this hook process: its argv, its env, and the stdin it already read (never read here). */
export function hookAgent() {
    const parsed = stdinText === undefined ? null : parsePayload(stdinText);
    return selectAgent(process.argv.slice(2), process.env, parsed?.ok ? parsed.value : undefined);
}
// Native session event names, by the Claude Code event they stand for: Cursor
// and Copilot camelCase, Kiro's agentSpawn (V3 also AgentSpawn), Cline's TaskStart.
const NATIVE_EVENTS = new Map([
    ["sessionStart", "SessionStart"], ["agentSpawn", "SessionStart"], ["AgentSpawn", "SessionStart"], ["TaskStart", "SessionStart"],
    ["sessionEnd", "SessionEnd"],
]);
/** The Claude Code name of an agent's event name; anything else comes back as given. */
export function claudeEventName(name) {
    return typeof name === "string" ? (NATIVE_EVENTS.get(name) ?? name) : name;
}
function parsedObject(value) {
    if (typeof value !== "string")
        return asRecord(value);
    try {
        return asRecord(JSON.parse(value));
    }
    catch {
        return null;
    }
}
// Cline's VS Code adapter sends every parameter as a string, so `commands` is a
// JSON-encoded array; the CLI sends an array. Either is read as one command per line.
function clineParameters(parameters) {
    let commands = parameters.commands;
    if (typeof commands === "string") {
        try {
            commands = JSON.parse(commands);
        }
        catch {
            return parameters;
        }
    }
    if (!Array.isArray(commands) || commands.length === 0 || !commands.every((command) => typeof command === "string"))
        return parameters;
    return { ...parameters, commands: commands.join("\n") };
}
// The tool call in a payload: Claude's tool_name / tool_input (Grok sends these
// beside its camelCase copies), Copilot's camelCase toolName / toolArgs (an
// object or a JSON string), or Cline's nested preToolUse.toolName / parameters.
function toolCall(fields) {
    if (typeof fields.tool_name === "string")
        return { name: fields.tool_name, input: asRecord(fields.tool_input) ?? {} };
    if (typeof fields.toolName === "string")
        return { name: fields.toolName, input: parsedObject(fields.toolArgs) ?? {} };
    const cline = asRecord(fields.preToolUse);
    if (cline !== null && typeof cline.toolName === "string") {
        return { name: cline.toolName, input: clineParameters(asRecord(cline.parameters) ?? {}) };
    }
    return { name: "", input: {} };
}
/** JSON-parse stdin. Empty, malformed or unread stdin is not ok; JSON null and arrays are ok. */
export function parsePayload(raw) {
    if (raw === null)
        return { ok: false };
    try {
        return { ok: true, value: JSON.parse(raw) };
    }
    catch {
        return { ok: false };
    }
}
// A loop_count that is present but not a count cannot prove a first fire, so it
// reads as Infinity and the Stop guard treats it as a repeat.
function loopCount(fields) {
    if (!("loop_count" in fields))
        return null;
    const value = fields.loop_count;
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : Number.POSITIVE_INFINITY;
}
/**
 * The neutral event for a parsed payload. Total: a payload that is not an
 * object (null, an array, a number) gives an event with no tool, and a field
 * of the wrong type reads as absent. The keys are Claude Code's
 * (tool_name, tool_input, session_id, cwd, prompt, stop_hook_active), then
 * Copilot's camelCase toolName / toolArgs / sessionId and Cline's nested
 * preToolUse, read by shape so an unidentified agent is still gated. Other
 * agents' tool names resolve through their profile alias, and a Claude-named
 * shell takes the flavor of the agent's own profile (Codex's Bash is unknown).
 */
export function normalizeEvent(agent, event, payload) {
    const fields = asRecord(payload) ?? {};
    const { name: toolName, input: toolInput } = toolCall(fields);
    const own = agent === "claude" ? null : profileTool(agent, toolName);
    const claude = CLAUDE_TOOLS.get(toolName);
    const alias = claude ? null : resolveInboundTool(toolName);
    const kind = claude?.kind ?? alias?.kind ?? "other";
    let command = null;
    let filePaths = [];
    if (claude) {
        if (kind === "shell" && typeof toolInput.command === "string")
            command = toolInput.command;
        if (kind === "file-write" || kind === "file-read")
            filePaths = claudeFilePaths(toolInput);
    }
    else if (alias) {
        command = inboundCommand(alias, toolInput);
        filePaths = inboundPaths(alias, toolInput);
    }
    return {
        agent,
        event,
        toolName,
        toolInput,
        kind,
        shellFlavor: kind === "shell" ? ((own?.kind === "shell" ? own.flavor : undefined) ?? claude?.flavor ?? alias?.flavor ?? "unknown") : null,
        command,
        filePaths,
        prompt: typeof fields.prompt === "string" ? fields.prompt : null,
        sessionId: typeof fields.session_id === "string" ? fields.session_id : typeof fields.sessionId === "string" ? fields.sessionId : undefined,
        cwd: nonEmptyString(fields.cwd),
        stopActive: fields.stop_hook_active === true || fields.stopHookActive === true,
        stopReason: typeof fields.reason === "string" ? fields.reason : undefined,
        loopCount: loopCount(fields),
        payload,
    };
}
// A repeat flag that is present but not a boolean cannot prove a first fire,
// so the Stop guard reads it as a repeat, the same rule as loop_count.
function malformedRepeatFlag(payload) {
    const fields = asRecord(payload);
    if (fields === null)
        return false;
    return ["stop_hook_active", "stopHookActive"].some((key) => key in fields && typeof fields[key] !== "boolean");
}
/**
 * Whether a Stop hook that can continue the turn stays out of this Stop fire
 * (plan PR 9, Architecture item 7). Never for claude: by owner decision Claude
 * Code's Stop bytes stay those of v3.27.0. For every other agent, including
 * one with no encoder: a repeat fire, where stop_hook_active or stopHookActive
 * is true (or present but not a boolean) or loop_count is not 0. The verified
 * research documents a cap on Stop continuations only for Grok (8), Copilot
 * (8), Qwen (8, overridable), Amp (5) and Goose (GOOSE_STOP_HOOK_BLOCK_CAP).
 * Cursor gives imported Claude hooks loop_limit null, and Codex, Droid, Junie
 * and Devin document no cap (Devin warns a Stop block can loop), so there the
 * guard is the only bound. On Grok, also every fire whose reason is not
 * end_turn: Grok fires an extra Stop at session end (channel_closed or
 * shutdown) whose decision it ignores (verified research 2026-11-21, hook_stop
 * for Grok, Cursor, Copilot, Codex, Qwen, Gemini, Devin, Droid and Junie,
 * skeptic verdicts applied). It reads only the selected agent: with no
 * --agent or CI_AGENT a Codex, Droid, Junie or Copilot Stop payload selects
 * claude, so the guard does not apply there.
 */
export function skipsStopGate(event) {
    if (event.agent === "claude")
        return false;
    if (event.agent === "grok" && event.stopReason !== "end_turn")
        return true;
    return event.stopActive || malformedRepeatFlag(event.payload) || (event.loopCount !== null && event.loopCount !== 0);
}
function noticeLines(decision) {
    return (decision.notices ?? []).map((notice) => `${notice}\n`).join("");
}
function encodeClaude(event, decision, stderr) {
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
            if (event === "SessionStart")
                return { stdout: decision.text, stderr, exitCode: 0 };
            return {
                stdout: `${JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: decision.text } })}\n`,
                stderr,
                exitCode: 0,
            };
        case "continue":
            return { stdout: `${JSON.stringify({ decision: "block", reason: decision.reason })}\n`, stderr, exitCode: 0 };
    }
}
// Codex blocks on exit 2 only when stderr is non-empty, and Gemini fails open
// on exit 2 when stdout and stderr are both blank (result.json verify,
// capability hook_pre_tool), so a blank reason gets a fixed line.
const BLANK_REASON_FALLBACK = "[continuous-improvement] blocked";
function nonBlankReason(reason) {
    return reason.trim() === "" ? BLANK_REASON_FALLBACK : reason;
}
// No encoder for this agent: never let a deny read as an allow.
function encodeUnknown(decision, stderr) {
    if (decision.kind === "deny" || decision.kind === "continue") {
        return { stdout: "", stderr: `${stderr}${nonBlankReason(decision.reason)}\n`, exitCode: 2 };
    }
    return { stdout: "", stderr, exitCode: 0 };
}
const claudeDeny = (event, reason) => ({
    hookSpecificOutput: { hookEventName: event, permissionDecision: "deny", permissionDecisionReason: reason },
});
const blockReason = (_event, reason) => ({ decision: "block", reason });
const hookContext = (eventName, text) => ({ hookSpecificOutput: { hookEventName: eventName, additionalContext: text } });
const GEMINI_EVENT_NAMES = { UserPromptSubmit: "BeforeAgent" };
const CLAUDE_SHAPED = { deny: claudeDeny, context: "claude", continue: blockReason };
// Plan Architecture item 7, from the verified research of 2026-11-21 with the
// skeptic corrections applied (each agent's fixtures/agent-matrix/<agent>.json
// cites the entry). Context is only sent at SessionStart and UserPromptSubmit,
// the events the research verified a context channel for; Codex, for one,
// rejects plain stdout at Stop.
const ENCODERS = new Map([
    // Codex, Qwen, Droid: the Claude deny, plain SessionStart stdout and hookSpecificOutput context, decision block.
    ["codex", CLAUDE_SHAPED],
    ["qwen", CLAUDE_SHAPED],
    ["droid", CLAUDE_SHAPED],
    // Grok: the Claude deny wins over decision; SessionStart reads only a user-facing systemMessage, prompt stdout is discarded.
    ["grok", { deny: claudeDeny, context: null, continue: blockReason }],
    // Auggie: only deny; SessionStart, Stop and PromptSubmit run in the background.
    ["auggie", { deny: claudeDeny, context: null, continue: null }],
    // Gemini: top-level decision only (permissionDecision is ignored); AfterAgent retries on decision deny.
    ["gemini", {
            deny: (_event, reason) => ({ decision: "deny", reason }),
            context: (event, text) => hookContext(GEMINI_EVENT_NAMES[event] ?? event, text),
            continue: (_event, reason) => ({ decision: "deny", reason }),
        }],
    // Cursor: the flat permission key (2.5.26 reads nothing else; the agent sees user_message), additional_context, followup_message.
    ["cursor", {
            deny: (_event, reason) => ({ permission: "deny", user_message: reason, agent_message: reason }),
            context: (_event, text) => ({ additional_context: text }),
            continue: (_event, reason) => ({ followup_message: reason }),
        }],
    // Copilot: top-level permissionDecision; only additionalContext is consumed at sessionStart; agentStop decision block.
    ["copilot", {
            deny: (_event, reason) => ({ permissionDecision: "deny", permissionDecisionReason: reason }),
            context: (_event, text) => ({ additionalContext: text }),
            continue: blockReason,
        }],
    // Devin: decision block; hookSpecificOutput.additionalContext.
    ["devin", { deny: blockReason, context: hookContext, continue: blockReason }],
    // Kiro: exit 2 is the only deny every surface honours; stdout at exit 0 is context.
    ["kiro", { deny: null, context: "plain", continue: blockReason }],
    // Junie (Early Access) and Goose: exit 2 blocks; SessionStart context is ignored or observe-only.
    ["junie", { deny: null, context: null, continue: blockReason }],
    ["goose", { deny: null, context: null, continue: blockReason }],
    // Cline: cancel with errorMessage; contextModification; no Stop event can re-prompt.
    ["cline", {
            deny: (_event, reason) => ({ cancel: true, errorMessage: reason }),
            context: (_event, text) => ({ cancel: false, contextModification: text }),
            continue: null,
        }],
]);
const CONTEXT_EVENTS = new Set(["SessionStart", "UserPromptSubmit"]);
function jsonLine(value, stderr) {
    return { stdout: `${JSON.stringify(value)}\n`, stderr, exitCode: 0 };
}
function encodeAgent(encoder, event, decision, stderr) {
    switch (decision.kind) {
        case "allow":
            return { stdout: "", stderr, exitCode: 0 };
        case "deny": {
            const reason = nonBlankReason(decision.reason);
            return encoder.deny ? jsonLine(encoder.deny(event, reason), stderr) : { stdout: "", stderr: `${stderr}${reason}\n`, exitCode: 2 };
        }
        case "continue": {
            const reason = nonBlankReason(decision.reason);
            return encoder.continue ? jsonLine(encoder.continue(event, reason), stderr) : { stdout: "", stderr: `${stderr}${reason}\n`, exitCode: 0 };
        }
        case "context":
            if (encoder.context === null || !CONTEXT_EVENTS.has(event))
                return { stdout: "", stderr, exitCode: 0 };
            if (encoder.context === "plain")
                return { stdout: decision.text, stderr, exitCode: 0 };
            if (encoder.context === "claude")
                return encodeClaude(event, decision, stderr);
            return jsonLine(encoder.context(event, decision.text), stderr);
    }
}
/** The bytes `agent` reads for `decision` on the hook event `event` (its Claude Code name). */
export function encode(agent, event, decision) {
    const stderr = noticeLines(decision);
    if (agent === "claude")
        return encodeClaude(event, decision, stderr);
    const encoder = ENCODERS.get(agent);
    return encoder ? encodeAgent(encoder, event, decision, stderr) : encodeUnknown(decision, stderr);
}
const PROCESS_STREAMS = {
    writeStdout: (text) => {
        process.stdout.write(text);
    },
    writeStderr: (text) => {
        process.stderr.write(text);
    },
    exit: (code) => process.exit(code),
};
/** Write an encoded output and exit with its code. */
export function emit(output, streams = PROCESS_STREAMS) {
    if (output.stderr !== "")
        streams.writeStderr(output.stderr);
    if (output.stdout !== "")
        streams.writeStdout(output.stdout);
    streams.exit(output.exitCode);
}
function crashOutput(error, agent, event) {
    // String(error) and a stack getter can throw too; that must not reject.
    let text;
    try {
        text = error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);
    }
    catch {
        text = "unprintable error";
    }
    return { stdout: "", stderr: `[continuous-improvement] hook error: ${text}\n`, exitCode: crashExitCode(agent, event) };
}
// A PreToolUse crash keeps a non-zero exit (owner decision: the vendor's
// fail-closed default is kept). Exit 1 is what Node gave in v3.27.0, so the
// vendor's own crash rule decides: Copilot's preToolUse is fail-closed on
// errors and the Kiro IDE blocks on any non-zero exit, while Codex, Qwen,
// Gemini, Devin, Cursor, Grok and Auggie fail open unless their own
// fail-closed option is set (verified research 2026-11-21, hook_pre_tool,
// skeptic verdicts applied). An id with no encoder gets the fail-closed exit
// 2. Every other event exits 0: on Kiro an exit 1 from a Stop hook starts
// another turn.
function crashExitCode(agent, event) {
    if (event !== "PreToolUse")
        return 0;
    return ENCODERS.has(agent) ? 1 : 2;
}
/**
 * The output of a hook body, crash-safe. A throw ends with empty stdout and
 * the error on stderr, and nothing the body encoded before it is printed, so
 * Cursor 3.x never sees non-JSON stdout from a crash. `event` is the Claude
 * Code name of the event the hook is wired to. At Stop, a prompt or session
 * start the exit is 0, because on Kiro an exit 1 from a Stop hook starts
 * another turn (plan, "What the research found" item 3). At PreToolUse the
 * exit stays non-zero (crashExitCode), so a crash that the vendor read as a
 * deny in v3.27.0 is still a deny.
 *
 * `agent` is read only after a throw. When it names claude the throw is
 * rethrown unchanged, so Node reports it as v3.27.0 did (exit 1, which Claude
 * Code reads as a non-blocking error) and the goldens keep their bytes (owner
 * decision: Claude Code behaviour stays byte-identical). An agent that cannot
 * be read counts as an id with no encoder. Every hook entry point is
 * `emit(await settleHook(body, hookAgent))`, with EVENT as a third argument
 * in the PreToolUse hooks.
 */
export async function settleHook(body, agent, event) {
    try {
        return await body();
    }
    catch (error) {
        let id = FALLBACK_AGENT;
        try {
            id = agent?.() ?? FALLBACK_AGENT;
        }
        catch {
            // An agent that cannot be read is not Claude Code.
        }
        if (id === "claude")
            throw error;
        return crashOutput(error, id, event);
    }
}
/** Run a hook body and emit what it returns; with no agent and no event a throw ends as exit 0. */
export async function runHook(body, streams = PROCESS_STREAMS) {
    emit(await settleHook(body), streams);
}
