---
name: continuous-improvement
description: "Reflect on the current session, analyze observations for patterns, and show instinct status. Runs on-demand to save tokens."
---

# /continuous-improvement

Run this when you want to reflect and learn — not every session. Three steps in order.

## Step 1: Reflect

Generate a reflection for this session based on what happened:

```
## Reflection — [Date]
- What worked:
- What failed:
- What I'd do differently:
- Rule to add:
- Iteration — Next best recommendations (ranked, top 3):
  1. <primary — strongest next move>
  2. <alternative — different angle>
  3. <alternative — smaller/larger scope>
```

If there's a "Rule to add", record it as an instinct with 0.6 starting confidence. When the `ci_create_instinct` MCP tool is available (the plugin install starts the server in expert mode), call it: it writes the file to the project's instinct directory. Otherwise write `<id>.yaml` in that directory by hand; Step 2 says how the directory is named, and the Instinct Format section of the core skill shows the file layout.

The "Iteration — Next best recommendations" field is the Law 6 handoff. List the **top 3 ranked** core-development moves — what to build, fix, refactor, or investigate next so the feature/system advances. Item #1 is the strongest; #2 and #3 are alternatives the user can pivot to. NOT git steps (commit, push, PR), NOT verification re-runs, NOT deploy actions — those belong in the end-of-run summary.

Format per item: `<verb> <object at path:line> (<why, one clause grounded in current context>)`.

Rules: always exactly 3 distinct directions, not padding. If fewer real moves exist, fill remaining slots with `None — goal met from this angle.` If the goal is fully met across all angles, write `1. None — goal met, stop.` and omit #2 and #3.

## Step 2: Analyze Observations

The current project's files are in `~/.claude/instincts/<hash>/`. `<hash>` is the first 12 hex characters of the SHA-256 of the project root (`CLAUDE_PROJECT_DIR`, the directory the session was started in; when that is not set, the output of `git rev-parse --show-toplevel`), written with forward slashes, a lower-case drive letter and no trailing slash or newline. `D:\Work\app` is hashed as `d:/Work/app`, which gives `00c6de01c97c`.

Look at `~/.claude/instincts/<hash>/observations.jsonl`. If 20+ lines exist:

1. Read the last 500 lines
2. Read existing instinct `*.yaml` files (project + global)
3. Detect patterns:
   - User corrections → "don't do X" instincts
   - Error→fix sequences → "when X fails, try Y"
   - Repeated workflows (3+ times) → "for X, do A→B→C"
   - Tool preferences → "use tool Y for task X"
4. Create/update instinct YAML files
5. Be conservative: only create instincts for 3+ observations of the same pattern

If fewer than 20 observations, skip analysis and note the count.

### Multi-Agent Analysis (500+ observations)

When observation backlog is large, parallelize:
- **Agent 1:** User corrections + error→fix patterns
- **Agent 2:** Repeated workflows + tool preferences
- **Agent 3:** Cross-reference existing instincts for updates

Merge results and deduplicate before writing YAML files.

## Step 3: Show Status

Display all instincts for the current project + global:

```
=== continuous-improvement ===

## Level: [CAPTURE | ANALYZE | SUGGEST | AUTO-APPLY]

## Session Reflection
- What worked: [from this session]
- What failed: [from this session]
- What I'd do differently: [from this session]
- Rule to add: [captured as instinct]
- Iteration — Next best recommendations (ranked, top 3):
  1. [primary core-development move]
  2. [alternative angle]
  3. [alternative scope]

## Learning
  NEW  [instinct-id]        [domain]  [confidence]  (from reflection)
   ↑   [instinct-id]        [domain]  [old]→[new]   (+N observations)

## Instincts — [project-name] ([hash])
  ● [0.85] instinct-id       domain   auto-apply
  ◐ [0.60] instinct-id       domain   suggest
  ○ [0.35] instinct-id       domain   silent

## Instincts — global
  ● [0.90] instinct-id       domain   auto-apply

## Next
- Keep working — hooks capture automatically
- System auto-levels as instincts gain confidence
```

If no instincts or observations exist yet, explain this is expected: the system is in CAPTURE level, and this command creates instincts once 20+ observations have accumulated.

## Subcommands

### `/continuous-improvement weekly`

Set up a weekly analysis schedule:
1. Create a cron/loop schedule that runs `/continuous-improvement analyze` every 7 days
2. Confirm the schedule to the user
3. Show next scheduled run date

Nothing runs analysis at session start. Observations accumulate silently, and analysis only runs when you ask or on the weekly schedule.
