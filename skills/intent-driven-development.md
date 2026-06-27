---
name: intent-driven-development
tier: "2"
description: "Enforces Law 2 (Plan Is Sacred) of the 7 Laws of AI Agent Discipline. Turn an ambiguous or high-impact change into scoped, verifiable acceptance criteria (observable AC-NNN, explicit in/out scope, named verification methods, and a [revised] protocol that forbids silently dropping a criterion) before or alongside implementation, so the plan that gets built is the plan that was agreed, not an invented default. Use when clarifying a feature, defining acceptance criteria, de-risking a security/data/migration/integration change, or preparing implementation requirements for another agent. Do not trigger for trivial edits, straightforward fixes, active debugging, or code review."
origin: continuous-improvement
user-invocable: true
argument-hint: "[the change to scope into acceptance criteria]"
---

# /intent-driven-development: scope the change before you build it

Law 2 says the plan is sacred: once a goal and its acceptance conditions are agreed, you do not silently drift from them. The cheapest way to honor that is to make the plan verifiable in the first place. A goal phrased as "make export work" cannot be held sacred because nobody can tell when it is met. This skill converts an ambiguous or high-impact request into observable acceptance criteria (`AC-001`, `AC-002`, ...) with named verification methods, so "done" is a fact two people would agree on, and a criterion can never be quietly dropped mid-build.

It produces useful criteria without turning specification into ceremony: inspect available context first, expose only genuine ambiguity, and choose verification that fits the work and its risk.

## When to activate

- The user asks to clarify a feature, define acceptance criteria, or de-risk a change before implementation.
- The request touches security, authentication, persistent data, migrations, external APIs, or compliance.
- The user wants a handoff artifact another agent or team can implement without inventing requirements.
- The request is ambiguous enough that the expected outcome is not yet observable or testable.
- The user types `/intent-driven-development`, "define acceptance criteria", "scope this change", or "make this testable".

Do not activate for trivial edits, one-line fixes, active debugging, code review, or implementation requests whose acceptance conditions are already clear.

## How it works

1. **Inspect context first.** Read the repository, docs, schemas, and test infrastructure for technical facts before asking any question. Treat product and business constraints as something only the user or a product artifact can supply.
2. **Choose depth.** Quick Capture (3-7 criteria, low or moderate risk) or Full Acceptance Brief (security, data, migration, cross-system, or handoff).
3. **Ask minimally.** Only ask questions whose answers cannot be inferred and that materially change scope or behavior. Group related questions into one batch.
4. Write observable criteria. Each AC-NNN names a scenario, a trigger, an expected observable result, a prohibited side effect when meaningful, a verification method, and a priority. Do not use "correctly" or "securely" without defined evidence.
5. **Proceed or hand off.** For a clear request with no blocking risk, record the criteria and continue. For a risky change, present the blockers and wait for confirmation.
6. **Hold the plan sacred.** If a criterion cannot be met due to a constraint found mid-build, do not silently drop or work around it. Mark it `[revised]`, state the constraint, adjust scope or verification, increment the revision number, and re-present only the changed criteria before continuing.

## Operating rules

1. Inspect available repository, docs, issue, design, and test context before asking for technical facts that can be discovered locally.
2. Do not infer product or business constraints from code. Business rules, compliance obligations, contractual SLAs, pricing, data-retention policy, prioritization, and target users cannot be read from a repository. Record them as assumptions flagged for confirmation, never as discovered facts. The repository tells you how the system behaves today, not what the business requires it to do.
3. Ask only questions whose answers are required and cannot be safely inferred.
4. Do not block implementation by default. When the user has asked to implement a sufficiently clear change, record key assumptions and criteria briefly, then proceed or hand them to the implementation workflow.
5. Require explicit confirmation before proceeding only when an unresolved decision could create material security exposure, data loss, irreversible migration, contractual or API breakage, meaningful cost, or destructive external action.
6. Do not write an acceptance document into a repository, alter project files, create a branch, commit, or invoke another skill unless the user requests it or the active workflow requires it.
7. Treat automated tests as evidence, not truth. Prefer automation when reliable and proportionate; allow manual UX, accessibility, security, legal, or operational verification where automation cannot establish the outcome.
8. Never include real secrets, credentials, tokens, private keys, personal data, or production payloads in criteria, fixtures, examples, or saved artifacts. Use redacted or synthetic values.
9. Do not run destructive tests, migrations, security probes, load tests, paid external calls, or operations against production data without explicit authorization and an identified safe environment.
10. When a criterion cannot be satisfied due to a constraint discovered during implementation, update it (`[revised]`, state the constraint, adjust scope or verification), increment the revision, and re-present only the changed criteria. Require confirmation only if the revision changes a blocking decision or reduces a safety or correctness guarantee.

## Choose the depth

Use the smallest useful output.

### Quick Capture

For a clear but non-trivial change with low or moderate risk. Produce: Goal; In scope and out of scope; Assumptions; 3-7 acceptance criteria with verification methods; blocking questions if any. Do not delay implementation for approval unless a blocking risk exists or the user asked for a spec first.

### Full Acceptance Brief

For ambiguous, cross-system, security-sensitive, data-changing, migration, compliance, or high-cost changes, or when the user wants a handoff artifact. Produce the full template below and request confirmation for unresolved blocking decisions before risky implementation.

### Existing specification review

