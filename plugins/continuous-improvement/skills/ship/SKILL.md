---
name: ship
tier: "1"
description: >-
  Enforces Law 1 (Research Before Executing), Law 3 (One Thing at a Time), and Law 4 (Verify Before Reporting) of the 7 Laws of AI Agent Discipline. Fix one defect through TDD and one PR, isolate unrelated dirty checkouts in an owner-locked clean worktree, and return only eligible clean checkouts to the detected default branch. Use for urgent hotfixes, bug fixes from a messy checkout, or requests to ship one defect without stashing current work.
origin: continuous-improvement
user-invocable: true
disable-model-invocation: true
argument-hint: "[one-line defect description]"
---

# Ship

Fix one defect, open one PR, and hand it back for review. Use `release-train` for stacked multi-PR rollouts and `proceed-with-the-recommendation` for an arbitrary recommendation list.

Preserve branch protection. Never force-push, auto-merge, or deploy from this skill.

## Request

Treat `$ARGUMENTS` as the defect request when supplied. Otherwise use the single concrete defect from the active conversation. Halt and ask for one narrower defect when the request is empty, ambiguous, or contains more than one concern.

## Workflow

Run these steps in order:

1. **Capture ground truth and resolve the base**: run the read-only `reconcile` probes. Record the initiating checkout's absolute root, branch, HEAD, real tracked drift, staged drift, untracked files, in-progress Git operations, registered worktrees, and task ownership. Ownership requires the current session ID in the authoritative worktree lease or an equivalent active harness task ledger that names this exact checkout; merely starting there is not proof. Set `return_allowed=true` only when the initiating checkout is clean, that ownership proof matches the current session, and no other task reserves it. Without such a lease or ledger, fail closed with `return_allowed=false`. A dirty-tree blocker may continue only through the isolated path in step 2 after the changes are confirmed unrelated. Every other blocker still halts. After classification, make the fetch below the first allowed repository mutation and refresh the remote before choosing a base:
   ```
   git fetch --prune origin
   git ls-remote --symref origin HEAD
   ```
   Use the live `refs/heads/<base>` returned for `HEAD`. Validate it with `git check-ref-format --branch "<base>"`. Compare it with `refs/remotes/origin/HEAD`, but never let a stale local symbolic ref override the live result. The query must also return the remote HEAD commit. If it succeeds without a symbolic ref, compare that remote HEAD commit with the resolved tips of `origin/main` and `origin/master`, and require exactly one matching candidate. Zero or multiple matches are ambiguous: halt instead of guessing. Halt on a fetch/query failure or if no verified base exists. Confirm `origin/<base>` resolves after the fetch, record its immutable commit as `<base-sha>`, require a full hexadecimal commit ID, and require that it equals the verified remote HEAD commit. Pin worktree creation to `<base-sha>`, not the mutable remote-tracking name.
2. **Select a safe checkout**:
   - Always perform the defect work in a separate isolated worktree created from the pinned `<base-sha>`. Do not reuse the initiating checkout, even when it is clean. One isolation path keeps ownership, retention, return, and cleanup behavior consistent.
   - If dirty changes are not clearly unrelated to the defect, halt and ask. Never guess which changes belong to whom.
   - Preserve the initiating checkout until the return decision in step 8. When it is dirty with unrelated work, protected, stale, ahead, or owned by another task, do not stash, switch, reset, clean, or copy its changes. Choose an absent absolute sibling or temporary path. Generate the feature branch from ASCII lowercase letters, digits, slash, underscore, and hyphen only (`[a-z0-9/_-]+`), require an alphanumeric first character, and validate the final name before any lookup. Prove the proposed branch is absent locally, then query the remote successfully and require empty output before using the name:
     ```
     git check-ref-format --branch "<feature-branch>"
     git show-ref --verify "refs/heads/<feature-branch>"
     git ls-remote --heads origin "refs/heads/<feature-branch>"
     ```
     The local command must report no ref. The remote command must complete without a network/authentication error and return no matching ref. If either branch exists, choose another unique name. Create a no-upstream worktree with an atomic owner lock:
     ```
     git worktree add --no-track --lock --reason "owner=<session-id>; purpose=/ship" -b "<feature-branch>" "<worktree-path>" "<base-sha>"
     ```
   - Use the current harness session ID as `<session-id>`. If it is unavailable, generate a unique recorded run token before creating the worktree and reuse that exact token through handoff and cleanup. Treat the lock reason as an advisory coordination ledger for compliant sessions, not as a filesystem write lock. Run `worktree-safety` in the new checkout and confirm its resolved root, `.git` pointer, registration, branch, pinned HEAD, and lock reason all match the current session. A missing or foreign owner blocks work. Recheck that envelope and observable branch, HEAD, and diff state before every source mutation. Halt when another writer cannot be excluded.
