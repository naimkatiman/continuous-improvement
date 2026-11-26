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
//   off until you switch it on  the hook ships and refuses nothing until a
//                               variable is set
//   records and loads           a hook logs or prints, and cannot refuse
//   none                        a written rule; no hook checks it
//
// The README loop table and the landing page's list of steps
// (bin/check-agent-matrix.mjs splices each between the loop-table markers and
// fails on drift) and assets/readme/pillars-loop.svg
// (bin/render-readme-assets.mjs) are rendered from this table. The loop line
// of SKILL.md is hand-written. test/loop-stages.test.mjs holds it to this
// table, and ties the table to the law headings in SKILL.md, to the hook files
// on disk and to the plugin's hook registrations.
// Every agent count comes from lib/agent-support.mjs; none is typed. Pure: no
// I/O.

import { HOOK_AGENT_IDS, PLUGIN_AGENT_IDS } from "./agent-install-plans.mjs";
import { AGENT_SUPPORT, blocksPreTool, supportTier, type AgentSupport } from "./agent-support.mjs";
import { COMMIT_FILE_LIMIT } from "./hook-pack-gate.mjs";
import { TARGET_IDS } from "./install-targets.mjs";
import { MAX_LESSONS } from "./lesson-render.mjs";

export const LOOP_TABLE_START = "<!-- loop-table:start -->";
export const LOOP_TABLE_END = "<!-- loop-table:end -->";

export const HEADLINE = "Aim high. Stay in control.";

export interface Pillar {
  name: string;
  /** The owner's claim for the pillar. */
  claim: string;
  /** What ships for it. */
  ships: string;
  /** `ships` is a name the user types (a skill), so the image sets it in the code face. */
  shipsIsName: boolean;
  /** What kind of thing that is: guidance or code. */
  kind: string;
}

/** The two pillars. Ambition is a skill, so guidance; discipline is code that runs on the user's machine. */
export const PILLARS: readonly Pillar[] = [
  { name: "Ambition", claim: "you have big goals", ships: "be-ambitious", shipsIsName: true, kind: "a skill: guidance the agent reads" },
  { name: "Discipline", claim: "you control the AI", ships: "hooks, a log, switches", shipsIsName: false, kind: "Node scripts on your machine" },
];

export const LOOP_MARKS = ["refuses by default", "off until you switch it on", "records and loads", "none"] as const;
export type LoopMark = (typeof LOOP_MARKS)[number];

/** What each mark means, in the words the README legend uses. Each holds for every step that carries the mark. */
export const MARK_MEANING: Readonly<Record<LoopMark, string>> = {
  "refuses by default": "a hook answers deny before the call runs",
  "off until you switch it on": "the hook ships and refuses nothing until you set the variable",
  "records and loads": "a hook writes a log row or prints saved lessons, and cannot refuse anything",
  none: "text the agent is given, and nothing checks it during the session",
};

/** The agent event a hook file is registered on in the plugin's hooks.json. */
export type LoopHookEvent = "PreToolUse" | "PostToolUse" | "SessionStart" | "Stop";

export interface LoopHook {
  /** Repo-relative path of the built hook script. */
  file: string;
  event: LoopHookEvent;
  /** The hook does nothing for this step until a variable is set, while the step's other hook is on. */
  optIn?: boolean;
}

/** How the step's hook behaves on a fresh install: on, a debug-log line nobody reads (warn, a turn-end hook), off, or no hook at all. */
export type LoopDefault = "on" | "warn" | "off" | "none";

/** Agent counts the loop copy states, computed from the support table. */
export interface LoopFacts {
  /** Agents where the guard blocks a destructive command. */
  agents: number;
  /** Of those, the ones with a Stop gate. */
  stopGate: number;
  /** Of those, the full-tier ones. A full-tier agent has a Stop gate by definition. */
  fullTier: number;
  /** Display names of the partial-tier ones that have a Stop gate. */
  stopGatePartial: readonly string[];
  /** Of those, the ones that get saved lessons through a session hook. */
  lessonsByHook: number;
  /** Display names of the ones that get lessons through a rules file. */
  lessonsByRulesFile: readonly string[];
  /** Display names of the ones that get no lessons. */
  lessonsNone: readonly string[];
  /** Display names of the ones whose install also writes the rules as a rules file. */
  rulesFile: readonly string[];
  /** The `--target` ids `--hooks` installs for, in table order. */
  targetIds: readonly string[];
}

