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
 * Two gates over shell git commands, from the Bash tool or the PowerShell tool
 * (pure logic in ../lib/hook-pack-gate.mjs):
 *   - push-to-main : a direct `git push` to main/master/release-*
 *   - commit-size  : a `git commit` staging more than COMMIT_FILE_LIMIT files
 *
 * Mode via CLAUDE_CI_HOOKPACK_GATE: "warn" (default) | "block" | "off".
 *   warn  : print a one-line notice to stderr; never blocks.
 *   block : emit the PreToolUse deny shape.
 *   off   : no-op.
 *
 * Only a `git commit`, and a `git push` that names no branch of its own, spawn
 * a git subprocess; every other shell command and non-shell tool returns
 * immediately. No network. Fail-open.
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

// Ask git about the repository a command runs in: `dirs` are the values of the
// command's own `-C <dir>` options, so `git -C ../wt push` is judged by the
// branch checked out in ../wt, not by the one the hook was started in. Null on
// any failure, a directory that is a shell variable included.
function gitIn(dirs: readonly string[], args: readonly string[]): string | null {
  try {
    return execFileSync("git", [...dirs.flatMap((dir) => ["-C", dir]), ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function gitCurrentBranch(dirs: readonly string[]): string | null {
  return gitIn(dirs, ["rev-parse", "--abbrev-ref", "HEAD"])?.trim() || null;
}

function gitStagedCount(dirs: readonly string[]): number {
  const out = gitIn(dirs, ["diff", "--cached", "--name-only"]);
  return out === null ? 0 : out.split(/\r?\n/).filter(Boolean).length;
}

const ALLOW: HookPackDecision = { action: "allow", reason: "" };

// The tools whose input is a shell command. Claude Code on Windows exposes a
// first-class PowerShell tool with the same { command } input as Bash; a
// `git push` to main is the same push through either.
const SHELL_TOOLS: ReadonlySet<string> = new Set(["Bash", "PowerShell"]);

function compute(): HookPackDecision {
  const mode = parseMode(process.env.CLAUDE_CI_HOOKPACK_GATE);
  if (mode === "off") return ALLOW;

  const payload = safeJsonParse(readStdinSync());
  if (!payload || typeof payload !== "object") return ALLOW;
  const obj = payload as { tool_name?: unknown; tool_input?: unknown };
  if (typeof obj.tool_name !== "string" || !SHELL_TOOLS.has(obj.tool_name)) return ALLOW;

  const input = (obj.tool_input && typeof obj.tool_input === "object"
    ? (obj.tool_input as { command?: unknown })
    : {});
  const command = typeof input.command === "string" ? input.command : "";

  const tool = obj.tool_name;
  const kind = classifyCommand(command, tool);
  if (kind === "push") {
    const res = evaluatePush(command, gitCurrentBranch, tool);
    return decide(
      mode,
      res.gated,
      `Direct push to protected branch "${res.branch}" — open a feature branch + PR instead.`,
    );
  }
  if (kind === "commit") {
    const res = evaluateCommitSize(command, gitStagedCount, tool);
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
