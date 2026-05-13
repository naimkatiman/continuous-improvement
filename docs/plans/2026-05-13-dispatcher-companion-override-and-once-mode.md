# Dispatcher Companion-Preference Override + /proceed --once Mode

**Date:** 2026-05-13
**Slug:** `dispatcher-companion-override-and-once-mode`
**Operator:** Naim
**Reason:** A 2026-05-13 review of [skills/superpowers.md](../../skills/superpowers.md) and [skills/proceed-with-the-recommendation.md](../../skills/proceed-with-the-recommendation.md) identified two structural biases. First, the dispatcher routing table is CI-first regardless of which companion plugins the operator has explicitly installed — so an Obra user gets `ci:tdd-workflow` even after `/plugin install superpowers@continuous-improvement`. Second, `proceed-with-the-recommendation` enforces seven phases (P-MAG, plan-restate, route, verify, iterate, reflect, three-section close) on every confirmation, even on a single-item low-risk ask where the ceremony costs more than the work. Two single-concern PRs ship the smallest fix per bias.

## Stacked-PR Plan

| PR | Title | Scope (files) | Test strategy | Merge order |
|---|---|---|---|---|
| 1 | `feat(dispatcher): companion-preference override flag` | `skills/superpowers.md`, `plugins/continuous-improvement/skills/superpowers/SKILL.md` (regen), `src/bin/check-docs-substrings.mts` (+ generated `.mjs`) | `npm run verify:all` — `docs-substrings` catches the new section literals | Independent |
| 2 | `feat(proceed): --once fast-path mode` | `skills/proceed-with-the-recommendation.md`, `commands/proceed-with-the-recommendation.md`, `plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md` (regen), `plugins/continuous-improvement/commands/proceed-with-the-recommendation.md` (regen), `src/bin/check-docs-substrings.mts` (+ generated `.mjs`) | `npm run verify:all` — `docs-substrings` catches the new section literals | Independent |

Dependency graph: **independent**. PR 1 only edits the dispatcher skill plus the lint manifest. PR 2 only edits the orchestrator skill, the slash command, and the lint manifest. No shared files.

Worktree per PR:
- PR 1: `feat/dispatcher-companion-preference` → `../ci-wt-companion-pref`, base `origin/main` (`a4f72e9`)
- PR 2: `feat/proceed-once-mode` → `../ci-wt-proceed-once`, base `origin/main` (`a4f72e9`)

## Out-of-scope (explicitly NOT in this train)

- Flipping the routing-table default from CI-first to companions-first (intentionally left as an opt-in flag — the conservative default protects clean installs)
- Removing Phase 0 P-MAG from the standard proceed flow (`--once` is opt-in only)
- Renaming `/proceed-with-the-recommendation` or adding new top-level slash commands
- Touching `gateguard` or `three-section-close` hook code (these are runtime-layer; this train is markdown-only)
- Resolving the local-main stray `b5fdaf6` commit (operator handles separately — the worktrees branch from `origin/main`, so it is not absorbed)
- Adding a runtime reader for the new settings key (the override is documented protocol the model reads; runtime enforcement is a separate follow-up)

## Past Mistake Acknowledgment Gate (P-MAG)

Past mistakes scanned at session start `2026-05-13`:

- **PR #66 wiped by tsc** — `.mts` is source, `.mjs` is generated. Active in current scope: **no** — this change does edit `src/bin/check-docs-substrings.mts` but the `.mjs` is rebuilt via `npm run build`, never hand-edited.
- **Direct push to `main` on 2026-05-05** bypassed branch protection. Active in current scope: **yes** — both PRs use feature-branch + PR flow.
- **Local `main` 4 ahead of origin silently bundled into PR #26 squash.** Active in current scope: **yes** — local `main` is currently 1 ahead of `origin/main` (`b5fdaf6`); both worktrees explicitly branch from `origin/main`.

**Will NOT repeat:** silently absorbing the `b5fdaf6` doc-sync commit into either feature PR by basing the worktree on local `main` (the way PR #26 absorbed 4 unpushed commits on 2026-04-27).

## Verification ladder per PR

Both PRs run the full `npm run verify:all` invariant chain before push:

1. `verify:skill-mirror`
2. `verify:skill-tiers`
3. `verify:skill-law-tag`
4. `verify:docs-substrings` — with the new assertions added in the same PR
5. `verify:everything-mirror`
6. `verify:routing-targets`
7. `verify:doc-runtime-claims`
8. `typecheck`

If any invariant fails, the PR does not push.

## End-state behavior after both merge

- Operators can set `continuous_improvement.companion_preference: "companions-first" | "strict-companions"` in `~/.claude/settings.json` to honor explicitly-installed companion plugins (`superpowers@continuous-improvement`, `agent-skills@continuous-improvement`, `ruflo-swarm@continuous-improvement`, `oh-my-claudecode@continuous-improvement`) over CI defaults. The default stays `"ci-first"`.
- Operators can invoke `/proceed-with-the-recommendation --once` (or pass `--once` after the standard trigger phrase) to walk a single safe-tagged item through Phase 1 + Phase 3 + Phase 4 only, skipping P-MAG, the plan restatement, the reflection block, and the three-section close. Hard preconditions enforced in the skill: list size = 1, item tagged `safe`, no `needs-approval`, no `caution`.
- Both features are opt-in. The defaults remain CI-first routing and the seven-phase proceed flow.

Cited by every commit in PRs #1 and #2 of this train.
