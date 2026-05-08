<p align="center">
  <img src="assets/combined.gif" alt="Before vs After — The 7 Laws of AI Agent Discipline" width="700" />
</p>

<h1 align="center">The 7 Laws of AI Agent Discipline</h1>

<p align="center">
  <b>Stop your Claude Code agent from skipping steps, guessing, and declaring "done" without verifying.</b>
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

---

## The problem this solves

You have used Claude Code (or any agentic coding tool) long enough to recognize the failure pattern.

| You ask the agent to... | What actually happens |
|---|---|
| Add a feature | It edits five files, never runs the build, says "done" |
| Fix a bug | It reinvents a helper that already exists in the repo |
| Refactor a module | It bundles three unrelated changes into one commit |
| Pick up where last session ended | It re-explores from zero — the prior session's lessons are gone |
| Verify the change works | It claims "this should work" without running a single test |

Every one of those failures is the agent skipping a step a disciplined engineer would not skip. The 7 Laws of AI Agent Discipline names each step, gives it a hook or a skill that enforces it, and feeds the captured patterns back into the agent so the same mistake gets harder to repeat next session.

## What you get

- **A 7-step discipline** the agent must follow every task — research → plan → execute one thing → verify → reflect → learn → iterate. Each Law has at least one skill or hook that enforces it.
- **13 bundled skills** that turn the Laws from a doc into agent behavior — `gateguard` prompts the agent to investigate before Edit/Write/destructive Bash, `tdd-workflow` enforces RED → GREEN → REFACTOR, `verification-loop` runs build/types/tests/security before "done", `proceed-with-the-recommendation` walks any agent's recommendation list top-to-bottom with per-item verification. These run as model-side discipline; the agent reads each skill and applies it. The session and observation hooks (`hooks/`) wire the learning loop, not a runtime tool-call block — see [§ A note on enforcement](#a-note-on-enforcement).
- **Mulahazah, the auto-leveling instinct engine** — hooks capture every tool call; after ~20 observations the agent analyzes patterns and creates instincts with confidence scores. Suggestions appear at 0.5+, auto-apply at 0.7+, decay when ignored. Project-scoped, promote to global after 2+ projects. You configure nothing.
- **A GitHub Action transcript linter** that catches skipped Laws in CI — writes without prior research, edits without verification, too many files at once.
- **Two install paths** — Beginner is two slash commands inside Claude Code (no Node, no bash, ~90% of users). Expert adds the MCP server, observation hooks, instinct packs, and the linter.

The whole thing is MIT, free, and lives in this one repo. No service, no account, no telemetry leaves your machine.

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

**Second-stage verify (proves the bundle dropped beyond just the slash command).** Run `/dashboard` — the rendered card with `Level: CAPTURE` and observation counters confirms the skills + observation hooks landed.

### A note on enforcement

The 7 Laws are enforced **at the model layer, not the runtime layer**. When you ask Claude to write a file with no research, `gateguard` prompts Claude to investigate first — but this is model-side discipline (the model reads the skill and chooses to comply), not a PreToolUse hook that physically refuses the tool call. The `hooks/` directory wires observation (`observe.sh`/`observe.mjs`) and end-of-turn three-section close (`three-section-close.mjs`); neither blocks an Edit. A roadmap item tracks adding a true runtime gate — see the open issue linked in [skills/gateguard.md](skills/gateguard.md). Until then, value comes from the agent reading the Laws as part of its loaded context.

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

Full spec, reflection-block format, and anti-examples: [SKILL.md](SKILL.md).

---

## Mulahazah: Auto-Leveling Learning

Hooks capture every tool call. After ~20 observations, Claude analyzes patterns and creates **instincts** with confidence scores:

