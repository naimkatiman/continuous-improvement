---
name: production-readiness-review
description: "Parallel multi-agent readiness gate — fan blind reviewers across performance, security, UI/UX, and test coverage, each grounding findings in real code/logs/live data, then reconcile into one deduplicated, severity-ranked punch-list. Reports only; never fixes, merges, or deploys."
---

# /production-readiness-review

The review-side sibling of `/ship`. Fans a set of blind, specialized reviewers across distinct dimensions, then reconciles their findings into a single prioritized punch-list. It reports — it does not fix. Fixing a finding is a separate `/ship` run.

Pure routing over existing skills and agents. Adds no new code.

## Usage

```
/production-readiness-review [scope]
```

`scope` defaults to the current branch diff against `origin/main`. Pass a path or PR number to narrow it.

## Behavior

1. **Scope** — establish ground truth: the diff under review and which changes are recent (`git diff`; `reconcile` fallback for branch/base state). Recent changes get extra scrutiny because they are the likeliest source of self-inflicted defects.
2. **Fan out** — `superpowers:dispatching-parallel-agents` launches four reviewers, each blind to the others. Every reviewer is instructed to ground each finding in real code, logs, or live queries, and never to assume or fabricate state:
   - **Performance & bundle-size** — hot paths, N+1 queries, unbounded work, regressions.
   - **Security & data-access** (`security-auditor`) — authn/authz, input handling, injection, secret exposure, unsafe data access.
   - **UI/UX correctness** — verified live with Playwright when the MCP is available, else static review of the changed surface.
   - **Test coverage & flaky/stale mocks** (`test-engineer`) — uncovered branches, stale mocks, timing-flaky tests.
3. **Reconcile** — a final pass dedupes findings across reviewers, ranks each CRITICAL / HIGH / MEDIUM / LOW by severity and confidence, and explicitly flags any defect introduced by the changes under review.
4. **Present** — emit the consolidated punch-list, severity-ranked, with file references. **Stop.**

## Hard stops (report, never act)

- Does not fix, edit, commit, merge, or deploy anything — output is a punch-list only.
- A reviewer that cannot ground a finding marks it `unverified` rather than asserting it.
- If a dimension's tooling is unavailable (e.g. no Playwright MCP), it says so rather than silently skipping coverage.

## Anti-patterns this command refuses

- **Fabricated state.** No finding may rest on an assumed SHA, row, or log line — ground it or mark it `unverified`.
- **Silent skip.** A dimension that cannot run is reported as not-run, never dropped from the summary.
- **Drive-by fix.** Findings become `/ship` tasks; this command does not touch code.

## Composition

Routes through: `reconcile` (scope/ground truth) → `superpowers:dispatching-parallel-agents` (fan-out) → the `security-auditor` and `test-engineer` agents (two of the four dimensions) → a reconciliation pass that ranks and dedupes. Each step falls back to its inline behavior when the preferred skill or agent is not installed.

## Example

```
/production-readiness-review #246
```

Scopes PR #246's diff, fans four blind reviewers across performance, security, UI/UX, and test coverage, then returns one deduplicated severity-ranked punch-list — flagging anything the PR's own changes introduced — and stops for you to prioritize.
