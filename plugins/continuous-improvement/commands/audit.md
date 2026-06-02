---
name: audit
description: Audit a window of recent commits for real defects, confirm each finding before fixing, verify every surface a fix touches, then report confirmed/dismissed/no-op with evidence. Enforces Law 4 (Verify Before Reporting).
---

# /audit — Confirm Recent Commits Before You Trust Them

Run the audit-driven loop over recent work: a merged commit with green CI is a claim, not a proof.

## What it does

Takes a commit window, hunts for real defects one concern at a time, proves each finding against the actual code (false positives die before any edit), fixes on a branch with the smallest diff, verifies every surface the fix touches, and reports honestly. Backed by the `audit` skill.

## The loop

```
1. Scope    git log to pick the window (e.g. HEAD~10..HEAD, or main since last release)
2. Find     one pass per dimension: value/economy drift, concurrency, surface coverage, type/contract
3. Confirm  read the actual lines; state in one sentence why it is real, or dismiss it
4. Fix      one concern per commit; prefer a failing test first, then green
5. Verify   exercise EVERY surface (backend, frontend, admin, cache, migration), not just the edited one
6. Report   confirmed (with the proof), dismissed (with why), no-op (in scope, nothing to change)
```

## Default skeptical

Findings are hypotheses. Default each to a false positive until the code proves the bug — defaulting to "real" is how plausible-but-wrong fixes ship. For a thorough audit, fan the find pass out across dimensions with parallel reviewers, then verify each survivor adversarially.

## Pairs with

- **`audit`** skill — the discipline this command runs.
- **`code-review`** / **`security-review`** — the per-dimension passes.
- **`reconcile`** — the safe branch→PR path once the audit produces a fix.
- **`recall`** — check whether a finding was already hit and fixed before.
