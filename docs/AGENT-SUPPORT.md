<!-- Generated from src/lib/agent-support.mts by `node bin/check-agent-matrix.mjs --write`. Do not edit by hand; `npm run verify:agent-matrix` fails on drift. -->

# Agent support

continuous-improvement is guardrails for coding agents. This page is the promise for each agent: what the guard does there, how saved lessons reach the model, and what the agent cannot do. Nothing here goes beyond what the 2026-11-21 research verified, with the skeptic corrections applied ([plan](plans/2026-11-21-all-agents.md)).

## What the tiers mean

- **full**: the guard blocks a destructive command before it runs, saved lessons reach the model at session start through a hook, and a Stop hook can send the turn back.
- **partial**: the guard blocks, and one of the other two is missing. A surface whose hooks run but whose deny the research could not confirm is partial too, and no blocking is claimed for it.
- **rules only**: the agent has no hook this package can use, so nothing is blocked. It gets the 7 Laws rules file, and the lessons through `ci lessons`.

The guard is `hooks/gateguard.mjs` (destructive shell commands and blind edits), with `hooks/hook-pack.mjs` (protected-branch pushes, opt-in) and `hooks/config-guard.mjs` (guardrail config edits, opt-in). Lessons come from `hooks/session.mjs`. The Stop gate is `hooks/typecheck-stop.mjs` and `hooks/goal-drift-stop.mjs`, both off or warn-only until you switch them on (`CI_TYPECHECK_GATE=block`, `CI_GOAL_DRIFT_GATE=block`). The tool-call log is `bin/observe.mjs` and the MCP server is `bin/mcp-server.mjs`. `lib/hook-io.mjs` writes each answer in the format the agent reads, and OpenCode and Amp run the same hook files through `lib/hook-bridge.mjs`.

A blind edit is an edit of an existing file that this conversation's tool-call log shows no read of; with no log yet, every edit that names its file passes. A shell command that names the file counts as a read on every hook agent, and so does a file tool whose path key the research documents. Copilot, Devin and Auggie document none for their file-read tools, so a read through `view` never counts and a read through `read` counts only when it names the file as `path`: read the file through the shell, or run the clear command the deny prints. The write tools of Copilot (`edit`, `str_replace_editor`, `create`), Devin (`edit`, `write`, `notebook_edit`), Auggie (`edit`, `write`, `str-replace-editor`, `save-file`) and Junie (`Write`, `Edit`; hooks on its Early Access build) document no path key either: the guard reads `path`, `file_path`, `filePath` and `target_file` for them (unverified; Devin's `notebook_edit` also `notebook_path`), gates the file it finds there like any edit, and denies a write that names a file at none of those keys, log or no log, with the clear command that lets that tool's path-less writes through for the session; config-guard reports such a write too. An `apply_patch` of Devin, Copilot, Cline or Junie (hooks on its Early Access build), or a Droid `ApplyPatch`, whose patch text names no file at `command`, `patch` or `input` gets the same deny (a Codex `apply_patch`, whose key is documented, gets a warning). A Claude-named write tool of another agent is read with that agent's keys too, so a Grok `Write` is gated on `path`, `filePath` and `target_file` as well as `file_path`. Gemini's `save_memory` names no file and always passes. A tool event from another agent that names no session gets that deny for every edit of an existing file.

"Blocks" means the agent stops the tool call when the hook runs and answers deny. An agent that fails open on a hook crash or timeout, or a setting that turns hooks off (Codex trust, Gemini and Qwen folder trust, Devin Restricted Mode, Copilot `disableAllHooks`), lets the call through. `npx -p continuous-improvement ci doctor --agent <id>` shows what an installed agent loaded, using only its own listing commands.

"Checked against" says what a row rests on: captured runs, the installed binary and its bundled docs on the research host, or the vendor docs only.

## Tier table

