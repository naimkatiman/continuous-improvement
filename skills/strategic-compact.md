---
name: strategic-compact
tier: "2"
description: Enforces Law 5 (Reflect After Every Session) of the 7 Laws of AI Agent Discipline at phase boundaries. Suggests manual context compaction at logical intervals to preserve context through task phases rather than arbitrary auto-compaction.
origin: continuous-improvement
user-invocable: false
---

# Strategic Compact Skill

Suggests manual `/compact` at strategic points in your workflow rather than relying on arbitrary auto-compaction.

## When to Activate

- Running long sessions that approach context limits (200K+ tokens)
- Working on multi-phase tasks (research → plan → implement → test)
- Switching between unrelated tasks within the same session
- After completing a major milestone and starting new work
- When responses slow down or become less coherent (context pressure)

## Why Strategic Compaction?

Auto-compaction triggers at arbitrary points:
- Often mid-task, losing important context
- No awareness of logical task boundaries
- Can interrupt complex multi-step operations

Strategic compaction at logical boundaries:
- **After exploration, before execution** — Compact research context, keep implementation plan
- **After completing a milestone** — Fresh start for next phase
- **Before major context shifts** — Clear exploration context before different task

## How It Works

This skill is a manual phase-boundary checklist, not a bundled runtime hook. Use it when planning or reviewing a long session:

1. **Name the current phase** — research, planning, implementation, testing, debugging, release, or handoff.
2. **Check the next transition** — decide whether the next phase needs fresh context or the current context is still load-bearing.
3. **Preserve state first** — write the plan, todo list, findings, or handoff note that must survive compaction.
4. **Compact only at a boundary** — if compaction helps, run `/compact` with a specific summary for the next phase.
5. **Resume from durable artifacts** — after compaction, re-read the plan/files instead of relying on lost conversation context.

## Runtime Boundary

The current plugin does not ship `strategic-compact` PreToolUse automation or a threshold script. Treat compaction as an operator/agent decision: this skill gives the decision guide, while Claude Code's native `/compact` command performs the actual compaction.

## Compaction Decision Guide

Use this table to decide when to compact:

| Phase Transition | Compact? | Why |
|-----------------|----------|-----|
| Research → Planning | Yes | Research context is bulky; plan is the distilled output |
| Planning → Implementation | Yes | Plan is in TodoWrite or a file; free up context for code |
| Implementation → Testing | Maybe | Keep if tests reference recent code; compact if switching focus |
| Debugging → Next feature | Yes | Debug traces pollute context for unrelated work |
| Mid-implementation | No | Losing variable names, file paths, and partial state is costly |
| After a failed approach | Yes | Clear the dead-end reasoning before trying a new approach |

## What Survives Compaction

Understanding what persists helps you compact with confidence:

| Persists | Lost |
|----------|------|
| Agent instructions (from CLAUDE.md / AGENTS.md) | Intermediate reasoning and analysis |
| TodoWrite task list | File contents you previously read |
| Memory files (`~/.claude/memory/`) | Multi-step conversation context |
| Git state (commits, branches) | Tool call history and counts |
| Files on disk | Nuanced user preferences stated verbally |

## Best Practices

1. **Compact after planning** — Once plan is finalized in TodoWrite, compact to start fresh
2. **Compact after debugging** — Clear error-resolution context before continuing
3. **Don't compact mid-implementation** — Preserve context for related changes
4. **Use the checklist** — The phase table helps decide *when*; you still decide *if*
5. **Write before compacting** — Save important context to files or memory before compacting
6. **Use `/compact` with a summary** — Add a custom message: `/compact Focus on implementing auth middleware next`

## Related

- [The Longform Guide](https://x.com/affaanmustafa/status/2014040193557471352) — Token optimization section
- Memory persistence hooks — For state that survives compaction
- `continuous-learning` skill — Extracts patterns before session ends
