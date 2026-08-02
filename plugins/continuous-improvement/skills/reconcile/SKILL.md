---
name: reconcile
tier: "2"
description: Enforces Law 1 (Research Before Executing) of the 7 Laws of AI Agent Discipline. Establishes git ground truth — branch, status, stashes, worktrees, ahead/behind — before any mutation, halts on protected or destructive operations, then carries the known-good state through to a landed PR: stage by filename, commit one concern, push the feature branch, verify the push landed, open the PR, and after the PR merges fast-forward the default branch and check it out.
origin: continuous-improvement
user-invocable: true
---

# Reconcile — Ground Truth, Then Commit, Push, and Open the PR

Law 1 says research before executing. The most expensive skipped research is the state of your own repo: a branch that shifted under you, a push that silently did not land, a stash from a session you forgot. This skill establishes git ground truth first, acts only on a known state, stops at every operation that is hard to reverse, and then carries that known-good state all the way through a single-concern commit, a push, and an open PR — ending back on an up-to-date default branch once the PR merges.

## When to Activate

- Before any branch/merge/rebase/push when more than one session, loop, or agent may be writing to the tree.
- When the working tree looks different from what you expect (unexpected branch, surprise modifications, a half-finished merge).
- Before cleaning up: consolidating branches, dropping stashes, removing worktrees.
- When finished work needs to land: stage it, commit one concern, push a feature branch, open a PR, and return to an up-to-date default branch.
- After a push, to confirm it actually landed on the remote.

## Establish Ground Truth First

Read before you write. One command runs the whole pass and prints the resolved-state block:

```
npx ci-reconcile              # resolved-state block; exit 1 if anything blocks a mutation
npx ci-reconcile --json       # the same state, machine-readable
npx ci-reconcile --explain    # print the probe set and why each probe runs
```

Exit codes: `0` nothing blocks, `1` at least one blocker, `2` not a git repository. The probe set is defined once in `src/lib/git-state.mts`, and `npm run verify:reconcile-parity` fails if this document drifts from it — the list below is the list the runner executes.

Run the pass by hand when the runner is not installed:

```
git rev-parse --show-toplevel                          # inside a work tree, and where
git rev-parse HEAD                                     # the sha every later claim is relative to
git symbolic-ref --quiet --short HEAD                  # branch name; NON-ZERO EXIT = detached HEAD
git rev-parse --abbrev-ref --symbolic-full-name @{u}   # upstream, or non-zero = none configured
git rev-list --left-right --count @{u}...HEAD          # behind/ahead — only after the line above succeeded
git status --porcelain=v1                              # reported changes (inflated by autocrlf)
git diff --name-only --ignore-all-space                # real content drift — the number to trust
git stash list
git worktree list --porcelain
git rev-parse --git-path MERGE_HEAD                    # in-progress op: test the RESOLVED path for existence
```

Four boundaries make the obvious commands lie. Each was reproduced against real git; do not simplify them back.

- **No configured upstream.** Asking `git rev-list` for counts against `@{u}` exits **128** with `fatal: no upstream configured` — it does not return zeros. Probe for the upstream first and ask for counts only once it resolved. With no upstream, compare against `origin/<default>` explicitly; never read the failure as "even".
- **Detached HEAD.** The `--show-current` form of `git branch` prints an empty string and exits **0**, so a detached HEAD is indistinguishable from a successful read. `git symbolic-ref --quiet --short HEAD` exits non-zero instead, which is checkable. A detached HEAD blocks: there is no branch to commit onto, push, or name in a PR.
- **Linked worktrees.** Inside a worktree `.git` is a *file*, not a directory, so listing a `.git/`-relative path for `MERGE_HEAD` fails with "Not a directory" and exit **2** — byte-identical to the "no operation in progress" result on a clean tree. A real conflicted merge therefore reads as clean. Resolve the marker with `git rev-parse --git-path MERGE_HEAD` and test *that* path; it is correct in a main checkout and in a worktree alike. Same for `rebase-merge`, `rebase-apply`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `BISECT_LOG`.
- **Windows `autocrlf=true`.** `git status` reports phantom line-ending-only modifications. Trust `git diff --stat` / `git diff --name-only --ignore-all-space` for real content drift. Never stage with `git add -A` / `git add .` on such a tree — stage by explicit filename. The runner prints both numbers so the gap is visible instead of assumed.

## Compatibility

The ground-truth pass has to work wherever the agent runs, not only in Bash. `ci-reconcile` spawns `git` argv directly with no shell, so it needs no `bash`, no coreutils, and no `.git/`-relative path.

| Surface | PowerShell / cmd | Git Bash / WSL | POSIX shell | Linked worktree | Detached HEAD | No upstream |
|---|---|---|---|---|---|---|
| `ci-reconcile` (Node) | yes | yes | yes | correct | blocks | warns |
| `scripts/git-state-snapshot.sh` | needs Git Bash | yes | yes | root/branch only | reports `detached` | reports `none` |
| Hand-run probe list above | yes | yes | yes | correct | non-zero exit | non-zero exit |

Smoke-test on the OS you actually ship on. Both surfaces emit the same `{head, upstream, dirty, root, branch}` envelope — `ci-reconcile --snapshot` adds `contentDrift` and `inProgress` — and a test pins that parity so the two cannot drift apart silently.

## Detect a Concurrent Writer

When another session/loop may be active, do not assume the tree is yours:

