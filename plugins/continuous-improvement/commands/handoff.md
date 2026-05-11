---
name: handoff
description: "Compact the current conversation into a handoff document for another agent to pick up. Ported from mattpocock/skills under MIT."
argument-hint: "What will the next session be used for?"
---

# /handoff

Hand the current session off to a fresh agent by writing a brief, mktemp-backed markdown summary they can pick up cold.

## Trigger phrases

- `/handoff`
- `/handoff <what the next session will focus on>`
- "write a handoff doc"
- "compact this into a handoff"

## What happens

1. Read the current conversation (and the user's argument, if given) to identify the goal, current state, decisions made, open questions, next concrete step, and skills to load.
2. Generate a unique path with `mktemp -t handoff-XXXXXX.md` and read it (it will be empty).
3. Write the handoff doc to that path. Reference PRDs, plans, ADRs, issues, commits, and diffs by path or URL — do not duplicate their content.
4. Suggest the skills the next session should load.

## What goes in the doc

A one-screen brief, in this order:

1. **Goal** — one sentence on the outcome the user is steering toward.
2. **Current state** — what is actually true on disk / in the system right now.
3. **Decisions made this session** — only what is not already captured in commits or other artifacts.
4. **Open questions** — blocking choices the next agent needs the user to answer.
5. **Next concrete step** — the single action the next agent should take first.
6. **Skills to load** — names of the skills the next session should activate.

## Skill file

Full behavior is defined in [`skills/handoff.md`](../skills/handoff.md). The verbatim upstream cold-storage copy lives at [`third-party/mattpocock-skills/skills/in-progress/handoff/SKILL.md`](../third-party/mattpocock-skills/skills/in-progress/handoff/SKILL.md); SHA pin in [`third-party/MANIFEST.md`](../third-party/MANIFEST.md).

## Attribution

Ported from [mattpocock/skills `in-progress/handoff`](https://github.com/mattpocock/skills/blob/main/skills/in-progress/handoff/SKILL.md) (MIT, © 2026 Matt Pocock).
