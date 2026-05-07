---
description: Generate a topic-segmented post-meeting recap with decisions highlighted and actions captured inline per topic, plus a consolidated actions view
---

Use the `foundation-meeting-recap` skill to generate a post-meeting recap.

Read the skill instructions from `skills/foundation-meeting-recap/SKILL.md` and follow them exactly.

Use `skills/foundation-meeting-recap/references/TEMPLATE.md` as the output format.

This skill belongs to the Meeting Skills Family; the canonical contract is at `docs/reference/skill-families/meeting-skills-contract.md` and governs shared behavior across all meeting skills.

Behavior:
- Accepts transcripts (Zoom, Meet, Otter, Fireflies, Krisp MCP, manual paste), notes, or hybrid inputs
- Auto-discovers sibling `meeting-agenda` artifact via filename-prefix match for topic-skeleton and desired-outcomes reconciliation
- Default flow: parse inputs, present a brief inference summary of detected metadata, proceed on `go` or corrections
- `--go` flag: skip the inference summary and produce output directly

Quality requirements:
- Input quality flagged honestly
- Every action has an owner (or explicit `[owner: unassigned]`) and a due date (or explicit `[due: not specified]`)
- No fabrication. owners invented only where explicitly named
- Decisions are bold-flagged; inferred decisions carry confidence markers
- Consolidated actions view regrouped by owner
- Agenda reconciliation (planned vs. hit vs. skipped vs. emerged) populated when agenda was loaded
- Meeting quality signals populated from available data
- Shareable summary leads with decisions and top actions
- Sources and References includes Generation context with transcript source and fabrication-check result

Context from user: $ARGUMENTS
