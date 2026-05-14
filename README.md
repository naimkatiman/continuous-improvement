<!-- README landing-page structure rationale: docs/plans/2026-05-14-readme-landing-rewrite.md -->

<p align="center">
  <img src="assets/combined.gif" alt="Before vs After — The 7 Laws of AI Agent Discipline" width="700" />
</p>

<h1 align="center">A seatbelt for Claude Code</h1>

<p align="center">
  <b>Research first. Edit safely. Verify before done. Remember what worked.</b>
</p>

<p align="center">
  <i>The 7 Laws of AI Agent Discipline — runtime hooks, enforcement skills, and project memory.</i>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/continuous-improvement"><img src="https://img.shields.io/npm/v/continuous-improvement" alt="npm"></a>
  <a href="https://docs.anthropic.com/en/docs/claude-code"><img src="https://img.shields.io/badge/Claude%20Code-skill-blueviolet" alt="Claude Code"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license"></a>
  <a href="test/"><img src="https://img.shields.io/badge/tests-passing-brightgreen" alt="tests"></a>
</p>

<p align="center">
  <b>New here?</b> → <a href="QUICKSTART.md">QUICKSTART.md</a> (2 minutes)
</p>

> **What this is *not*:** a prompt template, a `CLAUDE.md`, or a vibes-based reminder. It is a runtime hook (`hooks/gateguard.mjs`) plus a bundled skill set that physically blocks `Edit` / `Write` / destructive `Bash` until the agent has done the work.

---

## What this does

Claude Code is powerful but skips the boring discipline: it edits before reading, guesses instead of checking, stacks five concerns into one commit, and says "done" without running tests. Continuous Improvement adds three layers that stop that:

1. **Before an edit** — [`gateguard`](skills/gateguard.md) ships as a `PreToolUse` hook (`hooks/gateguard.mjs`) that physically blocks `Edit` / `Write` / `MultiEdit` and destructive `Bash` until the agent presents a fact-list investigation.
2. **During work** — bundled skills enforce planning, one-thing-at-a-time execution, TDD ([`tdd-workflow`](skills/tdd-workflow.md)), and a six-phase verification ladder ([`verification-loop`](skills/verification-loop.md)) before "done".
3. **After work** — `/seven-laws` reflection plus the Mulahazah instinct engine capture lessons so the same mistake does not repeat next session.

Beginner install is two slash commands inside Claude Code (no Node, no bash). Expert install adds MCP tools, observation hooks, instinct packs, and a GitHub Action transcript linter for CI.

---

## Before and after

Without Continuous Improvement, "fix the login redirect bug" looks like this:

> Claude edits `Login.tsx`, `LoginForm.tsx`, `useAuth.ts`, `authRouter.ts`, `redirects.ts`, and `useNavigate.ts` — six files, no plan, no investigation. Says "done". The redirect still loops. You roll back six files.

With Continuous Improvement, the same prompt is forced through the gate:

> `gateguard` blocks the first `Edit` until Claude presents a fact list. Claude reads `useAuth.ts`, finds the existing `redirectAfterLogin` helper, traces *why* the redirect loops (a stale `from` query param), and edits one line in one file. `verification-loop` runs the tests. The reply names the file, the line, the cause.

Same agent. Same model. Different discipline.

---

## Who this is for

Use this if you:

- ship from real repositories with real consequences
- have been bitten by an agent that edits before understanding
- want tests, builds, or healthchecks to pass before "done"
- want lessons from yesterday to survive into today

Skip it if you:

- only do one-off prompts (no edits, no commits)
- do not use Claude Code
- dislike *any* friction before agent edits
- want a prompt template, not a runtime gate

