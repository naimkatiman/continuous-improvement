---
name: ship
description: "Fix one defect through TDD and one PR. Isolate unrelated dirty checkouts in a clean worktree, then return clean checkouts to the detected default branch. Never auto-merges or deploys."
---

# /ship

The one-defect fast path. `/release-train` is for stacked multi-PR rollouts and `/proceed-with-the-recommendation` walks an arbitrary recommendation list. `/ship` fixes one defect, opens one PR, and hands it back for review.

This command routes through existing skills and owns safe checkout selection, return, and cleanup. It does not bypass branch protection, force-push, auto-merge, or deploy.

## Usage

```
/ship <one-line description of the defect>
```

If the description is ambiguous or names more than one concern, `/ship` halts and asks you to narrow it. Run one defect at a time.

## Behavior

In order, for the single defect:

1. **Capture ground truth and resolve the base**: run the read-only `reconcile` probes. Record the initiating checkout's absolute root, branch, HEAD, real tracked drift, staged drift, untracked files, in-progress Git operations, registered worktrees, and task ownership. Set `return_allowed=true` only when the initiating checkout is clean, owned by the current session, and not reserved by another task. A dirty-tree blocker may continue only through the isolated path in step 2 after the changes are confirmed unrelated. Every other blocker still halts. After classification, make the fetch below the first allowed repository mutation and refresh the remote before choosing a base:
   ```
   git fetch --prune origin
   git ls-remote --symref origin HEAD
   ```
   Use the live `refs/heads/<base>` returned for `HEAD`. Compare it with `refs/remotes/origin/HEAD`, but never let a stale local symbolic ref override the live result. If the live query succeeds without a symbolic ref, use `origin/main` only when it exists, otherwise `origin/master` only when it exists. Halt on a fetch/query failure or if no verified base exists. Confirm `origin/<base>` resolves after the fetch and pin later work to that commit.
2. **Select a safe checkout**:
   - Reuse the initiating checkout only when it is clean, on a non-protected branch dedicated to this exact defect, and its `HEAD` exactly equals `origin/<base>`. A clean branch that is ahead can already contain unrelated commits, so isolate it instead of bundling them.
   - If dirty changes are not clearly unrelated to the defect, halt and ask. Never guess which changes belong to whom.
   - If the checkout is dirty with unrelated work, protected, stale, ahead, or owned by another task, preserve it. Do not stash, switch, reset, clean, or copy its changes. Choose an absent absolute sibling or temporary path. Prove the proposed branch is absent locally, then query the remote successfully and require empty output before using the name:
     ```
     git show-ref --verify refs/heads/<feature-branch>
     git ls-remote --heads origin refs/heads/<feature-branch>
     ```
     The local command must report no ref. The remote command must complete without a network/authentication error and return no matching ref. If either branch exists, choose another unique name. Create a no-upstream worktree with an atomic owner lock:
     ```
     git worktree add --no-track --lock --reason "owner=<session-id>; purpose=/ship" -b <feature-branch> <worktree-path> origin/<base>
     ```
   - Use the current harness session ID as `<session-id>`. If it is unavailable, generate a unique recorded run token before creating the worktree and reuse that exact token through handoff and cleanup. Treat the lock reason as an advisory coordination ledger for compliant sessions, not as a filesystem write lock. Run `worktree-safety` in the new checkout and confirm its resolved root, `.git` pointer, registration, branch, pinned HEAD, and lock reason all match the current session. A missing or foreign owner blocks work. Recheck that envelope and observable branch, HEAD, and diff state before every source mutation. Halt when another writer cannot be excluded.
3. **Reproduce (RED)**: use `tdd-workflow` to write a failing test that reproduces the defect and watch it fail. Delete any pre-test implementation code.
4. **Fix (GREEN)**: write the minimal change that makes the failing test pass, then watch it pass. Keep one concern only.
5. **Verify**: use `verification-loop` to run the project's verify ladder, including build, types, and relevant tests. A green build proves only the mechanism. Confirm the original defect no longer reproduces.
6. **Commit**: make one single-concern commit, staged by explicit filename. Never use `git add -A` or `git add .`. Recheck the branch, HEAD, owner lock, and real diff immediately before staging and committing. Use a Windows-safe commit message with a single-line `-m`, repeated `-m` paragraphs, or `git commit -F <tempfile>`. Do not use multi-line here-docs or here-strings.
7. **Push and open the PR**: confirm the feature branch has no upstream to the protected base. Re-run the remote collision query immediately before pushing, require empty output, then push its name explicitly without force:
   ```
   git ls-remote --heads origin refs/heads/<feature-branch>
   git push -u origin <feature-branch>
   ```
   Verify the remote tip equals local HEAD. Use `commit-commands:commit-push-pr` or `gh pr create` to open one PR that cites the plan or issue. Do not merge it.
