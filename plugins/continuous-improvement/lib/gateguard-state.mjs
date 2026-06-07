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
export function resolveSessionDir() {
    const fromEnv = process.env.GATEGUARD_SESSION_DIR;
    if (fromEnv)
        return fromEnv;
    const home = process.env.HOME || process.env.USERPROFILE || homedir();
    const projectRoot = resolveProjectRoot();
    const projectHash = createHash("sha256").update(canonicalizeProjectRoot(projectRoot)).digest("hex").slice(0, 12);
    return join(home, ".claude", "instincts", projectHash);
}
function resolveProjectRoot() {
    const fromEnv = process.env.CLAUDE_PROJECT_DIR;
    if (fromEnv)
        return fromEnv;
    try {
        const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        if (root)
            return root;
    }
    catch {
        // not in a git repo
    }
    return "global";
}
export function loadState(sessionDir) {
    const path = join(sessionDir, "gateguard-session.json");
    if (!existsSync(path)) {
        return { created_at: new Date().toISOString(), cleared_files: {} };
    }
    try {
        const raw = readFileSync(path, "utf8");
        const parsed = JSON.parse(raw);
        return {
            created_at: parsed.created_at ?? new Date().toISOString(),
            cleared_files: parsed.cleared_files ?? {},
        };
    }
    catch {
        return { created_at: new Date().toISOString(), cleared_files: {} };
    }
}
export function saveState(sessionDir, state) {
    if (!existsSync(sessionDir))
        mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "gateguard-session.json"), `${JSON.stringify(state, null, 2)}\n`);
}
export function isCapReached(state) {
    return Object.keys(state.cleared_files).length >= MAX_CLEARED_FILES;
}
export function markFileCleared(state, filePath) {
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
function canonicalizePath(p) {
    let out = p.replace(/\\/g, "/");
    if (/^[A-Za-z]:/.test(out)) {
        out = out.charAt(0).toLowerCase() + out.slice(1);
    }
    while (out.length > 1 && out.endsWith("/")) {
        out = out.slice(0, -1);
    }
    return out;
}
export function canonicalizeProjectRoot(p) {
    return canonicalizePath(p);
}
export function canonicalizeFileKey(p) {
    return canonicalizePath(p);
}
export function isFileCleared(state, filePath) {
    return canonicalizeFileKey(filePath) in state.cleared_files;
}
// Shared clearance writer used by the MCP tool and the CLI. Loads, marks each
// not-yet-cleared canonical key (respecting MAX_CLEARED_FILES), and saves once.
// Idempotent across path forms; returns what it cleared and what it skipped for
// the cap so callers can report partial results on a MultiEdit-sized batch.
export function clearFiles(sessionDir, filePaths) {
    const cleared = [];
    const skippedForCap = [];
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
