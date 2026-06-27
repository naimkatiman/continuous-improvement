# Using continuous-improvement well

A practical guide to getting the most out of this plugin. It is organized around the agentic-engineering workflow — plan the work, run the agents, compound the system — and maps each habit to the concrete surface the plugin ships, so you know exactly what to invoke.

## What this plugin actually is

The persistent-memory and runtime-discipline layer for Claude Code, built on the 7 Laws of AI Agent Discipline (research, plan, verify, reflect, learn). Three things do the work:

- **Mulahazah instinct engine** — observes your sessions, turns each correction into a reusable instinct, and applies it automatically next time so a lesson taught once is not re-taught.
- **Boundary hooks** — `hooks/gateguard.mjs` blocks Edit/Write/Bash until you present grounding facts; `hooks/goal-drift-stop.mjs` flags drift at the Stop boundary.
- **Memory + recall** — auto-memory, MemoryCore, and the instinct index carry context across sessions.

Everything below is a way to feed those three loops.

## The daily loop (the minimal high-value path)

If you do nothing else, do this:

1. **State the goal in one sentence.** `goal-monitor` (via `hooks/goal-drift-stop.mjs`) tracks drift against it.
2. **Plan before code.** `/plan` or `planning-with-files`. Mandatory for anything over 3 files or 150 LOC — the plan lands in `docs/plans/`.
3. **Edit through the gate.** `gateguard` (`hooks/gateguard.mjs`) makes you name importers, data shapes, and the user instruction before a mutation. Answer it; do not route around it.
4. **Verify before you claim done.** `verification-loop` / `npm run verify:all`. "Should work" is not a pass.
5. **Reflect.** `/continuous-improvement` (alias `/seven-laws`) mines the session's observations into instincts.
6. **Let recall do the rest.** Next session the instincts and memory apply on their own.

*Before you even plan, if the idea itself is unproven: `/roast` convenes a 5-persona adversarial council to pressure-test it (GO / RESHAPE / KILL) so you do not plan the wrong thing.*

## Plan the work

| Habit | Invoke |
|---|---|
| Pressure-test the idea before you build it | `/roast` — a 5-persona adversarial council (Contrarian, Expansionist, Logician, Researcher, Buyer) returns one GO / RESHAPE / KILL verdict plus the cheapest 48-hour test |
| Plan the moment you have an idea | `/plan`, `planning-with-files`, `writing-plans`; plan docs live in `docs/plans/` |
| Skim the plan, work from a TLDR | `handoff` for compaction; `plan-pack --stdout` surfaces a TLDR line per plan |
| Research before planning | `deep-research`, `context7` (library docs), `WebSearch`; `gateguard` forces it for edits |
| Turn a raw transcript into signal | the observation pipeline: `observations.jsonl` → `skill-distillation` → instincts |
| Keep notes as the agent's knowledge base | auto-memory + MemoryCore + `recall` |
| Send a plan to a colleague to comment on | `ci-plan-pack <plan.md>` → a `[R#]`-anchored packet with a comment slot per section; `--gh-issue` emits a ready-to-run `gh issue create` |

## Run the agents

| Habit | Invoke |
|---|---|
| Many agents working in parallel | `dispatching-parallel-agents`, `team-builder`, the Workflow tool, `swarm` |
| Hand the build to Codex, keep taste in Claude | `codex:rescue` — Claude plans and reviews, Codex implements |
| Keep the human in the loop as the signal | the 7 Laws + `gateguard` are built for agent volume under human gating |
| Run trusted sessions without prompt friction | `dangerously-skip-permissions` is allowed for trusted, sandboxed sessions (autonomous loops, isolated worktrees), paired with `safety-guard`. Never on a shared tree or production. |
| Drive long-running / scheduled work | `schedule` (cloud agents), `/loop`, `autonomous-loops` |

## Compound the system

