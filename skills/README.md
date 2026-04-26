# Bundled Companion Skills

This directory ships four companion skills alongside `SKILL.md` at the project root. They are **not** installed automatically by `npx continuous-improvement install` — the default installer only deploys the core 7 Laws skill and its commands.

Use these when you want to extend your agent beyond discipline enforcement.

## Skills in this directory

| File | What it does | Source |
|------|--------------|--------|
| `ralph.md` | Autonomous loop that executes a PRD story-by-story with quality checks between iterations | [snarktank/ralph](https://github.com/snarktank/ralph) |
| `superpowers.md` | Activates task-appropriate skills automatically (brainstorming, git-worktrees, TDD, code review, etc.) | [obra/superpowers](https://github.com/obra/superpowers) |
| `workspace-surface-audit.md` | Audits the active repo, MCP servers, plugins, and environment, then recommends high-value skills and workflows | ECC |
| `proceed-with-claude-recommendation.md` | Walks a Claude recommendation list top-to-bottom, routes each item to the right specialist skill (`superpowers:*`, `schedule`, `loop`, `simplify`, `security-review`, etc.), falls back to inline behavior when the specialist is not installed, verifies per item, stops at approval-needed items | @naimkatiman |

## How to install one

Pick the skill file you want and drop it into your agent's skills directory. For Claude Code:

```bash
cp skills/ralph.md ~/.claude/skills/ralph.md
```

Or for a remote one-liner (no clone needed):

```bash
SKILL=proceed-with-claude-recommendation
mkdir -p ~/.claude/skills/$SKILL
curl -L https://raw.githubusercontent.com/naimkatiman/continuous-improvement/main/skills/$SKILL.md \
  -o ~/.claude/skills/$SKILL/SKILL.md
```

Or paste the file's contents directly into your agent's system prompt.

## Relationship to the core skill

The core `SKILL.md` (project root) defines the 7 Laws of discipline. The skills here are independent tools you can mix in. They do not depend on `SKILL.md` and `SKILL.md` does not depend on them.
