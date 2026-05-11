# third-party/MANIFEST.md

Pinned snapshots. Read-only. Refresh by bumping the SHA and re-running the documented selective copy.

## Snapshots

### oh-my-claudecode

| Field | Value |
|---|---|
| Upstream | https://github.com/Yeachan-Heo/oh-my-claudecode |
| License | MIT |
| Pinned SHA | `aacde3e19c40e891479e22fb30e6169a8782d7e4` |
| Snapshot date | 2026-05-06 |
| Snapshot size | ~1.8 MB, 175 files |
| Upstream version at SHA | 4.13.6 |
| Local path | `third-party/oh-my-claudecode/` |

**Selective scope (verbatim from upstream):**

- `agents/` — 19 agent definitions
- `skills/` — 39 skills
- `missions/` — task templates
- `templates/` — scaffold files
- `examples/` — usage examples
- `hooks/hooks.json` — hooks manifest
- `docs/` — architecture + reference
- `.claude-plugin/` — plugin manifest (read-only; we do not register this in our marketplace)
- `LICENSE`, `README.md` (English only), `AGENTS.md`, `CHANGELOG.md`, `SECURITY.md`

**Excluded from snapshot (not vendored):**

- `dist/` (~25 MB, 4013 files — compiled output)
- `src/` (~11 MB, 1030 files — TypeScript source; we are not forking)
- `bridge/` (~6 MB — runtime adapters)
- `tests/`, `scripts/`, `benchmark/`, `benchmarks/`, `seminar/`, `shellmark/`, `research/`
- `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `typos.toml`
- All non-English `README.*.md` files
- `.github/`, `.git/`, `.gitignore`, `.gitattributes`, `.npmignore`, `.codex`, `.clawhip/`, `.mcp.json`
- `CLAUDE.md` (root) and `docs/CLAUDE.md` — both auto-load as Claude Code session context if read from this subtree, leaking OMC's operating principles into the active 7 Laws session. Excluded for cross-contamination safety. The root `CLAUDE.md` was empirically observed to leak; `docs/CLAUDE.md` is excluded preemptively without empirical confirmation. Upstream still ships both; refer to upstream URL when needed.

**Refresh recipe:**

```bash
# 1. Pin the new SHA in this file under "Pinned SHA" above
# 2. Shallow clone outside the repo
git clone --depth 1 https://github.com/Yeachan-Heo/oh-my-claudecode.git \
  /tmp/omc-refresh
git -C /tmp/omc-refresh rev-parse HEAD  # confirm matches Pinned SHA

# 3. Wipe + re-copy the selective surface
rm -rf third-party/oh-my-claudecode
mkdir -p third-party/oh-my-claudecode
cp -r /tmp/omc-refresh/{agents,skills,missions,templates,examples,hooks,docs,.claude-plugin} \
  third-party/oh-my-claudecode/
cp /tmp/omc-refresh/{LICENSE,README.md,AGENTS.md,CHANGELOG.md,SECURITY.md} \
  third-party/oh-my-claudecode/

# Remove every CLAUDE.md inside the snapshot — they auto-load as session context.
# (root CLAUDE.md is not copied above; docs/CLAUDE.md gets copied by the dir cp,
# so it must be deleted post-copy.)
find third-party/oh-my-claudecode -name CLAUDE.md -type f -delete

# 4. Single-concern commit:
#    chore(third-party): refresh oh-my-claudecode @ <new-sha>
```

### obra/superpowers

| Field | Value |
|---|---|
| Upstream | https://github.com/obra/superpowers |
| License | MIT |
| Pinned SHA | `f2cbfbefebbfef77321e4c9abc9e949826bea9d7` |
| Snapshot date | 2026-05-06 |
| Snapshot size | ~842 KB, 76 files |
| Upstream version at SHA | 5.1.0 |
| Local path | `third-party/superpowers/` |

This is the canonical upstream that the CI fork's `plugins/continuous-improvement/skills/superpowers/SKILL.md` dispatcher routes to (declared via `origin: https://github.com/obra/superpowers` in its frontmatter). The two remain distinct plugins — Obra ships the skill bodies, the CI fork ships the Law-aligned dispatcher and the wider 7 Laws system. This snapshot is cold-storage only; it is **not** loaded by `plugins/continuous-improvement/` and is **not** registered in `.claude-plugin/marketplace.json`.

**Selective scope (verbatim from upstream):**

