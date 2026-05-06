---
name: discipline
description: Quick reference card for the 7 Laws of AI Agent Discipline
---

# The 7 Laws — Quick Reference

Print this card and check yourself against each law.

## The Laws

| # | Law | Check | Red Flag |
|---|-----|-------|----------|
| 1 | **Research Before Executing** | Did I search for existing solutions? | "I'll just quickly..." |
| 2 | **Plan Is Sacred** | Did I state WILL / WILL NOT / VERIFY? | "Let me also add..." |
| 3 | **One Thing at a Time** | Am I finishing before starting? | "While I'm here..." |
| 4 | **Verify Before Reporting** | Did I check the ACTUAL output? | "This should work..." |
| 5 | **Reflect After Sessions** | Did I note what worked/failed? | "I'll remember..." |
| 6 | **Iterate One Change** | Am I changing one thing at a time? | "And also..." |
| 7 | **Learn From Every Session** | Did I capture this as an instinct? | "Next time I'll..." |

## Operator Stakes

The Laws above are the *how*. These five principles are the *why*: code ships from your account, the incident lands on your pager, the bill hits your budget. Each one pairs with the Law that prevents it from going wrong.

| # | Principle | Vibe coder | Engineer | Law |
|---|-----------|------------|----------|-----|
| 1 | **Ownership** | Ships auth, moves on | Adds rate limits, audit logs, password-reset flow, incident runbook before shipping | 4 |
| 2 | **Reliability over cleverness** | Accepts a clever regex + heavy lib that breaks on ISO 8601 with millis | Picks the boring tested API, writes tests for leap years and DST | 1 |
| 3 | **Systems thinking** | Builds in-memory CSV export, works for 100 dev users, OOMs in prod | Asks row count first, picks paginated background job + S3 link | 2 |
| 4 | **Problem framing** | Builds the websocket chat the ticket asked for | Finds out users wanted faster support replies, not chat | 1 |
| 5 | **Constraints management** | Calls the $0.02/image model on every upload | Does the math, adds client-side validation + caching + cheaper triage model | 2 |

Code is a liability, not an asset. Speed without these five turns into someone else's incident at 3am — except the someone is you.

## The Loop

```
Research → Plan → Execute (one thing) → Verify → Reflect → Learn → Iterate
```

## Self-Check

Before saying "Done", verify ALL:
- [ ] Code runs without errors
- [ ] Output matches expected result
- [ ] I checked the **actual** result (not assumed)
- [ ] Build passes
- [ ] I can explain the change in one sentence

If you're skipping a step, that's the step you need most.
