# 2026-07-04 — Portfolio spine (Day 1–3 of the portfolio implementation pack)

## Goal

Give the portfolio a machine-readable spine inside `continuous-improvement`:

1. **Proof templates** shipped under `templates/` (portfolio event schema, release
   receipt, experiment record, GitHub Actions security checklist) so every repo in
   the portfolio can adopt the same evidence format.
2. **Repo registry** at `portfolio/repos.json` — the single machine-readable list
   of portfolio repos, lanes, and local checkout paths. Maintainer config, like
   `reports/`; deliberately NOT in the npm `files` array.
3. **`ci-audit-actions`** (`src/bin/audit-actions.mts`) — static GitHub Actions
   security scanner producing a markdown report. Zero runtime deps: the YAML
   scanning is hand-rolled, line-oriented parsing of the constrained
   GitHub-workflow YAML subset.
4. **`ci-portfolio-health`** (`src/bin/portfolio-health.mts`) — v0 repo scorer
   from LOCAL static signals only (no network): CI presence, release receipts,
   experiment records, commit freshness, high-severity `auditWorkflows` findings.
5. First real receipts: `.releases/` + `.experiments/` seeds and the first
   generated `reports/actions-security.md` + `reports/portfolio-health.md`.

## Assumptions

- Zero runtime dependencies is a hard constraint. No YAML library; no glob
  library. `node:fs`, `node:path`, `node:child_process` only.
- `portfolio/repos.json` localPaths point at `c:/Ai/<name>` checkouts on the
  maintainer host. Missing checkouts are expected and must degrade to
  `n/a (no local checkout)` — never a crash.
- Both commands follow the `src/bin/harvest-friction.mts` standalone pattern:
  exported pure functions + `main()` behind an argv guard, tests import only
  the compiled `../bin/<x>.mjs` (test-imports-only invariant).
- `package.json` version at HEAD `31afac3` is 3.17.0. The pack brief said
  v3.14.0; the receipt records the honest on-disk version.
- `unified-cli.mts` (`ci` bin) dispatches only `generate|list|config` — the new
  commands ship as standalone bins (`ci-audit-actions`, `ci-portfolio-health`),
  matching the dominant repo pattern (`ci-lint-transcript`, `ci-plan-pack`).
  `unified-cli` is not modified.

## YAML-subset parsing limits (audit-actions)

The parser is line-oriented and indentation-based. It handles the GitHub
workflow subset it targets and nothing more. Documented limits:

- **Comment stripping is naive**: a `#` outside quotes starts a comment; a `#`
  inside a quoted scalar that itself contains quote characters may be
  mis-stripped. Workflow files rarely hit this.
- **Flow-style nesting is shallow**: inline maps/lists (`on: [push, pull_request]`,
  `permissions: {contents: read}`) are matched with regexes, not parsed. Nested
  flow collections beyond one level are not understood.
- **Anchors, aliases, tags, multi-document streams** (`&a`, `*a`, `!!str`, `---`)
  are not resolved. GitHub Actions itself does not support anchors, so this is
  aligned with the platform.
- **Multiline scalars**: only `run: |`/`run: >` (with optional chomping
  indicators) are tracked, by indentation. Other block scalars are ignored.
- **Key detection is indentation-based**: a top-level key is a word at column 0
  ending in `:`; job names are keys nested under `jobs:`. Tab-indented YAML
  (invalid YAML anyway) is not supported.
- **False negatives over false positives**: when a construct is not understood,
  the scanner stays silent rather than guessing. The companion
  `templates/actions_security_checklist.md` is the human layer that covers what
  the machine layer cannot.

## Scoring rubric (portfolio-health v0)

Weighted 0–100 from local static signals; weights are named constants in
`src/bin/portfolio-health.mts` and mirrored in the report appendix:

| Signal | Weight | Full credit |
|---|---|---|
| CI configured (`.github/workflows` with >=1 yml) | 25 | present |
| Release receipts (`.releases/`, `docs/releases/`, minus templates) | 20 | 3+ receipts |
| Experiment records (`.experiments/`, `docs/experiments/`, minus templates) | 15 | 2+ records |
| Commit freshness (`git log -1 --format=%ct`, guarded) | 20 | <=7 days; half <=30 days |
| Actions security (high findings from `auditWorkflows`) | 20 | 0 high findings; -5/finding |

Repos without a local checkout score `n/a (no local checkout)`.

## Verification steps

1. TDD: `src/test/audit-actions.test.mts` + `src/test/portfolio-health.test.mts`
   written RED-first (typecheck fails on the missing `../bin/*.mjs` sources),
   then GREEN after implementation + `npm run build`.
2. `npm run build` — tsc emits `bin/*.mjs` + `test/*.mjs`; commit generated with source.
3. `npm test` — full suite green modulo the 19 pre-existing environmental
   failures on this sandboxed Windows host (shell-script driver suites
   `detect-deploy-target` / `get-deployed-sha` / `git-state-snapshot`: exit 127
   `sh` unavailable + EPERM on system temp). Verified present on clean HEAD
   `31afac3` before any change in this train.
4. `npm run verify:all` — all 14 invariants + typecheck green.
5. `npm run verify:generated` — no drift between `.mts` and committed `.mjs`.
6. Real-run receipts: `node bin/audit-actions.mjs --repo . --out reports/actions-security.md`
   and `node bin/portfolio-health.mjs --out reports/portfolio-health.md` committed.

## Commit plan (layered, <=15 files each)

- (a) docs: plan + proof templates + portfolio repos registry
- (b) feat: audit-actions command flags GitHub Actions security risks
- (c) feat: portfolio-health command scores repos from local proof signals
- (d) docs: README portfolio spine section
