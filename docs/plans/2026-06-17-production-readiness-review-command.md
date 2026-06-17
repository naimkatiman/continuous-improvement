# Plan: `/production-readiness-review` command — parallel multi-agent readiness gate

- Date: 2026-06-17
- Branch: `feat/production-readiness-review` (off `origin/main` 136b7f1)
- Closes: R13 from the 2026-06-17 report-coverage map (no named orchestrator binds the parallel-review pieces into a readiness gate)

## Goal

One command that fans parallel specialized agents across distinct review dimensions — each grounding every finding against real code, logs, or live queries — then reconciles them into a single deduplicated, severity-ranked punch-list. Reports only; it does not fix.

## Why

The coverage map confirmed the pieces already exist (`superpowers:dispatching-parallel-agents`, plus the `code-reviewer` / `security-auditor` / `test-engineer` agents that already rate findings by severity and confidence), but nothing binds them into a named readiness gate. `/production-readiness-review` is that entry point — the sibling of `/ship` for the review side.

## Scope (one concern)

In:
- New `commands/production-readiness-review.md` — routing command (prose), command-only.
- Regenerate the `plugins/` mirror via `npm run build` (generated output).

Out (deferred, not dropped):
- No new skill, hook, or `.mts` code.
- No auto-fix — the command reports a punch-list and stops; fixing is a separate `/ship` run per finding.
- No merge, no deploy.
- Not added to the `proceed-with-the-recommendation` routing table (so `routing-targets` is untouched).

## Design (routing only)

`/production-readiness-review` walks:
1. **Scope** — establish ground truth: the diff under review and which changes are recent (`git diff`, `reconcile` fallback).
2. **Fan out** — `superpowers:dispatching-parallel-agents` launches four blind reviewers, each told to ground every finding in real code/logs/live data and never assume state:
   - performance & bundle-size
   - security & data-access (`security-auditor`)
   - UI/UX correctness (Playwright when available, else static review)
   - test coverage & flaky/stale mocks (`test-engineer`)
3. **Reconcile** — dedupe across reviewers, severity-rank (CRITICAL/HIGH/MEDIUM/LOW), and explicitly flag any defect introduced by recent changes.
4. **Present** — emit the consolidated punch-list. **Stop.** Do not fix.

## Files

- Source (hand-authored): `commands/production-readiness-review.md` (1 file).
- Generated (via `npm run build`): `plugins/continuous-improvement/commands/production-readiness-review.md` mirror.

## TDD / verification

1. `ALL_COMMAND_FILES` is a hardcoded installer set — unchanged (this command distributes via the plugin bundle), so `install.test` stays green.
2. Write the command.
3. `npm run build` (regenerate mirror).
4. `npm run verify:all` green — especially `everything-mirror`, `doc-runtime-claims` (avoid "runtime hook/gate/physically blocks" phrasing — this is a routing command), `scripts-citation-drift` (cite only existing skills/agents), `routing-targets` (unchanged).
5. `git diff --exit-code -- .claude-plugin bin hooks test lib plugins` clean after build.
6. Stage by explicit filename. One commit citing this plan. Open PR; do not merge.

## Risks

- `doc-runtime-claims` false-trip if the prose claims a runtime gate — keep it framed as orchestration/advice.
- Cited agents (`code-reviewer`, `security-auditor`, `test-engineer`) and `superpowers:dispatching-parallel-agents` must exist — all confirmed present.

## Done when

`verify:all` green + PR open + this plan cited in the commit. Prioritizing and acting on the punch-list is the operator's call.
