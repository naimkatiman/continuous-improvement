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
  <b>New here?</b> → <a href="QUICKSTART.md">QUICKSTART.md</a> gets you working in 2 minutes.
</p>

---

## The Problem

AI agents are great at individual steps. They're terrible at **discipline**.

They skip research. They plan loosely. They declare "done" before verifying. They add features mid-task. They never reflect. Each session, they repeat the same mistakes.

**The 7 Laws** fix that — plus a **learning system** (Mulahazah) that builds instincts over time. No config, no daemon.

### Before vs After

<details>
<summary><b>Without continuous-improvement</b></summary>

```
You: Add rate limiting to the /api/users endpoint
Agent: I'll add rate limiting now.
       *writes express-rate-limit middleware*
       Done!

You: Did you check if we already have rate limiting?
Agent: ...there's already a rate limiter in middleware/rateLimit.ts.
       I've created a duplicate.

You: Did you test it?
Agent: ...the import path is wrong.
       *fixes import* Now it works!

You: You broke /api/auth — it shared that middleware.
```

4 corrections. Duplicate code. Broken endpoint. 15 minutes wasted.
</details>

<details>
<summary><b>With continuous-improvement</b></summary>

```
You: Add rate limiting to the /api/users endpoint

Agent: [Law 1: Research] middleware/rateLimit.ts already exists.
       express-rate-limit already in package.json.

       [Law 2: Plan]
       WILL: Extend existing rateLimit middleware to cover /api/users
       WILL NOT: Create new middleware or change /api/auth behavior
       VERIFY: Run tests + curl /api/users 101 times -> 429

       [Law 3: Execute one thing] Adding /api/users to the route list...

       [Law 4: Verify]
       OK npm test -- 47/47 passing
       OK curl test -- 429 after 100 requests
       OK /api/auth still works

       Done. One file changed: middleware/rateLimit.ts (+1 line).
```

Correct on first attempt. 2 minutes.
</details>

---

## Install

### Requirements

- **Node.js** 18, 20, or 22
- **bash** — for the observation hooks. macOS/Linux: built-in. Windows: install Git Bash or WSL and put `bash` on `PATH`.

### Beginner (default)

```bash
npx continuous-improvement install
```

Installs:
- The 7 Laws skill at `~/.claude/skills/continuous-improvement/SKILL.md`
- Observation hooks (`~/.claude/instincts/observe.sh`, patched into `settings.json`)
- Slash commands: `/continuous-improvement`, `/planning-with-files`, `/discipline`, `/dashboard`

After install, run `/discipline` or `/dashboard` in Claude Code to confirm it landed.

### Expert mode (full power)

```bash
npx continuous-improvement install --mode expert
```

Adds:
- **MCP server** with 12 tools (instinct management, planning files, import/export, dashboard, instinct packs)
- **Session hooks** (auto-load instincts at start, remind to reflect at end)

### Load a starter instinct pack

```bash
npx continuous-improvement install --pack react    # 8 React/Next.js instincts
npx continuous-improvement install --pack python   # 8 Python instincts
npx continuous-improvement install --pack go       # 8 Go instincts
```

---

## The 7 Laws of AI Agent Discipline

| # | Law | Without it, agents... |
|---|-----|----------------------|
| 1 | **Research Before Executing** | reinvent what already exists |
| 2 | **Plan Is Sacred** | scope-creep and overbuild |
| 3 | **One Thing at a Time** | stack untested changes |
| 4 | **Verify Before Reporting** | lie about being "done" |
| 5 | **Reflect After Sessions** | repeat the same failures |
| 6 | **Iterate One Change** | debug 5 changes at once |
| 7 | **Learn From Every Session** | lose knowledge when context ends |

### The Loop

```
Research -> Plan -> Execute (one thing) -> Verify -> Reflect -> Learn -> Iterate
```

<p align="center">
  <img src="assets/diagram-7-laws-loop.jpg" alt="The 7 Laws of AI Agent Discipline — circular workflow loop" width="820" />
</p>

If your agent is skipping a step, that's the step it needs most.

### The Reflection Block

Law 5 reflections follow a fixed shape. After non-trivial work, the agent emits:

```
## Reflection
- What worked:
- What failed:
- What I'd do differently:
- Rule to add:
- Iteration — Next best recommendations (ranked, top 3):
  1. <primary — strongest next core-development move>
  2. <alternative — different angle>
  3. <alternative — smaller/larger scope>
```

- **Rule to add** feeds Law 7 — it becomes an instinct with 0.6 starting confidence.
- **Iteration — Next best recommendations** is the Law 5 -> Law 6 handoff. Each entry is one concrete core-development move (build / fix / refactor / investigate). Format per item: `<verb> <object at path:line> (<why, one clause>)`. NOT git steps, NOT verification re-runs, NOT deploy actions — those belong in the end-of-run summary. Always exactly 3 distinct directions; if fewer real moves exist, fill remaining slots with `None — goal met from this angle.`