- `skills/` — 14 workflow skills (brainstorming, dispatching-parallel-agents, executing-plans, finishing-a-development-branch, receiving-code-review, requesting-code-review, subagent-driven-development, systematic-debugging, test-driven-development, using-git-worktrees, using-superpowers, verification-before-completion, writing-plans, writing-skills)
- `hooks/` — `hooks.json`, `hooks-cursor.json`, `run-hook.cmd`, `session-start`
- `docs/` — architecture, plans, specs, testing reference, opencode + windows notes
- `assets/` — `app-icon.png`, `superpowers-small.svg`
- `.claude-plugin/` — plugin manifest (read-only; we do not register this in our marketplace)
- `LICENSE`, `README.md`, `AGENTS.md`, `CODE_OF_CONDUCT.md`, `RELEASE-NOTES.md`

**Excluded from snapshot (not vendored):**

- `.git/`, `.github/`, `.gitignore`, `.gitattributes`
- `.codex-plugin/`, `.cursor-plugin/`, `.opencode/`, `gemini-extension.json`, `GEMINI.md` — non-Claude vendor adapters, out of scope.
- `scripts/`, `tests/` — out of vendor scope (consistent with OMC convention).
- `package.json`, `.version-bump.json` — release tooling, not vendor scope.
- `CLAUDE.md` (root) — auto-loads as Claude Code session context if read from this subtree, leaking Obra's operating principles into the active 7 Laws session. Excluded for cross-contamination safety. Upstream still ships it; refer to upstream URL when needed.

**Refresh recipe:**

```bash
# 1. Pin the new SHA in this file under "Pinned SHA" above
# 2. Shallow clone outside the repo
git clone --depth 1 https://github.com/obra/superpowers.git \
  /tmp/obra-superpowers-refresh
git -C /tmp/obra-superpowers-refresh rev-parse HEAD  # confirm matches Pinned SHA

# 3. Wipe + re-copy the selective surface
rm -rf third-party/superpowers
mkdir -p third-party/superpowers
cp -r /tmp/obra-superpowers-refresh/{skills,hooks,docs,assets,.claude-plugin} \
  third-party/superpowers/
cp /tmp/obra-superpowers-refresh/{LICENSE,README.md,AGENTS.md,CODE_OF_CONDUCT.md,RELEASE-NOTES.md} \
  third-party/superpowers/

# Remove every CLAUDE.md inside the snapshot — they auto-load as session context.
# (root CLAUDE.md is not copied above, but the find runs anyway as a safety net.)
find third-party/superpowers -name CLAUDE.md -type f -delete

# 4. Single-concern commit:
#    chore(third-party): refresh obra/superpowers @ <new-sha>
```

### addyosmani/agent-skills

| Field | Value |
|---|---|
| Upstream | https://github.com/addyosmani/agent-skills |
| License | MIT |
| Pinned SHA | `742dca58ae557bc67afec9ea8e6de59c085f0534` |
| Snapshot date | 2026-05-07 |
| Snapshot size | ~536 KB, 55 files |
| Upstream version at SHA | 1.0.0 |
| Local path | `third-party/addy-agent-skills/` |

A pure skills marketplace covering the full SDLC (spec, plan, build, verify, review, ship). Cold-storage only — **not** loaded by `plugins/continuous-improvement/` and **not** registered in `.claude-plugin/marketplace.json`. The five non-overlapping skills flagged as integration candidates (`spec-driven-development`, `source-driven-development`, `context-engineering`, `idea-refine`, `incremental-implementation`) are tracked in `third-party/addy-agent-skills/OUR_NOTES.md`; each port lands as its own single-concern PR after a concrete user-pain trigger.

**Selective scope (verbatim from upstream):**

- `skills/` — 21 skills covering the full software development lifecycle
- `agents/` — 3 agent definitions (code-reviewer, security-auditor, test-engineer)
- `hooks/` — `hooks.json` + 5 shell scripts (`session-start.sh`, `sdd-cache-pre.sh`, `sdd-cache-post.sh`, `simplify-ignore.sh`, `simplify-ignore-test.sh`) + 2 reference docs
- `references/` — reference material the skills cite
- `docs/` — upstream documentation
- `.claude-plugin/` — plugin + marketplace manifests (read-only; we do not register this in our marketplace)
- `LICENSE`, `README.md`, `AGENTS.md`, `CONTRIBUTING.md`

**Excluded from snapshot (not vendored):**

