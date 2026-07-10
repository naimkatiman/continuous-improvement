#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveHomeDir } from "../lib/resolve-home-dir.mjs";
type SessionEvent = "SessionStart" | "SessionEnd" | "unknown";
function read(path: string | number): string {
  try { return readFileSync(path, "utf8"); } catch { return ""; }
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
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
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
  const hash = createHash("sha256").update(projectRoot()).digest("hex").slice(0, 12);
  const projectDir = join(instinctsRoot, hash);
  const files = [...yamlFiles(projectDir), ...yamlFiles(join(instinctsRoot, "global"))];
  const observations = read(join(projectDir, "observations.jsonl")).split(/\r?\n/).filter(Boolean).length;
  let level = observations >= 20 || files.length > 0 ? "ANALYZE" : "CAPTURE";

  for (const file of files) {
    const value = Number(read(file).match(/^confidence:\s*([0-9]*\.?[0-9]+)/m)?.[1]);
    if (Number.isFinite(value) && value >= 0.7) {
      level = "AUTO-APPLY";
      break;
    }
    if (Number.isFinite(value) && value >= 0.5) level = "SUGGEST";
  }
  process.stderr.write(
    `[continuous-improvement] Level: ${level} | Observations: ${observations} | Instincts: ${files.length}\n`,
  );
}
try {
  main();
} catch {
}
