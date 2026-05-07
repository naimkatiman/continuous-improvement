---
artifact_type: meeting-agenda
version: 1.0
generated_at: {{ISO 8601 timestamp}}
generated_by_skill: foundation-meeting-agenda

meeting_title: "{{Meeting title}}"
meeting_date: {{YYYY-MM-DD}}
meeting_start_time: "{{HH:MM timezone}}"
meeting_type: {{standup | planning | review | decision-making | brainstorm | 1-on-1 | stakeholder-review | project-kickoff | working-session | exec-briefing | other}}
meeting_duration_minutes: 30

project: {{project-slug or null}}
topics:
  - {{topic-1-slug}}
  - {{topic-2-slug}}

attendees:
  - name: {{name}}
    role: {{decision-maker | contributor | informed | optional}}
  - name: {{name}}
    role: {{role}}

desired_outcomes:
  - "{{Concrete outcome 1}}"
  - "{{Concrete outcome 2}}"

related_brief: {{filename if exists, else null}}

input_quality: {{high | medium | low}}
confidence: {{high | medium | low}}
visibility: team
status: draft
---

# {{Meeting title}}

## Shareable summary

> [guidance: 5-6 short lines, skimmable in 10 seconds, Slack/Teams-paste-ready. No nested headers. No tables.]

**{{Meeting title}}** | {{Date}} at {{Time}} ({{Duration}} min)
**Purpose**: {{One-line purpose}}
**Topics**:
- {{Topic 1}} ({{time}} min)
- {{Topic 2}} ({{time}} min)
- {{Topic 3}} ({{time}} min)
**Pre-reads**: {{Links or "none required"}}

---

## Full agenda

### Meeting details

- **Date and time**: {{Date}}, {{Time}} ({{Timezone}})
- **Duration**: {{Duration}} min
- **Location**: {{Link or room}}
- **Meeting type**: {{Type}}
- **Attendees**: {{Names and roles}}

### Purpose

> [guidance: one to two sentences answering "why are we meeting?"]

{{Purpose text}}

### Desired outcomes

> [guidance: concrete, verifiable outcomes. These become the yardstick for recap quality signals.]

- {{Outcome 1}}
- {{Outcome 2}}
- {{Outcome 3}}

### Topics

#### {{Topic 1}} ({{time}} min). {{Owner}}

- **Type**: {{Discussion | Decision | Information | Working}}
- **Goal**: {{What done looks like}}
- **Pre-read**: {{Link or "none"}}

#### {{Topic 2}} ({{time}} min). {{Owner}}

- **Type**: {{type}}
- **Goal**: {{goal}}
- **Pre-read**: {{link}}

> [guidance: repeat per topic; types distinguish discussion from decision and information transfer]

### Attendee prep

**Required prep** (estimated: {{N}} min)

- [ ] {{Prep task 1}}. {{Link}}
- [ ] {{Prep task 2}}. {{Link}}

**Recommended context**

- {{Link}}: {{What to skim and why}}

**Come ready to**

- {{Expectation 1}} (e.g., share your team's Q2 commitments)
- {{Expectation 2}} (e.g., weigh in on the scope tradeoff)

### Parking lot

> [guidance: placeholder for off-topic items raised during the meeting. Remains empty at agenda-creation time.]

### Logistics

- **Join link**: {{URL}}
- **Materials**: {{Doc links}}
- **Recording**: {{Yes/No, owner name}}

---

## Sources & References

### Primary inputs

> [guidance: what the skill drew from to produce this agenda]

- {{Source type}}: {{Source name or identifier}}
- Meeting duration: {{user-specified or default 30 min}}

### Referenced artifacts

- Brief: {{filename if exists}}
- Related prior recaps on this topic: {{filenames or "none"}}

### External references

- {{Pre-read docs with links}}

### Generation context

- **Generated**: {{Timestamp}}
- **Skill version**: 1.0.0
- **Input quality**: {{high | medium | low}}. {{Brief rationale}}
- **Overall confidence**: {{high | medium | low}}. {{Brief rationale}}
- **Known gaps**: {{List or "None identified"}}
- **Inferences applied**: {{List of values inferred by the skill, each with confidence marker. E.g., "Meeting type: decision-making [confidence: medium, inferred from 'decide' keyword in topic"]}}
- **Anti-meeting check**: {{Ran. override accepted | Ran. async alternative produced instead}}
