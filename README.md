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

## Install

### Option A — Claude Code plugin (recommended, 2 commands)

Run inside the Claude Code CLI:

```bash
/plugin marketplace add naimkatiman/continuous-improvement
/plugin install continuous-improvement@continuous-improvement
```

Update later with `/plugin marketplace update continuous-improvement`. Browse the other 8 PM plugins with `/plugin` (interactive picker) or see the [full list below](#plugin-marketplace-plugins).

### Option B — npm CLI installer

Requires Node 18/20/22 and `bash` (Git Bash or WSL on Windows).

```bash
# Beginner — 7 Laws skill, hooks, slash commands
npx continuous-improvement install

# Expert — adds MCP server (12 tools) + session hooks
npx continuous-improvement install --mode expert

# Optional starter packs
npx continuous-improvement install --pack react|python|go
```

Verify either path with `/discipline` or `/dashboard` in Claude Code.

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
/continuous-improvement    Reflect, analyze, show status
/planning-with-files       Create task_plan.md, findings.md, progress.md
/discipline                Quick reference card of the 7 Laws
/dashboard                 Visual instinct health dashboard
```

In expert mode, the same planning workflow is also available programmatically through the MCP tools `ci_plan_init` (initialize `task_plan.md`, `findings.md`, `progress.md` in the project root) and `ci_plan_status` (summarize their current contents).

---

## Bundled Skills & Plugins

The default install only deploys the core 7 Laws skill. Everything below is opt-in — pick what you want.

### Featured companion — the recommended pairing for the 7 Laws

⭐ **`proceed-with-claude-recommendation`** is the execution arm of this repo. When you say "do all of it" / "proceed with your recommendation" / "yes do it", this skill walks the list top-to-bottom under the 7 Laws, routes each item to the right specialist (`superpowers:*`, `ralph`, `workspace-surface-audit`, `simplify`, `security-review`, `schedule`, `loop`), falls back to inline behavior when a specialist isn't installed, verifies per item, and **halts on `needs-approval`** instead of barreling through. If you adopt one companion alongside the core skill, adopt this one — it's purpose-built to operationalize the laws end-to-end.

Install it on its own:

```bash
SKILL=proceed-with-claude-recommendation
mkdir -p ~/.claude/skills/$SKILL
curl -L https://raw.githubusercontent.com/naimkatiman/continuous-improvement/main/skills/$SKILL.md \
  -o ~/.claude/skills/$SKILL/SKILL.md
```

…or get it (and the rest below) by installing the `continuous-improvement` plugin from the marketplace.

### Tier 1 — recommended pairing for **beginner** install

These add concrete enforcement to the 7 Laws and ship in every plugin install.

| Skill | What it does | Pairs with |
|-------|--------------|------------|
| `para-memory-files` | File-based persistent memory using PARA (Projects/Areas/Resources/Archives) for cross-session context | Law 5 + Law 7 |
| `verification-loop` | Six-phase verification (build, types, lint, tests, security, diff) with PASS/FAIL report | Law 4 |
| `gateguard` | PreToolUse fact-forcing gate that blocks Edit/Write/destructive Bash until concrete investigation is presented | Law 1 + Law 3 |
| `tdd-workflow` | RED→GREEN→REFACTOR enforcement with 80%+ coverage gate across unit/integration/E2E | Law 3 + Law 4 |

### Tier 2 — additional skills for **expert** install

Layer on top of tier-1 for autonomous-mode safety, response-depth control, and context-window discipline.

| Skill | What it does |
|-------|--------------|
| `safety-guard` | Three-mode runtime guard (careful/freeze/guard) that blocks destructive commands and locks edits to a directory |
| `token-budget-advisor` | Heuristic input/output token estimator that offers 25%/50%/75%/100% depth choices before answering |
| `strategic-compact` | PreToolUse hook that suggests `/compact` at logical phase boundaries instead of arbitrary auto-compaction |

The `/learn-eval` slash command also ships with the expert install: extract a session pattern, run a checklist quality gate, and decide global-vs-project save location before writing any skill file.

### Always-bundled companion skills ([`skills/`](skills/))

Drop-in single-file skills, copy to `~/.claude/skills/<name>/SKILL.md`.

| Skill | What it does | Source |
|-------|--------------|--------|
| `ralph` | Autonomous loop that executes a PRD story-by-story with quality checks between iterations | [snarktank/ralph](https://github.com/snarktank/ralph) |
| `superpowers` | Activates task-appropriate skills automatically (brainstorming, git-worktrees, TDD, code review, etc.) | [obra/superpowers](https://github.com/obra/superpowers) |
| `workspace-surface-audit` | Audits the active repo, MCP servers, plugins, and env, then recommends high-value skills/workflows | ECC |

### Plugin marketplace ([`plugins/`](plugins/))

Install via `/plugin marketplace add naimkatiman/continuous-improvement` then `/plugin install <name>@continuous-improvement-dev`.

| Plugin | Skills | Focus |
|--------|--------|-------|
| `continuous-improvement` | 4 | The 7 Laws + Mulahazah (this repo's core plugin bundle) |
| `pm-product-discovery` | 12 | Ideation, experiments, assumption testing, feature prioritization, interview synthesis |
| `pm-product-strategy` | 12 | Vision, lean canvas, business model, SWOT, PESTLE, Ansoff, Porter's Five Forces, monetization |
| `pm-execution` | 15 | PRDs, OKRs, roadmaps, sprints, pre-mortems, user stories, retros, release notes |
| `pm-market-research` | 7 | Personas, market segments, market sizing, journey maps, sentiment, competitor analysis |
| `pm-data-analytics` | 3 | SQL query generation, cohort analysis, A/B test analysis |
| `pm-go-to-market` | 6 | GTM strategy, growth loops, GTM motions, beachhead segments, ICP, battlecards |
| `pm-marketing-growth` | 5 | Marketing ideas, value props, North Star metrics, product naming, positioning |
| `pm-toolkit` | 4 | Resume review, NDA drafting, privacy policy, grammar check |

PM plugins by [Paweł Huryn](https://www.productcompass.pm).

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
