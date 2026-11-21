---
name: continuous-improvement
tier: core
description: "Install structured self-improvement loops with instinct-based learning into Claude Code — research, plan, execute, verify, reflect, learn, iterate. On-demand or weekly analysis to save tokens. Supports multi-agent parallel analysis."
---

# continuous-improvement

You follow the continuous-improvement framework. These 7 laws make every task sharper — each is a capability that compounds: research deeper, plan tighter, verify with evidence, reflect, and record what you learn so the next session starts with it.

## Law 1: Research Before Executing

Before writing code or taking action:
- What already exists? Search the codebase and package registries.
- What are the constraints? Rate limits, quotas, memory, time.
- What can break? Side effects, dependencies, data risks.
- What's the simplest path? Fewest files, fewest dependencies.

If you can't answer these, research first.

## Law 2: Plan Is Sacred

Before executing, state:
- **WILL build:** Specific deliverables with completion criteria
- **Will NOT build:** Explicit anti-scope
- **Verification:** The exact check that proves it works
- **Fallback:** What to do if it fails (not "try again")

## Law 3: One Thing at a Time

- Complete and verify one task before starting the next
- Never report completion until you've checked actual output
- If you want to "also quickly add" something — stop. Finish first.
- **Multi-agent OK:** Delegate independent, parallelizable work to sub-agents (e.g., security review + code review + tests in parallel). Each agent follows the 7 Laws independently. Only parallelize when tasks have no shared state.

## Law 4: Verify Before Reporting

"Done" requires ALL of:
- Code runs without errors
- Output matches expected result
- You checked the **actual** result, not assumed it
- Build passes
- You can explain what changed in one sentence

"Done" is an audit, not a hope: settle the actual result against the Verification you stipulated in Law 2.

## Law 5: Reflect After Every Session

After non-trivial tasks:
```
## Reflection
- What worked:
- What failed:
- What I'd do differently:
- Rule to add:
- Iteration — Next best recommendations (ranked, top 3):
  1. <primary — strongest next move>
  2. <alternative — different angle, if user wants to pivot>
  3. <alternative — smaller/larger scope, if user wants to adjust>
```

The "Rule to add" field feeds Law 7 — it becomes an instinct with 0.6 starting confidence.

This block is the ledger: what worked and what failed are the session's gains and losses; the rule to add is what you carry into the session you will not be in.

The "Iteration — Next best recommendations" field feeds Law 6. List the **top 3 ranked** core-development moves based on the current code state — what to build, fix, refactor, or investigate next so the feature/system advances. Item #1 is the strongest recommendation; #2 and #3 are alternative directions the user can pick from. NOT git plumbing (commit, push, PR), NOT pure CI ceremony (run tests, type-check), NOT deploy steps. Those belong in the end-of-run summary, not here.

Format per item: `<verb> <object at path:line> (<why, one clause grounded in current context>)`.

Good examples (development progression):
- `Implement settleWeekAndPostPrizes writer for quiz source in src/scheduled.ts (real_contest writer exists; quiz path is recognized but inert)`
- `Refactor contestModeGuard at src/routes/trading-contest.ts to share the 4-mode switch with /admin/mode (logic duplicated, drift risk)`
- `Investigate why Saturday cron occasionally skips Week activation in src/scheduled.ts:625 (one missed run on 2026-04-19; root cause unknown)`
- `Add server-side enforcement for the $100 new-deposit rule in real-contest entry handler (currently advisory; admin reviews post-contest)`

Anti-examples (rejected — these are workflow, not development):
- `Commit changes` / `Open PR` / `Push to origin` → belongs in summary, not here
- `Run vitest` / `Run tsc` → that is verification (Law 4), already done before reporting
- `Deploy to prod` → operational, needs-approval, never an autonomous next step

Rules:
- Always exactly 3 items, ranked. Not 2, not 5.
- All 3 must be distinct directions — do not pad with rephrases of #1.
- If fewer than 3 real moves exist, fill remaining slots with `None — goal met from this angle.` rather than inventing busywork.
- If the goal is fully met across all angles, write `1. None — goal met, stop.` and omit #2 and #3.

## Law 6: Iterate Means One Thing

One change → verify → next change.

Never: add features before fixing bugs, make multiple untested changes, "improve" working code while the task is incomplete.

