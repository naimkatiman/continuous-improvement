# F-17 foundation-meeting-synthesize: Implementation Plan

Per-skill execution plan. Reads together with effort brief ([`../F-17-meeting-synthesize.md`](../F-17-meeting-synthesize.md)) and specification ([`specification.md`](specification.md)).

## Dependencies

- **Blocks on**: family contract committed (done 2026-04-17)
- **Blocks on**: `scripts/validate-meeting-skills-family.*` existing
- **Parallelizable with**: F-18, F-25, F-27, F-28
- **Upstream inputs**: `foundation-meeting-recap` outputs (preferred); raw meeting notes (accepted with lower input_quality)
- **Downstream consumers**: stakeholder-update can optionally reference a synthesis for quarterly comms; board prep and onboarding doc generation

## Deliverables checklist

### Skill files

- [ ] `skills/foundation-meeting-synthesize/SKILL.md`
- [ ] `skills/foundation-meeting-synthesize/references/TEMPLATE.md`
- [ ] `skills/foundation-meeting-synthesize/references/EXAMPLE.md`

### Slash command

- [ ] `commands/meeting-synthesize.md`

### Library samples (3)

- [ ] `library/skill-output-samples/foundation-meeting-synthesize/sample_foundation-meeting-synthesize_quarterly-topic.md`
- [ ] `library/skill-output-samples/foundation-meeting-synthesize/sample_foundation-meeting-synthesize_project-retro.md`
- [ ] `library/skill-output-samples/foundation-meeting-synthesize/sample_foundation-meeting-synthesize_exec-board-prep.md`

### Public skill documentation

- [ ] `docs/skills/foundation/foundation-meeting-synthesize.md`

### Cross-skill updates

- [ ] AGENTS.md entry
- [ ] `docs/reference/commands.md` row
- [ ] `library/skill-output-samples/README_SAMPLES.md` entries
- [ ] `mkdocs.yml` nav entry

## Implementation steps

1. **Scaffold directory**: `skills/foundation-meeting-synthesize/` with `references/`
2. **Write SKILL.md**:
   - Frontmatter (foundation phase, v1.0.0)
   - Purpose: cross-meeting archaeology. patterns, trajectories, contradictions
   - When to use: board prep, onboarding, project retro, quarterly review, investigating stalled initiatives
   - Positioning vs. `discover-interview-synthesis` (org meetings vs. user research)
   - **Zero-friction execution section**
   - **Format hint behavior** (board-prep, onboarding, retro-input, exec-brief)
   - **Contradiction-detection emphasis** (core value-add)
   - **Confidence-marker discipline** per theme
   - Process section referencing spec
   - Quality checklist
   - Link to family contract
3. **Write TEMPLATE.md**:
   - Synthesis-specific frontmatter (omits single-meeting fields; adds `source_meetings`, `time_range`, `scope_filter`)
   - Shareable summary (scope + headline + themes + open items + follow-ups)
   - Full synthesis: scope, plain-text timeline, themes with confidence, stakeholder position tracking, consolidated decision list, contradiction flags, open items/stalled threads, narrative summary, prioritized follow-ups
   - Sources & References listing source meetings with input quality per source
4. **Write EXAMPLE.md**. Q1 search-feature quarterly synthesis across 5-8 meetings
5. **Write slash command** `commands/meeting-synthesize.md`
6. **Write 3 library samples** per deliverables
7. **Generate/write public skill doc**
8. **Defer cross-skill updates**

## Validation checkpoints

- `lint-skills-frontmatter.sh`: PASS
- `validate-meeting-skills-family.sh`: PASS
- `validate-commands.sh`: PASS
- `validate-agents-md.sh`: PASS

## Estimated effort

High. Expect 75-90 minutes. The skill has the most structural depth: timeline rendering, theme clustering, stakeholder evolution tracking, contradiction detection all need clear extraction patterns. Sample quality is critical because this is the least-intuitive skill for users to invoke. good samples anchor expectations.

## Notes

- **Timeline is plain-text markdown only**. no binary images. Renders in chat, email, print.
- **Contradiction flags are a first-class section**: not an afterthought, not buried. Core value-add.
- Format hint shapes output ordering and truncation; one process generates the full data, hint controls presentation
- `source_meetings` is required; at least 1 source must be referenced
- When consuming raw notes instead of recaps, flag input_quality appropriately and note per-source quality in Sources & References
