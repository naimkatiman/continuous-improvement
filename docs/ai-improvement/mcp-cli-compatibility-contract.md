# MCP and CLI Compatibility Contract

- Status: active operator reference map
- Scope: documentation-only; no runtime, MCP schema, bin, hook, generated manifest, release, cron, or production configuration change
- Last verified: 2026-06-18 21:23 MPST (+0800)

## Purpose

`continuous-improvement` exposes value through several public surfaces at once: npm binaries, a Claude plugin bundle, an MCP server, generated beginner/expert mode manifests, hook configuration, and the GitHub Action transcript linter. This note maps the current compatibility contract so future agents can change those surfaces deliberately instead of relying on stale README snippets or generated artifacts.

Use this file before adding, renaming, removing, or changing a public command, MCP tool, mode manifest, hook summary, or action input/output. It is a reference map, not permission to change any public surface.

## Source-of-truth files inspected

| Surface | File(s) inspected | Why it matters |
|---|---|---|
| npm package and public bins | `package.json` | Defines the published package name/version, public `bin` names, files included in the package, and verification scripts. |
| MCP tool catalog and generated manifests | `src/lib/plugin-metadata.mts`, `plugins/beginner.json`, `plugins/expert.json` | `src/lib/plugin-metadata.mts` is the source of tool names, descriptions, input schemas, mode descriptions, hook summaries, and generated mode manifests. |
| MCP server transport/dispatch | `src/bin/mcp-server.mts` | Implements JSON-RPC newline stdio transport, mode parsing, `tools/list`, `tools/call`, `resources/list`, and per-tool behavior. |
| Installer and cross-agent targets | `src/bin/install.mts`, `src/lib/install-targets.mts` | Installs Claude Code hooks/MCP settings, starter packs, and managed rules files for non-Claude targets. |
| Public CLI entrypoints | `src/bin/unified-cli.mts`, `src/bin/lint-transcript.mts`, `src/bin/plan-pack.mts` | Defines the behavior behind the `ci`, `ci-lint-transcript`, and `ci-plan-pack` public bins. |
| GitHub Action contract | `action.yml`, `.github/workflows/ci.yml`, `.github/workflows/release.yml` | `action.yml` is the Marketplace contract; CI/release workflows prove the generated artifacts, tests, and action linter keep running. |
| Generated plugin bundle | `src/bin/generate-plugin-manifests.mts`, `plugins/continuous-improvement/.claude-plugin/plugin.json`, `plugins/continuous-improvement/hooks/hooks.json`, `.claude-plugin/marketplace.json` | Generated surfaces are shipped, but source changes should happen in `.mts`/source markdown followed by `npm run build`. |
| User/operator docs | `README.md`, `docs/using-this-plugin.md`, `docs/ai-improvement/README.md`, `docs/ai-improvement/release-readiness-checklist.md` | These docs contain install, verification, and release promises that must stay aligned with the public surfaces. |
| Drift guards | `src/bin/check-tool-count.mts`, `package.json` `verify:*` scripts | `verify:tool-count`, `verify:everything-mirror`, `verify:docs-substrings`, and `verify:generated` catch common public-surface drift. |

## System boundary

```text
package.json
  ├─ npm bins
  │   ├─ continuous-improvement -> bin/install.mjs
  │   ├─ ci-lint-transcript -> bin/lint-transcript.mjs
  │   ├─ ci -> bin/unified-cli.mjs
  │   └─ ci-plan-pack -> bin/plan-pack.mjs
  ├─ build pipeline
  │   └─ src/*.mts -> bin/lib/hooks/test/*.mjs + plugins/* + .claude-plugin/*
  ├─ Claude plugin bundle
  │   ├─ skills/commands/agents/hooks/templates/instinct-packs
  │   ├─ hooks/hooks.json
  │   └─ bin/mcp-server.mjs
  ├─ MCP server
  │   ├─ beginner mode: 4 tools
  │   ├─ expert mode: 19 tools
  │   └─ resources: project/global instincts
  └─ GitHub Action
      └─ action.yml -> bin/lint-transcript.mjs on node20
```

## Public npm bin contract