8. **Return before stopping**:
   - Confirm the fix checkout is clean and every commit is pushed. Record the PR URL, feature branch, initiating checkout, temporary worktree path, owner token, and the captured `return_allowed` decision.
   - Only when `return_allowed=true`, meaning the initiating checkout was clean, owned by the current session, and not reserved by another task, consider returning it. Immediately revalidate that it remains clean, current-session-owned, and unreserved. Set `return_allowed=false` on any drift. Otherwise return it to the detected default branch and update it without a merge commit:
     ```
     git switch <base>
     git pull --ff-only origin <base>
     ```
     Verify local `<base>` equals `origin/<base>`. If the branch is checked out by another worktree or the fast-forward fails, leave it unchanged and report the blocker.
   - When `return_allowed=false`, leave the initiating checkout's branch and path unchanged even if it appears clean later. Another task may own that state. Report the recorded reason instead of switching it.
   - A dirty initiating checkout is the exception: leave its branch and files exactly as found. Return the shell to that path, but do not carry its changes onto `<base>`. Report that default-branch return is intentionally blocked by preserved local work.
   - Stop with the PR open for human review. Keep an isolated fix worktree registered and owner-locked until the PR is merged so review fixes remain safe.
9. **Clean up after the PR merges**: run cleanup from the initiating checkout or another retained worktree, never from inside the worktree being removed. Refresh remote state and verify the actual PR merge commit is contained in the detected base, including for squash merges:
   ```
   git fetch --prune origin
   gh pr view <pr-number-or-url> --json state,mergeCommit
   git merge-base --is-ancestor <merge-sha> origin/<base>
   ```
   Halt unless the PR state is `MERGED` and the ancestry check succeeds. Cleanup may proceed only as the original owner recorded in the PR receipt, or after an explicit operator-confirmed handoff that proves the original session is inactive, replaces the owner token, and reruns `worktree-safety`. Never silently treat a foreign lock as stale. Confirm the isolated worktree is clean, has no unpushed commits, still carries the authorized owner lock, and has no observed competing writer. Recheck immediately before unlock, then release the lock and remove only the named worktree without pausing between commands:
   ```
   git worktree unlock <worktree-path>
   git worktree remove <worktree-path>
   ```
   If state shifts or removal fails, halt and re-establish ownership instead of forcing. Do not run repository-wide pruning. Return the initiating checkout to `<base>` only when its recorded `return_allowed` decision permits it, using `git switch <base>` and `git pull --ff-only origin <base>`, then verify local and remote HEADs match. Delete the local feature branch only if `git branch -d <feature-branch>` accepts it. Squash merges may make safe deletion refuse; retain and report the branch instead of forcing it. A dirty or foreign-owned initiating checkout remains untouched.
10. **Deploy receipt (advisory)**: after the human merge and deployment, `deploy-receipt` may verify that the deployed SHA matches the merge SHA. `/ship` does not deploy.

## Hard stops

- The defect description is ambiguous or includes multiple concerns.
- Dirty changes may overlap the defect or their ownership is unclear.
- The live remote default branch cannot be resolved and refreshed.
- A supposedly reusable branch is ahead of `origin/<base>` or belongs to another task.
- The selected feature branch or worktree path already exists.
- The remote feature-branch collision query fails or returns an existing ref.
- `worktree-safety` cannot prove the new checkout is registered, aligned, and owner-locked to this session.
- The branch, HEAD, or owner lock shifts after the ground-truth snapshot.
- Any verification step fails with a non-obvious fix.
- The fix would touch more than 15 non-generated files. Split it or use `/release-train`.
- A push would target a protected branch or the remote feature tip cannot be verified.
- Post-merge state or merge-commit ancestry cannot be verified.
- Cleanup would require force or discard dirty, untracked, or unpushed work.

## Anti-patterns this command refuses

- **Stashing unrelated work**: an isolated worktree removes the need.
- **Moving dirty changes across branches**: preservation takes priority over returning to the default branch.
- **Hardcoding `main`**: detect the live remote default and support `main` or `master`.
- **Giving the feature branch a protected upstream**: create with `--no-track` and push the feature name explicitly.
- **Force cleanup**: never use `git worktree remove --force`, `git branch -D`, `git reset --hard`, or `git clean -fd`.
- **Repository-wide cleanup**: remove only the named worktree created by this run.
- **Foreign checkout return**: never switch a checkout without a recorded current-session ownership decision.
- **Silent lock takeover**: require explicit operator-confirmed handoff when cleanup runs under a different session.
- **Auto-merge**: never merge the PR it opens, even when CI is green.
- **Deploy**: never run a deploy. `deploy-receipt` only verifies after a human merges and deploys.
- **Bypass**: never use `--admin`, `--force`, or `--no-verify`.
- **Bundled concerns**: log unrelated defects as deferred follow-ups instead of adding them to the commit.

## Composition

Routes through `reconcile`, `worktree-safety` when isolation is needed, `tdd-workflow`, `verification-loop`, `commit-commands:commit-push-pr`, the safe-return and post-merge cleanup rules above, then advisory `deploy-receipt`. Each skill falls back to equivalent inline checks when unavailable, except ownership: no proven single-writer ledger means no source mutation.

## Example

```
/ship registration form accepts a negative deposit amount
```

If the initiating checkout contains unrelated feature work, `/ship` leaves it untouched, creates an owner-locked no-upstream worktree from the live `origin/<base>`, reproduces and fixes the defect, verifies and pushes one commit, opens one PR, and returns the shell to the initiating path. After the PR merges, it freshly verifies the merge commit and removes only the clean temporary worktree. It switches the initiating checkout to the default branch only when that checkout is clean.
