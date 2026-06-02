---
name: skill-distillation
tier: "2"
description: Enforces Law 7 (Learn From Every Session) of the 7 Laws of AI Agent Discipline. Distills repeated successful tool sequences into reusable draft instincts, so a pattern that worked three times becomes a captured recipe instead of being re-derived from scratch every session.
origin: continuous-improvement
user-invocable: true
---

# Skill Distillation — Turn Repeated Wins Into Reusable Instincts

Law 7 says learn from every session. The friction harvester already learns from failures. This skill learns from the other side: when the same tool sequence keeps ending in a passing verification, that is a recipe worth keeping — not a coincidence to forget.

## When to Activate

- At end of session, after a successful multi-step task — check whether the pattern is worth keeping.
- When you notice you have solved a similar problem the same way more than once.
- During a retrospective, to mine the observation log for patterns that have proven themselves.

## Core Concept

Distillation walks the observation log, groups it into contiguous trajectories (split on session change or a long time gap), and keeps only the trajectories that ended in success:

```
verify-exit-0   — a Bash test/build/verify command with a non-failing output
reflection-pass — an observation containing "verified" / "phase 4" / "verify:all green"
```

It then mines the tool-name sequences of successful trajectories for n-grams (length 3–5) that recurred **across multiple distinct sessions**. A pattern repeated only within a single session is rejected — that is repetition, not a reusable skill.

## The Promotion Ladder

Drafts never affect behavior until you promote them. Three explicit steps, no auto-promotion:

```
1. ci_distill_candidates           — list patterns that qualify (read-only)
2. ci_distill_propose id=<id>      — write a DRAFT to ~/.claude/instincts/<hash>/drafts/
                                      (placeholder body — you fill in the real recipe)
3. <edit the draft body by hand>   — the tool sequence is evidence, not a recipe
4. ci_distill_promote id=<id>      — promote to a live instinct at 0.5 confidence (SUGGEST)
```

The draft starts at 0.4 confidence and lives in a `drafts/` subdirectory that the instinct loader ignores. Only `ci_distill_promote` writes a live instinct, at 0.5 (SUGGEST tier) — it suggests, it does not auto-apply, until the normal reinforcement loop earns it more confidence.

## Why Drafts, Not Auto-Instincts

A tool sequence alone is cargo-cult evidence: `Read → Edit → Bash → Edit → Bash` is a TDD loop, but the *value* is in the preconditions and the specific steps, which the sequence does not capture. Requiring a human to edit the body before promotion is the guard against the system fabricating confident-sounding skills from coincidental call ordering.

## Limitations

- **Pattern detection only (no LLM in v1).** The draft body is a placeholder; you write the recipe. An optional model-assisted body draft is a planned follow-up.
- **Tool-name granularity.** Distillation sees tool names and summaries, not full intent. Two unrelated tasks with the same call shape will look like one pattern — the human edit step resolves this.

## Pairs With

- **`continuous-improvement`** (core SKILL.md, Law 7) — distillation is the success-side complement to the friction-harvest failure side of the same observation log.
- **`recall`** — before promoting, recall whether an existing instinct already covers the pattern.
- **`tdd-workflow`** — the most common distilled pattern is the RED-GREEN-REFACTOR loop; promote it with project-specific test commands filled in.
