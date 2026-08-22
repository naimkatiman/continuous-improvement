# 2026-08-22 — README: still useful as models improve, and how to benefit

**Branch:** `docs/readme-still-useful-2026-08-22`
**Base:** `origin/main` @ v3.23.0 (`564115f`)
**Scope:** docs only. One PR.

## Goal

Answer two operator questions the current landing page never states:

1. Is this still worth installing as models get better?
2. How do you actually benefit — what to run, in what order?

## Why this PR

The README already explains gateguard, the 7 Laws, and install. It does not say which parts of the product merge into the model (planning etiquette, "remember to verify" reminders) and which do not (the runtime gate, this-repo memory, proof that a change worked). It also oversells compounding: capture is silent, but instincts only form when someone runs `/seven-laws` / `/harvest` / `/distill`. People install Beginner, never close that loop, and conclude "it didn't learn."

## In

- `README.md` — add "As models get better" + "How you actually benefit"; pull "Who this is for" out of `<details>`; keep locked substrings and the MCP `19 of them` claim.
- `QUICKSTART.md` — stop requiring a prompt prefix; make `/seven-laws` the explicit learning trigger; stop claiming auto-promotion with no action.
- `llms.txt` — same two answers in short form for scraper/agent readers.

## Out

- Skill retirement, hook semantics, MCP schema, landing-page HTML, weekly-loop docs, any `src/` change.
- Host-specific observation counts. Those belong in the operator reply, not the public README.

## Verification

- `npm run typecheck`
- `npm run verify:docs-substrings`
- `npm run verify:tool-count`
- `npm run verify:doc-runtime-claims`

Runtime-claim lines that use "PreToolUse hook", "physically block", or "runtime gate" must keep a `hooks/<name>.mjs` anchor within ±5 lines.
