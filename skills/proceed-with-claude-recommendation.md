---
name: proceed-with-claude-recommendation
description: "Naim's unified reusable skill. Walks a Claude recommendation list top-to-bottom under the 7 Laws of continuous-improvement discipline, stitching together workspace-surface-audit (pre-flight), superpowers (skill autoactivation), and ralph (long-running loops) where appropriate. Triggers on /proceed-with-claude-recommendation, \"proceed with your recommendation\", \"do all of it\", \"go ahead with the plan\", \"yes do it\", \"all of them\". Standalone — works without other plugins via inline fallbacks."
origin: https://github.com/naimkatiman/continuous-improvement
---

# Proceed With Claude Recommendation

## Overview

One reusable skill that ties the continuous-improvement framework to a concrete execution engine. When the user greenlights a list of recommendations, this skill walks them in order under the **7 Laws**, routes each item to the best companion (`workspace-surface-audit`, `superpowers:*`, `ralph`, ECC helpers), and falls back to explicit inline behavior when a companion is not installed. Never silent no-op, never drive-by, never skip verification.

Core principle: **execute in order, one concern at a time, verify before advancing, reflect at the end.**

## Composition Map

This skill is the orchestrator for the other companions in this repo. It does not duplicate them — it calls them.

| Phase | Companion invoked | 7 Laws alignment |
|---|---|---|
| Pre-flight environment check (optional, first-time or big session) | `workspace-surface-audit` | Law 1: Research Before Executing |
| Plan restatement + tagging + routing decision | `superpowers:writing-plans` (if plan > 3 items or > 150 LOC) else inline | Law 2: Plan Is Sacred |
| Per-item specialist routing | `superpowers:*` / `simplify` / `schedule` / `loop` / `security-review` / `documentation-lookup` / `update-config` / `commit-commands:*` (see routing table) | Law 3: One Thing at a Time |
| Per-item verification | `superpowers:verification-before-completion` or inline smallest-check | Law 4: Verify Before Reporting |
| Long-running or autonomous execution (PRD-style, multi-iteration) | `ralph` | Laws 3 + 6 at scale |
| End-of-run reflection | Write a Reflection block + append to `~/.claude/instincts/<hash>/observations.jsonl` | Laws 5 + 7: Reflect, Learn |
| Iterate if user course-corrects | Restart from Phase 2 with the corrected list | Law 6: Iterate Means One Thing |

## When to Use

- User invokes `/proceed-with-claude-recommendation` right after Claude gave recommendations
- User says "proceed with your recommendation", "do all of it", "go ahead with the plan", "execute the recommendations"
- User confirms a prior Claude suggestion block with "yes do it" or "all of them"
- Auto mode is active and the recommendation list is unambiguous

Do NOT use when:
- No recent recommendation list exists — ask what to proceed with
- Recommendations include destructive actions (deploy, force-push, DB drops, secret changes) without prior explicit authorization
- User scoped the work ("just the first one", "only the safe ones") — honor the scope
- Recommendations conflict with project CLAUDE.md rules

## Phase 1: Pre-Flight (Law 1 — Research)

**If** the recommendation list references files, plugins, or MCP servers not obviously present in the current repo, **then** call `workspace-surface-audit` for a quick scan. Otherwise skip.

Restate the recommendation list back in one compact block:

1. Numbered list of recommendations (original order, never silently reordered)
2. Tag each: `safe` / `caution` / `needs-approval`
3. For each item, declare: "Routed to `<skill>`" OR "Inline fallback: `<behavior>`"
4. Proceed without waiting ONLY if every item is `safe` AND the user already said "all of them" / auto mode is active
5. For any `needs-approval` item (deploy, force-push, DB drop, secret change), stop and ask — even if other items are safe

## Phase 2: Plan (Law 2 — Plan Is Sacred)

If the list has **>3 items OR touches >150 LOC**, call `superpowers:writing-plans` to generate a bite-sized task breakdown. Save the plan to `docs/plans/YYYY-MM-DD-<slug>.md`.

Otherwise, inline: restate each item as `WILL build: <X>`, `Will NOT build: <Y>`, `Verification: <Z>`, `Fallback: <W>`.

Create a `TodoWrite` list mirroring the plan.

