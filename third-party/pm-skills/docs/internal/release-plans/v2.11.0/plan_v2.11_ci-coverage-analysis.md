# v2.11.0 CI Coverage + Validator Analysis

**Date**: 2026-04-17
**Purpose**: Answer pre-release questions about CI and change-log coverage for utility skills, pm-skill-validator family-awareness, and gaps worth closing

---

## Q1: Do we need a plan to update `utility-pm-skill-validate`?

**Yes.** The validator at `skills/utility-pm-skill-validate/SKILL.md` (v1.0.0, 2026-04-03) pre-dates the skill-families pattern. It audits individual skills against the repo's structural conventions but has no concept of:

- Family contract conformance (e.g., a skill in a family should reference its contract)
- Cross-skill coordination checks (e.g., agenda filename should be auto-discoverable by recap)
- Family-specific enum or schema requirements (the validator sees `artifact_type` in frontmatter but does not know whether it belongs to a family enum)

**Recommendation**: Track as a follow-up effort, `F-31: update-pm-skill-validate-for-families`.

Scope:
- Add a Tier 1 check: if skill directory belongs to a family (detected via frontmatter `metadata.frameworks` including a family marker like `meeting-skills-family`), the validator runs the family's validator script in addition to its per-skill checks
- Add a Tier 2 check: does SKILL.md reference its family contract by path?
- Document the family-aware mode in the validator's SKILL.md
- Bump validator to v1.1.0

**Priority**: Medium. Not blocking v2.11.0 release because the family-specific validator (`scripts/validate-meeting-skills-family.sh`) already runs in CI. `pm-skill-validate` is a developer-facing audit tool; family compliance is already enforced automatically.

---

## Q2: What existing CI ensures utility pm-skills (builder, validator, iterate, etc.) stay compliant as new skill releases happen?

**Short answer**: CI runs the same universal checks against utility skills as all other skills. There is no utility-specific CI that re-validates the utility tooling against the current-state skill inventory.

**Detail**:

The repo-level CI workflow `.github/workflows/validation.yml` runs these checks against every skill directory (utility skills included):

| Check | Coverage for utility skills |
|-------|----------------------------|
| `lint-skills-frontmatter` | Yes. frontmatter structure validated |
| `validate-commands` | Yes. slash commands point to valid skill paths |
| `validate-agents-md` | Yes. all skills registered in AGENTS.md |
| `check-count-consistency` | Yes. but advisory only |
| `validate-skills-manifest` | Yes. release-specific manifest checks |
| `validate-skill-history` | Yes. but only validates HISTORY.md when present |

**Gap**: the utility-pm-skill-builder skill embeds knowledge of the repo structure (skill counts, classification rules, category examples) in its SKILL.md and EXAMPLE.md. When new skills ship, that embedded knowledge goes stale silently. The CI catches frontmatter drift but not content drift.

**Specific example**: `skills/utility-pm-skill-builder/SKILL.md` line 201 and `references/EXAMPLE.md` line 38 reference "27 skills" as the baseline. Actual count is now 38. `check-count-consistency` flags this as drift but does not fail the build (advisory). The utility skill is ~11 skills behind current state and has no mechanism to auto-refresh.

**Recommendation**: create `scripts/check-utility-skill-currency.sh` + `.ps1` + `.md` that detects when utility-skill content references stale skill counts or specific skill names that no longer exist. Advisory-first, enforcing after one clean cycle.

---

## Q3: Proper change logs for each utility skill?

**Short answer**: No utility skill has a HISTORY.md file. All utility skills are at v1.0.0 (first version).

**Detail**: per the skill-versioning governance at `docs/internal/skill-versioning.md`, HISTORY.md is created only when a skill ships its **second** version. All current utility skills (pm-skill-builder, pm-skill-validate, pm-skill-iterate, mermaid-diagrams, slideshow-creator, update-pm-skills) are at 1.0.0 and therefore have no HISTORY.md. This is conformant with policy.

**Gap**: when a utility skill's content meaningfully changes (e.g., new examples, count refreshes, process additions) but the version does not bump, there is no changelog. A PATCH-level "content refresh" or "description refinement" bump is conventional when the skill meaningfully changes even without behavior change.

**Recommendation**:
- Add a minor addition to `docs/internal/skill-versioning.md`: "Content refresh" PATCH bumps (v1.0.0 → v1.0.1) for utility-skill updates that refresh embedded knowledge (skill counts, examples) without behavior change. Triggers HISTORY.md creation as convention requires.
- Track as follow-up effort, not blocking v2.11.0.

---

## Q4: Should new scripts/ or CI documentation be created?

**Yes. 3 candidates, in priority order**:

### Priority 1: `scripts/check-utility-skill-currency.sh` + `.ps1` + `.md`

Detects stale skill-count references and specific skill-name references in utility-skill content. Catches the pm-skill-builder v1.0.0 drift problem (references "27 skills" when actual is 38).

Advisory initially. Could be combined with `check-count-consistency.sh` if desired, but scoping it to utility-skill content keeps the signal clean.

### Priority 2: `scripts/validate-skill-family-registration.sh` + `.ps1` + `.md`

When a skill declares membership in a family via `metadata.frameworks` frontmatter field (e.g., `frameworks: [meeting-skills-family]`), validates that:
- The family contract exists at the expected path
- The skill is listed as a member in the family's contract
- The skill's SKILL.md references the family contract

Fills a gap in `validate-meeting-skills-family.sh`, which only knows about the 5 meeting skills by name. A registration-based check generalizes to future families.

### Priority 3: `scripts/check-sample-standards.sh` + `.ps1` + `.md`

Validates `library/skill-output-samples/*/sample_*.md` against SAMPLE_CREATION.md conventions:
- Filename pattern matches `sample_{skill}_{thread}_{context}.md`
- Thread is one of the 5 allowed values (`storevine`, `brainshelf`, `workbench`, `orbit`, `legacy`)
- File has required sections: `## Scenario`, `## Prompt`, `## Output`
- No unresolved placeholders (`TBD`, `TODO`, `<placeholder>`)

This would have caught the meeting-skills sample non-conformance that was discovered during pre-release review. Advisory initially; the v2.11.0 release-prep sample restructure closes the existing gap.

### Priority 4 (defer): `scripts/check-contract-version-sync.sh`

Validates that family contract version matches what the family's validator expects. Low-priority because only two artifacts exist today; easy to keep in sync manually.

---

## Summary

| Question | Answer | Follow-up? |
|----------|--------|-----------|
| Update pm-skill-validate for family-awareness? | Yes | F-31 effort, medium priority, non-blocking |
| CI coverage for utility-skill compliance? | Partial. universal checks apply; content drift is not caught | P1 script `check-utility-skill-currency` |
| Change logs for utility skills? | None exist; all at v1.0.0 (policy-conformant) | Minor skill-versioning policy addition for content-refresh PATCH bumps |
| New scripts needed? | Yes. 3 P1/P2 scripts recommended; 1 P3 deferred | Track as separate efforts |

**Nothing blocks v2.11.0 release.** All recommendations are follow-up work for v2.12.0+ or post-release hardening. The meeting-skills-family already has its own validator; the broader gaps are repo-wide concerns, not family-specific ones.