3. **Reproduce (RED)**: use `tdd-workflow` to write a failing test that reproduces the defect and watch it fail. Delete any pre-test implementation code.
4. **Fix (GREEN)**: write the minimal change that makes the failing test pass, then watch it pass. Keep one concern only.
5. **Verify**: use `verification-loop` to run the project's verify ladder, including build, types, and relevant tests. A green build proves only the mechanism. Confirm the original defect no longer reproduces.
6. **Commit**: make one single-concern commit, staged by explicit filename. Never use `git add -A` or `git add .`. Recheck the branch, HEAD, owner lock, and real diff immediately before staging and committing. Use a Windows-safe commit message with a single-line `-m`, repeated `-m` paragraphs, or `git commit -F <tempfile>`. Do not use multi-line here-docs or here-strings.
7. **Push and open the PR**: confirm the feature branch has no upstream to the protected base. Re-run the remote collision query immediately before pushing, require empty output, then push its name explicitly without force:
   ```
   git ls-remote --heads origin "refs/heads/<feature-branch>"
   git push -u origin "<feature-branch>"
   ```
   Verify the remote tip equals local HEAD. Use `commit-commands:commit-push-pr` only when it accepts the explicit base and head below; otherwise open the PR directly and cite the plan or issue:
   ```
   gh pr create --base "<base>" --head "<feature-branch>"
   gh pr view "<pr-number-or-url>" --json baseRefName,headRefName,headRefOid
   ```
   Require `baseRefName=<base>`, `headRefName=<feature-branch>`, and `headRefOid` equal to local HEAD. Record that exact PR URL or number for cleanup. A mismatch halts. Do not merge it.
8. **Return before stopping**:
   - Confirm the fix checkout is clean and every commit is pushed. If the captured `return_allowed` value is true, immediately revalidate that the initiating checkout remains clean, current-session-owned, and unreserved. Freeze the final decision and its reason. Any drift changes the final value to false.
   - Persist a local cleanup receipt at `<git-common-dir>/continuous-improvement/ship-receipts/<pr-number>.json` with the PR URL and number, base, base SHA, feature branch, feature tip SHA, absolute worktree path, owner token, initiating checkout path, and final `return_allowed` decision and reason. Write a sibling temporary file first, atomically rename it into place, then read and parse it back before continuing. Keep the local path and owner token out of the public PR body and comments. If later drift appears before a return mutation, atomically downgrade the receipt to `return_allowed=false`, read it back, and leave the initiating checkout unchanged.
   - Only when the final `return_allowed=true`, meaning the initiating checkout was clean, owned by the current session, and not reserved by another task, consider returning it. Before switching, prove no other worktree has `<base>` checked out. If local `<base>` exists, require it to be an ancestor of `origin/<base>`, then switch and update it without a merge commit:
     ```
     git merge-base --is-ancestor "refs/heads/<base>" "origin/<base>"
     git switch "<base>"
     git pull --ff-only origin "<base>"
     ```
     If local `<base>` does not exist, create it from the verified remote tracking branch instead:
     ```
     git switch --track -c "<base>" "origin/<base>"
     ```
     Verify local `<base>` equals `origin/<base>`. If the branch is checked out by another worktree, the ancestry preflight fails, branch creation fails, or the fast-forward fails, leave the initiating checkout unchanged and report the blocker.
   - When `return_allowed=false`, leave the initiating checkout's branch and path unchanged even if it appears clean later. Another task may own that state. Report the recorded reason instead of switching it.
   - A dirty initiating checkout is the exception: leave its branch and files exactly as found. Return the shell to that path, but do not carry its changes onto `<base>`. Report that default-branch return is intentionally blocked by preserved local work.
   - Stop with the PR open for human review. Keep an isolated fix worktree registered and owner-locked until the PR is merged so review fixes remain safe.
