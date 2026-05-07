# [F-30] Meeting Skills Family Adoption Guide

Status: Backlog
Milestone: v2.12.0 (candidate)
Issue: TBD
Agent: Claude Opus 4.7

## Scope

Create `docs/guides/meeting-skills-family-adoption.md`. a migration and adoption guide for teams who already have internal meeting templates, playbooks, or tooling and want to move to the pm-skills foundation-meeting-* family. Helps teams evaluate the fit, plan a phased adoption, and handle cultural friction points.

## Problem

Most PM teams already have *some* meeting-template culture: shared Notion pages, recurring agenda templates, or informal conventions for recaps. Adopting the foundation-meeting-* family means asking these teams to:

1. Learn a new tool (the skill family)
2. Migrate existing templates to the family's schema
3. Retrain stakeholders on new artifact formats
4. Handle edge cases where their existing conventions differ from the family's opinions (anti-meeting check, filename convention, go-mode inference)

Without a structured adoption guide, teams either reject the family ("we already have this solved") or adopt it unevenly (each PM uses it differently, defeating the consistency benefit). The guide addresses both failure modes.

## How It Would Work

### Audience

- PM leads evaluating the family for team adoption
- Individual PMs considering personal adoption
- Engineering/design leads who will receive artifacts from PMs using the family

### Content

1. **Evaluation section**
   - Decision framework: does the family fit our team's meeting culture?
   - Fit indicators (high-context stakeholders, cross-functional meetings, recurring initiatives)
   - Anti-indicators (heavy calendar-tool dependency, real-time-only culture, no existing meeting discipline to build on)

2. **Migration section**
   - Mapping exercise: existing template sections → family contract sections
   - Filename-convention migration: how to retrofit old artifacts
   - Frontmatter additions: what to add, what can stay absent (inference picks it up)
   - Phased rollout: agenda first, then recap, then full chain

3. **Adoption friction points**
   - Anti-meeting check rejection ("but we need this meeting"). how to handle
   - Go-mode default vs. team discipline ("we want inference checkpoints"). how to configure
   - Stakeholder-update shareable-boundary confusion ("what's safe to paste?")
   - Cultural alignment on ownership-reconciliation (30% unassigned threshold)

4. **Measuring adoption success**
   - Leading indicators: % of meetings using agenda, recap consistency
   - Lagging indicators: meeting-length reduction, decision-revisit rate
   - When to stop (the family isn't working for this team)

### Supporting artifacts

- Worked adoption example ("Storevine-style team adopts meeting-skills")
- FAQ covering common migration friction
- Decision tree: per-skill "should I adopt this first?"

## Classification

- Type: `guide` (narrative doc, not a skill)
- Directory: `docs/guides/`
- Path: `docs/guides/meeting-skills-family-adoption.md`

## Exemplars

- `docs/guides/authoring-pm-skills.md`. guide format exemplar (long-form, structured, actionable)
- `docs/guides/mcp-setup.md`. guide with adoption framing and troubleshooting
- `docs/pm-skill-lifecycle.md`. workflow-pattern guide that could be extended here

## Deliverables

- `docs/guides/meeting-skills-family-adoption.md`. the guide itself
- `mkdocs.yml`. nav entry under Guides
- Cross-links from `docs/skills/foundation/foundation-meeting-*.md` into the guide
- Cross-link from `docs/reference/skill-families/meeting-skills-contract.md` for users reading the contract first
- Optional: 1-2 mermaid diagrams (adoption decision tree, migration phases)

## Validation

- `validate-docs.sh` (if it exists): guide conforms to doc standards
- `check-count-consistency.sh`: any count references match current state
- Manual review: does the guide actually help a PM lead decide?

## Open Questions

- Should the guide include real customer adoption stories (fictional via the Storevine/Brainshelf/Workbench threads)? Adds richness but lengthens the guide.
- Should the guide link to F-29 (meeting-lifecycle workflow) as the adoption target, or present each skill separately for more flexibility?
- How much migration detail to include? Mapping every template section to family schema is thorough but becomes doc-heavy fast.

## Status Transitions

- **Backlog** (current)
- **In Progress**. when guide authoring begins
- **Shipped**. on v2.12.0 tag + push

## Rationale for deferral to v2.12.0+

v2.11.0 ships the family itself. Before writing an adoption guide, real-world feedback on friction points and common mistakes will produce a much better guide than theorizing. Defer until at least 2-3 teams have adopted internally.

A lighter-weight precursor. `docs/guides/using-meeting-skills.md`. ships in v2.11.0 (tutorial for individual PMs). The adoption guide is a separate, heavier deliverable for team-level adoption.

## Detailed specification

Deferred. produced during guide authoring pass.
