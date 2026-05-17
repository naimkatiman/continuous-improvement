# Plan — verify:scripts-citation-drift (2026-05-18)

Branch: `feat/verify-scripts-citation-drift`

## Goal

Lock the inventory-citation contract in [scripts/README.md](../../scripts/README.md):

> "When a new script lands here, add a row to this table in the same PR and
> cite the script from at least one skill — otherwise the script is dead code
> on arrival."

Today the contract holds organically (7 scripts, 6 citing skills, every row
in the inventory table maps to a real citation, every citation is back-listed
in its script's row). Without enforcement, the contract erodes the first time
a script lands without README and skill plumbing — a real risk during the
ongoing composability refactor. The lint locks all three sides:

| Side | Catches |
|---|---|
| A — script ↔ README row | new script lands without inventory row |
| B — README row ↔ real citation | inventory claims a skill cites a script the skill no longer mentions |
| C — skill mention ↔ README row | skill body adds a citation without the inventory row catching up |

## Promotion note (operator-redirectable)

The original queue framing was `hooks/scripts-citation-drift.mjs` (a runtime
PreToolUse hook). The locked promotion (from the /superpowers WILD #2 of this
session, accepted by the operator with "continue with item 2") is to ship
this as `bin/check-scripts-citation-drift.mjs` (a `npm run verify:*`
invariant) instead. Reason: invariants fire in CI on every PR; hooks fire
only on the host where a dev is already paying attention, and the
inventory-citation contract is a release-gate concern, not a tool-use concern.

## Items and commit mapping

One concern per commit. Build pipeline: edit `src/**/*.mts`, then
`npm run build` regenerates `bin/`, `lib/`, `test/`, `plugins/`,
`.claude-plugin/` manifests.

| # | Item | Files | Commit |
|---|---|---|---|
| 1 | Failing test for the lint behaviour (RED) | `src/test/check-scripts-citation-drift.test.mts`, regenerated `test/check-scripts-citation-drift.test.mjs` | A |
| 2 | Lint implementation (GREEN) | `src/bin/check-scripts-citation-drift.mts`, regenerated `bin/check-scripts-citation-drift.mjs` | A (paired with the test per repo convention) |
| 3 | Wire into `verify:all` chain | `package.json` | A |
| 4 | Bump CLAUDE.md count to 10 content invariants + typecheck | `CLAUDE.md` | A |

Single commit total — same shape as PR #149 (the test-imports-only invariant).

## Lint shape

`bin/check-scripts-citation-drift.mjs` (generated from `src/bin/check-scripts-citation-drift.mts`):

- Inputs: walk `<repo>/scripts/` for files other than `README.md`; parse
  `<repo>/scripts/README.md` Inventory table; read every file referenced in a
  table row's "Cited by" cell.
- Half A: every file in `scripts/` (excluding `README.md`) must appear inside
  at least one backticked token in the Script column of the table.
- Half B: for every row, every `\`skills/<name>.md\`` token inside the Cited
  by column must reference a file whose body contains the literal string
  `scripts/<script-filename>` for at least one of the row's scripts.
- Half C: every `skills/*.md` file that contains the literal substring
  `scripts/<filename>` (for any `<filename>` listed in the inventory) must
  appear in that script's row's Cited by cell.
- Exit 0 with `OK scripts-citation-drift: N script(s), M skill citation(s), all three sides reconciled.`
- Exit 1 with one line per violation, grouped by side (A/B/C), naming files.
- Optional positional arg: alternate repo root (matches the existing
  `check-*.mjs` convention).

## Test shape

`src/test/check-scripts-citation-drift.test.mts`:

- Six cases — one per side-pass, one per side-fail (A pass/fail, B fail, C
  fail), one for `README.md` is the only `.md` in `scripts/` so it stays
  excluded, and one for the live repo (baseline holds).
- Each fixture builds a temp dir with `scripts/<files>` + a minimal
  `scripts/README.md` containing the Inventory table + `skills/<files>.md`.
- Runs the lint with that temp dir as the alt repo root.

## Verification

- `npm run build` regenerates the `.mjs` siblings.
- `node --test test/check-scripts-citation-drift.test.mjs` — all cases pass.
- `npm run verify:all` — green end-to-end with the new step inserted after
  `verify:test-imports-only` and before `typecheck`.

## Halt conditions

- If running the lint against the live repo before implementation reveals an
  existing drift that I overlooked during baselining, halt and surface it —
  do not let the lint ship with a hidden allow-list.
- If the operator redirects the promotion (wants it as a runtime hook
  instead of an invariant), halt and replace this plan rather than amending
  mid-flight.

## Out of scope

- Reverse coverage for *non-inventoried* scripts (e.g. a skill mentions a
  fictional `scripts/ghost.mjs` that does not exist). Half C only checks
  citations of *real* inventoried scripts; phantom mentions would be a
  separate doc-drift invariant.
- Citation strength — a skill that mentions a script once in a footnote and
  a skill that depends heavily on the script both count equally. Out of
  scope for this PR.
- The Phase 9 runner (`scripts/run-synthetic.mjs`) ships on its own branch
  off fresh `origin/main` after this PR merges, per the WILD/RISA #4 rule.
