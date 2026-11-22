# All agents: one guard core, per-agent adapters

- Date: 2026-11-21
- Status: in progress (updated in place as each PR lands)
- Base: `origin/main` at `cb46c89` (v3.27.0, zero runtime dependencies: `package.json` `dependencies` is `{}`)
- Owner goal (verbatim): "make this not only for claude code...make it for all agents"
- Evidence: the per-agent research and skeptic reports from 2026-11-21. Each skeptic correction overrides the research claim it corrects. Sources are listed per agent in the Sources table below.

## Goal

A user of any major coding agent installs continuous-improvement once and gets
whatever that agent can verifiably enforce: a destructive-command and
blind-edit guard that actually blocks, saved lessons loaded at session start,
and proof at the Stop boundary. The MCP server, skills and rules are available
everywhere. The docs never promise an event the agent cannot block.
Claude Code behaviour does not change.

## What the research found

1. **The guard already fails open outside Claude Code.** Grok, Codex, Devin,
   Droid, Cursor 3.x and Qwen (after conversion) load this repo's unchanged
   Claude plugin layout. They report their own tool names
   (`run_terminal_command`, `run_shell_command`, `apply_patch`, `exec`,
   `Execute`, `Shell`), and `gateguard.mjs` allows any name it does not
   recognise. This was reproduced on Grok: a `run_terminal_command` payload
   with a destructive command gave exit 0 with empty stdout, and the same
   payload with `tool_name: "Bash"` returned a deny.
2. **Deny channels differ.** Gemini ignores `permissionDecision` and reads only
   top-level `decision`. Cursor 2.5.26 reads only the flat `permission` key.
   Cline needs `{"cancel":true}`. Kiro denies only on exit 2. Exit 2 with the
   reason on stderr is honoured by Claude, Codex, Cursor, Copilot, Devin, Grok,
   Qwen, Kiro, Droid, Auggie, Junie and Goose. Gemini honours it only when
   stdout is not valid JSON.
3. **Fail-closed and fail-open traps.** Cursor 3.20.17 blocks every tool call
   when a permission hook prints non-JSON stdout. On Kiro, exit 1 from a Stop
   hook starts another turn, and Node exits 1 on an uncaught exception.
   Codex, Gemini, Qwen, Cline, Auggie, Copilot (timeouts) and Devin plugin
   hooks fail open when a hook crashes or times out.
4. **Session context paths differ.** Plain stdout works on Claude, Codex,
   Qwen, Kiro and Droid. JSON additionalContext works on Gemini and Devin,
   `{additionalContext}` on Copilot, and `{additional_context}` on Cursor.
   Grok, Auggie, Junie and Goose have no session context path, so lessons
   must go into a rules file.
5. **Local check:** `src/lib/gateguard-state.mts:25` documents that state
   writes are not atomic. Copilot runs preToolUse hooks in parallel, so
   clearance state can race.

## Verified capability matrix

The letter in each cell names the source column for that agent in the Sources
table. `yes` = documented or locally observed. `partial` = works with a stated
limit. `no` = absent or verified not to work. "Local" says whether a binary was
inspected on this host.

| Agent | Rules | Skills | Commands | MCP | Pre-tool block | Post-tool | Session context | Stop continue | Prompt context | Packaging | Local |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Claude Code | yes L | yes L | yes L | yes L | yes L | yes L | yes L | yes L | yes L | yes L | yes |
| Codex CLI 0.171 | yes R | yes S | partial C (17 of 29 migrated) | yes M (plugin .mcp.json fails, `codex mcp add` works) | yes H (after /hooks trust) | yes H | yes H (plain stdout) | yes H | yes H | partial P (plugin hooks discovered, CLI execution unconfirmed) | yes |
| Gemini CLI 0.41 | yes R | yes S | yes C (TOML) | yes M | yes H (top-level decision only) | yes H | yes H (JSON only) | yes H (AfterAgent) | yes H (BeforeAgent) | yes P | yes |
| Qwen Code 0.28 | yes R | yes S | partial C (no $ARGUMENTS) | yes M (marketplace path drops .mcp.json) | yes H | yes H | yes H | yes H | yes H (also fires on tool results) | yes P | yes |
| Cursor IDE 3.20.17 | yes R | yes S | yes C (2.5.26 has no $ARGUMENTS) | yes M | yes H | yes H | yes H (additional_context) | partial H (followup_message) | partial H (3.x only) | yes P | yes (bundles read) |
| Copilot CLI | yes R | yes S | partial C (skills only) | yes M | yes H | yes H | yes H | yes H (8-block cap) | no H (output dropped) | yes P | no (embedded runtime only) |
| Grok 1.0.85 | yes R | yes S | yes S | yes M | yes H (Grok names in payload) | yes H | no H (systemMessage only) | yes H (reason end_turn) | no H | yes P | yes |
| Devin Local 3000.14 | yes R | yes S | partial S (skills) | yes M | yes H | yes H | yes H (JSON) | yes H | yes H | partial P (plugin hooks fail open) | yes |
| Kiro CLI V3 | yes R | yes S | partial C | yes M | yes H (exit 2) | yes H | yes H (stdout) | yes H | yes H (cannot block) | partial P (Powers: skills and MCP only) | no |
| Kiro IDE 1.x | yes R | yes S | partial C | yes M | partial H (docs conflict on exit codes) | yes H | yes H | yes H | yes H | partial P | no |
| Factory Droid 1.17 | yes R | yes S | yes C | yes M | yes H | yes H | yes H | yes H | yes H | yes P | no |
| Auggie 1.2.2 | yes R | yes S | yes C | yes M | yes H (deny only) | yes H | no H (background) | no H | no H | yes P (Claude timeout read as ms) | partial (npm pack read) |
| Junie CLI | yes R | yes S | yes C ($name args) | yes M | partial H (Early Access only) | partial H | no H | partial H | partial H | yes P | no |
| Cline 4.1.27 / CLI 3.0.75 | yes R | yes S | yes C | yes M | yes H (fails open on error) | yes H | partial H (VS Code, every turn) | no H | partial H (VS Code only) | partial P | no |
| Goose 1.60 | yes R | yes S | partial C (recipes) | yes M | yes H | partial H (observe only) | partial R (MOIM file) | yes H | no H | partial P (skills and hooks, no MCP) | no |
| OpenCode V1 1.19 / V2 2.3 | yes R | yes S | yes C | yes M | yes H (throw, in-process) | yes H | partial H (per call, dedupe) | partial H (V2 experimental.idle only) | yes H | yes P | no |
| Amp | yes R | yes S | partial C (plugin palette) | yes M | yes H (tool.call) | yes H | partial H (agent.start first turn) | yes H (max 5) | yes H | partial P (single-file plugin) | partial (binary strings) |
| Zed 1.29 | yes R | yes S | partial S (skills) | yes M | no H | no H | no H | no H | no H | partial P (MCP extensions only) | no |
| Aider 0.86 | partial R (--read) | no H | no H | no H | no H | partial H (lint/test cmds) | partial R (read:) | no H | no H | no H | no |

