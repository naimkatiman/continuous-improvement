# Source Skills

This directory holds the **source-of-truth** for the companion skills bundled with the `continuous-improvement` plugin.

> Edit files **here**. The plugin bundle at `plugins/continuous-improvement/skills/<name>/SKILL.md` is **regenerated** every time you run `npm run build` (see [`bin/generate-plugin-manifests.mjs`](../bin/generate-plugin-manifests.mjs)). Edits made directly inside `plugins/continuous-improvement/skills/` will be overwritten.

## Featured companion — installed by default with the plugin

`proceed-with-claude-recommendation` is the **recommended pairing** for the 7 Laws. It is the execution arm that turns "do all of it" into a disciplined, verified, one-concern-at-a-time walk through Claude's recommendation list. If you only adopt one companion alongside the core skill, adopt this one.

| Skill | What it does | Source |
|-------|--------------|--------|
| **`proceed-with-claude-recommendation`** ⭐ | Walks any Claude recommendation list top-to-bottom under the 7 Laws — routes each item to the right specialist (`superpowers:*`, `ralph`, `workspace-surface-audit`, `simplify`, `security-review`, `schedule`, `loop`), falls back to inline behavior when a specialist isn't installed, verifies per item, halts on `needs-approval` | @naimkatiman |

## Other bundled companion skills

These ship in the same plugin bundle and are available the moment you install the `continuous-improvement` plugin from the marketplace.

| Skill | What it does | Source |
|-------|--------------|--------|
| `ralph` | Autonomous loop that executes a PRD story-by-story with quality checks between iterations | [snarktank/ralph](https://github.com/snarktank/ralph) |
| `superpowers` | Activates task-appropriate skills automatically (brainstorming, git-worktrees, TDD, code review, etc.) | [obra/superpowers](https://github.com/obra/superpowers) |
| `workspace-surface-audit` | Audits the active repo, MCP servers, plugins, and env, then recommends high-value skills/workflows | ECC |

## How they get to your machine

Two paths, you pick:

**Path A — Install the plugin (recommended).** Bundled with the core skill, no per-skill copying. All four companions land in one shot:

```bash
/plugin marketplace add naimkatiman/continuous-improvement
/plugin install continuous-improvement@continuous-improvement-dev
```

**Path B — Drop a single skill in by hand.** Useful if you want only one companion without the rest of the plugin:

```bash
SKILL=proceed-with-claude-recommendation
mkdir -p ~/.claude/skills/$SKILL
curl -L https://raw.githubusercontent.com/naimkatiman/continuous-improvement/main/skills/$SKILL.md \
  -o ~/.claude/skills/$SKILL/SKILL.md
```

Or paste the file's contents directly into your agent's system prompt.

## Pressure-test logs

Adversarial pressure-test logs for skills in this directory live under [`docs/testing/`](../docs/testing/). They are not skills — they are baseline guarantees future edits must preserve.

## Relationship to the core skill

The core [`SKILL.md`](../SKILL.md) at the repo root defines the **7 Laws of discipline**. The skills in this directory are independent execution tools that build on those laws. They do not depend on `SKILL.md` and `SKILL.md` does not depend on them — but `proceed-with-claude-recommendation` was written specifically to operationalize the 7 Laws end-to-end, which is why it's the featured pairing.
