# [F-35] pm-skill-iterate: Sample Regeneration

Status: Backlog
Milestone: v2.12.0
Issue: TBD
Agent: Claude Opus 4.7

## Scope

Extend `utility-pm-skill-iterate` (currently v1.0.0) to offer sample regeneration when a skill's SKILL.md or TEMPLATE.md is meaningfully changed. Closes the drift loop: skill changes → samples regenerate → validator confirms conformance. Together with F-31 (sample-aware validator) and F-32 (sample-generating builder), this completes the "samples as a first-class dependency" story.

Bumps pm-skill-iterate to v1.1.0 with HISTORY.md creation.

## Problem

Even with F-32 (builder generates initial samples) and F-31 (validator detects drift), there's a gap in the middle: when a skill is iterated via `/pm-skill-iterate` and the template structure changes, its samples still reflect the old template. The validator will flag this as drift, but the author then has to:

1. Read the drift warnings
2. Figure out what changed in the template
3. Regenerate or manually update each affected sample
4. Re-validate

This is the same shape of tedium that F-32 solved for initial generation. The iteration step needs the same automation.

Without it, samples tend to stagnate. skill iterations accumulate, samples fall further behind, and eventually the samples become misleading artifacts that teach users the wrong template.

## How It Works

### Trigger

When `/pm-skill-iterate` completes a skill update, it detects whether the update changed:

- `SKILL.md` frontmatter fields (classification, category)
- `SKILL.md` process-section structure
- `TEMPLATE.md` section order or required subsections

If any of these changed, the iterate skill offers sample regeneration as a follow-up step with three options:

1. **Regenerate all samples**. use the same thread + scenario context from existing samples, re-generate output against new template
2. **Regenerate drift only**. if F-31 validator reports specific samples drifted, regenerate just those
3. **Skip**. user accepts drift, maybe deliberately (samples were manually refined and should not be overwritten)

### Regeneration logic

For each sample being regenerated:

1. Load the existing sample's Scenario and Prompt sections (preserve human-authored context)
2. Load the new TEMPLATE.md
3. Regenerate the Output section to conform to the new template, preserving scenario specifics
4. Preserve `[fictional]` markers and source notes
5. Write back, overwriting only the Output section

The preserve-Scenario-and-Prompt approach is key: the creative work (thread-appropriate scenario, realistic prompt style) stays intact. Only the structurally-affected Output changes.

### User experience

```
$ /pm-skill-iterate skills/deliver-prd based on this validation report

... iteration logic runs ...

Skill updated: SKILL.md (new section added), TEMPLATE.md (section order changed).

3 samples in library/skill-output-samples/deliver-prd/ will need output-section
updates to match the new template. Options:
  1. Regenerate all 3 samples (preserves Scenarios and Prompts)
  2. Skip (samples will be flagged as drifted by /pm-skill-validate)
  3. Review each sample individually

Choice: 1

Regenerated:
  sample_deliver-prd_storevine_campaigns.md
  sample_deliver-prd_brainshelf_resurface.md
  sample_deliver-prd_workbench_blueprints.md

All samples conform to new template. /pm-skill-validate clean.
```

## Classification

- Type: utility-skill update (in place)
- Skill: `utility-pm-skill-iterate` v1.0.0 → v1.1.0
- No new slash command; existing `/pm-skill-iterate` behavior expanded

## Exemplars

- Current `utility-pm-skill-iterate` v1.0.0. iteration pattern to extend
- F-32 (`utility-pm-skill-builder` with sample generation). sample-authoring logic pattern to reuse
- F-31 (`utility-pm-skill-validate` with sample-awareness). drift-detection source

## Deliverables

- `skills/utility-pm-skill-iterate/SKILL.md`. extended with sample-regeneration behavior
- `skills/utility-pm-skill-iterate/references/TEMPLATE.md`. updated iteration-report template
- `skills/utility-pm-skill-iterate/references/EXAMPLE.md`. updated worked example including regeneration
- `skills/utility-pm-skill-iterate/HISTORY.md`. NEW, first HISTORY.md
- `docs/skills/utility/utility-pm-skill-iterate.md`. public doc refresh
- Updated skills-manifest entry for v2.12.0 release

## Validation

- `lint-skills-frontmatter.sh`: updated skill passes
- `validate-skill-history.sh`: new HISTORY.md conforms
- End-to-end: iterate a skill with a meaningful TEMPLATE.md change; confirm samples regenerate correctly, preserving Scenarios and Prompts, updating only Output
- Cross-check: post-regeneration, `/pm-skill-validate` (F-31) reports no drift

## Open Questions

- Should regeneration be invoked automatically or always offered as explicit user choice? Proposal: always offered explicit (user may have manual refinements worth preserving), with `--regenerate-samples` flag for non-interactive automation.
- When regenerating, should the skill offer to also update the Scenario section based on new skill context? Proposal: no in v1.1.0. preserves the separation between creative (Scenario) and structural (Output) concerns. Could be a v2 option.
- What about samples the user has edited significantly. how does regeneration know? Proposal: no detection mechanism in v1.1.0; user is warned that regeneration overwrites Output. Heuristic "significantly edited" detection is a v2 enhancement.

## Dependencies

- **F-32** ideally ships first. provides the sample-authoring logic to reuse
- **F-31** ideally ships first. provides the drift-detection that triggers the regeneration offer
- Could ship independently if the iteration skill embeds its own regeneration logic, but code duplication increases

## Status Transitions

- **Backlog** (current, logically blocked on F-31 and F-32)
- **In Progress**. when iteration-skill extension begins
- **Shipped**. on v2.12.0 tag + push

## Detailed specification

Deferred. produced during refactor pass.
