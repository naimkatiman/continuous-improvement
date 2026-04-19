<p align="center">
  <img src="assets/combined.gif" alt="Before vs After — The 7 Laws of AI Agent Discipline" width="700" />
</p>

<h1 align="center">The 7 Laws of AI Agent Discipline</h1>

<p align="center">
  <b>Stop your AI agent from skipping steps, guessing, and declaring "done" without verifying.</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/continuous-improvement"><img src="https://img.shields.io/npm/v/continuous-improvement" alt="npm"></a>
  <a href="https://www.npmjs.com/package/continuous-improvement"><img src="https://img.shields.io/npm/dm/continuous-improvement" alt="downloads"></a>
  <a href="https://github.com/naimkatiman/continuous-improvement/stargazers"><img src="https://img.shields.io/github/stars/naimkatiman/continuous-improvement?style=social" alt="stars"></a>
  <a href="https://github.com/naimkatiman/continuous-improvement/network/members"><img src="https://img.shields.io/github/forks/naimkatiman/continuous-improvement?style=social" alt="forks"></a>
  <a href="https://github.com/naimkatiman/continuous-improvement/graphs/contributors"><img src="https://img.shields.io/github/contributors/naimkatiman/continuous-improvement" alt="contributors"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license"></a>
  <a href="test/"><img src="https://img.shields.io/badge/tests-passing-brightgreen" alt="tests"></a>
</p>

<p align="center">
  <a href="https://docs.anthropic.com/en/docs/claude-code"><img src="https://img.shields.io/badge/Claude%20Code-skill-blueviolet" alt="Claude Code"></a>
  <a href="https://cursor.sh"><img src="https://img.shields.io/badge/Cursor-compatible-blue" alt="Cursor"></a>
  <a href="https://openai.com/codex"><img src="https://img.shields.io/badge/Codex-compatible-blue" alt="Codex"></a>
  <a href="https://ai.google.dev/gemini-api/docs/gemini-cli"><img src="https://img.shields.io/badge/Gemini%20CLI-compatible-blue" alt="Gemini CLI"></a>
  <a href="https://github.com/naimkatiman/continuous-improvement/actions"><img src="https://img.shields.io/github/actions/workflow/status/naimkatiman/continuous-improvement/ci.yml?label=CI" alt="CI"></a>
</p>

<p align="center">
  <a href="docs/README.zh-CN.md">简体中文</a> |
  <a href="docs/README.ja.md">日本語</a>
</p>

---

## The Problem

AI agents are great at individual steps. They're terrible at **discipline**.

They skip research. They plan loosely. They declare "done" before verifying. They add features mid-task. They never reflect. Each session, they repeat the same mistakes.

**The 7 Laws** fix that — plus a **learning system** (Mulahazah) that builds instincts over time. No config, no daemon, no manual setup.

### Before vs After

<details>
<summary><b>Without continuous-improvement</b> — agent skips research, declares "done" without verifying</summary>

```
You: Add rate limiting to the /api/users endpoint

Agent: I'll add rate limiting now.
       *writes express-rate-limit middleware*
       Done! I've added rate limiting to the /api/users endpoint.

You: Did you check if we already have rate limiting somewhere?
Agent: Let me check... oh, there's already a rate limiter in middleware/rateLimit.ts.
       I've created a duplicate. Let me fix that.

You: Did you test it?
Agent: Let me run the tests... they're failing. The import path is wrong.
       *fixes import*
       Now it works!

You: You also broke the /api/auth endpoint — it was sharing that middleware.
Agent: I see. Let me fix that too...
```

**Result:** 4 back-and-forth corrections. Duplicate code. Broken endpoint. 15 minutes wasted.
</details>

<details>
<summary><b>With continuous-improvement</b> — agent follows the 7 laws</summary>

```
You: Add rate limiting to the /api/users endpoint

Agent: **[Law 1: Research]** Searching for existing rate limiting...
       Found: middleware/rateLimit.ts — already applies to /api/auth.
       Found: express-rate-limit already in package.json.

       **[Law 2: Plan]**
       WILL: Extend existing rateLimit middleware to cover /api/users
       WILL NOT: Create new middleware or change existing /api/auth behavior
       VERIFY: Run tests + curl /api/users 101 times to confirm 429 response

       **[Law 3: Execute one thing]** Adding /api/users to the route list
       in middleware/rateLimit.ts...

       **[Law 4: Verify]**
       ✓ npm test — 47/47 passing
       ✓ curl test — 429 after 100 requests
       ✓ /api/auth still works — 200 OK

       Done. Extended existing rate limiter to cover /api/users.
       One file changed: middleware/rateLimit.ts (+1 line).
```

