# [F-18] Foundation Meeting Agenda Skill

Status: Backlog
Milestone: v2.11.0
Issue: TBD
Agent: Claude Opus 4.7

> **History note**: This effort replaces the original F-18 "meeting-prep" scope (archived at `docs/internal/_NOTES/archived-efforts/2026-04-17_F-18-meeting-prep-original.md`). The original collapsed agenda + brief into one skill; the new family design splits them by audience. Salvaged content (anti-meeting check, one-sentence objective, success criteria, simplified RACI, meeting type taxonomy) is distributed across this effort and F-25 (brief).

## Scope

Create `foundation-meeting-agenda`, a pre-meeting skill that produces an attendee-facing structural document setting what will be discussed, who owns each topic, and how time will be spent. Conforms to the [Meeting Skills Family Contract](../reference/skill-families/meeting-skills-contract.md). Supports meeting-type variants (1-on-1, team sync, stakeholder review, decision meeting, project kickoff, working session, exec briefing).

## Problem

Attendees walk into internal meetings with no structural signal for what to expect. Agendas, when they exist, are one-line items without type tags, owners, or time allocations. This produces predictable failure modes: topics balloon because "Discussion" was not distinguished from "Decision," pre-reads are skipped because estimated prep time was not given, and meetings end without clarity on what was accomplished because no desired outcomes were stated.

PMs running meetings already know this. They also know that typing out a structured agenda takes 15–20 minutes they do not have. The skill closes this gap: it produces a conforming agenda from a minimal brief, with topic type tags, time allocations, owners, desired outcomes, pre-read links, and logistics. in one invocation.

## How It Works

### Input

- Meeting topic or purpose (required)
- Meeting duration (optional. defaults to 30 min per family contract; skill flags the default in `Known gaps`)
- Attendees list (optional. skill infers RACI roles when present)
- Time constraint context (calendar slot, cross-timezone window)
- Context: related project, prior decisions, open questions, linked documents

### Process

1. **Anti-meeting check** (per family contract). prompt "does this need to be a meeting at all?" Accept override; offer async-alternative framing if objective is simple information transfer or single-owner decision
2. **Clarify objective**. force a one-sentence decision-changing statement. If the user provides a vague topic ("Let's sync on X"), the skill infers and proposes a sharper objective, surfaced in the go-mode inference summary
3. **Infer meeting type**. from topic and attendee signals; default to `other` with `[confidence: low]` when unclear
4. **Present go-mode inference summary**. per family contract
5. **Design agenda**. time-boxed sections with owner and topic-type tag (Discussion | Decision | Information | Working), sized to fit meeting duration
6. **Specify pre-reads and attendee prep**. links, estimated prep time, "come ready to" expectations
7. **Produce artifact**. conforming to TEMPLATE.md

### Output

Structured pre-meeting agenda conforming to the family contract's frontmatter schema and section requirements. Shareable summary block at top (meeting title, date, time, duration, purpose, 3–5 topic bullets with time, pre-reads). Full agenda below with meeting details, purpose, desired outcomes, time-boxed topics with owners and types, attendee prep section, parking lot placeholder, logistics. Sources & References section at bottom with generation context including any defaults applied (e.g., 30 min duration) and inferences made (e.g., meeting type).

## Classification

- Type: `foundation` (cross-phase; agendas are used in any Triple Diamond phase)
- Category: `meeting` (new category shared across the 5 foundation-meeting-* skills)
- Directory: `skills/foundation-meeting-agenda/`
- Command: `/meeting-agenda`

## Exemplars

- `foundation-lean-canvas`: foundation-classification pattern, template-driven output with frontmatter schema, canonical layout scaffold
- `foundation-persona`: Supported Modes section pattern, Evidence & Confidence discipline
- Meeting Skills Family Contract: shared behavioral and structural requirements
- Archived F-18 original: anti-meeting check, simplified RACI, one-sentence objective discipline (salvaged)

## Deliverables

- `skills/foundation-meeting-agenda/SKILL.md` (includes Zero-friction execution section per contract)
- `skills/foundation-meeting-agenda/references/TEMPLATE.md` (universal frontmatter + shareable summary + sources section)
- `skills/foundation-meeting-agenda/references/EXAMPLE.md` (worked example: decision meeting for search-feature kickoff)
- `commands/meeting-agenda.md`
- `library/skill-output-samples/foundation-meeting-agenda/sample_foundation-meeting-agenda_*.md` (3 samples covering distinct meeting types: decision meeting, team sync, 1-on-1)
- `docs/skills/foundation/foundation-meeting-agenda.md` (auto-generated via `scripts/generate-skill-pages.py` if available, else hand-authored per F-26 precedent)
- AGENTS.md entry and commands-table row
- README_SAMPLES.md count updates and browse-table entries
- mkdocs.yml Foundation nav entry

## Validation

- `lint-skills-frontmatter.sh`: must PASS
- `validate-agents-md.sh`: must PASS (AGENTS.md includes new entry)
- `validate-commands.sh`: must PASS (`meeting-agenda.md` references `skills/foundation-meeting-agenda/SKILL.md`)
- `validate-meeting-skills-family.sh` (new): must PASS (contract conformance)
- `check-count-consistency.sh`: advisory; will be swept at release commit

## Open Questions

- Should the skill offer to auto-invoke `/meeting-brief` alongside `/meeting-agenda` when both pre-meeting artifacts are wanted? Decide during per-skill authoring.
- Should meeting-type variant behavior (e.g., 1-on-1 rolling agenda structure) live in the single TEMPLATE.md with conditional sections, or in separate sub-templates? Decide during spec writing.

## Status Transitions

- **Backlog** (current)
- **In Progress**. when per-skill authoring begins
- **Shipped**. on v2.11.0 tag + push

## Detailed specification

See [`F-18-meeting-agenda/specification.md`](F-18-meeting-agenda/specification.md) for the full spec (input contract, inference rules, template structure, sample inventory, validation checkpoints).
