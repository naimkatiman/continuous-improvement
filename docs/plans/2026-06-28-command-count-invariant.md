# Plan: `check-command-count` verify invariant

Date: 2026-06-28
Branch: `feat/check-command-count-invariant`

## Problem

The README "Slash commands" section is hand-maintained: a fenced list of `/command  description` lines plus "All N commands" / "All N ship" count claims. The skill count is guarded (`check-skill-count`, `check-skill-count-prose`) but the **command count is not**. It silently drifted to "18" while 28 commands shipped; PR #263 reconciled it by hand. Without an invariant it will drift again on the next command added.

## Goal

Add `verify:command-count` to `verify:all` so the README can never under- or over-state the shipped slash-command set again.

## Source of truth

`commands/*.md` (flat source, excluding `README.md`) — the set a contributor edits when adding a command, mirrored into the bundle by `npm run build` and already parity-checked by `verify:everything-mirror`.

## What the check asserts

Against the README "## Slash commands" section:

1. **Set parity** — the `/command` lines in the fenced block equal the `commands/*.md` set. Reports `missing` (shipped but not listed) and `extra` (listed but not shipped).
2. **Count claims** — every `All N commands` / `All N ship` number in the section equals the actual command count.

Fail-closed on malformed input: no `## Slash commands` section, no listed commands, or no count claim each produce a violation rather than a silent pass (per the 2026-06-03 boundary-test lesson).

## Shape (mirrors `check-skill-count.mts`)

- `listCommandFiles(repoRoot): string[]` — sorted command names from `commands/`.
- `parseReadmeSlashCommands(content): { hasSection, listed, counts }` — pure, unit-testable without the filesystem.
- `findViolations(actualNames, parsed): string[]` — empty array = pass.
- `main()` — `OK command-count: ...` / `FAIL command-count: ...`, exit 0/1. Windows-safe `endsWith(".mjs")` main-guard.

## Files

- `src/bin/check-command-count.mts` (source) → `bin/check-command-count.mjs` (generated, +x)
- `src/test/check-command-count.test.mts` (source) → `test/check-command-count.test.mjs` (generated)
- `package.json` — `verify:command-count` script + insert into `verify:all` chain
- `CLAUDE.md` — invariant list 13 → 14 content invariants

## Verification

- TDD: edge-case tests RED first, then implement to GREEN.
- `npm run build` + `git diff --exit-code` clean (generated pair committed).
- `npm run verify:all` green with the new check in the chain.
- `npm test` full suite green.

## Out of scope

`docs/ai-improvement/README.md` repo-map counts (carry other stale snapshots on a separate axis — version, entrypoint/test counts). Not coupled to this invariant.
