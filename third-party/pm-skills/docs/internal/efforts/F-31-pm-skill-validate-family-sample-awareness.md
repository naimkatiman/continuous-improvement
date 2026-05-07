# [F-31] pm-skill-validate: Family + Sample Awareness

Status: Backlog
Milestone: v2.12.0
Issue: TBD
Agent: Claude Opus 4.7

## Scope

Update `utility-pm-skill-validate` (currently v1.0.0) to add two new dimensions of awareness:

1. **Family-awareness**. when a skill belongs to a skill family (detected via `metadata.frameworks` frontmatter marker), run the family's validator script as part of the audit and report family-contract conformance alongside per-skill checks
2. **Sample-awareness**. verify that each skill has the expected number of samples in `library/skill-output-samples/` conforming to SAMPLE_CREATION.md, and detect drift when a skill's TEMPLATE.md changes but its samples do not

Bumps pm-skill-validate to v1.1.0 with HISTORY.md creation (first post-v1.0.0 bump).

## Problem

The current pm-skill-validate (v1.0.0, shipped 2026-04-03) has two blind spots:

1. **Pre-family-era scoping**: it was written before skill families existed. It audits a single skill against structural conventions (frontmatter, naming, file presence, description word count, template referenced) but has no concept of family contracts. When a skill in the meeting-skills-family fails family-contract conformance (e.g., missing `## Zero-friction execution` section, wrong `artifact_type` enum value), the validator misses it because the family's requirements aren't in its rule set.

2. **Sample blindness**: the validator doesn't look at `library/skill-output-samples/{skill}/` at all. A skill can ship without samples, with non-conforming samples, or with samples that drifted out of sync with the SKILL.md / TEMPLATE.md, and the validator will happily report "pass."

Real-world example from v2.11.0: my first round of meeting-skill samples violated SAMPLE_CREATION.md (wrong thread slot, missing Scenario/Prompt/Output sections) and the validator flagged nothing. The gap was caught by a manual pre-release review, not by automated validation.

## How It Works

### New Tier 1 checks (deterministic, additive)

Add to the existing Tier 1 structural checks:

- **Family membership**: if `metadata.frameworks` contains a family marker (e.g., `meeting-skills-family`), locate the family's validator script at `scripts/validate-{family-name}.sh` and run it. Fold its output into the validation report.
- **Family contract reference**: if the skill is a family member, does its SKILL.md contain a link to `docs/reference/skill-families/{family-name}-contract.md`?
- **Sample presence**: does `library/skill-output-samples/{skill-name}/` exist and contain at least N sample files? (N = 3 by default; configurable per skill)
- **Sample filename conformance**: do all files match the pattern `sample_{skill-name}_{thread}_{context}.md` with thread in the allowed enum?
- **Sample section presence**: does each sample contain `## Scenario`, `## Prompt`, and `## Output` sections?

### New Tier 2 checks (LLM-assessed, additive)

Add to the existing Tier 2 quality checks:

- **Sample fidelity to TEMPLATE.md**: for each sample, does its Output section follow the skill's current `references/TEMPLATE.md` section order? Flags samples that drifted when the template was updated but samples were not.
- **Fictional-marker discipline**: do invented metrics in samples carry `[fictional]` markers as SAMPLE_CREATION.md requires?
- **Scenario realism**: is the Scenario section plausible for the declared thread? (LLM judgment, low-confidence flags acceptable.)

### Report format

Extend the existing validation report with:

- **Family section**: family name, contract path, family-validator pass/fail, deviations listed
- **Samples section**: sample count (actual / expected), conformance per sample, drift flags if any

## Classification

- Type: utility-skill update (in place)
- Skill: `utility-pm-skill-validate` v1.0.0 → v1.1.0
- No new slash command; existing `/pm-skill-validate` behavior expanded

## Exemplars

- Current `utility-pm-skill-validate` v1.0.0. Tier 1 / Tier 2 pattern to extend
- `scripts/validate-meeting-skills-family.sh`. pattern for family-validator integration
- `library/skill-output-samples/SAMPLE_CREATION.md`. the standards the validator enforces

## Deliverables

- `skills/utility-pm-skill-validate/SKILL.md`. updated with family and sample checks
- `skills/utility-pm-skill-validate/references/TEMPLATE.md`. updated report template
- `skills/utility-pm-skill-validate/references/EXAMPLE.md`. updated worked example showing family-aware and sample-aware output
- `skills/utility-pm-skill-validate/HISTORY.md`. NEW, first HISTORY.md for this skill documenting v1.0.0 → v1.1.0 bump
- `docs/skills/utility/utility-pm-skill-validate.md`. public doc refresh
- Updated skills-manifest entry for v2.12.0 release

## Validation

- `lint-skills-frontmatter.sh`: updated skill passes
- `validate-skill-history.sh`: new HISTORY.md conforms to governance
- Self-validation: run `/pm-skill-validate` against one of the 5 meeting skills; confirm it reports family-contract conformance correctly

## Open Questions

- How does the validator discover the family validator script? Convention-based path (`scripts/validate-{family-marker}.sh`) or explicit frontmatter pointer?
- Should sample drift be ERROR or WARNING? Proposal: WARNING by default (skills evolve faster than samples), ERROR if samples are more than 2 versions behind.
- Expected sample count. is 3 (per SAMPLE_CREATION.md thread convention) the universal default, or does it vary by classification (utility: 1 storevine sample only; foundation: 3 threads; phase: 3 threads)?

## Status Transitions

- **Backlog** (current)
- **In Progress**. when pm-skill-validate refactor begins
- **Shipped**. on v2.12.0 tag + push

## Detailed specification

Deferred. produced during refactor pass.