9. **Clean up after the PR merges**: run cleanup from the initiating checkout or another retained worktree, never from inside the worktree being removed. Refresh remote state and verify the actual PR merge commit is contained in the detected base, including for squash merges:
   ```
   git fetch --prune origin
   gh pr view "<pr-number-or-url>" --json state,mergeCommit,baseRefName,headRefName,headRefOid
   git merge-base --is-ancestor "<merge-sha>" "origin/<base>"
   ```
   Read `<git-common-dir>/continuous-improvement/ship-receipts/<pr-number>.json` and compare every field with the registered worktree, current refs, PR response, and initiating checkout before cleanup. Halt on a missing, malformed, or mismatched receipt. Halt unless the PR state is `MERGED`, its base and head still match the recorded receipt, its pre-merge `headRefOid` identifies the pushed feature tip, and the ancestry check succeeds. Cleanup may proceed only as the original owner recorded in the local receipt, or after an explicit operator-confirmed handoff that proves the original session is inactive, replaces the owner token in that receipt atomically, and reruns `worktree-safety`. Never silently treat a foreign lock as stale. Confirm the isolated worktree is clean, its HEAD equals both the receipt's feature tip SHA and the PR `headRefOid`, it still carries the authorized owner lock, and it has no observed competing writer. A missing remote feature ref after fetch is expected when GitHub deleted the merged branch; if that ref still exists, require its tip to equal the receipt's feature tip. Recheck immediately before unlock, then release the lock and remove only the named worktree without pausing between commands:
   ```
   git worktree unlock "<worktree-path>"
   git worktree remove "<worktree-path>"
   ```
   If state shifts or removal fails, halt and re-establish ownership instead of forcing. Do not run repository-wide pruning. Return or refresh the initiating checkout on `<base>` only when its recorded `return_allowed` decision permits it, using the same checked-out-elsewhere, ancestry, create-if-missing, and fast-forward procedure from step 8, then verify local and remote HEADs match. Delete the local feature branch only if `git branch -d "<feature-branch>"` accepts it. Squash merges may make safe deletion refuse; retain and report the branch instead of forcing it. Remove the local receipt only after cleanup and every permitted return check succeeds. A dirty or foreign-owned initiating checkout remains untouched.
10. **Deploy receipt (advisory)**: after the human merge and deployment, `deploy-receipt` may verify that the deployed SHA matches the merge SHA. This skill does not deploy.

## Hard stops

- The defect description is ambiguous or includes multiple concerns.
- Dirty changes may overlap the defect or their ownership is unclear.
- The live remote default branch cannot be resolved and refreshed.
- The remote default is ambiguous because the live HEAD query has zero or multiple matching `main` or `master` candidates.
- The selected feature branch or worktree path already exists.
- The remote feature-branch collision query fails or returns an existing ref.
- `worktree-safety` cannot prove the new checkout is registered, aligned, and owner-locked to this session.
- The branch, HEAD, or owner lock shifts after the ground-truth snapshot.
- Any verification step fails with a non-obvious fix.
- The fix would touch more than 15 non-generated files. Split it or use `release-train`.
- A push would target a protected branch or the remote feature tip cannot be verified.
- Post-merge state or merge-commit ancestry cannot be verified.
- Cleanup would require force or discard dirty, untracked, or unpushed work.

## Refuse these anti-patterns

- **Stashing unrelated work**: an isolated worktree removes the need.
- **Moving dirty changes across branches**: preservation takes priority over returning to the default branch.
- **Hardcoding `main`**: detect the live remote default and support `main` or `master`.
- **Giving the feature branch a protected upstream**: create with `--no-track` and push the feature name explicitly.
- **Force cleanup**: never use `git worktree remove --force`, `git branch -D`, `git reset --hard`, or `git clean -fd`.
- **Repository-wide cleanup**: remove only the named worktree created by this run.
- **Foreign checkout return**: never switch a checkout without a recorded current-session ownership decision.
- **Silent lock takeover**: require explicit operator-confirmed handoff when cleanup runs under a different session.
- **Auto-merge**: never merge the PR this skill opens, even when CI is green.
- **Deploy**: never run a deploy. `deploy-receipt` only verifies after a human merges and deploys.
- **Bypass**: never use `--admin`, `--force`, or `--no-verify`.
- **Bundled concerns**: log unrelated defects as deferred follow-ups instead of adding them to the commit.

## Composition

Route through `reconcile`, mandatory `worktree-safety`, `tdd-workflow`, `verification-loop`, `commit-commands:commit-push-pr`, the safe-return and post-merge cleanup rules above, then advisory `deploy-receipt`. Fall back to equivalent inline checks when a companion skill is unavailable, except ownership: no proven single-writer ledger means no source mutation.

## Example

```
/ship registration form accepts a negative deposit amount
```

If the initiating checkout contains unrelated feature work, leave it untouched. Create an owner-locked no-upstream worktree from the verified `<base-sha>`, reproduce and fix the defect, verify and push one commit, open one explicitly targeted PR, and return the shell to the initiating path. After the PR merges, read the local receipt, freshly verify the merge commit, and remove only the clean temporary worktree. Switch the initiating checkout to the default branch only when that checkout is clean and current-session-owned.
