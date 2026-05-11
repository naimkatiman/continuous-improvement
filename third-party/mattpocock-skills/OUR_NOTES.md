# OUR_NOTES.md — mattpocock/skills

Our annotations on the vendored snapshot. Authored by us, not copied from upstream.

## Why we vendored this

We are cherry-picking **two skills** from `mattpocock/skills`: `skills/in-progress/handoff/SKILL.md` and `skills/productivity/grill-me/SKILL.md`. Each fills a gap our existing skills do not cover cleanly:

| Cherry-picked skill | Gap it fills | Why existing skills don't cover it |
|---|---|---|
| `handoff` | One-shot session compaction into an `mktemp`-backed markdown brief a fresh agent can pick up cold. | `strategic-compact` triggers compaction in the same session with no artifact; `para-memory-files` stores classified facts, not per-session briefs; `wrap` closes out the session without summarising for a successor. |
| `grill-me` | Pre-execution alignment interrogation — interview the user one question at a time, walking every branch of the decision tree, before any code is written. | `gateguard` is a tool-boundary gate that blocks Edit/Write/Bash on missing grounding, but it does not surface missing decisions before the agent would even attempt a tool call. `workspace-surface-audit` inventories what is *available*; `grill-me` interrogates what should be *built*. `superpowers:brainstorming` is Socratic but optimized for open-ended ideation, not committed-idea hardening. |

`handoff` and `grill-me` bookend a session: grill at the start, handoff at the end.

## Selective scope (verbatim from upstream)

Only the two cherry-picked skills, plus the repo-root `LICENSE` for MIT attribution. **Nothing else** from upstream is vendored — not the engineering skills (beyond what is listed), not the rest of the productivity skills, not the README, not the CLAUDE.md.

- `skills/in-progress/handoff/SKILL.md` — the 11-line skill body
- `skills/productivity/grill-me/SKILL.md` — the 12-line skill body
- `LICENSE` — MIT, copied from the repo root for attribution

That is the entire snapshot. If we decide to port a third skill (`grill-with-docs`, `tdd`, `diagnose`, `zoom-out`, etc.), add it under the same `skills/<bucket>/<name>/SKILL.md` path and document the addition in the table above.

## Status: cold-storage, not registered

This snapshot is **cold-storage only** — same model as `obra/superpowers` and `ruvnet/ruflo`. It is:

- **Not loaded** by `plugins/continuous-improvement/`.
- **Not registered** in `.claude-plugin/marketplace.json` (no marketplace entry).
- **Not added** to `bin/refresh-third-party.mjs`'s driver registry (cherry-pick of one in-progress file; refresh is manual).

The user-facing exposure is via our own `skills/handoff.md` + `commands/handoff.md`, which credit Matt Pocock and link back to this snapshot.

## What is intentionally NOT integrated (and why)

1. **The other 16+ mattpocock skills** (`grill-with-docs`, `tdd`, `diagnose`, `to-prd`, `to-issues`, `triage`, `zoom-out`, `improve-codebase-architecture`, `prototype`, `caveman`, `write-a-skill`, `setup-matt-pocock-skills`, `git-guardrails-claude-code`, `migrate-to-shoehorn`, `scaffold-exercises`, `setup-pre-commit`, plus the personal/in-progress/deprecated buckets). Out of scope for the current cherry-pick. Each one is a separate decision and a separate port if/when we want it.
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

# 4. Diff the snapshot against our skills/{handoff,grill-me}.md and decide
#    whether the upstream change warrants a parallel update on the integration side.

# 5. Single-concern commit:
#    chore(third-party): refresh mattpocock/skills @ <new-sha>
```

## Drift radar

The two cherry-picked skills sit in different stability buckets and each carries its own drift profile:

### `handoff` (`in-progress/`)

By mattpocock's own README convention, in-progress skills are **drafts not yet ready to ship** and may change shape without notice. On refresh, watch for:

- The skill being **graduated** from `in-progress/` into `productivity/` or a new bucket (path will change).
- The skill being **renamed** or **deprecated** (it would move to `deprecated/`).
- Frontmatter changes — particularly `argument-hint`, which our integration mirrors verbatim.
- Body changes that alter the contract (e.g. switching from `mktemp` to a fixed path, or removing the "do not duplicate other artifacts" rule).

Any of the above warrants an aligned edit to `skills/handoff.md` and `commands/handoff.md` in the same refresh PR.

### `grill-me` (`productivity/`)

`productivity/` is mattpocock's daily-driver bucket — relatively stable, but still hand-tuned over time. On refresh, watch for:

- The skill being **moved** out of `productivity/` (less likely than handoff but possible).
- Body changes to the five interview rules (one-question-at-a-time, always-recommend, explore-before-ask, walk-the-tree, stop-when-shippable). Our integration mirrors these.
- Frontmatter description changes that broaden or narrow the trigger surface.

Any of the above warrants an aligned edit to `skills/grill-me.md` and `commands/grill-me.md` in the same refresh PR.
