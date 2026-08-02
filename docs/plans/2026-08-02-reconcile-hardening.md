# Reconcile hardening — boundary-safe, single-sourced, cross-platform ground truth

Date: 2026-08-02
Status: in progress
Branch: `feat/reconcile-hardening` (worktree off `origin/main` @ `a49681a`, v3.21.0)

## Goal

`reconcile` (Law 1) is the skill agents run to establish git ground truth before a mutation. Today it is prose only: four of the commands it prescribes are wrong or silently non-functional at real boundaries, and the same command list is hand-maintained in three places that can drift apart. Make the reconcile contract executable, boundary-safe, and single-sourced.

Observable outcome: `npx ci-reconcile` returns a correct resolved-state block — including blockers — on a no-upstream branch, on a detached HEAD, and inside a linked worktree, on Windows without Git Bash; and a `verify:all` invariant fails if the skill/command docs drift from the shipped probe set.

## Evidence — four confirmed defects

Reproduced 2026-08-02 in a scratch repo (`git init`, one commit):

1. **No configured upstream hard-fails the classify step.**
   `git rev-list --left-right --count '@{u}...HEAD'` -> `fatal: no upstream configured for branch 'master'`, **exit 128**.
   `git rev-parse --abbrev-ref --symbolic-full-name '@{u}'` -> same, exit 128.
   The skill's "Classify, Then Act" section has no guard for this. It is the live state of this repo's own primary checkout (`loop/weekly-2026-07-31` has no upstream).

2. **Detached HEAD is silent.**
   `git branch --show-current` -> empty string, **exit 0**. Nothing in the procedure distinguishes "on no branch" from a successful read, so downstream steps (push, PR, branch-name substitution) operate on an empty branch name.

3. **In-progress-operation detection is dead inside a linked worktree.**
   In a linked worktree `.git` is a *file*, not a directory. `ls .git/MERGE_HEAD .git/rebase-merge .git/rebase-apply` -> `Not a directory`, **exit 2** — byte-identical to the "no operation in progress" result in a normal repo (also exit 2). A real conflicted merge in a worktree is therefore reported as clean. Worktrees are this repo's documented default branch isolation, so the concurrent-writer gate is off precisely where it matters most.
   Portable form: `git rev-parse --git-path MERGE_HEAD` -> resolves to `.../.git/worktrees/<wt>/MERGE_HEAD`; a file-exists test on that path detects the real merge.

4. **The runtime primitive contradicts the documented rule.**
   `scripts/git-state-snapshot.sh` derives `dirty` from `git status --porcelain | wc -l`. `skills/reconcile.md` explicitly says *not* to trust `git status` on an `autocrlf=true` tree because it reports phantom line-ending-only modifications. gateguard's Parallel-Actor Gate baselines on that number. The script is also Bash + coreutils (`wc`, `tr`) only — the same class of failure as the CI #284 lane that replaced Bash-dependent hooks broken on Windows/WSL.

## Signals applied (July 8-10 2026 PR review themes)

| Signal | Applied here |
|---|---|
| Single source of truth — centralize constants, generate copy from them, parity-test every duplicated rule | `GROUND_TRUTH_PROBES` in `src/lib/git-state.mts` becomes the one definition of the ground-truth command set; `check-reconcile-parity` fails `verify:all` when `skills/reconcile.md` or `commands/reconcile.md` drift from it. |
| Compatibility engineering — keep a compatibility matrix, smoke-test on the actual target OS/toolchain | `ci-reconcile` runs on Node with `spawnSync(..., { shell: false })` — no Bash, no coreutils. A compatibility matrix ships in the skill. Snapshot-envelope parity with the Bash script is asserted by test, not by eye. |
| Planner-aware change discipline — inspect the plan before *and* after, pair changes with regression tests | Re-reading HEAD/branch immediately before each mutation is promoted from prose into an executable divergence check; every defect above gets a regression test. |
| Boundary-safe async/runtime — guard clauses at edges instead of assertions, test allow *and* deny paths | Every classifier fails **closed**: unparseable counts -> `unknown` (a blocker), not `even`; a failed `git ls-remote` -> `unverified`, never `landed`; detached HEAD -> blocker. Each has a deny-path test alongside its allow-path test. |

## Scope

New:
- `src/lib/git-state.mts` — pure, IO-free: probe registry, upstream/HEAD/in-progress classifiers, protected-branch gate, push-landed verdict, resolved-state renderer.
- `src/bin/reconcile.mts` -> bin `ci-reconcile` — cross-platform runner; `--json`, `--snapshot` (Bash-envelope-compatible), exit 0 clean / 1 blockers / 2 not a git repo.
- `src/bin/check-reconcile-parity.mts` -> `verify:reconcile-parity`, wired into `verify:all`.
- `src/test/git-state.test.mts` — allow + deny path coverage for all four defects.

Edited:
- `skills/reconcile.md`, `commands/reconcile.md` — guards, portable commands, compatibility matrix, runner reference.
- `package.json` — `bin.ci-reconcile`, `verify:reconcile-parity`, `verify:all`.
- `README.md` and any doc the count/substring invariants require.

Out of scope (guardrailed — needs owner approval, not taken here):
- `src/hooks/gateguard.mts` semantics and `scripts/git-state-snapshot.sh` itself stay byte-unchanged. The Node runner is additive; nothing is rewired to it in this PR.
- No skill/command *count* change: `reconcile` already exists in both sets. No tier changes.

## Verification

1. `npm run build`
2. `node --test test/git-state.test.mjs` (targeted; RED before the lib lands)
3. `npm run verify:all` (invariant set + typecheck)
4. `npm test` (full suite)
5. Live boundary smoke on the actual host (Windows), not a mock: run `node bin/reconcile.mjs` in (a) a no-upstream branch, (b) a detached HEAD, (c) a linked worktree with a real conflicted merge — each must report the correct blocker.

## Rollback

Additive lib + bin + invariant. Revert the single squash commit; no consumer surface removed, no hook semantics touched, no generated-artifact contract altered beyond the new files' own `.mjs` output.