- `.git/`, `.github/`, `.gitignore` — repo metadata, not vendor scope
- `.gemini/`, `.opencode/` — non-Claude vendor adapters, out of scope (consistent with how `.codex-plugin/` is excluded from the obra snapshot)
- `CLAUDE.md` — auto-loads as Claude Code session context if read from this subtree, leaks upstream operating principles into the active 7 Laws session. Excluded for cross-contamination safety. Upstream still ships it; refer to upstream URL when needed.

**Refresh recipe:**

```bash
# 1. Pin the new SHA in this file under "Pinned SHA" above
# 2. Shallow clone outside the repo
git clone --depth 1 https://github.com/addyosmani/agent-skills.git \
  /tmp/addy-agent-skills-refresh
git -C /tmp/addy-agent-skills-refresh rev-parse HEAD  # confirm matches Pinned SHA

# 3. Wipe + re-copy the selective surface
rm -rf third-party/addy-agent-skills
mkdir -p third-party/addy-agent-skills
cp -r /tmp/addy-agent-skills-refresh/{skills,agents,hooks,references,docs,.claude-plugin} \
  third-party/addy-agent-skills/
cp /tmp/addy-agent-skills-refresh/{LICENSE,README.md,AGENTS.md,CONTRIBUTING.md} \
  third-party/addy-agent-skills/

# Preserve upstream's empty .claude/commands/ directory (referenced by plugin.json's
# "commands" key). Git does not track empty dirs, so add a .gitkeep sentinel.
# Without this, /plugin install agent-skills@continuous-improvement fails with
# "Path not found: ...\agent-skills\1.0.0\.claude\commands (commands)".
mkdir -p third-party/addy-agent-skills/.claude/commands
touch third-party/addy-agent-skills/.claude/commands/.gitkeep

# Remove every CLAUDE.md inside the snapshot — they auto-load as session context.
find third-party/addy-agent-skills -name CLAUDE.md -type f -delete

# 4. Single-concern commit:
#    chore(third-party): refresh addyosmani/agent-skills @ <new-sha>
```

> **Driver integration deferred.** Adding an `addy-agent-skills` SNAPSHOTS entry to `bin/refresh-third-party.mjs` is tracked as a follow-up PR — see `docs/plans/2026-05-07-addy-agent-skills-vendor.md` § "Deferred follow-ups". The recipe above is the source of truth in the meantime.

### ruvnet/ruflo (plugins/ruflo-swarm slice)

| Field | Value |
|---|---|
| Upstream | https://github.com/ruvnet/ruflo |
| License | MIT |
| Pinned SHA | `addb5cd3f30c4e9eef9b25084419bd1c5015e169` |
| Snapshot date | 2026-05-07 |
| Snapshot size | ~36 KB, 11 files |
| Upstream version at SHA | 3.7.0-alpha.11 (monorepo); plugin slice `ruflo-swarm` |
| Local path | `third-party/ruflo-swarm/` |

Cherry-picked **single plugin** from a 32-plugin monorepo, addressing the agent-orchestration / agent-swarm gap. Cold-storage only — **not** loaded by `plugins/continuous-improvement/` and **not** registered in `.claude-plugin/marketplace.json`. Surface overlaps `superpowers:dispatching-parallel-agents` (Obra) and our `/loop`; the OUR_NOTES.md matrix records the per-asset comparison. The snapshot path is named `ruflo-swarm`, not `ruflo`, to make the cherry-pick scope explicit — readers should not assume the full monorepo lives here.

**Selective scope (verbatim from upstream `plugins/ruflo-swarm/` subtree, plus repo-root LICENSE for attribution):**

- `agents/architect.md`, `agents/coordinator.md` — 2 agent definitions
- `commands/swarm.md`, `commands/watch.md` — 2 commands
- `skills/swarm-init/SKILL.md`, `skills/monitor-stream/SKILL.md` — 2 skills
- `docs/adrs/0001-swarm-contract.md` — 1 architecture decision record
- `scripts/smoke.sh` — smoke test script
- `.claude-plugin/plugin.json` — plugin manifest (read-only; not registered in our marketplace)
- `README.md` — plugin overview
- `LICENSE` — copied from upstream **repo root** (the plugin slice has no own LICENSE; required for MIT attribution)

**Excluded from snapshot (not vendored):**