Roo Code shut down on 2026-05-15 (`roocodeinc.github.io/Roo-Code/`: "The Roo Code Extension was shut down on May 15th."). It is not targeted.

### Sources

| Agent | Key | Source |
|---|---|---|
| Claude Code | L | local: `plugins/continuous-improvement/hooks/hooks.json`, `src/hooks/session.mts:18-23` (cites code.claude.com/docs/en/hooks), existing test suite |
| Codex | R | https://learn.chatgpt.com/docs/agent-configuration/agents-md |
| Codex | S | https://learn.chatgpt.com/docs/build-skills; local `codex debug prompt-input` skill roots |
| Codex | C | https://learn.chatgpt.com/docs/custom-prompts; codex-rs core-plugins `command_migration.rs` at rust-v0.171.0 (4,000-byte cap, $ARGUMENTS, @token rules) |
| Codex | M | https://learn.chatgpt.com/docs/config-file/config-reference; local app-server `mcpServerStatus/list` (toolsError on `${CLAUDE_PLUGIN_ROOT}`, 19 tools with cwd ".") |
| Codex | H | https://learn.chatgpt.com/docs/hooks; codex-rs `hooks/src/events/pre_tool_use.rs` and `hook_names.rs` at rust-v0.171.0; local app-server `hooks/list` (trustStatus untrusted) |
| Codex | P | https://developers.openai.com/codex/plugins/build ("Lifecycle hooks are supported for plugins installed manually in Codex desktop"); local `codex plugin add` into a scratch CODEX_HOME |
| Gemini | R | `<gemini pkg>/bundle/docs/cli/gemini-md.md`; `chunk-SAJ72M2G.js:51078` DEFAULT_CONTEXT_FILENAME |
| Gemini | S | `<gemini pkg>/bundle/docs/cli/skills.md`; local `gemini skills list` with GEMINI_CLI_HOME scratch |
| Gemini | C | https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/custom-commands.md |
| Gemini | M | `<gemini pkg>/bundle/docs/extensions/reference.md`; local `gemini mcp list` |
| Gemini | H | `<gemini pkg>/bundle/docs/hooks/reference.md`; `chunk-6DSAZLFF.js` executeCommandHook and DefaultHookOutput (no permissionDecision) |
| Gemini | P | `<gemini pkg>/bundle/docs/extensions/releasing.md`; local `gemini extensions link --consent` |
| Qwen | R | `<qwen pkg>/bundled/qc-helper/docs/features/memory.md:31-37` |
| Qwen | S | `<qwen pkg>/bundled/qc-helper/docs/features/skills.md:269-276` |
| Qwen | C | `<qwen pkg>/bundled/qc-helper/docs/features/commands.md:559-623`; `chunk-NVBX2TFU.js` {{args}} replace |
| Qwen | M | `<qwen pkg>/bundled/qc-helper/docs/features/mcp.md`; `chunk-S6UXV6IV.js` convertClaudePluginPackage; local `qwen mcp list` after install |
| Qwen | H | https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/; bundled `docs/features/hooks.md:524-526,752` |
| Qwen | P | `<qwen pkg>/bundled/qc-helper/docs/extension/introduction.md`; local `qwen extensions install --consent` (hooks.json byte-identical, MCP dropped) |
| Cursor | R | https://cursor.com/docs/context/rules |
| Cursor | S | https://cursor.com/docs/context/skills |
| Cursor | C | 3.20.17 `workbench.desktop.main.js` $ARGUMENTS substitution (local); 2.5.26 bundle has none |
| Cursor | M | https://cursor.com/docs/context/mcp |
| Cursor | H | https://cursor.com/docs/hooks; https://cursor.com/docs/reference/third-party-hooks; local 2.5.26 `cursor-agent-exec/dist/main.js` and 3.20.17 workbench (invalid-JSON block, hookSpecificOutput compat, beforeSubmitPrompt additional_context) |
| Cursor | P | https://cursor.com/docs/reference/plugins; https://cursor.com/docs/plugins |
| Copilot | R | https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions |
| Copilot | S | https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-skills |
| Copilot | C | https://docs.github.com/en/copilot/reference/customization-cheat-sheet |
| Copilot | M | https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers |
| Copilot | H | https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-hooks-reference; https://docs.github.com/en/copilot/reference/hooks-reference; local embedded `@github/copilot` 1.0.73 `sdk/index.js` (agentStop, 8-block cap) |
| Copilot | P | https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference |
| Grok | R | `~/.grok/docs/user-guide/12-project-rules.md` (bundled 1.0.85 docs) |
| Grok | S | `~/.grok/docs/user-guide/08-skills.md`; local `grok inspect` (28 plugin skills) |
| Grok | M | `~/.grok/docs/user-guide/07-mcp-servers.md`; local `grok mcp doctor continuous-improvement` (19 tools) |
| Grok | H | `~/.grok/docs/user-guide/10-hooks.md` lines 116-119, 181, 255, 410-417, 561-573, 717; local gateguard pipe test (fail-open on run_terminal_command) |
| Grok | P | `~/.grok/docs/user-guide/09-plugins.md`; local `grok plugin validate plugins/continuous-improvement` ("Plugin manifest is valid.") |
| Devin | R | https://docs.devin.ai/cli/extensibility/rules.md; local `devin rules list --process-model in-process` |
| Devin | S | local `devin skills paths` / `devin skills list --process-model in-process` |
| Devin | M | https://docs.devin.ai/cli/extensibility/mcp/configuration.md; local `devin mcp get` |
| Devin | H | local bundled docs `D:\Devin\...\docs\extensibility\hooks\overview.mdx` (line 53 exit codes), `lifecycle-hooks.mdx` (257, 286, 364-375); bundled changelog/stable.mdx (fail_closed, line 120) |
| Devin | P | local bundled `extensibility/plugins/overview.mdx` lines 63-90 |
| Kiro | R | https://kiro.dev/docs/steering.md |
| Kiro | S | https://kiro.dev/docs/skills.md |
| Kiro | C | https://kiro.dev/docs/ide/chat/slash-commands.md; https://kiro.dev/docs/cli/chat/manage-prompts.md |
| Kiro | M | https://kiro.dev/docs/mcp/configuration.md |
| Kiro | H | https://kiro.dev/docs/hooks/types/; https://kiro.dev/docs/hooks/actions.md; https://kiro.dev/docs/ide/whats-new-v1/hooks.md (conflicting IDE exit rule) |
| Kiro | P | https://kiro.dev/docs/powers/create.md; https://kiro.dev/docs/powers/installation.md |
| Droid | R | https://docs.factory.com/cli/configuration/agents-md |
| Droid | S | https://docs.factory.com/cli/configuration/skills |
| Droid | C | https://docs.factory.com/cli/configuration/custom-slash-commands |
| Droid | M | https://docs.factory.com/cli/configuration/mcp |
| Droid | H | https://docs.factory.com/reference/hooks-reference |
| Droid | P | https://docs.factory.com/cli/configuration/plugins |
| Auggie | R | https://docs.augmentcode.com/cli/rules.md |
| Auggie | S | https://docs.augmentcode.com/cli/skills.md |
| Auggie | C | https://docs.augmentcode.com/cli/custom-commands.md |
| Auggie | M | https://docs.augmentcode.com/cli/integrations.md; https://docs.augmentcode.com/cli/reference.md |
| Auggie | H | https://docs.augmentcode.com/cli/hooks; local npm pack @augmentcode/auggie@1.2.2 `auggie-v2.mjs` valid-event set (no UserPromptSubmit) |
| Auggie | P | https://docs.augmentcode.com/cli/plugins.md |
| Junie | R | https://junie.jetbrains.com/docs/guidelines-and-memory.html |
| Junie | S | https://junie.jetbrains.com/docs/agent-skills.html |
| Junie | C | https://junie.jetbrains.com/docs/custom-slash-commands.html |
| Junie | M | https://junie.jetbrains.com/docs/junie-cli-mcp-configuration.html |
| Junie | H | https://junie.jetbrains.com/docs/junie-cli-hooks.html ("currently in the Early Access Program") |
| Junie | P | https://junie.jetbrains.com/docs/junie-cli-extensions.html |
| Cline | R | https://docs.cline.bot/customization/cline-rules.md |
| Cline | S | https://docs.cline.bot/customization/skills.md; cline/cline `apps/vscode/src/core/storage/skill-directories.ts` |
| Cline | C | cline/cline `sdk/packages/shared/src/storage/paths.ts` resolveWorkflowsConfigSearchPaths |
| Cline | M | https://docs.cline.bot/mcp/mcp-overview.md |
| Cline | H | cline/cline `apps/vscode/src/core/hooks/hook-factory.ts`, `apps/vscode/src/sdk/hooks-adapter.ts`, `apps/vscode/src/core/storage/disk.ts` getAllHooksDirs, `sdk/packages/core/src/hooks/hook-file-hooks.ts` |
| Cline | P | https://docs.cline.bot/customization/plugins.md |
| Goose | R | https://goose-docs.ai/docs/guides/context-engineering/using-goosehints; aaif-goose/goose `using-persistent-instructions.md` (GOOSE_MOIM_MESSAGE_FILE) |
| Goose | S | https://goose-docs.ai/docs/guides/context-engineering/using-skills |
| Goose | C | https://goose-docs.ai/docs/guides/context-engineering/slash-commands |
| Goose | M | https://goose-docs.ai/docs/guides/config-files |
| Goose | H | aaif-goose/goose `documentation/docs/guides/context-engineering/hooks.md` (lines 126, 244, 259, 315) |
| Goose | P | https://goose-docs.ai/docs/guides/context-engineering/plugins |
| OpenCode | R | anomalyco/opencode `packages/web/src/content/docs/rules.mdx@v1.19.6`; `packages/opencode/src/session/instruction.ts@v1.19.6` |
| OpenCode | S | `skills.mdx@v1.19.6`; https://opencode.ai/docs/skills/ |
| OpenCode | C | `commands.mdx@v1.19.6`; https://opencode.ai/docs/commands/ |
| OpenCode | M | `@opencode-ai/sdk@1.19.6 dist/v2/gen/types.gen.d.ts`; https://opencode.ai/docs/mcp-servers/ |
| OpenCode | H | `@opencode-ai/plugin@1.19.6 dist/index.d.ts`; `@opencode/plugin@2.3.2 dist/promise/{tool,session}.d.ts`; https://opencode.ai/docs/build/plugins/server/ |
| OpenCode | P | https://opencode.ai/docs/plugins/; https://opencode.ai/v1/docs/plugins/; V1 `plugin/shared.ts@v1.19.6` |
| Amp | R | https://ampcode.com/docs/customize/agents-md |
| Amp | S | https://ampcode.com/docs/customize/skills |
| Amp | C | https://ampcode.com/docs/plugin-api (registerCommand) |
| Amp | M | https://ampcode.com/docs/customize/mcp |
| Amp | H | https://ampcode.com/docs/plugin-api; https://ampcode.com/docs/customize/plugins; static strings of `@ampcode/cli-win32-x64` amp.exe |
| Amp | P | https://ampcode.com/docs/customize/plugins |
| Zed | R | https://zed.dev/docs/ai/instructions |
| Zed | S | https://zed.dev/docs/ai/skills |
| Zed | M | https://zed.dev/docs/ai/mcp |
| Zed | H | https://zed.dev/docs/ai/tool-permissions; https://github.com/zed-industries/zed/discussions/57943 (hooks still a proposal) |
| Zed | P | https://zed.dev/docs/extensions/mcp-extensions |
| Aider | R | https://aider.chat/docs/usage/conventions.html |
| Aider | H | https://aider.chat/docs/config/options.html; Aider-AI/aider `aider/args.py` (no hook or MCP flags) |

