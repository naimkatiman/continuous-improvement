# Companion-Preference Status Reader (`/companion-preference status`)

**Date:** 2026-05-14
**Slug:** `companion-preference-status-reader`
**Operator:** Naim
**Reason:** PR #138 ships the JSONL telemetry writer but produces no read-side affordance — the dataset sits inert until someone manually greps it. PR 5 lands the smallest piece of work that converts the telemetry into actionable signal: one CLI (`bin/companion-preference-status.mjs`) and one slash command (`/companion-preference status`) that aggregates the JSONL by `ci_skill` over a configurable window and reports counts plus companion-installed%. This is the JSONL-reader WILD from the 2026-05-13 train, promoted to a single-concern follow-up.

## Single-concern scope

| PR | Title | Scope (files) | Test strategy | Merge order |
|---|---|---|---|---|
| 5 | `feat(cli): companion-preference status reader for telemetry JSONL` | `src/bin/companion-preference-status.mts` (new CLI), `src/test/companion-preference-status.test.mts` (RED-then-GREEN), `commands/companion-preference.md` (new slash command), `skills/superpowers.md` (cross-reference under Telemetry), `src/bin/check-docs-substrings.mts` (2–3 assertions) + the generated `.mjs` / plugin mirrors | TDD: 7–8 RED tests written before any production code; full suite + verify:all stays green | Independent — does not require PR #138 to merge first (CLI handles missing JSONL gracefully) |

## CLI behavior

```
node bin/companion-preference-status.mjs              # last 7 days, human-readable
node bin/companion-preference-status.mjs --days 30    # last 30 days
node bin/companion-preference-status.mjs --all        # entire file, no window
node bin/companion-preference-status.mjs --json       # machine-readable JSON
node bin/companion-preference-status.mjs --path <p>   # override JSONL path (testing)
```

Human output (default):

```
Companion-preference telemetry — last 7 days
File:   ~/.claude/instincts/<hash>/companion-preference.jsonl
Window: 2026-05-07T00:00:00Z to 2026-05-14T...

ci_skill            total  observation  advisory  block  block-not-installed  installed%
tdd-workflow          142          120        15      7                    0          91
verification-loop      38           38          0      0                    0         100
context-budget         12           10          2      0                    0          67
ralph                   4            4          0      0                    0           0
learn-eval              0            0          0      0                    0           —

Mode totals: ci-first 168, companions-first 17, strict-companions 7
Total events: 196
```

JSON output:

```json
{
  "file": "/home/x/.claude/instincts/abc123/companion-preference.jsonl",
  "window_days": 7,
  "since": "2026-05-07T00:00:00Z",
  "total_events": 196,
  "by_skill": {
    "tdd-workflow": {
      "total": 142,
      "actions": { "observation": 120, "advisory": 15, "block": 7, "block-not-installed": 0 },
      "installed_pct": 91
    }
  },
  "by_mode": { "ci-first": 168, "companions-first": 17, "strict-companions": 7 }
}
```

## TDD plan

RED — tests written first, watched to fail:

1. Missing JSONL file → friendly "no telemetry recorded yet" message; exit 0.
2. Empty JSONL file → all zero counts; exit 0.
3. Single `observation` row in window → counted under correct skill, action=observation.
4. Rows older than `--days` window → excluded by default, included under `--all`.
5. `--json` flag outputs valid parseable JSON with the documented shape.
6. Malformed JSONL lines silently skipped; a `parse_errors` count appears in `--json` output.
7. `installed_pct` is `null` (rendered as `—` in human output) when total = 0; otherwise rounded integer 0–100.
8. `--path` override lets tests target an arbitrary JSONL file without touching `$HOME`.

GREEN — implement `src/bin/companion-preference-status.mts` until all RED tests pass.

## Slash command

`commands/companion-preference.md` is a thin markdown wrapper:

```yaml
---
name: companion-preference
description: Inspect the companion-preference hook telemetry — counts by CI skill, action breakdown, and companion-installed%.
---
```

Trigger phrases: `/companion-preference`, `/companion-preference status`, "show companion preference stats". The body instructs the agent to run the CLI with sensible defaults and render the output.

## Out of scope

- Any change to the hook itself or to the telemetry write path.
- Log rotation, TTL, or compaction of the JSONL file.
- A `--by-mode` or `--by-companion` aggregation axis beyond what the spec captures.
- Adding a `bin` entry to `package.json` (touching the manifests would cross the single-concern line; the slash command invokes the CLI by relative path).
- Hooking the reader into `/dashboard` or `/seven-laws` — separate follow-up if telemetry usage justifies integration.

## Verification ladder

- `npm test` — current 548 tests stay green; +7–8 new tests for the CLI bring the suite to ~556.
- `npm run verify:all` — 8 invariants stay green. `docs-substrings` gains 2–4 assertions locking the new command file + JSONL filename literal in `commands/companion-preference.md`.
- Manual: invoke the CLI against a synthetic JSONL fixture and confirm human + JSON output match the spec.

## End-state behavior

After PR 5 merges, the dispatcher-bias surface has:

- PR #133 — documented protocol (settings key).
- PR #134 — `/proceed --once` companion mode.
- PR #136 — runtime enforcement (hook).
- PR #138 — write-side telemetry (JSONL).
- **PR 5 — read-side aggregation (CLI + slash command).**

The operator can run `/companion-preference status` after a 7-day window and see exactly which routing rows the override fires on, how often, and whether the companion plugin was installed at the time. That dataset is what makes a future default-flip decision evidence-driven, closing the loop the dispatcher-bias train was built around.
