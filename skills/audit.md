---
name: audit
tier: "2"
description: Enforces Law 4 (Verify Before Reporting) of the 7 Laws of AI Agent Discipline. Audits a window of recent commits for real defects, confirms each finding before touching code so false positives die first, and checks every surface a change touches — so 'looks done' is never mistaken for 'is correct'.
origin: continuous-improvement
user-invocable: true
---

# Audit — Confirm Recent Commits Before You Trust Them

Law 4 says verify before reporting. A merged commit with green CI is a claim, not a proof. This skill runs the audit-driven loop: take a window of recent commits, hunt for real defects, prove each one before touching code, fix on a branch, and verify every surface the fix touches before declaring the audit clean.

## When to Activate

- After a batch of commits lands ("audit today's commits"), especially on money-handling, auth, or state-mutating code.
- When a feature shipped across several surfaces (backend, frontend, admin, migration) and you suspect one was missed.
- After a large refactor or a conflicted merge — exactly when individually-correct functions can still cancel each other out.
- Before a release cut, as the last gate over "everything claimed done."

## The Loop

```
1. Scope    — pick the commit window (e.g. main since last release, or HEAD~N..HEAD)
2. Find     — hunt for real defects, one concern per pass
3. Confirm  — prove each finding against the actual code; false positives die here
4. Fix      — one branch, one concern per commit, smallest diff that closes the defect
5. Verify   — exercise EVERY surface the fix touches, not just the one you edited
6. Report   — confirmed defects, dismissed false positives, and no-op items, with evidence
```

## Find: One Concern Per Pass

Run the find pass once per dimension rather than one undifferentiated sweep. The dimensions that have actually caught defects in this codebase's domain:

- **Value/economy drift** — a constant duplicated across surfaces (a prize array hardcoded in the frontend while the backend reads an endpoint; a cap defined twice). Grep both sides; compare.
- **Concurrency** — a read-modify-write with no guard, a settlement that is not idempotent, a row that can get stuck between two states.
- **Surface coverage** — a change that updated the backend but not the admin filter or the client cache that mirrors it.
- **Type/contract** — a payload shape that one side narrowed and the other did not.

For a thorough audit, use the `superpowers:dispatching-parallel-agents` skill to fan these out as parallel reviewers — each blind to the others — then merge findings.

## Confirm Before Fixing

A finding is a hypothesis until proven against the code. Before writing any fix:

- Read the actual lines, not the diff summary. Confirm the defect reproduces in the current tree.
- State why it is real in one sentence. If you cannot, it is a false positive — record it as dismissed and move on.
- Prefer a failing test that reproduces the defect, then fix to green (`tdd-workflow`).

Defaulting findings to "real" is how plausible-but-wrong fixes get shipped. Default to skeptical; make the code prove the bug.

## Verify Every Surface the Fix Touches

The recurring failure this skill exists to stop: a fix that the agent claims is done while the frontend array, admin filter, or cached copy still carries the old value. This is the functional-surface check `audit` gates before reporting — not the build/test/lint ladder itself (that is `verification-loop`). Before reporting an item closed:

- List every surface the changed value or behavior touches (backend, frontend, admin, migration, cache, generated artifact).
- Re-check each surface yourself — do not assume one auto-updates from another.
- On each surface, run the resolved `verification-loop` ladder against the code that implements it, not a manual spot-check.

This applies the `verification-loop` (Law 4) and `goal-monitor` (Law 2) discipline to someone else's recent work.

## Report Honestly

Three buckets, with evidence: **confirmed** (defect + fix + the check that proves it), **dismissed** (looked like a bug, here is why it is not), **no-op** (in scope but nothing to change). Silence on a surface is not a pass.

## Pairs With

- **`code-review`** / **`security-review`** — the dimension passes; `audit` is the loop that runs them over a commit window and acts on the output.
- **`superpowers:dispatching-parallel-agents`** — fan the find pass out across dimensions, then verify each finding adversarially.
- **`verification-loop`** (Law 4) — the build/test/lint ladder `audit` runs on each surface before a finding is closed.
- **`goal-monitor`** (Law 2) — confirms the fix still serves the task goal, not just that it compiles.
- **`recall`** (Law 1) — before confirming a finding, recall whether this exact defect was hit and fixed before.
- **`reconcile`** (Law 1) — when the audit ends in a fix, reconcile the branch state before pushing.
