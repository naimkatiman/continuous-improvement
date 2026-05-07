---
artifact_type: meeting-recap
version: 1.0
generated_at: {{ISO 8601 timestamp}}
generated_by_skill: foundation-meeting-recap

meeting_title: "{{Meeting title}}"
meeting_date: {{YYYY-MM-DD}}
meeting_start_time: "{{HH:MM timezone}}"
meeting_type: {{type or null}}

project: {{project-slug or null}}
topics:
  - {{topic-slug}}

attendees:
  - name: {{name}}
    role: {{role or null}}
attendees_absent:
  - {{name}}

related_agenda: {{filename if exists, else null}}
related_brief: {{filename if exists, else null}}

agenda_reconciliation:
  topics_planned: [{{list from agenda or empty}}]
  topics_hit: [{{list}}]
  topics_skipped: [{{list or empty}}]
  topics_emerged: [{{list or empty}}]

meeting_quality:
  outcomes_achieved: "{{N/M or null}}"
  started_on_time: {{true | false | null}}
  ended_on_time: {{true | false | null}}
  key_attendees_present: {{true | false | null}}

meeting_type_source: {{explicit | inferred | null}}   # v1.1.0
unassigned_action_ratio: {{0.0 to 1.0}}               # v1.1.0. ratio of ownerless actions to total actions

input_quality: {{high | medium | low}}
confidence: {{high | medium | low}}
visibility: team
status: draft
---

# Meeting recap: {{Meeting title}}

## Shareable summary

> [guidance (v1.1.0 errata): 3-5 short lines, no mini-headers, Slack/email copy-safe. Lead with outcome, inline key decisions, inline top actions. Plain prose + simple bullets only. no nested markdown.]

**{{Meeting title}}** | {{Date}}
{{1-sentence accomplishment summary, optionally naming 1-2 key decisions inline.}}
Top actions: {{Owner 1}}: {{action}} ({{due}}); {{Owner 2}}: {{action}} ({{due}}); {{Owner 3}}: {{action}} ({{due}}).
{{if unassigned_action_ratio > 0.3 or any high-priority action unassigned:}} ⚠ {{N}} of {{M}} actions need owners. see Ownership reconciliation section.
Full recap linked below.

---

## Full recap

### Meeting details

- **Date**: {{Date}}
- **Actual duration**: {{Duration}} min
- **Attendees present**: {{Names}}
- **Attendees absent**: {{Names or "none"}}
- **Recording**: {{Link or "none"}}

### Overall summary

> [guidance: 2-3 sentences capturing what this meeting accomplished in plain language]

{{Summary text}}

### Agenda reconciliation

> [guidance: explicit report of what was planned vs. what actually happened. If no agenda existed, note "no prior agenda loaded"]

- **Planned topics**: {{list or "no agenda"}}
- **Topics addressed**: {{list}} ({{N}} of {{M}})
- **Topics skipped**: {{list or "none"}}. {{brief reason per skip}}
- **Topics that emerged**: {{list or "none"}}. {{brief context}}

### Topics

#### {{Topic 1}}

*Type: {{Discussion | Decision | Information | Working}} (from agenda, if available)*

**Discussion**

{{Summary of what was discussed}}

**Decisions made**

- **{{Decision 1}}**. {{brief rationale}}
- **{{Decision 2}}**. {{brief rationale}} [confidence: {{level}} if inferred]

**Actions**

- [ ] {{Owner}}: {{Action}} | Due: {{Date or "not specified"}} | Dependencies: {{any or "none"}}
- [ ] {{Owner or "unassigned"}}: {{Action}} | Due: {{Date or "not specified"}}

**Open questions**

- {{Unresolved question}} [confidence: {{level}}]

---

#### {{Topic 2}}

> [guidance: repeat structure]

---

### All actions (consolidated by owner)

#### {{Owner 1}}

- [ ] {{Action}} | Due: {{Date}} | Topic: {{Topic}}
- [ ] {{Action}} | Due: {{Date}} | Topic: {{Topic}}

#### {{Owner 2}}

- [ ] {{Action}} | Due: {{Date}} | Topic: {{Topic}}

#### Unassigned

- [ ] {{Action}} | Topic: {{Topic}} | **Needs owner**

### Meeting quality signals

> [guidance: lightweight signals supporting downstream retrospective use]

- **Outcomes achieved**: {{N of M or "no agenda outcomes to reconcile"}}
- **Time management**: {{brief note on start/end and pacing}}
- **Key attendee presence**: {{brief note on who was needed and whether they were there}}

### Next steps

- **When we reconvene**: {{Date or cadence}}
- **What needs to happen first**: {{Critical path items}}

---

## Sources & References

### Primary inputs

- {{Source type}}: {{Source name}} (e.g., "transcript via Otter, 48 minutes")
- {{Source type}}: {{Source name}} (e.g., "user live notes")

### Referenced artifacts

- Agenda: {{filename or "none loaded"}}. {{if loaded, note: used for topic skeleton and desired-outcomes reconciliation}}
- Brief: {{filename if applicable}}
- Prior recaps on this topic: {{filenames or "none"}}

### External references

- {{Links mentioned in meeting}}

### Generation context

- **Generated**: {{Timestamp}}
- **Skill version**: 1.0.0
- **Input quality**: {{high | medium | low}}. {{rationale}}
- **Overall confidence**: {{high | medium | low}}. {{rationale}}
- **Known gaps**: {{list of topics with insufficient detail, or "None identified"}}
- **Inferences applied**: {{list of inferred values with confidence, e.g., "decision on X inferred from 'let's go with X' [confidence: medium]"}}
- **Fabrication check**: {{"all action owners appear in attendees list or are explicitly unassigned" | or list of failures}}
