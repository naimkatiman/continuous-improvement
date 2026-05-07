# [F-42] Foundation Sprint Skills

Status: Backlog (Stub)
Milestone: TBD (post-v2.12.0)
Issue: TBD
Agent: TBD

## Scope

A family of pm-skills supporting the Foundation Sprint methodology, a newer condensed sprint format positioned as a precursor to the GV Design Sprint. Foundation Sprint produces the foundational alignment (problem framing, customer thesis, value proposition, differentiation) that a Design Sprint then operationalizes.

This is a stub. Scope is TBD pending discovery. Source notes at `docs/internal/skills-ideas/foundation-sprint/jpnotes.md`. Methodology is newer than the canonical GV Design Sprint; expect more variance in published references.

## Problem

Teams that jump straight into a Design Sprint frequently discover mid-sprint that they have not aligned on problem definition, customer, value proposition, or differentiation. The Foundation Sprint addresses this by front-loading foundational alignment in a 1 to 2 day shorter format. Without this, design sprints re-litigate foundational questions that should have been settled before the team picked up the marker.

The methodology is currently underdocumented in canonical pm-skills sources. Industry references (Lenny Rachitsky newsletter, Design Sprint Academy) introduce it but the artifact set is still stabilizing across practitioners.

The gap pm-skills could fill:
- No existing pm-skill produces foundational-alignment-sprint artifacts
- Existing adjacent skills (`define-problem-statement`, `define-jtbd-canvas`, `foundation-lean-canvas`) cover overlapping territory but not the Foundation Sprint's specific synthesis pattern
- Foundation Sprint outputs feed naturally into the Design Sprint family (F-41), creating a chained methodology offering

## How It Works

TBD pending discovery. Likely shape: 2 to 4 skills capturing the Foundation Sprint's core artifacts.

Candidate artifacts based on initial source skim:

- Foundational problem statement (sharper than `/problem-statement` because Foundation-Sprint-specific)
- Customer thesis (overlaps with `/persona` and `/jtbd-canvas`; needs sharper differentiation)
- Value proposition canvas (could map to existing `/lean-canvas` or be a sub-artifact)
- Differentiation matrix (positions vs alternatives; overlap with `/competitive-analysis`)

Major open question: how much overlap exists between Foundation Sprint artifacts and existing pm-skills, and where is the genuine new ground? Discovery should answer this before scope locks.

## Classification

TBD. Likely:
- Foundation classification (cross-phase, alignment-oriented)
- Possibly a new skill family with shared contract, or possibly individual foundation skills if scope is small enough
- Some artifacts may end up as variants of existing skills rather than net-new skills

## Exemplars

- `docs/internal/efforts/meeting-skills-family/plan_family-contract.md` (family-contract pattern at v2.11.0)
- `foundation-lean-canvas` (closest existing artifact in shape and intent)
- `foundation-okr-writer` plus `measure-okr-grader` (skill pair pattern, current v2.12.0 work)
- F-41 Design Sprint Skills (sibling effort; chained methodology)

## Deliverables

TBD pending discovery. Rough estimate (aggressively scoped):

- 2 to 4 SKILL.md files plus references (TEMPLATE.md, EXAMPLE.md per skill)
- 2 to 4 command files
- Possibly a small family contract if more than 2 skills ship together
- 6 to 12 thread-aligned samples (3 threads x 2 to 4 skills)
- AGENTS.md updates
- mkdocs.yml nav additions
- skills-manifest.yaml entry

## Validation

TBD pending discovery. Anticipated:

- Foundation Sprint outputs cleanly feed the Design Sprint family (F-41) without manual translation
- Sample threads exercise the alignment flow end-to-end
- Differentiation from existing skills (`define-problem-statement`, `define-jtbd-canvas`, `foundation-lean-canvas`, `discover-competitive-analysis`) is documented and defensible

## Open Questions

Many. Initial list:

- How much of Foundation Sprint can be assembled from existing pm-skills (lean-canvas, problem-statement, persona, jtbd-canvas) versus net-new artifacts?
- Should F-42 ship before, after, or in parallel with F-41 Design Sprint Skills? Methodology says Foundation precedes Design, but pm-skills shipping order may differ
- Is the Foundation Sprint stable enough as a methodology to encode strictly, or is it still evolving in ways that would make a strict skill brittle?
- How does Lenny Rachitsky's framing differ from the Design Sprint Academy framing? Discovery should triangulate
- Should this be a skill family or a workflow that chains existing skills?

## Dependencies

- F-41 (Design Sprint Skills) is the natural downstream consumer; design choices here should anticipate that chain
- Benefits from any skill-family-contract tooling that ships between now and authoring

## Source notes

User notes at `docs/internal/skills-ideas/foundation-sprint/jpnotes.md` (URL bookmarks):

- https://www.designsprint.academy/blog/what-is-the-foundation-sprint
- https://www.lennysnewsletter.com/p/introducing-the-foundation-sprint
- (more resources to be added during discovery)

Additional candidates to find during discovery:

- Jake Knapp / John Zeratsky publications on Foundation Sprint (if any)
- AJ&Smart materials (the firm has published variants)
- Practitioner case studies from PM newsletters and substacks

## Status Transitions

- **Backlog (Stub)** (current, 2026-05-01)
- **In Discovery** when active discovery begins (research synthesis, methodology triangulation)
- **In Definition** when scope is locked and skill design is being authored
- **In Progress** when SKILL.md authoring begins
- **Shipped** when first version lands in main

## Detailed specification

Deferred. Working materials live at:

- Discovery phase: `docs/internal/skills-ideas/foundation-sprint/_LOCAL/discovery/` (gitignored)
- Definition phase: `docs/internal/skills-ideas/foundation-sprint/_LOCAL/definition/` (gitignored)
- Working files during authoring: `docs/internal/efforts/F-42-foundation-sprint-skills/` (this folder, tracked)