## Architecture

All source is `.mts` under `src/`. `npm run build` emits `lib/`, `bin/`,
`hooks/` and `test/` and regenerates `plugins/continuous-improvement/`.
New lib modules stay flat in `src/lib/`, because `verify:test-imports-only`
lets tests import only `../lib/*.mjs` and `../bin/*.mjs`. Every new bundled
`.mjs` is added to the `copyFileTo` list in
`src/bin/generate-plugin-manifests.mts` and gets the exec bit.

1. **Paths** (`src/lib/agent-paths.mts`). One `resolveInstinctsRoot()`:
   `CI_INSTINCTS_HOME`, else `<home>/.claude/instincts`, which is unchanged so
   every agent shares one store. One `resolveProjectRoot(payload)`: checks
   `CLAUDE_PROJECT_DIR`, then `QWEN_PROJECT_DIR`, `GEMINI_PROJECT_DIR`,
   `CURSOR_PROJECT_DIR`, `DEVIN_PROJECT_DIR`, `FACTORY_PROJECT_DIR`,
   `AUGMENT_PROJECT_DIR`, `GROK_WORKSPACE_ROOT`, then the payload `cwd` /
   `working_dir` / `workspace_roots[0]`, then git toplevel, then `global`. It
   replaces about 10 copies of resolveProjectRoot and about 33
   `join(home, ".claude", ...)` sites. It also removes the mcp-server split
   between getProjectHash and getWorkspaceRoot (PR 5: the server passes the
   client's first MCP root, when the client offers roots, as the payload).
   As shipped in PR 4: an env var counts when it is non-blank and is returned
   as given. A payload dir counts only when it is an absolute path to an
   existing directory inside a repository, and it is taken as that repo's git
   toplevel, so a subdirectory shares the repo's bucket (the observer and the
   MCP server hash the toplevel). A payload dir outside any repository is
   skipped, so the root falls to the process cwd's toplevel or `global`, the
   same root the readers without a payload (workflow-distill, typecheck-stop,
   the MCP server) resolve. Hashing the raw non-git dir would split the buckets
   for an agent that sets no project env var: the observer would write where
   workflow-distill never reads, and the MCP `ci_gateguard_clear` fallback
   would clear a session dir the gateguard hook never reads.
   `CI_INSTINCTS_HOME` counts only when it is absolute (trimmed); a relative
   value is ignored, because each process would resolve it against its own
   cwd. Cline's camelCase
   `workspaceRoots` and Grok's `workspaceRoot` are not read (Grok sets
   `GROK_WORKSPACE_ROOT`; Cline's nested payload waits for PR 8).
   `resolveInstinctsRoot(home?)` takes the caller's home so each hook keeps
   its own HOME handling. `src/lib/agent-env.mts` holds the CI_* knob
   aliases; the CLAUDE_* name wins when both are non-blank.
