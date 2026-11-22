#!/usr/bin/env node
/**
 * Runtime UserPromptSubmit prompt-router hook.
 *
 * Reads the user prompt, matches it against patterns in
 * hooks/route-table.json, and emits a single `<system-reminder>` recommending
 * the matched skill. When no row matches, the hook emits nothing — the prompt
 * passes through untouched.
 *
 * Stdin  : JSON { prompt, session_id?, transcript_path?, cwd? }
 * Stdout : JSON { hookSpecificOutput: { hookEventName: "UserPromptSubmit",
 *                                       additionalContext: string } }
 *          OR empty when there is no match.
 * Exit   : 0 always — routing decisions live in stdout, never in exit code.
 *
 * Opt-in: the hook emits nothing and writes no telemetry unless
 * CI_ROUTE_PROMPT is 1, on, true or yes (case-insensitive). Default off,
 * because the table matches single common words and a frontier model picks
 * skills without the hint.
 *
 * Opt-out: CI_ROUTE_PROMPT_DISABLE=1 (or `true`) still forces it off, even
 * when enabled. Set it in a project's `.claude/settings.json` `env` block when
 * that project routes plan / test / review prompts to its own skills.
 *
 * Fail-open: any unexpected error reading stdin / parsing the route table /
 * compiling a pattern → emit nothing and exit 0. The hook never blocks a
 * prompt on its own bugs.
 *
 * Telemetry: each match appends one JSONL line to
 * ~/.claude/instincts/<project-hash>/route-prompt.jsonl with the row index,
 * skill, and pattern. Telemetry failures never change the decision.
 *
 * Route table schema (hooks/route-table.json):
 *   {
 *     "rows": [
 *       { "pattern": "regex source", "flags": "i", "skill": "skill-name",
 *         "reason": "one-line description" }
 *     ]
 *   }
 * Rows are evaluated in order; first match wins.
 *
 * The hook is: read stdin, decide (the route table below), encode for the
 * agent (lib/hook-io.mjs).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveInstinctsRoot, resolveProjectRoot } from "../lib/agent-paths.mjs";
import { hashProjectRoot } from "../lib/gateguard-state.mjs";
import { emit, encode, hookAgent, parsePayload, readStdin, type Decision } from "../lib/hook-io.mjs";

const EVENT = "UserPromptSubmit";
const ALLOW: Decision = { kind: "allow" };

interface RouteRow {
  pattern: string;
  flags?: string;
  skill: string;
  reason?: string;
}

interface RouteTable {
  rows: RouteRow[];
}

interface Payload {
  prompt?: unknown;
}


const ENABLED_VALUES = new Set(["1", "on", "true", "yes"]);

function isRouterEnabled(): boolean {
  const value = (process.env.CI_ROUTE_PROMPT ?? "").trim().toLowerCase();
  return ENABLED_VALUES.has(value);
}

function isRouterDisabled(): boolean {
  const value = (process.env.CI_ROUTE_PROMPT_DISABLE ?? "").trim().toLowerCase();
  return value === "1" || value === "true";
}

function resolveHome(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? homedir();
}

function telemetryPath(home: string, payload: Payload): string {
  const hash = hashProjectRoot(resolveProjectRoot(payload));
  return join(resolveInstinctsRoot(home), hash, "route-prompt.jsonl");
}

interface TelemetryEvent {
  ts: string;
  hook: "route-prompt";
  matched: boolean;
  row_index?: number;
  skill?: string;
  pattern?: string;
}

function writeTelemetry(home: string, payload: Payload, event: TelemetryEvent): void {
  try {
    const path = telemetryPath(home, payload);
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(path, `${JSON.stringify(event)}\n`);
  } catch {
    // fail-open
  }
}

function loadRouteTable(): RouteTable | null {
  // Hook lives at <plugin-root>/hooks/route-prompt.mjs at runtime; the table
  // sits next to it. import.meta.url gives the file:// URL of the compiled
  // .mjs.
  try {
    const here = fileURLToPath(new URL(".", import.meta.url));
    const tablePath = join(here, "route-table.json");
    const raw = readFileSync(tablePath, "utf8");
    const parsed = JSON.parse(raw) as RouteTable;
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function findMatch(
  prompt: string,
  table: RouteTable,
): { row: RouteRow; index: number } | null {
  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    if (!row || typeof row.pattern !== "string" || typeof row.skill !== "string") {
      continue;
    }
    let rx: RegExp;
    try {
      rx = new RegExp(row.pattern, row.flags ?? "");
    } catch {
      continue;
    }
    if (rx.test(prompt)) {
      return { row, index: i };
    }
  }
  return null;
}

function buildContext(row: RouteRow): string {
  const reason = row.reason
    ? `${row.reason}\nConsider invoking \`/${row.skill}\` now.`
    : `Consider invoking \`/${row.skill}\` now.`;
  return `<system-reminder>\nPrompt-router suggestion: ${reason}\n</system-reminder>`;
}

function main(): Decision {
  if (!isRouterEnabled() || isRouterDisabled()) return ALLOW;
  const parsed = parsePayload(readStdin());
  if (!parsed.ok) return ALLOW;
  const payload = parsed.value as Payload;
  // JSON null stdin crashes here with exit 1 and a TypeError stack (golden
  // route-prompt/null-stdin), as it did before the move. Plan PR 9 ends it as
  // exit 0 and declares the change.
  const prompt = payload.prompt;
  if (typeof prompt !== "string" || prompt.length === 0) return ALLOW;
  const table = loadRouteTable();
  if (!table) return ALLOW;
  const match = findMatch(prompt, table);
  const home = resolveHome();
  if (!match) {
    writeTelemetry(home, payload, {
      ts: new Date().toISOString(),
      hook: "route-prompt",
      matched: false,
    });
    return ALLOW;
  }
  writeTelemetry(home, payload, {
    ts: new Date().toISOString(),
    hook: "route-prompt",
    matched: true,
    row_index: match.index,
    skill: match.row.skill,
    pattern: match.row.pattern,
  });
  return { kind: "context", text: buildContext(match.row) };
}

const decision = main();
emit(encode(hookAgent(), EVENT, decision));
