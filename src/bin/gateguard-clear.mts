#!/usr/bin/env node
/**
 * gateguard-clear — record GateGuard clearance for files from the Bash route.
 *
 * The GateGuard PreToolUse hook blocks the first Edit/Write per file and prints
 * the session-state path in its block reason. After presenting the required
 * facts, run this to clear the gate so the retry is allowed. Bash is not gated
 * (unless the command is destructive), so this surface always works — including
 * where the ci_gateguard_clear MCP tool is not connected.
 *
 * Usage:
 *   node bin/gateguard-clear.mjs <file_path> [<file_path>...] [--state <path>]
 *
 * Default resolves the session dir canonically, the same way the hook does.
 * --state <path> writes that exact gateguard-session.json — the path the block
 * reason prints — bypassing resolution for any residual env mismatch.
 */

import { dirname, join } from "node:path";

import {
  MAX_CLEARED_FILES,
  clearFiles,
  resolveSessionDir,
} from "../lib/gateguard-state.mjs";

function main(): void {
  const argv = process.argv.slice(2);
  const files: string[] = [];
  let stateFile = "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--state") {
      stateFile = argv[i + 1] ?? "";
      i += 1;
    } else {
      files.push(arg);
    }
  }

  if (files.length === 0) {
    process.stderr.write(
      "usage: gateguard-clear <file_path> [<file_path>...] [--state <gateguard-session.json>]\n",
    );
    process.exit(2);
  }

  // clearFiles writes <sessionDir>/gateguard-session.json. With --state the
  // caller hands us the full state-file path the block reason printed, so the
  // session dir is its parent.
  const sessionDir = stateFile ? dirname(stateFile) : resolveSessionDir();
  const { cleared, skippedForCap } = clearFiles(sessionDir, files);

  process.stdout.write(
    `Cleared ${cleared.length}: ${cleared.length > 0 ? cleared.join(", ") : "(none — already cleared)"}\n`,
  );
  if (skippedForCap.length > 0) {
    process.stdout.write(
      `Skipped — session cap of ${MAX_CLEARED_FILES} reached: ${skippedForCap.join(", ")}\n`,
    );
  }
  process.stdout.write(`State: ${join(sessionDir, "gateguard-session.json")}\n`);
}

main();