2. **Neutral hook I/O** (`src/lib/hook-io.mts`). `NeutralEvent` holds event,
   kind (`shell | file-write | patch | file-read | skill | other`), shell
   flavor, command, file paths, prompt, session id, cwd, stop-active, stop
   reason and loop count. `Decision` is allow, deny, context or continue.
   `encode(agent, event, decision)` returns `{stdout, stderr, exitCode}`. The
   claude encoder is the current output code moved, not rewritten. `runHook()`
   wraps every entry point: any throw ends as exit 0 with empty stdout and the
   error on stderr. That guards against the Kiro Stop loop and the Cursor 3.x
   invalid-stdout block.
3. **Pure deciders.** `src/lib/gateguard-decide.mts` is new. hook-pack-gate,
   config-guard-gate, goal-drift-gate, typecheck-gate and recall-briefing stay
   as they are. Each hook file becomes: read stdin, normalize, decide, encode.
4. **Agent profiles** (`src/lib/agent-profiles.mts`), one data table per agent:
   - exact tool-name to kind map, including Kiro V2 names and Auggie and Cline legacy names
   - input keys
   - shell flavor
   - native event names
   - anchored matchers (Gemini, Kiro and Goose matchers are unanchored regexes upstream)
   - encoder id
   - timeout unit
   - capability flags and tier

   The README matrix, `docs/AGENT-SUPPORT.md` and the installer all render from
   this table, and a new `verify:agent-matrix` invariant fails when a doc claims
   blocking for a profile whose `canBlockPreTool` is false.
5. **Patch paths** (`src/lib/patch-paths.mts`). Parses `*** Add File:`,
   `*** Update File:`, `*** Delete File:` and `*** Move to:` lines. Codex,
   OpenCode on GPT models, Cline, Copilot, Devin, Droid, Junie and Amp send
   edits this way. An unparseable patch is kind `patch` with no paths: it is
   denied under strict and warned under evidence.
6. **Agent selection**, in order:
   1. An explicit `--agent <id>` flag. Every hook command this repo renders carries it.
   2. `CI_AGENT`.
   3. A two-signal sniff: an agent env var and a matching payload shape, for
      example `CURSOR_VERSION` with a camelCase `hook_event_name`, or
      `GEMINI_SESSION_ID` with `BeforeTool`/`AfterAgent`.
   4. Otherwise `claude`.

   The sniff exists only for agents that import our unchanged Claude hooks
   (Cursor, Devin, Grok, Gemini migrate, Qwen). When the payload is clearly not
   Claude-shaped but no profile matches, a deny is emitted as exit 2 with the
   reason on stderr. Claude Code also honours that, so a misdetection cannot
   turn a deny into an allow.
7. **Encoders.** The values come from the verified matrix.
   - Deny, exact `hookSpecificOutput.permissionDecision` JSON at exit 0: Claude, Codex, Qwen, Grok, Droid, Auggie.
   - Deny, top-level `{"decision":"deny","reason"}`: Gemini.
   - Deny, flat `{"permission":"deny","user_message","agent_message"}`: Cursor.
   - Deny, top-level `{"permissionDecision":"deny","permissionDecisionReason"}`: Copilot.
   - Deny, `{"decision":"block","reason"}`: Devin.
   - Deny, exit 2 plus stderr with empty stdout: Kiro, Junie, Goose.
   - Deny, `{"cancel":true,"errorMessage"}`: Cline.
   - Allow: always empty stdout and exit 0.
   - Session context: plain stdout for Claude, Codex, Qwen, Kiro and Droid;
     `hookSpecificOutput.additionalContext` for Gemini and Devin;
     `{"additionalContext"}` for Copilot; `{"additional_context"}` for Cursor;
     `contextModification` for Cline.
   - Stop continue: `{"decision":"block","reason"}` wherever it exists,
     `followup_message` on Cursor. Every Stop hook guards on
     `stop_hook_active`/`loop_count`, and on Grok it skips unless
     `reason == "end_turn"`.
8. **Shell flavor.** When the flavor is unknown on win32 (Codex `Bash`,
   Copilot `powershell` reported as Bash, Grok), the command is classified
   under both POSIX and PowerShell with the existing `classifyDestructiveBash`
   and denied if either flags it. hook-pack's Git-Bash path rewrite keys on
   flavor, not on `tool !== "PowerShell"`.
9. **Observer.** `parseHookPayload` also reads `toolResult`, `tool_result`,
   `postToolUse.result` and `tool_response.output`. `summariseInput` switches
   on kind and gains a PowerShell case. Rows gain an optional `agent` field and
   are deduped on `(session, tool_use_id)` for agents that import Claude hooks
   and can double-fire.
10. **Lessons** (`src/lib/lesson-render.mts`, extracted from `session.mts`
    lessonBlock). Same caps: 10 lessons, 1,500 chars. It renders per encoder,
    and `ci lessons --format <agent> [--write]` writes the static routes:
    - `~/.grok/rules/continuous-improvement-lessons.md`
    - `~/.augment/rules/continuous-improvement-lessons.md`
    - a managed block in `~/.junie/AGENTS.md`
    - the Goose `GOOSE_MOIM_MESSAGE_FILE` target
    - the Zed and Aider rules files

    Nothing is ever written under `~/.agents/` except `skills/` and
    `plugins/<name>/`, because Junie treats other `*.md` files there as
    subagents.
11. **Stable runtime** (`src/lib/install-runtime.mts`). The installer copies
    `hooks/`, `bin/` and `lib/` to `<instincts root>/runtime/<version>/`.
    Every rendered hook and MCP command points there, never at the npx cache.
    The previous version is kept until a new install succeeds.
12. **Install planner** (`src/lib/agent-install-plans.mts`, pure). It returns
    `{writes, runs, notes}` for each agent and scope. Hook configs render from
    the same event-to-script table `getPluginHooksConfig()` uses, crossed with
    the profile. Shared vendor JSON is merged with the generalized
    preserve-foreign-entries logic from `patchClaudeSettings`. TOML and YAML
    configs go through the vendor CLI or a printed snippet, so the package
    keeps zero runtime dependencies. Every write and run is recorded in
    `<instincts root>/global/install-ledger.json`, which makes
    `--uninstall --target <id>` exact.
    - `--target <id>` without `--hooks` stays byte-identical to today.
      `--hooks`, `--scope user|project` and `--dry-run` are new.
13. **In-process shims** (`src/lib/hook-bridge.mts`,
    `src/lib/plugin-shim-opencode.mts`, `src/lib/plugin-shim-amp.mts`). The
    bridge imports the deciders in-process and spawns `node` only as a
    fallback. OpenCode gets a dual default export (V1 `server()` plus V2
    `{id, setup}`) without importing `@opencode/plugin`, because V2 fails a
    hook-map-only export on every load. Amp gets a `tool.call`
    reject-and-continue, an `agent.start` hidden first-turn message, an
    `agent.end` continue and a `tool.result` observer.
