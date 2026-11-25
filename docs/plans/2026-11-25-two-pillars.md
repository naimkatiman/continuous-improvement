# Two pillars and the loop

- Date: 2026-11-25
- Status: PR 1 (the `be-ambitious` skill and command) built; PR 2 (README, npm description, images) and PR 3 (landing page) follow. This file is updated in place as each lands.
- Supersedes for positioning: [2026-11-22-readme-all-agents.md](2026-11-22-readme-all-agents.md) decision 1 ("Guardrails for coding agents") and the "Positioning" decision in [2026-11-21-all-agents.md](2026-11-21-all-agents.md). Their other decisions stand: every coding agent, and only the agents where it verifiably works.

## Owner's direction

"why focus on gateguard only...It should be based on 2 pillars 1 is
/be-ambitious (you have big goals) and 1 pillar is about discipline, we have
full control of ai, not ai control us. that is why the research > plan >
implement > review > contemplate > relearn and learn new things (core self
improvement) > Iterrate steps"

## What was wrong

The v3.27.0 refresh ("the hooks are the product") and the all-agents README led
every surface with one feature, the destructive-command guard. That reads as a
single-purpose safety tool. The product is a way of working: aim high, stay in
control, and improve each session through one loop.

## Decisions

1. **Two pillars lead every positioning surface.** Ambition: you have big goals,
   and the `be-ambitious` skill is how the agent works at that level.
   Discipline: you control the AI, it does not control you. Headline: "Aim
   high. Stay in control."
2. **The loop is the spine**, shown in the owner's order and mapped onto the
   existing 7 Laws without renumbering any law: Research (Law 1), Plan (Law 2),
   Implement (Law 3), Review (Law 4), Contemplate (Law 5), Relearn and learn
   (Law 7), Iterate (Law 6).
3. **The guard is one proof under Discipline.** It is not the headline, the
   first image or the first sentence on any surface.
4. **Pillar 1 ships.** `be-ambitious` is bundled as a skill and a
   `/be-ambitious` command (PR 1). Before this, nothing in the package served
   it: a search for "ambitio" across the tree returned no match.
5. **Truth before polish.** Each loop step says what the agent is given
   (guidance) and what a hook does (code). A step with no hook says so. This
   keeps the rule from the 2026-11-20 refresh: skills are prompts, hooks
   enforce.

## What each step has today (verified 2026-11-25 against the 3.28.0 tree)

| Step | Law | What the agent is given | What a hook does |
|---|---|---|---|
| Research | 1 | The rule, and the skills `recall`, `reconcile`, `grill-me`, `roast` | Refuses by default: `hooks/gateguard.mjs` denies an edit of an existing file the session's log shows no read of. All 16 blocking agents |
| Plan | 2 | The rule, `be-ambitious`, `intent-driven-development`, `planning-with-files`, `ci_plan_init`, `ci_goal_check` | Off until switched on: `hooks/goal-drift-stop.mjs` with `CI_GOAL_DRIFT_GATE=block`. It reads a Claude Code transcript, so the block is shown to work on Claude Code only |
| Implement | 3 | The rule, `tdd-workflow`, `ship`, `worktree-safety` | Refuses by default: `hooks/gateguard.mjs` denies destructive commands, all 16. Nothing checks "one thing at a time" in a session |
| Review | 4 | The rule, `verification-loop`, `simplicity-review`, `audit` | Off until switched on: `hooks/typecheck-stop.mjs` with `CI_TYPECHECK_GATE=block`. TypeScript only, on the 12 agents with a Stop gate |
| Contemplate | 5 | The reflection block, `ci_reflect` | None. `hooks/three-section-close.mjs` checks three reply headings, not the reflection, on Claude Code only |
| Relearn and learn | 7 | `ci_create_instinct`, `ci_reinforce`, `skill-distillation` | Records and loads, cannot refuse: `bin/observe.mjs` logs each tool call that runs (all 16), `hooks/session.mjs` loads up to 10 saved lessons at session start (11 agents by hook) |
| Iterate | 6 | The rule, `ralph`, `proceed-with-the-recommendation` | None in a session. After the run, the transcript linter flags more than 8 distinct files edited |

Two steps refuse by default. Two have a gate that is off until switched on. One
records and loads. Two are written rules. Closing that gap (the Plan and Review
gates on every agent with a Stop gate, something behind Contemplate and
Iterate) is follow-up work, not part of this change.

## The `be-ambitious` port (PR 1)

- Source: the owner's personal skill (a `SKILL.md` and six reference files,
  about 7,300 words), built on Felix Rieseberg, *How to be more ambitious: A
  tutorial for humans with models* (13 October 2026),
  https://felixrieseberg.com/how-to-be-more-ambitious-a-tutorial-for-humans-with-models/.
- One flat file, `skills/be-ambitious.md`. A references directory cannot ship:
  `readSkillCatalog` in `src/lib/skill-export.mts` throws on any file beside
  `SKILL.md`, which would break `install --target <agent> --hooks`. The judge
  table and the audit rubric are inlined; the domain catalogs are cut.
- Works on every agent: no Claude-only tool names. The agent runs the seats
  itself, one after another; sub-agents are an option where the agent has
  them. Where no second context exists, the runnable judge and the user are
  the audit, so the agent never scores its own work.
- Restated, not copied. The article page carries no reuse licence, so the
  skill uses its own wording and its own examples and credits the author,
  title, date and URL in the skill and the command. The article's 83-word
  meta-prompt is restated as the four depth questions. The personal skill's
  A/B test scores are left out: this repository holds no data for them.
- Frontmatter: `tier: "2"`, and a description that begins "Guidance for Law 2
  (Plan Is Sacred)". It says Guidance, not Enforces, because no code backs it.
  `summarize()` in `src/lib/skill-catalog.mts` strips that preamble too.
- The slash command reaches Claude Code only. Every agent that reads skills
  gets the skill.
- Counts: 29 skills (17 tier-2), 30 commands, 42 distinct names, 17 shared.

## Cut for honesty

- "Full control" is the goal, stated as what is concrete: what is refused,
  what is logged, which switches exist, where it runs, and a link to Limits.
- No sentence says a step is enforced where the only backing is a skill.
- `be-ambitious` is described as guidance on every surface.
