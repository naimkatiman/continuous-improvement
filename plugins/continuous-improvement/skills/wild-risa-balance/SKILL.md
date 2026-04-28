---
name: wild-risa-balance
tier: "2"
description: Decision-framing lens that pairs WILD generation with RISA execution when emitting recommendation lists. Not a runtime hook.
origin: continuous-improvement
---

# WILD / RISA Balance

## When to Use

- Emitting a multi-item recommendation block (≥3 items)
- Choosing between a safe option and a bold option
- Reviewing your own plan for over-cautiousness or over-fantasy
- Pairing with `proceed-with-the-recommendation` to decide which items belong above and below the cut

## The Two Modes

### RISA (Execution)

- **R**ealistic — fits the constraints in front of you
- **I**mportant — moves a stated goal, not a vanity metric
- **S**pecific — names files, commands, or owners
- **A**greeable — the operator can approve it without a meeting

If you only stay in RISA, you ship safe, average results.

### WILD (Creation)

- **W**ild — breaks the default frame
- **I**maginative — invents an option that did not exist a minute ago
- **L**imitless — ignores current budget, headcount, or stack
- **D**isruptive — replaces a workflow rather than tuning it

If you only stay in WILD, you generate cool ideas that never ship.

## The Trap

RISA alone produces a backlog of incremental fixes that never compound. WILD alone produces a graveyard of demos that never reach production. The bigger failure is unconscious switching: drifting into WILD during execution, or drifting into RISA during brainstorming, without naming the switch. Name the mode you are in before you write the next line.

## Switching Deliberately

| Phase                   | Mode  | Why                                                |
|-------------------------|-------|----------------------------------------------------|
| Brainstorm              | WILD  | Quantity and range beat early filtering            |
| Roadmap framing         | WILD  | Frame the bigger bet before scoping it down        |
| Per-item recommendation | Mixed | Top items can be WILD, baseline items must be RISA |
| Per-item execution      | RISA  | One thing, verified, shipped                       |
| Verification            | RISA  | Reality check, no new invention                    |
| Reflection              | WILD  | Counterfactuals, "what would have been bolder"     |

WILD owns generation phases. RISA owns execution phases. The switch is intentional, not accidental.

## How to Apply in a Recommendation List

When emitting ≥3 recommendations, split them:

1. **Top block — WILD pilots.** 1–2 bold items. Present every item; the operator picks at most one to actually run.
2. **Bottom block — RISA baseline.** The safe items that ship now regardless of the WILD bet.
3. Within each block, rank descending by impact.
4. Once the list is composed, wait for the operator's "proceed" signal before invoking `proceed-with-the-recommendation`. Never auto-trigger it. This skill only changes how the list is composed.

The point: the operator gets one bold option to weigh against a baseline they already trust, instead of a flat list where the bold option silently competes with safe ones and loses by default.

## Integration with the 7 Laws

| Mode | Reinforces                                              | Tempered by              |
|------|---------------------------------------------------------|--------------------------|
| RISA | Law 2 (Plan), Law 3 (One Thing), Law 4 (Verify)         | Law 6 (Iterate One Thing) |
| WILD | Law 1 (Research — broader exploration), Law 5 (Reflect) | Law 6 (Iterate One Thing) |

Both modes pass through Law 6 before execution. WILD without Law 6 is a wishlist. RISA without Law 6 ships safe fixes while the real bottleneck waits.

## Example

```
Recommendations (descending impact within each block)

WILD pilots — pick at most one
1. Replace the current review workflow with a single adversarial pair.
2. Drop the staging environment in favor of feature-flagged production.

RISA baseline — ship regardless
1. Add the missing test for the failure path noted in verification.
2. Rename the ambiguous flag to match its actual behavior.
```

## Related

- `continuous-improvement` — the 7 Laws card (core skill)
- `proceed-with-the-recommendation` — execution arm
- `superpowers:brainstorming` — upstream WILD generator
- `verification-loop` — downstream RISA verifier
