# Plan: `/ship` dirty-checkout isolation, global skill, and release

- Date: 2026-08-14
- Expanded: 2026-08-15
- Branch: `feat/ship-dirty-worktree-flow`
- Supersedes: the dirty-tree hard stop in `docs/plans/2026-06-17-ship-command.md`

## Goal

Allow `/ship` to fix one urgent defect without disturbing unrelated local work. Detect the repository's live default branch, isolate the fix when needed, open one PR, return clean checkouts to the default branch, and remove only the isolated worktree after a verified human merge. Move the full workflow into a first-class global `ship` skill, with the legacy command retained only as a compatibility router.

## Assumptions

- Dirty initiating changes are preserved. They are never stashed, moved, reset, or cleaned.
- A dirty initiating checkout cannot safely switch to the default branch. It stays exactly as found until its owner makes it clean.
- `/ship` still stops with an open PR. It never merges or deploys.
- `origin/HEAD` is queried live. `main` and `master` are verified fallbacks, not hardcoded assumptions.
- An isolated worktree uses a no-upstream feature branch and an owner token that compliant sessions treat as an advisory coordination ledger.
- A clean checkout owned or reserved by another task is preserved. Cleanliness alone never authorizes a branch switch.
- The native `ship` skill is tier 1 and user-invocable because the workflow is a default delivery path, not an expert-only add-on.
- `skills/ship.md` is the authored source. The build owns the plugin mirror at `plugins/continuous-improvement/skills/ship/SKILL.md`.
- `commands/ship.md` contains no second workflow copy. It forwards `$ARGUMENTS` to the native skill. The npm installer installs only the user-invocable native skill, which supplies `/ship` without a duplicate personal command.
- The feature lands through PR #294. A separate release PR cuts v3.23.0 only after #294 merges, then the tag-triggered trusted-publishing workflow owns npm publication.

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
10. Add a native tier-1 `ship` skill with the same dirty-worktree, safe-return, and cleanup boundaries.
11. Make `continuous-improvement install` copy the skill to `~/.claude/skills/ship/SKILL.md` and remove it on uninstall. Do not install a same-named legacy command into the personal scope.
12. Update the derived 29-skill catalog and release-facing metadata, then regenerate plugin mirrors.

## Verification

- Observe the new command tests fail against the old contract.
- Run the focused generated command test suite.
- Run a name-filtered command test to prove setup independence.
- Run focused installer tests proving the global skill is installed byte-for-byte, is directly user-invocable as `/ship`, and is removed on uninstall.
- Run `npm run verify:all` for source/mirror parity, content invariants, and type checking.
- Run `git diff --check` and independent code and TypeScript reviews.
- Pack the release tarball and require both native skill paths before tagging.
- After the release workflow succeeds, verify npm version, provenance, tarball contents, and a clean temporary-home install.

## Done when

The focused tests and `verify:all` pass, the generated command and native-skill mirrors match their sources, the feature PR is merged, v3.23.0 is published by the tag workflow, and a clean npm consumer install exposes `~/.claude/skills/ship/SKILL.md` without a duplicate `~/.claude/commands/ship.md`. The dirty initiating MiniTelegramApp checkout remains untouched.
