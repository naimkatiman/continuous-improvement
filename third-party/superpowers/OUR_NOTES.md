# OUR_NOTES.md — obra/superpowers

Our annotations on the vendored snapshot. Authored by us, not copied from upstream.

## Why we vendored this

`obra/superpowers` is the canonical upstream that the CI fork's `superpowers` dispatcher (`plugins/continuous-improvement/skills/superpowers/SKILL.md`) routes against — its frontmatter declares `origin: https://github.com/obra/superpowers`. Until this snapshot, the dispatcher named the workflow skills (`brainstorming`, `writing-plans`, `using-git-worktrees`, etc.) but no upstream skill bodies existed in-repo. We vendored it as cold-storage so we can:

- Read Obra's actual skill definitions side-by-side with our 7 Laws routing, without round-tripping to GitHub.
- Track upstream changes against the pinned SHA in `third-party/MANIFEST.md`.
- Detect drift when Obra adds, removes, or renames a workflow skill that the CI dispatcher table references.
- Decide skill-by-skill whether a future change in Obra warrants a parallel update on the 7 Laws side.

## Status: NOT integrated

This snapshot is **not loaded by `plugins/continuous-improvement/`**. It is **not registered in `.claude-plugin/marketplace.json`**. Users who want Obra's skills should install the upstream plugin the normal way (`/plugin marketplace add obra/superpowers`).

The session-start contract is explicit and must not be violated:

> superpowers (Obra) and continuous-improvement:superpowers (CI fork) are distinct — both installed, do not collapse them.

If you want to experiment locally, install Obra from upstream and let the two plugins coexist — do not have the CI plugin import from this snapshot path.

## Dispatcher → upstream-file map

The CI fork's `plugins/continuous-improvement/skills/superpowers/SKILL.md` references the following workflow skills by name. Each one resolves to the upstream skill file shown below. Use this map to spot drift on the next refresh — if any path goes missing, the upstream renamed or removed the skill and the CI dispatcher table needs an aligned edit.

| Dispatcher reference | Upstream file |
|---|---|
| `brainstorming` | `third-party/superpowers/skills/brainstorming/SKILL.md` |
| `using-git-worktrees` | `third-party/superpowers/skills/using-git-worktrees/SKILL.md` |
| `writing-plans` | `third-party/superpowers/skills/writing-plans/SKILL.md` |
| `subagent-driven-development` | `third-party/superpowers/skills/subagent-driven-development/SKILL.md` |
| `executing-plans` | `third-party/superpowers/skills/executing-plans/SKILL.md` |
| `test-driven-development` | `third-party/superpowers/skills/test-driven-development/SKILL.md` |
| `requesting-code-review` | `third-party/superpowers/skills/requesting-code-review/SKILL.md` |
| `receiving-code-review` | `third-party/superpowers/skills/receiving-code-review/SKILL.md` |
| `finishing-a-development-branch` | `third-party/superpowers/skills/finishing-a-development-branch/SKILL.md` |
| `dispatching-parallel-agents` | `third-party/superpowers/skills/dispatching-parallel-agents/SKILL.md` |
| `systematic-debugging` | `third-party/superpowers/skills/systematic-debugging/SKILL.md` |
| `verification-before-completion` | `third-party/superpowers/skills/verification-before-completion/SKILL.md` |
| `writing-skills` | `third-party/superpowers/skills/writing-skills/SKILL.md` |
| `using-superpowers` | `third-party/superpowers/skills/using-superpowers/SKILL.md` |

14 dispatcher references, 14 upstream files. A future refresh that breaks this 1:1 ratio is the signal to re-align the dispatcher table.

## Overlap with the 7 Laws (read this before integrating anything)

The CI fork already names every workflow skill above inside its dispatcher table. The relationships are not redundant — Obra ships the skill bodies, the 7 Laws fork wraps them in Law-aligned routing:

| Obra skill | 7 Laws Law | Notes |
|---|---|---|
| `brainstorming` | Law 2 (Plan Is Sacred) | Helper that converts vague asks into a structured design. |
| `writing-plans` | Law 2 | Bite-sized task decomposition with file paths + verification. |
| `using-git-worktrees` | Law 3 (One Thing at a Time) | Branch isolation, default per the dispatcher commitments. |
| `subagent-driven-development` | Law 3 + Law 4 | Two-stage spec-then-quality review, default for non-trivial tasks. |
| `executing-plans` | Law 3 | Batch execution mode with human checkpoints. |
| `test-driven-development` | Law 3 + Law 4 (Verify Before Reporting) | Strict RED-GREEN-REFACTOR; pre-test code is deleted. |
| `requesting-code-review` | Law 4 | Pre-review checklist with severity gating. |
| `receiving-code-review` | Law 4 | Responding-to-feedback discipline. |
| `finishing-a-development-branch` | Law 4 | Pre-push verification and cleanup, default before any push. |
| `dispatching-parallel-agents` | Law 6 (Iterate Means One Thing) | Concurrent subagent fan-out, replaces hand-rolled parallelism. |
| `systematic-debugging` | Law 6 | 4-phase root-cause process. |
| `verification-before-completion` | Law 4 | Final-state confirmation before declaring done. |
| `writing-skills` | Law 7 (Learn From Every Session) | Skill authoring standard. |
| `using-superpowers` | Cross-cutting | Introduction / on-ramp. |

## What is intentionally NOT integrated (and why)

1. **Obra's hooks** (`hooks.json`, `hooks-cursor.json`, `run-hook.cmd`, `session-start`). The CI fork already runs `hooks/three-section-close.mjs` and other Law-specific hooks. Mixing two hook layers creates ordering surprises and double-prompts. Snapshot-only.
2. **Obra's `.claude-plugin/` manifest**. Read-only reference. Do not register `superpowers` (Obra) under our `.claude-plugin/marketplace.json` — users install Obra directly from upstream so both plugins coexist.
3. **Obra's `scripts/` and `tests/`**. Excluded from the snapshot — not vendor scope, consistent with our OMC handling.
4. **Obra's `package.json` and `.version-bump.json`**. Release tooling for Obra's own pipeline. We do not run it.
5. **Non-Claude adapters** (`.codex-plugin/`, `.cursor-plugin/`, `.opencode/`, `gemini-extension.json`, `GEMINI.md`). Out of scope for a Claude Code 7 Laws fork.
6. **Root `CLAUDE.md`**. Auto-loads as Claude Code session context if read from this subtree and would leak Obra's operating principles into the active 7 Laws session. Excluded; refer to the upstream URL when needed.

## Refresh cadence

This snapshot is refreshed by bumping the SHA in `third-party/MANIFEST.md` and re-running the `Refresh recipe` block in that file. No part of this `OUR_NOTES.md` needs editing on a routine refresh — only update it when the upstream's surface changes materially (new skill added, skill renamed, or scope decision changes).
