---
name: proceed-with-the-recommendation
tier: featured
description: "Walks an agent-emitted recommendation list top-to-bottom under the 7 Laws — restate, route per item, verify before advancing, reflect at the end, close with the mandatory three-section block. Standalone with inline fallbacks; trigger phrases are matched by the companion hook, not enumerated here."
origin: https://github.com/naimkatiman/continuous-improvement
---

# Proceed With The Recommendation

## Overview

One reusable skill that ties the continuous-improvement framework to a concrete execution engine. When the user greenlights a list of recommendations, this skill walks them in order under the **7 Laws**, routes each item to the best companion (`workspace-surface-audit`, `superpowers:*`, `ralph`, continuous-improvement helpers), and falls back to explicit inline behavior when a companion is not installed. Never silent no-op, never drive-by, never skip verification.

Core principle: **execute in order, one concern at a time, verify before advancing, reflect at the end.**

## The 7 Laws (inline summary)

This skill is the execution engine for the continuous-improvement framework. Mirrored from `continuous-improvement/SKILL.md` so this file stands alone if that companion is not installed:

1. **Research Before Executing** — what exists, what constrains, what breaks, simplest path. If you can't answer, research first.
2. **Plan Is Sacred** — state WILL build / Will NOT build / Verification / Fallback before any edit.
3. **One Thing at a Time** — finish and verify one item before the next. No "also quickly add" drive-bys. Parallel only when items share no state.
4. **Verify Before Reporting** — "Done" requires actual output checked, not assumed. "Should work" is not verification.
5. **Reflect After Every Session** — what worked / what failed / what you'd do differently / rule to add / next 3 ranked moves.
6. **Iterate Means One Thing** — one change → verify → next. Never bundle untested edits.
7. **Learn From Every Session** — capture patterns as instincts; corrections weaken, confirmations strengthen.

The Loop: `Research → Plan → Execute → Verify → Reflect → Learn → Iterate`. Skipped step = the step you needed most.

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

**Hard precondition (must be true before this skill runs):** The agent emitted a numbered, bulleted, or otherwise enumerated list of recommendations / next steps / suggested actions in the **immediately prior turn**. If no such list exists in the prior turn, this skill MUST NOT activate — the trigger phrases are ambiguous on their own and "yes do it" / "all of them" can refer to anything.

If the precondition holds, activate when:
- User invokes `/proceed-with-the-recommendation`
- User says "proceed with your recommendation", "do all of it", "go ahead with the plan", "execute the recommendations"
- User confirms with "yes do it" or "all of them"
- Auto mode is active AND the recommendation list is unambiguous

Do NOT use when:
- No enumerated recommendation list exists in the prior turn — ask what to proceed with instead of guessing
- Recommendations include destructive actions (deploy, force-push, DB drops, secret changes) without prior explicit authorization
- User scoped the work ("just the first one", "only the safe ones") — honor the scope
- Recommendations conflict with project agent-instruction files (CLAUDE.md / AGENTS.md / GEMINI.md / equivalent)

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
- Iteration — Next best recommendations (ranked, top 3):
  1. <primary — strongest next core-development move>
  2. <alternative — different angle>
  3. <alternative — smaller/larger scope>
