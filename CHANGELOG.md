# Changelog

All notable changes to this skill are documented here.

---

## [Unreleased]

---

## [3.9.0] — 2026-05-07

Issue-burndown release. Three PRs landed on top of v3.8.0 — one Windows correctness fix, one test-coverage expansion, one CI hardening — closing two long-standing issues (#59, #2) and tightening the regression net for the class of failure #59 surfaced. No skill or behavior changes; this release is reliability and contributor-experience only.

### Fixed

- **Windows checkouts stay clean after `npm run build`** (PR #97, closes #59) — `tsc` was emitting CRLF on Windows when overwriting `.mjs` outputs, clashing with `.gitattributes` `eol=lf`. Eleven `.mjs` files plus eight downstream manifest copies surfaced as zero-content "modified" on every clean Windows build, gaslighting `git status` and making explicit-stage workflows noisy. Fix is one line: `compilerOptions.newLine: "lf"` in `tsconfig.json` so `tsc` emits LF on every platform. No-op on Linux/macOS where `tsc` already emitted LF.

### Added

- **12 new install.mjs test cases across 4 new describe blocks** (PR #98, closes #2) — coverage on `bin/install.mjs` goes from 9 tests (beginner happy path + idempotency + uninstall) to 21 tests covering: expert-mode `session.sh` and MCP server registration, foreign-hook preservation through both install and uninstall, non-hook settings keys (`theme` etc.) preserved, all six command files installed in beginner mode, Node observer artifacts (`bin/observe.mjs` + `lib/observe-event.mjs`) installed alongside `observe.sh`, unknown-command non-zero exit, invalid `--mode` falls back to beginner, `--pack react` loads instincts, `--pack <bogus>` reports the available pack list. Total test count 511 → 523.

### Changed

- **CI `verify-generated` step path widened** (PR #99) — was `git diff --exit-code -- bin test`, now `.claude-plugin bin test lib plugins` to match the `verify:generated` npm script in `package.json`. Future generator drift in `.claude-plugin/`, `lib/`, or `plugins/` (the class of failure #59 named) now fails at PR time instead of slipping through the narrower check.

- **`package-lock.json` synced 3.3.0 → 3.8.0** (PR #99) — lockfile had drifted behind the unified-dispatch release train; running `npm install` on a clean clone produced an unsolicited 4-line lockfile diff. Re-running `npm install` synced it.

### Notes

- Five issues also closed this session by audit comment (no code change): #54 (rename / split decision settled as no-go in favor of unified dispatch), #24 (stale v3.1.0 announcement), #3 (`CONTRIBUTING.md` already exists), #7 (README badge is dynamic shields.io), #57 (duplicate of #59).
- Open issue count 24 → 17. Remaining 17 are roadmap (phase 1–4) plus one unscoped item (#4). No active bugs.

---

## [3.8.0] — 2026-05-07

Unified five-plugin dispatcher train. Six PRs (PR 0, A, B, C, D, E) shipped in dependency order off `feat/unified-dispatch`. Driven by the user's session report (`~/.claude/usage-data/report.html`, 1,218 messages across 178 sessions, 2026-04-10 to 2026-05-07). Ends the two-plugin split between `continuous-improvement:superpowers` (CI dispatcher) and `superpowers:*` (Obra skill bodies) by registering both — plus three more upstream plugins — under one marketplace.

### Added

- **`third-party/pm-skills/` snapshot** (PR 0) — vendored selective copy of `product-on-purpose/pm-skills` v2.13.1 pinned at SHA `8d23508`. 41 product-management skills + 47 commands across the full product lifecycle (discover, define, develop, deliver, measure, iterate). Includes Meeting Skills Family v2.11.0 and OKR Skills v2.12.0. CLAUDE.md stripped on copy per refresh recipe. New `MANIFEST.md` snapshot entry + `OUR_NOTES.md` overlap matrix + integration-candidate triggers.

- **Five upstream plugins registered in marketplace** (PR A) — `.claude-plugin/marketplace.json` now lists six plugins (the CI plugin + five companions: `superpowers`, `agent-skills`, `ruflo-swarm`, `oh-my-claudecode`, `pm-skills`). Source-of-truth lives in `src/lib/plugin-metadata.mts` `THIRD_PARTY_COMPANIONS` constant; `npm run build` regenerates marketplace.json from there. Each `OUR_NOTES.md` "Status: NOT integrated" line was flipped to "Registered as optional install (PR A of 2026-05-07 train)".

- **Unified `/superpowers` dispatcher** (PR B) — `skills/superpowers.md` rewritten with a five-source routing table: each task trigger has a preferred → fallback chain that resolves to the best installed skill across CI-bundled, Obra, Addy, ruflo-swarm, OMC, and pm-skills sources. When no installed plugin in the chain resolves, the dispatcher falls back to inline protocols so the workflow still works on a clean install with only the CI plugin.

- **`proceed-with-the-recommendation` orchestrator extension** (PR C) — Routing Table gains 18 new rows covering cross-plugin routes (5 agent-skills, 2 ruflo-swarm, 3 oh-my-claudecode, 8 pm-skills). Each new row carries the standard "Reference behavior — does not require `<plugin>`" marker. `optional-companions.json` gains 31 new entries (was 18, now 47); two pre-existing references (`context-budget`, `learn-eval`) are now declared. `verify:routing-targets` accounts for 54 routing targets (14 bundled, 47 optional companions).

- **`/release-train` slash command** (PR D) — Long-running autonomous orchestrator for stacked-PR rollouts. Reads a plan doc, opens a worktree per PR in dependency order, ships each through TDD + two-stage subagent review + verify + branch finish + deploy-receipt, halts at policy gates. Maps to the report's "Autonomous Multi-PR Release Trains" horizon item.

- **`/swarm` slash command** (PR D) — Parallel-agent fan-out for evidence-based decision-making. Spawns N sub-agents on isolated worktrees with a shared contract test, produces a comparison report. Default flat topology; hierarchical / mesh / ring / star / adaptive available when ruflo-swarm is installed. Maps to the report's "Parallel Provider-Migration Agents" horizon item.

### Changed

- `getClaudeRepoMarketplaceManifest()` in `src/lib/plugin-metadata.mts` now folds in the new `THIRD_PARTY_COMPANIONS` constant by default, so the regenerated marketplace.json always reflects the five-plugin registration without per-build hand-editing.

### Notes

- Marketplace registration alone makes upstream skill bodies installable on demand. Per-skill verbatim ports into the `plugins/continuous-improvement/skills/` bundle remain single-concern PRs gated on user-pain triggers per each `OUR_NOTES.md` integration-candidates matrix. This release does NOT vendor any upstream skill body into the CI bundle.
- `ruflo-swarm` operational assets reference unpinned `npx @claude-flow/cli@latest`. Supply-chain risk is inert at marketplace-registration time but becomes live the moment a user runs `/plugin install ruflo-swarm@continuous-improvement`. Pinning the CLI version is tracked as a precondition for any future PR that vendors those skills into the CI bundle.

---

## [3.7.0] — 2026-05-07

Two-train release covering items 3–9 from the 28-day usage report's recommendation list. WILD items (autonomous release-train, parallel provider-eval harness) remain on hold.

### Added

- **First release train (PRs #83 + #84)** — gating + lockdown surface:
  - `proceed-with-the-recommendation` Phase 0 Rule 1 now scans a third surface — `~/.claude/projects/<project-hash>/memory/feedback_*.md` — alongside `observations.jsonl` and `CLAUDE.md "Past Mistakes"`. Closes the silent-skip path for the operator's named past-mistake corrections (the canonical home of `feedback_past_mistake_gate.md`, `feedback_no_git_add_all_on_windows.md`, etc.).
  - `gateguard` gains a fifth gate: **Parallel-Actor Gate**. On the first Edit / Write / mutating Bash per session, baseline `git rev-parse HEAD` + `git status --porcelain` + upstream; on every subsequent mutation, re-check and halt on drift. Closes the squash-merge / ahead-of-origin trap class of failures recorded under `feedback_pre_branch_check.md` and `feedback_parallel_actor.md`. Designed for hosts where multi-clauding (a second Claude / Codex / Maulana session on the same working tree) is common — observed at 67% of the operator's recent sessions.
  - **`deploy-receipt` skill** — new Law 4 deploy-seam companion to the vendored `finishing-a-development-branch`. Defines a deploy receipt as three components (deployed SHA matches merge SHA, healthcheck returns 200, build-artifact integrity) verified via three routes (provider CLI, GitHub Deployments API, version-endpoint curl). Wired into `superpowers` workflow as step 8 and into the `proceed-with-the-recommendation` routing table for auto-deploy projects (Railway, Cloudflare Workers, Vercel, Netlify, Fly.io). Vendored Obra `finishing-a-development-branch` is untouched. INCOMPLETE receipts block the merge from being reported as done in the Phase 7 close.
  - **`third-party/superpowers/.fork-only-skills.txt` allowlist** — declares CI-fork-only skills that the `Skills Drift Check` workflow subtracts from the dispatcher set before diffing against the upstream snapshot. Lets the fork add skills (e.g. `deploy-receipt`) without breaking the genuine-drift detection.
  - **P-MAG third-surface lockdown** — `Scan three surfaces`, `memory/feedback_*.md`, and `feedback_past_mistake_gate.md` literals locked under both `docs-substrings` lint and `past-mistake-gate.test.mts` test file. 6 new test assertions + 6 new lint assertions. `docs-substrings` 114 → 120.

- **Second release train (PRs #85 + #86 + #87 + #88 + #89)** — verification + learning surface:
  - **`workspace-surface-audit` Environment Grain** — Phase 1 inventory now records six per-host facts (shell flavor, OS family + `git core.autocrlf`, jq availability, case-sensitive filesystem flag, CWD baseline, parallel-actor expectation) as a single fenced block with stable field names so downstream skills (`gateguard`, `verification-loop`, future autonomous-release-train) parse it without per-host special-casing. Closes the report's recurring "command failed / wrong approach" friction class root.
  - **`superpowers` Stacked-PR Plan Precondition** — non-negotiable rule for any change touching ≥3 files: produce a stacked-PR plan (per-PR table, dependency graph, worktree-per-PR, out-of-scope) before the first edit. Excludes markdown-only / lockfile-only / generated-only / vendor-snapshot-refresh / skill-mirror commits explicitly so it doesn't fire on routine high-volume mechanical work.
  - **`verification-loop` per-project ladder** — new Phase 0 (Resolve the Ladder) reads `.claude/verify-ladder.json` (or sniffs `package.json` scripts, then per-language toolchain files, then asks). Phases 1–6 read the resolved commands instead of hardcoding `npm run X`. New Phase 8 (Deploy Receipt) wires PR #83's `deploy-receipt` for auto-deploy projects. Library-only repos skip Phase 8.
  - **`templates/verify-ladder.example.json`** — starter manifest with four shapes (TypeScript+Node, Rust+Cargo, Python+uv, Cloudflare Worker). Operator copies to `.claude/verify-ladder.json` and trims per project.
  - **`bin/harvest-friction.mjs` classifier** — TDD-backed pipeline reading `~/.claude/instincts/<hash>/observations.jsonl` and classifying failure rows into four typed instincts: `env_issue`, `permission_block`, `wrong_approach`, `buggy_code`. Idempotent on re-run via `dedup_key = sha1(type + tool + summary[:120])`. Confidence = `log10(occurrence_count + 1) * recency_factor` where `recency_factor = 0.5 + 0.5 * exp(-days_since_last_seen / 14)`. Surfaces a host-gap warning when observations are `tool_start`-only (bash fallback without jq + without Node observer) instead of misclassifying.
  - **`/harvest` slash command** — discoverability wrapper for the classifier with full documentation of the four friction types, idempotency contract, confidence model, and the thin-schema fallback diagnostic.
  - **Law-7 `Friction Harvest Pipeline` subsection** in `SKILL.md` — names the four friction types, quotes the `dedup_key` formula, documents the opt-in posture (no cron / no auto-run; operator stays in control of when the classifier reads observation history).

### Changed

- **`proceed-with-the-recommendation` routing table** picks up a new row for "Post-merge deploy receipt (auto-deploy projects)" routing to the `deploy-receipt` companion. Inline fallback documents the three verification routes when the skill is not installed.
- **`superpowers` basic-workflow table** is now 8 rows (was 7), with `deploy-receipt` as step 8.

### Fixed

- **`fix(superpowers)`** — drop bold emphasis on `before` to avoid the `skills-drift` regex matching it as a fake skill name. Same class of CI-rigor fix the `deploy-receipt` allowlist resolved for fork-side additions.

### Tests

- **`docs-substrings` lockdown grew from 114 to 144 assertions** across the two release trains. Each new lock cites the specific class of regression it catches in an inline comment.
- **`harvest-friction.test.mts`** — 13 new tests across 3 describe blocks covering each friction type, dedup-key stability under summary truncation, recency-decay correctness, and the pre-PR #67 `tool_response`-vs-`tool_output` schema compatibility. Total `npm test` count: 511 (was 498).

### PRs in this release

- #83 — `feat(discipline): P-MAG third surface, Parallel-Actor Gate, deploy-receipt skill` → `027188c`
- #84 — `feat(p-mag): lock the third surface (memory/feedback_*.md) under docs-substrings + test` → `1a482b0`
- #85 — `feat(workspace-surface-audit): record environment grain at session start` → `e7fe080`
- #86 — `feat(superpowers): require a stacked-PR plan for ≥3-file changes` → `47b2b39`
- #87 — `feat(verification-loop): per-project ladder via .claude/verify-ladder.json` → `9c974eb`
- #88 — `feat(continuous-learning): friction-harvest classifier (TDD, 4 friction types)` → `5c130e8`
- #89 — `feat(continuous-learning): /harvest slash command + Law-7 prose` → `de2a741`

Plan doc: [`docs/plans/2026-05-07-second-release-train.md`](docs/plans/2026-05-07-second-release-train.md).

---

## [3.6.0] — 2026-05-05

### Added
- **Node observer + `npx continuous-improvement backfill`** (#52) — replaces the bash thin-schema fallback that depended on `jq`. The new `bin/observe.mjs` reads stdin, parses the hook payload natively, and writes the rich event schema (`tool_input.command` for Bash, `Edit.file_path` for Edit/Write/Read, `tool_output` for tool_complete) without external dependencies. `hooks/observe.sh` becomes a two-phase shim: prefer the Node observer when present, fall back to the prior bash thin-schema path when not, so operators who do not re-run `npx continuous-improvement install` see no behavior change. The companion `backfill` subcommand walks existing `observations.jsonl` files and tags every row with `schema: "thin" | "rich"` so the analysis pass can cleanly skip thin rows and surface a "X% thin" stat to operators. Idempotent; preserves operator data via `.bak` and `observations.corrupt.jsonl` quarantine. Closes the audit-derived gap where 22,065 observations across 11 projects on a `jq`-less host yielded 0 auto-detected instincts. Live backfill against the maintainer's host: 25,077 rows tagged → 24,547 thin (97.9%), 530 rich (2.1%), across 14 projects.
- **`Proactive Roadmap Surfacing` section in `wild-risa-balance`** (#53) — names the surface-don't-execute boundary explicitly. Trigger conditions (persistent roadmap, finished tasks implying next steps, drift, instinct/memory predictions); hard boundary citing global CLAUDE.md and Auto Mode rules; format with `(surfaced — <source>)` marker; anti-patterns (nagging, citation-free speculation, bundling surface with execution, inventing roadmaps).
- **`meta` instinct pack** (#50) — promotes the two cross-project reflection-instincts (`skip-thin-observation-schema`, `parallelize-independent-tool-calls`) from per-project YAML into a shared starter pack. Test loop drives off `PACK_FLOORS` so language packs keep ≥5 floor while `meta` ships at ≥2.

### Changed
- **README install ergonomics** (#50) — `jq` listed alongside Node and bash in Preconditions with per-OS install commands; new "Operator modes" section adjacent to install with both bash/zsh and PowerShell export syntax for `CLAUDE_THREE_SECTION_CLOSE_DISABLED`.
- **CONTRIBUTING.md `Source of truth: src/` callout** (#50) — hoisted as a one-line warning at the top of `## Architecture`; the existing edit-src-then-build workflow at lines 101-118 was correct but buried.

### Fixed
- **`hooks/observe.sh` jq-missing one-shot warning** (#50) — emits a single stderr line per host on the first invocation when `jq` is absent on PATH, so operators learn the auto-instinct gap at install time instead of discovering weeks of thin-schema collection. Marker lives at `~/.claude/.continuous-improvement-jq-warned`, deliberately outside `~/.claude/instincts/` so directory iterators are unaffected.

---

## [3.5.0] — 2026-05-04

### Added
- **Audience-tier system in `wild-risa-balance`** — beginner emits 3–5 goal-driven items with no WILD/RISA labels; expert keeps the ≥7 floor (2 WILD + ≥5 RISA). `proceed-with-the-recommendation` Phase 1 validates against the tier contract instead of a flat floor, and the Phase 7 close renders the tier suffix in the heading (`## Recommendation (expert|beginner)`) so the audit trail records which tier produced the list.
- **`Recommendation: no` escape valve in both tiers** of `wild-risa-balance` and `proceed-with-the-recommendation`. When no real recommendation can be produced without padding, the close ships a literal `no` body under the tier-suffixed heading — an explicit operator handoff signal (switch session, switch specialist agent, switch framing, sleep on it), never a silent skip. Padding to hit the floor is the failure mode this prevents.
- **`CLAUDE_THREE_SECTION_CLOSE_DISABLED=1` operator opt-out** for `hooks/three-section-close.mjs`. When set, the hook short-circuits before any enforcement or telemetry. Per-operator escape hatch for cases where end-of-turn reflection should run as internal thinking instead of visible output. Public default unchanged — the rule still fires for everyone else. Test infrastructure (`buildIsolatedEnv()` + 5 manual env constructions) now strips the env var before spawning the hook so existing enforcement tests cannot silently disable themselves when the developer has the flag set.

### Tests
- **Locked the `no` escape valve literals** in `verify:docs-substrings` (102 → 112 assertions) and in the `wild-risa-tiers` test (22 → 32 assertions, 5 literals × 2 mirrors). Each lock carries a rationale string naming the behavior it defends so a future maintainer reading a failure understands why the literal is locked.

---

## [3.4.1] — 2026-05-03

### Added
- **`verify:everything-mirror` lint** (`npm run verify:everything-mirror`) — walks `plugins/continuous-improvement/` and asserts every non-skill file has a byte-identical sibling at the same relative path under the repo root. Closes the drift-protection gap that `check-skill-mirror.mjs` left open for `commands/`, `hooks/`, `instinct-packs/`, `templates/`, `lib/`, `bin/mcp-server.mjs`, and `LICENSE`. Currently passes 23 mirrored files. Allowlists the four plugin-only surfaces (`.claude-plugin/` manifests, the bundle README, `hooks/hooks.json`, the generated `skills/README.md`).
- **`verify:all` umbrella script** — single contributor gate that runs all 5 verify lints + typecheck cheapest-first. Replaces the six-line per-command checklist in `CONTRIBUTING.md`.
- **`bin/pre-commit-block-strays.sh`** pre-commit hook — refuses any commit whose staged paths match `^.tmp-stop-e2e/` or `^nanobanana-output/`. Belt-and-suspenders alongside the new `.gitignore` entries; .gitignore is silent if bypassed with `git add -f`, this hook is loud. Install snippet documented in `CONTRIBUTING.md`.

### Changed
- **`gateguard` Law tag reconciled to "Law 1" only** across `README.md` Tier-1 row and `skills/README.md`. The skill's frontmatter source-of-truth declares only Law 1; the Tier-1 rows previously over-claimed "Law 1 + Law 3". The three views now agree.
- **`skills/README.md` `superpowers` row** rewritten to match the 3.4.0 "Law activator" reframe already in the source skill frontmatter and root `README.md`. The 3.4.0 reframe (commit `2ddea8a`) missed this row.
- **`README.md` plugin-marketplace row** — fixed stale "4 skills" claim → "13 skills" (the actual bundle size verified by `check-skill-mirror.mjs`).
- **`docs/testing/proceed-with-the-recommendation.TESTING.md`** footnote added next to the historical RED/GREEN URLs explaining the 3.4.0 rename (`proceed-with-claude-recommendation` → `proceed-with-the-recommendation`) so the pre-rename URLs in test artifacts no longer surprise readers.

### Removed
- **6 unreferenced `nanobanana-output/*.jpg` images (3.1 MB)** — committed in `3f0dbcb` as a one-off save and never referenced anywhere in the repo (verified via grep across non-vendor paths). Recoverable from git history if ever needed.
- **`.tmp-stop-e2e/transcript.jsonl`** — leftover test artifact from a stop-hook E2E run.

### Fixed
- **`.gitignore`** — was a single line (`node_modules/`). Now also blocks `.tmp-stop-e2e/`, `nanobanana-output/`, `*.tmp`, and `dist/` so the deleted artifacts (and similar future cruft) cannot re-enter via a careless stage.

---

## [3.4.0] — 2026-05-03

### ⚠️ Breaking
- **Marketplace dropped 8 third-party PM plugin entries** (`pm-data-analytics`, `pm-execution`, `pm-go-to-market`, `pm-market-research`, `pm-marketing-growth`, `pm-product-discovery`, `pm-product-strategy`, `pm-toolkit`) to refocus the marketplace on the 7 Laws of AI Agent Discipline. After updating, anyone with those plugins installed from this marketplace **loses the update source** — the plugins keep working until uninstalled, but `/plugin marketplace update continuous-improvement` will no longer resolve them. To keep them, install from a separate marketplace or re-add the entries downstream.

### Added
- **`/seven-laws` slash command** — brand-aligned alias to `/continuous-improvement`, so the 7 Laws name surfaces directly in the command palette without breaking the existing entrypoint
- **Skill Law-tag lint** (`npm run verify:skill-law-tag`) — CI lint that requires every non-core skill description to lead with the Law it enforces, preventing description drift from the 7-Laws frame
- **README Law Coverage matrix** — explicit map from each bundled skill / command / hook / instinct pack to the Law it serves, so contributors can see at a glance which Laws are well-covered and which need work

### Changed
- **Skill descriptions lead with their Law** — Laws 1–7 source skills and the orchestrator now open with the Law they enforce, replacing generic blurbs with intent-first framing that matches the lint
- **`superpowers` reframed as a Law activator**, not a peer skill — clarified in skill description and README so users stop treating it as one option among many
- **Renamed `proceed-with-claude-recommendation` → `proceed-with-the-recommendation`** — drops Claude-specific branding from the skill identifier so the same skill can be installed into non-Claude agents (Codex, Gemini CLI, etc.). Identifier-only rename: file paths, frontmatter `name:`, slash command, install snippets, and cross-references updated. Body language about "Claude-emitted recommendation" is intentionally untouched in this release; that agent-genericization pass is a separate follow-up. Old-name installations need to re-run the install snippet under the new path.
- **Version bump** to 3.4.0

### Migration
- If you depend on any of the 8 dropped PM plugins, pin them via a separate marketplace before running `/plugin marketplace update continuous-improvement`. Existing installs continue to work; only the update path is removed.

---

## [3.3.0] — 2026-04-25

### Added
- **`proceed-with-claude-recommendation` companion skill** — walks a Claude recommendation list top-to-bottom, routes each item to the right specialist (`superpowers:*`, `schedule`, `loop`, `simplify`, `security-review`, etc.), falls back to inline behavior when the specialist is not installed, verifies per item, and stops at items that need user approval
- **`/proceed-with-claude-recommendation` slash command** — entrypoint that runs the companion skill on the most recent list of Claude recommendations
- **Skill hardening** — explicit guardrails against the three most common rationalizations (skipping verification, bundling items, silently deferring approval-needed items)
- **Pressure-test baseline log** — recorded under `reports/` so regressions in skill behavior are detectable

### Changed
- **7-Laws engine integration** — `proceed-with-claude-recommendation` now routes through the same research → plan → verify → reflect flow enforced by `SKILL.md`, so per-item behavior matches the core 7 Laws rather than running as a parallel track
- **Plugin bundle** — `plugins/continuous-improvement/` now ships the new skill and command (generated by `npm run build`), so Claude Code marketplace installs and Codex plugin bundles pick them up without extra steps
- **Installer** — `npx continuous-improvement install` now deploys `/proceed-with-claude-recommendation` alongside the existing core commands
- **Skills bundler filter hardened** — the generator now only treats kebab-case `*.md` files as skills, so reference logs like `*.TESTING.md` no longer leak into the plugin as fake skills
- **Version bump** to 3.3.0

### Docs
- Clarified in `README.md` that `ci` is a **separate** unified workflow CLI and not a shorthand for the `continuous-improvement` installer
- Aligned `docs/unified-plugin-guide.md` version reference with the current package version

---

## [3.2.0] — 2026-04-19

### Added
- **Planning-With-Files workflow** — opt-in persistent project-root planning via `task_plan.md`, `findings.md`, and `progress.md`
- **`/planning-with-files` command** — initialize, inspect, checkpoint, and recover file-based plans in Claude Code
- **Planning templates** — packaged repo-owned templates under `templates/planning-with-files/`
- **Expert MCP planning tools** — `ci_plan_init` and `ci_plan_status` for initializing and summarizing planning files programmatically

### Changed
- **Expert plugin surface** — expert mode now exposes 12 tools instead of 10
- **Installer** — now installs `/planning-with-files` alongside the existing Claude commands
- **Docs and metadata** — updated README, quickstart, skill docs, marketplace metadata, and translations to document the opt-in planning workflow
- **Version bump** to 3.2.0

---

## [3.0.0] — 2026-04-06

### Added
- **MCP server** (`bin/mcp-server.mjs`) — zero-dependency JSON-RPC stdio server exposing instincts as MCP tools and resources. Works with Claude Code, Claude Desktop, Cursor, Zed, Windsurf, VS Code.
- **Beginner / Expert modes** — `--mode beginner` (default, 3 tools) vs `--mode expert` (8 tools with import/export, observation viewer, manual instinct creation, confidence tuning)
- **MCP-only mode** — `--mode mcp` for editors that support MCP but not Claude Code hooks
- **Plugin manifests** — `plugins/beginner.json` and `plugins/expert.json` describe available tools per mode
- **Session hooks** (`hooks/session.sh`) — SessionStart loads instincts and shows status; SessionEnd reminds to reflect
- **Import/export tools** — `ci_export` and `ci_import` for sharing instincts as JSON between team members
- **34-test suite** — added MCP server tests (beginner + expert mode) and plugin config validation. Up from 20 tests.
- **Multi-editor MCP support** — installer patches both `settings.json` and `claude_desktop_config.json`

### Changed
- **Installer upgraded** — `--mode` flag replaces single-mode install. Supports `beginner`, `expert`, `mcp`
- **Uninstaller upgraded** — cleans up MCP server config, session hooks, and desktop config
- **Version bump** to 3.0.0 — breaking change: new install modes and MCP server architecture

---

## [2.3.0] — 2026-04-06

### Changed
- **Public npm** — package name changed from `@naimkatiman/continuous-improvement` to `continuous-improvement`. Removed GitHub Packages publishConfig. `npx continuous-improvement install` now works for everyone.
- **Expanded keywords** — added `claude-code-skill`, `agent-skill`, `gemini-cli` for better npm discoverability
- **Improved description** — package description now leads with the value prop, lists supported platforms

### Added
- **Test suite** — 20 tests covering installer, hook, and SKILL.md validation. Zero dependencies (Node.js built-in test runner).
- **Before/after examples in README** — collapsible terminal output showing the framework in action vs. without it
- **Real-world examples** — `examples/` directory with 3 detailed scenarios (bug fix, feature build, refactor)
- **Platform badges** — Claude Code, Cursor, Codex compatibility badges in README
- **Gemini CLI** to supported platforms list
- **Roadmap** — "Roadmap to 1000 Stars" section in README with phased plan

---

## [2.1.0] — 2026-04-05

### Changed
- **Auto-leveling** — system promotes itself from CAPTURE → ANALYZE → SUGGEST → AUTO-APPLY based on observation count and instinct confidence. No user action needed.
- **No background daemon** — analysis runs inline at session start. Removed start-observer.sh, observer-loop.sh, PID management.
- **Simplified directory** — `~/.claude/instincts/` replaces `~/.claude/mulahazah/` with flat structure
- **jq optional** — observe.sh works with pure bash fallback if jq isn't installed
- **Leaner installer** — no daemon files copied, no config.json, no analyze.sh. Just skill + hook + command.
- **Smaller package** — removed agents/ and config.json from published files

### Removed
- Background observer daemon (deferred to v2.2 as opt-in)
- `~/.claude/mulahazah/` directory structure (replaced by `~/.claude/instincts/`)
- `rules.md` (replaced by YAML instinct files with confidence scoring)
- `bin/analyze.sh` (analysis now inline via SKILL.md prompt)

---

## [2.0.1] — 2026-04-05

### Fixed
- SKILL.md rewritten to be honest — removed claims about features that didn't work (YAML instinct auto-loading, graduated confidence enforcement)
- Law 7 now uses `~/.claude/mulahazah/rules.md` — a markdown file Claude can actually read/write reliably
- Added `bin/analyze.sh` — the actual analysis pipeline that was missing (calls Haiku to extract rules from observations)
- Added `commands/continuous-improvement.md` — the actual `/continuous-improvement` command file
- Installer now copies analyze.sh, command file, and initializes rules.md
- observer-loop.sh rewritten to use analyze.sh instead of broken YAML instinct pipeline
- README rewritten to match what the tool actually does

---

## [2.0.0] — 2026-04-05

### Added
- Law 7: Learn From Every Session — Mulahazah learning system
- PreToolUse/PostToolUse hooks for session observation
- Background Haiku observer agent for pattern detection
- Project-scoped observation (per-project JSONL files)
- `/continuous-improvement` command
- `hooks/observe.sh` — lightweight observation hook (<50ms)
- `agents/` — observer agent scripts
- `config.json` — observer configuration

### Changed
- Upgraded from 5-phase framework to 7-Law system
- The Loop: Research → Plan → Execute → Verify → Reflect → Learn → Iterate
- Installer sets up Mulahazah hooks and directories for Claude Code

### Improved
- Law 6 (Iterate) now explicit — one change → verify → next change

---

## [1.1.0] — 2026-04-04

### Improved
- README completely rewritten for cleaner onboarding — hook first, install in 30 seconds, first-task prompt
- Added real example of a successful agent run (rate limiting walkthrough)
- Added QUICKSTART.md for step-by-step first-use guide
- Added CHANGELOG.md for version tracking
- Removed internal references from SKILL.md (now works for any user, any project)
- Red flags section now in README for discoverability before install

### Fixed
- Fake Claude Code marketplace install command removed
- Internal variable references (Naim, PROJECT_REGISTRY, STATE_TEMPLATE) made universal

---

## [1.0.0] — 2026-04-04

### Added
- Initial release
- 5-phase framework: Research → Plan → Execute → Verify → Reflect
- Iron Law with 3 hard constraints
- Phase gates (explicit conditions before proceeding)
- Red Flags list (thought patterns that indicate a skip)
- Common Rationalizations table
- Subagent delegation rules with 4 status handlers
- Pre-completion self-review checklist
- marketplace.json for plugin discoverability
