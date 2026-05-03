#!/usr/bin/env node
// three-section-close.mjs — Stop hook that requires every substantive
// assistant reply to close with three named sections:
//   "What has been done", "What is next", "Recommendation".
//
// Implements Law 4 + Law 5 in-band: verify before reporting, reflect at
// the end. See SKILL.md for the discipline rationale.
//
// Behavior:
//   - exit 0 to allow the response to stand
//   - emit {"decision":"block","reason":"..."} on stdout to re-prompt
//   - never block on internal failure (parse error, missing transcript,
//     unexpected message shape) — fail open
//
// Heuristic: skip messages shorter than 600 chars. Pure clarifying replies
// don't need the close; only substantive technical responses (work
// summaries, plan responses, post-execution reports) get gated.
//
// Telemetry: best-effort JSONL line per gated invocation written to
// ~/.claude/hook-telemetry/<project-hash>.jsonl. Never throws, never
// blocks the response. No network. No transcript content recorded.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { platform } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";

import { resolveHomeDir } from "../lib/resolve-home-dir.mjs";

const MIN_LENGTH_TO_GATE = 600;

const REQUIRED_SECTIONS = [
  {
    heading: "What has been done",
    hint: "concrete summary of changes/findings from this turn",
    pattern: /^#+ +What has been done(?:\s|$)/m,
  },
  {
    heading: "What is next",
    hint: "minimum 5 specific, actionable bullets",
    pattern: /^#+ +What is next(?:\s|$)/m,
  },
  {
    heading: "Recommendation",
    hint: "ranked descending by impact, or write \"no\" if there is no recommendation",
    pattern: /^#+ +Recommendation(?:\s|$)/m,
  },
];

function readStdinSync() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractLastAssistantText(transcriptPath) {
  const raw = readFileSync(transcriptPath, "utf8");
  const lines = raw.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    const obj = safeJsonParse(line);
    if (!obj || obj.type !== "assistant") continue;
    const blocks = obj.message?.content;
    if (!Array.isArray(blocks)) continue;
    const texts = blocks
      .filter((b) => b && b.type === "text" && typeof b.text === "string")
      .map((b) => b.text);
    if (texts.length === 0) continue;
    return texts.join("\n");
  }
  return null;
}

function emitBlock(missing) {
  const bullets = missing
    .map(
      (s) =>
        `- "## ${s.heading}" — ${s.hint}`,
    )
    .join("\n");
  const reason =
    `Your reply is missing the required 3-section close. Add these sections at the end of the reply with these exact headings:\n${bullets}`;
  process.stdout.write(JSON.stringify({ decision: "block", reason }) + "\n");
}

function projectHashFor(transcriptPath) {
  const dir = dirname(transcriptPath);
  let normalized = dir.split("\\").join("/");
  if (platform() === "win32") normalized = normalized.toLowerCase();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}

function recordTelemetry(entry, transcriptPath) {
  try {
    const home = resolveHomeDir();
    if (!home) return;
    const telemetryDir = join(home, ".claude", "hook-telemetry");
    try {
      mkdirSync(telemetryDir, { recursive: true });
    } catch {
      return;
    }
    const file = join(telemetryDir, `${projectHashFor(transcriptPath)}.jsonl`);
    try {
      appendFileSync(file, JSON.stringify(entry) + "\n", "utf8");
    } catch {
      return;
    }
  } catch {
    // belt-and-suspenders: telemetry must never throw
  }
}

function main() {
  // Per-operator opt-out. When CLAUDE_THREE_SECTION_CLOSE_DISABLED=1, the hook
  // short-circuits entirely: no enforcement, no telemetry. Public default is
  // unchanged (rule still fires for everyone else). See feedback memory
  // 2026-05-04 for rationale: an audit found 22,876 observations produced
  // only 2 graduated instincts, so visible end-of-turn reflection earns its
  // keep poorly enough that operators may want to run it as internal thinking.
  if (process.env.CLAUDE_THREE_SECTION_CLOSE_DISABLED === "1") return;
  const startedAt = performance.now();
  const stdin = readStdinSync();
  if (!stdin) return;

  const payload = safeJsonParse(stdin);
  if (!payload || typeof payload.transcript_path !== "string") return;
  if (!existsSync(payload.transcript_path)) return;

  let lastText;
  try {
    lastText = extractLastAssistantText(payload.transcript_path);
  } catch {
    return; // fail open on read error
  }
  if (!lastText) return;

  const textLength = lastText.length;
  let action;
  let missing = [];

  if (textLength < MIN_LENGTH_TO_GATE) {
    action = "skip-short";
  } else {
    missing = REQUIRED_SECTIONS.filter((s) => !s.pattern.test(lastText));
    if (missing.length === 0) {
      action = "pass";
    } else {
      action = "block";
      emitBlock(missing);
    }
  }

  const entry = {
    ts: new Date().toISOString(),
    hook: "three-section-close",
    action,
    textLength,
    missing: missing.map((s) => s.heading),
    durationMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
  };
  recordTelemetry(entry, payload.transcript_path);
}

try {
  main();
} catch {
  // fail open — never block the session due to a hook bug
}
