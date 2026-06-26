# Release Readiness Checklist

- Status: active operator checklist
- Scope: documentation-only; no version bump, tag push, publish, marketplace action, landing deploy, cron change, or production configuration change
- Last verified: 2026-06-18 08:08 MPST (+0800)

## Purpose

`continuous-improvement` ships through several surfaces that do not all move on the same trigger. This checklist gives Zaky, Fatin, and maintainers a single pre-release/post-release reference so a future release can prove the npm package, Claude plugin marketplace, GitHub Action, generated manifests, major-version tag, and landing page are all in the expected state.

Use this checklist before cutting a release PR, before tagging, and again after the tag workflow finishes. It does **not** grant permission to publish, retag, deploy the landing page, rotate secrets, or alter release infrastructure; those remain owner-controlled actions.

## Source-of-truth files inspected

| Surface | Current source of truth | Notes from inspection |
|---|---|---|
| Package version and scripts | `package.json` | Version is `3.14.0`; `npm run build`, `npm run verify:all`, `npm test`, and `npm run verify:generated` are the core release gates. |
| Release procedure | `docs/RELEASING.md` | Tag-triggered npm publish via OIDC; plugin marketplace refreshes from `main`; GitHub Action Marketplace publish is manual; landing deploy is manual Cloudflare Pages direct upload. |
| Release workflow | `.github/workflows/release.yml` | Runs on `v*` tags, Node 22, npm upgrade, `npm ci`, build, generated-artifact diff, `verify:all`, tests, tag/package version match, OIDC publish, GitHub Release, and major-version tag update. |
| PR CI | `.github/workflows/ci.yml` | Tests Node 18/20/22, build, `npm test`, zero runtime dependencies, generated artifact diff, law tags, skill mirror, docs substrings, and instinct-pack JSON. |
| Landing drift | `.github/workflows/landing-drift.yml` | Daily/read-only drift check compares `docs/landing/index.html` REV to the deployed domain or `*.pages.dev`; it cannot deploy. |
| GitHub Action metadata | `action.yml` | Action uses `node20` and `bin/lint-transcript.mjs`; Marketplace publish remains manual after GitHub Release creation. |
| Plugin marketplace manifest | `.claude-plugin/marketplace.json` | Generated manifest currently lists the native plugin at `3.14.0` and the four vendored companion plugins. |
| Landing source | `docs/landing/index.html` | Source now contains `REV 3.14.0`, matching `package.json` and `.claude-plugin/marketplace.json`; production deployment is still manual and was not run by the scheduled agent. |
| Change record | `CHANGELOG.md` | Latest entry is `3.14.0` dated 2026-06-14. |

## Default release-selection rule

Use the narrowest command that proves the surface being touched, but before a release tag use the full release gates. Do not rely on local Node 24-only results for compatibility claims; PR CI targets Node 18/20/22, and the publish workflow uses Node 22.

## Pre-release PR checklist

Before opening a release PR:

- [ ] Start from a clean, fast-forwarded `main` branch.
- [ ] Confirm no unrelated tracked or untracked work is included in the release branch.
- [ ] Decide the release version from `CHANGELOG.md`, merged PRs, and npm semver rules.
- [ ] Run `npm version X.Y.Z --no-git-tag-version` on the release branch.
- [ ] Run `npm run build` immediately after the version bump.
- [ ] Stage only explicit release files:
  - `package.json`
  - `package-lock.json`
  - `.claude-plugin/marketplace.json`
  - `plugins/continuous-improvement/.claude-plugin/marketplace.json`
  - `plugins/continuous-improvement/.claude-plugin/plugin.json`
  - `plugins/beginner.json`
  - `plugins/expert.json`
- [ ] Do not stage broad repo diffs with `git add .` on the Windows host.
- [ ] Verify generated artifacts with `npm run verify:generated` or the full `npm run verify:all` ladder as appropriate.
- [ ] If `docs/landing/` changes, verify the source REV and plan the manual Cloudflare Pages deploy separately from the npm tag.

## Required local checks before tagging

Run from repo root after the release PR merge is on local `main`:

```bash
git switch main
git pull --ff-only origin main
npm ci
npm run build
git diff --exit-code -- .claude-plugin bin hooks test lib plugins
npm run verify:all
node --test test/*.test.mjs
node -e "const pkg=require('./package.json'); const fs=require('fs'); JSON.parse(fs.readFileSync('.claude-plugin/marketplace.json','utf8')); console.log('release preflight package', pkg.version);"
```

