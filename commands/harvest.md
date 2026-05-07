---
name: harvest
description: Harvest friction events from observation logs into typed instincts (env_issue, permission_block, wrong_approach, buggy_code) with confidence scoring.
---

# /harvest — Friction Harvest

Run the friction-harvest classifier against this project's observation log and append new typed instincts to `instincts.jsonl`. Idempotent on re-run.

## What it does

Reads `~/.claude/instincts/<project-hash>/observations.jsonl` produced by the Mulahazah hook, classifies failure rows into four typed friction patterns, scores confidence with a recency-weighted decay, and appends new instincts to `<project-hash>/instincts.jsonl` alongside.

| Type | What it catches |
|---|---|
| `env_issue` | jq missing, command not found, not recognized as cmdlet |
| `permission_block` | sandbox / harness blocked, Permission denied |
| `wrong_approach` | file changed since last read (parallel-actor stale) |
| `buggy_code` | file not read first, old_string ambiguous, file too large |

## How to invoke

```
node bin/harvest-friction.mjs
node bin/harvest-friction.mjs <project-hash>
node bin/harvest-friction.mjs --list
```

`--list` shows new classifications without writing to `instincts.jsonl` — useful for dry-run before committing the harvest output.

## Idempotency

Each instinct carries a `dedup_key = sha1(type + tool + summary[:120])`. Re-running on the same observations does not duplicate previously-written instincts; `loadExistingDedupKeys()` reads the destination file once at start.

## Confidence model

```
confidence = log10(occurrence_count + 1) * recency_factor
recency_factor = 0.5 + 0.5 * exp(-days_since_last_seen / 14)
```

One occurrence today → 0.30. Ten occurrences today → clamped to 1.0. One occurrence 30 days ago → 0.17.

## Output shape

```
harvest-friction project=0af156594b39
  observations rows:    9346
  tool_complete rows:   2104
  classified failures:  47
  thin-schema rows:     0
  new instincts:        12
  skipped (existing):   35

New instincts:
  [0.92] env_issue on Bash (×8): bash: jq: command not found
  [0.74] permission_block on Bash (×4): harness blocked direct push to main
  ...

Appended 12 instinct(s) to /Users/.../instincts/0af156594b39/instincts.jsonl
```

## When the classifier emits zero instincts

If `tool_complete rows: 0`, the bash-fallback hook is active (no jq AND the Node observer is not on PATH) and only emits `tool_start` events. Two remediation paths:

- **Install jq** — `winget install jqlang.jq` (Windows), `brew install jq` (macOS), `apt install jq` (Linux).
- **Wire the Node observer** — ensure `hooks/bin/observe.mjs` is reachable from the active hook script.

Both are documented in the WARNING the classifier prints on a thin-schema host.

## Pairs with

- **`continuous-improvement`** (core SKILL.md, Law 7 — Learn From Every Session) — the harvest pipeline is the concrete mechanism behind Law 7's "capture patterns as instincts" contract.
- **`workspace-surface-audit`** — Phase 1 Environment Grain confirms whether jq + Node observer are available; if not, the harvest will run inert until that gap closes.
- **`gateguard`** — observation rows include the Parallel-Actor Gate's HEAD/upstream baselines when divergence-halts fire; the classifier surfaces those as `wrong_approach` instincts.