The full spec, including good and anti-examples, lives in [SKILL.md](SKILL.md#law-5-reflect-after-every-session). A repo-level contract test ([test/reflection-iteration-field.test.mjs](test/reflection-iteration-field.test.mjs)) keeps the format in sync across `SKILL.md`, `commands/continuous-improvement.md`, the plugin mirrors, and `skills/proceed-with-claude-recommendation.md`.

---

## Mulahazah: Auto-Leveling Learning

Mulahazah (Arabic: observation) makes your agent build **instincts** over time. It levels up automatically.

```
Install:       Hooks start capturing silently. You notice nothing.
~20 sessions:  Agent analyzes patterns, creates first instincts (silent)
~50 sessions:  Instincts cross 0.5 -> agent starts suggesting behaviors
~100 sessions: Instincts cross 0.7 -> agent auto-applies what it learned
```

<p align="center">
  <img src="assets/diagram-mulahazah-learning.jpg" alt="Mulahazah pipeline — hooks capture, inline analysis, instinct store, confidence gate" width="820" />
</p>

### How it works

1. **Hooks capture every tool call** — JSONL observations, <50ms, never blocks the session.
2. **Analysis runs inline** — when 20+ observations accumulate, Claude analyzes them at session start. No background daemon.
3. **Instincts carry confidence** — 0.3–0.9 scale:
   - **Silent** (< 0.5) — stored, not surfaced
   - **Suggest** (0.5–0.69) — mentioned inline when relevant
   - **Auto-apply** (0.7+) — applied automatically
4. **Self-correcting** — user corrections drop confidence by 0.1. Unused instincts decay.
5. **Project-scoped** — per-project by default, promoted to global when seen across 2+ projects.

### Slash commands

```
/continuous-improvement    # Reflect, analyze, show status
/planning-with-files       # Create or review task_plan.md, findings.md, progress.md
/discipline                # Quick reference card of the 7 Laws
/dashboard                 # Visual instinct health dashboard
```

### Planning With Files (opt-in)

When a task needs durable working memory on disk, run `/planning-with-files`. It creates `task_plan.md`, `findings.md`, and `progress.md` in the project root. Inactive unless you ask for it.

In expert mode, the same workflow is exposed via `ci_plan_init` and `ci_plan_status` MCP tools.

---

## GitHub Action: Agent Transcript Linter

Lint your agent's behavior in CI. Detects when the agent skipped a law.

```yaml
- uses: naimkatiman/continuous-improvement@v3
  with:
    transcript-path: agent-log.jsonl
    strict: true
```

Detects:
- **Law 1** — writes without prior research
- **Law 3** — too many consecutive edits without verification
- **Law 4** — code changes without running tests/builds
- **Law 6** — too many files modified at once

Output: discipline score (0–100) + violation report.

```bash
# Run locally
node bin/lint-transcript.mjs observations.jsonl
cat transcript.jsonl | node bin/lint-transcript.mjs --stdin --json
```

---

## Beginner vs Expert

| Feature | Beginner (default) | Expert |
|---------|-------------------|--------|
| Observation hooks | Yes | Yes |
| Slash commands | Yes | Yes |
| Auto-leveling instincts | Yes | Yes |
| MCP server | - | Yes |
| 12 MCP tools (planning, import/export, dashboard, packs) | - | Yes |
| Session hooks (auto-load, auto-reflect) | - | Yes |

<details>
<summary><b>MCP tools (12 — expert mode)</b></summary>

| Tool | Description |
|------|-------------|
| `ci_status` | Current level, instinct count, observation count |
| `ci_instincts` | List learned instincts with confidence levels |
| `ci_reflect` | Generate structured session reflection |
| `ci_reinforce` | Accept/reject instinct suggestions |
| `ci_create_instinct` | Manually create instincts |
| `ci_observations` | View raw tool call observations |
| `ci_export` | Export instincts as JSON |
| `ci_import` | Import instincts from JSON |
| `ci_plan_init` | Create project-root planning files |
| `ci_plan_status` | Summarize planning files |
| `ci_dashboard` | Visual dashboard with confidence distribution |
| `ci_load_pack` | Load starter instinct packs |

</details>

---

## Files

```
SKILL.md                # The 7 Laws + instinct behavior
hooks/                  # observe.sh, session.sh
commands/               # slash commands
plugins/                # generated plugin bundle for Claude Code marketplace
.claude-plugin/         # repo-root marketplace.json
instinct-packs/         # React, Python, Go starter packs
templates/              # planning-with-files templates
```

Contributor internals (`src/`, `bin/`, `test/`) are documented in [CONTRIBUTING.md](CONTRIBUTING.md#architecture).

### What gets installed where

**Beginner:**
```
~/.claude/skills/continuous-improvement/SKILL.md
~/.claude/commands/{continuous-improvement,planning-with-files,discipline,dashboard}.md
~/.claude/instincts/observe.sh
~/.claude/instincts/<project-hash>/{project.json,observations.jsonl,*.yaml}
~/.claude/settings.json (PreToolUse + PostToolUse hooks patched)
```

**Expert** adds:
```
~/.claude/instincts/session.sh
~/.claude/settings.json (+ MCP server + SessionStart/SessionEnd hooks)
```

When you run `/planning-with-files`, three files are created in the project root:
```
task_plan.md      # Phases, status, decisions
findings.md       # Research notes
progress.md       # Session log
```

---

## Install from GitHub (marketplace)

```bash
/plugin marketplace add naimkatiman/continuous-improvement
/plugin install continuous-improvement@continuous-improvement-dev
```

---

## Red Flags

If the agent says any of these, it's skipping a law:

- "I'll just quickly..." -> Law 3 violation
- "This should work..." -> Law 4 violation
- "I already know how to..." -> Law 1 violation
- "Let me also add..." -> Law 6 violation
- "I'll remember this..." -> Law 7 violation

---

## Uninstall

```bash
npx continuous-improvement install --uninstall
```

Removes the skill, hooks, commands, and MCP server. Learned instincts in `~/.claude/instincts/` are preserved — delete that directory manually if you want a clean slate.

---

## Examples

See [`examples/`](examples/):

- [Bug Fix](examples/01-bug-fix.md) — Double submit bug: 4 rounds without -> 1 round with
- [Feature Build](examples/02-feature-build.md) — Pagination: 3 rewrites without -> correct first attempt
- [Refactor](examples/03-refactor.md) — SDK migration: cascading failures without -> zero regressions

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and PRs welcome.

## Security

See [SECURITY.md](SECURITY.md).

## License

MIT
