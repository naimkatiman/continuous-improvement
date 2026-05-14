# README Landing-Page Rewrite

**Date:** 2026-05-14
**Branch:** `docs/readme-landing-rewrite`
**Worktree:** `D:/Ai/ci-wt-readme-landing`
**Scope:** doc-only, one PR
**PR title (planned):** `docs(readme): seatbelt-framed landing page + carve skill catalog into docs/`

## Goal

Reposition [README.md](../../README.md) as a landing page. Lower the cognitive load for first-time visitors, sharpen the pitch to a "seatbelt for Claude Code" framing while preserving "7 Laws of AI Agent Discipline" as the underlying framework name, and move deep-detail sections (full 20-skill catalog, skill-creation recipe, GitHub Action retarget policy) into [docs/](..) and [CONTRIBUTING.md](../../CONTRIBUTING.md) so the README stays under ~250 lines.

## Trigger

Maintainer teardown 2026-05-14 — README scored Value 8.5, Simplicity 5.5, Power 9, Trust 7, Conversion 6. Strongest critique: README is written for someone who already believes in the idea; new visitors see too many named concepts (7 Laws, Mulahazah, hooks, MCP, agents, linter, companions, modes) before emotional buy-in. Action plan: rewrite top ~40% as a landing page, push deep system details into [docs/](..).

## Scope of this PR (in)

- [README.md](../../README.md) — rewrite top ~40%, condense rest, target ~240 lines (from 386).
- `docs/skills.md` — **NEW** — full 20-skill table + drop-in single-file install snippet.
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — extend with "Evolution — adding a new skill" recipe (currently README L259-320) and GitHub Action `@v3` retarget policy detail (currently README L323-336).
- `docs/plans/2026-05-14-readme-landing-rewrite.md` — this plan.

## Scope (out — explicitly deferred)

- **WILD #6** — rewrite "V1 honest limitations" line as a dated bug-report-style `## Failure modes we know about` block. Deferred to PR #2 to keep the landing-page diff reviewable.
- Demo GIF/video refresh at the top of README. The existing `assets/combined.gif` stays for this PR.
- Any skill-content edits, hook changes, marketplace metadata changes.
- Mulahazah engine doc deep-dive (separate PR if needed).
- Localization, translations.

## Section-level diff intent — README

| Current (line range) | New | Action |
|---|---|---|
| Hero L1-22 (GIF + tagline + badges + QUICKSTART link) | Hero — same shape | Keep, replace tagline |
| L8 tagline | Seatbelt-framed tagline + one-line "what this is *not*" (WILD #7) | Replace |
| L24-46 Problem + What you get | Problem (condensed) + What you get (3-layer: before / during / after) | Rewrite, lighter |
| (none) | **NEW** Before/after text example — concrete login-redirect bug scenario | Insert after What you get |
| (none) | **NEW** Who this is for / not for (4+4 bullets, hard cap) | Insert after Before/after |
| L50-128 Install + How enforcement works + Troubleshooting + Operator modes | Same | Keep verbatim |
| L131-151 The 7 Laws | Same | Keep |
| L155-167 Mulahazah | Condense from 13 lines to ~6 | Trim |
| L170-194 Slash commands | Same | Keep |
| L198-200 Law Coverage | One-paragraph link to CONTRIBUTING.md matrix | Condense |
| L204-256 All 20 Skills + drop-in install | One paragraph: "20 skills bundled — full catalog at docs/skills.md" | Move out |
| L259-320 Evolution — adding a new skill | Remove from README | Move to CONTRIBUTING.md |
| L323-336 GitHub Action | One paragraph + link | Keep summary, move detail to CONTRIBUTING.md § Release |
| L340-346 Uninstall | Same | Keep |
| L350-360 Brand Stack | Same | Keep |
| L364-373 In the wild | Same | Keep |
| L376-385 More + License | Same | Keep |

## Section-level diff intent — docs/skills.md (NEW)

Contents:
- Header: "20 bundled skills — full catalog"
- One-paragraph intro tying back to README hero + 7 Laws framework
- Full 20-skill table (verbatim from current README L211-232)
- "Beginner gets" / "Expert gets" subsections (current README L238-244)
- "Drop-in single-file install" snippet (current README L246-256)
- Footer link: back to README + CONTRIBUTING.md skill-creation recipe

## Section-level diff intent — CONTRIBUTING.md

Two appended/inserted sections:

1. **Evolution — adding a new skill** — full content from current README L259-320:
   - 5-step recipe (touch source, frontmatter, build, verify, commit)
   - What the build does automatically (mirrors, regenerates manifests, re-renders README)
   - Lint table (7 lints that block half-wired skills)
   - When-to-fold-a-new-skill-into-the-7-Laws heuristic
   - Non-automated honest limits

2. **Release — GitHub Action `@v3` retarget policy** — extend existing § Release section with the floating-tag policy from current README L334.

## Verification ladder (Phase 3 gate)

- `npm run typecheck` — doc-only floor
- `npm run verify:all` — catches generated drift (skill-mirror, skill-tiers, skill-law-tag, docs-substrings, everything-mirror, routing-targets, typecheck)
- `git diff --stat origin/main..HEAD` — confirm only the 4 in-scope files are touched
- Manual link check: grep new README for `[…](…)` patterns, verify each path exists or anchors target a heading that exists in the destination doc
- Visual scan of GitHub-rendered PR diff before requesting review

## Past Mistake Acknowledgment (P-MAG)

- No `git add .` / `-A` — stage by explicit filename only (Windows + autocrlf + build pipeline produces 40+ phantom modifications on `git status`).
- No direct-push to `main` — PR flow mandatory per [CLAUDE.md](../../CLAUDE.md).
- Pre-branch ahead-of-origin check passed: `git log origin/main..main` returned empty, 2026-05-14.
- No force-push, no `git reset --hard origin/X` if rebase diverges — supersede via new branch.

## Commit plan

One commit per logical step, all on `docs/readme-landing-rewrite`:

1. `docs(plan): add 2026-05-14 plan doc for README landing-page rewrite`
2. `docs(skills): carve full 20-skill catalog into docs/skills.md`
3. `docs(contributing): absorb skill-creation recipe + GH Action retarget policy`
4. `docs(readme): seatbelt-framed landing page; trim to ~240 lines; link out to docs/skills.md`

PR body cites this plan doc + the maintainer teardown summary + the verification-ladder output.

## Out of scope reminders (do not let scope creep)

- Failure-modes-we-know-about block → PR #2
- Demo GIF/video refresh → PR #3
- Skill content rewrites → separate PR each
- Mulahazah deep-dive doc → separate PR if requested
