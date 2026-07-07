# Query-cost nudge (RISA 5 / G5)

Date: 2026-07-08
Branch: `feat/query-cost-nudge` (off `main` @ 7dacc0c, after v3.19.0)
Driver: `/insights` survey gap G5 (PARTIAL). The `database-reviewer` agent already carries a full query-cost checklist, but nothing dispatches it when a DB/query file is edited, and nothing is D1-aware (rows_read billing, EXPLAIN QUERY PLAN). The insights flagged surprise D1 bills (a $300/mo runaway) as its own project area.

## Goal

When the working tree has changed DB/query files at turn end, nudge the agent (once per session, opt-in) to run a D1-aware query-cost audit before finishing — so cost regressions get caught before they ship, not after the bill.

## Goal Keywords

query cost, D1, rows_read, EXPLAIN QUERY PLAN, index, N+1, uncached, migration, schema, database-reviewer, CLAUDE_QUERY_COST_NUDGE

## Design decision: Stop hook, not PostToolUse (divergence from the survey)

The survey proposed a **PostToolUse** advisory hook. Law 1 research killed that surface: the Claude Code changelog documents `hookSpecificOutput.additionalContext` support for **PreToolUse, UserPromptSubmit, Stop, and SubagentStop — but NOT PostToolUse** (changelog lines 3282 / 4219 / 460). A PostToolUse nudge could only emit a user-facing `systemMessage` that never reaches model context — the exact advisory-only limitation RISA 4 was built to fix.

So RISA 5 is a **Stop hook** mirroring `typecheck-stop` (RISA 4): at turn end it checks the working tree for changed DB/query files and, opted in, injects a once-per-session cost-audit reminder via `additionalContext` (which Stop supports and which "keeps the turn going" per changelog line 460). This is the plan-doc-matches-impl divergence surfaced up front.

**WILL build:**
- `src/lib/query-cost-gate.mts` — pure: `resolveQueryCostNudge(env)` (`on`|`off`, default off), `isQueryPath(path)` (`.sql`, `.prisma`, `migrations/`, `/db/`, `schema.*`, `drizzle`), `changedQueryPaths(files)`, `buildQueryCostReminder(paths)` (the D1-aware checklist + dispatch `database-reviewer`).
- `src/hooks/query-cost-nudge.mts` — Stop hook: mode off → no-op; resolve git root; `git diff` (+`--cached`) changed files; filter query paths; if any AND not already nudged this session → emit `{hookSpecificOutput:{hookEventName:"Stop", additionalContext:<reminder>}}` and write a per-session marker. Fail-open.
- Wire into `src/lib/plugin-metadata.mts` Stop array + description prose; add `query-cost-gate.mjs` to the bundle copy list in `generate-plugin-manifests.mts` (the RISA 4 gotcha — a new hook's lib import must be bundled or the hook breaks at runtime and verify:all won't catch it).

**Env var:** `CLAUDE_QUERY_COST_NUDGE=on` (default off). Once-per-session dedup keyed on the Stop stdin `session_id` prevents a per-turn nudge loop (additionalContext keeps the turn going, so undeduped it would re-fire every turn while DB files stay dirty).

**Will NOT build:**
- A default-on nudge (opt-in, consistent with `CLAUDE_WORKFLOW_DISTILL_NUDGE` / `CLAUDE_RECALL_BRIEFING` / the RISA 4 default-off family). Zero regression when unset.
- The route-table.json prompt-side row or an instinct-pack entry (the survey's weaker secondary surfaces) — one concern is the Stop hook.
- A blocking gate — this is a reminder (additionalContext), never `{"decision":"block"}`.

## Verification

- `src/test/query-cost-gate.test.mts` — pure: mode default/parse, `isQueryPath` matrix (.sql/.prisma/migrations//db//schema/drizzle vs non-DB), reminder content (names database-reviewer + rows_read/EXPLAIN QUERY PLAN).
- `src/test/query-cost-nudge-hook.test.mts` — integration: temp git repo + changed `.sql`/migration file, `on` → additionalContext reminder; second Stop same session → silent (dedup); no DB file changed → silent; mode off → silent.
- `npm run verify:all` green; new `.mjs` (hook + lib + mirrors) staged with `git update-index --chmod=+x`.

## Will NOT repeat (P-MAG)

`Will NOT repeat:` shipping a new hook whose lib import is missing from the plugin bundle copy list (hit live in RISA 4 / #272) — add `query-cost-gate.mjs` to `generate-plugin-manifests.mts` and smoke-test the bundled hook import before commit. New `.mjs` staged with +x (PR #183 class). Rebuild before every stage; stage by filename.
