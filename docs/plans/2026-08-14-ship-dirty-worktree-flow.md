# Plan: `/ship` dirty-checkout isolation, global skill, and release

- Date: 2026-08-14
- Expanded: 2026-08-15
- Branch: `feat/ship-dirty-worktree-flow`
- Supersedes: the dirty-tree hard stop in `docs/plans/2026-06-17-ship-command.md`

## Goal

Allow `/ship` to fix one urgent defect without disturbing unrelated local work. Detect the repository's live default branch, always isolate the fix at an immutable base commit, open one explicitly targeted PR, return eligible clean checkouts to the default branch, and remove only the isolated worktree after a verified human merge. Move the full workflow into a first-class global `ship` skill, with the legacy command retained only as a compatibility router.

## Assumptions

- Dirty initiating changes are preserved. They are never stashed, moved, reset, or cleaned.
- A dirty initiating checkout cannot safely switch to the default branch. It stays exactly as found until its owner makes it clean.
- `/ship` still stops with an open PR. It never merges or deploys.
- `origin/HEAD` is queried live. `main` and `master` are verified fallbacks, not hardcoded assumptions.
- A missing remote symbolic ref requires exactly one `main` or `master` tip to match the remote HEAD commit. Ambiguity halts.
- An isolated worktree uses a no-upstream feature branch and an owner token that compliant sessions treat as an advisory coordination ledger.
- Every fix uses the isolated worktree. The initiating checkout is never reused for implementation.
- A clean checkout owned or reserved by another task is preserved. Cleanliness alone never authorizes a branch switch.
- The native `ship` skill is tier 1 and user-invocable because the workflow is a default delivery path, not an expert-only add-on. Automatic model invocation is disabled because it commits and pushes.
- Cleanup state is persisted atomically under the repository's common Git directory, not in collapsed chat or a public PR comment.
- `skills/ship.md` is the authored source. The build owns the plugin mirror at `plugins/continuous-improvement/skills/ship/SKILL.md`.
- `commands/ship.md` contains no second workflow copy. It forwards `$ARGUMENTS` to the native skill. The npm installer installs only the user-invocable native skill, which supplies `/ship` without a duplicate personal command.
- The feature lands through PR #294. A separate release PR cuts v3.23.0 only after #294 merges, then the tag-triggered trusted-publishing workflow owns npm publication.

## Implementation

1. Replace the dirty-tree hard stop with one mandatory isolated-worktree path for clean and dirty initiators.
2. Fetch before resolving the live remote default branch, validate the ref, and pin the worktree to the verified base SHA.
3. Reject ambiguous `main` or `master` fallbacks instead of guessing.
4. Constrain and validate feature branch names, then reject local and remote collisions before creating or pushing.
5. Create the isolated branch with `--no-track` and an owner lock, then push the quoted feature branch explicitly.
6. Create the PR with explicit base and head arguments, then verify its base, head, and tip SHA.
7. Persist and read back an atomic local cleanup receipt containing PR identity, refs, paths, owner, and return authorization.
8. Return only clean, current-session-owned, unreserved initiating checkouts to the detected default branch. Fetch and validate before switching, create a missing local default branch without switching, or pre-update an existing non-current branch only after proving ancestry. Never switch first and depend on a later pull.
9. Require the original owner or an explicit operator-confirmed handoff for later cleanup.
10. After every authorized review-fix push, reverify the same PR tip and atomically refresh the local receipt.
11. After human merge, read the receipt, fetch again, verify PR identity and merge ancestry, and remove only the named clean worktree without force.
12. Add command-contract tests for ordering, branch isolation, owner locking, PR identity, durable receipts, return conditions, cleanup boundaries, and Markdown fence validity.
13. Add a native tier-1 `ship` skill with the same dirty-worktree, safe-return, and cleanup boundaries.
14. Make `continuous-improvement install` stage the global skill outside personal-skill discovery, reject staging links or junctions and resolved discovery paths, preserve foreign paths, replace owned linked files without following them, and return honest installed, preserved, or failed outcomes. Do not install a same-named legacy command into the personal scope.
15. Update the derived 29-skill catalog and release-facing metadata, then regenerate plugin mirrors.

## Verification

- Observe the new command tests fail against the old contract.
- Run the focused generated command test suite.
- Run a name-filtered command test to prove setup independence.
- Run focused installer tests proving the global skill is installed byte-for-byte, is directly user-invocable as `/ship`, preserves foreign paths, does not overwrite hard-link targets, reports real failures with nonzero exit codes, and is removed on uninstall.
- Run `npm run verify:all` for source/mirror parity, content invariants, and type checking.
- Run `git diff --check` and independent code and TypeScript reviews.
- Pack the release tarball and require both native skill paths before tagging.
- After the release workflow succeeds, verify npm version, provenance, tarball contents, and a clean temporary-home install.

## Done when

The focused tests and `verify:all` pass, the generated command and native-skill mirrors match their sources, the feature PR is merged, v3.23.0 is published by the tag workflow, and a clean npm consumer install exposes `~/.claude/skills/ship/SKILL.md` without a duplicate `~/.claude/commands/ship.md`. The dirty initiating MiniTelegramApp checkout remains untouched.
