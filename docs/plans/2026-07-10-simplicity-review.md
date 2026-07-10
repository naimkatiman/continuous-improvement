# Spec: `simplicity-review` skill (Law 4)

Date: 2026-07-10
Status: Approved 2026-07-10, implementing
Author: Claude (brainstorming skill)

## One-sentence goal

Add a repo-native, review-only `simplicity-review` skill plus a thin `/simplicity-review` command that reads the current diff and flags over-engineering, closing the one capability gap the ponytail overlap analysis found.

## Why (grounding)

The user asked whether continuous-improvement should adopt a ponytail-style "minimal code" skill. A parallel overlap analysis (workflow `wf_c5aeead0-b57`) established:

- We do not ship ponytail and should not vendor it. Ponytail is soft prompt-injection (SessionStart/UserPromptSubmit, additionalContext only, no PreToolUse gate). Our enforcement is strictly stronger: `hooks/gateguard.mjs` hard-gates reuse at the tool boundary.
- We already cover ~80% of ponytail's 7-rung ladder via global Core Principle 2 (no speculative utils, delete dead code same pass, search-before-new-util), the gateguard Write gate ("confirm no existing file serves the same purpose"), `goal-monitor` scope-creep, and the `/ship` 15-file/150-LOC ceilings.
- The one real gap: a diff-scoped "this change is over-engineered" reviewer. `commands/production-readiness-review.md` covers performance/security/UI/test-coverage but has no simplicity dimension. The `simplify` skill `proceed` routes to is a Claude Code built-in, not repo-owned.

Honest caveat on "/insights": the plugin's own insight surface (`ci_dashboard`: 7 instincts over 2269 observations) does not flag over-engineering as a recurring friction. Top instincts are worktree/subagent/gh-cli/absolute-paths/new-test. This skill is added for parity + general discipline, not to fix a measured pain. If native `/insights` later shows an over-build pattern, re-ground the emphasis on it.

## Non-goals (YAGNI, eat our own dogfood)

Explicitly NOT built. Each mirrors a ponytail feature the overlap analysis judged a trap or already-covered:

- No lite/full/ultra intensity dial (meaningless without a review to dial; adds a config knob for hypothetical use).
- No `/debt` marker harvester (our `CLAUDE.md ## Deferred` log is hand-maintained by design).
- No benchmark harness, no per-change LOC-reduction metric (LOC-as-target is a metric-gaming trap; house stance is LOC-as-ceiling only).
- No repo-wide bloat scan (built-in `repo-scan`/`refactor-clean` cover it).
- No new hook. This is a review lens invoked on demand, not a gate.
- No cross-platform adapters. Claude Code native only.

## The skill

File: `skills/simplicity-review.md` (flat source; `npm run build` mirrors it to `plugins/continuous-improvement/skills/simplicity-review/SKILL.md`).

Frontmatter (matches the `audit` template):

```yaml
---
name: simplicity-review
tier: "2"
description: Enforces Law 4 (Verify Before Reporting) of the 7 Laws of AI Agent Discipline. Reviews the current diff for over-engineering — code that could reuse an existing file, a stdlib or native feature, or fewer lines — and reports trim findings without touching code, so 'it works' is never mistaken for 'it is the minimum that works'.
origin: continuous-improvement
user-invocable: true
---
```

Body covers:

1. **When to activate** — after writing a feature/fix, before opening a PR, when a diff feels larger than the task; and as a routed step from `/proceed`.
2. **The ladder** — walk each changed block and stop at the first rung that holds:
   1. Does this need to exist? (YAGNI) skip it
   2. Already in this codebase? reuse it
   3. Stdlib does it? use it
   4. Native platform feature? use it
   5. Installed dependency? use it
   6. One line? one line
   7. Only then: the minimum that works
