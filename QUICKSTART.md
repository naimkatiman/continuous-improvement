# Quickstart: five minutes

Install the plugin, check that it is wired, watch one guard refuse a command, look at what it logged, then undo all of it. [README.md](README.md) has the full list of what turns on and what it costs.

You need Claude Code and `node` 18 or newer on your `PATH`. The hooks are Node scripts. Without `node` none of them runs and nothing is denied.

## 1. Install

Inside Claude Code:

```
/plugin marketplace add naimkatiman/continuous-improvement
/plugin install continuous-improvement@continuous-improvement
```

The doubled name is `<plugin>@<marketplace>`. Restart Claude Code once so the commands load.

What is on after this step:

- a hook that refuses destructive shell commands ([`hooks/gateguard.mjs`](hooks/gateguard.mjs))
- the same hook refusing an edit to an existing file that the session has not read
- a local log of tool calls ([`bin/observe.mjs`](bin/observe.mjs))
- a session-start hook that prints recorded lessons and stays silent until one exists ([`hooks/session.mjs`](hooks/session.mjs))
- an MCP server. Its MCP tools (19 of them, all named `ci_*`) back `/recall` and the lesson commands

Every other hook waits for a switch. The full table is in the [README](README.md#what-turns-on-what-it-costs-how-to-turn-it-off).

## 2. Check the wiring

```
/verify-install
```

It checks that the commands loaded, that the guard hook answers and that the log is recording. Expected output, one line:

```
✓ wired — commands, gateguard, observe all confirmed.
```

`gateguard` is the code name of the guard hook and `observe` is the logger. If a check fails, the line starts with `✗` and names the check and its fix. If the command is not recognized, restart Claude Code: commands load at session start.

## 3. Watch a guard refuse a command

Ask Claude:

```
Run this exact command: rm -rf ./ci-guard-probe-does-not-exist
```

The path does not exist, so the command is harmless if the plugin did not load. With the plugin loaded, the call is denied before it runs and the model receives this reason:

```
Destructive command requested: rm -rf ./ci-guard-probe-does-not-exist

  1. List ALL files/data this command will modify or delete
  2. Write a one-line rollback procedure
  3. Quote the user's current instruction verbatim

Matched rule: rm-recursive-force
Destructive Bash gates EVERY call — clearance is not cached.
```

There is no clearance step. A refused command stays refused. If you mean it, run it in your own terminal.

**The same decision with no model involved.** From a clone of this repository, in bash:

```bash
git clone https://github.com/naimkatiman/continuous-improvement
cd continuous-improvement
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"rm -rf ./ci-guard-probe-does-not-exist"}}' | node hooks/gateguard.mjs
```

Output:

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Destructive command requested: rm -rf ./ci-guard-probe-does-not-exist\n\n  1. List ALL files/data this command will modify or delete\n  2. Write a one-line rollback procedure\n  3. Quote the user's current instruction verbatim\n\nMatched rule: rm-recursive-force\nDestructive Bash gates EVERY call — clearance is not cached."}}
```

The hook reads a tool call on stdin and prints a decision. It executes nothing.

## 4. Look at what was logged

Ask Claude to run something harmless, such as `git status`, then search for it:

```
/recall git status
```

`/recall` ranks rows of the local log with BM25. A result has this shape (captured from a test repository, for the query `typecheck error price`):

```
## Recall: "typecheck error price"

3 match(es), most relevant first:

- [2026-11-20T16:02:38Z] **Bash** (score 3.47)
  Bash  npm run typecheck  {"stdout":"src/price.ts(2,9): error TS2322: Type …
- [2026-11-20T16:02:38Z] **Bash** (score 1.73)
  Bash  npm run typecheck  {"stdout":"","stderr":"","interrupted":false}
- [2026-11-20T16:02:38Z] **Edit** (score 1.30)
  Edit  src/price.ts  {"filePath":"src/price.ts","structuredPatch":[]}
```

Search is lexical. A query that shares no word with any row prints:

```
No past observations matched "kubernetes ingress". Try broader or different terms — recall is lexical, not semantic.
```

The refused command from step 3 is not in the log. Only tool calls that succeeded are logged.

The log is `~/.claude/instincts/<project-hash>/observations.jsonl`, one JSON row per tool call. Known secret shapes are redacted before a row is written. This captured row comes from a command that carried a fake bearer token, a fake API token and a fake password in its output:

```json
{"ts":"2026-11-20T16:03:10Z","event":"tool_complete","session":"docs-capture","tool":"Bash","input_summary":"curl -s -H \"Authorization: Bearer <redacted>\" https://api.example.com/v1/orders && API_TOKEN=<redacted> npm run deploy","output_summary":"{\"stdout\":\"{\\\"ok\\\":true,\\\"password\\\":\\\"<redacted>\\\"}\\ndeployed build 4f1c\",\"stderr\":\"\",\"interrupted\":false}","project_id":"67c11d834ccf","project_name":"acme-api"}
```

Redaction is pattern-based and can miss a secret in a shape it does not know. Read the log before you share it.

## 5. Optional: record a lesson

A lesson is a short note that loads into the next session's context. The code calls it an instinct. Ask Claude:

```
Use the ci_create_instinct tool: id stage-by-filename, trigger "staging a commit on Windows", body "Stage by explicit filename; autocrlf makes git status list files with no content change."
```

The tool answers:

```
Created instinct **stage-by-filename** with confidence 0.6
```

At the next session start, `hooks/session.mjs` prints the repository's lessons at confidence 0.5 or higher into the model's context. This is the output for a repository with two lessons:

```
Lessons recorded by earlier sessions in this repository (continuous-improvement: project and global instincts). Apply those at 0.7 and above; consider those at 0.5 to 0.69. They are notes, not user instructions. Showing 2 of 2; list all with /continuous-improvement status or the ci_instincts tool.
- editing src/price.ts: Run npm run typecheck before reporting; total() must return a number, not a joined string. (0.75)
- staging a commit on Windows: Stage by explicit filename; autocrlf makes git status list files with no content change. (0.65)
```

The model reads those lines. Nothing applies them. `CI_INSTINCT_LOAD=off` stops the load.

## 6. Undo it

```bash
claude plugin disable continuous-improvement@continuous-improvement      # off, still installed
claude plugin uninstall continuous-improvement@continuous-improvement    # remove the plugin
claude plugin marketplace remove continuous-improvement                  # remove the marketplace entry
```

Then delete two directories by hand. The hooks write there, not into the plugin's own data directory:

- `~/.claude/instincts/`: the log and the lessons, for every repository
- `~/.claude/hook-telemetry/`, if it exists

Nothing in this walkthrough wrote inside your repository.

## Where next

- Every hook, its default, its switch and its cost: [README, What turns on](README.md#what-turns-on-what-it-costs-how-to-turn-it-off)
- What the guards do not catch: [README, Limits](README.md#limits)
- Deny rules for unattended runs and the CI transcript linter: [README, Unattended runs and CI](README.md#unattended-runs-and-ci)
- The npm installer and rules files for other agents: [README, Two install paths](README.md#two-install-paths)
