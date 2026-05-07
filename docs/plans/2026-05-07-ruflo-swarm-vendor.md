# 2026-05-07 — Vendor `ruvnet/ruflo` `plugins/ruflo-swarm/` slice to `third-party/ruflo-swarm/`

Plan for the second Superpowers-framework chain of the day: worktree → plan → verify → vendor → review → finish-branch → PR. Single-concern PR. No integration in this PR.

## Goal

Cold-storage snapshot of one plugin slice from upstream `ruvnet/ruflo` — specifically `plugins/ruflo-swarm/` — at `third-party/ruflo-swarm/`. This addresses the explicit agent-orchestration / agent-swarm gap the user identified ("the gap like agent ochestration and agent swarm from ruflo").

This snapshot is **not loaded** by `plugins/continuous-improvement/`, **not registered** in `.claude-plugin/marketplace.json`, **not** wired into hooks. Same cold-storage policy as `third-party/superpowers/`, `third-party/oh-my-claudecode/`, and the just-merged `third-party/addy-agent-skills/`.

## Why this slice, not the whole monorepo

`ruvnet/ruflo` is a 32-plugin monorepo (~5 MB+ with media, MCP servers, TS source, neural-trader, market-data, IoT, federation, etc.). Vendoring all of it would:

- Pull in 30+ plugins we have no current need for (high blast radius, low signal).
- Compete directly with our 7 Laws and continuous-improvement learning systems (`ruflo-autopilot`, `ruflo-intelligence`, `ruflo-loop-workers`, `ruflo-rag-memory`, `ruflo-agentdb`, `ruflo-rvf` all overlap).
- Bring in non-Claude vendor adapters and TypeScript build state we have explicitly excluded from prior snapshots.

Cherry-picking `ruflo-swarm` only:

- Surface area is ~9 files (2 agents + 2 commands + 2 skills + 1 ADR + 1 smoke script + README + plugin.json), ~30 KB.
- Directly addresses the stated gap: agent-team coordination, Monitor stream-based observation, worktree isolation patterns.
- Is parallel-readable against `superpowers:dispatching-parallel-agents` (Obra), our existing parallel-agent dispatch surface — not a replacement, an alternate take.
- Stays inside our cold-storage discipline.

Snapshot path is `third-party/ruflo-swarm/`, **not** `third-party/ruflo/`. The name reflects what was vendored. Anyone reading the path should not infer that the full monorepo lives here.

## Pinned SHA

`ruvnet/ruflo` @ `addb5cd3f30c4e9eef9b25084419bd1c5015e169` (2026-05-06T22:28:37Z, default branch `main`). Note: HEAD is a 3.7.0-alpha hotfix commit, but the `plugins/ruflo-swarm/` slice we're copying is content-stable across recent SHAs.

## Selective scope (verbatim from upstream)

Only the `plugins/ruflo-swarm/` subtree from upstream is vendored, plus the repo-root `LICENSE` for attribution.

- `README.md` — plugin overview
- `.claude-plugin/plugin.json` — plugin manifest (read-only; not registered in our marketplace)
- `agents/architect.md`, `agents/coordinator.md` — 2 agent definitions
- `commands/swarm.md`, `commands/watch.md` — 2 commands
- `skills/swarm-init/SKILL.md`, `skills/monitor-stream/SKILL.md` — 2 skills
- `docs/adrs/0001-swarm-contract.md` — architecture decision record
- `scripts/smoke.sh` — smoke test script
- `LICENSE` (MIT, ruvnet 2024-2026) — copied from repo root because the plugin slice has no own LICENSE; required for MIT attribution

## Excluded from snapshot

- The other 31 ruflo plugins (`ruflo-core`, `ruflo-loop-workers`, `ruflo-autopilot`, `ruflo-intelligence`, `ruflo-rag-memory`, `ruflo-agentdb`, etc.) — out of scope; cherry-pick discipline.
- `ruflo/` runtime, `bin/`, `package.json`, `package-lock.json`, `tsconfig.json`, `tests/`, `archive/`, `verification.md`, `verification-results.md`, `verification-inventory.json`, `ruflo-plugins.gif` (~5.5 MB) — runtime/build state, not vendor scope.
- `.claude/`, `.agents/`, `.githooks/`, `.github/`, `.gitignore`, `.npmignore` — repo metadata.
- Root `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md` (top level) — auto-load contamination risk; the plugin's own files don't include these.
- Top-level `README.md`, `CHANGELOG.md`, `SECURITY.md` — not the plugin's; the plugin has its own README.md.