(The runtime gate is `hooks/gateguard.mjs`; full mechanics in [How enforcement works](#how-enforcement-works) below.)

---

## The problem this solves

You have used Claude Code (or any agentic coding tool) long enough to recognize the failure pattern. Matt Pocock's [Skills For Real Engineers](https://github.com/mattpocock/skills) names four root failure modes that account for nearly every "the agent didn't help" complaint; the 7 Laws of AI Agent Discipline catch those four at the tool-call boundary plus a fifth that only shows up across sessions.

| # | Failure mode | What you see | Which Law fires | What enforces it |
|---|---|---|---|---|
| 1 | **Misalignment** | The agent doesn't do what you want — invents requirements, reinvents helpers that already exist | Law 1 (Research) | [`grill-me`](skills/grill-me.md), [`grill-with-docs`](skills/grill-with-docs.md), [`gateguard`](skills/gateguard.md), [`workspace-surface-audit`](skills/workspace-surface-audit.md) |
| 2 | **No shared language** | The agent uses 20 words where 1 would do; jargon decoded fresh every session; variable names drift from domain terms | Law 2 (Plan), Law 7 (Learn) | [`grill-with-docs`](skills/grill-with-docs.md) (writes & maintains `CONTEXT.md`), [`token-budget-advisor`](skills/token-budget-advisor.md), [`strategic-compact`](skills/strategic-compact.md) |
| 3 | **No feedback loop** | The code doesn't work — agent claims "done" without running build, tests, or healthcheck | Law 4 (Verify) | [`tdd-workflow`](skills/tdd-workflow.md), [`verification-loop`](skills/verification-loop.md), [`deploy-receipt`](skills/deploy-receipt.md) |
| 4 | **Design rot** | Ball-of-mud accelerates — agent bundles three concerns into one PR, stacks untested changes, ignores prior architectural decisions | Law 2 (Plan), Law 3 (One Thing) | [`superpowers:writing-plans`](https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md), [`safety-guard`](skills/safety-guard.md), [`worktree-safety`](skills/worktree-safety.md), [`wild-risa-balance`](skills/wild-risa-balance.md) |
| 5 | **Forgotten lessons** | Next session starts from zero — prior corrections, decisions, instincts are lost; the same mistake repeats next week | Law 5 (Reflect), Law 7 (Learn) | [`handoff`](skills/handoff.md), [`para-memory-files`](skills/para-memory-files.md), Mulahazah instinct engine |

Three of those alignment + reflection skills (`grill-me`, `grill-with-docs`, `handoff`) are MIT-licensed ports from mattpocock/skills; the rest are continuous-improvement-native. Every failure mode has at least one runtime hook or model-side skill that catches it before it lands in the diff.

---

## Install

**If you don't know which to pick, use Beginner.** It is enough for ~90% of users and adds no Node or bash dependency.

### Beginner — inside Claude Code, two commands (plus one optional companion)

You get the 7 Laws skill, the hooks that enforce it, and the slash commands. Nothing else to install.

```bash
# Inside Claude Code (no shell needed)
/plugin marketplace add naimkatiman/continuous-improvement
/plugin install continuous-improvement@continuous-improvement
```

The doubled name is correct: it reads as `<plugin>@<marketplace>`.

**Optional companion (recommended).** The `/superpowers` dispatcher routes per-task to specialist skills (`writing-plans`, `test-driven-development`, `using-git-worktrees`, `dispatching-parallel-agents`, `finishing-a-development-branch`, etc.) shipped by Obra's `superpowers` plugin, which is vendored into this same marketplace as a pinned-SHA snapshot. Install it with one extra line:

```bash
/plugin install superpowers@continuous-improvement
```

Without the companion the dispatcher still works — every routing target has a concrete inline fallback — but specialist quality is fallback-quality, not dedicated-skill-quality.

Verify: run `/discipline` in Claude Code — you should see the 7 Laws card.
If the command is not recognized, restart your Claude Code session first; the marketplace did pick the plugin up but commands load on session start.

**Second-stage verify (proves the runtime gate is firing — i.e. `hooks/gateguard.mjs` is invoked — not just docs claiming it).** Ask Claude to write a throwaway file with no research first:

```
Edit a new file scratch.txt and put the word "hello" in it. Don't research anything first.
```

You should see Claude **blocked** by the bundled `gateguard` PreToolUse hook (`hooks/gateguard.mjs`) with a fact-list reason. That block is the proof the hook is wired and enforcing. If Claude writes the file with no pause, the hook did not load — see Troubleshooting below. (To also verify observation hooks, run `/dashboard` and confirm a non-zero `Total` under `Observations`.)

### How enforcement works

The 7 Laws are enforced at **two layers**:

- **Runtime layer (hooks).** `gateguard` ships as a PreToolUse hook (`hooks/gateguard.mjs`) that physically blocks Edit / Write / MultiEdit / destructive Bash on the first mutation per file until the agent presents the facts named in [skills/gateguard.md § Gate Types](skills/gateguard.md). Destructive Bash (`rm -rf`, `git push --force`, `--force-with-lease`, `DROP DATABASE`, Windows `Remove-Item -Recurse`, etc.) is gated on every call, not just first. Read-only and exploratory tools (Read, Grep, Glob, routine Bash like `git status`) bypass the gate. Per-session state at `~/.claude/instincts/<project-hash>/gateguard-session.json` caps cumulative clearances at 50 distinct files to bound stuck-loop damage.
- **Model layer (skills).** Once the runtime gate clears for a file, the rest of the discipline (`tdd-workflow`, `verification-loop`, `proceed-with-the-recommendation`, etc.) runs model-side — the agent reads each skill and applies it. `observe.sh` / `observe.mjs` records every tool call into the Mulahazah feed for instinct extraction; that surface is observational, not enforcement.

V1 honest limitations: the runtime gate is honor-system once the agent flips `_gateguard_facts_presented: true` (the hook can't verify the investigation actually happened); the state file is deletable and parallel hook invocations can race. Documented in `src/hooks/gateguard.mts` and `src/lib/gateguard-state.mts` headers.

### Expert — adds MCP server, observation hooks, and instinct packs

Pick this if you want the MCP tools (12 of them, including `ci_plan_init` / `ci_plan_status` for `task_plan.md`-style planning), the session hooks that feed Mulahazah, and starter packs.

Preconditions: Node 18 / 20 / 22, plus bash on Windows (Git Bash or WSL — `hooks/observe.sh` is a bash script and silently no-ops without it). **`jq` is no longer required**: as of v3.6.0, `observe.sh` prefers the Node observer (`bin/observe.mjs`) which writes the rich event schema natively without external dependencies. The bash thin-schema path is kept as a two-phase shim, so legacy installs that have not re-run `npx continuous-improvement install` since v3.5.x will still degrade silently without `jq` (`winget install jqlang.jq` on Windows, `brew install jq` on macOS, `apt install jq` on Debian/Ubuntu) — re-running the installer is the cleaner fix and removes the dependency entirely. See [CHANGELOG.md](CHANGELOG.md) `[3.6.0]` for the migration details.

```bash
npx continuous-improvement install --mode expert
npx continuous-improvement install --pack react   # optional: react | python | go | meta
# --pack seeds 5–10 starter instincts so suggestions appear in week 1 instead of week 4.
```

Verify: run `/dashboard` in Claude Code — you should see instinct health and observation count.
Update later with `/plugin marketplace update continuous-improvement` or by re-running the npx command.

### Troubleshooting install

Three failures account for nearly every install support thread. Try them in order:

| Symptom | Real cause | Fix |
|---|---|---|
| `/discipline` says "command not recognized" right after `/plugin install` | Slash commands load on session start; the marketplace did pick the plugin up | Quit and reopen Claude Code, then run `/discipline` again |
| Expert mode hooks never fire on Windows | `observe.sh` is bash; PowerShell silently no-ops on it | Install Git Bash (or WSL) and re-run `npx continuous-improvement install --mode expert` |
| `/plugin marketplace add ...` returned nothing visible | Marketplace add was silent; the plugin is not yet selected | Run `/plugin install continuous-improvement@continuous-improvement` to select and activate it |

If none of those apply, paste the output of `npx continuous-improvement install` into a GitHub issue — that surface logs every step.

### Operator modes

The framework has documented operator-level modes that change hook behavior without rebuilding the plugin. These are first-class — set them once in your shell rc and they persist across sessions.

| Env var | Effect | How to set |
|---|---|---|
| `CLAUDE_THREE_SECTION_CLOSE_DISABLED=1` | `three-section-close.mjs` short-circuits before any enforcement or telemetry. Use when end-of-turn reflection should run as internal thinking rather than visible "What has been done / What is next / Recommendation" sections. Public default unchanged — the rule still fires for everyone else. | bash/zsh: `export CLAUDE_THREE_SECTION_CLOSE_DISABLED=1` in `~/.bashrc` / `~/.zshrc`. PowerShell: `$env:CLAUDE_THREE_SECTION_CLOSE_DISABLED=1` (session) or `[Environment]::SetEnvironmentVariable('CLAUDE_THREE_SECTION_CLOSE_DISABLED','1','User')` (persistent). |

---

## The 7 Laws

| # | Law | Without it, agents... |
|---|-----|----------------------|
| 1 | **Research Before Executing** | reinvent what already exists |
| 2 | **Plan Is Sacred** | scope-creep and overbuild |
| 3 | **One Thing at a Time** | stack untested changes |
| 4 | **Verify Before Reporting** | lie about being "done" |
| 5 | **Reflect After Sessions** | repeat the same failures |
| 6 | **Iterate One Change** | debug 5 changes at once |
| 7 | **Learn From Every Session** | lose knowledge when context ends |

```
Research -> Plan -> Execute (one thing) -> Verify -> Reflect -> Learn -> Iterate
```

<p align="center">
  <img src="assets/diagram-7-laws-loop.jpg" alt="The 7 Laws of AI Agent Discipline — circular workflow loop" width="820" />
</p>

Full spec, reflection-block format, and anti-examples: [SKILL.md](SKILL.md). Full Law-to-tool alignment matrix: [CONTRIBUTING.md § Law Coverage Matrix](CONTRIBUTING.md#law-coverage-matrix).

---

## Mulahazah: auto-leveling learning

Hooks capture every tool call. After ~20 observations Claude analyzes patterns and creates **instincts** with confidence scores: silent below 0.5, suggested at 0.5–0.69, auto-applied at 0.7+. Corrections drop confidence by 0.1; unused instincts decay. Project-scoped; promoted to global after seen across 2+ projects. You configure nothing.

<p align="center">
  <img src="assets/diagram-mulahazah-learning.jpg" alt="Mulahazah pipeline" width="820" />
</p>

---

## Slash Commands

`/seven-laws` is the canonical reflect-and-learn command. `/continuous-improvement` is kept as an alias for backward compatibility — both run the same workflow.

```
/seven-laws                       Reflect, analyze, show status (canonical)
/continuous-improvement           Alias for /seven-laws (kept for backward compat)
/proceed-with-the-recommendation  Walk any agent's recommendation list top-to-bottom
/superpowers                      Law activator — route the task to the right specialist
/workspace-surface-audit          Audit repo + MCP + env, recommend high-value skills
/planning-with-files              Create task_plan.md, findings.md, progress.md
/grill-me                         Interview-mode alignment (one question at a time)
/grill-with-docs                  Grill-me with persistent outcomes — updates CONTEXT.md + ADRs inline
/handoff                          End-of-session compaction into mktemp brief for the next agent
/discipline                       Quick reference card of the 7 Laws
/dashboard                        Visual instinct health dashboard
/ralph                            Autonomous PRD story-by-story loop
/learn-eval                       Capture session patterns into new skills (expert)
/harvest                          Extract reusable patterns from session friction
/release-train                    Coordinate a multi-PR release sequence
/swarm                            Fan-out coordination across parallel sub-agents
```

All 16 ship in the marketplace bundle. The Beginner install gets all of them. In Expert (`npx`) mode, the installer mirrors the full set into `~/.claude/commands/` and additionally exposes the planning workflow through the MCP tools `ci_plan_init` (initialize `task_plan.md`, `findings.md`, `progress.md` in the project root) and `ci_plan_status` (summarize their current contents).

---

## Skills

The plugin ships **20 skills** — 1 core + 1 featured + 5 tier-1 + 10 tier-2 + 3 always-bundled. Beginner install gets tier-1, featured, and the always-bundled companion; Expert adds tier-2, the MCP server, and observation hooks. Full catalog with per-skill descriptions, Law tagging, and drop-in single-file install: [docs/skills.md](docs/skills.md). Adding a 21st skill: [CONTRIBUTING.md § Evolution — adding a new skill](CONTRIBUTING.md#evolution--adding-a-new-skill).

---

## GitHub Action: Transcript Linter

Lint agent behavior in CI. Detects skipped laws.

```yaml
- uses: naimkatiman/continuous-improvement@v3
  with:
    transcript-path: agent-log.jsonl
    strict: true
```

Catches writes without prior research (Law 1), too many edits without verification (Law 3), code changes without tests/builds (Law 4), too many files at once (Law 6). Run locally with `node bin/lint-transcript.mjs <file>`. The `@v3` floating-tag retarget policy lives in [CONTRIBUTING.md § Release](CONTRIBUTING.md#release).

---

## Uninstall

```bash
npx continuous-improvement install --uninstall
```

Removes skill, hooks, commands, MCP server. Learned instincts in `~/.claude/instincts/` are preserved — delete manually for a clean slate.

---

## The Brand Stack

One product, three names. Use the one that fits the audience:

| Layer | Name | When you say it |
|-------|------|-----------------|
| **Brand** | The 7 Laws of AI Agent Discipline | Tweets, talks, docs, "what is this" |
| **Engine** | Mulahazah | The auto-leveling instinct system inside it |
| **Package** | `continuous-improvement` | `npm install`, `/plugin install`, `settings.json` |

Every skill description leads with `Enforces Law N (...)` so the discipline tag shows up the moment the skill is loaded; the lint `verify:skill-law-tag` blocks any skill that drops the tag.

---

## In the wild

Workflows from this repo, applied to real open-source contributions:

### pm-skills (product-on-purpose, 189 stars, Apache 2.0)

[F-07 discover-market-sizing](https://github.com/product-on-purpose/pm-skills/pull/141) - new domain skill in the Discover phase covering TAM/SAM/SOM market sizing for the [pm-skills](https://github.com/product-on-purpose/pm-skills) library.

Authored end-to-end with `/superpowers` and `/proceed-with-the-recommendation`: surface audit before any code, brainstorm gate with WILD/RISA framing, branch isolation off the upstream fork, single-skill PR scope per the upstream maintainer's curated-contributions model, count cascade across 23 docs files, and 9 local validators green before push (`lint-skills-frontmatter`, `validate-agents-md`, `validate-commands`, `check-count-consistency`, `check-nav-completeness`, `check-generated-content-untouched`, `check-generated-freshness`, `validate-meeting-skills-family`, `validate-plugin-install`).

---

## More

- [QUICKSTART.md](QUICKSTART.md) — 2-minute setup
- [SKILL.md](SKILL.md) — full 7 Laws spec
- [docs/skills.md](docs/skills.md) — full 20-skill catalog
- [examples/](examples/) — bug fix, feature build, refactor walkthroughs
- [templates/insights-claude-md.md](templates/insights-claude-md.md) — paste-in CLAUDE.md blocks for verification discipline, environment notes, think-before-acting, and git/deploy workflow (sourced from the 28-day usage report)
- [CONTRIBUTING.md](CONTRIBUTING.md) — architecture, repo internals, adding a new skill
- [SECURITY.md](SECURITY.md)

MIT.
