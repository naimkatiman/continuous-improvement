#!/usr/bin/env node
/**
 * Runtime UserPromptSubmit recall-briefing hook (opt-in amplifier).
 *
 * On the first substantive prompt of a session, searches this project's past
 * observations (BM25, via recall-index.mts) and injects a one-time
 * `<system-reminder>` listing the most relevant prior activity — so the agent
 * reuses a past fix instead of re-deriving it. This makes episodic memory
 * proactive instead of opt-in-per-query (the ci_recall MCP tool stays available
 * for explicit, deeper searches).
 *
 * Opt-in: runs only when CLAUDE_RECALL_BRIEFING (alias CI_RECALL_BRIEFING) is 1/on/true. Default off, so it
 * never changes the prompt path for users who have not enabled it.
 *
 * Stdin  : JSON { prompt, session_id?, cwd? }
 * Stdout : JSON { hookSpecificOutput: { hookEventName: "UserPromptSubmit",
 *                                       additionalContext: string } }
 *          OR empty when it should not brief.
 * Exit   : 0 always — this is an amplifier, never a gate; it cannot block a prompt.
 *
 * Fail-open: any error (no env flag, bad stdin, missing/short observations log,
 * unreadable state) emits nothing and exits 0. State at
 * ~/.claude/instincts/<project-hash>/recall-briefing-session.json records which
 * session_ids have been briefed so each session is briefed at most once.
 *
 * The hook is: read stdin, normalize (lib/hook-io.mjs), decide
 * (lib/recall-briefing.mjs), encode for the agent.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildIndex, query } from "../lib/recall-index.mjs";
import { DEFAULT_MAX_HITS, decideBriefing } from "../lib/recall-briefing.mjs";
import { readKnob } from "../lib/agent-env.mjs";
import { resolveInstinctsRoot, resolveProjectRoot } from "../lib/agent-paths.mjs";
import { hashProjectRoot } from "../lib/gateguard-state.mjs";
import { emit, encode, hookAgent, normalizeEvent, parsePayload, readStdin } from "../lib/hook-io.mjs";
const EVENT = "UserPromptSubmit";
const ALLOW = { kind: "allow" };
const ENABLED_VALUES = new Set(["1", "on", "true", "yes"]);
const MAX_BRIEFED_KEYS = 1000;
function isEnabled() {
    const flag = (readKnob("CLAUDE_RECALL_BRIEFING") ?? "").trim().toLowerCase();
    return ENABLED_VALUES.has(flag);
}
function resolveHome() {
    return process.env.HOME ?? process.env.USERPROFILE ?? homedir();
}
function instinctsDir(home, payload) {
    const hash = hashProjectRoot(resolveProjectRoot(payload));
    return join(resolveInstinctsRoot(home), hash);
}
function readObservations(dir) {
    const path = join(dir, "observations.jsonl");
    let raw;
    try {
        raw = readFileSync(path, "utf8");
    }
    catch {
        return [];
    }
    const rows = [];
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        try {
            rows.push(JSON.parse(trimmed));
        }
        catch {
            // skip a malformed line; never let one bad row sink the briefing
        }
    }
    return rows;
}
function readState(dir) {
    try {
        const parsed = JSON.parse(readFileSync(join(dir, "recall-briefing-session.json"), "utf8"));
        if (parsed && typeof parsed.briefed === "object" && parsed.briefed !== null)
            return parsed;
    }
    catch {
        // missing or malformed → fresh state
    }
    return { briefed: {} };
}
function writeState(dir, state, sessionKey) {
    try {
        const keys = Object.keys(state.briefed);
        // Bound growth: if the map is huge, keep only the most recent run plus this one.
        const briefed = keys.length >= MAX_BRIEFED_KEYS ? {} : state.briefed;
        briefed[sessionKey] = new Date().toISOString();
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "recall-briefing-session.json"), `${JSON.stringify({ briefed }, null, 2)}\n`);
    }
    catch {
        // fail-open: a missed state write at worst briefs twice; it never blocks
    }
}
function decideRecall() {
    if (!isEnabled())
        return ALLOW;
    const parsed = parsePayload(readStdin());
    if (!parsed.ok)
        return ALLOW;
    const event = normalizeEvent(hookAgent(), EVENT, parsed.value);
    const prompt = event.prompt ?? "";
    if (prompt.length === 0)
        return ALLOW;
    const sessionKey = event.sessionId || "no-session";
    const home = resolveHome();
    const dir = instinctsDir(home, event.payload);
    const state = readState(dir);
    const alreadyBriefed = Object.prototype.hasOwnProperty.call(state.briefed, sessionKey);
    const observations = readObservations(dir);
    const index = buildIndex(observations);
    const hits = query(index, prompt, { k: DEFAULT_MAX_HITS });
    const decision = decideBriefing({ enabled: true, alreadyBriefed, prompt, hits });
    if (!decision.shouldBrief || decision.reminder === null)
        return ALLOW;
    writeState(dir, state, sessionKey);
    return { kind: "context", text: decision.reminder };
}
function main() {
    try {
        return decideRecall();
    }
    catch {
        // Absolute fail-open backstop: never let a hook bug block a prompt.
        return ALLOW;
    }
}
const decision = main();
emit(encode(hookAgent(), EVENT, decision));
