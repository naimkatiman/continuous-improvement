<!-- README structure rationale: docs/plans/2026-11-20-frontier-model-refresh.md. Evidence: docs/audits/2026-11-20-frontier-model-audit.md. Earlier structures: docs/plans/2026-08-22-readme-still-useful.md, docs/plans/2026-06-28-readme-progressive-disclosure.md. -->

# continuous-improvement

A Claude Code plugin: hooks that refuse destructive shell commands and blind edits, a local searchable log of tool calls, and recorded lessons that load at session start.

[![npm version](https://img.shields.io/npm/v/continuous-improvement)](https://www.npmjs.com/package/continuous-improvement)
[![npm downloads](https://img.shields.io/npm/dm/continuous-improvement)](https://www.npmjs.com/package/continuous-improvement)
[![GitHub Action](https://img.shields.io/badge/GitHub%20Action-marketplace-blue)](https://github.com/marketplace/actions/ai-agent-discipline-linter)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Claude Code ships the mechanisms: hooks, permission rules, memory and transcripts. What a hook should refuse, and what a session should keep about its tool calls, is left to you. This plugin is one set of answers. It makes no model calls and no network calls, and one command disables all of it.

Five-minute walkthrough: [QUICKSTART.md](QUICKSTART.md). Site: [continuous-improvement.dev](https://continuous-improvement.dev). Changes: [CHANGELOG.md](CHANGELOG.md).

## What this adds that Claude Code does not do by itself

1. **Refuses destructive shell commands, on by default.** `rm -rf`, `git reset --hard`, `git clean -fdx`, force pushes, `git branch -D`, `git stash drop`, `find -delete`, `DROP TABLE`, `Remove-Item -Recurse` and similar are denied on every call, and the reason names the rule that matched. The Bash, PowerShell and Monitor tools are treated alike. It is a hook deny, so it holds in every permission mode, bypass included. File: [`hooks/gateguard.mjs`](hooks/gateguard.mjs), rules in [`lib/destructive-bash.mjs`](lib/destructive-bash.mjs).
2. **Branch and config rules that deny once you set an environment variable to `block`.** With `CLAUDE_CI_HOOKPACK_GATE=block`: a push to `main`, `master` or `release/*`, and a commit that stages more than 15 files ([`hooks/hook-pack.mjs`](hooks/hook-pack.mjs)). With `CI_CONFIG_GUARD=block`: a change to the files that wire the guardrails, such as `.claude/settings.json`, `.mcp.json` and `hooks.json` ([`hooks/config-guard.mjs`](hooks/config-guard.mjs)). By default both only write a debug-log line.
3. **Runs your typecheck when a turn ends and returns the failure to the model.** Opt-in. With `CLAUDE_TYPECHECK_GATE=block`, a failing typecheck on changed TypeScript files goes back to the model before the turn ends. File: [`hooks/typecheck-stop.mjs`](hooks/typecheck-stop.mjs).
4. **Keeps a local, redacted log of tool calls and searches it.** One row per tool call, per repository, written with no model call and no network call ([`bin/observe.mjs`](bin/observe.mjs)). `/recall` ranks the rows by keyword relevance (BM25) through the `ci_recall` MCP tool ([`bin/mcp-server.mjs`](bin/mcp-server.mjs)).
5. **Loads recorded lessons at session start.** A lesson is a short note that the model writes when you run `/continuous-improvement`, or that you ask Claude to create with the `ci_create_instinct` tool. Up to 10, recorded for the repository or marked global, are printed into the new session's context. A fresh install has none, so nothing is printed. File: [`hooks/session.mjs`](hooks/session.mjs).
6. **Reports git state as a command with exit codes.** `npx -p continuous-improvement ci-reconcile` prints branch, upstream, in-progress operations, working-tree drift, stashes and worktrees. It exits 0 when clear, 1 on a blocker and 2 outside a repository. `/reconcile` has the model run the copy in the plugin bundle, so it needs no npm step. File: [`bin/reconcile.mjs`](bin/reconcile.mjs).
7. **Scores an agent transcript in CI.** A GitHub Action reads a Claude Code transcript and reports edits made with no earlier lookup and code changes with no test or build run. Files: [`action.yml`](action.yml), [`bin/lint-transcript.mjs`](bin/lint-transcript.mjs).

One more default is an overlap, not an addition: the same guard hook denies an `Edit` or `Write` to an existing file that the session has not read (a blind edit). Claude Code's Edit tool already checks for a prior read. `CI_GATEGUARD_FILE_GATE=off` turns the hook's check off.

The plugin also ships 28 skills and 29 slash commands. Those are prose the model reads. Only the hooks, the MCP server and the command-line tools execute.

What it does not do: it does not make the model better at code, it does not apply a lesson for you, it does not check your work unless you switch the typecheck gate on, and it is not a sandbox.

## What Claude Code already does

Use the native feature first. The third column is what each one leaves open. The plugin fills some of these gaps and not others, as noted.

| Claude Code feature | What it covers | What it leaves open |
|---|---|---|
| [Plan mode](https://code.claude.com/docs/en/permission-modes) | Blocks edits until you approve the plan | A plan file in the repository |
| [Permission modes and the auto-mode classifier](https://code.claude.com/docs/en/permission-modes) | By default blocks force pushes, `git reset --hard`, `git clean -fd`, `git stash drop`, deploys and migrations | Branch policy. The classifier allows "pushing to any branch of the repository you're working in, including the default branch" |
| [Permission deny rules](https://code.claude.com/docs/en/permission-modes) | "Deny rules block in every mode, including `bypassPermissions`" | The rules. You write them |
| [`permissions.blockWritesOutsideWorkingDirectories`](https://code.claude.com/docs/en/permission-modes) | `Write`, `Edit` and `NotebookEdit` refuse paths outside the working directories (v2.1.314 and later) | Shell commands. The plugin's opt-in wrong-repository lock (a hook that denies a file-tool write outside the session's repository) does not cover them either |
| [Hooks](https://code.claude.com/docs/en/hooks) | The enforcement mechanism. A hook deny holds in every permission mode | Policy content. Everything this plugin enforces is a hook you could write yourself |
| [Auto memory and `CLAUDE.md`](https://code.claude.com/docs/en/memory) | On by default in local sessions. Loads the first 200 lines or 25KB of `MEMORY.md` into every conversation and saves your corrections | A record of tool calls and ranked search over it. Memory is "context, not enforced configuration" |
| [Checkpoints and `/rewind`](https://code.claude.com/docs/en/how-claude-code-works) | Per-edit file undo, within and across resumed sessions | Remote side effects. It is not a backup. The plugin does not fill this |
| [Worktrees](https://code.claude.com/docs/en/worktrees), [subagents](https://code.claude.com/docs/en/sub-agents), [workflows](https://code.claude.com/docs/en/workflows) | Isolation, per-agent tool scoping, fan-out, verify-and-vote | Ownership between sessions you launched separately in one checkout. The plugin does not fill this; `ci-reconcile` only reports git state |
| [`/goal`](https://code.claude.com/docs/en/goal) | A fresh-model completion check after every turn | It judges the transcript and runs no command |
| [`/code-review` and `/security-review`](https://code.claude.com/docs/en/ultrareview) | Bug-focused local review and multi-agent cloud review | Blocking a merge on the findings. The plugin does not fill this |
| [`/verify` and `/run`](https://code.claude.com/docs/en/skills) | Observing the running app | Running the typecheck, test and lint ladder as PASS or FAIL |
| Read-before-edit in the [Edit tool](https://code.claude.com/docs/en/tools-reference) | A harness check that the file was read first, under model and prompt conditions | Whether the read was enough. The plugin's blind-edit gate repeats the check from a hook, which is an overlap |

The plugin overlaps Claude Code in five places. The destructive-command deny overlaps the auto-mode classifier, which already blocks several of the same git commands; the hook also holds in the other permission modes, bypass included, and names the rule it matched. The blind-edit gate overlaps the Edit tool's read check, the wrong-repository lock overlaps `blockWritesOutsideWorkingDirectories`, and the lesson store overlaps auto memory. A share of the prose skills overlaps too: an [audit of all 28 skills](docs/audits/2026-11-20-frontier-model-audit.md) against current Claude Code ended with none kept as is, 14 to slim, 4 to merge and 10 to retire. All 28 still ship in this version and count toward the listing cost below. Judge this plugin on the hooks and the log.

## Who it is for, and who should skip it

It fits if you:

- run Claude Code unattended, or in auto or bypass mode, in a repository where a wrong `git reset --hard` or `rm -rf` costs real work
- use the PowerShell tool on Windows and want the same refusals there as in Bash
- want a searchable record of which tools ran in a repository, kept on your own disk
- want CI to flag an agent run that edited without looking or finished without running a test

Skip it if you:

- want no added process starts. Every tool call starts at least one Node process, and a shell command starts four
- already maintain your own permission deny rules or `PreToolUse` hooks. This is the same mechanism with someone else's rules
- do not want 41 more names in the listing Claude Code carries on every turn (28 skills and 29 commands, 16 of which share a name)
- expect it to make the model smarter. The skills are text and the lessons are notes

## Try it in five minutes

You need `node` 18 or newer on your `PATH`. The hooks are Node scripts and need nothing else.

**1. Install.** Inside Claude Code:

```
/plugin marketplace add naimkatiman/continuous-improvement
/plugin install continuous-improvement@continuous-improvement
```

The doubled name is `<plugin>@<marketplace>`. Restart Claude Code once so the commands load.

There is also an npm installer. It installs a smaller, different set with no guards (see [Two install paths](#two-install-paths)). If you don't know which to pick, use the plugin.

**2. Watch a guard refuse a command.** This is also the check that the hooks are wired. Ask Claude:

```
Run this exact command: rm -rf ./ci-guard-probe-does-not-exist
```

The path does not exist, so the command is harmless if the plugin is not loaded. With the plugin loaded, the guard hook, `hooks/gateguard.mjs`, denies the call before it runs, and the model receives this reason (captured on v3.26.0):

```
Destructive command requested: rm -rf ./ci-guard-probe-does-not-exist

  1. List ALL files/data this command will modify or delete
  2. Write a one-line rollback procedure
  3. Quote the user's current instruction verbatim

Matched rule: rm-recursive-force
Destructive Bash gates EVERY call — clearance is not cached.
```

The three numbered items ask the model to explain itself to you. Answering them does not unlock the command: the same call is denied again on every retry. If you mean it, run it in your own terminal. If the command runs instead of being denied, no hook ran: check that `node` is on your `PATH`, then restart Claude Code. [QUICKSTART.md](QUICKSTART.md) goes on from here: the same decision from the hook file with no model involved, a search of the log, and a lesson.

**3. Check all three layers in one command.** Ask Claude to run `git status`, so the log has a row, then run:

```
/verify-install
```

It confirms the commands loaded, sends `git rev-parse @{u}` with the ref unquoted through the shell tool (the guard hook refuses that in every file-gate mode and prints the quoted command instead), and reads the log for a row. A wired install ends with this line:

```
✓ wired — commands, gateguard, observe all confirmed.
```

A failed check prints `✗` with its fix, such as `gateguard: ✗ (hooks/gateguard.mjs not wired; check node is on PATH, restart Claude Code, see README → Two install paths)`.

**4. Turn it off.** In a terminal, `claude plugin disable continuous-improvement@continuous-improvement` switches the whole plugin off without removing it. Removal steps are under [Two install paths](#two-install-paths).

## What turns on, what it costs, how to turn it off

The plugin registers 13 hook scripts and one MCP server. On after install: the destructive-command deny (with the `@{u}` quoting rule below the table), the blind-edit gate, the log, the lesson load (silent until a lesson at 0.5 or higher exists) and the MCP server with 19 tools. Two more hooks run without reaching the model: one appends a row to `companion-preference.jsonl` when a `Skill` call names one of four skills, and the goal-drift check rewrites `goal-drift-state.json` at every turn end. Every other hook waits for a switch, which is an environment variable set where Claude Code starts. "Debug log only" means a stderr line from a hook that exits 0, which [Claude never sees](https://code.claude.com/docs/en/hooks).

| What it does | File, event | Default | Switch | What reaches the model |
|---|---|---|---|---|
| Denies destructive commands through Bash, PowerShell and Monitor | `hooks/gateguard.mjs`, `PreToolUse` | **On**, every match | None. Disable the plugin | A deny reason of about 300 characters |
| Denies an `Edit`, `Write` or `MultiEdit` of an existing file that this session's log does not show it looked at: no Read or edit of that path, and no Bash, PowerShell, Grep or Glob call naming the file. New files always pass | `hooks/gateguard.mjs`, `PreToolUse` | **On** | `CI_GATEGUARD_FILE_GATE=off`. `CI_GATEGUARD_EXCLUDE=<path fragments>` skips matching paths | A two-line reason, only on a blind edit |
| Denies a file-tool write whose absolute path is outside the session's repository | `hooks/gateguard.mjs`, `PreToolUse` | Off | `CI_GATEGUARD_TARGET_LOCK=block` | A deny reason |
| Flags a push to `main`, `master` or `release/*`, and a commit staging more than 15 files | `hooks/hook-pack.mjs`, `PreToolUse` | Debug log only | `CLAUDE_CI_HOOKPACK_GATE=block` or `off` | In `block`, a one-line deny reason |
| Flags a change to guardrail wiring: `.claude/settings.json`, `.mcp.json`, `hooks.json`, `claude plugin` and `claude mcp` commands | `hooks/config-guard.mjs`, `PreToolUse` | Debug log only | `CI_CONFIG_GUARD=block` or `off`. `CI_CONFIG_GUARD_ALLOW=true` lets one call through | In `block`, a deny reason |
| Logs a row when a `Skill` call names `tdd-workflow`, `verification-loop`, `context-budget` or `ralph`, each of which has a counterpart in an optional companion plugin (listed under [Reference](#reference)) | `hooks/companion-preference.mjs`, `PreToolUse` | On, allows the call | The key `continuous_improvement.companion_preference` in `~/.claude/settings.json`. `strict-companions` makes it deny | Nothing by default |
| Appends one redacted row per tool call to the local log | `bin/observe.mjs`, `PostToolUse` | **On** | None. Disable the plugin | Nothing |
| Suggests a skill when a prompt matches one of 5 patterns | `hooks/route-prompt.mjs`, `UserPromptSubmit` | Off | `CI_ROUTE_PROMPT=1` | A reminder of about 160 characters on a match |
| Injects the top 3 log hits on the first prompt of a session | `hooks/recall-briefing.mjs`, `UserPromptSubmit` | Off | `CLAUDE_RECALL_BRIEFING=1` | One reminder per session |
| Prints the repository's lessons into context | `hooks/session.mjs`, `SessionStart` | **On**, silent with no lessons | `CI_INSTINCT_LOAD=off` | At most 10 lines and 1,500 characters |
| Writes a reminder to run `/continuous-improvement` | `hooks/session.mjs`, `SessionEnd` | Debug log only | None | Nothing |
| Sends back a reply of 600 or more characters that lacks the headings `What has been done`, `What is next` and `Recommendation` | `hooks/three-section-close.mjs`, `Stop` | Off | `CLAUDE_THREE_SECTION_CLOSE=1` | A block reason of about 360 characters |
| Scores recent tool calls against the `## Goal` in `task_plan.md` | `hooks/goal-drift-stop.mjs`, `Stop` | Debug log only | `CLAUDE_GOAL_DRIFT_GATE=block` or `off` | In `block`, a drifted wrap-up is sent back |
| Suggests saving a verified Workflow run as a draft lesson | `hooks/workflow-distill.mjs`, `Stop` | Off | `CLAUDE_WORKFLOW_DISTILL_NUDGE=on` | Nothing. Debug log only, even when on |
| Runs the project typecheck when TypeScript files changed | `hooks/typecheck-stop.mjs`, `Stop` | Off | `CLAUDE_TYPECHECK_GATE=block` or `warn` | In `block`, the last 15 lines of the output |
| Reminds about query cost when SQL or migration files changed | `hooks/query-cost-nudge.mjs`, `Stop` | Off | `CLAUDE_QUERY_COST_NUDGE=on` | One reminder per session |

The guard hook also denies an unquoted git `@{u}`-style ref and prints the quoted command to run instead. That rule has no switch.

**Process starts.** Each registration is one Node process: 14 registrations across the 13 scripts. That is 1 start for a Read, Grep, Glob or MCP tool call (the logger), 2 for a Skill call, 3 for an Edit or Write, 4 for a Bash, PowerShell or Monitor command, 2 for each prompt, 5 for each turn end, and 1 each for session start and end. A hook that is switched off still starts, reads its switch and exits.

**Context.** The hooks add text only when one acts: a deny reason, or the lesson lines at session start. The standing cost is the listing. The 28 skills and 29 commands (41 names, 16 shared) carry about 16,000 characters of names and descriptions, the 3 bundled agent definitions another 574, and the MCP server adds 19 tool definitions (8,279 characters as the server serializes them). At 4 characters per token, with no tokenizer run, that is about 2,380 to 4,000 tokens for the listing, depending on how Claude Code lists the 16 shared names, and about 2,070 for the MCP tools. Claude Code applies its own listing budget and can load MCP tools on demand, so your number can be lower: `claude plugin details continuous-improvement@continuous-improvement` prints the projected token cost for your client.

**Model calls and network.** None, from any hook, the logger or the MCP server. The package has no runtime dependencies.

**Disk.** State goes under `~/.claude/instincts/<project-hash>/`, and the three-heading check writes `~/.claude/hook-telemetry/`. The log rotates at 10,000 rows and keeps the 10 newest archives. No hook writes inside your repository. Commands you run can: `/planning-with-files` and the `ci_plan_init` tool write `task_plan.md`, `findings.md` and `progress.md`, and `/grill-with-docs` updates `CONTEXT.md` and ADRs.

**One switch for everything:**

```bash
claude plugin disable continuous-improvement@continuous-improvement   # off, still installed
claude plugin enable continuous-improvement@continuous-improvement    # back on
```

## Limits

- **A refused command has no clearance route.** The model cannot run it. If you mean it, run it yourself.
- **The deny matches command text against a fixed rule list.** It is not a sandbox. It also refuses some text that only mentions a command: a heredoc body that contains `git reset --hard` or another pattern on the fallback list is denied, though the body is data.
- **File writes through shell redirection are not gated.** `echo "..." > src/price.ts` passes the blind-edit gate and the wrong-repository lock, and the transcript linter does not count it as a write.
- **Warn modes reach nobody.** The push gate, the config guard and the goal-drift check default to a debug-log line. Treat them as off until you set `block`.
- **The opt-in rules match text too.** In `block` mode the config guard passes `python -c "open('.claude/settings.json','w').write('{}')"`, because it scans command text for known write forms. The commit gate counts staged files only.
- **The wrong-repository lock covers the file tools and absolute paths only.** Relative paths and shell commands pass.
- **The typecheck gate is TypeScript only.** It needs `tsconfig.json` at the project root, allows after a 25-second timeout, and in `block` mode blocks again at every turn end while the error stands.
- **Redaction is pattern-based.** A secret in a shape the patterns do not know is stored as typed: `mysql -u admin -pFAKEpass99` kept its password in our test. Rows written by earlier versions are not rewritten.
- **The log is partial.** Only tool calls that reach `PostToolUse` are logged, so denied and failed calls are absent. Prompts are never logged. Search reads the current log file, not the rotated archives, and it is lexical.
- **Lessons are notes.** At most 10 lines and 1,500 characters load, lessons under 0.5 confidence are not shown, and nothing enforces them.
- **Goal drift needs a goal file.** It does not score until `task_plan.md` has a `## Goal` section (or a `goal.md` sits in the repository's state directory). It still rewrites `goal-drift-state.json` at each turn end unless `CLAUDE_GOAL_DRIFT_GATE=off`. It scores keyword overlap, and it reads the repository's recent calls from any session.
- **Hooks need `node` on `PATH`.** Without it no hook runs and nothing is denied. CI runs Linux on Node 18, 20 and 22, the captures in this README were taken on Windows 11, and macOS has no CI job.
- **Two commands need a clone of this repository.** `/harvest` and `/companion-preference` call scripts that neither install path ships.

## Memory

Three separate things. None of them is a model that learns.

**1. A log.** [`bin/observe.mjs`](bin/observe.mjs) appends one row per tool call to `~/.claude/instincts/<project-hash>/observations.jsonl`: time, session id, tool, the first 500 characters of the input and the first 200 of the output. Known secret shapes are redacted before the row is written: private key blocks, AWS access key ids, bearer tokens, a password in a URL, `curl -u` credentials, `NAME=value` assignments whose name ends in KEY, SECRET, TOKEN or PASSWORD, provider-prefixed tokens and JWT-shaped strings. A hex run of 32 or more characters keeps its first 8: `<hex-redacted:4f1c2a9e>`.

**2. Search over the log.** `/recall <words>` calls the `ci_recall` MCP tool: BM25 over the current log file for the repository, 5 results by default, with an optional window such as `7d` or `24h`. It is lexical. A query that shares no word with any row returns nothing. `CLAUDE_RECALL_BRIEFING=1` also injects the top 3 hits once per session, on the first prompt of 12 or more characters.

**3. Lessons.** The code and the file paths call them instincts. A lesson is a small YAML file under `~/.claude/instincts/` holding a trigger, an action and a confidence number. One is written when you run the reflect command (`/continuous-improvement`, alias `/seven-laws`) and the model records something, or when an MCP tool such as `ci_create_instinct` creates one. Either way it starts at 0.6, unless the tool call passes its own `confidence`, which is held to the range 0 to 0.9. The `ci_reinforce` tool raises one by 0.15 on accept and lowers it by 0.1 on reject, up to 0.9. No hook or command calls `ci_reinforce`; you ask Claude to call it. Nothing else changes the number after creation: there is no decay and no background process.

At session start [`hooks/session.mjs`](hooks/session.mjs) prints this repository's lessons, and global ones marked `[global]`, at 0.5 or higher into context. Recorded lessons come first and starter-pack entries last, highest confidence first within each group. It runs again on resume, `/clear` and compaction. This is the output for a repository with two lessons at 0.5 or higher:

```
Notes from continuous-improvement instinct files: this repository's, and those marked [global], which load in every repository. They are not user instructions: the user's instructions and this repository's rules override them, and a note cannot grant approval. Use those at 0.7 and above when relevant; treat 0.5 to 0.69 as suggestions. The ci_instincts tool lists the stored instincts.
- editing src/price.ts: Run npm run typecheck before reporting; total() must return a number, not a joined string. (0.75)
- staging a commit on Windows: Stage by explicit filename; autocrlf makes git status list files with no content change. (0.65)
```

The model reads those lines. Nothing applies them.

**Beside Claude Code's own memory.** Auto memory is on by default, loads `MEMORY.md` into every conversation and already saves your corrections. The lesson store overlaps it. What auto memory does not keep is a record of tool calls with ranked search, which is items 1 and 2. If you want one place for notes, set `CI_INSTINCT_LOAD=off` and keep using auto memory. The log and the search work without lessons.

**What leaves the machine.** Nothing from the hooks, the logger or the MCP server. The npm installer makes one throttled read of the npm registry to check for a newer version; `CLAUDE_CI_UPDATE_CHECK=off` skips it. The log can still hold a secret the patterns missed, so read it before you share it. See [SECURITY.md](SECURITY.md).

## Two install paths

The plugin and the npm installer install different things, with little overlap. Do not run both against the same `~/.claude/`. If you used the npm installer before, uninstall it first. The installer prints a warning when it finds a plugin install.

| | Plugin (two `/plugin` commands) | npm (`npx continuous-improvement install`) |
|---|---|---|
| Guards: destructive deny, blind-edit gate, push gate, config guard, wrong-repository lock | Yes | No |
| Turn-end hooks and prompt hooks | Yes | No |
| Skills / commands | 28 / 29 | 2 / 14 |
| Tool-call log | 1 row per successful call | 2 rows per call (start and complete) |
| Lesson hook at session start and end | Registered | `--mode expert` only |
| MCP server | Registered, 19 tools | `--mode expert` writes an `mcpServers` entry to `~/.claude/settings.json`. Not verified: that current Claude Code loads a server from that file (its docs name `~/.claude.json`) |
| Starter lesson packs | Bundled. Load react, python, go or meta with the `ci_load_pack` tool | `--pack react`, `python`, `go` (8 lessons each) or `meta` (2) |
| Rules files for other agents | No | `--target gemini,codex,cursor,windsurf,zed,aider,copilot` |
| Where it lives | Claude Code's plugin cache | `~/.claude/skills`, `~/.claude/commands`, `~/.claude/instincts`, `~/.claude/settings.json` |

**Update.** Plugin: `claude plugin marketplace update continuous-improvement`, then `claude plugin update continuous-improvement@continuous-improvement`. The new version loads in your next session, or after `/reload-plugins`. Claude Code keeps a cached plugin until its version number changes, so an install made before the changes listed under Unreleased in [CHANGELOG.md](CHANGELOG.md) (among them the MCP server registration, the blind-edit gate and the lesson load) gets them with the first release that raises the version. npm: run the same `npx` command again. With `--mode expert`, run `npx continuous-improvement install --uninstall` first, because a re-run keeps the existing MCP server entry and its old path.

**Uninstall the plugin.**

```bash
claude plugin uninstall continuous-improvement@continuous-improvement
claude plugin marketplace remove continuous-improvement
```

Then delete `~/.claude/instincts/` and `~/.claude/hook-telemetry/` by hand. The hooks write there, not into the plugin's own data directory. `~/.claude/instincts/` holds the log and the lessons for every repository. Delete `task_plan.md`, `findings.md` and `progress.md` from a project if you asked for them.

**Uninstall the npm install.** Run `npx continuous-improvement install --uninstall`. This removes both skills, the 14 commands, the logger, the session hook, their rows in `~/.claude/settings.json` and the `mcpServers.continuous-improvement` entry. It keeps `~/.claude/instincts/` and says so. It also leaves `~/.claude/.continuous-improvement-staging/`, empty `commands` and `skills` directories, empty hook arrays in `settings.json`, and any rules file that `--target` wrote into a project. Delete those by hand.

## Unattended runs and CI

In an unattended run nobody reads a debug log, so set the rules you want to `block` in the environment Claude Code starts from:

```bash
export CLAUDE_CI_HOOKPACK_GATE=block     # deny a push to main, master, release/* and a commit staging more than 15 files
export CI_CONFIG_GUARD=block             # deny changes to settings, MCP config, hooks and plugin wiring
export CI_GATEGUARD_TARGET_LOCK=block    # deny file-tool writes outside the session's repository
export CLAUDE_TYPECHECK_GATE=block       # return a failing typecheck to the model before the turn ends
```

The first three are hook denies, so they hold in bypass mode. The fourth holds the turn open. What the model receives for `git push origin main` with the push gate on, and for a type error at turn end with the typecheck gate on:

```
Direct push to protected branch "main" — open a feature branch + PR instead.

Typecheck FAILED on changed TS files — fix before ending the turn:
src/price.ts(2,9): error TS2322: Type 'string' is not assignable to type 'number'.
```

**Transcript linter.** The GitHub Action scores a finished agent run:

```yaml
- uses: naimkatiman/continuous-improvement@v3
  with:
    transcript-path: agent-log.jsonl
    strict: true
```

It reads a Claude Code transcript (`~/.claude/projects/<project>/<session>.jsonl`), this plugin's `observations.jsonl` (input `observations-path`) or flat tool events. It reports an edit with no earlier lookup, more than 5 consecutive edits, code changes with no test or build run, and more than 8 distinct files edited. Outputs are `violations`, `score` (0 to 100) and `report` (Markdown). `strict: true` fails the step on any violation, HIGH or MEDIUM: a run whose only finding is more than 8 distinct files edited fails it. Run it locally with `npx -p continuous-improvement ci-lint-transcript <file.jsonl> --strict`.

## Slash commands

<details>
<summary><b>All 29 commands, and what each one needs</b></summary>

Each command's full name is `/continuous-improvement:<name>`. Type it when another plugin has a command with the same short name. "The 7 Laws" is the plugin's name for its research, plan, execute, verify, reflect, learn, iterate loop, written out in [SKILL.md](SKILL.md).

```
Memory and lessons
/continuous-improvement           Reflect on the session, analyze the log, show lesson status
/seven-laws                       Alias for the reflect command above
/recall                           BM25 search over the tool-call log                              [MCP]
/dashboard                        Lesson and log counts as a text dashboard
/distill                          Turn repeated successful tool sequences into draft lessons      [MCP]
/learn-eval                       Extract session patterns, self-evaluate, choose a save location
/harvest                          Classify friction in the log into typed lessons                 [clone]

Git, review and shipping
/reconcile                        Git ground truth before a mutation; verify a push landed
/audit                            Audit recent commits for real defects, confirm each before fixing
/ship                             One defect, TDD, one PR
/production-readiness-review      Parallel reviewers across five dimensions, one ranked list
/simplicity-review                Review the diff for over-engineering, report only
/release-train                    Plan and run stacked single-concern PRs

Planning and alignment
/planning-with-files              Create and maintain task_plan.md, findings.md, progress.md
/goal-check                       Score recent activity against the task_plan.md goal             [MCP]
/intent-driven-development        Turn an ambiguous change into acceptance criteria
/grill-me                         Interview you about a plan, one question at a time
/grill-with-docs                  The same interview, updating CONTEXT.md and ADRs
/roast                            Five-persona adversarial council: GO / RESHAPE / KILL
/proceed-with-the-recommendation  Walk a prior recommendation list in order, verifying each item
/handoff                          Compact the conversation into a handoff document

Orchestration
/superpowers                      Route a task to a skill in this plugin or a companion plugin
/swarm                            Fan out sub-agents on worktrees with a shared contract test
/ralph                            Convert a PRD to JSON and loop until the stories complete
/workspace-surface-audit          Audit repo, MCP, plugins and env; recommend skills

Reference and setup
/verify-install                   Three-check post-install probe: commands, guard hook, log
/discipline                       Reference card of the 7 Laws
/model-forward                    Restate the model-forward stance
/companion-preference             Summarize companion-preference hook telemetry                   [clone]
```

All 29 ship in the plugin bundle. `[MCP]` means the command calls an MCP tool; the plugin install registers the server, so it works after the two-command install. `[clone]` means the command runs a script that exists only in a clone of this repository.

The npm installer writes 14 of them: continuous-improvement, dashboard, discipline, harvest, learn-eval, planning-with-files, proceed-with-the-recommendation, ralph, release-train, seven-laws, superpowers, swarm, verify-install and workspace-surface-audit.

</details>

## Reference

<details>
<summary><b>Skills: all 28, by tier, with the code behind each</b></summary>

The plugin ships **28 skills**: 1 core + 1 featured + 7 tier-1 + 16 tier-2 + 3 always-bundled. The tier is a catalogue label from each skill's frontmatter: every skill ships in the plugin bundle regardless of tier, and the tier does not change what is loaded. A skill is a Markdown file the model reads when it is invoked. "Prose" in the last column means no code backs it. U marks a skill only you can invoke, M one only the model can.

| Tier | Skill | What it describes | Backed by |
|---|---|---|---|
| core | `continuous-improvement` | The 7 Laws loop: research, plan, execute, verify, reflect, learn, iterate | logger, MCP server |
| featured | `proceed-with-the-recommendation` | Walk a recommendation list top to bottom, verifying each item | `scripts/route-recommendation.mjs` |
| 1 | `deploy-receipt` (U) | A merge is done when the provider reports the merged SHA live and the healthcheck returns 200 | bash scripts (need `bash` and `jq`) |
| 1 | `gateguard` (M) | The guard hook's rules | `hooks/gateguard.mjs` |
| 1 | `model-forward` | Go with the model; skills are scaffolding | prose |
| 1 | `recall` | Search the log before re-deriving a fix | `ci_recall`, `hooks/recall-briefing.mjs` |
| 1 | `ship` (U) | One defect through TDD and one PR | prose |
| 1 | `tdd-workflow` | Red, green, refactor | prose |
| 1 | `verification-loop` | Build, types, lint, tests, security and diff with a PASS/FAIL report | `scripts/resolve-verify-ladder.mjs` |
| 2 | `audit` | Audit a commit window, confirm before fixing | prose |
| 2 | `goal-monitor` | Score activity against the stated goal | `ci_goal_check`, `hooks/goal-drift-stop.mjs` |
| 2 | `grill-me` | Interview until the plan is understood | prose |
| 2 | `grill-with-docs` | Interview that updates `CONTEXT.md` and ADRs | prose |
| 2 | `handoff` | Handoff document for the next agent | prose |
| 2 | `intent-driven-development` | Acceptance criteria before code | prose |
| 2 | `reconcile` | Git ground truth, then commit, push, verify | `bin/reconcile.mjs` |
| 2 | `recovery-classification` (M) | Classify a failure before retrying | prose |
| 2 | `roast` | Adversarial council on an idea | prose |
| 2 | `simplicity-review` | Flag over-engineering in the diff | prose |
| 2 | `skill-distillation` | Repeated successful sequences into draft lessons | `ci_distill_*` tools, `hooks/workflow-distill.mjs` |
| 2 | `state-reconciliation` (M) | Reconcile database, disk and memory state before dispatch | prose |
| 2 | `strategic-compact` (M) | Suggest compaction at phase boundaries | prose |
| 2 | `token-budget-advisor` | Offer a response-depth choice before answering | prose |
| 2 | `wild-risa-balance` (M) | Shape recommendation lists | prose |
| 2 | `worktree-safety` (M) | Validate the worktree root before writing | prose |
| always-bundled | `ralph` (U) | Autonomous PRD loop | prose |
| always-bundled | `superpowers` | Dispatcher across this plugin and four companion plugins | `hooks/companion-preference.mjs` |
| always-bundled | `workspace-surface-audit` | Audit the workspace, recommend skills | prose |

Source files are in [`skills/`](skills/), plus [SKILL.md](SKILL.md) for the core skill. Adding a 29th skill: [the recipe in CONTRIBUTING.md](CONTRIBUTING.md#evolution--adding-a-new-skill).

</details>

<details>
<summary><b>Environment switches: every one the hooks and tools read</b></summary>

Set a switch in the environment Claude Code starts from. An unrecognized value falls back to the default. Values are read without regard to case, except `CLAUDE_THREE_SECTION_CLOSE_DISABLED`, which must be exactly `1`.

| Variable | Values | Default | Effect |
|---|---|---|---|
| `CI_GATEGUARD_FILE_GATE` | `evidence`, `strict`, `off` | `evidence` | `off` disables the blind-edit gate. `strict` brings back the older gate: the first edit of every file is denied with a fact list until a clear command is run. In the default mode a project with no observation log is allowed, because the gate has nothing to judge by |
| `CI_GATEGUARD_EXCLUDE` | comma-separated path fragments | unset | Skips the blind-edit gate and the wrong-repository lock for matching paths (substring match on the forward-slash path). A fragment of one character, `./` or `..` makes the hook report that the file gate is off, on stderr, which reaches nobody. `/` and `.` do match every path; a single letter skips only the paths that contain it. Destructive commands are never excluded |
| `CI_GATEGUARD_TARGET_LOCK` | `block` | off | Denies a file-tool write whose absolute path is outside the session's repository |
| `GATEGUARD_MAX_CLEARED_FILES` | positive integer | 1000 | Per-session cap on cleared files for the file gate |
| `CLAUDE_CI_HOOKPACK_GATE` | `warn`, `block`, `off` | `warn` | Push and commit-size gate (`hooks/hook-pack.mjs`) |
| `CI_CONFIG_GUARD` | `warn`, `block`, `off` | `warn` | Guardrail-config guard (`hooks/config-guard.mjs`) |
| `CI_CONFIG_GUARD_ALLOW` | `true` | unset | Lets the call through and prints a stderr line |
| `CLAUDE_TYPECHECK_GATE` | `off`, `warn`, `block` | `off` | Typecheck at turn end (`hooks/typecheck-stop.mjs`) |
| `CLAUDE_GOAL_DRIFT_GATE` | `warn`, `block`, `off` | `warn` | Goal-drift check at turn end (`hooks/goal-drift-stop.mjs`) |
| `CLAUDE_THREE_SECTION_CLOSE` | `1`, `on`, `true`, `yes` | off | Turns the three-heading reply check on (`hooks/three-section-close.mjs`). It never sends back a turn that a Stop hook already continued (`stop_hook_active`), so it cannot loop |
| `CLAUDE_THREE_SECTION_CLOSE_DISABLED` | `1` | unset | Forces that check off |
| `CI_ROUTE_PROMPT` | `1`, `on`, `true`, `yes` | off | Turns the prompt router on (`hooks/route-prompt.mjs`) |
| `CI_ROUTE_PROMPT_DISABLE` | `1`, `true` | unset | Forces the router off |
| `CLAUDE_RECALL_BRIEFING` | `1`, `on`, `true`, `yes` | off | Injects the top 3 log hits on the first prompt of a session (`hooks/recall-briefing.mjs`) |
| `CLAUDE_WORKFLOW_DISTILL_NUDGE` | `on` | off | Workflow-distill line in the debug log (`hooks/workflow-distill.mjs`) |
| `CLAUDE_QUERY_COST_NUDGE` | `on` | off | Query-cost reminder (`hooks/query-cost-nudge.mjs`) |
| `CI_INSTINCT_LOAD` | `off`, `0`, `false`, `no` | on | Disables the lesson load at session start (`hooks/session.mjs`) |
| `CLAUDE_CI_UPDATE_CHECK` | `off` | on | npm installer only: skips the registry read |

Not an environment variable: the companion preference is the key `continuous_improvement.companion_preference` in `~/.claude/settings.json`, with the values `ci-first` (default), `companions-first` and `strict-companions`.

Also read: `CLAUDE_PROJECT_DIR` (set by Claude Code; the project root used for the per-repository directory), `HOME` and `USERPROFILE` (where state is written), `GATEGUARD_SESSION_DIR` (test use), and `GITHUB_OUTPUT` plus the `INPUT_*` variables that GitHub Actions sets for the linter.

</details>

<details>
<summary><b>MCP tools: the server and its tools, by mode</b></summary>

The server is [`bin/mcp-server.mjs`](bin/mcp-server.mjs), stdio. Its `--mode` flag picks the tool set: the plugin starts it with `--mode expert` (19 tools), and with no flag it runs in beginner mode (4 tools, about 2,000 characters of definitions). In `/mcp` it appears as `plugin:continuous-improvement:continuous-improvement`, and its tools are named `mcp__plugin_continuous-improvement_continuous-improvement__<tool>`. If `/mcp` also lists a second `continuous-improvement` server that you added at user scope from an npm copy, Claude Code runs both because their commands differ; remove that one with `claude mcp remove continuous-improvement`.

Expert mode exposes all the MCP tools (19 of them, including `ci_plan_init` and `ci_plan_status`, which create and summarize the `task_plan.md`, `findings.md` and `progress.md` planning files that `/planning-with-files` also maintains).

- **Beginner mode, 4 tools:** `ci_status` (level, lesson count, log row count), `ci_instincts` (list lessons with confidence), `ci_reflect` (returns a reflection template and stores nothing), `ci_gateguard_clear` (records a file-gate clearance, for a file the log cannot show was read or for the `strict` gate).
- **Expert mode adds 15:** `ci_reinforce` (accept +0.15, reject -0.1), `ci_create_instinct`, `ci_observations` (recent rows), `ci_export`, `ci_import`, `ci_plan_init`, `ci_plan_status`, `ci_dashboard`, `ci_load_pack` (react, python, go, meta), `ci_goal_check`, `ci_recall`, `ci_distill_candidates`, `ci_distill_propose` (writes a draft), `ci_distill_promote` (draft to a lesson at 0.5), `ci_distill_from_workflow`.

An expert tool called in beginner mode returns an error such as `ci_recall requires expert mode`. Lesson ids are validated before they reach a file path. The server also exposes two resources: `instincts://project/<hash>` and `instincts://global`.

</details>

<details>
<summary><b>Companions, other agents, command-line tools, troubleshooting</b></summary>

**Companion plugins.** The marketplace lists five plugins: this one plus `superpowers`, `agent-skills`, `ruflo-swarm` and `oh-my-claudecode`. The four companions are pinned snapshots of other projects, recorded in [third-party/MANIFEST.md](third-party/MANIFEST.md). None is required. `/superpowers` routes to them when they are installed, for example after `/plugin install superpowers@continuous-improvement`. PM skills install from their own marketplace: [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md).

**Other agents.** `npx continuous-improvement install --target gemini,codex` writes the 7 Laws text as a rules file into the current project. Those agents get no hooks, no MCP server and no lessons.

| Target | File written |
|---|---|
| `gemini` | `GEMINI.md` |
| `codex` | `AGENTS.md` |
| `cursor` | `.cursor/rules/continuous-improvement.mdc` |
| `windsurf` | `.windsurf/rules/continuous-improvement.md` |
| `zed` | `.rules` |
| `aider` | `CONVENTIONS.md`, plus a minimal `.aider.conf.yml` if none exists |
| `copilot` | `.github/copilot-instructions.md` |

**Command-line tools in the npm package.** Run them after `npm i -g continuous-improvement`, or as `npx -p continuous-improvement <command>`.

| Command | What it does |
|---|---|
| `npx continuous-improvement install` | The npm installer. Flags: `--mode expert`, `--pack <name>`, `--target <agents>`, `--uninstall` |
| `ci-reconcile` | Git ground truth with exit codes. Flags: `--json`, `--snapshot`, `--verify-push <branch>`, `--explain`, `--cwd <dir>` |
| `ci-lint-transcript` | The transcript linter. Flags: `--stdin`, `--json`, `--strict` |
| `ci-plan-pack <plan.md>` | Writes `<plan>.review.md`, a review packet |
| `ci-audit-actions` | Static scan of `.github/workflows` for permission, pinning, timeout, concurrency and injection findings |
| `ci-portfolio-health` | Scores the repositories in a `portfolio/repos.json` registry from local signals |
| `ci` | `ci generate <repository-path>` analyzes a repository and writes a command-line wrapper for it, using the bundled CLI-Anything library ([`lib/cli-anything.mjs`](lib/cli-anything.mjs)) |

**Troubleshooting install.**

| Symptom | Cause | Fix |
|---|---|---|
| A slash command is not recognized right after install | Commands load at session start | Restart Claude Code |
| A slash command is still not found, or another plugin's command runs | Plugin commands are namespaced | Type the full name, such as `/continuous-improvement:recall` |
| `/verify-install` prints `✗` with `hooks/gateguard.mjs not wired` | No hook ran: `node` is not on the `PATH` Claude Code starts with, or this is the npm install, which has no guards | Put Node 18 or newer on `PATH` and restart Claude Code. On npm, use the plugin |
| Nothing is denied and the log stays empty | `node` is not on `PATH`, so no hook runs | Install Node 18 or newer, then restart |

</details>

<details>
<summary><b>Contributing, releases, licence</b></summary>

[CONTRIBUTING.md](CONTRIBUTING.md) covers architecture, tests and adding a skill. Releases follow [docs/RELEASING.md](docs/RELEASING.md), and the `@v3` tag policy is in [CONTRIBUTING.md § Release](CONTRIBUTING.md#release). The audit behind this README, with a verdict per skill, is [docs/audits/2026-11-20-frontier-model-audit.md](docs/audits/2026-11-20-frontier-model-audit.md). Background on the 7 Laws is in [docs/philosophy.md](docs/philosophy.md). To report a bug, [open an issue](https://github.com/naimkatiman/continuous-improvement/issues) with the one-line output of `/verify-install`.

Licence: MIT. See [LICENSE](LICENSE).

</details>
