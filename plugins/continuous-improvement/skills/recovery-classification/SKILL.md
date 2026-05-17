---
name: recovery-classification
tier: "2"
description: "Enforces Law 4 (Verify Before Reporting) of the 7 Laws of AI Agent Discipline. After any failure in the verification ladder or auto-loop, classify the failure class before retrying — provider, tool-schema, deterministic-policy, git, worktree, runtime — so retry-vs-pause-vs-self-heal-vs-stop is an intentional decision, not a generic 'try again'."
origin: continuous-improvement
user-invocable: false
---

# Recovery Classification Skill

When a phase or unit fails, name the failure class first. Generic "retry on failure" hides repeatable failure modes and turns them into flaky tests.

## When to Use

- After any Phase 1–6 failure in `verification-loop`.
- After any auto-loop unit that exits non-zero.
- After any tool call the harness rejects (schema validation, policy gate, deterministic block).
- Before re-running anything that just failed — classification fires once, before the first retry.

## Why This Skill Exists

GSD-2's [CONTEXT.md](https://github.com/gsd-build/gsd-2/blob/main/CONTEXT.md) names "Recovery Classification" as one of four runtime invariant modules. Common failure modes it catches:

- **Deterministic-policy blocks misclassified as generic provider failures** — gateguard denials retried in a loop until budget is exhausted.
- **Schema-validation failures retried verbatim** — wasting tokens on a call the validator will keep rejecting.
- **Stale-worker / stale-lock states** — no retry can resolve a worker that died holding a lock; the loop just spins.
- **Worktree-invalidity errors** — recovery can't fix without operator intervention; retrying writes to a broken root.

A retry without a class is a guess; a guess at scale is a budget leak.

## The Classification Taxonomy

Six classes. Each maps to one intentional action:

| Class | Signal | Action |
|---|---|---|
| **provider** | API timeout, 5xx, rate limit, network, transient cloud error | retry with exponential backoff |
| **tool-schema** | tool input rejected by validator, missing required field, type mismatch | repair input, do **not** retry verbatim |
| **deterministic-policy** | gateguard / write-gate / permission denied / explicit policy block | pause, ask operator (do **not** retry) |
| **git** | merge conflict, detached HEAD, unmerged paths, lockfile, pre-commit hook | self-heal if known recipe, else pause |
| **worktree** | missing `.git`, invalid root, lease lost, prunable worktree, foreign session | stop — never spawn workers into unresolved paths |
| **runtime** | OOM, segfault, host kill, parent process gone, context exhaustion | stop, surface to operator |

A failure that fits no class is `unclassified` — that itself is a signal: the taxonomy is incomplete and needs a new entry, not a retry.

## The Output Contract

Before any retry, emit one fenced block:

```
recovery-classification:
  failure:        <one-line summary>
  class:          tool-schema
  evidence:       stderr line 14: "missing required field: workspace_id"
  action:         repair input (add workspace_id from session context), do NOT retry verbatim
  retry budget:   2/3 remaining (this class)
```

Retry budgets are **per-class**, not global. A failed class that resolves on retry resets its budget; a class that exhausts its budget escalates to `pause` regardless of remaining global retries. This keeps a flaky network from masking a persistent schema bug.

## Anti-Patterns

- **One retry budget for all classes.** A network blip and a schema mismatch consume the same counter, so persistent schema bugs masquerade as "flaky network."
- **Auto-retry on `deterministic-policy`.** The gate exists exactly because retry is wrong. Pause instead and surface the policy that fired.
- **Classifying after retry.** The class informs the action; classifying afterward turns it into a post-mortem label and the loop has already misspent its budget.
- **Coalescing `worktree` into `git`.** Worktree errors are stop-class; git errors are usually self-heal-class. Conflating them lets workers spawn into broken roots.
- **Treating `unclassified` as `provider`.** Unknown is not transient. Force a taxonomy update; do not paper over the gap with a backoff.

## Pairs With

- [verification-loop](verification-loop.md) — every Phase 1–6 failure routes through here before any retry.
- [state-reconciliation](state-reconciliation.md) — runs before the next loop iteration when class is `git` or `runtime`, since those classes often leave drift behind.
- [worktree-safety](worktree-safety.md) — class `worktree` is exactly worktree-safety's failure surface; the two are co-defined.
- [gateguard](gateguard.md) — class `deterministic-policy` is gateguard's surface; recovery-classification names what gateguard already blocked.
