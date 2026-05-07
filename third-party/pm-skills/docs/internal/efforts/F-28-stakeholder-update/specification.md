# F-28 foundation-stakeholder-update: Specification

Reads together with:
- Effort brief: [`../F-28-stakeholder-update.md`](../F-28-stakeholder-update.md)
- Family contract: [`docs/reference/skill-families/meeting-skills-contract.md`](../../../reference/skill-families/meeting-skills-contract.md)
- Implementation plan: [`plan_stakeholder-update.md`](plan_stakeholder-update.md)

## Input contract

| Input | Required? | Accepted forms | Default |
|-------|-----------|----------------|---------|
| Related recap filename | Preferred | `@filename.md` | If absent, accepts raw meeting notes (flagged `input_quality: medium` or lower) |
| Channel | Yes | `slack | teams | email | notion | exec-memo` | Infer from audience (slack for engineering/design; email for leadership default) |
| Audience variant | Yes | `engineering | design | leadership | customer-facing | mixed` |. |
| Primary CTA | No | String | Infer; if "FYI-only", state explicitly |
| Thread continuation | No | Prior update filename | Auto-detect if prior update on same topic exists |

## Inference rules

| Value | Inferred from | Confidence rule |
|-------|---------------|-----------------|
| Channel (when absent) | Audience variant + content urgency cues | Medium-to-high based on audience-channel conventions |
| Primary CTA | Recap's outstanding actions affecting the audience | Medium; surfaced in go-mode for confirmation |
| Technical-to-business translation targets | Acronym density + audience technical depth mismatch | High-confidence flags on clear mismatches; medium on judgment calls |
| Thread continuation | Prior update filename match on `project`/`topics` | High if explicit match; medium if semantic |

## Process (detailed)

1. **Load related recap**. parse frontmatter; extract decisions, actions, outcomes, meeting context
2. **Detect thread continuation**. scan directory for prior `stakeholder-update` artifacts with matching `project`/`topics`
3. **Present go-mode inference summary**. per contract; includes inferred channel (if not specified), inferred CTA, detected thread continuation, translation candidates
4. **Distill key outcomes**. from recap, select 3-5 outcomes that matter to the target audience (not everything; filter by audience relevance)
5. **Frame the CTA**:
   - If action needed: lead with it, not bury it
   - If FYI-only: state explicitly in the TL;DR
6. **Translate technical-to-business**:
   - Flag jargon and acronyms unlikely to land with the audience
   - Provide plainer alternatives
   - Keep translations-applied log for user verification in Generation context
7. **Build channel-tailored variant**:
   - **Slack / Teams**: headline + TL;DR bullets + context sentence + "what this means for {audience}" + CTA + thread-continuation link + more links
   - **Email**: subject line + greeting + opening sentence + TL;DR + context + what was decided/advanced + what this means + CTA + thread reference + sign-off
   - **Notion**: richer formatting, more headers, longer context, optimized for reference
   - **Exec-memo**: TL;DR first + supporting detail + explicit asks upfront + concise sign-off
8. **Render TEMPLATE.md** with the selected variant as primary; include other variants as collapsible alternates for user flexibility

## Output contract

**Frontmatter** (in addition to universal base):

```yaml
channel: slack
audience_variant: engineering
primary_cta: "confirm impact on Q2 sprint plan by Friday"
thread_continuation_of: 2026-03-12_14-00EST_search-scope-decision_stakeholder-update.md
related_recap: 2026-04-17_14-00EST_search-feature-kickoff_recap.md
```

**Required sections** in order:

1. Title ("Stakeholder update: {topic or meeting reference}")
2. `## The update`. the entire shareable content; no separate summary block because the whole output is shareable content (per family contract)
3. Within `## The update`, the selected channel variant fully rendered
4. `## Technical-to-business translation notes` (if translations were applied)
   - Translations applied (table: term → plain language, reason)
   - Flagged but kept (may need user review)
5. `## Sources & References`:
   - Primary input: related recap filename
   - Prior update in thread (if applicable)
   - External references linked in the update
   - Generation context: channel, audience variant, thread continuation yes/no, input quality, translations applied

## Channel variant specifics

### Slack / Teams

- Headline: one action-oriented line
- Emoji-light (one headline emoji max; no emoji in body bullets)
- TL;DR: 3 short bullets
- Context: single sentence
- "What this means for {audience}": 2-3 sentences
- CTA: bold with ❗ if action needed; prefix with *FYI-only* if not
- Thread continuation: italic link at bottom
- Final line: "More: {recap link} | {related doc}"

### Email

- Subject line: topic + outcome ("Search feature: scope decided, capacity tradeoff needs your input")
- Greeting: "Hi {audience}," (not "team" unless truly mixed)
- Opening: 1-sentence headline + why they're receiving this
- TL;DR: 3 bullets
- Context: 2-3 sentences
- What was decided / advanced: concrete list
- What this means for your team: tailored
- What I need from you: explicit list with by-when
- Thread continuation: 1-sentence reference
- Sign-off

### Notion

- Rich H1/H2/H3 structure
- Longer context block
- Collapsible sections for detail
- Inline references and links
- Table for decisions and actions

### Exec-memo

- TL;DR first (3-4 lines)
- Supporting detail in 3 sections max
- Asks section upfront
- Formal tone; no emoji; no "team-speak"

## Sample inventory

| Sample | Scenario | Purpose |
|--------|----------|---------|
| `sample_foundation-stakeholder-update_slack-engineering.md` | Slack post to engineering re: search-scope decisions | Demonstrates technical-audience slack variant with moderate translation |
| `sample_foundation-stakeholder-update_email-leadership.md` | Email to leadership re: Q2 roadmap commitments | Demonstrates exec framing and explicit CTA |
| `sample_foundation-stakeholder-update_notion-mixed.md` | Notion page to mixed audience re: project kickoff | Demonstrates rich formatting and multi-audience "what this means" framing |

## Design decisions

1. **Primary audience is non-attendees, secondary is some attendees**. does not restrict, reflects reality. Some attendees want a reference version; the skill serves them too without special-casing.
2. **Channel + audience = two axes, not one matrix**. skill takes both as inputs. Each combination produces a distinct but related output. Avoids combinatorial template explosion by driving variants from a shared content core.
3. **Translation log is surfaced, not hidden**. users need to verify that "engineering team" translation of "velocity" to "throughput" actually lands with their engineering team. The log makes translations inspectable.
4. **Thread continuation is auto-detected but confirmable**. detection avoids user labor; confirmation in go-mode summary prevents false positives chaining unrelated updates.
5. **No automatic response drafting in v1.0.0**. open question flagged. Consider after usage data confirms the feature warrants the complexity.

## Validation checkpoints

- Frontmatter conforms with stakeholder-update-specific fields
- `channel` is in enum
- `audience_variant` is in enum
- `primary_cta` is non-empty string (use "FYI-only" if no action needed)
- `related_recap` is a valid filename reference or flagged as raw-notes input
- Zero-friction execution section in SKILL.md
- Link to family contract in SKILL.md
