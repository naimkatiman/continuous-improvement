---
description: Generate an attendee-facing meeting agenda with time-boxed topics, type tags, owners, and attendee prep
---

Use the `foundation-meeting-agenda` skill to generate a complete meeting agenda.

Read the skill instructions from `skills/foundation-meeting-agenda/SKILL.md` and follow them exactly.

Use `skills/foundation-meeting-agenda/references/TEMPLATE.md` as the output format.

This skill belongs to the Meeting Skills Family; the canonical contract is at `docs/reference/skill-families/meeting-skills-contract.md` and governs shared behavior across all meeting skills.

Behavior:
- Default flow: read inputs, infer missing values, present a brief inference summary, and proceed on `go` or corrections.
- `--go` flag: skip the inference summary and produce output using defaults.
- Anti-meeting check: opens with "does this need to be a meeting?" If the objective can be met async, propose the async alternative and produce that framing instead of a full agenda unless the user overrides.

Quality requirements:
- Meeting type set (or explicitly `other` with low-confidence flag)
- Duration set (default 30 min if not provided, flagged as default)
- Sum of topic times equals meeting duration (+/- 2 min tolerance)
- Each topic has type tag, owner, goal, and time
- Attendee prep lists required tasks with estimated prep time
- Shareable summary is 5-6 lines, Slack-paste-ready
- Sources and References section includes Generation context with defaults applied and inferences made

Context from user: $ARGUMENTS
