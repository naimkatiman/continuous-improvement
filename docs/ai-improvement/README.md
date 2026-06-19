# AI Improvement Baseline — continuous-improvement

Last updated: 2026-06-19 06:08 MPST (+0800)

## Evidence Snapshot

- Repository: `C:/Ai/continuous-improvement`
- Git preflight: branch `main`; `git status --short` returned no entries before this documentation-only baseline.
- First-run status: `docs/ai-improvement/` did not exist before this run, so this run is analysis-only and makes no application behavior changes.
- Runtime/tooling observed: Node `v24.16.0`, npm `11.13.0`; package CI supports Node 18/20/22.
- Codebase inspection: `docs/ai-improvement/source-metrics-method.md` is the active reporting contract for repo-size metrics. Its last dedicated run documented `pygount`'s `.mts` blind spot and a supplemental `src/` scan; re-run those commands before quoting fresh Markdown/comment totals because scheduled AI-improvement docs continue to change those counts.
- Release readiness: `docs/ai-improvement/release-readiness-checklist.md` maps the current release docs, workflows, package scripts, plugin manifest, action metadata, and landing source into one owner/operator checklist for future release PRs and tag verification. The landing source now advertises `REV 3.14.0`, matching `package.json` and the generated plugin marketplace manifest; production deployment remains owner-controlled and was not run by the scheduled agent.
- MCP/CLI compatibility: `docs/ai-improvement/mcp-cli-compatibility-contract.md` maps the current public npm bins, MCP beginner/expert mode contracts, JSON-RPC transport/resource boundaries, 19-tool expert schema surface, generated hook/mode manifests, GitHub Action inputs/outputs, and owner/Fatin approval boundaries for future public-surface work.
- GitHub Action transcript-linter contract repair: the linter now consumes the declared JavaScript-action input environment variables (`INPUT_TRANSCRIPT-PATH`, `INPUT_OBSERVATIONS-PATH`, and `INPUT_STRICT`) when no CLI path is passed, and writes all declared outputs (`violations`, `score`, and multiline `report`) to `GITHUB_OUTPUT`. Regression tests in `src/test/lint-transcript.test.mts` pin the action-input and action-output contract; generated `test/lint-transcript.test.mjs` and `bin/lint-transcript.mjs` were rebuilt from source.
- Skill-distill empty-output policy note alignment: `docs/plans/2026-06-18-skill-distill-empty-verify-output-policy.md` now reflects that the 2026-06-19 prerequisite already carries `DistillObservation.event` through `readDistillObservations()`. The lifecycle marker is visible to the distiller, but success inference remains unchanged and still requires an owner/Fatin decision before any runtime policy change.
- Privacy posture: `docs/plans/2026-06-18-observation-sharing-privacy-posture.md` maps local observation capture, recent-observation display, `ci_export`/`ci_import`, `ci_recall`, opt-in recall briefing, and `SECURITY.md` warnings into a no-behavior-change sharing contract: raw observations/project metadata stay local; exported instincts and recall snippets require human review before sharing.
- Model-forward retirement review: `docs/plans/2026-06-18-model-forward-retirement-candidates.md` updates the 2026-06-10 audit for the current 25-skill bundle after `para-memory-files` was retired. Strongest remaining candidate is `token-budget-advisor`; this run corrected `strategic-compact`'s stale non-existent `suggest-compact.js` hook claim in the source skill, source catalog, and generated plugin mirror while keeping the skill as a manual phase-boundary checklist. `handoff`, `safety-guard`, and `superpowers` still have explicit residuals/approval gates.
- Key source materials inspected: `README.md`, `QUICKSTART.md`, `SKILL.md`, `CONTRIBUTING.md`, `SECURITY.md`, `package.json`, `action.yml`, `.claude-plugin/marketplace.json`, plugin manifests, CI/release workflows, representative source under `src/bin`, `src/lib`, and `src/hooks`, and recent audit/plan docs.

## Executive Summary

`continuous-improvement` is a mature Claude Code discipline product: part marketplace plugin, part npm installer, part MCP/hook runtime, and part GitHub Action transcript linter. Its core value is making AI coding agents less reckless by enforcing the 7 Laws: research first, plan scope, do one thing, verify, reflect, learn, and iterate. The repository already has unusually strong invariants: zero runtime dependencies, TypeScript source of truth, generated artifact checks, skill mirror checks, doc substring checks, and release/publishing runbooks.

