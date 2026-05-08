---
name: superpowers
description: "Law activator and dispatcher — route the task to the right Law-aligned specialist across continuous-improvement and four vendored upstream skill libraries (Obra superpowers, addy-agent-skills, ruflo-swarm, oh-my-claudecode)."
---

# /superpowers

`/superpowers` is **the dispatcher**, not a peer skill. It does not do work itself; it routes each user task to the correct Law-aligned specialist so the right discipline fires automatically instead of the agent skipping a step.

The 7 Laws define *what* discipline must be applied. `/superpowers` decides *which specialist* enforces it for this specific task, across five sources installed from this marketplace.

## Routing surface (five sources)

| Source | Where it lives | Examples of what it routes to |
|---|---|---|
| `continuous-improvement` (this plugin) | bundled — always present | `gateguard` (Law 1), `tdd-workflow` (Law 3+4), `verification-loop` (Law 4), `wild-risa-balance` (Law 2), `safety-guard` (Law 3), `proceed-with-the-recommendation` (all 7), `ralph` (Law 6), `workspace-surface-audit` (Law 1) |
| `obra/superpowers` (Jesse Vincent) | vendored at `third-party/superpowers/`, pinned SHA `f2cbfbe` (v5.1.0) | `superpowers:brainstorming`, `:writing-plans`, `:executing-plans`, `:test-driven-development`, `:systematic-debugging`, `:requesting-code-review`, `:receiving-code-review`, `:verification-before-completion`, `:dispatching-parallel-agents`, `:using-git-worktrees`, `:finishing-a-development-branch`, `:subagent-driven-development`, `:writing-skills`, `:using-superpowers` |
| `addyosmani/agent-skills` | vendored at `third-party/addy-agent-skills/`, pinned SHA `742dca5` (v1.0.0) | `spec-driven-development`, `source-driven-development`, `context-engineering`, `idea-refine`, `incremental-implementation`, `code-review-and-quality`, `code-simplification`, `security-and-hardening`, `debugging-and-error-recovery`, `performance-optimization`, `api-and-interface-design`, `frontend-ui-engineering`, `browser-testing-with-devtools`, `ci-cd-and-automation`, `deprecation-and-migration`, `documentation-and-adrs`, `git-workflow-and-versioning`, `planning-and-task-breakdown`, `shipping-and-launch` |
| `ruflo-swarm` (ruvnet) | vendored at `third-party/ruflo-swarm/`, pinned SHA `addb5cd` (v0.2.0) | `swarm-init`, `monitor-stream`; `swarm_*` and `agent_*` MCP tools; `/swarm`, `/watch` |
| `oh-my-claudecode` (Yeachan-Heo) | vendored at `third-party/oh-my-claudecode/`, pinned SHA `aacde3e` (v4.13.6) | 39 skills + 19 agents — `release`, `ultrawork`, `ultraqa`, `team`, `trace`, `visual-verdict`, `debug`, `deep-dive`, `deep-interview`, `autopilot`, `autoresearch`, plus a separate `ralph` (overlaps with our `/ralph` — see "Distinct variants" below) |

