# Routing-target gap audit — `proceed-with-the-recommendation`

**Date:** 2026-05-06
**Plugin version at audit:** `continuous-improvement@3.6.0`
**Source of truth:** `skills/proceed-with-the-recommendation.md` § "Routing Table (with Inline Fallbacks)" (lines 126–146)
**Scope:** every skill named in the orchestrator's routing table — what ships with `/plugin install continuous-improvement`, what does not, and whether the orchestrator already has an inline fallback that closes the gap.

This audit answers one question: **on a clean install of the CI plugin alone, which routing targets resolve to a real companion vs. fall through to the inline fallback?** It does not vendor, register, or change behavior. It is the input to R2 (README clarity), R4 (inline-fallback markers at point of use), and R3 (build invariant).

## Summary

| Bucket | Count | Notes |
|---|---|---|
| Routing-table rows | 17 | Every row in the orchestrator's routing table |
| Bundled with CI plugin (works on clean install) | 5 | `ralph`, `tdd-workflow`, `workspace-surface-audit`, `continuous-improvement` core, `proceed-with-the-recommendation` itself |
| External — not bundled with CI plugin | 12 routing targets across 6 source plugins | All have inline fallbacks declared in the orchestrator |
| Routing targets with **no** inline fallback | 0 | Every external row in the routing table is paired with a fallback |

Headline: **the orchestrator is already self-contained on a clean CI install** because every external routing target has a declared inline fallback. The risk is *quality of fallback*, not *absence of fallback*.

## Table

Sources are best-effort identifications based on the global available-skills inventory observed at audit time. Where the upstream license is not directly visible from this repo's `third-party/MANIFEST.md`, it is marked `Unverified` — verify before any R5 vendoring decision.

| # | Routing target | Source plugin | License | Bundled with CI plugin? | Inline fallback (per orchestrator §Routing Table) | Risk if external skill absent |
|---|---|---|---|---|---|---|
| 1 | `ralph` | `continuous-improvement` | MIT | **Yes** | Recurse this skill per sub-item | None |
| 2 | `superpowers:brainstorming` | `obra/superpowers` (Obra) | Unverified — MIT likely | No | Restate goal → list 3 design options → pick one → outline files → build | Lower-quality option discovery |
| 3 | `superpowers:writing-plans` | `obra/superpowers` (Obra) | Unverified — MIT likely | No | Inline plan: WILL build / Will NOT build / Verification / Fallback | None — inline mirrors the skill's contract |
| 4 | `superpowers:systematic-debugging` | `obra/superpowers` (Obra) | Unverified — MIT likely | No | Hypothesis → logs/tests → reproduce → smallest fix → verify with failing repro | Less-disciplined hypothesis loop |
| 5 | `superpowers:test-driven-development` | `obra/superpowers` (Obra) | Unverified — MIT likely | No (covered by `tdd-workflow`) | RED → GREEN → REFACTOR; one test, one behavior | None — `tdd-workflow` is the bundled CI equivalent |
| 6 | `tdd-workflow` | `continuous-improvement` | MIT | **Yes** | Same RED/GREEN/REFACTOR contract | None |
| 7 | `simplify` | `obra/superpowers` (Obra) | Unverified — MIT likely | No | Find dupes/unused exports, delete in place, re-run typecheck + smallest test | Manual dead-code sweep without a checklist |
| 8 | `security-review` | Claude Code built-in (Anthropic) `/security-review` | Anthropic — built into the host CLI, not a separate plugin | No (host-provided, not a CI dependency) | Scan for hardcoded secrets, unsanitized input, missing authz, SQL string concat, open CORS | None on hosts that ship the built-in; fallback covers the OWASP-lite checklist |
| 9 | `superpowers:requesting-code-review` | `obra/superpowers` (Obra) | Unverified — MIT likely | No | Read diff top-to-bottom; flag CRITICAL / HIGH / MEDIUM | Quality-of-review variance |
| 10 | `code-review` | `code-review` plugin (community) | Unverified | No | Same diff walk + severity tagging | Same as #9 |
| 11 | `superpowers:verification-before-completion` | `obra/superpowers` (Obra) | Unverified — MIT likely | No | Smallest check that proves correctness: typecheck + one test + one curl | None — fallback is the same contract |
| 12 | `superpowers:dispatching-parallel-agents` | `obra/superpowers` (Obra) | Unverified — MIT likely | No | Launch N parallel `Agent` tool calls in one message; reconcile after | None — direct tool capability |
| 13 | `superpowers:finishing-a-development-branch` | `obra/superpowers` (Obra) | Unverified — MIT likely | No | Verify clean tree → rebase on main → green CI → open PR with summary + test plan | Manual branch-finish without a checklist |
| 14 | `schedule` | `superpowers` ecosystem (Obra) or host scheduler | Unverified | No | Tell user the exact action + cadence; if no scheduler, write a dated TODO/memory entry | None on hosts without a scheduler — fallback is honest about absence |
| 15 | `loop` | `superpowers` ecosystem (Obra) | Unverified | No | Tell user the cadence + how to re-run manually | Same as #14 |
| 16 | `documentation-lookup` | `docs-lookup` agent OR `context7` MCP | Mixed — agent is local, context7 is third-party | No | `WebFetch` against the official docs URL, cite what changed | Fewer citations, slower lookups |
| 17 | `frontend-design:frontend-design` | `frontend-design` plugin | Unverified | No | Build smallest vertical slice first, verify in browser before styling | Less-distinctive UI on first pass |
| 18 | `update-config` | `superpowers` ecosystem (Obra) | Unverified | No | Edit `~/.claude/settings.json` with a minimal patch; restart session | Manual settings edit without templated diff |
| 19 | `commit-commands:commit` / `commit-commands:commit-push-pr` | `commit-commands` plugin | Unverified | No | `git add <specific files>` → commit with `type(scope): outcome` → push when asked | None — direct git capability |
| 20 | `workspace-surface-audit` | `continuous-improvement` | MIT | **Yes** | Skip pre-flight when not needed | None |
| 21 | `continuous-improvement` (core skill) | `continuous-improvement` | MIT | **Yes** | Run the 7-Laws Reflection block manually; append to `observations.jsonl` | None |