14. **Atomic state.** gateguard-state writes go to a temp file and are then
    renamed, retried after 25, 50 and 100 ms on Windows EPERM or EBUSY
    (PR 3). A parallel Copilot preToolUse read can no longer see a torn or
    interleaved file. Two parallel load-and-save pairs can still lose one
    update (the last rename wins). A save now fails when a parallel hook
    holds the file open past the retries, which the old in-place write never
    did (it tore the file instead): measured at about 13% of saves with 4
    writers and a reader on Windows, about 40% with one 25 ms retry. The
    hook absorbs that failure: a failed clearance save still allows and
    exits 0.
15. **config-guard.** Protected paths gain each agent's guardrail files:
    `.codex/hooks.json`, `.codex/config.toml`, `.gemini/settings.json`,
    `.gemini/extensions/`, `.cursor/hooks.json`, `.cursor/mcp.json`,
    `.github/hooks/`, `.copilot/hooks/`, `.devin/hooks.v1.json`,
    `.devin/config.json`, `.kiro/hooks/`, `.qwen/settings.json`,
    `.grok/hooks/`, `.clinerules/hooks/`, `Documents/Cline/Hooks/`,
    `.factory/hooks.json`, `.augment/settings.json`, `.junie/config.json`,
    `.opencode/plugins/` and `.amp/plugins/`. They also gain the mutating verbs
    of the codex, gemini, qwen, grok, copilot and devin CLIs for plugin, mcp,
    extensions and hooks. Default stays warn.

The Claude plugin files do not change in any PR: `.claude-plugin/*`,
`plugins/continuous-improvement/hooks/hooks.json`, `.mcp.json` and
`plugin.json`. Per-agent bundles are rendered at install time into the
runtime directory and never committed into `plugins/`, so
`verify:everything-mirror` and `verify:skill-mirror` stay as they are.

## Per-agent tier and install

`<rt>` = `<instincts root>/runtime/<version>`. Every hook command has the form
`node "<rt>/hooks/<x>.mjs" --agent <id>`.

| Agent | Tier | Install | Cannot |
|---|---|---|---|
| Claude Code | full | Unchanged: plugin install, or `npx continuous-improvement install` | Nothing lost |
| Codex CLI and IDE | full (after /hooks trust) | `install --target codex --hooks --scope user` writes `~/.codex/hooks.json` (matchers `Bash|apply_patch` and `Bash`, plus PostToolUse, SessionStart, Stop and UserPromptSubmit). It runs `codex mcp add continuous-improvement -- node <rt>/bin/mcp-server.mjs --mode expert`, copies skills to `~/.agents/skills`, and prints "open /hooks to trust". The plugin route (`codex plugin add`) is documented for skills only until probe P3 shows plugin hooks run in the CLI | Hooks inactive until trusted. Hosted tools bypass hooks. No Skill tool, so companion-preference is off. SessionEnd clamped to 3s |
| Gemini CLI | full | `install --target gemini --hooks` renders an extension dir under `<rt>/agents/gemini/` containing `gemini-extension.json` (mcpServers with `${extensionPath}`), `hooks/hooks.json` (BeforeTool `^(run_shell_command|write_file|replace|save_memory)$`, timeouts in ms), `commands/*.toml`, `skills/` and `GEMINI.md`. Then it runs `gemini extensions link <dir> --consent` | A malformed hooks.json is dropped silently. Context text is escaped. No CLI lists hooks |
| Qwen Code | full | `install --target qwen --hooks` renders a native `qwen-extension.json` with mcpServers using `${extensionPath}`, plus hooks, skills, commands and agents. Then it runs `qwen extensions install <dir> --consent` | `$ARGUMENTS` not substituted. CLAUDE_PLUGIN_ROOT is not an env var. UserPromptSubmit also fires on tool results, so per-session dedupe applies |
| Cursor IDE 3.x | full | `install --target cursor --hooks [--scope]` writes `.cursor/hooks.json` (`version:1`, preToolUse `^(Shell|Write|Delete)$`), `.cursor/mcp.json` (`type:"stdio"`), `.agents/skills` and the existing `.mdc`. It warns when the Claude plugin or Claude hooks are also importable | Stray stdout blocks every call on 3.x. Cloud agents run no session or MCP hooks. 2.5.26 has no prompt context. CLI unverified |
| Copilot CLI | full (docs-only); VS Code harness partial (preview); cloud partial | `install --target copilot --hooks [--scope]` writes `~/.copilot/hooks/continuous-improvement.json` or `.github/hooks/...` (`version:1`, camelCase events, `timeoutSec`), runs `copilot mcp add`, and copies skills to `~/.copilot/skills`. No plugin-route hooks | Prompt output dropped. Cloud honours `bash` only and discards hook files. `disableAllHooks`. Timeouts fail open |
| Grok CLI and TUI | partial | `grok plugin install <owner>/continuous-improvement#plugins/continuous-improvement --trust`, then list it under `[plugins] enabled`. The installer prints this, for both `~/.grok` and `~/.grok-tui`. `install --target grok` writes the lessons rules file | No session or prompt context. SessionEnd capped at 1.5s. No Skill alias |
| Devin Local / Windsurf | full | `install --target windsurf --hooks` (alias `devin`) writes `.devin/hooks.v1.json` with `fail_closed` per owner decision, and runs `devin mcp add ... -s user` if the server is not already imported. Skills are skipped when `~/.claude/skills` already provides them | Restricted Mode runs no hooks. `~/.claude` hooks imported by default can double-fire. Plugin hooks fail open |
| Kiro CLI V3 | full (docs-only) | `install --target kiro --hooks` writes `.kiro/hooks/continuous-improvement.json` (`version:"v1"`, `^(execute_bash|execute_pwsh)$`, `^(fs_write|fs_append|str_replace|delete_file)$`), `.kiro/steering/`, `.kiro/skills/`, and runs `kiro-cli mcp add --scope global` | V2 harness (headless without `--v3`) not covered. Global hooks are V3 only. Input keys partly undocumented, so read defensively |
| Kiro IDE | partial (docs-only) | Same workspace `.kiro/hooks` file; exit 2 is the only deny used | Docs conflict on non-zero exits |
| Factory Droid | full (docs-only) | `droid plugin marketplace add <owner>/continuous-improvement`, then `droid plugin install continuous-improvement@<mkt> --scope user`. Alternative: `install --target droid --hooks` writes `~/.factory/hooks.json` | PreToolUse context ignored. SubagentStop cannot block |
| Amp | full (docs-only, experimental API) | `install --target amp --hooks [--scope]` writes `.amp/plugins/continuous-improvement.ts` or `~/.config/amp/plugins/...`, and runs `amp mcp add` | Not in Puck/Spaces. `amp -x` needs `--plugin-ready-timeout` |
| OpenCode | partial | `install --target opencode --hooks` writes `.opencode/plugins/continuous-improvement.js` (dual export) and `.opencode/commands/*.md`, and prints the opencode.json `mcp` (V1) or `mcp.servers` (V2) snippet | V1 has no Stop gate. A throw is a tool error, not a turn stop. V2 export shape unexercised |
| Cline | partial | `install --target cline --hooks` writes one file per platform in `.clinerules/hooks/` (`PreToolUse.ps1` on win32, an extensionless sh wrapper elsewhere, never both) and runs `cline mcp add` (CLI). VS Code MCP is printed as a snippet | No Stop gate. Errors fail open. CLI cannot inject at prompt or start |
| Goose | partial | `install --target goose --hooks` writes `~/.agents/plugins/continuous-improvement/{plugin.json,hooks/hooks.json,skills/}` and prints the config.yaml MCP block and the `GOOSE_MOIM_MESSAGE_FILE` export | Post, session and prompt hooks observe only. `sh -c` on Windows unverified |
| Auggie | partial | `install --target auggie --hooks` merges `hooks` into `~/.augment/settings.json` with timeout 30000 ms, runs `auggie mcp add`, and writes the lessons rules file. The Claude plugin route is never used | Only PreToolUse blocks. Session, Stop and prompt hooks run in the background |
| Junie CLI | partial (Early Access) | `install --target junie --hooks` merges `hooks` into `~/.junie/config.json`, writes `~/.junie/mcp/mcp.json`, `~/.junie/skills/` and the `~/.junie/AGENTS.md` lessons block | Stable builds have no hooks. SessionStart context ignored |
| Zed | rules and MCP | Existing `.rules` block. Skills go to `~/.agents/skills`. The `context_servers` snippet is printed | No hooks at all |
| Aider | rules only | Unchanged `CONVENTIONS.md` and `.aider.conf.yml` | No MCP, skills or hooks |

