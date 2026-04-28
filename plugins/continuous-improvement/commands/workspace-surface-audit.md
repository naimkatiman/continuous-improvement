---
name: workspace-surface-audit
description: "Audit workspace capabilities and recommend continuous-improvement-native skills, hooks, and workflows"
---

# /workspace-surface-audit

Audit the active repo, MCP servers, plugins, connectors, env surfaces, and harness setup. Returns a 5-section report with specific next moves.

## Usage

```
/workspace-surface-audit
```

## What It Checks

1. **Repo surface** — `package.json`, lockfiles, framework config, `.mcp.json`, `.claude/settings*.json`, `AGENTS.md`
2. **Environment surface** — `.env*` files (key names only, no secrets)
3. **Connected tools** — installed plugins, MCP servers, LSPs, app integrations
4. **continuous-improvement surface** — existing skills, commands, hooks, agents

## Output Format

```
=== Workspace Surface Audit ===

## Current Surface
- [What is usable right now]

## Parity
- [Where continuous-improvement matches or exceeds benchmarks]

## Primitive-Only Gaps
- [Tools exist, but continuous-improvement lacks clean operator skills]

## Missing Integrations
- [Capabilities not available yet]

## Top 3-5 Next Moves
1. [Concrete continuous-improvement-native addition]
2. [Ordered by impact]
```

## Rules

- **Never print secrets** — only provider names, capability names, file paths
- **Prefer continuous-improvement** over generic "install another plugin" advice
- **Organize by workflows**, not API brands
- **Specific recommendations** — concrete enough to implement without another discovery pass

## Example Output

```
## Current Surface
- MCP: filesystem, github, playwright
- Plugins: beginner, expert (continuous-improvement)
- Env: STRIPE_API_KEY, FAL_KEY configured
- Framework: Next.js 15, React 19, TypeScript

## Parity
- Continuous improvement: covered (native)
- Testing discipline: covered (TDD workflows)

## Primitive-Only Gaps
- Stripe connected but no billing-operator skill
- GitHub MCP available but no issue-triage workflow

## Missing Integrations
- No Linear connector detected
- No Slack webhook configured

## Top 3-5 Next Moves
1. Create billing-operator skill (Stripe integration)
2. Create github-ops workflow for issue triage
3. Add Linear connector skill for project management
```