## Carried-in negative prompts (P-MAG Rule 3)

> Will NOT repeat: collapsing Obra and CI superpowers — `ruflo-swarm` is its own snapshot, parallel to obra/superpowers, oh-my-claudecode, and addy-agent-skills. Four distinct snapshots. None bundled, none loaded.
>
> Will NOT repeat: vendoring the full monorepo when the user asked for one plugin. Scope is `plugins/ruflo-swarm/` only; the plan and OUR_NOTES.md explicitly call out the 31 excluded plugins so future readers don't think this is a partial copy of the whole.
>
> Will NOT repeat: `git add .` / `-A` — every snapshot file is staged by explicit path. Lockfile drift from `npm install` (if any) is discarded before stage.
>
> Will NOT repeat: bundled concerns — vendoring (this PR) ships alone. The `bin/refresh-third-party.mjs` driver SNAPSHOTS entry remains parked (deferred follow-up #1) until either ruflo-swarm or a 4th-snapshot trigger makes it load-bearing.
>
> Will NOT repeat: claiming integration. This PR vendors. Integration of any specific idea (e.g., porting a swarm pattern into our `dispatching-parallel-agents` flow) is its own future single-concern PR.

## Step plan

| Step | Action | Verification |
|---|---|---|
| 1 | Worktree `third-party/ruflo-swarm` off `origin/main@4a6727c` | `git worktree list` + clean status |
| 2 | This plan doc | merged into the same single-concern PR |
| 3 (baseline) | `npm run typecheck` + `npm run test` on clean main inside worktree | both green before any vendor add |
| 4a | Shallow-clone upstream, verify HEAD matches pinned SHA, copy `plugins/ruflo-swarm/` subtree verbatim, copy repo-root `LICENSE`, strip every `CLAUDE.md` inside snapshot | `find third-party/ruflo-swarm -name CLAUDE.md` returns empty |
| 4b | Append `### ruvnet/ruflo (plugins/ruflo-swarm slice)` block to `third-party/MANIFEST.md` (SHA, scope, recipe, exclusions) | manual diff vs. addy/obra/OMC entries — same shape |
| 4c | Author `third-party/ruflo-swarm/OUR_NOTES.md` (overlap matrix vs. Obra `dispatching-parallel-agents` and our `/loop`, integration candidates, NOT-integrated banner, refresh pointer) | matches OUR_NOTES.md shape |
| 5 (verify-after) | `npm run typecheck` + `npm run test` again | both green after vendor add |
| 6 | code-reviewer + security-reviewer agents in parallel on the worktree diff | review reports attached to PR |
| 7 | finishing-a-development-branch — squash-merge ready check, ahead-of-origin baseline check, no drive-by changes | branch ready for single squash commit |
| 8 | Open PR vs `main` — `chore(third-party): vendor ruvnet/ruflo (ruflo-swarm slice) @ addb5cd` | single concern, MANIFEST pinned, OUR_NOTES.md populated |

## Integration candidates (recorded here, NOT acted on in this PR)

These are the surfaces in `ruflo-swarm` most likely to inform a future port. Each port is a separate single-concern PR, only after a concrete user-pain trigger:

| Upstream surface | Gap in our 7 Laws | Trigger to port |
|---|---|---|
| `agents/coordinator.md` | We dispatch parallel agents via `superpowers:dispatching-parallel-agents` but have no explicit coordinator role with a stage-pipeline contract | A workflow needing typed stage hand-off (plan → exec → verify) where a single Claude session can't keep all stages in head |
| `agents/architect.md` | Our `architect` is a built-in subagent; ruflo-swarm's is shaped specifically for swarm contracts | A plan-doc that requires structural ADR output before delegation |
| `commands/swarm.md` | No equivalent slash command for fanning out a single objective across N specialized roles | A repeated user request to "run this 3 ways in parallel" that today is hand-rolled per session |
| `commands/watch.md` + `skills/monitor-stream/` | Our agents return one final result; we have no streamed-progress observation surface | A user reporting that long agent runs feel opaque; Monitor stream pattern would close the loop |
| `skills/swarm-init/` | Initialization contract for a multi-agent run (worktrees, base ref, role list) | Repeated need to bootstrap a parallel-agent run; today this is freehand |

## Deferred follow-ups (explicit list, NOT in this PR)

- **#1 (carried over)** — `bin/refresh-third-party.mjs` SNAPSHOTS entry. Now covers two parked snapshots (addy + ruflo-swarm). Re-evaluate trigger: when a 4th snapshot lands, OR when an upstream refresh fails because the recipe drifted from the driver. Separate PR.
- **#2 (carried over)** — Generic third-party shape invariant (every `third-party/<name>/` has `OUR_NOTES.md`, `LICENSE`, matching `### <heading>` row in `MANIFEST.md` with 40-char SHA). Re-evaluate trigger: 4 snapshots is the threshold per the prior plan. With this PR we hit 4 (oh-my-claudecode, superpowers, addy-agent-skills, ruflo-swarm). Re-assess after this lands.
- **#3 — Port a specific swarm idea into our `dispatching-parallel-agents` workflow.** Held until a concrete user-pain trigger from the candidates table above.

## Risks

- **License posture.** Upstream is MIT (Copyright 2024-2026 ruvnet). Files copied verbatim; annotations only in sibling `OUR_NOTES.md`. Repo-root `LICENSE` copied to the snapshot path because the plugin slice has no own LICENSE. Standard MIT attribution.
- **CLAUDE.md leakage.** Upstream ships `CLAUDE.md`, `CLAUDE.local.md`, and a top-level `AGENTS.md` (~21 KB) at the repo root. None are inside `plugins/ruflo-swarm/` so the subtree copy will not pull them. Post-copy `find ... -name CLAUDE.md -delete` runs anyway as a safety belt.
- **Misleading snapshot path.** Anyone scanning `third-party/ruflo-swarm/` could assume the full ruflo monorepo lives here. Mitigation: `OUR_NOTES.md` opens with a "this is ONE plugin from a 32-plugin monorepo" disclaimer.
- **Drift across snapshots.** Refresh cadence (first business day of each month) applies. Recorded in MANIFEST.md.
- **Plugin overlap with Obra/CI.** `coordinator.md`, `architect.md`, `swarm.md`, `monitor-stream/`, `swarm-init/` all overlap with surfaces in `superpowers:dispatching-parallel-agents` and our continuous-improvement loop. Cold-storage is safe; integration would require explicit conflict resolution per the OUR_NOTES.md matrix.

## Out of scope (explicit)

- The other 31 ruflo plugins (`ruflo-core`, `ruflo-loop-workers`, `ruflo-autopilot`, `ruflo-intelligence`, `ruflo-rag-memory`, `ruflo-agentdb`, `ruflo-cost-tracker`, `ruflo-adr`, `ruflo-aidefence`, `ruflo-browser`, `ruflo-jujutsu`, `ruflo-wasm`, `ruflo-workflows`, `ruflo-daa`, `ruflo-ruvllm`, `ruflo-rvf`, `ruflo-plugin-creator`, `ruflo-goals`, `ruflo-cost-tracker`, `ruflo-ddd`, `ruflo-federation`, `ruflo-iot-cognitum`, `ruflo-knowledge-graph`, `ruflo-market-data`, `ruflo-migrations`, `ruflo-neural-trader`, `ruflo-observability`, `ruflo-ruvector`, `ruflo-sparc`, `ruflo-security-audit`, `ruflo-testgen`)
- The ruflo runtime (`ruflo/`, `bin/`, `package.json`)
- Driver integration in `bin/refresh-third-party.mjs` (deferred #1)
- Generic third-party shape invariant check (deferred #2)
- Any port of ruflo-swarm content into `skills/`, `agents/`, `commands/`, or `plugins/continuous-improvement/`
- Any registration of ruflo-swarm in our `.claude-plugin/marketplace.json`
- Any edits to upstream files beyond `find -name CLAUDE.md -delete` post-copy
