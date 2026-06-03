# Plan — Goal-Driven Execution proceed run (2026-06-03)

Source: `/proceed-with-the-recommendation` over the 7-item block produced by the goal-driven-execution audit. Walked under the 7 Laws via `proceed-with-the-recommendation`.

## Scope decision

The block has 7 items (5 RISA + 2 WILD). Three are `safe`, well-scoped, and two of them close logged Deferred items from the 2026-06-03 new-feature audit. Four change plugin runtime behavior for all users or need a design decision, so they are gated, not executed in this pass.

| # | Item | Tag | This pass |
|---|---|---|---|
| 1 | goal-monitor row in Companion-skills enforcement table | caution | Gated — coupled to #2 (`feedback_grep_hook_before_claim`: no runtime-enforcement claim without a wired hook) |
| 2 | Auto-fire `/goal-check` at "phase boundaries" (hook) | needs-approval | Gated — "phase boundary" is not a native Claude Code hook event; design fork |
| 3 | Reject out-of-range `window` instead of defaulting to 30 | safe | **Execute** — closes logged Deferred (MED) |
| 4 | Unicode `\p{L}\p{N}` tokenizer in goal-state + recall | safe | **Execute** — closes logged Deferred (MED), pre-designed "both together" |
| 5 | Document "Goal-Driven Execution = Law 2 + spread 3/4/6" on discipline card | safe | **Execute** — doc |
| 6 | three-section-close refuses "Done" on DRIFT | needs-approval | Gated — depends on #2 state; changes Stop-hook behavior for all users |
| 7 | Auto-derive `## Goal Keywords` from PR title + changed paths | caution | Gated — new git-reading feature in goal-source path; own design |

## Items executed this pass

### Item 3 — reject out-of-range window

- WILL build: `scoreObservations` throws `RangeError` when `opts.window` is explicitly provided but not a positive integer; `undefined` still defaults to 30 (genuinely unset). The `ci_goal_check` MCP handler pre-validates `limit` and returns a clean `error()` before calling, mirroring the existing `since` validation in the recall handler.
- Will NOT build: threshold validation changes (already guarded; out of scope — drive-by), clamping behavior (user decided reject, not clamp).
- Verification: new unit tests in `goal-state.test.mts` (throws on 0 / -5 / 2.5 / NaN; defaults on undefined; honors a valid window) → `node --test test/goal-state.test.mjs` green; `npm run typecheck`.
- Fallback: revert if the existing `honors a custom window` test regresses.

### Item 4 — unicode-aware tokenizer

- WILL build: swap `split(/[^a-z0-9]+/)` → `split(/[^\p{L}\p{N}]+/u)` in `goal-state.mts:extractKeywordsFromProse` and `recall-index.mts:tokenize`.
- Will NOT build: changes to `KEYWORD_MIN_LENGTH` (4) — sub-4-char CJK keywords remain dropped in goal-state; that is a separate undecided knob, logged as a follow-up, not silently changed.
- Verification: new unit tests covering Latin-accented (`café`), Cyrillic (`вход`), and CJK (length ≥ tokenizer min) tokens → both test files green; `npm run typecheck`.
- Fallback: revert if any existing tokenize/extract test regresses.

### Item 5 — document goal-driven-execution mapping

- WILL build: add a short section to the discipline card mapping global principle #4 (Goal-Driven Execution) onto Law 2 + its spread across Laws 3/4/6, and naming the goal-monitor primitive.
- Will NOT build: any runtime-enforcement claim (would trip `verify:doc-runtime-claims` without a wired hook — see gated #1/#2).
- Verification: `npm run build` (mirror sync) + `npm run verify:all`.

## Will NOT repeat (P-MAG Rule 3)

`Will NOT repeat: the PR #66 / PR #151 pattern — every .mts edit gets npm run build immediately before git add <explicit files>; never hand-edit or stage a stale .mjs.`

## Gated batch (1, 2, 6, 7) — design fork carried to the Phase 7 close

The core unresolved decision: Claude Code has no native "phase boundary" hook event. Item 2 must pick a proxy trigger (Stop hook / throttled PostToolUse / checkpoint-driven) and decide whether goal-check state is persisted (which items 1 and 6 then depend on). Items 1, 6 cannot ship honestly until #2's mechanism exists. Item 7 is an independent feature with its own design (merge-vs-replace keywords, no-PR fallback). Presented to the operator for an A/B decision rather than guessed.
