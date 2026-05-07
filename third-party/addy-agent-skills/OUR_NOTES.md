# OUR_NOTES.md — addyosmani/agent-skills

Our annotations on the vendored snapshot. Authored by us, not copied from upstream.

## Why we vendored this

`addyosmani/agent-skills` is an MIT-licensed skills marketplace that ships 21 skills covering the full software development lifecycle — spec, plan, build, verify, review, ship. We vendored it as cold-storage so we can:

- Read its actual skill bodies side-by-side with ours, without round-trips.
- Track upstream changes against pinned SHA.
- Decide later, on a per-skill basis, whether to port ideas into our 7 Laws — explicitly, with attribution.

## Status: NOT integrated

This snapshot is **not loaded by `plugins/continuous-improvement/`**. It is **not registered in `.claude-plugin/marketplace.json`**. Users who want addyosmani's plugin should install it from upstream the normal way (`/plugin marketplace add addyosmani/agent-skills`).

If you want to experiment locally, point Claude Code at the path directly — but understand that doing so installs upstream's hooks, agents, and skills, which can collide with the 7 Laws routing (notably the duplicate skill names called out in the matrix below).

## Overlap with the 7 Laws (read this before integrating anything)

| Upstream skill | 7 Laws equivalent | Notes |
|---|---|---|
| `test-driven-development` | `tdd-workflow` (Law 3 + Law 4) | Direct name + intent overlap. Our version is Law-tagged and integrated with the verification loop; upstream is standalone. **Importing under the same name would shadow ours.** Rename on import if ever ported. |
| `code-review-and-quality` | `code-review` skill + `code-reviewer` subagent | Heavy overlap. Ours is wired into the `landing` chain (gateguard → verification-loop → code-review → branch finish). Upstream is a stricter checklist focus. |
| `planning-and-task-breakdown` | `planning-with-files` + `plan` (Law 2) | Both decompose work; ours mandates `task_plan.md` / `findings.md` / `progress.md` files. Upstream is closer to mental decomposition. |
| `security-and-hardening` | `security-review` skill + `security-reviewer` subagent | Both cover OWASP-grade review. Ours is single-skill + subagent; upstream is one consolidated skill. |
| `documentation-and-adrs` | `architecture-decision-records` skill | Upstream merges API docs + ADRs. Ours splits ADRs from doc generation. |
| `code-simplification` | `simplify` skill | Loose overlap. Upstream is broader; ours focuses on duplication and dead-code detection. |
| `git-workflow-and-versioning` | implicit in `using-git-worktrees` (Obra) + commit-commands | We have no consolidated git-workflow skill; rules live in CLAUDE.md and `using-git-worktrees`. |
| `ci-cd-and-automation` | (no direct equivalent) | We have GitHub Actions config but no skill describing CI/CD discipline. Possible gap. |
| `debugging-and-error-recovery` | `superpowers:systematic-debugging` (Law 6) | Loose overlap. Ours is hypothesis → repro → smallest fix; upstream is broader (logging, error envelopes). |
| `performance-optimization` | (no direct equivalent) | Possible gap. Our `benchmark` skill covers measurement but not the optimization playbook. |
| `api-and-interface-design` | (no direct equivalent) | Possible gap. We have `api-design` patterns reference but no skill that walks API design from scratch. |
| `frontend-ui-engineering` | `frontend-design` + `design-system` skills | Our existing skills are stronger; upstream is more general. |
| `browser-testing-with-devtools` | `e2e-testing` + `browser-qa` skills | Ours is Playwright-centric; upstream is devtools-centric. |
| `deprecation-and-migration` | (no direct equivalent) | Possible gap, low priority. |
| `shipping-and-launch` | `finishing-a-development-branch` (Obra) + commit-commands | Loose overlap. Upstream covers wider release-management ground. |
| `using-agent-skills` | (meta) | Documents how to use upstream's marketplace. Out of scope for porting. |

## Integration candidates (5 non-overlapping skills)

These five upstream skills have **no direct overlap** with our existing CI fork skills and are the most likely future ports. Each port is a separate single-concern PR, only after a concrete user-pain trigger:

| Upstream skill | Gap in our 7 Laws | Trigger to port |
|---|---|---|
| `spec-driven-development` | We have `planning-with-files` (file-first plan) but no spec-first contract that downstream tests/code regenerate from. | A user-reported failure where implementation drifted because there was no testable spec to anchor against. |
| `source-driven-development` | Not covered today. | A repo that needs a "code is source of truth, regenerate doc/test from it" loop instead of the spec-first inversion. |
| `context-engineering` | We have `context-budget` (token math) but not curation/shape — what to put in, what to leave out, in what order. | Repeated reports of bad-context-driven failures despite token budget being fine. |
| `idea-refine` | We have `brainstorming` (Obra) for divergence and `wild-risa-balance` for selection, but no narrowing / scoring pass between them. | A user request that surfaced a need to compress N ideas to 1 with explicit scoring criteria. |
| `incremental-implementation` | Loosely covered by `tdd-workflow` and Law 3 (one-thing-at-a-time), but no explicit slicing methodology. | A report where TDD passed but the slices were too large to review safely. |

## What is intentionally NOT integrated (and why)

1. **Upstream's `test-driven-development` skill.** Our `tdd-workflow` is already a Tier-1 skill under the 7 Laws and is integrated with `verification-loop`. Importing upstream under the same name would shadow ours. Stay on ours.
2. **Upstream's `code-review-and-quality`, `security-and-hardening`, `planning-and-task-breakdown`, `documentation-and-adrs`, `code-simplification`.** Each has a corresponding 7 Laws skill or subagent. Bringing in upstream's versions would create duplicates that compete in routing without a clear winner.
3. **Upstream's `hooks/` shell scripts** (`session-start.sh`, `sdd-cache-pre.sh`, `sdd-cache-post.sh`, `simplify-ignore.sh`, `simplify-ignore-test.sh`). Vendored verbatim for read-only reference. **Not registered with our hook runner.** Our `hooks/three-section-close.mjs` and the wider Node-based hook surface have different goals; mixing creates ordering surprises.
4. **Upstream's `.claude-plugin/plugin.json` and `marketplace.json`.** Read-only reference only. Do not register `addy-agent-skills` in our `.claude-plugin/marketplace.json`.
5. **Upstream's agents** (`code-reviewer.md`, `security-auditor.md`, `test-engineer.md`). We already have built-in subagents (`code-reviewer`, `security-reviewer`) with the same intent. Worth diffing prompt-by-prompt before any adoption.

## Ported into the 7 Laws

Nothing yet. This row stays empty until a concrete port lands. When one does, append a row with:

- Date
- Source path inside the snapshot (with the upstream SHA at port time)
- Target path in our repo
- Commit SHA
- One-line summary of what was ported and what was rejected

## Refresh

See `third-party/MANIFEST.md` for the pinned SHA and the exact selective-copy recipe.
