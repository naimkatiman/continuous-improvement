# Daily Improvement Report — 2026-04-13

Fixed 13 test failures caused by Windows platform incompatibilities in test infrastructure.

## 2026-05-23 — Trailing newline hygiene
- Added missing trailing newlines to `.vscode/extensions.json` and `src/test/wild-risa-spec.test.mts` (the compiled `test/wild-risa-spec.test.mjs` already had one).
- Verified with `npm run verify:all` and `npm test`; full repo gate stayed green (660 pass / 0 fail).

## 2026-05-23 — Executable-bit fix for shell scripts with shebangs
- Added missing `+x` permissions to 5 first-party shell scripts that carry `#!/usr/bin/env bash` shebangs but were not executable: `bin/pre-commit-block-strays.sh`, `scripts/detect-deploy-target.sh`, `scripts/get-deployed-sha.sh`, `scripts/git-state-snapshot.sh`, and `synthetic-checks/example-version-endpoint.synthetic.sh`.
- Verified with `node --test test/git-state-snapshot.test.mjs test/detect-deploy-target.test.mjs test/get-deployed-sha.test.mjs` (19 pass / 0 fail) and `npm run verify:all`; full repo gate stayed green.

## 2026-05-21 – 2026-05-22 — Consolidated hourly verification passes
- 24 consecutive hourly loops ran `npm run verify:all` from 2026-05-21T05:01:17Z through 2026-05-22T06:04:36Z.
- The full repo gate stayed green on every pass: 20 skill mirrors, 176 docs substring assertions, 43 mirrored files, 37 routing targets, 21 doc runtime claims, 50 test files, and 8 script citations, plus typecheck.
- No code changes were needed across this window; the repo remained clean after the prior MCP temp-home flake fix.

## 2026-05-21 — Hourly MCP test flake fix
- Replaced `Date.now()`-based temp-home names in `src/test/mcp-server.test.mts` with `mkdtempSync()` so the wire-format, beginner, and expert MCP suites get isolated homes even when test blocks overlap.
- Verified the repo with `npm run build`, `npm run verify:all`, and `node --test test/mcp-server.test.mjs`; all checks passed, including the targeted 23-test MCP suite.

## 2026-05-20 — Repo hygiene verification
- Confirmed `.gitattributes` already enforces LF line endings, so the prior CRLF follow-up note was unnecessary.
- Re-ran `npm run typecheck`; it passed cleanly on the current tree.
- Resolved the verification ladder with `node scripts/resolve-verify-ladder.mjs`; build, typecheck, lint, and test all map to the repo’s `package.json` scripts, while security / deploy receipt / synthetic checks remain operator-gated.
- Verified the full repo gate with `npm run verify:all` at 2026-05-20T06:04:31Z; all 20 skill mirrors, 176 docs substring assertions, 43 mirrored files, 37 routing targets, 21 doc runtime claims, 50 test files, and 8 script citations passed, plus typecheck.
- Re-verified the full repo gate at 2026-05-20T08:09:16Z after this follow-up check; still all green.
- Re-ran `npm run verify:all` at 2026-05-20T10:20:43Z during the current hourly loop; the full gate remained green.
- Re-ran `npm run verify:all` again at 2026-05-20T12:05:02Z; the full repo gate stayed green with the same 20 skill mirrors, 176 docs substring assertions, 43 mirrored files, 37 routing targets, 21 doc runtime claims, 50 test files, and 8 script citations passing plus typecheck.
- Re-ran `npm run typecheck` at 2026-05-20T14:11:24Z after the latest report update; it passed cleanly.
- Re-ran `npm run typecheck` again at 2026-05-20T15:04:55Z during the current hourly loop; it passed cleanly.
- Ran `git diff --check` at 2026-05-20T14:11:24Z; no whitespace or patch-format issues were reported.
- Clarified this report’s stale `observe.sh` 200ms note so it points at the current hook-test budget and remaining-failure set.
- No code changes were needed for this cycle — the repo state is green on the full verification ladder.

