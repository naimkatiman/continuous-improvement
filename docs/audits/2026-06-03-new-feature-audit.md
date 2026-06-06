# Adversarial audit — new Law-7 features (2026-06-03)

Adversarial self-review of the audit-fix pass that landed three new features on
the PR #154 branch (`claude/magical-cray-MO2SY`): **goal-monitor** (`goal-state`),
**recall** (`recall-index`), and **skill-distillation** (`skill-distill`), plus
their MCP tool wiring and the manifest generator.

- Audited commit: `81f5672` (Merge origin/main into the feature branch).
- Review branch: `audit/magical-cray-review` (isolated worktree; the shared tree
  is owned by a concurrent live session and was left untouched).
- Method: cold gate baseline, then a 21-agent fan-out (one reviewer per target,
  each finding independently verified by a skeptic before action), then RED→GREEN
  patches for the clear defects.

## Cold-gate delta

| Gate | At `81f5672` | After fixes |
|---|---|---|
| `verify:generated` | pass | pass |
| `verify:all` (12 checks) | pass | pass |
| `npm test` | **714/715** (1 fail) | **725/725** |

The single baseline failure was `test/hook.test.mjs` "completes within 2000ms"
(2.5–4.2s across isolated reruns). It is an **environmental wall-clock flake** on
a saturated Windows host — `observe.sh` logic is unchanged in the merge, the
3 new features do not touch it, and it passed clean once the host quieted
(725/725). It is **not** a branch regression and the 2000ms budget was left
intact (inflating it would mask real CI perf regressions; CI-Linux runs <300ms).

## Findings: 14 confirmed, 2 refuted

Refuted by the verifiers (not real): the `serializeDraft` YAML-escaping claim and
the `copyDirectory` symlink-skip claim.

### Fixed (RED→GREEN, regression test each)

| # | Sev | Area | Defect | Fix |
|---|---|---|---|---|
| 1 | HIGH | goal-state | An empty/malformed `## Goal Keywords` section parsed to `[]` and was used verbatim, so the scorer ran with zero keywords and reported on-goal work as DRIFT. | Treat an empty parsed list like an absent section → prose fallback. |
| 5 | HIGH | recall-index | `query()` `since` filter short-circuited on empty `ts` and only dropped numeric-parseable timestamps, so undated/garbage-dated rows leaked through a time-bounded recall. | Fail closed: exclude rows of unknown age while `since` is active. |
| 7 | HIGH | skill-distill / mcp | Candidate id built from raw tool names flowed into a draft `.yaml` path; the promote handler joined a caller-supplied id unchecked (arbitrary read + `rmSync` delete primitive). | Slugify the id to `[a-z0-9-]` at the source; reject a non-`draft-<slug>` id in propose/promote before any path use. |
| 12 | MED | mcp | `ci_recall` silently dropped an unparseable `since` and returned the full unfiltered history. | Reject an unparseable `since` with an error envelope (fail fast, mirrors `ci_import`). |

Coverage closed alongside #7/#12: handler-level tests now exercise all five new
expert tools (`ci_recall`, `ci_distill_candidates/propose/promote`,
`ci_goal_check`) — partially closing coverage-gap #11.

### Deferred (logged in CLAUDE.md → Deferred)

Each is a design choice, a latent gap with no live bug, or a change broader than a
surgical fix — left to the PR #154 owner.

