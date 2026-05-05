# 2026-05-05 — README install ergonomics + benefit-led metadata follow-through

Plan for the `proceed-with-the-recommendation` walk on the audit close from earlier this session. Five RISA items; two WILDs parked as `needs-approval`.

## Goal

Make first-time install of the 7 Laws plugin recoverable, reduce hero-section friction, and stop padding the README with contributor-grade or migration-grade content that pushes the install command below the fold.

## Carried-in negative prompt (P-MAG Rule 3)

> Will NOT repeat: padding the Phase 7 close with priority columns, shell snippets, or decision trees the way `feedback_recommendation_terse_risa_filter.md` prohibits.

## Items

### Item 3 — Troubleshooting block under README install

- WILL build: a small `### Troubleshooting install` subsection right after the Expert install block listing three real failure modes and the fix per failure (session not restarted, missing bash on Windows, marketplace add silent-fail).
- Will NOT build: a generic FAQ; only the three observed-in-practice failures.
- Verification: `npm run verify:docs-substrings` (locked tokens `planning-with-files`, `task_plan.md`, `ci_plan_init` preserved); manual scan that `## More` still follows.
- Fallback: revert if any locked substring drifts.

### Item 4 — QUICKSTART.md restart-session fix

- WILL build: replace the existing "If the command is not recognized, the skill did not land — re-run the install step." with the actual diagnostic (restart session first; only re-run install if restart didn't help).
- Will NOT build: a parallel troubleshooting section (single-line fix only — QUICKSTART is a 2-minute doc).
- Verification: `npm run verify:docs-substrings` (no QUICKSTART substrings are locked, but full `npm test` still has to pass).
- Fallback: revert if any test asserts on the prior wording.

### Item 5 — Demote Law Coverage matrix to CONTRIBUTING.md

- WILL build: move the `## Law Coverage` table to CONTRIBUTING.md under a new section, leave a one-line pointer in README, keep the operator-opt-out env var subsection in README (it is operator-facing, not contributor-facing).
- Will NOT build: copy the matrix to two places — single source, README points to it.
- Verification: `npm run verify:all`; locked README substrings preserved; CONTRIBUTING.md still asserts `Contributing` and `npm test` (community.test.mts:16/17).
- Fallback: revert if `verify:docs-substrings` flags any drift.

### Item 6 — Collapse All 13 Skills behind `<details>`

- WILL build: wrap the existing "All 13 Skills" table in `<details><summary>Show the full table</summary>...</details>`. Hero, install, 7 Laws, and Mulahazah fit one viewport.
- Will NOT build: remove or rewrite the table itself.
- Verification: locked tokens stay; `npm test` green.
- Fallback: revert if anything inside `<details>` is silently dropped from rendering.

### Item 7 — Drop "Curated PM plugins moved" paragraph

- WILL build: remove the paragraph from README; add a one-line note to CHANGELOG.md under the 3.5.0 section pointing readers there.
- Will NOT build: remove the actual `plugins/pm-*` source directories — that is a separate concern.
- Verification: full lint suite + tests.
- Fallback: revert.

## Verification cadence

After every item: `npm run verify:docs-substrings` minimum (the lint that protects locked README/skill substrings). After all five items: `npm run verify:all && npm test`.

## Out-of-scope (deferred)

- WILD 1 (`/discipline` first-run proof): design-novel, parked.
- WILD 2 (`npx continuous-improvement doctor`): net-new bin command, parked.
