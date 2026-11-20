# Frontier-model audit

- Date: 2026-11-20
- Base: `origin/main` at `b3477a3` (v3.26.0)
- Scope: every bundled skill and command, the hook and MCP runtime, the README, the landing page and the new-user path
- Plan that acts on it: [docs/plans/2026-11-20-frontier-model-refresh.md](../plans/2026-11-20-frontier-model-refresh.md)

## Question

Users now run Claude 5-family models in a Claude Code that ships plan mode,
file memory, worktree tools, subagents, workflows, `/verify`, `/simplify` and
`/code-review`. Which parts of this plugin still give them something they do
not already have, and which parts cost them time for nothing?

## Method

Read-only, 18 agents, about 1,400 tool calls.

1. One agent built a fact sheet of native Claude Code capabilities from the
   public documentation, with a URL per item and a list of what is still not
   native.
2. Six auditors each took a cluster of skills and commands, read every file,
   found the code behind it, and gave a verdict: KEEP, SLIM, MERGE or RETIRE.
3. Six adversarial verifiers attacked each verdict from the opposite side
   (argue a KEEP is sentimental, argue a RETIRE breaks users or the build) and
   issued the final verdict with the list of files a change would touch.
4. Four more agents audited the README, the landing page, the new-user path
   and the runtime (hooks, MCP server, CLIs), running the shipped hooks against
   synthetic payloads with `HOME` pointed at a scratch directory.

**Confidence.** Skill verdicts were checked twice. Surface and runtime findings
were single-pass; each one acted on in the refresh train is reproduced by a
failing test before its fix. Findings not yet acted on are leads, not facts.

## Headline findings

| # | Finding | Evidence |
|---|---|---|
| 1 | The file gate is a toll. First edit per file is denied, the agent clears it with a shell call that needs no facts, then retries: two extra tool calls and about 300 tokens per file. Bash file writes are never gated. | `src/hooks/gateguard.mts:232-251`, `:436-458`; `src/lib/destructive-bash.mts:16-18` |
| 2 | A reply-format rule is on for every install. Any reply of 600+ characters without three fixed headings is blocked and re-prompted, including the output of `/discipline` and `/seven-laws`. | `src/hooks/three-section-close.mts:31-55`; `plugins/continuous-improvement/hooks/hooks.json` |
| 3 | The prompt router fires on single common words ("plan", "verify", "review") and suggests skills that compete with native features. Two of its five targets are not bundled. | `hooks/route-table.json`; `src/hooks/route-prompt.mts:162-167` |
| 4 | Nothing loads an instinct into a later session. The session hook counts YAML files and writes one line to exit-0 stderr, which the hooks documentation says the model never sees. | `src/hooks/session.mts:41-68`; `SKILL.md:134` |
| 5 | The plugin install and the npm install are disjoint. The plugin has the hooks and no MCP server; the npm path has the MCP server and no gate. `/recall`, `/goal-check` and `/distill` need the MCP server and are advertised to plugin users. | `plugins/continuous-improvement/.claude-plugin/plugin.json`; `src/bin/install.mts:413-417`; `commands/recall.md:12` |
| 6 | The npm expert install copies an observer and a session hook that import libraries it does not copy, so both exit 1 on every call since v3.24.0. | `src/bin/install.mts:380-399`; introduced by `942746f` |
| 7 | `ci_create_instinct` and `ci_import` join a caller-chosen id into a file path with no validation. | `src/bin/mcp-server.mts:356-378`, `:733-751`, `:781-815` |
| 8 | The destructive-command gate, the push gate and the config guard act only on the `Bash` tool. The same command through the `PowerShell` tool is allowed. | `src/hooks/gateguard.mts:96`, `:387`; `src/hooks/hook-pack.mts:88` |
| 9 | The observation log stores the first 500 characters of every command and 200 of its output unredacted. | `src/lib/observe-event.mts:12-13`, `:86-89` |
| 10 | The transcript linter reads top-level `tool` fields. A real Claude Code transcript nests tool calls inside `message.content`, so it scores 100/100 on a transcript with unresearched edits and no test run. | `src/bin/lint-transcript.mts:92-94` |
| 11 | Every "warn by default" mode prints to stderr and exits 0, so the default reaches nobody. | `src/hooks/config-guard.mts:95-97`, `src/hooks/hook-pack.mts:127-128`, `src/hooks/goal-drift-stop.mts:186-187` |
| 12 | Process cost per action on a default install: 3 Node spawns per Read, 4 per Edit, 5 per Bash, 2 per prompt, 5 per turn end. Eleven of fourteen registrations have no visible effect by default. | `src/lib/plugin-metadata.mts:699-719` |

## What is still not native

From the fact sheet. These are the jobs a plugin can still do that Claude Code
does not.

- A deny that holds in every permission mode, including auto and bypass:
  destructive commands, pushes to a protected branch, writes outside the
  session's repository, edits to the files that wire the guardrails.
- A check that runs the project's own commands at the Stop boundary and feeds
  the failing output back into the turn.
- A local, searchable log of what tools were run in this repository, captured
  at zero model-token cost.
- A deploy receipt: the merged SHA is the SHA that is live.
- Git ground truth for several sessions working in one checkout.

