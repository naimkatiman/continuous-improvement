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

---

## Pending snapshots (not yet vendored — listed for transparency)

### HKUDS/CLI-Anything

- License audited: Apache-2.0
- **Decision (2026-05-03): decline to vendor.** Our in-repo `lib/cli-anything.mjs` (+ `src/lib/cli-anything.mts`) already covers the use case. Reopen only if a concrete capability gap shows up that our implementation cannot close.

### phuryn/pm-skills

- License audited: MIT
- Already substantially vendored at `plugins/pm-*/`.
- Upstream snapshot in `third-party/` is hygiene-only; deferred per current priorities.