## 2026-05-19 — Installer cleanup persistence verification
- Re-ran `npm run build` after the installer cleanup coexistence fix to regenerate `bin/install.mjs` and the mirrored test output.
- Verified the full installer suite with `node --test test/install.test.mjs`; all 29 tests passed, including the coexistence regression, Windows-style path normalization, and mixed-entry preservation cases.
- Confirmed the repo-wide gate with `npm run verify:all`; all checks passed, including `verify:skill-mirror`, `verify:everything-mirror`, `verify:routing-targets`, and `typecheck`.
- No new code changes were needed today; this cycle just confirmed the existing installer fix is green on the current working tree.

## 2026-05-18 — Installer cleanup persistence coexistence fix
- Fixed `src/bin/install.mts` so cleanup-only hook filtering is persisted even when a clean installer hook already exists alongside a broken legacy `observe.sh` entry in the same hook type.
- Added regression coverage in `src/test/install.test.mts` for the coexistence case, proving the broken legacy hook is removed while the clean hook remains exactly once.
- Also changed the observe/session hook entries to be constructed per target bucket instead of reusing one object across paired hook types, so future mutations can't leak between `PreToolUse`/`PostToolUse` or `SessionStart`/`SessionEnd`.
- Verified with `npm run build`, `node --test test/install.test.mjs`, and `npm run verify:all` (`29 pass / 0 fail` in the targeted installer suite).

## 2026-05-17 — GateGuard MultiEdit parity
- Tightened `src/hooks/gateguard.mts` so `MultiEdit` batches are evaluated and cleared per edited file, with mixed-clearance batches naming the whole file set in the denial reason.
- Added regression coverage in `src/test/gateguard-hook.test.mts` for mixed-clearance `MultiEdit` batches and cap enforcement.
- Verified with `npm run build`, `npm run verify:all`, and `node --test test/gateguard-hook.test.mjs`.

## 2026-05-16 — GateGuard empty-path fallback
- Improved `src/hooks/gateguard.mts` so blank `file_path` values render `<unknown>` instead of an empty slot in block reasons.
- Added a regression test in `src/test/gateguard-hook.test.mts` for `Write` with `file_path: ""`.
- Verified with `npm run build`, `npm run verify:all`, and `node --test test/gateguard-hook.test.mjs`.

## Project Snapshot

| Field | Value |
|-------|-------|
| Project | continuous-improvement v3.1.0 |
| Stack | Node.js (ESM), MCP server, GitHub Action, CLI tools |
| Stage | Published npm package, active development |
| Tests Before | 84 pass / 20 fail (104 total) |
| Tests After | 97 pass / 7 fail (104 total) |

## Changes Implemented

### 1. Fix lint-transcript tests — Windows pipe compatibility

**Files:** `test/lint-transcript.test.mjs`
**Problem:** Tests used `printf '%s' '...' | node ...` to pipe multi-line JSONL to the linter. On Windows, `execSync` uses `cmd.exe` which doesn't support `printf` or single-quote strings, causing all piped tests to fail (9 tests).
**Solution:** Replaced all `printf` piping with a `lintEvents()` helper that writes events to temp JSONL files and passes the file path to the linter via `execFileSync`. Temp files are cleaned up in `finally` blocks.
**Lines changed:** ~80 (full rewrite of test mechanics, logic preserved)

### 2. Fix CRLF frontmatter regex in test files

**Files:** `test/commands.test.mjs`, `test/skill.test.mjs`
**Problem:** Frontmatter validation used `/^---\n/` which fails on Windows where files have CRLF (`\r\n`) line endings. Affected 4 tests across commands/discipline.md, commands/dashboard.md, and SKILL.md.
**Solution:** Changed regex to `/^---\r?\n/` to match both LF and CRLF line endings.
**Lines changed:** 3

## Remaining Failures (7, pre-existing)

| Test | Root Cause |
|------|-----------|
| observe.sh — completes within 200ms | Bash script performance on Windows (shell startup overhead) |
| installer — 5 tests | Install paths and settings.json patching differ on Windows |
| MCP server — ci_instincts empty message | Test environment has leftover instinct data |

## Deferred Items

- Investigate installer test failures (Windows path handling in `bin/install.mjs`)
- MCP server test isolation (clean instinct state before test runs)
- Note: `.gitattributes` already exists and enforces LF line endings, so no follow-up is needed there.
