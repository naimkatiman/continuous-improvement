---
name: roast
tier: "2"
description: Enforces Law 1 (Research Before Executing) of the 7 Laws of AI Agent Discipline. Convene a 5-persona adversarial council (Contrarian, Expansionist, Logician, Researcher, Buyer) that attacks an idea from every angle, then a Judge returns one GO / RESHAPE / KILL verdict plus the cheapest 48-hour test to de-risk it — so you pressure-test an idea before sinking time into building the wrong thing.
origin: continuous-improvement
user-invocable: true
argument-hint: "[the idea to roast]"
---

# /roast — Convene the council before you build

Claude's default is to agree with you. `/roast` is the opposite. Law 1 says research before executing — and the cheapest, most-skipped research is an honest adversarial read of the idea *itself* before any plan or code exists. This skill convenes a council of five independent persona agents who tear an idea apart and build it up from every angle, then a Judge synthesizes everything into one decisive verdict.

The council is adversarial on purpose. No persona is allowed to hedge or be polite. The point is to surface what you can't see because you're too close to it — and to do it in an hour, not after a month of building.

Adapted from the community `/roast` idea-council pattern and reshaped as a continuous-improvement-native Law 1 skill.

## When to activate

- Before you sink time or money into building something — a product, a feature, a business, a bet.
- When you catch yourself (or the agent) agreeing with a plan that has never been attacked.
- The user types `/roast`, "roast this idea", "convene the council", "pressure-test this", "stress-test this idea", "validate this business idea", or "give me a brutal second opinion".
- A `/proceed-with-the-recommendation` walk is about to start but the *premise* underneath the recommendation list was never challenged.

## Step 1: Get the brief

If `$ARGUMENTS` contains the idea, start there. Then ask a tight set of clarifying questions so the council judges something real. Ask only what hasn't already been provided — 3-4 questions max, in **one batch**:

1. **The idea** in one or two sentences (what it is, what it does).
2. **Who it's for** and **how it makes money** (the buyer + the price/model).
3. **Your edge** — relevant skills, audience, or assets you already have.
4. **Constraints** — budget, timeline, how fast you need the first dollar.

If the user says "just run it" or has already given you enough, skip the questions and proceed. Don't over-interrogate — one round, then convene.

Write the brief into a single short paragraph you will paste verbatim into every council member's prompt, so all five judge the same thing.

## Step 2: Convene the council (5 agents, in parallel)

Spin up **all five agents in parallel in a single message** — one subagent each (`general-purpose`). Paste the same brief into each, then give it its persona mandate below.

Each council member must return: a one-line stance, their 3-5 sharpest points, the single most important thing the user must hear, and a 1-10 score on their own dimension (1 = walk away, 10 = no-brainer).

**1. The Contrarian (Red Team)**
> You are the Contrarian on an idea council. Assume this idea fails. Find the fatal flaws, the fastest way it dies, and the load-bearing assumptions that are probably wrong. Be ruthless and specific. No hedging, no "but it could work." Attack the weakest points. THE BRIEF: [brief]

**2. The Expansionist (Bull)**
> You are the Expansionist on an idea council. Make the strongest possible case FOR this idea. Find the biggest upside, the 10x version, the adjacent opportunities and unlock points the founder isn't seeing. Fight for the potential. Be specific about where the real money and leverage could be. THE BRIEF: [brief]

**3. The Logician (First principles)**
> You are the Logician on an idea council. Use NO outside research and NO web. Reason purely from first principles: does the core mechanism make sense, do the incentives line up, is the underlying logic sound, does the math even work in theory? Strip it to fundamentals and tell us if it holds together. THE BRIEF: [brief]

**4. The Researcher (Evidence)**
> You are the Researcher on an idea council. Use web search. Bring real-world evidence: who the existing competitors are, market size or demand signals, what comparable products charge, whether this is validated by what's already out there or contradicted by it. Cite what you find. Is the real world saying yes or no? THE BRIEF: [brief]

**5. The Buyer (Voice of customer)**
> You are the Buyer on an idea council. Role-play the exact target customer described in the brief. React as them, in first person. Would you actually pay for this? What's your real objection? What would make you choose a competitor or just do nothing instead? What price feels right, and what would make you say yes today? Be the honest, slightly skeptical customer, not a cheerleader. THE BRIEF: [brief]

## Step 3: The Judge delivers the verdict

Once all five return, YOU act as the Judge. Read every council member's findings, weigh them, and synthesize one decisive verdict. Do not average the scores. Name the real tension between the personas and resolve it.

Fold in the **economics lens** yourself: rough pricing, realistic time-to-first-dollar, and whether the user can actually ship this fast given the edge they described.

Output the verdict in this exact shape:

```
## THE VERDICT: GO / RESHAPE / KILL
Confidence: [low / medium / high]

**The call in one line:** [the decision, plainly]

**Why:** [2-3 sentences resolving the council's tension]

**Biggest risk:** [the single thing most likely to kill it]
**Biggest upside:** [the strongest reason to do it]

**Money read:** [rough price, time-to-first-dollar, can they ship fast]

**The cheapest 48-hour test:** [the smallest, fastest thing they can do
to validate the riskiest assumption BEFORE building anything]

**If RESHAPE:** [the specific pivot that fixes the fatal flaw while keeping the upside]
```

Then list the five council scores in one line: `Contrarian X/10 · Expansionist X/10 · Logician X/10 · Researcher X/10 · Buyer X/10`.

## Rules

- Every persona stays in character. None of them hedges or softens. The value is in the friction.
- The Judge must make an actual call. "It depends" is not a verdict. Pick GO, RESHAPE, or KILL and own it.
- The cheapest 48-hour test is the most important output. It's how the user finds out if they're right without building the whole thing.
- Keep the final verdict skimmable. The council does the depth; the Judge does the decision.

## How it fits the 7 Laws

| Law | Role of this skill |
|---|---|
| Law 1 (Research Before Executing) | The council **is** the research — five independent investigations of an idea's viability before a single line of code is written. |
| Law 2 (Plan Is Sacred) | The verdict's RESHAPE pivot and cheapest-test become the plan's first checkpoint instead of an invented default. |
| Law 4 (Verify Before Reporting) | The Judge must commit to a falsifiable GO / RESHAPE / KILL call — the anti-pattern is the hedge, "it depends." |

## Pairs with

- [`grill-me`](./grill-me.md) — once roast says GO or RESHAPE, `grill-me` hardens the **plan**; roast validates the **idea**. Roast first, then grill.
- [`proceed-with-the-recommendation`](./proceed-with-the-recommendation.md) — walk the verdict's next steps (the cheapest test, the RESHAPE pivot) top-to-bottom under the 7 Laws.
- [`wild-risa-balance`](./wild-risa-balance.md) — the verdict is a recommendation; run it through the R-I-S-A filter before acting.
- [`gateguard`](./gateguard.md) — the runtime gate (`hooks/gateguard.mjs`) that fires when the validated idea finally turns into Edit/Write/Bash.
