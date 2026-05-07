# [F-32] pm-skill-builder: Sample Generation

Status: Backlog
Milestone: v2.12.0
Issue: TBD
Agent: Claude Opus 4.7

## Scope

Extend `utility-pm-skill-builder` (currently v1.0.0) to generate 3 thread-aligned sample drafts automatically when creating a new skill. Generated drafts conform to SAMPLE_CREATION.md by construction (filename pattern, thread enum, required sections, fictional-marker discipline) and use thread profiles from the new `THREAD_PROFILES.md` reference (F-34) to produce realistic scenarios specific to Storevine, Brainshelf, and Workbench product contexts.

Bumps pm-skill-builder to v1.1.0 with HISTORY.md creation (first post-v1.0.0 bump).

## Problem

Sample creation today is a manual step outside the skill-creation workflow. After `/pm-skill-builder` produces SKILL.md, TEMPLATE.md, EXAMPLE.md, and a slash command, the author must:

1. Remember to create samples
2. Read SAMPLE_CREATION.md to understand conventions
3. Pick 3 thread-appropriate scenarios
4. Hand-author each sample with Scenario / Prompt / Output structure
5. Maintain fictional-marker discipline

This is tedious, error-prone, and regularly skipped or shortcut. Real-world evidence: the v2.11.0 meeting-skills-family release shipped an initial sample round that violated SAMPLE_CREATION.md and required restructure. The root cause: samples were created as an afterthought rather than as part of the skill-creation flow.

Automating sample generation closes three gaps:
- **Mechanical**: filename, sections, markers are generated correctly by construction (not left to author discipline)
- **Thread awareness**: builder pulls from THREAD_PROFILES.md so scenarios fit each thread's product context
- **Authorial load**: user gets 3 draft scenarios to refine, not a blank page

## How It Works

### Input (unchanged for the user)

Same as current pm-skill-builder invocation. user provides skill idea, builder does gap analysis and generates the skill.

### New step in the builder's process

After producing SKILL.md, TEMPLATE.md, and EXAMPLE.md, the builder:

1. Loads `library/skill-output-samples/THREAD_PROFILES.md` (new file from F-34)
2. For each of the 3 threads (storevine, brainshelf, workbench):
   a. Reads the thread profile (company context, team size, product arc, prompt style, scenario catalog)
   b. Selects or generates a scenario appropriate for this skill's purpose in this thread
   c. Authors a complete sample with Scenario / Prompt / Output sections
   d. Ensures filename conforms: `sample_{skill-name}_{thread}_{scenario-slug}.md`
   e. Applies fictional-marker discipline: every invented metric tagged `[fictional]`
3. Writes all 3 samples to `library/skill-output-samples/{skill-name}/`
4. Reports sample generation to the user with scenarios used and editing guidance

### Output (extended)

In addition to current outputs, the builder now produces 3 samples in the library. User receives:

- 3 draft samples, each with realistic thread-appropriate scenarios
- Guidance on which sections to refine (scenarios often need product-expertise touch)
- Fictional metrics clearly marked so user can verify plausibility

### Scenario generation logic

The builder uses skill purpose + thread profile to generate scenarios. Examples:

- Skill: "meeting-recap" + Storevine thread → "B2B ecommerce platform team had a pricing decision meeting for the Campaigns feature"
- Skill: "customer-escalation-summary" + Brainshelf thread → "Consumer PKM app had a customer data-loss incident affecting beta users"
- Skill: "retrospective" + Workbench thread → "Enterprise collaboration team completed Blueprints v1.1 rollout and needs a retro"

Scenarios draw from each thread's documented feature arc (Campaigns / Resurface / Blueprints) plus natural extensions.

## Classification

- Type: utility-skill update (in place)
- Skill: `utility-pm-skill-builder` v1.0.0 → v1.1.0
- No new slash command; existing `/pm-skill-builder` behavior expanded

## Exemplars

- Current `utility-pm-skill-builder` v1.0.0. generation pattern to extend
- `library/skill-output-samples/SAMPLE_CREATION.md`. standards the generated output must satisfy
- `library/skill-output-samples/THREAD_PROFILES.md` (F-34, prerequisite). thread reference the builder consumes

## Deliverables

- `skills/utility-pm-skill-builder/SKILL.md`. extended with sample-generation instruction
- `skills/utility-pm-skill-builder/references/TEMPLATE.md`. updated output contract includes samples
- `skills/utility-pm-skill-builder/references/EXAMPLE.md`. updated worked example shows full output with samples
- `skills/utility-pm-skill-builder/HISTORY.md`. NEW, first HISTORY.md documenting v1.0.0 → v1.1.0 bump
- `docs/skills/utility/utility-pm-skill-builder.md`. public doc refresh
- Updated skills-manifest entry for v2.12.0 release

## Validation

- `lint-skills-frontmatter.sh`: updated skill passes
- `validate-skill-history.sh`: new HISTORY.md conforms
- End-to-end: run `/pm-skill-builder` on a fresh skill idea; confirm 3 samples generated, all conforming to SAMPLE_CREATION.md
- Cross-check: run `/pm-skill-validate` (post-F-31) on the new skill; confirm family-aware + sample-aware checks pass

## Open Questions

- When a skill doesn't fit naturally into a thread's product arc, how graceful is the scenario generation? (Example: a compliance-specific skill might be awkward in Brainshelf's consumer context.) Proposal: thread profile includes "unlikely scenarios" list; builder flags if the skill+thread combo is weak.
- Should samples be editable in-place after generation, or should the builder offer a "regenerate-on-skill-change" mode? (F-35 covers the regenerate-on-change case; builder's job is initial generation.)
- For utility skills (which typically have 1 storevine sample only per convention), should the builder skip the 3-thread generation and produce just 1? Proposal: yes, detected via `classification: utility` frontmatter.

## Dependencies

- **F-34 (THREAD_PROFILES.md)** must ship first. provides the machine-readable thread reference the builder consumes

## Status Transitions

- **Backlog** (current, blocked on F-34)
- **In Progress**. when sample-generation logic is added to the builder
- **Shipped**. on v2.12.0 tag + push

## Detailed specification

Deferred. produced during refactor pass.
