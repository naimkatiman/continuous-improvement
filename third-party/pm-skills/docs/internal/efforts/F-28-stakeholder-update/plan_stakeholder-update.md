# F-28 foundation-stakeholder-update: Implementation Plan

Per-skill execution plan. Reads together with effort brief ([`../F-28-stakeholder-update.md`](../F-28-stakeholder-update.md)) and specification ([`specification.md`](specification.md)).

## Dependencies

- **Blocks on**: family contract committed (done 2026-04-17)
- **Blocks on**: `scripts/validate-meeting-skills-family.*` existing
- **Parallelizable with**: F-18, F-25, F-27, F-17
- **Upstream inputs**: `foundation-meeting-recap` output (preferred); raw meeting notes (accepted); optional prior stakeholder-update in thread
- **Downstream consumers**: none within this family; end of the single-meeting lifecycle

## Deliverables checklist

### Skill files

- [ ] `skills/foundation-stakeholder-update/SKILL.md`
- [ ] `skills/foundation-stakeholder-update/references/TEMPLATE.md`
- [ ] `skills/foundation-stakeholder-update/references/EXAMPLE.md`

### Slash command

- [ ] `commands/stakeholder-update.md`

### Library samples (3)

- [ ] `library/skill-output-samples/foundation-stakeholder-update/sample_foundation-stakeholder-update_slack-engineering.md`
- [ ] `library/skill-output-samples/foundation-stakeholder-update/sample_foundation-stakeholder-update_email-leadership.md`
- [ ] `library/skill-output-samples/foundation-stakeholder-update/sample_foundation-stakeholder-update_notion-mixed.md`

### Public skill documentation

- [ ] `docs/skills/foundation/foundation-stakeholder-update.md`

### Cross-skill updates

- [ ] AGENTS.md entry
- [ ] `docs/reference/commands.md` row
- [ ] `library/skill-output-samples/README_SAMPLES.md` entries
- [ ] `mkdocs.yml` nav entry

## Implementation steps

1. **Scaffold directory**: `skills/foundation-stakeholder-update/` with `references/`
2. **Write SKILL.md**:
   - Frontmatter (foundation phase, v1.0.0)
   - Purpose: async comms to stakeholders (primarily non-attendees, secondarily some attendees); translates outcomes into what-it-means
   - When to use: after a meeting with outcomes affecting teams who were not in the room
   - Positioning vs. `meeting-recap` (recap = summary of what happened; update = translation of what-it-means)
   - Positioning vs. `discover-stakeholder-summary` (summary = understanding stakeholders; update = communicating to them)
   - **Zero-friction execution section**
   - **Channel variant behavior** (slack, teams, email, notion, exec-memo)
   - **Audience variant behavior** (engineering, design, leadership, customer-facing, mixed)
   - **Technical-to-business translation log** (transparency requirement)
   - **Thread continuation detection**
   - Process section referencing spec
   - Quality checklist
   - Link to family contract
3. **Write TEMPLATE.md**:
   - Universal base frontmatter + stakeholder-update-specific (`channel`, `audience_variant`, `primary_cta`, `thread_continuation_of`)
   - No separate Shareable summary section (entire output is shareable content per contract)
   - `## The update` section with selected channel variant
   - `## Technical-to-business translation notes` (when translations applied)
   - Sources & References
4. **Write EXAMPLE.md**. engineering update from customer-facing team on search-feature decisions
5. **Write slash command** `commands/stakeholder-update.md`
6. **Write 3 library samples** covering distinct channel + audience combinations per deliverables
7. **Generate/write public skill doc**
8. **Defer cross-skill updates**

## Validation checkpoints

- `lint-skills-frontmatter.sh`: PASS
- `validate-meeting-skills-family.sh`: PASS
- `validate-commands.sh`: PASS
- `validate-agents-md.sh`: PASS

## Estimated effort

Medium-high. Expect 60-75 minutes. Channel variants multiply authoring work (one content core, five rendering targets). Sample authoring is the largest time sink. 3 samples × 3-5 channel variants each if comprehensive, or 3 samples × 1 channel each if illustrative only. Recommend 3 samples × 1 channel (focused).

## Notes

- **No separate Shareable summary section**: the entire output is shareable content
- **Primary audience is non-attendees; secondary is some attendees**. framing reflects mixed audience reality
- Translation log is inspectable. not hidden. so users can verify translations land
- Thread continuation auto-detection runs against `project`/`topics` frontmatter match on prior stakeholder-update filenames in same directory
- `primary_cta` is non-empty; "FYI-only" is an acceptable value
- Channel inference when absent: engineering/design → slack; leadership → email; mixed → notion; formal reporting → exec-memo
