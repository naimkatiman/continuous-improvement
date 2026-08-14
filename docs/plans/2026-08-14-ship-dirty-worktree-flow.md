# Plan: `/ship` dirty-checkout isolation and safe return

- Date: 2026-08-14
- Branch: `feat/ship-dirty-worktree-flow`
- Supersedes: the dirty-tree hard stop in `docs/plans/2026-06-17-ship-command.md`

## Goal

Allow `/ship` to fix one urgent defect without disturbing unrelated local work. Detect the repository's live default branch, isolate the fix when needed, open one PR, return clean checkouts to the default branch, and remove only the isolated worktree after a verified human merge.

## Assumptions

- Dirty initiating changes are preserved. They are never stashed, moved, reset, or cleaned.
- A dirty initiating checkout cannot safely switch to the default branch. It stays exactly as found until its owner makes it clean.
- `/ship` still stops with an open PR. It never merges or deploys.
- `origin/HEAD` is queried live. `main` and `master` are verified fallbacks, not hardcoded assumptions.
- An isolated worktree uses a no-upstream feature branch and an owner token that compliant sessions treat as an advisory coordination ledger.
- A clean checkout owned or reserved by another task is preserved. Cleanliness alone never authorizes a branch switch.

## Implementation

1. Replace the dirty-tree hard stop with a classified isolated-worktree path.
2. Fetch before resolving the live remote default branch.
3. Refuse to reuse clean branches that are ahead of the base.
4. Reject local and remote feature-branch name collisions before creating or pushing.
5. Create the isolated branch with `--no-track`, then push the feature branch explicitly.
6. Return only clean, current-session-owned, unreserved initiating checkouts to the detected default branch with a fast-forward-only pull.
7. Require the original owner or an explicit operator-confirmed handoff for later cleanup.
8. After human merge, fetch again, verify the PR merge commit is contained in the base, and remove only the named clean worktree without force.
9. Add command-contract tests for ordering, branch isolation, owner locking, return conditions, and cleanup boundaries.

## Verification

- Observe the new command tests fail against the old contract.
- Run the focused generated command test suite.
- Run a name-filtered command test to prove setup independence.
- Run `npm run verify:all` for source/mirror parity, content invariants, and type checking.
- Run `git diff --check` and independent code and TypeScript reviews.

## Done when

The focused tests and `verify:all` pass, the generated plugin mirror matches the source command, the change is committed on the feature branch, and a review PR is open. The local active command may be patched for immediate use, but that cache remains ephemeral until a future plugin release refreshes it.
