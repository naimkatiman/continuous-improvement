# OUR_NOTES.md — mattpocock/skills

Our annotations on the vendored snapshot. Authored by us, not copied from upstream.

## Why we vendored this

We are cherry-picking exactly **one skill** from `mattpocock/skills`: `skills/in-progress/handoff/SKILL.md`. It fills a gap none of our existing compaction skills cover cleanly:

| Existing skill | What it does | Why it isn't a handoff |
|---|---|---|
| `strategic-compact` | PreToolUse hook that suggests `/compact` at logical phase boundaries | Triggers compaction in the same session, no doc artifact for the next agent |
| `para-memory-files` | PARA-style cross-session memory under `~/.claude/memory/` | Stores classified facts, not a per-session handoff document |
| `wrap` (global) | Wrap-up routine for the active session | Closes out, does not summarise for a successor |

`handoff` is the missing piece: a one-shot, mktemp-backed markdown that compresses the current conversation into a brief a fresh agent can pick up cold, without duplicating what already lives in PRDs / plans / ADRs / issues / commits.

## Selective scope (verbatim from upstream)

Only the in-progress handoff skill, plus the repo-root `LICENSE` for MIT attribution. **Nothing else** from upstream is vendored — not the engineering skills, not the productivity skills, not the README, not the CLAUDE.md.

- `skills/in-progress/handoff/SKILL.md` — the 11-line skill body
- `LICENSE` — MIT, copied from the repo root for attribution

That is the entire snapshot. If we ever decide to port a second skill (`grill-me`, `tdd`, `diagnose`, etc.), add it under the same `skills/<bucket>/<name>/SKILL.md` path and document the addition in the table above.

## Status: cold-storage, not registered

This snapshot is **cold-storage only** — same model as `obra/superpowers` and `ruvnet/ruflo`. It is:

- **Not loaded** by `plugins/continuous-improvement/`.
- **Not registered** in `.claude-plugin/marketplace.json` (no marketplace entry).
- **Not added** to `bin/refresh-third-party.mjs`'s driver registry (cherry-pick of one in-progress file; refresh is manual).

The user-facing exposure is via our own `skills/handoff.md` + `commands/handoff.md`, which credit Matt Pocock and link back to this snapshot.

## What is intentionally NOT integrated (and why)

1. **The other 17+ mattpocock skills** (`grill-me`, `grill-with-docs`, `tdd`, `diagnose`, `to-prd`, `to-issues`, `triage`, `zoom-out`, `improve-codebase-architecture`, `prototype`, `caveman`, `write-a-skill`, `setup-matt-pocock-skills`, `git-guardrails-claude-code`, `migrate-to-shoehorn`, `scaffold-exercises`, `setup-pre-commit`, plus the personal/in-progress/deprecated buckets). Out of scope for this PR. Each one is a separate decision and a separate port if/when we want it.
2. **mattpocock's `CLAUDE.md`**. Auto-loads as Claude Code session context if read from this subtree and would leak upstream operating principles into the active 7 Laws session. Excluded for cross-contamination safety (consistent with how we handle Obra, OMC, addy, ruflo).
3. **mattpocock's `README.md`** (175 lines). Marketing piece for the upstream repo, not relevant to the cherry-picked skill. Refer to upstream URL when needed.
4. **`scripts/`, `docs/`, `.claude-plugin/`, `.out-of-scope/`**. Not vendor scope.
5. **The `skills.sh` installer.** Out of scope; we ship our own marketplace.

## Refresh recipe

```bash
# 1. Pin the new SHA in third-party/MANIFEST.md under "Pinned SHA"
# 2. Shallow clone outside the repo
git clone --depth 1 https://github.com/mattpocock/skills.git \
  /tmp/mattpocock-skills-refresh
git -C /tmp/mattpocock-skills-refresh rev-parse HEAD  # confirm matches Pinned SHA

# 3. Wipe + re-copy the cherry-picked surface (skill body + repo-root LICENSE)
rm -rf third-party/mattpocock-skills/skills
rm -f  third-party/mattpocock-skills/LICENSE
mkdir -p third-party/mattpocock-skills/skills/in-progress/handoff
cp /tmp/mattpocock-skills-refresh/skills/in-progress/handoff/SKILL.md \
  third-party/mattpocock-skills/skills/in-progress/handoff/SKILL.md
cp /tmp/mattpocock-skills-refresh/LICENSE \
  third-party/mattpocock-skills/LICENSE

# Safety belt: nothing in this snapshot should be a CLAUDE.md
find third-party/mattpocock-skills -name CLAUDE.md -type f -delete

# 4. Diff the snapshot against our skills/handoff.md and decide whether
#    the upstream change warrants a parallel update on the integration side.

# 5. Single-concern commit:
#    chore(third-party): refresh mattpocock/skills @ <new-sha>
```

## Drift radar

The cherry-picked skill is in mattpocock's `in-progress/` bucket. By his own README convention, in-progress skills are **drafts not yet ready to ship** and may change shape without notice. On refresh, watch for:

- The skill being **graduated** from `in-progress/` into `productivity/` or a new bucket (path will change).
- The skill being **renamed** or **deprecated** (it would move to `deprecated/`).
- Frontmatter changes — particularly `argument-hint`, which our integration mirrors verbatim.
- Body changes that alter the contract (e.g. switching from `mktemp` to a fixed path, or removing the "do not duplicate other artifacts" rule).

Any of the above warrants an aligned edit to `skills/handoff.md` and `commands/handoff.md` in the same refresh PR.
