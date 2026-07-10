# Releasing continuous-improvement

The release pipeline is **tag-triggered**. Pushing a `v*` tag publishes the npm package and cuts a GitHub Release. Plugin marketplace consumers get new content the moment changes land on `main` — no extra release step required for them.

## What ships, and how

| Surface | Trigger | Mechanism |
|---|---|---|
| **Plugin marketplace** (`/plugin install`) | Merge to `main` | Claude Code clients fetch `.claude-plugin/marketplace.json` from `main` on demand. Consumers refresh with `/plugin update continuous-improvement`. |
| **npm package** (`npm install -g continuous-improvement`) | Tag push (`v*`) | `.github/workflows/release.yml` publishes via OIDC trusted publishing (no token) and creates a GitHub Release. |
| **GitHub Action Marketplace** | Manual (one-time setup + per-release) | Publish `action.yml` via the GitHub Release UI. See [Publishing to Marketplace](#publishing-to-github-marketplace) below. |
| **Landing page** (`continuous-improvement.dev`) | Manual today; automate by connecting the CF Pages project to Git | `wrangler pages deploy docs/landing --project-name=continuous-improvement --branch=main`. The domain is a **Cloudflare Pages** direct-upload project — pushes to `main` do **not** auto-deploy. See [Landing page](#landing-page-continuous-improvementdev) below. |

## Cutting a release

### 1. Bump version on a release PR

The PR contains the version bump, the four landing-page release markers, and the regenerated plugin manifests. `src/lib/plugin-metadata.mts` derives `VERSION` from `package.json` at runtime, so `npm run build` propagates the bump to all 5 generated manifests automatically. Update the `vX.Y.Z` and `REV X.Y.Z` markers in `docs/landing/index.html`; `npm run verify:landing-version` fails if any marker is missing, mixed, or stale.

```bash
git switch main
git pull --ff-only origin main
git switch -c chore/release-vX.Y.Z
npm version X.Y.Z --no-git-tag-version
# Update all four release markers in docs/landing/index.html to X.Y.Z.
npm run build
npm run verify:landing-version
git add package.json package-lock.json \
  docs/landing/index.html \
  .claude-plugin/marketplace.json \
  plugins/continuous-improvement/.claude-plugin/marketplace.json \
  plugins/continuous-improvement/.claude-plugin/plugin.json \
  plugins/beginner.json \
  plugins/expert.json
git commit -m "chore(release): cut vX.Y.Z"
git push -u origin chore/release-vX.Y.Z
gh pr create --title "chore(release): cut vX.Y.Z" --body "Release bump for X.Y.Z."
```

If you forget `npm run build`, CI fails at `git diff --exit-code -- .claude-plugin bin test lib plugins`. Loud failure, not silent — just rebuild, restage the regenerated files, and push a new commit.

### 2. Merge the PR

Squash-merge once CI is green. `main` now has the bumped `package.json`.

### 3. Tag the merge commit

```bash
git switch main
git pull --ff-only origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

### 4. The workflow does the rest

`release.yml` runs on the tag push:

1. `npm install -g npm@latest` (trusted publishing needs npm ≥ 11.5.1)
2. `npm ci` + `npm run build`
3. `git diff --exit-code` to ensure generated artifacts are committed
4. `npm run verify:all` (12 invariants + typecheck)
5. `node --test test/*.test.mjs`
6. Asserts `package.json` version equals the tag
7. `npm publish --access public --provenance` via OIDC trusted publishing (no token)
8. `gh release create --generate-notes`

If any step fails the publish does not happen and the tag remains unpublished. Fix forward with a new patch tag.

## Publishing auth: OIDC trusted publishing (no token)

The workflow authenticates to npm via **OIDC trusted publishing** — there is **no `NPM_TOKEN` secret**. This sidesteps npm's 2FA-on-writes requirement (which makes long-lived CI tokens hit `EOTP`) and produces signed provenance for free.

One-time setup on npmjs.com (per package):

1. npmjs.com → the `continuous-improvement` package → **Settings** → **Trusted Publisher**.
2. Add a **GitHub Actions** publisher: organization/owner `naimkatiman`, repository `continuous-improvement`, workflow filename `release.yml`. Leave the environment field blank (the workflow uses none).
3. Save. The next tag push publishes with no token.

The workflow already grants `permissions: id-token: write`, and bumps npm to ≥ 11.5.1 (trusted publishing minimum) before publishing. If the trusted publisher is **not** configured, `npm publish` fails — configure it before tagging.

### Troubleshooting OIDC publish failures

Trusted publishing has two hard requirements that the workflow must satisfy, plus a configured publisher on npmjs.com:

- **Node ≥ 22.14.0 AND npm ≥ 11.5.1** in the publish step (per [docs.npmjs.com/trusted-publishers](https://docs.npmjs.com/trusted-publishers)). `setup-node` keeps `registry-url: 'https://registry.npmjs.org'` (it anchors the OIDC exchange), and the publish step runs through `npx -y npm@latest publish` so it uses ≥ 11.5.1 even if the global npm is older.
- **The trusted publisher fields are case-sensitive.** owner `naimkatiman`, repo `continuous-improvement`, workflow `release.yml` (filename only), environment **blank**.

Symptom decoder when `build`/`verify`/`tests` all pass but the publish step fails:

| Error | Meaning | Fix |
|---|---|---|
| `E404 PUT .../continuous-improvement` | npm sent `setup-node`'s placeholder `_authToken` — OIDC did **not** mint a token | publish step is running npm < 11.5.1 (or Node < 22.14); force a fresh npm via `npx npm@latest publish` |
| `ENEEDAUTH` "not logged in" | no token at all and OIDC did not engage | same root cause with `registry-url` absent, or the trusted publisher isn't configured/matching |
| `npm notice Signed provenance statement` then `E404` | provenance (npm 10+) worked but the trusted-publishing token mint (npm 11.5.1+) didn't | confirms the publish step's npm is too old |

**Manual-publish fallback** (gets the release out while the OIDC path is being fixed; the account enforces 2FA-on-writes, so an OTP is required):

```bash
git switch main && git pull --ff-only origin main   # at the release commit
npm run build                                        # ensure the tarball is current
npm login                                            # browser/web flow
npm publish --access public                          # prompts for your 2FA OTP; omit --provenance (CI-only)
npm view continuous-improvement version              # verify it landed
gh release create vX.Y.Z --generate-notes            # the failed workflow never reached this step
```

A failed CI publish leaves npm untouched (no partial publish) and skips the "Create GitHub Release" + "Update `v3` tag" steps. A tag-triggered run uses the workflow **as of the tagged commit**, so fixing `release.yml` on `main` only helps the *next* tag — re-running an old tag replays the old workflow.

## Verifying a release shipped

```bash
npm view continuous-improvement version    # matches the tag
gh run list --workflow=release.yml -L 1    # shows the latest run as success
gh release view vX.Y.Z                     # shows generated notes
```

## Landing page (continuous-improvement.dev)

The marketing site at **continuous-improvement.dev** is a **Cloudflare Pages** project named
`continuous-improvement` (direct upload, also reachable at `continuous-improvement.pages.dev`). It is
**not** GitHub Pages and **not** git-connected, so merging changes to `docs/landing/` on `main` does
**not** update the live domain. Deploy it explicitly:

```bash
wrangler login   # one-time OAuth; the account needs Cloudflare Pages: Edit
wrangler pages deploy docs/landing --project-name=continuous-improvement --branch=main --commit-dirty=true
curl -s https://continuous-improvement.dev/ | grep -o "REV 3.[0-9.]*"   # confirm the live version
```

`main` is the project's production branch, so that single command updates production **and** the custom
domain (no preview-only step). The deploy uses your local wrangler OAuth session — there is no
`CLOUDFLARE_API_TOKEN` secret in CI.

**Catch staleness automatically:** the [`landing-drift.yml`](../.github/workflows/landing-drift.yml)
workflow runs daily (and on demand) and first requires every source marker to match `package.json`, then fails if `continuous-improvement.dev` is not serving that version. A stale source marker or missed deploy is reported instead of going unnoticed for weeks. It is
read-only (curl + version compare) and needs no secret.

**Full push-to-deploy (optional, involves a cutover):** Cloudflare fixes a Pages project's connection
type at creation — a **Direct Upload** project (this one) cannot be connected to Git in place, and the
[docs](https://developers.cloudflare.com/pages/get-started/git-integration/) confirm the reverse is also
one-way. To get auto-deploy you must create a *new* Git-connected Pages project from the repo (no build
command, output directory `docs/landing`), verify it on its `*.pages.dev` URL, then move the
`continuous-improvement.dev` custom domain off the old project onto the new one. Since the OAuth-CLI
deploy already works, the manual deploy + drift check above is the lower-risk default.

> The former CI workflows `pages.yml` (GitHub Pages) and `cf-pages.yml` (Cloudflare) were removed. The
> first deployed only to an orphaned `github.io` URL the domain never pointed at; the second failed on
> every run because it needs a `CLOUDFLARE_API_TOKEN` secret that the OAuth-CLI path does not use. The
> result was a live site frozen weeks behind `main` (v3.10.0) with green-looking CI.

## Rollback

npm has a 72-hour unpublish window, but **deprecate instead** — unpublishing breaks dependents.

```bash
npm deprecate continuous-improvement@X.Y.Z "Use X.Y.W instead — see <issue link>"
```

Then cut a new patch release that supersedes the bad version.

## Publishing to GitHub Marketplace

The GitHub Action (`action.yml`) is **not** auto-published to the Marketplace by CI. After the `release.yml` workflow creates a GitHub Release, you must manually publish the Action:

1. Go to **Releases** → the newly created release (e.g. `v3.11.0`).
2. Click **"Publish this Action to the GitHub Marketplace"**.
3. Confirm the `action.yml` metadata (name, description, inputs, outputs) is correct.
4. Click **"Publish release"**.

Once published, the Action appears at:
`https://github.com/marketplace/actions/ai-agent-discipline-linter`

Consumers install it in their workflow with:
```yaml
- uses: naimkatiman/continuous-improvement@v3
```

> **Note:** The `release.yml` workflow automatically updates the major-version tag (e.g. `v3`) to point at the latest release. No manual step is needed.

## Optional upgrades

- **Tag protection** — under Settings → Tags → New rule, require admin role to create `v*` tags. Stops accidental tag pushes from triggering a publish.