| Agent | Tier | Blocks a destructive command | Lessons at session start | Install | Cannot |
|---|---|---|---|---|---|
| Claude Code | full | yes, in every permission mode | yes | `/plugin marketplace add naimkatiman/continuous-improvement`, then `/plugin install continuous-improvement@continuous-improvement` | Nothing is lost. The npm installer wires no guard for Claude Code, so use the plugin. |
| Codex CLI | full | yes, after you trust each hook in /hooks | yes | `npx continuous-improvement install --target codex --hooks` | Hooks stay off until trusted. Hosted tools bypass hooks. No Skill tool, so companion-preference is not wired. |
| Gemini CLI | full | yes, in a trusted folder | yes | `npx continuous-improvement install --target gemini --hooks` | No CLI command lists the hooks it loaded from settings.json; only `/hooks panel` inside a session does. |
| Qwen Code | full | yes, once you approve the project hooks or trust the folder | yes | `npx continuous-improvement install --target qwen --hooks` | `$ARGUMENTS` is not substituted in commands. The prompt hook also fires on tool results. |
| Cursor | full | yes (3.x) | yes | `npx continuous-improvement install --target cursor --hooks` | Cloud agents run no session hooks. 2.5.26 has no prompt context. Stray output from a hook stops every tool call on 3.x. The Cursor CLI is not covered. |
| GitHub Copilot CLI | full | yes | yes | `npx continuous-improvement install --target copilot --hooks` | Prompt hook output is dropped, so the prompt hooks are not wired. A hook that times out fails open. The cloud agent reads only .github/hooks, and disableAllHooks turns every hook off. A read through `view` does not clear the blind-edit gate, so read the file through the shell first. |
| Grok CLI | partial | yes, in a trusted folder | rules file | `npx continuous-improvement install --target grok --hooks` | No session or prompt context, so lessons need the rules file. |
| Devin Local | full | yes, outside Restricted Mode | yes | `npx continuous-improvement install --target devin --hooks` | Restricted Mode runs no hooks. Hooks it imports from ~/.claude can fire twice. Plugin hooks fail open. A read through `read` may not clear the blind-edit gate (its path key is undocumented), so read the file through the shell first. |
| Kiro CLI | full | yes (exit 2) | yes | `npx continuous-improvement install --target kiro --hooks` | CLI sessions on the V2 harness read agent-profile hooks, not this file. A hook crash exits 1, which Kiro CLI allows. |
| Kiro IDE | partial | not claimed (its hook docs disagree on exit codes) | yes | `npx continuous-improvement install --target kiro --hooks` | The IDE's two hook pages disagree on what a non-zero exit does, and no IDE run was captured, so no blocking is claimed here. The same hooks answer with exit 2 on a deny. The IDE reads only the workspace .kiro/hooks, so install at project scope. |
| Factory Droid | full | yes | yes | `npx continuous-improvement install --target droid --hooks` | Context printed at PreToolUse is ignored. SubagentStop cannot send a turn back. |
| Auggie | partial | yes | rules file | `npx continuous-improvement install --target auggie --hooks` | Only the tool-call hooks act. Session, Stop and prompt hooks run in the background, so only the guards and the log are wired. A read through `view` does not clear the blind-edit gate, and one through `read` only when it names the file as `path`, so read the file through the shell first. |
| Junie CLI | partial | yes, on the Early Access build | rules file | `npx continuous-improvement install --target junie --hooks --scope user` | Stable builds run no hooks. SessionStart context is ignored. The documented tool event names no session; if a real one has none, every edit of an existing file needs the clear command the deny prints. |
| Cline | partial | yes, while Enable Hooks is on | no | `npx continuous-improvement install --target cline --hooks` | No Stop gate and no session lessons. A hook error fails open. |
| Goose | partial | yes | rules file | `npx continuous-improvement install --target goose --hooks` | Post-tool, session and prompt hooks only observe. Hook commands run through sh -c, unverified on Windows. |
| OpenCode | partial | yes, through a local plugin file | yes | `npx continuous-improvement install --target opencode --hooks` | 1.x has no Stop gate (2.x continues a turn through experimental.idle). A deny reaches the model as a failed tool call and the turn goes on. OPENCODE_PURE turns plugins off. |
| Amp | full | yes, through a local plugin file | yes | `npx continuous-improvement install --target amp --hooks` | The plugin API is experimental. Plugins do not load in Puck or Spaces, and `amp -x` needs --plugin-ready-timeout. |
| Zed | rules only | no | rules file | `npx continuous-improvement install --target zed` | Zed has no hooks, so nothing is blocked. This package installs no MCP server or skills for Zed yet. |
| Aider | rules only | no | rules file | `npx continuous-improvement install --target aider` | Aider has no hooks, MCP client or skills, so nothing is blocked. |

`--target <id>` without `--hooks` still writes only the rules file. Add `--scope user` to write the agent's user-level config, `--dry-run` to see every write first, `--run` to run the vendor `mcp add` command, and `--fail-closed` to set the agent's fail-closed option where it has one. `npx continuous-improvement install --uninstall --target <id>` removes what `--hooks` recorded. A vendor `mcp add` it did not undo (run without `--run`, or a failed undo) keeps the agent recorded, and its runtime copy kept, until `--uninstall --target <id> --run` undoes it; an undo that fails twice is taken as removed by hand, and the uninstall says so.

