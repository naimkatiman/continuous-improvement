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

The skill is a thinking lens, not a runtime hook. It is referenced by `proceed-with-claude-recommendation` and any session that emits a multi-item recommendation block, so the agent can split items WILD-on-top / RISA-on-bottom and route them differently.

## WILL build

1. New source skill file: `skills/wild-risa-balance.md`.
   - YAML frontmatter: `name`, `tier: "2"`, `description`, `origin: ECC`.
   - Body sections (in order): `When to Use`, `The Two Modes`, `The Trap`, `Switching Deliberately`, `How to Apply in a Recommendation List`, `Integration with the 7 Laws`, `Example`, `Related`.
   - Length budget: 80–150 lines. No code samples beyond a small markdown example block.
2. Update `skills/README.md` Tier 2 table to add a row for `wild-risa-balance` with a one-line description and a "When it pays off" cell.
3. Regenerate the bundled plugin manifest by running `npm run build`. This rewrites `plugins/continuous-improvement/skills/wild-risa-balance/SKILL.md` and the bundled-skills README from the source files.

## WILL NOT build

- No new hook. The 3-section close hook stays unchanged.
- No edit to `skills/proceed-with-claude-recommendation.md`. A future PR can add a "consult `wild-risa-balance`" line; this PR is content-only.
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

- WILD/RISA tagging requirement inside `proceed-with-claude-recommendation` execution loop (Option B from the prior turn).
- Mandatory WILD/RISA split in the 3-section close hook (Option C from the prior turn).
- Both deferred until at least three sessions of evidence that the vocabulary actually changes outcomes.
