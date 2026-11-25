---
name: be-ambitious
tier: "2"
description: Guidance for Law 2 (Plan Is Sacred) of the 7 Laws of AI Agent Discipline. Takes one task and works it at three kinds of ambition (Altitude, the goal behind the task; Depth, the way the best person in the field would do it; Range, other fields doing their real work), fixes a numeric target and an outside judge before the work starts, then does the work. The literal ask is always delivered, and anything hard to reverse still needs a yes. Method from Felix Rieseberg's "How to be more ambitious", restated.
origin: continuous-improvement
user-invocable: true
argument-hint: "[task] | rewrite [prompt] | audit"
---

# Be Ambitious: Work the Goal Behind the Task

One task in. The work comes out done at the altitude, depth and range the best person in the field would bring to it, checked by something other than you, with one piece left behind that makes the next run need less of the human.

This is the Ambition pillar of continuous-improvement. It is guidance: text you read and follow. No hook checks that you followed it. The Discipline pillar is the part that code backs, and the two meet in ground rules 5 and 6 below: you do not grade your own work, and anything hard to reverse waits for a yes. Where the hooks are installed, a destructive command is still refused by `hooks/gateguard.mjs`, whatever the brief says.

Credit: the method is from Felix Rieseberg, *How to be more ambitious: A tutorial for humans with models* (13 October 2026), https://felixrieseberg.com/how-to-be-more-ambitious-a-tutorial-for-humans-with-models/. The article coaches a person who prompts a model. This skill turns it around: you apply each technique to yourself, then do the work. The wording, the examples and the rules marked *(added)* are this skill's own.

| Axis | Question | Timid | Ambitious |
|---|---|---|---|
| Speed | Same work, faster? | n/a | Assumed. Not this skill's job. |
| **Altitude** | What should be true after this? | Fix the failing checkout test | A checkout regression cannot reach `main` |
| **Depth** | How would the best in the field do it? | A summary table | The raw data in a database, and a model fit to it |
| **Range** | Which other fields have something to say? | One reviewer | Three fields doing their real work, plus a red team |

## Ground rules

1. **Deeper, not bigger.** Ambition means a better outcome, not more pages, files or features. If something can be cut without losing value, cut it.
2. **The literal ask is the floor** *(added)*. Deliver what was asked, in the form asked, as well as what you climbed to. Never swap their deliverable for yours without saying so.
3. **Do it, do not describe it.** The output is work: data pulled, models fit, code run, checks passed. A list of ambitious ideas fails this skill, unless ideas are what the user asked for.
4. **Activities, not costumes.** No role-play. Do what that professional does: pull the filings, rebuild the numbers, find the gap.
5. **You do not grade yourself.** Something other than you says the work is right: a test, a benchmark, held-out data, a different agent, or the user.
6. **Hard to reverse or outward-facing still needs a yes** *(added)*. Never push, send, publish, deploy, spend, delete, schedule or edit the agent's rules file without confirmation. Install software only into a scratch environment. Security work runs only on systems the user owns, in a local or sandboxed copy.

## 0. Pick the tier, and say it in one line

| Tier | When | What runs |
|---|---|---|
| **Skip** | A factual question, a typo, a one-line fix, or the user said "just", "only", "quick" or "exactly" | Answer directly, with none of this skill's vocabulary. Offer a bigger version in one plain line only if a real one exists. |
| **Light** | A medium task, or the skill was triggered by a phrase | Steps 1 to 4 as a short note in your reply, two or three seats, one runnable judge, step 8 only if it takes minutes. |
| **Full** | The user invoked the skill on a multi-hour or high-stakes task, or said "go big" | Every step. |

**Seats and sub-agents.** Run the seats yourself, one after another. If your agent can run sub-agents, a Full run may give each seat to one, never more than six without asking. Invoking this skill is not consent to any larger orchestration.

**Missing prerequisites.** Every kind of ambition needs a computer to work on, the ability to install software and access to the relevant data. Where some of that is missing, work the highest rung the access you have supports, and say in the report what the next rung needs.

**If you are running as a sub-agent**, you cannot ask the user anything. Make each escalation decision yourself, keep the literal ask as the floor, do not install software or request credentials, and skip anything outward-facing.

## 1. Climb (Altitude)

