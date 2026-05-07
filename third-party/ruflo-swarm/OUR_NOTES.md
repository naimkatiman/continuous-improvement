# OUR_NOTES.md — ruflo-swarm (cherry-picked from ruvnet/ruflo)

Our annotations on the vendored snapshot. Authored by us, not copied from upstream.

## Read this first: this is ONE plugin from a 32-plugin monorepo

`ruvnet/ruflo` is a 32-plugin monorepo. We vendored **only** the `plugins/ruflo-swarm/` slice. The other 31 plugins (`ruflo-core`, `ruflo-loop-workers`, `ruflo-autopilot`, `ruflo-intelligence`, `ruflo-rag-memory`, `ruflo-agentdb`, `ruflo-cost-tracker`, `ruflo-adr`, `ruflo-aidefence`, `ruflo-browser`, `ruflo-jujutsu`, `ruflo-wasm`, `ruflo-workflows`, `ruflo-daa`, `ruflo-ruvllm`, `ruflo-rvf`, `ruflo-plugin-creator`, `ruflo-goals`, `ruflo-ddd`, `ruflo-federation`, `ruflo-iot-cognitum`, `ruflo-knowledge-graph`, `ruflo-market-data`, `ruflo-migrations`, `ruflo-neural-trader`, `ruflo-observability`, `ruflo-ruvector`, `ruflo-sparc`, `ruflo-security-audit`, `ruflo-testgen`, `ruflo-docs`) are explicitly **out of scope**. They overlap heavily with our continuous-improvement learning systems and our 7 Laws plugin; pulling them in would collapse the very Obra-vs-CI distinction our session contract preserves.

If you came here looking for ruflo's neural trader, RAG memory, swarm intelligence, federation, or any other plugin, install ruflo from upstream the normal way — do not assume any of it is here.

## Why we vendored this slice

The user identified a specific gap: **agent orchestration and agent swarm**. `ruflo-swarm` is the upstream surface that most directly addresses it — it ships agent-team coordination contracts, Monitor stream-based observation, and worktree isolation patterns. Vendoring as cold-storage lets us:

- Read the swarm contracts side-by-side with `superpowers:dispatching-parallel-agents` (Obra) without round-trips.
- Track upstream changes against pinned SHA.
- Decide later, on a per-surface basis, whether to port any specific idea into our parallel-agent dispatch flow — explicitly, with attribution.

## Status: NOT integrated

This snapshot is **not loaded by `plugins/continuous-improvement/`**. It is **not registered in `.claude-plugin/marketplace.json`**. Users who want ruflo should install it from upstream the normal way (`/plugin marketplace add ruvnet/ruflo`) — and accept that doing so installs all 32 plugins and their MCP servers, which can collide with our learning system, our `/loop`, and our PARA memory.

If you want to experiment locally with just `ruflo-swarm`, point Claude Code at this snapshot path directly — but understand that doing so installs upstream's hooks, agents, and skills, which will collide with our routing.

## Activation hazards (INFO from security review)

The snapshot is safe as cold-storage. The two items below are **inert while files are not loaded by Claude Code** — they only matter if a developer points Claude Code at this path.

1. **Unpinned `npx @claude-flow/cli@latest` in every operational asset.** All five agent/skill/command files (`agents/{architect,coordinator}.md`, `commands/{swarm,watch}.md`, `skills/{swarm-init,monitor-stream}/SKILL.md`) instruct Claude to run `npx @claude-flow/cli@latest`. Activation would resolve `@latest` against whatever the npm dist-tag points to at runtime — supply-chain risk if the `@claude-flow/cli` package is ever compromised or shadowed by a typosquat. If we ever port any of these surfaces, pin to a specific version at port time.
2. **`mcp__claude-flow__*` tools in `allowed-tools` frontmatter.** Activation would attempt MCP calls into whichever server the developer's `.mcp.json` binds `claude-flow` to. No hardcoded URL is embedded; the routing is local. Inert here, but worth knowing if you ever wire a `claude-flow` MCP server in your own config and read these files.

## Overlap with the 7 Laws (read this before integrating anything)

