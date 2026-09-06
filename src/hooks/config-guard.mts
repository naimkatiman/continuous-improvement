#!/usr/bin/env node
/**
 * Runtime PreToolUse config-guard hook.
 *
 * Stdin  : JSON { tool_name, tool_input }
 * Stdout : empty on allow / warn (warn prints to stderr); on block, the
 *          documented PreToolUse shape:
 *          { hookSpecificOutput: { hookEventName: "PreToolUse",
 *            permissionDecision: "deny", permissionDecisionReason } }
 * Exit   : 0 always (decision is in stdout; fail-open on any error).
 *
 * Guards the files that wire the guardrails: `.claude/settings*.json`,
 * `.mcp.json`, `hooks.json`, `.claude/hooks/`, `.claude/plugins/`,
 * `.claude-plugin/`, and the `claude plugin|mcp|config` CLI forms that edit
 * them. Pure logic in ../lib/config-guard-gate.mjs.
 *
 * Mode via CI_CONFIG_GUARD: "warn" (default) | "block" | "off".
 *   warn  : print a one-line notice to stderr; never blocks.
 *   block : emit the PreToolUse deny shape.
 *   off   : no-op.
 * One-call bypass: CI_CONFIG_GUARD_ALLOW=true allows the call and says so.
 *
 * Registered with a tool matcher (Bash|Edit|MultiEdit|Write|NotebookEdit) so
 * read-only tools never spawn it. No network. No git. Fail-open.
 */

import { readFileSync } from "node:fs";

import { classifyMutation, decide, parseMode, type ConfigMutation } from "../lib/config-guard-gate.mjs";

function readStdinSync(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildReason(toolName: string, hit: ConfigMutation, mode: "warn" | "block"): string {
  const what =
    hit.via === "claude-cli"
      ? `\`${hit.target}\` edits the plugin / MCP / settings configuration`
      : `${toolName} would modify ${hit.target} (matches "${hit.pattern}")`;
  return [
    `config-guard: ${what}, one of the files that wires the guardrails (settings, MCP config, hooks, installed plugins).`,
    "If this is intended, rerun this one call with CI_CONFIG_GUARD_ALLOW=true, or set CI_CONFIG_GUARD=off for the session.",
    mode === "block"
      ? "You are seeing a deny because CI_CONFIG_GUARD=block; the default is warn."
      : "This is a warning (CI_CONFIG_GUARD=warn, the default); set CI_CONFIG_GUARD=block to deny instead.",
  ].join("\n");
}

function main(): void {
  const mode = parseMode(process.env.CI_CONFIG_GUARD);
  if (mode === "off") return;

  const payload = safeJsonParse(readStdinSync());
  if (!payload || typeof payload !== "object") return;
  const obj = payload as { tool_name?: unknown; tool_input?: unknown };
  const toolName = typeof obj.tool_name === "string" ? obj.tool_name : "";
  const toolInput =
    obj.tool_input && typeof obj.tool_input === "object" ? (obj.tool_input as Record<string, unknown>) : {};

  const hit = classifyMutation(toolName, toolInput);
  if (!hit) return;

  if (String(process.env.CI_CONFIG_GUARD_ALLOW ?? "").trim().toLowerCase() === "true") {
    process.stderr.write(
      `[continuous-improvement] config-guard: CI_CONFIG_GUARD_ALLOW=true let ${toolName} touch ${hit.target} on this call.\n`,
    );
    return;
  }

  const decision = decide(mode, true, buildReason(toolName, hit, mode));
  if (decision.action === "block") {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: decision.reason,
        },
      })}\n`,
    );
    return;
  }
  if (decision.action === "warn") {
    process.stderr.write(`[continuous-improvement] ${decision.reason.split("\n")[0]}\n`);
  }
}

try {
  main();
} catch {
  // fail-open: never block a session on a hook error
}
process.exit(0);
