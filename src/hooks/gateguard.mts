#!/usr/bin/env node
/**
 * Runtime PreToolUse gateguard hook.
 *
 * Stdin  : JSON { tool_name, tool_input }
 * Stdout : JSON { decision: "allow" | "block", reason?: string }
 * Exit   : 0 always (decision is in stdout, fail-open on parse error).
 *
 * Three-stage gate per skills/gateguard.md:
 * - DENY  : first mutating tool call per file, with fact-list reason
 * - FORCE : agent presents facts (model-side; out of band)
 * - ALLOW : retry once `_gateguard_facts_presented: true` is set or the
 *           per-file marker is recorded in session state
 *
 * Read-only and exploratory tools (Read, Grep, Glob, routine Bash) bypass
 * unconditionally. Destructive Bash gates EVERY call, not just first.
 *
 * V1 honest limitations (see src/lib/gateguard-state.mts header):
 *   honor-system flag, state-file deletion, parallel-hook race.
 *
 * MultiEdit handling gates every edited file individually. The hook blocks
 * unless all edited paths are already cleared, or the agent presents facts
 * for the call and the hook records clearance for each edited path.
 * Block reasons now name the whole batch instead of just the first uncleared
 * path.
 */

import { readFileSync } from "node:fs";
import {
  MAX_CLEARED_FILES,
  isCapReached,
  loadState,
  markFileCleared,
  resolveSessionDir,
  saveState,
} from "../lib/gateguard-state.mjs";

type GateType = "allow" | "mutating-file" | "destructive-bash";

interface ToolInput {
  file_path?: unknown;
  command?: unknown;
  edits?: Array<{ file_path?: unknown }>;
  _gateguard_facts_presented?: unknown;
  [key: string]: unknown;
}

interface Payload {
  tool_name?: unknown;
  tool_input?: ToolInput;
}

interface Decision {
  decision: "allow" | "block";
  reason?: string;
}

const TOOL_ROUTE: Record<string, GateType> = {
  Read: "allow",
  Grep: "allow",
  Glob: "allow",
  LS: "allow",
  NotebookRead: "allow",
  Write: "mutating-file",
  Edit: "mutating-file",
  MultiEdit: "mutating-file",
  NotebookEdit: "mutating-file",
  Bash: "allow",
};

const DESTRUCTIVE_PATTERNS: readonly string[] = [
  "rm -rf",
  "rm -fr",
  "git reset --hard",
  "git push --force",
  "git push -f",
  "--force-with-lease",
  "git branch -D",
  "drop table",
  "drop database",
  "drop schema",
  "truncate ",
  "mkfs",
  "dd if=",
  "format ",
  "rmdir /s",
  "del /f /q",
  "del /q /f",
  "Remove-Item -Recurse",
  "Remove-Item -Force",
];

