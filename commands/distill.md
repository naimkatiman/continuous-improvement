---
name: distill
description: Distill repeated successful tool sequences from the observation log into reusable draft instincts, with an explicit propose-edit-promote ladder. Enforces Law 7 (Learn From Every Session).
---

# /distill — Trajectory Distillation

Mine this project's observation log for tool sequences that recurred across multiple successful sessions, and turn the good ones into reusable instincts.

## What it does

Groups observations into trajectories, keeps the ones that ended in a passing verification, and finds tool-sequence n-grams that recurred across distinct sessions. Backed by the `ci_distill_candidates` / `ci_distill_propose` / `ci_distill_promote` MCP tools (expert mode) and the `skill-distillation` skill.

## The ladder

```
ci_distill_candidates           # list patterns that qualify (read-only)
ci_distill_propose id=<id>       # write a DRAFT (placeholder body) to drafts/<id>.yaml
# ... edit the draft body to capture the real recipe ...
ci_distill_promote id=<id>       # promote to a live instinct at 0.5 confidence (SUGGEST)
```

Drafts never affect behavior until promoted. The draft starts at 0.4 confidence in a `drafts/` subdirectory the instinct loader ignores; promotion writes a live instinct at 0.5 (SUGGEST tier).

## Candidate criteria

- The trajectory must have ended in success (`verify-exit-0` or `reflection-pass`).
- The tool sequence must have recurred at least 3 times across at least 2 distinct sessions.
- A pattern repeated only within one session is rejected — that is repetition, not a reusable skill.

## Why the human edit step

A tool sequence is evidence, not a recipe. `Read → Edit → Bash → Edit → Bash` is a TDD loop, but the value is in the preconditions and concrete steps. Editing the draft body before promotion is the guard against fabricating confident skills from coincidental call ordering.

## Pairs with

- **`skill-distillation`** skill — the discipline this command runs.
- **`continuous-improvement`** (core SKILL.md, Law 7 — Learn From Every Session).
- **`recall`** — before promoting, check whether an existing instinct already covers the pattern.
