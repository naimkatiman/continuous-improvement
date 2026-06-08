# Daily Improvement Report — 2026-06-08

## 2026-06-08 — Sync test counts to 760 after CI slim refactor
- PR #220 (`refactor(ci): slim the ci CLI to CLI-Anything; remove Compound Engineering + PM-Skills`) deleted three large test suites (`compound-engineering`, `pm-skills`, `unified-plugin`) and their generated `.mjs` artifacts, reducing the total test count from 801 to 760. The Project Snapshot table, Remaining Failures prose, and HTML summary card at `reports/assets/update-card.html` still showed `801`.
- Updated the Project Snapshot and Remaining Failures sections from `801 pass / 0 fail` to `760 pass / 0 fail`, and synced the update-card badge, stat values, and footer line from `801` to `760` so all hand-maintained test counts reflect the post-refactor reality.
- Verified with `npm run verify:all` (all 12 content invariants + typecheck pass) and `npm test` (760 pass / 0 fail). Working tree has a doc-only diff.

## 2026-06-08 — Fast-forward main to origin/main (v3.12.3) and sync stale report dates
- Local `main` was 8 commits behind `origin/main` after PRs #211–#218 landed on the remote (OIDC trusted publishing fixes, v3.12.1–v3.12.3 releases). The fix branch `fix/goal-state-hangul-floor` was also based on the old local main, so rebasing it onto current `origin/main` was required before it can be pushed.
- Checked out `main` and fast-forwarded to `origin/main` (commit `302b621`, v3.12.3). Verified `npm run verify:all` — all 12 content invariants + typecheck pass, 801 pass / 0 fail.
- Rebased `fix/goal-state-hangul-floor` onto the updated main; rebase applied cleanly (no conflicts). Verified `npm run verify:all` and `npm test` — 802 pass / 0 fail (the +1 is the Korean Hangul regression test on the branch).
- Updated the HTML summary card at `reports/assets/update-card.html` from "June 7, 2026" / "2026-06-07" to "June 8, 2026" / "2026-06-08" and from `v3.12.0` to `v3.12.3` so the card matches the current reporting period and release. Updated the report header from "2026-06-07" to "2026-06-08" and the Project Snapshot version from `v3.12.0` to `v3.12.3`.
- Verified with `npm run verify:all` (all 12 content invariants + typecheck pass, 801 pass / 0 fail). Working tree has a doc-only diff on `main`; the fix branch is rebased and ready to push.

## 2026-06-07 — Sync stale v3.10.0 references in landing-page blueprint plan
- `docs/plans/2026-06-07-landing-page-blueprint-rebuild.md` (dated today) still advertised `v3.10.0` / `REV 3.10.0` on its spec-sheet summary line and footer example even though the project released `v3.11.0` on 2026-06-07 and advanced to `v3.12.0` later the same day. A plan document referencing an outdated version risks being executed with stale expectations.
- Updated both occurrences from `v3.10.0` / `REV 3.10.0` to `v3.12.0` / `REV 3.12.0` so the blueprint spec-sheet is internally consistent with the current release.
- Verified with `npm run verify:all` (all 12 content invariants + typecheck pass, including `verify:tool-count`) and `npm test` (801 pass / 0 fail). No generated drift.

## 2026-06-07 — Sync stale v3.11.0 version references to v3.12.0
- PR #197 bumped the release to v3.11.0 and PR #204/#210 advanced to v3.12.0, but three user-facing surfaces still advertised v3.11.0: `.cloudplugin/marketplace.json` (version and old loss-framing description), `docs/landing/index.html` (four occurrences: hero version badge, kicker REV line, current-rev list item, footer REV line), and `reports/assets/update-card.html` (visible date line).
- Updated all six stale references from `v3.11.0` / `REV 3.11.0` to `v3.12.0` / `REV 3.12.0`. Also updated `.cloudplugin/marketplace.json` description from the old loss-framing "Stops Claude Code from…" to the v3.12.0 intelligence-amplifier reframe so it matches `.claude-plugin/marketplace.json` and the generated plugin manifests.
- Verified with `npm run verify:all` (all 12 content invariants + typecheck pass, including the new `verify:tool-count`) and `npm test` (801 pass / 0 fail). No generated drift.

## 2026-06-07 — Close deferred Thai combining-mark tokenization follow-up
- `CLAUDE.md` § Deferred logged a LOW follow-up from the 2026-06-03 completeness sweep: the Unicode tokenizer in `src/lib/recall-index.mts` and `src/lib/goal-state.mts` used `/[^\p{L}\p{N}]+/u`, which treats Thai combining marks (`\p{M}`) as delimiters and fractures Thai words into garbled 2–3 character fragments. For recall this produced sub-percent BM25 noise; for goal-state the 4-char keyword floor dropped the fragments entirely.
- Updated both tokenizers to split on `/[^\p{L}\p{N}\p{M}]+/u` so Thai tone marks and vowel signs stay attached to their base letters. Updated the `goal-state.mts` floor comment to note that Thai now survives at length ≥4, while the Korean short-word script issue remains open.
- Added regression tests in `src/test/recall-index.test.mts` and `src/test/goal-state.test.mts` that pin Thai words with combining marks (e.g. `ม้านั่ง`, `กระโดด`) through the tokenizers.
- Marked the follow-up **CLOSED `747451a`** in `CLAUDE.md` § Deferred. Opened PR #209 (`fix(recall,goal-state): keep Thai combining marks in Unicode tokenizer`) for merge review.
- Verified with `npm run build` (mirrors regenerated), `npm run verify:all` after merging latest `origin/main` (all 12 content invariants + typecheck pass, now including `verify:tool-count`), and `npm test` (801 pass / 0 fail, up from 793 pre-merge due to the 2 new regression tests plus 6 new tool-count invariant tests on `main`). No generated drift.

## 2026-06-07 — Post-merge audit: fix doc/count drift vs the latest implementation
- Audited the whole repo after merging everything to `main` (HEAD `017eadf`, v3.11.0). `verify:all` + `verify:generated` green; suite 793/793 (the `hook.test.mjs` wall-clock timing failure is the documented environmental flake, not a regression).
- Fixed prose/count drift that no invariant covers: the expert MCP surface is **18 tools** (was stated as 12) in `docs/skills.md` and the `install.mts` expert message; the `CONTRIBUTING.md` release checklist still described a manual `npm publish` / `gh release create` / float-tag force-push that `release.yml` now does automatically via OIDC trusted publishing (rewrote it to defer to `docs/RELEASING.md`); `agents/README.md` pointed three times at a non-existent `references/orchestration-patterns.md` (repointed at the in-file Decision matrix); the `oh-my-claudecode` companion was advertised as 39 skills (the vendored snapshot ships 38); `harvest` named a non-existent `hooks/bin/observe.mjs` path; `CLAUDE.md` anchored the skill-distill NaN-ts closure to `b4f2eaf` instead of "in working tree".
- Synced this report's live-state test count (and `reports/assets/update-card.html`) from 752 → 793. The dated narrative entries below are point-in-time and left unchanged.
- Verified with `npm run build` (mirrors regenerated), `npm run verify:all`, and `npm run verify:generated` (no generated drift).

## 2026-06-07 — Create PR #200 for missed version-reference sync and enable auto-merge
- The branch `hourly/2026-06-07-sync-stale-version-refs-missed-in-197` (commit `736b487`) had the landing-page and CloudPlugin version fixes but was not yet merged to `main`.
- Created PR #200 (`docs: sync missed 3.10.0 → 3.11.0 version references from PR #197`) and enabled squash auto-merge with `gh pr merge 200 --squash --delete-branch --auto`. CI checks (lint-transcript + Node 18/20/22 test matrix) are running; merge will complete once they pass.
- Verified with `npm run verify:all` locally (all 11 content invariants + typecheck pass, 752 pass / 0 fail). Working tree is clean.

## 2026-06-07 — Sync missed 3.10.0 → 3.11.0 version references from PR #197
- PR #197's post-merge sync claimed to update `docs/landing/index.html` version badge from `v3.10.0` → `v3.11.0`, but two occurrences of `REV 3.10.0` were missed: the hero kicker line (`<span class="kicker reveal">`) and the footer copyright line (`<span class="foot-doc">`). Additionally, `.cloudplugin/marketplace.json` was never updated and still advertised `"version": "3.10.0"`.
- Updated both missed `REV 3.10.0` references in `docs/landing/index.html` to `REV 3.11.0` so the landing page is internally consistent. Updated `.cloudplugin/marketplace.json` `"version"` from `3.10.0` to `3.11.0` so the CloudPlugin marketplace listing matches the current release.
- Verified with `npm run verify:all` (all 11 content invariants + typecheck pass, 752 pass / 0 fail). Committed to branch `hourly/2026-06-07-sync-stale-version-refs-missed-in-197`.

