---
name: recall
tier: "1"
description: Enforces Law 1 (Research Before Executing) of the 7 Laws of AI Agent Discipline. Makes past sessions first-class research material by searching the observation log with BM25 ranking, so 'have I hit this before?' is answerable before re-deriving a fix or repeating a mistake.
origin: continuous-improvement
user-invocable: true
---

# Recall — Episodic Search Over Past Sessions

Law 1 says research before executing. The cheapest research is your own history: the exact error you are staring at may have been solved three sessions ago. `observations.jsonl` already records every tool call, but an append-only log is not searchable. Recall turns that log into a ranked, queryable memory.

## When to Activate

- Before tackling a problem that feels familiar ("haven't I seen this error before?").
- Before a risky or destructive operation — check whether a past attempt failed.
- Before reading large files from scratch — a past session may already summarize the relevant facts.
- When onboarding into an unfamiliar area of the codebase that you have touched before.

## Core Concept

Recall builds an in-memory BM25 index over the observation rows and answers a query with the most relevant past activity, newest-first on ties:

```
ci_recall query="permission denied push"
ci_recall query="jq command not found" k=3
ci_recall query="auth login" since=7d
```

Each result is a past tool call with a redacted snippet, a relevance score, and a timestamp.

## Privacy

Snippets are passed through a secret redactor before they are surfaced. AWS access keys, JWT-shaped triplets, bearer tokens, `KEY`/`SECRET`/`TOKEN`/`PASSWORD` assignments, and long hex strings are masked. The observation log already caps output at 200 characters; redaction is the second layer.

## Limitations

- **Lexical, not semantic.** A query for "login" will not surface activity that only ever said "authentication". Search with the vocabulary that actually appeared in the tool calls, or try several phrasings.
- **Scoped to the captured history.** Recall only knows what the hooks recorded. Thin-schema rows (no input/output, emitted when the Node observer is not wired) contribute little signal.
- **In-memory rebuild per query.** Dependency-free and fast at current volumes; a `node:sqlite` FTS5 index is a planned follow-up if the log grows past ~100k rows.

## How to Invoke

Exposed as the `ci_recall` MCP tool (expert mode) and the `/recall` slash command. `query` is required; `k` (default 5) and `since` (ISO timestamp or `7d`/`24h`/`30m`) are optional.

## Pairs With

- **`gateguard`** (Law 1) — before clearing a high-risk action, recall whether a past attempt at the same thing failed.
- **`continuous-improvement`** (core SKILL.md, Law 7 — Learn From Every Session) — recall is the retrieval side of the same observation log the instinct engine learns from.
- **`workspace-surface-audit`** — recall confirms whether the environment facts the audit records have bitten this project before.
