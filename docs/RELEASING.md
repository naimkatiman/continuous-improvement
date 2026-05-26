# Releasing continuous-improvement

The release pipeline is **tag-triggered**. Pushing a `v*` tag publishes the npm package and cuts a GitHub Release. Plugin marketplace consumers get new content the moment changes land on `main` — no extra release step required for them.

## What ships, and how

| Surface | Trigger | Mechanism |
|---|---|---|
| **Plugin marketplace** (`/plugin install`) | Merge to `main` | Claude Code clients fetch `.claude-plugin/marketplace.json` from `main` on demand. Consumers refresh with `/plugin update continuous-improvement`. |
| **npm package** (`npm install -g continuous-improvement`) | Tag push (`v*`) | `.github/workflows/release.yml` runs `npm publish` and creates a GitHub Release. |
| **GitHub Action Marketplace** | Manual (one-time setup + per-release) | Publish `action.yml` via the GitHub Release UI. See [Publishing to Marketplace](#publishing-to-github-marketplace) below. |

## Cutting a release

### 1. Bump version on a release PR

The PR contains the version bump and the regenerated plugin manifests — nothing else. `src/lib/plugin-metadata.mts` derives `VERSION` from `package.json` at runtime, so `npm run build` propagates the bump to all 5 generated manifests automatically. You never edit a constant.

```bash
git switch main
git pull --ff-only origin main
git switch -c chore/release-vX.Y.Z
npm version X.Y.Z --no-git-tag-version
npm run build
git add package.json package-lock.json \
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

1. `npm ci` + `npm run build`
2. `git diff --exit-code` to ensure generated artifacts are committed
3. `npm run verify:all` (10 invariants + typecheck)
4. `node --test test/*.test.mjs`
5. Asserts `package.json` version equals the tag
6. `npm publish --access public`
7. `gh release create --generate-notes`

If any step fails the publish does not happen and the tag remains unpublished. Fix forward with a new patch tag.

## Required GitHub secrets

| Secret | Source | Purpose |
|---|---|---|
| `NPM_TOKEN` | npmjs.com → Access Tokens → Granular automation token with publish access to `continuous-improvement` | Authenticates `npm publish` |

Set under **Settings → Secrets and variables → Actions → New repository secret**.

## Verifying a release shipped

```bash
npm view continuous-improvement version    # matches the tag
gh run list --workflow=release.yml -L 1    # shows the latest run as success
gh release view vX.Y.Z                     # shows generated notes
```

## Rollback

npm has a 72-hour unpublish window, but **deprecate instead** — unpublishing breaks dependents.

```bash
npm deprecate continuous-improvement@X.Y.Z "Use X.Y.W instead — see <issue link>"
```

Then cut a new patch release that supersedes the bad version.

## Publishing to GitHub Marketplace

The GitHub Action (`action.yml`) is **not** auto-published to the Marketplace by CI. After the `release.yml` workflow creates a GitHub Release, you must manually publish the Action:

1. Go to **Releases** → the newly created release (e.g. `v3.9.2`).
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

- **npm provenance** — once npm trusted publisher is configured for this repo, change the publish step to `npm publish --provenance --access public`. The workflow already sets `id-token: write`.
- **Tag protection** — under Settings → Tags → New rule, require admin role to create `v*` tags. Stops accidental tag pushes from triggering a publish.