## Per agent

### Claude Code

- Tier: full
- Blocks a destructive command: yes, in every permission mode
- Lessons at session start: yes
- Stop gate: yes
- MCP server: yes
- Checked against: captured runs
- Install: `/plugin marketplace add naimkatiman/continuous-improvement`, then `/plugin install continuous-improvement@continuous-improvement`
- Then: Restart Claude Code once so the commands load.
- Cannot: Nothing is lost. The npm installer wires no guard for Claude Code, so use the plugin.
- Source: This repository: plugins/continuous-improvement/hooks/hooks.json, the captured runs in README and QUICKSTART, the goldens in fixtures/agent-hooks/claude.json.

### Codex CLI

- Tier: full
- Blocks a destructive command: yes, after you trust each hook in /hooks
- Lessons at session start: yes
- Stop gate: yes
- MCP server: yes
- Checked against: installed binary
- Install: `npx continuous-improvement install --target codex --hooks`
- Then: Open /hooks in Codex and trust each hook. Add the printed MCP block to .codex/config.toml; it and .codex/hooks.json load only in a trusted project. `--scope user --run` writes ~/.codex/hooks.json and runs `codex mcp add` instead.
- Cannot: Hooks stay off until trusted. Hosted tools bypass hooks. No Skill tool, so companion-preference is not wired.
- Source: Research Codex CLI 0.171 hook_pre_tool (skeptic: corrected; permissionDecision deny, exit 2 and empty-stdout allow hold) and hook_session_start (plain stdout); matrix row Codex CLI 0.171.

### Gemini CLI

- Tier: full
- Blocks a destructive command: yes, in a trusted folder
- Lessons at session start: yes
- Stop gate: yes
- MCP server: yes
- Checked against: installed binary
- Install: `npx continuous-improvement install --target gemini --hooks`
- Then: Trust the folder in Gemini CLI: it runs no settings.json hooks in an untrusted folder.
- Cannot: No CLI command lists the hooks it loaded from settings.json; only `/hooks panel` inside a session does.
- Source: Research Gemini CLI 0.41 hook_pre_tool BeforeTool (skeptic: corrected; top-level decision deny, permissionDecision ignored), AfterAgent, JSON session context; matrix row Gemini CLI 0.41.

### Qwen Code

- Tier: full
- Blocks a destructive command: yes, once you approve the project hooks or trust the folder
- Lessons at session start: yes
- Stop gate: yes
- MCP server: yes
- Checked against: installed binary
- Install: `npx continuous-improvement install --target qwen --hooks`
- Then: Approve the project hooks in Qwen Code or trust the folder.
- Cannot: `$ARGUMENTS` is not substituted in commands. The prompt hook also fires on tool results.
- Source: Research Qwen Code 0.28 hook_pre_tool (skeptic: corrected; exit 2 and permissionDecision deny confirmed); matrix row Qwen Code 0.28.

### Cursor

- Tier: full
- Blocks a destructive command: yes (3.x)
- Lessons at session start: yes
- Stop gate: yes
- MCP server: yes
- Checked against: installed binary
- Install: `npx continuous-improvement install --target cursor --hooks`
- Cannot: Cloud agents run no session hooks. 2.5.26 has no prompt context. Stray output from a hook stops every tool call on 3.x. The Cursor CLI is not covered.
- Source: Research Cursor 2.5.26 / 3.20.17 hook_pre_tool (skeptic: corrected; flat permission deny, invalid JSON blocks on 3.20.17), additional_context, followup_message; matrix row Cursor IDE 3.20.17.

### GitHub Copilot CLI

- Tier: full
- Blocks a destructive command: yes
- Lessons at session start: yes
- Stop gate: yes
- MCP server: yes
- Checked against: vendor docs
- Install: `npx continuous-improvement install --target copilot --hooks`
- Cannot: Prompt hook output is dropped, so the prompt hooks are not wired. A hook that times out fails open. The cloud agent reads only .github/hooks, and disableAllHooks turns every hook off. A read through `view` does not clear the blind-edit gate, so read the file through the shell first.
- Source: Research GitHub Copilot hook_pre_tool (skeptic: corrected; exit 2 deny, fail-closed on errors, fail-open on timeouts), additionalContext, 8-block Stop cap; matrix row Copilot CLI.

### Grok CLI

