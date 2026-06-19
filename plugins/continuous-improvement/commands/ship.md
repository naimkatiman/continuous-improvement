---
name: ship
description: "Single-defect fast path — walk one bug from ground-truth audit through a TDD fix, full verification, a single-concern commit, and an open PR, then stop. Never auto-merges, never deploys. For multi-PR rollouts use /release-train instead."
---

# /ship

The one-defect fast path. `/release-train` is for stacked multi-PR rollouts and `/proceed-with-the-recommendation` walks an arbitrary recommendation list; `/ship` is the common case: fix one defect, open one PR, hand it back for review.

Pure routing over existing skills. It adds no new orchestration logic and it does NOT bypass branch protection, force-push, auto-merge, or deploy.

## Usage

```
/ship <one-line description of the defect>
```

If the description is ambiguous or names more than one concern, `/ship` halts and asks you to narrow it — one defect per run.

## Behavior

In order, for the single defect:

1. **Ground truth** — `reconcile` (or its inline fallback): confirm the working tree is clean and on a feature branch cut from an up-to-date `origin/<base>`. If on a protected branch or a stale base, halt and ask.
2. **Reproduce (RED)** — `tdd-workflow`: write a failing test that reproduces the defect; watch it fail. Pre-test implementation code is deleted, not kept.
3. **Fix (GREEN)** — write the minimal change that makes the test pass; watch it pass. One concern only.
4. **Verify** — `verification-loop`: run the project's verify ladder (build, types, tests). Build-green is evidence of mechanism, not of the fix — confirm the defect itself no longer reproduces.
5. **Commit** — one commit, one concern, staged by explicit filename (never `git add -A`). Use a Windows-safe commit message: a single-line `-m` (repeat `-m` for paragraphs) or `git commit -F <tempfile>` — no multi-line here-docs/here-strings.
6. **Open PR** — `commit-commands:commit-push-pr` (or `gh pr create`): push the branch and open a single-concern PR that cites the plan or issue. **Stop here.** The merge is yours.
7. **Deploy receipt (advisory)** — after you merge, `deploy-receipt` verifies the deployed SHA matches the merge SHA. Advisory only; `/ship` does not deploy.

## Hard stops (halt and ask, never improvise)

- Ambiguous or multi-concern defect description.
- Working tree not clean, or branch is protected / cut from a stale base.
- Any verification step fails with a non-obvious fix.
- The fix would touch more than 15 non-generated files (that is no longer one concern — split it, or use `/release-train`).
- Push would target a protected branch.

## Anti-patterns this command refuses

- **Auto-merge.** Never merges the PR it opens, even when CI is green.
- **Deploy.** Never runs a deploy; `deploy-receipt` only verifies after you merge.
- **Bypass.** No `--admin`, `--force`, `--no-verify`.
- **Bundled concerns.** Will not fold an unrelated fix into the same commit; logs it as a deferred follow-up instead.

## Composition

Routes through, in order: `reconcile` → `tdd-workflow` → `verification-loop` → `commit-commands:commit-push-pr` → `deploy-receipt`. Each step falls back to its inline behavior when the preferred skill is not installed.

## Example

```
/ship registration form accepts a negative deposit amount
```

Reconciles git state, writes a failing test asserting deposits must be positive, implements the guard, runs the verify ladder, commits one concern with a single-line message, opens the PR, and stops for your review.
