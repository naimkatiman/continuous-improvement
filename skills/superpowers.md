---
name: superpowers
tier: companion
description: "Law activator for the 7 Laws of AI Agent Discipline. Unified five-source dispatcher — routes tasks to the correct Law-aligned specialist across the CI plugin (tdd-workflow, verification-loop, gateguard, ralph, deploy-receipt) and four registered upstream companions (Obra superpowers, addy agent-skills, ruflo-swarm, oh-my-claudecode, pm-skills) so the right discipline fires automatically instead of the agent skipping a step. Not a peer skill — a dispatcher for the others."
origin: https://github.com/obra/superpowers
---

# Superpowers — Mandatory Agent Workflows (Five-Source Dispatcher)

Superpowers enforces a structured development workflow. Skills activate automatically when their trigger conditions are met. This is not optional guidance — it is mandatory workflow.

## Philosophy

AI agents skip steps, guess, and declare "done" without verifying. Superpowers blocks this by making workflow stages explicit and enforced.

## What changed in v3.8.0

The dispatcher now routes across **five registered marketplaces** instead of relying on Obra installed separately. All five are installable from one marketplace entry:

```
/plugin install superpowers@continuous-improvement       # Obra's 14 workflow skills
/plugin install agent-skills@continuous-improvement      # Addy's 21 SDLC skills
/plugin install ruflo-swarm@continuous-improvement       # Agent swarm + Monitor stream
/plugin install oh-my-claudecode@continuous-improvement  # 39 skills + 19 agents
/plugin install pm-skills@continuous-improvement         # 41 PM skills + 47 commands
```

The CI plugin (this dispatcher + `tdd-workflow`, `verification-loop`, `gateguard`, `ralph`, `deploy-receipt`, etc.) installs by default. The five companions are opt-in — install only what you need.

## The Basic Workflow

| Order | Skill | When It Activates |
|-------|-------|-------------------|
| 1 | **brainstorming** | Before writing code. Refines rough ideas through questions, explores alternatives, presents design in sections for validation. |
| 2 | **using-git-worktrees** | After design approval. Creates isolated workspace on new branch, runs project setup, verifies clean test baseline. |
| 3 | **writing-plans** | With approved design. Breaks work into bite-sized tasks (2-5 minutes each). Every task has exact file paths, complete code, verification steps. |
| 4 | **subagent-driven-development** or **executing-plans** | With plan. Dispatches fresh subagent per task with two-stage review (spec compliance, then code quality), or executes in batches with human checkpoints. |
| 5 | **test-driven-development** | During implementation. Enforces RED-GREEN-REFACTOR: write failing test, watch it fail, write minimal code, watch it pass, commit. Deletes code written before tests. |
| 6 | **requesting-code-review** | Between tasks. Reviews against plan, reports issues by severity. Critical issues block progress. |
| 7 | **finishing-a-development-branch** | When tasks complete. Verifies tests, presents options (merge/PR/keep/discard), cleans up worktree. |
| 8 | **deploy-receipt** | When the deploy branch auto-deploys (Railway / Cloudflare Workers / Vercel / Netlify / Fly.io / etc.). Verifies deployed SHA matches merge SHA and healthcheck returns 200. Until the receipt is COMPLETE the merge is not reported as done. |

The agent checks for relevant skills before any task. These are mandatory workflows, not suggestions.

## Five-Source Routing Table

When a task trigger fires, the dispatcher resolves to the first available skill in the preference chain. Order = preference order. Items prefixed with `ci:` are bundled in this plugin; others are namespaced by their installed plugin name.