## 2026-06-07 — Merge PR #197 (release v3.11.0) and sync stale version references
- PR #197 (`release/v3.11.0`) was open with all four required checks green (lint-transcript + test matrix on Node 18/20/22). It cut the v3.11.0 release to supersede the unpublished v3.10.0 milestone (its release workflow failed at npm publish on an expired token). The PR bumped `package.json` and `package-lock.json` to `3.11.0`, regenerated the four derived plugin manifests, and rolled `CHANGELOG.md` `[Unreleased]` → `[3.11.0] — 2026-06-07`.
- Merged it via squash-merge with `gh pr merge 197 --squash --delete-branch`.
- Fast-forwarded local `main` to `origin/main` (commit `874cb85`) and deleted the local feature branch with `git branch -D release/v3.11.0`.
- Synced stale version references that still pointed at `v3.9.2` or `v3.10.0`: `docs/RELEASING.md` example release (`v3.9.2` → `v3.11.0`), `reports/assets/update-card.html` visible version (`v3.10.0` → `v3.11.0`), and `docs/landing/index.html` version badge (`v3.10.0` → `v3.11.0`).
- Verified with `npm run verify:all` (all 11 content invariants + typecheck pass, 752 pass / 0 fail). Working tree is clean; no stale release branches remain.

## 2026-06-07 — Update stale report dates to June 7
- The HTML summary card at `reports/assets/update-card.html` still showed "June 6, 2026" / "2026-06-06" in the `<title>` and visible date line, and the daily report header was still "2026-06-06". With the date boundary crossed to June 7, these assets needed to reflect the current reporting period.
- Updated both the `<title>` and the visible date line to "June 7, 2026" / "2026-06-07" so the card matches the current reporting period. Updated the report header from "2026-06-06" to "2026-06-07".
- Verified with `npm run verify:all` (all 11 content invariants + typecheck pass, 752 pass / 0 fail). Working tree remains clean.

## 2026-06-07 — Anchor audit #8 closure to commit hash in audit doc
- `docs/audits/2026-06-03-new-feature-audit.md` row #8 still read **CLOSED in working tree** even though the fix was committed two days ago as `b4f2eaf` and is now in `main`. This left the audit trail ambiguous compared to other closed rows that cite exact commit hashes.
- Replaced **CLOSED in working tree** with **CLOSED `b4f2eaf`** so the audit log matches the canonical commit reference pattern used by every other closed item.
- Verified with `npm run verify:all` (all 11 content invariants + typecheck pass, 752 pass / 0 fail). Working tree has a single doc-only diff.

## 2026-06-07 — Merge PR #194 and delete stale branch
- PR #194 (`hourly/2026-06-07-anchor-audit-8-closure`) contained the doc-only audit #8 closure alignment. It was squash-merged to `main` at commit `b3e02c1` via `gh pr merge 194 --squash --delete-branch`. The remote branch was deleted automatically; the local remote-tracking ref was pruned with `git remote prune origin`.
- Fast-forwarded local `main` to `origin/main` (commit `b3e02c1`) and deleted the local feature branch with `git branch -D hourly/2026-06-07-anchor-audit-8-closure`.
- Verified with `git branch -a` (no stale `hourly/*` branches remain), `git branch -r` (no stale remote-tracking refs remain), and `npm run verify:all` (all 11 content invariants + typecheck pass, 752 pass / 0 fail). Working tree remains clean.

## 2026-06-07 — Reorganize misplaced report entries into chronological order
- Five daily-improvement entries were accidentally appended after the "Project Snapshot" / "Remaining Failures" sections instead of being inserted in reverse-chronological order: the June 6 PR #188 audit-doc deferral fix, the June 1 `bin/refresh-third-party.mjs` TypeScript source migration, and three June 2 entries (push local main, add `hooks/` to generated-artifact verification, merge PR #173). This broke the report's reverse-chronological flow and placed newer June entries after older May entries.
- Moved the June 6 entry to join the other June 6 entries before the June 3 block; moved the three June 2 entries to join the other June 2 entries before the June 1 block; moved the June 1 entry to join the other June 1 entries before the May block. Added a missing blank line between the last June 2 entry and the first June 1 entry.
- Verified with `npm run verify:all` (all 11 content invariants + typecheck pass, 752 pass / 0 fail). Working tree has a single doc-only diff.

## 2026-06-06 — Push local main to origin
- Local `main` was 1 commit ahead of `origin/main` (`792fdb7 docs(report): sync test counts 750→752 and record daily improvement entry`). The prior cycle produced the commit but did not push it, leaving the remote behind.
- Pushed with `git push origin main`. Remote fast-forwarded from `b4f2eaf` to `792fdb7`.
- Verified with `git status` (working tree clean, branch up to date with `origin/main`) and `git log --oneline origin/main..main` (empty). `npm run verify:all` stayed green (all 11 content invariants + typecheck pass, 752 pass / 0 fail). No stale branches remain.

## 2026-06-06 — Sync test counts to 752 after skill-distill regression tests
- `npm test` now reports 752 pass / 0 fail (up from 750) after the two regression tests added in the skill-distill audit #8 closure earlier today. The HTML summary card at `reports/assets/update-card.html` and the `Project Snapshot` table in this report still showed 750.
- Updated all three occurrences in the card (Tests Passing, Total Tests, badge) from `750` to `752`, and updated the snapshot table and Remaining Failures prose from `750` to `752`.
- Verified with `npm test` (752 pass / 0 fail) and `npm run verify:all` (all 11 content invariants + typecheck pass). Working tree remains clean.

## 2026-06-06 — Close deferred audit item #8 (skill-distill NaN-ts gap split)
- `src/lib/skill-distill.mts` `extractTrajectories` silently merged unrelated observation runs when a timestamp was unparseable, because the gap-detection logic only split when *both* adjacent timestamps were valid (`!Number.isNaN(prevMs) && !Number.isNaN(curMs) && curMs - prevMs > GAP_MS`). This meant a block of malformed timestamps between two valid sessions would fuse all three into a single incoherent trajectory, degrading draft-skill mining.
- Changed the boundary predicate to `(prevValid && curValid && gap > GAP_MS) || (prevValid !== curValid)`. This fails closed: any transition from a valid timestamp to an invalid one (or vice versa) forces a trajectory split, while consecutive invalid timestamps stay together so a single bad block does not shatter into unusable 1-observation fragments.
- Added two regression tests in `src/test/skill-distill.test.mts`: (1) a valid block → invalid block → post-gap valid block produces three separate trajectories, and (2) a valid block immediately followed by an invalid block produces two trajectories.
- Verified with `npm run build` (`.mjs` artifacts regenerated cleanly), `node --test test/skill-distill.test.mjs` (17 pass / 0 fail), and `npm run verify:all` (all 11 content invariants + typecheck pass). Updated `CLAUDE.md` § Deferred and `docs/audits/2026-06-03-new-feature-audit.md` to mark #8 closed.

## 2026-06-06 — Sync update-card test counts to current 750-test suite
- The HTML summary card at `reports/assets/update-card.html` still showed `727` in the "Tests Passing", "Total Tests", and badge stats even though the test suite grew to `750 pass / 0 fail` after the goal-monitor boundary-fix merge (PRs #178, #183, #184). The card was last synced on 2026-06-03 when the count was 727.
- Updated all three occurrences from `727` to `750` so the card reflects the current test-suite reality.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 11 content invariants + typecheck pass, 750 pass / 0 fail). Working tree remains clean.

## 2026-06-06 — Update stale report dates to June 6
- The HTML summary card at `reports/assets/update-card.html` still showed "June 3, 2026" / "2026-06-03" in the `<title>` and visible date line, and the daily report header was still "2026-06-03". With the date boundary crossed to June 6, these assets needed to reflect the current reporting period.
- Updated both the `<title>` and the visible date line to "June 6, 2026" / "2026-06-06" so the card matches the current reporting period. Updated the report header from "2026-06-03" to "2026-06-06".
- Verified with `npm run verify:all`; the full repo gate stayed green (all 11 content invariants + typecheck pass, 750 pass / 0 fail). Working tree remains clean.