3. **Read before you cut** — trace the whole change first; the ladder shortens the solution, never the reading.
4. **Safety carve-out (never flag)** — input validation at trust boundaries, error handling that prevents data loss, security, accessibility. Aligns with `rules/common/security.md` and `coding-style.md`. This is the "lazy, not negligent" line.
5. **Output** — a findings list: `file:line`, `over-built: <what>`, `simpler: <reuse existing X / stdlib Y / native Z / one line / delete>`, one-line rationale. Close with a `GO` (diff is already minimal) or `TRIM` (findings listed) verdict. No score, no LOC target.
6. **Review-only** — reports, never auto-edits. The user or `/proceed` applies trims. Mirrors `audit`'s confirm-before-fix.
7. **Honest overlap** — states the difference from the Claude Code built-in `simplify`: `simplify` auto-applies broad reuse/efficiency/altitude fixes; `simplicity-review` is a repo-owned, Law-4-tagged, review-only over-engineering lens scoped to a diff that feeds `/proceed`.
8. **Pairs with** — `verification-loop` (Law 4 ladder run after trims), `gateguard` (Law 1 reuse gate at write time), `proceed-with-the-recommendation` (applies the trims), `wild-risa-balance` (the recommendation-layer analog).

## The command

File: `commands/simplicity-review.md` (flat source; mirrored by build).

Frontmatter (matches `commands/audit.md`):

```yaml
---
name: simplicity-review
description: Review the current diff for over-engineering — flag code that could reuse an existing file, a stdlib or native feature, or fewer lines — and report GO/TRIM findings without touching code. Enforces Law 4 (Verify Before Reporting).
---
```

Thin body: what it does, the ladder, review-only, default skeptical (a finding is a hypothesis; prove the simpler path exists before asserting it), pairs-with. Scope = working-tree diff vs HEAD by default; accepts an optional commit range or file list.

## Surface cascade (exact edit sites)

New files (2 source + 1 spec):

- `skills/simplicity-review.md`
- `commands/simplicity-review.md`
- `docs/plans/2026-07-10-simplicity-review.md` (this doc)

Count bumps, skill 27 -> 28 (new skill is tier-2, so tier-2 16 -> 17):

- `src/lib/plugin-metadata.mts` — `SHARED_PLUGIN_DESCRIPTION`: "27 bundled skills" -> "28 bundled skills" (source; regenerates manifests on build).
- `package.json` — description: "27 bundled skills" -> "28 bundled skills".
- `llms.txt` — "27 bundled skills" -> "28 bundled skills" (hand-maintained).
- `.cloudplugin/marketplace.json` — "27 bundled skills" -> "28 bundled skills" (hand-maintained).
- `docs/landing/index.html` — stat block `<span class="v">27</span>...Bundled skills` -> `28`.

Prose bumps (`check-skill-count-prose` derived claims):

- `README.md` — breakdown "16 tier-2" -> "17 tier-2"; total "27 skills" -> "28 skills"; next-ordinal "28th skill" -> "29th skill". Also add `/simplicity-review` to the `## Slash commands` fenced list and bump "All 28 commands" -> "All 29 commands" (`check-command-count`).
- `docs/skills.md` — breakdown, total "27 skills" -> "28 skills", catalog "27-skill catalog" -> "28-skill catalog", next-ordinal -> "29th skill". Add the catalog entry for `simplicity-review`.
- `docs/skill-use-cases.md` — breakdown + total "27 skills" -> "28 skills". Add a use-case row.
- `CONTRIBUTING.md` — total "27 skills" -> "28 skills".
- `docs/using-this-plugin.md` — catalog "27-skill catalog" -> "28-skill catalog".

Command count, 28 -> 29:

- `README.md` `## Slash commands` (covered above): add line + bump "All 28 commands" -> "All 29 commands".

Generated by `npm run build` (commit alongside source; do not hand-edit):

- `plugins/continuous-improvement/skills/simplicity-review/SKILL.md`
- `plugins/continuous-improvement/commands/simplicity-review.md`
- `.claude-plugin/marketplace.json`, `plugins/continuous-improvement/.claude-plugin/plugin.json` (manifest counts + skill/command lists)
- everything-mirror tree

## Verification

