---
name: recall
description: Search past tool-call observations with BM25 ranking to answer "have I seen this before?" before re-deriving a fix or repeating a mistake. Enforces Law 1 (Research Before Executing).
---

# /recall — Episodic Search Over Past Sessions

Search this project's observation history for relevant prior activity and return the most relevant past tool calls, ranked.

## What it does

Builds an in-memory BM25 index over `~/.claude/instincts/<project-hash>/observations.jsonl` and returns the top matches with redacted snippets, relevance scores, and timestamps. Backed by the `ci_recall` MCP tool (expert mode) and the `recall` skill.

## How to invoke

```
ci_recall query="permission denied push"     # top 5 matches
ci_recall query="jq command not found" k=3    # cap results
ci_recall query="auth login" since=7d          # only the last 7 days
```

`since` accepts an ISO timestamp or a relative window: `7d`, `24h`, `30m`.

## Output shape

```
## Recall: "permission denied push"

2 match(es), most relevant first:

- [2026-05-20T10:00:00Z] **Bash** (score 3.41)
  …git push origin main  Permission denied: harness blocked direct push to main…
- ...
```

## Privacy

Snippets are passed through a secret redactor (AWS keys, JWT-shaped triplets, bearer tokens, KEY/SECRET/TOKEN/PASSWORD assignments, long hex strings) before display.

## Notes

- **Lexical, not semantic** — search with the vocabulary that actually appeared in the tool calls; try several phrasings if the first returns nothing.
- Searches the full captured history, not just the recent window.

## Pairs with

- **`recall`** skill — the discipline this command runs.
- **`continuous-improvement`** (core SKILL.md, Law 1 — Research Before Executing).
- **`gateguard`** — recall a past failure before clearing a high-risk action.
