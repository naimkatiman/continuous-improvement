# Contributing to continuous-improvement

Thanks for your interest in making AI agents more disciplined! Here's how to contribute.

## Quick Start

```bash
git clone https://github.com/naimkatiman/continuous-improvement.git
cd continuous-improvement
npm test
```

## Ways to Contribute

### Report Issues
- Bug reports with reproduction steps
- Feature requests with use cases
- Documentation improvements

### Submit PRs
1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Write tests for new functionality
4. Run `npm test` — all tests must pass
5. Commit with conventional format (`feat:`, `fix:`, `docs:`, etc.)
6. Open a PR against `main` — see [Pull Request Scope](#pull-request-scope) for the one-concern-per-PR rule

### Pull Request Scope

**One concern per PR.** Every PR should answer one well-defined question: "Why is this change needed?" If the answer has multiple unrelated parts ("add feature X *and* refactor Y *and* regenerate build artifacts *and* update unrelated docs"), split it into separate PRs.

This rule extends the project's broader commit-hygiene principle:

> No bundled concerns: CI, tooling, and infra changes ship alone. Never in the same commit as product features.

Squash-merging is fine as long as each PR is one concern; merge-commit-merging is fine as long as each commit on the branch is one concern. Either way, **the unit of one-concern hygiene is the merge boundary, not just local commits** — clean local history can still produce a bundled merge.

#### PR Author Checklist

Before opening a PR, verify:

- [ ] **One concern.** The PR title fits the form `<type>(<scope>): <single observable outcome>` without "and" or commas. If you need a comma, split the PR.
- [ ] **Size budget.** ≤15 hand-edited source files OR ≤500 LOC of hand-edited source. Generated artifacts (bundle regen, lockfiles, snapshots) don't count toward the budget but must ride with the source change that produced them — never separately, never alongside unrelated source.
- [ ] **No drive-bys.** Edits unrelated to the stated concern get their own PR, even if they're small. "While I was here" is not a justification.
- [ ] **Bundle regen rule.** If a source change requires `npm run build`, the regenerated `bin/*.mjs`, `lib/*.mjs`, `test/*.test.mjs`, and `plugins/*.json` ship in the same PR as the source. The CI gate `npm run verify:generated` enforces this, but you should verify locally before pushing.
- [ ] **Skill mirror rule.** If you edit `plugins/continuous-improvement/skills/<name>/SKILL.md`, mirror the same change to `skills/<name>.md` (or vice versa) in the same PR. The two distribution copies must not drift across PR boundaries — installs from `~/.claude/skills/` (curl path) and from the plugin bundle must produce identical skill content.
- [ ] **Test/docs sync rule.** Tests that assert on prose content (`assert.match` against a `*.md` file like `README.md`, `CHANGELOG.md`, or any skill markdown) must ship in the same PR as the docs change adding the asserted substring. Wholesale rewrites of a docs file (README rewrites, CHANGELOG restructures) must verify every existing prose-substring assertion in `src/test/*.mts` still matches before merging — the rewrite PR is responsible for either preserving the asserted strings or updating the tests, not the next contributor's PR.

#### When you have multiple concerns

Sequence the PRs:

1. Land each source concern in its own PR. Each gets the bundle regeneration that its source change requires (one PR = source + its own regen output).
2. If unrelated companion skills, hooks, or commands need to ship, open separate PRs per concern. Stack them on top of each other if there are dependencies; otherwise open them in parallel.
3. Avoid the "feature-branch dumping ground" pattern — a long-lived branch that accumulates several unrelated changes and merges as one. If a branch is going to land more than one concern, split before merging.

A single PR that touches multiple skills (e.g. `proceed-with-the-recommendation`, `tdd-workflow`, `safety-guard`), README mode descriptions, and bundle artifacts is **five concerns**, not one — even if every commit on the branch was clean locally. Five concerns get five PRs.

### Share Instinct Packs
Have a set of instincts that work well for a specific stack? Add them to `instinct-packs/`:

```json
[
  {
    "id": "your-instinct-id",
    "trigger": "when this happens",
    "body": "do this instead",
    "confidence": 0.6,
    "domain": "workflow"
  }
]
```

### Translate
Add translations to `docs/` following the pattern `README.<lang-code>.md`.

## Code Style

- Zero runtime dependencies (Node.js built-ins only at runtime)
- TypeScript source lives in `src/` and compiled `.mjs` artifacts are committed in `bin/`, `lib/`, and `test/`
- Tests use `node:test` and `node:assert/strict`
- Hooks must complete in <200ms on Unix; <500ms budget is allowed in tests to absorb bash spawn cost on Windows
- MCP server must work without any npm packages

## Architecture

> **Source of truth: `src/`.** Edit `src/bin/*.mts`, `src/lib/*.mts`, `src/test/*.test.mts` only. The committed `bin/*.mjs`, `lib/*.mjs`, `test/*.test.mjs`, and `plugins/*.json` are `tsc` and generator output — they are wiped and rewritten on every `npm run build` and any direct edit silently disappears. Full edit-then-build workflow in [Editing the CLI / MCP server / linter](#editing-the-cli--mcp-server--linter) below.

```
SKILL.md                    → The rules (any LLM can follow these)
hooks/observe.sh            → Captures tool calls to JSONL (<50ms)
hooks/session.sh            → Session start/end events (expert mode)
src/bin/*.mts               → TypeScript source for CLI entrypoints and generators
src/lib/*.mts               → TypeScript source for runtime modules and shared plugin metadata
src/test/*.mts              → TypeScript source for the test suite
bin/*.mjs                   → Committed runtime artifacts used by npm/action entrypoints
                              (generated from src/bin/*.mts by `npm run build`)
lib/*.mjs                   → Committed runtime modules generated from src/lib/*.mts
test/*.test.mjs             → Committed test artifacts (generated from src/test/*.mts)
plugins/*.json              → Generated plugin manifests from shared MCP/plugin metadata
```

### Editing the CLI / MCP server / linter

**Do not edit `bin/*.mjs`, `lib/*.mjs`, `test/*.test.mjs`, or `plugins/*.json` directly.**
They are generated from `src/`. The CI step `npm run verify:generated` will fail
any PR where committed build artifacts drift from the source.

Workflow:

```bash
# 1. Edit the TypeScript source
$EDITOR src/bin/install.mts

# 2. Regenerate the committed artifacts
npm run build

# 3. Verify both source and generated are committed together
git status     # source changes plus regenerated bin/, lib/, test/, or plugins/ should be staged
```

Reusable runtime modules live in `src/lib/*.mts` and compile to `lib/*.mjs`.
They are listed explicitly in `package.json` `files` so they ship with the npm tarball.

## Evolution — adding a new skill

Drop one `.md` file into [`skills/`](skills/), run `npm run build`, and the plugin bundle, manifests, and bundled-skills README regenerate from that source. Seven lints (`verify:all` + `verify:generated`) block the merge if anything drifts.

### The 5-step recipe

```bash
# 1. Create the source file
touch skills/<your-skill>.md
```

```yaml
# 2. Frontmatter must declare name + tier + Law-tagged description
---
name: <your-skill>
tier: "1"                # core | featured | "1" | "2" | companion
description: "Enforces Law N (<law name>) of the 7 Laws of AI Agent Discipline. <what it does>."
---
```

```bash
# 3. Regenerate the bundle (also writes plugins/.../skills/<your-skill>/SKILL.md
#    + the bundled-skills README, which is itself generator-output)
npm run build

# 4. Run all verify lints — must all pass
npm run verify:all

# 5. Commit one concern at a time: the source skill alone first,
#    then any wiring (hooks, commands, Law-coverage table updates) as separate commits
git add skills/<your-skill>.md plugins/continuous-improvement/skills/<your-skill>/
git commit -m "feat(skills): add <your-skill> for Law N enforcement"
```

### What the build does for you automatically

- **Mirrors source → bundle** (`bin/generate-plugin-manifests.mjs`): copies `skills/<name>.md` to `plugins/continuous-improvement/skills/<name>/SKILL.md`
- **Regenerates plugin manifests** with the new skill listed in tier order
- **Re-renders** [`plugins/continuous-improvement/skills/README.md`](plugins/continuous-improvement/skills/README.md) (do not edit by hand — generator output)

### What the lints enforce so you cannot ship a half-wired skill

| Lint | Blocks |
|------|--------|
| `verify:skill-mirror` | source `skills/<name>.md` and `plugins/.../<name>/SKILL.md` are out of sync |
| `verify:skill-tiers` | skill has missing or unrecognized `tier:` value |
| `verify:skill-law-tag` | skill description does not start with `Enforces Law N` (or `Law activator`, or `all 7 Laws`) |
| `verify:docs-substrings` | README/QUICKSTART references a removed/renamed skill |
| `verify:everything-mirror` | non-skill files in `plugins/continuous-improvement/` drift from their root-level source |
| `verify:routing-targets` | `proceed-with-the-recommendation` names a routing target that is neither bundled nor declared in `optional-companions.json` |
| `verify:generated` | `npm run build` was not re-run after a source change |

### When to fold a new external skill into the 7 Laws

A new skill is a fit if it provably enforces (or is a routed activator for) at least one of the 7 Laws. The Law-tag lint will refuse it otherwise. If it sits outside the laws (a domain skill — e.g. SQL optimization), keep it as an external plugin. The 7 Laws plugin stays disciplined about scope; that is the point.

### What is *not* automated (the honest limits)

- The [Law Coverage Matrix](#law-coverage-matrix) below is hand-maintained — add your new skill to the right Law row when you ship it.
- The "20 skills" count appears in both [README.md](README.md) and [docs/skills.md](docs/skills.md) — bump both when N changes.
- Promotion between tiers (e.g. `2` → `1` after it proves itself) is a manual edit to the frontmatter `tier:` field, by design — the maintainer should make that call deliberately.

## Testing

### Prerequisites

- Node.js 18, 20, or 22
- **bash** — required for the `observe.sh`/`session.sh` hook suites. On Windows,
  install Git Bash or WSL and make sure `bash` is on `PATH`. The hook test suite
  auto-skips with a clear message when bash is not available.

### Setup pre-commit hook (recommended)

Block accidental staging of paths that were already cleaned up from the repo
(see `.gitignore` for the canonical list — currently `.tmp-stop-e2e/` and
`nanobanana-output/`):

```bash
# From the repo root, on a Unix-like shell:
ln -sf "$(pwd)/bin/pre-commit-block-strays.sh" .git/hooks/pre-commit

# On Windows without symlink permissions, copy instead:
cp bin/pre-commit-block-strays.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

The hook is belt-and-suspenders: `.gitignore` is silent if you bypass it with
`git add -f`, this hook is loud and refuses the commit. Update the
`BLOCKED_PATTERNS` list in [`bin/pre-commit-block-strays.sh`](bin/pre-commit-block-strays.sh)
when you remove a new transient/output directory.

### Commands

```bash
npm run build                       # Regenerate bin/*.mjs, lib/*.mjs, test/*.test.mjs, plugins/*.json
npm test                            # Build + run all tests
node --test test/hook.test.mjs      # Run a single test file
npm run verify:generated            # Confirm source and generated artifacts are in sync (CI gate)
npm run verify:all                  # Run all 5 verify lints + typecheck (single contributor gate)
```

Tests must:
- Use temp directories (never touch real `~/.claude/`)
- Clean up after themselves

## Law Coverage Matrix

Every bundled skill, command, and hook enforces at least one of the 7 Laws. Use this matrix to pick the right tool for the discipline you want enforced. (Previously rendered in README; demoted here as contributor-grade reference, not first-time-installer orientation.)

| Law | Enforced by | Type |
|-----|-------------|------|
| **1 — Research Before Executing** | `gateguard`, `workspace-surface-audit` | skill, skill+cmd |
| **2 — Plan Is Sacred** | `wild-risa-balance`, `token-budget-advisor`, `/planning-with-files` | skill, skill, cmd |
| **3 — One Thing at a Time** | `tdd-workflow`, `safety-guard` | skill, skill |
| **4 — Verify Before Reporting** | `verification-loop`, `tdd-workflow`, `three-section-close.mjs` | skill, skill, hook |
| **5 — Reflect After Every Session** | `para-memory-files`, `strategic-compact`, `session.sh`, `/seven-laws`, `/dashboard` | skill, skill, hook, cmd, cmd |
| **6 — Iterate Means One Thing** | `ralph` | skill+cmd |
| **7 — Learn From Every Session** | `para-memory-files`, `/learn-eval`, `observe.sh`, `/seven-laws`, `/dashboard` | skill, cmd, hook, cmd, cmd |
| **All 7 (orchestrator)** | `proceed-with-the-recommendation` | skill+cmd |
| **Activator (dispatches Law-aligned skills)** | `superpowers` | skill+cmd |

The lint `verify:skill-law-tag` (run by `verify:all`) blocks any new skill whose `description:` does not start with `Enforces Law N`, so this table has a mechanical companion that prevents drift.

## Release

### Float-tag policy (`v3`, `v4`, ...)

The `v3` lightweight tag is a floating major-version pointer used by GitHub Action consumers (`naimkatiman/continuous-improvement@v3`). It must be retargeted to the latest published `v3.x.y` tag on every minor or patch release.

```bash
# After tagging and publishing the GitHub Release for v3.X.Y:
git tag -f v3 v3.X.Y
git push origin v3 --force
```

The force-push is intentional and only applies to the floating tag — never to `vX.Y.Z` pinned tags or to branches. Consumers using `@v3.6.0` are unaffected; only `@v3` consumers see the new code on their next `actions/checkout`. This matches the actions/checkout, actions/setup-node, etc. ecosystem convention.

If you cut a new major version (e.g. `v4.0.0`), create a fresh `v4` floating tag rather than retargeting `v3` — the float tag tracks the *current* major, never the *latest* across majors. This preserves the SemVer guarantee that `@v3` stays breaking-change-safe for as long as the v3 line is supported.

### Release checklist

1. Bump version in `package.json`, `plugins/continuous-improvement/.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json` + `plugins/continuous-improvement/.claude-plugin/marketplace.json`.
2. Add the new section to `CHANGELOG.md`.
3. Run `npm run verify:all` and `npm test`.
4. Commit on a release branch, open PR, merge to `main`.
5. Tag the merge commit: `git tag vX.Y.Z` and `git push origin vX.Y.Z`.
6. Publish the GitHub Release with `gh release create vX.Y.Z --notes-file <changelog-section>` (or via the web UI).
7. **Retarget the float tag** per the policy above.
8. `npm publish` once the GitHub Release is live.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
