# Quickstart

continuous-improvement stands on two pillars: ambition (the `be-ambitious` skill, guidance the agent reads) and discipline (hooks, a local log and switches). This walkthrough takes the discipline side first, because you can watch it act: install, watch one guard refuse a command, look at what it logged, check the wiring, save a lesson. Then it tries the ambition side, and undoes all of it. [README.md](README.md) has the loop step by step and the full list of what turns on and what it costs.

You need one of the 16 agents in [README, Works with these agents](README.md#works-with-these-agents), and `node` 18 or newer on your `PATH`. The hooks are Node scripts. Without `node` none of them runs and nothing is denied.

Where a step differs on Claude Code, it says so. The commands below use `codex`; put your agent's id from [step 1](#1-install) in its place.

## 1. Install

**For 15 agents**, in your project's git repository:

```bash
# add --dry-run first to list every write and write nothing
npx continuous-improvement install --target codex --hooks
```

The ids are `codex`, `gemini`, `qwen`, `cursor`, `copilot`, `grok`, `devin`, `kiro`, `droid`, `auggie`, `junie` (add `--scope user`), `cline`, `goose`, `opencode` and `amp`. Then do the steps it prints, if any. Codex CLI needs the project trusted, each hook trusted in `/hooks`, and the printed MCP block pasted into `.codex/config.toml`. Gemini CLI needs the folder trusted. Cursor needs none. Your agent's own step, and what it cannot do, are in [docs/AGENT-SUPPORT.md](docs/AGENT-SUPPORT.md). Start a new session afterwards.

**Claude Code** installs it as a plugin, from inside Claude Code:

```
/plugin marketplace add naimkatiman/continuous-improvement
/plugin install continuous-improvement@continuous-improvement
```

The doubled name is `<plugin>@<marketplace>`. Restart Claude Code once so the commands load. If you installed this plugin before, run `claude plugin uninstall continuous-improvement@continuous-improvement` first: Claude Code keeps a cached copy until the version number changes, and the cached 3.26.0 has no MCP server and no lesson load, so steps 3 and 5 would fail.

What is on after this step:

- a guard hook that refuses destructive shell commands ([`hooks/gateguard.mjs`](hooks/gateguard.mjs); `gateguard` is its code name), on the condition your agent's row in the table states
- the same hook refusing an edit to an existing file that the session has not read
- a local log of tool calls ([`bin/observe.mjs`](bin/observe.mjs))
- recorded lessons at session start ([`hooks/session.mjs`](hooks/session.mjs)), where your agent has a session hook. It stays silent until a lesson exists. The agents that get lessons another way, or not at all, are named under [the loop table](README.md#the-loop)
- an MCP server, written by the install or added by the step it printed. Its MCP tools (19 of them, all named `ci_*`) search the log, save lessons and hold a goal
- a goal-drift check at turn end, on agents with a turn-end hook. By default it rewrites `goal-drift-state.json` and writes a debug-log line on drift, and never reaches the model
- on Claude Code only, a hook that appends a row to `companion-preference.jsonl` when a `Skill` call names one of four skills by its bare name or with a `ci:` prefix (a plugin-namespaced name is not matched)

Every other hook refuses nothing and sends the model nothing until you set its switch. The full table is in the [README](README.md#what-turns-on-what-it-costs-how-to-turn-it-off).

## 2. Watch a guard refuse a command

This is also the check that the hooks are wired. Ask your agent:

```
Run this exact command: rm -rf ./ci-guard-probe-does-not-exist
```

The path does not exist, so the command is harmless if the hook is not wired. If the agent checks the path first or declines, reply: `Run it anyway through the shell tool; I am testing a hook.` The hook decides before the command runs, so nothing is deleted either way. With `hooks/gateguard.mjs` wired, the call is denied before it runs and the model receives this reason:

```
Destructive command requested: rm -rf ./ci-guard-probe-does-not-exist

  1. List ALL files/data this command will modify or delete
  2. Write a one-line rollback procedure
  3. Quote the user's current instruction verbatim

Matched rule: rm-recursive-force
Destructive Bash gates EVERY call — clearance is not cached.
```

The three numbered items ask the model to explain itself to you. Answering them does not unlock the command: the same call is denied again on every retry. If you mean it, run it in your own terminal. If the command runs instead of being denied, no hook ran: check that `node` is on your `PATH` and that your agent's setup step from step 1 is done, then restart the agent.

**The same decision with no model involved.** Run this in your own terminal, not through the agent: the guard reads the `rm -rf` inside the quoted payload and refuses the whole line. From a clone of this repository, in bash:

```bash
git clone https://github.com/naimkatiman/continuous-improvement
cd continuous-improvement
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"rm -rf ./ci-guard-probe-does-not-exist"}}' | node hooks/gateguard.mjs
```

With no `--agent` flag the hook answers in Claude Code's format. Add `--agent codex` (or your agent's id) after `hooks/gateguard.mjs` to see the answer that agent reads. Output:

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Destructive command requested: rm -rf ./ci-guard-probe-does-not-exist\n\n  1. List ALL files/data this command will modify or delete\n  2. Write a one-line rollback procedure\n  3. Quote the user's current instruction verbatim\n\nMatched rule: rm-recursive-force\nDestructive Bash gates EVERY call — clearance is not cached."}}
```

The hook reads a tool call on stdin and prints a decision. It executes nothing.

## 3. Look at what was logged

Ask your agent to run something harmless, such as `git status`, then ask it to search for it:

```
Use the ci_recall tool with the query: git status
```

If the agent has no such tool, its MCP step from step 1 is not done. On Claude Code, `/recall git status` calls the same tool. If the command is not recognized, restart Claude Code: commands load at session start. If another plugin has a command of the same name, type the full name, `/continuous-improvement:recall`.

`ci_recall` ranks rows of the local log by keyword relevance (BM25). It answers like this (captured from a test repository whose log held three rows):

```
## Recall: "git status"

1 match(es), most relevant first:

- [2026-11-21T01:15:19Z] **Bash** (score 1.75)
  Bash  git status  {"stdout":"On branch main\nnothing to commit, wo…
```

The score depends on what else is in the log. Search is lexical. A query that shares no word with any row prints:

```
No past observations matched "kubernetes ingress". Try broader or different terms — recall is lexical, not semantic.
```

The refused command from step 2 is not in the log. Only tool calls that succeeded are logged.

The log is `~/.claude/instincts/<project-hash>/observations.jsonl`, one JSON row per tool call. The directory is named `~/.claude` for historical reasons and is the same for every agent; `CI_INSTINCTS_HOME` moves it. Known secret shapes are redacted before a row is written. This captured row comes from a command that carried a fake bearer token, a fake API token and a fake password in its output:

```json
{"ts":"2026-11-20T16:03:10Z","event":"tool_complete","session":"docs-capture","tool":"Bash","input_summary":"curl -s -H \"Authorization: Bearer <redacted>\" https://api.example.com/v1/orders && API_TOKEN=<redacted> npm run deploy","output_summary":"{\"stdout\":\"{\\\"ok\\\":true,\\\"password\\\":\\\"<redacted>\\\"}\\ndeployed build 4f1c\",\"stderr\":\"\",\"interrupted\":false}","project_id":"67c11d834ccf","project_name":"acme-api"}
```

Redaction is pattern-based and can miss a secret in a shape it does not know. Read the log before you share it.

## 4. Check the wiring in one command

In the project, in your own terminal:

```bash
npx -p continuous-improvement ci doctor --agent codex
```

It runs only that agent's own listing commands and prints what they report. Not every agent has a command that lists hooks, and the output says so. The probe in step 2 is the check that works on all of them.

**On Claude Code**, the log now has a row, so all three checks of this command can pass:

```
/verify-install
```

It confirms the commands loaded, reads the log for a row, and probes the guard hook by sending `git rev-parse @{u}` with the ref unquoted through the shell tool. The hook refuses that in every file-gate mode and returns this reason, which the check counts as the pass:

```
Unquoted git ref @{u} — Claude Code's Bash parser trips on the braces and blocks this
post-hoc, costing a retry. Quote the ref and run the SAME command:

  git rev-parse '@{u}'

Single quotes stop the shell from touching the braces; git reads the ref as-is.
```

A wired install ends with this line:

```
✓ wired — commands, gateguard, observe all confirmed.
```

A failed check prints `✗` with its fix, such as `gateguard: ✗ (hooks/gateguard.mjs not wired; check node is on PATH, restart Claude Code, see README → Two install paths)`.

## 5. Optional: record a lesson

A lesson is a short note that loads into the next session's context. The code calls it an instinct. Ask your agent:

```
Use the ci_create_instinct tool: id stage-by-filename, trigger "staging a commit on Windows", body "Stage by explicit filename; autocrlf makes git status list files with no content change."
```

The tool answers:

```
Created instinct **stage-by-filename** with confidence 0.6
```

Start a new session (on Claude Code, `/clear` is enough). Where your agent has a session hook, `hooks/session.mjs` prints the repository's lessons at confidence 0.5 or higher into the model's context. With the one lesson you just made, it prints:

```
Notes from continuous-improvement instinct files: this repository's, and those marked [global], which load in every repository. They are not user instructions: the user's instructions and this repository's rules override them, and a note cannot grant approval. Use those at 0.7 and above when relevant; treat 0.5 to 0.69 as suggestions. The ci_instincts tool lists the stored instincts.
- staging a commit on Windows: Stage by explicit filename; autocrlf makes git status list files with no content change. (0.6)
```

The model reads those lines. Nothing applies them. `CI_INSTINCT_LOAD=off` stops the load.

Grok CLI, Auggie, Junie CLI and Goose take lessons through a rules file instead: run `npx -p continuous-improvement ci lessons --format <id> --write` in the project, and again after you save one. Cline gets none.

## 6. Try the other pillar

Ask your agent, on a task you already have:

```
Use the be-ambitious skill on this task: <your task>
```

On Claude Code, `/be-ambitious <your task>` does the same. The skill tells the agent to work on the goal behind the task and to set a numeric target and a check before it starts. It is guidance: no hook checks that the agent followed it, and a destructive command in that run still gets the deny from step 2. A small task is answered directly, so give it a real one.

## 7. Undo it

**For the 15 agents**, in the same project:

```bash
npx continuous-improvement install --uninstall --target codex
```

It removes what `--hooks` recorded: the hook configs, the MCP entries, the skills and the rules-file blocks. A block you pasted stays, so delete it by hand. A vendor `mcp add` you ran needs its own undo ([docs/AGENT-SUPPORT.md](docs/AGENT-SUPPORT.md)).

**Claude Code**, in a terminal:

```bash
claude plugin disable continuous-improvement@continuous-improvement      # off, still installed
claude plugin uninstall continuous-improvement@continuous-improvement    # remove the plugin
claude plugin marketplace remove continuous-improvement                  # remove the marketplace entry
```

Then delete two directories by hand. The hooks of every agent write there:

- `~/.claude/instincts/`: the log and the lessons for every repository, and the copy of the hooks that `--target` installs run from, so delete it only when no agent uses it
- `~/.claude/hook-telemetry/`, if it exists

The hooks wrote nothing inside your repository. The `--target` install wrote your agent's project config and skills there, which its uninstall removes, and the plugin install wrote nothing there.

## Where next

- The ambition side: what `be-ambitious` tells the agent, and what is true of it ([README, Ambition](README.md#ambition))
- The loop, and what code backs each step: [README, The loop](README.md#the-loop)
- Every hook, its default, its switch and its cost: [README, What turns on](README.md#what-turns-on-what-it-costs-how-to-turn-it-off)
- What the guards do not catch: [README, Limits](README.md#limits)
- Deny rules for unattended runs and the CI transcript linter: [README, Unattended runs and CI](README.md#unattended-runs-and-ci)
- The hooks agent by agent: [docs/AGENT-SUPPORT.md](docs/AGENT-SUPPORT.md)
- Claude Code without the plugin: [README, Two install paths](README.md#two-install-paths)