The main near-term improvement opportunity is not a rewrite. It is operational trust: keep docs, generated artifacts, audits, and runtime claims aligned so users can believe the enforcement story. The highest-value future work is to close or explicitly decide the remaining known boundary-policy gaps, reduce documentation drift, and keep the multi-surface distribution pipeline easy to verify.

Code changes: none in this baseline.

## Product Thesis / User Value

### Product purpose

`continuous-improvement` helps Claude Code users and teams avoid common agentic coding failures: edits without context, bundled changes, unverified completion claims, forgotten lessons, and repeated mistakes across sessions.

### Likely users

- Individual developers using Claude Code on real repositories.
- Engineering teams that want AI agents to obey reviewable workflow discipline.
- Maintainers distributing Claude Code skills/plugins and wanting repeatable agent behavior.
- CI users who want a GitHub Action to lint agent transcripts for skipped discipline.

### Core value proposition

The product turns discipline from a prompt preference into a product surface:

1. **Runtime hooks** (`gateguard`, `goal-drift-stop`, observation hooks) create real tool-boundary friction where it matters.
2. **Skills and commands** give agents concrete workflows for TDD, verification, audit, recall, planning, and reflection.
3. **MCP tools** expose project memory, recall, planning, and distillation primitives.
4. **Transcript linter / GitHub Action** lets teams catch discipline failures in CI.
5. **Vendored companions** broaden coverage while preserving pinned, auditable snapshots.

### Business value

The package is positioned as an AI-agent reliability layer. Business value comes from reduced rollback/rework, better trust in AI-generated changes, lower onboarding friction for disciplined agent workflows, and a memorable category narrative: "Claude Code that gets sharper every session."

## Current Repo Map

| Area | Purpose | Notes |
|---|---|---|
| `package.json` | npm package metadata, CLI bins, verification scripts | Version `3.14.0`; zero runtime dependencies; dev dependency on TypeScript and Node types. |
| `README.md`, `QUICKSTART.md`, `SKILL.md` | User-facing product narrative and 7 Laws operating spec | README is landing-page style; Quickstart optimizes beginner install; root skill is the core rule set. |
| `skills/` | Source skills bundled into plugin | 24 companion skill markdown files plus README; root `SKILL.md` is the core skill. Mirrored into plugin bundle by build. |
| `commands/` | Claude slash-command source files | 24 command files including `/seven-laws`, `/verify-install`, `/dashboard`, `/goal-check`, `/distill`. |
| `agents/` | Claude subagent personas | Code reviewer, security auditor, test engineer, plus README. |
| `src/bin/` | TypeScript source for CLIs/generators/MCP server | 25 `.mts` entrypoints including installer, linter, manifest generator, MCP server, plan-pack, checks. |
| `src/lib/` | Pure/shared runtime logic | Goal scoring, recall indexing, skill distillation, gateguard state, install targets, metadata. |
| `src/hooks/` | TypeScript source for runtime hooks | `gateguard`, recall briefing, companion preference, route prompt, goal drift stop, three-section close. |
| `src/test/` | TypeScript test source | 58 `.mts` tests; compiled to `test/*.test.mjs`. |
| `bin/`, `lib/`, `hooks/`, `test/` | Generated/committed runtime artifacts | Must not be edited directly; regenerated by `npm run build`. |
| `.claude-plugin/` | Repository-level Claude marketplace manifest | Generated by manifest generator. |
| `plugins/continuous-improvement/` | Generated Claude plugin bundle | Mirrors source skills/commands/hooks/bin/lib/templates. |
| `plugins/beginner.json`, `plugins/expert.json` | Generated mode manifests | Beginner vs expert MCP/tool/hook surface. |
| `third-party/` | Pinned upstream companion snapshots | Read-only vendored companions; refresh via `node bin/refresh-third-party.mjs <name>`. |
| `templates/` | Planning and verification templates | Includes planning-with-files skeletons and verify ladder example. |
| `instinct-packs/` | Starter instincts | `react`, `python`, `go`, `meta`. |
| `synthetic-checks/` | Example synthetic check scripts | Supports deploy/receipt workflows. |
| `.github/workflows/` | CI, release, skill drift, landing drift checks | CI tests Node 18/20/22; release publishes on tags via OIDC trusted publishing. |
| `docs/` | Plans, audits, release docs, third-party docs | Holds important decision records and deferred audit findings. |

## Main Execution / Distribution Flow

