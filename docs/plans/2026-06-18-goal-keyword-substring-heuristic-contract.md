# 2026-06-18 — goal keyword substring heuristic contract

- Status: contract note / behavior unchanged
- Scope: docs-only policy clarification; no runtime behavior change in this run

## Goal

Pin the remaining low-risk `goal-state` deferral: keyword matching currently uses
substring search, so a keyword such as `test` can match text such as `latest`.
This note records why that behavior is intentional today, how operators should
avoid surprising false positives, and what would justify changing it later.

## Grounded findings

Research for this note inspected `src/lib/goal-state.mts`,
`src/test/goal-state.test.mts`, `CLAUDE.md`,
`docs/audits/2026-06-03-new-feature-audit.md`, and the current
`docs/ai-improvement/README.md` backlog.

Current behavior:

- `scoreObservations()` builds a lowercase haystack from `tool`,
  `input_summary`, and `output_summary`.
- A keyword hit is `keywords.some((kw) => haystack.includes(kw))`.
- A path hit is separate and uses `## Goal Scope` globs via `pathMatchesGlob()`.
- Auto-extracted prose keywords have guardrails: stopwords, pure numerals, a
  global 4-character floor, Unicode-aware tokenization, and a Hangul-specific
  2-character floor.
- Explicit `## Goal Keywords` entries are accepted as written after trimming and
  lowercasing. That keeps user intent simple, but it also means a deliberately
  short explicit keyword such as `test` can produce broad substring matches.
- `CLAUDE.md` already labels the behavior as an intentional fuzzy heuristic, not
  a live correctness defect.

## Contract

Keep substring keyword matching for now.

Rationale:

1. The goal-drift gate is a steering signal, not a semantic proof engine. Its
   default mode is `warn`, and even `block` asks the agent to realign rather than
   silently modifying work.
2. Fuzzy substring matching catches useful real-world traces: file paths,
   command flags, generated summaries, and compound identifiers often contain
   the goal word without clean word boundaries.
3. The known false-positive class is low severity and operator-controllable:
   choose more specific explicit keywords, rely on auto-extraction for normal
   prose, or add `## Goal Scope` path globs and `forbidden:` globs when path
   boundaries matter.
4. Replacing substring search with token/word-boundary matching could regress
   common path and identifier matches unless it is designed and tested as a
   behavior change.

## Operator guidance

When writing `task_plan.md` for goal monitoring:

- Prefer specific keywords such as `auth-login`, `jwt session`, `skill-distill`,
  or `goal-state` over broad short words such as `test`, `run`, or `fix`.
- Use `## Goal Scope` `paths:` entries for file-boundary confidence instead of
  relying only on keywords.
- Use `forbidden:` globs for known off-scope areas; forbidden paths still force
  drift even when a keyword matches.
- If an explicit keyword creates surprising matches, change the plan keyword
  first before changing runtime code.

## Non-goals

- Do not change `scoreObservations()` in this docs-only run.
- Do not change hook fail-open/fail-closed behavior.
- Do not change thresholds, windows, or keyword extraction length floors.
- Do not add a new dependency for tokenization.
- Do not claim substring matching is precise semantic relevance.

## Future change trigger

Consider a focused implementation only if real user sessions show that substring
false positives materially hide drift and cannot be handled with clearer
keywords or path scope. If that happens, write RED tests first for:

- the known false positive (`test` inside `latest`);
- path/identifier positives that must remain matched;
- explicit multi-word keywords;
- Unicode tokens already covered by the existing tokenizer tests;
- forbidden-path precedence over keyword hits.

Any behavior change should run `npm run build`, the generated
`test/goal-state.test.mjs` suite, `npm run verify:generated`, and
`npm run verify:all`.
