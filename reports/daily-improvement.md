# Daily Improvement Report — 2026-04-13

Fixed 13 test failures caused by Windows platform incompatibilities in test infrastructure.

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
- Consider adding `.gitattributes` to enforce LF line endings and prevent future CRLF issues
- MCP server test isolation (clean instinct state before test runs)
