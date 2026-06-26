# Skill use-case map — when to reach for each one

[`docs/skills.md`](skills.md) is the **catalog** (what each skill *is*). This page is the **decision guide** (when to *reach for it*, and how to tell two similar-sounding skills apart).

The plugin ships **25 skills** (1 core + 1 featured + 6 tier-1 + 14 tier-2 + 3 always-bundled companions). Most confusion is not "what does this skill do" — it is "I have five skills that all sound like *stop and check first*; which one is this situation?" The [disambiguation section](#disambiguation--this-not-that) is the answer to that.

---

## 1. The must-use set (the spine)

These **8 skills are the always-on minimum** — the repo's tier-1 + the featured orchestrator + the core spec. They ship and load by default in **Beginner** install; you do not pick them per task, they are simply *on*. If you adopt nothing else, adopt these.

| Skill | Tier | Law | The one job it does | You reach for it when… |
|---|---|---|---|---|
| `continuous-improvement` (core) | core | all 7 | The 7 Laws operating system — research → plan → execute → verify → reflect → learn → iterate | Always loaded. It is the frame the other 24 plug into. |
| `proceed-with-the-recommendation` ⭐ | featured | all 7 | Execution arm — walks any numbered recommendation list top-to-bottom, one concern at a time, verifying per item | Any agent (or you) emits a list of next steps and you want them *done*, not just listed |
| `gateguard` | 1 | 1 | Runtime gate that blocks `Edit`/`Write`/destructive `Bash` until you present investigation facts | **Automatic** — it fires the instant you try to mutate a file. You answer it, you do not invoke it |
| `recall` | 1 | 1 | BM25 search over past sessions — "have I hit this before?" | The start of a task that smells familiar, *before* re-deriving a fix or repeating a mistake |
| `tdd-workflow` | 1 | 3 + 4 | RED → GREEN → REFACTOR with 80%+ coverage | Writing a new feature, fixing a bug, or refactoring — anything that changes behavior |
| `verification-loop` | 1 | 4 | Six-phase gate: build, types, lint, tests, security, diff → PASS/FAIL | You are about to say "done." This is the proof |
| `deploy-receipt` | 1 | 4 | "Merged ≠ live" — proves the deployed SHA matches merged HEAD + healthcheck 200 | The merge target **auto-deploys** (Railway, Vercel, Netlify, Cloudflare Workers, Fly.io). Skip it otherwise |
| `model-forward` | 1 | all 7 | Standing stance: go *with* the model; skills are scaffolding that fades as the model internalizes them | Background posture — not a per-task action |

**Read the spine as a loop:** `recall` (have I done this?) → `gateguard` (research before I edit) → `tdd-workflow` (build it test-first) → `verification-loop` (prove it) → `deploy-receipt` (prove it shipped) → `proceed-with-the-recommendation` keeps every item on that rail. `model-forward` is the attitude underneath all of it.

---

## 2. Plugins — which to install

The marketplace ships **5 plugins**: 1 native + 4 vendored, pinned-SHA snapshots.

| Plugin | Verdict | Install it when… |
|---|---|---|
| **`continuous-improvement`** (native) | **MUST** | Always. This is the framework — the 8-skill spine, the hooks, the MCP tools, the GitHub Action |
| **`superpowers`** (obra, v5.1.0) | **Strongly recommended** | You want dedicated specialists behind the `/superpowers` router (TDD, debugging, writing-plans, git-worktrees, parallel agents) instead of the inline fallbacks. The router works without it — just at fallback quality |
| `agent-skills` (Addy Osmani, v1.0.0) | Situational | You want the 21-skill SDLC set: spec-driven-development, performance-optimization, security-and-hardening, frontend-ui-engineering, browser-testing, CI/CD, migrations |
| `ruflo-swarm` (ruvnet, v0.2.0) | Situational | You need multi-agent **swarm** coordination — `swarm_*`/`agent_*` MCP tools, Monitor streams, worktree isolation, `/swarm` + `/watch` |
| `oh-my-claudecode` (Yeachan-Heo, v4.13.6) | Situational | You want heavy multi-agent orchestration (ultrawork, ultraqa, team, trace). **Overlaps** `ralph`/`superpowers` — pick per task, do not run all three at once |

**Beginner install** = `continuous-improvement` + (recommended) `superpowers`. That covers ~90% of users. Add a vendored companion only when its specialty (swarm / SDLC depth / multi-agent ops) is the actual task.

---

## 3. Clear-cut use case for every skill

Grouped by the job, not the tier. Each skill gets the **trigger** that is unique to it and the **boundary** that keeps it from being confused with a neighbor.

### Alignment & research — *I do not yet understand the task* (Law 1)

| Skill | Reach for it when… | Not for… (use instead) |
|---|---|---|
| `gateguard` | About to edit/write/run a destructive command — it forces the facts (importers, schemas, the user's actual instruction) | A read-only investigation; it lets those through |
| `recall` | A problem feels familiar and you want past sessions as evidence before deriving | Searching the *codebase* — that is Grep/Glob. `recall` searches your *history* |
| `grill-me` | The request is fuzzy and you need to interview the user to a shippable spec | A clear spec — skip straight to planning |
| `grill-with-docs` | Same as `grill-me`, **and** the domain glossary/decisions should persist to `CONTEXT.md` + ADRs | A throwaway task where nothing needs to outlive the session (use plain `grill-me`) |
| `workspace-surface-audit` | You do not yet know what this repo + MCP + env can actually do, or you are setting up Claude Code | You already know the surface; this is a discovery pass |
| `reconcile` | Before any mutation, to establish git ground truth (branch, status, ahead/behind) and to confirm a push *landed* | Validating a worktree root specifically (use `worktree-safety`) |

### Planning & framing — *aim the effort* (Law 2)

| Skill | Reach for it when… | Not for… |
|---|---|---|
| `goal-monitor` | Mid-session, to catch drift from the stated `## Goal` in `task_plan.md` before it reaches "done" | End-of-session reflection (that is `/seven-laws`) |
| `token-budget-advisor` | A big answer is coming and you want to pick depth (25/50/75/100%) before spending the tokens | Short, obvious answers |
| `wild-risa-balance` | Emitting a recommendation list where bold options keep losing to safe ones in a flat ranking — split into pilots above a baseline | Single-option decisions |

### Execution safety — *one thing, bounded blast radius* (Law 3)

| Skill | Reach for it when… | Not for… |
|---|---|---|
| `safety-guard` | Running autonomously, on production, or with `--dangerously-skip-permissions` — locks edits to a directory and blocks destructive shell | Normal interactive work where `gateguard` already gates edits |

### Verify deeper — *prove it* (Law 4)

| Skill | Reach for it when… | Not for… |
|---|---|---|
| `audit` | Reviewing a *window of recent commits* for real defects, confirming each before touching code | Verifying the change you are *currently* writing (that is `verification-loop`) |
| `recovery-classification` | A verification-ladder or auto-loop step **just failed** and you need to classify *why* (provider / tool-schema / policy / git / worktree / runtime) before retrying | A first attempt — this is the retry-decision layer |
| `state-reconciliation` | Before dispatching a unit of work, to reconcile DB-vs-disk-vs-memory so a stale flag never re-runs completed work | Single-shot edits with no dispatch/queue |
| `worktree-safety` | Before a source-writing call **inside a git worktree** — validates the worktree root, leases, ownership | Plain single-checkout repos (use `reconcile` for general git truth) |

### Iterate at scale (Law 6)

| Skill | Reach for it when… | Not for… |
|---|---|---|
| `ralph` | You have a PRD and want an autonomous loop to grind it story-by-story with quality checks between iterations | A single change — that is plain `tdd-workflow` |

### Reflect & learn — *carry it forward* (Law 5 + 7)

| Skill | Reach for it when… | Not for… |
|---|---|---|
| `strategic-compact` | Mid-task at a phase boundary (research→plan, plan→implement, debug→next) and context is filling | End of session (use `handoff`) |
| `handoff` | End of session — compact everything into a portable brief a fresh agent can pick up cold | Mid-task trimming (use `strategic-compact`) |
| `skill-distillation` | A tool sequence has worked 3+ times and you want it captured as a reusable draft instinct | A one-off; there is nothing to distill |

### Routers / activators

| Skill | Reach for it when… | Not for… |
|---|---|---|
| `proceed-with-the-recommendation` | You hold a **list** of next steps and want it executed, verified, one concern at a time | Picking *which skill* fits a single task (use `superpowers`) |
| `superpowers` | You hold a **task** and want it routed to the right Law-aligned specialist automatically | Executing an existing list (use `proceed-with-the-recommendation`) |

---

## 4. Disambiguation — *this, not that*

The skills that get confused, separated by the one word that distinguishes them.

### The five "stop and check first" skills

> All five gate *something* before you proceed. They guard **different things**:

| Skill | Guards… | Fires… |
|---|---|---|
| `gateguard` | your **understanding** — no edit without facts | automatically, on every first mutation per file |
| `safety-guard` | your **blast radius** — no destructive shell, edits locked to a dir | when you opt into a careful/freeze/guard mode |
| `reconcile` | **git truth** — right branch, push actually landed | when you ask, before a mutation |
| `worktree-safety` | the **worktree** — valid root, no stale lease, no foreign owner | before a write inside a multi-worktree setup |
| `state-reconciliation` | the **work-queue** — DB/disk/memory agree before dispatch | before re-dispatching a unit of work |

*One line:* **gateguard** guards what you know · **safety-guard** guards what you can break · **reconcile** guards where git is · **worktree-safety** guards where you are writing · **state-reconciliation** guards what already ran.

### The four "verify" skills

| Skill | Verifies… | At what moment |
|---|---|---|
| `tdd-workflow` | the change, **as you write it** (tests first) | during coding |
| `verification-loop` | the change, **before you call it done** | end of the change |
| `deploy-receipt` | the **deploy** (SHA live + healthcheck) | after merge, on auto-deploy targets |
| `audit` | **already-landed commits**, after the fact | reviewing a window of history |

*One line:* **tdd** while writing · **verification-loop** before "done" · **deploy-receipt** after merge · **audit** for what already shipped.

### The two "interview the user" skills

- `grill-me` — align on the plan. **Nothing persists.**
- `grill-with-docs` — align on the plan **and write the outcomes** to `CONTEXT.md` + ADRs. Pick this when the glossary/decisions must survive the session.

### The two "memory" skills

- `recall` — **reads** the past (search before deriving). Law 1.
- `skill-distillation` — **writes** the past (capture a repeated success). Law 7.

### The three "context window" skills

- `strategic-compact` — compact **mid-task** at a phase boundary.
- `handoff` — compact **at end-of-session** into a portable brief.
- `token-budget-advisor` — size a **single answer** before spending the tokens.

### The two "router" skills

- `proceed-with-the-recommendation` — you have a **list** → execute it, item by item, verified.
- `superpowers` — you have a **task** → route it to the right specialist.

---

## 5. Fast lookup — "I want to ___ → use ___"

| The moment | The skill |
|---|---|
| I'm about to edit a file | `gateguard` (it finds you) |
| This bug feels familiar | `recall` |
| The request is vague | `grill-me` (→ `grill-with-docs` if it should persist) |
| I don't know what this environment can do | `workspace-surface-audit` |
| New feature / bug fix / refactor | `tdd-workflow` |
| I think I'm done | `verification-loop` |
| It merged to an auto-deploy branch | `deploy-receipt` |
| An agent handed me a numbered list | `proceed-with-the-recommendation` |
| I don't know which skill fits this task | `superpowers` |
| Running unattended or against prod | `safety-guard` |
| A verify step just failed | `recovery-classification` |
| Reviewing recent commits for defects | `audit` |
| Am I drifting off the goal? | `goal-monitor` |
| Running low on context, mid-task | `strategic-compact` |
| Wrapping up for the next session | `handoff` |
| A big PRD to grind through | `ralph` |
| This sequence has worked 3× — stop re-deriving it | `skill-distillation` |
| Before any git mutation | `reconcile` |

---

## See also

- [`docs/skills.md`](skills.md) — the full catalog with per-skill descriptions and Law tagging
- [`docs/using-this-plugin.md`](using-this-plugin.md) — the daily loop and the agentic-engineering habit mapping
- [`README.md`](../README.md) — landing page, install, the four failure modes each skill catches
- [`SKILL.md`](../SKILL.md) — the full 7 Laws spec
