#!/usr/bin/env node
/**
 * Runtime PreToolUse enforcing-hook pack (v1).
 *
 * Stdin  : JSON { tool_name, tool_input: { command } }
 * Stdout : empty on allow / warn (warn prints to stderr); on block, the
 *          documented PreToolUse shape:
 *          { hookSpecificOutput: { hookEventName: "PreToolUse",
 *            permissionDecision: "deny", permissionDecisionReason } }
 *          A bare { decision: "allow" } is not schema-valid for PreToolUse.
 * Exit   : 0 always (decision is in stdout; fail-open on any error).
 *
 * Two gates over Bash git commands (pure logic in ../lib/hook-pack-gate.mjs):
 *   - push-to-main : a direct `git push` to main/master/release-*
 *   - commit-size  : a `git commit` staging more than COMMIT_FILE_LIMIT files
 *
 * Mode via CLAUDE_CI_HOOKPACK_GATE: "warn" (default) | "block" | "off".
 *   warn  : print a one-line notice to stderr; never blocks.
 *   block : emit the PreToolUse deny shape.
 *   off   : no-op.
 *
 * Only `git push` / `git commit` commands spawn a git subprocess; every other
 * Bash command and non-Bash tool returns immediately. No network. Fail-open.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  COMMIT_FILE_LIMIT,
  classifyCommand,
  decide,
  evaluateCommitSize,
  evaluatePush,
  parseMode,
  type HookPackDecision,
} from "../lib/hook-pack-gate.mjs";

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

function gitCurrentBranch(): string | null {
  try {
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return branch || null;
  } catch {
    return null;
  }
}

function gitStagedCount(): number {
  try {
    const out = execFileSync("git", ["diff", "--cached", "--name-only"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split(/\r?\n/).filter(Boolean).length;
  } catch {
    return 0;
  }
}

const ALLOW: HookPackDecision = { action: "allow", reason: "" };

function compute(): HookPackDecision {
  const mode = parseMode(process.env.CLAUDE_CI_HOOKPACK_GATE);
  if (mode === "off") return ALLOW;

  const payload = safeJsonParse(readStdinSync());
  if (!payload || typeof payload !== "object") return ALLOW;
  const obj = payload as { tool_name?: unknown; tool_input?: unknown };
  if (obj.tool_name !== "Bash") return ALLOW;

  const input = (obj.tool_input && typeof obj.tool_input === "object"
    ? (obj.tool_input as { command?: unknown })
    : {});
  const command = typeof input.command === "string" ? input.command : "";

  const kind = classifyCommand(command);
  if (kind === "push") {
    const res = evaluatePush(command, gitCurrentBranch());
    return decide(
      mode,
      res.gated,
      `Direct push to protected branch "${res.branch}" — open a feature branch + PR instead.`,
    );
  }
  if (kind === "commit") {
    const res = evaluateCommitSize(command, gitStagedCount());
    return decide(
      mode,
      res.gated,
      `This commit stages more than ${COMMIT_FILE_LIMIT} files — exceeds the one-concern limit. Split by layer, or set CLAUDE_CI_HOOKPACK_GATE=off for genuinely generated bulk.`,
    );
  }
  return ALLOW;
}

function main(): void {
  const decision = compute();
  if (decision.action === "block") {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: decision.reason,
        },
      }),
    );
  } else if (decision.action === "warn") {
    process.stderr.write(`[hook-pack] ${decision.reason}\n`);
  }
  process.exit(0);
}

main();
