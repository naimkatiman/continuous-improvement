# OUR_NOTES.md — oh-my-claudecode

Our annotations on the vendored snapshot. Authored by us, not copied from upstream.

## Why we vendored this

`yeachan-heo/oh-my-claudecode` (OMC) is an MIT-licensed multi-agent orchestration framework for Claude Code that overlaps heavily with our 7 Laws plugin. We vendored it as cold-storage so we can:

- Read its actual agent + skill definitions side-by-side with ours, without round-trips.
- Track upstream changes against pinned SHA.
- Eventually decide which OMC ideas (if any) to port into our 7 Laws — explicitly, with attribution.

## Status: NOT integrated

This snapshot is **not loaded by `plugins/continuous-improvement/`**. It is **not registered in `.claude-plugin/marketplace.json`**. Users who want OMC should install it from upstream the normal way (`/plugin marketplace add Yeachan-Heo/oh-my-claudecode`).

If you want to experiment locally, point Claude Code at the path directly — but understand that doing so installs OMC's hooks, agents, and skills, which can collide with the 7 Laws routing.

## Overlap with the 7 Laws (read this before integrating anything)

| OMC asset | 7 Laws equivalent | Notes |
|---|---|---|
| `skills/ralph/` | `plugins/continuous-improvement/skills/ralph/SKILL.md` | Both are autonomous PRD-loop runners. Direct overlap. Different prompt structure. |
| `skills/plan/` | `superpowers:writing-plans` (Law 2) | Both restate goals + decompose. OMC's is heavier on PRD format. |
| `skills/verify/` | `plugins/continuous-improvement/skills/verification-loop/SKILL.md` (Law 4) | OMC bundles verify into autopilot/team flow. Ours stands alone. |
| `skills/debug/` | `superpowers:systematic-debugging` (Law 6) | Both follow hypothesis → repro → smallest fix. Loose overlap. |
| `skills/deep-interview/` | `superpowers:brainstorming` (Law 1 helper) | OMC's is more Socratic; ours is more divergent. |
| `skills/self-improve/` | `plugins/continuous-improvement/skills/continuous-improvement/SKILL.md` (Law 7) | Both extract reusable patterns from sessions. Different storage. |
| `skills/autopilot/` | (no direct equivalent) | OMC's single-agent autonomous mode. Gap in 7 Laws. |
| `skills/team/`, `skills/omc-teams/` | (no direct equivalent) | OMC's multi-agent stage pipeline (`plan → prd → exec → verify → fix`). 7 Laws is single-actor today. |
| `skills/hud/` | (no equivalent) | Real-time HUD statusline. UX feature we don't have. |
| `agents/` (19) | Various Claude Code built-in subagents | Most overlap with built-in agents we already use (planner, code-reviewer, debugger, etc.). Worth diffing prompt-by-prompt before adopting. |

## What is intentionally NOT integrated (and why)

1. **OMC's `ralph` skill.** Our `ralph` is already a Tier-1 skill under the 7 Laws and is shaped around the Mulahazah learning loop. Adopting OMC's would fork the contract. Stay on ours.
2. **OMC's hooks.** Our `hooks/three-section-close.mjs` enforces a project-specific output contract. OMC's hooks have different goals. Mixing them creates ordering surprises.
3. **OMC's plugin manifest** (`.claude-plugin/plugin.json`). Read-only reference only. Do not register `omc` in our `.claude-plugin/marketplace.json`.
4. **OMC's `src/` and `dist/`.** Not vendored. We have no intent to fork the runtime. If we ever want OMC behavior, install from upstream.

## Ported from OMC into the 7 Laws

A focused port to our `ralph` skill landed in two commits on this branch:

- `e12848d feat(skill): ralph — PRD-discipline + final-checklist + do-not-use guard`
- `b7b2ed1 feat(skill): ralph — anti-patterns + Good/Bad examples`

Source: `third-party/oh-my-claudecode/skills/ralph/SKILL.md` at upstream SHA `1e9f197`.
Target: `skills/ralph.md` + plugin mirror `plugins/continuous-improvement/skills/ralph/SKILL.md`.
Result: 127 → 221 lines per file (+94). All edits agent-agnostic (no OMC verbs, no MCP dependencies, no `Task(subagent_type=...)` calls). Our ralph still works without OMC installed.

### Ideas adopted

