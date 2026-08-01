---
name: reconcile
description: Establish git ground truth (branch, status, stashes, worktrees, ahead/behind) before any mutation, halt on protected or destructive operations, then carry the known-good state through a single-concern commit, a push, an open PR, and — after the PR merges — a fast-forward of the default branch. Enforces Law 1 (Research Before Executing).
---

# /reconcile — Ground Truth, Then Commit, Push, and Open the PR

Read the repo's real state before acting on it: a branch that shifted, a push that did not land, or another session mid-merge will burn a whole session if you assume instead of check. Once the state is known, `/reconcile` carries the work through to an open PR and back to an up-to-date default branch.

## What it does

Snapshots the full git state in one pass, detects a concurrent writer, classifies the upstream relationship, then acts only on the known state — stopping at every operation that is hard to reverse. When work is ready, it stages by filename, commits one concern, pushes a feature branch, verifies the push landed, and opens a PR. After a human merges, it fast-forwards the default branch and checks it out. Backed by the `reconcile` skill.

## Establish ground truth

One command, cross-platform, no shell required:

```
npx ci-reconcile              # resolved-state block; exit 0 clear / 1 blocked / 2 not a repo
npx ci-reconcile --json       # machine-readable
npx ci-reconcile --explain    # the probe set and why each probe runs
```

The same pass by hand. `src/lib/git-state.mts` is the source of truth for this list, and `npm run verify:reconcile-parity` fails if this file drifts from it:

```
git rev-parse --show-toplevel                          # inside a work tree, and where
git rev-parse HEAD                                     # the sha every later claim is relative to
git symbolic-ref --quiet --short HEAD                  # branch; NON-ZERO EXIT = detached HEAD
git rev-parse --abbrev-ref --symbolic-full-name @{u}   # upstream, or non-zero = none configured
git rev-list --left-right --count @{u}...HEAD          # behind/ahead — only after the line above succeeded
git status --porcelain=v1                              # reported changes (inflated by autocrlf)
git diff --name-only --ignore-all-space                # real content drift — the number to trust
git stash list
git worktree list --porcelain
git rev-parse --git-path MERGE_HEAD                    # in-progress op: test the RESOLVED path
```

Four boundaries where the obvious command lies:

- **No upstream** — asking `git rev-list` for counts against `@{u}` exits 128; it does not return zeros. Resolve the upstream first.
- **Detached HEAD** — the `--show-current` form of `git branch` prints "" and exits 0, indistinguishable from success. `symbolic-ref --quiet` exits non-zero instead. Detached blocks.
- **Linked worktree** — `.git` is a *file* there, so a `.git/`-relative marker probe exits 2 exactly as it does on a clean tree: a real conflicted merge reads as clean. Use `rev-parse --git-path`.
- **autocrlf** — `git status` overstates drift. Stage by explicit filename, never `git add -A`.

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
npx ci-reconcile --verify-push <branch>    # exit 0 only when the remote tip equals local HEAD
git ls-remote origin refs/heads/<branch>   # by hand: remote tip must equal local HEAD
```

Three outcomes, never two: **landed** (tip matches), **not-landed** (probe succeeded, ref absent or different sha), **unverified** (`ls-remote` itself failed — you do not know; retry, and report neither success nor failure).

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
