---
name: deploy-receipt
tier: "1"
description: Enforces Law 4 (Verify Before Reporting) of the 7 Laws of AI Agent Discipline at the deploy seam. A merge into a branch that auto-deploys is not "done" until the deploy provider reports the merged commit SHA running and a healthcheck endpoint returns 200. Companion to the vendored `finishing-a-development-branch` skill — does not replace it, runs after it for projects on Railway, Cloudflare Workers, Vercel, Netlify, Fly.io, or any other auto-deploy target.
origin: https://github.com/naimkatiman/continuous-improvement
disable-model-invocation: true
---

# Deploy Receipt — Closing the Merge-to-Production Gap

## Why This Skill Exists

Multiple sessions in the operator's recent telemetry ended in a "partially achieved" state with the same shape: PR merged green, branch deleted, agent reports done — and then hours later the operator discovers the deploy provider never picked up the commit, was building from a stale lockfile, or silently rolled back. The merge happened. The deploy did not.

`finishing-a-development-branch` (vendored from Obra superpowers in `third-party/superpowers/`) ends at the merge. For repos that do not auto-deploy that is the correct boundary. For repos that DO auto-deploy from `main` (Railway, Cloudflare Workers, Vercel, Netlify, Fly.io, Cloud Run, App Runner, et al.) the merge is only the trigger — the work is not done until the deployed SHA matches the merged HEAD and the application answers a healthcheck.

This skill defines the receipt that closes that gap, without modifying the vendored upstream file.

## When to Activate

Activate when ALL of the following are true:

1. A merge into the deploy branch (typically `main` or `master`) has just landed
2. The repo declares an auto-deploy target — detect via any of:
   - `railway.toml`, `railway.json`, or `RAILWAY_*` env vars in `.env.example`
   - `wrangler.toml` / `wrangler.jsonc` (Cloudflare Workers)
   - `vercel.json` or `.vercel/` directory
   - `netlify.toml`
   - `fly.toml`
   - `app.yaml` (App Engine), `apprunner.yaml` (App Runner)
   - GitHub Actions workflow with `deploy:` job triggered on push to the deploy branch
3. `finishing-a-development-branch` has reported "merged" — not "PR opened", not "review pending"

Do NOT activate when:
- Repo is library-only / package-published (npm, PyPI, crates.io) — those have a different verification surface
- Deploy is manual (operator runs `wrangler deploy` themselves) — the merge is genuinely the boundary
- Merge target is a non-deploy branch (`develop`, `staging-only`, `experimental`)

## What a Receipt Is

A deploy receipt has three components, all required:

1. **SHA match.** The deploy provider's currently-running revision SHA equals the merge commit SHA on the deploy branch. Not "the latest deploy started after the merge" — the SHA itself.
2. **Health response.** A documented healthcheck endpoint (project-specific; common shapes: `GET /health`, `GET /api/health`, `GET /version`) returns HTTP 200 within a reasonable timeout (default 5 minutes from merge).
3. **Build artifact integrity** (when verifiable). If the deploy emits a build hash, log digest, or version string, it matches what was built on the merge commit. If it does not emit one, this component is recorded as `not verifiable for this provider` — it does not block the receipt, but the gap is logged.

A receipt missing any required component is NOT a receipt. The merge is reported as `merged but not deployed — operator action required` per the close-the-loop rule below.

## How to Verify (per provider)

The skill is provider-aware but never hardcodes a specific API key or token shape. Three verification routes, in priority order:

### Route A — Provider CLI (preferred when authenticated)

The CLI is the highest-fidelity source.

| Provider | Command shape | Receipt extraction |
|---|---|---|
| Railway | `railway status --json` | `.deployments[0].meta.commitHash` |
| Cloudflare Workers | `wrangler deployments list --json` | `[0].metadata.deployment_trigger.metadata.commit_hash` |
| Vercel | `vercel inspect <url> --json` | `.gitSource.sha` |
| Netlify | `netlify api listSiteDeploys --data='{"site_id":"<id>"}'` | `[0].commit_ref` |
| Fly.io | `fly releases --json` | `[0].commit_sha` |