- Tier: partial
- Blocks a destructive command: yes, in a trusted folder
- Lessons at session start: rules file
- Stop gate: yes
- MCP server: yes
- Checked against: installed binary
- Install: `npx continuous-improvement install --target grok --hooks`
- Then: Run the printed `grok mcp add` step. For the lessons, run `npx -p continuous-improvement ci lessons --format grok --write`.
- Cannot: No session or prompt context, so lessons need the rules file.
- Source: Research Grok Build 1.0.85 hook_pre_tool (skeptic: confirmed, fail-open on unknown tool names reproduced and fixed), systemMessage-only session output, Stop reason end_turn; matrix row Grok 1.0.85.

### Devin Local

- Tier: full
- Blocks a destructive command: yes, outside Restricted Mode
- Lessons at session start: yes
- Stop gate: yes
- MCP server: yes
- Checked against: installed binary
- Install: `npx continuous-improvement install --target devin --hooks`
- Then: Run the printed `devin mcp add` step. `--target windsurf --hooks` is the same install.
- Cannot: Restricted Mode runs no hooks. Hooks it imports from ~/.claude can fire twice. Plugin hooks fail open. A read through `read` may not clear the blind-edit gate (its path key is undocumented), so read the file through the shell first.
- Source: Research Windsurf / Devin Local 3000.14 hook_pre_tool (skeptic: corrected; exit 2 or decision block, other non-zero exits fail open), JSON session context; matrix row Devin Local 3000.14.

### Kiro CLI

- Tier: full
- Blocks a destructive command: yes (exit 2)
- Lessons at session start: yes
- Stop gate: yes
- MCP server: yes
- Checked against: vendor docs
- Install: `npx continuous-improvement install --target kiro --hooks`
- Cannot: CLI sessions on the V2 harness read agent-profile hooks, not this file. A hook crash exits 1, which Kiro CLI allows.
- Source: Research Kiro hook_pre_tool (skeptic: corrected; on the CLI exit 0 allows, exit 2 blocks with stderr sent to the model, other codes warn and allow); matrix row Kiro CLI V3 (pre-tool block yes, exit 2).

### Kiro IDE

- Tier: partial
- Blocks a destructive command: not claimed (its hook docs disagree on exit codes)
- Lessons at session start: yes
- Stop gate: yes
- MCP server: yes
- Checked against: vendor docs
- Install: `npx continuous-improvement install --target kiro --hooks`
- Cannot: The IDE's two hook pages disagree on what a non-zero exit does, and no IDE run was captured, so no blocking is claimed here. The same hooks answer with exit 2 on a deny. The IDE reads only the workspace .kiro/hooks, so install at project scope.
- Source: Research Kiro hook_pre_tool (skeptic: corrected; hooks/actions.md says any non-zero exit blocks, ide/whats-new-v1/hooks.md says other non-zero exits are errors, not blocks); matrix row Kiro IDE 1.x, whose pre-tool cell is partial; the user-scope install note in lib/agent-install-plans.mjs.

### Factory Droid

- Tier: full
- Blocks a destructive command: yes
- Lessons at session start: yes
- Stop gate: yes
- MCP server: yes
- Checked against: vendor docs
- Install: `npx continuous-improvement install --target droid --hooks`
- Cannot: Context printed at PreToolUse is ignored. SubagentStop cannot send a turn back.
- Source: Research [Droid] hook_pre_tool (skeptic: confirmed; Claude Code compatible, permissionDecision wins over decision); matrix row Factory Droid 1.17.

### Auggie

- Tier: partial
- Blocks a destructive command: yes
- Lessons at session start: rules file
- Stop gate: no
- MCP server: yes
- Checked against: vendor docs
- Install: `npx continuous-improvement install --target auggie --hooks`
- Then: Run the printed `auggie mcp add --project` step. For the lessons, run `npx -p continuous-improvement ci lessons --format auggie --write`.
- Cannot: Only the tool-call hooks act. Session, Stop and prompt hooks run in the background, so only the guards and the log are wired. A read through `view` does not clear the blind-edit gate, and one through `read` only when it names the file as `path`, so read the file through the shell first.
- Source: Research [Auggie] hook_pre_tool (skeptic: confirmed; JSON read only on exit 0) and the background session, Stop and prompt hooks; matrix row Auggie 1.2.2.

### Junie CLI

