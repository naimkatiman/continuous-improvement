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

## Open questions (for a future integration decision)

- Is OMC's `team` (multi-agent stage pipeline) worth porting as a Tier-2 7 Laws skill? Currently we drive parallelism via `superpowers:dispatching-parallel-agents`.
- Does OMC's HUD statusline solve a real visibility gap, or is it solved by our existing dashboard command?
- Would OMC's intelligent model routing (Haiku for simple, Opus for hard) belong as a hook in our plugin, or as documentation?

These are deferred. Do not answer them by accident.

## Refresh

See `third-party/MANIFEST.md` for the pinned SHA and the exact selective-copy recipe.
