---
description: Generate a private strategic preparation document for a meeting that matters, with stakeholder reads, ranked outcomes, key messages, anticipated Q&A, and risks
---

Use the `foundation-meeting-brief` skill to generate a private strategic prep document for a meeting.

Read the skill instructions from `skills/foundation-meeting-brief/SKILL.md` and follow them exactly.

Use `skills/foundation-meeting-brief/references/TEMPLATE.md` as the output format.

This skill belongs to the Meeting Skills Family; the canonical contract is at `docs/reference/skill-families/meeting-skills-contract.md` and governs shared behavior across all meeting skills.

Behavior:
- Default flow: read inputs, auto-discover related artifacts (prior recaps, stakeholder summaries), infer missing values with confidence markers, present a brief inference summary, and proceed on `go` or corrections.
- `--go` flag: skip the inference summary and produce output using inferred values.
- Anti-meeting check: opens with "does this need to be a meeting?" If the objective can be handled async, propose the alternative.
- Runs on inferred stakeholder positions with low-confidence flags when no summaries are provided; does not block on missing inputs.

Quality requirements:
- Default `visibility: private`
- Every stakeholder entry has position, stakes, concerns, relationship state (inferred values flagged with confidence)
- Desired outcomes are ranked (must / should / nice)
- Key messages are phrased for delivery
- Anticipated Q&A table has 3 or more entries
- Asks are specific (named person, specific request, by-when)
- Sources and References section includes Generation context with inferences flagged

Context from user: $ARGUMENTS
