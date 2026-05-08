#!/usr/bin/env node
/**
 * Runtime PreToolUse gateguard hook.
 *
 * Stdin  : JSON { tool_name, tool_input }
 * Stdout : JSON { decision: "allow" | "block", reason?: string }
 * Exit   : 0 always (decision is in stdout, fail-open on parse error).
 *
 * Three-stage gate per skills/gateguard.md:
 * - DENY  : first mutating tool call per file, with fact-list reason
 * - FORCE : agent presents facts (model-side; out of band)
 * - ALLOW : retry once `_gateguard_facts_presented: true` is set or the
 *           per-file marker is recorded in session state
 *
 * Read-only and exploratory tools (Read, Grep, Glob, routine Bash) bypass
 * unconditionally. Destructive Bash gates EVERY call, not just first.
 *
 * V1 honest limitations (see src/lib/gateguard-state.mts header):
 *   honor-system flag, state-file deletion, parallel-hook race.
 *
 * MultiEdit handling (V1): gates on edits[0].file_path only. Per-file
 * batching is not implemented — TODO: extend to gate every entry in
 * edits[]. Tracked in issue #106 acceptance criteria item 5.
 */
import { readFileSync } from "node:fs";
import { isCapReached, loadState, markFileCleared, resolveSessionDir, saveState, } from "../lib/gateguard-state.mjs";
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
function extractFilePath(toolInput) {
    if (typeof toolInput.file_path === "string")
        return toolInput.file_path;
    // MultiEdit V1: first edit's file_path is the canonical key.
    if (Array.isArray(toolInput.edits) && toolInput.edits.length > 0) {
        const first = toolInput.edits[0];
        if (first && typeof first.file_path === "string")
            return first.file_path;
    }
    if (typeof toolInput.command === "string")
        return toolInput.command;
    return "";
}
function buildMutatingFileReason(toolName, filePath) {
    return [
        `Before ${toolName === "Write" ? "creating" : "editing"} ${filePath || "<unknown>"}, present these facts:`,
        "",
        "  1. List ALL files that import/require this file (use Grep)",
        "  2. List the public functions/classes affected by this change",
        "  3. If this file reads/writes data files, show field names, structure, and date format",
        "  4. Quote the user's current instruction verbatim",
        "",
        "After presenting the facts, retry with `_gateguard_facts_presented: true` in tool_input,",
        "or with the same file_path after a previous clearance has been recorded for this session.",
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
        "Gateguard session clearance cap reached (50 distinct files).",
        "Start a new Claude Code session to reset the gate. The cap exists to bound",
        "stuck-loop or rogue-agent clearance from compounding within a single session.",
    ].join("\n");
}
function emit(decision) {
    process.stdout.write(`${JSON.stringify(decision)}\n`);
    process.exit(0);
}
function main() {
    let raw = "";
    try {
        raw = readFileSync(0, "utf8");
    }
    catch {
        emit({ decision: "allow" });
        return;
    }
    let payload;
    try {
        payload = JSON.parse(raw);
    }
    catch {
        emit({ decision: "allow" }); // fail-open
        return;
    }
    const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "";
    const toolInput = payload.tool_input ?? {};
    const gate = classifyTool(toolName, toolInput);
    if (gate === "allow") {
        emit({ decision: "allow" });
        return;
    }
    if (gate === "destructive-bash") {
        const cmd = typeof toolInput.command === "string" ? toolInput.command : "";
        emit({ decision: "block", reason: buildDestructiveBashReason(cmd) });
        return;
    }
    // mutating-file
    const sessionDir = resolveSessionDir();
    const state = loadState(sessionDir);
    const filePath = extractFilePath(toolInput);
    const factsFlagged = toolInput._gateguard_facts_presented === true;
    const alreadyCleared = filePath !== "" && filePath in state.cleared_files;
    if (!factsFlagged && !alreadyCleared) {
        emit({ decision: "block", reason: buildMutatingFileReason(toolName, filePath) });
        return;
    }
    if (factsFlagged && !alreadyCleared) {
        if (isCapReached(state)) {
            emit({ decision: "block", reason: buildCapReachedReason() });
            return;
        }
        if (filePath !== "") {
            saveState(sessionDir, markFileCleared(state, filePath));
        }
    }
    emit({ decision: "allow" });
}
main();
