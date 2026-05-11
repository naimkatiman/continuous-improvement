---
name: grill-me
description: "Interview the user relentlessly about a plan or design until shared understanding is reached. Ported from mattpocock/skills under MIT."
---

# /grill-me

Stress-test the current plan or design by interviewing the user one question at a time, walking every branch of the decision tree, and recommending an answer for each.

## Trigger phrases

- `/grill-me`
- "grill me"
- "stress-test this plan"
- "interview me about this"
- "what am I missing?"

## What happens

1. Identify the current plan or design from the conversation — the high-level goal, the assumptions in play, the decisions already made.
2. Walk the decision tree top-down. For each unresolved branch, ask exactly **one question** with a **recommended answer**.
3. Before asking, check whether the codebase already answers the question (`grep`, `ls`, file reads). If it does, use that and skip the question.
4. Resolve dependencies in order — do not ask about deployment before the data model is pinned.
5. Stop when the plan is shippable cold to a fresh agent. Do not interview past the point of usefulness.

## Five interview rules

1. **One question at a time.** Never multi-question; force depth on every branch.
2. **Always recommend.** Every question carries "my answer would be X because Y".
3. **Explore before asking.** Code answers beat user-attention answers.
4. **Walk the tree, do not jump.** Order matters.
5. **Stop when shippable.** End state is a plan a fresh agent could execute, not an infinite interview.

## Skill file

Full behavior is defined in [`skills/grill-me.md`](../skills/grill-me.md). The verbatim upstream cold-storage copy lives at [`third-party/mattpocock-skills/skills/productivity/grill-me/SKILL.md`](../third-party/mattpocock-skills/skills/productivity/grill-me/SKILL.md); SHA pin in [`third-party/MANIFEST.md`](../third-party/MANIFEST.md).

## Attribution

Ported from [mattpocock/skills `productivity/grill-me`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md) (MIT, © 2026 Matt Pocock).