PM coverage (product-management skills) lives **outside** this marketplace. If you need it, install [`phuryn/pm-skills`](https://github.com/phuryn/pm-skills) separately via Claude Code's host marketplace; the dispatcher names it as a routing target without pre-resolving the namespace. See [docs/THIRD_PARTY.md § Routing in /superpowers](../docs/THIRD_PARTY.md#routing-in-superpowers).

## Distinct variants — never collapse them

Two routing targets carry the same short name across sources. Treat them as distinct; do not silently substitute one for the other.

| Short name | `obra/superpowers` (Obra) | `continuous-improvement` (CI fork) |
|---|---|---|
| `superpowers` (skill) | activator routing into Obra skills | `superpowers` skill in this repo: Law-aligned activator wrapping the dispatcher commitments below |
| `ralph` | not present in Obra | bundled here; `oh-my-claudecode` ships its own `ralph` — pick deliberately, do not auto-merge |

If both Obra `superpowers` and continuous-improvement are loaded, you can call either explicitly: `superpowers:test-driven-development` (Obra) or `tdd-workflow` (CI). Same Law (3+4), different implementation depth.

## Dispatcher commitments (override looser global defaults when `/superpowers` is in scope)

When this dispatcher is active for a task, these six rules apply over any looser convention:

1. **Subagent-driven development is the default for non-trivial tasks.** Two-stage spec + quality review per [obra/superpowers § subagent-driven-development](https://github.com/obra/superpowers).
2. **Parallel fan-out goes through `superpowers:dispatching-parallel-agents`** (or `/swarm`), not hand-rolled `Task` calls.
3. **TDD runs RED → GREEN → REFACTOR.** Code written before its test is **deleted**, not retrofitted. Routes to `tdd-workflow` (CI) or `superpowers:test-driven-development` (Obra) — pick by depth, never both for the same task.
4. **Branch isolation is `using-git-worktrees`** by default for any task that touches more than one file.
5. **`finishing-a-development-branch` runs before any push.** No bypass via `--no-verify`, `--force`, or direct push to `main`.
6. **Obra `superpowers` and `continuous-improvement:superpowers` stay distinct.** Both can be installed; neither shadows the other; the dispatcher names which one is firing.

## Routing rules (which source wins)

| User intent | Preferred routing target | Source |
|---|---|---|
| New feature, vague requirements | `superpowers:brainstorming` → `:writing-plans` | `obra/superpowers` |
| Fix this bug | `superpowers:systematic-debugging` → `tdd-workflow` (RED first) → `verification-loop` | Obra → CI → CI |
| Walk an agent's recommendation list | `proceed-with-the-recommendation` | CI |
| Write tests for new code | `tdd-workflow` (CI default) or `superpowers:test-driven-development` (Obra, deeper) | CI / Obra |
| Verify before reporting "done" | `verification-loop` | CI |
| Refactor, multi-file | `superpowers:using-git-worktrees` → `:writing-plans` → `tdd-workflow` → `:finishing-a-development-branch` | Obra → Obra → CI → Obra |
| Long autonomous PRD execution | `/ralph` (CI variant) | CI |
| Parallel sub-agent fan-out | `superpowers:dispatching-parallel-agents` or `/swarm` | Obra / ruflo-swarm |
| Spec-first, contract-first feature | `spec-driven-development` | addy-agent-skills |
| Frontend / UI generation | `frontend-design` (external plugin) | external |
| Diff walk + severity tagging | `code-review` (external plugin) or `superpowers:requesting-code-review` | external / Obra |
| Library / framework docs lookup | `documentation-lookup` (Context7 MCP) | external |
| Compliance / security gate | `security-and-hardening` (addy) → `security-review` (host built-in) | addy → host |
| Release coordination across PRs | `/release-train` | CI |

## Missing-companion detection

If `/superpowers` is asked to route to a source that is not installed, it does not silently fall back to the inline placeholder. It must:

1. **Name the missing source** explicitly (e.g. `obra/superpowers` not loaded).
2. **Quote the exact install line** for it from the marketplace already added in setup, e.g. `/plugin install superpowers@continuous-improvement`.
3. **State the inline-fallback equivalent** that will run if the user declines to install (and which Law that fallback enforces).
4. **Stop and ask** before continuing. Do not silently downgrade.

This is the same hard-halt discipline used by `proceed-with-the-recommendation` for `needs-approval` items.

## Subcommands

### `/superpowers status`

Show which routing sources are loaded, which workflow stages are active for the current task, and which sources are **missing**:

```
=== Superpowers Status ===

Sources:
  [x] continuous-improvement       (bundled)
  [x] obra/superpowers              v5.1.0 (vendored)
  [ ] addyosmani/agent-skills       MISSING — /plugin install agent-skills@continuous-improvement
  [x] ruflo-swarm                   v0.2.0 (vendored)
  [ ] oh-my-claudecode              MISSING — /plugin install oh-my-claudecode@continuous-improvement

Active for current task:
  [x] brainstorming (trigger: new feature request)
  [ ] using-git-worktrees (waiting: design approval)
  [ ] writing-plans (waiting: worktree ready)
  [ ] test-driven-development (waiting: plan approved)
  [ ] requesting-code-review (waiting: implementation)
  [ ] finishing-a-development-branch (waiting: completion)
```

### `/superpowers enable <skill>`

Explicitly enable a skill for the current session — useful when the dispatcher's intent detection guesses wrong:

```
/superpowers enable test-driven-development
/superpowers enable superpowers:writing-plans   # namespaced form for Obra
```

### `/superpowers workflow <type>`

Activate a complete workflow preset:

| Preset | Skills activated (in order) |
|---|---|
| `new-feature` | `superpowers:brainstorming` → `:using-git-worktrees` → `:writing-plans` → `tdd-workflow` → `verification-loop` → `:requesting-code-review` → `:finishing-a-development-branch` |
| `bug-fix` | `superpowers:systematic-debugging` → `verification-loop` → `tdd-workflow` (regression test first) → `:requesting-code-review` |
| `refactor` | `superpowers:using-git-worktrees` → `:writing-plans` → `tdd-workflow` → `:requesting-code-review` → `:finishing-a-development-branch` |
| `review` | `superpowers:requesting-code-review` → `:receiving-code-review` |
| `release` | `/release-train` → `verification-loop` → `superpowers:finishing-a-development-branch` |

Example:
```
/superpowers workflow new-feature
```

## Verification protocol (Law 4)

Every routed skill must verify before reporting completion. The dispatcher refuses to advance to the next stage until the current one shows:

1. Code runs without errors
2. Output matches expected result
3. Actual result checked — not assumed
4. Build passes
5. Change explainable in one sentence

This is `verification-loop` from `continuous-improvement`. It runs after every workflow stage, not just at the end.

## Integration

`/superpowers` integrates with:

- **`/seven-laws`** — runs after each stage to capture the reflection block and update instincts (Laws 5 + 7)
- **`/proceed-with-the-recommendation`** — orchestrates a list of recommendations end-to-end, using `/superpowers` per item
- **`/workspace-surface-audit`** — runs at task start to confirm the right routing surface is actually present (Law 1 pre-flight)
- **`/ralph`** — autonomous variant; takes a PRD and walks it story-by-story under the same routing table

## Example session

```
User: "Build a checkout flow"

[/superpowers status] →
  Sources: continuous-improvement [x], obra/superpowers [x], others [ ]
  Routing intent: new-feature

[brainstorming activates — obra/superpowers]
AI: "Clarifying questions: 1) Payment provider? 2) Guest checkout?"

User: "Stripe, yes guest checkout"

[using-git-worktrees activates — obra/superpowers]
AI: "Created worktree at ../checkout-feature"

[writing-plans activates — obra/superpowers]
AI: "Plan created with 6 tasks. Approve?"

User: "Approved"

[tdd-workflow activates — continuous-improvement]
AI: "Task 1 RED: write failing test for cart validation..."
AI: "Task 1 GREEN: minimal handler. Verifying with `npm test cart.test.ts`..."
AI: "Task 1 REFACTOR: extract validator, tests still green. Committing."

[verification-loop activates — continuous-improvement]
AI: "Build [x] Types [x] Lint [x] Tests 42/42 [x] Security scan clean [x]"

[finishing-a-development-branch activates — obra/superpowers]
AI: "Options: merge / PR / keep / discard?"
```