export function loopFacts(rows: readonly AgentSupport[] = AGENT_SUPPORT): LoopFacts {
  const working = rows.filter((row) => blocksPreTool(row));
  const name = (row: AgentSupport): string => row.names[0] ?? row.id;
  const installs: ReadonlySet<string> = new Set([...HOOK_AGENT_IDS, ...PLUGIN_AGENT_IDS]);
  return {
    agents: working.length,
    stopGate: working.filter((row) => row.stopGate === true).length,
    fullTier: working.filter((row) => supportTier(row) === "full").length,
    stopGatePartial: working.filter((row) => row.stopGate === true && supportTier(row) !== "full").map(name),
    lessonsByHook: working.filter((row) => row.lessons === "hook").length,
    lessonsByRulesFile: working.filter((row) => row.lessons === "rules file").map(name),
    lessonsNone: working.filter((row) => row.lessons === "none").map(name),
    rulesFile: working.filter((row) => row.id !== "claude" && TARGET_IDS.includes(row.id)).map(name),
    targetIds: working.filter((row) => installs.has(row.id)).map((row) => row.id),
  };
}

export interface LoopStage {
  /** The step's name, in the owner's words. */
  name: string;
  /** The law of the core skill the step restates; the number is the package's own. */
  law: number;
  /** The law's title, equal to its `## Law N:` heading in SKILL.md. */
  lawTitle: string;
  mark: LoopMark;
  /** The hook files that back the mark. Empty when the mark is `none`. */
  hooks: readonly LoopHook[];
  defaultMode: LoopDefault;
  /** The variable that changes the default, as `NAME=value`, or "" when there is none. */
  switch: string;
  /** README cell: what the agent is given. Markdown. */
  given: string;
  /** README cell: what a hook does, after the bold mark. Markdown. */
  does: (facts: LoopFacts) => string;
  /** What the image prints beside the step's hook file: what that hook covers, or "". */
  covers: string;
}

const link = (file: string): string => `[\`${file}\`](${file})`;
const LINTER = "[transcript linter](#unattended-runs-and-ci)";

