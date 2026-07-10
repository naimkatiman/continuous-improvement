#!/usr/bin/env node
/**
 * query-cost-nudge.mts — Stop hook that nudges a D1-aware query-cost audit when
 * the working tree has changed DB/query files at turn end (RISA 5 / G5).
 *
 * The `database-reviewer` agent already carries the cost checklist, but nothing
 * dispatched it on DB edits, so cost regressions (the surprise-D1-bill class)
 * shipped unaudited. This injects a once-per-session reminder via Stop
 * `additionalContext` — a Stop hook (not PostToolUse) because only PreToolUse /
 * UserPromptSubmit / Stop / SubagentStop support additionalContext; PostToolUse
 * could only emit a user-facing systemMessage that never reaches the model.
 *
 * Opt-in via CLAUDE_QUERY_COST_NUDGE=on (default off). Once-per-session dedup
 * keyed on the Stop stdin session_id (falls back to a per-day key) — without it,
 * additionalContext "keeps the turn going" and would re-fire every turn while
 * the DB files stay dirty. Never blocks; fail-open on any error.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { buildQueryCostReminder, changedQueryPaths, parseChangedFiles, resolveQueryCostNudge, } from "../lib/query-cost-gate.mjs";
function readStdin() {
    try {
        return readFileSync(0, "utf8");
    }
    catch {
        return "";
    }
}
function resolveHome() {
    return process.env.HOME || process.env.USERPROFILE || homedir();
}
function resolveProjectRoot() {
    const fromEnv = process.env.CLAUDE_PROJECT_DIR;
    if (fromEnv && fromEnv.trim())
        return fromEnv.trim();
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
function collectChangedFiles(root) {
    const run = (args) => {
        try {
            return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        }
        catch {
            return "";
        }
    };
    return [
        ...parseChangedFiles(run(["diff", "--name-only", "--diff-filter=ACMR"])),
        ...parseChangedFiles(run(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])),
        ...parseChangedFiles(run(["ls-files", "--others", "--exclude-standard"])),
    ];
}
// Marker key: the sanitized session_id when present (the normal case), else a
// per-day key so a missing id self-heals daily instead of blocking forever.
function markerKey(sessionId) {
    const sanitized = (sessionId ?? "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
    return sanitized || `day-${new Date().toISOString().slice(0, 10)}`;
}
function markerPath(home, projectRoot, sessionId) {
    const hash = createHash("sha256").update(projectRoot).digest("hex").slice(0, 12);
    return join(home, ".claude", "instincts", hash, "query-cost-nudge", `${markerKey(sessionId)}.nudged`);
}
function main() {
    if (resolveQueryCostNudge(process.env.CLAUDE_QUERY_COST_NUDGE) === "off")
        return;
    let sessionId;
    try {
        const payload = JSON.parse(readStdin());
        if (typeof payload.session_id === "string")
            sessionId = payload.session_id;
    }
    catch {
        // stdin optional — proceed without a session id (per-day dedup)
    }
    const root = resolveProjectRoot();
    if (root === "global")
        return; // no repo → nothing to diff
    const changed = changedQueryPaths(collectChangedFiles(root));
    if (changed.length === 0)
        return;
    const marker = markerPath(resolveHome(), root, sessionId);
    try {
        if (existsSync(marker))
            return; // already nudged this session
        mkdirSync(dirname(marker), { recursive: true });
        writeFileSync(marker, `${new Date().toISOString()}\n`);
    }
    catch {
        // if the marker can't be written, nudge anyway (no dedup) rather than stay silent
    }
    process.stdout.write(`${JSON.stringify({
        hookSpecificOutput: { hookEventName: "Stop", additionalContext: buildQueryCostReminder(changed) },
    })}\n`);
}
try {
    main();
}
catch {
    // fail open — never trap a turn on a hook bug
}
