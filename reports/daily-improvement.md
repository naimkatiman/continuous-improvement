# Daily Improvement Report — 2026-05-26

## 2026-05-26 — Update stale pm-skills star count in README
- `README.md` line 288 listed pm-skills as having "189 stars", but the upstream repo `product-on-purpose/pm-skills` currently shows 239 stars (verified via GitHub API at 2026-05-26T15:30Z).
- Updated the count from 189 → 239 so the "In the wild" section reflects current reality.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass). The plugin bundle `README.md` does not mention pm-skills, so no mirror update was needed.

## 2026-05-26 — Update report card date to May 26
- The HTML summary card at `reports/assets/update-card.html` still showed "May 25, 2026" in the body date and "2026-05-25" in the `<title>`, despite the daily report being dated 2026-05-26.
- Updated both the `<title>` and the visible date line to "May 26, 2026" / "2026-05-26" so the card matches the current reporting period.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass). The card is a standalone generated asset, so no mirror update was needed.

## 2026-05-26 — Fix stale `<title>` in `reports/assets/update-card.html`
- The HTML summary card's `<title>` element still read "2026-04-13", missed during the prior card update that refreshed the body content to May 25, 2026 data.
- Updated the title to "2026-05-25" to match the current card body and reporting period.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass). The card is a standalone generated asset, so no mirror update was needed.

## 2026-05-25 — Update stale stats in `reports/assets/update-card.html`
- The HTML summary card at `reports/assets/update-card.html` still showed April 13, 2026 data: v3.1.0, 97/104 tests (93%), and old change summaries from the lint-transcript/CRLF fix era.
- Updated the card to current reality: May 25, 2026 — v3.9.2, 661/661 tests (100%), 18 fixes tracked, and representative change summaries from the May improvement cycle (orphan `.mjs` preservation, stale reference fixes, MCP isolation, installer coexistence, GateGuard parity).
- Also updated the `<title>` element to match the current reporting period.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass). The card is a standalone generated asset, so no mirror update was needed.

## 2026-05-25 — Remove irrelevant OpenAI extension recommendation from `.vscode/extensions.json`
- `.vscode/extensions.json` listed `"openai.chatgpt"` as the sole recommended VS Code extension. This is a Claude Code plugin project; recommending a competitor's extension is incongruous and provides no value.
- Replaced the single-item array with an empty `recommendations` list, eliminating the misleading guidance without substituting an untested alternative.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass).

## 2026-05-25 — Clear stale "Remaining Failures" and "Deferred Items" from report
- The tail of `reports/daily-improvement.md` listed 3 pre-existing failures (observe.sh Windows timing, installer paths, MCP isolation) and 2 deferred items. All of these were resolved in prior cycles: tests now show 661 pass / 0 fail, installer and MCP tests pass on Windows after the `lintEvents()` helper and `mkdtempSync` isolation fixes.
- Replaced the stale sections with an accurate summary: zero remaining failures, zero deferred blockers, and a low-priority note about the orphan `.mjs` technical debt already mitigated.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass).

## 2026-05-25 — Commit pending landing-page fix and report update
- The prior cycle fixed the install command in `docs/landing/index.html` and drafted the report entry, but left both files uncommitted.
- Staged explicitly by filename (per CLAUDE.md Git hygiene rule) and committed as `c3c7a07` with message `docs(landing): fix invalid install command and record in daily report`.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass, working tree clean).

## 2026-05-25 — Fix invalid install command on landing page
- `docs/landing/index.html` line 133 showed `claude /install npx continuous-improvement` in the copy-paste install box. This command does not exist: Claude Code uses `/plugin install`, and `npx` is a shell prefix, not a slash-command argument.
- Changed the install box to `npx continuous-improvement install` (a real shell command that works for every Node user) and updated the copy button's `writeText` target to match.
- Verified with `npm run verify:all`; the full repo gate stayed green (661 pass / 0 fail). The landing page is not covered by the mirror checks (it is a generated standalone asset), so no mirror update was needed.