When the user already supplied a PRD, issue, plan, or criteria: review it instead of restarting discovery. Identify missing scope boundaries, unsafe assumptions, contradictions, and unverifiable requirements. Return corrected or supplemental criteria.

## Write acceptance criteria

Use `AC-001`, `AC-002`, and so on. Criteria and tests need not map one-to-one. For each applicable criterion include: scenario or starting condition; action or trigger; expected observable behavior; prohibited side effect when meaningful; verification method (automated test, integration check, manual UX review, accessibility check, security review, operational check, or stakeholder acceptance); environment or safety constraint when verification could affect data, services, cost, or secrets; priority (Required, Important, or Optional).

Do not use "correctly", "securely", "fast", "intuitive", or "robust" without defining observable evidence or recording them as a human-review judgment.

Cover only the boundaries that apply:

| Category | Include when | Typical evidence |
| --- | --- | --- |
| Happy path | New or changed user-visible behavior | Successful workflow or state transition |
| Validation | The change accepts input | Malformed or boundary value rejected without mutation |
| Authorization/privacy | Data or actions have access boundaries | Denied access and no sensitive disclosure |
| Persistence/migration | Stored data or schemas change | Backward read, migration, rollback, or backup behavior |
| Compatibility | Public APIs, files, events, or clients may break | Existing contract or fixture stays valid |
| Failure recovery | Network, service, or async failure exists | No partial state, or clear retry and degraded behavior |
| Idempotency/concurrency | Repeats or simultaneous writes are plausible | No duplicate side effect or invalid final state |
| Performance | A user or service threshold matters | Defined measurement conditions and threshold |
| UX/accessibility | A person interacts with the result | Keyboard, feedback, error recovery, visual or manual review |

## Output template (Full Acceptance Brief)

Omit irrelevant sections for Quick Capture.

```markdown
# Acceptance Brief: <Change Name>

**Status:** Draft | Approved | Implemented | Verified
**Revision:** <number>
**Prepared for:** <user/team/agent, when known>

## Goal
<One observable outcome sentence.>

## Scope
**In scope:** <behavior included>
**Out of scope:** <adjacent work excluded>

## Context
**Discovered facts** (technical, verified from repository or artifact)
**Product/business constraints** (supplied by user or artifact, never inferred from code, or "none supplied yet")
**Assumptions** (unverified claims to confirm)
**Dependencies and constraints**

## Risk Review
| Risk area | Applies? | Required handling |
| --- | --- | --- |
| Security/privacy | Yes/No | <redaction, authorization, review> |
| Persistent data/migration | Yes/No | <compatibility, backup, rollback> |
| External effects/cost | Yes/No | <sandbox, test environment, authorization> |
| Compatibility/API | Yes/No | <contract to preserve or version> |
| UX/accessibility | Yes/No | <manual or automated evidence> |

## Acceptance Criteria
### AC-001: <observable behavior>
- **Scenario:** <starting condition>
- **Action:** <single trigger>
- **Expected:** <observable result>
- **Must not:** <prohibited side effect, if applicable>
- **Verification:** <method and intended evidence>
- **Environment/safety:** <constraints, if applicable>
- **Priority:** Required | Important | Optional

## Blocking Decisions
- [ ] <only decisions that prevent safe or correct progress>

## Verification Plan
| Criterion | Verification evidence | Status |
| --- | --- | --- |
| AC-001 | <test, check, or review command or evidence type> | Pending |
```

## Pass/fail rubric

A brief passes only if every answer is "yes". Any "no" means revise before returning it.

- [ ] Does every required criterion have a scenario, an observable expected result, and a named verification method?
- [ ] Are vague terms ("correctly", "secure", "fast", "robust") either replaced with observable evidence or marked as human judgment?
- [ ] Are product and business constraints listed as supplied or assumed, with none silently inferred from code?
- [ ] Is scope explicit, with out-of-scope items named?
- [ ] Are blocking decisions limited to choices that actually affect safety or correctness, not preferences?

A failing criterion: `AC-001: The export works correctly and is secure.` (no scenario, no observable result, no verification, "correctly" and "secure" undefined). A passing one names the scenario, the expected result, the prohibited side effect, and the verification method, so two people would agree it was met.

## How it fits the 7 Laws

| Law | Role of this skill |
|---|---|
| Law 2 (Plan Is Sacred) | The acceptance brief **is** the sacred plan: observable criteria, explicit scope, and a `[revised]` protocol that forbids silently dropping or working around a criterion mid-build. |
| Law 1 (Research Before Executing) | Rule 1 inspects repo, docs, schemas, and tests for technical facts before asking, and refuses to infer business rules from code. |
| Law 4 (Verify Before Reporting) | Every criterion carries a named verification method and a pass/fail rubric, so "done" is falsifiable rather than asserted. |

## Pairs with

- [`grill-me`](./grill-me.md): interviews a fuzzy request to a shippable spec. Reach for `grill-me` when the input is unclear, then this skill to turn the agreed intent into verifiable criteria.
- [`roast`](./roast.md): validates whether the idea should exist at all. Roast first, then scope the survivor into acceptance criteria.
- [`goal-monitor`](./goal-monitor.md): the runtime drift gate. The `## Goal` and criteria this skill produces are what goal-monitor scores a session against.
- [`verification-loop`](./verification-loop.md): runs the per-project verify ladder. The criteria's verification methods feed its evidence step.
