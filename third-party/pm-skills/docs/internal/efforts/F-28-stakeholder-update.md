# [F-28] Foundation Stakeholder Update Skill

Status: Backlog
Milestone: v2.11.0
Issue: TBD
Agent: Claude Opus 4.7

## Scope

Create `foundation-stakeholder-update`, a post-meeting skill that produces async communication to stakeholders. primarily non-attendees who need to know outcomes, and secondarily some attendees who want a reference version. Different from `foundation-meeting-recap` in audience, format, and purpose: not a summary of what happened, but a translation of outcomes into what-it-means for readers. Conforms to the [Meeting Skills Family Contract](../reference/skill-families/meeting-skills-contract.md).

## Problem

When a meeting produces outcomes that affect teams who were not in the room, the standard follow-through fails in predictable ways:

1. The recap gets forwarded to non-attendees who cannot parse insider shorthand
2. A separate "update" is written in fragments across Slack, email, and Notion, inconsistent in what-it-means framing
3. The primary ask (what the user needs from readers) is buried, so readers do not take the action the user needed
4. Technical outcomes land with business stakeholders as jargon they cannot weigh
5. If the update is a continuation of prior comms on the same topic, the thread linkage is lost

PMs doing this manually write 3-5 versions (one per audience), which takes an hour. The skill produces a channel-tailored, audience-tailored update from a recap (or directly from meeting notes) in one invocation, with explicit CTA framing and technical-to-business translation where the audience warrants it.

## How It Works

### Input

- Related `meeting-recap` filename (preferred) or raw meeting notes
- Target channel: `slack | teams | email | notion | exec-memo`
- Target audience variant: `engineering | design | leadership | customer-facing | mixed`
- Primary CTA. what the user needs from readers, or explicit "FYI-only"
- Optional: prior update filename in the thread (for continuation framing)

### Process

1. **Present go-mode inference summary**. per family contract. Includes inferred audience if not specified (from recap context).
2. **Distill key outcomes**. from recap or notes, extract the 3-5 outcomes that matter to non-attendees
3. **Frame the CTA**. surface the ask up front, not buried. If "FYI-only," say so
4. **Translate technical-to-business**. flag jargon and acronyms unlikely to land with the audience; provide plainer alternatives. Keep a translations-applied log in the output's context section for user verification
5. **Detect thread continuation**. if a prior update exists on the same topic/thread, reference and link it
6. **Produce channel-tailored variant**:
   - **Slack/Teams**: short, emoji-light, threaded-friendly, skimmable
   - **Email**: clear subject line + structured body + sign-off
   - **Notion**: richer formatting, longer context, optimized for reference
   - **Exec-memo**: tight, formal, TL;DR first, supporting detail after, explicit asks upfront
7. **Produce artifact** conforming to TEMPLATE.md. the entire output is effectively shareable content; no separate summary block required

### Output

Async update message suited to the selected channel. Headline (skimmable action-oriented one line). TL;DR (2-3 bullets, key outcomes). Context (brief framing for readers who may or may not have been in the room). What was decided or advanced. What this means for the audience (tailored per audience variant). Actions requested (if any, with clear CTA and due dates). Thread continuation references (if applicable). Where to go for more (link to recap, agenda, related docs). Sources & References section with Generation context including channel, audience variant, translations applied.

## Classification

- Type: `foundation` (cross-phase)
- Category: `meeting`
- Directory: `skills/foundation-stakeholder-update/`
- Command: `/stakeholder-update`

## Exemplars

- `foundation-meeting-recap` (F-27): primary input source; update translates recap outcomes into audience-tailored communication
- `discover-stakeholder-summary`: distinct purpose (understanding stakeholders vs. communicating to them) but related context
- Meeting Skills Family Contract: shared behavioral and structural requirements

## Deliverables

- `skills/foundation-stakeholder-update/SKILL.md`
- `skills/foundation-stakeholder-update/references/TEMPLATE.md`
- `skills/foundation-stakeholder-update/references/EXAMPLE.md` (worked example: engineering update to customer-facing team on search-feature decisions)
- `commands/stakeholder-update.md`
- `library/skill-output-samples/foundation-stakeholder-update/sample_foundation-stakeholder-update_*.md` (3 samples covering distinct channel + audience combinations: slack-to-engineering, email-to-leadership, notion-to-mixed)
- `docs/skills/foundation/foundation-stakeholder-update.md`
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

- Anticipated response drafting. should the skill also draft responses to likely replies the user will get? Valuable; consider during spec writing. Probably opt-in, not default.
- Send-time guidance. optimal time to post for the audience? Deferred; not in v1.0.0.
- Per-stakeholder variant generation at scale. generate N versions for N stakeholder groups in one pass? Deferred; not in v1.0.0.
- Tone selection beyond audience. formal / casual / urgent / celebratory? Deferred; not in v1.0.0.
- Response template preparation. ready-to-use replies for expected FAQs? Deferred; not in v1.0.0.

## Status Transitions

- **Backlog** (current)
- **In Progress**. when per-skill authoring begins
- **Shipped**. on v2.11.0 tag + push

## Detailed specification

See [`F-28-stakeholder-update/specification.md`](F-28-stakeholder-update/specification.md) for the full spec.
