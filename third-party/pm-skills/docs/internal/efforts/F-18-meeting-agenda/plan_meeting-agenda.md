# F-18 foundation-meeting-agenda: Implementation Plan

Per-skill execution plan. Reads together with the effort brief ([`../F-18-meeting-agenda.md`](../F-18-meeting-agenda.md)) and specification ([`specification.md`](specification.md)).

## Dependencies

- **Blocks on**: family contract at `docs/reference/skill-families/meeting-skills-contract.md` being committed (it is, as of 2026-04-17)
- **Blocks on**: `scripts/validate-meeting-skills-family.*` existing (otherwise CI validation during PR will not enforce contract)
- **Parallelizable with**: F-25 (brief), F-27 (recap), F-17 (synthesize), F-28 (stakeholder-update)
- **Downstream consumers**: F-27 meeting-recap auto-discovers agenda files for topic-skeleton + reconciliation

## Deliverables checklist

### Skill files

- [ ] `skills/foundation-meeting-agenda/SKILL.md`
- [ ] `skills/foundation-meeting-agenda/references/TEMPLATE.md`
- [ ] `skills/foundation-meeting-agenda/references/EXAMPLE.md`

### Slash command

- [ ] `commands/meeting-agenda.md`

### Library samples (3)

- [ ] `library/skill-output-samples/foundation-meeting-agenda/sample_foundation-meeting-agenda_decision-meeting.md`
- [ ] `library/skill-output-samples/foundation-meeting-agenda/sample_foundation-meeting-agenda_team-sync.md`
- [ ] `library/skill-output-samples/foundation-meeting-agenda/sample_foundation-meeting-agenda_1-on-1.md`

### Public skill documentation

- [ ] `docs/skills/foundation/foundation-meeting-agenda.md` (auto-generated via `scripts/generate-skill-pages.py` if available; else hand-author per F-26 precedent)

### Cross-skill updates (done once across all 5 efforts)

- [ ] AGENTS.md entry
- [ ] `docs/reference/commands.md` row
- [ ] `library/skill-output-samples/README_SAMPLES.md` browse-table entries + sample count update
- [ ] `mkdocs.yml` nav entry under Foundation

## Implementation steps

1. **Scaffold directory**: `skills/foundation-meeting-agenda/` with `references/` subdirectory
2. **Write SKILL.md** conforming to SKILL template with:
   - Frontmatter (name, description, phase=foundation, version=1.0.0, updated, license, metadata)
   - Purpose section referencing family contract
   - When to use section
   - Supported Modes (if any. default single mode for v1.0.0)
   - **Zero-friction execution section** (per contract. required for CI)
   - **Anti-meeting check** flow step (shared with meeting-brief)
   - Process section (reference specification.md for detail)
   - Quality checklist
   - Link to family contract: `See: [Meeting Skills Family Contract](../../docs/reference/skill-families/meeting-skills-contract.md)`
3. **Write TEMPLATE.md** with:
   - Full universal-base-field frontmatter + agenda-specific fields
   - `## Shareable summary` section scaffold
   - `## Full agenda` section with sub-sections per spec
   - `## Sources & References` section with all 4 required subsections
4. **Write EXAMPLE.md**. worked example of a decision meeting for search-feature kickoff
5. **Write slash command** `commands/meeting-agenda.md`:
   - Frontmatter (name, description)
   - Body referencing `skills/foundation-meeting-agenda/SKILL.md`
6. **Write 3 library samples**. covering the scenarios listed in deliverables
7. **Generate/write public skill doc** at `docs/skills/foundation/foundation-meeting-agenda.md`
8. **Update AGENTS.md**. add entry for foundation-meeting-agenda
9. **Update commands reference**. row in `docs/reference/commands.md`
10. **Update samples browse table**. entries in `library/skill-output-samples/README_SAMPLES.md`
11. **Update mkdocs.yml**. Foundation nav entry

## Validation checkpoints

Run after each step; must pass before moving to next grouping:

- After skill files created:
  - `scripts/lint-skills-frontmatter.sh` must PASS
  - `scripts/validate-meeting-skills-family.sh` must PASS (contract conformance)
- After slash command created:
  - `scripts/validate-commands.sh` must PASS
- After AGENTS.md updated:
  - `scripts/validate-agents-md.sh` must PASS
- After cross-skill doc updates:
  - `scripts/check-count-consistency.sh` advisory output should reflect new counts

## Estimated effort

Medium. Expect 45-60 minutes of focused authoring for all deliverables, assuming family contract and spec are already set (they are as of 2026-04-17). Variant-specific behavior in the template (10 meeting types) is the most time-intensive part.

## Notes

- Default meeting duration is 30 min (per family contract decision 13)
- Meeting type and RACI are optional frontmatter; skill must infer when absent
- Time math validation (sum of topic times = meeting duration) is enforcing per spec
- Shared with `foundation-meeting-brief`: anti-meeting check opening flow
