// loop-stages.mts — The two pillars and the loop, as data.
//
// The owner's direction of 2026-11-25: two pillars, ambition (the be-ambitious
// skill) and discipline (hooks, a local log, switches), joined by one loop of
// seven steps in this order: research, plan, implement, review, contemplate,
// relearn and learn, iterate. Each step restates one law of the core skill
// (SKILL.md) without renumbering it, so step 6 is Law 7 and step 7 is Law 6.
//
// Each step carries one of four marks, and the docs never blur them:
//   refuses by default          a hook answers deny before the call runs
//   off until you switch it on  the hook ships and waits for a variable
//   records and loads           a hook logs or prints, and cannot refuse
//   none                        a written rule; no code checks it
//
// The README loop table (bin/check-agent-matrix.mjs splices it between the
// loop-table markers and fails on drift), assets/readme/pillars-loop.svg
// (bin/render-readme-assets.mjs) and the loop line of SKILL.md are rendered
// from this table. test/loop-stages.test.mjs ties it to the law headings in
// SKILL.md, to the hook files on disk and to the plugin's hook registrations.
// Every agent count comes from lib/agent-support.mjs; none is typed. Pure: no
// I/O.
import { HOOK_AGENT_IDS, PLUGIN_AGENT_IDS } from "./agent-install-plans.mjs";
import { AGENT_SUPPORT, blocksPreTool } from "./agent-support.mjs";
import { COMMIT_FILE_LIMIT } from "./hook-pack-gate.mjs";
import { TARGET_IDS } from "./install-targets.mjs";
import { MAX_LESSONS } from "./lesson-render.mjs";
export const LOOP_TABLE_START = "<!-- loop-table:start -->";
export const LOOP_TABLE_END = "<!-- loop-table:end -->";
export const HEADLINE = "Aim high. Stay in control.";
/** The two pillars. Ambition is a skill, so guidance; discipline is code that runs on the user's machine. */
export const PILLARS = [
    { name: "Ambition", claim: "you have big goals", ships: "be-ambitious", shipsIsName: true, kind: "a skill: guidance the agent reads" },
    { name: "Discipline", claim: "you control the AI", ships: "hooks, a log, switches", shipsIsName: false, kind: "Node scripts on your machine" },
];
export const LOOP_MARKS = ["refuses by default", "off until you switch it on", "records and loads", "none"];
/** What each mark means, in the words the README legend uses. */
export const MARK_MEANING = {
    "refuses by default": "a hook answers deny before the call runs",
    "off until you switch it on": "the hook ships and does nothing until you set the variable",
    "records and loads": "a hook writes a log row or prints saved lessons, and cannot refuse anything",
    none: "text the agent is given, and nothing checks it",
};
export function loopFacts(rows = AGENT_SUPPORT) {
    const working = rows.filter((row) => blocksPreTool(row));
    const name = (row) => row.names[0] ?? row.id;
    const installs = new Set([...HOOK_AGENT_IDS, ...PLUGIN_AGENT_IDS]);
    return {
        agents: working.length,
        stopGate: working.filter((row) => row.stopGate === true).length,
        lessonsByHook: working.filter((row) => row.lessons === "hook").length,
        lessonsByRulesFile: working.filter((row) => row.lessons === "rules file").map(name),
        lessonsNone: working.filter((row) => row.lessons === "none").map(name),
        rulesFile: working.filter((row) => row.id !== "claude" && TARGET_IDS.includes(row.id)).map(name),
        targetIds: working.filter((row) => installs.has(row.id)).map((row) => row.id),
    };
}
const link = (file) => `[\`${file}\`](${file})`;
const LINTER = "[transcript linter](#unattended-runs-and-ci)";
/** The seven steps, in the owner's order. */
export const LOOP_STAGES = [
    {
        name: "Research",
        law: 1,
        lawTitle: "Research Before Executing",
        mark: "refuses by default",
        hooks: [{ file: "hooks/gateguard.mjs", event: "PreToolUse" }],
        defaultMode: "on",
        switch: "CI_GATEGUARD_FILE_GATE=off",
        given: "The rule: find what exists, the constraints and what can break before acting. Skills `recall`, `reconcile`, `grill-me`, `roast`. The `ci_recall` MCP tool searches the log when called",
        does: () => `${link("hooks/gateguard.mjs")} denies an edit of an existing file when the session's log shows no read of it. It checks that one thing. Switch: \`CI_GATEGUARD_FILE_GATE=off\``,
        covers: "an edit with no read",
    },
    {
        name: "Plan",
        law: 2,
        lawTitle: "Plan Is Sacred",
        mark: "off until you switch it on",
        hooks: [{ file: "hooks/goal-drift-stop.mjs", event: "Stop" }],
        defaultMode: "warn",
        switch: "CI_GOAL_DRIFT_GATE=block",
        given: "The rule: state what you will build, what you will not, how you will verify, and the fallback. `be-ambitious` tells the agent to set the goal and a target first. `ci_plan_init` writes `task_plan.md`, and `ci_goal_check` scores recent calls against its `## Goal`",
        does: () => `${link("hooks/goal-drift-stop.mjs")} with \`CI_GOAL_DRIFT_GATE=block\` sends a drifted wrap-up back. Shown to work on Claude Code only: it reads the reply from a Claude Code transcript. No hook requires a plan before the first edit`,
        covers: "Claude Code only",
    },
    {
        name: "Implement",
        law: 3,
        lawTitle: "One Thing at a Time",
        mark: "refuses by default",
        hooks: [
            { file: "hooks/gateguard.mjs", event: "PreToolUse" },
            { file: "hooks/hook-pack.mjs", event: "PreToolUse", optIn: true },
        ],
        defaultMode: "on",
        switch: "",
        given: "The rule: finish and verify one task before the next. Skills `tdd-workflow`, `ship`, `worktree-safety`",
        does: () => `${link("hooks/gateguard.mjs")} denies destructive commands on every matching call, with no switch. With \`CI_HOOKPACK_GATE=block\`, ${link("hooks/hook-pack.mjs")} denies a push to \`main\`, \`master\` or \`release/*\` and a commit staging more than ${COMMIT_FILE_LIMIT} files. No hook checks "one thing at a time" itself`,
        covers: "destructive commands",
    },
    {
        name: "Review",
        law: 4,
        lawTitle: "Verify Before Reporting",
        mark: "off until you switch it on",
        hooks: [{ file: "hooks/typecheck-stop.mjs", event: "Stop" }],
        defaultMode: "off",
        switch: "CI_TYPECHECK_GATE=block",
        given: "The rule: done means the code ran and the result was checked. Skills `verification-loop`, `simplicity-review`, `audit`",
        does: (f) => `${link("hooks/typecheck-stop.mjs")} with \`CI_TYPECHECK_GATE=block\` holds the turn open on a failing typecheck. TypeScript only, on the ${f.stopGate} agents with a Stop gate. No hook runs tests, lint or a build. After the run, the ${LINTER} flags a code change with no test or build command`,
        covers: "TypeScript only",
    },
    {
        name: "Contemplate",
        law: 5,
        lawTitle: "Reflect After Every Session",
        mark: "none",
        hooks: [],
        defaultMode: "none",
        switch: "",
        given: "The reflection block: what worked, what failed, what to do differently, the rule to add, the next three moves. The `ci_reflect` MCP tool returns the template and stores nothing",
        does: () => "A written rule",
        covers: "",
    },
    {
        name: "Relearn and learn",
        law: 7,
        lawTitle: "Learn From Every Session",
        mark: "records and loads",
        hooks: [
            { file: "bin/observe.mjs", event: "PostToolUse" },
            { file: "hooks/session.mjs", event: "SessionStart" },
        ],
        defaultMode: "on",
        switch: "CI_INSTINCT_LOAD=off",
        given: "Lessons you or the agent save with `ci_create_instinct` and strengthen or weaken with `ci_reinforce`. Skill `skill-distillation`",
        does: (f) => `${link("bin/observe.mjs")} logs each tool call that runs. ${link("hooks/session.mjs")} prints up to ${MAX_LESSONS} saved lessons at session start (\`CI_INSTINCT_LOAD=off\` stops it): by hook on ${f.lessonsByHook} agents, through a rules file you rewrite on ${f.lessonsByRulesFile.length}, not at all on ${f.lessonsNone.length}. Nothing saves, applies or fades a lesson for you`,
        covers: "",
    },
    {
        name: "Iterate",
        law: 6,
        lawTitle: "Iterate Means One Thing",
        mark: "none",
        hooks: [],
        defaultMode: "none",
        switch: "",
        given: "The rule: one change, verify, next change. The three next moves from step 5 start the next pass",
        does: () => `Nothing in the session. After a run, the ${LINTER} flags more than 8 files edited`,
        covers: "",
    },
];
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
/** A mark as the docs print it: the first letter in capitals. */
export function markLabel(mark) {
    return capital(mark);
}
/** How many steps carry each mark, in LOOP_MARKS order. */
export function markCounts(stages = LOOP_STAGES) {
    const count = (mark) => stages.filter((stage) => stage.mark === mark).length;
    return {
        "refuses by default": count("refuses by default"),
        "off until you switch it on": count("off until you switch it on"),
        "records and loads": count("records and loads"),
        none: count("none"),
    };
}
/** The loop on one line, with each step's law number: the line SKILL.md carries under "The Loop". */
export function renderLoopLine(stages = LOOP_STAGES) {
    return stages.map((stage) => `${stage.name} (Law ${stage.law})`).join(" → ");
}
/** The step names in order, lower case and comma-separated, as the npm description lists them. */
export function loopWords(stages = LOOP_STAGES) {
    return stages.map((stage) => stage.name.toLowerCase()).join(", ");
}
const list = (items) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
/**
 * The README block between the loop-table markers: the table, the legend for
 * the four marks, and which agents each part reaches. Every count in it comes
 * from the support table.
 */
