---
name: state-reconciliation
tier: "2"
description: "Enforces Law 4 (Verify Before Reporting) of the 7 Laws of AI Agent Discipline. Pre-dispatch invariant: reconcile DB-vs-disk-vs-memory state before any unit runs, so a stale flag, missing artifact, or out-of-sync row never re-dispatches a unit that already completed or never started."
origin: continuous-improvement
---

# State Reconciliation Skill

A pre-dispatch invariant. Before the verification ladder runs (or any auto-loop unit dispatches), reconcile the three state sources — DB / disk / in-memory — and surface any divergence as a blocker, not a silent re-dispatch.

## When to Use

- Before Phase 1 of `verification-loop` if the project tracks runtime state outside source control (sqlite, KV, redis, `completed-units.json`, milestone JSON, lockfiles).
- Before any auto-loop iteration in long-running sessions.
- After a crash, pause/resume, or context compaction — the in-memory loop state is gone but DB and disk persist.
- When a flag like `is_sketch`, `in_progress`, or a stale lock keeps re-firing the same unit.

## Why This Skill Exists

GSD-2's [CONTEXT.md](https://github.com/gsd-build/gsd-2/blob/main/CONTEXT.md) names "State Reconciliation" as one of four runtime invariant modules. Common failure modes it catches:

- **Stale flags re-dispatch completed units** — `is_sketch`, stale worker rows, stale sequence/dependency rows that no one cleared.
- **Disk artifacts present, DB status lags** — `PROJECT.md` milestone registration, completion timestamps, roadmap divergence.
- **Recovery helpers exist but aren't wired into dispatch** — divergence accrues silently between iterations.

A verification ladder that runs against unreconciled state reports green on the wrong inputs.

## The Reconciliation Contract

For every state class the project tracks, define and run before dispatch:

1. **Authority** — which surface is the source of truth (DB, disk artifact, in-memory loop state).
2. **Projection** — direction of state flow (DB → disk, disk → DB, or both with a named winner).
3. **Reconciliation** — the deterministic check that proves authority and projection match.
4. **Failure mode** — what happens on divergence (block dispatch, repair, ask operator).

Output a single fenced block before any dispatch, so the operator sees the resolved state before it costs a misread:

```
state-reconciliation (resolved):
  participants table:        DB authoritative; disk projection at data/participants.json — match (1247 rows)
  completed_units.json:      project root authoritative after crash; worktree projection — match
  is_sketch flag:            DB authoritative — clear (no re-dispatch risk)
  open lock at /tmp/foo.lck: stale (PID 1234 not running) — STALE, blocks dispatch
  milestone registration:    PROJECT.md authoritative; DB row — DIVERGED (DB shows in_progress, disk shows complete)
```

Each row shows class + authority + reconciliation result. `STALE`, `DIVERGED`, `MISSING` surface as blockers; only every-row-`match` unblocks dispatch.

## Anti-Patterns

- **Reconciling at unit boundary, not lifecycle boundary.** Checking only when a unit is about to run lets earlier units write to invalid state. Reconcile once at lifecycle start and on every resume.
- **One-way trust.** Assuming DB is always right (or disk always right) without naming authority per state class. Authority is a per-class decision; codify it.
- **Silent repair.** Auto-fixing divergence without surfacing it. If reconciliation fixes 12 rows, the operator must see the count and the classes.
- **Reconciling the wrong direction.** Projecting disk → DB when DB was the authority overwrites correct state with stale data. The direction is part of the contract, not a default.
- **Treating "missing" as "match".** An absent state class is not the same as a reconciled one. Missing means the projection never ran; surface it explicitly.

## Pairs With

- [verification-loop](verification-loop.md) — runs as a pre-Phase-0 invariant; the resolved-state block fires before the resolved-ladder block.
- [worktree-safety](worktree-safety.md) — both fire before dispatch; safety runs first because reconciliation depends on a valid worktree root.
- [recovery-classification](recovery-classification.md) — divergence found here routes through recovery-classification on the next loop iteration if the reconciler can't auto-repair.
