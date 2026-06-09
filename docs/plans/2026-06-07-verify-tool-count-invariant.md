# Plan: `verify:tool-count` invariant

Date: 2026-06-07
Status: complete (verified 2026-06-09)

## Goal

Pin MCP tool-count claims in docs and source to the generated manifests so they
cannot silently drift when a tool is added. This closes the exact gap the
2026-06-07 post-merge audit (PR #203) found: `docs/skills.md` said "12 tools"
and `src/bin/mcp-server.mts` said "beginner (3 tools)" while the catalog had
grown to 18 expert / 4 beginner — and `verify:all` stayed green because no
invariant covered those strings.

## Source of truth

- `plugins/expert.json` → `tools[].length` (expert mode = all tools)
- `plugins/beginner.json` → `tools[].length` (beginner mode)

Both are generated from `src/lib/plugin-metadata.mts` by `npm run build` and are
already pinned against drift by `verify:generated`, so they are the honest count.
The installer message was made self-deriving in PR #203 (820a34e); this invariant
covers the remaining *static* claims that can't derive at runtime.

## Design

`bin/check-tool-count.mjs` (from `src/bin/check-tool-count.mts`) holds an
`ASSERTIONS` table. Each entry is `{ file, pattern (one capture group), mode }`.
For each, the captured integer must equal the manifest count for that mode.
Precise per-claim regexes mean no false positives on historical CHANGELOG or
vendored third-party "N tools" strings.

Initial assertions:

| file | pattern | mode |
|---|---|---|
| `docs/skills.md` | `/MCP server \((\d+) tools\)/` | expert |
| `src/bin/mcp-server.mts` | `/beginner \((\d+) tools\)/` | beginner |

## Changes

- New `src/bin/check-tool-count.mts` (+ generated `bin/check-tool-count.mjs`)
- New `src/test/check-tool-count.test.mts` (+ generated mirror)
- `package.json`: `verify:tool-count` script + add it to the `verify:all` chain
- Fix `src/bin/mcp-server.mts` header "beginner (3 tools)" → "(4 tools)"
- Bump live "11 → 12 content invariants": `CLAUDE.md`, `docs/RELEASING.md`
  (historical report/plan entries are point-in-time and left unchanged)

## Verification

- Checker FAILS on a synthetic drifted repo, PASSES on the live repo (TDD: the
  drift case is the meaningful RED).
- `npm run verify:all` green (now 12 invariants + typecheck), `verify:generated`
  clean, `npm test` green.

## Out of scope (logged)

- A future invariant that pins the "N content invariants" prose itself to the
  count of `verify:*` scripts in `package.json`, so the 11→12→… cascade can't
  drift either.
