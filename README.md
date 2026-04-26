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

Requires Node 18/20/22 and `bash` (Git Bash or WSL on Windows).

```bash
# Beginner — 7 Laws skill, hooks, slash commands
npx continuous-improvement install

# Expert — adds MCP server (12 tools) + session hooks
npx continuous-improvement install --mode expert

# Optional starter packs
npx continuous-improvement install --pack react|python|go
```

Verify with `/discipline` or `/dashboard` in Claude Code.

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

---

## Bundled Skills & Plugins

The default install only deploys the core 7 Laws skill. Everything below is opt-in — pick what you want.

### Companion skills ([`skills/`](skills/))

Drop-in single-file skills, copy to `~/.claude/skills/<name>/SKILL.md`.

| Skill | What it does | Source |
|-------|--------------|--------|
| `ralph` | Autonomous loop that executes a PRD story-by-story with quality checks between iterations | [snarktank/ralph](https://github.com/snarktank/ralph) |
| `superpowers` | Activates task-appropriate skills automatically (brainstorming, git-worktrees, TDD, code review, etc.) | [obra/superpowers](https://github.com/obra/superpowers) |
| `workspace-surface-audit` | Audits the active repo, MCP servers, plugins, and env, then recommends high-value skills/workflows | ECC |
| `proceed-with-claude-recommendation` | Walks a Claude recommendation list top-to-bottom under the 7 Laws — routes each item to the right specialist skill, verifies per item, stops at approval-needed items | @naimkatiman |

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
