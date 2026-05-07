# OUR_NOTES.md — product-on-purpose/pm-skills

Our annotations on the vendored snapshot. Authored by us, not copied from upstream.

## Why we vendored this

`product-on-purpose/pm-skills` is an Apache-2.0 licensed library of 41 product-management skills + 47 commands following the agentskills.io specification. It covers the full product lifecycle: discover, define, develop, deliver, measure, iterate. The user is also a contributor to the upstream repo (PR #141 landed 2026-05-07; backlog F-08, F-09 tracked in MEMORY.md `project_pm_skills_contribution_kit`).

We vendored it as cold-storage so we can:

- Read upstream's actual skill bodies side-by-side with ours, without round-trips to `D:/Ai/pm-skills`.
- Track upstream changes against pinned SHA.
- Decide later, on a per-skill basis, whether to port a PM-flavored skill into the 7 Laws bundle — explicitly, with attribution.

## Status: Registered as optional install (PR A of 2026-05-07 train)

This snapshot is **registered in `.claude-plugin/marketplace.json`** as of PR A. Users who want it can `/plugin install pm-skills@continuous-improvement`. Users who already have upstream installed via `/plugin marketplace add product-on-purpose/pm-skills` should keep that — our copy is a frozen snapshot, theirs auto-updates.

The snapshot is **not loaded** into `plugins/continuous-improvement/` itself. Marketplace registration alone makes it installable; per-skill verbatim ports into the CI bundle remain single-concern PRs gated on user-pain triggers.

## Overlap with the 7 Laws (read this before integrating anything)

| Upstream skill / command | 7 Laws equivalent | Notes |
|---|---|---|
| `commands/prd.md`, `skills/define-prd-writer/` | (no direct equivalent) | We have `planning-with-files` for engineering plans; pm-skills has product-requirement-document discipline. **Genuine gap** for product-shaped work. |
| `commands/user-stories.md`, `commands/acceptance-criteria.md` | (no direct equivalent) | Story-shaped requirement decomposition. **Genuine gap.** |
| `commands/okr-writer.md`, `commands/okr-grader.md` | (no direct equivalent) | Quarterly OKR write-and-score cycle. **Genuine gap** for goal-tracking work. |
| `commands/launch-checklist.md`, `commands/release-notes.md` | `finishing-a-development-branch` (Obra) + `commit-commands:commit-push-pr` | Loose overlap. Ours is engineering-focused; upstream is product-launch-focused. |
| `commands/retrospective.md`, `commands/lessons-log.md` | `learn-eval` + `continuous-learning` (Law 7) | Loose overlap. Ours is session-pattern-extraction; upstream is structured retrospective format. |
| `skills/foundation-spec-driven-development/` (if present) | overlaps with `addy:spec-driven-development` | Two upstreams cover the same pattern; pick one. |
| `commands/persona.md`, `commands/jtbd-canvas.md`, `commands/lean-canvas.md` | (no direct equivalent) | Discovery-phase frameworks. **Genuine gap.** |
| `commands/competitive-analysis.md`, `commands/market-sizing.md` | (no direct equivalent) | Market-research framings. **Genuine gap.** |
| `commands/experiment-design.md`, `commands/experiment-results.md`, `commands/hypothesis.md` | (no direct equivalent) | Hypothesis-driven product validation. **Genuine gap.** |
| `commands/meeting-agenda.md`, `commands/meeting-brief.md`, `commands/meeting-recap.md`, `commands/meeting-synthesize.md` | (no direct equivalent) | Meeting Skills Family v2.11.0 — cross-cutting meeting workflow. **Genuine gap.** |
| `commands/pm-skill-builder.md` | partial: our `skill-create` slash command + `writing-skills` (Obra) | Upstream's is PM-shaped; ours is engineering-shaped. Two valid generators. |

## Integration candidates (recorded here, NOT acted on in this PR)

These are surfaces most likely to inform a future port. Each port is a separate single-concern PR, only after a concrete user-pain trigger:

| Upstream surface | Gap in our 7 Laws | Trigger to port |
|---|---|---|
| `commands/prd.md` + supporting skill | We have engineering plans (`planning-with-files`) but no product-requirement-doc discipline | A user request to draft a PRD before implementation |
| `commands/okr-writer.md` + `okr-grader.md` | No goal-tracking surface today | A user request to write or score OKRs |
| `commands/retrospective.md` | We have `learn-eval` for session patterns but not multi-session retros | A request to retrospect across a sprint or release |
| `commands/launch-checklist.md` | `finishing-a-development-branch` covers branch close but not product-launch checklist | A user request for a product-launch checklist before a release |
| `commands/experiment-design.md` | No hypothesis-shaped validation discipline today | A request to design an A/B test or experiment |

## What is intentionally NOT integrated (and why)

1. **Upstream's full 41-skill bundle.** Marketplace registration in PR A makes them installable on demand; bundling them all into `plugins/continuous-improvement/skills/` would double the skill count and dilute the Law-aligned focus.
2. **Upstream's `commands/pm-skill-builder.md` as a CI-bundled command.** We already have `skill-create` for engineering skills. Two skill-builder commands competing in the same namespace creates routing ambiguity. Use upstream's by `/plugin install pm-skills@continuous-improvement` then `/pm-skill-builder`.
3. **Upstream's `_workflows/` and `library/`.** These are upstream's content-management surfaces. Out of scope for our marketplace.
4. **Upstream's `.claude-plugin/marketplace.json` and `plugin.json`.** Read-only reference only. Do not treat upstream's marketplace as a peer of ours.
5. **The em-dash hard rule from the upstream CLAUDE.md.** That rule applies when contributing TO `product-on-purpose/pm-skills`; it does NOT apply to our repo's authored content. Our CLAUDE.md does not enforce it.

## Cross-reference: contributing TO this upstream

Naim contributes to `product-on-purpose/pm-skills` upstream through a fork at `D:/Ai/pm-skills` (origin = `naimkatiman/pm-skills`, upstream = `product-on-purpose/pm-skills`). House rules for those PRs are codified in MEMORY.md `project_pm_skills_contribution_kit` — em-dash hard rule, F-05 packet flow, count cascade ~23 files, validator chain. **Those rules do NOT apply to this snapshot or any ports landing in our repo** — they govern contributions going the other direction.

## Ported into the 7 Laws

Nothing yet. This row stays empty until a concrete port lands. When one does, append a row with:

- Date
- Source path inside the snapshot (with the upstream SHA at port time)
- Target path in our repo
- Commit SHA
- One-line summary of what was ported and what was rejected

## Refresh

See `third-party/MANIFEST.md` for the pinned SHA and the exact selective-copy recipe.
