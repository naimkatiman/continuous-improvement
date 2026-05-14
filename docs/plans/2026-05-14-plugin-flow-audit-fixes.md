# Plan — Plugin-flow audit fixes (2026-05-14)

Branch: `chore/plugin-flow-audit-fixes`

## Goal

Close the friction points found by the plugin-flow stress-test so a first-time
user does not lose trust at the manifest, doc, or install layer. Source: 9-item
WILD/RISA recommendation (2 WILD + 7 RISA) walked under `proceed-with-the-recommendation`.

## Items and commit mapping

One concern per commit, per CLAUDE.md. Build pipeline: edit `src/**/*.mts`, then
`npm run build` regenerates `bin/`, `lib/`, `plugins/`, `.claude-plugin/` manifests.

| # | Item | Files | Commit |
|---|---|---|---|
| 1 | Reconcile skill-count string ("13 enforcement skills" → actual bundle count) | `src/lib/plugin-metadata.mts`, `package.json`, regenerated `marketplace.json` + `plugin.json` | A |
| 1b | `verify:skill-count` lint — manifest count vs bundle dir count | `src/bin/check-skill-count.mts`, `src/test/check-skill-count.test.mts`, `package.json` scripts | B |
| 2 | CHANGELOG `[3.9.1]` + `[3.9.2]` entries | `CHANGELOG.md` | C |
| 3 | Unify instinct-threshold vocabulary to "observations" | `QUICKSTART.md` (SKILL.md already correct) | D |
| 6+7 | README slash-command section accuracy — `/companion-preference` + Expert/observations qualifiers | `README.md` (+ `QUICKSTART.md` if needed) | E |
| 4 | Detect+refuse Beginner+Expert collision | `src/bin/install.mts`, `src/test/install.test.mts` | F |
| 5 | Wrap pack JSON load in try/catch + clean rollback | `src/bin/install.mts`, `src/test/install.test.mts` | G |
| W2 | Windows-without-bash first-class install check | `src/bin/install.mts`, `src/test/install.test.mts` | H |
| W1 | Self-verifying single-command Beginner install | — | **HALT — needs design decision** |

## W1 — why it halts

`/plugin install continuous-improvement@continuous-improvement` is a Claude Code
*native* command. There is no mechanical edit in this repo that injects a probe
into it. Delivering W1's intent requires a design choice:
- **A** — ship a separate `/verify-install` slash command the user runs after install.
- **B** — use a plugin-manifest post-install hook, *if* Claude Code supports one
  (needs verification against current Claude Code plugin spec).

This is a fork for the operator, not an implementation task. Surfaced in the
Phase 7 close.

## Verification

Per item: `npm run build` then `npm run verify:all` (skill-mirror, skill-tiers,
skill-law-tag, docs-substrings, everything-mirror, routing-targets,
doc-runtime-claims, typecheck) + targeted test where a `.test.mts` exists.

## Risks

- `docs-substrings` lint locks specific literals — item 3 / 6+7 doc edits must not
  break locked substrings; check `bin/check-docs-substrings.mjs` before editing.
- `verify:generated` fails if `.mjs` is edited without rebuilding from `.mts`.
- Auto-merge ordering hazard if this branch splits into stacked PRs — keep as one
  branch with single-concern commits, or gate stacked PRs on dependency order.
