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
// Other agents' payloads (lib/observe-event.mjs parseHookPayload) get rows in
// the same schema plus `agent` and, when the payload has one, `tool_use_id`;
// a call already in the log under the same session, call id and event is not
// written twice. Claude rows are unchanged.
//
// Contract:
//   - Always exits 0. Never blocks the Claude session.
//   - Catches every error to stderr; never throws.
//   - Empty stdin / malformed JSON / missing tool_name → no-op exit 0.
//   - Hook budget: <500ms on Windows (per CONTRIBUTING.md).
//
// See docs/plans/2026-05-05-node-observer-rich-schema.md for the full design.

import {
  appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

import { resolveInstinctsRoot, resolveProjectRoot } from "../lib/agent-paths.mjs";
import { canonicalizeProjectRoot, hashProjectRoot } from "../lib/gateguard-state.mjs";
import { selectAgent } from "../lib/hook-io.mjs";
import { parseHookPayload, summariseInput, summariseOutput } from "../lib/observe-event.mjs";

const ROTATION_LINE_THRESHOLD = 10_000;
const ARCHIVE_RETENTION = 10;
// How much of the log's end a duplicate is looked for in. A double fire (an
// agent that runs both the ~/.claude hooks and its native config) writes its
// two rows within one tool call, so they sit near the end; 256 KiB holds a few
// hundred rows (each summary is capped at 700 characters).
const DEDUPE_TAIL_BYTES = 256 * 1024;

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
  const object = parseObject(raw);
  // The same agent the hooks pick: the installer renders --agent <id>.
  const agent = selectAgent(process.argv.slice(2), process.env, object);
  const payload = parseHookPayload(raw, agent);
  if (!payload) return;

  const projectRoot = canonicalizeProjectRoot(resolveProjectRoot(object));
  const projectHash = hashProjectRoot(projectRoot);
  const projectName = basename(projectRoot.replace(/\.git$/, ""));

  const projectDir = join(resolveInstinctsRoot(), projectHash);
  const obsFile = join(projectDir, "observations.jsonl");

  ensureDir(projectDir);
  rotateIfNeeded(obsFile, projectDir);

  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const event = payload.complete ? "tool_complete" : "tool_start";
  if (isRecorded(obsFile, payload.session_id, payload.tool_use_id, event)) return;
  const row = {
    ts,
    event,
    session: payload.session_id,
    tool: payload.tool_name,
    input_summary: summariseInput(payload.tool_name, payload.tool_input),
    output_summary: summariseOutput(payload.tool_response),
    project_id: projectHash,
    project_name: projectName,
    // Only other agents' rows name the agent and the call id, so Claude rows
    // stay byte for byte what they were (owner decision: an optional field).
    ...(agent === "claude" ? {} : { agent, ...(payload.tool_use_id === "" ? {} : { tool_use_id: payload.tool_use_id }) }),
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

// A JSON text as a value, or null when it does not parse: the stdin object
// (for the agent and the payload's working directory) and the rows the
// duplicate check reads.
function parseObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Whether the log already holds this call: a row with the same session,
 * tool_use_id and event (owner decision: the observer dedupes on session and
 * tool_use_id; the event is in the key so a PreToolUse row does not swallow
 * the PostToolUse one). Needs both ids; only non-Claude rows carry the call id.
 */
function isRecorded(obsFile: string, session: string, toolUseId: string, event: string): boolean {
  if (session === "" || toolUseId === "" || !existsSync(obsFile)) return false;
  const size = statSync(obsFile).size;
  const start = Math.max(0, size - DEDUPE_TAIL_BYTES);
  const buffer = Buffer.alloc(size - start);
  const fd = openSync(obsFile, "r");
  try {
    readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    closeSync(fd);
  }
  const needle = `"tool_use_id":${JSON.stringify(toolUseId)}`;
  return buffer
    .toString("utf8")
    .split("\n")
    .some((line) => {
      if (!line.includes(needle)) return false;
      const row = parseObject(line) as { session?: unknown; event?: unknown; tool_use_id?: unknown } | null;
      return row !== null && row.session === session && row.event === event && row.tool_use_id === toolUseId;
    });
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
