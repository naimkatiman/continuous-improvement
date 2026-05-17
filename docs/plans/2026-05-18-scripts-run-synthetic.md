# Plan — `scripts/run-synthetic.mjs` (Phase 9 runner) (2026-05-18)

Branch: `feat/scripts-run-synthetic`

## Goal

Ship the Phase 9 runner that executes `synthetic-checks/*.synthetic.{sh,mjs,ts,py}` and aggregates exit codes per the contract in [synthetic-checks/README.md](../../synthetic-checks/README.md). The contract has existed since the directory landed; the runner that actually walks it has not. Without the runner, the two example checks are dead code and the `verification-loop` Phase 9 prose is documentation of a behaviour nothing implements.

This PR closes that gap and dogfoods both invariants landed in PR #149 (`test-imports-only`) and PR #150 (`scripts-citation-drift`).

## Subagent-driven-development trail

Per `/superpowers` commitment "subagent-driven-development is the default for non-trivial tasks (two-stage spec+quality review)":

- Stage 1 — spec subagent (Plan/planner) produced the surface, exit-code contract, fixture matrix, TDD order, dogfooding text, and risk list. Output baked into this plan doc.
- Stage 2 — code-reviewer subagent runs after the runner lands locally green; review notes either fold back as fix commits or land as `⚠️ Deferred` per CLAUDE.md.

## Surface

```
node scripts/run-synthetic.mjs [--dir <path>] [--json] [--show-command] [--timeout <sec>] [--fail-fast]
```

| Flag | Default | Behaviour |
|---|---|---|
| `--dir <path>` | `synthetic-checks/` | Resolved from CWD; matches the verify-ladder field default. |
| `--timeout <sec>` | `60` | Per-check wall clock. Check-level HTTP timeouts (10s in examples) are the primary bound; runner cap is the safety belt. Exceeded → recorded exit 124, status `timeout`. |
| `--fail-fast` | off | Default is collect-all. Drift report value comes from listing every failing endpoint; opt-in when checks are expensive. |
| `--json` | off | Emit machine-readable summary instead of the human report. |
| `--show-command` | off | Print interpreter map + env-injection list without executing. Mirrors `get-deployed-sha.sh --show-command`. |

## Exit-code contract (the load-bearing decision)

| Code | Meaning |
|---|---|
| `0` | Every recognized check exited 0, OR directory empty / absent. (`skipped` is not failure.) |
| `1` | At least one check exited non-zero with status `fail` or `timeout`. Drift surface. |
| `2` | At least one check exited 2 (config error per the README) AND zero `fail`. Distinct from drift because config errors mean the gate did not actually run — treating them as drift causes false-INCOMPLETE on every PR when staging is just unreachable. |
| `3` | Runner-level usage error (bad flag, explicitly-passed dir is unreadable). |

Mixed `fail` + `config_error` → runner exits **1** (drift dominates). `--json` summary carries both counts separately.

## Interpreter map

`.sh → bash`, `.mjs → node`, `.ts → tsx`, `.py → python`. Unknown extension → `skipped` with stderr warning; does NOT fail the run. Spawn is via `node:child_process.spawnSync` with the interpreter as the explicit binary; shebangs are irrelevant.

## Env injection

Runner reads `BASE_URL` / `BASELINE_URL` / `EXPECTED_SHA` / `DEPLOY_BRANCH` / `RECEIPT_TIMESTAMP` from its own env and injects them into each child's env. Unset vars are injected as `""` so checks can read them defensively without dealing with `undefined`. Required-env enforcement lives **at the check level**, not the runner level: a check that needs `BASE_URL` reads it and exits 2 if absent (per the `synthetic-checks/README.md` contract). The runner is a pure aggregator — it propagates exit 2 from any check up to its own exit code per the table above.

## Items and commit mapping

One commit. Same shape as PRs #149/#150.

| # | Item | Files |
|---|---|---|
| 1 | Failing test (RED) | `src/test/run-synthetic.test.mts`, regenerated `test/run-synthetic.test.mjs` |
| 2 | Runner implementation (GREEN) | `scripts/run-synthetic.mjs` (hand-authored, no `.mts` source per `scripts/README.md`) |
| 3 | Test fixtures | `src/test/fixtures/synthetic/{empty,all-pass,mixed,config-only,unknown-ext,timeout}/...` |
| 4 | Dogfood the citation invariant | `scripts/README.md` (inventory row), `skills/verification-loop.md` (Phase 9 implementation citation) |

## TDD order (RED → GREEN)

In the order I write them, smallest-scope first so the runner converges:

1. Empty dir → exit 0, zero summary.
2. `all-pass` (two `.sh` exit 0) → exit 0.
3. `mixed` (one pass, one drift, one config error) → exit 1; all three captured.
4. `config-only` (every check exits 2) → exit 2.
5. Env passthrough — child sees `BASE_URL` and `BASELINE_URL`.
6. Aggregator propagation — when the check self-reports exit 2 (missing required env), runner exits 2.
7. `--json` shape — `{dir, checks: [...], summary: {pass, fail, configError, skipped, total}}`.
8. `--fail-fast` halts on first failure, subsequent files `skipped — fail_fast`.
9. `unknown-ext` skipped with warning, sibling `.sh` runs normally.
10. `--show-command` exits 0, prints interpreter map, executes nothing.
11. `--timeout` kills long-running check (gated `it.skip` on Windows when bash is absent — mirrors `src/test/hook.test.mts`).

## Dogfooding text

**`scripts/README.md` inventory row** (insert after the `route-recommendation.mjs` row):

```
| `run-synthetic.mjs` | Phase 9 runner: invoke every `*.synthetic.{sh,mjs,ts,py}` in `synthetic-checks/`, inject `BASE_URL`/`BASELINE_URL`/`EXPECTED_SHA`/`DEPLOY_BRANCH`/`RECEIPT_TIMESTAMP`, capture stdout/stderr/exit per check, aggregate. Default mode prints the report block; `--json` for machine consumption; `--fail-fast` halts on first drift; `--timeout <sec>` per-check wall-clock cap; `--show-command` dry-run. Exit 0 all-pass, 1 drift, 2 config error, 3 usage. | `skills/verification-loop.md` (Phase 9) |
```

**`skills/verification-loop.md` insertion** (add one line directly under the existing `**What the runner does:**` heading at line 165, before the numbered list at line 167):

> Implementation: `scripts/run-synthetic.mjs` encodes the lexical walk, interpreter map, env injection, and exit-code aggregation below. The prose is documentation, not the contract.

That single backticked path satisfies `bin/check-scripts-citation-drift.mjs` Side B (skill body contains `scripts/run-synthetic.mjs`) and Side C (skill is listed in the row's Cited by cell).

## Verification

- `npm run build` regenerates `test/run-synthetic.test.mjs` from `src/test/run-synthetic.test.mts`.
- `node --test test/run-synthetic.test.mjs` — every TDD case passes.
- `npm run verify:all` — green end-to-end. Note: the new file in `scripts/` will trigger `verify:scripts-citation-drift` until the dogfooding row + skill citation land in the same commit. That ordering is the proof of correctness.

## Halt conditions

- If running the bare runner against the real `synthetic-checks/` directory in this repo triggers an unexpected drift (the examples are not designed to actually pass — they hit real URLs that do not exist), surface the result honestly. The integration test will use temp dir fixtures, not the live directory, so this is a runtime observation only.
- If the citation-drift invariant flags anything other than the deliberate dogfooding edits, halt — that means I have miscounted citations elsewhere.

## Out of scope

- Parallel execution. Serial only — synthetic checks hit production; concurrent load is wrong.
- Custom interpreter maps per repo. Hardcoded; if a project needs `deno` or `bun`, add a flag in a follow-up PR.
- Captured-output truncation cap. The risk list flags multi-MB stdout; surfacing the full diff today is acceptable, follow-up if it bites.
- Wiring the runner into a `verify:*` invariant. Phase 9 is a release-gate concern, not a per-PR invariant — it requires deployed production + baseline URLs that no CI run has.

## Risk register (carry-through from spec subagent)

| Risk | Blast | Mitigation in this PR |
|---|---|---|
| Drift-vs-config-error conflation | High — false INCOMPLETE | Distinct aggregator exit 2; TDD case #4 before fail-fast case #8 |
| Windows lacks `bash`/`tsx`/`python` | Medium — CI red on cross-platform repos | Mirror `src/test/hook.test.mts` skip pattern; record `skipped — interpreter not on PATH`, not `fail` |
| Timeout leaks child processes | Medium — runaway CI minutes | `spawnSync` `timeout` option + `killSignal: 'SIGKILL'`; verify via test #11 |
| `--json` stdout pollution on multi-MB diffs | Low — slow report | Deferred — risk list note, fix on demand |
| Citation-drift invariant fails on dogfood edits | Low — verify:all red | Insertion point is regular prose, not a runtime-hook claim line; ±5-line rule for `verify:doc-runtime-claims` does not apply |
| `RECEIPT_TIMESTAMP` not in env on standalone runs | Low — checks defensively read | Forward as `""` not unset |
