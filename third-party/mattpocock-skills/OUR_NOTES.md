# OUR_NOTES.md — mattpocock/skills

Our annotations on the vendored snapshot. Authored by us, not copied from upstream.

## Why we vendored this

We are cherry-picking **three skills** from `mattpocock/skills`: `skills/in-progress/handoff/SKILL.md`, `skills/productivity/grill-me/SKILL.md`, and the `skills/engineering/grill-with-docs/` bundle (3 files). Each fills a gap our existing skills do not cover cleanly:

| Cherry-picked skill | Gap it fills | Why existing skills don't cover it |
|---|---|---|
| `handoff` | One-shot session compaction into an `mktemp`-backed markdown brief a fresh agent can pick up cold. | `strategic-compact` triggers compaction in the same session with no artifact; `para-memory-files` stores classified facts, not per-session briefs; `wrap` closes out the session without summarising for a successor. |
| `grill-me` | Pre-execution alignment interrogation — interview the user one question at a time, walking every branch of the decision tree, before any code is written. | `gateguard` is a tool-boundary gate that blocks Edit/Write/Bash on missing grounding, but it does not surface missing decisions before the agent would even attempt a tool call. `workspace-surface-audit` inventories what is *available*; `grill-me` interrogates what should be *built*. `superpowers:brainstorming` is Socratic but optimized for open-ended ideation, not committed-idea hardening. |
| `grill-with-docs` | Grilling that **persists outcomes** — challenges the plan against the existing `CONTEXT.md` glossary, sharpens fuzzy terminology, cross-references user statements against code, and updates `CONTEXT.md` + `docs/adr/` inline as decisions crystallise. | `grill-me` is conversation-only; `grill-with-docs` is the artifact-producing version. No in-repo skill prescribes a `CONTEXT.md` shared-language convention or an ADR format; `grill-with-docs` brings both as bundled format specs. mattpocock himself calls it his most powerful technique. |

`handoff` and `grill-me` bookend a session: grill at the start, handoff at the end. `grill-with-docs` is `grill-me`'s persistent-outcomes sibling, used once a project commits to keeping a `CONTEXT.md` and an ADR log.

## Selective scope (verbatim from upstream)

Only the three cherry-picked skills (5 files total) plus the repo-root `LICENSE` for MIT attribution. **Nothing else** from upstream is vendored — not the rest of the engineering skills, not the rest of the productivity skills, not the README, not the CLAUDE.md.

- `skills/in-progress/handoff/SKILL.md` — the 11-line skill body
- `skills/productivity/grill-me/SKILL.md` — the 12-line skill body
- `skills/engineering/grill-with-docs/SKILL.md` — the grilling-with-docs body
- `skills/engineering/grill-with-docs/CONTEXT-FORMAT.md` — bundled CONTEXT.md format spec
- `skills/engineering/grill-with-docs/ADR-FORMAT.md` — bundled ADR format spec
- `LICENSE` — MIT, copied from the repo root for attribution

That is the entire snapshot. If we decide to port a fourth skill (`tdd`, `diagnose`, `zoom-out`, `to-prd`, etc.), add it under the same `skills/<bucket>/<name>/SKILL.md` path and document the addition in the table above.

## Status: cold-storage, not registered

This snapshot is **cold-storage only** — same model as `obra/superpowers` and `ruvnet/ruflo`. It is:

- **Not loaded** by `plugins/continuous-improvement/`.
- **Not registered** in `.claude-plugin/marketplace.json` (no marketplace entry).
- **Not added** to `bin/refresh-third-party.mjs`'s driver registry (cherry-pick of one in-progress file; refresh is manual).

The user-facing exposure is via our own `skills/handoff.md` + `commands/handoff.md`, which credit Matt Pocock and link back to this snapshot.

## What is intentionally NOT integrated (and why)

1. **The other 15+ mattpocock skills** (`tdd`, `diagnose`, `to-prd`, `to-issues`, `triage`, `zoom-out`, `improve-codebase-architecture`, `prototype`, `caveman`, `write-a-skill`, `setup-matt-pocock-skills`, `git-guardrails-claude-code`, `migrate-to-shoehorn`, `scaffold-exercises`, `setup-pre-commit`, plus the personal/in-progress/deprecated buckets). Out of scope for the current cherry-pick. Each one is a separate decision and a separate port if/when we want it.
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

### `grill-with-docs` (`engineering/`) — including bundled format files

`engineering/` is mattpocock's most actively-tuned bucket and `grill-with-docs` is his most-recommended skill. The skill ships as a bundle of three files (`SKILL.md` + `CONTEXT-FORMAT.md` + `ADR-FORMAT.md`); we inline the two format files as Appendix A and Appendix B in `skills/grill-with-docs.md` because our top-level `skills/` convention is one `.md` per skill. On refresh, watch for:

- Changes to the **CONTEXT.md format** — `CONTEXT-FORMAT.md` rules, Single vs multi-context structure, the example dialogue convention.
- Changes to the **ADR format** — `ADR-FORMAT.md` template, optional-sections list, "When to offer an ADR" three-true criteria.
- Changes to the **glossary-challenge logic** in `SKILL.md` (challenge-against-glossary, sharpen-fuzzy-language, discuss-concrete-scenarios, cross-reference-with-code, update-CONTEXT.md-inline, offer-ADRs-sparingly).
- The skill being **split** into separate skills (e.g. one for CONTEXT.md, one for ADRs) — would require restructuring our integration.

Any of the above warrants an aligned edit to `skills/grill-with-docs.md` (Appendix A, Appendix B, or the main body) and `commands/grill-with-docs.md` in the same refresh PR. The two upstream FORMAT files are also vendored verbatim under `skills/engineering/grill-with-docs/` so a side-by-side diff is always available.
