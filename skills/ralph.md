---
name: ralph
tier: companion
description: "Ralph is an autonomous AI agent loop that runs repeatedly until all PRD items are complete. Converts PRDs to executable JSON, implements stories iteratively with quality checks, and tracks progress."
origin: https://github.com/snarktank/ralph
---

# Ralph — Autonomous Agent Loop

Ralph runs iteratively until all PRD stories are complete. Each iteration: picks highest priority story, implements, runs quality checks, commits if passing, updates progress, repeats.

## When to Use

- Large features that exceed a single context window
- Multi-story PRDs that need consistent implementation
- Tasks requiring repeated verification and commit cycles
- Long-running development that benefits from persistence across interruptions

## Prerequisites

- Git repository
- PRD document (markdown format)
- `jq` installed (`brew install jq` on macOS)

## Workflow

### 1. Create a PRD

Generate a detailed requirements document using the PRD skill:

```
Load the prd skill and create a PRD for [your feature description]
```

Output saved to `tasks/prd-[feature-name].md`

### 2. Convert PRD to Ralph Format

Convert the markdown PRD to executable JSON:

```
Load the ralph skill and convert tasks/prd-[feature-name].md to prd.json
```

This creates `prd.json` with user stories structured for autonomous execution.

### 3. Run Ralph

Execute the autonomous loop:

```bash
# Using Amp (default)
./scripts/ralph/ralph.sh [max_iterations]

# Using Claude Code
./scripts/ralph/ralph.sh --tool claude [max_iterations]
```

Default: 10 iterations. Use `--tool amp` or `--tool claude` to select your AI tool.

## Ralph Loop Steps

1. **Create feature branch** — from PRD `branchName`
2. **Pick highest priority story** — where `passes: false`
3. **Implement that single story** — fresh context per iteration
4. **Run quality checks** — typecheck, tests
5. **Commit if checks pass** — atomic commits per story
6. **Update prd.json** — mark story as `passes: true`
7. **Append learnings** — to `progress.txt`
8. **Repeat** — until all stories pass or max iterations reached

## Key Concepts

### Each Iteration = Fresh Context

Every story gets a clean slate. Previous work is visible only via git history and `prd.json`, preventing context pollution.

### Small Tasks

Stories should be completable in 10-30 minutes. If a story stalls, break it down.

### AGENTS.md Updates Are Critical

Ralph updates `AGENTS.md` after each story so subsequent iterations know what's already done.

### Feedback Loops

- Build/test failures: immediate fix or rollback
- Test failures: investigate before declaring pass
- Confusion: log to `progress.txt` for human review

### Browser Verification for UI Stories

Ralph starts a dev server and uses Playwright to verify UI stories actually render.

### Stop Condition

Ralph stops when:
- All stories have `passes: true`
- Max iterations reached
- Critical failure encountered (user intervention required)

## Files

- `prd.json` — executable PRD with user stories
- `progress.txt` — accumulated learnings and status
- `ralph.sh` — the loop script
- `AGENTS.md` — iteration memory

## Debugging

If Ralph gets stuck:

1. Check `prd.json` for malformed stories
2. Review `progress.txt` for accumulated errors
3. Verify tests pass independently: `npm test` or equivalent
4. Check git status for uncommitted changes
5. Run single iteration manually to isolate issues

## Customizing the Prompt

Edit the prompt template in `scripts/ralph/prompt.md` (Amp) or `scripts/ralph/CLAUDE.md` (Claude Code) to adjust behavior.

## Archiving

After completion, archive `prd.json` and `progress.txt` to `tasks/archive/[date]/` for future reference.
