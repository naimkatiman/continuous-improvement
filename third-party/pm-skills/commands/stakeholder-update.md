---
description: Generate an async stakeholder update from a meeting recap, tailored by channel (slack, teams, email, notion, exec-memo) and audience (engineering, design, leadership, customer-facing, mixed)
---

Use the `foundation-stakeholder-update` skill to generate a stakeholder communication from a meeting recap.

Read the skill instructions from `skills/foundation-stakeholder-update/SKILL.md` and follow them exactly.

Use `skills/foundation-stakeholder-update/references/TEMPLATE.md` as the output format.

This skill belongs to the Meeting Skills Family; the canonical contract is at `docs/reference/skill-families/meeting-skills-contract.md` and governs shared behavior across all meeting skills.

Behavior:
- Accepts a related recap filename (preferred) or raw meeting notes
- Required inputs: channel (slack | teams | email | notion | exec-memo) and audience variant (engineering | design | leadership | customer-facing | mixed)
- Auto-detects thread continuation by scanning directory for prior stakeholder-updates on same project/topics
- Default flow: load recap, present brief inference summary (detected channel if unspecified, proposed CTA, thread continuation, translation candidates), proceed on `go` or corrections
- `--go` flag: skip the inference summary

Quality requirements:
- Entire output is shareable content (no separate shareable summary section per contract)
- Channel variant matches specified channel
- Audience "what this means for you" is specifically tailored to the variant
- Primary CTA is surfaced up front (use "FYI-only" if no action needed)
- Technical-to-business translations logged for user verification
- Thread continuation referenced if prior updates exist
- Sources and References includes source recap and prior updates in thread

Context from user: $ARGUMENTS
