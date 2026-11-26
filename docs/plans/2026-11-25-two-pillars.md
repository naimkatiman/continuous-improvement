# Two pillars and the loop

- Date: 2026-11-25
- Status: PR 1 (the `be-ambitious` skill and command), PR 2 (README, npm description, llms.txt, manifests, images), PR 3 (landing page and link preview) and the hero scene that follows PR 3 built. This file is updated in place as each lands.
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
commands and blind edits", not "refuse on two of its steps". The
marketplace descriptions of the Claude plugin manifests stay Claude-worded:
they describe Claude plugin manifests. Their keywords carry the pillars since
the surfaces change below.

## What PR 3 built: the landing page

- Hero: the headline, two pillar tiles and an install switch. The switch
  shows the `--target <agent> --hooks` command by default and the Claude Code
  `/plugin` commands as its other state. Two radios and CSS do the swap, so it
  works without scripting; the script adds the agent list from the generated
  table and keeps the copy button on the command shown.
- Sections after the hero, in order: `#loop`, `#ambition`, `#discipline`,
  `#agents`. Each names its own camera (see the next section).
- Three generated blocks. The loop steps (`renderLoopStepsHtml`, loop-table
  markers) and the agent roster with its table (`renderTierHtml`, agent-matrix
  markers, the 16 rows that block) are checked by `verify:agent-matrix`. The
  six-agent force-push panel (`renderLandingForcePush`, demo-force-push
  markers) is checked by `staleAssets`, which the image test runs.
- The replay chips and the verdict card sit under Discipline.
- `demo/social-card.html` and both PNGs: headline, pillars, seven steps with
  their marks, 1200x630, no version. Tests hold the card and the alt text to
  `src/lib/loop-stages.mts`.

Where the build differs from the design:

- Discipline is two sections, `#discipline` (four tiles, chips, the six-agent
  panel) and `#agents` (the roster).
- The loop's lead does not count steps by mark. The generated block lists each
  mark with the steps that carry it, so no count is typed.
- The exhibits stay at seven: the push gate was already Exhibit B. Each is
  tagged with its loop step.
- On narrow screens `#loop`, `#ambition` and `#agents` drop the stage gap
  (class `follow`): the set above each one would repeat.

Left as it was: the page's `.more` rule makes every `details.more` render as
`display: contents`. It predates this change.

Manual steps after merge, each needing the owner's yes:

- the Cloudflare Pages deploy
- the GitHub social preview upload
- `gh repo edit`, with this description (119 characters): "Aim high, stay in
  control. Two pillars for 16 coding agents: the be-ambitious skill, and hooks,
  a local log and a loop." Add the topics `ambition` and `be-ambitious`.

## The hero scene (after PR 3)

Decision 3 said the guard is not the first image on any surface, and the landing
page's first image was the gate, replaying refused calls. It is now the two
pillars and the loop.

- The set (`sceneLoop` in `docs/landing/landing.js`): Ambition, tall, as many
  blocks as its section has steps; Discipline, broad, as many courses as its
  section has tiles; seven tablets in a ring, edged in their marks (refuses by
  default orange, off bare steel, records and loads paper white, none an empty
  outline); a pulse that runs the ring from Research to Iterate and round
  again. The first four steps read left to right in front, and the sixth, the
  self-improvement step, stands in the gap between the pillars.
- The steps and marks come from the generated loop block: `renderLoopStepsHtml`
  now writes `data-loop` and `data-mark` on each step's `<li>`.
- Cameras: `hero`, `loop` and `ambition` look at this set, `gate` is
  Discipline's alone, `agents` looks at the same gate, idle. The chips, the
  autoplay, the red light and the verdict card follow `gate`. The page's
  IntersectionObserver that hid the card elsewhere is gone.
  `data-cam-hold` keeps a tall section's view from its first screenful to its
  last, so a neighbour's set does not arrive beside its text.
- Off the text: `clear` keeps these views right of the copy column at every
  wide size, and `near` widens the lens on narrow ones, so the set is not lost
  in the fog.
- Without motion the pulse is not drawn and the ring is lit. Without WebGL or
  scripting the hero shows `.still-loop`, the same set as an inline SVG. The
  flat gate (`.still`) stays in Discipline.
- Two defects found in the renders and fixed: a first frame whose timestamp is
  older than the script's clock lit the gate red with no call, and a sliver of
  a mirrored box could put a white spot in the bloom.
- `test/landing-scene.test.mjs` runs landing.js against the real page with a
  stub WebGL context and checks what each section draws, the marks and the
  order of the ring, and where the replay may run.

## What the surfaces change built (branch docs/two-pillars-surfaces)

A review of PRs 1 to 3 found the surfaces below the first screen still Claude
Code first, and a legend the code contradicted.

- `src/lib/loop-stages.mts`: a mark's meaning must hold for every step that
  carries it. Plan is marked "off until you switch it on" and its hook writes a
  state file and a stderr line by default, so the meaning is "refuses nothing
  until you set the variable". Iterate is marked "none" and the transcript
  linter checks it after the run, so "none" is "during the session". The reach
  line names the agents with a Stop gate: the agent table has no such column.
- `installFlags` in `src/lib/agent-support.mts` gives the flag an agent's own
  install needs (Junie: `--scope user`). The README table and first screen,
  QUICKSTART and the installer's help all use it.
- `compatibleWith` in `.cloudplugin/marketplace.json` is the rows that block.
  `install --target kiro-ide` still installs the Kiro hooks: the alias is the
  installer's, not the manifest's.
- `QUICKSTART.md` and `llms.txt` give the `--target` install first and label
  every Claude Code step. Tests hold their ids, counts and order to the table.

Left for the owner: line 7 of `CLAUDE.md` still says "Claude Code plugin".
It is the project's rules file, so it changes on the owner's word. The wording
to copy is line 7 of `AGENTS.md`.

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
