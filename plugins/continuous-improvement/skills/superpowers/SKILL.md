---
name: superpowers
tier: companion
description: "Law activator for the 7 Laws of AI Agent Discipline. Routes tasks to the correct Law-aligned specialist (brainstorming → Law 2, writing-plans → Law 2, test-driven-development → Law 3+4, verification-before-completion → Law 4, etc.) so the right discipline fires automatically instead of the agent skipping a step. Not a peer skill — a dispatcher for the others."
origin: https://github.com/obra/superpowers
---

# Superpowers — Mandatory Agent Workflows

Superpowers enforces a structured development workflow. Skills activate automatically when their trigger conditions are met. This is not optional guidance — it is mandatory workflow.

## Philosophy

AI agents skip steps, guess, and declare "done" without verifying. Superpowers blocks this by making workflow stages explicit and enforced.

## The Basic Workflow

| Order | Skill | When It Activates |
|-------|-------|-------------------|
| 1 | **brainstorming** | Before writing code. Refines rough ideas through questions, explores alternatives, presents design in sections for validation. Saves design document. |
| 2 | **using-git-worktrees** | After design approval. Creates isolated workspace on new branch, runs project setup, verifies clean test baseline. |
| 3 | **writing-plans** | With approved design. Breaks work into bite-sized tasks (2-5 minutes each). Every task has exact file paths, complete code, verification steps. |
| 4 | **subagent-driven-development** or **executing-plans** | With plan. Dispatches fresh subagent per task with two-stage review (spec compliance, then code quality), or executes in batches with human checkpoints. |
| 5 | **test-driven-development** | During implementation. Enforces RED-GREEN-REFACTOR: write failing test, watch it fail, write minimal code, watch it pass, commit. Deletes code written before tests. |
| 6 | **requesting-code-review** | Between tasks. Reviews against plan, reports issues by severity. Critical issues block progress. |
| 7 | **finishing-a-development-branch** | When tasks complete. Verifies tests, presents options (merge/PR/keep/discard), cleans up worktree. |
| 8 | **deploy-receipt** | When the deploy branch auto-deploys (Railway / Cloudflare Workers / Vercel / Netlify / Fly.io / etc.). Verifies deployed SHA matches merge SHA and healthcheck returns 200. Until the receipt is COMPLETE the merge is not reported as done. |

The agent checks for relevant skills before any task. These are mandatory workflows, not suggestions.

## Stacked-PR Plan Precondition (≥3 files)

Any change touching three or more files — across `skills/`, `src/`, `bin/`, `commands/`, or any combination — must produce a stacked-PR plan as a precondition to the first edit landing. The 28-day usage report shows a clean correlation: sessions that opened with a stacked-PR plan landed at `fully_achieved`; sessions that began as a single big-bang multi-file edit landed at `partially_achieved` (landing-page dark theme, market-data-hub wiring, RAG misrouting). Single-concern PRs are the lever that closes that gap.

The required plan output has four components, in this order:

1. **Per-PR table** — title, scope (files), test strategy, merge order. One row per PR.
2. **Dependency graph** — which PRs depend on which (or "independent" if none).
3. **Worktree per PR** — branch name + base commit. Sequential by default; parallel only when items share no state.
4. **Out-of-scope list** — anything explicitly NOT in the train. Drive-by temptations get logged here, not implemented.

The plan ships as the FIRST commit of the train's first PR (under `docs/plans/YYYY-MM-DD-<slug>.md`) and is cited by every subsequent commit it produces.

### When this rule does NOT fire

The threshold targets multi-concern feature work, not high-volume mechanical changes. The rule does NOT fire on:

- **Markdown-only commits** — README, CHANGELOG, docs/ updates that touch many files but ship one concern.
- **Lockfile-only commits** — `package-lock.json`, `pnpm-lock.yaml`, `Cargo.lock`, etc. updated in isolation by a dependency bump.
- **Generated-only commits** — output of `npm run build`, `tsc`, codemod sweeps, or any tool whose input is one source file and whose output is many derived files. The source change is what counts toward the threshold; the regenerated artifacts ride free.
- **Vendor-snapshot refreshes** — `third-party/<name>/` updated by a documented `bin/refresh-third-party.mjs` driver. The single source of change is the upstream SHA bump.
- **Skill-mirror sync commits** — `skills/<name>.md` + `plugins/continuous-improvement/skills/<name>/SKILL.md` count as one file pair, not two, since the CONTRIBUTING.md skill mirror rule treats them as the same concern.

If you are unsure whether the rule applies, the fall-through default is to write the plan. A 30-line plan doc is cheap; a stranded big-bang edit is expensive.

## Skill Library

### Testing
- **test-driven-development** — RED-GREEN-REFACTOR cycle (includes testing anti-patterns reference)

### Debugging
- **systematic-debugging** — 4-phase root cause process (includes root-cause-tracing, defense-in-depth, condition-based-waiting techniques)
- **verification-before-completion** — Ensure it's actually fixed

### Collaboration
- **brainstorming** — Socratic design refinement
- **writing-plans** — Detailed implementation plans
- **executing-plans** — Batch execution with checkpoints
- **dispatching-parallel-agents** — Concurrent subagent workflows
- **requesting-code-review** — Pre-review checklist
- **receiving-code-review** — Responding to feedback
- **using-git-worktrees** — Parallel development branches
- **finishing-a-development-branch** — Merge/PR decision workflow
- **subagent-driven-development** — Fast iteration with two-stage review (spec compliance, then code quality)

### Deployment Verification
- **deploy-receipt** — Closes the merge-to-production gap on auto-deploy targets (CI-side companion to `finishing-a-development-branch`)

### Meta
- **writing-skills** — Create new skills following best practices (includes testing methodology)
- **using-superpowers** — Introduction to the skills system

## Test-Driven Development (Mandatory)

```
RED: Write failing test → Watch it fail
GREEN: Write minimal code → Watch it pass
REFACTOR: Improve while staying green → Commit
```

Code written before tests is deleted. No exceptions.

## Brainstorming Protocol

When given a vague request:

1. Ask clarifying questions
2. Explore 2-3 alternative approaches
3. Present design in sections
4. Wait for explicit approval before proceeding

## Plan Format

Every task in a plan must include:

```yaml
- task: "Specific action"
  file: "exact/path/to/file.ext"
  code: "Complete implementation"
  verify: "How to confirm it works"
  estimate: "2-5 minutes"
```

## Code Review Severity

| Level | Action |
|-------|--------|
| Critical | Blocks progress. Must fix before continuing. |
| Warning | Should fix. Note and continue. |
| Info | Noted for later. No action required. |

## Subagent Development

Two-stage review for every task:

1. **Spec compliance** — Does it match the plan?
2. **Code quality** — Is it clean, tested, and maintainable?

Both must pass. Fresh subagent per task prevents context pollution.

## Git Worktrees

Each feature gets an isolated workspace:

```bash
git worktree add -b feature-name ../feature-name
```

Clean separation, parallel development, easy cleanup.

## Using Superpowers

Superpowers skills activate when their trigger conditions are detected:

- "Create a feature" → brainstorming → writing-plans → executing-plans
- "Fix this bug" → systematic-debugging → verification-before-completion
- "Review this PR" → requesting-code-review

No manual skill selection. The framework detects and enforces.
