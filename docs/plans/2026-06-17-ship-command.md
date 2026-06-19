# Plan: `/ship` command — single-defect audit→fix→PR pipeline (PowerShell-safe)

- Date: 2026-06-17
- Branch: `feat/ship-command` (off `origin/main` 136b7f1)
- Closes: R6 from the 2026-06-17 report-coverage map (no unified `/ship` command exists)

## Goal

A single-concern slash command that walks ONE defect from audit to a review-ready PR, reusing existing skills, with Windows/PowerShell-safe commit guidance. Pure routing — no new orchestration logic, no new skill, no new code.

## Why

The coverage map confirmed the audit→TDD→test→commit→PR→merge→deploy pipeline is already composable from `release-train` + `proceed-with-the-recommendation` + the superpowers stages, but there is no single entry point for the common case: fix one defect, open one PR. `release-train` is multi-PR; `proceed-with-the-recommendation` walks an arbitrary recommendation list. `/ship` is the single-defect fast path.

## Scope (one concern)

In:
- New `commands/ship.md` — a routing command (prose), command-only, sequencing existing skills for one defect on one branch.
- Regenerate plugin manifests + `plugins/` mirror via `npm run build` (generated output, committed).

Out (explicitly deferred, not dropped):
- No multi-PR orchestration — that is `release-train`.
- No new skill, no new hook, no `.mts` code — keeps skill-count / skill-tiers / skill-law-tag / tool-count invariants untouched.
- No deploy automation, no auto-merge — `/ship` stops at "PR open, CI green, awaiting your merge". Deploy verification stays advisory via `deploy-receipt`.
- PowerShell-native fallbacks for `deploy-receipt`'s Bash-only scripts (the other half of R6) → separate follow-up PR.

## Design (routing only)

`/ship <one-line defect description>` walks:
1. `reconcile` — establish git ground truth; refuse if not on a clean feature branch off `origin/main`.
2. `tdd-workflow` — RED failing test reproducing the defect → GREEN minimal fix (pre-test code deleted).
3. `verification-loop` — run the project verify ladder; build/types/tests green before commit.
4. One commit, one concern, PowerShell-safe message (single-line `-m`, or `-F <tempfile>`) per the global Windows Shell Discipline rule.
5. `commit-commands:commit-push-pr` — push branch + open PR. STOP. Never auto-merge.
6. `deploy-receipt` — after you merge, verify the deployed SHA (advisory).

Hard stops (halt and ask): protected-branch push, ambiguous defect description, any verification failure.

## Files

- Source (hand-authored, committed): `commands/ship.md` (1 file).
- Generated (committed via `npm run build`, never hand-edited): `plugins/continuous-improvement/commands/ship.md` mirror; `.claude-plugin/marketplace.json` + `plugins/continuous-improvement/.claude-plugin/plugin.json` if command lists are embedded; `llms.txt` / docs counts if a command total is cited.

## TDD / verification

1. Before writing the command: grep for any asserted command count (tests, `llms.txt`, README, `scripts/`); bump it if one exists (RED if a count test fails first).
2. Write `commands/ship.md`.
3. `npm run build` (regenerates mirror + manifests).
4. `npm run verify:all` green — especially `everything-mirror`, `scripts-citation-drift`, `docs-substrings`, `routing-targets` (every skill `/ship` cites must exist), `doc-runtime-claims`.
5. `git diff --exit-code -- bin lib test plugins` clean after build (build-pipeline invariant).
6. Stage by explicit filename (no `git add -A`). One commit, cite this plan. Open PR; do not merge.

## Risks

- Count-drift invariants (`scripts-citation-drift` / `docs-substrings`) if a command total is cited anywhere — caught by `verify:all`.
- `routing-targets`: every skill `/ship` references must resolve — caught by the invariant.
- `.mts`/`.mjs` trap: none here (command-only), but rebuild-before-stage still applies to the generated mirror.

## Done when

`verify:all` green + PR open + this plan cited in the commit. Merge and any deploy remain the operator's call.
