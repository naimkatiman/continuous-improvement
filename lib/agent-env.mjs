// agent-env.mts — CI_* aliases for the CLAUDE_* knobs the hooks read, so a
// user of another coding agent can configure the hooks without a CLAUDE_ name
// (owner decision "Env names" in docs/plans/2026-11-21-all-agents.md).
//
// The aliases are additive: every CLAUDE_* name keeps working. When both names
// are set to a non-blank value the CLAUDE_* one wins, so a Claude Code setup
// that already sets it behaves exactly as before whatever the shell exports.
export const KNOB_ALIASES = {
    CLAUDE_CI_HOOKPACK_GATE: "CI_HOOKPACK_GATE",
    CLAUDE_GOAL_DRIFT_GATE: "CI_GOAL_DRIFT_GATE",
    CLAUDE_QUERY_COST_NUDGE: "CI_QUERY_COST_NUDGE",
    CLAUDE_RECALL_BRIEFING: "CI_RECALL_BRIEFING",
    CLAUDE_THREE_SECTION_CLOSE: "CI_THREE_SECTION_CLOSE",
    CLAUDE_THREE_SECTION_CLOSE_DISABLED: "CI_THREE_SECTION_CLOSE_DISABLED",
    CLAUDE_TYPECHECK_GATE: "CI_TYPECHECK_GATE",
    CLAUDE_WORKFLOW_DISTILL_NUDGE: "CI_WORKFLOW_DISTILL_NUDGE",
};
const isSet = (value) => value !== undefined && value.trim() !== "";
/**
 * The raw value of a knob: the CLAUDE_* name when it is non-blank, else the
 * CI_* alias when it is non-blank, else whichever of the two is defined (so a
 * blank CLAUDE_* value reaches the hook exactly as before), else undefined.
 * Each hook still parses the value and applies its own default.
 */
export function readKnob(name, env = process.env) {
    const legacy = env[name];
    if (isSet(legacy))
        return legacy;
    const alias = env[KNOB_ALIASES[name]];
    if (isSet(alias))
        return alias;
    return legacy ?? alias;
}
