# All agents: one guard core, per-agent adapters

- Date: 2026-11-21
- Status: PRs 1 to 21 done, each on its own stacked branch (`test/claude-hook-goldens` through `fix/agent-train-closeout-2`), not yet merged. Architecture items 3 and 4 are partly met (see each item; both logged in `docs/deferred.md`, PR 21 section), the Zed owner decision is not met, the PR 20 exception to regression guard item 7 awaits the owner's sign-off, and the owner decisions still open are logged in `docs/deferred.md` (PR 20 section). Next: review and merge in order, then the separate `chore/release-v3.28.0` PR (updated in place as each PR lands)
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
   claude encoder is the current output code moved, not rewritten. Every hook
   entry point ends as `emit(await settleHook(body, hookAgent))` (PR 9;
   `runHook()` is the same with the default streams, and the PreToolUse hooks
   pass their `EVENT` too): any throw ends with empty stdout and the error on
   stderr. At Stop, prompt and session-start events the exit is 0, which closes
   the Kiro Stop loop. At PreToolUse the exit stays non-zero (owner decision:
   the vendor's fail-closed default is kept): exit 1 for an agent with an
   encoder, which Copilot reads as a deny (the Kiro IDE docs disagree on
   exit 1), and exit 2 for an id
   with no encoder. When the agent is claude the throw is rethrown, so Node
   reports it as v3.27.0 did (exit 1, a non-blocking error in Claude Code) and
   the Claude goldens keep their bytes.
3. **Pure deciders.** `src/lib/gateguard-decide.mts` is new. hook-pack-gate,
   config-guard-gate, goal-drift-gate, typecheck-gate and recall-briefing stay
   as they are. Each hook file becomes: read stdin, normalize, decide, encode.
   Partly met: gateguard is read stdin, normalize, decide, encode (PR 6) and
   the other hooks return one `Decision` through the encoder (PR 7), but `gateguard-decide` is the hook code moved, not pure: it still
   reads and writes the session state and scans the observation log (PR 6 row).
   Logged in `docs/deferred.md` (PR 21 section).
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
   Partly met: `AgentProfile` (`src/lib/agent-profiles.mts`) holds only the
   tool map and input keys. Events, timeouts, matchers and fail-closed live in
   the `SPECS` of `src/lib/agent-install-plans.mts`, the encoders in the
   `ENCODERS` of `src/lib/hook-io.mts`, and the tiers, capability flags and the
   verified pre-tool verdict in `src/lib/agent-support.mts` (PR 17, PR 20).
   The docs and `.cloudplugin` render from `agent-support.mts`; the installer
   renders from `SPECS` crossed with the profiles. `verify:agent-matrix` fails
   on a blocking claim for a row whose `canBlockPreTool` is not true, and
   (PR 20) on a row that claims blocking while its verdict is not yes (or
   conditional with the condition in its Blocks cell). The verdict is copied
   by hand from the matrix above; nothing reads the matrix to check it.
   Logged in `docs/deferred.md` (PR 21 section).
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
   and can double-fire. Met by PR 18; the `summariseInput` kind switch
   and PowerShell case were not needed (PR 2 already routes aliases by kind).
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
    bridge always spawns each hook in `node` from the runtime copy with
    `--agent claude` and reads the Claude reply (PR 14 row). OpenCode gets a dual default export (V1 `server()` plus V2
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

As shipped (PR 17), the public promise is `docs/AGENT-SUPPORT.md`, rendered from `src/lib/agent-support.mts`. Where it differs from the table below, the rendered table follows the code: Qwen, Grok and Gemini are native config merges (PR 12, PR 13), Kiro CLI and the Kiro IDE are separate rows (PR 20: the IDE is a `variantOf: "kiro"` row rated partial, with no blocking claimed, because its pre-tool cell in the verified matrix is partial), Junie installs with `--scope user`, and Zed is rules only because no MCP or skills install exists for it yet (PR 15).

`<rt>` = `<instincts root>/runtime/<version>`. Every hook command has the form
`node "<rt>/hooks/<x>.mjs" --agent <id>`.

| Agent | Tier | Install | Cannot |
|---|---|---|---|
| Claude Code | full | Unchanged: plugin install, or `npx continuous-improvement install` | Nothing lost |
| Codex CLI and IDE | full (after /hooks trust) | `install --target codex --hooks --scope user` writes `~/.codex/hooks.json` (matchers `Bash|apply_patch` and `Bash`, plus PostToolUse, SessionStart, Stop and UserPromptSubmit). It runs `codex mcp add continuous-improvement -- node <rt>/bin/mcp-server.mjs --mode expert`, copies skills to `~/.agents/skills`, and prints "open /hooks to trust". The plugin route (`codex plugin add`) is documented for skills only until probe P3 shows plugin hooks run in the CLI | Hooks inactive until trusted. Hosted tools bypass hooks. No Skill tool, so companion-preference is off. SessionEnd clamped to 3s |
| Gemini CLI | full | `install --target gemini --hooks` renders an extension dir under `<rt>/agents/gemini/` containing `gemini-extension.json` (mcpServers with `${extensionPath}`), `hooks/hooks.json` (BeforeTool `^(run_shell_command|write_file|replace|save_memory)$`, timeouts in ms), `commands/*.toml`, `skills/` and `GEMINI.md`. Then it runs `gemini extensions link <dir> --consent` | A malformed hooks.json is dropped silently. Context text is escaped. No CLI lists hooks |
| Qwen Code | full | `install --target qwen --hooks` renders a native `qwen-extension.json` with mcpServers using `${extensionPath}`, plus hooks, skills, commands and agents. Then it runs `qwen extensions install <dir> --consent` | `$ARGUMENTS` not substituted. CLAUDE_PLUGIN_ROOT is not an env var. UserPromptSubmit also fires on tool results, so per-session dedupe applies |
| Cursor IDE 3.x | full | `install --target cursor --hooks [--scope]` writes `.cursor/hooks.json` (`version:1`, preToolUse `^(Shell|Write|Delete)$`), `.cursor/mcp.json` (`type:"stdio"`), `.cursor/skills` and the existing `.mdc`. It warns when the Claude plugin or Claude hooks are also importable | Stray stdout blocks every call on 3.x. Cloud agents run no session or MCP hooks. 2.5.26 has no prompt context. CLI unverified |
| Copilot CLI | full (docs-only); VS Code harness partial (preview); cloud partial | `install --target copilot --hooks [--scope]` writes `~/.copilot/hooks/continuous-improvement.json` or `.github/hooks/...` (`version:1`, camelCase events, `timeoutSec`), runs `copilot mcp add`, and copies skills to `~/.copilot/skills`. No plugin-route hooks | Prompt output dropped. Cloud honours `bash` only and discards hook files. `disableAllHooks`. Timeouts fail open |
| Grok CLI and TUI | partial | `grok plugin install <owner>/continuous-improvement#plugins/continuous-improvement --trust`, then list it under `[plugins] enabled`. The installer prints this, for both `~/.grok` and `~/.grok-tui`. `install --target grok` writes the lessons rules file | No session or prompt context. SessionEnd capped at 1.5s. No Skill alias |
| Devin Local / Windsurf | full | `install --target windsurf --hooks` (alias `devin`) writes `.devin/hooks.v1.json` with `fail_closed` per owner decision, and runs `devin mcp add ... -s user` if the server is not already imported. Skills are skipped when `~/.claude/skills` already provides them | Restricted Mode runs no hooks. `~/.claude` hooks imported by default can double-fire. Plugin hooks fail open |
| Kiro CLI V3 | full (docs-only) | `install --target kiro --hooks` writes `.kiro/hooks/continuous-improvement.json` (`version:"v1"`, `^(execute_bash|execute_pwsh)$`, `^(fs_write|fs_append|str_replace|delete_file)$`), `.kiro/steering/`, `.kiro/skills/`, and runs `kiro-cli mcp add --scope global` | V2 harness (headless without `--v3`) not covered. Global hooks are V3 only. Input keys partly undocumented, so read defensively |
| Kiro IDE | partial (docs-only) | Same workspace `.kiro/hooks` file; exit 2 is the only deny used | Docs conflict on non-zero exits |
| Factory Droid | full (docs-only) | `droid plugin marketplace add <owner>/continuous-improvement`, then `droid plugin install continuous-improvement@<mkt> --scope user`. Alternative: `install --target droid --hooks` writes `~/.factory/hooks.json` | PreToolUse context ignored. SubagentStop cannot block |
| Amp | full (docs-only, experimental API) | `install --target amp --hooks [--scope]` writes `.amp/plugins/continuous-improvement.ts` or `~/.config/amp/plugins/...`. MCP: runs `amp mcp add` at `--scope user` with `--run`; at project scope prints the `.amp/settings.json` entry plus `amp mcp approve` | Not in Puck/Spaces. `amp -x` needs `--plugin-ready-timeout` |
| OpenCode | partial | `install --target opencode --hooks` writes `.opencode/plugins/continuous-improvement.js` (dual export) and the skills to `.opencode/skills` (PR 15; OpenCode reads its own `.opencode/commands`, so the commands are not copied as skills), and prints the opencode.json `mcp` (V1) or `mcp.servers` (V2) snippet | V1 has no Stop gate. A throw is a tool error, not a turn stop. V2 export shape unexercised |
| Cline | partial | `install --target cline --hooks` writes one file per platform in `.clinerules/hooks/` (`PreToolUse.ps1` on win32, an extensionless sh wrapper elsewhere, never both) and runs `cline mcp add` (CLI). VS Code MCP is printed as a snippet | No Stop gate. Errors fail open. CLI cannot inject at prompt or start |
| Goose | partial | `install --target goose --hooks` writes `~/.agents/plugins/continuous-improvement/hooks/hooks.json` and the skills to `~/.agents/skills` (PR 15: a plugin with skills may need a manifest the research does not pin, and Goose reads `.agents/skills` directly), and prints the config.yaml MCP block and the `GOOSE_MOIM_MESSAGE_FILE` export | Post, session and prompt hooks observe only. `sh -c` on Windows unverified |
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
| 3 | `fix/gateguard-state-atomic` | Temp-file plus rename state writes, retried after 25, 50 and 100 ms on Windows EPERM or EBUSY (Architecture item 14) | `src/lib/gateguard-state.mts`, `src/test/gateguard-state.test.mts` | 120 |
| 4 | `refactor/agent-paths-hooks` | One root and project resolver, applied to the hooks and observer, plus the CI_* aliases of the eight CLAUDE_* knobs the hooks read | `src/lib/{agent-paths,agent-env}.mts`, `src/lib/gateguard-state.mts`, `src/hooks/*.mts` (11), `src/bin/observe.mts`, tests | 420 |
| 5 | `refactor/agent-paths-bins` | Same resolver for mcp-server and the offline CLIs, and the `CI_UPDATE_CHECK` alias for the ninth knob (`CLAUDE_CI_UPDATE_CHECK`, read only by install). Open split to close: the MCP server's `getProjectHash` and the `resolveSessionDir()` fallback of `ci_gateguard_clear` (no `state_path`) get no payload and resolve from the server's own cwd, so for an agent that sets no project env var and starts the server outside the repo its hook payloads name, they hash a different bucket than the hooks. Pass the session's workspace root (MCP roots or the tool argument) into `resolveProjectRoot`. As shipped: the server uses MCP roots, not a tool argument (no tool schema changes). A client that declares the `roots` capability gets a `roots/list` request after `notifications/initialized` and after each `notifications/roots/list_changed`; the first `file://` root of the latest reply is passed as the payload `cwd`, so it counts under the hook rule (inside a repository, as its toplevel). A project env var still wins, and with no usable root the server resolves from its cwd as before. `getWorkspaceRoot` is gone: the planning tools use the same root as the bucket when it is an absolute, existing directory, else the git toplevel of the server's cwd, else the cwd (`resolveWorkspaceDir`), so a synthetic env root keeps its bucket and the plan files still land on disk. Only the first file root is tried (like `workspace_roots[0]`); a later repository root in a multi-root reply is not searched. `hook-stats` is unchanged, because its telemetry lives in `~/.claude/hook-telemetry/` keyed on the transcript dir, which three-section-close still writes; `reconcile-instinct-hashes` already used the shared root through gateguard-state. The installer's hook-code deploy dirs stay at `~/.claude/instincts/` (they are wired into `~/.claude/settings.json`); its pack and update-check data follow `CI_INSTINCTS_HOME` | `src/bin/{mcp-server,backfill,harvest-friction,companion-preference-status,install}.mts`, `src/lib/{agent-paths,agent-env}.mts` | 300 |
| 6 | `refactor/hook-core-gateguard` | `hook-io` and `gateguard-decide`, with the Claude encoder moved. As shipped: `NeutralEvent` carries the Claude keys only (`stopReason` and `loopCount` come with the agents that send them, PR 8 and PR 9) plus the tool name, tool input and raw payload the decider and the path resolvers read. `encode` takes the event name, and an agent id with no encoder fails closed (deny and continue are exit 2 with the reason on stderr; context is dropped). `gateguard-decide` is the hook code moved, not pure: it still reads and writes session state and scans the observation log. `runHook` ships with its unit tests but wraps no entry point yet, because wrapping gateguard turns the `gateguard/null-stdin` golden from exit 1 into exit 0, a declared PR 9 change | `src/lib/{hook-io,gateguard-decide}.mts`, `src/hooks/gateguard.mts` | 480 |
| 7 | `refactor/hook-core-others` | hook-pack, config-guard, session and the Stop and prompt hooks moved onto hook-io. As shipped: ten hooks, not eight (hook-pack, config-guard, session, route-prompt, recall-briefing, three-section-close, goal-drift-stop, workflow-distill, typecheck-stop, query-cost-nudge). Each returns one `Decision` and writes only through `encode` and `emit`, with warnings and status lines as notices; a source test in `hook-io.test.mts` fails on a direct stdout or stderr write, an exit call or a hand-built Claude output shape. hook-pack and config-guard read the tool call, and recall-briefing and query-cost-nudge read the prompt and session id, through `normalizeEvent`; session, goal-drift-stop and three-section-close keep their own payload reads, and route-prompt keeps the read that crashes on JSON `null`, for PR 9. The legacy installer's `SESSION_LIB_FILES` in `src/bin/install.mts` adds `hook-io.mjs`, `agent-profiles.mjs` and `patch-paths.mjs` (the uninstall list follows), because the copied `hooks/session.mjs` now imports `lib/hook-io.mjs` and died with `ERR_MODULE_NOT_FOUND` without them. Every moved hook now exits through `emit`, so an asynchronous Node warning a hook triggers (for example DEP0187 on a non-string `transcript_path` in goal-drift-stop) is no longer printed; exit code and stdout are unchanged. hook-pack strips the encoder's trailing newline from its claude deny, because its golden has none. typecheck-stop and workflow-distill still read no stdin. companion-preference (PreToolUse on Skill) and `bin/observe.mjs` are not moved; PR 9 wraps the entry points in `runHook` | `src/hooks/*.mts` (10), `src/lib/hook-io.mts` (header), `src/test/hook-io.test.mts`, `src/bin/install.mts` (`SESSION_LIB_FILES` closure for session's hook-io import) | 460 |
| 8 | `feat/agent-output-encoders` | Per-agent encoders, `--agent`/`CI_AGENT`/two-signal sniff, exit-2 fallback. As shipped: thirteen encoders beside claude, each shape as Architecture item 7 lists, with two refinements from the verified research: Gemini continues with `{decision:"deny"}` (AfterAgent retries on deny), and context goes out only at SessionStart and UserPromptSubmit (Codex rejects plain stdout at Stop). Grok, Auggie, Junie and Goose get no context, and Auggie and Cline no continue (the reason goes to stderr at exit 0). Every non-claude deny and continue gets the blank-reason line. `selectAgent` takes `--agent <id>` or `--agent=<id>`, then `CI_AGENT`, then a sniff for Cursor (`CURSOR_VERSION` or `CURSOR_PROJECT_DIR` plus `cursor_version` or a camelCase event), Gemini (`GEMINI_SESSION_ID` or `GEMINI_CWD` plus a Gemini event, or `SessionStart`/`SessionEnd` with a string `timestamp`; `GEMINI_PROJECT_DIR` is not used because Qwen sets it), Devin (`DEVIN_PROJECT_DIR` plus a Claude event name and `prompt_id`, `tool_provenance`, `trajectory_id` or `execution_id` with no Qwen `timestamp` or `tool_call_id`, or a `SessionStart` with `source` `startup` or `resume` and no `transcript_path`), Grok (`GROK_SESSION_ID`, `GROK_WORKSPACE_ROOT` or `GROK_HOOK_EVENT` plus `hookEventName`) and Qwen (`QWEN_PROJECT_DIR` plus a Claude event name and a string `timestamp` or `tool_call_id`), else claude. A payload with a non-Claude event name, or with no `hook_event_name` and a `toolName`, `hookName` or `event` key, gets the fail-closed id unless the Cursor or Gemini sniff (the two whose shapes are themselves non-Claude) names it, so a stray agent env var cannot move a Goose or Cline deny off exit 2 (review fix); so does an empty or unknown explicit id. `hookAgent()` reads the stdin the hook already read (`readStdin` now caches it), so typecheck-stop, workflow-distill and a disabled route-prompt select by flag and env only. `normalizeEvent` also reads Copilot camelCase `toolName`/`toolArgs`/`sessionId` and Cline `preToolUse.toolName`/`parameters` (a JSON-encoded `commands` array is one command per line) by shape, so an unidentified agent is still gated. A Claude-named shell takes the flavor of the agent's own profile (`profileTool`; Copilot's profile gains `Bash`), which closes the PR 2 Codex `Bash`-on-win32 gap in gateguard. session.mjs maps `sessionStart`, `agentSpawn`/`AgentSpawn` and Cline's `hookName: TaskStart` to SessionStart, and reads Copilot's camelCase `sessionStart`, which carries no event key, as SessionStart by its `source` (`startup`, `resume` or `new`). The fixtures are `fixtures/agent-matrix/<agent>.json` for all fourteen agents, one stdin per wired event with its source, date and unverified keys; `fixtures/agent-hooks/` is unchanged. Known gaps: a bare Cline payload gets exit 2, on which Cline fails open, and a bare Devin or Junie payload gets the claude bytes, so those three rely on the `--agent` the installer renders (PR 12, PR 13) | `src/lib/{hook-io,agent-profiles,gateguard-decide}.mts`, `src/hooks/*.mts` (11), `fixtures/agent-matrix/*.json` (14), `src/test/{agent-matrix,hook-io,agent-tool-aliases}.test.mts` | 500 |
| 9 | `fix/stop-hook-loop-guards` | `stop_hook_active`/`loop_count` guard, Grok end_turn skip, `runHook` crash-safe exit 0. As shipped: `skipsStopGate(event)` in hook-io is false for claude (owner decision). For any other id, including one with no encoder, it is true when `stop_hook_active` or Grok's `stopHookActive` is true (or present but not a boolean) or `loop_count` is not 0 (a non-integer counts as a repeat), and on Grok also when `reason` is not `end_turn`. It needs the agent selected: with no `--agent` or `CI_AGENT`, a Codex, Droid, Junie or Copilot Stop payload selects claude, so the guard does not apply on those four until the installer renders the flag, and never when Codex or Droid load the unchanged Claude plugin (`docs/deferred.md`; a spawned test pins the bare-path result). `NeutralEvent` gains `stopReason` (the payload `reason`) and `loopCount`. goal-drift-stop, typecheck-stop and three-section-close check it, and typecheck-stop now reads stdin for it. workflow-distill and query-cost-nudge are not guarded, because they never continue a non-Claude turn. All 12 hooks end through `settleHook`, which rethrows for claude, so the three `null-stdin` crash goldens stay exit 1 and no Claude golden changes. For every other agent a crash is exit 0, except at PreToolUse: gateguard, hook-pack, config-guard and companion-preference pass `EVENT`, and their crash is exit 1 for an agent with an encoder (Copilot reads it as a deny; the Kiro IDE docs disagree on exit 1) and exit 2 for an id with no encoder. gateguard, route-prompt and companion-preference call `main()` at module top level so the crash stack is unchanged. `bin/observe.mjs` is not wrapped: its own catch already ends every throw at exit 0 | `src/lib/hook-io.mts`, the 12 `src/hooks/*.mts`, `src/test/stop-hook-loop-guard.test.mts` | 220 |
| 10 | `feat/config-guard-agent-paths` | Other agents' guardrail files and CLI verbs. As shipped: `PROTECTED_PATTERNS` is the seven Claude patterns, unchanged and first (so a Claude path reports the same pattern), then 33 agent patterns. Item 15's list ships except `.codex/hooks.json`, `.cursor/hooks.json` and `.factory/hooks.json`, which the existing `hooks.json` pattern already matches. The research also names, and the PR adds, `.github/copilot/settings(.local).json`, `.copilot/settings.json`, `.devin/config.local.json`, `AppData/Roaming/devin/config.json`, `.qwen/extensions/`, `.grok/config.toml`, `.grok-tui/hooks/` and `.grok-tui/config.toml` (GROK_HOME), `.cline/hooks/` (the CLI), `.factory/settings.json`, `.augment/settings.local.json`, `.config/opencode/plugins/`, `.config/amp/plugins/`, `.agents/plugins/` (Goose) and `.kiro/agents/` (inline agent-profile hooks, research Kiro hook_pre_tool and its skeptic verdict). A second embedded-path pass finds an agent path inside an unquoted one-liner, after the Claude pass. The CLI verbs are only the ones the research or a skeptic correction names (the review pass added the Qwen and Devin manage verbs and Copilot's uninstall and marketplace update aliases): codex `plugin add|remove`, `plugin marketplace add|upgrade|remove`, `mcp add|remove`; gemini `extensions install|link`, `mcp add`, `hooks migrate`; qwen `extensions install|link|uninstall|update|enable|disable`, `mcp add|remove|approve|reject`; grok `plugin install|uninstall|update|enable|disable`, `plugin marketplace add`, `mcp add|enable|disable`; copilot `plugin install|add|uninstall|remove|rm|update|enable|disable`, `plugin marketplace add|update|refresh|remove`, `mcp add|remove|enable|disable`; devin `plugins install|update|remove|prune`, `mcp add|enable|disable|remove`, `migrate hooks`. A match is `via: "agent-cli"` with pattern `<cli>-cli`. The command word is split quote-aware, so a quoted launcher path with a space is recognised, and leading global flags with their values are skipped before the area. A form that is not a mutation falls through to the redirect and write checks, unlike the `claude` branch, which is unchanged. Default stays warn | `src/lib/config-guard-gate.mts`, `src/hooks/config-guard.mts` (reason and header), `src/test/config-guard.test.mts`, `fixtures/agent-hooks/{codex,grok,qwen}.json` | 260 |
| 11 | `feat/lessons-renderer` | `lesson-render` and `ci lessons --format/--write`. As shipped: `renderLessonBlock` and `readLessonSources` are session.mts's `lessonBlock` and file reads moved, same caps and bytes. `--format` takes the fourteen encoder ids plus `zed` and `aider`. A hook agent's format prints `encode(<id>, "SessionStart", context)` stdout for the current project plus global, and nothing when `CI_INSTINCT_LOAD` is off; `--write` and `--scope` for it are refused. Per the owner decision on user-level config writes, `--scope project|user` defaults to the project. Project routes (project plus global lessons, research instructions_file): `.grok/rules/`, `.augment/rules/` with `type: always_apply`, Junie's `.junie/AGENTS.md` block (or `.junie/rules/` beside a root `AGENTS.md`; legacy `.junie/guidelines` refused), a `.goosehints` block, a block in the first Zed rules file present (none created; refused when absent), and `.aider.continuous-improvement-lessons.md`. A project root that is not an existing directory is refused. With `--scope user` only, the user routes get global lessons only, because each file loads in every repository: Grok `$GROK_HOME/rules/` (default `~/.grok/rules/`), Auggie `~/.augment/rules/`, a managed block in `~/.junie/AGENTS.md` and in Zed's personal `~/.config/zed/AGENTS.md` (`%APPDATA%\Zed\AGENTS.md` on win32), and our own files for Goose (`~/.config/goose/continuous-improvement-lessons.md`, which `GOOSE_MOIM_MESSAGE_FILE` must name; skeptic correction) and Aider (`~/.aider.continuous-improvement-lessons.md`, which `read:` must list). The command prints the Goose and Aider step instead of editing their env or `.aider.conf.yml`, and names the file `GOOSE_MOIM_MESSAGE_FILE` points at when it is another one. The lessons block has its own markers, distinct from the installer's skill block, and an unpaired or repeated marker refuses the write. Any route under `<home>/.agents` is refused. The `ci` entry guard compared `file://${argv[1]}` and never matched on Windows; it now compares real paths. `lesson-render.mjs` joins the bundle copy list and the legacy installer's `SESSION_LIB_FILES` | `src/lib/lesson-render.mts`, `src/hooks/session.mts`, `src/bin/unified-cli.mts`, `src/bin/{install,generate-plugin-manifests}.mts`, `src/test/{lesson-render,lessons-cli}.test.mts` | 330 |
| 12 | `feat/install-runtime-and-planner` | Stable runtime copy, ledger, `--hooks/--scope/--dry-run/--uninstall --target`, planners for codex, qwen, grok, devin, droid. As shipped: `installRuntime` copies `hooks/`, `bin/`, `lib/`, `instinct-packs/`, `templates/planning-with-files/` and `package.json` (the MCP server reads the packs and templates, and `plugin-metadata` reads the version) into a staging dir and renames it to `runtime/<version>/`; a same-version reinstall swaps the complete copy in and puts the old one back on failure. Other versions are pruned only after an install succeeds, and only when no ledger entry points at them. The planner is pure (`planAgentInstall(agent, ctx)` returns writes, runs, printed steps, notes and warnings) and renders the hooks from `getPluginHooksConfig()`: a PreToolUse group that names a file tool takes the profile's shell, file-write and patch names, one with only shells takes the shell names, and the Skill group (companion-preference) is dropped. Matchers are an anchored regex on Codex and Devin and a plain name list on Qwen, Grok and Droid. Events: Codex without SessionEnd, Grok PreToolUse, PostToolUse and Stop only, the others all six. MCP: Codex user `codex mcp add` (project: a printed `.codex/config.toml` snippet), Qwen `mcpServers` in the same settings.json, Grok `grok mcp add --scope`, Devin `devin mcp add -s`, Droid `.factory/mcp.json` (its `mcp add` always writes the user file). Deviations from the per-agent table: Qwen is a settings.json merge, not a rendered extension installed with `qwen extensions install --consent` (the owner decision forbids `--consent`); Grok is a native `.grok/hooks/` file, not the printed `grok plugin install --trust` (same reason); Devin user scope merges the `hooks` key of `%APPDATA%\devin\config.json` (`~/.config/devin/` elsewhere), the only user-level hook location the research documents. Every config is merged hook by hook (foreign entries and malformed rows kept, an earlier runtime's commands for the agent replaced); a file that is not a JSON object is refused. The ledger entry is keyed on target, scope and project root, and `--uninstall --target` defaults to the project scope of the current project like install. `parseHookArgs` returns `none` for every argv without the new flags, so `--target <id>` alone, `--uninstall` and `--uninstall --target claude` take the old paths; `--dry-run`, `--scope`, `--run` and `--fail-closed` without `--hooks`, and a hooks-only id without `--hooks`, exit 1. Double-firing warning: Grok and Devin (Claude settings hooks), Grok also the Claude plugin. Review fixes: a project-scope install with no project root, or with the home directory as the root, is refused (as `ci lessons` does); each agent is recorded in the ledger as soon as its files land, and a failed write puts that agent's files back; the ledger keeps a `runtimes` history and pruning removes only recorded runtimes; project-scope vendor commands and their undo run in the project root (recorded as the run's `cwd`); a `continuous-improvement` MCP entry the installer did not write is refused, not overwritten. The rules file (`AGENTS.md`) is not in the ledger and stays on uninstall | `src/lib/{install-runtime,agent-install-plans}.mts`, `src/bin/install.mts`, `src/test/{agent-install-plans,install-hooks}.test.mts` | 500 |
| 13 | `feat/install-planner-variants` | gemini, cursor, copilot, kiro, auggie, junie, goose, cline renderers. As shipped: the eight join `HOOK_AGENT_IDS` with the PR 12 flag rules (kiro, auggie, junie, goose and cline are hook-only and need `--hooks`; gemini, cursor and copilot with `--hooks` also keep their rules file, and `--uninstall --target` on them now removes only the hook install, as for codex). The spec table gains native event names (Gemini BeforeTool/AfterTool/BeforeAgent/AfterAgent, Cursor and Copilot camelCase, Copilot `agentStop`), a timeout field and unit (Gemini and Auggie ms, 30000; Copilot `timeoutSec`), a root `version` (Cursor and Copilot 1, Kiro "v1") and two layouts beside Claude's groups: `flat` handlers with their own matcher (Cursor, Copilot) and Kiro's one `hooks` list of `{name, trigger, matcher, action, timeout, enabled}` rows; the ledger records the layout so the uninstall strips exactly our entries. Events wired: Gemini and Cursor all six; Copilot PreToolUse, PostToolUse, SessionStart and Stop (prompt output dropped, its sessionEnd payload names no event); Kiro all but SessionEnd (V3 only); Auggie PreToolUse and PostToolUse (the rest runs in the background); Junie all but SessionStart and SessionEnd (context ignored); Goose PreToolUse, PostToolUse and Stop; Cline PreToolUse. Matchers are anchored regexes except Copilot (a name list Copilot anchors). Fail-closed fields: Cursor `failClosed`, Junie `blockOnError`, Goose `on_failure: block`. MCP: Gemini, Kiro and Junie a JSON file in both scopes, Cursor `.cursor/mcp.json` with `type: "stdio"`, Copilot `.github/mcp.json` (`type: "local"`) or `copilot mcp add` in user scope, Auggie `mcpServers` in `~/.augment/settings.json` in user scope and a printed `auggie mcp add --project` step otherwise, Goose a printed `config.yaml` block, Cline `cline mcp add --yes` in user scope plus a printed VS Code snippet. Cline gets exactly one script per platform (`PreToolUse.ps1` on win32, an executable extensionless sh file elsewhere) that runs gateguard, hook-pack and config-guard on the same stdin and answers with the first reply; the PowerShell variant hands the stdin to each node through temp files, because a PowerShell pipe or .NET stdin writer prefixes a BOM in Windows PowerShell 5.1. A same-name script without our marker is refused; the ledger stores its sha256 and the uninstall deletes it only while unchanged. In user scope the script goes to `Cline/Hooks` in the Documents folder Windows reports (`[Environment]::GetFolderPath('MyDocuments')`, resolved by the IO layer and passed in as `PlanContext.documentsDir`), because the extension finds it through `getDocumentsPath()`, which follows a OneDrive Known Folder Move; when that resolves to nothing usable the script goes to `~/Documents` with a note to copy it by hand, and a redirected folder gets a note that the CLI, whose hook lookup has no OneDrive candidate, may not see it. Deviations from the per-agent table: Gemini is a settings.json merge, not a linked extension (`--consent`); Kiro's MCP server is a `settings/mcp.json` write, not `kiro-cli mcp add`; Goose's plugin has no `plugin.json` (hook-only plugins need none) and no skills yet (PR 15); no skill copies (PR 15) | `src/lib/{agent-install-plans,install-runtime}.mts`, `src/bin/install.mts` (help), `src/test/{agent-install-variants,agent-install-plans,install-hooks}.test.mts` | 480 |
| 14 | `feat/in-process-plugin-shims` | Bridge plus OpenCode and Amp generators. As shipped: the bridge spawns each hook in `node` from the runtime copy with a Claude Code payload and `--agent claude`, and reads the Claude reply (exit 2, a `permissionDecision` deny or `{decision:"block"}` blocks; SessionStart stdout is the lessons). It does not import the deciders in-process: both agents load plugins with Bun, the hooks are built and tested on Node only, and the spawned hook keeps the one code path the Claude goldens pin. PreToolUse runs gateguard, hook-pack (shells only) and config-guard in parallel, the first deny in table order wins, a file-tool group also takes `apply_patch`, and on win32 a shell call goes as both Bash and PowerShell (Architecture item 8). Stop runs goal-drift-stop and typecheck-stop and skips the fire right after one it continued (the non-Claude stop_hook_active rule, kept in the bridge because the hooks run as claude). Review fix: a new user prompt resets that guard (Amp `agent.start`, OpenCode 2.x session `prompt`, except the prompt that carries our own synthetic text), and so does a `session.synthetic` call that throws, because a cancelled, failed or interrupted continuation never reaches the next Stop. A host API without `amp.on` or 2.x `ctx.tool.hook` fails the plugin load under `--fail-closed` and prints one warning otherwise. A hook that crashes, times out or cannot start allows, or blocks with `--fail-closed`. The OpenCode default export is the plain `{id, setup, server}` object (`@opencode/plugin@2.3.2` `define()` is the identity), with 1.x `tool.execute.before` (throw), `tool.execute.after`, `experimental.chat.system.transform` and 2.x `execute.before` (throw), `execute.after`, session `context` and `experimental.idle` plus `session.synthetic`; the lessons are computed once per session and pushed on every request. Amp: `tool.call` reject-and-continue, `tool.result` observer, `agent.start` hidden message on each thread's first turn, `agent.end` continue with `maxContinuations: 1` on status `done` only. The installer writes one owned plugin file per agent (`PLUGIN_AGENT_IDS`, beside `HOOK_AGENT_IDS`; marker plus sha256 in the ledger, as for Cline), Amp `amp mcp add` at user scope and a printed `.amp/settings.json` entry plus `amp mcp approve` at project scope, OpenCode printed 1.x `mcp` and 2.x `mcp.servers` entries. `.opencode/commands/*.md` is not written (OpenCode already reads `.claude/skills`; PR 15 exports the commands as skills). The plugin files are not in the Claude plugin bundle: they run from the runtime copy of `lib/`, so `generate-plugin-manifests` is unchanged | `src/lib/{hook-bridge,plugin-shim-opencode,plugin-shim-amp,agent-install-plans}.mts`, `src/bin/install.mts` (help), `src/test/plugin-shims.test.mts` | 460 |
| 15 | `feat/skills-cross-agent-export` | Export skills, and commands as skills, at install time with `${CLAUDE_PLUGIN_ROOT}` rewritten to `<rt>`. As shipped: `planSkillExport` in `src/lib/skill-export.mts` (pure) gives each of the fifteen hook and plugin agents every bundled `SKILL.md` from `plugins/continuous-improvement/skills/`, in the dir the verified research names for it and the scope: Codex, Goose and Amp `.agents/skills` (Codex, Devin and Goose user `~/.agents/skills`, Amp user `~/.config/amp/skills`), Qwen `.qwen/skills`, Grok `.grok/skills` (`$GROK_HOME/skills`), Devin `.devin/skills`, Droid `.factory/skills`, Gemini `.gemini/skills`, Cursor `.cursor/skills`, Copilot `.github/skills` and `~/.copilot/skills` (the only dirs the VS Code harness is documented with), Kiro `.kiro/skills` (`KIRO_HOME`), Auggie `.augment/skills`, Junie `.junie/skills`, Cline `.cline/skills` (`.agents/skills` is source-only there), OpenCode `.opencode/skills` and `~/.config/opencode/skills`. Commands with no same-name skill (13) are copied as skills only for the six agents with no command files of their own (Codex, Copilot, Devin, Kiro, Goose, Amp); the others' native command files are not written. Only `${CLAUDE_PLUGIN_ROOT}/` paths are rewritten (a prose mention stays), and the runtime copy gains `scripts/`, which the rewritten paths reach. A skill the agent reads from `~/.claude/skills` by default (Grok, Devin, Auggie, Goose, OpenCode, Amp) is not copied when present there, unless the agent's env var or Grok's `[compat.claude] skills = false` turns that reading off. Each copy carries a marker after its frontmatter; a same-name file without it is left with a warning. The IO layer reads the catalog (`readSkillCatalog`, which refuses a skill dir with more than `SKILL.md` and any malformed name or frontmatter) and passes it as the optional `PlanContext.catalog`; the ledger records each copy as an owned script with `skill: <name>`, the uninstall keeps a copy another entry also records (Codex and Devin share `~/.agents/skills`) and removes an emptied skill dir, and the install prints one line per skills dir. Review fixes: the `~/.claude/skills` skip applies only when that copy is ours (the bundled text, or the npx installer's owned `ship`); a foreign skill of the same name gets our copy beside it and a name-clash warning. Every TOML spelling of Grok's `compat.claude.skills = false` turns the skip off, and so does a config that cannot be read. An install that rewrites a copy another entry records moves that entry's sha256 too, so agents sharing `~/.agents/skills` at different versions still uninstall cleanly, and agents uninstalled together count each shared copy once. Not done: a copy whose skill a later version drops stays behind on reinstall; Zed gets no skills (it has no `--hooks` install to carry them, and adding one changes what `--uninstall --target zed` removes; logged in docs/deferred.md for the owner to confirm); an agent that also reads `.agents/skills` can see a second copy when installed together with Codex, Goose or Amp (docs/deferred.md) | `src/lib/skill-export.mts` (the name `skill-catalog.mts` is taken), `src/lib/{agent-install-plans,install-runtime}.mts`, `src/test/skill-export.test.mts`, one assertion in `src/test/install-hooks.test.mts` | 340 |
| 16 | `feat/mcp-neutral-root-and-doctor` | Neutral path wording in tool descriptions, `ci doctor --agent <id>` running listing probes only. As shipped: the four descriptions that built a path on `~/.claude/instincts/` (`ci_gateguard_clear` state_path, `ci_goal_check` goal_file, `ci_recall`, `ci_distill_propose`) now say `<hash>/... under the instincts root (CI_INSTINCTS_HOME when set, else ~/.claude/instincts; every agent shares it)`, and the state_path refusal prints the root the server resolved; names, order and count unchanged. The probe table is a new `src/lib/agent-doctor.mts` (unified-cli only parses and prints), one row per `install --hooks` agent plus the `windsurf` alias, every command from the research `no_model_checks` with the skeptic verdicts applied. Codex adds the `app-server` JSON-RPC `hooks/list` (stdin kept open until the reply, since codex-cli 0.171.0 exits on EOF first) and reports our hooks by `trustStatus`. Left out: `codex debug prompt-input` (prompt argument), `amp plugins exec`, `gemini skills list` (hung ~150 s in the research), `codex doctor` (misreports plugin MCP), the Cursor CLI `agent` (resolves to Grok's agent.exe on this host), and every in-session slash listing, printed as notes instead. A binary is looked up on absolute PATH entries only; a `.cmd`/`.bat` shim runs through cmd.exe with table tokens pinned to `[A-Za-z0-9._/:=-]`; output is redacted and capped; 30 s per probe, and a probe that times out is ended with its whole process tree on Windows (`taskkill /T /F`, since killing cmd.exe left the real CLI running); exit 1 when a CLI is missing, a probe fails or the Codex `hooks/list` reply has no readable `data`. `codex features list` prints only its `hooks`, `plugins` and `skill_search` rows, and a hook with a `pluginId` counts as ours only when that id is `continuous-improvement@...` (one without is matched by its runtime-copy path) | `src/lib/agent-doctor.mts`, `src/bin/mcp-server.mts`, `src/lib/plugin-metadata.mts`, `src/bin/unified-cli.mts`, `src/test/{agent-doctor,mcp-neutral-wording}.test.mts` | 380 |
| 17 | `docs/agent-support-matrix` | `docs/AGENT-SUPPORT.md` rendered from profiles, a `verify:agent-matrix` invariant, README, QUICKSTART, landing, a fix for the root `AGENTS.md` broken references, `.cloudplugin` reconciled. As shipped: the rows live in a new `src/lib/agent-support.mts` beside `agent-profiles.mts`, not inside it, because `agent-profiles.mjs` is copied into the plugin bundle and the runtime while these rows are read only by the docs check and the build; a test pins a row for every profile id, every `HOOK_AGENT_IDS` and `PLUGIN_AGENT_IDS` id, claude, zed and aider. Each row carries `canBlockPreTool`, the blocks cell, the lesson route (session hook, `ci lessons` rules file, none), the Stop gate, MCP, the evidence (captured runs, installed binary, vendor docs), the install commands, the follow-up step, what it cannot do and its research source; the tier is derived (full, partial, rules only), so it cannot contradict the flags. `bin/check-agent-matrix.mjs` (`--write` renders) checks `docs/AGENT-SUPPORT.md` whole, the README and landing tables between `agent-matrix` markers, the `.cloudplugin` `version` and `compatibleWith` (the build now writes both; `openclaw` dropped, the research never covered it), and fails on any sentence in README, QUICKSTART, llms.txt, AGENT-SUPPORT or the landing that names a row with `canBlockPreTool` other than true (Zed, Aider) beside a blocking verb that no negation governs (a negation counts within three words before the verb in its clause, or as a `Blocks: no` label; Markdown paragraphs and list items are read whole, HTML is cut only at block tags; the verbs include stop, prevent, gate and guard against, after the PR 17 review); a blocking row with no pre-tool hook install fails too. It runs in `verify:all` after `doc-runtime-claims` (19 invariants). npm description and llms.txt summary lead with "Guardrails for coding agents, Claude Code first" and state the 15 other blocking agents (a pinned test derives the count); `plugin.json`, both marketplace descriptions and `.claude-plugin/marketplace.json` are unchanged | `src/lib/agent-support.mts`, `src/bin/{check-agent-matrix,generate-plugin-manifests}.mts`, `src/test/{check-agent-matrix,plugin-description}.test.mts`, `docs/AGENT-SUPPORT.md`, README, QUICKSTART, llms.txt, landing, AGENTS.md, `.cloudplugin/marketplace.json`, `package.json` | 480 |
| 18 | `fix/observer-agent-payloads` | Architecture item 9 and the session-identity gap, so a read clears the blind-edit gate on every hook agent. As shipped: `parseHookPayload(raw, agent)` takes the tool call from Claude's `tool_name`/`tool_input` (kept as sent, so Claude rows are byte-identical), else hook-io's new `payloadToolCall` (Copilot camelCase `toolName`/`toolArgs`, Cline nested `preToolUse` or `postToolUse`); the result is Cline's `postToolUse.result` when present (the CLI's `tool_result` is the whole call record), else the first of `tool_response`, `tool_output`, `toolOutput`, `toolResult`, `tool_result`, and for a non-Claude agent a `tool_response` object with a string `output` (Devin) is that output. A non-Claude row is `tool_complete` when its event (`hook_event_name`, `hookEventName`, `event` or `hookName`) is a post-tool name (PostToolUse, AfterTool, postToolUse, post_tool_use, the Cline CLI's tool_result) and `tool_start` on a pre-tool name, else by the result, so Goose's PostToolUse, which carries none, counts; Claude keeps the result rule. The session is hook-io's new `payloadSessionId`: `session_id`, `sessionId`, `conversation_id` (Cursor tool events, Auggie), `taskId` (Cline), read by `normalizeEvent` and the observer alike. The observer selects the agent with `selectAgent` (the rendered `--agent`); non-Claude rows add `agent` and, when present, `tool_use_id` (`tool_use_id`, `toolUseId`, Goose `tool_call_id`). Dedupe: a row is skipped when the last 256 KiB of the log hold one with the same session, `tool_use_id` and event (the event is in the key because the npm installer's PreToolUse observer would otherwise swallow the PostToolUse row); a Claude-selected fire checks too but writes no id. Fail closed: a non-Claude payload with no session gets no evidence (a `session ""` row may be any conversation's) and a deny that names the `gateguard-clear` route. With no session id, `findEvidence` counts only rows with no `agent` field, so another agent's session-less read never clears a session-less Claude-selected edit (review fix). Cline's installer events gain PostToolUse (a `PostToolUse`/`PostToolUse.ps1` script running only the observer). The legacy installer's `OBSERVER_LIB_FILES` adds `hook-io.mjs`. Each agent-matrix fixture gains an `evidence` read and edit; the round-trip test runs the observer then gateguard per agent. Left open (docs/deferred.md): file-read tools with no documented path key (Copilot `view`), Junie tool events that may name no session, and Claude-shaped double fires | `src/lib/{observe-event,hook-io,gateguard-decide,agent-install-plans}.mts`, `src/bin/{observe,install}.mts`, `fixtures/agent-matrix/*.json` (14), `src/test/{agent-matrix,observe,observe-event,hook-io,agent-install-variants,install-hooks}.test.mts` | 450 |
| 19 | `fix/install-uninstall-exact` | Install, uninstall, `ci doctor` and `ci lessons` do exactly what the docs say (closeout of the whole-stack critic gaps 3, 6, 7, 10 and 11, plan row 4, doc claims 1, 4, 5 and 6, and the CLI probe defects 1 to 10). As shipped: `runHookUninstall` keeps an entry whose vendor run was made and not undone (no `--run`, a failed undo, or a run with no undo command) as `pending: true` with `files: []` and only those runs, so `runtimesInUse` keeps its runtime; it prints the undo and the `--uninstall --target <id> [--scope user] --run` that finishes it. An undo whose output says `No MCP server named` counts as done (Grok 1.0.85 exits 1 with it for a server it does not have; codex-cli 0.171.0 prints it with exit 0). A run with no undo command (only in ledgers from PRs 12 to 18) is dropped by the uninstall after the one that told the user to remove it by hand, and so is a run whose undo failed (`undoFailed: true` on the run; with `--run` the next uninstall tries it once more), so a vendor CLI that is gone cannot keep the entry forever (review fix). A user-scope entry keeps an earlier user install's rules files from other projects, and a rules file counts as created when any entry recorded creating it (review fixes). Grok's undo is `grok mcp remove continuous-improvement --scope <scope>` (probe on Grok 1.0.85; the research listed no remove), config-guard's Grok verbs gain `mcp remove`, and the install note now names the `--run` that removes a replaced server. User scope follows an absolute `GEMINI_CLI_HOME` (`<it>/.gemini`) and `QWEN_HOME` (`<it>/settings.json`, `<it>/skills`), read from the installed Gemini CLI 0.41.2 and Qwen Code 0.28.0 bundles. A rules file `--hooks` writes is a ledger file of its hook agent: `managedBlock: true` for AGENTS.md, GEMINI.md and the Copilot file (the uninstall cuts our one block, refuses an unpaired or repeated marker, and deletes the file only when it was created and nothing else is left; a reinstall keeps `created` from the slot's previous entry), a sha256-owned whole file for the Cursor and Windsurf rules only when created; a whole rules file that was there before is written as before but not recorded. `HookRunIo.inProject` (false when `hookProjectRoot` found none) stops the rules files with `--scope user` outside a project, with a note. An uninstall that finds nothing at its scope names the other scope's entry. `pruneRuntimes` returns the ledger without the runtimes it pruned. `ci doctor`: ANSI stripped, a long line keeps its last 80 characters, a `disconnectedHint` on the Gemini and Qwen `mcp list` probes fails one that lists our server as Disconnected, and `summarizeGrokInspect` replaces the `grok inspect --json` dump with a count of our hooks (or the untrusted-folder line). Not changed: `ci lessons`, whose Goose warning and `CI_INSTINCT_LOAD` handling already shipped in the PR 11 review fix (`0cfaf32`). Left open (docs/deferred.md): a hand-run `mcp add`, a reinstall over a pending entry | `src/lib/{install-runtime,agent-install-plans,agent-doctor,skill-export,config-guard-gate,agent-support}.mts`, `src/bin/{install,check-agent-matrix}.mts`, `src/test/{install-hooks,agent-install-plans,agent-doctor,config-guard}.test.mts`, README, docs/AGENT-SUPPORT.md, landing, CHANGELOG | 500 |
| 20 | `docs/agent-train-closeout` | Docs and plan closeout, so every public claim matches the shipped code (critic gaps 8, 9, 12 and 13, plan rows 3, 5, 6 and 7, doc claims 2, 3, 7 and 8, probe defect 11). As shipped: `AgentSupport` rows gain `preToolVerdict` (the verified matrix's Pre-tool block cell, copied by hand: `yes`, `conditional`, `partial` or `no`) and an optional `variantOf`. The one "Kiro CLI and IDE" row is now Kiro CLI (full, `yes (exit 2)`) and Kiro IDE (`id: "kiro-ide"`, `variantOf: "kiro"`, verdict partial, `canBlockPreTool: false`, blocks `not claimed`, tier partial), so `.cloudplugin` `compatibleWith` gains `kiro-ide` and llms.txt names both. `supportTier` rates a non-blocking row partial when its verdict is partial (else rules only, as before). `verify:agent-matrix` fails a row whose verdict is anything but the literal `yes` (missing and malformed included) when it claims blocking by the flag or by a Blocks cell starting with yes, a variant whose base row is missing or is itself a variant, and accepts `not claimed` as a non-blocking cell. Junie's matrix cell, partial (Early Access only), is encoded `conditional` (review fix): a conditional row may claim blocking only when its Blocks cell names the condition, so Junie keeps `yes, on the Early Access build` and a bare `yes` fails. A non-blocking row rated partial fails unless the installer has a hook install for `variantOf ?? id`. `--target kiro-ide` now installs the Kiro hooks (an alias of `kiro` in `src/lib/agent-install-plans.mts`, as windsurf is of devin), so the `kiro-ide` id in `compatibleWith` is an install target. Declared exception to Claude regression guard item 7 (owner sign-off pending: the carve-out the owner decision of 2026-11-22, assumption #25, grants covers an assertion that pins an import path, and these are not; logged in `docs/deferred.md`, PR 21 section): three pre-existing assertions in `src/test/check-agent-matrix.test.mts` changed because the Kiro split forced them: the `row()` helper gains `preToolVerdict: "yes"` (the field is required), the non-blocking id list goes from `[zed, aider]` to `[kiro-ide, zed, aider]`, and the public tier map gains `"kiro-ide": "partial"`. Architecture item 1 and the PR 9 row no longer say the Kiro IDE reads exit 1 as a deny. The support doc now says what a blind edit is and which reads count: a shell command naming the file on every hook agent, and a file tool only where the research documents its path key; Copilot and Auggie `view` do not count, and Devin and Auggie `read` count only when they name the file as `path`, the key Kiro's `read` documents (probe on this branch: Copilot `view`, Auggie `view` and Devin `read` with `file_path` were each followed by a deny of the edit), and a session-less tool event gets the clear-command deny; the Copilot, Devin, Auggie and Junie rows say so. README and landing give the runtime as `<instincts root>/runtime/<version>/`, which follows `CI_INSTINCTS_HOME`. This plan: status, Architecture items 3 and 4 recorded as partly met, item 9 and its two owner decisions met by PR 18, the PR 3 retry wording, the two extension Gates replaced by settings.json merge gates that use listing commands only, regression guard item 7 amended. `docs/deferred.md` gains the owner-decision entries still open | `src/lib/agent-support.mts`, `src/bin/check-agent-matrix.mts`, `src/lib/agent-install-plans.mts`, `src/test/check-agent-matrix.test.mts`, `src/test/agent-install-plans.test.mts`, docs/AGENT-SUPPORT.md, README, llms.txt, landing, `.cloudplugin/marketplace.json`, this plan, docs/deferred.md, CHANGELOG | 300 |
| 21 | `fix/agent-train-closeout-2` | Closure-audit closeout: the `[Unreleased]` CHANGELOG lead for PR 8 said a deny blocks on Kiro and Junie with no qualifier, and `verify:agent-matrix` could not catch it. As shipped: the check also reads the bold lead of each `## [Unreleased]` entry in CHANGELOG.md (`CHANGELOG_FILE`, `changelogClaims`; released sections are history and entry bodies stay unscanned, since the sentence heuristic reads their encoder and exit-code detail as claims; a repository with no CHANGELOG.md has none to check), and `CLAIM_SCAN_FILES` is unchanged. `findBlockingClaims` gains two rules for every scanned file: a sentence that names a conditional row (Junie) beside an unnegated blocking verb must repeat the condition from its Blocks cell (`yes, on the Early Access build` gives `Early Access build`; a cell that names none fails every such sentence), and a short name of a blocking row that a non-blocking row's name extends (`Kiro`, beside `Kiro IDE`) fails there unless the longer name follows it (`Kiro CLI`). Such a claim carries a `reason`, and the violation line prints it. The PR 8 lead now reads `Kiro CLI` and `Junie's Early Access build`, and the PR 20 lead says the table claims no blocking for the Kiro IDE. The Gemini row's Cannot cell no longer describes an extension `hooks.json`, which the settings.json install does not write: no CLI command lists the hooks it loaded from settings.json, and only `/hooks panel` inside a session does (research [Gemini] unknowns). Second closure audit (review fix): the blind-edit gate and config-guard allowed every write through Copilot `str_replace_editor` and `create` and Auggie's legacy `str-replace-editor` and `save-file`, which the installer matches but whose profiles gave no path key (writesweep: four rows UNGATED). The research names these tools and not their argument keys, so each is `WRITE_PATH_UNVERIFIED` in `src/lib/agent-profiles.mts`: a new `ToolSpec.pathKeys` (`path`, `file_path`, `filePath`, `target_file`, unverified, cited in the profile source) replaces the profile's path keys for that tool only, so Copilot's `edit` and `view` and Auggie's other tools read what they read before, and `InboundTool.pathRequired` marks the tool. A write that names a file at none of those keys is denied by gateguard in evidence and strict mode, before the observation log is consulted (no log is no reason to allow it), with a reason that names the tool, the keys tried and the `gateguard-clear` command for the key `no-path:<tool>`, which lets that tool's path-less writes through for the session; `CI_GATEGUARD_FILE_GATE=off` still skips it. config-guard reports it as `via: "no-path"` (a deny under `CI_CONFIG_GUARD=block`, a warning by default). Claude names, the Claude goldens and every other alias are unchanged. New `src/test/agent-write-tools.test.mts` (50 tests, RED before the fix): for each of the four tools an unread existing file is denied at every key, a read file is allowed, `.claude/settings.json` is denied under `CI_CONFIG_GUARD=block`, and a payload with none of the keys is denied (with and without a log, and by config-guard), then allowed after the printed clear command. The writesweep rerun prints 39 rows and no UNGATED. The Gemini and Qwen Blocks cells now name their trust condition (`yes, in a trusted folder`; `yes, once you approve the project hooks or trust the folder`), llms.txt's full-tier list names the conditions for Codex, Gemini, Qwen, Cursor and Devin, and the support doc says how the four write tools are gated. Second review (review fix): three routes still reached an allow with no path the guard checked. A Claude-named write tool of another agent (Grok `Write`, whose documented keys are `path` and `filePath`) was read with the Claude keys only; `profileInboundTool(agent, name)` now gives the agent's own reading, and gateguard and `classifyMutation(toolName, toolInput, agent)` read its path keys beside the Claude ones (a Claude Code event has no profile, so the goldens hold). The other write tools of the profiles with no documented path key (Copilot `edit`; Devin `edit`, `write`, `notebook_edit` with `notebook_path` added; Auggie `edit`, `write`; Junie `Write`, `Edit`) are `WRITE_PATH_UNVERIFIED` or `NOTEBOOK_PATH_UNVERIFIED`. The patch tools with unverified keys (Devin, Copilot, Junie, Cline `apply_patch`, Droid `ApplyPatch`) are `PATCH_UNVERIFIED`: `ToolSpec.pathRequired` marks both, and `pathRequiredFor(agent, name)` decides from the event's own agent when its profile lists the name, else from the merged alias for a file write only, so a Codex or Claude-selected `apply_patch` with no header keeps the evidence-mode warning that `src/test/gateguard-decide.test.mts` pins (Claude regression guard item 7). A patch that names no file under an unverified key is denied with the `no-path:<tool>` route and reported by config-guard as `no-path`. `agent-write-tools.test.mts` gains a per-agent reading suite, an in-process sweep over every Claude-named write tool of every profile, and the review's repro cells through the spawned hooks (100 tests); its own "no other file tool needs a path" assertion widens to the newly marked names (that file is new in this PR). The review's sweep shows a deny in every cell it flagged. Left open (docs/deferred.md): an uninstall that removes the last entry leaves an empty ledger and empty `runtime/` and skills dirs; the unverified path and patch keys; a `view` through `str_replace_editor` or `str-replace-editor` is denied until a captured payload shows a `command` key; Gemini `save_memory` names no file; Architecture items 3 and 4 are partly met; the PR 20 test-assertion exception awaits the owner's sign-off | `src/bin/check-agent-matrix.mts`, `src/lib/agent-support.mts`, `src/lib/agent-profiles.mts`, `src/lib/gateguard-decide.mts`, `src/lib/config-guard-gate.mts`, `src/hooks/config-guard.mts`, `src/hooks/gateguard.mts`, `src/test/check-agent-matrix.test.mts` (appended), `src/test/agent-write-tools.test.mts` (new), docs/AGENT-SUPPORT.md, README, landing, llms.txt, docs/deferred.md, this plan, CHANGELOG | 750 |

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
| Dry run writes nothing (every hook agent) | `T=$(mktemp -d) && HOME=$T USERPROFILE=$T node bin/install.mjs install --target codex,qwen,grok,devin,droid,windsurf,gemini,cursor,copilot,kiro,auggie,junie,goose,cline,opencode,amp --hooks --dry-run && test -z "$(ls -A $T)"` |
| Installer plans | `npm run build && node --test test/agent-install-plans.test.mjs test/install-targets.test.mjs` |
| Shims | `npm run build && node --test test/plugin-shims.test.mjs` |
| Docs never exceed the profiles | `npm run verify:agent-matrix && npm run verify:doc-runtime-claims && npm run verify:docs-substrings` |
| Codex registration (no model) | `CODEX_HOME="$SCRATCH/probe-codex" node bin/unified-cli.mjs doctor --agent codex` |
| Grok validates, 19 MCP tools | `grok plugin validate plugins/continuous-improvement && GROK_HOME="$SCRATCH/probe-grok/.grok" grok mcp doctor continuous-improvement` |
| Gemini settings.json merge lists the server (no consent, listing only) | `R=$(pwd) T="$SCRATCH/probe-gemini" && mkdir -p "$T/proj" && cd "$T/proj" && HOME=$T USERPROFILE=$T GEMINI_CLI_HOME=$T node "$R/bin/install.mjs" install --target gemini --hooks --scope user && HOME=$T USERPROFILE=$T GEMINI_CLI_HOME=$T GEMINI_CLI_TRUST_WORKSPACE=true gemini mcp list` (`continuous-improvement ... Connected`; run outside the repo, since a user install inside a project also writes its GEMINI.md block; the trust variable applies to that one listing process and writes nothing; passed on Gemini CLI 0.41.2, 2026-11-22) |
| Qwen settings.json merge lists the server (no consent, listing only) | `R=$(pwd) T="$SCRATCH/probe-qwen" && mkdir -p "$T/proj" && cd "$T/proj" && HOME=$T USERPROFILE=$T QWEN_HOME=$T/.qwen node "$R/bin/install.mjs" install --target qwen --hooks --scope user && HOME=$T USERPROFILE=$T QWEN_HOME=$T/.qwen qwen mcp list` (`continuous-improvement ... Connected`; passed on Qwen Code 0.28.0, 2026-11-22) |

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
7. Existing test files are only appended to. One exception (owner decision
   taken 2026-11-22, assumption #25): an existing assertion that pins an
   import path may follow code that moved, when the PR names it. The
   `test/hook.test.mjs` 2000 ms flake is reported as a flake, not
   budget-inflated.

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
  `(session, tool_use_id)`. Met: the installer warning shipped with the
  native installs (PR 12), and the dedupe in PR 18 for non-Claude rows (the
  key also carries the event); Claude-shaped double fires stay undeduped so
  Claude rows keep their bytes (`docs/deferred.md`, PR 18).
- **Env names:** `CI_*` aliases for the nine `CLAUDE_*` knobs, additive;
  the old names keep working.
- **Observation rows** gain an optional `agent` field. Met by PR 18: non-Claude
  rows carry the rendered `--agent`; Claude rows are unchanged.
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
  MCP and skills. Not met: Zed is rules only, no `context_servers` snippet is
  printed and no skills are copied; logged for the owner in `docs/deferred.md`
  (PR 15 and PR 20 sections).

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