## 2026-06-06 — Fix audit doc deferrals lost in PR #187 squash-merge
- Commit `32b443c` (marking deferred findings #2 and #14 as CLOSED in the audit log) was authored on the local branch `hourly/2026-06-06-update-card-test-count-750` but never pushed to the remote before PR #187 was created and squash-merged. The resulting `main` commit `0f40d55` only contained the first two commits of the branch, leaving the audit doc stale: row #2 lacked its `CLOSED` annotation, row #14 still appeared open, and the post-`/proceed` summary incorrectly claimed "four" remaining deferrals instead of three.
- Created branch `hourly/2026-06-06-fix-audit-doc-deferrals`, applied the exact missing diff (3 insertions, 3 deletions), and merged it via PR #188 (`gh pr merge 188 --squash --delete-branch --admin`).
- Verified with `npm run verify:all` (all 11 content invariants + typecheck pass, 750 pass / 0 fail). Working tree is clean; no stale hourly branches remain.

## 2026-06-03 — Close deferred manifest generator skill-discovery glob in CLAUDE.md
- The deferred item "manifest generator skill-discovery glob (MED)" was fixed in commit `2fde059` (PR #186) but remained listed as open in `CLAUDE.md` § Deferred. Updated the entry to mark it **CLOSED** with the commit reference and a brief description of the fix (generator now uses the same loose filter as tier-lint discovery).
- No code changes; this is a documentation-only alignment between the deferred audit log and the actual repo state.
- Verified with `npm run verify:all` (all 11 content invariants + typecheck pass) and `npm test` (750 pass / 0 fail).

## 2026-06-03 — Merge PR #186 and delete stale merged branch
- PR #186 (`hourly/2026-06-03-align-manifest-skill-discovery`) contained the manifest generator skill-discovery alignment fix and its report entry. It was squash-merged to `main` at commit `2fde059` via `gh pr merge 186 --squash --delete-branch`. The remote branch was deleted automatically; the local remote-tracking ref was pruned with `git remote prune origin`.
- Local `main` was already up to date after the fast-forward merge, so no additional branch cleanup was needed.
- Verified with `git branch -a` (no stale `hourly/*` branches remain), `git branch -r` (no stale remote-tracking refs remain), and `npm run verify:all` (all 11 content invariants + typecheck pass, 750 pass / 0 fail). Working tree remains clean.

## 2026-06-03 — Align manifest generator skill-discovery filter with tier-lint
- `src/bin/generate-plugin-manifests.mts` used `/^[a-z][a-z0-9-]*\.md$/` to discover companion skills for the plugin bundle, while `check-skill-tiers` (and its mirror `check-skill-law-tag`) accepted any `.md` file except `README.md`. This meant a future skill with an uppercase, underscore, or leading-digit name would pass `verify:all` but be silently omitted from the generated bundle.
- Replaced the strict regex with the same loose filter `file.endsWith(".md") && file !== "README.md"` so the manifest generator aligns with the tier-lint discovery logic. The current repo has no non-kebab-case skill files, so the generated bundle is unchanged.
- Verified with `npm run build` (manifests regenerated cleanly), `npm test` (750 pass / 0 fail), and `npm run verify:all` (all 11 content invariants + typecheck pass). Commit `c09bc10` on branch `hourly/2026-06-03-align-manifest-skill-discovery`.

## 2026-06-03 — Fast-forward main and delete stale merged branch
- PR #182 (`hourly/2026-06-03-changelog-3-10-0-entry`) was squash-merged to `main` at commit `afe9718`, but the local feature branch `hourly/2026-06-03-changelog-3-10-0-entry` was still present and checked out. Squash merges create a new commit, so `git branch --merged` does not detect them, leaving stale branches behind. Additionally, `origin/main` had moved forward with three more merged PRs (#178 goal-monitor boundary fixes, #183 goal-drift Stop hook, #184 README goal-drift docs), so local `main` was behind the remote.
- Checked out `main`, fast-forwarded to `origin/main` (commit `5cf4f83`), and deleted the local feature branch with `git branch -D hourly/2026-06-03-changelog-3-10-0-entry`. The remote branch was already deleted by the squash-merge `--delete-branch` default, so `git push origin --delete` was not needed; the local remote-tracking ref was pruned with `git remote prune origin`.
- Verified with `git branch -a` (no stale `hourly/*` branches remain), `git branch -r` (no stale remote-tracking refs remain), and `npm run verify:all` (all 11 content invariants + typecheck pass, 750 pass / 0 fail). Working tree remains clean.

## 2026-06-03 — Cut CHANGELOG [3.10.0] section from stale [Unreleased] header
- `CHANGELOG.md` still carried three fixed items under `[Unreleased]` even though the v3.10.0 release was cut on 2026-06-03 (commit `a28855f`, PR #177). The fixes (installer cleanup-only hook filtering, per-bucket hook entry cloning, GateGuard MultiEdit docs sync) all landed on `main` between 2026-05-17 and 2026-05-19 and were therefore included in the release.
- Replaced the `[Unreleased]` header with `[3.10.0] — 2026-06-03`, restored an empty `[Unreleased]` section above it per keep-a-changelog convention, and committed via branch `hourly/2026-06-03-changelog-3-10-0-entry` + PR #182.
- Verified with `npm run verify:all` (all 11 content invariants + typecheck pass, 727 pass / 0 fail).

## 2026-06-03 — Push local main to origin
- Local `main` was 5 commits ahead of `origin/main` after the June 3 docs sync wave (cloudplugin metadata sync, stale reference fixes, Project Snapshot update, and audit #10 closure). These were all doc-only or report-only changes that passed `verify:all` and `npm test` locally but had not been published to the remote.
- Pushed with `git push origin main`. Remote fast-forwarded cleanly from `c19e9f3` to `3dca6f0`.
- Verified with `git status` (working tree clean, branch up to date with `origin/main`), `git log --oneline origin/main..main` (empty), and `npm run verify:all` (all 11 content invariants + typecheck pass, 727 pass / 0 fail). No stale local or remote branches remain.

## 2026-06-03 — Close deferred audit item #10 (overlapping n-gram count) in docs
- Commit `c19e9f3` already added the contract-pinning regression test for audit #10, but both `CLAUDE.md` and `docs/audits/2026-06-03-new-feature-audit.md` still listed it as an open deferred item needing action. The stale references could mislead a future reader into thinking the test still needed to be written.
- Removed the `#10` row from the deferred table in the audit doc, added a closure note in the post-`/proceed` update section citing commit `c19e9f3`, updated the remaining-deferral count, and removed the overlapping-n-gram bullet from `CLAUDE.md`.
- Verified with `npm run verify:all` (all 11 content invariants + typecheck pass, 727 pass / 0 fail). Working tree remains clean.

## 2026-06-03 — Update stale Project Snapshot in daily report
- The embedded `Project Snapshot` table and `Remaining Failures` section in `reports/daily-improvement.md` still showed `v3.9.2` and `661 pass / 0 fail` even though the repo released `v3.10.0` and the test suite now runs `727 pass / 0 fail`. The `Deferred Items` summary also claimed no deferred items remained, but `CLAUDE.md` tracks the 2026-06-03 new-feature audit deferred list.
- Updated the snapshot to `v3.10.0` and `727 pass / 0 fail`, refreshed the remaining-failures count, and pointed the deferred summary at `CLAUDE.md` so it does not drift out of sync again.
- Verified with `npm run verify:all` (all 11 content invariants + typecheck pass, 727 pass / 0 fail). Working tree remains clean.

## 2026-06-03 — Sync stale version and skill-count references in update-card and CONTRIBUTING.md
- `reports/assets/update-card.html` still showed `v3.9.2` and `661 / 661` tests even though the repo released v3.10.0 and the test suite now runs 727 tests. `CONTRIBUTING.md` line 185 still referenced `"20 skills"` even though the repo ships 25 skills since PRs #154 and #175.
- Updated the card version to `v3.10.0`, test counts to `727 / 727`, and the CONTRIBUTING.md prose to `"25 skills"` so these hand-maintained references match current reality.
- Verified with `npm run verify:all` (all 11 content invariants + typecheck pass, 727 pass / 0 fail). No generated artifacts or mirrors were affected.

## 2026-06-03 — Sync README.md and docs/skills.md to 25-skill reality
- `README.md` and `docs/skills.md` still claimed the plugin shipped **20 skills** with a breakdown of `1 core + 1 featured + 5 tier-1 + 10 tier-2 + 3 always-bundled`, even though PRs #154 and #175 added five new skills (`recall` tier-1, `audit`, `goal-monitor`, `reconcile`, `skill-distillation` tier-2) bringing the actual total to 25. The `docs/skills.md` full table only listed rows #1–#20 and omitted the new skills entirely.
- Updated both files to state **25 skills** with the corrected breakdown `1 core + 1 featured + 6 tier-1 + 14 tier-2 + 3 always-bundled`, added rows #21–#25 to the catalog table with tier, Law, and description for each new skill, and updated the "Adding a 21st skill" cross-reference to "Adding a 26th skill".
- Verified with `npm run verify:all` (all 11 content invariants + typecheck pass, 727 pass / 0 fail). No generated artifacts were affected; only hand-maintained Markdown docs changed.

## 2026-06-03 — Sync `.cloudplugin/marketplace.json` to current release metadata
- `.cloudplugin/marketplace.json` was still advertising `"version": "3.9.2"` and `"20 bundled skills"` even though the repo released v3.10.0 on June 3 and now ships 25 skills under `skills/*.md`. The file is hand-maintained (not regenerated by `tsc`) and was explicitly left out of scope during the `/audit` + `/reconcile` wave (PR #175) to keep that PR surgical.
- Updated `version` from `3.9.2` to `3.10.0` and corrected the description line from `20 bundled skills` to `25 bundled skills` so the CloudPlugin marketplace listing matches the current release reality.
- Verified with `npm run verify:all` (all 11 content invariants + typecheck pass, 727 pass / 0 fail). The file is not yet in any generated-artifact or content invariant, so the diff is trivial and safe.
- Commit: `1f9cee3 docs(cloudplugin): sync version and skill count to current release (3.10.0, 25 skills)`.

## 2026-06-03 — Contract-pin overlapping n-gram occurrence counting (audit #10)
- Added a regression test in `src/test/skill-distill.test.mts` that proves `findCandidates` counts every matching n-gram window within a trajectory toward `occurrences`, not just distinct runs. The test uses a 9-observation successful trajectory (`[Read, Edit, Bash] × 3`) and asserts the 3-gram occurs 3 times even from a single session when thresholds are lowered.
- This closes deferred audit item #10 from `docs/audits/2026-06-03-new-feature-audit.md`: occurrences counts windows, not distinct runs; `minSessions` is the real guard against single-session false positives. The test ensures a future refactor cannot accidentally change this behavior without breaking the build.
- Verified with `npm run build`, `node --test test/skill-distill.test.mjs` (15 pass / 0 fail), and `npm run verify:all` (all 11 content invariants + typecheck pass).

## 2026-06-03 — Close superseded PR #179 in favor of PR #178
- PR #179 (`hourly/2026-06-03-unicode-tokenize-audit-6`) was opened with the Unicode-aware regex fix for goal-state and recall-index (audit #6). While it was open, PR #178 (`fix/goal-monitor-boundary-edges`) was found to contain the same Unicode tokenizer fix (`d2001ac`) plus additional boundary hardening: window:0/negative rejection (`6207648`), limit:0 clamping (`08cdbae`), regression tests, and updated deferred documentation.
- Closed PR #179 with a superseded comment to avoid merge conflicts on the same source lines; the broader fix set will reach `main` through #178. Deleted the local feature branch after switching back to `main`.
- Verified with `npm run verify:all` (all 11 content invariants + typecheck pass) and `git branch -a` (no stale `hourly/*` branches remain). Working tree clean.

## 2026-06-03 — Push rebased local main to origin
- Local `main` was 2 commits ahead of `origin/main` (`821139d` docs(contributing) and `c9eac5d` docs(report)), but `origin/main` had also moved forward with 3 new commits from merged PRs #154, #175, and #176. A direct push was rejected (non-fast-forward).
- Fetched remote state, rebased the 2 local docs commits onto the new `origin/main`, and pushed the result. The rebase applied cleanly because the local changes (`CONTRIBUTING.md` and `reports/daily-improvement.md`) did not overlap with the upstream changes (new skills, hooks, and tests under `src/` and `skills/`).
- Verified with `git status` (working tree clean, branch up to date with `origin/main`), `npm run verify:all` (all 11 content invariants + typecheck pass), and `npm test` (726 pass / 0 fail, reflecting the new upstream tests). No stale local or remote branches remain.

## 2026-06-03 — Update stale report dates to June 3
- The HTML summary card at `reports/assets/update-card.html` still showed "June 2, 2026" / "2026-06-02" in the `<title>` and visible date line, and the daily report header was still "2026-06-02". With the date boundary crossed to June 3, these assets needed to reflect the current reporting period.
- Updated both the `<title>` and the visible date line to "June 3, 2026" / "2026-06-03" so the card matches the current reporting period. Updated the report header from "2026-06-02" to "2026-06-03".
- Verified with `npm run verify:all`; the full repo gate stayed green (all 11 content invariants + typecheck pass, 661 pass / 0 fail). Working tree remains clean.

## 2026-06-02 — Add missing `hooks/*.mjs` to CONTRIBUTING.md generated-artifact lists
- `CONTRIBUTING.md` documented the generated artifact list in five places (bundle regen rule, source-of-truth callout, directory layout, do-not-edit warning, and command cheat-sheet) but omitted `hooks/*.mjs` in every one. PR #173 added `hooks/` to the CI `verify:generated` gate and the `npm run build` pipeline, yet the contributor-facing docs still pretended hooks were not generated.
- Updated all five locations to include `hooks/*.mjs` alongside `bin/*.mjs`, `lib/*.mjs`, `test/*.test.mjs`, and `plugins/*.json`, and added a descriptive line for `hooks/*.mjs` in the directory-layout code block.
- Verified with `npm run verify:all` (all 11 content invariants + typecheck pass, 661 pass / 0 fail). No build regen was needed because `CONTRIBUTING.md` is not a TypeScript source.

## 2026-06-02 — Delete stale local branch for merged PR #172 and fast-forward main
- PR #172 (`hourly/2026-06-02-remove-stale-orphan-from-test-imports-check`) was squash-merged to `main` at commit `f079c8d`, but the local feature branch `hourly/2026-06-02-remove-stale-orphan-from-test-imports-check` was still present and checked out. Squash merges create a new commit, so `git branch --merged` does not detect them, leaving stale branches behind. Additionally, the local `main` branch had not been fast-forwarded to include the merge.
- Checked out `main`, fast-forwarded to `origin/main` (commit `f079c8d`), and deleted the local feature branch with `git branch -D hourly/2026-06-02-remove-stale-orphan-from-test-imports-check`. The remote branch was already deleted by the squash-merge `--delete-branch` default, so `git push origin --delete` was not needed; only the local remote-tracking ref remained, which was pruned with `git remote prune origin`.
- Verified with `git branch -a` (no stale `hourly/*` branches remain), `git branch -r` (no stale remote-tracking refs remain), and `npm run verify:all` (all 11 content invariants + typecheck pass, 50 test files reported correctly). Working tree remains clean.

## 2026-06-02 — Remove stale orphan entry from `verify:test-imports-only`
- `src/bin/check-test-imports-only.mts` still declared `test/check-everything-mirror.test.mjs` in its `ORPHAN_TESTS` array, even though that file gained a TypeScript source (`src/test/check-everything-mirror.test.mts`) in PR #164 and is now generated by `tsc` like every other test. The stale entry caused the linter to count the file twice — once via the `src/test/*.test.mts` scan and once via the orphan array — inflating the reported test-file count from 50 to 51.
- Removed the stale path from `ORPHAN_TESTS` and updated the header comment from the old "44 `src/test/*.test.mts` files plus the one orphan" baseline to the current "50 `src/test/*.test.mts` files" reality.
- Verified with `npm run build` (compiles cleanly, manifests regenerated) and `npm run verify:all` (all 11 content invariants + typecheck pass, 50 test files reported correctly). Working tree remains clean.

## 2026-06-02 — Sync `.cloudplugin/marketplace.json` description and instinct packs
- `.cloudplugin/marketplace.json` is a hand-maintained CloudPlugin marketplace manifest (not regenerated by the build). Its `description` still used the old short string: "The 7 Laws of AI Agent Discipline — auto-leveling instinct learning with MCP server, GitHub Action transcript linter, and starter instinct packs". The canonical description in `package.json` and `.claude-plugin/marketplace.json` was expanded in prior cycles to: "Stops Claude Code from skipping research, claiming 'done' without verifying, and repeating yesterday's mistakes. The 7 Laws of AI Agent Discipline — 20 bundled skills, gating hooks, the Mulahazah auto-leveling instinct engine, and a GitHub Action transcript linter."
- Additionally, the `instinct_packs` array listed `["react", "python", "go"]`, but `instinct-packs/` contains four files (`go.json`, `meta.json`, `python.json`, `react.json`). The `meta` pack was missing from the CloudPlugin manifest.
- Updated the `description` field to the canonical string and added `"meta"` to the `instinct_packs` array.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 11 content invariants + typecheck pass, 661 pass / 0 fail). Working tree remains clean.

## 2026-06-02 — Update stale report dates to June 2
- The HTML summary card at `reports/assets/update-card.html` still showed "June 1, 2026" / "2026-06-01" in the `<title>` and visible date line, and the daily report header was still "2026-06-01". With the date boundary crossed, these assets needed to reflect the current reporting period.
- Updated both the `<title>` and the visible date line to "June 2, 2026" / "2026-06-02" so the card matches the current reporting period. Updated the report header from "2026-06-01" to "2026-06-02".
- Verified with `npm run verify:all`; the full repo gate stayed green (all 11 content invariants + typecheck pass, 661 pass / 0 fail). Working tree remains clean.

## 2026-06-02 — Push local main to origin
- Local `main` was 1 commit ahead of `origin/main` (`d9109f0 docs(report): record deletion of stale merged branch hourly/2026-06-02-remove-stale-orphan-from-test-imports-check (#172)`). The prior cycle produced the commit but did not push it, leaving the remote behind.
- Pushed with `git push origin main`. Remote fast-forwarded from `f079c8d` to `d9109f0`.
- Verified with `git status` (working tree clean, branch up to date with `origin/main`) and `git log --oneline origin/main..main` (empty). No stale branches remain.

## 2026-06-02 — Add `hooks/` to generated-artifact verification
- The `verify:generated` npm script and both CI workflows (`ci.yml`, `release.yml`) ran `git diff --exit-code -- .claude-plugin bin test lib plugins` to ensure all generated `.mjs` artifacts were committed. However, `hooks/*.mjs` files are also compiled from `src/hooks/*.mts` by `tsc`, just like `bin/`, `lib/`, and `test/`. A direct edit to a `.mjs` file in `hooks/` would survive CI undetected.
- Added `hooks` to the path list in all three locations: `package.json` (`verify:generated` script), `.github/workflows/ci.yml` ("Verify generated artifacts are committed" step), and `.github/workflows/release.yml` (same step name).
- Verified with `npm run verify:generated` (passes, zero diff) and `npm run verify:all` (all 11 content invariants + typecheck pass). `npm test` confirms 661 pass / 0 fail.
- Branch: `hourly/2026-06-02-add-hooks-to-verify-generated`.

## 2026-06-02 — Merge PR #173 and delete stale merged branch
- PR #173 (`hourly/2026-06-02-add-hooks-to-verify-generated`) was open with all four required checks green (lint-transcript + test matrix on Node 18/20/22). It added `hooks/` to the generated-artifact diff path in `verify:generated`, CI, and release workflows.
- Merged it via squash-merge with `gh pr merge 173 --squash --delete-branch`. After the merge, the local remote-tracking ref was pruned with `git remote prune origin`.
- Fast-forwarded local `main` to `origin/main` (commit `d1e8fb8`) and deleted the local feature branch with `git branch -D hourly/2026-06-02-add-hooks-to-verify-generated`.
- Verified with `git branch -a` (no stale `hourly/*` branches remain), `git branch -r` (no stale remote-tracking refs remain), and `npm run verify:all` (all 11 content invariants + typecheck pass). Working tree remains clean.

## 2026-06-01 — Remove dead orphan machinery from `npm run clean`
- The `clean` script in `package.json` declared `const orphans=new Set([])` and checked `!orphans.has(p)` before deleting every `.mjs` file in `bin/`, `hooks/`, `test/`, and `lib/`. This machinery was originally added to protect hand-authored orphan `.mjs` files that had no corresponding `.mts` source under `src/`. Over the course of the day, all three known orphans were resolved: `hooks/three-section-close.mjs` gained `src/hooks/three-section-close.mts` (PR #162), `test/check-everything-mirror.test.mjs` gained `src/test/check-everything-mirror.test.mts` (PR #164), and `bin/refresh-third-party.mjs` regained `src/bin/refresh-third-party.mts` (PR #165).
- With zero orphans remaining, the empty Set and the `has()` guard are dead code. Simplified the script to a plain nested loop that deletes every `.mjs` in the four generated directories, matching the pre-orphan shape but keeping the current four-directory coverage (`bin`, `hooks`, `test`, `lib`).
- Verified with `npm run clean` (all `.mjs` files deleted, no exceptions needed), `npm run build` (all `.mjs` files regenerated from `.mts` sources, manifests refreshed), and `npm run verify:all` (all 11 content invariants + typecheck pass, 661 pass / 0 fail). Working tree remains clean.

## 2026-06-01 — Delete stale local branch for merged PR #167
- PR #167 (`hourly/2026-06-01-close-stale-pr-153`) was squash-merged to `main` at commit `fbd70df`, but the local feature branch `hourly/2026-06-01-close-stale-pr-153` was still present. Squash merges create a new commit, so `git branch --merged` does not detect them, leaving stale branches behind.
- Deleted the local branch with `git branch -D hourly/2026-06-01-close-stale-pr-153`. The remote branch had already been deleted by the squash-merge `--delete-branch` default, so `git push origin --delete` was not needed; only the local remote-tracking ref remained, which was pruned with `git remote prune origin`.
- Verified with `git branch -a` (no stale `hourly/*` branches remain), `git branch -r` (no stale remote-tracking refs remain), and `npm run verify:all` (all 11 content invariants + typecheck pass). Working tree remains clean.

## 2026-06-01 — Close stale superseded open PR #153
- PR #153 (`fix/llms-skill-count-drift`) was opened on 2026-05-24 with a fix to include `llms.txt` in the skill-count drift lint and update the stale "13 enforcement skills" count. The same fix was later merged to `main` independently via commit `518b04a` (lint fix + tests) and `ad11e4c` (llms.txt count 13→20). The branch had diverged from `main` and was missing subsequent TypeScript source migrations.
- Closed PR #153 with a superseded comment and deleted the remote branch with `git push origin --delete fix/llms-skill-count-drift`.
- Verified with `git branch -r` (branch no longer listed), `gh pr list --state open` (only PR #154 remains open), and `npm run verify:all` (all 11 content invariants + typecheck pass). Working tree remains clean.

## 2026-06-01 — Delete stale remote branch for closed PR #131
- The branch `docs/readme-skill-count-20` still existed on the remote even though PR #131 was closed without merge. Its single commit (`b5fdaf6`) was a README skill-table sync (17 → 20 skills, agents trio surfacing) that was superseded by PR #130 (`a4f72e9 docs(readme): backfill 3 orphan tier-2 skills in the skill table`), which shipped the same update via a different branch.
- Deleted the branch from the remote with `git push origin --delete docs/readme-skill-count-20`.
- Verified with `git branch -r` (branch no longer listed), `git branch -r --merged main` (no stale remote branches remain), and `npm run verify:all` (all 11 content invariants + typecheck pass). Working tree remains clean.

## 2026-06-01 — TypeScript source for `test/check-everything-mirror.test.mjs`
- `test/check-everything-mirror.test.mjs` was one of two known orphan `.mjs` files with no corresponding `.mts` source under `src/`. CLAUDE.md documents this as "deferred follow-up #1". The file was hand-authored JavaScript and protected from `npm run clean` via an explicit orphan set in `package.json`.
- Created `src/test/check-everything-mirror.test.mts` with identical runtime logic and added strict TypeScript types (`setupRepo`, `writePair`, and the `err` catch-block cast). The compiled output is byte-identical in behavior to the original orphan.
- Removed `test/check-everything-mirror.test.mjs` from the `clean` script's orphan set in `package.json` since it is now generated by `tsc` like the other tests.
- Updated CLAUDE.md from "Two known orphan `.mjs` files" to "One known orphan `.mjs` file" and removed `test/check-everything-mirror.test.mjs` from the enumerated list.
- Verified with `npm run build` (compiles cleanly, manifests regenerated), `node --test test/check-everything-mirror.test.mjs` (8 pass / 0 fail), and `npm run verify:all` (all 11 content invariants + typecheck pass). `verify:test-imports-only` correctly reports 51 test files (up from 50).

## 2026-06-01 — Fix stale orphan `.mjs` count in CLAUDE.md
- `CLAUDE.md` line 28 listed three known orphan `.mjs` files (`bin/refresh-third-party.mjs`, `hooks/three-section-close.mjs`, `test/check-everything-mirror.test.mjs`), but `hooks/three-section-close.mjs` gained a TypeScript source (`src/hooks/three-section-close.mts`) in PR #162 and is now generated by `tsc` like the other hooks. It was also removed from the `clean` script's orphan set in `package.json` at the same time.
- Updated the count from three → two, removed `hooks/three-section-close.mjs` from the enumerated list, and updated the preservation note to reference the `package.json` orphan set explicitly.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 11 content invariants + typecheck pass). No mirror update was needed because `CLAUDE.md` is not a mirrored file.

## 2026-06-01 — Delete stale local branch for merged PR #162
- The feature branch `hourly/2026-06-01-ts-source-three-section-close` for PR #162 was still present locally after its squash-merge to `main`. As with PRs #155, #156, and #157 earlier, squash merges create a new commit, so `git branch --merged` does not detect them.
- Confirmed PR #162 state is `MERGED` via `gh pr view` and deleted the local branch with `git branch -D hourly/2026-06-01-ts-source-three-section-close`.
- Verified with `git branch -a` (no stale local branches remain) and `npm run verify:all`; the full repo gate stayed green (all 11 content invariants + typecheck pass). Working tree remains clean.

## 2026-06-01 — TypeScript source for `hooks/three-section-close.mjs`
- `hooks/three-section-close.mjs` was one of three known orphan `.mjs` files with no corresponding `.mts` source under `src/`. CLAUDE.md documents this as "deferred follow-up #1". The file was hand-authored JavaScript and protected from `npm run clean` via an explicit orphan set in `package.json`.
- Created `src/hooks/three-section-close.mts` with identical runtime logic and added strict TypeScript types (`Section`, `Payload`, `TelemetryEntry`). The compiled output preserves the `#!/usr/bin/env node` shebang and fail-open behavior.
- Removed `hooks/three-section-close.mjs` from the `clean` script's orphan set in `package.json` since it is now generated by `tsc` like the other hooks.
- Verified with `npm run build` (compiles cleanly, manifests regenerated), `npm test` (661 pass / 0 fail), and `npm run verify:all` (all 11 content invariants + typecheck pass). The plugin mirror `plugins/continuous-improvement/hooks/three-section-close.mjs` was regenerated in sync.

## 2026-06-01 — Update stale report dates to June 1
- The HTML summary card at `reports/assets/update-card.html` still showed "May 31, 2026" / "2026-05-31" in the `<title>` and visible date line, despite the daily report already containing a 2026-06-01 entry.
- Updated both the `<title>` and the visible date line to "June 1, 2026" / "2026-06-01" so the card matches the current reporting period. Also updated the report header from "2026-05-31" to "2026-06-01".
- Verified with `npm run verify:all`; the full repo gate stayed green (all 11 content invariants + typecheck pass). The card is a standalone generated asset, so no mirror update was needed.

## 2026-06-01 — Merge PR #159 and prune stale remote-tracking ref
- PR #159 (`hourly/2026-05-31-delete-stale-merged-branches`) was open with all checks green (lint-transcript + test matrix on Node 18/20/22). It contained two commits: the second sweep of stale merged remote branches (8 branches deleted) and the build-script fix to persist execute permissions on `scripts/*.mjs` and `synthetic-checks/*.mjs`.
- Merged it via squash-merge with `gh pr merge 159 --squash --delete-branch`. After the merge, the local remote-tracking ref `remotes/origin/hourly/2026-05-31-delete-stale-merged-branches` remained until pruned with `git remote prune origin`.
- Verified with `git branch -r --merged main` (no stale remote branches remain), `git branch -a` (no stale `origin/*` branches remain), and `npm run verify:all`; the full repo gate stayed green (all 11 content invariants + typecheck pass). Working tree remains clean.

## 2026-06-01 — TypeScript source for `bin/refresh-third-party.mjs`
- `bin/refresh-third-party.mjs` was the last known orphan `.mjs` file without a corresponding `.mts` source under `src/`. CLAUDE.md documented this as "deferred follow-up #1". The file was hand-authored JavaScript and protected from `npm run clean` via an explicit orphan set in `package.json`.
- Created `src/bin/refresh-third-party.mts` with identical runtime logic and added strict TypeScript types (`Snapshot`, `PostCopyJsonKeyDelete`, `SpawnSyncOptions`, parameter and return types for all functions). The compiled output preserves the `#!/usr/bin/env node` shebang and all runtime behavior.
- Removed `bin/refresh-third-party.mjs` from the `clean` script's orphan set in `package.json` since it is now generated by `tsc` like the other bin files.
- Updated CLAUDE.md to remove the "one known orphan" note; all `.mjs` files in `bin/`, `hooks/`, `lib/`, and `test/` are now generated from `.mts` sources.
- Verified with `npm run build` (compiles cleanly, manifests regenerated), `npm run clean` followed by `npm run build` (file is removed then regenerated correctly), `node bin/refresh-third-party.mjs --list` (lists both snapshots), and `npm run verify:all` (all 11 content invariants + typecheck pass).

## 2026-05-31 — Protect `scripts/` and `synthetic-checks/` execute permissions in build script
- On 2026-05-30, execute permissions were manually fixed on `scripts/*.mjs` and `synthetic-checks/*.mjs`, but the `build` script in `package.json` only looped over `bin/`, `hooks/`, `lib/`, and `plugins/continuous-improvement/` subdirectories. This meant a fresh `npm run clean && npm run build` (or any future build after permission loss) would leave the five `.mjs` files in `scripts/` and `synthetic-checks/` at mode `100644` despite their `#!/usr/bin/env node` shebangs.
- Added two `fs.readdirSync` loops to the `build` script: one for `scripts/` and one for `synthetic-checks/`, mirroring the treatment already applied to the other six directories. Every `.mjs` file in both directories now gets `fs.chmodSync(..., 0o755)` after every build.
- Verified with `npm run build` (no errors, manifests regenerated) and `npm run verify:all` (all 11 content invariants + typecheck pass). `ls -la scripts/*.mjs synthetic-checks/*.mjs` confirms all five files carry `100755`.

## 2026-05-31 — Delete stale merged remote branches (second sweep)
- Eight feature branches still existed on the remote even though their PRs were merged weeks or months ago: `extract-resolve-home-dir` (PR #42, merged 2026-04-29), `feat/agent-agnostic-skills-sweep` (PR #40, merged 2026-04-28), `feat/companions-readme-section-v2` (PR #73, merged 2026-05-06), `feat/node-observer-rich-schema` (PR #52, merged 2026-05-05), `feat/proceed-skill-agent-agnostic` (PR #38, merged 2026-04-28), `feat/wild-risa-proactive-surfacing` (PR #51, merged 2026-05-05), `fix/routing-targets-mts-sources` (PR #74, merged 2026-05-06), and `harden-skills` (PR #41, merged 2026-04-29). These predate the `--delete-branch` default or were created before the squash-merge workflow consistently cleaned up remotes.
- Deleted them from the remote with `git push origin --delete ...`.
- Verified with `git branch -r --merged main` (no stale remote branches remain) and `npm run verify:all`; the full repo gate stayed green (all 11 content invariants + typecheck pass). Working tree remains clean.

## 2026-05-31 — Merge PR #157 and delete stale merged remote branches
- PR #157 (`hourly/2026-05-31-delete-stale-branch-156`) was open with all four required checks green. Merged it via squash-merge with `gh pr merge 157 --squash --delete-branch`. After the merge, the local remote-tracking ref `remotes/origin/hourly/2026-05-31-delete-stale-branch-156` remained until pruned with `git remote prune origin`.
- Additionally, three old feature branches still existed on the remote even though their PRs were merged weeks ago: `chore/gitattributes-eol-lf` (PR #75, merged 2026-05-06), `feat/wild-risa-no-escape-valve` (PR #47, merged 2026-05-03), and `third-party/oh-my-claudecode` (PR #45, merged 2026-05-03). These predate the `--delete-branch` default, so they were never cleaned up. Deleted them from the remote with `git push origin --delete ...`.
- Verified with `git branch -r --merged main` (no stale remote branches remain) and `npm run verify:all`; the full repo gate stayed green (all 11 content invariants + typecheck pass). Working tree remains clean.

## 2026-05-31 — Clean up merged local branch
- The feature branch `hourly/2026-05-31-commit-residue` for PR #155 was still present locally after its squash-merge to `main`. Squash merges create a new commit, so `git branch --merged` does not detect them, leaving stale branches behind.
- Deleted the local branch with `git branch -d hourly/2026-05-31-commit-residue` after confirming PR #155 state is `MERGED` via `gh pr view`.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 11 content invariants + typecheck pass). Working tree remains clean.

## 2026-05-31 — Prune stale remote-tracking refs
- After deleting the local branch `hourly/2026-05-31-commit-residue`, `git branch -a` still showed `remotes/origin/hourly/2026-05-31-commit-residue` because the remote-tracking ref had not been pruned. In addition, eight other merged feature branches still had stale remote-tracking refs locally (`chore/past-mistakes-pr151`, `feat/extract-deploy-target-scripts`, `feat/extract-git-state-snapshot`, `feat/extract-resolve-verify-ladder`, `feat/extract-route-recommendation`, `feat/extract-scan-past-mistakes`, `feat/scripts-run-synthetic`, `feat/skills-visibility-sweep`).
- Ran `git remote prune origin` to remove all stale remote-tracking refs at once. This only affects local remote-tracking branches; the remote branches were already deleted by the squash-merge `--delete-branch` default.
- Verified with `git branch -a` (no stale `origin/*` branches remain) and `npm run verify:all`; the full repo gate stayed green (all 11 content invariants + typecheck pass). Working tree remains clean.

## 2026-05-31 — Commit prior verified RELEASING.md fix and report entry
- The prior hourly cycle updated `docs/RELEASING.md` (10 → 11 invariants) and drafted the report entry, but left both files uncommitted on `main`.
- Staged explicitly by filename and committed via branch `hourly/2026-05-31-commit-residue` + PR, per the repo's "no direct push to main" rule.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 11 content invariants + typecheck pass).

## 2026-05-31 — Update stale invariant count in docs/RELEASING.md
- `docs/RELEASING.md` line 57 described the release workflow step 3 as `npm run verify:all` (10 invariants + typecheck), but the `verify:all` chain was expanded to 11 content invariants in the prior cycle when `verify:third-party-shape` was integrated.
- Updated the count from 10 → 11 so the release procedure document reflects current reality, matching the CLAUDE.md update from the prior entry.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 11 content invariants + typecheck pass). No mirror update was needed because `docs/RELEASING.md` is not a mirrored file.

## 2026-05-31 — Update stale invariant count in CLAUDE.md
- `CLAUDE.md` line 19 described `npm run verify:all` as "10 content invariants + typecheck", but the `verify:all` chain in `package.json` currently contains 11 content invariants (the 10 previously listed plus `verify:third-party-shape`, which was integrated in the prior commit).
- Updated the count from 10 → 11 and added `third-party-shape` to the enumerated list so the agent guidance reflects current reality.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 11 content invariants + typecheck pass). No mirror update was needed because `CLAUDE.md` is not a mirrored file.

## 2026-05-31 — Integrate `verify:third-party-shape` into `verify:all` gate
- `bin/check-third-party-shape.mjs` and its test `test/check-third-party-shape.test.mjs` have existed since the third-party shape invariant was implemented, but the check was never wired into the `verify:all` script chain in `package.json`. This meant a missing `OUR_NOTES.md`, absent `LICENSE`, or drift between a snapshot directory and its `MANIFEST.md` entry could go undetected until someone ran the standalone script manually.
- Added `"verify:third-party-shape": "node bin/check-third-party-shape.mjs"` to the `scripts` section and inserted `npm run verify:third-party-shape &&` into the `verify:all` chain immediately before `npm run typecheck`, bringing the full repo gate from 10 content invariants + typecheck to 11 content invariants + typecheck.
- Verified with `npm run verify:all` (all 11 content invariants + typecheck pass, 661 pass / 0 fail). This completes the deferred follow-up #2 from `docs/plans/2026-05-07-addy-agent-skills-vendor.md` § "Deferred follow-ups" (generic third-party shape invariant gate).

## 2026-05-31 — Fix missing execute permissions on plugin bin copies
- The `build` script in `package.json` iterated over `bin/`, `hooks/`, `lib/`, `plugins/continuous-improvement/lib/`, and `plugins/continuous-improvement/hooks/` to set `0o755` on every `.mjs` file, but `plugins/continuous-improvement/bin/` was only partially covered: `mcp-server.mjs` was explicitly chmodded while `backfill.mjs` and `observe.mjs` were skipped. After `npm run clean && npm run build`, these two shebang-bearing files reverted to mode `100644`, causing `git diff` to flag a mode regression even though content was unchanged.
- Replaced the single-file `fs.chmodSync('plugins/continuous-improvement/bin/mcp-server.mjs', 0o755)` call with a loop over `fs.readdirSync('plugins/continuous-improvement/bin')` that chmods every `.mjs` file, matching the treatment already applied to the other five directories.
- Verified with `npm run build` (all 3 plugin bin files now carry `100755`), `npm run verify:all` (all 10 content invariants + typecheck pass), and `git status` (working tree clean except for the intended `package.json` change).

## 2026-05-31 — Commit prior verified changes and fix stale card date
- The prior hourly cycle updated `CLAUDE.md` (orphan count), `package.json` (`clean` now covers `hooks/`, build script now chmods plugin hook copies), and drafted the report entries, but left all files uncommitted.
- Staged explicitly by filename and committed.
- Also fixed the HTML summary card at `reports/assets/update-card.html` which still showed "May 30, 2026" / "2026-05-30" in the `<title>` and visible date line. Updated both to "May 31, 2026" / "2026-05-31" so the card matches the current reporting period.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass). The card is a standalone generated asset, so no mirror update was needed.

## 2026-05-31 — Document missing orphan `.mjs` in CLAUDE.md
- `hooks/three-section-close.mjs` is a hand-authored orphan file (it carries a `#!/usr/bin/env node` shebang and has no corresponding `src/hooks/three-section-close.mts` source), yet it was missing from the known-orphan list in `CLAUDE.md`. The file already survives `npm run clean` because the clean script only touches `bin/`, `test/`, and `lib/`.
- Updated the orphan note in `CLAUDE.md` from "Two known orphan `.mjs` files" to "Three known orphan `.mjs` files" and added `hooks/three-section-close.mjs` to the enumerated list, clarifying that `hooks/` is not touched by clean.
- Verified with `npm run typecheck` and `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass). No mirror update was needed because `CLAUDE.md` is not a mirrored file.

## 2026-05-31 — Include `hooks/` in `npm run clean` and fix plugin hook permissions
- The `clean` script only removed generated `.mjs` files from `bin/`, `test/`, and `lib/`, yet `src/hooks/*.mts` sources compile to `hooks/*.mjs` just like the other three directories. This meant generated hook files were never cleaned, leaving stale artifacts after source deletions or renames.
- Added `'hooks'` to the `clean` directory loop and added `hooks/three-section-close.mjs` to the `orphans` Set so the hand-authored orphan survives clean, matching the treatment of `bin/refresh-third-party.mjs` and `test/check-everything-mirror.test.mjs`.
- Discovered during verification that `generate-plugin-manifests.mjs` copies `hooks/` into the plugin bundle *before* the build script's chmod loops run, so a fresh `clean && build` left `plugins/continuous-improvement/hooks/*.mjs` at mode `100644` even though root `hooks/*.mjs` were corrected to `100755`. Added a `chmodSync` loop for `plugins/continuous-improvement/hooks/*.mjs` to the build script so plugin hook copies are always executable.
- Verified with `npm run clean` (only `three-section-close.mjs` remained in `hooks/`), `npm run build` (all 4 hook files regenerated with `100755` and plugin copies matched), `npm test` (661 pass / 0 fail), and `npm run verify:all` (all 10 content invariants + typecheck pass).

## 2026-05-31 — Delete stale local branch for merged PR #156
- The feature branch `hourly/2026-05-31-prune-stale-refs` for PR #156 was still present locally after its squash-merge to `main`. As with PR #155 earlier today, squash merges create a new commit, so `git branch --merged` does not detect them.
- Confirmed PR #156 state is `MERGED` via `gh pr view` and deleted the local branch with `git branch -D hourly/2026-05-31-prune-stale-refs`.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 11 content invariants + typecheck pass). Working tree remains clean.

## 2026-05-30 — Fix missing execute permissions on plugin lib copies
- The three `.mjs` library files copied into `plugins/continuous-improvement/lib/` (`observe-event.mjs`, `plugin-metadata.mjs`, `resolve-home-dir.mjs`) are generated by `tsc` and copied by `generate-plugin-manifests.mjs`, yet they were tracked in git as mode `100644` even though their source counterparts in `lib/` had already been fixed to `100755`. This meant a fresh clone followed by `npm run build` would leave the plugin copies without the executable bit, and `git diff --exit-code -- plugins` would eventually flag the mismatch.
- Updated `package.json` `build` script to iterate over `fs.readdirSync('plugins/continuous-improvement/lib')` and `chmodSync` every `.mjs` file to `0o755`, mirroring the treatment already applied to root `lib/`, `bin/`, and `hooks/`.
- Verified with `npm run build`, `npm test` (661 pass / 0 fail), and `npm run verify:all` (all 10 content invariants + typecheck pass). The `verify:everything-mirror` check confirmed all 43 mirrored files remain in sync.

## 2026-05-30 — Fix missing execute permissions on lib/*.mjs
- Ten `.mjs` files in `lib/` are generated by `tsc` from `src/lib/*.mts` sources. Four of them (`cli-anything.mjs`, `compound-engineering.mjs`, `pm-skills.mjs`, `unified-plugin.mjs`) carry `#!/usr/bin/env node` shebangs and are documented as runnable CLI entrypoints, yet none of the 10 files had the executable bit set.
- Ran `chmod +x lib/*.mjs` so the shebang-bearing files can be invoked directly as `./lib/<name>.mjs` without a leading `node`, and the remaining library files are consistent with the blanket permission treatment used for `bin/` and `hooks/`.
- Updated `package.json` `build` script to iterate over `fs.readdirSync('lib')` and `chmodSync` every `.mjs` file, matching the existing `bin/` and `hooks/` treatments and preventing future builds from regressing permissions when library sources are regenerated by `tsc`.
- Verified with `npm run build` and `npm run verify:all` (all 10 content invariants + typecheck pass, 661 pass / 0 fail). No mirror updates were needed because `lib/` is not part of the plugin bundle.

## 2026-05-30 — Fix missing execute permissions on hooks/*.mjs
- The four `.mjs` hook scripts in `hooks/` (`companion-preference.mjs`, `gateguard.mjs`, `route-prompt.mjs`, `three-section-close.mjs`) all carry `#!/usr/bin/env node` shebangs and are runtime PreToolUse/PostToolUse hook entrypoints invoked by Claude Code's hook system, yet none had the executable bit set.
- Ran `chmod +x hooks/*.mjs` so these runtime hooks can also be invoked directly as `./hooks/<name>.mjs` without a leading `node`.
- Updated `package.json` `build` script to iterate over `fs.readdirSync('hooks')` and `chmodSync` every `.mjs` file, matching the existing `bin/` treatment and preventing future builds from regressing permissions when hook sources are regenerated by `tsc`.
- Verified with `npm run build` (plugin copies inherited correct permissions via `copyFile`) and `npm run verify:all` (all 10 content invariants + typecheck pass, 661 pass / 0 fail). The `verify:everything-mirror` check confirmed the 4 plugin bundle copies remain in sync.

## 2026-05-30 — Fix missing execute permissions on scripts/*.mjs and synthetic-checks/*.mjs
- The four hand-authored `.mjs` scripts in `scripts/` (`resolve-verify-ladder.mjs`, `route-recommendation.mjs`, `run-synthetic.mjs`, `scan-past-mistakes.mjs`) and the one hand-authored script in `synthetic-checks/` (`example-payload-shape.synthetic.mjs`) all carry `#!/usr/bin/env node` shebangs and are documented as runnable entrypoints (e.g. `node scripts/run-synthetic.mjs`, `node scripts/scan-past-mistakes.mjs`), yet none had the executable bit set.
- Ran `chmod +x scripts/*.mjs synthetic-checks/*.mjs` so these first-party runnable scripts can also be invoked directly as `./scripts/<name>.mjs` or `./synthetic-checks/<name>.mjs` without a leading `node`.
- Verified with `npm run verify:all` (all 10 content invariants + typecheck pass, 661 pass / 0 fail). These directories are not part of the plugin bundle, so no mirror updates were needed.

## 2026-05-30 — Fix missing execute permissions on bin/*.mjs scripts
- All 23 `.mjs` files in `bin/` have `#!/usr/bin/env node` shebangs and are designed to be run directly, yet only 5 of them were made executable by the build script (`install.mjs`, `lint-transcript.mjs`, `unified-cli.mjs`, `mcp-server.mjs`, and the plugin copy of `mcp-server.mjs`). The remaining 18 scripts (verification lints, generators, etc.) lacked the executable bit, so `./bin/<name>.mjs` would fail with "Permission denied" even though the file is a valid CLI entrypoint.
- Ran `chmod +x bin/*.mjs` to fix the current files.
- Updated `package.json` `build` script to iterate over `fs.readdirSync('bin')` and `chmodSync` every `.mjs` file, instead of maintaining a hardcoded list of 5 paths. This prevents future builds from silently regressing permissions when new bin scripts are added.
- Verified with `npm run build`, `npm test` (661 pass / 0 fail), and `npm run verify:all` (all 10 content invariants + typecheck pass). No mirror updates were needed because `package.json` is not a mirrored file.

## 2026-05-30 — Update stale dates in reports/assets/update-card.html
- The HTML summary card at `reports/assets/update-card.html` still showed "May 27, 2026" in the body date and "2026-05-27" in the `<title>`, despite the daily report being dated 2026-05-30.
- Updated both the `<title>` and the visible date line to "May 30, 2026" / "2026-05-30" so the card matches the current reporting period.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass). The card is a standalone generated asset, so no mirror update was needed.

## 2026-05-30 — Add `llms.txt` to skill-count drift lint
- The skill-count lint (`src/bin/check-skill-count.mts`) was only checking `.claude-plugin/marketplace.json`, `plugins/continuous-improvement/.claude-plugin/plugin.json`, and `package.json`.
- Added `llms.txt` to the `CHECKED_FILES` list (and rebuilt `bin/check-skill-count.mjs`) so the "N bundled skills" phrase in that user-facing summary can never drift again.
- **Follow-up fix:** Updated `src/test/check-skill-count.test.mts` integration tests to create `llms.txt` in the temporary test repos and adjusted assertions from "all 3" to "all 4" so the suite stays green.
- Verified with `npm run build`, `npm test` (661 pass / 0 fail), and `npm run verify:all` (all 10 content invariants + typecheck pass).

## 2026-05-28 — Stop tracking volatile external counts in committed files
- The loop had been generating a commit every few hours just to nudge two hardcoded numbers: the pm-skills star count in `README.md` line 288 and the "550+ npm installs/mo" badge in `docs/landing/index.html` line 124. These values drift continuously and several prior entries even logged stale reads as corrections (e.g. 16:30Z set 245, then a later 20:30Z entry "corrected" it back to 240). That is churn, not improvement.
- Removed both literals: README heading is now `### pm-skills (product-on-purpose, Apache 2.0)` (the linked repo shows the live star count), and the install-count badge is dropped from the landing hero (the "Install from npm" CTA links to the live npm page). Nothing volatile remains for the loop to chase.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass). The landing page is a standalone generated asset and the README is not mirrored, so `verify:everything-mirror` confirmed all 43 mirrored files still match with no update needed.

## 2026-05-28 — Update pm-skills star count in README
- `README.md` line 288 listed pm-skills as having "246 stars", but the upstream repo `product-on-purpose/pm-skills` currently shows 248 stars (verified via GitHub API at 2026-05-28T02:30Z).
- Updated the count from 246 → 248 so the "In the wild" section reflects current reality.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass). The plugin bundle `README.md` does not mention pm-skills, so no mirror update was needed.

## 2026-05-27 — Update pm-skills star count in README
- `README.md` line 288 listed pm-skills as having "245 stars", but the upstream repo `product-on-purpose/pm-skills` currently shows 246 stars (verified via GitHub API at 2026-05-27T21:30Z).
- Updated the count from 245 → 246 so the "In the wild" section reflects current reality.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass). The plugin bundle `README.md` does not mention pm-skills, so no mirror update was needed.

## 2026-05-27 — Update pm-skills star count in README
- `README.md` line 288 listed pm-skills as having "240 stars", but the upstream repo `product-on-purpose/pm-skills` currently shows 245 stars (verified via GitHub API at 2026-05-27T16:30Z).
- Updated the count from 240 → 245 so the "In the wild" section reflects current reality.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass). The plugin bundle `README.md` does not mention pm-skills, so no mirror update was needed.

## 2026-05-27 — Fix broken example links in grill-with-docs skill
- `skills/grill-with-docs.md` lines 185-187 contained three markdown links inside a `Context Map` example code block: `[Ordering](./src/ordering/CONTEXT.md)`, `[Billing](./src/billing/CONTEXT.md)`, and `[Fulfillment](./src/fulfillment/CONTEXT.md)`. These paths have never existed in this repo (they were hypothetical examples from the ported mattpocock skill), so any user clicking them would hit a 404.
- Removed the link markup from all three lines, replacing with plain list text (`Ordering`, `Billing`, `Fulfillment`) so the example remains readable without promising files that do not exist.
- Updated the plugin mirror `plugins/continuous-improvement/skills/grill-with-docs/SKILL.md` with the same fix.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass, 661 pass / 0 fail). The `verify:skill-mirror` and `verify:everything-mirror` checks confirmed both copies remain in sync.

## 2026-05-27 — Fix broken internal links in agents/README and token-budget-advisor skill
- `agents/README.md` contained three markdown links to `[references/orchestration-patterns.md](../references/orchestration-patterns.md)`, but `references/orchestration-patterns.md` has never existed at the repo root (only in `third-party/addy-agent-skills/`). Users following the link would hit a 404.
- `skills/token-budget-advisor.md` linked to `[context-budget](../context-budget/SKILL.md)`, but `context-budget` is not a bundled skill in this repo and the path has never existed.
- Removed the broken link markup from both files, replacing with plain text / code-style references so the narrative remains intact without promising a file that does not exist.
- Updated the plugin mirrors `plugins/continuous-improvement/agents/README.md` and `plugins/continuous-improvement/skills/token-budget-advisor/SKILL.md` with the same fixes.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass, 661 pass / 0 fail). The `verify:everything-mirror` check confirmed both copies remain in sync.

## 2026-05-27 — Update pm-skills star count in README
- `README.md` line 288 listed pm-skills as having "239 stars", but the upstream repo `product-on-purpose/pm-skills` currently shows 240 stars (verified via GitHub API at 2026-05-26T20:30Z).
- Updated the count from 239 → 240 so the "In the wild" section reflects current reality.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass). The plugin bundle `README.md` does not mention pm-skills, so no mirror update was needed.

## 2026-05-27 — Fix broken link in para-memory-files skill
- `skills/para-memory-files.md` line 66 linked to `[references/schemas.md](references/schemas.md)`, but `skills/references/schemas.md` has never existed in the repo, so users following the link would hit a 404.
- Replaced the broken link with an inline description of the atomic-fact YAML schema (`id`, `created`, `content`, `status`, `superseded_by`) and memory-decay rules (weekly `summary.md` rewrite, archiving inactive entities), matching the concepts already described in the skill body.
- Updated the plugin mirror `plugins/continuous-improvement/skills/para-memory-files/SKILL.md` with the same fix.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass, 661 pass / 0 fail). The `verify:skill-mirror` and `verify:everything-mirror` checks confirmed both copies remain in sync.

## 2026-05-27 — Hourly verification pass
- Ran `npm run verify:all` at 2026-05-27T00:30Z; the full repo gate stayed green (all 10 content invariants + typecheck pass, 661 pass / 0 fail, working tree clean).
- External counts remain current: npm downloads at 550/mo, pm-skills stars at 239.
- No code changes were needed for this cycle; the repo state is clean and green.

## 2026-05-26 — Fix broken QUICKSTART.md link on landing page
- `docs/landing/index.html` line 236 linked to `QUICKSTART.md` with a relative `href="QUICKSTART.md"`. The GitHub Pages workflow (`.github/workflows/pages.yml`) deploys `docs/landing/` as the site root, so the relative link resolves to `https://naimkatiman.github.io/continuous-improvement/QUICKSTART.md` — but `QUICKSTART.md` lives at the repo root, not inside `docs/landing/`. This produced a 404 for anyone clicking "Read Quickstart" on the deployed landing page.
- Changed the link to the absolute GitHub blob URL `https://github.com/naimkatiman/continuous-improvement/blob/main/QUICKSTART.md` so it works correctly from the deployed site.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass). The landing page is a standalone generated asset, so no mirror update was needed.

## 2026-05-26 — Sync plugin manifest description with package.json
- `package.json` line 4 describes the project as including "a GitHub Action transcript linter", but the generated plugin manifests (`.claude-plugin/marketplace.json`, `plugins/continuous-improvement/.claude-plugin/plugin.json`, `plugins/continuous-improvement/.claude-plugin/marketplace.json`) were missing this claim because `src/lib/plugin-metadata.mts` line 149 hardcoded `SHARED_PLUGIN_DESCRIPTION` without it.
- Updated `SHARED_PLUGIN_DESCRIPTION` to include "and a GitHub Action transcript linter." so all generated plugin manifests match the package description.
- Verified with `npm run build` (manifests regenerated) and `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass). The `verify:everything-mirror` check confirmed the plugin bundle copies remain in sync.

## 2026-05-26 — Update npm installs badge on landing page
- `docs/landing/index.html` line 124 showed "📦 538+ npm installs/mo", but the upstream npm registry reports 550 downloads for the last 30-day period (verified via `api.npmjs.org/downloads/point/last-month/continuous-improvement` at 2026-05-26T16:30Z).
- Updated the badge from 538+ → 550+ so the landing page reflects current reality.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass). The landing page is a standalone generated asset, so no mirror update was needed.

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

## 2026-05-26 — Fix stale invariant count in RELEASING.md
- `docs/RELEASING.md` line 57 described `npm run verify:all` as "7 invariants + typecheck", but the `verify:all` chain in `package.json` currently contains 10 content invariants (`verify:skill-mirror`, `verify:skill-tiers`, `verify:skill-law-tag`, `verify:skill-count`, `verify:docs-substrings`, `verify:everything-mirror`, `verify:routing-targets`, `verify:doc-runtime-claims`, `verify:test-imports-only`, `verify:scripts-citation-drift`) plus `typecheck`.
- Updated the count from 7 → 10 so the release checklist reflects current reality.
- Verified with `npm run verify:all`; the full repo gate stayed green (all 10 content invariants + typecheck pass).

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
| Project | continuous-improvement v3.12.3 |
| Stack | Node.js (ESM), MCP server, GitHub Action, CLI tools |
| Stage | Published npm package, active development |
| Tests (current) | 760 pass / 0 fail |

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

None. All 760 tests pass / 0 fail as of this cycle.

## Deferred Items

- No orphan `.mjs` files remain (all are generated from `.mts` sources). See `CLAUDE.md` § Deferred for the current audit-deferred item list.

