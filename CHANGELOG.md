# Changelog

All notable changes to this skill are documented here.

---

## [Unreleased]

### Added
- **Node observer + `npx continuous-improvement backfill`** — replaces the bash thin-schema fallback that depended on `jq`. The new `bin/observe.mjs` reads stdin, parses the hook payload natively, and writes the rich event schema (`tool_input.command` for Bash, `Edit.file_path` for Edit/Write/Read, `tool_output` for tool_complete) without external dependencies. `hooks/observe.sh` becomes a two-phase shim: prefer the Node observer when present, fall back to the prior bash thin-schema path when not, so operators who do not re-run `npx continuous-improvement install` see no behavior change. The companion `backfill` subcommand walks existing `observations.jsonl` files and tags every row with `schema: "thin" | "rich"` so the analysis pass can cleanly skip thin rows and surface a "X% thin" stat to operators. Idempotent; preserves operator data via `.bak` and `observations.corrupt.jsonl` quarantine. Closes the audit-derived gap where 22,065 observations across 11 projects on a `jq`-less host yielded 0 auto-detected instincts.

### Changed
- **README install ergonomics** — added explicit decision rule ("If you don't know which to pick, use Beginner"), called out the doubled `name@marketplace` install syntax as intentional, surfaced the Windows Git Bash / WSL precondition, replaced the "re-run install" failure note with "restart session first", added a 3-row Troubleshooting install table, demoted the Law Coverage matrix to CONTRIBUTING.md (operator opt-outs retained in README), wrapped the 13-skill table in `<details>`, and moved the Brand Stack below install.
- **Plugin descriptions are now benefit-led** at the source (`SHARED_PLUGIN_DESCRIPTION` + `MODE_METADATA` in `src/lib/plugin-metadata.mts`). `package.json`, `action.yml`, plugin manifests, and marketplace entries now describe what the agent stops doing (skipping research / planning / verification) and what users get per mode, instead of listing artifacts.

### Removed
- **"Curated PM plugins moved" notice** removed from README. Earlier versions of this marketplace bundled 8 product-management plugins by [Paweł Huryn](https://www.productcompass.pm); those have not appeared in the listing since the 7 Laws refocus and the README notice was stale housekeeping. Source plugin directories under `plugins/pm-*` remain on disk pending follow-up removal.

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
