#!/usr/bin/env node
// observe.mts — Mulahazah PreToolUse/PostToolUse observation hook.
//
// Reads a Claude Code hook JSON payload from stdin and appends one rich-schema
// JSONL line to ~/.claude/instincts/<project-hash>/observations.jsonl. Drop-in
// replacement for the bash observe.sh fallback path: no jq dependency, captures
// `tool_input.command` for Bash and `Edit.file_path` for Edit/Write/Read so the
// downstream analysis pass can detect user corrections, error→fix sequences,
// and tool-argument bigrams the thin schema could not represent.
//
// Contract:
//   - Always exits 0. Never blocks the Claude session.
//   - Catches every error to stderr; never throws.
//   - Empty stdin / malformed JSON / missing tool_name → no-op exit 0.
//   - Hook budget: <500ms on Windows (per CONTRIBUTING.md).
//
// See docs/plans/2026-05-05-node-observer-rich-schema.md for the full design.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { parseHookPayload, summariseInput, summariseOutput } from "../lib/observe-event.mjs";

const ROTATION_LINE_THRESHOLD = 10_000;
const ARCHIVE_RETENTION = 10;

main();

function main(): void {
  try {
    runObserver();
  } catch (error) {
    // Never block the session. Failures land in stderr only.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[observe] ${message}\n`);
  }
  process.exit(0);
}

function runObserver(): void {
  const raw = readStdin();
  const payload = parseHookPayload(raw);
  if (!payload) return;

  const projectRoot = resolveProjectRoot();
  const projectHash = createHash("sha256").update(projectRoot).digest("hex").slice(0, 12);
  const projectName = basename(projectRoot.replace(/\.git$/, ""));

  const instinctsDir = join(getHomeDir(), ".claude", "instincts");
  const projectDir = join(instinctsDir, projectHash);
  const obsFile = join(projectDir, "observations.jsonl");

  ensureDir(projectDir);
  rotateIfNeeded(obsFile, projectDir);

  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const event = payload.tool_response !== undefined ? "tool_complete" : "tool_start";
  const row = {
    ts,
    event,
    session: payload.session_id,
    tool: payload.tool_name,
    input_summary: summariseInput(payload.tool_name, payload.tool_input),
    output_summary: summariseOutput(payload.tool_response),
    project_id: projectHash,
    project_name: projectName,
  };
  appendFileSync(obsFile, JSON.stringify(row) + "\n", "utf8");

  writeProjectJsonIfNew(projectDir, projectHash, projectName, projectRoot, ts);
}

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function getHomeDir(): string {
  // CLAUDE_PROJECT_DIR is the project root, not the home dir; HOME wins for
  // home-dir resolution. Fall through to USERPROFILE on Windows then os.homedir.
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

function resolveProjectRoot(): string {
  const fromEnv = process.env.CLAUDE_PROJECT_DIR;
  // The bash version trusts CLAUDE_PROJECT_DIR unconditionally when set;
  // preserve that semantic so test fixtures with synthetic /tmp/... paths
  // and operator workflows that pre-set the env var both keep working.
  if (fromEnv) return fromEnv;
  try {
    // execFileSync (not execSync) — no shell, fixed argv array, no injection
    // surface. Inputs are all hard-coded constants.
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (root) return root;
  } catch {
    // Not in a git repo — fall through.
  }
  return "global";
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function rotateIfNeeded(obsFile: string, projectDir: string): void {
  if (!existsSync(obsFile)) return;
  const lineCount = countLines(obsFile);
  if (lineCount < ROTATION_LINE_THRESHOLD) return;

  const archiveTs = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
  renameSync(obsFile, join(projectDir, `observations.${archiveTs}.jsonl`));
  pruneArchives(projectDir);
}

function countLines(file: string): number {
  const stat = statSync(file);
  if (stat.size === 0) return 0;
  // For files capped at 10k lines, readFileSync is faster than streaming.
  return readFileSync(file, "utf8").split("\n").length - 1;
}

function pruneArchives(projectDir: string): void {
  const archives = readdirSync(projectDir)
    .filter((name) => /^observations\..+\.jsonl$/.test(name))
    .sort()
    .reverse()
    .map((name) => join(projectDir, name));
  for (const path of archives.slice(ARCHIVE_RETENTION)) {
    try {
      unlinkSync(path);
    } catch {
      // Pruning failure is non-fatal; rotation already happened.
    }
  }
}

function writeProjectJsonIfNew(
  projectDir: string,
  projectHash: string,
  projectName: string,
  projectRoot: string,
  ts: string
): void {
  const projectJson = join(projectDir, "project.json");
  if (existsSync(projectJson)) return;
  const body = {
    id: projectHash,
    name: projectName,
    root: projectRoot,
    created_at: ts,
  };
  writeFileSync(projectJson, JSON.stringify(body) + "\n", "utf8");
}
