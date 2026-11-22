/**
 * agent-env: CI_* aliases for the CLAUDE_* knobs the hooks read (owner
 * decision "Env names" in docs/plans/2026-11-21-all-agents.md). The aliases
 * are additive. When both names are set to a non-blank value, the CLAUDE_*
 * name wins, so a Claude Code setup that already sets it behaves exactly as
 * before whatever else the shell exports.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INSTALLER_KNOB_ALIASES, KNOB_ALIASES, readKnob } from "../lib/agent-env.mjs";
describe("KNOB_ALIASES", () => {
    it("maps every CLAUDE_* knob a hook reads to its CI_* alias", () => {
        assert.deepEqual(KNOB_ALIASES, {
            CLAUDE_CI_HOOKPACK_GATE: "CI_HOOKPACK_GATE",
            CLAUDE_GOAL_DRIFT_GATE: "CI_GOAL_DRIFT_GATE",
            CLAUDE_QUERY_COST_NUDGE: "CI_QUERY_COST_NUDGE",
            CLAUDE_RECALL_BRIEFING: "CI_RECALL_BRIEFING",
            CLAUDE_THREE_SECTION_CLOSE: "CI_THREE_SECTION_CLOSE",
            CLAUDE_THREE_SECTION_CLOSE_DISABLED: "CI_THREE_SECTION_CLOSE_DISABLED",
            CLAUDE_TYPECHECK_GATE: "CI_TYPECHECK_GATE",
            CLAUDE_WORKFLOW_DISTILL_NUDGE: "CI_WORKFLOW_DISTILL_NUDGE",
        });
    });
    it("every alias is the CLAUDE_ name with the prefix swapped and CI_ not doubled", () => {
        for (const [legacy, alias] of Object.entries(KNOB_ALIASES)) {
            assert.equal(alias, `CI_${legacy.replace(/^CLAUDE_(CI_)?/, "")}`, legacy);
        }
    });
});
describe("readKnob", () => {
    it("returns the CLAUDE_* value when only it is set, untouched", () => {
        assert.equal(readKnob("CLAUDE_TYPECHECK_GATE", { CLAUDE_TYPECHECK_GATE: " Block " }), " Block ");
    });
    it("returns the CI_* value when only it is set", () => {
        assert.equal(readKnob("CLAUDE_TYPECHECK_GATE", { CI_TYPECHECK_GATE: "block" }), "block");
        assert.equal(readKnob("CLAUDE_CI_HOOKPACK_GATE", { CI_HOOKPACK_GATE: "off" }), "off");
    });
    it("the CLAUDE_* name wins when both are set", () => {
        const env = { CLAUDE_GOAL_DRIFT_GATE: "off", CI_GOAL_DRIFT_GATE: "block" };
        assert.equal(readKnob("CLAUDE_GOAL_DRIFT_GATE", env), "off");
    });
    it("a blank CLAUDE_* value counts as unset, so the alias applies", () => {
        for (const blank of ["", "  ", "\t"]) {
            const env = { CLAUDE_RECALL_BRIEFING: blank, CI_RECALL_BRIEFING: "1" };
            assert.equal(readKnob("CLAUDE_RECALL_BRIEFING", env), "1", JSON.stringify(blank));
        }
    });
    it("a blank CLAUDE_* value with no alias is returned as it was", () => {
        assert.equal(readKnob("CLAUDE_RECALL_BRIEFING", { CLAUDE_RECALL_BRIEFING: "" }), "");
        assert.equal(readKnob("CLAUDE_RECALL_BRIEFING", { CLAUDE_RECALL_BRIEFING: "", CI_RECALL_BRIEFING: " " }), "");
    });
    it("a blank alias with no CLAUDE_* value is returned as it was", () => {
        assert.equal(readKnob("CLAUDE_RECALL_BRIEFING", { CI_RECALL_BRIEFING: " " }), " ");
    });
    it("is undefined when neither is set, so each hook keeps its own default", () => {
        assert.equal(readKnob("CLAUDE_QUERY_COST_NUDGE", {}), undefined);
    });
    it("reads process.env by default", () => {
        const saved = process.env.CI_WORKFLOW_DISTILL_NUDGE;
        const savedLegacy = process.env.CLAUDE_WORKFLOW_DISTILL_NUDGE;
        delete process.env.CLAUDE_WORKFLOW_DISTILL_NUDGE;
        process.env.CI_WORKFLOW_DISTILL_NUDGE = "on";
        try {
            assert.equal(readKnob("CLAUDE_WORKFLOW_DISTILL_NUDGE"), "on");
        }
        finally {
            if (saved === undefined)
                delete process.env.CI_WORKFLOW_DISTILL_NUDGE;
            else
                process.env.CI_WORKFLOW_DISTILL_NUDGE = saved;
            if (savedLegacy !== undefined)
                process.env.CLAUDE_WORKFLOW_DISTILL_NUDGE = savedLegacy;
        }
    });
});
// PR 5 (refactor/agent-paths-bins): the ninth knob is read only by the
// installer, so it sits apart from the hook knobs (the Claude golden replay
// needs a hook golden for every entry of KNOB_ALIASES) and reads the same way.
describe("INSTALLER_KNOB_ALIASES", () => {
    it("maps the installer's CLAUDE_CI_UPDATE_CHECK to CI_UPDATE_CHECK, apart from the hook knobs", () => {
        assert.deepEqual(INSTALLER_KNOB_ALIASES, { CLAUDE_CI_UPDATE_CHECK: "CI_UPDATE_CHECK" });
        assert.equal("CLAUDE_CI_UPDATE_CHECK" in KNOB_ALIASES, false);
        for (const [legacy, alias] of Object.entries(INSTALLER_KNOB_ALIASES)) {
            assert.equal(alias, `CI_${legacy.replace(/^CLAUDE_(CI_)?/, "")}`, legacy);
        }
    });
    it("readKnob reads it like a hook knob: CLAUDE_* wins when non-blank, else the alias", () => {
        assert.equal(readKnob("CLAUDE_CI_UPDATE_CHECK", { CI_UPDATE_CHECK: "off" }), "off");
        assert.equal(readKnob("CLAUDE_CI_UPDATE_CHECK", { CLAUDE_CI_UPDATE_CHECK: "on", CI_UPDATE_CHECK: "off" }), "on");
        assert.equal(readKnob("CLAUDE_CI_UPDATE_CHECK", { CLAUDE_CI_UPDATE_CHECK: " ", CI_UPDATE_CHECK: "off" }), "off");
        assert.equal(readKnob("CLAUDE_CI_UPDATE_CHECK", {}), undefined);
    });
});