1. **Source edit:** modify `.mts`, `skills/*.md`, commands, docs, or templates.
2. **Build:** `npm run build` runs TypeScript and regenerates `.mjs` artifacts and plugin manifests.
3. **Verify:** `npm run verify:all` runs 12 invariant checks plus typecheck; tests run through `npm test` or `node --test test/*.test.mjs`.
4. **Distribution:**
   - Claude plugin marketplace users install from `.claude-plugin/marketplace.json` on `main`.
   - npm users get tagged releases via `release.yml` and OIDC trusted publishing.
   - GitHub Action users consume `action.yml` through Marketplace/tagged refs.
   - Landing site requires manual Cloudflare Pages deploy, monitored by landing drift check.

## Detected Patterns

### Engineering patterns to preserve

- **Zero runtime dependency principle:** runtime code uses Node built-ins; new dependencies should be exceptional and approved.
- **Generated artifact discipline:** `.mts` under `src/` is the source; `.mjs` under `bin/`, `lib/`, `hooks/`, and `test/` is generated and committed.
- **Pure logic with IO wrappers:** important logic (`goal-state`, `recall-index`, `skill-distill`, `plan-review-packet`) is pure and unit-testable; IO is wired in CLI/MCP layers.
- **Fail-open vs fail-closed is explicit:** hooks usually fail open to avoid blocking users; security/time/identity boundaries increasingly fail closed after audits.
- **One concern per PR:** contributing docs and project rules strongly prefer narrow, reversible changes.
- **Generator-owned manifests:** plugin manifests and mirrors are generated, not hand-edited.
- **Boundary regression culture:** recent audit docs show defects are closed with explicit regression tests.
- **Windows-aware maintenance:** Git Bash, path normalization, and `autocrlf` hazards are recurring project concerns.

### Product / documentation patterns to preserve

- **Beginner vs expert install split:** beginner path is no-shell Claude plugin install; expert path adds npm/MCP/hooks.
- **Honest limitation statements:** README and source comments explicitly document hook limitations and fail-open behavior.
- **Named discipline vocabulary:** 7 Laws, Mulahazah, instincts, gateguard, recall, goal drift.
- **Runbook-grade release docs:** release and landing deployment docs emphasize exact commands and failure modes.
- **Pinned third-party snapshots:** vendored companions are described as pinned and scoped, not casually imported.

## Guardrail Assessment

Do not change these without explicit owner approval or a dedicated PR plan:

- Core architecture: Claude plugin + npm installer + MCP server + GitHub Action distribution model.
- Runtime hook semantics (`gateguard`, observation hooks, goal-drift-stop) because they directly affect user workflows.
- Public CLI/bin names: `continuous-improvement`, `ci-lint-transcript`, `ci`, `ci-plan-pack`.
- Public MCP tool schemas or mode split unless versioned and tested.
- Release workflow, trusted-publishing assumptions, or Cloudflare deployment target.
- Third-party snapshots under `third-party/`; refresh through the documented script only.
- Generated `.mjs`/plugin artifacts by hand.
- Broad skill count/tier changes unless the full count/mirror/doc cascade is planned.
- Secrets, credentials, npm/GitHub/Cloudflare auth, or production env variables.

## Risks and Technical Debt

