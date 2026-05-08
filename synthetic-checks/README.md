# synthetic-checks/

Per-project synthetic checks that run after `deploy-receipt` reports `COMPLETE` and diff production against a staging baseline. Wired into the `verification-loop` skill via the `synthetic_checks` rung in `.claude/verify-ladder.json`.

## Why this directory exists

The 28-day usage report flagged a gap that `deploy-receipt` alone does not close: a deploy can land with a matching SHA and a 200 healthcheck, and still serve broken responses on real endpoints (stale data sources, mis-routed APIs, dropped headers, regressed payload shapes). The receipt confirms the deploy seam; synthetic checks confirm the application surface.

A synthetic check is a single executable file that:

1. Hits a documented endpoint on the **production** base URL.
2. Hits the same endpoint on the **staging baseline** URL.
3. Diffs the two responses on the dimensions that matter for that endpoint.
4. Exits `0` if they agree, non-zero if they drift.

The drift surfaces as `INCOMPLETE` on the verification-loop ladder, NOT as `COMPLETE`. A synthetic check is a gate, not a report.

## File convention

One check per file. Filename: `<name>.synthetic.<ext>`, where `<ext>` is one of `sh`, `mjs`, `ts`, `py`. Examples:

- `version-endpoint.synthetic.sh`
- `top-gainers-payload-shape.synthetic.mjs`
- `feed-freshness.synthetic.ts`
- `bot-trigger-routing.synthetic.py`

The extension determines how the verification-loop runner invokes the file (`bash`, `node`, `tsx`, `python`). Files without a recognized extension are skipped with a warning.

## Input contract

Every synthetic check receives the following environment variables. The runner sets them; the check reads them.

| Variable | Required | Meaning |
|---|---|---|
| `BASE_URL` | yes | Production base URL (e.g. `https://api.example.com`) |
| `BASELINE_URL` | yes | Staging baseline URL (e.g. `https://staging.example.com`) |
| `EXPECTED_SHA` | no | The merge SHA the receipt reported as COMPLETE; checks may use this to verify a `/version` payload includes the right commit |
| `DEPLOY_BRANCH` | no | The deploy branch name (typically `main`); useful for branch-aware checks |
| `RECEIPT_TIMESTAMP` | no | ISO-8601 timestamp of the receipt; useful for freshness checks |

A check that needs additional configuration reads it from the project's existing config surface (env file, `.claude/verify-ladder.json`, etc.) — the runner does NOT inject project secrets.

## Output contract

| Exit code | Meaning |
|---|---|
| `0` | Production matches the baseline on the dimensions this check measures |
| Non-zero | Drift detected; stdout MUST contain a human-readable diff |

The runner captures stdout and stderr verbatim. On non-zero exit, the diff lands in the verification-loop output unmodified — agents do not re-summarize it. Operators see the actual mismatch.

## What a synthetic check is NOT

- **Not a unit test.** Unit tests run against in-process code; synthetic checks run against deployed services.
- **Not an integration test.** Integration tests use ephemeral fixtures; synthetic checks compare two real environments.
- **Not a load test.** Synthetic checks measure correctness, not capacity. Latency assertions belong in a separate harness.
- **Not a smoke test.** Smoke tests verify "the service is up". Synthetic checks verify "the service serves the same thing staging serves". A smoke test passes against a stale deploy; a synthetic check fails.
- **Not a replacement for `deploy-receipt`.** The receipt confirms the SHA at the deploy seam. Synthetic checks confirm the surface. Both rungs run; either INCOMPLETE blocks the merge from being reported as done.

## Sample

`example-version-endpoint.synthetic.sh` is a minimal example showing the contract — curl `/version` against both URLs, diff the JSON, exit non-zero on mismatch. Copy it as a starting point and adjust the endpoint, the diff dimensions, and the failure message for your project.

## How the rung resolves these files

Phase 8 of the verification-loop skill, when the ladder declares `synthetic_checks: "synthetic-checks/"` (the directory name), runs every `*.synthetic.*` file in that directory in lexical order. Any non-zero exit surfaces as `INCOMPLETE — synthetic drift on <filename>` and includes the captured diff in the verification report. The rung runs only after `deploy-receipt` reports `COMPLETE`; it does not run if the receipt is INCOMPLETE (that is a different gap, addressed at the receipt rung).

A project that wants to skip the rung sets `synthetic_checks: null` in its ladder. A project that wants to point at a different directory sets `synthetic_checks: "infra/synthetic/"`. A project with no `synthetic-checks/` directory and no ladder field gets the rung silently skipped — the ladder Phase 0 resolution names it as "skipped — no synthetic-checks directory found" so the operator can spot the absence.
