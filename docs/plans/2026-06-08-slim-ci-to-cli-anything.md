# Slim the `ci` CLI to CLI-Anything only

Date: 2026-06-08
Status: in progress

## Goal

Remove the two `ci` toolkit areas that overlap the core product and keep the one that is genuinely distinct. Operator decision (tree-shake the overlapping parts).

- **Remove** Compound Engineering (overlaps the Mulahazah instinct/learning engine).
- **Remove** PM-Skills (overlaps the out-of-band `phuryn/pm-skills` marketplace install).
- **Keep** CLI-Anything (turns a repo into an agent-native CLI — no core-product overlap).

## Why this is a near-rewrite, not a deletion

`unified-plugin.mts` is ~80% Compound/PM workflow: `executeResearchPhase` / `executePlanningPhase` / `executeWorkingPhase` / `executeReviewPhase` / `executeCompleteWorkflow` plus ~30 helper methods all run through Compound Engineering, and `initializeProject` feeds PM-Skills. With two of three tools gone, the orchestrator is vestigial. So it is deleted, and `unified-cli` is rewritten as a thin front-end over the `CLIAnything` library.

## Changes

| Action | File |
|---|---|
| delete | `src/lib/compound-engineering.mts` (+ generated `lib/compound-engineering.mjs`) |
| delete | `src/lib/pm-skills.mts` (+ generated) |
| delete | `src/lib/unified-plugin.mts` (+ generated; vestigial orchestrator) |
| delete | `src/test/compound-engineering.test.mts`, `src/test/pm-skills.test.mts`, `src/test/unified-plugin.test.mts` (+ generated) |
| keep | `src/lib/cli-anything.mts` + `src/test/cli-anything.test.mts` |
| keep | `src/lib/pm-marketplace.mts` — build-critical (imported by `generate-plugin-manifests`), unrelated to the CLI |
| rewrite | `src/bin/unified-cli.mts` — thin `ci` over `CLIAnything`: `generate <repo>`, `list`, `config show/set`, `help` |
| update | `docs/new-tools-integration.md` — CLI-Anything only |
| update | `CHANGELOG.md` — `[3.13.0]` breaking-change note |

`bin` entry `"ci": "bin/unified-cli.mjs"` stays. The subtree libs are not in the `plugins/` mirror, so the mirror is unaffected.

## Breaking change

Drops the published `ci compound`, `ci pm`, `ci learnings`, and the `ci init/workflow/research/planning/execution/review` workflow commands. Minor to **3.13.0** with a CHANGELOG note. (Release/publish is a separate step given the manual npm pipeline.)

## Verification

`npm run clean && npm run build` (so orphaned `.mjs` are removed) then `npm run verify:all` (12 invariants + typecheck) then `node --test test/*.test.mjs`. Generated tree must be clean (`git diff --exit-code -- bin lib test plugins .claude-plugin`).