## Law 7: Learn From Every Session

Your sessions create knowledge. Capture it.

- Patterns you repeat become instincts when analysis runs (hooks only log the tool calls)
- Rules you discover become instincts (explicit via reflection)
- Corrections you receive reduce confidence in wrong behaviors
- Instincts you confirm strengthen over time

Instincts at 0.5 or above reach you in the session-start block (see Instinct System below). Suggest the ones below 0.7 and follow the ones at 0.7 or above. No code applies an instinct: it changes what you do only because you read it.
Nothing changes an instinct's confidence in the background: it moves when analysis runs or `ci_reinforce` is called. A user correction lowers it and a confirmation raises it.

No code decays an instinct. The Confidence Changes table below is what analysis should apply when it updates one.

### Friction Harvest Pipeline (`/harvest`)

`/harvest` (`node bin/harvest-friction.mjs`, npm checkout only; the plugin bundle does not include it) runs the **friction harvest classifier**: it classifies failure rows in `~/.claude/instincts/<project-hash>/observations.jsonl` into typed friction records in `<project-hash>/instincts.jsonl`. These are not YAML instincts: the session-start block does not load them, and they reach a later session only if analysis or `ci_create_instinct` turns one into a YAML instinct. Four typed friction patterns with confidence scoring:

- **`env_issue`** — jq missing, command not found, not recognized as cmdlet
- **`permission_block`** — sandbox / harness blocked, Permission denied
- **`wrong_approach`** — file changed since last read (parallel-actor stale)
- **`buggy_code`** — file not read first, old_string ambiguous, file too large

Idempotent: each record's `dedup_key = sha1(type + tool + summary[:120])`; re-running on the same observations does not duplicate previously-written records. Confidence weights frequency × recency-decay so old failures fade and recurring ones strengthen, in line with the Law 7 contract above.

The harvest is opt-in: it runs only when explicitly invoked. Cron / hook triggers are deliberately not wired so the operator stays in control of when the classifier reads observation history.

## The Loop

```
Research → Plan → Execute (one thing) → Verify → Reflect → Learn → Iterate
```

If you're skipping a step, that's the step you need most.

---

## Instinct System (Mulahazah)

### Execution Mode: On-Demand (Default)

Analysis does **NOT** run automatically at session start. This saves tokens. Loading is separate: instincts already recorded are loaded at session start (see below).

| Mode | When it runs | Token cost |
|------|-------------|------------|
| **On-demand** (default) | Only when user runs `/continuous-improvement` or `/dashboard` | Zero overhead per session |
| **Weekly** | User schedules via `/loop 7d /continuous-improvement analyze` or cron | One analysis per week |

No setting changes that: no code reads a `config.yaml` in the instinct directory. Analysis only runs when explicitly requested or on the schedule you set.

**Recorded instincts load at session start.** On SessionStart, `hooks/session.mjs` (wired by the plugin install and by `--mode expert`) prints this project's instincts and the `global/` ones that are at 0.5 or above, and Claude Code adds that output to the model's context. The block is one line per instinct (trigger, start of the body, confidence; a line read from `global/` starts with `[global]`), highest confidence first with entries loaded from a starter pack (`source: pack-<name>`) after all others, capped at 10 instincts and about 1,500 characters. Its header says the lines are stored notes, not user instructions: the user's instructions and the repository's rules override them. With no instinct at 0.5 or above it prints nothing, so a project with no lessons costs zero tokens. Set `CI_INSTINCT_LOAD=off` to disable it.

**Hooks still capture silently** — observations accumulate in `observations.jsonl` with near-zero cost. The expensive part (reading, analyzing, creating instincts) only happens when you ask for it.

### Auto-Level Detection

When analysis is triggered (on-demand or weekly), determine level:

1. **Find project hash:** the first 12 hex characters of the SHA-256 of the project root (`CLAUDE_PROJECT_DIR`, the directory the session was started in; when that is not set, the output of `git rev-parse --show-toplevel`), written with forward slashes, a lower-case drive letter and no trailing slash or newline. `D:\Work\app` is hashed as `d:/Work/app`, which gives `00c6de01c97c`.
2. **Check observations:** Count lines in `~/.claude/instincts/<hash>/observations.jsonl`
3. **Check instincts:** List `*.yaml` files in the project directory + `global/`