| Bin | Current target | User-facing role | Compatibility expectation | Verification pointer |
|---|---|---|---|---|
| `continuous-improvement` | `bin/install.mjs` | Installs Claude Code beginner/expert surfaces, optional packs, uninstall flow, and managed rules-file targets. | Treat as the primary installer command. Renaming, removing flags, or changing default install mode is a breaking product change. | `npm run build`, installer tests when touched, `npm run verify:all`, and README/QUICKSTART read-back. |
| `ci-lint-transcript` | `bin/lint-transcript.mjs` | Lints transcript/observation JSONL for 7 Laws discipline failures; also backs the GitHub Action. | Keep stdin/file behavior and strict-mode semantics stable unless `action.yml` and docs are updated in the same change. | `npm run build`, transcript linter tests/fixture probes, `action.yml` parse, `npm run verify:all`. |
| `ci` | `bin/unified-cli.mjs` | CLI-Anything wrapper: `generate`, `list`, and `config` subcommands. | Public command name remains reserved even though former Compound/PM orchestrator behavior was removed in 3.13.0. New subcommands need focused docs/tests. | `npm run build`, direct help/subcommand probes, `npm run verify:all`. |
| `ci-plan-pack` | `bin/plan-pack.mjs` | Converts plan markdown into a commentable review packet and optional `gh issue create` command. | Keep default write path, `--stdout`, and `--gh-issue` behavior stable; never auto-post to GitHub without a dedicated approval/change. | `node --test test/plan-pack.test.mjs`, `npm run verify:all`, README/docs read-back if copy changes. |

## MCP mode contract

| Mode | Tool count | Default? | Setup path | Hook summary surface |
|---|---:|---|---|---|
| `beginner` | 4 | Yes, when `--mode` is omitted or invalid | `<install-path>/bin/mcp-server.mjs --mode beginner` | `plugins/beginner.json` summarizes PreToolUse, PostToolUse, and UserPromptSubmit. |
| `expert` | 19 | No | `<install-path>/bin/mcp-server.mjs --mode expert` | `plugins/expert.json` summarizes PreToolUse, PostToolUse, UserPromptSubmit, SessionStart, and SessionEnd. |

Important nuance: `plugins/beginner.json` and `plugins/expert.json` are mode-summary manifests. The generated plugin hook config in `plugins/continuous-improvement/hooks/hooks.json` is the concrete bundled hook configuration and currently includes PreToolUse, PostToolUse, UserPromptSubmit, SessionStart, SessionEnd, and Stop hook entries.

## MCP server transport and resources

| Contract area | Current behavior | Compatibility note |
|---|---|---|
| Transport | Newline-delimited JSON-RPC over stdio; no `Content-Length` framing. | Changing framing can strand Claude hosts in a silent connecting state and must be treated as a breaking transport change. |
| Protocol initialize response | `protocolVersion: "2024-11-05"`, `serverInfo.name: "continuous-improvement"`, version from package metadata. | Update only with MCP-host compatibility testing. |
| `tools/list` | Returns `getToolDefinitions(MODE)` from `src/lib/plugin-metadata.mts`. | Tool additions/removals must start in the source catalog, not generated JSON. |
| `tools/call` | Dispatches by `name` to `handleTool(name, arguments)`. Expert-only tools return an error when run in beginner mode. | Every catalog tool needs a matching handler branch and tests/probes. |
| `resources/list` | Lists `instincts://project/<hash>` and `instincts://global`. | Resource URI changes affect external clients and should be versioned or migrated. |
| `resources/read` | Reads project/global instincts as `application/json`. | Do not expose raw observations through resources without a privacy review. |

## MCP tool map

