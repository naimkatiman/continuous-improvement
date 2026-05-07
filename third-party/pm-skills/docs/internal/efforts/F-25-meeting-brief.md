# [F-25] Foundation Meeting Brief Skill

Status: Backlog
Milestone: v2.11.0
Issue: TBD
Agent: Claude Opus 4.7

## Scope

Create `foundation-meeting-brief`, a pre-meeting skill that produces a user's private strategic preparation document capturing stakes, stakeholder dynamics, messaging strategy, and anticipated tensions. Distinct from `foundation-meeting-agenda` because this artifact is not shared with attendees. it is the user's personal tactical read on the conversation. Conforms to the [Meeting Skills Family Contract](../reference/skill-families/meeting-skills-contract.md).

## Problem

PMs walk into stakeholder reviews, exec briefings, negotiation-adjacent conversations, and first meetings with new counterparts without explicit preparation for the positioning and political dimensions. They have a calendar invite and maybe a topic; they do not have a tactical read on "what does each person in the room want, what do they risk, and what is the user's primary ask."

Writing this out changes the meeting. the user enters with clarity on their top three goals, prepared responses to anticipated objections, and a ranked list of desired outcomes. But writing it out takes 30 minutes of focused effort, which is exactly what is missing the morning of the meeting. The skill closes this gap: it produces the brief from available context (stakeholder summaries, prior recaps, related docs) in one invocation.

Two things distinguish this skill from `foundation-meeting-agenda`:

1. **Audience**: the brief is private by default (`visibility: private`). Agendas are shared with attendees; briefs are not.
2. **Content**: the brief captures positioning, risks, and tactical stakeholder reads. Agendas capture structure and flow.

## How It Works

### Input

- Meeting topic or purpose (required)
- Meeting date, duration (optional. duration defaults to 30 min per family contract)
- Attendees list (optional. skill infers roles and stakes when available)
- Related artifacts: prior recaps on this topic, stakeholder summaries (e.g., from `discover-stakeholder-summary`), related project docs
- User's primary ask (optional. skill infers when absent, surfaces in go-mode summary for confirmation)

### Process

1. **Anti-meeting check** (per family contract). shared with `foundation-meeting-agenda`. If the user's objective is simple information transfer, recommend async alternative
2. **Present go-mode inference summary**. per family contract
3. **Build background section**. relevant history, prior decisions, recent developments (cross-references prior recaps when available)
4. **Per attendee**: infer position, stakes, likely concerns, relationship state, tactical notes. Confidence markers on each
5. **Rank desired outcomes**. must achieve / should achieve / nice to achieve
6. **Draft key messages**. what the user wants to communicate, in priority order, phrased for delivery
7. **Anticipate questions and objections**. with prepared responses
8. **Identify risks and tensions**. with mitigations
9. **Surface primary ask**. what the user needs from the meeting, explicitly
10. **Define success signals**. how the user will know the meeting went well in the moment
11. **Produce artifact** conforming to TEMPLATE.md

### Output

Private strategic prep document. Shareable summary block at top (purpose, top 3 goals, key risk, primary ask. suitable for sharing with a trusted advisor only). Full brief below with context, background, per-stakeholder reads, ranked outcomes, key messages, anticipated questions/responses, risks/tensions, asks, success signals. Sources & References section with Generation context including inferred stakeholder positions flagged by confidence level.

## Classification

- Type: `foundation` (cross-phase)
- Category: `meeting`
- Directory: `skills/foundation-meeting-brief/`
- Command: `/meeting-brief`

## Exemplars

- `foundation-meeting-agenda` (F-18): sister skill, shares anti-meeting check and meeting type taxonomy
- `discover-stakeholder-summary`: referenced as upstream input; brief absorbs stakeholder context when summaries exist
- Meeting Skills Family Contract: shared behavioral and structural requirements
- Archived F-18 original: positioning language and tactical stakeholder reads (salvaged)

## Deliverables

- `skills/foundation-meeting-brief/SKILL.md`
- `skills/foundation-meeting-brief/references/TEMPLATE.md`
- `skills/foundation-meeting-brief/references/EXAMPLE.md` (worked example: user prepping for exec briefing on Q2 commitments)
- `commands/meeting-brief.md`
- `library/skill-output-samples/foundation-meeting-brief/sample_foundation-meeting-brief_*.md` (3 samples: exec briefing, stakeholder review, negotiation-adjacent meeting)
- `docs/skills/foundation/foundation-meeting-brief.md`
- AGENTS.md entry and commands-table row
- README_SAMPLES.md count updates and browse-table entries
- mkdocs.yml Foundation nav entry

## Validation

- `lint-skills-frontmatter.sh`: must PASS
- `validate-agents-md.sh`: must PASS
- `validate-commands.sh`: must PASS
- `validate-meeting-skills-family.sh`: must PASS
- `check-count-consistency.sh`: advisory

## Open Questions

- Should the brief pull forward unresolved threads from prior recaps with the same attendees? Valuable feature; scope decision during spec writing.
- Red team / devil's advocate section. should it be a default section or an opt-in mode? Consider during spec writing.
- Message testing (offer 2-3 framings of the user's core ask). default behavior or opt-in? Consider during spec writing.

## Status Transitions

- **Backlog** (current)
- **In Progress**. when per-skill authoring begins
- **Shipped**. on v2.11.0 tag + push

## Detailed specification

See [`F-25-meeting-brief/specification.md`](F-25-meeting-brief/specification.md) for the full spec.
