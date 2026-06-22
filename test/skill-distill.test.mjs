// skill-distill.test.mts — unit tests for trajectory → draft-skill distillation.
//
// Pure functions, no filesystem. The .mjs import resolves only after
// `npm run build` regenerates the emitted artifact — per the .mts-is-source
// rule, never edit the .mjs directly.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { draftFromCandidate, draftFromWorkflowRun, extractTrajectories, findCandidates, formatCandidates, serializeDraft, workflowRunFromObservations, } from "../lib/skill-distill.mjs";
let clock = Date.parse("2026-05-28T12:00:00Z");
function obs(tool, partial = {}) {
    clock += 30_000; // 30s apart — within the gap window
    return { ts: new Date(clock).toISOString(), session: "s1", tool, input_summary: "", output_summary: "", ...partial };
}
// A successful trajectory: edit/test loop ending in a passing verify.
function successfulRun(sessionId) {
    clock = Date.parse(`2026-05-2${sessionId.length}T08:00:00Z`);
    return [
        obs("Read", { session: sessionId, input_summary: "src/parser.ts" }),
        obs("Edit", { session: sessionId, input_summary: "src/parser.test.ts" }),
        obs("Bash", { session: sessionId, input_summary: "npm test -- parser", output_summary: "3 passing" }),
        obs("Edit", { session: sessionId, input_summary: "src/parser.ts" }),
        obs("Bash", { session: sessionId, input_summary: "npm test -- parser", output_summary: "5 passing" }),
    ];
}
describe("extractTrajectories", () => {
    it("rejects runs shorter than the minimum length", () => {
        const short = [obs("Read"), obs("Edit"), obs("Bash")];
        assert.deepEqual(extractTrajectories(short), []);
    });
    it("splits on session change", () => {
        const observations = [...successfulRun("a"), ...successfulRun("bb")];
        const trajectories = extractTrajectories(observations);
        assert.equal(trajectories.length, 2);
        assert.equal(trajectories[0].session, "a");
        assert.equal(trajectories[1].session, "bb");
    });
    it("splits on a time gap larger than the window", () => {
        clock = Date.parse("2026-05-28T08:00:00Z");
        const first = [obs("Read"), obs("Edit"), obs("Bash"), obs("Edit")];
        clock += 60 * 60 * 1000; // +1h gap
        const second = [obs("Read"), obs("Edit"), obs("Bash"), obs("Edit")];
        const trajectories = extractTrajectories([...first, ...second]);
        assert.equal(trajectories.length, 2);
    });
    it("classifies a verify-exit-0 success", () => {
        const trajectories = extractTrajectories(successfulRun("a"));
        assert.equal(trajectories[0].succeeded, true);
        assert.equal(trajectories[0].successReason, "verify-exit-0");
    });
    it("does not mark a failing test loop as succeeded", () => {
        clock = Date.parse("2026-05-28T08:00:00Z");
        const failing = [
            obs("Read", { input_summary: "src/x.ts" }),
            obs("Edit", { input_summary: "src/x.ts" }),
            obs("Bash", { input_summary: "npm test", output_summary: "1 failing: error in x" }),
            obs("Edit", { input_summary: "src/x.ts" }),
        ];
        assert.equal(extractTrajectories(failing)[0].succeeded, false);
    });
    it("splits on unparseable timestamps (fail-closed for audit #8)", () => {
        clock = Date.parse("2026-05-28T08:00:00Z");
        const first = [
            obs("Read", { session: "s1" }),
            obs("Edit", { session: "s1" }),
            obs("Bash", { session: "s1", input_summary: "npm test", output_summary: "3 passing" }),
            obs("Edit", { session: "s1" }),
        ];
        // Next block has unparseable timestamps → must start a new trajectory.
        const badTs = [
            obs("Read", { session: "s1", ts: "not-a-timestamp" }),
            obs("Edit", { session: "s1", ts: "not-a-timestamp" }),
            obs("Bash", { session: "s1", ts: "not-a-timestamp", input_summary: "npm test", output_summary: "3 passing" }),
            obs("Edit", { session: "s1", ts: "not-a-timestamp" }),
        ];
        // Third valid run after the gap.
        clock += 60 * 60 * 1000; // +1h
        const third = [
            obs("Read", { session: "s1" }),
            obs("Edit", { session: "s1" }),
            obs("Bash", { session: "s1", input_summary: "npm test", output_summary: "3 passing" }),
            obs("Edit", { session: "s1" }),
        ];
        const trajectories = extractTrajectories([...first, ...badTs, ...third]);
        assert.equal(trajectories.length, 3, "valid block, invalid block, and post-gap block should each be their own trajectory");
        assert.equal(trajectories[0].session, "s1");
        assert.equal(trajectories[0].observations.length, 4);
        assert.equal(trajectories[1].observations.length, 4);
        assert.equal(trajectories[2].observations.length, 4);
    });
    it("splits when either side of a pair has an unparseable timestamp", () => {
        clock = Date.parse("2026-05-28T08:00:00Z");
        const validThenInvalid = [
            obs("Read", { session: "s1" }),
            obs("Edit", { session: "s1" }),
            obs("Bash", { session: "s1", input_summary: "npm test", output_summary: "3 passing" }),
            obs("Edit", { session: "s1" }),
            obs("Read", { session: "s1", ts: "invalid" }),
            obs("Edit", { session: "s1", ts: "invalid" }),
            obs("Bash", { session: "s1", ts: "invalid", input_summary: "npm test", output_summary: "3 passing" }),
            obs("Edit", { session: "s1", ts: "invalid" }),
        ];
        const trajectories = extractTrajectories(validThenInvalid);
        assert.equal(trajectories.length, 2);
    });
});
describe("findCandidates", () => {
    it("requires occurrences across multiple distinct sessions", () => {
        // Same pattern, but only one session → rejected.
        const oneSession = extractTrajectories(successfulRun("a"));
        assert.deepEqual(findCandidates(oneSession), []);
    });
    it("surfaces a pattern repeated across sessions", () => {
        const trajectories = extractTrajectories([
            ...successfulRun("a"),
            ...successfulRun("bb"),
            ...successfulRun("ccc"),
        ]);
        const candidates = findCandidates(trajectories);
        assert.ok(candidates.length > 0);
        const top = candidates[0];
        assert.ok(top.sessions.length >= 2);
        assert.ok(top.occurrences >= 3);
        assert.ok(top.ngram.includes("Bash"));
    });
    it("ignores unsuccessful trajectories", () => {
        clock = Date.parse("2026-05-28T08:00:00Z");
        const failingRun = (s) => [
            obs("Read", { session: s }),
            obs("Edit", { session: s }),
            obs("Bash", { session: s, input_summary: "npm test", output_summary: "failed" }),
            obs("Edit", { session: s }),
        ];
        const trajectories = extractTrajectories([...failingRun("a"), ...failingRun("bb"), ...failingRun("ccc")]);
        assert.deepEqual(findCandidates(trajectories), []);
    });
    it("counts overlapping windows toward occurrences (contract-pinning for audit #10)", () => {
        // A single successful trajectory where the same 3-gram repeats in non-overlapping
        // windows: [Read, Edit, Bash, Read, Edit, Bash, Read, Edit, Bash].
        // 3-gram [Read, Edit, Bash] appears at indices 0, 3, 6 = 3 occurrences.
        // This pins the contract that occurrences counts every window, not distinct runs.
        clock = Date.parse("2026-05-28T08:00:00Z");
        const overlapping = [
            obs("Read", { session: "s1" }),
            obs("Edit", { session: "s1" }),
            obs("Bash", { session: "s1", input_summary: "npm test", output_summary: "3 passing" }),
            obs("Read", { session: "s1" }),
            obs("Edit", { session: "s1" }),
            obs("Bash", { session: "s1", input_summary: "npm test", output_summary: "3 passing" }),
            obs("Read", { session: "s1" }),
            obs("Edit", { session: "s1" }),
            obs("Bash", { session: "s1", input_summary: "npm test", output_summary: "3 passing" }),
        ];
        const trajectories = extractTrajectories(overlapping);
        assert.equal(trajectories.length, 1, "expected one trajectory");
        assert.equal(trajectories[0].succeeded, true, "expected trajectory to succeed");
        // Lower thresholds so the single-session pattern surfaces.
        const candidates = findCandidates(trajectories, { minOccurrences: 3, minSessions: 1 });
        const reb = candidates.find((c) => c.ngram.join(">") === "Read>Edit>Bash");
        assert.ok(reb, "expected 3-gram Read>Edit>Bash to be mined");
        assert.equal(reb.occurrences, 3, "every matching window within one trajectory increments occurrences");
    });
});
describe("draftFromCandidate + serializeDraft", () => {
    const trajectories = extractTrajectories([
        ...successfulRun("a"),
        ...successfulRun("bb"),
        ...successfulRun("ccc"),
    ]);
    const candidate = findCandidates(trajectories)[0];
    it("produces a stable id from the ngram", () => {
        const draft = draftFromCandidate(candidate);
        assert.equal(draft.id, candidate.id);
        assert.equal(draftFromCandidate(candidate).id, draft.id);
    });
    it("starts a draft at low confidence with a non-empty body", () => {
        const draft = draftFromCandidate(candidate);
        assert.equal(draft.confidence, 0.4);
        assert.ok(draft.body.length > 0);
    });
    it("serializes to instinct YAML with a body after the divider", () => {
        const yaml = serializeDraft(draftFromCandidate(candidate));
        assert.match(yaml, /^id: draft-/m);
        assert.match(yaml, /status: draft/);
        assert.match(yaml, /\n---\n/);
        assert.match(yaml, /source: distilled/);
    });
});
describe("formatCandidates", () => {
    it("renders an empty-state message", () => {
        assert.match(formatCandidates([]), /No distillation candidates/);
    });
    it("renders candidates with promote instructions", () => {
        const trajectories = extractTrajectories([
            ...successfulRun("a"),
            ...successfulRun("bb"),
            ...successfulRun("ccc"),
        ]);
        const out = formatCandidates(findCandidates(trajectories));
        assert.match(out, /Distillation Candidates/);
        assert.match(out, /ci_distill_promote/);
    });
});
describe("findCandidates — id path-safety (audit #7)", () => {
    function trajectoryWith(tools, sessionId) {
        return {
            observations: tools.map((tool) => ({
                tool,
                session: sessionId,
                ts: "2026-05-28T08:00:00Z",
                input_summary: "",
                output_summary: "",
            })),
            session: sessionId,
            startTs: "2026-05-28T08:00:00Z",
            endTs: "2026-05-28T08:05:00Z",
            succeeded: true,
            successReason: "verify-exit-0",
        };
    }
    it("emits a filesystem-safe id even when tool names contain path-traversal characters", () => {
        const tools = ["../../etc", "Edit", "Bash"];
        const candidates = findCandidates([trajectoryWith(tools, "a"), trajectoryWith(tools, "b"), trajectoryWith(tools, "c")], { minOccurrences: 1, minSessions: 2 });
        assert.ok(candidates.length > 0, "expected a mined candidate");
        for (const candidate of candidates) {
            assert.doesNotMatch(candidate.id, /[\\/]|\.\./, `candidate id must not contain path separators or traversal: ${candidate.id}`);
        }
    });
});
describe("workflowRunFromObservations + draftFromWorkflowRun (workflow bridge)", () => {
    const goodScript = [
        "export const meta = {",
        "  name: 'fix-flaky-tests',",
        "  description: 'Find flaky tests and propose fixes',",
        "  phases: [{ title: 'Scan' }, { title: 'Fix' }],",
        "}",
        "phase('Scan')",
        "const x = await agent('do it')",
    ].join("\n");
    // input_summary on a real Workflow row is the script wrapped as {"script":"..."}.
    function wfRow(script) {
        return obs("Workflow", { input_summary: JSON.stringify({ script }) });
    }
    function verifyRow() {
        return obs("Bash", { input_summary: "npm run verify:all", output_summary: "OK all passing" });
    }
    it("returns null when there is no Workflow row", () => {
        assert.equal(workflowRunFromObservations([obs("Read"), obs("Edit"), verifyRow()]), null);
    });
    it("returns null when the Workflow row has an empty input_summary", () => {
        assert.equal(workflowRunFromObservations([obs("Workflow", { input_summary: "" }), verifyRow()]), null);
    });
    it("returns null for a launched workflow with no following verify (async_launched is not success)", () => {
        assert.equal(workflowRunFromObservations([obs("Read"), wfRow(goodScript), obs("Read")]), null);
    });
    it("returns the run when a Workflow row is followed by a passing verify", () => {
        const run = workflowRunFromObservations([obs("Read"), wfRow(goodScript), verifyRow()]);
        assert.ok(run, "expected a workflow run");
        assert.equal(run.name, "fix-flaky-tests");
        assert.equal(run.description, "Find flaky tests and propose fixes");
        assert.deepEqual(run.phases, ["Scan", "Fix"]);
        assert.match(run.verifyCommand, /verify:all/);
    });
    it("fails closed on a truncated script whose meta name was cut off", () => {
        assert.equal(workflowRunFromObservations([wfRow("export const meta = {\n  "), verifyRow()]), null);
    });
    it("parses meta when the script is truncated after the phases (real feed shape)", () => {
        const truncated = goodScript.slice(0, goodScript.indexOf("phase('Scan')") + 5);
        const run = workflowRunFromObservations([wfRow(truncated), verifyRow()]);
        assert.ok(run);
        assert.equal(run.name, "fix-flaky-tests");
        assert.deepEqual(run.phases, ["Scan", "Fix"]);
    });
    it("draftFromWorkflowRun emits a filesystem-safe id and a low-confidence non-empty body", () => {
        const draft = draftFromWorkflowRun({
            name: "../../etc/passwd",
            description: "hostile",
            phases: ["A", "B"],
            verifyCommand: "npm test",
        });
        assert.doesNotMatch(draft.id, /[\\/]|\.\./, `id must be path-safe: ${draft.id}`);
        assert.equal(draft.confidence, 0.4);
        assert.ok(draft.body.length > 0);
    });
    it("serializeDraft round-trips a workflow draft to instinct YAML with a body", () => {
        const run = {
            name: "ship-release",
            description: "cut a release",
            phases: ["Plan", "Build", "Verify"],
            verifyCommand: "npm run verify:all",
        };
        const yaml = serializeDraft(draftFromWorkflowRun(run));
        assert.match(yaml, /^id: draft-workflow-ship-release/m);
        assert.match(yaml, /status: draft/);
        assert.match(yaml, /\n---\n/);
        assert.match(yaml, /Plan → Build → Verify/);
    });
    it("scopes phase titles to the phases array, ignoring inline agent/step title fields", () => {
        const scriptWithNestedTitle = [
            "export const meta = {",
            "  name: 'scoped-wf',",
            "  description: 'real intent',",
            "  phases: [{ title: 'Scan' }],",
            "}",
            "phase('Scan')",
            "const r = await agent('x', { title: 'inline-label' })",
        ].join("\n");
        const run = workflowRunFromObservations([wfRow(scriptWithNestedTitle), verifyRow()]);
        assert.ok(run);
        assert.equal(run.description, "real intent");
        assert.deepEqual(run.phases, ["Scan"], "an inline agent title: must not be captured as a phase");
    });
    it("does not count a verify from a different session as proof of the run", () => {
        const wf = obs("Workflow", { session: "A", input_summary: JSON.stringify({ script: goodScript }) });
        const otherSessionVerify = obs("Bash", {
            session: "B",
            input_summary: "npm run verify:all",
            output_summary: "OK all passing",
        });
        assert.equal(workflowRunFromObservations([wf, otherSessionVerify]), null);
    });
});
describe("extractTrajectories — event field preservation (regression)", () => {
    it("preserves the event field on observations passed through extraction", () => {
        clock = Date.parse("2026-05-28T08:00:00Z");
        const observations = [
            obs("Read", { session: "ev1", input_summary: "src/a.ts", event: "PreToolUse" }),
            obs("Edit", { session: "ev1", input_summary: "src/a.test.ts", event: "PostToolUse" }),
            obs("Bash", { session: "ev1", input_summary: "npm test", output_summary: "3 passing", event: "PostToolUse" }),
            obs("Edit", { session: "ev1", input_summary: "src/a.ts", event: "Stop" }),
        ];
        const trajectories = extractTrajectories(observations);
        assert.equal(trajectories.length, 1);
        const events = trajectories[0].observations.map((o) => o.event);
        assert.deepEqual(events, ["PreToolUse", "PostToolUse", "PostToolUse", "Stop"]);
    });
    it("leaves event undefined when it was never set", () => {
        clock = Date.parse("2026-05-28T08:00:00Z");
        const observations = [
            obs("Read", { session: "ev2", input_summary: "src/b.ts" }),
            obs("Edit", { session: "ev2", input_summary: "src/b.test.ts" }),
            obs("Bash", { session: "ev2", input_summary: "npm test", output_summary: "5 passing" }),
            obs("Edit", { session: "ev2", input_summary: "src/b.ts" }),
        ];
        const trajectories = extractTrajectories(observations);
        assert.equal(trajectories.length, 1);
        for (const o of trajectories[0].observations) {
            assert.equal(o.event, undefined);
        }
    });
});
