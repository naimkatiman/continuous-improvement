# Plan — verify:test-imports-only (2026-05-18)

Branch: `feat/verify-test-imports-only`

## Goal

Lock the existing test-isolation discipline so it cannot quietly erode.

Of 44 `src/test/*.test.mts` files plus the one orphan handwritten counterpart
`test/check-everything-mirror.test.mjs`, every non-`node:` import resolves to
exactly one of `../bin/<name>.mjs` or `../lib/<name>.mjs`. Zero cross-test
imports. Zero bare npm specifiers. Zero reach-through into `hooks/`,
`scripts/`, `src/`, or sibling test files. This is the composability axis the
refactor train just built — one subject per test, one direction of dependency,
no shared test-helpers.

The lint enforces that property. All 45 files pass today; the lint ships
green and stays that way.

## Interpretation note (operator-redirectable)

The phrase "verify:test-imports-only" was not previously documented in repo.
Two grounding passes during plan execution:

1. First read: "tests must import only from `node:*`." Rejected — 12+ test
   files direct-import from `../bin/` or `../lib/` for unit-level coverage
   (e.g. `countSkills` from `../bin/check-skill-count.mjs`).
2. Second read (locked): **tests may import from `node:*` or any path
   matching `../bin/<x>.mjs` or `../lib/<x>.mjs`. Nothing else.** Empirically
   passes for all 45 current files, catches cross-test coupling and npm-drift,
   does not require any existing test refactor.

If the intended rule was tighter (e.g. basename-must-match-subject) or
different in shape, redirect at the plan stage and the allow-list adjusts.

## Items and commit mapping

One concern per commit, per CLAUDE.md. Build pipeline: edit `src/**/*.mts`,
then `npm run build` regenerates `bin/`, `lib/`, `test/`, `plugins/`,
`.claude-plugin/`.

| # | Item | Files | Commit |
|---|---|---|---|
| 1 | Failing test for the lint behaviour (RED) | `src/test/check-test-imports-only.test.mts`, regenerated `test/check-test-imports-only.test.mjs` | A |
| 2 | Lint implementation (GREEN) | `src/bin/check-test-imports-only.mts`, regenerated `bin/check-test-imports-only.mjs` | A (same commit — TDD pair lands together per repo convention) |
| 3 | Wire into `verify:all` chain | `package.json` | B |
| 4 | Append invariant to CLAUDE.md "verify" call-out + Past Mistakes table if applicable | `CLAUDE.md` | C |

Note on commit A pair: existing checks (e.g. `verify:skill-count`) landed
RED+GREEN in the same PR commit because the build pipeline forces both `.mts`
and the regenerated `.mjs` to ship together. The TDD discipline runs in the
authoring sequence; the commit is the joint atom.

## Lint shape

`bin/check-test-imports-only.mjs` (generated from `src/bin/check-test-imports-only.mts`):

- Inputs: walk `src/test/**/*.test.mts` plus the explicit allow-listed orphan
  `test/check-everything-mirror.test.mjs`.
- Per file, parse each line containing `from ['"]<specifier>['"]` (covers both
  single-line and multi-line `import { … } from` shapes — match on the `from`
  clause line, not the `import` keyword line).
- For each captured specifier:
  - If it matches `^node:` → OK.
  - If it matches `^\.\.\/(bin|lib)\/[A-Za-z0-9._-]+\.mjs$` → OK.
  - Otherwise → violation.
- Exit 0 with `OK test-imports-only: N test file(s), M production import(s), all within node:* or ../bin/*.mjs or ../lib/*.mjs.`
- Exit 1 with one line per violation: `  <relative-path>:<line> — imports "<specifier>"`, followed by a one-line summary of the allow-list.
- Optional positional arg: alternate repo root (matches the existing
  `check-*.mjs` convention).

## Test shape

`src/test/check-test-imports-only.test.mts`:

- Builds temp-dir fixtures and runs the lint with each as the alt repo root.
- Cases:
  - Good — all imports are `node:*` or `../bin/*.mjs` or `../lib/*.mjs` → exit 0.
  - Bad — cross-test import (`./other.test.mjs`) → exit 1, file+line named.
  - Bad — bare npm specifier (`from "lodash"`) → exit 1.
  - Bad — reach-through into `hooks/` (`from "../hooks/x.mjs"`) → exit 1.
  - Bad — deeper bin path (`from "../bin/sub/x.mjs"`) → exit 1.
- Asserts the live repo passes → exit 0 (the de facto baseline holds).

## Verification

`npm run verify:all` must finish green with the new step inserted before
`typecheck`. Step ordering: `…verify:doc-runtime-claims && npm run verify:test-imports-only && npm run typecheck`.

`npm run test` must pass `node --test test/check-test-imports-only.test.mjs`.

## Halt conditions

- If `grep '^import .* from .[^node:]' src/test/*.mts` returns any match
  during plan execution, the de facto baseline is wrong and the rule must be
  reframed before shipping. Today it returns zero.
- If the operator redirects the interpretation (looser/different rule), halt
  and replace this plan rather than amending mid-flight.

## Out of scope

- The other two queue items (`scripts-citation-drift` invariant,
  `scripts/run-synthetic.mjs` Phase 9 runner) ship on their own branches off
  fresh `origin/main` after this PR merges. Per the WILD/RISA #4 rule, no
  stacking.
- CLAUDE.md's stale "7 invariants" line is corrected as commit C of this PR
  (now 9 content invariants + typecheck = 10 entries in `verify:all`).
