# F-25 foundation-meeting-brief: Implementation Plan

Per-skill execution plan. Reads together with the effort brief ([`../F-25-meeting-brief.md`](../F-25-meeting-brief.md)) and specification ([`specification.md`](specification.md)).

## Dependencies

- **Blocks on**: family contract committed (done 2026-04-17)
- **Blocks on**: `scripts/validate-meeting-skills-family.*` existing
- **Parallelizable with**: F-18 (agenda), F-27 (recap), F-17 (synthesize), F-28 (stakeholder-update)
- **Upstream inputs**: `discover-stakeholder-summary` outputs (optional, auto-discovered)
- **Downstream consumers**: F-27 meeting-recap (references brief via `related_brief`)

## Deliverables checklist

### Skill files

- [ ] `skills/foundation-meeting-brief/SKILL.md`
- [ ] `skills/foundation-meeting-brief/references/TEMPLATE.md`
- [ ] `skills/foundation-meeting-brief/references/EXAMPLE.md`

### Slash command

- [ ] `commands/meeting-brief.md`

### Library samples (3)

- [ ] `library/skill-output-samples/foundation-meeting-brief/sample_foundation-meeting-brief_exec-briefing.md`
- [ ] `library/skill-output-samples/foundation-meeting-brief/sample_foundation-meeting-brief_stakeholder-review.md`
- [ ] `library/skill-output-samples/foundation-meeting-brief/sample_foundation-meeting-brief_negotiation-adjacent.md`

### Public skill documentation

- [ ] `docs/skills/foundation/foundation-meeting-brief.md`

### Cross-skill updates (shared across all 5 efforts, do once at end)

- [ ] AGENTS.md entry
- [ ] `docs/reference/commands.md` row
- [ ] `library/skill-output-samples/README_SAMPLES.md` browse-table entries
- [ ] `mkdocs.yml` nav entry

## Implementation steps

1. **Scaffold directory**: `skills/foundation-meeting-brief/` with `references/`
2. **Write SKILL.md** with:
   - Frontmatter (foundation phase, v1.0.0)
   - Purpose section (differentiation from meeting-agenda: private vs. attendee-facing)
   - When to use (stakeholder reviews, exec briefings, negotiation-adjacent conversations, first meetings with new stakeholders)
   - **Zero-friction execution section**
   - **Anti-meeting check** flow step (shared with meeting-agenda)
   - Process section referencing spec
   - Quality checklist
   - Link to family contract
3. **Write TEMPLATE.md**:
   - Universal base frontmatter + brief-specific (`stakeholders`, `primary_ask`)
   - Default `visibility: private`
   - Private-use Shareable summary block (with guidance note: share only with trusted advisor)
   - Full brief section with context, background, stakeholder reads, ranked outcomes, key messages, anticipated Q&A, risks, asks, success signals
   - Sources & References section
4. **Write EXAMPLE.md**. worked example: user prepping for exec briefing on Q2 commitments
5. **Write slash command** `commands/meeting-brief.md`
6. **Write 3 library samples** per deliverables list
7. **Generate/write public skill doc** at `docs/skills/foundation/foundation-meeting-brief.md`
8. **Defer cross-skill updates** to the end of the 5-skill batch

## Validation checkpoints

- `scripts/lint-skills-frontmatter.sh`: must PASS
- `scripts/validate-meeting-skills-family.sh`: must PASS
- `scripts/validate-commands.sh`: must PASS after command created
- `scripts/validate-agents-md.sh`: must PASS after AGENTS.md updated

## Estimated effort

Medium. Expect 45-60 minutes. Stakeholder-reads section is the most variable in quality; samples anchor expectations.

## Notes

- Default `visibility: private` is a per-skill override of the family base default
- Anti-meeting check is shared logic with F-18; implementation should reference the shared behavior in SKILL.md rather than duplicate
- Auto-discover prior recaps via `project`/`topics` match if related files exist in the user's context
- Skill runs on inferred stakeholder positions with `low` confidence when no summaries provided; does not block
