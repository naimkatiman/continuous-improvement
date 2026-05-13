---
name: superpowers
tier: companion
description: "Law activator for the 7 Laws of AI Agent Discipline. Unified four-source dispatcher — routes tasks to the correct Law-aligned specialist across the CI plugin (tdd-workflow, verification-loop, gateguard, ralph, deploy-receipt) and four registered upstream companions (Obra superpowers, addy agent-skills, ruflo-swarm, oh-my-claudecode) so the right discipline fires automatically instead of the agent skipping a step. Product-management coverage comes from phuryn/pm-skills via an out-of-band marketplace install (see docs/THIRD_PARTY.md). Not a peer skill — a dispatcher for the others."
origin: https://github.com/obra/superpowers
---

# Superpowers — Mandatory Agent Workflows (Five-Source Dispatcher)

Superpowers enforces a structured development workflow. Skills activate automatically when their trigger conditions are met. This is not optional guidance — it is mandatory workflow.

## Philosophy

AI agents skip steps, guess, and declare "done" without verifying. Superpowers blocks this by making workflow stages explicit and enforced.

## What changed in v3.8.0

The dispatcher now routes across **four registered marketplaces** instead of relying on Obra installed separately. All four are installable from one marketplace entry:

```
/plugin install superpowers@continuous-improvement       # Obra's 14 workflow skills
/plugin install agent-skills@continuous-improvement      # Addy's 21 SDLC skills
/plugin install ruflo-swarm@continuous-improvement       # Agent swarm + Monitor stream
/plugin install oh-my-claudecode@continuous-improvement  # 39 skills + 19 agents
```

The CI plugin (this dispatcher + `tdd-workflow`, `verification-loop`, `gateguard`, `ralph`, `deploy-receipt`, etc.) installs by default. The four companions are opt-in — install only what you need.

Product-management coverage (PRD, OKRs, personas, GTM, etc.) is provided by `phuryn/pm-skills` via an out-of-band Claude Code marketplace install:

```
claude plugin marketplace add phuryn/pm-skills
claude plugin install pm-toolkit@pm-skills
claude plugin install pm-product-strategy@pm-skills
claude plugin install pm-product-discovery@pm-skills
claude plugin install pm-market-research@pm-skills
claude plugin install pm-data-analytics@pm-skills
claude plugin install pm-marketing-growth@pm-skills
claude plugin install pm-go-to-market@pm-skills
claude plugin install pm-execution@pm-skills
```

See `docs/THIRD_PARTY.md` for plugin-by-plugin scope.

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

## Four-Source Routing Table

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
| Product-management work (PRD, OKRs, personas, GTM, growth, market research, analytics) | 1+2+5 | Install `phuryn/pm-skills` via Claude Code marketplace — see docs/THIRD_PARTY.md. Eight installable plugins (`pm-toolkit`, `pm-product-strategy`, `pm-product-discovery`, `pm-market-research`, `pm-data-analytics`, `pm-marketing-growth`, `pm-go-to-market`, `pm-execution`) cover the full lifecycle. Out of band — not a `/plugin install <name>@continuous-improvement` target. |

When no installed plugin in the chain resolves, the dispatcher falls back to the inline protocols below (Test-Driven Development, Brainstorming, Plan Format, etc.) so the workflow still works on a clean install.

## Companion-Preference Override

The four-source routing table above is **CI-first by default**: where a CI-bundled skill (`ci:tdd-workflow`, `ci:verification-loop`, `ci:planning-with-files`, `ci:context-budget`, `ci:ralph`, `ci:learn-eval`) and a companion skill resolve the same trigger, the table lists the CI skill first and the dispatcher picks it. That is the conservative default — the CI plugin ships with the marketplace, the companions are opt-in installs, so a clean install routes to skills that are guaranteed present.

Once the operator has explicitly installed a companion plugin (`superpowers@continuous-improvement`, `agent-skills@continuous-improvement`, `ruflo-swarm@continuous-improvement`, `oh-my-claudecode@continuous-improvement`), the default starts working against them: the installed companion is shadowed by the CI fallback for the same trigger. This override flag respects the operator's explicit install choice without forcing every user to relitigate routing per task.

