# F-27 foundation-meeting-recap: Implementation Plan

Per-skill execution plan. Reads together with effort brief ([`../F-27-meeting-recap.md`](../F-27-meeting-recap.md)) and specification ([`specification.md`](specification.md)).

## Dependencies

- **Blocks on**: family contract committed (done 2026-04-17)
- **Blocks on**: `scripts/validate-meeting-skills-family.*` existing
- **Parallelizable with**: F-18 (agenda), F-25 (brief), F-17 (synthesize), F-28 (stakeholder-update)
- **Upstream inputs**: `foundation-meeting-agenda` output (optional, auto-discovered for topic-skeleton + reconciliation); Krisp MCP / Otter / Fireflies transcripts (external)
- **Downstream consumers**: F-17 meeting-synthesize (consumes recaps); F-28 stakeholder-update (translates recap outcomes)

## Deliverables checklist

### Skill files

- [ ] `skills/foundation-meeting-recap/SKILL.md`
- [ ] `skills/foundation-meeting-recap/references/TEMPLATE.md`
- [ ] `skills/foundation-meeting-recap/references/EXAMPLE.md`

### Slash command

- [ ] `commands/meeting-recap.md`

### Library samples (3)

- [ ] `library/skill-output-samples/foundation-meeting-recap/sample_foundation-meeting-recap_decision-meeting.md`
- [ ] `library/skill-output-samples/foundation-meeting-recap/sample_foundation-meeting-recap_team-sync.md`
- [ ] `library/skill-output-samples/foundation-meeting-recap/sample_foundation-meeting-recap_stakeholder-review.md`

### Public skill documentation

- [ ] `docs/skills/foundation/foundation-meeting-recap.md`

### Cross-skill updates (shared across 5-skill batch)

- [ ] AGENTS.md entry
- [ ] `docs/reference/commands.md` row
- [ ] `library/skill-output-samples/README_SAMPLES.md` entries
- [ ] `mkdocs.yml` nav entry

## Implementation steps

1. **Scaffold directory**: `skills/foundation-meeting-recap/` with `references/`
2. **Write SKILL.md**:
   - Frontmatter (foundation phase, v1.0.0)
   - Purpose: topic-segmented post-meeting summary with decisions highlighted and actions inline
   - When to use: after any internal meeting that produces decisions or actions for attendees
   - Modes: single mode in v1.0.0 (no attendee/non-attendee variant; non-attendee comms go to stakeholder-update)
   - **Zero-friction execution section**
   - **Input format flexibility** emphasis (transcripts from any tool, notes, hybrid)
   - **Agenda auto-discovery** behavior described (filename prefix match)
   - **Fabrication prohibition** explicit. never invent owners or dates
   - Process section referencing spec
   - Quality checklist
   - Link to family contract
3. **Write TEMPLATE.md**:
   - Universal base frontmatter + recap-specific (`agenda_reconciliation`, `meeting_quality`)
   - Shareable summary block (meeting + date + 1-2 sentence + key decisions + top actions)
   - Full recap with meeting details, overall summary, agenda reconciliation, per-topic segments, consolidated actions, meeting quality signals, next steps
   - Sources & References
4. **Write EXAMPLE.md**. search-feature-kickoff recap from transcript + live notes
5. **Write slash command** `commands/meeting-recap.md`
6. **Write 3 library samples** per deliverables
7. **Generate/write public skill doc**
8. **Defer cross-skill updates** to end of 5-skill batch

## Validation checkpoints

- `lint-skills-frontmatter.sh`: PASS
- `validate-meeting-skills-family.sh`: PASS
- `validate-commands.sh`: PASS
- `validate-agents-md.sh`: PASS

## Estimated effort

Medium-high. Expect 60-75 minutes. Transcript-to-structured-output extraction is the most technically nuanced part. sample quality matters for establishing the extraction discipline.

## Notes

- **Fabrication rule is enforcing**: validator checks that all action owners appear in `attendees` list or are tagged `unassigned`. No invented owners.
- Agenda auto-discovery: scan same directory for filename with matching date + time prefix + `_agenda.md` suffix
- `meeting_quality.outcomes_achieved` format: `"N/M"` string matching regex `^\d+/\d+$`
- Sample selection covers: decision-heavy meeting, action-heavy meeting (team sync), mixed-attendee meeting (stakeholder review)
