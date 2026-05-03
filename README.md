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

## The Brand Stack

One product, three names. Use the one that fits the audience:

| Layer | Name | When you say it |
|-------|------|-----------------|
| **Brand** | The 7 Laws of AI Agent Discipline | Tweets, talks, docs, "what is this" |
| **Engine** | Mulahazah | The auto-leveling instinct system inside it |
| **Package** | `continuous-improvement` | npm install, `/plugin install`, settings.json |

Every skill description leads with `Enforces Law N (...)` so the discipline shows up the moment the skill is loaded. The lint `verify:skill-law-tag` blocks any skill that drops the tag.

---

## Install — pick one path

### Beginner — one command, one verify

You want the 7 Laws skill, the hooks, and the slash commands. That's it.

```bash
# Inside Claude Code
/plugin marketplace add naimkatiman/continuous-improvement
/plugin install continuous-improvement@continuous-improvement
```

Verify in Claude Code: `/discipline` (shows the 7 Laws card). Done.

### Expert — full stack with MCP, packs, and observation hooks

You want the MCP server (12 tools), the session-observation hooks for Mulahazah, and starter instinct packs.

```bash
# Requires Node 18/20/22 and bash (Git Bash or WSL on Windows)
npx continuous-improvement install --mode expert
npx continuous-improvement install --pack react   # or python | go
```

Verify in Claude Code: `/dashboard` (shows instinct health + observation count). Update later with `/plugin marketplace update continuous-improvement` or by re-running the npx command.

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

```
/seven-laws                Reflect, analyze, show status (brand-aligned name)
/continuous-improvement    Same workflow as /seven-laws (kept for backward compat)
/planning-with-files       Create task_plan.md, findings.md, progress.md
/discipline                Quick reference card of the 7 Laws
/dashboard                 Visual instinct health dashboard
```

In expert mode, the same planning workflow is also available programmatically through the MCP tools `ci_plan_init` (initialize `task_plan.md`, `findings.md`, `progress.md` in the project root) and `ci_plan_status` (summarize their current contents).

---

## Law Coverage

Every bundled skill, command, and hook enforces at least one of the 7 Laws. This is the alignment matrix — use it to pick the right tool for the discipline you want enforced.

| Law | Enforced by | Type |
|-----|-------------|------|
| **1 — Research Before Executing** | `gateguard`, `workspace-surface-audit` | skill, skill+cmd |
| **2 — Plan Is Sacred** | `wild-risa-balance`, `token-budget-advisor`, `/planning-with-files` | skill, skill, cmd |
| **3 — One Thing at a Time** | `tdd-workflow`, `safety-guard` | skill, skill |
| **4 — Verify Before Reporting** | `verification-loop`, `tdd-workflow`, `three-section-close.mjs` | skill, skill, hook |
| **5 — Reflect After Every Session** | `para-memory-files`, `strategic-compact`, `session.sh`, `/seven-laws`, `/dashboard` | skill, skill, hook, cmd, cmd |
| **6 — Iterate Means One Thing** | `ralph` | skill+cmd |
| **7 — Learn From Every Session** | `para-memory-files`, `/learn-eval`, `observe.sh`, `/seven-laws`, `/dashboard` | skill, cmd, hook, cmd, cmd |
| **All 7 (orchestrator)** | `proceed-with-the-recommendation` | skill+cmd |
| **Activator (dispatches Law-aligned skills)** | `superpowers` | skill+cmd |

Each skill's frontmatter `description:` leads with the Law it enforces, so the alignment shows up every time the skill is loaded — not just here.

### Operator opt-outs

| Env var | Effect |
|---|---|
| `CLAUDE_THREE_SECTION_CLOSE_DISABLED=1` | `three-section-close.mjs` short-circuits before any enforcement or telemetry. Use when reflection should run as internal thinking rather than visible output. Public default unchanged; per-operator only. |

---

## All 13 Skills

The plugin ships **1 core + 1 featured + 4 tier-1 + 4 tier-2 + 3 always-bundled = 13 skills**. Source-of-truth lives in [`skills/`](skills/) (one `.md` per skill); the plugin bundle at [`plugins/continuous-improvement/skills/`](plugins/continuous-improvement/skills/) is regenerated by `npm run build`.

| # | Skill | Tier | Law | What it does |
|---|-------|------|-----|--------------|
| 1 | [`continuous-improvement`](SKILL.md) | core | — | The 7 Laws spec itself (research → plan → execute → verify → reflect → learn → iterate) |
| 2 | [`proceed-with-the-recommendation`](skills/proceed-with-the-recommendation.md) ⭐ | featured | all 7 | Walks any agent's recommendation list top-to-bottom, routes each item, verifies per item, halts on `needs-approval` |
| 3 | [`gateguard`](skills/gateguard.md) | 1 | 1 | PreToolUse gate that blocks Edit/Write/destructive Bash until concrete investigation is presented |
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

> **Curated PM plugins moved.** Earlier versions of this marketplace bundled 8 product-management plugins by [Paweł Huryn](https://www.productcompass.pm). They are out of this listing as the project refocuses on the 7 Laws. Source files remain in [`plugins/`](plugins/) and may be removed in a follow-up.

---

## Evolution — adding a new skill seamlessly

**Yes. The repo is built to absorb new skills without rewiring anything.** Drop one `.md` file into [`skills/`](skills/), run `npm run build`, and the plugin bundle, manifests, and bundled-skills README all regenerate. Six lints (`verify:all`) block the merge if anything drifts.

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
| `verify:everything-mirror` | `everything/` reference docs drift from source |
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

Catches: writes without prior research (Law 1), too many edits without verification (Law 3), code changes without tests/builds (Law 4), too many files at once (Law 6). Run locally with `node bin/lint-transcript.mjs <file>`.

---

## Uninstall

```bash
npx continuous-improvement install --uninstall
```

Removes skill, hooks, commands, MCP server. Learned instincts in `~/.claude/instincts/` are preserved — delete manually for a clean slate.

---

## More

- [QUICKSTART.md](QUICKSTART.md) — 2-minute setup
- [SKILL.md](SKILL.md) — full 7 Laws spec
- [examples/](examples/) — bug fix, feature build, refactor walkthroughs
- [CONTRIBUTING.md](CONTRIBUTING.md) — architecture, repo internals
- [SECURITY.md](SECURITY.md)

MIT.