## 2026-05-25 — Update stale report header date
- The H1 title of `reports/daily-improvement.md` still read "2026-04-13", the date the report was first created. All entries below it are from May 2026.
- Updated the title to "2026-05-25" to match the current reporting period.
- Verified with `npm run verify:all`; the full repo gate stayed green (661 pass / 0 fail).

## 2026-05-25 — Preserve known orphan `.mjs` files in `npm run clean`
- `npm run clean` deletes every `.mjs` file in `bin/`, `test/`, and `lib/` because they are generated by `tsc`. Two hand-authored files — `bin/refresh-third-party.mjs` and `test/check-everything-mirror.test.mjs` — have no `.mts` source (documented in `CLAUDE.md` as deferred follow-up #1) and were being accidentally deleted.
- Updated the `clean` script in `package.json` to skip these two known orphans using an exclusion set, preventing the loss of hand-authored code on every clean cycle.
- Verified with `npm run clean` (orphans preserved), `npm run build` (generated files restored), `npm run verify:all` (full repo gate green), and `npm test` (661 pass / 0 fail).

## 2026-05-25 — Fix remaining stale "Five-Source Dispatcher" title in `skills/superpowers.md`
- Commits `a12d8eb` and `204e8ad` fixed stale "five-source" references in the body text of `skills/superpowers.md`, `commands/superpowers.md`, and their plugin mirrors, but missed the H1 title on line 8 which still read "(Five-Source Dispatcher)".
- Changed the title to "(Four-Source Dispatcher)" in both `skills/superpowers.md` and its plugin mirror `plugins/continuous-improvement/skills/superpowers/SKILL.md`, matching the frontmatter description ("Unified four-source dispatcher"), the body text ("four registered marketplaces"), and the actual four registered upstream companions.
- Verified with `npm run verify:all`; the full repo gate stayed green (661 pass / 0 fail) and `verify:everything-mirror` confirmed both files remain in sync.

## 2026-05-25 — Fix stale skill count in `llms.txt`
- `llms.txt` line 3 described the project as having "13 enforcement skills", but the repo currently bundles 20 skills (as counted by `ls skills/*.md | wc -l` and confirmed by `verify:routing-targets`). The package.json description and README both say "20 bundled skills".
- Updated the tagline to read "20 bundled skills, gating hooks, the Mulahazah auto-leveling instinct engine, and a GitHub Action transcript linter." to match current reality.
- Verified with `npm run verify:all` and `node --test test/community.test.mjs`; the full repo gate stayed green (661 pass / 0 fail) and the community tests confirmed `llms.txt` remains valid.

## 2026-05-25 — Commit landing page, Action marketplace docs, and fix stale RELEASING note
- Committed 7 files of in-progress work from the prior session: `docs/landing/index.html` (project landing page), `.github/workflows/pages.yml` (GitHub Pages deploy), `.github/FUNDING.yml` (sponsorship), README.md + package.json (landing links), `.github/workflows/release.yml` (auto major-version tag update), and `docs/RELEASING.md` (Action Marketplace publishing docs).
- Fixed a stale note in `docs/RELEASING.md` line 108: it still claimed the major-version tag must be moved manually, but `.github/workflows/release.yml` now automates this via `git tag -fa` and `git push --force` in the release job.
- Verified with `npm run verify:all`; the full repo gate stayed green (661 pass / 0 fail) across all 10 content invariants plus typecheck.

## 2026-05-24 — Hourly verification pass + commit prior cycle residue
- Committed the two uncommitted files left from the prior hourly cycle: `bin/refresh-third-party.mjs` (typo fix "rerunns" → "reruns") and `reports/daily-improvement.md` (updated log entries).
- Ran `npm run verify:all`; the full repo gate stayed green (661 pass / 0 fail) across all 10 content invariants plus typecheck.
- Scanned for trailing whitespace, missing EOF newlines, stale version references, stale "five-source" references, executable-bit gaps, and common typos in first-party files — none found.
- No new code changes were needed for this cycle; the repo state is clean and green.

## 2026-05-24 — Comment typo fix in `bin/refresh-third-party.mjs`
- Fixed typo "rerunns" → "reruns" in the file header docblock line 5. The comment describes what the driver does when refreshing vendored third-party snapshots.
- Verified with `npm run verify:all`; the full repo gate stayed green (661 pass / 0 fail).

## 2026-05-24 — Stale version in `.cloudplugin/marketplace.json`
- `.cloudplugin/marketplace.json` still declared version `3.2.0`, but the package has been at `3.9.2` since 2026-05-19 (see `package.json` and `.claude-plugin/marketplace.json`).
- Updated `"version"` from `3.2.0` to `3.9.2` to match the current release.
- Verified with `npm run verify:all`; the full repo gate stayed green (661 pass / 0 fail).

## 2026-05-24 — Fix stale "five-source" references in `commands/superpowers.md`
- The prior commit `a12d8eb` fixed the stale "five-source" wording in `skills/superpowers.md` and its plugin mirror, but missed the same stale references in `commands/superpowers.md` lines 10 and 12 and its plugin mirror `plugins/continuous-improvement/commands/superpowers.md`.
- Changed "across five sources" to "across four sources" and "## Routing surface (five sources)" to "## Routing surface (four sources)" in both files, matching the actual four registered upstream companions listed in the table below.
- Verified with `npm run verify:all`; the full repo gate stayed green (661 pass / 0 fail) and `verify:everything-mirror` confirmed both files remain in sync.

## 2026-05-24 — Trailing whitespace cleanup in `hooks/observe.sh`
- Removed four trailing spaces from the blank line between the observation rotation `mv` and the archive cleanup comment in `hooks/observe.sh` line 136, and from its plugin mirror `plugins/continuous-improvement/hooks/observe.sh` line 136.
- Verified with `npm run verify:all`; the full repo gate stayed green (661 pass / 0 fail) and `verify:everything-mirror` confirmed both files remain in sync.

## 2026-05-24 — Fix stale "five-source" reference in superpowers skill docs
- `skills/superpowers.md` § "Using Superpowers" and its plugin mirror `plugins/continuous-improvement/skills/superpowers/SKILL.md` both described the dispatcher as resolving triggers through a "five-source routing table", but the heading two lines above reads "## Four-Source Routing Table" and `pm-skills` is explicitly out-of-band. This was a stale reference left over from the v3.8.0 five-plugin dispatcher plan where `pm-skills` was briefly considered a registered source.
- Changed "five-source" to "four-source" in both files to match the actual four registered upstream companions (Obra superpowers, addy agent-skills, ruflo-swarm, oh-my-claudecode) plus the CI plugin itself.
- Verified with `npm run verify:all` and `npm test`; the full repo gate stayed green (661 pass / 0 fail) and the `everything-mirror` check confirmed both files remain in sync.

## 2026-05-23 — Plugin bundle `mcp-server.mjs` executable-bit regression fix
- The in-progress `package.json` build-script chmod step was only setting `+x` on files in `bin/` but missed `plugins/continuous-improvement/bin/mcp-server.mjs`, so after `npm run build` the plugin copy lost its executable bit (regression from HEAD where it was 755).
- Added `plugins/continuous-improvement/bin/mcp-server.mjs` to the build-script chmod list so the plugin bundle stays executable after every rebuild.
- Verified with `npm run build` and `npm run verify:all`; the full repo gate stayed green (661 pass / 0 fail) and `plugins/continuous-improvement/bin/mcp-server.mjs` now carries `+x`.

## 2026-05-23 — Stale Project Snapshot table in daily report
- Updated the "Project Snapshot" table at the bottom of `reports/daily-improvement.md` from v3.1.0 to v3.9.2 and from the outdated 104-test count (84/20 and 97/7) to the current 661 pass / 0 fail reality.
- Verified with `npm run verify:all`; full repo gate stayed green.

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
| Project | continuous-improvement v3.9.2 |
| Stack | Node.js (ESM), MCP server, GitHub Action, CLI tools |
| Stage | Published npm package, active development |
| Tests (current) | 661 pass / 0 fail |

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

## Remaining Failures

None. All 661 tests pass / 0 fail as of this cycle.

## Deferred Items

- None. Prior deferred items (installer Windows path handling, MCP test isolation) were resolved in earlier cycles. The orphan `.mjs` preservation mitigation is in place; long-term fix (`.mts` sources or relocation to `scripts/`) remains low-priority technical debt.
