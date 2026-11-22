#!/usr/bin/env node
// three-section-close.mts — Stop hook that requires every substantive
// assistant reply to close with three named sections:
//   "What has been done", "What is next", "Recommendation".
//
// Implements Law 4 + Law 5 in-band: verify before reporting, reflect at
// the end. See SKILL.md for the discipline rationale.
//
// Opt-in: runs only when CLAUDE_THREE_SECTION_CLOSE (alias CI_THREE_SECTION_CLOSE) is 1/on/true/yes
// (case-insensitive). Default off, because the close is one reply format and
// not a rule every install should pay for. CLAUDE_THREE_SECTION_CLOSE_DISABLED=1
// (alias CI_THREE_SECTION_CLOSE_DISABLED=1) still forces it off, even when enabled.
//
// Behavior:
//   - exit 0 to allow the response to stand
//   - allow when the payload carries stop_hook_active: true, so a re-prompted
//     reply is never re-prompted again
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
//
// The hook is: read stdin, decide (the section check below), encode for the
// agent (lib/hook-io.mjs).

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { platform } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";

import { readKnob } from "../lib/agent-env.mjs";
import { emit, encode, readStdin, type AgentId, type Decision } from "../lib/hook-io.mjs";
import { resolveHomeDir } from "../lib/resolve-home-dir.mjs";

const AGENT: AgentId = "claude";
const EVENT = "Stop";
const ALLOW: Decision = { kind: "allow" };

const MIN_LENGTH_TO_GATE = 600;

const ENABLED_VALUES = new Set(["1", "on", "true", "yes"]);

function isEnabled(): boolean {
  const flag = (readKnob("CLAUDE_THREE_SECTION_CLOSE") ?? "").trim().toLowerCase();
  return ENABLED_VALUES.has(flag);
}

interface Section {
  heading: string;
  hint: string;
  pattern: RegExp;
}

const REQUIRED_SECTIONS: Section[] = [
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

interface Payload {
  transcript_path: string;
  stop_hook_active?: boolean;
}

interface TelemetryEntry {
  ts: string;
  hook: string;
  action: string;
  textLength: number;
  missing: string[];
  durationMs: number;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractLastAssistantText(transcriptPath: string): string | null {
  const raw = readFileSync(transcriptPath, "utf8");
  const lines = raw.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    const obj = safeJsonParse(line) as Record<string, unknown> | null;
    if (!obj || obj.type !== "assistant") continue;
    const blocks = (obj.message as Record<string, unknown> | undefined)?.content;
    if (!Array.isArray(blocks)) continue;
    const texts = blocks
      .filter(
        (b: unknown) =>
          b &&
          typeof b === "object" &&
          (b as Record<string, unknown>).type === "text" &&
          typeof (b as Record<string, unknown>).text === "string",
      )
      .map((b: unknown) => (b as Record<string, unknown>).text as string);
    if (texts.length === 0) continue;
    return texts.join("\n");
  }
  return null;
}

function blockReason(missing: Section[]): string {
  const bullets = missing
    .map((s) => `- "## ${s.heading}" — ${s.hint}`)
    .join("\n");
  return `Your reply is missing the required 3-section close. Add these sections at the end of the reply with these exact headings:\n${bullets}`;
}

function projectHashFor(transcriptPath: string): string {
  const dir = dirname(transcriptPath);
  let normalized = dir.split("\\").join("/");
  if (platform() === "win32") normalized = normalized.toLowerCase();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}

function recordTelemetry(entry: TelemetryEntry, transcriptPath: string): void {
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

function decideThreeSectionClose(): Decision {
  // Opt-in, and the older opt-out still wins: with either switch off the hook
  // short-circuits entirely, with no enforcement and no telemetry.
  if (!isEnabled()) return ALLOW;
  if (readKnob("CLAUDE_THREE_SECTION_CLOSE_DISABLED") === "1") return ALLOW;
  const startedAt = performance.now();
  const stdin = readStdin();
  if (!stdin) return ALLOW;

  const payload = safeJsonParse(stdin) as Payload | null;
  if (!payload || typeof payload.transcript_path !== "string") return ALLOW;
  // A Stop hook already continued this turn; blocking again could loop.
  if (payload.stop_hook_active === true) return ALLOW;
  if (!existsSync(payload.transcript_path)) return ALLOW;

  let lastText: string | null;
  try {
    lastText = extractLastAssistantText(payload.transcript_path);
  } catch {
    return ALLOW; // fail open on read error
  }
  if (!lastText) return ALLOW;

  const textLength = lastText.length;
  let action: string;
  let missing: Section[] = [];
  let decision: Decision = ALLOW;

  if (textLength < MIN_LENGTH_TO_GATE) {
    action = "skip-short";
  } else {
    missing = REQUIRED_SECTIONS.filter((s) => !s.pattern.test(lastText));
    if (missing.length === 0) {
      action = "pass";
    } else {
      action = "block";
      decision = { kind: "continue", reason: blockReason(missing) };
    }
  }

  const entry: TelemetryEntry = {
    ts: new Date().toISOString(),
    hook: "three-section-close",
    action,
    textLength,
    missing: missing.map((s) => s.heading),
    durationMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
  };
  recordTelemetry(entry, payload.transcript_path);
  return decision;
}

function main(): Decision {
  try {
    return decideThreeSectionClose();
  } catch {
    // fail open — never block the session due to a hook bug
    return ALLOW;
  }
}

emit(encode(AGENT, EVENT, main()));
