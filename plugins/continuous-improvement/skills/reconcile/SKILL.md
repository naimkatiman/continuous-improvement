---
name: reconcile
tier: "2"
description: Enforces Law 1 (Research Before Executing) of the 7 Laws of AI Agent Discipline. Establishes git ground truth — branch, status, stashes, worktrees, ahead/behind — before any mutation, halts on protected or destructive operations, and verifies a push actually landed instead of assuming it did.
origin: continuous-improvement
user-invocable: true
---

# Reconcile — Ground-Truth Git State Before You Touch It

Law 1 says research before executing. The most expensive skipped research is the state of your own repo: a branch that shifted under you, a push that silently did not land, a stash from a session you forgot. This skill establishes git ground truth first, acts only on a known state, and stops at every operation that is hard to reverse.

## When to Activate

- Before any branch/merge/rebase/push when more than one session, loop, or agent may be writing to the tree.
- When the working tree looks different from what you expect (unexpected branch, surprise modifications, a half-finished merge).
- Before cleaning up: consolidating branches, dropping stashes, removing worktrees.
- After a push, to confirm it actually landed on the remote.

## Establish Ground Truth First

Read before you write. Capture the full state in one pass:

```
git branch --show-current
git status --porcelain=v1
git rev-list --left-right --count @{u}...HEAD     # behind / ahead of upstream
git stash list
git worktree list
ls .git/MERGE_HEAD .git/rebase-merge .git/rebase-apply 2>/dev/null   # in-progress operation?
```

On Windows with `autocrlf=true`, `git status` reports phantom line-ending-only modifications. Trust `git diff --stat` (and `git diff --ignore-all-space`) for real content drift, not `git status`. Never stage with `git add -A` / `git add .` on such a tree — stage by explicit filename.

## Detect a Concurrent Writer

When another session/loop may be active, do not assume the tree is yours:

- An in-progress `MERGE_HEAD` / `rebase-merge` you did not start means another actor is mid-operation. Do not "help" by editing conflicted files — wait, or hand off.
- Re-read the current branch immediately before any mutation; if it shifted since your snapshot, re-survey from the top.
- If `.git/index` keeps changing while you are idle, a writer is active. Pause and surface it rather than racing.
- If `gateguard` is installed, its Parallel-Actor Gate already captured this baseline on the session's first mutation (via `scripts/git-state-snapshot.sh`) and divergence-checks every later mutation — `reconcile` complements that gate, it does not replace it. Without gateguard, run the snapshot above yourself.

## Classify, Then Act

Map the upstream relationship before choosing an action:

- **even** (0 ahead / 0 behind) → safe to branch.
- **ahead only** → push (after the protected-op gate below) or open a PR.
- **behind only** → `git pull --ff-only`.
- **diverged** (both) → rebase or merge deliberately; never blind `--force`.

Branch from a base only after confirming `local <base>` equals `origin/<base>` — a squash-merge will otherwise silently bundle ahead-of-origin commits.

## Halt on Protected or Destructive Operations

STOP and get explicit authorization before:

- Pushing to a protected branch (e.g. `main`) — this repo's flow is feature branch + PR, never direct push.
- `git push --force` / `--force-with-lease`, `git reset --hard`, `git clean -fd`, `worktree remove` on a dirty worktree, or dropping a stash with uncommitted value.

If a rebase has diverged and force-push is gated, do not force-recover — supersede via a new branch + new PR.

## Verify the Push Actually Landed

A push that printed no error is still a claim. Confirm:

```
git rev-parse HEAD
git ls-remote origin refs/heads/<branch>     # remote tip must equal local HEAD
```

If the remote ref is absent or behind, the push did not land — investigate before reporting success.

## Pairs With

- **`recall`** (Law 1) — before a risky git op, recall whether the same operation failed on this repo before.
- **`gateguard`** (Law 1) — the runtime gate (`hooks/gateguard.mjs`); `reconcile` is the procedure you run once a destructive git action is in play.
- **`safety-guard`** — destructive-operation guardrails for production and autonomous runs.
- **`audit`** (Law 4) — when an audit ends in a fix, `reconcile` is the safe path from branch to landed PR.
