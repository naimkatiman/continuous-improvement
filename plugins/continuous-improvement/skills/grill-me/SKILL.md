---
name: grill-me
tier: "2"
description: Enforces Law 1 (Research Before Executing) of the 7 Laws of AI Agent Discipline. Interview the user relentlessly about a plan or design until shared understanding is reached, resolving every branch of the decision tree before any code is written. Ported from mattpocock/skills under MIT.
origin: https://github.com/mattpocock/skills
---

# /grill-me — Interrogate the plan before executing it

Ported verbatim in behavior from [mattpocock/skills `productivity/grill-me`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md) (MIT, © 2026 Matt Pocock). Cold-storage snapshot at [`third-party/mattpocock-skills/skills/productivity/grill-me/SKILL.md`](../third-party/mattpocock-skills/skills/productivity/grill-me/SKILL.md); SHA pin in [`third-party/MANIFEST.md`](../third-party/MANIFEST.md).

## What this skill does

Interview the user relentlessly about every aspect of the plan until shared understanding is reached. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide a recommended answer.

Ask questions one at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.

## When to fire it

- The user has just stated a goal at a high level ("add auth", "speed up the API") with no spec underneath.
- A `/proceed-with-the-recommendation` walk is about to start but the recommendation list itself is ambiguous about scope or success criteria.
- An RFC, PRD, or plan doc is being drafted and the user wants pressure on the assumptions before writing it.
- The user types "grill me", "stress-test this plan", or "interview me about X".
- `gateguard` is firing because the agent does not have enough grounding to proceed safely on a Write/Edit/Bash — alignment is missing, not just facts.

## How it differs from `gateguard`

`gateguard` is a tool-boundary gate that blocks Edit / Write / Bash until the agent provides concrete investigation (importers, schemas, user instruction). It catches the case where the agent thinks it knows enough to mutate state. `grill-me` is the conversational layer one floor above: it surfaces the missing decisions before any tool call would even be attempted. They compose:

| Gap | Caught by |
|---|---|
| Agent has no spec, no plan — about to invent one | `grill-me` |
| Agent has a plan but specific branches are under-specified | `grill-me` |
| Agent is about to Edit / Write / Bash without grounding | `gateguard` |
| Plan exists, grounded, but the implementation drifts | `verification-loop`, `tdd-workflow` |

## Interview discipline

Five rules the agent should hold while grilling:

1. **One question at a time.** Multi-question turns let the user skim and answer the easy ones. Force depth on each branch.
2. **Always recommend.** Every question carries a "my answer would be X because Y" so the user can confirm, override, or expose a third option you hadn't considered.
3. **Explore before asking.** If `grep` / `ls` / a quick read can answer the question, do that first. Do not waste user attention on questions the codebase already answers.
4. **Walk the tree, do not jump.** Resolve dependencies in order — do not ask about deployment if you have not pinned the data model yet.
5. **Stop when the spec is shippable.** The end state is a plan a fresh agent could execute cold, not an endless interview. When the next agent could pick up the doc and run, stop.

## How it fits the 7 Laws

| Law | Role of this skill |
|---|---|
| Law 1 (Research Before Executing) | Pre-execution interrogation closes the alignment gap that misaligns the agent with the user before any tool call. |
| Law 2 (Plan Is Sacred) | The interview produces a plan grounded in real decisions, not invented defaults. |
| Law 4 (Verify Before Reporting) | Every recommended answer is a falsifiable claim the user can correct in the moment. |

## Companion / alternative skills

- [`gateguard`](./gateguard.md) — tool-boundary gate; blocks Edit / Write / Bash until grounding is presented. Fires after `grill-me` has aligned the spec.
- [`workspace-surface-audit`](./workspace-surface-audit.md) — Law 1 surface audit; inventory of MCP servers, plugins, env, hooks. Use when the missing context is "what is available in this repo" rather than "what should we build."
- [`superpowers:brainstorming`](https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md) — Socratic design refinement. Use for open-ended ideation; use `grill-me` once the idea is committed and needs hardening.
- [`handoff`](./handoff.md) — session-end compaction. Pair with `grill-me`: grill at start, handoff at end.

## Attribution

This skill is a port of [mattpocock/skills `productivity/grill-me`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md). MIT-licensed upstream, MIT-licensed here. See [`third-party/mattpocock-skills/LICENSE`](../third-party/mattpocock-skills/LICENSE) for the verbatim license and [`third-party/mattpocock-skills/OUR_NOTES.md`](../third-party/mattpocock-skills/OUR_NOTES.md) for the vendoring rationale and drift radar.
