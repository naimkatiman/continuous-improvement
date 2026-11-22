// agent-support.mts — What each coding agent gets from this package, as data.
//
// The public promise for every agent: whether the guard blocks a destructive
// command before it runs there, how saved lessons reach the model, whether a
// Stop gate can send a turn back, the install command and what the agent cannot
// do. docs/AGENT-SUPPORT.md, the README tier table, the landing table and the
// `compatibleWith` list in .cloudplugin/marketplace.json are rendered from this
// table (bin/check-agent-matrix.mjs --write; the manifest by the build), and
// `npm run verify:agent-matrix` fails when a doc claims blocking for a row whose
// canBlockPreTool is not true.
//
// It sits beside lib/agent-profiles.mjs (tool names and input keys, one profile
// per agent that has a hook encoder) instead of inside it: agent-profiles.mjs is
// copied into the plugin bundle and the runtime the hooks run from, and these
// rows are read only by the docs check, the manifest generator and their tests.
// A test pins that every profile id has a row here.
//
// Every claim comes from the verified research of 2026-11-21 with the skeptic
// verdicts applied (docs/plans/2026-11-21-all-agents.md, "Verified capability
// matrix" and "Per-agent tier and install"), and from what the installer
// renders (lib/agent-install-plans.mjs notes). Each row cites its source. Pure:
// no I/O.
const NPX = "npx continuous-improvement install";
const LESSONS = (id) => `For the lessons, run \`npx -p continuous-improvement ci lessons --format ${id} --write\`.`;
export const AGENT_SUPPORT = [
    {
        id: "claude",
        names: ["Claude Code"],
        compat: ["claude-code"],
        canBlockPreTool: true,
        blocks: "yes, in every permission mode",
        lessons: "hook",
        stopGate: true,
        mcp: true,
        evidence: "tested",
        install: ["/plugin marketplace add naimkatiman/continuous-improvement", "/plugin install continuous-improvement@continuous-improvement"],
        then: "Restart Claude Code once so the commands load.",
        cannot: "Nothing is lost. The npm installer wires no guard for Claude Code, so use the plugin.",
        source: "This repository: plugins/continuous-improvement/hooks/hooks.json, the captured runs in README and QUICKSTART, the goldens in fixtures/agent-hooks/claude.json.",
    },
    {
        id: "codex",
        names: ["Codex CLI", "Codex"],
        compat: [],
        canBlockPreTool: true,
        blocks: "yes, after you trust each hook in /hooks",
        lessons: "hook",
        stopGate: true,
        mcp: true,
        evidence: "local",
        install: [`${NPX} --target codex --hooks`],
        then: "Open /hooks in Codex and trust each hook. Add the printed MCP block to .codex/config.toml; it and .codex/hooks.json load only in a trusted project. `--scope user --run` writes ~/.codex/hooks.json and runs `codex mcp add` instead.",
        cannot: "Hooks stay off until trusted. Hosted tools bypass hooks. No Skill tool, so companion-preference is not wired.",
        source: "Research Codex CLI 0.171 hook_pre_tool (skeptic: corrected; permissionDecision deny, exit 2 and empty-stdout allow hold) and hook_session_start (plain stdout); matrix row Codex CLI 0.171.",
    },
    {
        id: "gemini",
        names: ["Gemini CLI", "Gemini"],
        compat: ["gemini-cli"],
        canBlockPreTool: true,
        blocks: "yes",
        lessons: "hook",
        stopGate: true,
        mcp: true,
        evidence: "local",
        install: [`${NPX} --target gemini --hooks`],
        then: "Trust the folder in Gemini CLI: it runs no settings.json hooks in an untrusted folder.",
        cannot: "A malformed hooks.json is dropped silently. No CLI lists the hooks.",
        source: "Research Gemini CLI 0.41 hook_pre_tool BeforeTool (skeptic: corrected; top-level decision deny, permissionDecision ignored), AfterAgent, JSON session context; matrix row Gemini CLI 0.41.",
    },
    {
        id: "qwen",
        names: ["Qwen Code", "Qwen"],
        compat: ["qwen-code"],
        canBlockPreTool: true,
        blocks: "yes",
        lessons: "hook",
        stopGate: true,
        mcp: true,
        evidence: "local",
        install: [`${NPX} --target qwen --hooks`],
        then: "Approve the project hooks in Qwen Code or trust the folder.",
        cannot: "`$ARGUMENTS` is not substituted in commands. The prompt hook also fires on tool results.",
        source: "Research Qwen Code 0.28 hook_pre_tool (skeptic: corrected; exit 2 and permissionDecision deny confirmed); matrix row Qwen Code 0.28.",
    },
    {
        id: "cursor",
        names: ["Cursor"],
        compat: [],
        canBlockPreTool: true,
        blocks: "yes (3.x)",
        lessons: "hook",
        stopGate: true,
        mcp: true,
        evidence: "local",
        install: [`${NPX} --target cursor --hooks`],
        then: "",
        cannot: "Cloud agents run no session hooks. 2.5.26 has no prompt context. Stray output from a hook stops every tool call on 3.x. The Cursor CLI is not covered.",
        source: "Research Cursor 2.5.26 / 3.20.17 hook_pre_tool (skeptic: corrected; flat permission deny, invalid JSON blocks on 3.20.17), additional_context, followup_message; matrix row Cursor IDE 3.20.17.",
    },
    {
        id: "copilot",
        names: ["GitHub Copilot CLI", "Copilot"],
        compat: ["github-copilot"],
        canBlockPreTool: true,
        blocks: "yes",
        lessons: "hook",
        stopGate: true,
        mcp: true,
        evidence: "docs",
        install: [`${NPX} --target copilot --hooks`],
        then: "",
        cannot: "Prompt hook output is dropped, so the prompt hooks are not wired. A hook that times out fails open. The cloud agent reads only .github/hooks, and disableAllHooks turns every hook off.",
        source: "Research GitHub Copilot hook_pre_tool (skeptic: corrected; exit 2 deny, fail-closed on errors, fail-open on timeouts), additionalContext, 8-block Stop cap; matrix row Copilot CLI.",
    },
    {
        id: "grok",
        names: ["Grok CLI", "Grok"],
        compat: [],
        canBlockPreTool: true,
        blocks: "yes, in a trusted folder",
        lessons: "rules file",
        stopGate: true,
        mcp: true,
        evidence: "local",
        install: [`${NPX} --target grok --hooks`],
        then: `Run the printed \`grok mcp add\` step. ${LESSONS("grok")}`,
        cannot: "No session or prompt context, so lessons need the rules file.",
        source: "Research Grok Build 1.0.85 hook_pre_tool (skeptic: confirmed, fail-open on unknown tool names reproduced and fixed), systemMessage-only session output, Stop reason end_turn; matrix row Grok 1.0.85.",
    },
    {
        id: "devin",
        names: ["Devin Local", "Devin", "Windsurf"],
        compat: ["windsurf"],
        canBlockPreTool: true,
        blocks: "yes, outside Restricted Mode",
        lessons: "hook",
        stopGate: true,
        mcp: true,
        evidence: "local",
        install: [`${NPX} --target devin --hooks`],
        then: "Run the printed `devin mcp add` step. `--target windsurf --hooks` is the same install.",
        cannot: "Restricted Mode runs no hooks. Hooks it imports from ~/.claude can fire twice. Plugin hooks fail open.",
        source: "Research Windsurf / Devin Local 3000.14 hook_pre_tool (skeptic: corrected; exit 2 or decision block, other non-zero exits fail open), JSON session context; matrix row Devin Local 3000.14.",
    },
    {
        id: "kiro",
        names: ["Kiro CLI and IDE", "Kiro"],
        compat: [],
        canBlockPreTool: true,
        blocks: "yes (exit 2)",
        lessons: "hook",
        stopGate: true,
        mcp: true,
        evidence: "docs",
        install: [`${NPX} --target kiro --hooks`],
        then: "",
        cannot: "CLI sessions on the V2 harness read agent-profile hooks, not this file. A hook crash exits 1, which Kiro CLI allows, and the IDE docs disagree on what that exit means.",
        source: "Research Kiro hook_pre_tool (skeptic: corrected; exit 2 blocks on every surface, IDE non-zero exit docs contradict each other); matrix rows Kiro CLI V3 and Kiro IDE 1.x.",
    },
    {
        id: "droid",
        names: ["Factory Droid", "Droid"],
        compat: [],
        canBlockPreTool: true,
        blocks: "yes",
        lessons: "hook",
        stopGate: true,
        mcp: true,
        evidence: "docs",
        install: [`${NPX} --target droid --hooks`],
        then: "",
        cannot: "Context printed at PreToolUse is ignored. SubagentStop cannot send a turn back.",
        source: "Research [Droid] hook_pre_tool (skeptic: confirmed; Claude Code compatible, permissionDecision wins over decision); matrix row Factory Droid 1.17.",
    },
    {
        id: "auggie",
        names: ["Auggie"],
        compat: [],
        canBlockPreTool: true,
        blocks: "yes",
        lessons: "rules file",
        stopGate: false,
        mcp: true,
        evidence: "docs",
        install: [`${NPX} --target auggie --hooks`],
        then: `Run the printed \`auggie mcp add --project\` step. ${LESSONS("auggie")}`,
        cannot: "Only the tool-call hooks act. Session, Stop and prompt hooks run in the background, so only the guards and the log are wired.",
        source: "Research [Auggie] hook_pre_tool (skeptic: confirmed; JSON read only on exit 0) and the background session, Stop and prompt hooks; matrix row Auggie 1.2.2.",
    },
    {
        id: "junie",
        names: ["Junie CLI", "Junie"],
        compat: [],
        canBlockPreTool: true,
        blocks: "yes, on the Early Access build",
        lessons: "rules file",
        stopGate: false,
        mcp: true,
        evidence: "docs",
        install: [`${NPX} --target junie --hooks --scope user`],
        then: `A project .junie/config.json loads only with --config-location, so install at user scope. ${LESSONS("junie")}`,
        cannot: "Stable builds run no hooks. SessionStart context is ignored.",
        source: "Research [Junie] hook_pre_tool (skeptic: corrected; hooks are an Early Access feature, project config.json ignored by default); matrix row Junie CLI.",
    },
    {
        id: "cline",
        names: ["Cline"],
        compat: [],
        canBlockPreTool: true,
        blocks: "yes, while Enable Hooks is on",
        lessons: "none",
        stopGate: false,
        mcp: true,
        evidence: "docs",
        install: [`${NPX} --target cline --hooks`],
        then: "In the VS Code extension, add the printed MCP snippet to cline_mcp_settings.json.",
        cannot: "No Stop gate and no session lessons. A hook error fails open.",
        source: "Research Cline 4.1.27 / CLI 3.0.75 hook_pre_tool (skeptic: corrected; cancel and errorMessage, fail-open, the extension scans only Documents/Cline/Hooks); matrix row Cline.",
    },
    {
        id: "goose",
        names: ["Goose"],
        compat: [],
        canBlockPreTool: true,
        blocks: "yes",
        lessons: "rules file",
        stopGate: true,
        mcp: true,
        evidence: "docs",
        install: [`${NPX} --target goose --hooks`],
        then: `Add the printed extension block to Goose's config.yaml. ${LESSONS("goose")}`,
        cannot: "Post-tool, session and prompt hooks only observe. Hook commands run through sh -c, unverified on Windows.",
        source: "Research [Goose] hook_pre_tool (skeptic: corrected; only PreToolUse and Stop can block, decision block on stdout); matrix row Goose 1.60.",
    },
    {
        id: "opencode",
        names: ["OpenCode"],
        compat: [],
        canBlockPreTool: true,
        blocks: "yes, through a local plugin file",
        lessons: "hook",
        stopGate: false,
        mcp: true,
        evidence: "docs",
        install: [`${NPX} --target opencode --hooks`],
        then: "Add the printed `mcp` entry to opencode.json.",
        cannot: "1.x has no Stop gate (2.x continues a turn through experimental.idle). A deny reaches the model as a failed tool call and the turn goes on. OPENCODE_PURE turns plugins off.",
        source: "Research OpenCode V1 1.19 / V2 2.3 hook_pre_tool (skeptic: corrected; tool.execute.before throw confirmed, permission.ask refuted); matrix row OpenCode.",
    },
    {
        id: "amp",
        names: ["Amp"],
        compat: [],
        canBlockPreTool: true,
        blocks: "yes, through a local plugin file",
        lessons: "hook",
        stopGate: true,
        mcp: true,
        evidence: "docs",
        install: [`${NPX} --target amp --hooks`],
        then: "Add the printed `amp.mcpServers` entry to .amp/settings.json, then run `amp mcp approve continuous-improvement`.",
        cannot: "The plugin API is experimental. Plugins do not load in Puck or Spaces, and `amp -x` needs --plugin-ready-timeout.",
        source: "Research Amp hook_pre_tool (skeptic: corrected; tool.call reject-and-continue reaches the model as 'Tool rejected by plugin'); matrix row Amp.",
    },
    {
        id: "zed",
        names: ["Zed"],
        compat: [],
        canBlockPreTool: false,
        blocks: "no",
        lessons: "rules file",
        stopGate: false,
        mcp: false,
        evidence: "docs",
        install: [`${NPX} --target zed`],
        then: LESSONS("zed"),
        cannot: "Zed has no hooks, so nothing is blocked. This package installs no MCP server or skills for Zed yet.",
        source: "Research [Zed] hook_pre_tool (skeptic: confirmed; no script hooks, only static tool_permissions); matrix row Zed 1.29; PR 15 Zed skills not done (docs/deferred.md).",
    },
    {
        id: "aider",
        names: ["Aider"],
        compat: [],
        canBlockPreTool: false,
        blocks: "no",
        lessons: "rules file",
        stopGate: false,
        mcp: false,
        evidence: "docs",
        install: [`${NPX} --target aider`],
        then: `${LESSONS("aider")} Then list the printed file under \`read:\` in .aider.conf.yml.`,
        cannot: "Aider has no hooks, MCP client or skills, so nothing is blocked.",
        source: "Research [Aider] hook_pre_tool / hook_stop / hook_user_prompt (skeptic: confirmed; none); matrix row Aider 0.86.",
    },
];
/** Fail closed: only a literal true counts, so a missing or malformed flag never turns into a blocking claim. */
export function blocksPreTool(row) {
    return row.canBlockPreTool === true;
}
/**
 * full: blocks, lessons through a session hook, and a Stop gate.
 * partial: blocks, and one of the other two is missing.
 * rules only: no hook this package can use.
 */
export function supportTier(row) {
    if (!blocksPreTool(row))
        return "rules only";
    return row.lessons === "hook" && row.stopGate === true ? "full" : "partial";
}
/** The .cloudplugin compatibleWith list: each row's id, then its compat ids, in table order, once each. */
export function compatibleWith(rows = AGENT_SUPPORT) {
    return [...new Set(rows.flatMap((row) => [row.id, ...row.compat]))];
}
/**
 * .cloudplugin/marketplace.json with `version` and `compatibleWith` set from
 * package.json and this table, every other key kept in place. Throws when the
 * text is not a JSON object, so a broken manifest is never rewritten.
 */
export function renderCloudplugin(text, version, rows = AGENT_SUPPORT) {
    const manifest = JSON.parse(text);
    if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
        throw new Error(".cloudplugin/marketplace.json is not a JSON object");
    }
    const next = { ...manifest, version, compatibleWith: compatibleWith(rows) };
    return `${JSON.stringify(next, null, 2)}\n`;
}