| # | Sev | Area | Why deferred |
|---|---|---|---|
| 2 | LOW | goal-state | NaN threshold passes the `typeof` guard; unreachable from `ci_goal_check`. Use `Number.isFinite`. **CLOSED `4ef2e83`.** |
| 3 | MED | goal-state | `window:0`/negative collapses to default 30. Defensible as invalid→default; decide clamp vs reject. **CLOSED `6207648`.** |
| 4 | LOW | goal-state | `.includes` keyword match hits `test` inside `latest`. Intentional fuzzy heuristic. |
| 6 | MED | recall-index | `tokenize` is ASCII-only (drops CJK/Cyrillic/accents). Broad i18n change; same pattern in goal-state. **CLOSED `d2001ac`.** |
| 8 | MED | skill-distill | NaN timestamps suppress the time-gap trajectory split. Degrades draft mining only. **CLOSED in working tree.** |
| 9 | MED | skill-distill | Empty verify output counts as success. NOT a clean fix — silent-success commands (`tsc --noEmit`) legitimately emit nothing; needs a data-model decision. |
| 10 | LOW | skill-distill | `occurrences` counts overlapping windows, not distinct runs; `minSessions` is the real guard. Add a contract-pinning test. **CLOSED `c19e9f3`.** |
| 13 | LOW | mcp | `getRecentObservations(_, 0)` does `slice(-0)` = full read; output stays bounded downstream. Clamp `limit<=0`. **CLOSED `08cdbae`.** |
| 14 | MED | manifest-gen | Skill-discovery glob is stricter than every guardrail, so a future non-compliant skill name would vanish from the bundle with `verify:all` still green. No live bug (3 new skills are compliant). **CLOSED `2fde059`.** |

## Lesson

Green gates (`verify:all` + a 715-test suite) did not prove boundary safety: all
three HIGH defects were input-validation / fail-open gaps on empty, malformed, or
undated input. New parser/scorer/index code needs explicit edge-case tests and
must fail closed on time and identity boundaries.

## Update — post-`/proceed` (2026-06-03)

- **#2 (NaN threshold) closed** (commit `4ef2e83`): `scoreObservations` now guards the
  threshold with `Number.isFinite`, with a regression test. Moves from Deferred to Fixed.
- **#10 (overlapping n-gram count) closed** (commit `c19e9f3`): regression test added in
  `src/test/skill-distill.test.mts` proves that `occurrences` counts every matching window,
  not distinct runs; `minSessions` remains the guard against single-session false positives.
  Moves from Deferred to Fixed.

### Second `/proceed` pass on branch `fix/goal-monitor-boundary-edges` (2026-06-03)

- **#3 (window:0/negative) closed** (commit `6207648`): `scoreObservations` now throws
  `RangeError` on a non-positive-integer window (reject chosen over clamp); the
  `ci_goal_check` handler pre-validates `limit` and returns a clean `error()`. Regression
  tests cover 0/-5/2.5/NaN/±Infinity.
- **#6 (tokenize ASCII-only) closed** (commit `d2001ac`): both `goal-state` and
  `recall-index` now split on `/[^\p{L}\p{N}]+/u`; the goal-state pure-digit filter was
  hardened to `/^\p{N}+$/u` in `0161b80` to match. Regression tests cover accented Latin,
  Cyrillic, and CJK.
- **#13 (limit:0) closed** (commits `08cdbae` + `6207648`): the earlier blocker is
  sidestepped — rather than import the internal fn, the clamp lives inside
  `getRecentObservations` itself (covers `ci_observations` and every caller), and an
  integration test (`cc265e8`) drives the **spawned** server through `tools/call` with
  `limit` 0/-5/2.5 and asserts `isError`. No entry-point refactor needed.
### Third pass — hourly improvement loop (2026-06-06)

- **#8 (NaN-ts gap split) closed** (working tree): `extractTrajectories` in
  `src/lib/skill-distill.mts` now splits on any valid→invalid or invalid→valid
  timestamp transition, preventing unrelated observation runs from merging when a
  malformed timestamp blocks gap detection. Consecutive invalid timestamps are kept
  together so a single bad block does not shatter into unusable 1-observation
  fragments. Two regression tests in `src/test/skill-distill.test.mts` pin the
  boundary behavior.

- The remaining two PR-#154 deferrals (#4, #9) are unchanged. Two new
  follow-ups surfaced by the completeness sweep (`KEYWORD_MIN_LENGTH=4` drops short-word
  scripts; Thai combining-mark fragmentation in recall) are logged in CLAUDE.md → Deferred.
