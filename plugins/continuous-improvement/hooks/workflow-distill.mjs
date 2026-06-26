#!/usr/bin/env node
// workflow-distill.mts — Stop hook (opt-in, default off) that nudges the operator
// to persist a verified native Workflow run as a Mulahazah draft instinct via the
// ci_distill_from_workflow MCP tool. This is the one integration a per-turn
// orchestration primitive cannot do for itself: make the lesson of an expensive
// multi-agent run survive the run instead of evaporating when the turn ends — the
// fast-follow deferred in docs/plans/2026-06-08-workflow-instinct-bridge.md.
//
// Mode via CLAUDE_WORKFLOW_DISTILL_NUDGE: "on" | "off" (default).
//   - off (default): no-op. Operators who do not use native Workflows are never
//     nagged.
//   - on: if the session's observation feed shows a verified Workflow run that
//     has not already been nudged, print ONE stderr line suggesting
//     ci_distill_from_workflow. It is an amplifier, never a gate — it cannot
//     block the Stop and writes nothing to stdout.
//
// Project-hash resolution is byte-identical to bin/observe.mts and
// hooks/goal-drift-stop.mts so this hook reads the SAME observations.jsonl the
// observer writes. The "is this run verified" decision is the pure, already-tested
// workflowRunFromObservations (src/lib/skill-distill.mts), which fails closed:
// no Workflow row, unparseable meta, or no following verify-exit-0 => null => no
// nudge. Per-run dedup state lives in
// ~/.claude/instincts/<project-hash>/workflow-distill-state.json keyed by run
// name + verify command, so a run is nudged at most once. Fail-open by
// construction: any error exits 0 and never blocks. No network. 5s hook budget.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveHomeDir } from "../lib/resolve-home-dir.mjs";
import { workflowRunFromObservations } from "../lib/skill-distill.mjs";
function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
function resolveMode() {
    return (process.env.CLAUDE_WORKFLOW_DISTILL_NUDGE ?? "off").trim().toLowerCase() === "on" ? "on" : "off";
}
// Mirrors bin/observe.mts:resolveProjectRoot — the same basis the observer uses
// to bucket observations.jsonl, so the hash here resolves to the same file.
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
        // not a git repo
    }
    return "global";
}
function projectHash(root) {
    return createHash("sha256").update(root).digest("hex").slice(0, 12);
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
        // A workflow row plus its following verify both sit near the tail; a bounded
        // window keeps the 5s budget safe on a long-lived feed.
        for (const line of lines.slice(-5000)) {
            const row = safeJsonParse(line);
            if (!row)
                continue;
            out.push({
                ts: typeof row.ts === "string" ? row.ts : "",
                session: typeof row.session === "string" ? row.session : "",
                session_id: typeof row.session_id === "string" ? row.session_id : "",
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
function readNudgedKeys(instinctsProjectDir) {
    const file = join(instinctsProjectDir, "workflow-distill-state.json");
    try {
        if (!existsSync(file))
            return new Set();
        const parsed = safeJsonParse(readFileSync(file, "utf8"));
        const arr = parsed && Array.isArray(parsed.nudged) ? parsed.nudged : [];
        return new Set(arr.filter((x) => typeof x === "string"));
    }
    catch {
        return new Set();
    }
}
function persistNudged(instinctsProjectDir, keys) {
    try {
        mkdirSync(instinctsProjectDir, { recursive: true });
        writeFileSync(join(instinctsProjectDir, "workflow-distill-state.json"), JSON.stringify({ ts: new Date().toISOString(), nudged: [...keys] }) + "\n", "utf8");
    }
    catch {
        // dedup persistence is best-effort; never throw
    }
}
function main() {
    if (resolveMode() === "off")
        return;
    const home = resolveHomeDir();
    if (!home)
        return;
    const projectRoot = resolveProjectRoot();
    const instinctsProjectDir = join(home, ".claude", "instincts", projectHash(projectRoot));
    const observations = readObservations(instinctsProjectDir);
    if (observations.length === 0)
        return;
    const run = workflowRunFromObservations(observations);
    if (!run)
        return; // fail closed: no verified run, nothing to nudge
    const runKey = `${run.name}::${run.verifyCommand}`;
    const nudged = readNudgedKeys(instinctsProjectDir);
    if (nudged.has(runKey))
        return; // already nudged this run — stay quiet
    process.stderr.write(`[continuous-improvement] workflow-distill: verified workflow run "${run.name}" detected — ` +
        "run the ci_distill_from_workflow MCP tool to persist it as a Mulahazah draft instinct.\n");
    nudged.add(runKey);
    persistNudged(instinctsProjectDir, nudged);
}
try {
    main();
}
catch {
    // fail open — never block the session due to a hook bug
}