| Trigger | Law | Preferred → Fallback chain |
|---|---|---|
| Write a failing test before code | 3+4 | `ci:tdd-workflow` → `superpowers:test-driven-development` → `agent-skills:test-driven-development` |
| Verify before declaring done | 4 | `ci:verification-loop` → `superpowers:verification-before-completion` |
| Block edit until investigation present | 1 | `ci:gateguard` (no equivalents) |
| Diagnose root cause across layers | 6 | `superpowers:systematic-debugging` → `agent-skills:debugging-and-error-recovery` |
| Refine vague request into design | 2 | `superpowers:brainstorming` → `agent-skills:idea-refine` |
| Decompose plan into atomic tasks | 2 | `superpowers:writing-plans` → `agent-skills:planning-and-task-breakdown` → `ci:planning-with-files` |
| Execute plan with checkpoints | 3+6 | `superpowers:executing-plans` → `agent-skills:incremental-implementation` |
| Spawn fresh subagent per task | 3 | `superpowers:subagent-driven-development` → `superpowers:dispatching-parallel-agents` |
| Fan out N parallel agents on isolated worktrees | 3 | `superpowers:dispatching-parallel-agents` → `ruflo-swarm:swarm-init` |
| Stream live observation of long agent runs | 4 | `ruflo-swarm:monitor-stream` (only source) |
| Isolate work on a new branch | 3 | `superpowers:using-git-worktrees` (only source) |
| Decide merge / PR / discard at branch end | 3+4 | `superpowers:finishing-a-development-branch` → `agent-skills:shipping-and-launch` |
| Pre-review checklist before requesting review | 4 | `superpowers:requesting-code-review` → `agent-skills:code-review-and-quality` |
| Respond to reviewer feedback | 4 | `superpowers:receiving-code-review` |
| Verify deployed SHA matches merge SHA | 4 | `ci:deploy-receipt` (only source) |
| Audit repo / MCP / env at session start | 1 | `ci:workspace-surface-audit` (only source) |
| Run autonomous PRD loop | 6 | `ci:ralph` → `oh-my-claudecode:ralph` (heavy overlap; prefer CI) |
| Audit-then-execute production fix sweep | all | `ci:proceed-with-the-recommendation` (only source) |
| Spec-first contract before implementation | 2 | `agent-skills:spec-driven-development` (only source) |
| Source-first reading before writing | 1 | `agent-skills:source-driven-development` (only source) |
| Curate the right context window | 1 | `agent-skills:context-engineering` → `ci:context-budget` |
| Simplify code, remove duplication | 6 | `agent-skills:code-simplification` → `simplify` |
| Security review for auth/input/secrets | 4 | `agent-skills:security-and-hardening` → `security-review` |
| Browser-level visual regression | 4 | `oh-my-claudecode:visual-verdict` (only source) |
| Reflect after session, extract patterns | 5+7 | `ci:learn-eval` → `oh-my-claudecode:retrospective` |
| Long autonomous run with quality gates | 6 | `oh-my-claudecode:ultrawork` → `ci:ralph` |
| Coordinator role for staged hand-off | 3 | `ruflo-swarm:agents/coordinator` (when ruflo installed) |
| Draft a PRD before implementation | 2 | `pm-skills:prd` (only source) |
| Decompose into user stories + acceptance criteria | 2 | `pm-skills:user-stories` + `pm-skills:acceptance-criteria` |
| Write or grade quarterly OKRs | 2 | `pm-skills:okr-writer` + `pm-skills:okr-grader` |
| Design hypothesis-driven experiment | 2 | `pm-skills:experiment-design` + `pm-skills:hypothesis` |
| Discovery framework: persona, JTBD, lean canvas | 1 | `pm-skills:persona` + `pm-skills:jtbd-canvas` + `pm-skills:lean-canvas` |
| Market sizing / competitive analysis | 1 | `pm-skills:market-sizing` + `pm-skills:competitive-analysis` |
| Meeting agenda / brief / recap / synthesize | 5 | `pm-skills:meeting-*` family |
| Launch checklist before product release | 4 | `pm-skills:launch-checklist` (no engineering equivalent) |

When no installed plugin in the chain resolves, the dispatcher falls back to the inline protocols below (Test-Driven Development, Brainstorming, Plan Format, etc.) so the workflow still works on a clean install.

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

Superpowers skills activate when their trigger conditions are detected. The dispatcher resolves each trigger through the five-source routing table above:

- "Create a feature" → `superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:executing-plans`
- "Fix this bug" → `superpowers:systematic-debugging` → `superpowers:verification-before-completion`
- "Review this PR" → `superpowers:requesting-code-review`
- "Draft a PRD" → `pm-skills:prd` → `pm-skills:user-stories` → `pm-skills:acceptance-criteria`
- "Write OKRs for next quarter" → `pm-skills:okr-writer` then `pm-skills:okr-grader`
- "Run this PRD autonomously" → `ci:ralph`
- "Fan out parallel provider migration" → `superpowers:dispatching-parallel-agents` or `/swarm` (PR D)
- "Visual regression check the landing page" → `oh-my-claudecode:visual-verdict`

No manual skill selection. The framework detects the trigger, resolves the chain, and enforces.