- Tier: partial
- Blocks a destructive command: yes, on the Early Access build
- Lessons at session start: rules file
- Stop gate: no
- MCP server: yes
- Checked against: vendor docs
- Install: `npx continuous-improvement install --target junie --hooks --scope user`
- Then: A project .junie/config.json loads only with --config-location, so install at user scope. For the lessons, run `npx -p continuous-improvement ci lessons --format junie --write`.
- Cannot: Stable builds run no hooks. SessionStart context is ignored. The documented tool event names no session; if a real one has none, every edit of an existing file needs the clear command the deny prints.
- Source: Research [Junie] hook_pre_tool (skeptic: corrected; hooks are an Early Access feature, project config.json ignored by default); matrix row Junie CLI, whose pre-tool cell is partial (Early Access only).

### Cline

- Tier: partial
- Blocks a destructive command: yes, while Enable Hooks is on
- Lessons at session start: no
- Stop gate: no
- MCP server: yes
- Checked against: vendor docs
- Install: `npx continuous-improvement install --target cline --hooks`
- Then: In the VS Code extension, add the printed MCP snippet to cline_mcp_settings.json.
- Cannot: No Stop gate and no session lessons. A hook error fails open.
- Source: Research Cline 4.1.27 / CLI 3.0.75 hook_pre_tool (skeptic: corrected; cancel and errorMessage, fail-open, the extension scans only Documents/Cline/Hooks); matrix row Cline.

### Goose

- Tier: partial
- Blocks a destructive command: yes
- Lessons at session start: rules file
- Stop gate: yes
- MCP server: yes
- Checked against: vendor docs
- Install: `npx continuous-improvement install --target goose --hooks`
- Then: Add the printed extension block to Goose's config.yaml. For the lessons, run `npx -p continuous-improvement ci lessons --format goose --write`.
- Cannot: Post-tool, session and prompt hooks only observe. Hook commands run through sh -c, unverified on Windows.
- Source: Research [Goose] hook_pre_tool (skeptic: corrected; only PreToolUse and Stop can block, decision block on stdout); matrix row Goose 1.60.

### OpenCode

- Tier: partial
- Blocks a destructive command: yes, through a local plugin file
- Lessons at session start: yes
- Stop gate: no
- MCP server: yes
- Checked against: vendor docs
- Install: `npx continuous-improvement install --target opencode --hooks`
- Then: Add the printed `mcp` entry to opencode.json.
- Cannot: 1.x has no Stop gate (2.x continues a turn through experimental.idle). A deny reaches the model as a failed tool call and the turn goes on. OPENCODE_PURE turns plugins off.
- Source: Research OpenCode V1 1.19 / V2 2.3 hook_pre_tool (skeptic: corrected; tool.execute.before throw confirmed, permission.ask refuted); matrix row OpenCode.

### Amp

- Tier: full
- Blocks a destructive command: yes, through a local plugin file
- Lessons at session start: yes
- Stop gate: yes
- MCP server: yes
- Checked against: vendor docs
- Install: `npx continuous-improvement install --target amp --hooks`
- Then: Add the printed `amp.mcpServers` entry to .amp/settings.json, then run `amp mcp approve continuous-improvement`.
- Cannot: The plugin API is experimental. Plugins do not load in Puck or Spaces, and `amp -x` needs --plugin-ready-timeout.
- Source: Research Amp hook_pre_tool (skeptic: corrected; tool.call reject-and-continue reaches the model as 'Tool rejected by plugin'); matrix row Amp.

### Zed

- Tier: rules only
- Blocks a destructive command: no
- Lessons at session start: rules file
- Stop gate: no
- MCP server: no
- Checked against: vendor docs
- Install: `npx continuous-improvement install --target zed`
- Then: For the lessons, run `npx -p continuous-improvement ci lessons --format zed --write`.
- Cannot: Zed has no hooks, so nothing is blocked. This package installs no MCP server or skills for Zed yet.
- Source: Research [Zed] hook_pre_tool (skeptic: confirmed; no script hooks, only static tool_permissions); matrix row Zed 1.29; PR 15 Zed skills not done (docs/deferred.md).

### Aider

- Tier: rules only
- Blocks a destructive command: no
- Lessons at session start: rules file
- Stop gate: no
- MCP server: no
- Checked against: vendor docs
- Install: `npx continuous-improvement install --target aider`
- Then: For the lessons, run `npx -p continuous-improvement ci lessons --format aider --write`. Then list the printed file under `read:` in .aider.conf.yml.
- Cannot: Aider has no hooks, MCP client or skills, so nothing is blocked.
- Source: Research [Aider] hook_pre_tool / hook_stop / hook_user_prompt (skeptic: confirmed; none); matrix row Aider 0.86.
