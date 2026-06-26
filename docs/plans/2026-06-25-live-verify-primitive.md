# 2026-06-25 — Live-app verification primitive (Law 4)

- Status: planned (not yet implemented)
- Origin: gstack-feasibility deep-research, capability 1.

## Goal

Give Law 4 (Verify Before Reporting) a way to verify a **live running app** — open
the page, drive one flow, assert state, capture one screenshot — so "done" can mean
"the feature works in the real running UI," not only "tests + typecheck are green."
The seam is already half-built in our own repo and one Law-4 phase away from closure.

## Why now (the gap is named in our own code)

- `commands/production-readiness-review.md` already promises the UI dimension is
  "verified live with Playwright when the MCP is available, else static review" and
  "says so rather than silently skipping" — but that contract is prose in one
  command, backed by no reusable primitive.
- `skills/verification-loop.md` has a numbered phase ladder (Phase 0 resolve →
  1-6 mechanism → 7 result → 8 deploy-receipt) with **no running-UI phase at all**.
  Law 4 currently stops at tests and the deploy SHA and never touches the UI.

## Hard constraint: drive an existing MCP, never bundle a browser

gstack rebuilt the whole browser as a ~58MB compiled-Bun Chromium daemon. That is
right for a QA product and **wrong for a zero-runtime-dependency discipline plugin**.
We drive whichever browser MCP the user already has and skip cleanly when none is
present. No new runtime dependency, no bundled Chromium.

- Detect a connected browser MCP by tool-name prefix: `mcp__*playwright*` first
  ([Playwright MCP](https://github.com/microsoft/playwright-mcp)), then
  `mcp__*chrome-devtools*` ([chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)).
- No MCP connected ⇒ `SKIPPED` (first-class, non-blocking), never a silent pass —
  exactly the contract `production-readiness-review.md` already states.

## Token cost is the real risk, not engineering

Independent benchmark: a browser task runs ~114K tokens through Playwright MCP vs
~27K through the CLI, and a single screenshot was measured at **232K tokens**
([source](https://scrolltest.medium.com/playwright-mcp-burns-114k-tokens-per-test-the-new-cli-uses-27k-heres-when-to-use-each-65dabeaac7a0)).
So the skill MUST bound scope: one flow, minimal navigations, **assert over
screenshot**, exactly one final screenshot, and cite `token-budget-advisor`. An
unbounded live-verify would blow the context window and violate Law 6.

## Design (smallest cut — a driver skill, not a substrate)

A markdown driver skill (no compiled binary, zero new deps) that does five things:
1. **Detect** the connected browser MCP, or emit `Live verify: SKIPPED — no browser
   MCP connected (install: claude mcp add playwright npx @playwright/mcp@latest)`
   and return non-blocking.
2. **Scope** the flow from the resolved ladder's new `live_checks` field (a single
   URL + a short ordered step list, or a `live-checks/` directory of flow specs).
3. **Drive** navigate → interact → assert (prefer `browser_wait_for` over
   re-navigation to bound snapshot growth).
4. **Evidence**: ONE `browser_take_screenshot` of the final asserted state only;
   the asserted text/aria is the cheap primary evidence.
5. **Receipt**: a verbatim `Live Verify — <flow>: URL, steps, assertion,
   PASS|FAIL|SKIPPED, screenshot path` block. FAIL blocks the verification-loop
   READY verdict like a failed synthetic check; SKIPPED is recorded, not hidden.

Mirror `deploy-receipt`'s report-only default and "absence of evidence is not
evidence of success" rule. Reuse the `synthetic-checks/` runner shape
(env-injected BASE_URL, lexical files, exit-0=pass, stdout verbatim) if the
directory route is chosen.

## Files (first cut — markdown-only, no build/exec-bit risk)

- `skills/live-verify.md` (new, tier-1, Law 4, `disable-model-invocation` like
  deploy-receipt) + its `plugins/` mirror.
- `skills/verification-loop.md` — insert "Phase 7.5: Live-App Verification" between
  the result gate (7) and deploy-receipt (8), gated on a resolved `live_checks`
  field; absent field / no MCP ⇒ recorded "skipped".
- `templates/verify-ladder.example.json` — add a `live_checks` field (null in the
  node/library example; a URL in the worker example) + a `_live_checks_doc` block
  mirroring the synthetic-checks doc.
- `scripts/route-recommendation.routes.json` — add a "Verify the running app /
  dogfood the flow" route row → live-verify, with an inline fallback.
- `commands/production-readiness-review.md` — point the UI/UX dimension at the new
  skill so the contract is centralized instead of restated.
- `SKILL.md` Law 4 — one line that "verify the actual result" includes the running
  UI when a flow is in scope, citing live-verify.
- Count cascade: a new tier-1 skill bumps the skill count in the 3 source spots +
  auto-discovery that `check-skill-count.mjs` / `check-skill-tiers.mjs` enforce
  (known trap — see memory `project_add_prompt_skill_playbook`).

## Deferred (second PR)

- `ci_live_check` MCP tool that records the receipt into `observations.jsonl` for
  Law 5/7 learning.
- Any `.mts`→`.mjs` directory-runner (`scripts/run-live-checks.mjs`) — needs the
  rebuild + `+x` exec-bit dance; the markdown-only first cut avoids it entirely.

## Verification

`npm run verify:all` (skill-count / skill-tiers / skill-mirror / docs-substrings /
everything-mirror green after the count cascade) + `npm run typecheck`. The skill
contract itself is exercised by adding a `verification-loop` mirror assertion for
the "Phase 7.5" heading to `bin/check-docs-substrings.mjs` in the same PR.

## Effort

M (1-3 days). Markdown-only first cut is the bulk; the MCP tool + directory runner
are the deferred second PR.
