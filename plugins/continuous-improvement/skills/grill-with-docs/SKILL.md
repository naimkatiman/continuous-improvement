---
name: grill-with-docs
tier: "2"
description: Enforces Law 1 (Research Before Executing) and Law 7 (Learn From Every Session) of the 7 Laws of AI Agent Discipline. Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates CONTEXT.md + ADRs inline as decisions crystallise. Ported from mattpocock/skills under MIT.
origin: https://github.com/mattpocock/skills
---

# /grill-with-docs — Grill the plan AND update the docs as decisions land

Ported in behavior from [mattpocock/skills `engineering/grill-with-docs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md) (MIT, © 2026 Matt Pocock). Cold-storage snapshot of the three upstream files (`SKILL.md`, `CONTEXT-FORMAT.md`, `ADR-FORMAT.md`) at [`third-party/mattpocock-skills/skills/engineering/grill-with-docs/`](../third-party/mattpocock-skills/skills/engineering/grill-with-docs/); SHA pin in [`third-party/MANIFEST.md`](../third-party/MANIFEST.md).

The two format specs (CONTEXT.md format, ADR format) are inlined as appendices in this file so the bundled skill is self-contained — see [Appendix A: CONTEXT.md format](#appendix-a-contextmd-format) and [Appendix B: ADR format](#appendix-b-adr-format).

## What this skill does

<what-to-do>

Interview the user relentlessly about every aspect of this plan until shared understanding is reached. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide a recommended answer.

Ask questions one at a time, waiting for feedback on each before continuing.

If a question can be answered by exploring the codebase, explore the codebase instead.

</what-to-do>

## Domain awareness

During codebase exploration, also look for existing documentation:

### File structure

Most repos have a single context:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/adr/
```

Create files lazily — only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md` right there. Don't batch these up — capture them as they happen. Use the format in [Appendix A](#appendix-a-contextmd-format).

Don't couple `CONTEXT.md` to implementation details. Only include terms that are meaningful to domain experts.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [Appendix B](#appendix-b-adr-format).

## How it fits the 7 Laws

| Law | Role of this skill |
|---|---|
| Law 1 (Research Before Executing) | Pre-execution interrogation + codebase exploration close the alignment gap before any tool call. |
| Law 2 (Plan Is Sacred) | The interview produces a plan grounded in domain language, not invented defaults. |
| Law 7 (Learn From Every Session) | CONTEXT.md updates persist resolved jargon across sessions; ADRs persist decisions across years. |

## How it differs from `grill-me`

| Skill | Focus |
|---|---|
| [`grill-me`](./grill-me.md) | Conversation-only grilling. No artifact. Use when there is no project to update or the project has no docs convention yet. |
| `grill-with-docs` | Grilling that **updates `CONTEXT.md` and `docs/adr/` inline as decisions land**. Use once the project has, or is willing to start, a shared-language doc. |

If a repo has no CONTEXT.md and the conversation is exploratory, start with `grill-me`. Once the user commits to a direction, switch to `grill-with-docs` to capture terminology and decisions as they crystallise.

## Companion / alternative skills

- [`grill-me`](./grill-me.md) — same interview discipline, no doc artifact.
- [`handoff`](./handoff.md) — end-of-session compaction; pairs with grill-with-docs (grill to align, handoff to compact).
- [`workspace-surface-audit`](./workspace-surface-audit.md) — inventory of available tooling; complementary to the domain-language interview.
- [`gateguard`](./gateguard.md) — tool-boundary gate that fires after alignment is reached.

## Attribution

This skill is a port of [mattpocock/skills `engineering/grill-with-docs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md) (with bundled `CONTEXT-FORMAT.md` and `ADR-FORMAT.md` inlined as appendices). MIT-licensed upstream, MIT-licensed here. See [`third-party/mattpocock-skills/LICENSE`](../third-party/mattpocock-skills/LICENSE) for the verbatim license and [`third-party/mattpocock-skills/OUR_NOTES.md`](../third-party/mattpocock-skills/OUR_NOTES.md) for the vendoring rationale and drift radar.

---

## Appendix A: CONTEXT.md format

### Structure

```md
# {Context Name}

{One or two sentence description of what this context is and why it exists.}

## Language

**Order**:
{A concise description of the term}
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request

**Customer**:
A person or organization that places orders.
_Avoid_: Client, buyer, account

## Relationships

- An **Order** produces one or more **Invoices**
- An **Invoice** belongs to exactly one **Customer**

## Example dialogue

> **Dev:** "When a **Customer** places an **Order**, do we create the **Invoice** immediately?"
> **Domain expert:** "No — an **Invoice** is only generated once a **Fulfillment** is confirmed."

## Flagged ambiguities

- "account" was used to mean both **Customer** and **User** — resolved: these are distinct concepts.
```

