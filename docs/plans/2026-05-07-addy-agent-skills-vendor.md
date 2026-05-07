# 2026-05-07 — Vendor `addyosmani/agent-skills` snapshot to `third-party/`

Plan for the Superpowers-framework chain: worktree → plan → verify → vendor → review → finish-branch → PR. Single-concern PR. No integration in this PR.

## Goal

Cold-storage snapshot the upstream `addyosmani/agent-skills` repo at `third-party/addy-agent-skills/` so we can read its 21 skills side-by-side with ours, track upstream drift against a pinned SHA, and decide later, on a per-skill basis, whether to port ideas into our 7 Laws — explicitly, with attribution.

This snapshot is **not loaded** by `plugins/continuous-improvement/`. It is **not registered** in `.claude-plugin/marketplace.json`. It is **not exposed** by hooks. Same cold-storage policy as `third-party/superpowers/` and `third-party/oh-my-claudecode/`.

## Why this repo, why now

- `addyosmani/agent-skills` (30k★, MIT) is a pure skills marketplace covering the full SDLC — spec, plan, build, verify, review, ship.
- It overlaps several of our existing CI fork skills (`tdd-workflow`, `code-review`, `planning-with-files`, `architecture-decision-records`, `simplify`) but also fills genuine gaps: `spec-driven-development`, `source-driven-development`, `context-engineering`, `idea-refine`, `incremental-implementation`.
- Vendoring lets us read the upstream verbatim without round-trips, and gives us a stable reference point against which to evaluate per-skill ports.
- ruflo (ruvnet/ruflo) is the orchestration / swarm gap candidate and is **explicitly out of scope** for this PR — deferred until a specific plugin pick is made.

## Pinned SHA

`addyosmani/agent-skills` @ `742dca58ae557bc67afec9ea8e6de59c085f0534` (2026-05-07T01:33:06Z, default branch `main`).

## Selective scope (verbatim from upstream)

Mirrors the `third-party/superpowers/` and `third-party/oh-my-claudecode/` shape:

- `skills/` — 21 skills (full set; OUR_NOTES matrix flags integration candidates)
- `agents/` — agent definitions
- `hooks/` — hooks manifests
- `references/` — reference material
- `docs/` — upstream documentation
- `.claude-plugin/` — plugin + marketplace manifests (read-only; not registered in our marketplace)
- `LICENSE`, `README.md`, `AGENTS.md`, `CONTRIBUTING.md`

## Excluded from snapshot

- `.git/`, `.github/`, `.gitignore` — repo metadata, not vendor scope
- `.gemini/`, `.opencode/` — non-Claude vendor adapters, out of scope (consistent with how we excluded `.codex-plugin/` from the obra snapshot)
- `CLAUDE.md` — auto-loads as Claude Code session context if read from this subtree, leaks upstream operating principles into the active 7 Laws session. Excluded for cross-contamination safety. Upstream still ships it; refer to upstream URL when needed.

## Carried-in negative prompts (P-MAG Rule 3)

