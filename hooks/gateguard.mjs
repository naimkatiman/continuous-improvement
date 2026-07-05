#!/usr/bin/env node
/**
 * Runtime PreToolUse gateguard hook.
 *
 * Stdin  : JSON { tool_name, tool_input }
 * Stdout : empty on allow (no output = no opinion, the call proceeds); on
 *          deny, the documented PreToolUse shape:
 *          { hookSpecificOutput: { hookEventName: "PreToolUse",
 *            permissionDecision: "deny", permissionDecisionReason } }
 *          A bare { decision: "allow" } is not schema-valid for PreToolUse
 *          (the deprecated enum is "approve" | "block") and surfaces as a
 *          "Hook JSON output validation failed" error on every tool call.
 * Exit   : 0 always (decision is in stdout, fail-open on parse error).
 *
 * Three-stage gate per skills/gateguard.md:
 * - DENY  : first mutating tool call per file, with fact-list reason
 * - FORCE : agent presents facts (model-side; out of band)
 * - ALLOW : retry once the per-file marker is recorded in session state
 *           (harness-portable, written out of band via Bash), or
 *           `_gateguard_facts_presented: true` is set where the harness
 *           forwards unknown tool params
 *
 * Read-only and exploratory tools (Read, Grep, Glob, routine Bash) bypass
 * unconditionally. Destructive Bash gates EVERY call, not just first.
 *
 * V1 honest limitations (see src/lib/gateguard-state.mts header):
 *   honor-system flag, state-file deletion, parallel-hook race.
 *
 * MultiEdit handling gates every edited file individually. The hook blocks
 * unless all edited paths are already cleared, or the agent presents facts
 * for the call and the hook records clearance for each edited path.
 * Block reasons now name the whole batch instead of just the first uncleared
 * path.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_CLEARED_FILES, canonicalizeFileKey, isCapReached, isFileCleared, loadState, markFileCleared, resolveSessionDir, saveState, } from "../lib/gateguard-state.mjs";
const TOOL_ROUTE = {
    Read: "allow",
    Grep: "allow",
    Glob: "allow",
    LS: "allow",
    NotebookRead: "allow",
    Write: "mutating-file",
    Edit: "mutating-file",
    MultiEdit: "mutating-file",
    NotebookEdit: "mutating-file",
    Bash: "allow",
};
const DESTRUCTIVE_PATTERNS = [
    "rm -rf",
    "rm -fr",
    "git reset --hard",
    "git push --force",
    "git push -f",
    "--force-with-lease",
    "git branch -D",
    "drop table",
    "drop database",
    "drop schema",
    "truncate ",
    "mkfs",
    "dd if=",
    "format ",
    "rmdir /s",
    "del /f /q",
    "del /q /f",
    "Remove-Item -Recurse",
    "Remove-Item -Force",
];
function isDestructiveBash(command) {
    const lower = command.toLowerCase();
    return DESTRUCTIVE_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}
function classifyTool(toolName, toolInput) {
    const route = TOOL_ROUTE[toolName] ?? "allow";
    if (route !== "allow")
        return route;
    if (toolName === "Bash" && typeof toolInput.command === "string") {
        if (isDestructiveBash(toolInput.command))
            return "destructive-bash";
    }
    return "allow";
}
function extractFilePaths(toolInput) {
    if (typeof toolInput.file_path === "string")
        return [toolInput.file_path];
    if (Array.isArray(toolInput.edits) && toolInput.edits.length > 0) {
        return toolInput.edits
            .map((edit) => (edit && typeof edit.file_path === "string" ? edit.file_path : ""))
            .filter((filePath) => filePath !== "");
    }
    if (typeof toolInput.command === "string")
        return [toolInput.command];
    return [];
}
// --- Path exclusions -------------------------------------------------------
// Opt-in: skip the fact-forcing gate for low-risk paths a user edits
// constantly (an LLM-maintained prose wiki, a generated scratch dir). Set the
// CI_GATEGUARD_EXCLUDE env var to a comma-separated list of path substrings;
// each is matched case-insensitively against the forward-slash-normalized file
// path. Unset/empty (the default) changes nothing — every mutating file call is
// gated exactly as before. A call whose targets mix excluded and non-excluded
// paths still gates the non-excluded ones.
const EXCLUDE_FRAGMENTS = String(process.env.CI_GATEGUARD_EXCLUDE ?? "")
    .split(",")
    .map((fragment) => fragment.trim().replace(/\\/g, "/").toLowerCase())
    .filter((fragment) => fragment !== "");
function isExcludedPath(filePath) {
    if (EXCLUDE_FRAGMENTS.length === 0 || typeof filePath !== "string" || filePath === "") {
        return false;
    }
    const normalized = filePath.replace(/\\/g, "/").toLowerCase();
    return EXCLUDE_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}
// The call site only reads this inside the block branch, where at least one
// path is uncleared; an all-cleared batch returns "" and is never consumed.
function firstUnclearedFilePath(toolInput, state) {
    return extractFilePaths(toolInput).find((path) => !isFileCleared(state, path)) ?? "";
}
function countDistinctNewFilePaths(filePaths, state) {
    return new Set(filePaths.filter((path) => !isFileCleared(state, path)).map((path) => canonicalizeFileKey(path))).size;
}
function formatFileTarget(filePaths) {
    const nonEmpty = filePaths.filter((path) => path !== "");
    if (nonEmpty.length === 0)
        return "<unknown>";
    if (nonEmpty.length === 1)
        return nonEmpty[0];
    return `${nonEmpty.length} files (${nonEmpty.join(", ")})`;
}
// Resolved from the hook's own location at load time. The block reason must
// print a command the agent can run in its OWN shell, where ${CLAUDE_PLUGIN_ROOT}
// is empty — that variable is only populated while this hook itself executes.
// bin/ is a sibling of hooks/ in both the repo layout and the plugin-bundle
// mirror, so this resolves correctly from either.
const CLEAR_CLI_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "gateguard-clear.mjs");
// Quote a path for the printed clearance command. Forward slashes (node accepts
// them on every platform and they survive a Bash double-quote without escaping)
// inside JSON quotes — JSON.stringify still escapes any embedded quote, so a
// path like a"b.ts stays safe rather than collapsing into a bare-quoted token.
function quotePath(p) {
    return JSON.stringify(p.replace(/\\/g, "/"));
}
function buildMutatingFileReason(toolName, filePaths, stateFilePath) {
    const target = formatFileTarget(filePaths);
    const pathList = filePaths.filter((p) => p !== "");
    const quoted = (pathList.length > 0 ? pathList : [target]).map((p) => quotePath(p));
    return [
        `Before ${toolName === "Write" ? "creating" : "editing"} ${target}, present these facts:`,
        "",
        "  1. List ALL files that import/require this file (use Grep)",
        "  2. List the public functions/classes affected by this change",
        "  3. If this file reads/writes data files, show field names, structure, and date format",
        "  4. Quote the user's current instruction verbatim",
        "",
        "Then clear the gate and retry the same call. Either route works:",
        `  A. Bash (always works — run verbatim): node ${quotePath(CLEAR_CLI_PATH)} --state ${quotePath(stateFilePath)} ${quoted.join(" ")}`,
        `  B. MCP tool (when the continuous-improvement server is connected): ci_gateguard_clear  {file_paths: [${quoted.join(", ")}], state_path: ${quotePath(stateFilePath)}}`,
        "  Both canonicalize paths — drive-letter case and separators don't matter.",
        "  (Harnesses that forward unknown tool params may instead retry the call with",
        "  `_gateguard_facts_presented: true`; Claude Code's strict schema rejects that, so use A or B.)",
    ].join("\n");
}
function buildDestructiveBashReason(command) {
    return [
        `Destructive command requested: ${command}`,
        "",
        "  1. List ALL files/data this command will modify or delete",
        "  2. Write a one-line rollback procedure",
        "  3. Quote the user's current instruction verbatim",
        "",
        "Destructive Bash gates EVERY call — clearance is not cached.",
    ].join("\n");
}
function buildCapReachedReason() {
    return [
        `Gateguard clearance cap reached (${MAX_CLEARED_FILES} distinct files this session).`,
        "The cap is per-session: start a new Claude Code session to reset it, or wait",
        "for the state file to self-heal. It bounds stuck-loop or rogue-agent clearance",
        "from compounding within one session without affecting your other sessions.",
    ].join("\n");
}
// Allow = empty stdout + exit 0. Emitting JSON here is wrong: PreToolUse has
// no { decision: "allow" } shape, and the invalid output surfaces as a
// per-tool-call "Hook JSON output validation failed" error in the client.
function emitAllow() {
    process.exit(0);
}
function emitDeny(reason) {
    process.stdout.write(`${JSON.stringify({
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: reason,
        },
    })}\n`);
    process.exit(0);
}
function main() {
    let raw = "";
    try {
        raw = readFileSync(0, "utf8");
    }
    catch {
        emitAllow();
        return;
    }
    let payload;
    try {
        payload = JSON.parse(raw);
    }
    catch {
        emitAllow(); // fail-open
        return;
    }
    const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "";
    const toolInput = payload.tool_input ?? {};
    const gate = classifyTool(toolName, toolInput);
    if (gate === "allow") {
        emitAllow();
        return;
    }
    if (gate === "destructive-bash") {
        const cmd = typeof toolInput.command === "string" ? toolInput.command : "";
        emitDeny(buildDestructiveBashReason(cmd));
        return;
    }
    // mutating-file — scope state to THIS session so the clearance cap never
    // bleeds across concurrent same-day sessions. session_id is the standard hook
    // stdin field (see recall-briefing / observe-event); absent → legacy dir.
    const sessionId = typeof payload.session_id === "string" ? payload.session_id : undefined;
    const sessionDir = resolveSessionDir(sessionId);
    const stateFilePath = join(sessionDir, "gateguard-session.json");
    const state = loadState(sessionDir);
    const allTargetPaths = extractFilePaths(toolInput);
    const filePaths = allTargetPaths.filter((path) => !isExcludedPath(path));
    if (allTargetPaths.length > 0 && filePaths.length === 0) {
        emitAllow(); // every target is under a CI_GATEGUARD_EXCLUDE path; skip the gate
        return;
    }
    const filePath = firstUnclearedFilePath(toolInput, state);
    const factsFlagged = toolInput._gateguard_facts_presented === true;
    const alreadyCleared = filePaths.length > 0 && filePaths.every((path) => isFileCleared(state, path));
    const newFileCount = countDistinctNewFilePaths(filePaths, state);
    if (!factsFlagged && !alreadyCleared) {
        emitDeny(buildMutatingFileReason(toolName, filePaths.length > 0 ? filePaths : [filePath], stateFilePath));
        return;
    }
    if (factsFlagged && !alreadyCleared) {
        if (isCapReached(state) || Object.keys(state.cleared_files).length + newFileCount > MAX_CLEARED_FILES) {
            emitDeny(buildCapReachedReason());
            return;
        }
        let nextState = state;
        for (const path of filePaths) {
            nextState = markFileCleared(nextState, path);
        }
        if (filePaths.length > 0)
            saveState(sessionDir, nextState);
    }
    emitAllow();
}
main();
