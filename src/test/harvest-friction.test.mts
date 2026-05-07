// harvest-friction.test.mts — TDD tests for the friction-harvest classifier.
//
// PR D of the second-release train (item 8). The classifier turns observation
// rows from ~/.claude/instincts/<hash>/observations.jsonl into typed instincts
// (wrong_approach, buggy_code, env_issue, permission_block) with confidence
// scoring, idempotency on re-run, and explicit handling of the thin-vs-rich
// schema split documented in src/lib/observe-event.mts.
//
// These tests run RED-first against an as-yet-unwritten src/bin/harvest-friction.mts.
// The .mjs import below resolves only after `npm run build` regenerates the
// emitted artifact — that is intentional. Per the .mts-is-source rule, never
// edit the .mjs directly.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  aggregateInstincts,
  classifyObservation,
  computeDedupKey,
  type ObservationRow,
} from "../bin/harvest-friction.mjs";

const T0 = "2026-04-30T12:00:00Z";
const T1 = "2026-05-05T12:00:00Z";
const T2 = "2026-05-07T12:00:00Z";

function row(partial: Partial<ObservationRow> & { tool: string }): ObservationRow {
  return {
    ts: T2,
    event: "tool_complete",
    session: "test-session",
    input_summary: "",
    output_summary: "",
    project_id: "test-project",
    project_name: "test",
    ...partial,
  };
}

describe("classifyObservation", () => {
  it("classifies Bash 'command not found' as env_issue", () => {
    const r = row({
      tool: "Bash",
      input_summary: "jq -r .deployments[0].sha",
      output_summary: "bash: jq: command not found",
    });
    const c = classifyObservation(r);
    assert.equal(c?.type, "env_issue");
    assert.equal(c?.tool, "Bash");
    assert.match(c?.summary ?? "", /command not found/);
  });

  it("classifies Bash 'Permission denied' / sandbox as permission_block", () => {
    const r = row({
      tool: "Bash",
      input_summary: "git push origin main",
      output_summary: "Permission denied: harness blocked direct push to main",
    });
    const c = classifyObservation(r);
    assert.equal(c?.type, "permission_block");
  });

  it("classifies Edit 'file has not been read' as buggy_code", () => {
    const r = row({
      tool: "Edit",
      input_summary: "skills/deploy-receipt.md",
      output_summary: "Error: file has not been read yet",
    });
    const c = classifyObservation(r);
    assert.equal(c?.type, "buggy_code");
  });

  it("classifies Edit 'file changed since last read' as wrong_approach", () => {
    const r = row({
      tool: "Edit",
      input_summary: "skills/superpowers.md",
      output_summary: "file changed since last read — possibly by another session",
    });
    const c = classifyObservation(r);
    assert.equal(c?.type, "wrong_approach");
  });

  it("returns null for tool_start events (no failure signal yet)", () => {
    const r = row({ tool: "Bash", event: "tool_start", output_summary: "" });
    assert.equal(classifyObservation(r), null);
  });

  it("returns null for thin-schema rows (no input_summary/output_summary)", () => {
    const r: ObservationRow = {
      ts: T2,
      event: "tool_complete",
      session: "test-session",
      tool: "Bash",
      project_id: "test-project",
      project_name: "test",
    };
    assert.equal(classifyObservation(r), null);
  });

  it("accepts historical rows with tool_response field (pre-PR #67 schema)", () => {
    // observe-event.mts normalises tool_response -> tool_output at the boundary,
    // so the classifier sees a unified output_summary field. The classifier MUST
    // therefore classify a synthetic row identical to what the boundary emits
    // for a pre-2026-05-06T00:38Z observation. This is the project_observer_field_name_bug.md
    // compatibility lock.
    const r = row({
      tool: "Bash",
      input_summary: "wrangler tail",
      output_summary: "Permission denied: harness blocked wrangler tail",
    });
    const c = classifyObservation(r);
    assert.equal(c?.type, "permission_block");
  });
});

describe("computeDedupKey", () => {
  it("is stable across re-runs for identical (type, tool, summary)", () => {
    const a = computeDedupKey({
      type: "env_issue",
      tool: "Bash",
      summary: "bash: jq: command not found",
    });
    const b = computeDedupKey({
      type: "env_issue",
      tool: "Bash",
      summary: "bash: jq: command not found",
    });
    assert.equal(a, b);
  });

  it("differs when type differs", () => {
    const a = computeDedupKey({ type: "env_issue", tool: "Bash", summary: "x" });
    const b = computeDedupKey({ type: "buggy_code", tool: "Bash", summary: "x" });
    assert.notEqual(a, b);
  });

  it("ignores summary text past 120 chars (truncation contract)", () => {
    const long120 = "a".repeat(120);
    const long500 = "a".repeat(500);
    const a = computeDedupKey({ type: "env_issue", tool: "Bash", summary: long120 });
    const b = computeDedupKey({ type: "env_issue", tool: "Bash", summary: long500 });
    assert.equal(a, b);
  });
});

describe("aggregateInstincts", () => {
  it("merges duplicate (type, tool, summary) rows into one instinct with occurrence_count", () => {
    const c = [
      { type: "env_issue" as const, tool: "Bash", summary: "jq missing", evidence_ts: T0, dedup_key: "k" },
      { type: "env_issue" as const, tool: "Bash", summary: "jq missing", evidence_ts: T1, dedup_key: "k" },
      { type: "env_issue" as const, tool: "Bash", summary: "jq missing", evidence_ts: T2, dedup_key: "k" },
    ];
    const instincts = aggregateInstincts(c);
    assert.equal(instincts.length, 1);
    assert.equal(instincts[0].occurrence_count, 3);
    assert.equal(instincts[0].first_seen, T0);
    assert.equal(instincts[0].last_seen, T2);
  });

  it("weights confidence higher for recent than old (recency-decay)", () => {
    const old = [
      { type: "env_issue" as const, tool: "Bash", summary: "x", evidence_ts: T0, dedup_key: "old" },
    ];
    const fresh = [
      { type: "env_issue" as const, tool: "Bash", summary: "y", evidence_ts: T2, dedup_key: "fresh" },
    ];
    const oldInstinct = aggregateInstincts(old)[0];
    const freshInstinct = aggregateInstincts(fresh)[0];
    assert.ok(freshInstinct.confidence > oldInstinct.confidence,
      `recent confidence (${freshInstinct.confidence}) should exceed old confidence (${oldInstinct.confidence})`);
  });

  it("returns empty array for empty input (idempotent zero case)", () => {
    assert.deepEqual(aggregateInstincts([]), []);
  });
});
