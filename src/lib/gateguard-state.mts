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
 * - Evidence cache: in the file gate's default mode the hook also records a
 *   file here once the observation log showed the session looked at it, so the
 *   file's later edits skip the log scan. Those entries count toward the cap; a
 *   full cap stops the caching and never denies an evidence allow.
 * - State-file deletion: rm'ing the state file resets every gate in the
 *   session. Defensible because the session is the trust boundary — and with
 *   per-session scoping that boundary is now real, not just asserted.
 * - Self-heal: loadState treats a file older than STATE_TTL_MS (or one with an
 *   unparseable created_at) as empty, so a stale gate never needs a manual rm.
 * - Concurrency: saveState writes a temp file in the same directory and renames
 *   it over the target (writeFileAtomic), so a reader sees the old state or the
 *   new one, never a truncated or interleaved file. Copilot runs preToolUse
 *   hooks for parallel tool calls concurrently (Copilot cli-hooks-reference, per
 *   the 2026-11-21 all-agents research), which is what makes this matter. Two
 *   parallel load+save pairs can still lose one update (last rename wins); a
 *   lost clearance only re-asks for facts, and a lost evidence entry only
 *   re-reads the log.
 * - Cap: MAX_CLEARED_FILES caps the distinct files ONE session can clear,
 *   bounding stuck-loop / rogue-agent damage without affecting other sessions.
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

const DEFAULT_MAX_CLEARED_FILES = 1000;

/**
 * The per-session cap. 50 stopped real multi-slice work mid-task (a session that
 * touches a few dozen source, test and doc files hit it); 1000 still bounds a
 * runaway loop. GATEGUARD_MAX_CLEARED_FILES (a positive integer) overrides it.
 */
export function resolveMaxClearedFiles(env: Record<string, string | undefined>): number {
  const raw = env.GATEGUARD_MAX_CLEARED_FILES ?? "";
  const n = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : DEFAULT_MAX_CLEARED_FILES;
}

export const MAX_CLEARED_FILES = resolveMaxClearedFiles(process.env);

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
  const projectHash = hashProjectRoot(projectRoot);
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

// Exported for the target-lock gate (RISA 2 / G2): the hook compares a mutating
// call's absolute target against this root to catch wrong-repo / wrong-worktree
// writes. Returns "global" when no CLAUDE_PROJECT_DIR and no git toplevel — the
// caller treats that as "no known root, do not guess".
export function resolveProjectRoot(): string {
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
  writeFileAtomic(join(sessionDir, "gateguard-session.json"), `${JSON.stringify(state, null, 2)}\n`);
}

// Windows refuses to replace a file another process has open (a parallel hook
// reading the state) with EPERM or EBUSY. A reader closes within a few
// milliseconds, so the rename is retried after each of these waits.
const RENAME_RETRY_CODES = new Set(["EPERM", "EBUSY"]);
const RENAME_RETRY_DELAYS_MS = [25, 50, 100];

function isRetryableRenameError(err: unknown): boolean {
  return RENAME_RETRY_CODES.has((err as NodeJS.ErrnoException | null)?.code ?? "");
}

/**
 * Write `data` to `target` through a temp file in the same directory, then
 * rename it over the target. A rename within one directory replaces the file in
 * one step, so a concurrent reader never sees a half-written file. A rename that
 * fails with EPERM or EBUSY is retried after 25, 50 and 100 ms. Any other error,
 * or a failure after the last retry, removes the temp file and is thrown, and the
 * old target stays as it was. `rename` is a seam for tests.
 */
export function writeFileAtomic(
  target: string,
  data: string,
  rename: (from: string, to: string) => void = renameSync,
): void {
  const temp = join(dirname(target), `.${basename(target)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  writeFileSync(temp, data);
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        rename(temp, target);
        return;
      } catch (err) {
        if (!isRetryableRenameError(err) || attempt >= RENAME_RETRY_DELAYS_MS.length) throw err;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_RETRY_DELAYS_MS[attempt]);
      }
    }
  } catch (err) {
    rmSync(temp, { force: true });
    throw err;
  }
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

/** SHA-256[:12] of the canonical project root. C:/x, c:/x, and C:\\x share a bucket. */
export function hashProjectRoot(projectRoot: string): string {
  return createHash("sha256").update(canonicalizeProjectRoot(projectRoot)).digest("hex").slice(0, 12);
}

/** The .yaml files directly in `dir`, in name order; empty when it cannot be read (the session hook's policy). */
export function yamlFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".yaml"))
      .sort()
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
}

// One Windows directory has several spellings: `D:/repo`, `d:\repo`, `D:\repo`.
// hashProjectRoot folds them into one bucket (lower-case drive, forward
// slashes). A lesson written before that rule existed, or by a model that hashed
// the path the way git prints it, sits under the hash of another spelling of the
// same root. These are those hashes. A POSIX root has one spelling, so the list
// is empty there and nothing extra is read.
function otherSpellingHashes(root: string, canonicalHash: string): string[] {
  const canonical = canonicalizeProjectRoot(root);
  const spellings = [root];
  if (/^[a-z]:/.test(canonical)) {
    const upperDrive = canonical.charAt(0).toUpperCase() + canonical.slice(1);
    spellings.push(upperDrive, canonical.replace(/\//g, "\\"), upperDrive.replace(/\//g, "\\"));
  }
  const hashes = spellings.map((spelling) =>
    createHash("sha256").update(spelling).digest("hex").slice(0, 12),
  );
  return [...new Set(hashes)].filter((hash) => hash !== canonicalHash);
}

/**
 * A project's instinct files: the canonical bucket first, then the buckets of
 * the root's other spellings. A file name already listed is skipped, so a lesson
 * copied between buckets is read once and the canonical copy is the one read.
 * The SessionStart hook and the MCP server both list a project's instincts
 * through this, so a lesson the hook prints is one ci_instincts lists. `list`
 * reads one directory: the server passes one that throws on an unreadable
 * directory, so the failure reaches the caller as an error.
 */
export function projectYamlFiles(
  instinctsRoot: string,
  root: string,
  canonicalHash: string,
  list: (dir: string) => string[] = yamlFiles,
): string[] {
  const files = list(join(instinctsRoot, canonicalHash));
  const names = new Set(files.map((file) => basename(file)));
  for (const hash of otherSpellingHashes(root, canonicalHash)) {
    for (const file of list(join(instinctsRoot, hash))) {
      if (names.has(basename(file))) continue;
      names.add(basename(file));
      files.push(file);
    }
  }
  return files;
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
