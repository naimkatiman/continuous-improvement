---
name: workspace-surface-audit
tier: companion
description: "Enforces Law 1 (Research Before Executing) of the 7 Laws of AI Agent Discipline. Audits the active repo, MCP servers, plugins, connectors, env surfaces, and harness setup, then recommends the highest-value continuous-improvement-native skills, hooks, agents, and operator workflows. Use when the user wants help setting up Claude Code or understanding what capabilities are actually available in their environment."
origin: continuous-improvement
---

# Workspace Surface Audit

Read-only audit skill for answering the question "what can this workspace and machine actually do right now, and what should we add or enable next?"

This is the continuous-improvement answer to setup-audit plugins. It does not modify files unless the user explicitly asks for follow-up implementation.

## When to Use

- User says "set up Claude Code", "recommend automations", "what plugins or MCPs should I use?", or "what am I missing?"
- Auditing a machine or repo before installing more skills, hooks, or connectors
- Comparing official marketplace plugins against continuous-improvement coverage
- Reviewing `.env`, `.mcp.json`, plugin settings, or connected-app surfaces to find missing workflow layers
- Deciding whether a capability should be a skill, hook, agent, MCP, or external connector

## Non-Negotiable Rules

- Never print secret values. Surface only provider names, capability names, file paths, and whether a key or config exists.
- Prefer continuous-improvement workflows over generic "install another plugin" advice when continuous-improvement can reasonably own the surface.
- Treat external plugins as benchmarks and inspiration, not authoritative product boundaries.
- Separate three things clearly:
  - already available now
  - available but not wrapped well in continuous-improvement
  - not available and would require a new integration

## Audit Inputs

Inspect only the files and settings needed to answer the question well:

1. **Repo surface**
   - `package.json`, lockfiles, language markers, framework config, `README.md`
   - `.mcp.json`, `.lsp.json`, `.claude/settings*.json`, `.codex/*`
   - `AGENTS.md`, `CLAUDE.md`, install manifests, hook configs
2. **Environment surface**
   - `.env*` files in the active repo and obvious adjacent continuous-improvement workspaces
   - Surface only key names such as `STRIPE_API_KEY`, `TWILIO_AUTH_TOKEN`, `FAL_KEY`
3. **Connected tool surface**
   - Installed plugins, enabled connectors, MCP servers, LSPs, and app integrations
4. **continuous-improvement surface**
   - Existing skills, commands, hooks, agents, and install modules that already cover the need

## Audit Process

### Phase 1: Inventory What Exists

Produce a compact inventory:

- active harness targets
- installed plugins and connected apps
- configured MCP servers
- configured LSP servers
- env-backed services implied by key names
- existing continuous-improvement skills already relevant to the workspace

If a surface exists only as a primitive, call that out. Example:

- "Stripe is available via connected app, but continuous-improvement lacks a billing-operator skill"
- "Google Drive is connected, but there is no continuous-improvement-native Google Workspace operator workflow"

#### Environment Grain

Before any tool-class advice, capture the per-host facts that make commands either run or fail. The 28-day usage report's recurring "command failed / wrong approach" friction class roots almost entirely in this grain being unrecorded at session start — the agent reaches for `jq`, finds it missing, retries; reaches for bash chaining, hits PowerShell parser errors, retries; trusts a stale `pwd` after `tsc`, runs verification from the wrong directory, retries.

Probe and record (no destructive commands; quote results inline):