- `npm run build` after editing `.mts`/source, then stage source + generated together (rebuild-before-stage; `.mjs` and `plugins/` mirror are generated).
- `npm run verify:all` green: skill-mirror, skill-tiers, skill-law-tag, skill-count, skill-count-prose, command-count, docs-substrings, everything-mirror, routing-targets, doc-runtime-claims, test-imports-only, scripts-citation-drift, third-party-shape, tool-count, typecheck.
- No new `.mts` logic ships, so no new unit test is required; the count/tier/law-tag lints already have tests and will assert the new numbers. If `verify:all` surfaces a doc surface I missed, fix it inline (the lints name the file).

## Ship

- One feature branch off up-to-date `main`, single concern ("add simplicity-review skill"). Never direct-push to main; open a PR.
- File count is a mix of 2 new source files, ~8 count/doc edits, and generated mirror output. The generated files are exempt from the 15-file commit gate; the hand-edited set stays well under it.

## Decisions (approved 2026-07-10)

1. Spec approved as written.
2. Route the skill into `skills/proceed-with-the-recommendation.md` at the "Refactor / dead code cleanup" line, as a repo-owned option alongside the built-in `simplify`.
3. Hold the spec/plan commit until implementation lands, so it ships as one single-concern PR (no doc-only commit first).

---

## Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans (inline) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax. The lint suite `npm run verify:all` is the test harness: it fails first, naming every stale surface, then goes green.

**Goal:** Ship the `simplicity-review` skill + `/simplicity-review` command with `verify:all` green, on a feature branch, as one single-concern PR.

**Architecture:** Prose skill + thin command, no new `.mts` logic. Source is edited; `npm run build` regenerates `bin/**.mjs`, the `plugins/**` mirror, and the plugin manifests. The count/tier/law-tag/command-count lints derive expected numbers from source and fail until every surface matches.

**Tech Stack:** Markdown skill/command sources, TypeScript build (`tsc`), Node lint scripts, `gh` for the PR.

### Global Constraints

- `.mts` is source; `bin/**.mjs` and `plugins/**` are generated by `npm run build`. Rebuild before every `git add`. Commit source + generated together.
- Windows: never `git add .` / `-A`; stage explicit paths; read drift with `git diff --stat`.
- Never direct-push to `main`. Feature branch + PR. `verify:all` green before PR.
- No em dashes in authored skill/command prose (user global rule).
- New skill is `tier: "2"`, Law 4. Counts move: skills 27 -> 28 (tier-2 16 -> 17), commands 28 -> 29, next-ordinal 28th -> 29th, catalog 27-skill -> 28-skill.

---

### Task 1: Branch + source files

**Files:** Create `skills/simplicity-review.md`, `commands/simplicity-review.md`.

- [ ] **Snapshot ground truth (concurrent-writer discipline):** `git branch --show-current`; `git rev-parse --short HEAD`; `git diff --stat`. Confirm clean.
- [ ] **Base on main:** `git switch main && git pull --ff-only origin main`.
- [ ] **Branch:** `git switch -c feat/simplicity-review-skill`.
- [ ] **Write `skills/simplicity-review.md`** using the frontmatter in the spec "The skill" section. Body sections: when-to-activate, the 7-rung ladder, read-before-cut, safety carve-out (never flag validation/data-loss/security/accessibility), output format (`file:line` / over-built / simpler / rationale, close `GO`/`TRIM`), review-only, honest overlap with built-in `simplify`, pairs-with (`verification-loop`, `gateguard`, `proceed-with-the-recommendation`, `wild-risa-balance`).
- [ ] **Write `commands/simplicity-review.md`** using the frontmatter in the spec "The command" section. Thin body: what it does, the ladder, default-skeptical, scope = working-tree diff vs HEAD (optional range/file list), pairs-with.
- [ ] **Test (source-level lints):** `node bin/check-skill-law-tag.mjs` and `node bin/check-skill-tiers.mjs`. Expected: OK (new source frontmatter valid).

### Task 2: Build and capture the red

