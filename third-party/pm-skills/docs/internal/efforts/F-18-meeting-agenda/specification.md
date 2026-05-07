# F-18 foundation-meeting-agenda: Specification

This is the detailed technical specification for `foundation-meeting-agenda`. Reads together with:
- Effort brief: [`../F-18-meeting-agenda.md`](../F-18-meeting-agenda.md)
- Family contract: [`docs/reference/skill-families/meeting-skills-contract.md`](../../../reference/skill-families/meeting-skills-contract.md)
- Implementation plan: [`plan_meeting-agenda.md`](plan_meeting-agenda.md)

## Input contract

| Input | Required? | Accepted forms | Default |
|-------|-----------|----------------|---------|
| Meeting topic / purpose | Yes | String (short) or free-form context doc |. |
| Meeting duration | No | Integer (minutes) via `--duration=N` or inline phrasing | **30** (per family contract) |
| Meeting date + start time | No | ISO 8601 or natural language ("tomorrow 2pm EST") | Today + next whole hour |
| Attendees | No | List (comma, newline, or @-file reference) | Infer from topic context if possible; flag as gap otherwise |
| Meeting type | No | Enum value (see contract) | Infer; default `other` at low confidence |
| Linked context | No | File references (`@file.md`) or pasted content | Empty |
| Primary objective | No | One sentence | Infer from topic; surface in go-mode summary |

## Inference rules

| Value | Inferred from | Confidence rule |
|-------|---------------|-----------------|
| Meeting type | Topic keywords ("decide", "plan", "review", "sync", "1:1"); attendee seniority mix | High when explicit keyword match; medium when one strong signal; low when ambiguous → `other` |
| Duration | Explicit in topic doc (rare) | Default 30 min; flagged as assumption |
| Objective | Topic phrasing | Medium if imperative verb present; low if vague |
| Attendee RACI | Seniority, topic ownership cues, pronouns ("need X to sign off" → X = decision-maker) | Low-to-medium; always flagged |
| Desired outcomes | Objective + meeting type heuristics | Medium; offered as strawman in go-mode |

## Process (detailed)

1. **Anti-meeting check**
   - Prompt: "This looks like it could be handled async (written update, doc review, Slack poll). Does it need to be a meeting?"
   - Trigger conditions: single-owner decision with no tradeoffs, pure information broadcast, status-only sync with >5 people
   - User response: `yes` → proceed to step 2; `no` → produce a brief async-alternative framing (1-page "how to handle this async" suggestion) and exit
2. **Parse and load inputs**. read all `@file` references; extract context
3. **Infer missing values**. apply inference rules; compute confidence per field
4. **Present go-mode inference summary** (per contract)
5. **User confirms `go` or corrects**. on correction, re-run steps 3-4
6. **Design time-boxed topic list**:
   - Sum of topic times must equal meeting duration (flag overflow)
   - Each topic: type tag, owner, goal, pre-read link (if any), estimated discussion duration
   - Add fixed sections: intro/context (2-5 min), decisions recap (2-3 min), actions/next steps (3-5 min)
7. **Write attendee prep section**. required prep with links + estimated prep time; recommended context; "come ready to" expectations
8. **Add parking lot and logistics placeholders**
9. **Render TEMPLATE.md** with filled values
10. **Validate output**. frontmatter shape, required sections present, time math checks

## Meeting-type variant behavior

Applied in the topic-list design phase (step 6):

| Type | Structural adjustment |
|------|----------------------|
| `1-on-1` | Rolling structure: last time's items → this time's topics → growth/development → blockers. Shorter default duration: 30 min. |
| `standup` | Status round-robin section; escalations; decisions-needed. Default 15 min. |
| `planning` | Commitments focus; capacity check; dependencies. Default 60 min. |
| `review` | Presentation-first; heavy pre-read; explicit feedback-capture mechanism. Default 60 min. |
| `decision-making` | Options upfront; decision criteria; explicit decision ask. Pre-read with proposal required. Default 45 min. |
| `brainstorm` | Minimal agenda; generative prompts; no decision pressure. Default 45 min. |
| `stakeholder-review` | TL;DR first; business-impact framing; explicit asks upfront. Default 45 min. |
| `project-kickoff` | Scope; roles; success criteria; risks; communication plan. Default 60 min. |
| `working-session` | Minimal agenda; pre-work required; explicit deliverable. Default 60-90 min. |
| `exec-briefing` | TL;DR first; supporting detail after. Default 30 min. |
| `other` | Default 30 min; generic topic structure |

## Output contract

Conforms to family contract. Per-skill specifics:

**Frontmatter** (in addition to universal base):

```yaml
meeting_duration_minutes: 30
desired_outcomes:
  - "outcome 1"
  - "outcome 2"
```

**Required sections** in order:

1. Title (meeting title)
2. `## Shareable summary` (5-6 lines)
3. `## Full agenda`
   - Meeting details (date/time, duration, location, type, attendees)
   - Purpose (1-2 sentences)
   - Desired outcomes (bulleted)
   - Topics (per topic: title, type, time, owner, goal, pre-read link)
   - Attendee prep (required prep, recommended context, "come ready to")
   - Parking lot placeholder
   - Logistics (join link, materials, recording owner)
4. `## Sources & References` (per contract)

## Sample inventory

| Sample | Scenario | Purpose |
|--------|----------|---------|
| `sample_foundation-meeting-agenda_decision-meeting.md` | Decision meeting: ship v2 this sprint? | Demonstrates decision-meeting variant with options-upfront pre-read |
| `sample_foundation-meeting-agenda_team-sync.md` | Weekly team sync | Demonstrates team-sync variant with status round-robin |
| `sample_foundation-meeting-agenda_1-on-1.md` | Manager 1-on-1 rolling agenda | Demonstrates 1-on-1 variant with rolling structure |

## Design decisions

1. **Anti-meeting check is a flow step, not a frontmatter field**. it gates producing the full artifact at all, not a property of the artifact. Keeping it out of frontmatter avoids suggesting the check is retrospective.
2. **Time math validation is enforcing, not advisory**. if the user requests a 30-min meeting but the topic list sums to 45 min, the skill flags the overflow and asks for reconciliation. Silent acceptance produces unusable agendas.
3. **Pre-read estimated prep time is required**. attendees who do not know how long prep takes skip it. "5 min read" is a signal that materially changes prep completion.
4. **Meeting-type variants live inside one TEMPLATE.md with conditional sections, not separate sub-templates**. simpler to maintain; variant behavior happens in process step 6, not template structure.

## Validation checkpoints

- Frontmatter conforms to universal base + agenda-specific fields
- `meeting_duration_minutes` is a positive integer
- Sum of topic time allocations equals `meeting_duration_minutes` (± 2 min tolerance)
- At least 1 desired outcome listed
- Anti-meeting check step is referenced in SKILL.md
- Zero-friction execution section is present in SKILL.md
- Link to family contract is present in SKILL.md
