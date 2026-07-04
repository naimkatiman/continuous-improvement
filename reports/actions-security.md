# GitHub Actions security audit

Scanned 4 workflow file(s). Checks and remediation follow templates/actions_security_checklist.md.

## Summary

| Severity | Count |
|---|---|
| high | 2 |
| medium | 5 |
| low | 11 |

## .github/workflows/ci.yml

| Severity | Line | Finding | Remediation |
|---|---|---|---|
| high | 1 | No explicit `permissions:` at the workflow level or on any job — the workflow runs with the default token grant. | Declare explicit `permissions:` (default `contents: read`) at the workflow level; add write scopes per-job only where provably needed. |
| low | 3 | Workflow is triggered by push/schedule but declares no `concurrency:` block. | Add a `concurrency:` block with a stable group key so overlapping runs cancel or queue. |
| medium | 10 | Job `test` has no `timeout-minutes`. | Add `timeout-minutes:` to the job to cap runaway or hung runs. |
| low | 17 | First-party action `actions/checkout@v4` is not pinned to a commit SHA. | Pin first-party actions to a full commit SHA, or at minimum a major version tag. |
| low | 20 | First-party action `actions/setup-node@v4` is not pinned to a commit SHA. | Pin first-party actions to a full commit SHA, or at minimum a major version tag. |
| medium | 62 | Job `lint-transcript` has no `timeout-minutes`. | Add `timeout-minutes:` to the job to cap runaway or hung runs. |
| low | 65 | First-party action `actions/checkout@v4` is not pinned to a commit SHA. | Pin first-party actions to a full commit SHA, or at minimum a major version tag. |
| low | 66 | First-party action `actions/setup-node@v4` is not pinned to a commit SHA. | Pin first-party actions to a full commit SHA, or at minimum a major version tag. |

## .github/workflows/landing-drift.yml

| Severity | Line | Finding | Remediation |
|---|---|---|---|
| low | 12 | Workflow is triggered by push/schedule but declares no `concurrency:` block. | Add a `concurrency:` block with a stable group key so overlapping runs cancel or queue. |
| medium | 21 | Job `drift` has no `timeout-minutes`. | Add `timeout-minutes:` to the job to cap runaway or hung runs. |
| low | 24 | First-party action `actions/checkout@v4` is not pinned to a commit SHA. | Pin first-party actions to a full commit SHA, or at minimum a major version tag. |

## .github/workflows/release.yml

| Severity | Line | Finding | Remediation |
|---|---|---|---|
| low | 3 | Workflow is triggered by push/schedule but declares no `concurrency:` block. | Add a `concurrency:` block with a stable group key so overlapping runs cancel or queue. |
| medium | 9 | Job `publish` has no `timeout-minutes`. | Add `timeout-minutes:` to the job to cap runaway or hung runs. |
| low | 16 | First-party action `actions/checkout@v4` is not pinned to a commit SHA. | Pin first-party actions to a full commit SHA, or at minimum a major version tag. |
| low | 27 | First-party action `actions/setup-node@v4` is not pinned to a commit SHA. | Pin first-party actions to a full commit SHA, or at minimum a major version tag. |

## .github/workflows/skills-drift.yml

| Severity | Line | Finding | Remediation |
|---|---|---|---|
| high | 1 | No explicit `permissions:` at the workflow level or on any job — the workflow runs with the default token grant. | Declare explicit `permissions:` (default `contents: read`) at the workflow level; add write scopes per-job only where provably needed. |
| medium | 10 | Job `skills-drift` has no `timeout-minutes`. | Add `timeout-minutes:` to the job to cap runaway or hung runs. |
| low | 13 | First-party action `actions/checkout@v4` is not pinned to a commit SHA. | Pin first-party actions to a full commit SHA, or at minimum a major version tag. |