| Risk | Type | Why it matters | Current evidence / note | Recommended handling |
|---|---|---|---|---|
| Remaining `skill-distill` empty verification-output policy gap | Stability / trust | Empty output currently counts as success for verify commands; some tools are legitimately silent, but false-success learning could create bad drafts. | Logged in `CLAUDE.md`, `docs/audits/2026-06-03-new-feature-audit.md`, and scoped in `docs/plans/2026-06-18-skill-distill-empty-verify-output-policy.md`. The plan now matches live source: `event` is passed through, but success inference does not yet use it. | Owner/Fatin decision needed before code change: prefer an explicit-success model, or accept a narrower silent-command allowlist. |
| Goal keyword substring matching heuristic | Product correctness | Fuzzy `.includes` can match `test` inside `latest`; intentional today but should stay explicit. | Pinned as an intentional contract in `CLAUDE.md` and `docs/plans/2026-06-18-goal-keyword-substring-heuristic-contract.md`; source currently uses `keywords.some((kw) => haystack.includes(kw))`. | Keep behavior unchanged unless real false positives materially hide drift; if behavior changes later, add RED tests for the known false-positive and path/identifier matches that must remain supported. |
| Plan/status documentation drift can recur | Developer experience | This repo uses plan docs as operational memory; stale statuses lower trust. | `docs/plans/2026-06-15-plan-pack.md` was realigned from “proposed” to shipped on 2026-06-18 after source/bin/test verification. | Keep auditing plan docs against shipped surfaces before relying on them. |
| Multi-surface distribution complexity | Operational risk | Marketplace, npm, GitHub Action, plugin bundle, generated manifests, landing page all have different release triggers. | Release docs are strong, and `docs/ai-improvement/release-readiness-checklist.md` now consolidates pre-release, tag-workflow, post-release, Marketplace, and landing checks. The landing source now advertises `REV 3.14.0` to match package/plugin metadata, but the live Cloudflare Pages site still requires an explicit owner-controlled deploy before the public site can be treated as current. | Use the checklist before any release PR/tag; owner/Fatin should approve and run the documented Cloudflare Pages deploy plus drift check when they want the public site updated. |
| MCP/CLI public-surface drift | Developer experience / Platform | Public npm bins, MCP tools, mode manifests, hook summaries, resources, GitHub Action inputs/outputs, and linter action env handling can drift independently when one surface changes without the generated/doc/test cascade. | `docs/ai-improvement/mcp-cli-compatibility-contract.md` maps the current bins, MCP transport/resources, beginner/expert mode counts, 19-tool expert schema surface, generated hook config, and action input/output contract. The 2026-06-19 linter repair added regression coverage proving `INPUT_TRANSCRIPT-PATH`, `INPUT_OBSERVATIONS-PATH`, `INPUT_STRICT`, and the `violations`/`score`/`report` outputs are wired through the JavaScript action entrypoint. | Use the contract before any public-surface change; require owner/Fatin approval for non-additive schema/name/transport/default-mode/action changes and rerun the generated/verify/test ladder. |
| Observation sharing privacy boundaries | Security / compliance | Observation rows can include Bash command heads, file paths, patterns, short output summaries, project names, and project roots; recall redaction is useful but not a full DLP system. | Clarified in `docs/plans/2026-06-18-observation-sharing-privacy-posture.md`; `SECURITY.md` already warns not to share raw `observations.jsonl`. | Keep raw observation logs local; review `ci_export` instincts and recall snippets before sharing; require owner/Fatin approval and RED tests before any schema/redaction/export behavior change. |
| Model-forward scaffold retirement candidates | Product / Maintainability | Skills should not preserve obsolete model-generation scaffolding, but deleting active workflow cards without a cascade can break docs, hooks, and user expectations. | `docs/plans/2026-06-18-model-forward-retirement-candidates.md` updates the 2026-06-10 audit: `para-memory-files` is already gone, `token-budget-advisor` is the cleanest remaining retirement candidate, and the `strategic-compact` stale hook-script claim is now corrected in source and generated skill docs. | Get owner/Fatin decisions before any retirement/slimming; keep future candidate changes to one skill per PR with generated mirror/count/doc verification. |
| Generated-artifact drift risk | CI / maintainer risk | Direct `.mjs` edits are wiped by build and fail CI. | Repeatedly emphasized in project rules and past mistakes. | Continue requiring `npm run build` + `verify:generated` for source changes. |
| Hook fail-open / honor-system limits | Security / correctness | Some gates cannot prove the agent actually did research; malformed input often fails open. | README and gateguard headers document this honestly. | Keep boundary tests focused on path/time/identity; do not overclaim enforcement. |
| Codebase metrics blind spot for `.mts` in pygount | Developer experience | Pygount summary undercounts TypeScript source because `.mts` is classified unknown. | Documented in `docs/ai-improvement/source-metrics-method.md` with the current `pygount` proof and supplemental Node count. | Use the metrics note for future repo-size reports; promote to a no-dependency script only if humans need repeated non-AI reports. |
| Local cron host Node 24 vs CI Node 18/20/22 | Environment risk | Local checks may pass under an unsupported newer Node even if CI target differs. | `node --version` returned v24.16.0; CI matrix supports 18/20/22. | Prefer CI-compatible verification when behavior changes; docs-only typecheck is acceptable. |

## 30-Year Roadmap

### 0 to 30 Days — Immediate Stabilization

- Keep first-run AI-improvement docs and implementation logs current.
- Close or explicitly decide the remaining known audit deferrals.
- Audit plan/status docs for drift from shipped code.
- Maintain exact verification evidence in every change report.
- Prefer small docs/contract tests over broad refactors.

### 1 to 3 Months — Foundation

- Harden MCP/tool boundaries where input parsing, time filters, path identity, or success/failure inference are involved.
- Improve user-facing troubleshooting for the most common install failures.
- Add/maintain lightweight product support matrices: install path, feature surface, required runtime, verification command.
- Keep generated-manifest and skill-mirror invariants easy for contributors to understand.

### 3 to 12 Months — Growth