If the CLI is not installed or not authenticated in this session, fall through to Route B. Do NOT prompt the operator to install the CLI mid-session — that is a drive-by.

### Route B — GitHub Deployments API (works for any provider that posts back)

```
gh api repos/{owner}/{repo}/deployments --jq '.[0] | {sha, ref, environment}'
gh api repos/{owner}/{repo}/deployments/{id}/statuses --jq '.[0] | {state, target_url}'
```

A `state: success` status whose parent deployment's `sha` matches the merge SHA is a valid receipt component (1).

### Route C — Version endpoint curl (works for any HTTP service)

The most provider-agnostic. Requires the application to expose a version endpoint that returns its build SHA.

```
curl -fsS https://<deployed-host>/version
# Expect a JSON body or plain text containing the merge SHA, e.g. {"commit":"a477ec1"}
# Or a Git-style SHA prefix that matches `git rev-parse --short HEAD`
```

If no version endpoint exists in the project, log this as a gap and recommend adding one as a deferred follow-up — do not fabricate a receipt from a 200 on `/` or `/health` alone, because both can succeed against the OLD deploy.

## Output Shape (always emit this verbatim block)

After running verification:

```
## Deploy Receipt — <project name>
- Merge SHA:        <abbreviated sha>
- Deployed SHA:     <abbreviated sha or "not retrieved (reason)">
- SHA match:        yes | no | not verifiable
- Health endpoint:  <url> → <status code> in <ms>ms
- Build artifact:   <digest if available, else "not emitted by provider">
- Receipt status:   COMPLETE | INCOMPLETE — <reason>
- Verified via:     CLI | GitHub Deployments | version curl | combination
```

A `COMPLETE` receipt is the only state that lets the merge be reported as `done`. `INCOMPLETE` receipts surface a single named operator-action item (e.g. "Railway last deploy is older than the merge — re-trigger from dashboard or `railway up`").

## On-Incomplete Modes

The default behavior on `INCOMPLETE` is **report-only** — the receipt block names the gap, the operator decides recovery. A second mode is available for projects that want the skill to also stage a recovery branch and a failing repro test, without ever executing rollback or merge.

### Mode A — `report-only` (default)

The current behavior. Print the receipt block, surface the named operator-action item, hand off. No branch creation, no PR opened. Use this mode when the operator is at the keyboard and will react to the receipt directly. No flag required.

### Mode B — `open-hotfix-pr` (opt-in)

Use this mode when the receipt is `INCOMPLETE` AND a documented recovery window has elapsed without the deploy self-correcting (default 10 minutes from merge; tunable per project via `verify-ladder.json` `deploy_receipt_recovery_window_seconds`). The skill then stages a recovery branch *for the operator to review*, but never merges or rolls back on its own.

Activate with the explicit invocation:

```
deploy-receipt --on-incomplete=open-hotfix-pr
```

When triggered, this mode performs four steps in order, halting on the first failure:

1. **Branch.** `git checkout -b hotfix/<merge-sha-short>-<symptom-slug> origin/<deploy-branch>`. The symptom slug is derived from the named gap on the receipt — `sha-mismatch`, `health-non-200`, `version-endpoint-stale`, or `no-provider-source`. If the slug cannot be derived, halt and revert to report-only.
2. **Failing repro test.** Write a single test file at `tests/regressions/deploy-<merge-sha-short>.test.<ext>` that asserts the gap (e.g. `expect(deployedSha).toEqual(mergeSha)` or `expect(healthResponse.status).toBe(200)`). The test MUST currently fail when run against production. The skill writes the assertion against the receipt's recorded values, not against speculation. If the test cannot be made to fail deterministically, halt and revert to report-only.
3. **Open PR.** `gh pr create --base <deploy-branch> --head hotfix/... --draft` with body that cites the receipt block verbatim, the merge SHA, the deployed SHA, the named gap, and the documented rollback command for the detected provider (a one-line shell snippet from the table below). Draft state is mandatory — never open as ready-for-review without operator approval.
4. **Hand off.** Print a single-line operator-action item naming the new branch, the PR URL, and the documented rollback command. Stop. Do not modify production. Do not merge the PR. Do not run the rollback.

### Documented rollback commands (cited in the PR body, never executed)

