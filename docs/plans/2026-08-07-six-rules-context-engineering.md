# Six Rules of Context Engineering — retire `safety-guard`, route `CLAUDE.md`, thin the tool surface

Date: 2026-08-07
Slug: six-rules-context-engineering
Branch: `chore/six-rules-context-engineering` off `origin/main` @ `188d1e4` (v3.22.1)

## Task (one sentence)

Apply the six context-engineering rules to this repo by retiring the prose-only `safety-guard` skill into the runtime gate that already covers it, converting `CLAUDE.md` into a router, thinning the two overweight MCP tool descriptions, and replacing the flat skill table with a structured HTML reference that makes each skill's real enforcement surface visible.

## Why

Two independent sources agree that this repo over-constrains the model with rules it no longer needs.

**Source 1 — operator usage report** (`~/.claude/usage-data/report-2026-08-07-231106.html`, 485 messages across 151 sessions, 2026-06-23 → 2026-08-07). Its "Primary Friction Types" are almost entirely guard friction, not model error:

| Friction type | Count |
|---|---|
| Permission Denied | 19 |
| Tool Permission Blocked | 17 |
| Tool Permission Blocks | 15 |
| Permission Blocked | 10 |
| Tool Limitation | 8 |
| Tool Blocked By Guard | 7 |

The report's own words: *"Your gateguard/safety-guard hooks are currently costing you a retry on almost every write"* and *"gateguard intercepted the initial Write in 10+ sessions."* The operator's summary was blunter: **"we use too much safety-guard skill."**

**Source 2 — this repo's own `model-forward` skill.** [`skills/model-forward.md:28`](../../skills/model-forward.md) already states the rule being applied here:

> | A native Claude Code feature now covers what a custom skill or hook does | Prefer the native path; propose retiring the scaffold instead of maintaining a parallel one |

and line 31:

> | A guardrail keeps firing on behavior the model no longer exhibits | Propose loosening or retiring it — stacking stale guardrails is also drift |

Line 34 requires that retirement be an operator decision, never a silent one. **Operator approved retirement on 2026-08-07** (this session), which supersedes the "keep pending a separate decision" holds in [`docs/plans/2026-06-18-model-forward-retirement-candidates.md:39`](2026-06-18-model-forward-retirement-candidates.md) and [`docs/audits/2026-06-10-model-forward-audit.md:40`](../audits/2026-06-10-model-forward-audit.md).

## The `safety-guard` case specifically

`skills/safety-guard.md` on `main` is 78 lines of prose that ships **no hook, no command, no test, and no logger**, while claiming all three:

| Claim in the file | Reality |
|---|---|
| frontmatter: *"blocking destructive shell commands"* | No hook exists. Nothing blocks. |
| line 24: *"Intercepts destructive commands before execution"* | No interception exists. |
| lines 48/58/66: `/safety-guard freeze`, `/safety-guard guard`, `/safety-guard off` | No such command. `commands/safety-guard.md` does not exist. |
| line 77: *"Logs all blocked actions to `~/.claude/safety-guard.log`"* | No writer ships. The path is never created. |
| line 71: *"There is no bundled tool-call gate today"* | Correct — and contradicts the four rows above it in the same file. |

Meanwhile [`hooks/gateguard.mjs`](../../hooks/gateguard.mjs) **actually does** the job: a wired PreToolUse hook that returns `{decision: "block"}` on Write/Edit/MultiEdit and on every destructive Bash pattern, with per-session state and a 50-file cap. Its destructive-pattern set is a superset of safety-guard's watched list.

So the skill is not merely redundant — it is a false runtime claim sitting next to a real one. [`skills/gateguard.md:191`](../../skills/gateguard.md) compounds it by asserting `safety-guard` provides *"Runtime safety checks (complementary, not overlapping)"*, which is wrong on both counts.

The one genuinely non-duplicated idea is **Freeze Mode** — declaring a write scope up front. That idea survives; it moves into `gateguard` as a short section. Everything else is deleted.

## Rule-by-rule mapping

