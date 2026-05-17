---
name: worktree-safety
tier: "2"
description: "Enforces Law 4 (Verify Before Reporting) of the 7 Laws of AI Agent Discipline. Pre-dispatch invariant: validate worktree root before any source-writing tool call. Catches missing .git, fallback path-only creation, stale leases, foreign-session ownership, and non-worktree git operations before they corrupt history."
origin: continuous-improvement
user-invocable: false
---

# Worktree Safety Skill

A pre-dispatch invariant. Before any tool call that writes source files or runs git, validate that the current working directory is a registered worktree with a healthy `.git`, owned by this session, on the expected branch.

## When to Use

- Before every Edit / Write / Bash that touches source code in a multi-worktree session.
- Before any `git` command in an auto-loop.
- After any pause/resume — CWD may have drifted, the worktree may have been pruned, the lease may have expired.
- When the verification ladder reports a class-`worktree` failure (see `recovery-classification`).

## Why This Skill Exists

GSD-2's [CONTEXT.md](https://github.com/gsd-build/gsd-2/blob/main/CONTEXT.md) names "Worktree Safety" as one of four runtime invariant modules. Common failure modes it catches:

- **Units dispatch into ghost / invalid worktree roots** — `.git` missing, fallback path-only creation, the worktree was pruned but the loop kept its handle.
- **Health checks unit-specific instead of lifecycle-wide** — earlier units (sketch, plan) write into invalid roots before any check runs.
- **Brittle exit / merge signals** — relying on artifact presence instead of authoritative branch and commit state.
- **Parallel actors mutating the working tree of a worktree they don't own** — a known hazard on this host (see `feedback_parallel_actor.md`).

The continuous-improvement repo runs on Windows + Git Bash with `autocrlf=true` and a parallel-actor expectation, both of which make weak worktree handling expensive.

## The Five-Check Envelope

Before any source-writing call, verify all five. Fail closed on any miss.

1. **Root validity** — `git rev-parse --show-toplevel` resolves; the resolved path matches CWD after symlink-safe canonicalization.
2. **`.git` presence** — `.git` exists (file pointer for worktrees, directory for primary checkout). A missing or unreadable `.git` is an immediate stop.
3. **Worktree registration** — `git worktree list` includes the resolved root with no `prunable` flag. Prunable worktrees can be deleted by another process at any moment.
4. **Branch alignment** — current branch matches the lease ledger; `HEAD` is not detached unless the unit explicitly asked for detached state.
5. **Lease ownership** — the session ID in `.git/worktrees/<name>/lease` (or your equivalent ledger) matches this session. Stale or foreign leases block the call.

Output a single fenced block before any source-writing dispatch:

```
worktree-safety (resolved):
  root:          d:/Ai/ci-wt-skill-trio  (matches CWD, canonicalized)
  .git:          file pointer → /shared/.git/worktrees/skill-trio  (present)
  registration:  listed in `git worktree list` (not prunable)
  branch:        feat/verification-ladder-skill-trio  (matches lease)
  lease:         owned by session 4f2a (this session)  → CLEAR
```

If any line is non-`CLEAR`, dispatch is blocked and the failure routes to `recovery-classification` as class `worktree`.

## Anti-Patterns

- **Per-tool checks, not lifecycle checks.** Validating only at execute-task lets sketch / plan / research units write into invalid roots first.
- **Trusting CWD.** A `process.chdir` (or operator `cd`) in another loop iteration can leave CWD pointing at a pruned worktree. Re-resolve every time; do not cache.
- **Fallback-to-primary on worktree miss.** Silently writing to the primary checkout when the worktree is broken is the worst recovery — it corrupts the wrong branch with no audit trail.
- **Skipping lease ownership.** Two sessions in the same worktree race on every commit. The lease is the authoritative single-writer signal; do not skip it because "it's only one session" — that assumption breaks the moment a parallel actor appears.
- **Allowing detached HEAD silently.** A detached HEAD is sometimes legitimate (bisect, snapshot read), but every check must name whether detached is expected for this unit.

## Pairs With

- [verification-loop](verification-loop.md) — runs as a pre-Phase-0 invariant; the resolved-safety block fires before the resolved-ladder block.
- [state-reconciliation](state-reconciliation.md) — both fire before dispatch; safety runs first because reconciliation depends on a valid worktree root.
- [recovery-classification](recovery-classification.md) — any non-`CLEAR` line routes here as class `worktree`.
- [gateguard](gateguard.md) — gateguard fires at the tool boundary; worktree-safety is the lifecycle counterpart that runs before tool dispatch is even considered.
