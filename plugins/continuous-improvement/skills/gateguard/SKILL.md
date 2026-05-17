---
name: gateguard
tier: "1"
description: Enforces Law 1 (Research Before Executing) of the 7 Laws of AI Agent Discipline. Fact-forcing gate that blocks Edit/Write/Bash (including MultiEdit) and demands concrete investigation (importers, data schemas, user instruction) before allowing the action. Measurably improves output quality by +2.25 points vs ungated agents.
origin: community
user-invocable: false
---

# GateGuard — Fact-Forcing Pre-Action Gate

A runtime PreToolUse hook + skill pair that forces the agent to investigate before editing. Instead of self-evaluation ("are you sure?"), it demands concrete facts. The act of investigation creates awareness that self-evaluation never did.

> **Implementation status:** GateGuard ships as a **runtime PreToolUse hook** at `hooks/gateguard.mjs`, wired as the first PreToolUse entry in the plugin bundle. The hook physically blocks Edit / Write / MultiEdit and every destructive Bash on stdin/stdout JSON, returning `{decision: "block", reason: "..."}` until the agent presents facts and retries with the per-session clearance signal. This skill file is the human-readable spec the hook implements. Originally tracked in [issue #106](https://github.com/naimkatiman/continuous-improvement/issues/106) (closed; landed as PR #108).

## When to Activate

- Working on any codebase where file edits affect multiple modules
- Projects with data files that have specific schemas or date formats
- Teams where AI-generated code must match existing patterns
- Any workflow where the agent tends to guess instead of investigating

## Core Concept

LLM self-evaluation doesn't work. Ask "did you violate any policies?" and the answer is always "no." This is verified experimentally.

But asking "list every file that imports this module" forces the LLM to run Grep and Read. The investigation itself creates context that changes the output.

**Three-stage gate:**

```
1. DENY  — block the first Edit/Write/Bash attempt
2. FORCE — tell the model exactly which facts to gather
3. ALLOW — permit retry after facts are presented
```

No competitor does all three. Most stop at deny.

## Evidence

Two independent A/B tests, identical agents, same task:

| Task | Gated | Ungated | Gap |
| --- | --- | --- | --- |
| Analytics module | 8.0/10 | 6.5/10 | +1.5 |
| Webhook validator | 10.0/10 | 7.0/10 | +3.0 |
| **Average** | **9.0** | **6.75** | **+2.25** |

Both agents produce code that runs and passes tests. The difference is design depth.

## Gate Types

### Edit / MultiEdit Gate (first edit per file)

MultiEdit is handled identically — each file in the batch is gated individually.

```
Before editing {file_path}, present these facts:

1. List ALL files that import/require this file (use Grep)
2. List the public functions/classes affected by this change
3. If this file reads/writes data files, show field names, structure,
   and date format (use redacted or synthetic values, not raw production data)
4. Quote the user's current instruction verbatim
```

### Write Gate (first new file creation)

```
Before creating {file_path}, present these facts:

1. Name the file(s) and line(s) that will call this new file
2. Confirm no existing file serves the same purpose (use Glob)
3. If this file reads/writes data files, show field names, structure,
   and date format (use redacted or synthetic values, not raw production data)
4. Quote the user's current instruction verbatim
```

### Destructive Bash Gate (every destructive command)

Triggers on: `rm -rf`, `git reset --hard`, `git push --force`, `drop table`, etc.

```
1. List all files/data this command will modify or delete
2. Write a one-line rollback procedure
3. Quote the user's current instruction verbatim
```

### Routine Bash Gate (once per session)

```
Quote the user's current instruction verbatim.
```

### Parallel-Actor Gate (first mutation per session, then divergence-checked)

A second Claude/Codex/Maulana session can be running on the same host and the same working tree. On this operator's setup that is the common case, not the edge case (multi-clauding observed at 67% of recent messages). A mutation that looks safe in isolation can land on top of an upstream commit, an unstaged change, or a branch advance that this session never saw.

**On the first Edit / Write / mutating Bash of a session:**

```
Baseline these three values and quote them in your response:

1. `git rev-parse HEAD` — record the commit you started on
2. `git rev-parse @{u}` (if branch tracks an upstream) — record where origin was
3. `git status --porcelain` — record the working tree state

If any value is "unknown" (detached HEAD, no upstream, untracked-only tree),
say so explicitly. Do not proceed past the baseline silently.
```

**On every subsequent Edit / Write / mutating Bash, before allowing the action:**

```
Re-check the three baselines against current state:

1. `git rev-parse HEAD` — has it advanced past your baseline without your commits?
2. `git rev-parse @{u}` — did upstream move while you worked?
3. `git status --porcelain` — are there modifications you did not introduce?

If ANY of those drifted from baseline, HALT. Emit:
"Parallel-actor divergence: <field> moved from <baseline> to <current>.
Working tree may belong to another session. Stop, surface to operator,
get clearance before next mutation."
```

This gate is what catches the squash-merge / ahead-of-origin trap recorded in the operator's memory (`feedback_pre_branch_check.md`, `feedback_parallel_actor.md`) — both classes of failure occurred because a baseline was never captured at session start.

## Quick Start

### Today: runtime hook + skill (zero install beyond the plugin)

`hooks/gateguard.mjs` is bundled with this plugin and wired as the first PreToolUse hook in `plugins/continuous-improvement/hooks/hooks.json`. When you install the plugin, the runtime gate is live — no extra config, no opt-in. The hook reads tool input from stdin, classifies it through a data-driven routing table (Read/Grep/Glob → allow, Write/Edit/MultiEdit → mutating-file gate, Bash → destructive-pattern check), and emits `{decision, reason?}` on stdout. Per-session state lives at `~/.claude/instincts/<project-hash>/gateguard-session.json` (override via `GATEGUARD_SESSION_DIR` for tests) and caps cumulative clearances at `MAX_CLEARED_FILES = 50`.

Smoke-test the runtime gate after install: ask Claude to write a throwaway file with no research first. The hook should return a `block` decision with a fact-list reason; Claude should pause rather than write.

### V1 honest limitations (not mitigated, documented)

- **Honor system.** Once the agent flips `_gateguard_facts_presented: true` in `tool_input`, the hook can't verify the investigation actually happened. The 50-file cap bounds damage from stuck loops or rogue agents.
- **State-file deletion.** `rm`-ing the session state resets every gate. Acceptable because the session itself is the trust boundary.
- **Parallel-hook race.** Two simultaneous hook invocations can race the read+write of the state file. Acceptable trade-off vs Windows atomic-rename complexity.

**MultiEdit per-file gating.** The hook clears and checks every `edits[]` path individually, so a mixed-clearance batch blocks until *all* edited files are cleared or facts are presented. The block reason now names the whole batch, not just the first uncleared path.

These behaviors are documented in `src/hooks/gateguard.mts` and `src/lib/gateguard-state.mts` headers.

### Future: third-party `gateguard-ai` package

The standalone `gateguard-ai` Python/CLI package referenced in earlier drafts of this skill is not currently part of this plugin and not a published package. It may ship later with `.gateguard.yml` per-project config; for now, treat it as design notes only.

## Anti-Patterns

- **Don't use self-evaluation instead.** "Are you sure?" always gets "yes." This is experimentally verified.
- **Don't skip the data schema check.** Both A/B test agents assumed ISO-8601 dates when real data used `%Y/%m/%d %H:%M`. Checking data structure (with redacted values) prevents this entire class of bugs.
- **Don't gate every single Bash command.** Routine bash gates once per session. Destructive bash gates every time. This balance avoids slowdown while catching real risks.

## Best Practices

- Let the gate fire naturally. Don't try to pre-answer the gate questions — the investigation itself is what improves quality.
- Customize gate messages for your domain. If your project has specific conventions, add them to the gate prompts.
- Use `.gateguard.yml` to ignore paths like `.venv/`, `node_modules/`, `.git/`.

## Related Skills

- `safety-guard` — Runtime safety checks (complementary, not overlapping)
- `code-reviewer` — Post-edit review (GateGuard is pre-edit investigation)