Expected result:

- install, build, `verify:all`, and tests pass;
- generated-artifact diff is empty;
- package and generated plugin manifests agree on the intended version;
- no release-only change is mixed with unrelated docs/code work.

## Tag and workflow checklist

Only after the release PR is merged and local `main` is fast-forwarded:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

Then verify the tag workflow:

- [ ] `gh run list --workflow=release.yml -L 1` shows the latest tag run.
- [ ] The run used Node 22 and upgraded npm before publishing.
- [ ] `npm publish` used `npx -y npm@latest publish --access public --provenance` with no `NPM_TOKEN`.
- [ ] The tag/package version check passed.
- [ ] GitHub Release was created with `--verify-tag`.
- [ ] The floating major tag (for example `v3`) was retargeted by the workflow.

## Post-release verification

After the workflow succeeds:

```bash
npm view continuous-improvement version
gh release view vX.Y.Z
gh run list --workflow=release.yml -L 1
```

Also verify surfaces that the workflow does not fully own:

- [ ] Claude plugin marketplace source is correct on `main`; consumers update with `/plugin update continuous-improvement`.
- [ ] GitHub Action Marketplace page is manually published from the new GitHub Release if the release should appear in Marketplace.
- [ ] `action.yml` still points to `bin/lint-transcript.mjs` and `node20` unless a dedicated compatibility change has been approved.
- [ ] Landing page source `docs/landing/index.html` has the intended REV and product copy.
- [ ] If landing changed, run the owner-controlled deploy only after approval:

```bash
wrangler pages deploy docs/landing --project-name=continuous-improvement --branch=main --commit-dirty=true
curl -s https://continuous-improvement.dev/ | grep -o "REV 3.[0-9.]*"
```

## Failure handling

| Failure | What it means | Safe response |
|---|---|---|
| `git diff --exit-code -- .claude-plugin bin hooks test lib plugins` fails | Generated artifacts do not match source/version changes. | Re-run `npm run build`, stage explicit generated files, and rerun verification before tagging. |
| `npm run verify:all` fails | One of the content/runtime invariants failed. | Fix the invariant in a narrow PR; do not tag around it. |
| `node --test test/*.test.mjs` fails | Release workflow would fail before publish. | Fix or explicitly quarantine the regression before tagging; do not publish. |
| Tag/package mismatch | The pushed tag does not match `package.json`. | Delete/supersede only with owner approval; otherwise fix forward with the next patch tag. |
| OIDC publish fails with auth-like errors | Trusted-publisher setup, Node/npm floor, or registry anchoring is wrong. | Follow `docs/RELEASING.md`; failed publish leaves npm untouched. Fix forward with a new patch tag when needed. |
| GitHub Release exists but Marketplace action is not published | Action Marketplace step is manual. | Owner/Fatin publishes from the release UI after checking `action.yml`. |
| Landing drift fails | The deployed Cloudflare Pages site does not match `docs/landing/index.html` or the REV pattern changed. | Do not edit deploy config in the cron job; owner runs the documented deploy or updates the drift pattern in a focused PR. |

## Approval boundaries

Do not autonomously:

- push release tags;
- publish to npm;
- publish the GitHub Action Marketplace release;
- deploy Cloudflare Pages;
- change OIDC trusted-publisher settings;
- add release secrets or `NPM_TOKEN`;
- force-update tags outside the existing workflow;
- change release workflow permissions or deployment targets;
- change generated artifact policy;
- mix runtime behavior changes into a release-only PR.

## Current watchpoints for the next release

- `docs/landing/index.html` now advertises `REV 3.14.0` to match the package and plugin manifest. The source change alone does not update `continuous-improvement.dev`; owner/Fatin must approve and run the documented Cloudflare Pages deploy plus drift check before treating the public site as current.
- The repo currently has untracked AI-improvement artifacts from scheduled runs. A release PR should start from a clean branch and stage only explicit release files.
- The `skill-distill` empty verification-output policy remains approval-required and should not be smuggled into a release checklist or release bump.

## Non-goals

- No release is cut by this checklist.
- No generated artifacts are modified by this checklist.
- No landing page source or deployed site is changed by this checklist.
- No marketplace, npm, GitHub, Cloudflare, or cron settings are changed by this checklist.
