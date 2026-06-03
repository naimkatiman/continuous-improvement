// goal-drift-gate.test.mts — unit tests for the pure goal-drift gate decision.
//
// Pure function, no filesystem. The .mjs import resolves only after
// `npm run build` regenerates the emitted artifact — per the .mts-is-source
// rule, never edit the .mjs directly.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateGoalDrift } from "../lib/goal-drift-gate.mjs";
const GOAL = `## Goal
Implement OAuth login with JWT session tokens.

## Goal Keywords
oauth, jwt, login, session
`;
function obs(p) {
    return { ts: "2026-06-03T12:00:00Z", tool: "Edit", input_summary: "", output_summary: "", ...p };
}
const ON_GOAL = [
    obs({ input_summary: "src/auth/oauth-login.ts", output_summary: "jwt session" }),
    obs({ input_summary: "src/auth/session.ts", output_summary: "login flow" }),
];
const DRIFT = [
    obs({ input_summary: "src/marketing/banner.ts" }),
    obs({ input_summary: "src/dashboard/widget.ts" }),
    obs({ input_summary: "docs/roadmap.md" }),
];
const LONG = 800; // >= the 600 wrap-up threshold
const SHORT = 100;
describe("evaluateGoalDrift", () => {
    it("allows when there is no goal source", () => {
        const d = evaluateGoalDrift({ goalMarkdown: "", observations: DRIFT, textLength: LONG, mode: "warn" });
        assert.equal(d.action, "allow");
        assert.equal(d.status, "no-goal");
    });
    it("allows when there are no observations (no-data)", () => {
        const d = evaluateGoalDrift({ goalMarkdown: GOAL, observations: [], textLength: LONG, mode: "block" });
        assert.equal(d.action, "allow");
        assert.equal(d.status, "no-data");
    });
    it("allows when recent work is on-goal", () => {
        const d = evaluateGoalDrift({ goalMarkdown: GOAL, observations: ON_GOAL, textLength: LONG, mode: "block" });
        assert.equal(d.action, "allow");
        assert.equal(d.status, "on-goal");
    });
    it("does not gate a short reply even when drifting (not a wrap-up)", () => {
        const d = evaluateGoalDrift({ goalMarkdown: GOAL, observations: DRIFT, textLength: SHORT, mode: "block" });
        assert.equal(d.action, "allow");
        assert.equal(d.status, "drift");
    });
    it("warns on drift in a substantive wrap-up when mode=warn", () => {
        const d = evaluateGoalDrift({ goalMarkdown: GOAL, observations: DRIFT, textLength: LONG, mode: "warn" });
        assert.equal(d.action, "warn");
        assert.equal(d.status, "drift");
        assert.match(d.reason, /DRIFT/i);
    });
    it("blocks on drift in a substantive wrap-up when mode=block", () => {
        const d = evaluateGoalDrift({ goalMarkdown: GOAL, observations: DRIFT, textLength: LONG, mode: "block" });
        assert.equal(d.action, "block");
        assert.equal(d.status, "drift");
    });
    it("never acts when mode=off, even on drift", () => {
        const d = evaluateGoalDrift({ goalMarkdown: GOAL, observations: DRIFT, textLength: LONG, mode: "off" });
        assert.equal(d.action, "allow");
    });
});