- [ ] **Build:** `npm run build`.
- [ ] **Run the harness:** `npm run verify:all`. Expected: FAIL naming stale surfaces — `skill-count` (5 manifest files still say "27 bundled skills"), `skill-count-prose` (README + 4 docs), `command-count` (README missing `/simplicity-review`, "All 28 commands"). Record every named file.

### Task 3: Fix the count cascade

**Files:** `src/lib/plugin-metadata.mts`, `package.json`, `llms.txt`, `.cloudplugin/marketplace.json`, `docs/landing/index.html`, `README.md`, `docs/skills.md`, `docs/skill-use-cases.md`, `CONTRIBUTING.md`, `docs/using-this-plugin.md`.

- [ ] `src/lib/plugin-metadata.mts` `SHARED_PLUGIN_DESCRIPTION`: "27 bundled skills" -> "28 bundled skills".
- [ ] `package.json` description: "27 bundled skills" -> "28 bundled skills".
- [ ] `llms.txt`: "27 bundled skills" -> "28"; "27-skill catalog" -> "28-skill" if present.
- [ ] `.cloudplugin/marketplace.json`: "27 bundled skills" -> "28".
- [ ] `docs/landing/index.html`: stat `class="v">27</span>...Bundled skills` -> `28`.
- [ ] `README.md`: "16 tier-2" -> "17 tier-2"; "27 skills" -> "28 skills"; "28th skill" -> "29th skill"; "27-skill catalog" -> "28-skill catalog"; add `/simplicity-review` line to the `## Slash commands` fenced list; "All 28 commands" -> "All 29 commands".
- [ ] `docs/skills.md`: breakdown "16 tier-2" -> "17 tier-2"; "27 skills" -> "28 skills"; "27-skill catalog" -> "28-skill catalog"; next-ordinal -> "29th skill"; add the catalog entry for `simplicity-review`.
- [ ] `docs/skill-use-cases.md`: breakdown + "27 skills" -> "28 skills"; add a use-case row.
- [ ] `CONTRIBUTING.md`: "27 skills" -> "28 skills".
- [ ] `docs/using-this-plugin.md`: "27-skill catalog" -> "28-skill catalog".
- [ ] **Rebuild:** `npm run build` (regenerates manifests from `plugin-metadata`).

### Task 4: Route into proceed

**Files:** `skills/proceed-with-the-recommendation.md` (the "Refactor / dead code cleanup" routing line, around :215).

- [ ] Add `simplicity-review` as the repo-owned option alongside the built-in `simplify` at that routing line. Keep the `simplify` reference (it is reference behavior). Confirm the `routing-targets` lint stays green now that the skill exists.
- [ ] **Rebuild:** `npm run build`.

### Task 5: Green gate

- [ ] `npm run verify:all`. Expected: all checks OK, including `typecheck`.

### Task 6: Commit + PR

- [ ] `git diff --stat` to confirm the real change set (source + docs + generated mirror).
- [ ] Stage explicit paths only: the 2 new source files, the count/doc edits, this spec/plan doc, `skills/proceed-with-the-recommendation.md`, and the generated `plugins/**` + `.claude-plugin/**` + new `SKILL.md`/command mirror.
- [ ] `git commit -m "feat(simplicity-review): diff-scoped over-engineering review skill (Law 4)"`.
- [ ] Re-verify branch unchanged before push (concurrent-writer check): `git rev-parse --short HEAD`.
- [ ] `git push -u origin feat/simplicity-review-skill`.
- [ ] `gh pr create` with a body covering what/why (the ponytail overlap finding), the cascade, and `verify:all` green.

## Self-review (writing-plans)

- **Spec coverage:** skill = Task 1; command = Task 1; count cascade = Task 3; routing = Task 4; verify = Task 5; ship = Task 6. No gap.
- **Placeholder scan:** file paths and exact numbers given; body content specified by named spec sections. No TBD/TODO.
- **Type consistency:** no code signatures. Count numbers consistent throughout (27->28 skills, 16->17 tier-2, 28->29 commands, 28th->29th ordinal).
