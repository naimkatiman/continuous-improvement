#!/usr/bin/env node
// goal-drift-stop.mts — Stop hook that scores the turn's activity against the
// stated goal (task_plan.md ## Goal) and, when the session has DRIFTed on a
// substantive wrap-up, warns or (opt-in) blocks the close. This is the runtime
// arm of goal-monitor: it auto-fires the drift check at the Stop phase boundary
// instead of waiting for someone to run /goal-check.
//
// Mode via CLAUDE_GOAL_DRIFT_GATE: "warn" (default) | "block" | "off".
//   - warn  : print a one-line drift notice to stderr; never blocks.
//   - block : emit {"decision":"block","reason":...} to re-prompt.
//   - off   : no-op.
// The drift status is persisted to
// ~/.claude/instincts/<project-hash>/goal-drift-state.json every turn.
//
// Project-hash resolution is byte-identical to bin/observe.mts so this hook
// reads the SAME observations.jsonl the observer writes. Fail-open by
// construction: any error / missing goal / unreadable observations exits 0 and
// never blocks. No network. 5s hook budget.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { evaluateGoalDrift, type GoalDriftMode } from "../lib/goal-drift-gate.mjs";
import type { GoalObservation } from "../lib/goal-state.mjs";
import { resolveHomeDir } from "../lib/resolve-home-dir.mjs";

interface Payload {
  transcript_path?: string;
}

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

function resolveMode(): GoalDriftMode {
  const raw = (process.env.CLAUDE_GOAL_DRIFT_GATE ?? "warn").trim().toLowerCase();
  return raw === "block" || raw === "off" ? raw : "warn";
}

// Mirrors bin/observe.mts:resolveProjectRoot — the same basis the observer uses
// to bucket observations.jsonl, so the hash here resolves to the same file.
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
    // not a git repo
  }
  return "global";
}

function projectHash(root: string): string {
  return createHash("sha256").update(root).digest("hex").slice(0, 12);
}

function readGoalMarkdown(projectRoot: string, instinctsProjectDir: string): string {
  const candidates = [join(projectRoot, "task_plan.md"), join(instinctsProjectDir, "goal.md")];
  for (const file of candidates) {
    try {
      if (existsSync(file)) return readFileSync(file, "utf8");
    } catch {
      // try the next candidate
    }
  }
  return "";
}

function readObservations(instinctsProjectDir: string): GoalObservation[] {
  const file = join(instinctsProjectDir, "observations.jsonl");
  try {
    if (!existsSync(file)) return [];
    const lines = readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0);
    const out: GoalObservation[] = [];
    for (const line of lines.slice(-100)) {
      const row = safeJsonParse(line) as Record<string, unknown> | null;
      if (!row) continue;
      out.push({
        ts: typeof row.ts === "string" ? row.ts : "",
        tool: typeof row.tool === "string" ? row.tool : "",
        input_summary: typeof row.input_summary === "string" ? row.input_summary : "",
        output_summary: typeof row.output_summary === "string" ? row.output_summary : "",
      });
    }
    return out;
  } catch {
    return [];
  }
}

function lastAssistantTextLength(transcriptPath: string): number {
  try {
    const lines = readFileSync(transcriptPath, "utf8").split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim();
      if (!line) continue;
      const obj = safeJsonParse(line) as Record<string, unknown> | null;
      if (!obj || obj.type !== "assistant") continue;
      const blocks = (obj.message as Record<string, unknown> | undefined)?.content;
      if (!Array.isArray(blocks)) continue;
      const text = blocks
        .filter(
          (b: unknown) =>
            b &&
            typeof b === "object" &&
            (b as Record<string, unknown>).type === "text" &&
            typeof (b as Record<string, unknown>).text === "string",
        )
        .map((b: unknown) => (b as Record<string, unknown>).text as string)
        .join("\n");
      if (text.length === 0) continue;
      return text.length;
    }
  } catch {
    // fall through to 0
  }
  return 0;
}

function persistState(
  instinctsProjectDir: string,
  state: { status: string; score: number; action: string },
): void {
  try {
    mkdirSync(instinctsProjectDir, { recursive: true });
    writeFileSync(
      join(instinctsProjectDir, "goal-drift-state.json"),
      JSON.stringify({ ts: new Date().toISOString(), ...state }) + "\n",
      "utf8",
    );
  } catch {
    // state persistence is best-effort; never throw
  }
}

function main(): void {
  const mode = resolveMode();
  if (mode === "off") return;

  const stdin = readStdinSync();
  if (!stdin) return;
  const payload = safeJsonParse(stdin) as Payload | null;
  if (!payload) return;

  const home = resolveHomeDir();
  if (!home) return;
  const projectRoot = resolveProjectRoot();
  const instinctsProjectDir = join(home, ".claude", "instincts", projectHash(projectRoot));

  const goalMarkdown = readGoalMarkdown(projectRoot, instinctsProjectDir);
  const observations = readObservations(instinctsProjectDir);
  const textLength =
    payload.transcript_path && existsSync(payload.transcript_path)
      ? lastAssistantTextLength(payload.transcript_path)
      : 0;

  const decision = evaluateGoalDrift({ goalMarkdown, observations, textLength, mode });
  persistState(instinctsProjectDir, {
    status: decision.status,
    score: decision.score,
    action: decision.action,
  });

  if (decision.action === "block") {
    process.stdout.write(JSON.stringify({ decision: "block", reason: decision.reason }) + "\n");
  } else if (decision.action === "warn") {
    process.stderr.write(`[continuous-improvement] goal-drift: ${decision.reason}\n`);
  }
}

try {
  main();
} catch {
  // fail open — never block the session due to a hook bug
}
