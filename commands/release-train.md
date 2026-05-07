---
name: release-train
description: "Autonomous multi-PR release train — plan stacked single-concern PRs, open each on its own branch, monitor CI, rebase on conflicts, and ship in dependency order while you sleep. Driven by report.html horizon item 'Autonomous Multi-PR Release Trains'."
---

# /release-train

Long-running autonomous orchestrator for stacked-PR rollouts. Driven by the user's session report (1,218 messages, 178 sessions): the audit-then-execute pattern landed at `fully_achieved` when sessions opened with a stacked-PR plan; sessions that started as big-bang multi-file edits landed at `partially_achieved`.

This command formalizes the pattern. It does NOT bypass branch protection, force-push, or merge unreviewed PRs.

## Preconditions

Before invoking this command:

1. A `RELEASE_PLAN.md` (or `docs/plans/YYYY-MM-DD-<slug>.md`) exists in the repo with a per-PR table, dependency graph, worktree-per-PR, and out-of-scope list. Per the Stacked-PR Plan Precondition in the unified `/superpowers` dispatcher.
2. The plan was reviewed and explicitly approved by the operator.
3. The base branch (`main`) is clean and up to date with `origin/main`.
4. CI is green on `origin/main`.

If any precondition fails, this command halts and reports what is missing rather than improvising.

## Behavior

For each PR in the plan, in dependency order:

1. **Worktree** — `git worktree add -b <branch> ../<branch> origin/main` (or off the previous PR's branch when the dependency requires it).
2. **Implement** — TDD-first per `superpowers:test-driven-development`: failing test, watch it fail, write minimal code, watch it pass, commit.
3. **Verify** — `superpowers:verification-before-completion` before claiming done. Smallest check that proves correctness.
4. **Review** — dispatch a fresh subagent for spec-compliance + code-quality two-stage review per `superpowers:subagent-driven-development`. Critical findings block progress.
5. **Open PR** — `gh pr create --base <base-of-this-PR> --head <branch>` with single-concern description that cites the plan doc.
6. **Wait for CI** — poll until green. Auto-rebase on conflicts (max 2 attempts; halt on third).
7. **Address review** — `superpowers:receiving-code-review` to walk reviewer comments. Critical findings produce a fix commit; non-critical are logged on the PR.
8. **Merge when green and approved** — never bypass branch protection. If branch protection blocks, post a status comment and continue with the next independent PR.
9. **Deploy receipt** — when the merged branch is on an auto-deploy target, run `deploy-receipt` to verify deployed SHA matches merge SHA + healthcheck 200 before reporting the PR as done.

Logs every state transition to `release-train.log` in the repo root.

## Stop conditions

Halt and surface to the operator if any of these occur:

- A `CRITICAL` reviewer finding cannot be auto-resolved.
- Two consecutive auto-rebase attempts fail on the same PR.
- A PR has been waiting on CI for more than 30 minutes.
- A required check (branch protection, status check, required reviewer) blocks merge.
- A deploy-receipt times out or returns non-200.
- The plan's dependency graph becomes unsatisfiable (e.g. a dependency PR was closed unmerged).

When halted, write a state file to `release-train.halt.md` describing exactly which PR halted, why, and what the operator needs to decide before resuming.

## Resuming

Re-invoke `/release-train` after the halt is resolved. The orchestrator reads `release-train.log` and `release-train.halt.md` to skip already-merged PRs and resume from the halt point.

## Composition

This command activates the unified `/superpowers` dispatcher and routes through:

- `superpowers:writing-plans` (or its inline fallback) to validate the plan
- `superpowers:using-git-worktrees` for isolation per PR
- `superpowers:test-driven-development` for implementation
- `superpowers:subagent-driven-development` for two-stage review
- `superpowers:finishing-a-development-branch` for merge decisions
- `deploy-receipt` (CI-bundled) for production verification
- `proceed-with-the-recommendation` orchestrator to walk the plan's PR list

## Anti-patterns this command refuses

- **Big-bang merge.** Will not merge a PR that touches more than 15 non-generated files.
- **Bypass.** Will not use `--admin`, `--force`, or `--no-verify`.
- **Speculative fix during CI wait.** Will not push speculative fixes during the first-time-contributor workflow-approval gate.
- **Drive-by scope.** Will not add a fix outside the plan's scope; logs as deferred follow-up instead.

## Example

```
/release-train docs/plans/2026-05-07-unified-five-plugin-dispatcher.md
```

Reads the plan, opens worktrees in dependency order, ships each PR through the full discipline, halts only at policy gates.
