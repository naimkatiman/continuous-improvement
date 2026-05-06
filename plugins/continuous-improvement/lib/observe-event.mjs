// observe-event.mts — Pure parsers for the Mulahazah observation hook.
//
// These functions have NO I/O. They turn raw stdin text and tool input/output
// payloads into shaped data the entrypoint (src/bin/observe.mts) writes to
// observations.jsonl. Pure separation lets the unit tests cover schema edge
// cases (malformed JSON, missing fields, oversized payloads) without ever
// touching the filesystem or computing project hashes.
//
// Truncation budgets match the prior bash/jq behavior to preserve the existing
// privacy contract: input head ≤500 chars, output head ≤200 chars.
const INPUT_TRUNCATE = 500;
const OUTPUT_TRUNCATE = 200;
/**
 * Parse the raw JSON stdin payload from a Claude Code PreToolUse/PostToolUse
 * hook event. Returns null for any unparseable or schema-invalid input —
 * never throws. Empty/null/array payloads are rejected (the harness only
 * sends objects).
 *
 * Field-name normalisation: Claude Code's PostToolUse payload uses
 * `tool_response`. Older mocks and some third-party harnesses emit
 * `tool_output` or `toolOutput`. We accept all three at the boundary and
 * expose a single `tool_response` field downstream so the discriminator and
 * `summariseOutput` only have to know one name.
 */
export function parseHookPayload(raw) {
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
    if (typeof obj.tool_name !== "string" || obj.tool_name.length === 0) {
        return null;
    }
    const toolResponse = obj.tool_response !== undefined
        ? obj.tool_response
        : obj.tool_output !== undefined
            ? obj.tool_output
            : obj.toolOutput;
    return {
        tool_name: obj.tool_name,
        session_id: typeof obj.session_id === "string" ? obj.session_id : "",
        tool_input: obj.tool_input,
        tool_response: toolResponse,
    };
}
/**
 * Extract a tool-aware short summary from `tool_input`. Tool-specific cases
 * cover the high-frequency surfaces the linter/analyser reads (Bash command
 * head, Edit/Write/Read file_path, Grep/Glob pattern). Unknown tools fall
 * back to JSON.stringify(input) capped at INPUT_TRUNCATE.
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
            return cmd === null ? "" : truncate(cmd, INPUT_TRUNCATE);
        }
        case "Edit":
        case "Write":
        case "Read":
        case "NotebookEdit": {
            const path = readStringField(input, "file_path");
            return path === null ? "" : truncate(path, INPUT_TRUNCATE);
        }
        case "Grep":
        case "Glob": {
            const pattern = readStringField(input, "pattern");
            return pattern === null ? "" : truncate(pattern, INPUT_TRUNCATE);
        }
        default: {
            // Unknown tool: stringify input so we record *something* useful for
            // future analysis. Truncate to keep observations.jsonl row size bounded.
            let serialised;
            try {
                serialised = JSON.stringify(input);
            }
            catch {
                serialised = "";
            }
            return truncate(serialised ?? "", INPUT_TRUNCATE);
        }
    }
}
/**
 * Extract a short summary from `tool_response`. Strings pass through (capped
 * at OUTPUT_TRUNCATE); numbers/booleans coerce to string; objects
 * JSON-stringify. Null/undefined collapse to "".
 */
export function summariseOutput(output) {
    if (output === null || output === undefined)
        return "";
    if (typeof output === "string")
        return truncate(output, OUTPUT_TRUNCATE);
    if (typeof output === "number" || typeof output === "boolean") {
        return String(output);
    }
    let serialised;
    try {
        serialised = JSON.stringify(output);
    }
    catch {
        serialised = "";
    }
    return truncate(serialised ?? "", OUTPUT_TRUNCATE);
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
