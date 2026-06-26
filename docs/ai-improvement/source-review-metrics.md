# Source Review Metrics Packet

- Status: active review aid for owner/Fatin/maintainer stabilization
- Scope: documentation-only metrics packet; no source, generated artifact, action metadata, hook behavior, MCP schema, release, deployment, env/secret, third-party snapshot, cron, staging, commit, push, reset, rebase, or config change
- Last updated: 2026-06-22 12:18 MPST (+0800)

## Why this exists

The repository already has an uncommitted-source handoff, and the safest next move is still review/stabilization rather than more runtime work. A fresh `git fetch --prune origin` changed the posture from remote-clean to `main...origin/main [ahead 1, behind 4]`. The true merge-base remains `136b7f1e8212ec987df31f44fd88e60fdd420cef`; `origin/main` now has 29 changed paths since that base, while the current dirty-path overlap with the remote path set is still zero.

This packet adds review leverage: remote/local path counts, churn by lane, source/test/config size metrics, and a recommended review sequence. It is not acceptance of the dirty tree and not deploy/release approval.

Code changes: none in this packet.

## Git and review posture

| Item | Current evidence |
|---|---|
|| Branch posture after fetch | `main...origin/main [ahead 1, behind 4]` |
|| Current local `HEAD` | `aa6df67 feat(skill-distill): carry observation event field through trajectory extraction` |
|| Current remote tip | `38f2b01 chore(release): cut v3.15.0 (#249)` |
|| Merge base | `136b7f1e8212ec987df31f44fd88e60fdd420cef` |
|| Remote changed paths since base | 29 |
|| Local-ahead changed paths since base | 11 |
|| Dirty paths before this packet | 17 |
|| Dirty paths after this packet was created | 18 |
|| Dirty-path overlap with remote changed paths | 0 |
|| Tracked working-tree shortstat before this packet | `11 files changed, 671 insertions(+), 80 deletions(-)` |

### Remote-only commit inventory since merge base

```text
fd5bc8a feat(ship): add /ship single-defect audit-to-PR command (#246)
b00337b feat(readiness): add /production-readiness-review parallel multi-agent review command (#247)
c4a09e9 feat(hook-pack): warn-default push-to-main + commit-size PreToolUse gates (#248)
```

Remote-only surfaces are new `/ship` and `/production-readiness-review` commands, new hook-pack gate source/generated/bundled files, plugin metadata updates, generated manifests, and the related plan/test artifacts. There is no direct dirty-path overlap, but a future sync still needs generated-artifact and public-surface verification because both local and remote histories touch distribution/runtime-adjacent surfaces.

### Local-ahead committed path set

```text
M	bin/mcp-server.mjs
A	docs/ai-improvement/README.md
A	docs/ai-improvement/implementation-log.md
A	docs/ai-improvement/mcp-cli-compatibility-contract.md
A	docs/ai-improvement/release-readiness-checklist.md
A	docs/ai-improvement/source-metrics-method.md
M	plugins/continuous-improvement/bin/mcp-server.mjs
M	src/bin/mcp-server.mts
M	src/lib/skill-distill.mts
M	src/test/skill-distill.test.mts
M	test/skill-distill.test.mjs
```

## Current dirty-lane metrics

### Tracked lane churn before this packet

| Lane | Files | Churn evidence | Review implication |
|---|---|---|---|
| GitHub Action transcript-linter contract | `src/bin/lint-transcript.mts`, `bin/lint-transcript.mjs`, `src/test/lint-transcript.test.mts`, `test/lint-transcript.test.mjs` | `231 insertions / 8 deletions` | Public Action input/output contract lane. Review source, generated bin, source test, and generated test together. |
| Strategic-compact runtime-claim cleanup | `skills/strategic-compact.md`, `plugins/continuous-improvement/skills/strategic-compact/SKILL.md`, `skills/README.md` | `25 insertions / 65 deletions` | Source skill + generated mirror/catalog lane. Keep source and mirror synchronized through build/verification before staging. |
| Landing + plan-status documentation | `docs/landing/index.html`, `docs/plans/2026-06-15-plan-pack.md` | `14 insertions / 5 deletions` | Static/product-doc lane. Landing source changes do not imply a production Cloudflare Pages deploy. |
| AI tracking/status docs | `docs/ai-improvement/README.md`, `docs/ai-improvement/implementation-log.md`, handoff/matrix/metrics docs | Volatile during this scheduled run | Treat as review aids only. These docs must not be used as proof that the underlying source lanes are accepted. |
| Untracked policy/plan docs | four `docs/plans/2026-06-18-*.md` files plus untracked AI handoff/matrix/metrics docs | Uncommitted artifacts | Decide intentionally whether to keep and stage as durable project records. |

