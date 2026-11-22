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
 * `.claude-plugin/`, the other agents' hook, MCP, extension and plugin files
 * (`.codex/config.toml`, `.gemini/settings.json`, `.devin/hooks.v1.json`, ...),
 * the `claude plugin|mcp|config` CLI forms that edit them, and the plugin, mcp,
 * extensions and hooks verbs of the codex, gemini, qwen, grok, copilot and
 * devin CLIs. Pure logic (and the full lists) in ../lib/config-guard-gate.mjs.
 *
 * Mode via CI_CONFIG_GUARD: "warn" (default) | "block" | "off".
 *   warn  : print a one-line notice to stderr; never blocks.
 *   block : emit the PreToolUse deny shape.
 *   off   : no-op.
 * One-call bypass: CI_CONFIG_GUARD_ALLOW=true allows the call and says so.
 *
 * Registered with a tool matcher
 * (Bash|PowerShell|Monitor|Edit|MultiEdit|Write|NotebookEdit) so read-only tools never
 * spawn it. No network. No git. Fail-open.
 *
 * The hook is: read stdin, normalize (lib/hook-io.mjs), decide
 * (lib/config-guard-gate.mjs), encode for the agent.
 */

import { classifyMutation, decide, parseMode, type ConfigMutation } from "../lib/config-guard-gate.mjs";
import {
  emit,
  encode,
  hookAgent,
  normalizeEvent,
  parsePayload,
  readStdin,
  settleHook,
  type Decision,
} from "../lib/hook-io.mjs";

const EVENT = "PreToolUse";
const ALLOW: Decision = { kind: "allow" };

function buildReason(toolName: string, hit: ConfigMutation, mode: "warn" | "block"): string {
  const what =
    hit.via === "claude-cli" || hit.via === "agent-cli"
      ? `\`${hit.target}\` edits the plugin / MCP / settings configuration`
      : hit.via === "no-path"
        ? `${toolName} names no file at any key it reads (${hit.target}), so it may modify a file`
        : `${toolName} would modify ${hit.target} (matches "${hit.pattern}")`;
  return [
    `config-guard: ${what}, one of the files that wires the guardrails (settings, MCP config, hooks, installed plugins).`,
    "If this is intended, rerun this one call with CI_CONFIG_GUARD_ALLOW=true, or set CI_CONFIG_GUARD=off for the session.",
    mode === "block"
      ? "You are seeing a deny because CI_CONFIG_GUARD=block; the default is warn."
      : "This is a warning (CI_CONFIG_GUARD=warn, the default); set CI_CONFIG_GUARD=block to deny instead.",
  ].join("\n");
}

function decideConfigGuard(): Decision {
  const mode = parseMode(process.env.CI_CONFIG_GUARD);
  if (mode === "off") return ALLOW;

  const parsed = parsePayload(readStdin());
  if (!parsed.ok) return ALLOW;
  const event = normalizeEvent(hookAgent(), EVENT, parsed.value);

  const hit = classifyMutation(event.toolName, event.toolInput);
  if (!hit) return ALLOW;

  if (String(process.env.CI_CONFIG_GUARD_ALLOW ?? "").trim().toLowerCase() === "true") {
    return {
      kind: "allow",
      notices: [
        `[continuous-improvement] config-guard: CI_CONFIG_GUARD_ALLOW=true let ${event.toolName} touch ${hit.target} on this call.`,
      ],
    };
  }

  const decision = decide(mode, true, buildReason(event.toolName, hit, mode));
  if (decision.action === "block") return { kind: "deny", reason: decision.reason };
  if (decision.action === "warn") {
    return { kind: "allow", notices: [`[continuous-improvement] ${decision.reason.split("\n")[0]}`] };
  }
  return ALLOW;
}

function main(): Decision {
  try {
    return decideConfigGuard();
  } catch {
    // fail-open: never block a session on a hook error
    return ALLOW;
  }
}

emit(await settleHook(() => encode(hookAgent(), EVENT, main()), hookAgent, EVENT));
