# Companion-Preference Telemetry JSONL

**Date:** 2026-05-14
**Slug:** `companion-preference-telemetry-jsonl`
**Operator:** Naim
**Reason:** PR #136 shipped runtime enforcement for the `companion_preference` flag but emits no persistent record of what it does. The closing recommendation of the 2026-05-13 dispatcher-bias train was: "ship the telemetry JSONL WILD next — every other follow-up is independent and can land in any order, but only telemetry produces the evidence that earns a clean default-flip decision later." This PR delivers exactly that — one JSONL line per hook decision, written to `~/.claude/instincts/<hash>/companion-preference.jsonl`. Critically, telemetry fires even under `ci-first` mode as `observation` rows so the data set captures the shadow path (what `companions-first` would have done) without changing default behavior.

## Single-concern scope

| PR | Title | Scope (files) | Test strategy | Merge order |
|---|---|---|---|---|
| 4 | `feat(hook): companion-preference telemetry JSONL with ci-first shadow rows` | `src/hooks/companion-preference.mts` (+ telemetry writer), `src/test/companion-preference-hook.test.mts` (+ 5–6 new tests), `skills/superpowers.md` (+ telemetry paragraph), `src/bin/check-docs-substrings.mts` (+ 2 assertions) + the generated `.mjs` / plugin mirrors | TDD RED-then-GREEN for the new tests; `npm test` total stays passing; `npm run verify:all` green | Independent (follows #133–#136) |

## Event shape

One JSONL line per hook invocation that touches a mapped CI skill, regardless of mode:

```json
{
  "ts": "2026-05-14T10:30:00.000Z",
  "hook": "companion-preference",
  "mode": "ci-first" | "companions-first" | "strict-companions",
  "action": "observation" | "advisory" | "block" | "block-not-installed",
  "ci_skill": "tdd-workflow",
  "companion": "superpowers:test-driven-development",
  "plugin": "superpowers",
  "companion_installed": true | false
}
```

- `observation` — mode is `ci-first`; would have fired advisory under `companions-first`. This is the shadow data the default-flip decision needs.
- `advisory` — mode is `companions-first`; stderr advisory was emitted.
- `block` — mode is `strict-companions`; companion plugin installed; tool call blocked.
- `block-not-installed` — mode is `strict-companions`; companion plugin missing; blocked with install hint.

Non-mapped skills and non-`Skill` tool calls write nothing — they were no-op before PR 4 and remain no-op.

## File path resolution

Telemetry file: `<sessionDir>/companion-preference.jsonl`, where `sessionDir` is the same `~/.claude/instincts/<project-hash>/` directory `gateguard-state.mts` resolves via `resolveSessionDir()`. Reusing that helper keeps the per-project hash scheme single-sourced.

## TDD plan

RED — new tests added before any production code change. Existing 8 tests stay green; 5 new tests fail until the implementation lands:

1. `ci-first` + mapped skill → no decision change, but a JSONL line with `action: "observation"` lands at `<sessionDir>/companion-preference.jsonl`.
2. `companions-first` + mapped skill → JSONL line has `action: "advisory"` and `mode: "companions-first"`.
3. `strict-companions` + mapped skill + companion installed → JSONL line has `action: "block"` and `companion_installed: true`.
4. `strict-companions` + mapped skill + companion missing → JSONL line has `action: "block-not-installed"` and `companion_installed: false`.
5. Multiple invocations append (not overwrite) — two calls produce two lines.
6. Telemetry write failure (unwritable session dir) does not change the hook decision — fail-open invariant preserved.

GREEN — extend `src/hooks/companion-preference.mts` with a `writeTelemetry()` function called from each of the four branches (observation in `ci-first`, advisory in `companions-first`, block × 2 in `strict-companions`). The writer wraps `appendFileSync` in try/catch; any error is swallowed and the decision proceeds.

## Out of scope

- Telemetry for non-mapped skills (would balloon volume; the override only affects mapped rows so only those need shadow data).
- Telemetry for non-`Skill` tool calls (gateguard already covers Bash; this hook is `Skill`-scoped).
- Reading or analyzing the JSONL (separate skill / command, follow-up).
- Log rotation. JSONL grows append-only; if size becomes a concern after the 7-day shadow, a follow-up adds rotation or a TTL.
- Task / Agent tool-call coverage (the other WILD; tracked separately).

## Verification ladder

- `npm test` — 13 hook tests total (8 existing + 5 new) plus the full suite (~547 tests).
- `npm run verify:all` — 8 invariants. New docs-substring assertions lock the telemetry paragraph in `skills/superpowers.md` and its plugin mirror.
- Manual: spawn the hook with a synthetic payload under each mode, confirm a JSONL line lands at the expected path and parses as JSON.

## End-state behavior

After PR 4 merges:

- Every mapped CI skill invocation writes one line to `~/.claude/instincts/<hash>/companion-preference.jsonl`.
- Under `ci-first` (default) the file accumulates `observation` rows — the shadow data.
- Under `companions-first` it accumulates `advisory` rows.
- Under `strict-companions` it accumulates `block` / `block-not-installed` rows.
- After 7 days of accumulated data the operator can grep / aggregate the JSONL to see exactly which routing rows the override fires on, how often, and which companions are installed in the wild. That dataset is what makes a future default-flip evidence-driven instead of preference-driven.