## Methodology

- **Routing-table rows enumerated by hand** from `skills/proceed-with-the-recommendation.md` lines 126–146. The summary count uses the table's logical rows (where one row may name two skill aliases, e.g. `commit-commands:commit` / `commit-commands:commit-push-pr` — counted as one routing target with two aliases).
- **"Bundled with CI plugin"** = an exact `plugins/continuous-improvement/skills/<name>/SKILL.md` file ships in the marketplace bundle, verified against the file tree.
- **License field** is "Unverified" wherever the upstream is not snapshotted in `third-party/` of this repo. `oh-my-claudecode` is MIT per `third-party/MANIFEST.md`, but the `obra/superpowers` family is not vendored here — its license must be checked at the upstream repo before any R5 vendoring.
- **"Risk if external skill absent"** is a qualitative read of how much the inline fallback gives up vs. the dedicated skill. "None" means the fallback fully restates the skill's runtime contract.

## What this audit does NOT claim

- It does NOT certify upstream licenses. Every "Unverified" row needs explicit license confirmation before R5 vendoring.
- It does NOT measure inline-fallback quality on real sessions — only that the fallback exists and is concretely worded.
- It does NOT recommend marketplace registration. Per `third-party/MANIFEST.md` line 28, vendored upstream plugins are read-only by current policy.

## Implications for the open recommendation list

- **R2 (README clarity):** can lift the "Bundled / External / Inline-fallback" columns directly from this table into a "Required vs Optional companions" README section.
- **R3 (build invariant):** the build script can read the routing table from `skills/proceed-with-the-recommendation.md` and assert each named target either exists in `plugins/continuous-improvement/skills/` OR appears in a future `optional-companions` manifest section. Source-of-truth file is fixed; the parser scope is small.
- **R4 (inline-fallback markers at point of use):** every external row in the routing table needs an explicit `Reference behavior — does not require <skill>` marker on its inline-fallback cell, so the soft-dependency contract is visible at the point the agent reads the table.
- **R5 (vendor `security-review` first):** **deferred and revisited.** This audit shows `security-review` is a Claude Code host built-in, not a separate plugin needing vendoring. The smallest-blast-radius first vendor candidate should instead be selected from the `obra/superpowers` sub-skills with the highest production usage AND no inline-fallback parity (rows #2, #4, #7, #9, #13). None currently meet the bar — every fallback above is concretely worded.
- **W1 / W2 (mega-bundle / re-implement):** still held. This audit gives no evidence that any inline fallback is a real session blocker. Without that evidence, both W1 and W2 are scope without justification.
