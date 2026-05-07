# [F-24] PM Skills Self-Updater
Status: Ready for Implementation
Milestone: v2.10.0
Issue: TBD
Agent: Claude Opus 4.6

## Scope

Create a `utility-update-pm-skills` skill that checks for newer pm-skills
releases, previews what would change, and updates local files after user
confirmation. Ships with both report-only and full update modes. Includes
quality checklist, degraded mode, atomic updates, backup option, and post-update
smoke test. Per-file conflict resolution (diff/overwrite/skip for locally
modified files) is a future feature, not v1.

## Key Decisions

- v1 ships report + update together (no tiered release)
- Default mode is full update flow; `--report-only` is opt-in
- Version detection uses highest-priority source, no cross-checking
- Backup is user-optional, stored in `_pm-skills/backups/`
- Reports saved in `_pm-skills/updates/` with value-delta emphasis
- Quality checklist (12 items) included in SKILL.md
- Degraded mode (simplified): no-network path with manual instructions
- Atomic updates: download to temp, validate, then copy
- Major version bumps require explicit "yes" confirmation
- `_pm-skills/` added to `.gitignore` (visible, underscore-prefix convention)
- Milestone: v2.10.0

## Artifacts

| Artifact | Location |
|----------|----------|
| Plan (design + CI + acceptance criteria) | `F-24-update-pm-skills/plan_update-pm-skills.md` |
| Specification | `F-24-update-pm-skills/specification.md` |
| Draft SKILL.md | `F-24-update-pm-skills/drafts/skills/utility-update-pm-skills/SKILL.md` |
| Draft TEMPLATE.md | `F-24-update-pm-skills/drafts/skills/utility-update-pm-skills/references/TEMPLATE.md` |
| Draft EXAMPLE.md | `F-24-update-pm-skills/drafts/skills/utility-update-pm-skills/references/EXAMPLE.md` |
| Draft command | `F-24-update-pm-skills/drafts/commands/update-pm-skills.md` |
| Discovery (web session) | `F-24-update-pm-skills/_discovery/2026-04-09_claude-web-session/` |

## Prerequisites

- [ ] P1: Fix `plugin.json` (2.9.0) vs `marketplace.json` (2.8.2) version mismatch
- [ ] P2: Add `_pm-skills/` to `.gitignore`

## PRs

- (none yet)