**Result:** Correct on first attempt. No duplicate code. No broken endpoints. 2 minutes.
</details>

---

## Install

### Platform requirements

- **Node.js** 18, 20, or 22
- **bash** — required for the observation hooks (`hooks/observe.sh`, `hooks/session.sh`). Claude Code on macOS/Linux already uses bash. On **Windows**, install Git Bash or WSL and make sure `bash` is on `PATH`. If you don't have bash, you can still use MCP mode (`--mode mcp`) or paste `SKILL.md` directly into your agent — both paths are bash-free.

### Beginner (default) — just hooks, no setup needed

```bash
npx continuous-improvement install
```

That's it. For Claude Code, this installs:
- Observation hooks (captures every tool call, <50ms, jq optional)
- `/continuous-improvement`, `/planning-with-files`, `/discipline`, and `/dashboard` commands
- Auto-leveling instinct system

### Expert — full power with MCP server

```bash
npx continuous-improvement install --mode expert
```

Everything in beginner plus:
- **MCP server** with 12 tools (instinct management, planning files, import/export, dashboard, instinct packs)
- **Session hooks** (auto-load instincts at start, remind to reflect at end)
- Works with Claude Code, Claude Desktop, and any MCP client

### MCP only — for non-Claude editors

```bash
npx continuous-improvement install --mode mcp
```

Registers the MCP server without hooks — for Cursor, Zed, Windsurf, VS Code, or any editor that supports MCP.

### Load a starter instinct pack

```bash
npx continuous-improvement install --pack react    # React/Next.js instincts
npx continuous-improvement install --pack python   # Python best practices
npx continuous-improvement install --pack go       # Go idioms
```

### Install to a specific target

```bash
npx continuous-improvement install --target claude    # Claude Code + Mulahazah
npx continuous-improvement install --target openclaw  # OpenClaw (skill only)
npx continuous-improvement install --target cursor    # Cursor (skill only)
npx continuous-improvement install --target all       # All targets
```

### Manual install

```bash
mkdir -p ~/.claude/skills/continuous-improvement && \
curl -fsSL -o ~/.claude/skills/continuous-improvement/SKILL.md \
  https://raw.githubusercontent.com/naimkatiman/continuous-improvement/main/SKILL.md
```

### Tell your agent

```
Fetch and follow the skill at: https://raw.githubusercontent.com/naimkatiman/continuous-improvement/main/SKILL.md
```

---

## The 7 Laws of AI Agent Discipline

> Every skill in the ecosystem adds capabilities. This is the only one that fixes *how agents think*.

| # | Law | Without it, agents... |
|---|-----|----------------------|
| 1 | **Research Before Executing** | reinvent what already exists |
| 2 | **Plan Is Sacred** | scope-creep and overbuild |
| 3 | **One Thing at a Time** | stack untested changes |
| 4 | **Verify Before Reporting** | lie about being "done" |
| 5 | **Reflect After Sessions** | repeat the same failures |
| 6 | **Iterate One Change** | debug 5 changes at once |
| 7 | **Learn From Every Session** | lose knowledge when the context window ends |

### The Loop

```
Research → Plan → Execute (one thing) → Verify → Reflect → Learn → Iterate
```

If your agent is skipping a step, that's the step it needs most.

---

## Mulahazah: Auto-Leveling Learning

Mulahazah (Arabic: observation) makes your agent build **instincts** over time. It levels up automatically — you don't configure anything.

```
Install:       Hooks start capturing silently. You notice nothing.
~20 sessions:  Agent analyzes patterns, creates first instincts (silent)
~50 sessions:  Instincts cross 0.5 → agent starts suggesting behaviors
~100 sessions: Instincts cross 0.7 → agent auto-applies what it learned
```

### How it works