| # | Rule | Concrete change here |
|---|---|---|
| 1 | Judgment over Rules | Delete `skills/safety-guard.md`. Fold declared-write-scope into `gateguard`. Stop shipping honor-system prose that duplicates a real gate. |
| 2 | Design interfaces over examples | Replace the flat 28-row markdown skill table as the primary catalog with a structured HTML reference organised by tier × law × **enforcement surface**. |
| 3 | Progressive disclosure | `CLAUDE.md` 101 → ~70 lines: `## Past Mistakes` (13 lines) and `## Deferred` (20 lines) move to `docs/past-mistakes.md` and `docs/deferred.md`; `CLAUDE.md` keeps one router line each. |
| 4 | Simpler tool descriptions | Trim `ci_distill_from_workflow` (475 chars) and `ci_gateguard_clear` (409 chars). Both restate instructions the block reason and skill file already carry. 19 tools currently total 2,979 chars, avg 157. |
| 5 | Automatic memory | The `Past Mistakes` router line points at the `recall` skill + observation log as the *first* lookup, with the curated doc as the durable ledger — not a hand-maintained substitute for it. |
| 6 | Richer references | `docs/skill-catalog.html` — a self-contained, theme-aware HTML reference. Its explicit **Enforcement** column (hook / command / prose-only) is what structurally prevents another `safety-guard`: a prose-only skill can no longer render as a runtime gate. |

## Invariants that constrain this change (all currently green)

Baseline on `188d1e4`: `npm run verify:all` passes all 16 invariants + typecheck.

Removing one tier-2 skill moves **two derived counts** that CI pins:

1. `check-skill-count.mjs` — counts directories under `plugins/continuous-improvement/skills/`. **28 → 27.** The literal `N bundled skills` must change in `.claude-plugin/marketplace.json`, `plugins/continuous-improvement/.claude-plugin/plugin.json`, `package.json`, `llms.txt`, `.cloudplugin/marketplace.json`, plus the split stat block in `docs/landing/index.html`.
2. `check-skill-count-prose.mjs` — derives the breakdown from `skills/*.md` frontmatter. **`1 core + 1 featured + 6 tier-1 + 17 tier-2 + 3 always-bundled` = 28 skills → `… 16 tier-2 …` = 27 skills**, and next-ordinal `29th → 28th`. Surfaces: `README.md`, `docs/skills.md`, `docs/skill-use-cases.md`, `CONTRIBUTING.md`.

Also relevant:
- `check-doc-runtime-claims.mjs` — any line saying "physically block" / "PreToolUse hook" / "runtime gate" needs a `hooks/<name>.mjs` reference within ±5 lines. The `gateguard` write-scope section must respect this.
- `check-skill-mirror.mjs` + `verify:generated` — `plugins/continuous-improvement/skills/safety-guard/` must be removed by `npm run build`, not by hand.
- `check-docs-substrings.mjs` — verified: **no `safety-guard` pins**. No test-substring risk.
- `src/test/skill-tiers.test.mts:169` and `test/skill-tiers.test.mjs:130` use `safety-guard` as a *fixture name* only. Rename the fixture; do not delete the assertion.

## Commit plan (one concern each)

1. **This plan doc.** 1 file.
2. **Retire `safety-guard`.** Delete the source skill; fold declared-write-scope into `gateguard`; correct the false `gateguard:191` cross-reference; update every prose reference and both derived counts; rename the test fixture; `npm run build` to regenerate mirrors and manifests. *Exceeds the 15-file guideline and is deliberately not split: the two count invariants and the mirror check fail on any partial application, so a split leaves CI red on the intermediate commit. Source-file edits are ~18; the remainder is generated output, which the guideline exempts.*
3. **`CLAUDE.md` progressive disclosure.** `CLAUDE.md` + `docs/past-mistakes.md` + `docs/deferred.md`. 3 files.
4. **Thin the two MCP tool descriptions.** `src/lib/plugin-metadata.mts` + regenerated output.
5. **`docs/skill-catalog.html` richer reference** + the pointer to it from `docs/skills.md`.

## Verification

- After **every** commit: `npm run verify:all` (16 invariants + typecheck), from the worktree root.
- After commits 2 and 4 (which touch `.mts`): `npm run build` **immediately before** `git add`, per the 2026-05-17 Past Mistake — build and stage are one atomic step.
- After commit 2: `npm test` full suite, and `git grep -n "safety-guard" -- . ':!third-party'` must return only intentional historical references (plan docs, audit docs, implementation log, CHANGELOG).
- Before push: confirm branch and HEAD have not moved (concurrent-writer discipline — a parallel session is live on `loop/weekly-2026-08-07` in the primary checkout).

## Anti-scope

- Do **not** touch the primary checkout `C:\Ai\continuous-improvement` — it is dirty with 5,940 uncommitted insertions belonging to a parallel session on a branch 48 commits behind `main`.
- Do **not** retire `token-budget-advisor`, `strategic-compact`, or `handoff` in this branch. They are separate operator decisions tracked in the 2026-06-18 note; this change closes only the `safety-guard` row.
- Do **not** weaken `gateguard`'s runtime behaviour. The report's friction is real, but loosening a hook that measurably improves output quality (+2.25) is a distinct, evidence-gated decision — not a side effect of a docs pass.
- Do **not** rewrite history or force-push. Supersede via a new branch if the rebase diverges.
