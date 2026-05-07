---
description: Audit an existing PM skill against structural conventions and quality criteria, producing a validation report with actionable recommendations
---

Use the `utility-pm-skill-validate` skill to audit a PM skill.

Read the skill instructions from `skills/utility-pm-skill-validate/SKILL.md` and follow them to validate the target skill.

Use `skills/utility-pm-skill-validate/references/TEMPLATE.md` as the report output format.

If the user provides a skill name, begin with Step 1 (Identify the Target) using the provided context. If the user provides `--all`, run batch mode (Tier 1 structural checks only). If no skill is specified, prompt the user for a skill name.

Context from user: $ARGUMENTS
