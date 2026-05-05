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

---

## Pending snapshots (not yet vendored — listed for transparency)

### HKUDS/CLI-Anything

- License audited: Apache-2.0
- **Decision (2026-05-03): decline to vendor.** Our in-repo `lib/cli-anything.mjs` (+ `src/lib/cli-anything.mts`) already covers the use case. Reopen only if a concrete capability gap shows up that our implementation cannot close.

### phuryn/pm-skills

- License audited: MIT
- Already substantially vendored at `plugins/pm-*/`.
- Upstream snapshot in `third-party/` is hygiene-only; deferred per current priorities.