## Phase 3: Execute (Law 3 — One Thing at a Time)

For each item in the ORIGINAL order:

1. If `needs-approval` — STOP. Ask. Wait. Do not proceed to later items until the user explicitly greenlights this one.
2. Match to a preferred skill via the routing table below; if not installed, apply the inline fallback. Never silent no-op.
3. Finish this item completely before touching the next. No "also quickly add" drive-bys — log them as deferred follow-ups instead.

### Routing Table (with Inline Fallbacks)

| Recommendation type | Preferred skill | Inline fallback |
|---|---|---|
| Long-running / PRD-style autonomous execution | `ralph` (companion in this repo) | Break into sub-recommendations, run this skill recursively per sub-item |
| Implement feature / add capability | `superpowers:brainstorming` → `superpowers:writing-plans` | Restate goal → list 3 design options → pick one → outline files to touch → build |
| Fix bug / investigate failure | `superpowers:systematic-debugging` | Hypothesis → add logs/tests → reproduce → smallest fix → verify with the failing repro |
| Write tests / add coverage | `superpowers:test-driven-development` or `tdd-workflow` | RED (failing test) → GREEN (minimal code) → REFACTOR; one test, one behavior |
| Refactor / dead code cleanup | `simplify` | Find dupes/unused exports, delete in place, re-run type check and smallest test |
| Security review / auth audit | `security-review` | Scan for hardcoded secrets, unsanitized input, missing authz, SQL string concat, open CORS |
| Code review before merge | `superpowers:requesting-code-review` or `code-review` | Read diff top-to-bottom, flag CRITICAL / HIGH / MEDIUM |
| Verify before shipping | `superpowers:verification-before-completion` | Smallest check that proves correctness: typecheck + one test + one curl |
| Multiple independent tasks | `superpowers:dispatching-parallel-agents` | Launch N parallel `Agent` tool calls in one message; reconcile results after |
| Merge / close branch | `superpowers:finishing-a-development-branch` | Verify clean tree, rebase on main, green CI, open PR with summary + test plan |
| Schedule a follow-up | `schedule` | Tell user the exact action + cadence; if no scheduler, write a dated TODO/memory entry |
| Recurring poll / interval task | `loop` | Tell user the cadence + how to re-run manually |
| Library / API docs lookup | `documentation-lookup` | Use `WebFetch` against the official docs URL, cite what changed |
| Frontend / UI design work | `frontend-design:frontend-design` | Build smallest vertical slice first, verify in browser before styling |
| Settings / hooks / permission change | `update-config` | Edit `~/.claude/settings.json` with a minimal patch; restart session |
| Commit and push | `commit-commands:commit` or `commit-commands:commit-push-pr` | `git add <specific files>` → commit with `type(scope): outcome` → push when asked |
| Continuous-improvement analysis / instinct update | `continuous-improvement` (core 7-Laws skill) | Run the 7-Laws Reflection block manually; append to `observations.jsonl` |

## Phase 4: Verify (Law 4 — Verify Before Reporting)

Before moving to the next item, run the smallest check that proves correctness:

- Code change → typecheck + the one targeted unit test
- Migration → apply to dev DB, read back schema
- Config → parse + one consuming command
- UI → start dev server, visit the page in a browser
- API → one curl with expected status and body

Emit one line per item: `Done: <item>. Verified: <actual check + output snippet>. Routed to: <skill|inline>.`

"Should work" is NOT verification. If verification is impossible, explicitly mark the item as unverified and explain why — do not claim done.

**Verification is per-item and non-transitive.** A later item's broader check (e.g. an end-to-end test exercising a mid-stack route) never retroactively verifies an earlier item. If item #2 has a 3-minute typecheck and item #3 would exercise the same code path, you still run #2's typecheck before moving on. Coverage-at-the-suite-level is not a substitute for per-item proof.

## Phase 5: Iterate (Law 6 — One Change → Verify → Next)

If verification fails:
- Fix the smallest thing
- Re-verify
- Do NOT move on to the next item until this one is green

If the user course-corrects mid-loop, stop cleanly and restart from Phase 2 with the updated list. Never carry forward silently.

## Phase 6: Reflect (Laws 5 + 7 — Reflect, Learn)

At end-of-run, emit a Reflection block:

```
## Reflection
- What worked: <concrete behaviors that saved time or caught bugs>
- What failed: <concrete slips, skipped verifications, missed approvals>
- What I'd do differently: <specific change for next time>
- Rule to add: <one-line instinct candidate>
```

If an `~/.claude/instincts/<project-hash>/observations.jsonl` exists, append this reflection as one JSONL line. This feeds the instinct system (Law 7) per the core `continuous-improvement` skill.

## Phase 7: End-of-Run Summary

One compact block to the user:
- Completed: N items with names
- Deferred: M items with reason (drive-bys and new discoveries go here)
- Blocked: K items with blocker and next action for the user
- Files touched and commits created (one concern per commit)
- Next step for the user (push, deploy, review)

## Stop Conditions (Hard Halt)

Stop immediately on any of:
- A `needs-approval` item (deploy, force-push, DB drop, secret change, shared-state mutation)
- Verification failed and the fix is non-obvious
- User course-corrects mid-loop
- New information contradicts the remaining list (root-cause shifted)
- Context >80% full — write a Context Bridge before clearing
- Any drive-by temptation that is NOT in the original list

### Definitions (close common rationalization routes)

- **Drive-by** = any edit outside the exact lines, files, or symbols named in the recommendation, even if the edit is in the same file or "obviously related." A missing null-check three lines away from a unit-test target is still a drive-by. Log it as deferred.
- **Prior explicit authorization** (for destructive actions) = the user named the specific destructive action ("yes deploy to prod", "force-push the rebase", "drop the old table") in this turn or a prior turn. General urgency cues ("I'm in a hurry", "ship today", "just do it") are NOT authorization for any specific destructive action. Stop and ask.
- **"Routed" item** = one that was successfully handled by a preferred skill. "Inline fallback" items are NOT second-class — they get the same verification and summary treatment.

## Red Flags — STOP and Ask

- "I'll deploy to check" — run local verification instead
- "Skip verification for speed" — smallest check is 30 seconds; unacceptable shortcut
- "Batch these into one commit" — one concern per commit, always
- "Also fix this drive-by thing, it's only 3 lines" — log as deferred, do NOT silently implement
- "The null check is really just part of a *good* unit test for #1" — no. It is a drive-by. See Definitions.
- "User will probably be fine with me doing X" — X was not in the list
- "The later step will test this anyway" — no. Verification is per-item and non-transitive.
- "#3 will exercise the same code as #2 end-to-end, so #2's typecheck is redundant" — no. Run #2's typecheck before moving on.
- "User said they're in a hurry, that counts as authorization" — no. Urgency is not authorization. Stop. Ask.
- "I'll proceed past the needs-approval item since the user seems in a hurry" — never. Stop. Ask.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Reordering the list silently | Walk in original order unless user reorders |
| Adding new items not in the list | Log as deferred follow-up |
| Skipping verification on "easy" items | Every item gets the smallest proof |
| Running 3 specialist skills in parallel for one item | One skill per item unless items are truly parallel |
| Forgetting the end-of-run summary | Always emit it |
| Proceeding past a `needs-approval` item | Stop, ask, wait |
| Silent no-op when a routed skill is missing | Always run the inline fallback — never skip the item |
| Skipping the Reflection block because "run was easy" | Laws 5+7 require reflection every time |

## Installation

```bash
mkdir -p ~/.claude/skills/proceed-with-claude-recommendation
curl -L https://raw.githubusercontent.com/naimkatiman/continuous-improvement/main/skills/proceed-with-claude-recommendation.md \
  -o ~/.claude/skills/proceed-with-claude-recommendation/SKILL.md
```

Restart the Claude Code session so the registry picks it up. **No other plugins required** — the skill falls back to inline behavior for any specialist that is not present.

## Pairs best with (all in this repo)

- `SKILL.md` (core) — the 7 Laws of AI Agent Discipline; this skill is its execution engine
- `ralph.md` — autonomous multi-iteration loops for PRD-scale work
- `superpowers.md` — mandatory-workflow skill framework that routes most specialist calls
- `workspace-surface-audit.md` — environment + plugin scan for the Law 1 pre-flight

Install them together for the full continuous-improvement experience, or use this skill alone — it is self-contained.