### Rules

- **Be opinionated.** When multiple words exist for the same concept, pick the best one and list the others as aliases to avoid.
- **Flag conflicts explicitly.** If a term is used ambiguously, call it out in "Flagged ambiguities" with a clear resolution.
- **Keep definitions tight.** One sentence max. Define what it IS, not what it does.
- **Show relationships.** Use bold term names and express cardinality where obvious.
- **Only include terms specific to this project's context.** General programming concepts (timeouts, error types, utility patterns) don't belong even if the project uses them extensively. Before adding a term, ask: is this a concept unique to this context, or a general programming concept? Only the former belongs.
- **Group terms under subheadings** when natural clusters emerge. If all terms belong to a single cohesive area, a flat list is fine.
- **Write an example dialogue.** A conversation between a dev and a domain expert that demonstrates how the terms interact naturally and clarifies boundaries between related concepts.

### Single vs multi-context repos

**Single context (most repos):** One `CONTEXT.md` at the repo root.

**Multiple contexts:** A `CONTEXT-MAP.md` at the repo root lists the contexts, where they live, and how they relate to each other:

```md
# Context Map

## Contexts

- [Ordering](./src/ordering/CONTEXT.md) — receives and tracks customer orders
- [Billing](./src/billing/CONTEXT.md) — generates invoices and processes payments
- [Fulfillment](./src/fulfillment/CONTEXT.md) — manages warehouse picking and shipping

## Relationships

- **Ordering → Fulfillment**: Ordering emits `OrderPlaced` events; Fulfillment consumes them to start picking
- **Fulfillment → Billing**: Fulfillment emits `ShipmentDispatched` events; Billing consumes them to generate invoices
- **Ordering ↔ Billing**: Shared types for `CustomerId` and `Money`
```

The skill infers which structure applies:

- If `CONTEXT-MAP.md` exists, read it to find contexts
- If only a root `CONTEXT.md` exists, single context
- If neither exists, create a root `CONTEXT.md` lazily when the first term is resolved

When multiple contexts exist, infer which one the current topic relates to. If unclear, ask.

---

## Appendix B: ADR format

ADRs live in `docs/adr/` and use sequential numbering: `0001-slug.md`, `0002-slug.md`, etc.

Create the `docs/adr/` directory lazily — only when the first ADR is needed.

### Template

```md
# {Short title of the decision}

{1-3 sentences: what's the context, what did we decide, and why.}
```

That's it. An ADR can be a single paragraph. The value is in recording *that* a decision was made and *why* — not in filling out sections.

### Optional sections

Only include these when they add genuine value. Most ADRs won't need them.

- **Status** frontmatter (`proposed | accepted | deprecated | superseded by ADR-NNNN`) — useful when decisions are revisited
- **Considered Options** — only when the rejected alternatives are worth remembering
- **Consequences** — only when non-obvious downstream effects need to be called out

### Numbering

Scan `docs/adr/` for the highest existing number and increment by one.

### When to offer an ADR

All three of these must be true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will look at the code and wonder "why on earth did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If a decision is easy to reverse, skip it — you'll just reverse it. If it's not surprising, nobody will wonder why. If there was no real alternative, there's nothing to record beyond "we did the obvious thing."

#### What qualifies

- **Architectural shape.** "We're using a monorepo." "The write model is event-sourced, the read model is projected into Postgres."
- **Integration patterns between contexts.** "Ordering and Billing communicate via domain events, not synchronous HTTP."
- **Technology choices that carry lock-in.** Database, message bus, auth provider, deployment target. Not every library — just the ones that would take a quarter to swap out.
- **Boundary and scope decisions.** "Customer data is owned by the Customer context; other contexts reference it by ID only." The explicit no-s are as valuable as the yes-s.
- **Deliberate deviations from the obvious path.** "We're using manual SQL instead of an ORM because X." Anything where a reasonable reader would assume the opposite. These stop the next engineer from "fixing" something that was deliberate.
- **Constraints not visible in the code.** "We can't use AWS because of compliance requirements." "Response times must be under 200ms because of the partner API contract."
- **Rejected alternatives when the rejection is non-obvious.** If you considered GraphQL and picked REST for subtle reasons, record it — otherwise someone will suggest GraphQL again in six months.
