---
artifact_type: stakeholder-update
version: 1.0
generated_at: {{ISO 8601 timestamp}}
generated_by_skill: foundation-stakeholder-update

meeting_title: "{{Meeting title the update covers}}"
meeting_date: {{YYYY-MM-DD}}

project: {{project-slug}}
topics:
  - {{topic-slug}}

channel: {{slack | teams | email | notion | exec-memo}}
audience_variant: {{engineering | design | leadership | customer-facing | mixed}}
primary_cta: "{{What the user needs from readers, or 'FYI-only'}}"

thread_continuation_of: {{filename if applicable, else null}}

related_recap: {{recap filename}}

input_quality: {{high | medium | low}}
confidence: {{high | medium | low}}
visibility: {{team | leadership | public}}
status: draft
---

# Stakeholder update: {{Topic or meeting reference}}

## Shareable update

> [v1.1.0: This section contains the message body to copy and paste into {{channel}}. EVERYTHING BELOW this section is NOT shareable. audit notes and sources stay internal. The format below matches the selected channel variant; other variants are reference-only.]

---

### Slack / Teams variant

**{{Headline: one line, action-oriented, skimmable}}**

**TL;DR**

- {{Key outcome 1}}
- {{Key outcome 2}}
- {{Key outcome 3}}

**Context** ({{sentence or two}})

{{Brief framing for readers who may or may not have been in the room}}

**What this means for {{audience}}**

{{Translation of outcomes into audience-relevant impact}}

{{if CTA needed:}}
**What I need from you**

- {{Ask}}: {{by when}}

{{if FYI-only:}}
*FYI-only. no action needed.*

{{if thread continuation:}}
*Follow-up to: {{link to prior update}}*

More: {{recap filename link}} | {{related doc}}

---

### Email variant

**Subject**: {{Clear subject line with topic + outcome}}

Hi {{audience}},

{{Opening sentence: headline + why they are receiving this}}

**TL;DR**

- {{Key outcome 1}}
- {{Key outcome 2}}
- {{Key outcome 3}}

**Context**

{{Brief framing. 2-3 sentences}}

**What was decided or advanced**

- {{Outcome 1 in plain language}}
- {{Outcome 2 in plain language}}

**What this means for your team**

{{Tailored translation of impact}}

{{if CTA needed:}}
**What I need from you**

- {{Ask 1}}: {{by when}}
- {{Ask 2}}: {{by when}}

{{if thread continuation:}}
This is a follow-up to my update on {{date}}: {{link}}

For more detail, see: {{recap filename link}}

Thanks,
{{User}}

---

### Notion / exec-memo variant

> [guidance: richer formatting, longer context, optimized for reference. For exec-memo, tighten to TL;DR first, formal tone, no emoji.]

[full structure with more context, more headers, more links per channel-specific behavior]

---

> [End of Shareable update section. Everything below is INTERNAL. do not copy into the outgoing message.]

## Technical-to-business translation notes

> [guidance: include this section when translations were applied, so the user can verify translations land with their audience]

**Translations applied**:

- "{{Technical term}}" → "{{Plain language}}" *(reason: audience = {{variant}})*
- "{{Acronym}}" → "{{Expanded meaning}}"

**Flagged but kept** (may need further review):

- "{{Term}}". may not land with all readers, consider rewording if update goes wider

---

## Sources & References

### Primary inputs

- Related recap: {{filename}}
- User-provided audience and CTA parameters

### Referenced artifacts

- Recap: {{filename}}
- Prior update in thread: {{filename if applicable}}

### External references

- {{Linked resources in the update}}

### Generation context

- **Generated**: {{Timestamp}}
- **Skill version**: 1.0.0
- **Channel**: {{channel}}
- **Audience variant**: {{variant}}
- **Thread continuation**: {{yes with link / no}}
- **Input quality**: {{high | medium | low}}. {{rationale}}
- **Known gaps**: {{e.g., "User did not specify full audience list; defaulted to leadership tone"}}
- **Translations applied**: {{count}}. see Technical-to-business translation notes section above
