# Two pillars and the loop

- Date: 2026-11-25
- Status: PR 1 (the `be-ambitious` skill and command) and PR 2 (README, npm description, llms.txt, manifests, images) built. PR 3 (landing page) follows. This file is updated in place as each lands.
- Supersedes for positioning: [2026-11-22-readme-all-agents.md](2026-11-22-readme-all-agents.md) decisions 1 and 3 ("Guardrails for coding agents", the six-agent demo on the first screen) and the "Positioning" decision in [2026-11-21-all-agents.md](2026-11-21-all-agents.md). Their other decisions stand: every coding agent, and only the agents where it verifiably works.

## Owner's direction

"why focus on gateguard only...It should be based on 2 pillars 1 is
/be-ambitious (you have big goals) and 1 pillar is about discipline, we have
full control of ai, not ai control us. that is why the research > plan >
implement > review > contemplate > relearn and learn new things (core self
improvement) > Iterrate steps"

Still in force from earlier: "make this not only for claude code...make it for
all agents" and "dont mention this is only for claude code...this is for all
agents outside thre..put the one working only".

## What was wrong

The v3.27.0 refresh ("the hooks are the product") and the all-agents README led
every surface with one feature, the destructive-command guard. That reads as a
single-purpose safety tool. The product is a way of working: aim high, stay in
control, and improve each session through one loop.

## Decisions

1. **Two pillars lead every positioning surface.** Ambition: you have big
   goals, and the `be-ambitious` skill is how the agent is told to work at that
   level. Discipline: you control the AI, it does not control you. Headline
   everywhere: "Aim high. Stay in control." The owner's line "You control the
   AI. The AI does not control you." opens the Discipline section.
2. **The loop is the spine**, in the owner's order, mapped onto the 7 Laws with
   no law renumbered or reworded. Its one source is `src/lib/loop-stages.mts`.
3. **The guard is one proof under Discipline.** It is not the headline, the
   first image or the first sentence on any surface. The six-agent demo moved
   under "What it refuses".
4. **Pillar 1 ships.** `be-ambitious` is bundled as a skill and a
   `/be-ambitious` command (PR 1).
5. **Truth before polish.** Each step says what the agent is given (guidance)
   and what a hook does (code), under one of four marks. A step with no hook
   says "None". A statement that something is refused names the hook file.
6. **A short first screen.** Headline, the two pillars, one install command and
   the 16 agents. The per-step caveats live in the loop table, which is the
   first section, not in a paragraph above it.

## The mapping (verified 2026-11-25 against the 3.28.0 tree)

| Step | Law | What ships for it | Mark, and the hook | Agents |
|---|---|---|---|---|
| Research | 1 | The rule; skills `recall`, `reconcile`, `grill-me`, `roast`; `ci_recall` | Refuses by default: `hooks/gateguard.mjs` denies an edit of an existing file the session's log shows no read of | All 16, each under its own setup condition |
| Plan | 2 | The rule; `be-ambitious`; `ci_plan_init`, `ci_goal_check` | Off until you switch it on: `hooks/goal-drift-stop.mjs` with `CI_GOAL_DRIFT_GATE=block` | Shown to work on Claude Code only: it reads the reply from a Claude Code transcript, and a Codex-shaped payload did not block in a direct run |
| Implement | 3 | The rule; `tdd-workflow`, `ship`, `worktree-safety` | Refuses by default: `hooks/gateguard.mjs` denies destructive commands. Opt-in: `hooks/hook-pack.mjs`. Nothing checks "one thing at a time" | All 16 |
| Review | 4 | The rule; `verification-loop`, `simplicity-review`, `audit` | Off until you switch it on: `hooks/typecheck-stop.mjs` with `CI_TYPECHECK_GATE=block`, TypeScript only | The 12 with a Stop gate |
| Contemplate | 5 | The reflection block; `ci_reflect` | None | Text on all 16 |
| Relearn and learn | 7 | `ci_create_instinct`, `ci_reinforce`, `skill-distillation` | Records and loads: `bin/observe.mjs` logs each call that runs, `hooks/session.mjs` loads up to 10 lessons | Log on all 16; lessons by hook on 11, by a rules file on 4, not on Cline |
| Iterate | 6 | The rule; the three next moves from Contemplate | None in a session. After a run the transcript linter flags more than 8 files edited | Text on all 16 |