> Will NOT repeat: collapsing Obra and CI superpowers — addy is its own snapshot, parallel to obra and oh-my-claudecode, never bundled with either.
>
> Will NOT repeat: `git add .` / `-A` on Windows — every snapshot file is staged by explicit path or by directory tree, with `git diff --stat` (not `git status`) used to verify the actual diff.
>
> Will NOT repeat: editing `.mjs` directly when a `.mts` source exists — `bin/refresh-third-party.mjs` has no `.mts` source, but I will not extend it in this PR (deferred follow-up #1) to avoid bundling concerns and to dodge the `npm run clean` wipe risk.
>
> Will NOT repeat: bundled concerns — vendoring (this PR), driver SNAPSHOTS entry (follow-up #1), and a generic third-party shape invariant (follow-up #2) ship as three separate PRs.

## Step plan

| Step | Action | Verification |
|---|---|---|
| 1 | Worktree `third-party/addy-agent-skills` off `origin/main@37bcd96` | `git worktree list` + clean status |
| 2 | This plan doc | merged into the same single-concern PR |
| 3 (baseline) | `npm run typecheck` + `npm run test` on clean main inside worktree | both green before any vendor add |
| 4a | Shallow-clone upstream, verify HEAD == pinned SHA, copy selective scope verbatim, strip every `CLAUDE.md` inside snapshot | `find third-party/addy-agent-skills -name CLAUDE.md` returns empty |
| 4b | Append `### addyosmani/agent-skills` block to `third-party/MANIFEST.md` (SHA, scope, recipe, exclusions) | manual diff vs. obra/superpowers + oh-my-claudecode entries — same shape |
| 4c | Author `third-party/addy-agent-skills/OUR_NOTES.md` (overlap matrix, 5 integration candidates flagged, NOT-integrated banner, refresh pointer) | matches OMC OUR_NOTES.md shape |
| 5 (verify-after) | `npm run typecheck` + `npm run test` again | both green after vendor add |
| 6 | code-reviewer agent on the diff (license compliance, snapshot purity, no leaking integration); security-reviewer if any executable scripts pulled in | review report attached to PR |
| 7 | finishing-a-development-branch — squash-merge ready check, ahead-of-origin baseline check, no drive-by changes | branch ready for single squash commit |
| 8 | Open PR vs `main` — `chore(third-party): vendor addyosmani/agent-skills @ 742dca5` | single concern, MANIFEST pinned, OUR_NOTES.md populated |

## Integration candidates (recorded here, NOT acted on in this PR)

These five upstream skills are flagged as having no direct overlap with our existing CI fork skills and are the most likely future ports. Each port is a separate single-concern PR, only after a concrete user-pain trigger:

| Upstream skill | Gap in our 7 Laws | Trigger to port |
|---|---|---|
| `spec-driven-development` | We have `planning-with-files` (file-first plan) but no spec-first contract | A user-reported failure where implementation drifted because there was no testable spec |
| `source-driven-development` | Not covered today | A repo that needs a "code is source of truth, regenerate doc/test from it" loop |
| `context-engineering` | We have `context-budget` (token math) but not curation/shape | Repeated reports of bad-context-driven failures despite budget being fine |
| `idea-refine` | We have `brainstorming` (Obra) but no narrowing pass | A user request that surfaced a need to compress N ideas to 1 with explicit scoring |
| `incremental-implementation` | Loosely covered by `tdd-workflow` and Law 3 (one-thing-at-a-time) | A report where TDD passed but the slices were too large to review safely |

## Deferred follow-ups (NOT in this PR)

- **Follow-up #1 — driver entry.** Add `addy-agent-skills` SNAPSHOTS entry to `bin/refresh-third-party.mjs`. Blocked on the pre-existing irregularity that this driver has no `.mts` source. Either land a `.mts` source for the whole driver first, or accept the deviation explicitly. Either way, separate PR.
- **Follow-up #2 — third-party shape invariant.** A new check (e.g., `bin/check-third-party-shape.mjs`) that asserts every `third-party/<name>/` has `OUR_NOTES.md`, `LICENSE`, and a matching `### <heading>` row in `MANIFEST.md` with a 40-char SHA pin. Useful safety net once we have 4+ snapshots; not load-bearing for this PR.
- **Follow-up #3 — ruflo cherry-pick.** Vendor at most one ruflo plugin (orchestration / swarm gap), through the same playbook. Held until a specific plugin name is chosen.

## Risks

- **License posture.** Upstream is MIT. Our policy keeps copied files **verbatim**; annotations live only in sibling `OUR_NOTES.md`. This satisfies MIT attribution without triggering Apache-2.0-style modification disclosure. LICENSE is preserved verbatim at `third-party/addy-agent-skills/LICENSE`.
- **`CLAUDE.md` leakage.** Upstream ships a root `CLAUDE.md`. If we accidentally copy it, Claude Code auto-loads it as session context, leaking upstream operating principles into our session. Mitigation: post-copy `find ... -name CLAUDE.md -delete` (same defense applied to oh-my-claudecode and obra snapshots).
- **Skill name collision.** Some upstream skills (e.g., `test-driven-development`) share names with our CI fork skills. Cold storage is safe (not loaded), but a future integration PR must rename on import or risk shadowing. The OUR_NOTES.md overlap matrix records this.
- **Drift across snapshots.** Refresh cadence (first business day of each month, per `third-party/README.md`) applies to addy too. Recorded in MANIFEST.md.

## Out of scope (explicit)

- Driver integration in `bin/refresh-third-party.mjs` (follow-up #1)
- Generic third-party shape invariant check (follow-up #2)
- ruflo vendoring (follow-up #3)
- Any port of upstream skill content into `skills/` or `plugins/continuous-improvement/skills/`
- Any registration of the addy plugin in our `.claude-plugin/marketplace.json`
- Any edits to upstream files beyond `find -name CLAUDE.md -delete` post-copy
