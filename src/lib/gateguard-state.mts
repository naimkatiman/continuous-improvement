/**
 * Gateguard per-session state.
 *
 * State file: <sessionDir>/gateguard-session.json. sessionDir resolves to
 * GATEGUARD_SESSION_DIR (env override, used by tests) or
 * ~/.claude/instincts/<projectHash>/ in production.
 *
 * V1 limitations (documented for honesty, not mitigated in code):
 * - Honor system: clearance is granted whenever the agent sets
 *   `_gateguard_facts_presented: true` in tool_input or has a prior per-file
 *   marker. The hook cannot verify that real investigation occurred.
 * - State-file deletion: rm'ing the state file resets every gate in the
 *   session. Defensible because the session itself is the trust boundary;
 *   the cap below limits cumulative damage.
 * - Concurrency: two parallel hook invocations can race the read+write.
 *   Acceptable trade-off vs OS-specific atomic-rename complexity on Windows.
 * - Cap: MAX_CLEARED_FILES caps the number of distinct files a single
 *   session can clear, bounding stuck-loop / rogue-agent damage.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export const MAX_CLEARED_FILES = 50;

export interface GateguardState {
  created_at: string;
  cleared_files: Record<string, { cleared_at: string }>;
}

export function resolveSessionDir(): string {
  const fromEnv = process.env.GATEGUARD_SESSION_DIR;
  if (fromEnv) return fromEnv;
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  const projectRoot = resolveProjectRoot();
  const projectHash = createHash("sha256").update(projectRoot).digest("hex").slice(0, 12);
  return join(home, ".claude", "instincts", projectHash);
}

function resolveProjectRoot(): string {
  const fromEnv = process.env.CLAUDE_PROJECT_DIR;
  if (fromEnv) return fromEnv;
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (root) return root;
  } catch {
    // not in a git repo
  }
  return "global";
}

export function loadState(sessionDir: string): GateguardState {
  const path = join(sessionDir, "gateguard-session.json");
  if (!existsSync(path)) {
    return { created_at: new Date().toISOString(), cleared_files: {} };
  }
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<GateguardState>;
    return {
      created_at: parsed.created_at ?? new Date().toISOString(),
      cleared_files: parsed.cleared_files ?? {},
    };
  } catch {
    return { created_at: new Date().toISOString(), cleared_files: {} };
  }
}

export function saveState(sessionDir: string, state: GateguardState): void {
  if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });
  writeFileSync(
    join(sessionDir, "gateguard-session.json"),
    `${JSON.stringify(state, null, 2)}\n`,
  );
}

export function isCapReached(state: GateguardState): boolean {
  return Object.keys(state.cleared_files).length >= MAX_CLEARED_FILES;
}

export function markFileCleared(state: GateguardState, filePath: string): GateguardState {
  return {
    ...state,
    cleared_files: {
      ...state.cleared_files,
      [filePath]: { cleared_at: new Date().toISOString() },
    },
  };
}
