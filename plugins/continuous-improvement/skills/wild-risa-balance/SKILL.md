---
name: wild-risa-balance
tier: "2"
description: Enforces Law 2 (Plan Is Sacred) of the 7 Laws of AI Agent Discipline. Decision-framing lens that pairs WILD generation with RISA execution when emitting recommendation lists. Not a runtime hook.
origin: continuous-improvement
user-invocable: false
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

### The "no" escape valve (both tiers)

If neither tier can produce a real recommendation — every candidate item would be padding, or you cannot reach the tier's floor (3 for beginner, 7 for expert) without inventing busywork — write `Recommendation: no` and stop. This applies to **both tiers equally**.

`no` is not absence. It is an explicit signal that the current session or perspective is exhausted on this surface and the operator should switch context: a fresh session (cold prompt cache, no carryover bias), a different specialist agent (different perspective on the same problem), a different framing (re-scoping the goal), or sleep on it. Padding to hit the floor is the failure mode this escape exists to prevent — a flat 3-item beginner list of "review the README, run the tests, commit your changes" is worse than `Recommendation: no` because it disguises an empty thought as work.

When `no` ships, the Phase 7 close header still carries the tier suffix (`## Recommendation (expert)` or `## Recommendation (beginner)`) so the audit trail records which tier exhausted itself, and the body is just the literal `no` on its own line. No tiered tables, no WILD/RISA blocks, no "Want me to: A or B?" closer.

## Proactive Roadmap Surfacing (surface, do not execute)

A "wait for instructions" agent fails by silence — sitting on a known next step (visible roadmap, deferred item from a prior session) until told. A "proactive" agent fails by running that step without being asked. Both lose. Surface bridges them: raise the next step as a recommendation item, never as a fait accompli.

### Trigger conditions

Surface a next step when any of these are true:

- A persistent roadmap names an undone step — MemoryCore `current-session.md`, `docs/plans/*`, `⚠️ Deferred` entries in a project `CLAUDE.md`, or pending operator actions logged in MemoryCore.
- The current task is finished and a stated session goal implies the next one.
- The session has drifted from a stated roadmap (asked to do A, but B is now blocked by A's choice).
- An instinct or memory record predicts a near-term action the operator typically forgets (e.g., "rotate keys before next deploy", "push branch after N commits").

### Hard boundary — surface, do not execute

Surfacing emits the next step as a recommendation item. It does **not** mean running the command, editing the file, or shipping the change. Execution still requires explicit "proceed", "go", "run it", or equivalent. The boundary is non-negotiable:

- Global CLAUDE.md: "If instructions conflict or information is missing, stop and ask."
- Auto Mode: even in autonomous execution, "anything that deletes data or modifies shared or production systems still needs explicit user confirmation."
- Trust is asymmetric — one unauthorized "helpful" action costs more than a hundred missed surfacings. Recovery is one-way.

### Format

A surfaced item lives inside the normal RISA block. Mark it inline as `(surfaced — <source>)` so the operator can tell which items came from the roadmap vs. the current request:

```
RISA baseline — ship regardless (5 of ≥5)
1. Run remote D1 migration before next deploy → unblocks Close/Cancel admin button. (surfaced — pending operator action since 2026-05-04)
2. ...
```

A WILD-tier reframe of the roadmap itself (not a single deferred step, but a re-shape of the whole next phase) goes in the WILD block instead, with the same `(surfaced — <source>)` marker.

### Anti-patterns

- Re-surfacing an item the operator explicitly deferred — once is a reminder, three times is nagging. After one repeat, log the defer reason to memory and stop.
- Surfacing speculative steps with no source in any roadmap or memory ("you should also consider…" without a citation).
- Bundling a surface with execution ("I went ahead and started X"). Surface, wait, execute on go.
- Treating absence of a roadmap as license to invent one — if no roadmap exists and none was requested, ask before drafting.

The point: the operator never has to remember a deferred item, and never has to forgive an unauthorized one. Both at once.

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
5. Update the README mirror so the bundled plugin matches the source skill. (surfaced — verify:skill-mirror gate flagged drift in last CI run)
```

Total: 7 items (2 WILD + 5 RISA). That is the floor — emit more on either side if the surface warrants it. The fifth RISA item is marked `(surfaced — <source>)` to demonstrate the convention from the Proactive Roadmap Surfacing section: items lifted from a roadmap or memory carry an inline source attribution so the operator can tell roadmap-driven items apart from current-request items.

## Related

- `continuous-improvement` — the 7 Laws card (core skill)
- `proceed-with-the-recommendation` — execution arm; carries surfaced items across the surface → execute boundary defined in the Proactive Roadmap Surfacing section above
- `superpowers:brainstorming` — upstream WILD generator
- `verification-loop` — downstream RISA verifier
