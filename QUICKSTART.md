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

**Check 1 — slash command loaded.** Quit and reopen Claude Code (slash commands only load on session start), then run:

```
/discipline
```

You should see the 7 Laws quick-reference card. If the command is not recognized after a restart, see Troubleshooting in [README.md](README.md#troubleshooting-install).

**Check 2 — runtime gate is firing** (the `hooks/gateguard.mjs` script must invoke). Ask Claude to write a throwaway file with no research first:

```
Edit a new file scratch.txt and put the word "hello" in it. Don't research anything first.
```

You should see Claude **blocked** by the bundled `gateguard` PreToolUse hook (`hooks/gateguard.mjs`) with a fact-list reason: list importers, list public functions affected, show data-file schemas, quote the user instruction. That block is the proof the hook is wired and firing. If Claude writes the file with no pause, the hook did not load — see [README.md → Troubleshooting](README.md#troubleshooting-install).

If you also want to confirm observation hooks: run `/dashboard` and look for a non-zero `Total` under `Observations` — that proves `observe.sh` / `observe.mjs` is recording tool calls.

### How enforcement works

The 7 Laws are enforced at **two layers**:

- **Runtime layer (hooks).** `gateguard` ships as a PreToolUse hook (`hooks/gateguard.mjs`) that physically blocks Edit / Write / MultiEdit / destructive Bash on the first mutation per file until the agent presents the facts. Destructive Bash (`rm -rf`, `git push --force`, `--force-with-lease`, `DROP DATABASE`, Windows `Remove-Item -Recurse`, etc.) is gated on every call. Read-only and exploratory tools (Read, Grep, Glob, routine Bash like `git status`) bypass the gate.
- **Model layer (skills).** When the agent does present facts and the runtime gate clears, the skills (`tdd-workflow`, `verification-loop`, `proceed-with-the-recommendation`, etc.) take over to keep the rest of the loop disciplined. These are model-side — the agent reads each skill and applies it.

Together: the runtime layer catches the failure mode "agent skips investigation," and the model layer catches everything that happens after investigation succeeds.

If you ever see Claude skip a Law that the runtime hook doesn't enforce, name it back: *"You skipped Law 1 — research first."* That correction is what trains the instinct system over time.

---

## Step 2: Use it

Give your agent a task and prefix it:

```
Use the continuous-improvement framework to [your task here].
```

Examples:
```
Use the continuous-improvement framework to add pagination to the users API endpoint.
Use the continuous-improvement framework to debug why the login form breaks on mobile.
Use the continuous-improvement framework to refactor the payment module to use the new SDK.
```

Your agent will research, plan, execute one thing at a time, verify, and reflect.

For long tasks that need persistent notes on disk, run:

```
/planning-with-files
```

That creates `task_plan.md`, `findings.md`, and `progress.md` in the project root only when you explicitly ask for it.

---

## Step 3: Check learning

After completing non-trivial work, run the canonical reflection command:

```
/seven-laws
```

This shows what the system has learned — instincts, confidence levels, and the current auto-level. `/continuous-improvement` is kept as an alias for backward compatibility and runs the same workflow.

---

## How auto-leveling works

You don't configure anything. The system promotes itself:

| Your usage | What happens |
|-----------|-------------|
| First sessions | Hooks capture tool calls silently. No behavior change. |
| After ~20 sessions | Agent analyzes patterns, creates instincts (silent — you see nothing) |
| After ~50 sessions | Instincts cross 0.5 → agent starts suggesting: "Consider: [action]" |
| After ~100 sessions | Instincts cross 0.7 → agent auto-applies learned behaviors |

Corrections drop instinct confidence. Unused instincts decay. The system self-corrects.

---

## Common issues

**Agent skips straight to coding?**
→ Say: *"You skipped research and planning. Go back to Law 1."*

**Agent writes "done" without verifying?**
→ Reply: *"What verification command did you run? Show me the output."*

**No instincts showing up yet?**
→ Normal. The system needs 20+ observations before it creates instincts. Keep working.

---

## Expert (npx) — only if you want MCP, hooks, or instinct packs

The Beginner path above is enough for most users. Pick this only if you want the MCP tools (12 of them, including `ci_plan_init` / `ci_plan_status` for `task_plan.md`-style planning), the session hooks that feed Mulahazah, or the starter instinct packs.

Do not run both paths against the same `~/.claude/` — that produces duplicated state. Pick one and stick with it.

```bash
npx continuous-improvement install --mode expert
npx continuous-improvement install --pack react   # optional: react | python | go | meta
```

Preconditions: Node 18 / 20 / 22, plus bash on Windows (Git Bash or WSL — `hooks/observe.sh` is a bash script). See [README.md § Expert](README.md#expert--adds-mcp-server-observation-hooks-and-instinct-packs) for the full preconditions and troubleshooting matrix.

Verify with `/dashboard` — you should see instinct health and observation count.

---

## That's it

The skill is most valuable when:
- You're under pressure and tempted to skip steps
- A task has failed 2+ times
- You want your agent to stop repeating the same mistakes