| Upstream surface | 7 Laws / Obra equivalent | Notes |
|---|---|---|
| `commands/swarm.md` | (no direct equivalent) | Slash command for fanning out a single objective across N specialized roles. We dispatch in-session via `superpowers:dispatching-parallel-agents` but have no slash-command surface for it. **Genuine gap.** |
| `commands/watch.md` | (no direct equivalent) | Real-time observation of a running swarm. Our agents return one final result; no streamed-progress surface today. **Genuine gap.** |
| `skills/swarm-init/SKILL.md` | partial: `superpowers:dispatching-parallel-agents` covers fan-out shape, but not the bootstrap (worktrees, base ref, role list, contract pinning) | Fills a "before-fan-out" surface we don't formalize today. |
| `skills/monitor-stream/SKILL.md` | (no direct equivalent) | Stream-based observation. Our `/loop` polls; this is push. **Genuine gap.** |
| `agents/architect.md` | built-in `architect` subagent; `superpowers:writing-plans` (Law 2) | Loose overlap. Upstream's is shaped specifically for swarm contracts (structural ADR output before delegation); ours is general-purpose. |
| `agents/coordinator.md` | (no direct equivalent) | Stage-pipeline coordinator role. Same gap that surfaced earlier in `third-party/oh-my-claudecode/OUR_NOTES.md` for `omc/team`; ruflo's take is contract-driven and lighter than OMC's. **Worth diffing against OMC if/when we ever port a coordinator.** |
| `docs/adrs/0001-swarm-contract.md` | (no direct equivalent) | Architecture decision record describing the swarm-contract shape. Read-only reference that anchors the rest of the slice. |
| `scripts/smoke.sh` | (no direct equivalent) | Smoke-test script for the plugin. Cold-storage; not run. |
| `.claude-plugin/plugin.json` | (read-only reference) | Do **not** register `ruflo-swarm` in our `.claude-plugin/marketplace.json`. |

## Integration candidates (recorded here, NOT acted on in this PR)

These are the surfaces most likely to inform a future port. Each port is a separate single-concern PR, only after a concrete user-pain trigger:

| Upstream surface | Gap in our 7 Laws | Trigger to port |
|---|---|---|
| `commands/swarm.md` | No slash command for "run this objective across N specialized roles in parallel" — today this is hand-rolled per session | A repeated user request to fan out the same objective to multiple roles |
| `commands/watch.md` + `skills/monitor-stream/` | Long agent runs feel opaque — single final result, no streamed progress | A user report that long parallel runs feel blind, where Monitor stream pattern would close the loop |
| `skills/swarm-init/` | Bootstrapping a parallel-agent run is freehand: worktrees + base ref + role list assembled per session | Repeated need to bootstrap a parallel-agent run, where contract-pinning would prevent role drift |
| `agents/coordinator.md` | We have no coordinator role to broker stage hand-off (plan → exec → verify) when stages can't fit in one Claude session | A workflow needing typed stage hand-off where a single Claude session can't keep all stages in head |
| `docs/adrs/0001-swarm-contract.md` (pattern, not content) | We have ADR support via `architecture-decision-records` skill but no *swarm-contract* shape | When porting any of the above, the contract shape should anchor the implementation |

## What is intentionally NOT integrated (and why)

1. **The other 31 ruflo plugins.** All explicitly out of scope. Multiple direct overlaps with our continuous-improvement learning system, our `/loop`, our `/ralph`, our PARA memory, and our 7 Laws routing. Adopting wholesale collapses the Obra-vs-CI distinction.
2. **Upstream's `plugin.json` and any marketplace registration.** Read-only reference only.
3. **`scripts/smoke.sh`.** Cold-storage; not wired to any test runner. If we ever port it, the path/runner conventions would have to change to match our `bin/` layout.
4. **`commands/swarm.md` and `commands/watch.md` as live slash commands.** These are upstream Claude Code slash commands for ruflo's own runtime. Importing them as-is would shadow nothing today (we don't have `/swarm` or `/watch`), but their contracts assume ruflo's MCP servers are running. Don't import without porting their dependencies or rewriting the contract to be MCP-free.
5. **Any auto-loading file** (`CLAUDE.md`, `CLAUDE.local.md`). None live inside the slice; if any future refresh introduces one, the refresh recipe's `find -name CLAUDE.md -delete` strips it.

## Ported into the 7 Laws

Nothing yet. This row stays empty until a concrete port lands. When one does, append a row with:

- Date
- Source path inside the snapshot (with the upstream SHA at port time)
- Target path in our repo
- Commit SHA
- One-line summary of what was ported and what was rejected

## Refresh

See `third-party/MANIFEST.md` for the pinned SHA and the exact selective-copy recipe. Refresh cadence is the same as for other snapshots: first business day of each month, only on meaningful upstream change. The cherry-pick scope (`plugins/ruflo-swarm/` only) does not change unless this OUR_NOTES.md is updated alongside the SHA bump.