### Per-file tracked numstat captured before this packet

```text
ACTION_LANE_NUMSTAT
15	3	bin/lint-transcript.mjs
17	3	src/bin/lint-transcript.mts
101	1	src/test/lint-transcript.test.mts
98	1	test/lint-transcript.test.mjs

SKILL_LANE_NUMSTAT
12	32	plugins/continuous-improvement/skills/strategic-compact/SKILL.md
1	1	skills/README.md
12	32	skills/strategic-compact.md

DOC_STATIC_LANE_NUMSTAT
4	4	docs/landing/index.html
10	1	docs/plans/2026-06-15-plan-pack.md

AI_TRACKING_LANE_NUMSTAT_PRE_PACKET
6	2	docs/ai-improvement/README.md
395	0	docs/ai-improvement/implementation-log.md
```

## Source/test/config size metrics

`uvx --from pygount pygount --format=summary --folders-to-skip='.git,node_modules,third-party,plugins,docs,coverage,dist,build,.cache,.turbo,.tox,venv,.venv,__pycache__' src test bin lib hooks scripts synthetic-checks action.yml package.json tsconfig.json .github` returned:

```text
JavaScript: 108 files, 14043 code, 2113 comment
Bash: 8 files, 395 code, 247 comment
YAML: 6 files, 274 code, 30 comment
JSON: 4 files, 226 code, 0 comment
Markdown: 4 files, 0 code, 78 comment
__unknown__: 103 files, 0 code, 0 comment
Sum: 233 files, 14938 code, 2468 comment
```

`uvx --from pygount pygount --suffix=mts --format=summary src` confirmed the `.mts` source blind spot:

```text
__unknown__: 103 files, 0 code, 0 comment
```

Supplemental no-dependency source scan for `.mts` files under `src/` returned:

```json
{
  "mtsFiles": 103,
  "totalSourceLines": 24908,
  "nonEmptySourceLines": 22304
}
```

Use the supplemental `.mts` values as source-line review aids, not pygount-style code lines.

## Verification snapshot

Commands run from `C:/Ai/continuous-improvement` while preparing this packet:

```text
git fetch --prune origin
```

Exit: 0. `origin/main` advanced by 3 commits and pruned three deleted remote branches.

No-temp remote/local overlap probe before creating this packet:

```json
{
  "branchStatus": "main...origin/main [ahead 1, behind 4]",
  "mergeBase": "136b7f1e8212ec987df31f44fd88e60fdd420cef",
  "remoteChangedPathCount": 29,
  "headChangedPathCount": 11,
  "dirtyPathCount": 18,
  "dirtyOverlapCount": 0,
  "diffShortstat": "11 files changed, 671 insertions(+), 80 deletions(-)"
}
```

Local safety checks:

```text
npm run typecheck
> continuous-improvement@3.14.0 typecheck
> tsc -p tsconfig.json --noEmit
```

Exit: 0.

```text
node --test test/lint-transcript.test.mjs test/skill-distill.test.mjs
ℹ tests 46
ℹ suites 8
ℹ pass 46
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Exit: 0.

Important limitation: these checks are a current safety snapshot. They do not prove the local ahead commit, dirty source/generated files, or remote-only commits have been human-reviewed or are safe to ship together.

## Anti-scope / approval boundaries

This packet does not authorize: source/runtime edits, generated artifact edits, schema or public MCP/bin/action contract changes, hook behavior changes, release tags, npm publish, GitHub Marketplace action, Cloudflare Pages deployment, env/secret changes, third-party snapshot refreshes, cron job edits, staging, commits, pushes, rebases, resets, or broad formatting.

Owner/Fatin approval is still required before any public contract break, release/deploy action, hook enforcement semantic change, `skill-distill` success-inference behavior change, or generated/plugin distribution change.

## Recommended review sequence

1. **Branch/sync posture first:** decide whether local commit `aa6df67` should become a reviewed PR, be amended/squashed on a feature branch, be rebased after the 3 remote commits, or be dropped.
2. **Remote-only lane review:** inspect `/ship`, `/production-readiness-review`, and hook-pack gate surfaces from the three remote commits before merging/rebasing local work.
3. **Dirty local lanes:** review the transcript-linter Action lane, strategic-compact source/mirror cleanup, landing/plan docs, AI tracking docs, and untracked policy docs as separate keep/revert/stage decisions.
4. **Generated/public-surface verification:** for any kept source/generated lane, rerun `npm run build`, targeted tests, `npm run verify:all`, and preferably `npm test` on a clean review branch.
5. **Explicit-file staging only:** avoid `git add .` / `git add -A` on this Windows host.

If no owner/Fatin decision is available, future autonomous runs should stay docs-only/status-only and avoid new runtime changes until this branch/dirty-tree review is resolved.
