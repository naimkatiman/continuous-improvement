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

### Phase 0: Resolve the Ladder

Every project has its own actual invocation for build / typecheck / lint / test / security / deploy-receipt. Hardcoding `npm run build` and `npm run test` works when the project happens to use those exact scripts; for everything else (pnpm, yarn, cargo, go, mise, just, custom scripts, monorepos with workspace-scoped commands) it returns "deps not installed" or "config not found" misreads from the wrong invocation. Phase 0 runs first so Phases 1–6 never have to guess.

**Run [`scripts/resolve-verify-ladder.mjs`](../scripts/resolve-verify-ladder.mjs)** at the repo root. It encodes the full four-step resolution priority and emits the fenced block below. Use `--json` for machine consumption.

```
$ node scripts/resolve-verify-ladder.mjs
verify-ladder (resolved):
  build:             npm run build  (sniff:package.json:scripts.build)
  typecheck:         npm run typecheck  (sniff:package.json:scripts.typecheck)
  lint:              npm run lint  (sniff:package.json:scripts.lint)
  test:              npm test  (sniff:package.json:scripts.test)
  security:          (ask operator — no marker found)
  deploy_receipt:    (ask operator — no marker found)
  synthetic_checks:  (ask operator — no marker found)
```

**Resolution priority** (first match wins; the script implements this — the prose is documentation):

1. **`.claude/verify-ladder.json` manifest** at the repo root. Schema:
   ```json
   {
     "build":          "npm run build",
     "typecheck":      "tsc -p tsconfig.json --noEmit",
     "lint":           "npm run lint",
     "test":           "npm test",
     "security":       "npm audit --audit-level=high",
     "deploy_receipt": "npx wrangler deployments list --json"
   }
   ```
   Any field omitted falls through to step 2 for that field only. A field set to the literal JSON `null` means "skip this phase for this project" — the resolver records source `manifest:null`. Underscore-prefixed keys (`_doc`, `_node_example`, etc.) are ignored as documentation/examples.
2. **Sniff `package.json` `scripts`** for `build`, `typecheck` or `tsc`, `lint`, `test`, `audit` or `security`. Tie-breaker when multiple scripts could match a phase: prefer `verify:<phase>` over `<phase>` over `<phase>:*` (wildcard tail). Do NOT pick `test` when `verify:test` exists; the operator's explicit verification surface always wins over the convenience alias.
3. **Sniff per-language toolchain files** if `package.json` is absent: `Cargo.toml` → `cargo build` / `cargo check` / `cargo clippy` / `cargo test` / `cargo audit`, `go.mod` → `go build ./...` / `go vet ./...` / `go test ./...`, `pyproject.toml` → `pyright` / `ruff check .` / `pytest`, `Gemfile` → `bundle exec rspec` / `bundle exec rubocop`.
4. **Ask the operator** (source `ask-operator`) if none of the above resolves the field. Do not invent.

Each row shows the resolved command + its source (`manifest`, `sniff:<file>:<key>`, `manifest:null`, or `ask-operator`). The fenced block is the contract surface — every later phase reads from this resolved ladder, never from a hardcoded fallback.

A starter manifest is provided at `templates/verify-ladder.example.json`; copy it to `.claude/verify-ladder.json` and trim per project.

