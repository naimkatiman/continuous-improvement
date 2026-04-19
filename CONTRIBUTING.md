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
6. Open a PR against `main`

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
- TypeScript source lives in `src/` and compiled `.mjs` artifacts are committed in `bin/` and `test/`
- Tests use `node:test` and `node:assert/strict`
- Hooks must complete in <200ms on Unix; <500ms budget is allowed in tests to absorb bash spawn cost on Windows
- MCP server must work without any npm packages

## Architecture

```
SKILL.md                    → The rules (any LLM can follow these)
hooks/observe.sh            → Captures tool calls to JSONL (<50ms)
hooks/session.sh            → Session start/end events (expert mode)
src/bin/*.mts               → TypeScript source for CLI tools and tests
src/test/*.mts              → TypeScript source for the test suite
src/{cli-anything,compound-engineering,pm-skills,unified-plugin}.mjs
                            → Plain-JS runtime modules loaded by bin/unified-cli.mjs
bin/*.mjs                   → Committed runtime artifacts used by npm/action entrypoints
                              (generated from src/bin/*.mts by `npm run build`)
test/*.test.mjs             → Committed test artifacts (generated from src/test/*.mts)
```

### Editing the CLI / MCP server / linter

**Do not edit `bin/*.mjs` or `test/*.test.mjs` directly.** They are build output from
`src/bin/*.mts` and `src/test/*.mts`. The CI step `npm run verify:generated` will
fail any PR where the committed `.mjs` drifts from the source.

Workflow:

```bash
# 1. Edit the TypeScript source
$EDITOR src/bin/install.mts

# 2. Regenerate the committed artifacts
npm run build

# 3. Verify both source and generated are committed together
git status     # both src/bin/install.mts and bin/install.mjs should be staged
```

The plain-`.mjs` modules under `src/` (not `src/bin/` or `src/test/`) are authored
directly in JavaScript and loaded at runtime by `bin/unified-cli.mjs`. They are
listed explicitly in `package.json` `files` so they ship with the npm tarball.

## Testing

### Prerequisites

- Node.js 18, 20, or 22
- **bash** — required for the `observe.sh`/`session.sh` hook suites. On Windows,
  install Git Bash or WSL and make sure `bash` is on `PATH`. The hook test suite
  auto-skips with a clear message when bash is not available.

### Commands

```bash
npm run build                       # Regenerate bin/*.mjs and test/*.test.mjs
npm test                            # Build + run all tests
node --test test/hook.test.mjs      # Run a single test file
npm run verify:generated            # Confirm src/ and bin/ are in sync (CI gate)
```

Tests must:
- Use temp directories (never touch real `~/.claude/`)
- Clean up after themselves

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
