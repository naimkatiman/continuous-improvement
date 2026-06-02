// skill-distill.test.mts — unit tests for trajectory → draft-skill distillation.
//
// Pure functions, no filesystem. The .mjs import resolves only after
// `npm run build` regenerates the emitted artifact — per the .mts-is-source
// rule, never edit the .mjs directly.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  draftFromCandidate,
  extractTrajectories,
  findCandidates,
  formatCandidates,
  serializeDraft,
  type DistillObservation,
  type Trajectory,
} from "../lib/skill-distill.mjs";

let clock = Date.parse("2026-05-28T12:00:00Z");
function obs(tool: string, partial: Partial<DistillObservation> = {}): DistillObservation {
  clock += 30_000; // 30s apart — within the gap window
  return { ts: new Date(clock).toISOString(), session: "s1", tool, input_summary: "", output_summary: "", ...partial };
}

// A successful trajectory: edit/test loop ending in a passing verify.
function successfulRun(sessionId: string): DistillObservation[] {
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
    assert.equal(trajectories[0]!.session, "a");
    assert.equal(trajectories[1]!.session, "bb");
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
    assert.equal(trajectories[0]!.succeeded, true);
    assert.equal(trajectories[0]!.successReason, "verify-exit-0");
  });

  it("does not mark a failing test loop as succeeded", () => {
    clock = Date.parse("2026-05-28T08:00:00Z");
    const failing = [
      obs("Read", { input_summary: "src/x.ts" }),
      obs("Edit", { input_summary: "src/x.ts" }),
      obs("Bash", { input_summary: "npm test", output_summary: "1 failing: error in x" }),
      obs("Edit", { input_summary: "src/x.ts" }),
    ];
    assert.equal(extractTrajectories(failing)[0]!.succeeded, false);
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
    const top = candidates[0]!;
    assert.ok(top.sessions.length >= 2);
    assert.ok(top.occurrences >= 3);
    assert.ok(top.ngram.includes("Bash"));
  });

  it("ignores unsuccessful trajectories", () => {
    clock = Date.parse("2026-05-28T08:00:00Z");
    const failingRun = (s: string): DistillObservation[] => [
      obs("Read", { session: s }),
      obs("Edit", { session: s }),
      obs("Bash", { session: s, input_summary: "npm test", output_summary: "failed" }),
      obs("Edit", { session: s }),
    ];
    const trajectories = extractTrajectories([...failingRun("a"), ...failingRun("bb"), ...failingRun("ccc")]);
    assert.deepEqual(findCandidates(trajectories), []);
  });
});

describe("draftFromCandidate + serializeDraft", () => {
  const trajectories = extractTrajectories([
    ...successfulRun("a"),
    ...successfulRun("bb"),
    ...successfulRun("ccc"),
  ]);
  const candidate = findCandidates(trajectories)[0]!;

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
  function trajectoryWith(tools: string[], sessionId: string): Trajectory {
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
    const candidates = findCandidates(
      [trajectoryWith(tools, "a"), trajectoryWith(tools, "b"), trajectoryWith(tools, "c")],
      { minOccurrences: 1, minSessions: 2 },
    );
    assert.ok(candidates.length > 0, "expected a mined candidate");
    for (const candidate of candidates) {
      assert.doesNotMatch(
        candidate.id,
        /[\\/]|\.\./,
        `candidate id must not contain path separators or traversal: ${candidate.id}`,
      );
    }
  });
});
