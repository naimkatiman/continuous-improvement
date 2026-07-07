---
name: reconcile
description: Establish git ground truth (branch, status, stashes, worktrees, ahead/behind) before any mutation, halt on protected or destructive operations, then carry the known-good state through a single-concern commit, a push, an open PR, and — after the PR merges — a fast-forward of the default branch. Enforces Law 1 (Research Before Executing).
---

# /reconcile — Ground Truth, Then Commit, Push, and Open the PR

Read the repo's real state before acting on it: a branch that shifted, a push that did not land, or another session mid-merge will burn a whole session if you assume instead of check. Once the state is known, `/reconcile` carries the work through to an open PR and back to an up-to-date default branch.

## What it does

Snapshots the full git state in one pass, detects a concurrent writer, classifies the upstream relationship, then acts only on the known state — stopping at every operation that is hard to reverse. When work is ready, it stages by filename, commits one concern, pushes a feature branch, verifies the push landed, and opens a PR. After a human merges, it fast-forwards the default branch and checks it out. Backed by the `reconcile` skill.

## Establish ground truth

```
git branch --show-current
git status --porcelain=v1                     # but trust git diff --stat for real drift (autocrlf)
git rev-list --left-right --count '@{u}...HEAD'  # behind / ahead (quote the ref — bare @{u} trips the Bash parser)
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

STOP for authorization before: pushing to a protected branch (this repo = feature branch + PR, never direct push to main), merging the PR you opened, `--force` / `--force-with-lease`, `reset --hard`, `clean -fd`, force-deleting a branch (`branch -D`), or removing a dirty worktree. Never stage with `git add -A` on a Windows autocrlf tree (it commits phantom line-ending-only changes) — stage by explicit filename.

## Commit and open the PR (self-contained)

Reimplements the commit → push → PR tail inline, so it works with no companion plugin installed:

```
git switch main && git pull --ff-only origin main   # branch from a fresh base
git switch -c <type>/<slug>                          # only if not already on a feature branch
git add path/one path/two                            # stage by name, one concern
git commit -m "feat(scope): <observable outcome>"    # single-line -m; never a multi-line here-doc on Windows
git push -u origin <type>/<slug>
gh pr create --fill --base main                      # open one PR, then STOP — the merge is a human decision
```

`/reconcile` never merges the PR, never uses `--admin` / `--force` / `--no-verify`, never auto-merges on green CI, and never deploys.

## Verify the push landed

```
git ls-remote origin refs/heads/<branch>   # remote tip must equal local HEAD, else it did not land
```

## Sync the default branch after the PR merges

"Latest work on main" is true only once the PR merges, and on a protected branch that merge is a human action. After it lands:

```
git switch main                        # or master
git pull --ff-only origin main         # fast-forward only; if it will not ff, main diverged — re-survey, do not force
git rev-parse HEAD                     # confirm this equals the squash-merge SHA
git branch -d <type>/<slug>            # delete the merged feature branch (safe -d, never -D)
```

## Pairs with

- **`reconcile`** skill — the discipline this command runs.
- **`gateguard`** / **`safety-guard`** — runtime + destructive-op guardrails.
- **`recall`** — recall whether the same git op failed here before.
- **`audit`** — the loop that often produces the fix `/reconcile` then ships.
- **`/ship`** — the TDD-gated single-defect variant; `commit-commands:commit-push-pr` is the external-plugin equivalent of the commit → PR tail.
