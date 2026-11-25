---
name: be-ambitious
description: Work a task at the goal behind it. Climb to the outcome, use the method the best in the field would use, bring in other fields, fix a numeric target and an outside judge first, then do the work. Guidance for Law 2 (Plan Is Sacred).
argument-hint: "[task] | rewrite [prompt] | audit"
---

# /be-ambitious — Work the Goal Behind the Task

You have big goals. This command tells the agent how to work at that level instead of at the level of the sentence you typed. Backed by the `be-ambitious` skill, which holds the full method.

## What it does

Takes one task (or the work under way, with no argument) and runs it on three axes:

```
Altitude   What should be true after this?        Fix the failing test  ->  a regression cannot reach main
Depth      How would the best in the field do it?  A summary table       ->  the raw data, and a model fit to it
Range      Which other fields have a say?          One reviewer          ->  three fields doing real work, plus a red team
```

Before the work starts it fixes a hard numeric target and a judge that can fail, and runs the judge once for a baseline. Then it does the work, runs the judge again, and reports baseline, result and target.

## Modes

- `/be-ambitious [task]`: the full method, or a light pass for a medium task.
- `/be-ambitious rewrite [prompt]`: returns a deeper prompt and runs nothing.
- `/be-ambitious audit`: scores the work just done on the three axes, then carries out the most valuable missing move.

## What it will not do

It is guidance, not a hook: nothing checks that the agent followed it. Its own rules keep the run in your hands. The literal ask is always delivered, in the form you asked. The agent does not grade its own work. Anything hard to reverse or outward-facing (push, send, publish, deploy, spend, delete) waits for your yes.

## Pairs with

- **`be-ambitious`** skill: the method this command runs.
- **`goal-monitor`**: holds the session to the goal set here.
- **`verification-loop`**: the judge for a code change.
- **`roast`** and **`grill-me`**: pressure-test the brief before a full run.

## Credit

The method is from Felix Rieseberg, *How to be more ambitious: A tutorial for humans with models* (13 October 2026), https://felixrieseberg.com/how-to-be-more-ambitious-a-tutorial-for-humans-with-models/. The skill restates it in its own words and adds its own rules.