- The other **31 ruflo plugins** (`ruflo-core`, `ruflo-loop-workers`, `ruflo-autopilot`, `ruflo-intelligence`, `ruflo-rag-memory`, `ruflo-agentdb`, `ruflo-cost-tracker`, `ruflo-adr`, `ruflo-aidefence`, `ruflo-browser`, `ruflo-jujutsu`, `ruflo-wasm`, `ruflo-workflows`, `ruflo-daa`, `ruflo-ruvllm`, `ruflo-rvf`, `ruflo-plugin-creator`, `ruflo-goals`, `ruflo-ddd`, `ruflo-federation`, `ruflo-iot-cognitum`, `ruflo-knowledge-graph`, `ruflo-market-data`, `ruflo-migrations`, `ruflo-neural-trader`, `ruflo-observability`, `ruflo-ruvector`, `ruflo-sparc`, `ruflo-security-audit`, `ruflo-testgen`, `ruflo-docs`) — out of cherry-pick scope.
- The ruflo runtime, `ruflo/`, `bin/`, `package.json`, `package-lock.json`, `tsconfig.json`, `archive/`, `tests/`, `verification.md`, `verification-results.md`, `verification-inventory.json`, `ruflo-plugins.gif` (~5.5 MB).
- `.claude/`, `.agents/`, `.githooks/`, `.github/`, `.gitignore`, `.npmignore` — repo metadata.
- Root `CLAUDE.md`, `CLAUDE.local.md`, top-level `AGENTS.md` (~21 KB) — auto-load contamination risk; none live inside `plugins/ruflo-swarm/` so the subtree copy doesn't pull them. Post-copy `find -name CLAUDE.md -delete` runs anyway as a safety belt.
- Top-level `README.md`, `CHANGELOG.md`, `SECURITY.md` — these are the monorepo's, not the plugin's (the plugin has its own `README.md` which IS vendored).

**Refresh recipe:**

```bash
# 1. Pin the new SHA in this file under "Pinned SHA" above
# 2. Shallow clone outside the repo
git clone --depth 1 https://github.com/ruvnet/ruflo.git \
  /tmp/ruflo-refresh
git -C /tmp/ruflo-refresh rev-parse HEAD  # confirm matches Pinned SHA

# 3. Wipe + re-copy the selective surface (plugin slice + repo-root LICENSE)
rm -rf third-party/ruflo-swarm
mkdir -p third-party/ruflo-swarm
cp -r /tmp/ruflo-refresh/plugins/ruflo-swarm/. \
  third-party/ruflo-swarm/
cp /tmp/ruflo-refresh/LICENSE \
  third-party/ruflo-swarm/

# Remove every CLAUDE.md inside the snapshot — they auto-load as session context.
find third-party/ruflo-swarm -name CLAUDE.md -type f -delete

# 4. Single-concern commit:
#    chore(third-party): refresh ruvnet/ruflo (ruflo-swarm slice) @ <new-sha>
```

> **Driver integration deferred.** Adding a `ruflo-swarm` SNAPSHOTS entry to `bin/refresh-third-party.mjs` is tracked as the same follow-up PR as `addy-agent-skills` — see `docs/plans/2026-05-07-ruflo-swarm-vendor.md` § "Deferred follow-ups". The recipe above is the source of truth in the meantime.

### mattpocock/skills

| Field | Value |
|---|---|
| Upstream | https://github.com/mattpocock/skills |
| License | MIT |
| Pinned SHA | `9fecab929abb904c68ce3366a1781df31ab22832` |
| Snapshot date | 2026-05-11 |
| Snapshot size | ~3 KB, 3 files |
| Upstream version at SHA | unversioned (newsletter-tracked) |
| Local path | `third-party/mattpocock-skills/` |

Cherry-picked **two skills** (`handoff`, `grill-me`) from a 25+ skill repository, addressing two pre/post-execution gaps that existing in-repo skills do not cover cleanly: per-session compaction-to-handoff-doc (`handoff`) and pre-execution alignment interrogation (`grill-me`). Cold-storage only — **not** loaded by `plugins/continuous-improvement/` and **not** registered in `.claude-plugin/marketplace.json`. The user-facing exposure is via `skills/{handoff,grill-me}.md` + `commands/{handoff,grill-me}.md`, which credit Matt Pocock and link back to this snapshot. The full vendoring rationale and drift radar live in `third-party/mattpocock-skills/OUR_NOTES.md`.

**Selective scope (verbatim from upstream):**

- `skills/in-progress/handoff/SKILL.md` — the 11-line skill body
- `skills/productivity/grill-me/SKILL.md` — the 12-line skill body
- `LICENSE` — copied from upstream **repo root** for MIT attribution

