# Verification Command Matrix

- Status: active operator reference
- Scope: documentation-only; no source, generated artifact, action metadata, hook behavior, MCP schema, release, deployment, env/secret, third-party snapshot, cron, staging, commit, push, reset, rebase, or config change
- Last verified: 2026-06-19 21:49 MPST (+0800)

## Purpose

`continuous-improvement` has several public and generated surfaces: TypeScript source, committed `.mjs` artifacts, Claude plugin manifests, skills, hooks, MCP tools, a GitHub Action linter, release workflows, and a static landing page. Future Zaky/Fatin/maintainer runs should choose the smallest verification that credibly exercises the changed surface, then escalate only when the surface is public, generated, or release-sensitive.

This matrix is a verification selector, not permission to change behavior. It is especially important while the repository remains `main...origin/main [ahead 1, behind 3]` with accumulated dirty lanes documented in `docs/ai-improvement/uncommitted-source-verification-handoff.md` and quantified in `docs/ai-improvement/source-review-metrics.md`.

Code changes: none in this artifact.

## Source-of-truth files inspected

| Area | Files inspected | Why it matters |
|---|---|---|
| Project rules | `CLAUDE.md`, `CONTRIBUTING.md` | Define the repo's verification floor, one-concern PR rule, generated-artifact discipline, Windows staging hazards, and release/PR hygiene. |
| Package scripts | `package.json` | Defines `build`, `test`, `typecheck`, `verify:generated`, and the 12-script `verify:all` ladder. |
| TypeScript build | `tsconfig.json`, `src/**/*.mts` convention | `.mts` is source; `.mjs` under `bin/`, `hooks/`, `lib/`, `test/`, and plugin mirrors is generated. |
| GitHub Action | `action.yml`, `.github/workflows/ci.yml` | Action contract is `node20` + `bin/lint-transcript.mjs`; CI runs Node 18/20/22, build, tests, zero-runtime-deps, generated diff, skill/doc checks. |
| Release pipeline | `.github/workflows/release.yml`, `docs/RELEASING.md`, `docs/ai-improvement/release-readiness-checklist.md` | Tag-triggered npm publish uses Node 22 + OIDC; release work must not mix unrelated changes. |
| Landing page | `.github/workflows/landing-drift.yml`, `docs/landing/index.html`, `docs/RELEASING.md` | Landing source and deployed site drift independently; deployment remains owner-controlled. |
| Public-surface map | `docs/ai-improvement/mcp-cli-compatibility-contract.md` | Maps bins, MCP mode/tool/resource contracts, generated manifests, hooks, and action inputs/outputs. |
| Dirty-tree status | `docs/ai-improvement/uncommitted-source-verification-handoff.md`, `docs/ai-improvement/source-review-metrics.md`, live `git status` | Current local state is broader than a clean checkout and is now `main...origin/main [ahead 1, behind 3]`; green tests and metrics are review aids, not review approval. |

## Default selection rule

1. Verify from the repository root: `C:/Ai/continuous-improvement`.
2. For docs-only edits, use read-back/static checks plus `npm run typecheck` as the floor.
3. For `.mts` or source-skill changes, rebuild before judging generated artifacts.
4. For public Action, MCP, bin, hook, or generated-manifest changes, run the targeted test/probe for that surface and then `npm run verify:all`.
5. For release/tag/publish work, start from a clean branch and use the release-readiness checklist; this cron job must not tag, publish, deploy, or stage files.
6. Treat passing local Node 24 checks as local evidence only; CI compatibility still targets Node 18/20/22 and release uses Node 22.

## Matrix

