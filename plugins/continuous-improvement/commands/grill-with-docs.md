---
name: grill-with-docs
description: "Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates CONTEXT.md + ADRs inline as decisions crystallise. Ported from mattpocock/skills under MIT."
---

# /grill-with-docs

Stress-test the current plan or design by interviewing the user one question at a time AND updating the project's domain-language doc (`CONTEXT.md`) and architecture decision records (`docs/adr/`) inline as decisions land.

## Trigger phrases

- `/grill-with-docs`
- "grill me and update the docs"
- "stress-test this against our domain model"
- "let's nail down the language and ADR this"

## What happens

1. Read `CONTEXT.md` (or `CONTEXT-MAP.md` + per-context `CONTEXT.md`) and `docs/adr/` if they exist. Use them as the source of truth for project language and prior decisions.
2. Walk the decision tree top-down. One question at a time with a recommended answer.
3. Challenge fuzzy terms against the glossary. Sharpen vague language. Stress-test relationships with concrete scenarios. Cross-reference user statements against the code.
4. When a term is resolved, update `CONTEXT.md` immediately (lazy-create if missing). Use the format in the skill's Appendix A.
5. Offer an ADR only when all three are true: hard to reverse, surprising without context, result of a real trade-off. Use the format in Appendix B.

## When to fire this instead of `/grill-me`

| Skill | Use when |
|---|---|
| `/grill-me` | Conversation-only grilling; no project to update yet, or no docs convention. |
| `/grill-with-docs` | Project has `CONTEXT.md` or is ready to start one; decisions should persist past the session. |

## Skill file

Full behavior, format specs, and 7 Laws fit are defined in [`skills/grill-with-docs.md`](../skills/grill-with-docs.md). The verbatim upstream cold-storage copies live at [`third-party/mattpocock-skills/skills/engineering/grill-with-docs/`](../third-party/mattpocock-skills/skills/engineering/grill-with-docs/) (`SKILL.md`, `CONTEXT-FORMAT.md`, `ADR-FORMAT.md`); SHA pin in [`third-party/MANIFEST.md`](../third-party/MANIFEST.md).

## Attribution

Ported from [mattpocock/skills `engineering/grill-with-docs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md) (MIT, © 2026 Matt Pocock). Mattpocock calls this his most powerful skill: "It's hard to explain how powerful this is. It might be the single coolest technique in this repo."
