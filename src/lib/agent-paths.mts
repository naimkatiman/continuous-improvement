// agent-paths.mts — the one instincts root and the one project root that every
// hook and the observer resolve, whichever coding agent runs them
// (docs/plans/2026-11-21-all-agents.md, Architecture item 1).
//
// The default root stays <home>/.claude/instincts, so every agent shares one
// store and nothing migrates. The project root decides the <project-hash>
// bucket under it, so the hooks, the observer and the MCP server must agree on
// it: a hook that hashes a different root reads an empty observation log.

import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

/** The root used when no env var, payload dir or git toplevel names one. */
export const GLOBAL_PROJECT_ROOT = "global";

// The project-dir env vars each agent sets for its hook commands, in the order
// they are checked. Sources: the 2026-11-21 all-agents research and its skeptic
// pass (skeptic corrections override the research claim).
//   CLAUDE_PROJECT_DIR  Claude Code; also set by Qwen, Gemini, Cursor (alias),
//                       Devin (documented hook env), Droid and Grok
//   QWEN_PROJECT_DIR    Qwen Code 0.28 (hook env, confirmed in chunk-S6UXV6IV.js)
//   GEMINI_PROJECT_DIR  Gemini CLI 0.41, also set by Qwen
//   CURSOR_PROJECT_DIR  Cursor 2.5.26 bundle (`CURSOR_PROJECT_DIR:this.workspacePath`)
//   DEVIN_PROJECT_DIR   Devin Local 3000.14
//   FACTORY_PROJECT_DIR Factory Droid 1.17 (skeptic: also DROID_PROJECT_DIR)
//   AUGMENT_PROJECT_DIR Auggie 1.2.2 (skeptic-corrected hook env)
//   GROK_WORKSPACE_ROOT Grok 1.0.85 (10-hooks.md plugin env vars)
// Copilot's COPILOT_PROJECT_DIR is left out: it is only a string in the
// embedded runtime, and the research lists it as unconfirmed.
export const PROJECT_DIR_ENV = [
  "CLAUDE_PROJECT_DIR",
  "QWEN_PROJECT_DIR",
  "GEMINI_PROJECT_DIR",
  "CURSOR_PROJECT_DIR",
  "DEVIN_PROJECT_DIR",
  "FACTORY_PROJECT_DIR",
  "AUGMENT_PROJECT_DIR",
  "GROK_WORKSPACE_ROOT",
] as const;

/** HOME, then USERPROFILE (Windows), then os.homedir(). An empty value is skipped. */
function defaultHome(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

/**
 * The directory that holds every project's instincts, observations and
 * gateguard state. CI_INSTINCTS_HOME, when set to a non-blank path, replaces
 * the whole root (made absolute). Otherwise <home>/.claude/instincts, where
 * home is the caller's home or HOME / USERPROFILE / os.homedir().
 */
export function resolveInstinctsRoot(home?: string): string {
  const override = process.env.CI_INSTINCTS_HOME?.trim();
  if (override) return resolve(override);
  return join(home ?? defaultHome(), ".claude", "instincts");
}

function gitToplevel(cwd?: string): string | null {
  try {
    // execFileSync, not execSync: no shell, a fixed argv.
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      ...(cwd ? { cwd } : {}),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return root || null;
  } catch {
    return null;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// An absolute path to an existing directory, else null. A relative path is
// refused: it would resolve against whatever cwd the hook was spawned in.
function usableDir(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  if (!isAbsolute(value) || !isDirectory(value)) return null;
  return value;
}

// The working directory the hook payload names: `cwd` (Claude, Codex, Gemini,
// Qwen, Grok, Copilot, Cursor, Droid, Kiro), `working_dir` (Goose, tool events
// only) and `workspace_roots[0]` (Cursor, Auggie), first usable one wins.
function payloadDir(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const roots = record.workspace_roots;
  const candidates = [record.cwd, record.working_dir, Array.isArray(roots) ? roots[0] : undefined];
  for (const candidate of candidates) {
    const dir = usableDir(candidate);
    if (dir) return dir;
  }
  return null;
}

/**
 * The project root for the <project-hash> bucket, first match wins:
 *   1. a non-blank PROJECT_DIR_ENV var, returned as given (test fixtures and
 *      operator setups point it at synthetic paths);
 *   2. the payload's working directory, as its git toplevel when it is inside
 *      a repository (so a subdirectory shares the repo's bucket), else itself;
 *   3. the git toplevel of the process cwd;
 *   4. GLOBAL_PROJECT_ROOT.
 * Claude Code always sets CLAUDE_PROJECT_DIR, so a Claude hook never reaches 2.
 */
export function resolveProjectRoot(payload?: unknown): string {
  for (const name of PROJECT_DIR_ENV) {
    const value = process.env[name];
    if (value && value.trim()) return value;
  }
  const dir = payloadDir(payload);
  if (dir) return gitToplevel(dir) ?? dir;
  return gitToplevel() ?? GLOBAL_PROJECT_ROOT;
}
