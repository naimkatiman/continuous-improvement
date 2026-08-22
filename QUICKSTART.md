# Quickstart — continuous-improvement

Zero to working in under 2 minutes.

This is the **Beginner** path. It mirrors README.md and is enough for ~90% of users — no Node, no bash, no shell. If you want the MCP server, observation hooks, and instinct packs, see the **Expert (npx)** section at the bottom.

---

## Step 1: Install (Beginner — inside Claude Code)

Run these two slash commands inside Claude Code. The doubled name is correct: it reads as `<plugin>@<marketplace>`.

```
/plugin marketplace add naimkatiman/continuous-improvement
/plugin install continuous-improvement@continuous-improvement
```

Optional companion (recommended) — the Obra `superpowers` skills library that the `/superpowers` dispatcher routes into:

```
/plugin install superpowers@continuous-improvement
```

Without it, `/superpowers` still works — it falls back to inline behavior — but specialist skills like `superpowers:test-driven-development` and `superpowers:writing-plans` will not be available as dedicated targets.

### Verify the install — two checks

**Fastest path:** restart Claude Code, then run `/verify-install` — it walks all three checks (commands loaded, gateguard fires, observation capture recording) and prints a single ✓ wired / ✗ missing line. The manual checks below are the same probes done by hand, kept here so you can see what each one proves.

**Check 1 — slash command loaded.** Quit and reopen Claude Code (slash commands only load on session start), then run:

```
/discipline
```

You should see the 7 Laws quick-reference card. If the command is not recognized after a restart, see Troubleshooting in [README.md](README.md#install).

**Check 2 — runtime gate is firing** (the `hooks/gateguard.mjs` script must invoke). Ask Claude to write a throwaway file with no research first:

```
Edit a new file scratch.txt and put the word "hello" in it. Don't research anything first.
```

You should see Claude **blocked** by the bundled `gateguard` PreToolUse hook (`hooks/gateguard.mjs`) with a fact-list reason: list importers, list public functions affected, show data-file schemas, quote the user instruction. That block is the proof the hook is wired and firing. If Claude writes the file with no pause, the hook did not load — see [README.md → Troubleshooting](README.md#install).

If you also want to confirm observation hooks: run `/dashboard` and look for a non-zero `Total` under `Observations` — that proves `observe.sh` / `observe.mjs` is recording tool calls.

### How enforcement works

The 7 Laws are enforced at **two layers**:

- **Runtime layer (hooks).** `gateguard` ships as a PreToolUse hook (`hooks/gateguard.mjs`) that physically blocks Edit / Write / MultiEdit / destructive Bash on the first mutation per file until the agent presents the facts. Destructive Bash (`rm -rf`, `git push --force`, `--force-with-lease`, `DROP DATABASE`, Windows `Remove-Item -Recurse`, etc.) is gated on every call. Read-only and exploratory tools (Read, Grep, Glob, routine Bash like `git status`) bypass the gate.
- **Model layer (skills).** When the agent does present facts and the runtime gate clears, the skills (`tdd-workflow`, `verification-loop`, `proceed-with-the-recommendation`, etc.) take over to keep the rest of the loop disciplined. These are model-side — the agent reads each skill and applies it.

Together: the runtime layer catches the failure mode "agent skips investigation," and the model layer catches everything that happens after investigation succeeds.

If you ever see Claude skip a Law that the runtime hook doesn't enforce, name it back: *"You skipped Law 1 — research first."* That correction is what trains the instinct system over time.

---

## Step 2: Use it

Give the agent a real task. You do **not** have to prefix every prompt — the `gateguard` PreToolUse hook (`hooks/gateguard.mjs`) fires on `Edit` / `Write` / destructive `Bash` either way.

If you want the model-side loop named out loud:

```
Use the continuous-improvement framework to add pagination to the users API endpoint.
```

For long tasks that need persistent notes on disk, run:

```
/planning-with-files
```

That creates `task_plan.md`, `findings.md`, and `progress.md` in the project root only when you explicitly ask for it.

---

## Step 3: Close the loop (this is the learning trigger)

Hooks capture tool calls silently. Instincts do **not** form until you ask. After a real task, run:

```
/seven-laws
```

That is reflect + analyze + status. Skip it and observations pile up while nothing compounds. `/continuous-improvement` is an alias for the same workflow.

When a bug feels familiar: `/recall <the error>`. One defect, one PR: `/ship`.

---

## How auto-leveling works

On-demand by default (not every session start — that costs tokens). The unit is
**observations** — one per tool call, not one per session — so a single active
session can produce dozens. The four levels below mirror the source-of-truth
table in [SKILL.md](SKILL.md). They apply when you run `/seven-laws` / `analyze`, a weekly schedule, or always-on:

| Level | Trigger | What happens |
|-------|---------|-------------|
| CAPTURE | < 20 observations | Hooks capture tool calls silently. No behavior change. |
| ANALYZE | 20+ observations | Agent analyzes patterns, creates instincts (silent — you see nothing) |
| SUGGEST | Any instinct at 0.5–0.69 confidence | Agent suggests inline: "Consider: [action]" |
| AUTO-APPLY | Any instinct at 0.7+ confidence | Agent auto-applies the learned behavior |

Corrections drop instinct confidence. Unused instincts decay. The system self-corrects.

---

## Common issues

**Agent skips straight to coding?**
→ Say: *"You skipped research and planning. Go back to Law 1."*

**Agent writes "done" without verifying?**
→ Reply: *"What verification command did you run? Show me the output."*

**No instincts showing up yet?**
→ Run `/seven-laws` after a real session. Then check `/dashboard`. Zero `Total` under Observations means capture is not wired (Expert install / plugin hooks). A high Total and zero instincts means you have not closed the loop yet. 20+ observations is the floor before analysis creates instincts.

---

## Expert (npx) — only if you want MCP, hooks, or instinct packs

The Beginner path above is enough for most users. Pick this only if you want the MCP tools (19 of them, including `ci_plan_init` / `ci_plan_status` for `task_plan.md`-style planning), the session hooks that feed Mulahazah, or the starter instinct packs.

Do not run both paths against the same `~/.claude/` — that produces duplicated state. Pick one and stick with it.

```bash
npx continuous-improvement install --mode expert
npx continuous-improvement install --pack react   # optional: react | python | go | meta
```

Precondition: Node 18 / 20 / 22. Runtime hooks execute Node directly, so Git Bash and `jq` are not required. Re-run the installer once after upgrading to migrate legacy Bash hook rows. See [README.md § Install](README.md#install) for the troubleshooting matrix.

Verify with `/dashboard` — you should see instinct health and observation count.

---

## That's it

Smarter models do not retire this. They still skip your existing helper, claim "done" without the test output, and forget last week's correction. The runtime gate (`hooks/gateguard.mjs`) and this-repo memory do not merge into the model.

You benefit in three rungs: (1) install and work — the gate fires; (2) `/seven-laws` after a real session — observations become instincts; (3) Expert + optional `CLAUDE_RECALL_BRIEFING=1` — memory fires without asking.

Most valuable when:
- You're under pressure and tempted to skip steps
- A task has failed 2+ times
- You want your agent to stop repeating the same mistakes
