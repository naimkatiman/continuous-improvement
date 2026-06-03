// goal-drift-gate.mts — Pure decision core for the goal-drift Stop hook.
//
// No I/O. Given a goal-plan body, recent observations, the length of the last
// assistant reply, and the operator's mode, decide whether the Stop hook should
// allow / warn / block. The hook (src/hooks/goal-drift-stop.mts) wires the file
// reads around this function; keeping it pure lets the unit tests cover every
// branch without touching the filesystem.
//
// Fail-open by construction: any state that is not a confident DRIFT on a
// substantive wrap-up returns "allow".
import { parseGoalFromPlan, scoreObservations, } from "./goal-state.mjs";
// Matches the three-section-close wrap-up threshold: a substantive Stop reply is
// a completion report. This is the non-lexical "claims done" proxy — no keyword
// matching, so it cannot false-fire on the word "done" in ordinary prose.
const MIN_LENGTH_TO_GATE = 600;
export function evaluateGoalDrift(input) {
    const { goalMarkdown, observations, textLength, mode } = input;
    if (mode === "off") {
        return { action: "allow", status: "no-goal", score: 0, reason: "Goal-drift gate disabled (mode=off)." };
    }
    const goal = parseGoalFromPlan(goalMarkdown);
    if (!goal) {
        return {
            action: "allow",
            status: "no-goal",
            score: 0,
            reason: "No '## Goal' section found; nothing to gate against.",
        };
    }
    const report = scoreObservations(observations, goal);
    if (report.status === "no-data") {
        return { action: "allow", status: "no-data", score: 0, reason: "Not enough recent observations to judge drift." };
    }
    if (report.status === "on-goal") {
        return { action: "allow", status: "on-goal", score: report.score, reason: report.reason };
    }
    // report.status === "drift"
    if (textLength < MIN_LENGTH_TO_GATE) {
        return {
            action: "allow",
            status: "drift",
            score: report.score,
            reason: "Drift detected, but the reply is too short to be a wrap-up; not gating.",
        };
    }
    const pct = Math.round(report.score * 100);
    const reason = `Session has DRIFTed from the stated goal (${report.matching}/${report.total} recent actions on-goal, ${pct}%). ` +
        "Re-check the work against the '## Goal' in task_plan.md — or update the goal if it has legitimately changed — before closing.";
    return { action: mode === "block" ? "block" : "warn", status: "drift", score: report.score, reason };
}
