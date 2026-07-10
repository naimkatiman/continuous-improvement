---
name: simplicity-review
description: Review the current diff for over-engineering — flag code that could reuse an existing file, a stdlib or native feature, or fewer lines — and report GO/TRIM findings without touching code. Enforces Law 4 (Verify Before Reporting).
---

# /simplicity-review — Judge the Diff Before You Ship It

Read the current change like the laziest senior dev in the room: could this have been smaller? Passing tests prove correctness, not minimality. Backed by the `simplicity-review` skill.

## What it does

Takes the working-tree diff (vs HEAD by default; accepts an optional commit range or file list), reads each changed block, and walks a fixed reuse ladder:

```
1. Does this need to exist?   -> skip it (YAGNI)
2. Already in this codebase?  -> reuse it
3. Stdlib does it?            -> use it
4. Native platform feature?   -> use it
5. Installed dependency?      -> use it
6. One line?                  -> one line
7. Only then:                    the minimum that works
```

It reports `file:line`, what is over-built, the specific simpler path, and closes with `GO` (already minimal) or `TRIM` (findings to apply). It does not edit code.

## Default skeptical

A finding is a hypothesis. Read the surrounding code and prove the simpler path exists and preserves behavior before asserting it; a wrong trim is worse than the over-build. Never flag input validation, data-loss-preventing error handling, security, or accessibility — lazy, not negligent.

## Pairs with

- **`simplicity-review`** skill — the discipline this command runs.
- **`proceed-with-the-recommendation`** — apply the trims under the 7 Laws.
- **`verification-loop`** — the ladder to re-run on whatever you trim.
- **`production-readiness-review`** — the sibling diff review for performance, security, UI, and test coverage.
