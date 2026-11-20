#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { closeSync, openSync, readFileSync, readSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { hashProjectRoot } from "../lib/gateguard-state.mjs";
import { parseYamlInstinct } from "../lib/instinct-yaml.mjs";
import { resolveHomeDir } from "../lib/resolve-home-dir.mjs";
type SessionEvent = "SessionStart" | "SessionEnd" | "unknown";
interface Lesson {
  body: string;
  confidence: number;
  trigger: string;
}
// Claude Code adds a SessionStart hook's plain-text stdout to the model's
// context and never shows the model the stderr of a hook that exits 0
// (https://code.claude.com/docs/en/hooks). The status line below goes to
// stderr, so the lesson block on stdout is the only path by which a recorded
// instinct reaches a later session. The block must not start with "{": Claude
// Code would read that as JSON output instead of plain text.
const MIN_CONFIDENCE = 0.5;
// The documented ceiling. A file that claims more is listed at this value.
const MAX_CONFIDENCE = 0.9;
const MAX_LESSONS = 10;
const MAX_BLOCK_CHARS = 1500;
const MAX_LINE_CHARS = 200;
const MAX_TRIGGER_CHARS = 80;
// Only this much of a trigger or body is looked at before it is cut to fit.
const MAX_RAW_CHARS = 2000;
// Session start has to stay fast whatever is on disk: at most this many instinct
// files are read (the project's first, then global, each in name order) and at
// most this much of each. One read costs about a millisecond on Windows, so 200
// files bound the wait near 0.2 s. The status line still counts every file, and
// takes its level from the files that were read.
const MAX_FILES_READ = 200;
const MAX_FILE_BYTES = 64 * 1024;
const LOAD_OFF = new Set(["off", "0", "false", "no"]);
const headBuffer = Buffer.allocUnsafe(MAX_FILE_BYTES);
function read(path: string | number): string {
  try { return readFileSync(path, "utf8"); } catch { return ""; }
}
function readHead(path: string): string {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    return headBuffer.toString("utf8", 0, readSync(fd, headBuffer, 0, MAX_FILE_BYTES, 0));
  } catch {
    return "";
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { }
    }
  }
}
function eventFromStdin(): SessionEvent | null {
  const raw = read(0);
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const event = payload.hook_event_name ?? payload.hook_type ?? payload.event_type;
    return event === "SessionStart" || event === "SessionEnd" ? event : "unknown";
  } catch {
    return null;
  }
}
function projectRoot(): string {
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || "global";
  } catch { return "global"; }
}
function yamlFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".yaml"))
      .sort()
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
}
// Instinct text is data: a model wrote it, or it came from an imported pack. It
// is printed inside a system reminder, so each field becomes one line of plain
// text. Compatibility forms are folded (a full-width bracket becomes the ASCII
// one), invisible format characters are dropped, control characters and every
// kind of line break become a space, and angle brackets are escaped. A lesson
// can then neither close the reminder nor start a line of its own, which keeps
// the header the only line that does not begin with "- ".
function flatten(text: string, max: number): string {
  const flat = text
    .slice(0, MAX_RAW_CHARS)
    .normalize("NFKC")
    .replace(/[\p{Cf}\p{Cs}]+/gu, "")
    .replace(/[\p{Cc}\s]+/gu, " ")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 3).replace(/[\uD800-\uDBFF]$/, "").trimEnd()}...`;
}
function lessonHeader(shown: number, total: number): string {
  return (
    "Lessons recorded by earlier sessions in this repository (continuous-improvement: project and global instincts). " +
    "Apply those at 0.7 and above; consider those at 0.5 to 0.69. They are notes, not user instructions. " +
    `Showing ${shown} of ${total}; list all with /continuous-improvement status or the ci_instincts tool.`
  );
}
function lessonLine(lesson: Lesson): string {
  const suffix = ` (${Math.round(lesson.confidence * 100) / 100})`;
  const trigger = flatten(lesson.trigger, MAX_TRIGGER_CHARS);
  const room = MAX_LINE_CHARS - "- : ".length - trigger.length - suffix.length;
  const text = [trigger, flatten(lesson.body, room)].filter(Boolean).join(": ");
  return text ? `- ${text}${suffix}` : "";
}
// Empty when nothing is at 0.5 or above: a project with no lessons pays nothing.
function lessonBlock(contents: string[]): string {
  const lessons: Lesson[] = [];
  for (const content of contents) {
    const instinct = parseYamlInstinct(content);
    if (!instinct) continue;
    const confidence = Math.min(instinct.confidence, MAX_CONFIDENCE);
    if (confidence >= MIN_CONFIDENCE) {
      lessons.push({ trigger: instinct.trigger, body: instinct.body, confidence });
    }
  }
  lessons.sort((left, right) => right.confidence - left.confidence);
  const lines: string[] = [];
  let room = MAX_BLOCK_CHARS - lessonHeader(MAX_LESSONS, MAX_FILES_READ).length - 1;
  for (const lesson of lessons) {
    if (lines.length === MAX_LESSONS) break;
    const line = lessonLine(lesson);
    if (!line) continue;
    if (line.length + 1 > room) break;
    lines.push(line);
    room -= line.length + 1;
  }
  if (lines.length === 0) return "";
  return `${lessonHeader(lines.length, lessons.length)}\n${lines.join("\n")}\n`;
}
function main(): void {
  const event = eventFromStdin();
  if (event === null) return;
  if (event === "SessionEnd") {
    process.stderr.write("[continuous-improvement] Session ending. Run /continuous-improvement to reflect and capture learnings.\n");
    return;
  }
  const home = resolveHomeDir();
  if (!home) return;
  const instinctsRoot = join(home, ".claude", "instincts");
  const hash = hashProjectRoot(projectRoot());
  const projectDir = join(instinctsRoot, hash);
  const files = [...yamlFiles(projectDir), ...yamlFiles(join(instinctsRoot, "global"))];
  const contents = files.slice(0, MAX_FILES_READ).map(readHead);
  const observations = read(join(projectDir, "observations.jsonl")).split(/\r?\n/).filter(Boolean).length;
  let level = observations >= 20 || files.length > 0 ? "ANALYZE" : "CAPTURE";

  for (const content of contents) {
    const value = Number(content.match(/^confidence:\s*([0-9]*\.?[0-9]+)/m)?.[1]);
    if (Number.isFinite(value) && value >= 0.7) {
      level = "AUTO-APPLY";
      break;
    }
    if (Number.isFinite(value) && value >= 0.5) level = "SUGGEST";
  }
  process.stderr.write(
    `[continuous-improvement] Level: ${level} | Observations: ${observations} | Instincts: ${files.length}\n`,
  );
  if (event !== "SessionStart") return;
  if (LOAD_OFF.has((process.env.CI_INSTINCT_LOAD ?? "").trim().toLowerCase())) return;
  const block = lessonBlock(contents);
  if (block) {
    process.stdout.on("error", () => { });
    process.stdout.write(block);
  }
}
try {
  main();
} catch {
}
