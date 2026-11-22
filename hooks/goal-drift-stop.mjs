#!/usr/bin/env node
// goal-drift-stop.mts — Stop hook that scores the turn's activity against the
// stated goal (task_plan.md ## Goal) and, when the session has DRIFTed on a
// substantive wrap-up, warns or (opt-in) blocks the close. This is the runtime
// arm of goal-monitor: it auto-fires the drift check at the Stop phase boundary
// instead of waiting for someone to run /goal-check.
//
// Mode via CLAUDE_GOAL_DRIFT_GATE (alias CI_GOAL_DRIFT_GATE): "warn" (default) | "block" | "off".
//   - warn  : print a one-line drift notice to stderr; never blocks.
//   - block : emit {"decision":"block","reason":...} to re-prompt.
//   - off   : no-op.
// The drift status is persisted to
// ~/.claude/instincts/<project-hash>/goal-drift-state.json every turn.
//
// Project-hash resolution is byte-identical to bin/observe.mts so this hook
// reads the SAME observations.jsonl the observer writes. Fail-open by
// construction: any error / missing goal / unreadable observations exits 0 and
// never blocks. No network. 5s hook budget.
//
// The hook is: read stdin, decide (lib/goal-drift-gate.mjs), encode for the
// agent (lib/hook-io.mjs).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readKnob } from "../lib/agent-env.mjs";
import { resolveInstinctsRoot, resolveProjectRoot } from "../lib/agent-paths.mjs";
import { evaluateGoalDrift } from "../lib/goal-drift-gate.mjs";
import { hashProjectRoot } from "../lib/gateguard-state.mjs";
import { emit, encode, readStdin } from "../lib/hook-io.mjs";
import { resolveHomeDir } from "../lib/resolve-home-dir.mjs";
const AGENT = "claude";
const EVENT = "Stop";
const ALLOW = { kind: "allow" };
function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
function resolveMode() {
    const raw = (readKnob("CLAUDE_GOAL_DRIFT_GATE") ?? "warn").trim().toLowerCase();
    return raw === "block" || raw === "off" ? raw : "warn";
}
// The observer resolves the same root (lib/agent-paths), so the hash here
// names the observations.jsonl it writes.
function projectHash(root) {
    return hashProjectRoot(root);
}
function readGoalMarkdown(projectRoot, instinctsProjectDir) {
    const candidates = [join(projectRoot, "task_plan.md"), join(instinctsProjectDir, "goal.md")];
    for (const file of candidates) {
        try {
            if (existsSync(file))
                return readFileSync(file, "utf8");
        }
        catch {
            // try the next candidate
        }
    }
    return "";
}
function readObservations(instinctsProjectDir) {
    const file = join(instinctsProjectDir, "observations.jsonl");
    try {
        if (!existsSync(file))
            return [];
        const lines = readFileSync(file, "utf8")
            .split("\n")
            .filter((line) => line.trim().length > 0);
        const out = [];
        for (const line of lines.slice(-100)) {
            const row = safeJsonParse(line);
            if (!row)
                continue;
            out.push({
                ts: typeof row.ts === "string" ? row.ts : "",
                tool: typeof row.tool === "string" ? row.tool : "",
                input_summary: typeof row.input_summary === "string" ? row.input_summary : "",
                output_summary: typeof row.output_summary === "string" ? row.output_summary : "",
            });
        }
        return out;
    }
    catch {
        return [];
    }
}
function lastAssistantTextLength(transcriptPath) {
    try {
        const lines = readFileSync(transcriptPath, "utf8").split(/\r?\n/);
        for (let i = lines.length - 1; i >= 0; i -= 1) {
            const line = lines[i].trim();
            if (!line)
                continue;
            const obj = safeJsonParse(line);
            if (!obj || obj.type !== "assistant")
                continue;
            const blocks = obj.message?.content;
            if (!Array.isArray(blocks))
                continue;
            const text = blocks
                .filter((b) => b &&
                typeof b === "object" &&
                b.type === "text" &&
                typeof b.text === "string")
                .map((b) => b.text)
                .join("\n");
            if (text.length === 0)
                continue;
            return text.length;
        }
    }
    catch {
        // fall through to 0
    }
    return 0;
}
function persistState(instinctsProjectDir, state) {
    try {
        mkdirSync(instinctsProjectDir, { recursive: true });
        writeFileSync(join(instinctsProjectDir, "goal-drift-state.json"), JSON.stringify({ ts: new Date().toISOString(), ...state }) + "\n", "utf8");
    }
    catch {
        // state persistence is best-effort; never throw
    }
}
function decideGoalDrift() {
    const mode = resolveMode();
    if (mode === "off")
        return ALLOW;
    const stdin = readStdin();
    if (!stdin)
        return ALLOW;
    const payload = safeJsonParse(stdin);
    if (!payload)
        return ALLOW;
    const home = resolveHomeDir();
    if (!home)
        return ALLOW;
    const projectRoot = resolveProjectRoot(payload);
    const instinctsProjectDir = join(resolveInstinctsRoot(home), projectHash(projectRoot));
    const goalMarkdown = readGoalMarkdown(projectRoot, instinctsProjectDir);
    const observations = readObservations(instinctsProjectDir);
    const textLength = payload.transcript_path && existsSync(payload.transcript_path)
        ? lastAssistantTextLength(payload.transcript_path)
        : 0;
    const decision = evaluateGoalDrift({ goalMarkdown, observations, textLength, mode });
    persistState(instinctsProjectDir, {
        status: decision.status,
        score: decision.score,
        action: decision.action,
    });
    if (decision.action === "block")
        return { kind: "continue", reason: decision.reason };
    if (decision.action === "warn") {
        return { kind: "allow", notices: [`[continuous-improvement] goal-drift: ${decision.reason}`] };
    }
    return ALLOW;
}
function main() {
    try {
        return decideGoalDrift();
    }
    catch {
        // fail open — never block the session due to a hook bug
        return ALLOW;
    }
}
emit(encode(AGENT, EVENT, main()));
