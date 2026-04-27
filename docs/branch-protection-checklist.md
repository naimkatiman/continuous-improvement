# Branch Protection Checklist — `main`

Paste-and-click reference for lifting the CI lints from advisory to required on the `main` branch. Closes the natural end of the rule-then-lint discipline arc — three lints (skill-mirror, docs-substrings, 7-laws verifier) shipped this quarter all run inside the `test` job, so making `test` required covers all three with a single setting.

This is a one-time configuration change. Reversible at any time from the same UI.

## What gets enforced

After this lands, no PR can be merged into `main` until all four required checks succeed on the latest commit:

| Required check | Job | What it enforces |
|---|---|---|
| `test (18)` | `test` matrix on Node 18 | Build + tests + 7-laws verifier + instinct-pack JSON + skill-mirror parity + docs-substring assertions |
| `test (20)` | `test` matrix on Node 20 | Same, on Node 20 |
| `test (22)` | `test` matrix on Node 22 | Same, on Node 22 |
| `lint-transcript` | `lint-transcript` job | Verifies `bin/lint-transcript.mjs` runs without errors |

The skill-mirror, docs-substrings, 7-laws, and instinct-pack-JSON lints all live inside the `test` job's steps in [.github/workflows/ci.yml](../.github/workflows/ci.yml) — they don't appear as separate required-check names in the GitHub UI. Making `test (N)` required for each Node version covers all of them.

## UI path (recommended)

1. Open [`https://github.com/naimkatiman/continuous-improvement/settings/branches`](https://github.com/naimkatiman/continuous-improvement/settings/branches)
2. Click **Add branch protection rule** (or edit the existing rule for `main` if one exists)
3. **Branch name pattern:** `main`
4. Tick these boxes in this order:
   - [ ] **Require a pull request before merging**
     - Sub-option: **Require approvals: 0** (single-maintainer repo; raise later if you take on collaborators)
   - [ ] **Require status checks to pass before merging**
     - [ ] **Require branches to be up to date before merging** (forces rebase before merge — minor friction, catches "stale main" cases like the one this session hit on PR #28)
     - In the **Status checks that are required** search box, search for and add each of:
       - `test (18)`
       - `test (20)`
       - `test (22)`
       - `lint-transcript`
     - (If a check name doesn't appear in the search dropdown, it means GitHub hasn't seen that check run on a branch yet. Push any commit to a feature branch first to register the check, then return to this setting.)
   - [ ] **Require conversation resolution before merging** (lightweight; prevents accidentally merging through unresolved review comments)
5. Leave these UNticked unless you specifically want them:
   - **Require signed commits** — adds friction; only useful if signed-commit policy is a hard requirement
   - **Require linear history** — incompatible with the merge-commit-from-main pattern this session used to bring `ci/skill-mirror-lint` forward without force-push
   - **Lock branch** — read-only mode, you don't want this
   - **Restrict who can push to matching branches** — single-maintainer repo, no benefit
6. **Click "Create"** (or "Save changes" on edit)

## CLI alternative (if you prefer `gh api`)

GitHub's branch-protection API takes a nested JSON body. The cleanest invocation reads from a file to avoid `--field` flag escaping issues:

```bash
cat > /tmp/branch-protection.json <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["test (18)", "test (20)", "test (22)", "lint-transcript"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF

gh api -X PUT /repos/naimkatiman/continuous-improvement/branches/main/protection \
  --input /tmp/branch-protection.json
```

Read back to confirm:

```bash
gh api /repos/naimkatiman/continuous-improvement/branches/main/protection \
  --jq '{required_checks: .required_status_checks.contexts, strict: .required_status_checks.strict, conversation_resolution: .required_conversation_resolution.enabled}'
```

## Verify it works

Open any PR (or use an existing open one). The PR's checks panel should show four checks with **Required** badges:

```
✓ test (18)         Required
✓ test (20)         Required
✓ test (22)         Required
✓ lint-transcript   Required
```

The merge button should be disabled until all four pass. If a check is missing the **Required** badge, the rule didn't pick it up — most likely because the check name doesn't exactly match what GitHub has seen run.

## Reverting

If anything goes wrong, the rule is fully removable:

- **UI:** Settings → Branches → main protection rule → **Delete** (red button at the bottom)
- **CLI:** `gh api -X DELETE /repos/naimkatiman/continuous-improvement/branches/main/protection`

The `main` branch returns to fully unprotected. No commits or settings outside the rule are affected.

## Why now (session context)

This session shipped three CI lints that all enforce different correctness rules:

- **skill-mirror** ([PR #28](https://github.com/naimkatiman/continuous-improvement/pull/28)) — every skill's plugin copy and standalone copy must be byte-identical
- **docs-substrings** ([PR #31](https://github.com/naimkatiman/continuous-improvement/pull/31)) — every prose substring the test suite asserts on inside a `*.md` file must currently match
- **7-laws verifier** (pre-existing) — `SKILL.md` must contain all 7 laws

All three currently run in CI on every PR but **none are required**. A contributor (or you, accidentally) can squash-merge through a red lint with one click, which the session demonstrated is real (PR #28 had a red `test (20)` from a pre-existing failure and the GitHub merge button still offered the merge).

Making `test (18/20/22)` required closes that gap. The merge button only enables when every lint passes.