Two steps refuse by default, two have a gate that is off until switched on, one
records and loads, two are written rules. Closing that gap is follow-up work,
not part of this change. The counts 16, 12, 11, 4 and 1 are computed from
`src/lib/agent-support.mts`; none is typed into a doc.

## What PR 2 built

- `src/lib/loop-stages.mts`: the steps, their laws, marks, hook files, defaults
  and switches. `test/loop-stages.test.mjs` ties it to the `## Law N` headings
  of `SKILL.md`, the hook files on disk and the plugin's hook registrations.
- The README loop table, between `<!-- loop-table:start -->` and
  `<!-- loop-table:end -->`, with its legend and reach line. `npm run
  verify:agent-matrix` fails on drift, so no new `verify:*` script was added.
- `assets/readme/pillars-loop.svg` (first image), `demo-push-gate.svg` (the
  existing capture) and `demo-goal-check.svg` (a new capture: `ci_plan_init`,
  then `ci_goal_check` on two logs written with fixed times, byte-stable).
- README to the outline: The loop, Ambition, Discipline, then Install and the
  reference sections. The npm description, llms.txt, the shared plugin
  description, `SKILL.md` opening and loop, `QUICKSTART.md` and the generated
  `docs/AGENT-SUPPORT.md` intro carry the same lead.

Where the build differs from the design: the first-screen paragraph that
counted steps by mark was dropped for the loop table (decision 6). The reach
line sits inside the generated loop block, not under the agent table, so its
counts cannot drift. The npm lead says "backed by hooks that refuse destructive
commands and blind edits", not "refuse on two of its steps". The keywords and
marketplace descriptions of the Claude plugin manifests stay Claude-worded:
they describe Claude plugin manifests.

## The `be-ambitious` port (PR 1)

- Source: the owner's personal skill, built on Felix Rieseberg, *How to be more
  ambitious: A tutorial for humans with models* (13 October 2026),
  https://felixrieseberg.com/how-to-be-more-ambitious-a-tutorial-for-humans-with-models/.
- One flat file, `skills/be-ambitious.md`: `readSkillCatalog` in
  `src/lib/skill-export.mts` throws on any file beside `SKILL.md`.
- Restated with credit (the four depth questions follow the article's). No Claude-only tool names. The frontmatter
  says "Guidance for Law 2", not "Enforces", because no code backs it.
- The slash command reaches Claude Code only. Every agent that reads skills
  gets the skill. Counts: 29 skills, 30 commands, 42 distinct names.

## Cut for honesty

- "Full control" appears once, as the goal, followed by what is concrete: what
  is refused, what is logged, which switches exist, where it runs, and what you
  do not control.
- "Nothing turns itself on" was false: five things are on after install.
- "One command turns it all off" became "one command per agent turns the hooks
  off". A vendor `mcp add` has its own undo.
- "A turn cannot end on a failing typecheck" became "holds the turn open": the
  hook allows after a 25-second timeout and without a `tsconfig.json`.
- "Hooks stand behind five of the seven steps" was cut. Two refuse by default.
- No sentence says a step is enforced where the only backing is a skill, and
  `be-ambitious` is called guidance on every surface. No benchmark is claimed
  for it, and no image shows a run of it: a skill run needs a model call.
- "One logs every call" became "each tool call that runs": denied and failed
  calls and prompts are not logged.
- Left as follow-ups: the 24 skill descriptions that say "Enforces Law N" for
  prose, the goal-drift hook's Claude-only transcript read, and `/loop 7d` in
  `SKILL.md`.
