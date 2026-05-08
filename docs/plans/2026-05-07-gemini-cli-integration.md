# 2026-05-07 — Gemini CLI integration plan (#9)

Stacked-PR plan for adding native Gemini CLI installer support to `bin/install.mjs`. Issue #9 is the last open phase-1 item; closing it cleanly retires phase-1.

## Goal

Make `npx continuous-improvement install --target gemini` deploy `SKILL.md` and slash commands to the Gemini CLI's expected paths, the same way the default Claude Code install deploys to `~/.claude/`. After this lands, README's "Works With" badge for Gemini CLI stops being aspirational.

## Background — current state on main (v3.9.0)

- `bin/install.mjs` is **Claude-Code-only**: hardcoded paths under `~/.claude/skills/`, `~/.claude/commands/`, `~/.claude/instincts/`, `~/.claude/settings.json`.
- Operators on Gemini CLI today must paste `SKILL.md` manually or rely on `agent-skills/docs/gemini-cli-setup.md` (vendored, third-party).
- Gemini CLI conventions (verified against `agent-skills/docs/gemini-cli-setup.md` and `agent-skills/README.md:270`):
  - User-scope skills auto-discover from `~/.gemini/skills/<skill>/SKILL.md`.
  - Slash commands live at `~/.gemini/commands/<command>.md` (mirrors Claude `.md` shape).
  - **No tool-observation hook system** equivalent to Claude's `PreToolUse` / `PostToolUse` exists. Observation hooks (`observe.sh`, Node observer artifacts) do not apply to the Gemini target.
  - **No settings.json equivalent** for hook patching that's currently confirmed. If one exists, we'll patch it the same way Claude's is patched; if not, we skip.

## Carried-in negative prompt (P-MAG Rule 3)

> Will NOT repeat: editing `bin/install.mjs` directly when `src/bin/install.mts` is the source (PR #66 was rejected for this; PR #74 fixed it).
> Will NOT repeat: silent feature-creep into Codex / Cursor / OpenCode targets — `--target gemini` is the only target this PR train adds.

## Stacked PR breakdown

| PR | Concern | Files | Depends on |
|---|---|---|---|
| **A** | Refactor `install.mjs` paths into a per-target `TARGETS` table. **Behavior-preserving** — Claude-Code remains the default target with byte-identical output. Existing 21 tests pass unchanged. | `src/bin/install.mts`, possibly `src/lib/install-targets.mts` (new), `src/test/install.test.mts` (no new cases) | `main` |
| **B** | Add `--target gemini` wiring backed by the new `TARGETS` table; new test block (~6 cases); README "Works With" table flip; CHANGELOG `Unreleased` entry. | `src/bin/install.mts`, `src/test/install.test.mts`, `README.md`, `CHANGELOG.md` | A |

Two PRs, not three. Splitting B further into "feature" + "tests" + "docs" buys nothing — the implementation is small (~150 LOC) and the tests are characterization-shaped (assert paths exist, mirrors the Claude pattern).

## Scope (in)

- `--target claude-code` (default; explicit alias for current behavior)
- `--target gemini` (new):
  - Skill install: `~/.gemini/skills/continuous-improvement/SKILL.md`
  - Slash commands: `~/.gemini/commands/<command>.md` for the 6 currently-installed commands
  - `--uninstall` removes only continuous-improvement-installed assets, mirrors Claude pattern
  - Foreign content under `~/.gemini/` is preserved
- Tests for the Gemini path (skill copy, command copy, foreign-skill preservation, uninstall, missing-`~/.gemini/`-creation, unknown-target rejection)
- README "Works With" table updated to flip Gemini CLI from "skill only" to "native installer"
- CHANGELOG `Unreleased` entry

## Scope (out)

- Workspace-scope `.gemini/skills/` (defer; user scope is the common case for `npx`)
- MCP-equivalent on Gemini (different semantics; defer to its own issue)
- `--target codex`, `--target cursor`, `--target opencode`, `--target openclaw` (each gets its own issue)
- Auto-detection of which target is installed (explicit `--target` flag only)
- Hooks for tool observation (Gemini CLI does not support; documented in CHANGELOG)
- Instinct packs at `~/.gemini/instincts/` (defer to a follow-up unless trivial; the pack-loader code path is target-agnostic so this MAY land for free in PR B)

## Risks

- **R1 — Cross-platform `~/.gemini/` path** — verified in `agent-skills/docs/gemini-cli-setup.md` as universal across macOS / Linux / Windows; no XDG handling needed. Re-verify on each platform at PR-B time before merge.
- **R2 — `--uninstall` blast radius** — must remove ONLY continuous-improvement-installed files, never user's other Gemini skills. Same defensive pattern as the Claude uninstaller; foreign-skill-preservation test added in PR B asserts this.
- **R3 — Gemini CLI runtime not installed** — if a user runs `--target gemini` without Gemini CLI on the system, the install still succeeds (files written; Gemini picks them up next launch). Matches Claude's installer non-detect posture; documented in `--help` output.
- **R4 — `~/.gemini/settings.json` shape unknown** — if a settings file exists with a hooks-equivalent, PR B research determines the patch shape. If no such file exists, PR B documents the absence and skips. Either way, no behavior change for non-Gemini users.
- **R5 — observe.sh / Node observer artifacts** — these are Claude-specific and MUST NOT be installed under `~/.gemini/instincts/`. PR A's `TARGETS` table makes this declarative (each target lists which artifacts it accepts); PR B's Gemini target omits them.

## Verification per PR

- **PR A** — existing 21 install tests pass byte-identically; `npm run verify:generated` exit 0; `npm test` 523/523 (or whatever count after the post-#99 sweep).
- **PR B** — 21 + 6 = 27 install tests; `npm run verify:generated` exit 0; manual smoke on Windows + Linux: `HOME=/tmp/test-gemini npx continuous-improvement install --target gemini` produces the expected `~/.gemini/skills/continuous-improvement/SKILL.md` and `~/.gemini/commands/*.md` set, then `--uninstall` removes them.

## Open questions

- **Q1** — Should `--target` default stay `claude-code` or auto-detect based on which agent runtime is installed? **Recommendation:** stay explicit. Auto-detection is a follow-up issue if/when operator pain surfaces.
- **Q2** — Should `--target gemini --pack react` work? **Recommendation:** yes — instinct packs are runtime-agnostic. Land in PR B if trivial, defer to a follow-up if not.
- **Q3** — Does Gemini CLI have settings.json? **Open** — answered during PR B research. If yes and it has a hooks-equivalent: mirror Claude pattern. If no: skip and document.

## Out-of-scope artifacts that drift detection should NOT flag

- `~/.gemini/instincts/observe.sh` — never install (R5)
- `~/.gemini/instincts/bin/observe.mjs` — never install (R5)
- `~/.gemini/instincts/lib/observe-event.mjs` — never install (R5)

These are Claude-specific. PR A's `TARGETS` table is the enforcement surface.

## Sequencing

1. This plan-only PR lands and gives the audit trail a citeable doc.
2. PR A (refactor) opens off the new `main`. Behavior-preserving, ships in one cycle.
3. PR B (feature + tests + docs) opens off PR A. After both land, #9 closes via PR B.
4. Optional follow-up: same shape for Codex (`--target codex`) once Q1's auto-detection question is decided.
