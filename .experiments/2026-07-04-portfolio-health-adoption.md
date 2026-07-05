# Experiment

> One file per experiment. Copy to `.experiments/<YYYY-MM-DD>-<slug>.md`. No experiment record = no claim of learning.

## Definition

| Field | Value |
|---|---|
| Experiment name | portfolio-health-adoption |
| Lane | infra |
| Repo | naimkatiman/continuous-improvement |
| Owner | naimkatiman |
| Feature flag (if any) | none |
| Start date | 2026-07-04 |
| Stop date (hard stop — decide even if inconclusive) | 2026-07-18 |

## Hypothesis

If we generate a weekly portfolio-health report (`ci-portfolio-health`), then the maintainer will take at least one concrete repo action per week traceable to the report, because a scored, ranked table with a named next action per repo removes the "where do I start" cost that currently blocks portfolio upkeep.

## Metrics

- Primary metric (one only): count of concrete repo actions per week traceable to the report (commit, PR, issue, or config change that cites the report or its named next action)
- Pass threshold (exact number): 2 consecutive weeks each producing >= 1 traceable action
- Guardrail metric (what must NOT get worse): time spent generating/reading the report stays under 15 minutes/week (the report must not become its own maintenance burden)
- Segment (who is measured): naimkatiman (single-maintainer portfolio)

## Result

Fill after stop date. Do not leave open past the stop date.

- Observed primary metric:
- Guardrail status:
- Evidence links (dashboards, exports, screenshots):

## Decision

One of: **ship** / **iterate** / **kill**. State the decision and the single next action.
