#!/usr/bin/env node
/**
 * query-cost-nudge.mts — Stop hook that nudges a D1-aware query-cost audit when
 * the working tree has changed DB/query files at turn end (RISA 5 / G5).
 *
 * The `database-reviewer` agent already carries the cost checklist, but nothing
 * dispatched it on DB edits, so cost regressions (the surprise-D1-bill class)
 * shipped unaudited. This injects a once-per-session reminder via Stop
 * `additionalContext` — a Stop hook (not PostToolUse) because only PreToolUse /
 * UserPromptSubmit / Stop / SubagentStop support additionalContext; PostToolUse
 * could only emit a user-facing systemMessage that never reaches the model.
 *
 * Opt-in via CLAUDE_QUERY_COST_NUDGE=on or CI_QUERY_COST_NUDGE=on (default off). Once-per-session dedup
 * keyed on the Stop stdin session_id (falls back to a per-day key) — without it,
 * additionalContext "keeps the turn going" and would re-fire every turn while
 * the DB files stay dirty. Never blocks; fail-open on any error.
 *
 * The hook is: read stdin, normalize (lib/hook-io.mjs), decide
 * (lib/query-cost-gate.mjs), encode for the agent.
 */

import { execFileSync } from "node:child_process";
import { readKnob } from "../lib/agent-env.mjs";
import { resolveInstinctsRoot, resolveProjectRoot } from "../lib/agent-paths.mjs";
import { hashProjectRoot } from "../lib/gateguard-state.mjs";
import { emit, encode, hookAgent, normalizeEvent, parsePayload, readStdin, settleHook, type Decision } from "../lib/hook-io.mjs";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  buildQueryCostReminder,
  changedQueryPaths,
  parseChangedFiles,
  resolveQueryCostNudge,
} from "../lib/query-cost-gate.mjs";

const EVENT = "Stop";
const ALLOW: Decision = { kind: "allow" };

function resolveHome(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

function collectChangedFiles(root: string): string[] {
  const run = (args: string[]): string => {
    try {
      return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return "";
    }
  };
  return [
    ...parseChangedFiles(run(["diff", "--name-only", "--diff-filter=ACMR"])),
    ...parseChangedFiles(run(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])),
    ...parseChangedFiles(run(["ls-files", "--others", "--exclude-standard"])),
  ];
}

// Marker key: the sanitized session_id when present (the normal case), else a
// per-day key so a missing id self-heals daily instead of blocking forever.
function markerKey(sessionId: string | undefined): string {
  const sanitized = (sessionId ?? "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
  return sanitized || `day-${new Date().toISOString().slice(0, 10)}`;
}

function markerPath(home: string, projectRoot: string, sessionId: string | undefined): string {
  const hash = hashProjectRoot(projectRoot);
  return join(resolveInstinctsRoot(home), hash, "query-cost-nudge", `${markerKey(sessionId)}.nudged`);
}

function decideQueryCostNudge(): Decision {
  if (resolveQueryCostNudge(readKnob("CLAUDE_QUERY_COST_NUDGE")) === "off") return ALLOW;

  // stdin optional: without a session id the dedup is per day.
  const parsed = parsePayload(readStdin());
  const payload = parsed.ok ? parsed.value : null;
  const sessionId = normalizeEvent(hookAgent(), EVENT, payload).sessionId;

  // Trimmed: this hook has always trimmed CLAUDE_PROJECT_DIR before using it.
  const root = resolveProjectRoot(payload).trim();
  if (root === "global") return ALLOW; // no repo → nothing to diff

  const changed = changedQueryPaths(collectChangedFiles(root));
  if (changed.length === 0) return ALLOW;

  const marker = markerPath(resolveHome(), root, sessionId);
  try {
    if (existsSync(marker)) return ALLOW; // already nudged this session
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, `${new Date().toISOString()}\n`);
  } catch {
    // if the marker can't be written, nudge anyway (no dedup) rather than stay silent
  }

  return { kind: "context", text: buildQueryCostReminder(changed) };
}

function main(): Decision {
  try {
    return decideQueryCostNudge();
  } catch {
    // fail open — never trap a turn on a hook bug
    return ALLOW;
  }
}

emit(await settleHook(() => encode(hookAgent(), EVENT, main()), hookAgent));
