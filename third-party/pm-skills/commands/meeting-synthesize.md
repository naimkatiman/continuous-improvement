---
description: Generate a cross-meeting synthesis surfacing patterns, trajectories, stalled threads, and contradictions across a set of meeting recaps
---

Use the `foundation-meeting-synthesize` skill to generate a cross-meeting synthesis.

Read the skill instructions from `skills/foundation-meeting-synthesize/SKILL.md` and follow them exactly.

Use `skills/foundation-meeting-synthesize/references/TEMPLATE.md` as the output format.

This skill belongs to the Meeting Skills Family; the canonical contract is at `docs/reference/skill-families/meeting-skills-contract.md` and governs shared behavior across all meeting skills.

Behavior:
- Accepts a list of meeting recap filenames (preferred) or raw notes (with lower input-quality flag)
- Supports filters: time range (`--quarter=2026-Q1`, `--range=YYYY-MM-DD-to-YYYY-MM-DD`), topic, stakeholder
- Supports format hints that control output presentation: `board-prep`, `onboarding`, `retro-input`, `exec-brief`
- Default flow: load sources, present brief inference summary (meeting count, time range, per-source input quality), proceed on `go` or corrections
- `--go` flag: skip the inference summary

Quality requirements:
- Source meetings listed with filename + date + per-source input quality
- Time range populated and sensible
- Timeline is plain-text markdown (no binary images)
- Themes include confidence markers tied to frequency
- Stakeholder position tracking shows evolution (initial → current), not just snapshot
- Contradictions are flagged in their own first-class section
- Narrative summary is 2-3 paragraphs of prose
- Follow-ups are prioritized High / Medium / Low with rationale
- Frontmatter omits single-meeting fields

Context from user: $ARGUMENTS
