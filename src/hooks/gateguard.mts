#!/usr/bin/env node
/**
 * Runtime PreToolUse gateguard hook.
 *
 * Stdin  : JSON { tool_name, tool_input }
 * Stdout : empty on allow (no output = no opinion, the call proceeds); on
 *          deny, the documented PreToolUse shape:
 *          { hookSpecificOutput: { hookEventName: "PreToolUse",
 *            permissionDecision: "deny", permissionDecisionReason } }
 *          A bare { decision: "allow" } is not schema-valid for PreToolUse
 *          (the deprecated enum is "approve" | "block") and surfaces as a
 *          "Hook JSON output validation failed" error on every tool call.
 * Exit   : 0 always (decision is in stdout, fail-open on parse error).
 *
 * The file gate (Edit, Write, MultiEdit, NotebookEdit) has three modes, picked
 * by CI_GATEGUARD_FILE_GATE:
 * - evidence (the default): allow a new file, a file with a recorded clearance,
 *   and a file this session's observation rows show was looked at
 *   (lib/gateguard-evidence.mjs). A blind edit of an existing file is denied
 *   with a two-line reason. With no observation log the gate cannot judge and
 *   allows.
 * - strict: the three-stage gate per skills/gateguard.md:
 *   - DENY  : first mutating tool call per file, with fact-list reason
 *   - FORCE : agent presents facts (model-side; out of band)
 *   - ALLOW : retry once the per-file marker is recorded in session state
 *             (harness-portable, written out of band via Bash), or
 *             `_gateguard_facts_presented: true` is set where the harness
 *             forwards unknown tool params
 * - off: the file gate is skipped.
 * Any other value is read as evidence and reported on stderr. The shell rules,
 * CI_GATEGUARD_EXCLUDE and CI_GATEGUARD_TARGET_LOCK are the same in every mode.
 *
 * Read-only and exploratory tools (Read, Grep, Glob, routine Bash) bypass
 * unconditionally. Destructive Bash gates EVERY call, not just first. The
 * PowerShell tool is a shell tool too and goes through the same classifier,
 * which is told the tool name (`rm -r` is Remove-Item -Recurse there).
 *
 * Other agents that load this plugin report their own tool names. The ones in
 * lib/agent-profiles.mjs (never a Claude Code name) are routed by kind: a shell
 * is classified in its flavor, both ways on Windows when the flavor is unknown;
 * a file tool is gated on the paths its input keys hold; an apply_patch is
 * gated on the paths in its *** File headers (lib/patch-paths.mjs).
 *
 * V1 honest limitations (see src/lib/gateguard-state.mts header):
 *   honor-system flag, state-file deletion, parallel-hook race.
 *
 * MultiEdit handling gates every edited file individually. The hook blocks
 * unless all edited paths are already cleared, or the agent presents facts
 * for the call and the hook records clearance for each edited path.
 * Block reasons now name the whole batch instead of just the first uncleared
 * path.
 */

// The hook is: read stdin, normalize (lib/hook-io.mjs), decide
// (lib/gateguard-decide.mjs, which holds every rule above), encode for the
// agent. The claude encoder is the output code this file used to hold.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decideGateguard, readGateguardConfig } from "../lib/gateguard-decide.mjs";
import { emit, encode, hookAgent, normalizeEvent, parsePayload, readStdin, type EncodedOutput } from "../lib/hook-io.mjs";

const EVENT = "PreToolUse";

// Resolved from the hook's own location at load time. The block reason must
// print a command the agent can run in its OWN shell, where ${CLAUDE_PLUGIN_ROOT}
// is empty — that variable is only populated while this hook itself executes.
// bin/ is a sibling of hooks/ in both the repo layout and the plugin-bundle
// mirror, so this resolves correctly from either.
const CLEAR_CLI_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "gateguard-clear.mjs");

// The CI_GATEGUARD_* knobs, read once at load as before.
const CONFIG = readGateguardConfig(process.env, CLEAR_CLI_PATH);

async function main(): Promise<EncodedOutput> {
  const parsed = parsePayload(readStdin());
  const agent = hookAgent();
  if (!parsed.ok) return encode(agent, EVENT, { kind: "allow" }); // fail-open
  const payload = parsed.value as { tool_name?: unknown };
  // The hook read payload.tool_name here before the move, so JSON null stdin
  // crashed with exit 1 and a TypeError stack (golden gateguard/null-stdin).
  // This read keeps that crash. Wrapping the entry point in runHook ends it as
  // exit 0 instead, a Claude change that plan PR 9 makes and declares.
  void payload.tool_name;
  const event = normalizeEvent(agent, EVENT, payload);
  return encode(agent, EVENT, await decideGateguard(event, CONFIG));
}

emit(await main());
