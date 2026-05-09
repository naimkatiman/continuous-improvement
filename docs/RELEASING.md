# Releasing continuous-improvement

The release pipeline is **tag-triggered**. Pushing a `v*` tag publishes the npm package and cuts a GitHub Release. Plugin marketplace consumers get new content the moment changes land on `main` — no extra release step required for them.

## What ships, and how

| Surface | Trigger | Mechanism |
|---|---|---|
| **Plugin marketplace** (`/plugin install`) | Merge to `main` | Claude Code clients fetch `.claude-plugin/marketplace.json` from `main` on demand. Consumers refresh with `/plugin update continuous-improvement`. |
| **npm package** (`npm install -g continuous-improvement`) | Tag push (`v*`) | `.github/workflows/release.yml` runs `npm publish` and creates a GitHub Release. |

## Cutting a release

### 1. Bump version on a release PR

The PR contains the version bump and nothing else.

```bash
git switch main
git pull --ff-only origin main
git switch -c chore/release-vX.Y.Z
npm version X.Y.Z --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore(release): cut vX.Y.Z"
git push -u origin chore/release-vX.Y.Z
gh pr create --title "chore(release): cut vX.Y.Z" --body "Release bump for X.Y.Z."
```

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
3. `npm run verify:all` (7 invariants + typecheck)
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

## Optional upgrades

- **npm provenance** — once npm trusted publisher is configured for this repo, change the publish step to `npm publish --provenance --access public`. The workflow already sets `id-token: write`.
- **Tag protection** — under Settings → Tags → New rule, require admin role to create `v*` tags. Stops accidental tag pushes from triggering a publish.
