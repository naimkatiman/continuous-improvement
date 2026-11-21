// observe-event.mts — Pure parsers for the Mulahazah observation hook.
//
// These functions have NO I/O. They turn raw stdin text and tool input/output
// payloads into shaped data the entrypoint (src/bin/observe.mts) writes to
// observations.jsonl. Pure separation lets the unit tests cover schema edge
// cases (malformed JSON, missing fields, oversized payloads) without ever
// touching the filesystem or computing project hashes.
//
// Truncation budgets match the prior bash/jq behavior to preserve the existing
// privacy contract: input head ≤500 chars, output head ≤200 chars. Every
// summary is passed through redactSecrets before the cut, so the secret shapes
// it knows are not written to observations.jsonl.
import { inboundCommand, inboundPatchText, inboundPaths, resolveInboundTool } from "./agent-profiles.mjs";
import { payloadSessionId, payloadToolCall } from "./hook-io.mjs";
import { isBareSecretName, isCredentialShaped, isSecretName, redactSecrets } from "./redact-secrets.mjs";
const INPUT_TRUNCATE = 500;
const OUTPUT_TRUNCATE = 200;
// How far past the budget redaction reads. A secret that straddles the cut is
// matched whole instead of leaving its head in the row, and the regex work per
// event stays bounded however large the payload is (this runs on every tool
// call, and the redactor is quadratic on some long inputs). The one shape this
// can miss is a bare JWT whose third segment starts past the lookahead.
const REDACT_LOOKAHEAD = 1024;
const AUTHORIZATION_KEY_RE = /^(?:proxy-)?authorization$/i;
const AUTHORIZATION_LABEL = "Authorization: ";
const REDACTED = "<redacted>";
// The result keys after Claude's tool_response, tool_output and toolOutput, per
// the verified research: Cline's postToolUse.result (hook_post_tool, VS Code
// and CLI), Grok's and Copilot's camelCase toolResult, and tool_result (Auggie,
// Copilot's snake form). The first one present wins.
const RESULT_KEYS = ["tool_response", "tool_output", "toolOutput", "toolResult", "tool_result"];
// The tool call id: Claude, Codex, Cursor, Qwen, Grok and Junie tool_use_id,
// Grok's camelCase toolUseId, Goose's tool_call_id (skeptic, hook_pre_tool).
const TOOL_USE_ID_KEYS = ["tool_use_id", "toolUseId", "tool_call_id"];
// Where a payload names its event: Claude's hook_event_name, Grok's camelCase
// hookEventName, Goose's event and Cline's hookName.
const EVENT_KEYS = ["hook_event_name", "hookEventName", "event", "hookName"];
// Post-tool event names: Claude's PostToolUse (also Codex, Qwen, Kiro, Devin,
// Droid, Junie, Auggie, Goose and Cline), Gemini's AfterTool, Cursor's and
// Copilot's postToolUse, Grok's post_tool_use and the Cline CLI's tool_result.
const POST_EVENTS = new Set(["PostToolUse", "AfterTool", "postToolUse", "post_tool_use", "tool_result"]);
const PRE_EVENTS = new Set(["PreToolUse", "BeforeTool", "preToolUse", "pre_tool_use", "tool_call"]);
/**
 * Parse the raw JSON stdin payload of a PreToolUse/PostToolUse hook event from
 * `agent` (the id hook-io's selectAgent picks). Returns null for any
 * unparseable or schema-invalid input, never throws. Empty/null/array payloads
 * and payloads with no tool name are rejected, so an unknown shape writes no
 * row.
 *
 * The tool call is Claude's tool_name / tool_input, else Copilot's camelCase
 * toolName / toolArgs or Cline's nested preToolUse / postToolUse (hook-io
 * payloadToolCall). The result is the first of RESULT_KEYS present, then
 * Cline's postToolUse.result; for another agent a tool_response object with a
 * string `output` (Devin's {success, output, error}) is that output. The
 * session is hook-io payloadSessionId's, the one the gate reads.
 *
 * `complete`: for claude, whether a result is present, as before. Another
 * agent's call is finished when its event is a post-tool event, even with no
 * result (Goose's PostToolUse carries none), and not when it is a pre-tool one;
 * a payload that names no event (Copilot camelCase) falls back to the result.
 */
export function parseHookPayload(raw, agent = "claude") {
    if (!raw)
        return null;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
    }
    const obj = parsed;
    // Claude's input is kept as sent, so its rows stay byte for byte.
    const call = typeof obj.tool_name === "string" ? { name: obj.tool_name, input: obj.tool_input } : payloadToolCall(obj);
    if (call.name.length === 0)
        return null;
    const key = RESULT_KEYS.find((name) => obj[name] !== undefined);
    const cline = obj.postToolUse !== null && typeof obj.postToolUse === "object" ? obj.postToolUse : null;
    let toolResponse = key !== undefined ? obj[key] : cline?.result;
    const output = toolResponse?.output;
    if (agent !== "claude" && key === "tool_response" && typeof toolResponse === "object" && typeof output === "string") {
        toolResponse = output;
    }
    const eventName = EVENT_KEYS.map((name) => obj[name]).find((value) => typeof value === "string");
    const named = agent === "claude" || eventName === undefined ? undefined : POST_EVENTS.has(eventName) ? true : PRE_EVENTS.has(eventName) ? false : undefined;
    return {
        tool_name: call.name,
        session_id: payloadSessionId(obj) ?? "",
        tool_input: call.input,
        tool_response: toolResponse,
        tool_use_id: TOOL_USE_ID_KEYS.map((name) => obj[name]).find((value) => typeof value === "string" && value !== "") ?? "",
        complete: named ?? toolResponse !== undefined,
    };
}
/**
 * Extract a tool-aware short summary from `tool_input`. Tool-specific cases
 * cover the high-frequency surfaces the linter/analyser reads (Bash command
 * head, Edit/Write/Read file_path, Grep/Glob pattern). Unknown tools fall
 * back to JSON.stringify(input) capped at INPUT_TRUNCATE. Every branch is
 * redacted before the cut.
 *
 * Returns an empty string when the expected field is missing on a known tool
 * or when input is null/undefined — never returns "undefined" or "null"
 * literals to the caller.
 */