1. **Hooks capture every tool call** — PreToolUse/PostToolUse hooks write JSONL observations (<50ms, never blocks your session, jq not required)
2. **Analysis runs inline** — when 20+ observations accumulate, Claude analyzes them at session start. No background daemon.
3. **Instincts carry confidence** — 0.3–0.9 scale with graduated behavior:
   - **Silent** (< 0.5) — stored, not surfaced
   - **Suggest** (0.5–0.69) — mentioned inline when relevant
   - **Auto-apply** (0.7+) — applied automatically
4. **Self-correcting** — user corrections drop confidence by 0.1. Unused instincts decay. Wrong behaviors fade out.
5. **Project-scoped** — instincts are per-project by default, promoted to global when seen across 2+ projects

### Starter Instinct Packs

Jump-start your instincts with pre-built packs for popular stacks:

```bash
npx continuous-improvement install --pack react    # 8 React/Next.js instincts
npx continuous-improvement install --pack python   # 8 Python instincts
npx continuous-improvement install --pack go       # 8 Go instincts
```

Or in expert mode: use the `ci_load_pack` tool to load packs at any time.

### Check what your agent has learned

```
/continuous-improvement    # Reflect, analyze, show status
/planning-with-files       # Create or review task_plan.md, findings.md, progress.md
/discipline                # Quick reference card of the 7 Laws
/dashboard                 # Visual instinct health dashboard
```

### Planning With Files (opt-in)

When a task needs durable working memory on disk, initialize the planning workflow explicitly. It creates `task_plan.md`, `findings.md`, and `progress.md` in the project root and stays inactive unless you ask for it.

In expert mode, the same workflow is available programmatically through `ci_plan_init` and `ci_plan_status`.

---

## GitHub Action: Agent Transcript Linter

Lint your AI agent's behavior in CI/CD. The only GitHub Action that checks if your agent followed disciplined workflows.

```yaml
- uses: naimkatiman/continuous-improvement@v3
  with:
    transcript-path: agent-log.jsonl
    strict: true  # Fail build on law violations
```

The linter analyzes tool call patterns and detects:
- **Law 1 violations** — writes without prior research
- **Law 3 violations** — too many consecutive edits without verification
- **Law 4 violations** — code changes without running tests/builds
- **Law 6 violations** — too many files modified at once

Output includes a discipline score (0-100) and detailed violation report.

```bash
# Run locally
node bin/lint-transcript.mjs observations.jsonl
cat transcript.jsonl | node bin/lint-transcript.mjs --stdin --json
```

---

## Plugin Architecture

continuous-improvement ships as a **plugin** with three layers. Pick what you need:

### Layer 1: Skill Only (any LLM)
Paste SKILL.md into your system prompt. Your agent follows the 7 Laws. No tools, no hooks, no server.

### Layer 2: Hooks (Claude Code)
`npx continuous-improvement install` — installs hooks that silently capture every tool call. The instinct system grows automatically. Zero config.

### Layer 3: MCP Server (any MCP client)
`npx continuous-improvement install --mode expert` — a full MCP server that any editor can connect to.

### Beginner vs Expert

| Feature | Beginner (default) | Expert |
|---------|-------------------|--------|
| Observation hooks | Yes | Yes |
| `/continuous-improvement` command | Yes | Yes |
| `/planning-with-files` command | Yes | Yes |
| `/discipline` quick reference | Yes | Yes |
| `/dashboard` visual dashboard | Yes | Yes |
| Auto-leveling instincts | Yes | Yes |
| `ci_status` tool | - | Yes |
| `ci_instincts` tool | - | Yes |
| `ci_reflect` tool | - | Yes |
| `ci_reinforce` tool | - | Yes |
| `ci_create_instinct` tool | - | Yes |
| `ci_observations` tool | - | Yes |
| `ci_export` / `ci_import` | - | Yes |
| `ci_plan_init` / `ci_plan_status` | - | Yes |
| `ci_dashboard` tool | - | Yes |
| `ci_load_pack` tool | - | Yes |
| Session start/end hooks | - | Yes |
| MCP server | - | Yes |

**Beginner** is the right choice for 90% of users. It just works — install and forget. The system quietly learns from your sessions.

**Expert** adds the MCP server for programmatic access, manual instinct management, import/export for team sharing, visual dashboard, and instinct packs.

### MCP Tools Reference

