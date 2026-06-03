# Design — Goal-drift Stop hook (items 1 + 2 + 6)

The second half of the goal-driven-execution `/proceed` (first half shipped in PR #178). Turns goal-monitor from a pull-only `/goal-check` into a runtime enforcer that fires at the Stop phase boundary.

## The three coupled items

- **#2 — auto-fire `/goal-check` at phase boundaries.** Claude Code has no native "phase boundary" event; the closest real boundary is **Stop** (end of turn). A new `Stop` hook scores recent activity against the stated goal every turn and persists the status.
- **#6 — refuse "Done" on DRIFT.** When the turn is a substantive wrap-up and the session has drifted from its `## Goal`, the hook re-prompts instead of letting the agent close — the goal becomes the gate, not a suggestion.
- **#1 — name the enforcer.** With a wired hook in place, the Companion-skills enforcement table in CLAUDE.md gets an honest "Goal-driven execution → goal-drift-stop hook" row (`verify:doc-runtime-claims` now has a real `hooks/*.mjs` anchor to point at).

## Architecture (mirrors the existing hook stack)

```
Stop hook: src/hooks/goal-drift-stop.mts  ─┐ I/O + mode + fail-open
                                            ├─ calls →  src/lib/goal-drift-gate.mts (PURE, unit-tested)
reuses: src/lib/goal-state.mts             ─┘            evaluateGoalDrift({goalMarkdown, observations, textLength, mode})
        (parseGoalFromPlan, scoreObservations — hardened in PR #178)
```

- **Hash parity (load-bearing):** `projectRoot = CLAUDE_PROJECT_DIR || git rev-parse --show-toplevel || "global"`; `hash = sha256(projectRoot).slice(0,12)` — byte-identical to `src/bin/observe.mts:48-49`, so the hook reads the **same** `~/.claude/instincts/<hash>/observations.jsonl` the observer writes.
- **Goal source order** (matches the goal-monitor skill): `<projectRoot>/task_plan.md` → `~/.claude/instincts/<hash>/goal.md`.
- **Pure core** `goal-drift-gate.mts`: no I/O. `evaluateGoalDrift({ goalMarkdown, observations, textLength, mode })` → `{ action: "allow" | "warn" | "block", status, score, reason }`. Fully unit-testable like `goal-state.mts`.

## Decision logic (fail-open, conservative)

`evaluateGoalDrift` returns **allow** unless ALL hold:
1. A `## Goal` section is found and parses (`parseGoalFromPlan` ≠ null).
2. `scoreObservations(...)` returns status `drift` (not `on-goal`, not `no-data`).
3. `textLength ≥ 600` — the turn is a substantive wrap-up, not a clarifying reply (same threshold the three-section-close hook uses). This is the non-fuzzy "claims done" proxy: a substantive Stop *is* a completion report. No lexical "done" keyword matching (avoids the false-positive class PR #178 just hardened against).

Only then does it emit `warn` or `block` per mode.

## Mode (the one decision for review)

`CLAUDE_GOAL_DRIFT_GATE`:
- **`warn` (DEFAULT):** compute + persist status + print a one-line drift notice to stderr; **never blocks.** Safe out of the box, proves the signal's value.
- **`block`:** on drift, emit `{"decision":"block","reason":...}` to re-prompt — full Law-2 enforcement.
- **`off`:** no-op.

Rationale for warn-default: the drift score is a lexical heuristic (broad goals score everything on-goal; vocabulary drift false-positives). A default-on hard block would erode trust the same way the three-section-close audit found low instinct yield (CLAUDE.md 2026-05-04). Warn-default earns the block. **Owner decision surfaced in the PR: keep warn-default, or ship block-default for this repo.**

The status is persisted to `~/.claude/instincts/<hash>/goal-drift-state.json` every Stop regardless of mode (realizes #2's "persist status").

## Safety invariants

- Fail open on every error (missing goal, unreadable observations, parse failure, no git) — never block on a hook bug. Matches three-section-close.
- 5s hook timeout (hooks.json default).
- No network. No transcript content persisted beyond the drift status.
- Independent of three-section-close: a second `Stop` entry, so either can be disabled without the other.

## Test plan

- Unit (`src/test/goal-drift-gate.test.mts`): allow when no goal / no-data / on-goal / short text; warn vs block per mode on drift; the `textLength` gate; forbidden-path drift; reuses the goal-state fixtures.
- `npm run verify:all` (incl. `doc-runtime-claims` for the new CLAUDE.md row + `everything-mirror` for the hook mirror) + full `node --test`.
- The hook's thin I/O wrapper is covered the way `three-section-close` is (the pure core carries the logic).

## Files

- `src/lib/goal-drift-gate.mts` (new, pure) + `src/test/goal-drift-gate.test.mts` (new)
- `src/hooks/goal-drift-stop.mts` (new) → builds to `hooks/goal-drift-stop.mjs` + plugin mirror
- `plugins/continuous-improvement/hooks/hooks.json` (add 2nd `Stop` entry)
- `CLAUDE.md` (enforcement-table row, item 1)
