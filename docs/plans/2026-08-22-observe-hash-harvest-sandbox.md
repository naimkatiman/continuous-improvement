# 2026-08-22 — Canonical instinct hashes + harvest sandbox false positive

**Branch:** `fix/observe-hash-harvest-sandbox`
**Base:** `origin/main` @ `80198a5` (v3.23.0 + README #296)
**Scope:** three related defects, three commits.

## Goal

1. This product's own observations land in one hash, so `/seven-laws` / harvest / recall can dogfood.
2. DrSaid-standup's 9k-row bucket is readable from the live path.
3. Harvest stops classifying a filename containing `sandbox` as a permission block.

## Evidence (this host, 2026-08-22)

| Name | `project.json` root | Hash | Rows | Last write |
|---|---|---|---|---|
| continuous-improvement | `C:/Ai/continuous-improvement` | `137f2f54ec70` | 2284 | 01:34Z |
| continuous-improvement | `c:/Ai/continuous-improvement` | `8168f29d38ac` | 1673 | 02:16Z |
| DrSaid-standup | `C:/Ai/DrSaid-standup` | `3ef4426c6e15` | 9246 | 02:50Z |
| DrSaid-standup | `c:/Ai/DrSaid-standup` (canonical) | `fd437f3c26bd` | missing | — |

`gateguard-state` already hashes `canonicalizeProjectRoot` (lowercase drive, `/` separators). `observe`, harvest default hash, MCP `getProjectHash`, recall-briefing, and session still hash the raw string. `C:/` vs `c:/` vs `C:\` are three buckets.

The repo was never silent. Weekly research looked at a third spelling (`d9aa21327594`) and reported zero.

Harvest `--list` on tradeclaw classified `slow-regime-gate-sandbox.md` as `permission_block` because `/sandbox/i` matches any substring.

## In

- Tighten `classifyObservation` permission_block: drop bare `/sandbox/i`; keep denial phrases.
- Export `hashProjectRoot` next to `canonicalizeProjectRoot`. Observe, harvest default, MCP, and instinct-dir hooks use it. `project.json.root` is stored canonical.
- CLI `bin/reconcile-instinct-hashes.mjs`: group `project.json` roots by canonical hash, merge jsonl into the canonical dir, leave an alias marker. Idempotent. `--dry-run` then `--apply`.
- Host apply: `3ef4426c6e15` → `fd437f3c26bd`; `137f2f54ec70` → `8168f29d38ac`.
- Prove observe: pipe a payload with `CLAUDE_PROJECT_DIR=C:/Ai/continuous-improvement` and confirm the row lands in `8168f29d38ac`.

## Out

- Auto-promote instincts. Skill retirement. Changing gateguard gate semantics. Deleting old hash dirs (alias marker + renamed jsonl only).

## Commits

1. `fix(harvest): do not treat filename sandbox as a permission block`
2. `fix(observe): hash the canonical project root so C:/ and c:/ share a bucket`
3. `feat(instincts): merge alias observation hashes into the canonical dir`

## Verification

- RED tests for harvest filename/`Sandbox Study` vs real sandbox denial.
- RED test: observe `C:/Ai/x` and `c:/Ai/x` write one dir.
- Reconcile unit test: two alias dirs merge once, second apply is a no-op.
- `npm run build` then `npm run verify:all` and `node --test test/harvest-friction.test.mjs test/observe.test.mjs test/gateguard-state.test.mjs test/reconcile-instinct-hashes.test.mjs`.
