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

The agent checks for relevant skills before any task. These are mandatory workflows, not suggestions.

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