### Phase 1: Build Verification
Run the `build` command from the resolved ladder. Example for a default Node project:
```bash
# Resolved from package.json scripts.build:
npm run build 2>&1 | tail -20
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

### Phase 8: Deploy Receipt (auto-deploy projects only)

For repos whose `verify-ladder.json` declares a `deploy_receipt` field — or whose sniff path detects an auto-deploy target — the verify is not complete until the deployed SHA matches the merge SHA and a healthcheck returns 200. Hand off to the `deploy-receipt` skill (Law 4 deploy-seam companion landed in PR #83) and treat its `Receipt status: COMPLETE` as the gate.

**Detection.** Run [`scripts/detect-deploy-target.sh`](../scripts/detect-deploy-target.sh) at the repo root. Output is one of `railway` / `cloudflare` / `vercel` / `netlify` / `fly` / `appengine` / `apprunner` / `gha-deploy` / `none`. Anything except `none` triggers handoff to `deploy-receipt`; `none` means Phase 8 is skipped (no deploy seam exists).

**SHA extraction.** For the detected provider, [`scripts/get-deployed-sha.sh <provider>`](../scripts/get-deployed-sha.sh) returns the currently-deployed SHA via the provider CLI; `--show-command <provider>` prints the pipeline shape without executing (useful for dry-runs and citation). `deploy-receipt` owns the receipt's other components (health endpoint, build artifact, on-incomplete modes) and Route B/C fallbacks.

INCOMPLETE receipts move to "Immediate operator action" in the close, never to "ready". Library-only / package-published repos skip this phase entirely (no deploy seam exists).

### Phase 9: Synthetic Checks (production-vs-baseline diff)

Phase 8 confirms the deploy seam. Phase 9 confirms the deployed surface matches the staging baseline on the dimensions that matter — endpoint payload shape, header presence, data freshness, routing correctness. A deploy can land with a matching SHA and a 200 healthcheck and still serve broken responses (stale data sources, dropped headers, regressed payloads). Phase 9 is the gate that catches that.

**When this rung runs:**

- ONLY after Phase 8 reports `Receipt status: COMPLETE`. An INCOMPLETE receipt blocks Phase 9 — fix the receipt gap first, then re-run.
- ONLY when the resolved ladder declares `synthetic_checks` as a non-null directory path (default: `synthetic-checks/`). A `null` field skips the rung silently. A missing field falls through to the directory sniff: if `synthetic-checks/` exists at the repo root with at least one `*.synthetic.*` file, the rung activates; otherwise it is recorded as "skipped — no synthetic-checks directory found".

**What the runner does:**

1. List every `*.synthetic.{sh,mjs,ts,py}` file in the resolved directory in lexical order.
2. For each file, set the input env vars: `BASE_URL` (production base from project config), `BASELINE_URL` (staging baseline from project config), `EXPECTED_SHA` (the merge SHA Phase 8 reported COMPLETE), `DEPLOY_BRANCH` (the deploy branch name), `RECEIPT_TIMESTAMP` (ISO-8601 of the receipt).
3. Invoke the file via the right interpreter (`bash` for `.sh`, `node` for `.mjs`, `tsx` for `.ts`, `python` for `.py`). Files with unrecognized extensions are skipped with a warning.
4. Capture stdout + stderr + exit code per file. On exit 0, the check passed. On any non-zero exit, the check failed and stdout is the operator-facing diff.
5. Aggregate: if every file exited 0, Phase 9 is `PASS`. If any file exited non-zero, Phase 9 is `FAIL — synthetic drift on <filenames>` and the captured diffs go into the verification report verbatim (no agent re-summarization).

**Surfacing rule:**

A failed synthetic check surfaces as `INCOMPLETE — synthetic drift` at the same severity as a failed deploy receipt. The merge moves to "Immediate operator action" with the named drift and the diff payload. Do NOT downgrade synthetic drift to "warning" — the rung exists because the report flagged exactly this gap (deploys that look healthy but serve broken responses).

**Anti-patterns specific to this rung:**

- **Smoke checks masquerading as synthetic checks.** A check that only verifies "endpoint returns 200" passes against a stale deploy. Synthetic checks MUST diff production against a baseline.
- **Hardcoded baseline URLs in the check.** Baseline lives in env (`BASELINE_URL`), not in the file. Hardcoding it breaks the convention and makes per-environment use impossible.
- **Re-summarizing the diff.** The captured stdout from a failed check is the operator-facing artifact. The agent does not re-write or shorten it.
- **Treating an absent directory as PASS.** No synthetic-checks directory means the rung is `skipped`, not `PASS`. The operator sees the absence in the resolved ladder.

See `synthetic-checks/README.md` for the file convention, the input/output contract, and a runnable sample (`example-version-endpoint.synthetic.sh`).

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
Deploy:       [COMPLETE/INCOMPLETE/skipped] — <SHA + health summary>
Synthetic:    [PASS/FAIL/skipped] — <X of Y checks; failed: <filenames>>

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
