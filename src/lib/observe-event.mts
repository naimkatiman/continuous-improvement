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

export interface HookPayload {
  tool_name: string;
  session_id: string;
  tool_input: unknown;
  tool_response: unknown;
}

interface RawHookPayload {
  tool_name?: unknown;
  session_id?: unknown;
  tool_input?: unknown;
  tool_response?: unknown;
  tool_output?: unknown;
  toolOutput?: unknown;
}

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
export function parseHookPayload(raw: string): HookPayload | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const obj = parsed as RawHookPayload;
  if (typeof obj.tool_name !== "string" || obj.tool_name.length === 0) {
    return null;
  }
  const toolResponse =
    obj.tool_response !== undefined
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
 * back to JSON.stringify(input) capped at INPUT_TRUNCATE. Every branch is
 * redacted before the cut.
 *
 * Returns an empty string when the expected field is missing on a known tool
 * or when input is null/undefined — never returns "undefined" or "null"
 * literals to the caller.
 */
export function summariseInput(toolName: string, input: unknown): string {
  if (input === null || input === undefined) return "";

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
function summariseAliasInput(toolName: string, input: unknown): string {
  const alias = resolveInboundTool(toolName);
  let text: string | null | undefined;
  if (alias?.kind === "shell") text = inboundCommand(alias, input);
  else if (alias?.kind === "patch") text = inboundPatchText(alias, input);
  else if (alias?.kind === "file-read" || alias?.kind === "file-write") text = inboundPaths(alias, input)[0] ?? null;
  if (text === undefined) return redactedJsonHead(input, INPUT_TRUNCATE);
  return text === null ? "" : redactedHead(text, INPUT_TRUNCATE);
}

/**
 * Extract a short summary from `tool_response`. Strings pass through (redacted,
 * then capped at OUTPUT_TRUNCATE); numbers/booleans coerce to string; objects
 * JSON-stringify and get the same redaction and cap. Null/undefined collapse
 * to "".
 */
export function summariseOutput(output: unknown): string {
  if (output === null || output === undefined) return "";
  if (typeof output === "string") return redactedHead(output, OUTPUT_TRUNCATE);
  if (typeof output === "number" || typeof output === "boolean") {
    return String(output);
  }
  return redactedJsonHead(output, OUTPUT_TRUNCATE);
}

/** Redact secret shapes in the head of `value`, then cut it to the `max` budget. */
function redactedHead(value: string, max: number): string {
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
function redactedJsonHead(value: unknown, max: number): string {
  let serialised: string | undefined;
  try {
    serialised = JSON.stringify(redactLeaves(value, max, { left: max + REDACT_LOOKAHEAD }));
  } catch {
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
function redactLeaves(
  value: unknown,
  max: number,
  budget: { left: number },
  label = "",
  underBareName = false,
): unknown {
  if (typeof value === "string") {
    if (budget.left <= 0) return "";
    if (underBareName && isCredentialShaped(truncate(value, max + REDACT_LOOKAHEAD))) {
      budget.left -= REDACTED.length + 1;
      return REDACTED;
    }
    const redacted = redactedHead(label + value, max + label.length).slice(label.length);
    budget.left -= redacted.length + 1;
    return redacted;
  }
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactLeaves(item, max, budget, "", underBareName));
  const copy: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSecretName(key)) {
      copy[key] = REDACTED;
    } else {
      // A header map holds the credential without the header name in front of
      // it ({"Authorization": "Basic abc"}); the rule that reads that name gets
      // it back for the redaction and loses it again afterwards.
      copy[key] = redactLeaves(
        child,
        max,
        budget,
        AUTHORIZATION_KEY_RE.test(key) ? AUTHORIZATION_LABEL : "",
        underBareName || isBareSecretName(key),
      );
    }
  }
  return copy;
}

function readStringField(input: unknown, field: string): string | null {
  if (input === null || typeof input !== "object") return null;
  const value = (input as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}
