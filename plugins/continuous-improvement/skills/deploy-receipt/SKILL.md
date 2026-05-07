---
name: deploy-receipt
tier: "1"
description: Enforces Law 4 (Verify Before Reporting) of the 7 Laws of AI Agent Discipline at the deploy seam. A merge into a branch that auto-deploys is not "done" until the deploy provider reports the merged commit SHA running and a healthcheck endpoint returns 200. Companion to the vendored `finishing-a-development-branch` skill — does not replace it, runs after it for projects on Railway, Cloudflare Workers, Vercel, Netlify, Fly.io, or any other auto-deploy target.
origin: https://github.com/naimkatiman/continuous-improvement
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

## Anti-Patterns

- **"Eventually consistent" excuse.** Reporting done with `Deployed SHA: not retrieved` and a comment like "deploy will pick up shortly" is exactly the failure mode this skill prevents. There is no eventually — there is COMPLETE or INCOMPLETE.
- **Health-only receipts.** A 200 on `/health` against a stale deploy is not a receipt. Without SHA match, the receipt is INCOMPLETE.
- **Skipping for "small changes."** A docs-only commit still needs a receipt if the deploy branch auto-deploys — small changes have caused stale-build incidents on every provider in the table above.
- **Recommending the CLI install mid-receipt.** If Route A is unavailable, fall through to B then C. Adding tooling is a separate decision the operator makes outside the receipt loop.
- **Treating absence of evidence as evidence of success.** If none of the three routes produce a SHA, the receipt is `INCOMPLETE — no provider source available`, not `COMPLETE (assumed)`.

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
