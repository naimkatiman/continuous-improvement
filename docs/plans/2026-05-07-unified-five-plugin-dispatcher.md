# 2026-05-07 — Unified five-plugin dispatcher

## Goal

End the two-plugin split. One `/superpowers` dispatcher that knows about five upstream plugins (Obra superpowers, addy-agent-skills, ruflo-swarm, oh-my-claudecode, product-on-purpose/pm-skills) and routes per-task to the best skill across all of them. Driven by the user's `report.html` insights (1,218 messages, 178 sessions, 2026-04-10 to 2026-05-07).

## Scope decision (overrides prior cold-storage stance)

`OUR_NOTES.md` for both `addy-agent-skills` and `ruflo-swarm` previously recorded `Status: NOT integrated` with the rationale that wholesale registration would collapse the Obra-vs-CI distinction. The user explicitly overrides that stance in this train: "install all these back" + "I want all". The notes will be flipped in PR A so the on-disk truth matches reality.

Marketplace registration alone makes the plugins installable by name. Per-skill verbatim ports into the CI bundle remain single-concern PRs gated on user-pain triggers, as before. This train does not vendor any skill body into `plugins/continuous-improvement/skills/`.

## Stacked PR train (sequential, single worktree)

| # | Title | Files | Concern |
|---|-------|-------|---------|
| 0 | `chore(third-party): vendor product-on-purpose/pm-skills snapshot` | `third-party/pm-skills/` (selective copy) + `third-party/MANIFEST.md` (new entry) | Cold-storage snapshot only. No marketplace registration yet. |
| A | `feat(marketplace): register five upstream plugins as installable companions` | `.claude-plugin/marketplace.json` + 5 OUR_NOTES.md status lines | Surface-level registration. `/plugin install <name>@continuous-improvement` works for each. |
| B | `feat(superpowers): unified dispatcher routes across five plugins` | `skills/superpowers.md` + plugin mirror | Adds 5-source routing table (task trigger → preferred plugin → fallback). |
| C | `feat(orchestrator): proceed-with-the-recommendation gains 5-plugin fallback routing` | `skills/proceed-with-the-recommendation.md` + plugin mirror + `optional-companions.json` | Orchestrator can resolve every named target. |
| D | `feat(commands): /release-train and /swarm wrap report-derived autonomous workflows` | 2 new commands × source + plugin mirror = 4 files | Matches "horizon: autonomous multi-PR release trains" + "horizon: parallel provider-migration agents" from the report. |
| E | `chore(release): bump to 3.8.0 — five-plugin unified dispatch + report-driven commands` | `package.json` + plugin manifest + `CHANGELOG.md` | Single-concern release commit. |

Dependency: PR 0 → A → B → C → D → E (strict sequential). Worktree: `d:/Ai/ci-unified-dispatch` on `feat/unified-dispatch` off `origin/main` (368b00a).

## Verification per PR

`npm run verify:all` green between every PR. Catches drift at the smallest possible blast radius.

## Out of scope

- Wholesale port of upstream skill bodies into the CI bundle (21 addy + 39 OMC + 14 Obra + 27+ pm-skills). Marketplace registration makes them installable; user decides which to load.
- Modifying cold-storage refresh recipes in `MANIFEST.md`. They keep working as-is; PR 0 only adds a new entry.
- Pinning `npx @claude-flow/cli@latest` in ruflo-swarm assets (security note from `OUR_NOTES.md`). Inert until those skills are ported into CI bundle, which this train does not do.
- Touching Mulahazah observation hooks, Ralph loop, Continuous-learning classifier, or any verify-ladder logic.
- Bumping the third-party SHAs. Snapshots stay at currently-pinned commits.
- Loose `agent-skills/` at repo root (untracked, parallel-actor experiment) — not touched.

## Trigger source

User session 2026-05-07: explicit ask after the audit-then-recommendation turn. Driven by report.html friction analysis (premature action, environment mismatches, incomplete cleanup) and horizon items (autonomous release trains, parallel provider migration, self-healing verification loop).