- **< 0.5** silent (stored, not surfaced)
- **0.5–0.69** suggested inline when relevant
- **0.7+** auto-applied
- User corrections drop confidence by 0.1; unused instincts decay
- Project-scoped, promoted to global after seen across 2+ projects

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
/discipline                       Quick reference card of the 7 Laws
/dashboard                        Visual instinct health dashboard
/ralph                            Autonomous PRD story-by-story loop
/learn-eval                       Capture session patterns into new skills (expert)
/harvest                          Extract reusable patterns from session friction
/release-train                    Coordinate a multi-PR release sequence
/swarm                            Fan-out coordination across parallel sub-agents
```

All 13 ship in the marketplace bundle. The Beginner install gets all of them. In Expert (`npx`) mode, the installer mirrors the full set into `~/.claude/commands/` and additionally exposes the planning workflow through the MCP tools `ci_plan_init` (initialize `task_plan.md`, `findings.md`, `progress.md` in the project root) and `ci_plan_status` (summarize their current contents).

---

## Law Coverage

Every bundled skill, command, and hook enforces at least one of the 7 Laws. The full Law-to-tool alignment matrix lives in [CONTRIBUTING.md → Law Coverage Matrix](CONTRIBUTING.md#law-coverage-matrix); each skill's `description:` also leads with `Enforces Law N (...)` so the tag shows up every time the skill is loaded. Operator-level mode toggles live in the **Operator modes** section above the 7 Laws, alongside install.

---

## All 13 Skills

The plugin ships **1 core + 1 featured + 4 tier-1 + 4 tier-2 + 3 always-bundled = 13 skills**. Source-of-truth lives in [`skills/`](skills/) (one `.md` per skill); the plugin bundle at [`plugins/continuous-improvement/skills/`](plugins/continuous-improvement/skills/) is regenerated by `npm run build`.

<details>
<summary>Show the full skill table (13 rows)</summary>

| # | Skill | Tier | Law | What it does |
|---|-------|------|-----|--------------|
| 1 | [`continuous-improvement`](SKILL.md) | core | — | The 7 Laws spec itself (research → plan → execute → verify → reflect → learn → iterate) |
| 2 | [`proceed-with-the-recommendation`](skills/proceed-with-the-recommendation.md) ⭐ | featured | all 7 | Walks any agent's recommendation list top-to-bottom, routes each item, verifies per item, halts on `needs-approval` |
| 3 | [`gateguard`](skills/gateguard.md) | 1 | 1 | Skill that prompts the agent to investigate (importers, schemas, user instruction) before Edit/Write/destructive Bash. Runtime PreToolUse hook is a roadmap item, not yet bundled. |
| 4 | [`para-memory-files`](skills/para-memory-files.md) | 1 | 5 + 7 | Durable file-based memory using PARA (Projects/Areas/Resources/Archives) for cross-session context |
| 5 | [`tdd-workflow`](skills/tdd-workflow.md) | 1 | 3 + 4 | RED → GREEN → REFACTOR enforcement with 80%+ coverage across unit/integration/E2E |
| 6 | [`verification-loop`](skills/verification-loop.md) | 1 | 4 | Six-phase verification (build, types, lint, tests, security, diff) with PASS/FAIL report |
| 7 | [`safety-guard`](skills/safety-guard.md) | 2 | 3 | Three-mode runtime guard (careful/freeze/guard) that blocks destructive commands and locks edits to a directory |
| 8 | [`strategic-compact`](skills/strategic-compact.md) | 2 | 5 | Suggests `/compact` at logical phase boundaries instead of arbitrary auto-compaction |
| 9 | [`token-budget-advisor`](skills/token-budget-advisor.md) | 2 | 2 | Token estimator that offers 25/50/75/100% depth choices before answering |
| 10 | [`wild-risa-balance`](skills/wild-risa-balance.md) | 2 | 2 | Pairs WILD (bold) generation with RISA (safe) execution; splits recommendation lists into pilots above a baseline |
| 11 | [`ralph`](skills/ralph.md) | companion | 6 | Autonomous loop that executes a PRD story-by-story with quality checks between iterations |
| 12 | [`superpowers`](skills/superpowers.md) | companion | activator | Law activator — routes tasks to the correct Law-aligned specialist so the right discipline fires automatically |
| 13 | [`workspace-surface-audit`](skills/workspace-surface-audit.md) | companion | 1 | Audits the active repo, MCP servers, plugins, env, then recommends high-value skills/workflows |

</details>

The orchestrator skill `proceed-with-the-recommendation` also routes to optional companion skills from external plugins (e.g. `obra/superpowers`, `code-review`, `frontend-design`, `commit-commands`). Each routing target has an inline fallback in the orchestrator, so the plugin works on a clean install with nothing else present — install the dedicated companion only when you want a specialist over the fallback. Full target list with source-plugin and risk-if-absent: [`plugins/continuous-improvement/README.md` § Required vs Optional companions](plugins/continuous-improvement/README.md#required-vs-optional-companions).

### Beginner gets — by default

Tier 1 + featured + companion. Auto-installed when you run the plugin install commands above. No flags, no choices.

### Expert gets — additionally

Tier 2 (`safety-guard`, `strategic-compact`, `token-budget-advisor`, `wild-risa-balance`), the MCP server (12 tools incl. `ci_plan_init`/`ci_plan_status`), session-observation hooks for Mulahazah, and `/learn-eval` for capturing session patterns into new skills.

### Drop-in single-file install

Want one skill without the whole plugin? Copy the `.md` file straight into `~/.claude/skills/<name>/SKILL.md`:

```bash
SKILL=proceed-with-the-recommendation
mkdir -p ~/.claude/skills/$SKILL
curl -L https://raw.githubusercontent.com/naimkatiman/continuous-improvement/main/skills/$SKILL.md \
  -o ~/.claude/skills/$SKILL/SKILL.md