- An in-progress `MERGE_HEAD` / `rebase-merge` you did not start means another actor is mid-operation. Do not "help" by editing conflicted files — wait, or hand off. The runner reports this as a blocker; the retired `.git/`-relative probe could not see it inside a worktree at all.
- **Re-read HEAD and the branch immediately before every mutation, not once per session.** Capture a baseline, then compare right before you commit, push, or rebase:
  ```
  npx ci-reconcile --snapshot > .git/reconcile-baseline.json   # or any scratch path
  # ... do work ...
  npx ci-reconcile --snapshot                                   # compare head + branch against the baseline
  ```
  If either field moved, another writer got there first — re-survey from the top instead of committing onto an unexpected base. A missing or unparseable field counts as *shifted*; "we could not tell" is never "nothing moved".
- More than one entry in `git worktree list --porcelain` means a sibling checkout exists that another session may be writing to. The runner flags this.
- If the git index keeps changing while you are idle, a writer is active. Pause and surface it rather than racing.
- If `gateguard` is installed, its Parallel-Actor Gate already captured this baseline on the session's first mutation by running `bash "${CLAUDE_PLUGIN_ROOT}/scripts/git-state-snapshot.sh"` (source: `scripts/git-state-snapshot.sh`) and divergence-checks every later mutation — `reconcile` complements that gate, it does not replace it. That shell snapshot needs Git Bash and derives its `dirty` count from `git status`, which overstates drift on an `autocrlf` tree; `ci-reconcile --snapshot` is the same envelope without either limitation. Without gateguard, run one of them yourself.

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
- Merging the PR you opened, or force-deleting a branch (`git branch -D`) — both stay human decisions, never auto-actions on green CI.
- `git push --force` / `--force-with-lease`, `git reset --hard`, `git clean -fd`, `worktree remove` on a dirty worktree, or dropping a stash with uncommitted value.

If a rebase has diverged and force-push is gated, do not force-recover — supersede via a new branch + new PR.

## Commit and Open the PR

Once ground truth is known and the halt gates are clear, carry the work to an open PR without leaving the known-good state. This tail is self-contained — it reimplements the commit → push → PR steps with plain git/`gh` and depends on no companion plugin.

1. **Cut or confirm a feature branch from a fresh base.** Never commit onto a protected branch. Sync the default branch first so the feature branch is not born stale:
   ```
   git switch main && git pull --ff-only origin main    # master on older repos
   git switch -c <type>/<slug>                           # only if not already on a feature branch
   ```
   Confirm `local main` equals `origin/main` before branching — a squash-merge otherwise bundles ahead-of-origin commits.

2. **Stage by explicit filename.** One concern per commit. On an `autocrlf` tree `git add -A` / `git add .` commits phantom line-ending-only changes — name each path and read real drift with `git diff --stat`.
   ```
   git add path/one path/two
   ```

3. **Commit with a Windows-safe message.** Lead with the observable outcome. Use a single-line `-m` (repeat `-m` for paragraphs) or `git commit -F <tempfile>` — never a multi-line here-doc/here-string, which CRLF and shell quoting corrupt on Windows.
   ```
   git commit -m "feat(scope): <observable outcome>"
   ```

4. **Push the feature branch** (never the protected branch), then verify it landed via the section below:
   ```
   git push -u origin <type>/<slug>
   ```

5. **Open one PR** citing the plan or issue, then stop:
   ```
   gh pr create --fill --base main
   ```
   **Stop here.** The merge is a human decision. `reconcile` never merges the PR, never uses `--admin` / `--force` / `--no-verify`, never auto-merges on green CI, and never deploys.

## Verify the Push Actually Landed

A push that printed no error is still a claim. Confirm:

```
npx ci-reconcile --verify-push <branch>      # exit 0 only when the remote tip equals local HEAD
```

or by hand:

```
git rev-parse HEAD
git ls-remote origin refs/heads/<branch>     # remote tip must equal local HEAD
```

There are **three** outcomes here, not two, and collapsing them is how a false report gets made:

- **landed** — the probe succeeded and the remote tip equals local HEAD.
- **not-landed** — the probe succeeded and the ref is absent, or points at a different sha. The push really did not land.
- **unverified** — `git ls-remote` itself failed (network, auth, remote down). This is *not* evidence the push failed; it is evidence you do not know. Retry the probe. Never report success, and never report failure, from a probe that did not run.

Report only what the probe proved.

## Sync the Default Branch After the PR Merges

"All the latest work on main" is only true once the PR actually merges — and on a protected branch that merge is a human action, not something `reconcile` performs. After the merge lands, return to an up-to-date default branch:

```
git switch main                        # or master on older repos
git pull --ff-only origin main         # fast-forward only; never a merge commit or --force
git rev-parse HEAD                     # confirm this equals the squash-merge SHA from the PR
git branch -d <type>/<slug>            # delete the merged feature branch (safe -d, never -D)
```

`--ff-only` is deliberate: if the pull would not fast-forward, main diverged under you — stop and re-survey from **Establish Ground Truth First** instead of forcing it. You end on the default branch with every merged change present and the feature branch cleaned up.

## Pairs With

- **`recall`** (Law 1) — before a risky git op, recall whether the same operation failed on this repo before.
- **`gateguard`** (Law 1) — the runtime gate (`hooks/gateguard.mjs`); `reconcile` is the procedure you run once a destructive git action is in play.
- **`safety-guard`** — destructive-operation guardrails for production and autonomous runs.
- **`audit`** (Law 4) — when an audit ends in a fix, `reconcile` is the safe path from branch to landed PR.
- **`commit-commands:commit-push-pr`** — the external-plugin equivalent of the commit → push → PR tail; `reconcile` reimplements it inline so the flow works with no companion installed. For a TDD-gated single-defect variant, use `/ship`.
