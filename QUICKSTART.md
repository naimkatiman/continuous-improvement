# Quickstart — continuous-improvement

Zero to working in under 2 minutes.

---

## Step 1: Install

```bash
npx continuous-improvement install
```

This auto-detects your setup. For Claude Code, it installs the skill, hooks, and `/continuous-improvement` command.

On Windows, run the same command from PowerShell. Install Git Bash or WSL first so the observation hooks can execute.

### Verify the install

Open Claude Code and run:

```
/discipline
```

You should see the 7 Laws quick-reference card. If the command is not recognized, **quit and reopen Claude Code first** — slash commands only load on session start. Re-run the install step only if a fresh session still doesn't recognize `/discipline`.

---

## Step 2: Use It

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

## Step 3: Check Learning

After completing non-trivial work:

```
/continuous-improvement
```

This shows what the system has learned — instincts, confidence levels, and the current auto-level.

---

## How Auto-Leveling Works

You don't configure anything. The system promotes itself:

| Your usage | What happens |
|-----------|-------------|
| First sessions | Hooks capture tool calls silently. No behavior change. |
| After ~20 sessions | Agent analyzes patterns, creates instincts (silent — you see nothing) |
| After ~50 sessions | Instincts cross 0.5 → agent starts suggesting: "Consider: [action]" |
| After ~100 sessions | Instincts cross 0.7 → agent auto-applies learned behaviors |

Corrections drop instinct confidence. Unused instincts decay. The system self-corrects.

---

## Common Issues

**Agent skips straight to coding?**
→ Say: *"You skipped research and planning. Go back to Law 1."*

**Agent writes "done" without verifying?**
→ Reply: *"What verification command did you run? Show me the output."*

**No instincts showing up yet?**
→ Normal. The system needs 20+ observations before it creates instincts. Keep working.

---

## That's It

The skill is most valuable when:
- You're under pressure and tempted to skip steps
- A task has failed 2+ times
- You want your agent to stop repeating the same mistakes
