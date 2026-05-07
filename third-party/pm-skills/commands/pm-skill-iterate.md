---
description: Apply targeted improvements to an existing PM skill based on feedback, validation reports, or convention changes
---

Use the `utility-pm-skill-iterate` skill to improve an existing PM skill.

Read the skill instructions from `skills/utility-pm-skill-iterate/SKILL.md` and follow them to iterate on the target skill.

Use `skills/utility-pm-skill-iterate/references/TEMPLATE.md` as the change summary output format.

If the user provides a skill name and feedback, begin with Step 1 (Identify the Target Skill) using the provided context. If a validation report is provided, parse it in Step 3 (Normalize Input). If no skill is specified, prompt the user for a skill name and what to change.

Context from user: $ARGUMENTS
