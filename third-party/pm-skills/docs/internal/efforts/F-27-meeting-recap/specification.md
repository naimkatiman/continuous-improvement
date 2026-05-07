# F-27 foundation-meeting-recap: Specification

Reads together with:
- Effort brief: [`../F-27-meeting-recap.md`](../F-27-meeting-recap.md)
- Family contract: [`docs/reference/skill-families/meeting-skills-contract.md`](../../../reference/skill-families/meeting-skills-contract.md)
- Implementation plan: [`plan_meeting-recap.md`](plan_meeting-recap.md)

## Input contract

| Input | Required? | Accepted forms | Default |
|-------|-----------|----------------|---------|
| Meeting content | Yes | Transcript (Zoom/Meet/Otter/Fireflies/Krisp/manual), notes, hybrid |. |
| Meeting metadata | No | Title, date, attendees in YAML-ish or prose | Infer from content |
| Related agenda filename | No | `@filename.md` reference | Auto-discover via filename prefix match |
| Related brief filename | No | `@filename.md` reference | Auto-discover |

## Inference rules

| Value | Inferred from | Confidence rule |
|-------|---------------|-----------------|
| Decisions | Language markers ("we decided", "agreed on", "committed to"), conclusive statements after deliberation | High when explicit; medium when inferred from context; low when speculative |
| Actions | Language markers ("X will do Y", "Alex to follow up on Z"), imperative future-tense | High when owner + action explicit; medium when owner inferred; low when action unclear |
| Owners | Attendee name directly associated; pronouns resolved to speaker | Flag low-confidence inferences; never fabricate |
| Due dates | Explicit mentions ("by Friday", "next week") | High when explicit; medium when "soon" or similar; low/omitted when unspecified |
| Topic segmentation | Agenda topics (if available) + transcript discourse markers ("moving on to X", "on the other topic") | High when agenda drives; medium from transcript markers |
| Meeting quality signals | Outcomes achieved vs. agenda desired_outcomes; start/end time from timestamps | High when agenda + timestamps available; flag as skipped when unavailable |

## Process (detailed)

1. **Parse inputs**. detect content type (transcript vs. notes); note input quality upfront
2. **Auto-discover related artifacts**. scan same directory for matching filename prefix; load agenda for topic skeleton and desired-outcomes reconciliation
3. **Present go-mode inference summary**. per contract; includes detected meeting date/title, inferred attendees (if not provided), input quality assessment
4. **Topic-segment**. if agenda available, use its topic list as scaffold; else identify topics from content discourse
5. **Per topic segment**:
   - Summarize discussion
   - Extract and **bold-flag decisions**. never fabricate; if uncertain, flag as "appears to have decided X [confidence: medium]"
   - Extract actions. each with owner + due date + dependencies; flag missing owner or date as `[owner: unassigned, needs confirmation]` rather than inventing
   - Capture open questions
6. **Consolidate actions view**. regroup all actions by owner
7. **Reconcile agenda** (if loaded):
   - `topics_planned` = agenda topic list
   - `topics_hit` = topics actually discussed
   - `topics_skipped` = planned but not discussed, with brief reason
   - `topics_emerged` = discussed but not on agenda
8. **Assess meeting quality signals**:
   - `outcomes_achieved`: N/M (agenda desired_outcomes met)
   - `started_on_time`: from timestamps or "meeting started late" cues
   - `ended_on_time`: same
   - `key_attendees_present`: flag if decision-makers absent
9. **Surface next steps**. when reconvene, critical path
10. **Render TEMPLATE.md**

## Output contract

**Frontmatter** (in addition to universal base):

```yaml
agenda_reconciliation:
  topics_planned: [scope, capacity, timeline]
  topics_hit: [scope, capacity]
  topics_skipped: [timeline]
  topics_emerged: [vendor-contract-renegotiation]
meeting_quality:
  outcomes_achieved: "2/3"
  started_on_time: true
  ended_on_time: false
  key_attendees_present: true
```

**Required sections** in order:

1. Title ("Meeting recap: {title}")
2. `## Shareable summary` (5-6 lines: meeting name + date, 1-2 sentence accomplishment, key decisions list, top actions with owners/dates)
3. `## Full recap`
   - Meeting details (date, actual duration, attendees present/absent, recording link)
   - Overall summary (2-3 sentences)
   - Agenda reconciliation (planned vs. hit vs. skipped vs. emerged)
   - Topics (per topic: type tag carried from agenda, Discussion summary, **Decisions made** with visual emphasis, Actions with owner/date, Open questions)
   - All actions (consolidated by owner)
   - Meeting quality signals (outcomes achieved, time management, key attendee presence)
   - Next steps (when reconvene, critical path)
4. `## Sources & References`. listing transcript source, agenda consumed, brief consulted, prior recaps on topic

## Sample inventory

| Sample | Scenario | Purpose |
|--------|----------|---------|
| `sample_foundation-meeting-recap_decision-meeting.md` | Recap of decision meeting with 3 decisions and 5 actions | Demonstrates decision highlighting and agenda reconciliation |
| `sample_foundation-meeting-recap_team-sync.md` | Weekly team sync recap | Demonstrates low-decision, high-action-count recap with round-robin format |
| `sample_foundation-meeting-recap_stakeholder-review.md` | Stakeholder review recap | Demonstrates mixed-attendee capture and explicit outcome-achievement signals |

## Design decisions

1. **Decisions are bold-formatted, not separately listed**. decisions in context with their discussion are more useful than decisions pulled into a separate artifact. Readers can scan bolded items within topic segments.
2. **Actions absorbed into recap, not split into sibling artifact**. earlier family discussion considered a separate "meeting-actions" skill. Rejected because actions without context decay faster than actions in context. Consolidated view at the end handles scannability.
3. **Never fabricate owners or dates**. if a transcript says "someone should look into this", the action is captured as `[owner: unassigned]` not guessed. Trust decay from fabrication is worse than the mild friction of flagging.
4. **Agenda reconciliation is frontmatter + prose, not just prose**. makes the data machine-readable for future agenda/recap cross-validation CI.
5. **No attendee-vs-nonattendee variant toggle in v1.0.0**. non-attendee communication belongs to `foundation-stakeholder-update`. Preserves skill boundaries.

## Validation checkpoints

- Frontmatter conforms with recap-specific fields
- `agenda_reconciliation` fields present even if empty lists
- `meeting_quality.outcomes_achieved` matches "N/M" pattern
- At least one topic section with decisions, actions, or summary
- Fabrication check: all owners must appear in `attendees` or be explicitly tagged `unassigned`
- Zero-friction execution section in SKILL.md
- Link to family contract in SKILL.md