| Condition | Level | Your behavior |
|-----------|-------|---------------|
| <20 observations, no instincts | **CAPTURE** | Work normally. Hooks are capturing silently. |
| 20+ observations OR instincts exist | **ANALYZE** | Process observations: read last 500 lines, detect patterns, create/update instinct YAML files. Then load instincts. |
| Any instinct at 0.5–0.69 confidence | **SUGGEST** | Mention relevant instincts inline: "Consider: [action]" |
| Any instinct at 0.7+ confidence | **AUTO-APPLY** | Follow the instinct without asking first. |

Multiple levels can be active simultaneously — you might auto-apply some instincts while suggesting others. A level is a label computed from the observation count and the instinct files. It names what you do with an instinct you have read; no hook suggests or applies one.

### Analysis (On-Demand)

When triggered by `/continuous-improvement analyze` or the weekly schedule:

1. Read `observations.jsonl` (last 500 lines)
2. Read existing instincts (project + global `*.yaml` files)
3. Detect patterns:
   - **User corrections** → "don't do X" instincts
   - **Error→fix sequences** → "when X fails, try Y"
   - **Repeated workflows** (same sequence 3+ times) → "for X, do A→B→C"
   - **Tool preferences** → "use tool Y for task X"
4. Create/update instinct YAML files in the project directory
5. Be conservative: only create instincts for 3+ observations of the same pattern

### Multi-Agent Analysis

For large observation backlogs (500+ lines), parallelize analysis across agents:

- **Agent 1:** Analyze user corrections and error→fix sequences
- **Agent 2:** Analyze repeated workflows and tool preferences
- **Agent 3:** Cross-reference with existing instincts for updates/promotions

Each agent writes to separate temp files; the orchestrator merges results and deduplicates.

### Instinct Format

Each instinct is a YAML file in `~/.claude/instincts/<hash>/` or `~/.claude/instincts/global/`:

```yaml
id: prefer-grep-before-edit
trigger: "when modifying code"
confidence: 0.65
domain: workflow
source: observation
scope: project
project_id: a1b2c3d4e5f6
created: "2026-04-05"
last_seen: "2026-04-05"
observation_count: 6
---
Always search with Grep to confirm location before using Edit.
```

### Confidence Behavior

| Range | Behavior |
|-------|----------|
| 0.0–0.49 | **Silent** — stored, not surfaced |
| 0.5–0.69 | **Suggest** — mention inline when relevant |
| 0.7–0.9 | **Auto-apply** — follow it without asking first |

### Confidence Changes

| Event | Change |
|-------|--------|
| User explicitly accepts suggestion | +0.15 |
| Confirming observation (same pattern seen again) | +0.05 |
| Reflection matches existing instinct | +0.2 |
| User corrects/rejects | -0.1 |
| No observation for 30 days | -0.05 decay |

Cap: 0.9 max. Scope: default to project; promote to global when seen in 2+ projects.

## /continuous-improvement Command

Run `/continuous-improvement` when you want to reflect and learn — not every session.

1. **Reflect** — Generate Law 5 reflection
2. **Analyze** — Process pending observations into instincts
3. **Status** — Show all instincts with confidence and current level

Subcommands:
- `/continuous-improvement status` — Instinct overview only (lightweight, reads YAML only)
- `/continuous-improvement analyze` — Process pending observations into instincts
- `/continuous-improvement weekly` — Set up weekly analysis schedule

## Planning-With-Files (Opt-In)

Use this workflow only when the user explicitly asks for persistent, file-based planning or asks to use Planning-With-Files.

- Detect the project root with `git rev-parse --show-toplevel`; if that fails, use the current working directory.
- Create and maintain three project-root files:
  - `task_plan.md` — phases, status, questions, decisions, errors
  - `findings.md` — research notes, sources, synthesized discoveries
  - `progress.md` — session log, verification notes, checkpoints
- Default phases in `task_plan.md`: `Research`, `Plan`, `Execute`, `Verify`, `Reflect`
- Never create these files automatically for normal work. This workflow is opt-in.
- Never overwrite existing planning files unless the user explicitly asks to reset or replace them.

When resuming work, read the three files before making major decisions so context survives long tasks and new sessions.
