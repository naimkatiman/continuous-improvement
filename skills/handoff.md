---
name: handoff
tier: "2"
description: Enforces Law 5 (Reflect After Every Session) of the 7 Laws of AI Agent Discipline. Compact the current conversation into a handoff document for another agent to pick up. Ported from mattpocock/skills under MIT.
argument-hint: "What will the next session be used for?"
origin: https://github.com/mattpocock/skills
---

# /handoff — Hand the session off to a fresh agent

Ported verbatim in behavior from [mattpocock/skills `in-progress/handoff`](https://github.com/mattpocock/skills/blob/main/skills/in-progress/handoff/SKILL.md) (MIT, © 2026 Matt Pocock). Cold-storage snapshot at [`third-party/mattpocock-skills/skills/in-progress/handoff/SKILL.md`](../third-party/mattpocock-skills/skills/in-progress/handoff/SKILL.md); SHA pin in [`third-party/MANIFEST.md`](../third-party/MANIFEST.md).

## What this skill does

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save it to a path produced by `mktemp -t handoff-XXXXXX.md` (read the file before you write to it).

Suggest the skills to be used, if any, by the next session.

Do not duplicate content already captured in other artifacts (PRDs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.

## When to fire it

- End of a working session that did not finish the task — you want the next agent to pick up cold without re-reading the whole transcript.
- Context budget approaching the ceiling and `/compact` would lose load-bearing state — write a handoff doc first, then compact.
- Switching from one repo or branch to another mid-session — capture what was decided in the active context before the swap.
- Before invoking a long-running autonomous loop (`/ralph`, `/loop`) that will run while you are away.

## What goes in the doc

The handoff is a brief, not a transcript. A useful one fits on one screen and answers, in order:

1. **Goal** — the one-sentence outcome the user is steering toward.
2. **Current state** — what is actually true on disk / in the system right now (branch, last commit, open files, last verified step).
3. **Decisions made this session** — only what is not already in commits, PRDs, ADRs, or the plan doc.
4. **Open questions** — blocking choices the next agent needs the user to answer before continuing.
5. **Next concrete step** — the single action the next agent should take first.
6. **Skills to load** — names of the skills the next session should activate (e.g. `verification-loop`, `superpowers:writing-plans`, `gateguard`).

Anything that is already captured elsewhere gets a path or URL pointer, not a duplicate.

## How it fits the 7 Laws

| Law | Role of this skill |
|---|---|
| Law 5 (Reflect After Every Session) | The handoff is the reflection artifact — what changed, what was decided, what remains. |
| Law 7 (Learn From Every Session) | Naming the skills the next session should activate is a learned-pattern signal. |
| Law 2 (Plan Is Sacred) | The "next concrete step" preserves the existing plan across the session boundary instead of restarting from blank. |

## Companion / alternative skills

- [`strategic-compact`](./strategic-compact.md) — compact the current session at a phase boundary instead of writing a handoff doc. Use when the session continues with the same agent.
- [`para-memory-files`](./para-memory-files.md) — durable cross-session memory under `~/.claude/memory/`. Use for classified facts (user, project, feedback, reference), not per-session handoff briefs.
- `superpowers:writing-plans` — produce the plan doc the handoff can reference instead of duplicating.

## Attribution

This skill is a port of [mattpocock/skills `in-progress/handoff`](https://github.com/mattpocock/skills/blob/main/skills/in-progress/handoff/SKILL.md). MIT-licensed upstream, MIT-licensed here. See [`third-party/mattpocock-skills/LICENSE`](../third-party/mattpocock-skills/LICENSE) for the verbatim license and [`third-party/mattpocock-skills/OUR_NOTES.md`](../third-party/mattpocock-skills/OUR_NOTES.md) for the vendoring rationale and drift radar.
