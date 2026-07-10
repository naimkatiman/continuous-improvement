# v3.20.0 deployment regressions

Date: 2026-07-10
Branch: `fix/v320-deployment-regressions`
Base: `41f3ef0645609eaeff9202886e7b5c13d8058b4d`

## Goal

Ship a fix-forward change that closes every verified v3.20.0 deployment defect without publishing or deploying from this task.

## Acceptance criteria

- AC-001: The npm package and generated plugin bundle contain every deterministic helper cited by bundled skills.
- AC-002: Artifact verification fails closed when `scripts/` or its inventory is absent.
- AC-003: Gateguard still catches unquoted Git reflog refs and allows benign PowerShell hashtables.
- AC-004: Query-cost and typecheck Stop hooks include untracked files in their changed-file set.
- AC-005: The Windows installer accepts a Bash executable only when it can open the generated forward-slash Windows paths.
- AC-006: Landing-page release metadata matches `package.json`, and CI enforces that contract.
- AC-007: The landing page has no horizontal overflow at 375 px, 768 px, or 1440 px.
- AC-008: Source and generated `.mjs` artifacts remain in exact parity.
- AC-009: `npm run verify:all`, the full test suite, package smoke checks, and focused browser checks pass.
- AC-010: Plugin-managed PostToolUse, SessionStart, and SessionEnd hooks run through Node and do not depend on whichever `bash` executable Windows resolves first.
- AC-011: The npx installer migrates installer-owned Bash hook rows to Node without deleting foreign hooks, and uninstall removes both legacy and current rows.

## Assumptions and boundaries

- Code, tests, docs, generated artifacts, and a local feature branch are authorized.
- npm publication, GitHub push or PR creation, and Cloudflare deployment are out of scope.
- The existing package version remains `3.20.0`; a release owner can choose the fix-forward version after review.
- No new dependency is required.
- Each fix stays inside the audited boundary. Unrelated cleanup is deferred.

## TDD sequence

1. Add artifact tests that inspect the generated plugin bundle and `npm pack --dry-run --json` output.
2. Add gateguard coverage for PowerShell hashtables and valid reflog refs.
3. Add untracked-file integration cases to both Stop-hook suites.
4. Add Windows Bash path-compatibility coverage to the installer suite.
5. Add landing metadata and responsive-overflow regression coverage.
6. Add plugin-manifest, session-lifecycle, and installer-migration coverage that fails when lifecycle hooks depend on Bash.
7. Run the focused tests and record the expected RED failures.
8. Apply the smallest implementation changes that make each case green.
9. Rebuild from `.mts`, rerun focused tests, then run the repository-wide gates.

## Expected implementation surfaces

- Package and plugin bundle metadata/generation.
- Script-citation and package-shape invariants.
- Gateguard, query-cost, typecheck, and installer sources plus their tests.
- Landing-page source and landing drift verification.
- Generated `bin/`, `hooks/`, `test/`, `lib/`, and plugin mirrors produced by `npm run build`.
- `AGENTS.md` Past Mistakes entry for the packaging and boundary-test gaps.
- Node-native observer and session hook wiring in plugin metadata and the npx installer.

## Verification

- Focused Node test files for every defect.
- `node scripts/resolve-verify-ladder.mjs --json`.
- `npm run build` after every `.mts` edit set and before staging.
- `npm run verify:all`.
- `node --test test/*.test.mjs`.
- `npm pack --dry-run --json` plus plugin-bundle helper execution.
- Browser checks at 375 px, 768 px, and 1440 px against a local landing-page server.
- Direct Node invocation of the installed PostToolUse and SessionStart hooks with WSL Bash first on PATH.
- Final branch, HEAD, `git diff --stat`, `git diff --check`, and changed-file review.

## Status

- RED recorded: 10 targeted cases failed against the old behavior.
- GREEN recorded: 102 focused tests pass after rebuilding all generated artifacts.
- `npm run verify:all` passes every invariant and typecheck on the reviewed HEAD.
- All 1,021 tests pass in loaded-Windows-host shards; timing assertions remain unchanged. The final isolated results include `observe.test.mjs` at 12/12 and `hook.test.mjs` at 15/15.
- `npm pack --dry-run` reports 261 files, including all 18 root and plugin script artifacts; generated output has zero drift.
- Playwright reports equal client and scroll widths at 375 px, 768 px, and 1,440 px.
- Final adversarial review found two medium gaps. Both are closed with RED-to-GREEN coverage: quoted/comment-only PowerShell hashtables, and deleted inventoried helpers.
- Lifecycle-hook follow-up RED recorded: the new portability suite failed 4/4 because plugin metadata invoked Bash and no Node session hook existed.
- Lifecycle-hook follow-up GREEN recorded: 16/16 portability and observer tests pass after wiring PostToolUse, SessionStart, and SessionEnd directly to Node.
- Installer follow-up RED recorded: the no-Bash case exited 1, and the old global Bash probe left the installer suite at 6 pass, 13 fail, and 11 cancelled.
- Installer follow-up GREEN recorded: all 30 installer tests pass, including legacy-row migration, foreign-hook preservation, no-Bash installation, and Node-session cleanup.
- Mode-transition follow-up GREEN recorded: all 35 installer and portability tests pass after preserving legacy expert session hooks through beginner reinstalls.
- Final `npm run verify:all` passes every invariant and typecheck. Sixty-eight non-timing-sensitive test files pass in 14 low-concurrency shards; the four subprocess-timing files pass in isolation. The documented `hook.test.mjs` wall-clock case still flakes under host saturation, and its budget remains unchanged.

## Deferred

- Publishing a patch release.
- Updating the `v3` tag.
- Deploying Cloudflare Pages.
- Changing the direct-upload Pages architecture.
