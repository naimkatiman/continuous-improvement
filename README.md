<p align="center">
  <img src="assets/combined.gif" alt="Before vs After continuous-improvement" width="700" />
</p>

# continuous-improvement

> Stop your AI agent from skipping steps, guessing, and declaring "done" without verifying.

[![Version](https://img.shields.io/badge/version-2.1.0-blue)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## The Problem

AI agents are great at individual steps. They're terrible at discipline.

They skip research. They plan loosely. They declare "done" before verifying. They add features mid-task. They never reflect. Each session, they repeat the same mistakes.

This skill fixes that with **7 laws** and a **learning system** that auto-levels itself — no config, no daemon, no manual setup.

---

## Install

```bash
npx continuous-improvement install
```

That's it. For Claude Code, this also installs:
- Observation hooks (captures every tool call, <50ms, jq optional)
- `/continuous-improvement` command
- Auto-leveling instinct system

Install to a specific target:

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

## The 7 Laws

| # | Law | What it prevents |
|---|-----|-----------------|
| 1 | **Research Before Executing** | Reinventing what already exists |
| 2 | **Plan Is Sacred** | Scope creep and overbuilding |
| 3 | **One Thing at a Time** | Stacking untested changes |
| 4 | **Verify Before Reporting** | False "done" claims |
| 5 | **Reflect After Sessions** | Repeating the same failures |
| 6 | **Iterate One Change** | Debugging 5 changes at once |
| 7 | **Learn From Every Session** | Knowledge that dies with the context window |

### The Loop

```
Research → Plan → Execute (one thing) → Verify → Reflect → Learn → Iterate
```

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

### Check what your agent has learned

```
/continuous-improvement
```

---

## Files

```
continuous-improvement/
├── SKILL.md                    # The 7 Laws + instinct behavior
├── commands/continuous-improvement.md  # /continuous-improvement command
├── hooks/observe.sh            # Observation hook (pure bash, <50ms)
├── bin/install.mjs             # CLI installer
├── QUICKSTART.md               # First-use guide
├── CHANGELOG.md
└── package.json
```

### What gets installed where (Claude Code)

```
~/.claude/skills/continuous-improvement/SKILL.md     # The skill
~/.claude/commands/continuous-improvement.md          # The command
~/.claude/instincts/
├── observe.sh                                       # Hook script
├── global/                                          # Global instincts (*.yaml)
└── <project-hash>/
    ├── project.json                                 # Project metadata
    ├── observations.jsonl                           # Tool call observations
    └── *.yaml                                       # Project instincts
```

---

## Uninstall

```bash
npx continuous-improvement install --uninstall
```

Removes the skill, hooks, and command. Your learned instincts in `~/.claude/instincts/` are preserved — delete that directory manually if you want a clean slate.

---

## Works With

| Tool | Support |
|------|---------|
| **Claude Code** | Full — skill + hooks + auto-leveling instincts |
| **Cursor** | Skill only (paste SKILL.md into rules) |
| **Codex** | Skill only |
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

## License

MIT
