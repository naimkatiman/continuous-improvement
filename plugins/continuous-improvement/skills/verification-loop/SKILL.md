---
name: verification-loop
tier: "1"
description: "Enforces Law 4 (Verify Before Reporting) of the 7 Laws of AI Agent Discipline. A comprehensive verification system for agent coding sessions covering build, types, lint, tests, security, and diff with a PASS/FAIL report."
origin: continuous-improvement
---

# Verification Loop Skill

A comprehensive verification system for agent coding sessions.

## When to Use

Invoke this skill:
- After completing a feature or significant code change
- Before creating a PR
- When you want to ensure quality gates pass
- After refactoring

## Verification Phases

### Phase 1: Build Verification
```bash
# Check if project builds
npm run build 2>&1 | tail -20
# OR
pnpm build 2>&1 | tail -20
```

If build fails, STOP and fix before continuing.

### Phase 2: Type Check
```bash
# TypeScript projects
npx tsc --noEmit 2>&1 | head -30

# Python projects
pyright . 2>&1 | head -30
```

Report all type errors. Fix critical ones before continuing.

### Phase 3: Lint Check
```bash
# JavaScript/TypeScript
npm run lint 2>&1 | head -30

# Python
ruff check . 2>&1 | head -30
```

### Phase 4: Test Suite
```bash
# Run tests with coverage
npm run test -- --coverage 2>&1 | tail -50

# Check coverage threshold
# Target: 80% minimum
```

Report:
- Total tests: X
- Passed: X
- Failed: X
- Coverage: X%

### Phase 5: Security Scan
```bash
# Check for secrets
grep -rn "sk-" --include="*.ts" --include="*.js" . 2>/dev/null | head -10
grep -rn "api_key" --include="*.ts" --include="*.js" . 2>/dev/null | head -10

# Check for console.log
grep -rn "console.log" --include="*.ts" --include="*.tsx" src/ 2>/dev/null | head -10
```

### Phase 6: Diff Review
```bash
# Show what changed
git diff --stat
git diff HEAD~1 --name-only
```

Review each changed file for:
- Unintended changes
- Missing error handling
- Potential edge cases

### Phase 7: Result + Completeness Gate

Phases 1–6 verify mechanism — build green, types clean, tests pass, no secrets, diff intentional. Phase 7 verifies outcome: did the work the operator actually asked for actually land? Mechanism passing while outcome is missing is the most expensive failure mode in this loop, because the green report invites a merge that doesn't deliver.

Two questions, both required to be `Yes`:

**1. Did the stated goal land? Yes/No + evidence.**

The stated goal is the goal as named at task start, not the goal as remembered now. If the operator asked "fix the bug where X happens", evidence is the bug no longer happening (failing test now passes, repro screenshot, manual verification). If they asked "add an admin button", evidence is the button visible and functional in the running UI. Build-green is not evidence of result — it is evidence of mechanism. Don't conflate.

**2. Did every promised step finish? Yes/No + list.**

Enumerate every step you said you would do — the recommendation list, the plan doc, the TodoWrite items, the commit-by-commit roadmap. Mark each Done or Skipped. If any are Skipped, name them and the reason. A "complete" verification with silently skipped promises is a trust violation, not a deliverable.

Both gates are independent: `Yes` on goal alone means a half-complete checklist that may break later; `Yes` on completeness alone means busywork that didn't deliver. Both must be `Yes` — even if the previous six phases all pass — or the work isn't done.

If either is `No`, the verification report goes back to the operator with the explicit gap, not on to PR. The operator decides whether the gap is acceptable to ship as-is or whether more work is required first. Never silently downgrade to "ready" because the mechanism phases looked good.

## Output Format

After running all phases, produce a verification report:

```
VERIFICATION REPORT
==================

Build:        [PASS/FAIL]
Types:        [PASS/FAIL] (X errors)
Lint:         [PASS/FAIL] (X warnings)
Tests:        [PASS/FAIL] (X/Y passed, Z% coverage)
Security:     [PASS/FAIL] (X issues)
Diff:         [X files changed]
Goal landed:  [YES/NO] — <one-line evidence or gap>
All promised: [YES/NO] — <X of Y steps Done; list any Skipped>

Overall:   [READY/NOT READY] for PR

Issues to Fix:
1. ...
2. ...
```

`Overall: READY` requires every line above to pass, including both Phase 7 gates. Mechanism-green plus outcome-`No` is `NOT READY` — surface the gap, do not ship.

## Continuous Mode

For long sessions, run verification every 15 minutes or after major changes:

```markdown
Set a mental checkpoint:
- After completing each function
- After finishing a component
- Before moving to next task

Run: /verify
```

## Integration with Hooks

This skill complements PostToolUse hooks but provides deeper verification.
Hooks catch issues immediately; this skill provides comprehensive review.