**Excluded from snapshot (not vendored):**

- The other 17+ skills across `engineering/`, `productivity/`, `misc/`, `personal/`, `in-progress/`, `deprecated/` — out of cherry-pick scope. Each is a separate decision and a separate port.
- `README.md` (175 lines) — marketing piece for the upstream repo, not relevant to the cherry-picked skill.
- `CLAUDE.md` — auto-load contamination risk; excluded for cross-contamination safety (consistent with how OMC, Obra, addy, ruflo are handled).
- `CONTEXT.md`, `scripts/`, `docs/`, `.claude-plugin/`, `.out-of-scope/` — not vendor scope.

**Refresh recipe:**

```bash
# 1. Pin the new SHA in this file under "Pinned SHA" above
# 2. Shallow clone outside the repo
git clone --depth 1 https://github.com/mattpocock/skills.git \
  /tmp/mattpocock-skills-refresh
git -C /tmp/mattpocock-skills-refresh rev-parse HEAD  # confirm matches Pinned SHA

# 3. Wipe + re-copy the cherry-picked surface (skill bodies + repo-root LICENSE)
rm -rf third-party/mattpocock-skills/skills
rm -f  third-party/mattpocock-skills/LICENSE
mkdir -p third-party/mattpocock-skills/skills/in-progress/handoff
mkdir -p third-party/mattpocock-skills/skills/productivity/grill-me
cp /tmp/mattpocock-skills-refresh/skills/in-progress/handoff/SKILL.md \
  third-party/mattpocock-skills/skills/in-progress/handoff/SKILL.md
cp /tmp/mattpocock-skills-refresh/skills/productivity/grill-me/SKILL.md \
  third-party/mattpocock-skills/skills/productivity/grill-me/SKILL.md
cp /tmp/mattpocock-skills-refresh/LICENSE \
  third-party/mattpocock-skills/LICENSE

# Safety belt: nothing in this snapshot should be a CLAUDE.md
find third-party/mattpocock-skills -name CLAUDE.md -type f -delete

# 4. Single-concern commit:
#    chore(third-party): refresh mattpocock/skills @ <new-sha>
```

> **Driver integration deferred.** Adding a `mattpocock-skills` SNAPSHOTS entry to `bin/refresh-third-party.mjs` is tracked as a follow-up alongside `addy-agent-skills` and `ruflo-swarm`. The recipe above is the source of truth in the meantime.

<!--
  product-on-purpose/pm-skills was vendored here from 2026-05-07 to 2026-05-08
  (PR #91, SHA 8d23508cb7193435904e6d5f1e550051e0372b25, v2.13.1, Apache-2.0).
  Removed 2026-05-08 in favor of phuryn/pm-skills via the Claude Code plugin
  marketplace. See "Pending snapshots" below for the rationale and
  docs/THIRD_PARTY.md for the install recipe.
-->

### product-on-purpose/pm-skills (removed 2026-05-08)

Vendored snapshot at `third-party/pm-skills/` (v2.13.1, SHA `8d23508cb7193435904e6d5f1e550051e0372b25`, Apache-2.0) was removed on 2026-05-08. Product-management coverage now ships via `phuryn/pm-skills` through Claude Code's plugin marketplace — see "Pending snapshots" below and `docs/THIRD_PARTY.md` for the install recipe.

The previous vendored copy is recoverable from git history (`git show <pre-removal-sha>:third-party/pm-skills/...`) if a per-skill port is ever needed.

---

## Pending snapshots (not yet vendored — listed for transparency)

### HKUDS/CLI-Anything

- License audited: Apache-2.0
- **Decision (2026-05-03): decline to vendor.** Our in-repo `lib/cli-anything.mjs` (+ `src/lib/cli-anything.mts`) already covers the use case. Reopen only if a concrete capability gap shows up that our implementation cannot close.

### phuryn/pm-skills

- License audited: MIT
- **Decision (2026-05-08): use marketplace install, do not vendor.** PM coverage ships as eight separately-installable Claude Code plugins (`pm-toolkit`, `pm-product-strategy`, `pm-product-discovery`, `pm-market-research`, `pm-data-analytics`, `pm-marketing-growth`, `pm-go-to-market`, `pm-execution`). Each is independently versioned by Pawel Huryn and maps cleanly to the marketplace. Vendoring would freeze a snapshot we have no reason to fork.
- Install recipe lives in `docs/THIRD_PARTY.md`.