### Setting the flag

Add a `continuous_improvement.companion_preference` key to `~/.claude/settings.json`:

```json
{
  "continuous_improvement": {
    "companion_preference": "companions-first"
  }
}
```

Valid values:

| Value | Behavior |
|---|---|
| `"ci-first"` (default) | Unchanged from the routing tables above. CI-bundled skills win every chain where they appear. |
| `"companions-first"` | For any routing row that lists both a CI skill and a companion alternative, the dispatcher reads the chain right-to-left: companion first, CI as the silent fallback if the companion plugin is not installed. CI-only rows (`ci:gateguard`, `ci:deploy-receipt`, `ci:workspace-surface-audit`, `ci:proceed-with-the-recommendation`) are unaffected because no companion exists. |
| `"strict-companions"` | Same as `companions-first`, but the CI fallback is suppressed. If the companion plugin is not installed, the dispatcher hard-halts with the same shape as the missing-companion detection in `/superpowers` and asks the operator to install the companion or change the flag. Use when you want a guarantee that the installed companion ran, not the CI shim. |

### Which rows the override affects

These are the routing rows where the override changes the resolved target. Rows not listed here are CI-only or companion-only and route the same under any setting.

| Trigger | `ci-first` (default) | `companions-first` |
|---|---|---|
| Write a failing test before code | `ci:tdd-workflow` | `superpowers:test-driven-development`, then `agent-skills:test-driven-development` |
| Verify before declaring done | `ci:verification-loop` | `superpowers:verification-before-completion` |
| Curate the right context window | `ci:context-budget` | `agent-skills:context-engineering` |
| Long autonomous run with quality gates | `ci:ralph` | `oh-my-claudecode:ultrawork`, then `ci:ralph` |
| Reflect after session, extract patterns | `ci:learn-eval` | `oh-my-claudecode:retrospective` |

`superpowers:writing-plans` already wins the planning chain under both settings — it is the first entry, with `ci:planning-with-files` as the third fallback — so that row is unchanged.

### Hard halts that remain regardless of the flag

The override does not disable:

- `gateguard` PreToolUse fact-list enforcement (Law 1, runtime layer in `hooks/gateguard.mjs`)
- Stop-hook three-section-close discipline (Law 4 + Law 7, runtime layer in `hooks/three-section-close.mjs`)
- Dispatcher commitments 1–6 above (subagent-driven-development default, parallel fan-out routing, TDD RED-GREEN-REFACTOR, worktree isolation, finishing-a-development-branch before push, distinct Obra/CI variants)
- Phase 0 P-MAG in `proceed-with-the-recommendation` (Law 5 + Law 7)

These are framework invariants, not routing preferences. The flag re-orders which specialist runs; it does not weaken what the framework guarantees.

### Runtime enforcement

The override is enforced at the PreToolUse layer by `hooks/companion-preference.mjs`. On every `Skill` tool call, the hook reads `~/.claude/settings.json` for the `companion_preference` value and:

- `ci-first` (default): no-op, allow.
- `companions-first`: emit a one-line stderr advisory naming the preferred companion; allow.
- `strict-companions`: block the call. Reason names the companion when its plugin is installed, or the `/plugin install <plugin>@continuous-improvement` hint when it is not.

The override map inside `hooks/companion-preference.mjs` stays row-aligned with the "Which rows the override affects" table above. Drift surfaces in the hook test suite, which walks the same pairs and fails on any new CI→companion row that the hook does not recognize.

The hook fails open. If `~/.claude/settings.json` is missing, malformed, or unreadable, the hook emits `{ "decision": "allow" }` and exits 0. Bugs in the hook never block tool calls — they only fail to enforce.

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
- "Draft a PRD" / "Write OKRs" / "Build a persona" → install `phuryn/pm-skills` (out of band — see docs/THIRD_PARTY.md)
- "Run this PRD autonomously" → `ci:ralph`
- "Fan out parallel provider migration" → `superpowers:dispatching-parallel-agents` or `/swarm` (PR D)
- "Visual regression check the landing page" → `oh-my-claudecode:visual-verdict`

No manual skill selection. The framework detects the trigger, resolves the chain, and enforces.