```

The "Iteration — Next best recommendations" field is the Law 6 handoff. List the **top 3 ranked** core-development moves that advance the system based on what is now true in the codebase — what to build, fix, refactor, or investigate next. Item #1 is the strongest recommendation; #2 and #3 give the user alternative directions to pick from. NOT git steps (commit, push, PR), NOT verification re-runs (tests, type-check), NOT deploy actions — those belong in the Phase 7 end-of-run summary.

Format per item: `<verb> <object at path:line> (<why, one clause grounded in current context>)`.

Good examples (development progression):
- `Wire the quiz prize-line writer in src/scheduled.ts (real_contest writer is wired; quiz path is recognized but inert)`
- `Refactor the duplicated 4-mode switch shared by /admin/mode and contestModeGuard (drift risk after this session's mode add)`
- `Investigate the intermittent Saturday cron skip in src/scheduled.ts:625 (one missed activation last week, root cause unknown)`

Anti-examples (rejected — these are workflow, not development):
- `Commit and push the changes` → Phase 7 summary, not here
- `Re-run the full test suite` → already done in Phase 4 verification
- `Deploy to prod` → operational, needs-approval

Rules:
- Always exactly 3 items, ranked. Not 2, not 5.
- All 3 must be distinct directions — do not pad with rephrases of #1.
- If fewer than 3 real moves exist, fill remaining slots with `None — goal met from this angle.` rather than inventing busywork.
- If the original recommendation list is fully resolved across all angles, write `1. None — goal met, stop.` and omit #2 and #3.

If an `~/.claude/instincts/<project-hash>/observations.jsonl` exists, append this reflection as one JSONL line. This feeds the instinct system (Law 7) per the core `continuous-improvement` skill.

## Phase 7: End-of-Run Summary (User-Facing Close)

Emit exactly three sections, in this order, as the final user-facing block. Use these heading names verbatim — the shape is not optional.

### 1. What has been done

One bulleted line per completed item: `<item> — Verified: <actual check + output snippet>`. No "should work" claims, no aggregate phrasing like "all tests green" without naming the suite. Files touched and commits created (one concern per commit) belong in this section, grouped under the item they implemented.

### 2. What is next

Three optional subsections — include only the ones that apply, in this order:

- **Deferred** — drive-bys logged, scope-creep avoided. One line per item with the reason it is not being done now.
- **Blocked** — `needs-approval` items, verification failures with non-obvious fixes, user input required. One line per item with the exact blocker AND the next action the user must take.
- **Immediate operator action** — push, deploy, review, cherry-pick, file rotation. Only include if the goal cannot advance without it. Name the exact command or step.

If everything is fully complete and there is no blocker, deferred item, or operator action, write `Nothing — goal met, stop.` and skip section 3.

### 3. Recommendation

**Tiny-list exemption:** if the original list had **≤1 item AND the goal is fully resolved with no deferred / blocked / operator items**, omit section 3 entirely and end after section 2's `Nothing — goal met, stop.` line. The tiered table + binary closer is forcing-function discipline for multi-item runs; on a 1-item win it is ceremony. Phase 6's Reflection block still happens internally (Laws 5+7 require it) — it just isn't user-facing-rendered here.

For all other runs (≥2 items, or 1 item with deferred/blocked/operator follow-ups), this is the user-facing rendering of Phase 6's reflection. Use the **tiered table format** below — never a flat ranked list. Tier 1 must cite **direct evidence** from the current session, repo, global rules, or prior commits. Tier 2 is optional polish. The Skip section names items the user might reasonably assume belong, but which are already covered elsewhere (prevents duplicate-suggestion noise).

```
**Tier 1 — strong fit, you already operate this way**

| Item | Why it belongs | Evidence from this session/setup |
|---|---|---|
| <name> | <one-clause rationale> | <concrete file/line/rule citation> |

**Tier 2 — high-fit complements (optional polish)**

| Item | Why |
|---|---|
| <name> | <one-clause rationale> |

**Skip these — already covered**
- <name> — <where it is already handled>
```

Then a **My recommendation** paragraph — one short, decisive paragraph picking a side. Name the single highest-value move and why everything else in the list points at it. No hedging, no "you could do either."

End with a **Want me to:** block — exactly two options, A and B, each one line. A is typically the larger / bundled action; B is typically the smaller / focused first step. Format:

```
**Want me to:**
- **A** — <larger / bundled action — name the artifact + cadence>; or
- **B** — <smaller / focused first step — name the single concrete commit/file>?
```

### Rules for the close

- Tier 1 evidence must be a real citation — filename, line number, rule path, prior commit SHA, or a verbatim quote from the user's global instructions. No "best practices say…", no "industry standard…" — those are fabricated citations and violate Law 4 + the global rule against invented facts.
- Tier 2 may be empty. If it is, omit the section entirely — do not write a stub.
- Skip section is mandatory whenever the recommendation overlaps with anything the user already runs (e.g. existing skills, hooks, scheduled agents). Listing nothing in Skip when overlap exists is itself a fabrication.
- "My recommendation" is **one** decisive paragraph. Recommending both Tier 1 + Tier 2 together is not a recommendation — it is a punt.
- "Want me to:" is exactly **two** options. Never three, never zero, never an open-ended "what would you like next?".
- If no real next move exists across all three tiers, write `Nothing — goal met, stop.` in section 2 and omit section 3 entirely.

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

The five failure modes that actually bite. (Stop Conditions and Red Flags above already cover the rest — `needs-approval` halts, drive-by edits, urgency-as-authorization, transitive-verification rationalization.)

| Mistake | Fix |
|---|---|
| Skipping verification on "easy" items | Every item gets the smallest proof. "Should work" is not verification (Law 4). |
| Adding new items not in the list | Log as deferred follow-up. Even one drive-by line is out of scope. |
| Forgetting the end-of-run summary | Always emit the 3-section close: **What has been done → What is next → Recommendation**. |
| Tier 1 recommendation with no real citation | Tier 1 requires a concrete file/line/rule/commit citation — no "best practices say…", no "industry standard…". |
| "Want me to:" with 0, 1, or 3+ options | Always exactly two: A (bundled) and B (focused first step). Three options is a punt, one is a leading question. |

## Installation

```bash
mkdir -p ~/.claude/skills/proceed-with-the-recommendation
curl -L https://raw.githubusercontent.com/naimkatiman/continuous-improvement/main/skills/proceed-with-the-recommendation.md \
  -o ~/.claude/skills/proceed-with-the-recommendation/SKILL.md
```

Restart the Claude Code session so the registry picks it up. **No other plugins required** — the skill falls back to inline behavior for any specialist that is not present.

## Pairs best with (all in this repo)

- `SKILL.md` (core) — the 7 Laws of AI Agent Discipline; this skill is its execution engine
- `ralph.md` — autonomous multi-iteration loops for PRD-scale work
- `superpowers.md` — mandatory-workflow skill framework that routes most specialist calls
- `workspace-surface-audit.md` — environment + plugin scan for the Law 1 pre-flight

Install them together for the full continuous-improvement experience, or use this skill alone — it is self-contained.

## Worked Example

A concrete trace covering the most-failed paths: a `needs-approval` halt, a verification failure-and-retry, and the Phase 7 close. Use this to calibrate output shape — don't copy the wording.

**Prior turn (the agent's recommendation block):**
```
1. Add input validation to the /api/users POST handler
2. Drop the unused `legacy_users` table
3. Refactor the duplicated paginate() helper in lib/db.ts and lib/api.ts
```

**This turn (user):** "yes do it"

**Phase 1 — Restated:**
```
1. Add input validation to /api/users POST  → safe → Inline fallback (security-review pattern)
2. Drop legacy_users table                  → needs-approval → STOP at this item
3. Refactor duplicated paginate()           → safe → Routed to `simplify`
```

**Phase 2 — Plan (inline, ≤3 items):**
- Item 1: WILL add zod schema for body, reject 400 with field-level errors. Will NOT change response shape on success. Verification: one curl with bad payload → 400. Fallback: revert if existing tests break.
- Item 2: needs-approval — stop and ask the user before touching D1.
- Item 3: WILL extract `paginate()` to `lib/pagination.ts`, update both callsites. Will NOT change behavior. Verification: typecheck + the existing paginate unit test green. Fallback: revert if test count drops.

**Phase 3 — Execute item 1:**
Edit `routes/users.ts` adding zod schema. Run `curl -X POST .../api/users -d '{}'` → returns `400 {"errors":[{"field":"email","msg":"required"}]}`. ✓
**Phase 4 verification line:** `Done: input validation. Verified: curl bad-payload → 400 with field error. Routed to: inline.`

**Phase 3 — Execute item 2:**
HALT. Item 2 is `needs-approval`. Emit:
> Item 2 (drop `legacy_users` table) is destructive — D1 schema change. Need explicit "drop the legacy_users table" from you before I touch this. Continuing to item 3 in the meantime.

(NOTE: continuing past a `needs-approval` item to LATER `safe` items is allowed, per Phase 3 rule 1 — what's forbidden is silently skipping or silently doing the destructive item. The user is told and the destructive item is parked.)

**Phase 3 — Execute item 3:**
Extract `paginate()`, update callsites. Run `npx tsc --noEmit` → ❌ fails: `lib/api.ts` had a slightly different signature (`limit?: number` vs `limit: number = 20`). Phase 5 kicks in:
- Fix the smallest thing: keep the more permissive `limit?: number` signature in the extracted helper.
- Re-run typecheck → ✓ clean.
- Run the targeted unit test → ✓ green.

**Phase 4 verification line:** `Done: paginate refactor. Verified: tsc clean + paginate.test.ts → 1 passing. Routed to: simplify.`

**Phase 6 — Reflection (internal):**
- What worked: stopping at item 2 instead of guessing on the destructive op.
- What failed: missed the signature mismatch in plan — should have grepped both callsites first.
- What I'd do differently: pre-check signature compatibility before extracting shared helpers.
- Rule to add: when extracting a helper used in 2+ places, diff the signatures first.
- Iteration — Next 3:
  1. Add a smoke test for the new paginate helper covering both callsite shapes (regression guard).
  2. Audit other duplicated helpers in `lib/` for the same signature-drift pattern.
  3. Investigate whether `legacy_users` is referenced in any cron or migration before the user authorizes the drop.

**Phase 7 — Close:**

### 1. What has been done
- Item 1: input validation on /api/users POST — Verified: curl bad-payload → 400 with field error. Files: `routes/users.ts`, `schemas/users.ts`. Commit: `feat(users): validate POST body, return 400 on missing fields`.
- Item 3: paginate() refactor — Verified: `tsc --noEmit` clean + `paginate.test.ts` 1/1 passing. Files: `lib/pagination.ts` (new), `lib/db.ts`, `lib/api.ts`. Commit: `refactor(lib): extract shared paginate() helper`.

### 2. What is next
- **Blocked**: Item 2 (drop `legacy_users` table) — needs explicit "yes drop legacy_users" from you. Next action: confirm the table is unreferenced in cron/migrations, then authorize.
- **Immediate operator action**: push the two commits — `git push origin <branch>`.

### 3. Recommendation

**Tier 1 — strong fit, you already operate this way**

| Item | Why it belongs | Evidence from this session/setup |
|---|---|---|
| Add a paginate() smoke test covering both callsite shapes | Closes the signature-drift gap that just bit us | This session's failed `tsc` on item 3 |
| Audit other duplicated helpers in `lib/` for signature drift | Same pattern likely lurks elsewhere | The drift was invisible until extraction; suggests a class of bugs |

**Skip these — already covered**
- Re-run the full test suite — already done in Phase 4 verification
- Open a PR — Phase 7 operator action handles this once `legacy_users` is resolved

**My recommendation:** Land the smoke test for paginate first. The signature-drift bug nearly shipped because the refactor relied on the type checker rather than a behavioral test, and that gap will recur on the next shared-helper extraction.

**Want me to:**
- **A** — bundle the smoke test + a quick grep-pass for similar drift across `lib/` into one cleanup PR; or
- **B** — open a focused commit adding just the paginate smoke test against both callsites?

---

What this example demonstrates:
- Original-order walk preserved through a `needs-approval` halt
- Per-item verification (curl, then tsc + targeted test) — non-transitive
- Phase 5 retry on a real failure, smallest fix, re-verify before moving on
- Reflection feeds Phase 7 with concrete citations (the actual `tsc` failure)
- "Want me to" is exactly two options, not three; the tiered close is mandatory because this run had ≥2 items completed