## PR train

Stacked and single-concern, merged in order. Each PR runs `npm run build`
immediately before staging and stages files by name. `verify:all` and
`npm test` must be green, stated with output.

| # | Branch | Concern | Key files | Est. LOC |
|---|---|---|---|---|
| 0 | `docs/all-agents-plan` | This plan, with the owner decisions taken and the order below | `docs/plans/2026-11-21-all-agents.md` | 500 |
| 1 | `test/claude-hook-goldens` | Record stdout, stderr and exit for every hook over the existing Claude scenarios against the v3.27.0 scripts | `src/test/agent-claude-golden.test.mts`, `fixtures/agent-hooks/claude.json` | 350 |
| 2 | `feat/agent-tool-aliases` | Profiles table, patch-path parser, dual-flavor shell classification. User-visible fix for the fail-open; ships before the refactors because Claude's deny JSON already blocks on Codex, Qwen, Grok, Droid and Auggie | `src/lib/{agent-profiles,patch-paths}.mts`, gateguard-evidence, config-guard-gate, hook-pack-gate, observe-event, fixtures codex/grok/qwen | 490 |
| 3 | `fix/gateguard-state-atomic` | Temp-file plus rename state writes, with one EPERM retry | `src/lib/gateguard-state.mts`, `src/test/gateguard-state.test.mts` | 120 |
| 4 | `refactor/agent-paths-hooks` | One root and project resolver, applied to the hooks and observer, plus the CI_* aliases of the eight CLAUDE_* knobs the hooks read | `src/lib/{agent-paths,agent-env}.mts`, `src/lib/gateguard-state.mts`, `src/hooks/*.mts` (11), `src/bin/observe.mts`, tests | 420 |
| 5 | `refactor/agent-paths-bins` | Same resolver for mcp-server and the offline CLIs, and the `CI_UPDATE_CHECK` alias for the ninth knob (`CLAUDE_CI_UPDATE_CHECK`, read only by install). Open split to close: the MCP server's `getProjectHash` and the `resolveSessionDir()` fallback of `ci_gateguard_clear` (no `state_path`) get no payload and resolve from the server's own cwd, so for an agent that sets no project env var and starts the server outside the repo its hook payloads name, they hash a different bucket than the hooks. Pass the session's workspace root (MCP roots or the tool argument) into `resolveProjectRoot`. As shipped: the server uses MCP roots, not a tool argument (no tool schema changes). A client that declares the `roots` capability gets a `roots/list` request after `notifications/initialized` and after each `notifications/roots/list_changed`; the first `file://` root of the latest reply is passed as the payload `cwd`, so it counts under the hook rule (inside a repository, as its toplevel). A project env var still wins, and with no usable root the server resolves from its cwd as before. `getWorkspaceRoot` is gone: the planning tools use the same root as the bucket when it is an absolute, existing directory, else the git toplevel of the server's cwd, else the cwd (`resolveWorkspaceDir`), so a synthetic env root keeps its bucket and the plan files still land on disk. Only the first file root is tried (like `workspace_roots[0]`); a later repository root in a multi-root reply is not searched. `hook-stats` is unchanged, because its telemetry lives in `~/.claude/hook-telemetry/` keyed on the transcript dir, which three-section-close still writes; `reconcile-instinct-hashes` already used the shared root through gateguard-state. The installer's hook-code deploy dirs stay at `~/.claude/instincts/` (they are wired into `~/.claude/settings.json`); its pack and update-check data follow `CI_INSTINCTS_HOME` | `src/bin/{mcp-server,backfill,harvest-friction,companion-preference-status,install}.mts`, `src/lib/{agent-paths,agent-env}.mts` | 300 |
| 6 | `refactor/hook-core-gateguard` | `hook-io` and `gateguard-decide`, with the Claude encoder moved. As shipped: `NeutralEvent` carries the Claude keys only (`stopReason` and `loopCount` come with the agents that send them, PR 8 and PR 9) plus the tool name, tool input and raw payload the decider and the path resolvers read. `encode` takes the event name, and an agent id with no encoder fails closed (deny and continue are exit 2 with the reason on stderr; context is dropped). `gateguard-decide` is the hook code moved, not pure: it still reads and writes session state and scans the observation log. `runHook` ships with its unit tests but wraps no entry point yet, because wrapping gateguard turns the `gateguard/null-stdin` golden from exit 1 into exit 0, a declared PR 9 change | `src/lib/{hook-io,gateguard-decide}.mts`, `src/hooks/gateguard.mts` | 480 |
| 7 | `refactor/hook-core-others` | hook-pack, config-guard, session and the Stop and prompt hooks moved onto hook-io. As shipped: ten hooks, not eight (hook-pack, config-guard, session, route-prompt, recall-briefing, three-section-close, goal-drift-stop, workflow-distill, typecheck-stop, query-cost-nudge). Each returns one `Decision` and writes only through `encode` and `emit`, with warnings and status lines as notices; a source test in `hook-io.test.mts` fails on a direct stdout or stderr write, an exit call or a hand-built Claude output shape. hook-pack and config-guard read the tool call, and recall-briefing and query-cost-nudge read the prompt and session id, through `normalizeEvent`; session, goal-drift-stop and three-section-close keep their own payload reads, and route-prompt keeps the read that crashes on JSON `null`, for PR 9. The legacy installer's `SESSION_LIB_FILES` in `src/bin/install.mts` adds `hook-io.mjs`, `agent-profiles.mjs` and `patch-paths.mjs` (the uninstall list follows), because the copied `hooks/session.mjs` now imports `lib/hook-io.mjs` and died with `ERR_MODULE_NOT_FOUND` without them. Every moved hook now exits through `emit`, so an asynchronous Node warning a hook triggers (for example DEP0187 on a non-string `transcript_path` in goal-drift-stop) is no longer printed; exit code and stdout are unchanged. hook-pack strips the encoder's trailing newline from its claude deny, because its golden has none. typecheck-stop and workflow-distill still read no stdin. companion-preference (PreToolUse on Skill) and `bin/observe.mjs` are not moved; PR 9 wraps the entry points in `runHook` | `src/hooks/*.mts` (10), `src/lib/hook-io.mts` (header), `src/test/hook-io.test.mts`, `src/bin/install.mts` (`SESSION_LIB_FILES` closure for session's hook-io import) | 460 |
| 8 | `feat/agent-output-encoders` | Per-agent encoders, `--agent`/`CI_AGENT`/two-signal sniff, exit-2 fallback | `src/lib/hook-io.mts`, fixtures for the remaining ten agents, `src/test/agent-matrix.test.mts` | 500 |
| 9 | `fix/stop-hook-loop-guards` | `stop_hook_active`/`loop_count` guard, Grok end_turn skip, `runHook` crash-safe exit 0 | goal-drift-stop, typecheck-stop, hook-io, tests | 220 |
| 10 | `feat/config-guard-agent-paths` | Other agents' guardrail files and CLI verbs | `src/lib/config-guard-gate.mts`, test | 260 |
| 11 | `feat/lessons-renderer` | `lesson-render` and `ci lessons --format/--write` | `src/lib/lesson-render.mts`, `src/hooks/session.mts`, `src/bin/unified-cli.mts` | 330 |
| 12 | `feat/install-runtime-and-planner` | Stable runtime copy, ledger, `--hooks/--scope/--dry-run/--uninstall --target`, planners for codex, qwen, grok, devin, droid | `src/lib/{install-runtime,agent-install-plans}.mts`, `src/bin/install.mts`, tests | 500 |
| 13 | `feat/install-planner-variants` | gemini, cursor, copilot, kiro, auggie, junie, goose, cline renderers | `src/lib/agent-install-plans.mts`, test | 480 |
| 14 | `feat/in-process-plugin-shims` | Bridge plus OpenCode and Amp generators | `src/lib/{hook-bridge,plugin-shim-opencode,plugin-shim-amp}.mts`, test | 460 |
| 15 | `feat/skills-cross-agent-export` | Export skills, and commands as skills, at install time with `${CLAUDE_PLUGIN_ROOT}` rewritten to `<rt>` | `src/lib/skill-export.mts` (the name `skill-catalog.mts` is taken), planner, test | 340 |
| 16 | `feat/mcp-neutral-root-and-doctor` | Neutral path wording in tool descriptions, `ci doctor --agent <id>` running listing probes only | `src/bin/mcp-server.mts`, `src/lib/plugin-metadata.mts`, `src/bin/unified-cli.mts`, tests | 380 |
| 17 | `docs/agent-support-matrix` | `docs/AGENT-SUPPORT.md` rendered from profiles, a `verify:agent-matrix` invariant, README, QUICKSTART, landing, a fix for the root `AGENTS.md` broken references, `.cloudplugin` reconciled | docs, `src/bin/check-agent-matrix.mts`, `package.json` | 480 |

The release is a separate `chore/release-v3.28.0` PR, gated on PR 17 merging
first to avoid the auto-merge ordering hazard.

## Gates

| Gate | Command |
|---|---|
| Generated artifacts match source | `npm run verify:generated` |
| Invariants plus typecheck | `npm run verify:all` |
| Full suite and stated count | `npm test 2>&1 \| tee test-out.txt && node bin/check-test-count.mjs --actual-from test-out.txt` |
| Claude wiring byte-identical | `git diff --exit-code origin/main -- plugins/continuous-improvement/hooks/hooks.json plugins/continuous-improvement/.mcp.json plugins/continuous-improvement/.claude-plugin/plugin.json .claude-plugin/marketplace.json` |
| Claude goldens unchanged | `npm run build && node --test test/agent-claude-golden.test.mjs` |
| Every hook against every agent fixture | `npm run build && node --test test/agent-matrix.test.mjs` |
| Grok fail-open reproduced, then fixed | `echo '{"hook_event_name":"PreToolUse","tool_name":"run_terminal_command","tool_input":{"command":"git push --force origin main"},"session_id":"t","cwd":"."}' \| node hooks/gateguard.mjs` (empty on v3.27.0, deny JSON after PR 2) |
| Codex apply_patch gated | `echo '{"hook_event_name":"PreToolUse","tool_name":"apply_patch","tool_input":{"command":"*** Begin Patch\n*** Update File: package.json\n*** End Patch"},"session_id":"t","cwd":"."}' \| CI_GATEGUARD_FILE_GATE=strict node hooks/gateguard.mjs --agent codex` |
| Allow path prints nothing on every agent | covered in `test/agent-matrix.test.mjs` (stdoutEmpty assertion per agent) |
| Zero runtime dependencies | `node -e "process.exit(Object.keys(require('./package.json').dependencies\|\|{}).length?1:0)"` |
| Dry run writes nothing | `T=$(mktemp -d) && HOME=$T USERPROFILE=$T node bin/install.mjs --target codex,gemini,qwen,cursor,kiro,cline --hooks --dry-run && test -z "$(ls -A $T)"` |
| Installer plans | `npm run build && node --test test/agent-install-plans.test.mjs test/install-targets.test.mjs` |
| Shims | `npm run build && node --test test/plugin-shims.test.mjs` |
| Docs never exceed the profiles | `npm run verify:agent-matrix && npm run verify:doc-runtime-claims && npm run verify:docs-substrings` |
| Codex registration (no model) | `CODEX_HOME="$SCRATCH/probe-codex" node bin/unified-cli.mjs doctor --agent codex` |
| Grok validates, 19 MCP tools | `grok plugin validate plugins/continuous-improvement && GROK_HOME="$SCRATCH/probe-grok/.grok" grok mcp doctor continuous-improvement` |
| Gemini extension validates | `GEMINI_CLI_HOME="$SCRATCH/probe-gemini" gemini extensions validate "$SCRATCH/probe-gemini/ext"` |
| Qwen extension carries MCP | `QWEN_HOME="$SCRATCH/probe-qwen/home" HOME="$SCRATCH/probe-qwen/userhome" USERPROFILE="$SCRATCH/probe-qwen/userhome" qwen extensions install "$SCRATCH/probe-qwen/ext" --consent && qwen mcp list` |

`ci doctor` may only run listing commands. A test asserts its probe table
contains no `exec`, `-p`, `run`, `chat` or prompt argument.

## Claude regression guard

1. Goldens land first (PR 1), before any refactor. Every later PR keeps them
   byte-equal. There is no intended change: the PR 9 loop guard skips
   Claude, per the owner decision below.
2. With no `--agent`, no `CI_AGENT` and a Claude payload, the agent resolves
   to `claude`. The sniff needs an agent env var and a non-Claude payload
   shape together. The claude encoder is today's code moved.
3. The inbound aliases are exact names that Claude never emits.
   `TOOL_ROUTE` keeps its Claude entries, and plugin matchers do not change.
4. Generated Claude wiring is frozen by `verify:generated` and the explicit
   diff gate. `hook-runtime-portability` and `plugin-mcp-registration` keep
   their pins. A change to `.mcp.json` for Codex needs probe P1 evidence and
   its own PR, and is not in this train.
5. Installer contract: `TARGET_IDS[0] === "claude"`, the throw for
   `planTargetWrites("claude")` and the "Claude Code-only" note on rules-only
   plans are all untouched. New behaviour sits behind `--hooks`.
   `patchClaudeSettings` is not modified.
6. Storage: the default root stays `<home>/.claude/instincts` with the same
   hashing. `CLAUDE_*` knobs keep working, and any `CI_*` aliases are
   additive.
7. Existing test files are only appended to. The `test/hook.test.mjs`
   2000 ms flake is reported as a flake, not budget-inflated.

## Risks

- The fail-open is live now on agents that import the Claude plugin. Until
  PR 2 merges, docs must not claim enforcement outside Claude Code.
- Double firing: Cursor, Devin, Grok, Gemini (migrate) and Amp import
  `~/.claude` hooks or plugins. Mitigations: the observer dedupe, the
  installer warning, and the dedupe policy decision.
- Any `console.log` on stdout in a hook becomes a total outage on Cursor 3.x
  and breaks Copilot and Goose parsing. The matrix asserts empty allow
  stdout for every agent.
- Hosts that fail open (Codex, Gemini, Qwen, Cline, Auggie, Copilot timeouts,
  Devin plugin hooks, Goose) make the claim "blocks when the hook runs", not
  "always blocks".
- Agents can switch enforcement off: Codex trust, Copilot
  `disableAllHooks`, Devin Restricted Mode, Gemini and Qwen folder trust,
  Junie EAP builds. `ci doctor` reports trust state where a listing exposes
  it (Codex `hooks/list`).
- Payload keys left undocumented by the vendor: Kiro execute_bash and fs_write,
  Grok read_file, Cursor Shell `cwd` vs `working_directory`, Copilot `toolArgs`
  as a string or an object. The normalizer reads every candidate key, and each
  such fixture is marked unverified.
- Nine agents are docs-only on this host: Kiro, Droid, Auggie, Junie, Cline,
  Goose, OpenCode, Amp and the Copilot CLI. They ship labelled "per docs"
  until a `ci doctor` run is captured.
- Dual-flavor classification can over-deny a POSIX-only pattern on Windows.
  Rule ids are printed.
- Skill duplication and shadowing: Amp takes the first skill with a given
  name, and three cached plugin versions sit on this host. Devin lists
  `/claude:` and `/agents:` duplicates. The installer skips a copy when the
  agent already reads `~/.claude/skills`.
- Vendor churn: Amp permissions removal on 2026-11-29, OpenCode V1/V2 renames,
  Cursor 2.5 to 3.x flips, Kiro V2/V3 split, Auggie 0.x to 1.x. Each profile
  carries a minimum version, and every fixture carries its source and the date
  it was checked.
- A `.md` file placed directly in `~/.agents/plugins/` would become a Junie
  phantom subagent. The Goose plugin dir holds no `.md` at its top level.

## Owner decisions

Taken on 2026-11-21 so the train is not blocked. Each one is the conservative
option. Naim can overrule any of them; the PR that depends on it says so.

- **Installer contract:** `--target <id>` alone stays rules-only and
  byte-identical. Hooks, MCP and skills install only with the new additive
  `--hooks` flag. Making hooks the default is left to a later major.
- **Storage root:** `<home>/.claude/instincts` stays shared by every agent,
  with an optional `CI_INSTINCTS_HOME` override. No migration.
- **User-level config writes** (`~/.codex`, `~/.copilot`, `~/.augment`,
  `~/.junie`, `~/.kiro`, Devin): only with an explicit `--scope user`.
  The default scope is the project.
- **Vendor CLIs:** the installer prints the vendor commands. It runs the
  ones that need no security consent (`<agent> mcp add`) only with `--run`.
  It never passes `--consent` or `--trust` and never pre-seeds Codex hook
  trust; it prints the `/hooks` trust step instead.
- **Fail-closed:** the vendor default is kept (most fail open). A
  `--fail-closed` flag sets the vendor option where one exists.
- **Stop-hook loop guard:** the `stop_hook_active` / `loop_count` guard
  applies to non-Claude agents only, so Claude Code behaviour stays
  byte-identical to v3.27.0.
- **Double firing** (agents that import `~/.claude` hooks and also get a
  native config): the installer warns, and the observer dedupes on
  `(session, tool_use_id)`.
- **Env names:** `CI_*` aliases for the nine `CLAUDE_*` knobs, additive;
  the old names keep working.
- **Observation rows** gain an optional `agent` field.
- **Positioning:** npm description, keywords and landing copy say guardrails
  for coding agents, Claude Code first. Enforcement is claimed only where
  pre-tool blocking is verified, and the tier table is the public promise.
- **OpenCode:** an installer-written local plugin file; no new package.
- **`.cloudplugin/marketplace.json`:** `compatibleWith` regenerated from the
  agent profiles and its stale version fixed.
- **Probe-gated Claude manifest changes** (`cwd` in `.mcp.json`, a
  `mcpServers` path in plugin.json): not in this train; vendor `mcp add`
  commands are used instead.
- **Roo Code** is dropped (shut down). Aider stays rules-only; Zed gets rules,
  MCP and skills.

Still open, asked before they happen:

- Publishing to other vendors' marketplaces (xai-org/plugin-marketplace,
  Gemini gallery, Cursor marketplace, awesome-copilot, Amp, Kiro powers).
- End-to-end checks that send one prompt to an installed agent's model
  (Codex, Gemini, Qwen, Grok) to prove a hook fires. Everything before that
  uses listing commands only.
- Merging the train and the v3.28.0 release.

## Deferred

- Roo Code (shut down) and the ZooCode fork (not researched).
- Cursor CLI hook support (CLI not installed; docs confirm only `workspaceOpen`).
- Probe P3, whether Codex plugin hooks run in the CLI: needs a model turn, so it waits for the end-to-end approval.
- Kiro V2 harness agent-profile hooks.
- Copilot cloud observation logging (hook-written files are discarded at job end).
- Marketplace publishing: xai-org/plugin-marketplace (SHA-pinned PR), Gemini
  gallery (needs a root manifest or release archive), Cursor marketplace,
  awesome-copilot, a hosted Amp plugin URL, a Kiro power. The Codex public
  directory is closed to plugins with lifecycle hooks.
- A separate OpenCode npm package, if V2 needs `@opencode/plugin`.
- A neutral store root (`~/.continuous-improvement`) with migration.
- Flipping `--target` to include hooks by default (a contract change for a later major).
