# v2.11.1 Release Plan: skills.sh CLI Compatibility Patch

Status: In Progress (tag target 2026-04-22)
Owner: Maintainers
Type: Patch release

## Release Theme

Unblocks installation of pm-skills via the open [`skills` CLI](https://github.com/vercel-labs/skills) (`npx skills add product-on-purpose/pm-skills`) so the repo is discoverable and installable through the skills.sh ecosystem. No behavioral changes to any skill.

## Context

v2.11.0 shipped 6 new foundation skills (`foundation-lean-canvas` + 5 meeting-lifecycle skills). During skills.sh submission prep on 2026-04-22, a dry-run of `npx skills add` against the live repo surfaced three related problems that blocked 16% of the library from reaching CLI installers:

1. **Frontmatter parse failure on 6 foundation skills.** Each SKILL.md opened with an HTML attribution comment (`<!-- PM-Skills | ... -->`) before the YAML `---` delimiter. The skills CLI's YAML parser requires frontmatter at line 1; the preamble caused silent discovery failure. Affected: `foundation-lean-canvas`, `foundation-meeting-agenda`, `foundation-meeting-brief`, `foundation-meeting-recap`, `foundation-meeting-synthesize`, `foundation-stakeholder-update`.
2. **YAML-ambiguous inline colon in one description.** `foundation-meeting-synthesize` had `description: ... any single meeting: how decisions evolved ...`. Strict YAML interpreted the inline `: ` as a nested key-value separator, truncating the description value and tripping the parser.
3. **25 stale files tracked under `.claude/skills/`.** Relics from pre-v1 personal setup (`init-project`, `init-project-jpkb`, `wrap-session`) remained tracked even after the path was added to `.gitignore`. These showed up as bonus skills unrelated to pm-skills whenever someone ran `npx skills add product-on-purpose/pm-skills`.

Additionally, the existing `lint-skills-frontmatter.sh/.ps1` validator passed all 38 skills despite these issues because its line-based extraction is not YAML-aware. This release closes the gap between the repo's validator and the actual CLI consumer.

### Prerequisites

- [x] v2.11.0 tagged and pushed (done 2026-04-18)
- [x] skills.sh submission plan documented (`docs/internal/distribution/2026-04-22_skills-sh.md`)
- [x] Phase 3 dry-run against live repo uncovered the issues

---

## Decisions

| Decision | Answer | Rationale |
|----------|--------|-----------|
| **Version** | **v2.11.1** (patch) | No behavioral changes to any skill; the fixes enable a previously broken distribution channel. Patch per SemVer. |
| **Bundle scope** | Three linked fixes + lint extension + README install path + em-dash sweep (pre-existing working-tree work) | All changes are cosmetic/compliance-level; bundling avoids three trivial patch tags in quick succession. |
| **Leading-comment removal for all SKILL.md** | Baseline going forward: no pre-frontmatter content in any SKILL.md | The attribution comment is already preserved as the line immediately AFTER `---` in every affected file; no information is lost. Lint now enforces this rule. |
| **`.claude/skills/` cleanup** | `git rm -r .claude/skills/` (both index and working tree) | Path is already gitignored; the 25 tracked files were leftover from before the rule. Remove entirely. Local sync via `sync-claude.sh` can regenerate gitignored copies if needed. |
| **Only one skill version bump** | `foundation-meeting-synthesize` 1.0.0 → 1.0.1 | Description is a user-observable trigger surface and it was reworded. The other 5 foundation skills had mechanical comment removal only, no user-facing change, no version bump. |
| **Lint extension** | Enforce: line 1 must be `---`; description must not contain unquoted `: ` | Catches the exact bug classes that slipped past v2.11.0. Keeps the validator in step with the real CLI consumer. |
| **Release notes channel** | `docs/releases/Release_v2.11.1.md` per repo convention | Matches existing Release_vX.Y.Z.md pattern. |
| **Em-dash sweep** | Folded into v2.11.1 | The 73-file sweep was already in the working tree awaiting review; consolidating into one patch release avoids mid-tree state. No user-facing behavior change. |

---

## Deliverables

### Skill content fixes

| File | Change | Status |
|------|--------|--------|
| `skills/foundation-lean-canvas/SKILL.md` | Remove leading HTML comment preamble | Done |
| `skills/foundation-meeting-agenda/SKILL.md` | Remove leading HTML comment preamble | Done |
| `skills/foundation-meeting-brief/SKILL.md` | Remove leading HTML comment preamble | Done |
| `skills/foundation-meeting-recap/SKILL.md` | Remove leading HTML comment preamble | Done |
| `skills/foundation-meeting-synthesize/SKILL.md` | Remove leading HTML comment preamble; reword description to remove inline `": "`; bump version 1.0.0 → 1.0.1 | Done |
| `skills/foundation-stakeholder-update/SKILL.md` | Remove leading HTML comment preamble | Done |

### Tracked-file cleanup

25 files removed from git via `git rm -r .claude/skills/`:
- `.claude/skills/init-project/` (10 files)
- `.claude/skills/init-project-jpkb/` (10 files)
- `.claude/skills/wrap-session/` (5 files)

### Lint hardening

| File | Change | Status |
|------|--------|--------|
| `scripts/lint-skills-frontmatter.sh` | +check: first line of SKILL.md must be `---` (no preamble). +check: unquoted description must not contain inline `": "` | Done |
| `scripts/lint-skills-frontmatter.ps1` | Mirror of `.sh` changes | Done |
| `scripts/lint-skills-frontmatter.md` | Documentation updated for both new rules | Done |

### README + discoverability

| File | Change | Status |
|------|--------|--------|
| `README.md` | New "Fastest path" install block with `npx skills add product-on-purpose/pm-skills`. New `skills.sh install` shield badge. New row in Installation Options table for the `skills` CLI path. Version badge bumped 2.11.0 → 2.11.1. | In progress |

### Release governance

| File | Change | Status |
|------|--------|--------|
| `CHANGELOG.md` | Add `[2.11.1]` section replacing `[Unreleased]` | Pending |
| `docs/releases/Release_v2.11.1.md` | User-facing release notes | Pending |
| `docs/internal/release-plans/v2.11.1/plan_v2.11.1.md` | This file | Done |
| `docs/internal/release-plans/v2.11.1/skills-manifest.yaml` | One entry for foundation-meeting-synthesize 1.0.1 | Pending |

### Distribution work (forward-looking)

| File | Change | Status |
|------|--------|--------|
| `docs/internal/distribution/2026-04-22_skills-sh.md` | Phased submission plan for skills.sh; Phase 0-3 complete; Phase 4 optional; Phase 5 soft-launch is post-release | Done (Phase 0-3) |

### Em-dash sweep (completion)

The 2026-04-13 standing style rule prohibits em-dash characters in generated output. A partial sweep had previously touched a subset of files; v2.11.1 completes it across the full repo. Total: 376 tracked files reformatted, 5,805 em-dash characters replaced with `.` to match the convention of the prior sweep. Zero behavioral change.

### Stale count reconciliation

8 current-state skill-count references across 5 files updated to match the actual 38-skill repo state:
- `docs/agent-skill-anatomy.md` (4 instances referencing `27 skills` in progressive-loading diagrams and prose)
- `docs/skills/utility/utility-pm-skill-builder.md` (1 instance in example gap-analysis output)
- `scripts/README_SCRIPTS.md` (1 instance in the description of what `check-count-consistency` catches)
- `skills/utility-pm-skill-builder/SKILL.md` (1 instance in library reference table intro)
- `skills/utility-pm-skill-builder/references/EXAMPLE.md` (1 instance in example gap-analysis output)

The 5 remaining stale-count flags surfaced by `check-count-consistency` are all in the README's "What's New" historical sections (v2.10.0, v2.9.0, v2.8.0, v2.7.0 entries). These are intentional per-release snapshots that correctly document the repo state AT THAT RELEASE. Not touched. The CI script flags them because it cannot distinguish historical from current; script limitation.

---

## Validation

Before tag:

- [x] `scripts/lint-skills-frontmatter.sh` passes all 38 skills (exit 0)
- [x] `npx skills add <local path> -l` discovers exactly 38 skills with zero diff against `skills/` directory
- [x] No em-dashes remain in tracked files
- [ ] `scripts/validate-agents-md.sh` passes
- [ ] `scripts/validate-meeting-skills-family.sh` passes (contract is unchanged; family skills still conform)
- [ ] `scripts/check-count-consistency.sh` passes (skill count still 38)
- [ ] README renders with install command above the fold on GitHub

---

## Success criteria

- All 38 skills install cleanly via `npx skills add product-on-purpose/pm-skills` when v2.11.1 is tagged and pushed.
- Lint catches any future reintroduction of pre-frontmatter content or YAML-ambiguous descriptions.
- skills.sh detail page (if/when it appears post-install-telemetry) shows pm-skills with the current 38-skill library visible.

## Non-goals for v2.11.1

- Phase 4 of the skills.sh plan (`.claude-plugin/marketplace.json`) is deferred.
- Phase 5 soft-launch (driving installs for telemetry) is a separate workstream, user-driven.
- Any new skill or behavior change. Strictly compatibility + cleanup.