/** The seven steps, in the owner's order. */
export const LOOP_STAGES: readonly LoopStage[] = [
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
    does: (f) => `${link("hooks/typecheck-stop.mjs")} with \`CI_TYPECHECK_GATE=block\` holds the turn open on a failing typecheck. TypeScript only, on the ${f.stopGate} agents with a Stop gate (a hook that runs when the agent ends its turn and can send it back). No hook runs tests, lint or a build. After the run, the ${LINTER} flags a code change with no test or build command`,
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

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** A mark as the docs print it: the first letter in capitals. */
export function markLabel(mark: LoopMark): string {
  return capital(mark);
}

/** How many steps carry each mark, in LOOP_MARKS order. */
export function markCounts(stages: readonly LoopStage[] = LOOP_STAGES): Readonly<Record<LoopMark, number>> {
  const count = (mark: LoopMark): number => stages.filter((stage) => stage.mark === mark).length;
  return {
    "refuses by default": count("refuses by default"),
    "off until you switch it on": count("off until you switch it on"),
    "records and loads": count("records and loads"),
    none: count("none"),
  };
}

/** The loop on one line, with each step's law number: the line SKILL.md carries under "The Loop". */
export function renderLoopLine(stages: readonly LoopStage[] = LOOP_STAGES): string {
  return stages.map((stage) => `${stage.name} (Law ${stage.law})`).join(" → ");
}

/** The step names in order, lower case and comma-separated, as the npm description lists them. */
export function loopWords(stages: readonly LoopStage[] = LOOP_STAGES): string {
  return stages.map((stage) => stage.name.toLowerCase()).join(", ");
}

const list = (items: readonly string[]): string =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/**
 * The README block between the loop-table markers: the table, the legend for
 * the four marks, and which agents each part reaches. Every count in it comes
 * from the support table.
 */
export function renderLoopTableMarkdown(rows: readonly AgentSupport[] = AGENT_SUPPORT, stages: readonly LoopStage[] = LOOP_STAGES): string {
  const facts = loopFacts(rows);
  const table = [
    "| Step | Law | What the agent is given | What a hook does |",
    "|---|---|---|---|",
    ...stages.map((stage, i) =>
      `| ${i + 1}. ${stage.name} | Law ${stage.law}, ${stage.lawTitle} | ${stage.given} | **${markLabel(stage.mark)}.** ${stage.does(facts)} |`),
  ];
  const legend = `How to read the last column. ${LOOP_MARKS.map((mark) => `**${markLabel(mark)}**: ${MARK_MEANING[mark]}.`).join(" ")}`;
  const reach = `Reach, from the [agent table](#works-with-these-agents): ${reachSentences(facts)}`;
  return [...table, "", legend, "", reach].join("\n");
}

/** Which agents each part of the loop reaches, as plain sentences. Every count and name comes from the support table. */
function reachSentences(facts: LoopFacts): string {
  const rulesFile = facts.rulesFile.length === 0 ? "" : ` ${list(facts.rulesFile)} also load the rules as a rules file in every session.`;
  const byFile = facts.lessonsByRulesFile.length === 0 ? "" : `, through a rules file you rewrite on ${facts.lessonsByRulesFile.length} (${list(facts.lessonsByRulesFile)})`;
  const none = facts.lessonsNone.length === 0 ? "" : `, and not on ${list(facts.lessonsNone)}`;
  const stopGate = list([`the ${facts.fullTier} full-tier agents`, ...facts.stopGatePartial]);
  return `the skills go to all ${facts.agents} agents, the core skill with these rules among them.${rulesFile} ${facts.stopGate} have a Stop gate: ${stopGate}. Saved lessons load by hook on ${facts.lessonsByHook}${byFile}${none}.`;
}

const REPO_URL = "https://github.com/naimkatiman/continuous-improvement";

// The class the landing page's mark square (`i.m`) takes for each mark, and the step's data-mark, which docs/landing/landing.js reads.
const MARK_CLASS: Readonly<Record<LoopMark, string>> = {
  "refuses by default": "deny",
  "off until you switch it on": "off",
  "records and loads": "on",
  none: "none",
};

const DEFAULT_LABEL: Readonly<Record<LoopDefault, string>> = {
  on: "On after install",
  warn: "Warns only: a debug-log line, and the turn ends",
  off: "Off",
  none: "No hook",
};

const escapeHtml = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A README cell as landing-page HTML: a file link goes to the file on GitHub, a `#` link to the README section, backticks become code. */
function cellHtml(markdown: string): string {
  return escapeHtml(markdown)
    .replace(/\[`([^`\]]+)`\]\(([^)#\s]+)\)/g, (_match, label: string, file: string) => `<a href="${REPO_URL}/blob/main/${file}"><code>${label}</code></a>`)
    .replace(/\[([^\]]+)\]\((#[^)\s]+)\)/g, (_match, label: string, anchor: string) => `<a href="${REPO_URL}${anchor}">${label}</a>`)
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/**
 * The landing page's block between the loop-table markers: the seven steps as
 * a numbered list, each with its law, its mark and the hook files behind it,
 * and a disclosure holding the same two cells the README table prints; then
 * the four marks with the steps that carry each, and the reach line. Same
 * data as `renderLoopTableMarkdown`, so the two cannot disagree.
 */
export function renderLoopStepsHtml(rows: readonly AgentSupport[] = AGENT_SUPPORT, stages: readonly LoopStage[] = LOOP_STAGES): string {
  const facts = loopFacts(rows);
  const mark = (stage: LoopStage): string => `<span class="mark"><i class="m ${MARK_CLASS[stage.mark]}" aria-hidden="true"></i>${markLabel(stage.mark)}</span>`;
  const backing = (stage: LoopStage): string => {
    const files = stage.hooks.filter((hook) => hook.optIn !== true).map((hook) => `<code>${escapeHtml(hook.file)}</code>`);
    if (files.length === 0) return "a written rule, no hook";
    return `${files.join(", ")}${stage.covers === "" ? "" : `: ${escapeHtml(stage.covers)}`}`;
  };
  const steps = stages.flatMap((stage) => [
    `        <li data-loop="${escapeHtml(stage.name)}" data-mark="${MARK_CLASS[stage.mark]}">`,
    `          <div>`,
    `            <p class="step-top"><b>${escapeHtml(stage.name)}</b>${mark(stage)}</p>`,
    `            <p class="step-sub">Law ${stage.law}, ${escapeHtml(stage.lawTitle)} · ${backing(stage)}</p>`,
    `            <details class="hc-more">`,
    `              <summary>What it is given, and what backs it</summary>`,
    `              <dl class="facts">`,
    `                <div><dt>The agent is given</dt><dd>${cellHtml(stage.given)}.</dd></div>`,
    `                <div><dt>A hook</dt><dd>${cellHtml(stage.does(facts))}.</dd></div>`,
    `                <div><dt>Default</dt><dd>${DEFAULT_LABEL[stage.defaultMode]}</dd></div>`,
    `                <div><dt>Switch</dt><dd>${stage.switch === "" ? "None" : `<code>${escapeHtml(stage.switch)}</code>`}</dd></div>`,
    `              </dl>`,
    `            </details>`,
    `          </div>`,
    `        </li>`,
  ]);
  const marks = LOOP_MARKS.map((name) => {
    const carriers = stages.filter((stage) => stage.mark === name).map((stage) => escapeHtml(stage.name));
    return `        <li><span><i class="m ${MARK_CLASS[name]}" aria-hidden="true"></i> <b>${markLabel(name)}</b>: ${escapeHtml(MARK_MEANING[name])}</span> <span class="rv">${carriers.join(", ")}</span></li>`;
  });
  return [
    `      <div class="ex loop">`,
    `      <ol class="steps">`,
    ...steps,
    `      </ol>`,
    `      <ul class="rulings marks" aria-label="What each mark means, and the steps that carry it">`,
    ...marks,
    `      </ul>`,
    `      </div>`,
    `      <p class="note">Reach, from the <a href="#agents">agent table</a>: ${escapeHtml(reachSentences(facts))}</p>`,
  ].join("\n");
}
