---
name: intent-driven-development
description: "Turn an ambiguous or high-impact change into scoped, verifiable acceptance criteria (observable AC-NNN, explicit scope, named verification methods, and a [revised] protocol that forbids silently dropping a criterion) before or alongside implementation. Enforces Law 2 (Plan Is Sacred)."
argument-hint: "[the change to scope into acceptance criteria]"
---

# /intent-driven-development

Convert an ambiguous or high-impact request into observable acceptance criteria before you build, so "done" is a fact two people would agree on and the agreed plan is held sacred (Law 2). Produce useful criteria without ceremony: inspect context first, expose only genuine ambiguity, choose verification that fits the risk.

## Trigger phrases

- `/intent-driven-development`
- `/intent-driven-development <the change>`
- "define acceptance criteria"
- "scope this change" / "make this testable"
- "de-risk this before we build it"
- "prepare implementation requirements for another agent"

Do not trigger for trivial edits, one-line fixes, active debugging, code review, or requests whose acceptance conditions are already clear.

## What happens

1. **Inspect and scope.** Read the repo, docs, schemas, and tests for technical facts before asking. Capture product or business constraints only from the user or a product artifact, never inferred from code.
2. **Choose depth.** Quick Capture (3-7 criteria, low or moderate risk) or Full Acceptance Brief (security, data, migration, cross-system, or handoff).
3. **Write criteria.** Each `AC-NNN` names a scenario, a trigger, an expected observable result, a prohibited side effect when meaningful, a verification method, and a priority. No vague words without defined evidence.
4. **Proceed or hand off.** Record the criteria and continue for a clear request; present blockers and wait when a change is risky. If a criterion cannot be met mid-build, mark it `[revised]`, increment the revision, and re-present only the changed criteria.

## Skill file

Full behavior is defined in [`skills/intent-driven-development.md`](../skills/intent-driven-development.md).

## Pairs with

- `/grill-me`: grill-me clarifies a fuzzy input; this skill turns the agreed intent into verifiable criteria.
- `/roast`: roast validates the idea, then scope the survivor into acceptance criteria.
