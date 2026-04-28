# Source Skills

This directory holds the **source-of-truth** for the companion skills bundled with the `continuous-improvement` plugin.

> Edit files **here**. The plugin bundle at `plugins/continuous-improvement/skills/<name>/SKILL.md` is **regenerated** every time you run `npm run build` (see [`bin/generate-plugin-manifests.mjs`](../bin/generate-plugin-manifests.mjs)). Edits made directly inside `plugins/continuous-improvement/skills/` will be overwritten.

## Featured companion — installed by default with the plugin

`proceed-with-the-recommendation` is the **recommended pairing** for the 7 Laws. It is the execution arm that turns "do all of it" into a disciplined, verified, one-concern-at-a-time walk through the agent's recommendation list. If you only adopt one companion alongside the core skill, adopt this one.

| Skill | What it does | Source |
|-------|--------------|--------|
| **`proceed-with-the-recommendation`** ⭐ | Walks any agent's recommendation list top-to-bottom under the 7 Laws — routes each item to the right specialist (`superpowers:*`, `ralph`, `workspace-surface-audit`, `simplify`, `security-review`, `schedule`, `loop`), falls back to inline behavior when a specialist isn't installed, verifies per item, halts on `needs-approval` | @naimkatiman |

## Tier 1 — recommended pairing for **beginner** mode

These add concrete enforcement to the 7 Laws. Tier-1 skills are the always-on minimum for any user running `npx continuous-improvement install` (default beginner mode).

| Skill | What it does | Pairs with which Law |
|-------|--------------|----------------------|
| `para-memory-files` | File-based persistent memory using PARA (Projects/Areas/Resources/Archives) for cross-session context | Law 5 (Reflect), Law 7 (Learn) |
| `verification-loop` | Six-phase verification (build, types, lint, tests, security, diff) with a structured PASS/FAIL report | Law 4 (Verify Before Reporting) |
| `gateguard` | PreToolUse fact-forcing gate that blocks Edit/Write/destructive Bash until concrete investigation is presented | Law 1 (Research), Law 3 (One Thing) |
| `tdd-workflow` | RED→GREEN→REFACTOR enforcement, 80%+ coverage gate across unit/integration/E2E | Law 3 (One Thing), Law 4 (Verify) |

## Tier 2 — additional skills for **expert** mode

Tier-2 skills layer on top of tier-1 for users running `npx continuous-improvement install --mode expert`. They cover autonomous-mode safety, response-depth control, and context-window discipline that matter once an agent runs longer or more aggressively.

| Skill | What it does | When it pays off |
|-------|--------------|------------------|
| `safety-guard` | Three-mode runtime guard (careful/freeze/guard) that blocks destructive commands and locks edits to a directory | Autonomous loops, prod systems, `--dangerously-skip-permissions` sessions |
| `token-budget-advisor` | Heuristic input/output token estimator that offers 25%/50%/75%/100% depth choices before answering | Long sessions where response size matters |
| `strategic-compact` | PreToolUse hook that suggests `/compact` at logical phase boundaries (research→plan, plan→implement, debug→next) instead of arbitrary auto-compaction | Multi-phase tasks that approach context limits |
| `wild-risa-balance` | Decision-framing lens that pairs WILD (Wild/Imaginative/Limitless/Disruptive) generation with RISA (Realistic/Important/Specific/Agreeable) execution, used to split recommendation lists into bold pilots above a safe baseline | Multi-item recommendation blocks where bold options keep losing to safe ones in a flat list |

The `/learn-eval` slash command also ships as part of the expert install: extract a session pattern, run a checklist quality gate, and decide global-vs-project save location before writing any skill file.

## Other always-bundled companion skills

These ship in the same plugin bundle regardless of mode and are available the moment you install the `continuous-improvement` plugin from the marketplace.

| Skill | What it does | Source |
|-------|--------------|--------|
| `ralph` | Autonomous loop that executes a PRD story-by-story with quality checks between iterations | [snarktank/ralph](https://github.com/snarktank/ralph) |
| `superpowers` | Activates task-appropriate skills automatically (brainstorming, git-worktrees, TDD, code review, etc.) | [obra/superpowers](https://github.com/obra/superpowers) |
| `workspace-surface-audit` | Audits the active repo, MCP servers, plugins, and env, then recommends high-value skills/workflows | continuous-improvement |

## How they get to your machine

Two paths, you pick:

**Path A — Install the plugin (recommended).** Bundled with the core skill, no per-skill copying. All companions land in one shot:

```bash
/plugin marketplace add naimkatiman/continuous-improvement
/plugin install continuous-improvement@continuous-improvement-dev
```

**Path B — Drop a single skill in by hand.** Useful if you want only one companion without the rest of the plugin:

```bash
SKILL=proceed-with-the-recommendation
mkdir -p ~/.claude/skills/$SKILL
curl -L https://raw.githubusercontent.com/naimkatiman/continuous-improvement/main/skills/$SKILL.md \
  -o ~/.claude/skills/$SKILL/SKILL.md
```

Or paste the file's contents directly into your agent's system prompt.

## Pressure-test logs

Adversarial pressure-test logs for skills in this directory live under [`docs/testing/`](../docs/testing/). They are not skills — they are baseline guarantees future edits must preserve.

## Relationship to the core skill

The core [`SKILL.md`](../SKILL.md) at the repo root defines the **7 Laws of discipline**. The skills in this directory are independent execution tools that build on those laws. They do not depend on `SKILL.md` and `SKILL.md` does not depend on them — but `proceed-with-the-recommendation` was written specifically to operationalize the 7 Laws end-to-end, which is why it's the featured pairing.