| Idea | Section in our ralph | Rationale |
|---|---|---|
| Negative-form usage guidance | `## Do NOT Use When` | OMC's `<Do_Not_Use_When>` distinguishes ralph from sibling skills (one-shot edits, planning, manual control). We had no negative-form guidance; users were left to infer. |
| Force-refine PRD scaffold criteria | `### 1. Create a PRD` (CRITICAL block) | Auto-generated `["Implementation is complete"]` is theater. Our prior ralph did not guard against running iterations against meaningless criteria. |
| Per-criterion fresh-evidence verification | `## Ralph Loop Steps` step 4 (rewritten) | Replaced "typecheck, tests" with per-criterion verification plus the load-bearing rule that suite-level pass is not criterion-level proof. |
| Final Checklist as a hard gate | `## Final Checklist (Hard Gate)` | 8-item exit gate covering completion, criterion specificity, scope preservation, fresh evidence, no test-deletion, progress.txt, atomic commits, clean tree. OMC had this as `<Final_Checklist>`; we had nothing equivalent. |
| Anti-patterns table | `## Anti-patterns` | OMC explicitly calls out the polite-stop slip ("All stories pass, time to summarise" mid-loop). Generalizes across other 7 Laws skills. |
| Concrete Bad/Good example pairs | Inside PRD section + Ralph Loop step 4 | OMC's `<Examples>` blocks make rules sticky. We picked our own example domain (POST /api/users) so nothing is OMC-flavored. |

### Ideas rejected (and why)

| Idea | Why rejected |
|---|---|
| `Task(subagent_type="oh-my-claudecode:executor", model=...)` calls in workflow steps | Hard dependency on OMC being installed. Our 7 Laws ralph must run without OMC. |
| Mandatory `Skill("ai-slop-cleaner")` deslop pass (OMC Step 7.5) | Couples ralph to a separate skill we don't ship. Cleanup belongs in a different skill on a different track. |
| `--critic=architect\|critic\|codex` reviewer selection | Depends on `oh-my-claudecode:` namespaced agents we don't have. |
| `omc ask codex --agent-prompt critic` external-AI integration | Tooling-specific. Cross-AI verification is interesting but belongs in its own evaluation, not ralph. |
| Self-referential prompt-template format (`{{ITERATION}}/{{MAX}}/{{PROMPT}}`) | OMC's ralph IS the runtime prompt. Ours is a documentation skill that human + agent read. Different architecture; conflating is a category error. |
| `state_read` / `state_write` MCP tools for session persistence | OMC-specific runtime. We use `prd.json` + `progress.txt` + git history as state. |
| Session-scoped paths `.omc/state/sessions/{sessionId}/prd.json` | OMC-specific directory convention. We keep `prd.json` at project root. |
| `/oh-my-claudecode:cancel` cleanup step (OMC Step 8) | Namespaced command we don't own. Our ralph completes when the Final Checklist passes; no special cleanup needed. |
| "The boulder never stops" hook protocol | OMC-specific hook injection that collides with our `hooks/three-section-close.mjs` (different goals, ordering surprises). |
| Git commit trailers (`Constraint:` / `Rejected:` / `Confidence:` / `Scope-risk:`) | Interesting commit-discipline enhancement, but high blast-radius (touches every future commit) and unrelated to ralph. Parked for a separate focused evaluation, not bundled. |
| Tiered model routing in workflow text (haiku/sonnet/opus per task) | OMC's prompts assume the runner can dispatch with explicit model parameters. Our 7 Laws stays model-agnostic; the user picks the model. |
| Tool catalog (`state_*`, `notepad_*`, `lsp_*`, `python_repl`) referenced as required | All OMC-specific MCP tools. None portable to our context. |

### How to refresh this section

If a future port lands, append rows to "Ideas adopted" with the new commit SHA, and append rows to "Ideas rejected" if the port surfaced new rejections. Do not rewrite history — older rows stay. The matrix is a decision record, not a state snapshot.

## Open questions (for a future integration decision)

- Is OMC's `team` (multi-agent stage pipeline) worth porting as a Tier-2 7 Laws skill? Currently we drive parallelism via `superpowers:dispatching-parallel-agents`.
- Does OMC's HUD statusline solve a real visibility gap, or is it solved by our existing dashboard command?
- Would OMC's intelligent model routing (Haiku for simple, Opus for hard) belong as a hook in our plugin, or as documentation?

These are deferred. Do not answer them by accident.

## Refresh

See `third-party/MANIFEST.md` for the pinned SHA and the exact selective-copy recipe.
