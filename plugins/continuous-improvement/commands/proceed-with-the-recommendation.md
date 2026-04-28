---
name: proceed-with-the-recommendation
description: "Execute the agent's prior recommendation list under the 7 Laws — walk in order, route per item, verify, reflect. Standalone companion skill with inline fallbacks when other skills are not installed."
---

# /proceed-with-the-recommendation

Walk an agent-generated recommendation list top-to-bottom under the continuous-improvement 7 Laws. Each item is routed to the best specialist skill when available, falls back to concrete inline behavior when it is not.

Invoke immediately after the agent has offered a numbered list of recommendations, next steps, or suggested actions.

## Trigger phrases

- `/proceed-with-the-recommendation`
- "proceed with your recommendation"
- "do all of it"
- "go ahead with the plan"
- "execute the recommendations"
- "yes do it" / "all of them"

## What happens

1. **Pre-flight (Law 1)** — restate the recommendation list in original order, tag each `safe` / `caution` / `needs-approval`
2. **Plan (Law 2)** — inline restatement if ≤3 items, call `superpowers:writing-plans` if larger
3. **Execute (Law 3)** — route each item to the preferred skill; apply inline fallback if the skill is not installed
4. **Verify (Law 4)** — smallest check per item, non-transitive (no later item retroactively verifies an earlier one)
5. **Iterate (Law 6)** — one change → verify → next; never carry a failure forward
6. **Reflect (Laws 5 + 7)** — end-of-run Reflection block appended to `observations.jsonl`
7. **Close** — three-section user-facing block: **What has been done → What is next → Recommendation** (tiered tables + one decisive "My recommendation" paragraph + a binary "Want me to: A or B?" closer)

## Hard halts (never silently proceed)

- Any `needs-approval` item: deploy, force-push, DB drop, secret change, shared-state mutation
- Verification failure with non-obvious fix
- Drive-by temptation outside the original list
- Context budget above 80%

## Pairs best with

| Preferred skill | Used for |
|---|---|
| `workspace-surface-audit` | Law 1 pre-flight when the list touches unknown surface area |
| `superpowers:writing-plans` | Plan breakdown when the list >3 items or >150 LOC |
| `superpowers:*` | Per-item specialist routing (TDD, debugging, review, verification, parallel) |
| `ralph` | Long-running PRD-style autonomous execution |
| `simplify`, `security-review`, `documentation-lookup`, `schedule`, `loop`, `update-config`, `commit-commands:*` | continuous-improvement helpers |

If none of those are installed, the skill still works — every routing row has an inline fallback and every item still gets a verification step.

## Skill file

Full behavior is defined in [`skills/proceed-with-the-recommendation.md`](../skills/proceed-with-the-recommendation.md).

## Install standalone

```bash
mkdir -p ~/.claude/skills/proceed-with-the-recommendation
curl -L https://raw.githubusercontent.com/naimkatiman/continuous-improvement/main/skills/proceed-with-the-recommendation.md \
  -o ~/.claude/skills/proceed-with-the-recommendation/SKILL.md
```

Restart the Claude Code session so the registry picks it up.
