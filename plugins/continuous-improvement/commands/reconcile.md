---
name: reconcile
description: Establish git ground truth (branch, status, stashes, worktrees, ahead/behind) before any mutation, halt on protected or destructive operations, and verify a push actually landed. Enforces Law 1 (Research Before Executing).
---

# /reconcile — Ground-Truth Git State Before You Touch It

Read the repo's real state before acting on it: a branch that shifted, a push that did not land, or another session mid-merge will burn a whole session if you assume instead of check.

## What it does

Snapshots the full git state in one pass, detects a concurrent writer, classifies the upstream relationship, then acts only on the known state — stopping at every operation that is hard to reverse. Backed by the `reconcile` skill.

## Establish ground truth

```
git branch --show-current
git status --porcelain=v1                     # but trust git diff --stat for real drift (autocrlf)
git rev-list --left-right --count @{u}...HEAD  # behind / ahead
git stash list
git worktree list
ls .git/MERGE_HEAD .git/rebase-merge .git/rebase-apply 2>/dev/null  # in-progress op = another actor; do not race
```

## Then act, with gates

```
even      -> safe to branch (confirm local base == origin/base first)
ahead     -> push or PR, AFTER the protected-op gate
behind    -> git pull --ff-only
diverged  -> rebase/merge deliberately; never blind --force
```

STOP for authorization before: pushing to a protected branch (this repo = feature branch + PR, never direct push to main), `--force` / `--force-with-lease`, `reset --hard`, `clean -fd`, or removing a dirty worktree. Never stage with `git add -A` on a Windows autocrlf tree (it commits phantom line-ending-only changes) — stage by explicit filename.

## Verify the push landed

```
git ls-remote origin refs/heads/<branch>   # remote tip must equal local HEAD, else it did not land
```

## Pairs with

- **`reconcile`** skill — the discipline this command runs.
- **`gateguard`** / **`safety-guard`** — runtime + destructive-op guardrails.
- **`recall`** — recall whether the same git op failed here before.
- **`audit`** — the loop that often produces the fix `reconcile` then ships.
