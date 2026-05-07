# F-25 foundation-meeting-brief: Specification

Reads together with:
- Effort brief: [`../F-25-meeting-brief.md`](../F-25-meeting-brief.md)
- Family contract: [`docs/reference/skill-families/meeting-skills-contract.md`](../../../reference/skill-families/meeting-skills-contract.md)
- Implementation plan: [`plan_meeting-brief.md`](plan_meeting-brief.md)

## Input contract

| Input | Required? | Accepted forms | Default |
|-------|-----------|----------------|---------|
| Meeting topic / purpose | Yes | String or free-form context |. |
| Meeting date, duration | No | ISO / natural language / integer | Today; 30 min |
| Attendees | No | List | Infer from topic/context |
| Related recaps (prior meetings on topic) | No | File references | Auto-discovered via `project`/`topics` match if available |
| Stakeholder summaries | No | File references to `discover-stakeholder-summary` outputs |. |
| Primary ask | No | Sentence | Infer; surface in go-mode summary |

## Inference rules

| Value | Inferred from | Confidence rule |
|-------|---------------|-----------------|
| Stakeholder positions | Prior recap language, stakeholder summary content, topic-doc mentions | High if recap cites direct quote; medium if position expressed in 2+ sources; low if single contextual cue |
| Stakes per attendee | Role + topic-ownership cues | Low-to-medium; always flagged |
| Top 3 goals | User's primary ask + meeting type | Medium; offered as ranked strawman in go-mode |
| Anticipated questions | Stakeholder position analysis + typical objections by role | Medium; flagged as inferred |
| Risks / tensions | Conflict patterns in prior recaps | High if prior recap flagged contradiction; medium if position divergence detected; low if speculative |

## Process (detailed)

1. **Anti-meeting check** (shared with `foundation-meeting-agenda`). same trigger conditions; override → proceed
2. **Parse and load inputs**. read `@file` references; discover sibling artifacts via `project`/`topics` frontmatter match when available
3. **Infer missing values** with confidence markers
4. **Present go-mode inference summary** (per contract). includes inferred stakeholder positions, inferred primary ask, inferred top-3 goals
5. **User confirms `go` or corrects**
6. **Build background section**. relevant history and prior decisions from recaps/related docs
7. **Per stakeholder analysis**:
   - Position on topic (with evidence or inference flag)
   - Stakes (what they win/lose)
   - Likely concerns
   - Relationship state (strong / neutral / strained)
   - Tactical notes (how to engage)
8. **Rank desired outcomes**. must / should / nice
9. **Draft key messages** in priority order
10. **Anticipate questions** with prepared responses
11. **Identify risks and tensions** with mitigations
12. **Specify asks**. what the user needs from specific people
13. **Define success signals**. how the user knows the meeting went well in the moment
14. **Render TEMPLATE.md** with filled values

## Output contract

**Frontmatter** (in addition to universal base):

```yaml
stakeholders:
  - name: maria
    position: "believes v2 ship slip is acceptable if quality holds"
  - name: alex
    position: "wants to protect engineering capacity for Q3"
primary_ask: "alignment on ship-date and capacity tradeoffs"
```

`visibility` defaults to `private`.

**Required sections** in order:

1. Title ("Meeting brief: {title}")
2. `## Shareable summary` (private-by-default; shareable with trusted advisor only; includes purpose, top 3 goals, key risk, primary ask)
3. `## Full brief`
   - Context (meeting info, format, attendees, chair)
   - Background (relevant history, prior decisions, recent developments)
   - Stakeholder reads (per stakeholder: position, stakes, likely concerns, relationship state, tactical notes)
   - Desired outcomes (ranked: must / should / nice)
   - Key messages (priority order, phrased for delivery)
   - Anticipated questions and responses (table format)
   - Risks and tensions (with mitigations)
   - Asks (per person: what the user needs)
   - Success signals (how the user knows it went well)
4. `## Sources & References`. including prior recaps consumed, stakeholder summaries loaded, related docs

## Sample inventory

| Sample | Scenario | Purpose |
|--------|----------|---------|
| `sample_foundation-meeting-brief_exec-briefing.md` | User briefing CFO on Q2 roadmap commitments | Demonstrates executive framing + TL;DR-first shareable summary |
| `sample_foundation-meeting-brief_stakeholder-review.md` | First stakeholder review with new VP of Design | Demonstrates new-stakeholder tactical analysis and relationship-state=neutral default |
| `sample_foundation-meeting-brief_negotiation-adjacent.md` | Cross-team capacity negotiation | Demonstrates risks/tensions section and asks with named counterparties |

## Design decisions

1. **Default visibility is `private`**. brief is the user's prep document. Accidental sharing would leak tactical reads.
2. **Stakeholder reads can run on inferred positions with `low` confidence**. rather than blocking on stakeholder summaries. The skill runs on what it has; a user without stakeholder summaries still gets value.
3. **"Tactical notes" section is explicit, not buried**. the whole point of a brief is tactical guidance. Users hide from this when agendas pretend to be briefs; the separate skill lets the brief be honestly tactical.
4. **No red-team mode in v1.0.0**. open question flagged; defer to iteration based on usage.

## Validation checkpoints

- Frontmatter conforms; `visibility: private` by default
- Stakeholder list, if present, has required fields (name + position at minimum)
- At least 1 primary ask stated
- Zero-friction execution section present in SKILL.md
- Anti-meeting check referenced (shared with agenda)
- Link to family contract present