export function renderLoopTableMarkdown(rows = AGENT_SUPPORT, stages = LOOP_STAGES) {
    const facts = loopFacts(rows);
    const table = [
        "| Step | Law | What the agent is given | What a hook does |",
        "|---|---|---|---|",
        ...stages.map((stage, i) => `| ${i + 1}. ${stage.name} | Law ${stage.law}, ${stage.lawTitle} | ${stage.given} | **${markLabel(stage.mark)}.** ${stage.does(facts)} |`),
    ];
    const legend = `How to read the last column. ${LOOP_MARKS.map((mark) => `**${markLabel(mark)}**: ${MARK_MEANING[mark]}.`).join(" ")}`;
    const rulesFile = facts.rulesFile.length === 0 ? "" : ` ${list(facts.rulesFile)} also load the rules as a rules file in every session.`;
    const byFile = facts.lessonsByRulesFile.length === 0 ? "" : `, through a rules file you rewrite on ${facts.lessonsByRulesFile.length} (${list(facts.lessonsByRulesFile)})`;
    const none = facts.lessonsNone.length === 0 ? "" : `, and not on ${list(facts.lessonsNone)}`;
    const reach = `Reach, from the [agent table](#works-with-these-agents): the skills go to all ${facts.agents} agents, the core skill with these rules among them.${rulesFile} ${facts.stopGate} have a Stop gate. Saved lessons load by hook on ${facts.lessonsByHook}${byFile}${none}.`;
    return [...table, "", legend, "", reach].join("\n");
}
