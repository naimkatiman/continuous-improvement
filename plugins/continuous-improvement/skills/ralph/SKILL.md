---
name: ralph
tier: companion
description: "Enforces Law 6 (Iterate Means One Thing) of the 7 Laws of AI Agent Discipline at PRD scale. Ralph is an autonomous AI agent loop that runs repeatedly until all PRD items are complete. Converts PRDs to executable JSON, implements stories iteratively with quality checks, and tracks progress."
origin: https://github.com/snarktank/ralph
---

# Ralph — Autonomous Agent Loop

Ralph runs iteratively until all PRD stories are complete. Each iteration: picks highest priority story, implements, runs quality checks, commits if passing, updates progress, repeats.

## When to Use

- Large features that exceed a single context window
- Multi-story PRDs that need consistent implementation
- Tasks requiring repeated verification and commit cycles
- Long-running development that benefits from persistence across interruptions

## Do NOT Use When

- Task is a one-shot fix completable in a single edit — just edit the file
- You haven't written a PRD yet — write the PRD first, then run Ralph against it
- The work spans fewer than 3 stories — single-iteration verification is enough
- You need to explore or plan before committing to scope — use a planning skill first; Ralph is for execution, not discovery
- You want manual control over each iteration — run quality checks yourself, no need for Ralph's loop

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

**CRITICAL — refine generic criteria before iteration begins.** Auto-generated PRD scaffolds often produce generic acceptance criteria like `["Implementation is complete", "Code compiles without errors"]`. These are theater — Ralph cannot prove a story passes against criteria that don't actually constrain it. Replace every generic criterion with a concrete, testable statement before moving to step 2.

- Bad: `"Function is implemented correctly"`
- Good: `"Function parseUserInput(s) returns {ok: true, value} for valid s and {ok: false, error} for invalid s, asserted by tests/parse-user-input.test.ts"`
- Bad: `"Code compiles"`
- Good: `"TypeScript compiles with no errors (npm run build) AND lsp diagnostics show 0 errors on src/parse-user-input.ts"`

If you cannot write a testable criterion, the story is too big. Break it down before continuing.

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
4. **Run quality checks** — verify the current story's specific acceptance criteria with fresh evidence:
   - For EACH acceptance criterion, run the test/build/lint that proves it
   - Read the output, do not assume
   - If ANY criterion is not met, continue working — do NOT mark the story as `passes: true`
   - **Suite-level "all tests pass" is NOT a substitute for criterion-level proof.**
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

## Final Checklist (Hard Gate)

Ralph cannot exit cleanly until ALL of these are true:

- [ ] Every story in `prd.json` has `passes: true` (no incomplete stories)
- [ ] Acceptance criteria are task-specific (no `"Implementation is complete"` generics)
- [ ] All requirements from the original task are met (no scope reduction)
- [ ] Fresh test run output shows all tests pass (read it, don't assume)
- [ ] Fresh build output shows success (read it, don't assume)
- [ ] No tests were deleted, skipped, or weakened to make checks green
- [ ] `progress.txt` records implementation details and learnings per iteration
- [ ] Working tree is clean (every story committed atomically)

A failing checkbox is a hard halt — do not declare done.

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