export function summariseInput(toolName, input) {
    if (input === null || input === undefined)
        return "";
    switch (toolName) {
        case "Bash": {
            const cmd = readStringField(input, "command");
            return cmd === null ? "" : redactedHead(cmd, INPUT_TRUNCATE);
        }
        case "Edit":
        case "Write":
        case "Read":
        case "NotebookEdit": {
            const path = readStringField(input, "file_path");
            return path === null ? "" : redactedHead(path, INPUT_TRUNCATE);
        }
        case "Grep":
        case "Glob": {
            const pattern = readStringField(input, "pattern");
            return pattern === null ? "" : redactedHead(pattern, INPUT_TRUNCATE);
        }
        default:
            return summariseAliasInput(toolName, input);
    }
}
/**
 * Another agent's tool name (lib/agent-profiles.mjs, never a Claude Code one):
 * a shell by its command, a patch by its text (the headers name its files), a
 * file tool by its path, as the Claude cases above. A search or other alias,
 * and an unknown tool, keep the JSON of the input, so we record *something*
 * useful for future analysis, cut to keep observations.jsonl rows bounded.
 */
function summariseAliasInput(toolName, input) {
    const alias = resolveInboundTool(toolName);
    let text;
    if (alias?.kind === "shell")
        text = inboundCommand(alias, input);
    else if (alias?.kind === "patch")
        text = inboundPatchText(alias, input);
    else if (alias?.kind === "file-read" || alias?.kind === "file-write")
        text = inboundPaths(alias, input)[0] ?? null;
    if (text === undefined)
        return redactedJsonHead(input, INPUT_TRUNCATE);
    return text === null ? "" : redactedHead(text, INPUT_TRUNCATE);
}
/**
 * Extract a short summary from `tool_response`. Strings pass through (redacted,
 * then capped at OUTPUT_TRUNCATE); numbers/booleans coerce to string; objects
 * JSON-stringify and get the same redaction and cap. Null/undefined collapse
 * to "".
 */
export function summariseOutput(output) {
    if (output === null || output === undefined)
        return "";
    if (typeof output === "string")
        return redactedHead(output, OUTPUT_TRUNCATE);
    if (typeof output === "number" || typeof output === "boolean") {
        return String(output);
    }
    return redactedJsonHead(output, OUTPUT_TRUNCATE);
}
/** Redact secret shapes in the head of `value`, then cut it to the `max` budget. */
function redactedHead(value, max) {
    return truncate(redactSecrets(truncate(value, max + REDACT_LOOKAHEAD)), max);
}
/**
 * Serialise `value` with its strings already redacted, then cut to `max`.
 *
 * Redacting the serialised text instead does not work: JSON.stringify turns a
 * newline into backslash + n, which glues a secret on the next line to a word
 * character (the hex rule's boundary fails) and removes the whitespace that
 * ends an unquoted value (the rest of the row is swallowed). Returns "" for a
 * value JSON cannot serialise, as before.
 */
function redactedJsonHead(value, max) {
    let serialised;
    try {
        serialised = JSON.stringify(redactLeaves(value, max, { left: max + REDACT_LOOKAHEAD }));
    }
    catch {
        serialised = "";
    }
    return truncate(serialised ?? "", max);
}
/**
 * Copy `value` with every string redacted and the value of every secret-named
 * property replaced. `budget.left` counts redacted output, not input: a leaf
 * that shrinks to a placeholder must not use up the budget while later leaves
 * still land inside the cut. Once it is spent a string becomes "", so no leaf
 * is ever written without having been redacted.
 *
 * `underBareName` is true below a property named `key`, `keys` or `token`.
 * Those are ordinary property names (a key press, a cache key, a list of keys),
 * so nothing is replaced on the name alone: a string under one is replaced
 * when the part of it that can reach the row is credential-shaped, and is
 * otherwise treated like any other leaf.
 */
function redactLeaves(value, max, budget, label = "", underBareName = false) {
    if (typeof value === "string") {
        if (budget.left <= 0)
            return "";
        if (underBareName && isCredentialShaped(truncate(value, max + REDACT_LOOKAHEAD))) {
            budget.left -= REDACTED.length + 1;
            return REDACTED;
        }
        const redacted = redactedHead(label + value, max + label.length).slice(label.length);
        budget.left -= redacted.length + 1;
        return redacted;
    }
    if (value === null || typeof value !== "object")
        return value;
    if (Array.isArray(value))
        return value.map((item) => redactLeaves(item, max, budget, "", underBareName));
    const copy = {};
    for (const [key, child] of Object.entries(value)) {
        if (isSecretName(key)) {
            copy[key] = REDACTED;
        }
        else {
            // A header map holds the credential without the header name in front of
            // it ({"Authorization": "Basic abc"}); the rule that reads that name gets
            // it back for the redaction and loses it again afterwards.
            copy[key] = redactLeaves(child, max, budget, AUTHORIZATION_KEY_RE.test(key) ? AUTHORIZATION_LABEL : "", underBareName || isBareSecretName(key));
        }
    }
    return copy;
}
function readStringField(input, field) {
    if (input === null || typeof input !== "object")
        return null;
    const value = input[field];
    return typeof value === "string" ? value : null;
}
function truncate(value, max) {
    return value.length > max ? value.slice(0, max) : value;
}