| Change surface | Primary files/examples | Smallest credible verification | Escalate when | Notes / guardrails |
|---|---|---|---|---|
| Docs-only AI tracking | `docs/ai-improvement/*.md`, central board row | Read back changed sections; `git diff --check`; for new/untracked docs use `git diff --no-index --check -- /dev/null <file>` and `git diff --no-index --stat -- /dev/null <file>`; `git status --short --branch --untracked-files=all`; `npm run typecheck` | The docs include runtime-claim wording, package-script claims, or stale-token cleanup | Do not record planned checks as final. If the implementation log is patched after verification, rerun static/read-back checks. |
| General Markdown/product docs | `README.md`, `QUICKSTART.md`, `CONTRIBUTING.md`, `docs/*.md` | Read back changed lines; targeted stale-copy search; `git diff --check`; `npm run typecheck` | Docs assert exact generated counts, public surface names, hook behavior, package scripts, or release steps | If docs mention runtime hooks, keep a nearby real `hooks/<name>.mjs` anchor or run `npm run verify:doc-runtime-claims`. |
| TypeScript source logic | `src/lib/*.mts`, `src/bin/*.mts`, `src/hooks/*.mts` | Add or update focused tests first when behavior changes; `npm run build`; targeted `node --test test/<surface>.test.mjs`; `npm run verify:all` | Public contract, parser/scorer/index, path/time/identity boundary, or generated artifact changes | Never hand-edit generated `.mjs`; commit `.mts` and generated output together after owner/maintainer review. |
| Test-only changes | `src/test/*.mts` | `npm run build`; targeted `node --test test/<file>.test.mjs`; `npm run verify:all` | Tests assert docs substrings, generated behavior, or a public Action/MCP contract | Regenerated `test/*.test.mjs` must ride with source test changes. |
| GitHub Action transcript linter | `action.yml`, `src/bin/lint-transcript.mts`, `src/test/lint-transcript.test.mts`, `bin/lint-transcript.mjs`, `test/lint-transcript.test.mjs` | TDD regression for input/output contract; `npm run build`; `node --test test/lint-transcript.test.mjs`; `npm run verify:all`; parse `action.yml` | Input/output name, runtime target, strict behavior, or report format changes | Renaming/removing inputs or outputs is approval-required. Keep JavaScript Action env names and `GITHUB_OUTPUT` behavior aligned. |
| MCP tools, modes, resources, and public bins | `src/lib/plugin-metadata.mts`, `src/bin/mcp-server.mts`, `src/bin/unified-cli.mts`, `src/bin/install.mts`, `plugins/beginner.json`, `plugins/expert.json`, `package.json` `bin` | Focused unit/integration probe for changed tool/bin; `npm run build`; `npm run verify:tool-count`; `npm run verify:routing-targets`; `npm run verify:all` | Tool names, input schemas, mode defaults, resource URIs, transport framing, or public bin names change | Use `docs/ai-improvement/mcp-cli-compatibility-contract.md` before changing the public surface. Non-additive changes need owner/Fatin approval. |
| Source skills and plugin mirrors | `skills/*.md`, `skills/README.md`, `plugins/continuous-improvement/skills/**/SKILL.md` | Edit source skill first; `npm run build`; `npm run verify:skill-mirror`; `npm run verify:skill-tiers`; `npm run verify:skill-law-tag`; `npm run verify:docs-substrings`; `npm run verify:all` | Skill count, tier, routing target, or runtime-claim copy changes | `plugins/.../skills/**/SKILL.md` is generated/mirrored; avoid partial staging. |
| Generated manifests and mirrors | `.claude-plugin/marketplace.json`, `plugins/continuous-improvement/**`, `plugins/beginner.json`, `plugins/expert.json`, `bin/`, `hooks/`, `lib/`, `test/` | `npm run build`; `git diff --exit-code -- .claude-plugin bin hooks test lib plugins` or `npm run verify:generated`; `npm run verify:all` | Any source or version change regenerates artifacts | Direct generated edits are wiped by build and have caused prior CI failures. |
| Hook behavior and observation privacy | `src/hooks/*.mts`, `hooks/*.mjs`, `src/bin/observe.mts`, `SECURITY.md`, observation/recall docs | Focused hook/observation tests; `npm run build`; relevant targeted `node --test`; `npm run verify:doc-runtime-claims`; `npm run verify:all` | Enforcement semantics, privacy/redaction/export behavior, or observation schema changes | Hook fail-open/default behavior and raw observation sharing boundaries are approval-sensitive. |
| Release-only version bump | `package.json`, `package-lock.json`, generated plugin manifests, `CHANGELOG.md` | Use `docs/ai-improvement/release-readiness-checklist.md`; `npm run build`; `git diff --exit-code -- .claude-plugin bin hooks test lib plugins`; `npm run verify:all`; `node --test test/*.test.mjs` | Any release tag, npm publish, GitHub Release, Marketplace publication, or landing deploy is needed | This cron job must not tag, publish, deploy, or stage. Release PRs must start from clean fast-forwarded `main`. |
| Landing source copy/version | `docs/landing/index.html`, `.github/workflows/landing-drift.yml`, `docs/RELEASING.md` | Source read-back; targeted REV search; `git diff --check`; if release-sensitive, use release-readiness checklist | Deployed site must be updated or drift check is failing | Cloudflare Pages deploy is owner-controlled; do not run `wrangler pages deploy` autonomously. |
| Third-party snapshots | `third-party/<name>/`, `MANIFEST.md`, `OUR_NOTES.md`, `CLAUDE.md` | Use `node bin/refresh-third-party.mjs <name>` from an appropriate worktree; `npm run verify:third-party-shape`; `npm run verify:all` | Upstream snapshot SHA/version changes or vendored content changes | Never edit files inside `third-party/<name>/` directly. |
| Dirty-tree stabilization / handoff | `docs/ai-improvement/uncommitted-source-verification-handoff.md`, `docs/ai-improvement/source-review-metrics.md`, current git state | `git fetch --prune`; merge-base remote/local path inventory; dirty/remote overlap probe; `git diff --shortstat`/`--numstat` by lane; source/test/config `pygount` where review sizing matters; read-back handoff/metrics; targeted tests for dirty lanes if refreshing evidence | Branch is ahead/behind remote, dirty paths overlap remote changes, or runtime lanes are being considered | Passing tests and source metrics are safety/review aids, not owner/Fatin review approval. Avoid new runtime work until lanes are split/kept/rebased/reverted. |
| High-risk or approval-required surfaces | release infra, env/secrets, auth/payment, deployment targets, cron jobs, public schema/name changes, broad refactors | Documentation-only decision note or owner/Fatin escalation; no runtime mutation | Approval is explicitly granted and scoped | Record the decision, tests, rollback plan, and exact allowed files before implementing. |

