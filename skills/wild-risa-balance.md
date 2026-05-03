---
name: wild-risa-balance
tier: "2"
description: Enforces Law 2 (Plan Is Sacred) of the 7 Laws of AI Agent Discipline. Decision-framing lens that pairs WILD generation with RISA execution when emitting recommendation lists. Not a runtime hook.
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

When this skill is in play, every recommendation block ships **at least 7 items**, split as:

1. **Top block — WILD pilots: exactly 2 bold items.** Present both; the operator picks at most one to actually run. If you cannot find a second genuinely bold option, stretch — do not pad with a safe item dressed up as wild.
2. **Bottom block — RISA baseline: at least 5 safe items.** These ship now regardless of the WILD bet. If you cannot reach 5, the surface is under-explored — expand scope before emitting the list.
3. Within each block, rank descending by impact.
4. Once the list is composed, wait for the operator's "proceed" signal before invoking `proceed-with-the-recommendation`. Never auto-trigger it. This skill only changes how the list is composed.

Total floor: **2 WILD + 5 RISA = 7 items minimum.** Going above is fine; going below means the skill was not applied.

The point: the operator gets a real WILD/RISA contrast (2 bold bets weighed against a 5-deep trusted baseline), not a flat list where the bold option silently competes with safe ones and loses by default.

## Audience Tiers (beginner vs expert)

Recommendation blocks ship in **two tiers** depending on the operator's signaled level. The 2 WILD + ≥5 RISA floor described above is the **expert** tier. Beginners get a different, lighter shape. The point: under-load for experts and overload for beginners are both failure modes — splitting the format prevents both.

### Tier selection

**Default = expert.** Switch to beginner only when one of these triggers fires:

- **Explicit flag** — the operator types `/beginner` or refers to themselves as a beginner ("for beginner", "as a beginner", "I'm new to this").
- **Explicit lite framing** — "simple list", "just the top 3", "small list", "short version", "no need for surgical".
- **Auto-detect heuristic** — the **first message of the thread** contains any of: `beginner`, `new to (this|claude|the system)`, `simple`, `explain like`, `first time`, `i'm just starting`, `i'm learning`. Single-message false positives are acceptable — the operator flips with `/expert` if mismatched.

The operator can override mid-thread: `/expert` switches back to WILD+RISA, `/beginner` switches back to the lite tier. Apply the most recently named tier.

### Beginner tier (lite shape)

When in beginner tier:

- **3 minimum, 5 maximum** items. No padding past 5. Below 3 means there is no recommendation — write `Recommendation: no`.
- **Goal-driven** — each item names the outcome, not the mechanism. Format: `<verb> <thing> → <observable result>`.
- **Execution-first** — each item is a concrete next action, not a tradeoff to weigh.
- **One-shot, iterate from there** — no "surgical change" framing, no phased sequencing, no commit-size gates. Get to a working pass, then improve.
- **Optimized for the latest Opus model (Opus 4.7 at time of writing)** — assume the model holds the full task in one shot. Do not pre-decompose into micro-steps that fight the model's reasoning depth. Lean on broader, outcome-shaped instructions over fine-grained scripts.
- Order: descending impact.
- No WILD/RISA labels. No counts annotation. No tiered tables.

### Expert tier (default for Naim, default in this repo)

The full WILD+RISA structure documented above: ≥7 items, exactly 2 WILD + ≥5 RISA, WILD on top descending, RISA below descending, counts annotated inline.

Each item still leads with the outcome inside both WILD and RISA: `<verb> <thing> → <observable result>`.

### Tier signal in the 3-section close

When Phase 7's three-section close lands, the `## Recommendation` header carries an explicit tier suffix:

- Expert: `## Recommendation (expert)`
- Beginner: `## Recommendation (beginner)`

The Stop hook regex (`^#+ +Recommendation(?:\s|$)`) already accepts both forms — the suffix is documentation, not a gate. The point is a self-describing audit trail: a future reader (or an instinct scan) can tell which tier was applied without re-deriving it from item count or label presence.

## Integration with the 7 Laws

| Mode | Reinforces                                              | Tempered by              |
|------|---------------------------------------------------------|--------------------------|
| RISA | Law 2 (Plan), Law 3 (One Thing), Law 4 (Verify)         | Law 6 (Iterate One Thing) |
| WILD | Law 1 (Research — broader exploration), Law 5 (Reflect) | Law 6 (Iterate One Thing) |

Both modes pass through Law 6 before execution. WILD without Law 6 is a wishlist. RISA without Law 6 ships safe fixes while the real bottleneck waits.

## Example

```
Recommendations (descending impact within each block)

WILD pilots — pick at most one (2 of 2)
1. Replace the current review workflow with a single adversarial pair.
2. Drop the staging environment in favor of feature-flagged production.

RISA baseline — ship regardless (5 of ≥5)
1. Add the missing test for the failure path noted in verification.
2. Rename the ambiguous flag to match its actual behavior.
3. Backfill the type on the public export that currently widens to `any`.
4. Wire the existing Stop hook into the new skill's checklist gate.
5. Update the README mirror so the bundled plugin matches the source skill.
```

Total: 7 items (2 WILD + 5 RISA). That is the floor — emit more on either side if the surface warrants it.

## Related

- `continuous-improvement` — the 7 Laws card (core skill)
- `proceed-with-the-recommendation` — execution arm
- `superpowers:brainstorming` — upstream WILD generator
- `verification-loop` — downstream RISA verifier