## Verdicts

Final verdicts after adversarial verification. "Files" is the number of files
a change touches so that `npm run verify:all` stays green.

| Item | Kind | Code behind it | First verdict | Final | Files |
|---|---|---|---|---|---|
| `continuous-improvement (core SKILL.md)` | core | hook+mcp | SLIM | **SLIM** | 20 |
| `ralph` | skill | prose-only | RETIRE | **RETIRE** | 25 |
| `recovery-classification` | skill | prose-only | RETIRE | **RETIRE** | 19 |
| `simplicity-review` | skill | prose-only | RETIRE | **RETIRE** | 17 |
| `state-reconciliation` | skill | prose-only | RETIRE | **RETIRE** | 25 |
| `strategic-compact` | skill | prose-only | RETIRE | **RETIRE** | 18 |
| `superpowers` | skill | hook | RETIRE | **RETIRE** | 34 |
| `tdd-workflow` | skill | prose-only | RETIRE | **RETIRE** | 28 |
| `token-budget-advisor` | skill | prose-only | RETIRE | **RETIRE** | 16 |
| `workspace-surface-audit` | skill | prose-only | RETIRE | **RETIRE** | 31 |
| `worktree-safety` | skill | prose-only | RETIRE | **RETIRE** | 26 |
| `audit` | skill | prose-only | MERGE | **MERGE** | 19 |
| `grill-me` | skill | prose-only | MERGE | **MERGE** | 21 |
| `handoff` | skill | prose-only | MERGE | **MERGE** | 15 |
| `skill-distillation` | skill | hook+mcp | RETIRE | **MERGE** | 16 |
| `deploy-receipt` | skill | cli | SLIM | **SLIM** | 6 |
| `gateguard` | skill | hook+mcp | SLIM | **SLIM** | 18 |
| `goal-monitor` | skill | hook+mcp | KEEP | **SLIM** | 14 |
| `grill-with-docs` | skill | prose-only | SLIM | **SLIM** | 10 |
| `intent-driven-development` | skill | prose-only | SLIM | **SLIM** | 11 |
| `model-forward` | skill | prose-only | KEEP | **SLIM** | 10 |
| `proceed-with-the-recommendation` | skill | cli | SLIM | **SLIM** | 26 |
| `recall` | skill | hook+mcp | SLIM | **SLIM** | 10 |
| `reconcile` | skill | cli | SLIM | **SLIM** | 18 |
| `roast` | skill | prose-only | RETIRE | **SLIM** | 17 |
| `ship` | skill | prose-only | SLIM | **SLIM** | 17 |
| `verification-loop` | skill | cli | SLIM | **SLIM** | 9 |
| `wild-risa-balance` | skill | prose-only | SLIM | **SLIM** | 8 |
| `/companion-preference` | command | cli | RETIRE | **RETIRE** | 7 |
| `/learn-eval` | command | prose-only | RETIRE | **RETIRE** | 18 |
| `/ralph` | command | prose-only | RETIRE | **RETIRE** | 25 |
| `/swarm` | command | prose-only | RETIRE | **RETIRE** | 9 |
| `/continuous-improvement` | command | prose-only | MERGE | **MERGE** | 20 |
| `/dashboard` | command | prose-only | MERGE | **MERGE** | 17 |
| `/distill` | command | mcp | MERGE | **MERGE** | 8 |
| `/goal-check` | command | hook+mcp | MERGE | **MERGE** | 9 |
| `/harvest` | command | cli | MERGE | **MERGE** | 13 |
| `/planning-with-files` | command | prose-only | RETIRE | **MERGE** | 24 |
| `/discipline` | command | prose-only | SLIM | **SLIM** | 4 |
| `/production-readiness-review` | command | prose-only | SLIM | **SLIM** | 4 |
| `/release-train` | command | prose-only | SLIM | **SLIM** | 7 |
| `/seven-laws` | command | prose-only | KEEP | **KEEP** | 0 |
| `/verify-install` | command | prose-only | KEEP | **KEEP** | 0 |

Skills: 0 keep as is, 14 slim, 4 merge, 10 retire. Commands audited (those
without a same-named skill, plus three orchestration commands): 2 keep, 3
slim, 6 merge, 4 retire.

Four verdicts were overturned by the verifiers. `goal-monitor` and
`model-forward` went from KEEP to SLIM (the first produces nothing anyone reads
under shipped defaults, the second showed zero invocations). `roast` went from
RETIRE to SLIM (it is a published command and the only adversarial council in
the bundle). `skill-distillation` and `/planning-with-files` went from RETIRE
to MERGE (the retire plans kept all the code and deleted only a doc, or leaned
on native coverage the fact sheet does not confirm).

## What the product is, after the audit

1. A small deterministic guard pack that holds in every permission mode.
2. Proof at the Stop boundary.
3. Git ground truth for concurrent sessions.
4. A thin memory layer beside native memory: a local tool-call log with
   search, and lessons that load at session start.
5. Everything else is opt-in or a retirement candidate.

## Not acted on in this train

Listed in the plan doc under Deferred. The largest are the second retirement
wave, the fourteen SLIM rewrites, the MCP surface cut and the single install
path.
