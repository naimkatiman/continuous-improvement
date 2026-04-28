---
title: WILD/RISA balance skill
date: 2026-04-28
slug: wild-risa-balance-skill
status: done
branch: feat/wild-risa-skill
---

# WILD/RISA balance skill

## Goal

Add a Tier-2 companion skill named `wild-risa-balance` that gives the agent a deliberate switch between two opposing decision modes:

- **RISA (Execution)** — Realistic, Important, Specific, Agreeable. Safe, average, ships.
- **WILD (Creation)** — Wild, Imaginative, Limitless, Disruptive. Cool ideas that often never ship.

The skill is a thinking lens, not a runtime hook. It is referenced by `proceed-with-the-recommendation` and any session that emits a multi-item recommendation block, so the agent can split items WILD-on-top / RISA-on-bottom and route them differently.

## WILL build

1. New source skill file: `skills/wild-risa-balance.md`.
   - YAML frontmatter: `name`, `tier: "2"`, `description`, `origin: continuous-improvement`.
   - Body sections (in order): `When to Use`, `The Two Modes`, `The Trap`, `Switching Deliberately`, `How to Apply in a Recommendation List`, `Integration with the 7 Laws`, `Example`, `Related`.
   - Length budget: 80–150 lines. No code samples beyond a small markdown example block.
2. Update `skills/README.md` Tier 2 table to add a row for `wild-risa-balance` with a one-line description and a "When it pays off" cell.
3. Regenerate the bundled plugin manifest by running `npm run build`. This rewrites `plugins/continuous-improvement/skills/wild-risa-balance/SKILL.md` and the bundled-skills README from the source files.

## WILL NOT build

- No new hook. The 3-section close hook stays unchanged.
- No edit to `skills/proceed-with-the-recommendation.md`. A future PR can add a "consult `wild-risa-balance`" line; this PR is content-only.
- No edit to `commands/discipline.md`. The 7 Laws card stays as-is.
- No new MCP tool, command, or `bin/` script.
- No change to `bin/check-skill-tiers.mjs` or its test (the new skill must satisfy the existing tier check, not require a new one).
- No commit on `main`. Work stays on `feat/wild-risa-skill`.
- No push or PR. User authorizes those separately.

## Verification

1. `node bin/check-skill-tiers.mjs` exits 0 and lists the new skill source.
2. `npm test` passes (build + node --test on every test file).
3. `npm run verify:generated` passes — meaning the regenerated bundle in `plugins/continuous-improvement` is committed alongside the source so CI does not flag drift.
4. Manual diff check: every file changed lives under `skills/`, `plugins/continuous-improvement/skills/`, or `docs/plans/`. No drive-by edits elsewhere.
5. The new skill renders correctly in `plugins/continuous-improvement/skills/README.md` under "Tier 2 — expert-mode add-ons".

## Fallback

If the build fails or tests break, revert the new skill file and the README row, leaving only the plan doc on the branch as a record of the attempt. Do not paper over a build error by hand-editing the generated bundle.

## Out of scope (deferred)

- WILD/RISA tagging requirement inside `proceed-with-the-recommendation` execution loop (Option B from the prior turn).
- Mandatory WILD/RISA split in the 3-section close hook (Option C from the prior turn).
- Both deferred until at least three sessions of evidence that the vocabulary actually changes outcomes.

## 2026-04-28 amendment — 7-item floor

After the initial skill landed (PR #35, commit `1dc4557`), operator feedback was that "1–2 bold items" + "the safe items" was too loose: lists kept degrading to flat 2+2 blocks where the bold and safe items competed equally, defeating the point. Tightened the contract to a hard floor.

- **WILD pilots:** exactly 2 bold items.
- **RISA baseline:** at least 5 safe items.
- **Total floor:** 2 WILD + 5 RISA = 7 items minimum.

Files changed by the amendment (follow-up branch `feat/wild-risa-floor`):
- `skills/wild-risa-balance.md` — How-to-Apply prose rewritten with explicit counts; example expanded from 2+2 to 2+5 with annotated headers.
- `plugins/continuous-improvement/skills/wild-risa-balance/SKILL.md` — same edit mirrored for `check-skill-mirror`.
- `bin/check-docs-substrings.mjs` — new assertion locking the literal `2 WILD + 5 RISA = 7 items minimum` into both files so CI catches future drift.
- `skills/proceed-with-the-recommendation.md` (+ plugin mirror) — one-line cross-reference noting the upstream 7-item floor.

Verification for the amendment:
1. `node bin/check-skill-mirror.mjs` exits 0.
2. `node bin/check-docs-substrings.mjs` exits 0 with the new assertion.
3. `node bin/check-skill-tiers.mjs` exits 0.
4. Diff confined to the four files above plus this plan doc.