| Tool | Description |
|------|-------------|
| `ci_status` | Current level, instinct count, observation count |
| `ci_instincts` | List learned instincts with confidence levels |
| `ci_reflect` | Generate structured session reflection |
| `ci_reinforce` | Accept/reject instinct suggestions (expert) |
| `ci_create_instinct` | Manually create instincts (expert) |
| `ci_observations` | View raw tool call observations (expert) |
| `ci_export` | Export instincts as JSON (expert) |
| `ci_import` | Import instincts from JSON (expert) |
| `ci_plan_init` | Create project-root planning files for persistent task memory (expert) |
| `ci_plan_status` | Summarize `task_plan.md`, `findings.md`, and `progress.md` (expert) |
| `ci_dashboard` | Visual dashboard with confidence distribution (expert) |
| `ci_load_pack` | Load starter instinct packs (expert) |

### Inspired By Planning-With-Files

This workflow is inspired by the open-source Planning-With-Files pattern:
- [Skillstore reference](https://skillstore.io/skills/ammarcodes-planning-with-files)
- [OpenClaw reference](https://www.opclawskills.com/skills/planning-with-files)

---

## Real-World Examples

See the [`examples/`](examples/) directory for detailed walkthroughs:

- [**Bug Fix**](examples/01-bug-fix.md) — Double submit bug: 4 rounds without framework → 1 round with it
- [**Feature Build**](examples/02-feature-build.md) — Adding pagination: 3 rewrites without → correct first attempt with
- [**Refactor**](examples/03-refactor.md) — SDK migration: cascading failures without → zero regressions with

Each example shows the same task done with and without the 7 laws, highlighting which laws made the difference.

---

## Files

```
continuous-improvement/
├── SKILL.md                           # The 7 Laws + instinct behavior
├── src/
│   ├── bin/
│   │   ├── install.mts                # TypeScript source for the installer
│   │   ├── mcp-server.mts             # TypeScript source for the MCP server
│   │   └── lint-transcript.mts        # TypeScript source for the transcript linter
│   └── test/
│       └── *.test.mts                 # TypeScript source for the Node test suite
├── bin/
│   ├── install.mjs                    # Committed runtime artifact for the installer
│   ├── mcp-server.mjs                 # Committed runtime artifact for the MCP server
│   └── lint-transcript.mjs            # Committed runtime artifact for the transcript linter
├── hooks/
│   ├── observe.sh                     # Observation hook (pure bash, <50ms)
│   └── session.sh                     # Session start/end hook (expert mode)
├── plugins/
│   ├── beginner.json                  # Plugin manifest: 3 tools
│   └── expert.json                    # Plugin manifest: 12 tools
├── commands/
│   ├── continuous-improvement.md     # /continuous-improvement command
│   ├── planning-with-files.md        # /planning-with-files command
│   ├── discipline.md                 # /discipline quick reference
│   └── dashboard.md                  # /dashboard visual display
├── templates/
│   └── planning-with-files/          # Project-root planning file templates
├── instinct-packs/
│   ├── react.json                     # React/Next.js starter instincts
│   ├── python.json                   # Python starter instincts
│   └── go.json                       # Go starter instincts
├── test/                              # Node test suite (node --test)
├── examples/                          # Real-world before/after scenarios
├── docs/                              # Translations (zh-CN, ja)
├── .github/
│   ├── workflows/ci.yml             # CI pipeline (Node 18/20/22)
│   └── ISSUE_TEMPLATE/              # Bug report + feature request templates
├── action.yml                        # GitHub Action definition
├── llms.txt                          # LLM-friendly project description
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── QUICKSTART.md
├── CHANGELOG.md
└── package.json
```

### What gets installed where

**Beginner mode** (default):
```
~/.claude/skills/continuous-improvement/SKILL.md     # The skill
~/.claude/commands/continuous-improvement.md          # The command
~/.claude/commands/planning-with-files.md            # Planning workflow
~/.claude/commands/discipline.md                     # Quick reference
~/.claude/commands/dashboard.md                      # Dashboard
~/.claude/instincts/
├── observe.sh                                       # Hook script
├── global/                                          # Global instincts (*.yaml)
└── <project-hash>/
    ├── project.json                                 # Project metadata
    ├── observations.jsonl                           # Tool call observations
    └── *.yaml                                       # Project instincts
```

**Expert mode** adds:
```
~/.claude/instincts/session.sh                       # Session hooks
~/.claude/settings.json                              # + MCP server + session hooks
```

When you explicitly initialize file-based planning, the following are created in the project root:
```
task_plan.md                                         # Phases, status, decisions, errors
findings.md                                          # Research notes and sources
progress.md                                          # Session log and verification notes
```

---

## Uninstall

```bash
npx continuous-improvement install --uninstall
```

Removes the skill, hooks, and commands. Your learned instincts in `~/.claude/instincts/` are preserved — delete that directory manually if you want a clean slate.

---

## Works With

| Tool | Support |
|------|---------|
| **Claude Code** | Full — skill + hooks + MCP server + auto-leveling instincts |
| **Claude Desktop** | MCP server (expert/mcp mode) |
| **Cursor** | MCP server (mcp mode) or skill only (paste SKILL.md into rules) |
| **Zed / Windsurf** | MCP server (mcp mode) |
| **VS Code** | MCP server (mcp mode) with Copilot MCP support |
| **Codex** | Skill only |
| **Gemini CLI** | Skill only |
| **OpenClaw** | Skill only |
| **Any LLM** | Paste SKILL.md into your system prompt |

---

## Red Flags

If your agent says any of these, it's skipping a law:

- "I'll just quickly..." → Law 3 violation
- "This should work..." → Law 4 violation (verify, don't assume)
- "I already know how to..." → Law 1 violation (still research)
- "Let me also add..." → Law 6 violation (finish first)
- "I'll remember this..." → Law 7 violation (write it down)

---

## Roadmap

### Phase 1: Foundation -- DONE

- [x] Published to public npm (`npx continuous-improvement install` works)
- [x] Node test suite (installer, hook, MCP server, linter, packs, community files)
- [x] Before/after examples in README + `examples/` directory
- [x] Gemini CLI support
- [x] Platform badges and improved npm metadata
- [ ] **Submit to [awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills)** (14K stars)

### Phase 2: Plugin Architecture -- DONE

- [x] **MCP server** — 12 tools (beginner: 3, expert: 9 more) with zero runtime dependencies
- [x] **Beginner / Expert separation** — simple defaults, power when you need it
- [x] **Plugin manifests** — `plugins/beginner.json` and `plugins/expert.json`
- [x] **Session hooks** — auto-load instincts at session start, remind to reflect at end
- [x] **`--mode` flag** — `beginner` | `expert` | `mcp` installation modes
- [x] **Import/export** — share instincts as JSON between team members
- [x] **Multi-editor MCP support** — Claude Desktop, Cursor, Zed, Windsurf, VS Code

### Phase 2.5: Visibility & Ecosystem -- DONE

- [x] **GitHub Action** — lint agent transcripts for law compliance (`action.yml`)
- [x] **Starter instinct packs** — React, Python, Go (pre-built instincts)
- [x] **`/discipline` command** — quick reference card of the 7 Laws
- [x] **`/dashboard` command** — visual instinct health dashboard
- [x] **Community files** — CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md
- [x] **llms.txt** — LLM-friendly project description for discoverability
- [x] **CI pipeline** — GitHub Actions testing on Node 18/20/22
- [x] **Issue templates** — bug report + feature request
- [x] **Translations** — Chinese (简体中文) and Japanese (日本語)

### Phase 3: Content & Proof

- [ ] **2-min demo video** — side-by-side agent with/without discipline. Post to X + YouTube.
- [ ] **"Why your AI agent keeps lying about being done"** — X thread / blog post
- [ ] **"Law of the Week" X series** — 7 weeks of content breaking down each law

### Phase 4: Ecosystem Growth

- [ ] **VS Code extension** — sidebar showing instinct confidence levels
- [ ] **More instinct packs** — TypeScript, Rust, Java, Django, Laravel
- [ ] **Instinct marketplace** — share learned instincts across teams

### Phase 5: Community

- [ ] **Conference talk on Mulahazah** — the auto-leveling system is genuinely novel
- [ ] **Leaderboard / badges** — "100 sessions" achievement system
- [ ] **Custom domain** — landing page with interactive demo

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. Issues and PRs welcome.

## Security

See [SECURITY.md](SECURITY.md) for the security policy and how to report vulnerabilities.

## License

MIT
