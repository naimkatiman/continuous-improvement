#!/usr/bin/env node
/**
 * Runtime UserPromptSubmit recall-briefing hook (opt-in amplifier).
 *
 * On the first substantive prompt of a session, searches this project's past
 * observations (BM25, via recall-index.mts) and injects a one-time
 * `<system-reminder>` listing the most relevant prior activity — so the agent
 * reuses a past fix instead of re-deriving it. This makes episodic memory
 * proactive instead of opt-in-per-query (the ci_recall MCP tool stays available
 * for explicit, deeper searches).
 *
 * Opt-in: runs only when CLAUDE_RECALL_BRIEFING is 1/on/true. Default off, so it
 * never changes the prompt path for users who have not enabled it.
 *
 * Stdin  : JSON { prompt, session_id?, cwd? }
 * Stdout : JSON { hookSpecificOutput: { hookEventName: "UserPromptSubmit",
 *                                       additionalContext: string } }
 *          OR empty when it should not brief.
 * Exit   : 0 always — this is an amplifier, never a gate; it cannot block a prompt.
 *
 * Fail-open: any error (no env flag, bad stdin, missing/short observations log,
 * unreadable state) emits nothing and exits 0. State at
 * ~/.claude/instincts/<project-hash>/recall-briefing-session.json records which
 * session_ids have been briefed so each session is briefed at most once.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

import { buildIndex, query, type RecallObservation } from "../lib/recall-index.mjs";
import { DEFAULT_MAX_HITS, decideBriefing } from "../lib/recall-briefing.mjs";

interface Payload {
  prompt?: unknown;
  session_id?: unknown;
}

interface SessionState {
  briefed: Record<string, string>;
}

const ENABLED_VALUES = new Set(["1", "on", "true", "yes"]);
const MAX_BRIEFED_KEYS = 1000;

function isEnabled(): boolean {
  const flag = (process.env.CLAUDE_RECALL_BRIEFING ?? "").trim().toLowerCase();
  return ENABLED_VALUES.has(flag);
}

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function resolveHome(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? homedir();
}

function resolveProjectRoot(): string {
  const fromEnv = process.env.CLAUDE_PROJECT_DIR;
  if (fromEnv) return fromEnv;
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (root) return root;
  } catch {
    // not in a git repo
  }
  return "global";
}

function instinctsDir(home: string): string {
  const hash = createHash("sha256").update(resolveProjectRoot()).digest("hex").slice(0, 12);
  return join(home, ".claude", "instincts", hash);
}

function readObservations(dir: string): RecallObservation[] {
  const path = join(dir, "observations.jsonl");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const rows: RecallObservation[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed) as RecallObservation);
    } catch {
      // skip a malformed line; never let one bad row sink the briefing
    }
  }
  return rows;
}

function readState(dir: string): SessionState {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, "recall-briefing-session.json"), "utf8")) as SessionState;
    if (parsed && typeof parsed.briefed === "object" && parsed.briefed !== null) return parsed;
  } catch {
    // missing or malformed → fresh state
  }
  return { briefed: {} };
}

function writeState(dir: string, state: SessionState, sessionKey: string): void {
  try {
    const keys = Object.keys(state.briefed);
    // Bound growth: if the map is huge, keep only the most recent run plus this one.
    const briefed = keys.length >= MAX_BRIEFED_KEYS ? {} : state.briefed;
    briefed[sessionKey] = new Date().toISOString();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "recall-briefing-session.json"), `${JSON.stringify({ briefed }, null, 2)}\n`);
  } catch {
    // fail-open: a missed state write at worst briefs twice; it never blocks
  }
}

function emit(additionalContext: string | null): void {
  if (additionalContext !== null) {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext },
      })}\n`,
    );
  }
  process.exit(0);
}

function main(): void {
  if (!isEnabled()) {
    emit(null);
    return;
  }

  let payload: Payload;
  try {
    payload = JSON.parse(readStdin()) as Payload;
  } catch {
    emit(null);
    return;
  }
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  if (prompt.length === 0) {
    emit(null);
    return;
  }
  const sessionKey = typeof payload.session_id === "string" && payload.session_id ? payload.session_id : "no-session";

  const home = resolveHome();
  const dir = instinctsDir(home);
  const state = readState(dir);
  const alreadyBriefed = Object.prototype.hasOwnProperty.call(state.briefed, sessionKey);

  const observations = readObservations(dir);
  const index = buildIndex(observations);
  const hits = query(index, prompt, { k: DEFAULT_MAX_HITS });

  const decision = decideBriefing({ enabled: true, alreadyBriefed, prompt, hits });
  if (!decision.shouldBrief || decision.reminder === null) {
    emit(null);
    return;
  }

  writeState(dir, state, sessionKey);
  emit(decision.reminder);
}

try {
  main();
} catch {
  // Absolute fail-open backstop: never let a hook bug block a prompt.
  process.exit(0);
}
