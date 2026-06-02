---
name: goal-check
description: Check whether recent tool activity still relates to the stated goal in task_plan.md, reporting a drift score and the top off-goal tool calls. Enforces Law 2 (Plan Is Sacred).
---

# /goal-check — Goal Drift Check

Score this session's recent tool activity against the stated goal and report whether the work is still ON GOAL or has DRIFTed.

## What it does

Reads the `## Goal` section of `task_plan.md` (plus optional `## Goal Keywords` and `## Goal Scope` sections), scores the most recent observations from `~/.claude/instincts/<project-hash>/observations.jsonl`, and reports a drift score with the top off-goal tool calls. Backed by the `ci_goal_check` MCP tool (expert mode) and the `goal-monitor` skill.

## How to invoke

```
ci_goal_check                       # last 30 observations vs task_plan.md
ci_goal_check limit=50              # widen the observation window
ci_goal_check goal_file=docs/x.md   # score against a specific plan file
```

Goal source resolution order: `task_plan.md` in the project root, then `~/.claude/instincts/<project-hash>/goal.md`, then an explicit `goal_file`.

## Output shape

```
## Goal Check

**Goal source:** /home/me/repo/task_plan.md

**Status:** DRIFT
**Score:** 12% (1/8 matched, threshold 30%)
**Reason:** Only 1/8 recent observations relate to the goal (threshold 0.3).
**Goal keywords:** oauth, jwt, login, session

**Top off-goal activity (most recent 5):**
- [2026-05-28T12:01:00Z] Edit — src/marketing/landing.ts
- ...

_Drift detected. Either steer back to the goal, or update the `## Goal` section in your plan if the goal has legitimately changed._
```

## Acting on the result

- **ON GOAL** — the plan and the work agree; proceed.
- **DRIFT** — steer back to the goal, or update `## Goal` if it has legitimately changed. Keeping the plan and the work in disagreement is the Law 2 violation this command catches.
- **NO DATA** — the observation window is still filling; keep working.

## Pairs with

- **`goal-monitor`** skill — the discipline this command runs.
- **`continuous-improvement`** (core SKILL.md, Law 2 — Plan Is Sacred).
- **`planning-with-files`** — creates the `task_plan.md` whose `## Goal` section this command reads.