| Tool | Mode(s) | Required args | Writes or side effects | Contract notes |
|---|---|---|---|---|
| `ci_status` | beginner, expert | none | Read-only | Reports project level, observation count, instinct counts, confidence bands, and active mode. |
| `ci_instincts` | beginner, expert | none | Read-only | Optional `min_confidence`; sorts instincts by confidence. |
| `ci_reflect` | beginner, expert | `summary` | Read-only response template | Generates a structured reflection template; it does not persist reflection by itself. |
| `ci_gateguard_clear` | beginner, expert | none, but one of `file_paths`/`file_path` is operationally required | Writes session GateGuard clearance state | Beginner-available on purpose because the gate fires in beginner installs; `state_path` must resolve under `~/.claude/instincts/`. |
| `ci_reinforce` | expert | `instinct_id`, `accepted` | Updates instinct confidence | Beginner mode returns an error. Confidence tuning is a data mutation. |
| `ci_create_instinct` | expert | `id`, `trigger`, `body` | Writes a project/global instinct | Validate shape before relying on a created instinct; scope defaults to project. |
| `ci_observations` | expert | none | Read-only | Returns recent observation summaries only; keep raw sharing guidance in `SECURITY.md` and the privacy posture note. |
| `ci_export` | expert | none | Read-only export | Outputs instincts JSON, not raw observations. |
| `ci_import` | expert | `instincts_json` | Writes imported instincts | Skips duplicate IDs; invalid JSON or non-array input returns errors. |
| `ci_plan_init` | expert | `goal` | Writes `task_plan.md`, `findings.md`, `progress.md` | `force` controls overwrite behavior; default phases are Research, Plan, Execute, Verify, Reflect. |
| `ci_plan_status` | expert | none | Read-only | Can include raw planning-file contents when `include_contents` is true. |
| `ci_dashboard` | expert | none | Read-only | Visual terminal dashboard from instincts/observations. |
| `ci_load_pack` | expert | `pack` | Writes starter instincts | Current starter packs are read from `instinct-packs/*.json`. |
| `ci_goal_check` | expert | none | Read-only score | Requires positive integer `limit`; reads `task_plan.md` or project `goal.md` and recent observations. |
| `ci_recall` | expert | `query` | Read-only search | Lexical/BM25 recall over observations with redacted snippets; invalid `since` returns an error. |
| `ci_distill_candidates` | expert | none | Read-only analysis | Finds repeated successful tool trajectories; no draft until propose/from-workflow. |
| `ci_distill_propose` | expert | `id` | Writes draft instinct YAML | `id` must match `draft-[a-z0-9-]+`; draft is inert until promoted. |
| `ci_distill_promote` | expert | `id` | Writes live instinct and consumes draft | Promotion sets project scope and SUGGEST-tier confidence. |
| `ci_distill_from_workflow` | expert | none | Writes draft instinct YAML when a verified workflow run exists | Shares the skill-distill success-policy risk; do not change proof semantics without the owner/Fatin policy decision. |

## GitHub Action contract

| Action surface | Current value | Compatibility expectation |
|---|---|---|
| Name | `AI Agent Discipline Linter` | Public Marketplace name; copy edits are safe, behavior changes need action verification. |
| Runtime | `node20` | Changing runtime requires Marketplace/consumer compatibility review. |
| Main | `bin/lint-transcript.mjs` | Must remain generated and committed after source changes. |
| Inputs | `transcript-path`, `observations-path`, `strict` | Renaming/removing inputs is breaking. Additive inputs require README/action docs and linter handling. |
| Outputs | `violations`, `score`, `report` | Renaming/removing outputs is breaking for workflow consumers. |

## Safe change process for public-surface work

1. Start from source files: `.mts`, source markdown, or package/action metadata. Do not hand-edit generated `.mjs`, generated plugin mirrors, or generated mode manifests.
2. If a tool is added/removed/renamed, update both `src/lib/plugin-metadata.mts` and `src/bin/mcp-server.mts` in the same change.
3. If a public bin, action input/output, MCP tool schema, resource URI, hook event, or default mode changes, treat it as compatibility-sensitive and document the migration/approval decision before implementation.
4. Run `npm run build` after `.mts` or generated-surface source changes.
5. Run the focused test/probe for the changed surface, then `npm run verify:all`; for release surfaces, use `docs/ai-improvement/release-readiness-checklist.md` before tagging or publishing.
6. Stage explicit files only on the Windows host; never use `git add .` or `git add -A` in this repo.

## Approval boundaries

Owner/Fatin approval is required before:

- removing or renaming a public npm bin;
- changing MCP transport framing, protocol version, resource URI shape, or tool names;
- changing public tool input schemas in a non-additive way;
- changing beginner/expert default mode behavior;
- changing hook enforcement semantics, Stop-gate behavior, or observation/privacy boundaries;
- changing `action.yml` input/output names or runtime target;
- changing release workflows, npm publishing, GitHub Marketplace publish steps, Cloudflare Pages deployment, secrets, or cron jobs;
- changing `skill-distill` success inference before the explicit owner/Fatin policy decision.

## Recommended next move

Owner/Fatin should still decide the `skill-distill` empty verification-output policy in `docs/plans/2026-06-18-skill-distill-empty-verify-output-policy.md`. If no owner decision is available, the next autonomous safe improvement is to add a small docs-only GitHub Action transcript-linter contract note or fixture map that preserves the current `action.yml` input/output behavior without changing runtime code.

## Non-goals

- This note does not add, remove, or rename MCP tools.
- This note does not change npm bin behavior.
- This note does not alter hook configuration or generated manifests.
- This note does not publish, tag, deploy, or change cron jobs.
- This note does not resolve the `skill-distill` success-policy decision.
