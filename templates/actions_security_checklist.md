# GitHub Actions Security Checklist

> Apply to every workflow in `.github/workflows/`. Each item is checkable by reading the YAML — no runtime access needed. The `audit-actions` command automates the mechanical checks; this checklist is the human review layer.

## Permissions

- [ ] Workflow (or every job) declares explicit `permissions:` — never relies on the default token grant
- [ ] Default is `permissions: contents: read`; write scopes are added per-job only where provably needed
- [ ] No `permissions: write-all`
- [ ] Workflows triggered by `pull_request_target`, `issue_comment`, or `issues` do NOT get write tokens or secrets unless a maintainer-approval gate exists

## Untrusted input

- [ ] No direct interpolation of `github.event.*` text (issue/PR title, body, comment, branch name, commit message) inside `run:` shell — pass through `env:` and quote as `"$VAR"`
- [ ] Untrusted content passed to agents/LLMs is wrapped in a prompt boundary and stripped of tool-invocation-looking text
- [ ] `actions/checkout` of PR head refs in privileged contexts is treated as executing untrusted code

## Supply chain

- [ ] Third-party actions are pinned to a full commit SHA (tags are mutable); first-party `actions/*` at minimum pinned to a major version
- [ ] No `curl | bash` of unpinned remote scripts
- [ ] Artifacts downloaded from other workflows are treated as untrusted input

## Runaway control

- [ ] Every job has `timeout-minutes`
- [ ] Workflows that deploy or mutate state declare `concurrency:` with a stable group key
- [ ] Scheduled/agentic workflows have an explicit cost ceiling (matrix size, iteration cap)

## Agentic workflows

- [ ] Agent runs triggered by issue/PR/comment text run with read-only tokens
- [ ] A human approves before any agent-generated change is pushed or merged
- [ ] Prompt boundary and tool boundary are logged for each agent run

## Secrets

- [ ] Secrets are not exposed to workflows runnable by untrusted PRs
- [ ] No secrets echoed to logs or written to artifacts