- Improve onboarding from “install” to “prove hooks are wired” to “use the right workflow for the task.”
- Strengthen feedback loops from GitHub Action transcript linting into skill/instinct improvements.
- Continue reducing stale documentation and hidden operational assumptions.
- Consider product analytics only if privacy-preserving and explicitly opted in.

### 1 to 3 Years — Scale

- Treat MCP tools, CLI commands, hook payloads, and skill formats as versioned contracts.
- Maintain compatibility matrices across Claude Code versions and OS shells.
- Keep third-party companion refreshes auditable and minimal.
- Separate invariant guardrails from model-generation-specific scaffolding as native agent capabilities improve.

### 3 to 7 Years — Platform

- Support a broader ecosystem of discipline plugins and specialized companions without increasing default complexity.
- Provide stable extension points for new Law-aligned skills, instinct packs, and transcript checks.
- Make export/import and data portability of instincts and observations robust.

### 7 to 15 Years — Institution

- Preserve institutional memory through durable docs, migration guides, and compatibility guarantees.
- Maintain security and privacy posture for local observation data.
- Keep release, rollback, and deprecation paths boring and repeatable.

### 15 to 30 Years — Legacy-Resistant System

- Keep the 7 Laws independent from any single model, vendor, or agent host.
- Preserve clear domain language and data schemas so future runtimes can reimplement the discipline layer.
- Prefer replaceable adapters over deep lock-in to one AI tooling generation.

## Prioritized Backlog

| Priority | Initiative | Horizon | Type | User Value | Business Value | Technical Value | Risk | Suggested Action | Verification |
|---|---|---|---|---|---|---|---|---|---|
| P0 | Decide and close `skill-distill` empty verify-output success policy | 0-30 Days | Stability | Prevents bad learned drafts from silent false positives | Protects trust in “learns from successful work” claim | Clarifies success model for distillation | Medium | Review `docs/plans/2026-06-18-skill-distill-empty-verify-output-policy.md`; if approved, implement the explicit-success model with RED tests before touching runtime behavior | New `skill-distill` regression tests + `npm run verify:all` |
| P3 | Decide model-forward scaffold retirement/slimming candidates | 3-12 Months | Product / Maintainability | Keeps skill library focused on durable value | Reduces maintenance cost over time | Removes or slims obsolete scaffolding carefully | Medium | Review `docs/plans/2026-06-18-model-forward-retirement-candidates.md`; strongest remaining candidate is `token-budget-advisor`; any further `strategic-compact` retirement/slimming needs an owner/Fatin decision now that the stale hook claim is corrected | One approved candidate per PR; generated mirror/count/doc cascade + `npm run verify:all` |
| P4 | Keep public-surface compatibility docs and action contract fixtures current | 1-3 Years | Platform | Integrators can rely on stable APIs and documented migration boundaries | Supports ecosystem adoption | Reduces accidental breaking changes across bins, MCP, hooks, and GitHub Action workflows | Low/Medium | Use `docs/ai-improvement/mcp-cli-compatibility-contract.md` before public-surface work; the linter action input/output wiring is now covered by regression tests, so future action changes should update the dedicated tests and docs together | Action/linter changes: RED regression in `src/test/lint-transcript.test.mts`, `npm run build`, targeted `node --test test/lint-transcript.test.mjs`, `npm run verify:all`, and full `npm test` when behavior changes |

## Recommended Next Move

Done in the 2026-06-19 test-only run: `src/test/skill-distill.test.mts` now has a `describe("extractTrajectories — event field preservation (regression)")` block pinning that the optional `event` lifecycle marker is preserved through `extractTrajectories` (and stays `undefined` when unset), with no change to success inference. Next safe action for a future run: extend the same behavior-neutral approach by pinning how `event` markers survive session-change and time-gap segmentation boundaries (the splitting paths in `extractTrajectories`), still without using `event` for any success/failure decision. Treat any change to `skill-distill` success inference itself (including the empty verification-output policy in `docs/plans/2026-06-18-skill-distill-empty-verify-output-policy.md`, recommended decision: explicit-success model) as approval-required: **get an owner/Fatin decision before touching runtime success semantics.** If no owner decision is available, prefer contract/fixture tests or docs-only maps over runtime behavior change.

Approval needed before implementation: any behavior change to `skill-distill` success inference, actual skill retirement/deletion, tier/count changes, hook enforcement semantics, MCP schemas, public bin names, GitHub Action input/output names, release infrastructure, Cloudflare Pages deployment, npm/GitHub Marketplace publishing, or vendored third-party snapshots.
