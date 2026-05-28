---
name: goal-monitor
tier: "2"
description: Enforces Law 2 (Plan Is Sacred) of the 7 Laws of AI Agent Discipline. Detects when a session has drifted away from its stated goal by scoring recent tool activity against the '## Goal' section of task_plan.md, so drift is caught mid-session instead of at end-of-session reflection.
origin: continuous-improvement
user-invocable: true
---

# Goal Monitor — Continuous Drift Detection

A "Clear Goal" discipline: a stated goal is only useful if something keeps checking the work against it. `task_plan.md` captures the goal once; this skill turns it into a recurring check so a session that has quietly wandered off into unrelated files surfaces the drift while there is still budget to course-correct.

## When to Activate

- After a long stretch of edits, before claiming progress on the original goal.
- When you suspect the work has sprawled across unrelated areas of the codebase.
- Before a checkpoint or handoff, to confirm the session stayed on its stated goal.
- Any time the goal in `task_plan.md` and the actual tool activity might have diverged.

## Core Concept

Law 2 says the plan is sacred. But "sacred" is hollow if nothing measures adherence. Goal Monitor scores the most recent observations against the goal and reports one of three states:

```
ON GOAL  — recent activity relates to the goal (score >= threshold)
DRIFT    — most recent activity is unrelated, or touched forbidden paths
NO DATA  — not enough observations in the window yet
```

The score is the fraction of recent observations whose tool name, input, or output references a goal keyword — or whose edited path falls under a goal-scope glob.

## Goal Source

The check reads, in order:

1. `task_plan.md` in the project root (seeded by `ci_plan_init` / `/planning-with-files`).
2. `~/.claude/instincts/<project-hash>/goal.md` (fallback for non-repo sessions).
3. An explicit `goal_file` argument, if provided.

The plan needs a `## Goal` section. Two optional sections sharpen the signal:

```markdown
## Goal
Implement OAuth login with JWT session tokens for the auth service.

## Goal Keywords
oauth, jwt, login, session

## Goal Scope
paths: src/auth/**, test/auth/**
forbidden: src/marketing/**
```

When `## Goal Keywords` is absent, keywords are auto-extracted from the goal prose (stopwords and short tokens dropped). `## Goal Scope` is optional: `paths` globs count as on-goal matches; `forbidden` globs are a hard drift signal even when keywords also match.

## How to Invoke

The check is exposed as the `ci_goal_check` MCP tool (expert mode) and the `/goal-check` slash command:

```
ci_goal_check                      # score the last 30 observations against task_plan.md
ci_goal_check limit=50             # widen the window
ci_goal_check goal_file=docs/x.md  # score against a specific plan file
```

## Acting on the Result

- **ON GOAL** — proceed; the plan and the work agree.
- **DRIFT** — stop and decide explicitly: either steer back to the goal, or, if the goal has legitimately changed, update the `## Goal` section so the plan stays the single source of truth. Do not silently let the work and the plan disagree — that is exactly the Law 2 violation this skill exists to catch.
- **NO DATA** — keep working; the observation window is still filling.

## Limitations

- Keyword scoring is lexical, not semantic: a goal that says "login" will not match activity that only ever says "authentication". Add synonyms to `## Goal Keywords` when vocabulary diverges.
- A deliberately broad goal ("refactor the whole repo") will score nearly everything as on-goal. Use `## Goal Scope` to add precision when the goal is narrow.

## Pairs With

- **`proceed-with-the-recommendation`** (orchestrator, Law 2) — run a goal check at phase boundaries to confirm the plan still matches the work.
- **`para-memory-files`** / planning-with-files — the `## Goal` section this skill reads is the same one those workflows write.
- **`strategic-compact`** — before compacting a long session, a goal check confirms what the session was actually about.
