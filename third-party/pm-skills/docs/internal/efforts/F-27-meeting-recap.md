# [F-27] Foundation Meeting Recap Skill

Status: Backlog
Milestone: v2.11.0
Issue: TBD
Agent: Claude Opus 4.7

## Scope

Create `foundation-meeting-recap`, a post-meeting skill that produces a topic-segmented summary for attendees with decisions highlighted and actions captured inline per topic (plus a consolidated action view at the end). Absorbs what would otherwise be a separate "meeting-actions" skill. actions live alongside their context, not in a sibling artifact. Conforms to the [Meeting Skills Family Contract](../reference/skill-families/meeting-skills-contract.md).

## Problem

After a multi-topic internal meeting, the standard post-hoc note-passing fails in predictable ways:

1. Decisions are buried in prose. readers cannot tell a decision from a discussion item at a glance
2. Actions lack owners or due dates, so they decay
3. The recap is chronologically ordered (as the meeting flowed), which mirrors the meeting but not how readers consume it
4. If an agenda existed, nothing reconciles what was planned vs. what actually happened
5. Separate "action items" artifacts lose the context that makes actions make sense

PMs producing recaps manually work around all of this by topic-segmenting, highlighting decisions, and chasing owners/dates. which takes 20-30 minutes. The skill produces a conforming recap in one invocation from notes, transcript, or both, auto-populating the topic skeleton from a sibling `meeting-agenda` artifact when one exists.

## How It Works

### Input

- Meeting notes, transcript (Zoom, Meet, Otter, Fireflies, Krisp MCP, manual paste), or hybrid
- Meeting metadata: title, date, attendees (optional)
- Optional: related `meeting-agenda` filename (skill auto-discovers via filename-prefix match when not provided)
- Optional: related `meeting-brief` filename

### Process

1. **Load agenda if discoverable**. filename prefix match on meeting date + time + title; if found, use topic skeleton as scaffold and use `desired_outcomes` for quality-signals reconciliation
2. **Present go-mode inference summary**. per family contract
3. **Topic-segment**. organize content by topic (agenda topics + any emergent), not chronology
4. **Per topic segment**:
   - Summarize discussion
   - **Highlight decisions** with visual emphasis (decisions are the most-referenced post-hoc information)
   - Extract actions with owner + due date + dependencies (flag missing owners/dates explicitly rather than inventing them)
   - Capture open questions
5. **Reconcile agenda** (if agenda was loaded). planned vs. hit vs. skipped vs. emerged
6. **Consolidate action view**. regroup by owner for scannability
7. **Assess meeting quality signals**. outcomes achieved, time management, key attendees present (lightweight markers supporting downstream retrospective use)
8. **Surface next steps**. when we reconvene, what needs to happen first
9. **Produce artifact** conforming to TEMPLATE.md

### Output

Topic-segmented post-meeting summary. Shareable summary block at top (meeting name + date, 1-2 sentence accomplishment summary, key decisions, top actions with owners and due dates). Full recap below with meeting details, overall summary, agenda reconciliation, per-topic segments with decisions/actions/open questions, consolidated actions view by owner, meeting quality signals, next steps. Sources & References section with Generation context noting transcript source and any missing owners/dates flagged.

## Classification

- Type: `foundation` (cross-phase)
- Category: `meeting`
- Directory: `skills/foundation-meeting-recap/`
- Command: `/meeting-recap`

## Exemplars

- `foundation-meeting-agenda` (F-18): source of topic skeleton and desired-outcomes reconciliation
- `discover-interview-synthesis`: pattern for extracting structured output from conversation transcripts
- Meeting Skills Family Contract: shared behavioral and structural requirements

## Deliverables

- `skills/foundation-meeting-recap/SKILL.md`
- `skills/foundation-meeting-recap/references/TEMPLATE.md`
- `skills/foundation-meeting-recap/references/EXAMPLE.md` (worked example: search-feature-kickoff recap from transcript + live notes)
- `commands/meeting-recap.md`
- `library/skill-output-samples/foundation-meeting-recap/sample_foundation-meeting-recap_*.md` (3 samples: decision meeting recap, team sync recap, stakeholder review recap)
- `docs/skills/foundation/foundation-meeting-recap.md`
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

- Attendee vs. non-attendee variant toggle. same content, different framing for non-attendees (adds context, removes insider shorthand). Default mode or opt-in? Or leave non-attendee communication to `stakeholder-update`? Recommend: leave to stakeholder-update to preserve skill boundaries.
- Conflict/dissent capture. dedicated space for where consensus was not reached? Default section or opt-in? Consider during spec writing.
- Downstream skill chaining. should the recap output offer "generate stakeholder-update from this recap" as a suggested next step? Low-cost ergonomic win; consider during skill authoring.
- Version awareness. diff from prior version if the recap is regenerated after post-meeting updates arrive? Deferred; not in v1.0.0.

## Status Transitions

- **Backlog** (current)
- **In Progress**. when per-skill authoring begins
- **Shipped**. on v2.11.0 tag + push

## Detailed specification

See [`F-27-meeting-recap/specification.md`](F-27-meeting-recap/specification.md) for the full spec.