function isDestructiveBash(command: string): boolean {
  const lower = command.toLowerCase();
  return DESTRUCTIVE_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

function classifyTool(toolName: string, toolInput: ToolInput): GateType {
  const route = TOOL_ROUTE[toolName] ?? "allow";
  if (route !== "allow") return route;
  if (toolName === "Bash" && typeof toolInput.command === "string") {
    if (isDestructiveBash(toolInput.command)) return "destructive-bash";
  }
  return "allow";
}

function extractFilePaths(toolInput: ToolInput): string[] {
  if (typeof toolInput.file_path === "string") return [toolInput.file_path];
  if (Array.isArray(toolInput.edits) && toolInput.edits.length > 0) {
    return toolInput.edits
      .map((edit) => (edit && typeof edit.file_path === "string" ? edit.file_path : ""))
      .filter((filePath): filePath is string => filePath !== "");
  }
  if (typeof toolInput.command === "string") return [toolInput.command];
  return [];
}

function firstUnclearedFilePath(toolInput: ToolInput, clearedFiles: Record<string, { cleared_at: string }>): string {
  const filePaths = extractFilePaths(toolInput);
  const uncleared = filePaths.find((path) => !(path in clearedFiles));
  if (uncleared) return uncleared;
  if (filePaths.length > 0) return filePaths[0]!;
  return "";
}

function countDistinctNewFilePaths(
  filePaths: string[],
  clearedFiles: Record<string, { cleared_at: string }>,
): number {
  return new Set(filePaths.filter((path) => !(path in clearedFiles))).size;
}

function formatFileTarget(filePaths: string[]): string {
  const nonEmpty = filePaths.filter((path) => path !== "");
  if (nonEmpty.length === 0) return "<unknown>";
  if (nonEmpty.length === 1) return nonEmpty[0]!;
  return `${nonEmpty.length} files (${nonEmpty.join(", ")})`;
}

function buildMutatingFileReason(toolName: string, filePaths: string[]): string {
  const target = formatFileTarget(filePaths);
  return [
    `Before ${toolName === "Write" ? "creating" : "editing"} ${target}, present these facts:`,
    "",
    "  1. List ALL files that import/require this file (use Grep)",
    "  2. List the public functions/classes affected by this change",
    "  3. If this file reads/writes data files, show field names, structure, and date format",
    "  4. Quote the user's current instruction verbatim",
    "",
    "After presenting the facts, retry with `_gateguard_facts_presented: true` in tool_input,",
    "or with the same file_path after a previous clearance has been recorded for this session.",
  ].join("\n");
}

function buildDestructiveBashReason(command: string): string {
  return [
    `Destructive command requested: ${command}`,
    "",
    "  1. List ALL files/data this command will modify or delete",
    "  2. Write a one-line rollback procedure",
    "  3. Quote the user's current instruction verbatim",
    "",
    "Destructive Bash gates EVERY call — clearance is not cached.",
  ].join("\n");
}

function buildCapReachedReason(): string {
  return [
    `Gateguard session clearance cap reached (${MAX_CLEARED_FILES} distinct files).`,
    "Start a new Claude Code session to reset the gate. The cap exists to bound",
    "stuck-loop or rogue-agent clearance from compounding within a single session.",
  ].join("\n");
}

function emit(decision: Decision): void {
  process.stdout.write(`${JSON.stringify(decision)}\n`);
  process.exit(0);
}

function main(): void {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    emit({ decision: "allow" });
    return;
  }
  let payload: Payload;
  try {
    payload = JSON.parse(raw) as Payload;
  } catch {
    emit({ decision: "allow" }); // fail-open
    return;
  }
  const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "";
  const toolInput: ToolInput = payload.tool_input ?? {};
  const gate = classifyTool(toolName, toolInput);

  if (gate === "allow") {
    emit({ decision: "allow" });
    return;
  }

  if (gate === "destructive-bash") {
    const cmd = typeof toolInput.command === "string" ? toolInput.command : "";
    emit({ decision: "block", reason: buildDestructiveBashReason(cmd) });
    return;
  }

  // mutating-file
  const sessionDir = resolveSessionDir();
  const state = loadState(sessionDir);
  const filePaths = extractFilePaths(toolInput);
  const filePath = firstUnclearedFilePath(toolInput, state.cleared_files);
  const factsFlagged = toolInput._gateguard_facts_presented === true;
  const alreadyCleared = filePaths.length > 0 && filePaths.every((path) => path in state.cleared_files);
  const newFileCount = countDistinctNewFilePaths(filePaths, state.cleared_files);

  if (!factsFlagged && !alreadyCleared) {
    emit({ decision: "block", reason: buildMutatingFileReason(toolName, filePaths.length > 0 ? filePaths : [filePath]) });
    return;
  }

  if (factsFlagged && !alreadyCleared) {
    if (isCapReached(state) || Object.keys(state.cleared_files).length + newFileCount > MAX_CLEARED_FILES) {
      emit({ decision: "block", reason: buildCapReachedReason() });
      return;
    }
    let nextState = state;
    for (const path of filePaths) {
      nextState = markFileCleared(nextState, path);
    }
    if (filePaths.length > 0) saveState(sessionDir, nextState);
  }

  emit({ decision: "allow" });
}

main();
