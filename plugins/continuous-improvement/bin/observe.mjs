#!/usr/bin/env node
// observe.mts — Mulahazah PreToolUse/PostToolUse observation hook.
//
// Reads a Claude Code hook JSON payload from stdin and appends one rich-schema
// JSONL line to ~/.claude/instincts/<project-hash>/observations.jsonl. Drop-in
// replacement for the bash observe.sh fallback path: no jq dependency, captures
// `tool_input.command` for Bash and `Edit.file_path` for Edit/Write/Read so the
// downstream analysis pass can detect user corrections, error→fix sequences,
// and tool-argument bigrams the thin schema could not represent.
//
// Contract:
//   - Always exits 0. Never blocks the Claude session.
//   - Catches every error to stderr; never throws.
//   - Empty stdin / malformed JSON / missing tool_name → no-op exit 0.
//   - Hook budget: <500ms on Windows (per CONTRIBUTING.md).
//
// See docs/plans/2026-05-05-node-observer-rich-schema.md for the full design.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { resolveInstinctsRoot, resolveProjectRoot } from "../lib/agent-paths.mjs";
import { canonicalizeProjectRoot, hashProjectRoot } from "../lib/gateguard-state.mjs";
import { parseHookPayload, summariseInput, summariseOutput } from "../lib/observe-event.mjs";
const ROTATION_LINE_THRESHOLD = 10_000;
const ARCHIVE_RETENTION = 10;
main();
function main() {
    try {
        runObserver();
    }
    catch (error) {
        // Never block the session. Failures land in stderr only.
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[observe] ${message}\n`);
    }
    process.exit(0);
}
function runObserver() {
    const raw = readStdin();
    const payload = parseHookPayload(raw);
    if (!payload)
        return;
    const projectRoot = canonicalizeProjectRoot(resolveProjectRoot(parseObject(raw)));
    const projectHash = hashProjectRoot(projectRoot);
    const projectName = basename(projectRoot.replace(/\.git$/, ""));
    const projectDir = join(resolveInstinctsRoot(), projectHash);
    const obsFile = join(projectDir, "observations.jsonl");
    ensureDir(projectDir);
    rotateIfNeeded(obsFile, projectDir);
    const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const event = payload.tool_response !== undefined ? "tool_complete" : "tool_start";
    const row = {
        ts,
        event,
        session: payload.session_id,
        tool: payload.tool_name,
        input_summary: summariseInput(payload.tool_name, payload.tool_input),
        output_summary: summariseOutput(payload.tool_response),
        project_id: projectHash,
        project_name: projectName,
    };
    appendFileSync(obsFile, JSON.stringify(row) + "\n", "utf8");
    writeProjectJsonIfNew(projectDir, projectHash, projectName, projectRoot, ts);
}
function readStdin() {
    try {
        return readFileSync(0, "utf8");
    }
    catch {
        return "";
    }
}
// The raw stdin object, for the payload's working directory. parseHookPayload
// already accepted the same text, so this parse cannot fail on a row it keeps.
function parseObject(raw) {
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function ensureDir(dir) {
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
}
function rotateIfNeeded(obsFile, projectDir) {
    if (!existsSync(obsFile))
        return;
    const lineCount = countLines(obsFile);
    if (lineCount < ROTATION_LINE_THRESHOLD)
        return;
    const archiveTs = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
    renameSync(obsFile, join(projectDir, `observations.${archiveTs}.jsonl`));
    pruneArchives(projectDir);
}
function countLines(file) {
    const stat = statSync(file);
    if (stat.size === 0)
        return 0;
    // For files capped at 10k lines, readFileSync is faster than streaming.
    return readFileSync(file, "utf8").split("\n").length - 1;
}
function pruneArchives(projectDir) {
    const archives = readdirSync(projectDir)
        .filter((name) => /^observations\..+\.jsonl$/.test(name))
        .sort()
        .reverse()
        .map((name) => join(projectDir, name));
    for (const path of archives.slice(ARCHIVE_RETENTION)) {
        try {
            unlinkSync(path);
        }
        catch {
            // Pruning failure is non-fatal; rotation already happened.
        }
    }
}
function writeProjectJsonIfNew(projectDir, projectHash, projectName, projectRoot, ts) {
    const projectJson = join(projectDir, "project.json");
    if (existsSync(projectJson))
        return;
    const body = {
        id: projectHash,
        name: projectName,
        root: projectRoot,
        created_at: ts,
    };
    writeFileSync(projectJson, JSON.stringify(body) + "\n", "utf8");
}
