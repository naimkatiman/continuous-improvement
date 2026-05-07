---
name: swarm
description: "Fan out N parallel sub-agents on isolated worktrees with a shared contract test, produce a comparison report. Driven by report.html horizon item 'Parallel Provider-Migration Agents' — pick winners from real evidence instead of discovering tier limits in production."
---

# /swarm

Parallel-agent fan-out for evidence-based decision-making. Driven by the user's session report: provider-swap epics (Trading Economics → Forex Factory, ETF → CFD, Finnhub → R StocksTrader, Stooq removal) each took multiple sessions and hit fallback bugs in production because alternatives were not vetted upfront.

This command does not replace the `superpowers:dispatching-parallel-agents` skill — it builds on top of it with a contract-pinned, worktree-isolated, comparison-report shape.

## When to use

The right trigger is "I need to pick between N options and I have a contract test that defines what 'works' means." Examples:

- Evaluating N candidate providers behind a shared interface (the report's recurring need)
- Trying N candidate refactors against the same test suite
- Prototyping N candidate library upgrades and measuring which breaks the fewest tests
- Generating N candidate UI designs that all pass the same accessibility + performance budget

Do NOT use this command for:

- Open-ended exploration without a contract — use `superpowers:brainstorming` instead
- Single-implementation tasks — use the `superpowers:dispatching-parallel-agents` skill directly
- Tasks where the candidates have different contracts — that is N separate jobs, not a swarm

## Preconditions

1. A shared contract test exists at a path the agents can reference (e.g. `tests/contracts/<name>.test.ts`).
2. Candidates are listed up front (3-6 typical; 8 max). Letting agents propose candidates is allowed but the list freezes before fan-out.
3. The base branch is clean.
4. Each candidate has a clear evaluation rubric: PASS/FAIL per contract test, plus per-candidate measurements (latency, coverage, cost, free-tier limits, etc. — domain-specific).

## Behavior

1. **Plan** — restate the objective, list candidates, confirm contract test path. If unclear, halt and ask.
2. **Bootstrap** — for each candidate, create an isolated worktree off `origin/main`: `git worktree add -b swarm/<objective>-<candidate> ../<candidate>`. Pin the base SHA in the swarm log.
3. **Fan out** — dispatch one fresh sub-agent per candidate via the `Agent` tool, in a single message (parallel, not serial). Each agent receives the contract test path, the candidate name, the rubric, and the worktree path.
4. **Run** — each agent implements the candidate behind the shared interface, runs the contract test against it, captures measurements per the rubric, and writes findings to `reports/<objective>/<candidate>.md`.
5. **Synthesize** — when all agents complete, this command produces a decision matrix (candidates × rubric metrics) and recommends a winner with citations to the per-candidate reports.
6. **Stop** — does NOT merge any candidate's worktree. Does NOT modify production. Output is evidence; the operator decides which candidate to advance.

## Topology

The default topology is **flat fan-out** — all agents run in parallel, no inter-agent communication. This matches the report's actual gap (provider migrations were each independent prototypes).

When `ruflo-swarm` is installed (`/plugin install ruflo-swarm@continuous-improvement`), an alternate topology becomes available: `hierarchical-mesh` with a coordinator role brokering stage hand-off. Activate via `/swarm --topology hierarchical-mesh`.

Available topologies (when ruflo-swarm installed):

| Topology | When to use |
|---|---|
| `flat` (default) | Independent prototypes, no shared state |
| `hierarchical` | One coordinator + N workers; workers report to coordinator only |
| `mesh` | Workers can share intermediate findings |
| `hierarchical-mesh` | Coordinator plus worker-to-worker chat |
| `ring` | Each worker hands off to the next; sequential within a parallel start |
| `star` | All workers report to a central evaluator that filters before synthesis |
| `adaptive` | Topology selected per-step based on intermediate findings |

## Stop conditions

Halt and surface to the operator if:

- Any agent reports the contract test is itself broken (test suite is the source of truth; if it is wrong, no candidate can win).
- A candidate's evaluation reveals the rubric is incomplete (a metric the rubric doesn't measure changes the answer).
- More than 50% of agents fail to produce a report (likely environment or harness issue, not candidate quality).
- The winner-by-rubric and the reports' qualitative findings disagree (surface the conflict; do not paper over it).

## Stream observation

Long swarm runs feel opaque. When `ruflo-swarm:monitor-stream` is installed, this command emits live progress events to a stream the operator can tail. Without it, this command writes per-step lines to `reports/<objective>/swarm.log` that can be tailed with `tail -f`.

## Composition

This command activates the unified `/superpowers` dispatcher and routes through:

- `superpowers:dispatching-parallel-agents` for the fan-out shape
- `ruflo-swarm:swarm-init` (when installed) for contract-pinned bootstrap
- `ruflo-swarm:monitor-stream` (when installed) for stream observation
- `superpowers:writing-plans` (or inline fallback) for the candidate list + rubric
- `proceed-with-the-recommendation` for walking the synthesis output as a recommendation list

## Anti-patterns this command refuses

- **Letting one candidate run before others start.** All worktrees and agents bootstrap together; no early-bird advantage.
- **Modifying the contract test mid-run.** Test is source of truth; halt instead.
- **Picking a winner without measurements.** The synthesis must cite the rubric, not just the agents' summaries.
- **Merging any worktree.** Output is evidence; operator decides advancement.

## Example

```
/swarm "Pick the next market data provider"

Candidates: Swissquote, R StocksTrader, Twelve Data, Finnhub
Contract: tests/contracts/provider-contract.test.ts
Rubric: PASS/FAIL per contract test, p50/p99 latency, symbol coverage for 50 tracked instruments, free-tier limits, monthly cost at expected volume
```

The orchestrator opens four worktrees, runs four agents in parallel, produces `reports/market-data-provider/{swissquote,rstockstrader,twelve-data,finnhub}.md`, and a `decision-matrix.md` with the recommended winner cited from the rubric.
