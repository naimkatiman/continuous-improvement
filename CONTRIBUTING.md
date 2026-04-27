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

A single PR that touches multiple skills (e.g. `proceed-with-claude-recommendation`, `tdd-workflow`, `safety-guard`), README mode descriptions, and bundle artifacts is **five concerns**, not one — even if every commit on the branch was clean locally. Five concerns get five PRs.

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

## Testing

### Prerequisites

- Node.js 18, 20, or 22
- **bash** — required for the `observe.sh`/`session.sh` hook suites. On Windows,
  install Git Bash or WSL and make sure `bash` is on `PATH`. The hook test suite
  auto-skips with a clear message when bash is not available.

### Commands

```bash
npm run build                       # Regenerate bin/*.mjs, lib/*.mjs, test/*.test.mjs, plugins/*.json
npm test                            # Build + run all tests
node --test test/hook.test.mjs      # Run a single test file
npm run verify:generated            # Confirm source and generated artifacts are in sync (CI gate)
```

Tests must:
- Use temp directories (never touch real `~/.claude/`)
- Clean up after themselves

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
