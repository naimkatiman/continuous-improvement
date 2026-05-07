# [F-41] Design Sprint Skills

Status: Backlog (Stub)
Milestone: TBD (post-v2.12.0)
Issue: TBD
Agent: TBD

## Scope

A family of pm-skills supporting the GV Design Sprint methodology by Jake Knapp et al. The 5-day process (Map to Sketch to Decide to Prototype to Test) produces several distinct artifacts that map naturally to skill outputs: sprint brief, user journey map, HMW notes, lightning demos, solution sketches, storyboard, prototype plan, test synthesis.

This is a stub. Scope is TBD pending discovery. Source notes at `docs/internal/skills-ideas/design-sprint/jpnotes.md`.

## Problem

PMs running design sprints typically reproduce the same artifact templates from scratch each time. Industry references (designsprintkit.withgoogle.com, the GV Sprint book by Knapp, Zeratsky, and Kowitz) provide methodology but not artifact-shaped scaffolding for AI agents. pm-skills could differentiate by providing strict, methodology-grounded sprint artifact skills that respect the full GV process discipline (not generic "workshop" templates).

The gap is real because:
- No existing pm-skill produces sprint-day artifacts
- Existing adjacent skills (`define-jtbd-canvas`, `define-problem-statement`, `define-opportunity-tree`) cover related but narrower concerns
- The sprint methodology has structural requirements (HMW format, Note-and-Vote, Lightning Demos, Solution Sketches three-panel format) that a generic skill would not encode

## How It Works

TBD pending discovery. Likely shape: 5 to 8 skills, possibly grouped as a skill family with a shared contract (matching the meeting-skills-family precedent at v2.11.0).

Two candidate decomposition strategies to explore:

- **Phase-aligned**: one skill per day (sprint-day-1-map, sprint-day-2-sketch, sprint-day-3-decide, sprint-day-4-prototype, sprint-day-5-test). Mirrors the GV book structure.
- **Artifact-aligned**: one skill per produced artifact (sprint-brief, user-journey-map, hmw-notes, lightning-demos, solution-sketches, storyboard, prototype-plan, test-synthesis). Mirrors pm-skills' "one skill = one artifact" rule.

Tentative recommendation: artifact-aligned, since pm-skills' existing convention treats artifacts as the load-bearing unit. Phase-aligned would bundle multiple distinct artifacts per skill, violating the convention.

## Classification

TBD. Likely:
- Foundation classification (cross-phase, design-discovery-oriented) OR a new "design-sprint" namespace
- New skill family with shared contract at `docs/reference/skill-families/design-sprint-skills-contract.md`
- Or possibly Discover + Define phase skills if individually classified

## Exemplars

- `docs/internal/efforts/meeting-skills-family/plan_family-contract.md` (5-skill family with shared contract pattern shipped in v2.11.0)
- `foundation-okr-writer` plus `measure-okr-grader` (skill pair pattern, current v2.12.0 work)
- `docs/reference/skill-families/meeting-skills-contract.md` (canonical family-contract format)
- `scripts/validate-meeting-skills-family.sh` (CI enforcement pattern that could adapt to design-sprint conformance)

## Deliverables

TBD pending discovery. Rough estimate based on artifact-aligned decomposition:

- 5 to 8 SKILL.md files plus references (TEMPLATE.md, EXAMPLE.md per skill)
- 5 to 8 command files
- Family contract document
- 15 to 24 thread-aligned samples (3 threads x 5 to 8 skills)
- Validation script for family conformance
- AGENTS.md updates
- mkdocs.yml nav additions
- skills-manifest.yaml entry

## Validation

TBD pending discovery. Anticipated validation patterns:

- Each skill conforms to family contract (frontmatter shape, file naming, output sections)
- Cross-skill chain works (artifacts from earlier days feed later-day skills cleanly)
- Sample threads exercise the full sprint flow end-to-end in at least one of the three threads
- Codex adversarial review pass on the family contract before family ships

## Open Questions

Many. Discovery phase will surface and prioritize. Initial list:

- Phase-aligned vs artifact-aligned decomposition (see How It Works)
- Should there be a Foundation Sprint dependency? F-42 (Foundation Sprint Skills) is the precursor methodology
- How does the family interact with existing Discover/Define skills (`define-jtbd-canvas`, `define-problem-statement`, `define-opportunity-tree`)?
- Should the family include a coordinating "sprint-conductor" skill that orchestrates the 5-day flow, or is that a workflow rather than a skill?
- AJ&Smart / Design Sprint 2.0 variant: the modernized 4-day version. Does the family support it as a variant or stay strict to the GV 5-day?
- Remote vs in-person sprint variants: the artifacts are the same but the process differs. Does the skill encode remote-friendly defaults?

## Dependencies

- F-42 (Foundation Sprint Skills) may want to ship first since Foundation Sprint is positioned as a precursor to Design Sprint
- Benefits from any skill-family-contract tooling improvements that ship between now and authoring (F-36 generic family-registration validator from v2.12.0 backlog)

## Source notes

User notes at `docs/internal/skills-ideas/design-sprint/jpnotes.md` (URL bookmarks):

- https://www.gv.com/sprint/
- https://en.wikipedia.org/wiki/Design_sprint
- https://designsprintkit.withgoogle.com/methodology/overview

Additional canonical references to pull during discovery:

- Knapp, Zeratsky, Kowitz: `Sprint: How to Solve Big Problems and Test New Ideas in Just Five Days` (Simon and Schuster, 2016)
- AJ&Smart Design Sprint 2.0 materials
- Tanya Junell sprint-facilitator resources

## Status Transitions

- **Backlog (Stub)** (current, 2026-05-01)
- **In Discovery** when active discovery begins (research synthesis, scoping decisions)
- **In Definition** when scope is locked and skill family design is being authored
- **In Progress** when SKILL.md authoring begins
- **Shipped** when first version of family lands in main

## Detailed specification

Deferred. Working materials live at:

- Discovery phase: `docs/internal/skills-ideas/design-sprint/_LOCAL/discovery/` (gitignored)
- Definition phase: `docs/internal/skills-ideas/design-sprint/_LOCAL/definition/` (gitignored)
- Working files during authoring: `docs/internal/efforts/F-41-design-sprint-skills/` (this folder, tracked)