```

---

## Evolution — adding a new skill

Drop one `.md` file into [`skills/`](skills/), run `npm run build`, and the plugin bundle, manifests, and bundled-skills README regenerate from that source. Seven lints (`verify:all` + `verify:generated`) block the merge if anything drifts.

### The 5-step recipe

```bash
# 1. Create the source file
touch skills/<your-skill>.md
```

```yaml
# 2. Frontmatter must declare name + tier + Law-tagged description
---
name: <your-skill>
tier: "1"                # core | featured | "1" | "2" | companion
description: "Enforces Law N (<law name>) of the 7 Laws of AI Agent Discipline. <what it does>."
---
```

```bash
# 3. Regenerate the bundle (also writes plugins/.../skills/<your-skill>/SKILL.md
#    + the bundled-skills README, which is itself generator-output)
npm run build

# 4. Run all 6 verify lints — must all pass
npm run verify:all

# 5. Commit one concern at a time (per CLAUDE.md): the source skill alone first,
#    then any wiring (hooks, commands, Law-coverage table updates) as separate commits
git add skills/<your-skill>.md plugins/continuous-improvement/skills/<your-skill>/
git commit -m "feat(skills): add <your-skill> for Law N enforcement"
```

### What the build does for you automatically

- **Mirrors source → bundle** (`bin/generate-plugin-manifests.mjs`): copies `skills/<name>.md` to `plugins/continuous-improvement/skills/<name>/SKILL.md`
- **Regenerates plugin manifests** with the new skill listed in tier order
- **Re-renders** [`plugins/continuous-improvement/skills/README.md`](plugins/continuous-improvement/skills/README.md) (do not edit by hand — generator output)

### What the lints enforce so you cannot ship a half-wired skill

| Lint | Blocks |
|------|--------|
| `verify:skill-mirror` | source `skills/<name>.md` and `plugins/.../<name>/SKILL.md` are out of sync |
| `verify:skill-tiers` | skill has missing or unrecognized `tier:` value |
| `verify:skill-law-tag` | skill description does not start with `Enforces Law N` (or `Law activator`, or `all 7 Laws`) |
| `verify:docs-substrings` | README/QUICKSTART references a removed/renamed skill |
| `verify:everything-mirror` | non-skill files in `plugins/continuous-improvement/` drift from their root-level source |
| `verify:routing-targets` | `proceed-with-the-recommendation` names a routing target that is neither bundled nor declared in `optional-companions.json` |
| `verify:generated` | `npm run build` was not re-run after a source change |

### When to fold a new external skill into the 7 Laws

A new skill is a fit if it provably enforces (or is a routed activator for) at least one of the 7 Laws. The Law-tag lint will refuse it otherwise. If it sits outside the laws (a domain skill — e.g. SQL optimization), keep it as an external plugin. The 7 Laws plugin stays disciplined about scope; that is the point.

### What is *not* automated (the honest limits)

- The Law-coverage matrix above (`## Law Coverage`) is hand-maintained — add your new skill to the right Law row when you ship it.
- The "All 13 Skills" count in the section header is a literal — bump it when N changes.
- Promotion between tiers (e.g. `2` → `1` after it proves itself) is a manual edit to the frontmatter `tier:` field, by design — the maintainer should make that call deliberately.

---

## GitHub Action: Transcript Linter

Lint agent behavior in CI. Detects skipped laws.

```yaml
- uses: naimkatiman/continuous-improvement@v3
  with:
    transcript-path: agent-log.jsonl
    strict: true
```

`@v3` is a floating major-version tag that retargets on every `v3.x.y` release. Pin to a specific tag (`@v3.7.0`) if you need byte-reproducible CI; use `@v3` to ride patch and minor bumps automatically. See [CONTRIBUTING.md § Release](CONTRIBUTING.md#release) for the retarget policy.

Catches: writes without prior research (Law 1), too many edits without verification (Law 3), code changes without tests/builds (Law 4), too many files at once (Law 6). Run locally with `node bin/lint-transcript.mjs <file>`.

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
- [examples/](examples/) — bug fix, feature build, refactor walkthroughs
- [CONTRIBUTING.md](CONTRIBUTING.md) — architecture, repo internals
- [SECURITY.md](SECURITY.md)

MIT.