## Quick recipes

### Docs-only tracking increment

```bash
pwd
git status --short --branch --untracked-files=all
npm run typecheck
git diff --check
git diff --no-index --check -- /dev/null docs/ai-improvement/<new-doc>.md
git diff --no-index --stat -- /dev/null docs/ai-improvement/<new-doc>.md
```

Expected: typecheck exits 0; static checks show no whitespace-error lines. `--no-index` exits 1 when comparing `/dev/null` to a real doc; that is expected when the output has only diff headers or line-ending notes.

### Source behavior change

```bash
npm run build
node --test test/<nearest-surface>.test.mjs
npm run verify:all
```

Add a RED regression first when behavior changes. Use the full `npm test` suite when the touched surface is broad, cross-cutting, or release-facing.

### Public Action / MCP / CLI contract change

```bash
npm run build
node --test test/lint-transcript.test.mjs   # for action/linter changes
npm run verify:tool-count                   # for MCP/tool count claims
npm run verify:routing-targets              # for routing/skill target changes
npm run verify:all
```

Pick the targeted probes that match the public surface, then run `verify:all` so generated manifests, docs substrings, mirror parity, and typecheck are covered together.

### Release preflight

```bash
npm ci
npm run build
git diff --exit-code -- .claude-plugin bin hooks test lib plugins
npm run verify:all
node --test test/*.test.mjs
```

Only run this from a clean, reviewed release branch or after a merged release PR on local `main`. Do not run tag/publish/deploy commands from the recurring cron job.

## Approval boundaries

This matrix does not authorize architecture changes, framework replacement, DB/schema changes, auth/authorization/payment changes, production env var changes, deployment target changes, new large dependencies, broad refactors, major renames, business-rule changes, secret/credential changes, third-party snapshot edits, cron changes, release tags, npm publish, GitHub Marketplace publication, Cloudflare Pages deploys, or public contract-breaking changes.

Owner/Fatin approval should name the allowed files, behavior, verification ladder, and rollback path before any of those surfaces are touched.

## Recommended next move

Use this matrix while stabilizing the current dirty/ahead/behind lanes. The active product next move remains owner/Fatin/maintainer review of local commit `aa6df67`, the 3 remote commits now on `origin/main`, the GitHub Action linter lane, landing marker, strategic-compact source/mirror cleanup, plan/status docs, AI tracking docs, and untracked policy docs before adding new runtime work. `docs/ai-improvement/source-review-metrics.md` is the current churn/source-size packet for sequencing that review.
