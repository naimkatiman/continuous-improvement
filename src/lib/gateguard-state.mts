/**
 * Gateguard per-session state.
 *
 * State file: <sessionDir>/gateguard-session.json. sessionDir resolves to
 * GATEGUARD_SESSION_DIR (env override, used by tests), or in production to
 * ~/.claude/instincts/<projectHash>/sessions/<sessionId>/ when the hook passes
 * the stdin session_id, falling back to ~/.claude/instincts/<projectHash>/ when
 * no session id is available. Per-session scoping is what stops the clearance
 * cap from bleeding across concurrent same-day sessions on a multi-Claude host.
 *
 * Limitations and guarantees:
 * - Honor system: clearance is granted whenever the agent sets
 *   `_gateguard_facts_presented: true` in tool_input or has a prior per-file
 *   marker. The hook cannot verify that real investigation occurred.
 * - State-file deletion: rm'ing the state file resets every gate in the
 *   session. Defensible because the session is the trust boundary — and with
 *   per-session scoping that boundary is now real, not just asserted.
 * - Self-heal: loadState treats a file older than STATE_TTL_MS (or one with an
 *   unparseable created_at) as empty, so a stale gate never needs a manual rm.
 * - Concurrency: two parallel hook invocations can race the read+write.
 *   Acceptable trade-off vs OS-specific atomic-rename complexity on Windows.
 * - Cap: MAX_CLEARED_FILES caps the distinct files ONE session can clear,
 *   bounding stuck-loop / rogue-agent damage without affecting other sessions.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export const MAX_CLEARED_FILES = 50;

// A clearance file whose created_at is older than this self-heals to empty on
// the next load, so a stale gate never needs a manual rm. Long enough not to
// reset an active session mid-work; the real cross-session fix is the
// per-session dir in resolveSessionDir below.
export const STATE_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export interface GateguardState {
  created_at: string;
  cleared_files: Record<string, { cleared_at: string }>;
}

// The root that holds every project's gateguard + instinct state. The MCP
// clearance route uses this to bound a caller-supplied state_path to this tree
// so a hostile argument can't turn the clear into an arbitrary-write primitive.
export function resolveInstinctsRoot(): string {
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  return join(home, ".claude", "instincts");
}

export function resolveSessionDir(sessionId?: string): string {
  const fromEnv = process.env.GATEGUARD_SESSION_DIR;
  if (fromEnv) return fromEnv;
  const projectRoot = resolveProjectRoot();
  const projectHash = createHash("sha256").update(canonicalizeProjectRoot(projectRoot)).digest("hex").slice(0, 12);
  const base = join(resolveInstinctsRoot(), projectHash);
  const scoped = sanitizeSessionId(sessionId);
  return scoped ? join(base, "sessions", scoped) : base;
}

// A session id flows into a directory name. Strip anything outside a safe
// alphabet so a hostile or malformed id can't traverse (`../`) or break the
// path, and cap the length. Returns "" for an absent/empty id, which the caller
// treats as "no session" — the legacy unscoped dir, preserving back-compat.
function sanitizeSessionId(sessionId?: string): string {
  if (!sessionId) return "";
  return sessionId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
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

function freshState(): GateguardState {
  return { created_at: new Date().toISOString(), cleared_files: {} };
}

// A clearance file self-heals to empty once it ages out of STATE_TTL_MS, so a
// stale gate never needs a manual rm. An unparseable created_at fails closed
// (treated as expired) rather than living forever as a never-resetting gate.
function isExpired(createdAt: string): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return true;
  return Date.now() - created > STATE_TTL_MS;
}

export function loadState(sessionDir: string): GateguardState {
  const path = join(sessionDir, "gateguard-session.json");
  if (!existsSync(path)) {
    return freshState();
  }
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<GateguardState>;
    // Absent created_at is treated as expired (fail closed), like an unparseable
    // one — never a never-resetting gate. On expiry we persist the new epoch
    // immediately so the cap re-applies from zero on the very next load;
    // otherwise every load before the next clear would independently reset and a
    // TTL-crossing session could clear well past MAX_CLEARED_FILES.
    if (!parsed.created_at || isExpired(parsed.created_at)) {
      const reset = freshState();
      saveState(sessionDir, reset);
      return reset;
    }
    return {
      created_at: parsed.created_at,
      cleared_files: parsed.cleared_files ?? {},
    };
  } catch {
    return freshState();
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
      [canonicalizeFileKey(filePath)]: { cleared_at: new Date().toISOString() },
    },
  };
}

// Canonicalize a path so the hook and any clearance helper agree regardless of
// which process resolved it. Two processes can supply the same directory in
// different forms — CLAUDE_PROJECT_DIR gives `d:/...` (lowercase drive) while
// `git rev-parse --show-toplevel` gives `D:/...` (uppercase) — and tool inputs
// vary by separator. Normalizing the drive-letter case and separators (only;
// directory/file-name case is preserved) makes the hash and the per-file key
// stable. Relative and POSIX paths have no drive letter or backslash, so they
// pass through unchanged and existing relative-key state keeps matching.
function canonicalizePath(p: string): string {
  let out = p.replace(/\\/g, "/");
  if (/^[A-Za-z]:/.test(out)) {
    out = out.charAt(0).toLowerCase() + out.slice(1);
  }
  while (out.length > 1 && out.endsWith("/")) {
    out = out.slice(0, -1);
  }
  return out;
}

export function canonicalizeProjectRoot(p: string): string {
  return canonicalizePath(p);
}

export function canonicalizeFileKey(p: string): string {
  return canonicalizePath(p);
}

export function isFileCleared(state: GateguardState, filePath: string): boolean {
  return canonicalizeFileKey(filePath) in state.cleared_files;
}

// Shared clearance writer used by the MCP tool and the CLI. Loads, marks each
// not-yet-cleared canonical key (respecting MAX_CLEARED_FILES), and saves once.
// Idempotent across path forms; returns what it cleared and what it skipped for
// the cap so callers can report partial results on a MultiEdit-sized batch.
export function clearFiles(
  sessionDir: string,
  filePaths: string[],
): { cleared: string[]; skippedForCap: string[] } {
  const cleared: string[] = [];
  const skippedForCap: string[] = [];
  let state = loadState(sessionDir);
  for (const filePath of filePaths) {
    const key = canonicalizeFileKey(filePath);
    if (key in state.cleared_files) {
      continue; // already cleared — idempotent, no cap charge
    }
    if (Object.keys(state.cleared_files).length >= MAX_CLEARED_FILES) {
      skippedForCap.push(filePath);
      continue;
    }
    state = markFileCleared(state, filePath);
    cleared.push(key);
  }
  if (cleared.length > 0) {
    saveState(sessionDir, state);
  }
  return { cleared, skippedForCap };
}
