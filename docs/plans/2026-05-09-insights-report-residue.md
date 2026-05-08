# 2026-05-09 — Insights-report residue (3 horizon gaps)

Plan for the small follow-up stack that closes the three horizon items from the 28-day usage report (`C:\Users\thinkpad\.claude\usage-data\report.html`) which the v3.7 → v3.9 release train did NOT cover. The first release (PRs #83 + #84) landed `deploy-receipt` and the P-MAG third surface; the second release (PRs #85 + #86 + #87 + #88 + #89) landed the environment grain, stacked-PR plan precondition, per-project verify ladder, and friction harvester; the unified-dispatcher train (PRs #91 → #95 + #101) wrapped report-derived autonomous workflows as `/release-train` and `/swarm`.

This plan completes the residue: the auto-rollback / hotfix-PR generation layer the report asked for, the synthetic-checks rung that turns receipts into baseline diffs, and the paste-in CLAUDE.md template the report literally provided four blocks for.

Per global CLAUDE.md: feature spans 3 commits + plan doc; mandatory before any implementation edit; cited in every commit it produces.

## Goal

Close the three remaining horizon items from the report as a single small stack on `feat/insights-report-residue`:

1. **Self-Healing Production Verification Loop (auto-rollback / hotfix-PR portion).** `deploy-receipt` today verifies the deploy seam and surfaces `INCOMPLETE` to the operator. The report asked for the next step: when INCOMPLETE persists past a known recovery window, open a `hotfix/<sha>-<symptom>` branch with a failing repro test and a documented rollback recommendation. The skill describes when to do this and what shape; it does NOT execute rollbacks itself (operator-gated).

2. **Synthetic-checks against staging baseline diff.** The report asked for synthetic checks that run against production after deploy and diff against a staging baseline. Today there is no convention for where these live or how they plug into the verify ladder. PR adds `synthetic-checks/` directory convention, a sample, and a new `synthetic_checks` rung in `verify-ladder.example.json` + `verification-loop` skill text.

3. **Four CLAUDE.md paste-in blocks.** The report listed four CLAUDE.md additions ("Verification Discipline", "Environment Notes", "Think Before Acting", "Git & Deploy Workflow") with copy-buttons. The discipline behavior was encoded as skills (gateguard, workspace-surface-audit, verification-loop, deploy-receipt) — but project-local CLAUDE.md text is still missing. Add `templates/insights-claude-md.md` so any project can paste them in without re-reading the report.

Each commit is single-concern, mirrored to its plugin copy in the same commit (skill-mirror invariant from PR #83), and stays under the file budget.

## Out of scope (logged here so we don't drift)

- **Webhook-driven long-lived verification agent.** Receipt + ladder run in-session at merge time. A separate orchestrator listening for Railway/Cloudflare webhooks is a different surface and a different deployment shape (Cloudflare Worker, GitHub Actions cron, etc.) — separate plan.
- **Auto-rollback execution.** The skill describes when an operator should rollback and pins the documented commands; it never runs `railway rollback` or `wrangler rollback` on its own. That is operator-gated and the boundary is intentional.
- **Hook-form deploy preflight in `.claude/settings.json`.** The report originally asked for a hook; we already shipped this as a skill (`deploy-receipt`) for parity. Hook form would duplicate the surface.
- **Removing the existing skill-form deploy-receipt.** The new mode is additive. Default behavior (`--on-incomplete=report-only`) is preserved; `--on-incomplete=open-hotfix-pr` is opt-in.

## Per-PR scope

### Commit 1 — `feat(deploy-receipt): --on-incomplete=open-hotfix-pr mode`

**Files touched (2):**
- `skills/deploy-receipt.md` — new "On-Incomplete Modes" section after "Output Shape", documenting two modes:
  - `report-only` (default, current behavior — surface INCOMPLETE as operator-action item)
  - `open-hotfix-pr` (new — when INCOMPLETE persists past recovery window, write failing repro test + open `hotfix/<sha>-<symptom>` branch + post the documented rollback command as a PR comment, but never execute rollback or merge)
  Plus three new anti-patterns specific to the new mode (no auto-merge of hotfix PR; no force-push; no skipping branch protection).
- `plugins/continuous-improvement/skills/deploy-receipt/SKILL.md` — byte-identical mirror.

**WILL build:** the contract for the new mode — when it activates, what the hotfix branch contains, what the PR description must cite, and the explicit refusals.

**Will NOT build:** automation that opens the PR. The skill authors the contract; the agent (or future companion script) executes it. No new `bin/` script in this PR.

**Verification:** `npm run verify:all` (skill-mirror confirms byte-identical, docs-substrings unchanged unless lockdown is added later, typecheck clean).

**Lines estimate:** ~50 added to standalone + same to plugin = ~100 LOC across 2 files.

### Commit 2 — `feat(verification-loop): synthetic-checks/ rung + staging-baseline convention`

**Files touched (5):**
- `synthetic-checks/README.md` — new directory convention. Documents:
  - one file per check (`<name>.synthetic.{ts,mjs,sh}`)
  - input contract (env vars: `BASE_URL`, `BASELINE_URL`, `EXPECTED_SHA`)
  - output contract (exit code 0 = match baseline, non-zero = drift; stdout is human-readable diff)
  - the new ladder rung calls each file with the production base URL and diffs against the staging baseline URL
- `synthetic-checks/example-version-endpoint.synthetic.sh` — minimal sample showing the contract (curl `/version` against `$BASE_URL` and `$BASELINE_URL`, diff the two payloads, exit 1 on diff).
- `templates/verify-ladder.example.json` — add `synthetic_checks` field to each starter shape; add a new `_synthetic_checks_doc` block explaining how the rung resolves files in `synthetic-checks/`.
- `skills/verification-loop.md` — extend Phase 8 to include the synthetic-checks rung that runs after deploy-receipt is COMPLETE; document inputs, outputs, and the "drift surfaces as INCOMPLETE" rule.
- `plugins/continuous-improvement/skills/verification-loop/SKILL.md` — byte-identical mirror.

**WILL build:** the directory convention, one runnable sample, the ladder field, and the skill text describing when the rung runs and how a drift result is surfaced.

**Will NOT build:** a runner script that orchestrates the synthetic checks. The skill authors the contract; the agent invokes the files via the resolved ladder. No new `bin/` script in this PR.

**Verification:** `npm run verify:all` (skill-mirror, docs-substrings, typecheck — all unchanged), plus a manual `bash synthetic-checks/example-version-endpoint.synthetic.sh` smoke run with two URLs that match (exit 0) and two URLs that disagree (exit 1).

**Lines estimate:** ~40 (README) + ~20 (sample) + ~10 (ladder) + ~25 (skill) × 2 mirrors = ~120 LOC across 5 files.

### Commit 3 — `docs(templates): insights-claude-md paste-in blocks`

**Files touched (2):**
- `templates/insights-claude-md.md` — new file. Contains the four blocks from the report verbatim, each in its own `## Section` with a short header explaining when to paste it. Headers paraphrase the report; block content stays as written so anyone re-reading the report can match them line-for-line.
- `README.md` — one-line pointer in the existing templates/conventions section so the file is discoverable.

**WILL build:** the four blocks (Verification Discipline, Environment Notes, Think Before Acting, Git & Deploy Workflow) with one-line preamble per block, plus the README pointer.

**Will NOT build:** automation that pastes them into a project's CLAUDE.md. This is opt-in copy.

**Verification:** `npm run verify:all` (docs-substrings: README pointer phrasing not locked, but the four heading literals from this template will be added as deferred lockdowns in a follow-up PR if drift becomes a risk).

**Lines estimate:** ~80 LOC for the template + 1 line in README = ~81 LOC across 2 files.

## Total scope

- 3 commits, 9 files of substance (2 + 5 + 2)
- Estimated ~300 LOC added, 0 removed
- All within Surgical Changes guardrails (≤15 files per commit, single concern each)
- Plan doc cited in every commit message

## Verification at branch close

Before opening the PR:
1. `npm run build` — clean tsc + manifest regen
2. `npm run verify:all` — skill-mirror, docs-substrings, everything-mirror, routing-targets, typecheck
3. `npm test` — full suite (build + node --test test/*.test.mjs)
4. `git diff --stat origin/main...HEAD` — confirm file count is bounded (target: ≤9 files)
5. Manual: re-read each new SKILL.md edit for Law-4 framing parity with the existing deploy-receipt and verification-loop text

## PR shape

Single PR off `feat/insights-report-residue` → `main`. Title: `feat(insights-residue): hotfix-pr mode + synthetic-checks rung + claude-md template`. Body cites this plan doc, names the three horizon items closed, and re-states the four out-of-scope items so a reviewer can hold the line.