| Provider | Documented rollback command |
|---|---|
| Railway | `railway redeploy --service <service-id> --commit <previous-good-sha>` |
| Cloudflare Workers | `wrangler rollback --message "deploy-receipt: <merge-sha-short> failed health/SHA gate"` |
| Vercel | `vercel rollback <previous-good-deployment-url>` |
| Netlify | `netlify rollback` (interactive — operator picks the prior deploy) |
| Fly.io | `fly releases rollback <previous-good-version>` |

The rollback command is **printed**, not run. The skill's job is to give the operator a complete recovery packet (branch + failing test + cited command) without taking the irreversible step itself.

### When NOT to use Mode B

- The deploy is mid-rolling-restart or mid-canary — the receipt is INCOMPLETE because the deploy is still in progress, not because it failed. Wait for the recovery window first.
- Branch protection on the deploy branch denies hotfix branches by name pattern — the PR will fail to open and the skill should fall back to report-only with a named operator action ("hotfix branch denied by protection — recovery requires direct console access").
- The previous-good SHA cannot be determined from `git log origin/<deploy-branch>` alone — the rollback command in the PR body would be a guess. Fall back to report-only and name the gap as "previous-good SHA unverifiable — operator must select".
- The operator has already started a manual recovery (a fresh deploy is running, the dashboard shows a rollback in progress). Detect via Route A or Route B and skip Mode B for this receipt cycle.

## Anti-Patterns

- **"Eventually consistent" excuse.** Reporting done with `Deployed SHA: not retrieved` and a comment like "deploy will pick up shortly" is exactly the failure mode this skill prevents. There is no eventually — there is COMPLETE or INCOMPLETE.
- **Health-only receipts.** A 200 on `/health` against a stale deploy is not a receipt. Without SHA match, the receipt is INCOMPLETE.
- **Skipping for "small changes."** A docs-only commit still needs a receipt if the deploy branch auto-deploys — small changes have caused stale-build incidents on every provider in the table above.
- **Recommending the CLI install mid-receipt.** If Route A is unavailable, fall through to B then C. Adding tooling is a separate decision the operator makes outside the receipt loop.
- **Treating absence of evidence as evidence of success.** If none of the three routes produce a SHA, the receipt is `INCOMPLETE — no provider source available`, not `COMPLETE (assumed)`.
- **Auto-merging the hotfix PR.** Mode B opens the PR as draft and stops. Auto-merge, `--admin` overrides, and `gh pr merge` calls are refused inside this skill. The hotfix is the operator's decision; the skill stages it but never lands it.
- **Force-pushing or rewriting the hotfix branch.** Mode B branches off `origin/<deploy-branch>` once and pushes once. If the failing test needs changes, the skill writes a new commit on the branch — never `--force` and never `git rebase --interactive`.
- **Executing the rollback command.** The rollback command is cited in the PR body for operator review. Mode B never runs `railway redeploy`, `wrangler rollback`, `vercel rollback`, etc. on its own. If the operator wants execution, they run it themselves or they wire a separate runner; that is a different skill.

## Pairs With

- `finishing-a-development-branch` (vendored, third-party/superpowers/) — runs first; reports the merge. This skill runs after.
- `verification-loop` — same Law 4 family; this skill is the deploy-seam specialization
- `proceed-with-the-recommendation` — routing-table row for "Merge / close branch" should pair `finishing-a-development-branch` with this skill when the project is auto-deploy
- `safety-guard` — orthogonal; safety-guard prevents destructive ops, this verifies post-deploy state

## Close-the-Loop Rule

If the receipt is INCOMPLETE, the merge is NOT reported as a closed item in the Phase 7 summary of `proceed-with-the-recommendation`. It moves to **What is next → Immediate operator action**, with the named action and the exact command or dashboard step. The operator's session record is what determines done — not the agent's optimism.

## Installation

```bash
mkdir -p ~/.claude/skills/deploy-receipt
curl -L https://raw.githubusercontent.com/naimkatiman/continuous-improvement/main/skills/deploy-receipt.md \
  -o ~/.claude/skills/deploy-receipt/SKILL.md
```

Restart the Claude Code session so the registry picks it up.