Ask what should be true after this task: the goal behind the goal. Write an altitude ladder of at least three rungs, each answering "and what is that for?":

```
Rung 0 (asked):     Fix the failing checkout test
Rung 1 (outcome):   Checkout works for every payment method we support
Rung 2 (guarantee): A checkout regression cannot reach main without a failing check
Rung 3 (process):   Each release reports checkout success from production data,
                    and a drop opens an issue that names the offending commit
```

Pick the rung you will execute: as high as your data and access allow, and as high as a judge can reach. A rung whose judge finishes later (a month of shadow running) counts if you build the judge and start it. Altitude pays most for outcomes (reliability, revenue, decisions, risk). For work judged by taste, stay near the asked rung and spend the ambition on Depth and Range. A sign you should climb: the user would otherwise schedule a meeting about this work.

## 2. Go deeper (Depth)

Answer four questions in writing, for this task, naming real tools, datasets and people:

1. What would a top professional in this field do here that the user is not asking for?
2. What is the rawest material they would start from? Logs, not dashboards. Source, not docs. Filings, not articles. Recordings, not summaries.
3. Which methods and instruments would they use? Told to act professional, a model tends to change its vocabulary and keep its method. If you are about to write a table, would they build a database, a statistical model, a profiler or a simulator?
4. What, other than you or the user, would show the result is right? This becomes the judge in step 4.

Then plan two more moves. **Challenge a belief:** name the belief the task rests on and plan to reproduce it from raw data. **Produce new knowledge:** once you are in the data, look for something an expert in the field would learn from, and show it holds on data it has not seen.

## 3. Assemble the crew (Range)

1. Imagine the result has to be exceptional, with real stakes. Which team would be put together for it?
2. Turn nouns into verbs. A quarterly review is not "a deck". It is getting busy people to believe a story about cause and effect, and to decide under uncertainty, in thirty minutes.
3. Each verb points at a field. "Believe a story" is journalism. "Cause and effect" is econometrics. "Decide under uncertainty" is decision analysis. "In thirty minutes" is editing.
4. Pick the seats the verbs call for. *(added)* Include a red-team seat by default, and look for one field nobody would expect.
5. For each seat write one concrete activity and the artifact it produces. Not "review as a journalist" but "find the most surprising true number and write the headline around it". If the obvious field would produce that artifact anyway, drop the seat.

## 4. Set the bar and the judge

- **A hard number.** Turn every soft goal into a specific number, set far past the comfortable one. Need the build under ten minutes? Ask what it takes to get it under one. Where a physical or platform floor can be measured, measure it first and set the target relative to it. Add a deadline only where the work has a natural clock.
- **Existence proof** *(added)*. Search briefly for someone who has done something like it. Use it to set the target, never as a reason to stop.
- **Build the judge before the work** *(added)*. Turn depth question 4 into something you can run and that can fail. Run it once now for a baseline.
- **Equip yourself.** List what the rung needs that you lack (data, software, machines, credentials). Get what you safely can. Ask the user once, in one message, for what only they can give, and keep working on the rest.
- **Guardrails.** List what must not get worse while you chase the target. These become part of the judge.

A good judge can fail, runs in one command, was fixed before you saw the output, measures the target and not an easier proxy, and is independent of the author: whatever it tests against was made by a different agent or source.

| Work | Judge |
|---|---|
| Code change | A test that fails first, the type checker, CI |
| Bug fix | A repro script that fails before and passes after, on every platform affected |
| Performance | A benchmark with fixed inputs, p50 and p95 against a budget over enough runs to mean something |
| Data claim or prediction | Held-out data the analysis never saw; a backtest against a naive baseline |
| Process change | A backtest on history, then a shadow run beside the old process |
| UI | A rendered screenshot against a reference, an accessibility checker, one real person doing one task |
| Writing or research | Every claim checked against its source; a cold reader states the main point and you compare it with your intent |
| Anything | The person the work is for, asked for five minutes of review |

A second model is a judge only when nothing runnable exists, and only with a rubric written before the work. Treat its agreement as weak evidence and its disagreement as strong.