| Habit | Invoke |
|---|---|
| Build video from a script | `hyperframes`, `hyperframes-cli` |
| Turn a repeated workflow into a command | `writing-skills`, `skill-create`, `skill-distillation` |
| Contribute back to open source | `opensource-pipeline`, `github-ops`, the commit / PR skills |
| Generate CLIs that run real work | `ci generate` (CLI-Anything) |
| Stay honest about the addictive loop | `safety-guard` for destructive-op and autonomy guards |

## Full mapping (updated 2026-06-27)

The 21 habits of the agentic-engineering system, scored against what this plugin installs. Latest move: #3 now has a dedicated command — `/roast`, the 5-persona idea council shipped in PR #255 as the 26th bundled skill — so deep non-engineering decision work is no longer a partial. (Earlier: #7 shipped as `plan-pack` in PR #244, and #12 changed from a hard prohibition to an allowance.)

| # | Habit | Status | Maps to |
|---|---|---|---|
| 1 | Plan the moment you have an idea | Have | `writing-plans`, `planning-with-files`, `/plan`; `docs/plans/` mandate |
| 2 | Skim plan, work from a TLDR | Have | `handoff`; `plan-pack` emits a TLDR line |
| 3 | A plan flow for deep non-engineering work | **Have (new)** | `/roast` (5-persona idea council → GO/RESHAPE/KILL) validates the non-eng decision; `brainstorming` + `planning-with-files` plan it |
| 4 | Research before planning | Have | `deep-research`, `gateguard`, `context7`, `WebSearch` |
| 5 | Transcript into signal | Have (core) | `observations.jsonl` → `skill-distillation` → instincts |
| 6 | Notes as the agent's knowledge base | Have (core) | auto-memory + MemoryCore + instincts + `recall` |
| 7 | Plan as a commentable colleague doc | **Have (new)** | `ci-plan-pack` plan→review-packet export, shipped in PR #244 |
| 8 | Voice input | Out of scope | input modality, not a plugin feature |
| 9 | Many parallel agents | Have | `dispatching-parallel-agents`, `team-builder`, Workflow, `swarm` |
| 10 | Terminal defaults to an agent | Out of scope | environment setup; `codex:setup` exists |
| 11 | Remote control + email-in | Partial | `schedule`, cloud agents, push notifications; no email-in |
| 12 | Skip permissions in trusted sessions | **Have (allowed)** | rule updated to allow `dangerously-skip-permissions` for sandboxed sessions + `safety-guard` |
| 13 | Codex builds, Claude plans / taste-checks | Have | `codex:rescue` |
| 14 | Human is the signal | Have (philosophy) | 7 Laws + `gateguard` |
| 15 | Work from a remote machine | Out of scope | infra |
| 16 | Laptop / hardware setup | Out of scope | infra |
| 17 | Video from a script | Have | `hyperframes`, `hyperframes-cli` |
| 18 | Write your own skills | Have (core) | `writing-skills`, `skill-create`, `skill-distillation` |
| 19 | Contribute to open source | Have | `opensource-pipeline`, `github-ops`, commit/PR skills |
| 20 | CLIs that run real work | Have | `ci generate` (CLI-Anything) |
| 21 | Stay honest about the addictive loop | Partial | `safety-guard`; no dedicated wellbeing guardrail |

Tally: 15 Have, 2 Partial, 4 out of scope, 0 missing, 0 conflicts.

## Honest boundaries

- **Partial (#11, #21):** the capability is reachable but there is no dedicated command. Email-in for remote sessions and a wellbeing guardrail are open follow-ups.
- **Out of scope (#8, #10, #15, #16):** voice, terminal defaults, and machine setup are environment and hardware choices the plugin does not own. Configure them outside Claude Code.

The point of the plugin is not to cover all 21 — it is to make the discipline behind them automatic. Plan, gate, verify, reflect, learn. The rest is your environment.

## See also

- [skills.md](skills.md) — the full 26-skill catalog with per-skill descriptions and Law tagging
- [skill-use-cases.md](skill-use-cases.md) — the decision guide: the must-use spine, a unique trigger + boundary per skill, and how to tell similar-sounding skills apart
