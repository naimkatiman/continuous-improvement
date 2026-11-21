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
 * Mode via CLAUDE_CI_HOOKPACK_GATE (alias CI_HOOKPACK_GATE): "warn" (default) | "block" | "off".
 *   warn  : print a one-line notice to stderr; never blocks.
 *   block : emit the PreToolUse deny shape.
 *   off   : no-op.
 *
 * A push that names no branch pushes the branch checked out where it runs:
 * the directory a `cd` or `git -C` on the command line names, and the branch a
 * `git checkout` or `git switch` before it left there. Where either cannot be
 * read the push is allowed.
 *
 * Only a `git commit`, and a `git push` that names no branch of its own, spawn
 * a git subprocess; every other shell command and non-shell tool returns
 * immediately. No network. Fail-open.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

import { readKnob } from "../lib/agent-env.mjs";
import { classifierShells, inboundCommand, resolveInboundTool } from "../lib/agent-profiles.mjs";
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

// A directory as the command line wrote it, as a value `git -C` can enter. `~`
// is the home directory. Git Bash writes a drive as /d/repo; git.exe started
// from here, outside that shell, needs D:/repo. Anything else is passed as it
// is: a relative path resolves against the directory the hook runs in.
function directory(dir: string, tool: string): string {
  if (dir === "~" || /^~[\\/]/.test(dir)) return homedir() + dir.slice(1);
  if (process.platform === "win32" && tool !== "PowerShell") {
    const drive = /^\/([A-Za-z])(?:\/(.*))?$/s.exec(dir);
    if (drive) return `${drive[1]}:/${drive[2] ?? ""}`;
  }
  return dir;
}

// Ask git about the repository a command runs in. `dirs` are the directories
// the command line enters before the command: the targets of its `cd` commands
// and the command's own `-C <dir>` values. So `cd ../wt && git push` and `git
// -C ../wt push` are judged by the branch checked out in ../wt, not by the one
// the hook was started in. Null on any failure, a directory that is a shell
// variable or does not exist yet included.
function gitIn(dirs: readonly string[], tool: string, args: readonly string[]): string | null {
  try {
    return execFileSync("git", [...dirs.flatMap((dir) => ["-C", directory(dir, tool)]), ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

// The branch a push from `dirs` pushes. `switchedTo` is the word an earlier
// `git checkout <word>` on the line gave: when it names a branch there (a local
// one, or a remote-tracking one the checkout starts a branch from) the push
// pushes that branch; when it is a path the checked-out branch stands.
function gitCurrentBranch(dirs: readonly string[], tool: string, switchedTo?: string): string | null {
  if (switchedTo !== undefined) {
    const refs = gitIn(dirs, tool, [
      "for-each-ref",
      "--count=1",
      "--format=%(refname)",
      `refs/heads/${switchedTo}`,
      `refs/remotes/*/${switchedTo}`,
    ]);
    if (refs !== null && refs.trim() !== "") return switchedTo;
  }
  return gitIn(dirs, tool, ["rev-parse", "--abbrev-ref", "HEAD"])?.trim() || null;
}

function gitStagedCount(dirs: readonly string[], tool: string): number {
  const out = gitIn(dirs, tool, ["diff", "--cached", "--name-only"]);
  return out === null ? 0 : out.split(/\r?\n/).filter(Boolean).length;
}

const ALLOW: HookPackDecision = { action: "allow", reason: "" };

// The tools whose input is a shell command. Claude Code on Windows exposes a
// first-class PowerShell tool with the same { command } input as Bash, and the
// Monitor tool runs its { command } in the same shell as Bash; a `git push` to
// main is the same push through any of them. A Monitor call in its { ws } form
// has no command and is allowed.
const SHELL_TOOLS: ReadonlySet<string> = new Set(["Bash", "PowerShell", "Monitor"]);

function compute(): HookPackDecision {
  const mode = parseMode(readKnob("CLAUDE_CI_HOOKPACK_GATE"));
  if (mode === "off") return ALLOW;

  const payload = safeJsonParse(readStdinSync());
  if (!payload || typeof payload !== "object") return ALLOW;
  const obj = payload as { tool_name?: unknown; tool_input?: unknown };
  if (typeof obj.tool_name !== "string") return ALLOW;

  const input = (obj.tool_input && typeof obj.tool_input === "object"
    ? (obj.tool_input as { command?: unknown })
    : {});
  if (SHELL_TOOLS.has(obj.tool_name)) {
    return gateCommand(mode, typeof input.command === "string" ? input.command : "", obj.tool_name);
  }

  // Another agent's shell (lib/agent-profiles.mjs, never a Claude Code name):
  // read in its flavor, and both ways on Windows when the flavor is unknown.
  // The first reading that gates decides.
  const alias = resolveInboundTool(obj.tool_name);
  const command = alias === null ? null : inboundCommand(alias, input);
  if (alias === null || command === null) return ALLOW;
  for (const shell of classifierShells(alias.flavor)) {
    const decision = gateCommand(mode, command, shell);
    if (decision.action !== "allow") return decision;
  }
  return ALLOW;
}

// `tool` is the classifier's shell: "PowerShell" reads PowerShell, any other
// name POSIX (Git Bash on Windows, where /d/repo is rewritten to D:/repo).
function gateCommand(mode: ReturnType<typeof parseMode>, command: string, tool: string): HookPackDecision {
  const kind = classifyCommand(command, tool);
  if (kind === "push") {
    const res = evaluatePush(command, (dirs, switchedTo) => gitCurrentBranch(dirs, tool, switchedTo), tool);
    return decide(
      mode,
      res.gated,
      `Direct push to protected branch "${res.branch}" — open a feature branch + PR instead.`,
    );
  }
  if (kind === "commit") {
    const res = evaluateCommitSize(command, (dirs) => gitStagedCount(dirs, tool), tool);
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