**Rewrite mode ends here.** Return a self-contained deeper prompt (the outcome, the number, the raw material with a fallback, the methods, each seat's activity, the belief to test, the guardrails, the judge, ground rule 6) under about 400 words, then a short "why": the ladder, the four depth answers, and one line per seat.

## 5. Show the brief, then go

Write the brief: asked rung, executed rung, target, crew, judge and its baseline. Show the user the short version and start working in the same turn. Wait for a yes first only if the executed rung replaces their deliverable, needs something only they can provide, or touches anything outward-facing. Write the brief into the project only if the user asks.

## 6. Execute

- **Go to the raw material.** Pull the logs, the source, the full export. Load them into something you can query instead of reading samples by eye.
- **Run the crew.** Each seat does its activity and produces its artifact with evidence.
- **Use the real instruments** from step 2. If you catch yourself writing a table where a model belongs, build the model.
- **Attack the belief** with the raw data. Report what held and what broke.
- **Integrate.** You are the editor. Reconcile the artifacts, let the red team cut what does not survive, and fold the rest into one deliverable that still contains the literal ask.

## 7. Judge, then push once more

Run the judge and report baseline, result and target, failures included. If you missed the target, make one more real iteration aimed at the biggest gap: change the method, not the polish.

**Audit** (Full runs, and `audit` mode). The scorer must not be the author. Use a sub-agent that has not seen your reasoning if your agent has one. Otherwise the runnable judge and the user are the audit: do not score your own work. Score each axis 0 to 3 with quoted evidence, against the tier and rung chosen:

| Score | Altitude | Depth | Range |
|---|---|---|---|
| 0 | Did the literal task only | Digested inputs, prose or a table out | One perspective |
| 1 | Delivered the outcome the task was for | Raw material or a real instrument, not both | Several perspectives, as role-play or from the obvious field |
| 2 | Ended in a decision or a guarantee | Raw material, real instruments, one belief tested | Three or more fields doing real work, with a red team |
| 3 | Changed the process and left durable plumbing | Something an expert would learn from, shown on unseen data | An unexpected field changed the result |

Any "no" here fails the run whatever the score: the literal ask was delivered as asked; an outside judge ran against a numeric target and a baseline; nothing can be cut without losing value; every outward-facing or irreversible action was confirmed first; every seat changed the work; the next rung and what it needs are written down. Fix a low score only where that improves the deliverable.

## 8. Make it durable

Altitude is where the human comes out of the loop, and that usually means changing the workflow first. In a Full run, build at least one piece: a script that fetches the raw data in one command, a mapping the next run needs (versions to commits, customers to accounts), or the judge saved as a runnable check. **Offer**, and do not create, a scheduled rerun. **Propose**, and write only on a yes, a note in the agent's rules file that tells future sessions about the new workflow.

## 9. Report

Lead with the result, then: asked against delivered; the judge (baseline, result, target, and how to rerun it); the belief you challenged and what the data said; what an expert would learn, or a plain statement that you found nothing; the durable pieces; and the highest rung not taken, with exactly what it needs.

## When it feels impossible

Before you lower a target: make a real attempt before deciding anything about feasibility; use the existence proof from step 4; build a cheap throwaway version first; ask what a different field would do. *(added)* Name the single assumption that makes it impossible, then install, request, simulate or route around it. *(added)* Lower the target only after two genuinely different methods have failed, and report both, plus what the third would be.

## Modes

- **`be-ambitious [task]`**: Full or Light, per step 0. With no task, apply it to the work under way.
- **`be-ambitious rewrite [prompt]`**: steps 1 to 4 only. Nothing is executed and the deeper prompt is the deliverable.
- **`be-ambitious audit`**: score the work just done as in step 7, then carry out the single highest-value missing move.

## Where this sits in the loop

Research, Plan, Implement, Review, Contemplate, Relearn and learn, Iterate. This skill mostly serves **Plan** (Law 2): the rung, the target, the guardrails and the judge are the plan's "will build", "will not build" and "verification". Step 7 is **Review** (Law 4). Step 8 feeds **Relearn and learn** (Law 7): a durable piece is a lesson the next session starts with.

## Pairs with

- [`goal-monitor`](./goal-monitor.md): holds the session to the goal you set here.
- [`verification-loop`](./verification-loop.md): the ladder to run as the judge for code.
- [`roast`](./roast.md) and [`grill-me`](./grill-me.md): pressure-test the brief before a Full run.
- [`gateguard`](./gateguard.md): the Discipline pillar's hook, which applies to an ambitious run like any other.
