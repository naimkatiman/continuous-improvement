---
description: Update local pm-skills to the latest release with version comparison, value summary, and confirmation before writing files
---

Use the `utility-update-pm-skills` skill to check for and apply pm-skills updates.

Read the skill instructions from `skills/utility-update-pm-skills/SKILL.md` and follow them to perform the update.

Use `skills/utility-update-pm-skills/references/TEMPLATE.md` as the report output format.

If the user provides `--status`, run only the pre-flight checks and display the version comparison. If the user provides `--report-only`, perform Steps 1-3 and generate a report without applying any changes. Otherwise, begin with Step 1 (Pre-Flight) and proceed through all steps sequentially.

Context from user: $ARGUMENTS
