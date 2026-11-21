#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveInstinctsRoot, resolveProjectRoot } from "../lib/agent-paths.mjs";
import { hashProjectRoot } from "../lib/gateguard-state.mjs";
import { claudeEventName, emit, encode, hookAgent, parsePayload, readStdin, settleHook } from "../lib/hook-io.mjs";
import { readLessonSources, renderLessonBlock } from "../lib/lesson-render.mjs";
import { resolveHomeDir } from "../lib/resolve-home-dir.mjs";
// Claude Code adds a SessionStart hook's plain-text stdout to the model's
// context and never shows the model the stderr of a hook that exits 0
// (https://code.claude.com/docs/en/hooks). The status line below goes to
// stderr, so the lesson block on stdout (lib/lesson-render.mjs) is the only
// path by which a recorded instinct reaches a later session.
const LOAD_OFF = new Set(["off", "0", "false", "no"]);
function read(path) {
    try {
        return readFileSync(path, "utf8");
    }
    catch {
        return "";
    }
}
const COPILOT_START_SOURCES = new Set(["startup", "resume", "new"]);
// The payload comes back too: its working directory picks the project root
// when no agent sets a project-dir env var.
function readPayload() {
    const parsed = parsePayload(readStdin());
    if (!parsed.ok)
        return null;
    const payload = parsed.value;
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
        return null;
    // Cursor and Copilot say sessionStart, Kiro agentSpawn, Cline (hookName) TaskStart.
    const name = payload.hook_event_name ?? payload.hook_type ?? payload.event_type ?? payload.hookName;
    // Copilot's camelCase sessionStart stdin names no event: it is sessionId,
    // timestamp, cwd, optional initialPrompt and a source of startup, resume or new.
    const event = name === undefined && !("hookEventName" in payload) && !("event" in payload) && COPILOT_START_SOURCES.has(String(payload.source))
        ? "SessionStart"
        : claudeEventName(name);
    return { event: event === "SessionStart" || event === "SessionEnd" ? event : "unknown", payload };
}
const ALLOW = { kind: "allow" };
function decideSession() {
    const input = readPayload();
    if (input === null)
        return { event: "unknown", decision: ALLOW };
    const { event, payload } = input;
    if (event === "SessionEnd") {
        return {
            event,
            decision: {
                kind: "allow",
                notices: ["[continuous-improvement] Session ending. Run /continuous-improvement to reflect and capture learnings."],
            },
        };
    }
    const home = resolveHomeDir();
    if (!home)
        return { event, decision: ALLOW };
    const instinctsRoot = resolveInstinctsRoot(home);
    const root = resolveProjectRoot(payload);
    const projectDir = join(instinctsRoot, hashProjectRoot(root));
    const { files, contents, projectCount } = readLessonSources(instinctsRoot, root);
    const observations = read(join(projectDir, "observations.jsonl")).split(/\r?\n/).filter(Boolean).length;
    let level = observations >= 20 || files.length > 0 ? "ANALYZE" : "CAPTURE";
    for (const content of contents) {
        const value = Number(content.match(/^confidence:\s*([0-9]*\.?[0-9]+)/m)?.[1]);
        if (Number.isFinite(value) && value >= 0.7) {
            level = "AUTO-APPLY";
            break;
        }
        if (Number.isFinite(value) && value >= 0.5)
            level = "SUGGEST";
    }
    const notices = [`[continuous-improvement] Level: ${level} | Observations: ${observations} | Instincts: ${files.length}`];
    if (event !== "SessionStart")
        return { event, decision: { kind: "allow", notices } };
    if (LOAD_OFF.has((process.env.CI_INSTINCT_LOAD ?? "").trim().toLowerCase())) {
        return { event, decision: { kind: "allow", notices } };
    }
    const block = renderLessonBlock(contents, projectCount);
    return { event, decision: block ? { kind: "context", text: block, notices } : { kind: "allow", notices } };
}
function main() {
    try {
        return decideSession();
    }
    catch {
        return { event: "unknown", decision: ALLOW };
    }
}
// A closed stdout must not crash the hook after the decision is made.
process.stdout.on("error", () => { });
emit(await settleHook(() => {
    const { event, decision } = main();
    return encode(hookAgent(), event, decision);
}, hookAgent));