- **Shell flavor.** `echo $SHELL` on POSIX or `$PSVersionTable.PSEdition` on Windows; detect `bash`, `zsh`, `pwsh`, or `cmd`. PowerShell on Windows treats `&&`, `2>&1`, and quoting differently from bash; Git Bash on Windows is bash-shaped but lacks several POSIX utilities by default.
- **OS family + line endings.** `uname -s` (or PowerShell `$IsWindows`) plus `git config --get core.autocrlf`. On Windows with `core.autocrlf=true`, `git status` reports phantom modifications on every checked-out file — `git diff --stat` is the reliable change-set view.
- **jq availability.** `command -v jq` (or `Get-Command jq`). When jq is missing, observation-pipeline hooks fall back to a thin schema and curl/JSON one-liners need a node/python rewrite.
- **Case-sensitive filesystem.** Test by creating two paths differing only in case in a tempdir. NTFS (Windows) and APFS (macOS default) are case-insensitive; Linux ext4 and case-sensitive APFS are case-sensitive. Affects `CLAUDE.md` vs `claude.md` resolution and import paths.
- **CWD baseline.** `pwd` (or `Get-Location`) recorded at session start. `tsc`, build scripts, and some test runners change CWD as a side effect; subsequent commands run from the wrong directory return "deps not installed" or "config not found" misreads.
- **Parallel-actor expectation.** Document whether a second Claude / Codex / Maulana session may operate on the same working tree. If yes, the `gateguard` Parallel-Actor Gate uses [`scripts/git-state-snapshot.sh`](../scripts/git-state-snapshot.sh) to produce a single JSON envelope (`{head, upstream, dirty, root, branch}`) for the baseline and the divergence check. This skill records whether parallel-actor is expected; gateguard owns the runtime mechanics, so the audit doesn't restate the git-command triple.

Output the recorded grain as a single fenced block so it survives context compaction and any later phase can reference it without re-probing:

```
shell-flavor:    pwsh
os:              windows-11 / autocrlf=true
jq:              missing
case-sensitive:  false
cwd-baseline:    D:/Ai/continuous-improvement
parallel-actor:  yes
```

The fenced block is the contract surface — keep the field names stable so downstream skills (`gateguard`, `verification-loop`, future autonomous-release-train) can parse it without per-host special-casing.

### Phase 2: Benchmark Against Official and Installed Surfaces

Compare the workspace against:

- official Claude plugins that overlap with setup, review, docs, design, or workflow quality
- locally installed plugins in Claude or Codex
- the user's currently connected app surfaces

Do not just list names. For each comparison, answer:

1. what they actually do
2. whether continuous-improvement already has parity
3. whether continuous-improvement only has primitives
4. whether continuous-improvement is missing the workflow entirely

### Phase 3: Turn Gaps Into continuous-improvement Decisions

For every real gap, recommend the correct continuous-improvement-native shape:

| Gap Type | Preferred continuous-improvement Shape |
|----------|---------------------|
| Repeatable operator workflow | Skill |
| Automatic enforcement or side-effect | Hook |
| Specialized delegated role | Agent |
| External tool bridge | MCP server or connector |
| Install/bootstrap guidance | Setup or audit skill |

Default to user-facing skills that orchestrate existing tools when the need is operational rather than infrastructural.

## Output Format

Return five sections in this order:

1. **Current surface** — what is already usable right now
2. **Parity** — where continuous-improvement already matches or exceeds the benchmark
3. **Primitive-only gaps** — tools exist, but continuous-improvement lacks a clean operator skill
4. **Missing integrations** — capability not available yet
5. **Top 3-5 next moves** — concrete continuous-improvement-native additions, ordered by impact

## Recommendation Rules

- Recommend at most 1-2 highest-value ideas per category.
- Favor skills with obvious user intent and business value:
  - setup audit
  - billing/customer ops
  - issue/program ops
  - Google Workspace ops
  - deployment/ops control
- If a connector is company-specific, recommend it only when it is genuinely available or clearly useful to the user's workflow.
- If continuous-improvement already has a strong primitive, propose a wrapper skill instead of inventing a brand-new subsystem.

## Good Outcomes

- The user can immediately see what is connected, what is missing, and what continuous-improvement should own next.
- Recommendations are specific enough to implement in the repo without another discovery pass.
- The final answer is organized around workflows, not API brands.
