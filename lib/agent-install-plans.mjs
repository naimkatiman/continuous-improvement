// agent-install-plans.mts — What `install --target <agent> --hooks` writes and
// runs for the agents with a native hook config (docs/plans/2026-11-21-all-agents.md,
// Architecture item 12): codex, qwen, grok, devin (alias windsurf) and droid.
//
// Pure: files are read through the context, nothing is written. The hook
// config is the plugin's own event-to-script table (getPluginHooksConfig)
// crossed with the agent's profile (agent-profiles.mjs), every command pointing
// at the stable runtime copy with `--agent <id>`. Shared JSON configs are
// merged hook by hook, the way patchClaudeSettings keeps foreign entries; a
// TOML config is a printed snippet and a vendor `mcp add` is a run, so the
// package keeps zero runtime dependencies. Owner decisions (plan "Owner
// decisions"): the default scope is the project; a run never passes --consent
// or --trust; Codex hook trust is never pre-seeded; --fail-closed sets the
// vendor option only where one exists.
//
// Every path, key, event and matcher form below comes from the verified
// research of 2026-11-21 (result.json research + skeptic verify, by agent):
// - codex: hook_pre_tool (~/.codex/hooks.json = $CODEX_HOME/hooks.json,
//   project .codex/hooks.json only in trusted projects, Claude-identical
//   {"hooks":{...}}, regex matcher, timeout in seconds, trust via /hooks),
//   hook_session_start (SessionEnd clamped to 3s, so not wired), mcp_servers
//   (`codex mcp add <name> -- node ... --mode expert`, `codex mcp remove`,
//   [mcp_servers.<id>] in a trusted project's .codex/config.toml). No
//   fail-closed option is documented.
// - qwen: hook_pre_tool (settings.json `hooks`, ~/.qwen and project .qwen,
//   timeout in seconds, a pipe list compared name by name, project hooks
//   withheld until approved), mcp_servers (settings.json `mcpServers`,
//   {command, args}). No fail-closed option is documented.
// - grok: hook_pre_tool (~/.grok/hooks/*.json and <project>/.grok/hooks/*.json,
//   Claude shape, handler failClosed, a plain name list is exact, folder
//   trust, ~/.claude settings and plugins are also loaded), hook_session_start
//   and hook_user_prompt (output never reaches the model, so not wired),
//   hook_stop (SessionEnd capped at 1.5s, so not wired), mcp_servers
//   (`grok mcp add <name> --scope user|project -- <cmd>`; no remove verb).
// - devin: hook_pre_tool (.devin/hooks.v1.json with no wrapper key; the user
//   level is the `hooks` key of %APPDATA%\devin\config.json, ~/.config/devin/
//   elsewhere, as for its MCP and AGENTS.md files; case-sensitive regex as the
//   vendor migrator writes it; skeptic: `fail_closed: true`; .claude/settings
//   and ~/.claude/settings are read by default), mcp_servers (`devin mcp add
//   <name> -s user|project -- node ...`, `devin mcp remove`).
// - droid: [Droid] hook_pre_tool (~/.factory/hooks.json and .factory/hooks.json
//   keyed by event, timeout in seconds, onFailure continue|block, exact names
//   split by |), mcp_servers (~/.factory/mcp.json and .factory/mcp.json
//   `mcpServers`; `droid mcp add` always writes the user file, so the file is
//   written instead), plus SessionEnd in the skeptic's event set.
//
// PR 13 (same source, same rules):
// - gemini: hook_pre_tool (settings.json `hooks`, ~/.gemini and project
//   .gemini; BeforeTool, timeout in ms; skeptic: matchers are unanchored
//   regexes, so anchored here; in an untrusted folder no settings hook runs),
//   hook_post_tool (AfterTool), hook_user_prompt (BeforeAgent), hook_stop
//   (AfterAgent; SessionEnd best effort), mcp_servers (settings.json
//   `mcpServers`). Not an extension: `extensions install|link` asks for consent.
// - cursor: hook_pre_tool (.cursor/hooks.json and ~/.cursor/hooks.json,
//   {"version":1,"hooks":{"<event>":[{command,type,timeout(s),matcher,
//   failClosed}]}}, a JS regex on Shell/Write/Delete; Claude settings hooks are
//   imported), hook_post_tool, hook_session_start (sessionStart; skeptic:
//   sessionEnd too), hook_stop (stop), hook_user_prompt (beforeSubmitPrompt),
//   mcp_servers (.cursor/mcp.json, ~/.cursor/mcp.json, `type: "stdio"`
//   required), plugin_or_extension_packaging (Claude-installed plugins imported).
// - copilot: hook_pre_tool (.github/hooks/*.json and ~/.copilot/hooks/*.json or
//   $COPILOT_HOME/hooks, flat {"version":1,"hooks":{"preToolUse":[{type,command,
//   timeoutSec,matcher}]}}, matcher anchored by Copilot, repo .claude/settings
//   hooks also read, errors deny and timeouts fail open), hook_session_start,
//   hook_stop (agentStop), hook_user_prompt (output dropped, so not wired),
//   mcp_servers (`copilot mcp add NAME -- CMD` writes ~/.copilot/mcp-config.json;
//   project .github/mcp.json `mcpServers`, entries typed "local"; skeptic: `mcp remove`).
// - kiro: hook_pre_tool (.kiro/hooks/<any>.json, ~/.kiro/hooks (KIRO_HOME) in
//   CLI V3 only, {"version":"v1","hooks":[{name,trigger,matcher,action:{type:
//   "command",command},timeout(s),enabled}]}; skeptic: a matcher is an
//   unanchored regex), hook_post_tool, hook_session_start, hook_user_prompt,
//   hook_stop, mcp_servers (.kiro/settings/mcp.json and ~/.kiro/settings/mcp.json).
// - auggie: [Auggie] hook_pre_tool (settings.json `hooks`, ~/.augment and
//   project .augment, Claude shape, timeout in ms, only PreToolUse blocks),
//   hook_session_start / hook_stop / hook_user_prompt (run in the background,
//   so not wired), mcp_servers (`mcpServers` in ~/.augment/settings.json;
//   project scope only through `auggie mcp add --project`).
// - junie: [Junie] hook_pre_tool (~/.junie/config.json `hooks`, Claude shape,
//   timeout in s, blockOnError; a project .junie/config.json is read only with
//   --config-location; skeptic: Early Access builds only), hook_session_start
//   (context ignored, so not wired), mcp_servers (.junie/mcp/mcp.json and
//   ~/.junie/mcp/mcp.json).
// - goose: [Goose] hook_pre_tool (a plugin's hooks/hooks.json under
//   ~/.agents/plugins/<name>/ or <project>/.agents/plugins/<name>/, Claude
//   shape, on_failure block, unanchored regex; skeptic: only PreToolUse and
//   Stop act), plugin_or_extension_packaging (hook-only plugins need no
//   manifest; no MCP in a plugin), mcp_servers (config.yaml `extensions:`,
//   %APPDATA%\Block\goose\config\config.yaml on Windows; printed).
// - cline: hook_pre_tool (one script per hook name, no JSON config and no
//   matcher; skeptic: the VS Code extension scans ~/Documents/Cline/Hooks and
//   <root>/.clinerules/hooks only, runs only <Name>.ps1 on Windows and only an
//   extensionless executable elsewhere; {"cancel":true} denies; errors fail
//   open), hook_stop (no equivalent), mcp_servers (`cline mcp add <name> --yes
//   -- <command...>`, `cline mcp remove`, no project MCP file).
import { createHash } from "node:crypto";
import { posix } from "node:path";
import { AGENT_PROFILES } from "./agent-profiles.mjs";
import { pluginMark } from "./hook-bridge.mjs";
import { TARGET_IDS } from "./install-targets.mjs";
import { PACKAGE_NAME, getPluginHooksConfig } from "./plugin-metadata.mjs";
import { renderAmpPlugin } from "./plugin-shim-amp.mjs";
import { renderOpenCodePlugin } from "./plugin-shim-opencode.mjs";
import { planSkillExport } from "./skill-export.mjs";
export const HOOK_AGENT_IDS = [
    "codex", "qwen", "grok", "devin", "droid", "gemini", "cursor", "copilot", "kiro", "auggie", "junie", "goose", "cline",
];
/** PR 14: agents whose hooks are in-process plugins (OpenCode, Amp), one plugin file each. */
export const PLUGIN_AGENT_IDS = ["opencode", "amp"];
const ALIASES = { windsurf: "devin" };
export const INSTALL_SCOPES = ["project", "user"];
const MCP_NAME = PACKAGE_NAME;
const ALL_EVENTS = ["PreToolUse", "PostToolUse", "UserPromptSubmit", "SessionStart", "SessionEnd", "Stop"];
const slash = (path) => path.replace(/\\/g, "/");
const join = (...parts) => posix.join(...parts.map(slash));
function absEnv(ctx, key) {
    const value = ctx.env[key]?.trim();
    return value && (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) ? slash(value) : null;
}
const base = (ctx, dir) => (ctx.scope === "user" ? join(ctx.home, dir) : join(ctx.projectRoot, dir));
const mcpArgv = (mcp) => [mcp.command, ...mcp.args];
const SPECS = {
    codex: {
        label: "Codex",
        events: ["PreToolUse", "PostToolUse", "UserPromptSubmit", "SessionStart", "Stop"],
        matcher: "regex",
        failClosed: null,
        hooksFile: (ctx) => ({
            path: ctx.scope === "user" ? join(absEnv(ctx, "CODEX_HOME") ?? join(ctx.home, ".codex"), "hooks.json") : join(ctx.projectRoot, ".codex", "hooks.json"),
            hooksAt: ["hooks"],
        }),
        mcpRun: (ctx, mcp) => (ctx.scope === "user" ? { argv: ["codex", "mcp", "add", MCP_NAME, "--", ...mcpArgv(mcp)], undo: ["codex", "mcp", "remove", MCP_NAME] } : null),
        mcpPrinted: (ctx, mcp) => (ctx.scope === "project"
            ? `Add the MCP server to ${join(ctx.projectRoot, ".codex", "config.toml")} (read only in a trusted project):\n[mcp_servers.${MCP_NAME}]\ncommand = ${JSON.stringify(mcp.command)}\nargs = ${JSON.stringify(mcp.args)}`
            : null),
        notes: (ctx) => [
            "Codex runs these hooks only after you trust them: open /hooks in Codex and approve each one. The installer does not pre-trust them.",
            ...(ctx.scope === "project" ? ["Codex reads .codex/hooks.json only in a trusted project."] : []),
        ],
        importsClaude: null,
    },
    qwen: {
        label: "Qwen Code",
        events: ALL_EVENTS,
        matcher: "list",
        failClosed: null,
        hooksFile: (ctx) => ({ path: join(base(ctx, ".qwen"), "settings.json"), hooksAt: ["hooks"] }),
        mcpFile: (ctx) => ({ path: join(base(ctx, ".qwen"), "settings.json"), mcpAt: ["mcpServers"] }),
        notes: (ctx) => (ctx.scope === "project" ? ["Qwen Code withholds project hooks until you approve them in Qwen Code or trust the folder."] : []),
        importsClaude: null,
    },
    grok: {
        label: "Grok",
        events: ["PreToolUse", "PostToolUse", "Stop"],
        matcher: "list",
        failClosed: ["failClosed", true],
        hooksFile: (ctx) => ({
            path: join(ctx.scope === "user" ? (absEnv(ctx, "GROK_HOME") ?? join(ctx.home, ".grok")) : join(ctx.projectRoot, ".grok"), "hooks", `${MCP_NAME}.json`),
            hooksAt: ["hooks"],
        }),
        mcpRun: (ctx, mcp) => ({ argv: ["grok", "mcp", "add", MCP_NAME, "--scope", ctx.scope, "--", ...mcpArgv(mcp)], undo: null }),
        notes: (ctx) => [
            "Grok loads hook files only in a trusted folder.",
            "Grok has no session or prompt context: run `ci lessons --format grok --write` for the lessons rules file.",
            ...(ctx.scope === "user" ? ["The Grok TUI reads its own home: run this again with GROK_HOME set to it (for example ~/.grok-tui)."] : []),
            `Grok has no \`mcp remove\`: to undo the MCP step, delete [mcp_servers.${MCP_NAME}] from its config.toml.`,
        ],
        importsClaude: "settings+plugins",
    },
    devin: {
        label: "Devin",
        events: ALL_EVENTS,
        matcher: "regex",
        failClosed: ["fail_closed", true],
        hooksFile: (ctx) => (ctx.scope === "user"
            ? {
                path: join(ctx.platform === "win32" ? (absEnv(ctx, "APPDATA") ?? join(ctx.home, "AppData", "Roaming")) : join(ctx.home, ".config"), "devin", "config.json"),
                hooksAt: ["hooks"],
            }
            : { path: join(ctx.projectRoot, ".devin", "hooks.v1.json"), hooksAt: [] }),
        mcpRun: (ctx, mcp) => ({ argv: ["devin", "mcp", "add", MCP_NAME, "-s", ctx.scope, "--", ...mcpArgv(mcp)], undo: ["devin", "mcp", "remove", MCP_NAME] }),
        notes: () => ["Devin runs no hooks in Restricted Mode."],
        importsClaude: "settings",
    },
    droid: {
        label: "Factory Droid",
        events: ALL_EVENTS,
        matcher: "list",
        failClosed: ["onFailure", "block"],
        hooksFile: (ctx) => ({ path: join(base(ctx, ".factory"), "hooks.json"), hooksAt: [] }),
        mcpFile: (ctx) => ({ path: join(base(ctx, ".factory"), "mcp.json"), mcpAt: ["mcpServers"] }),
        notes: () => [],
        importsClaude: null,
    },
    gemini: {
        label: "Gemini CLI",
        events: ALL_EVENTS,
        eventNames: { PreToolUse: "BeforeTool", PostToolUse: "AfterTool", UserPromptSubmit: "BeforeAgent", Stop: "AfterAgent" },
        matcher: "regex",
        failClosed: null,
        timeout: { key: "timeout", ms: true },
        hooksFile: (ctx) => ({ path: join(base(ctx, ".gemini"), "settings.json"), hooksAt: ["hooks"] }),
        mcpFile: (ctx) => ({ path: join(base(ctx, ".gemini"), "settings.json"), mcpAt: ["mcpServers"] }),
        notes: () => ["Gemini CLI runs no settings.json hooks in an untrusted folder, user-level ones included: trust the folder in Gemini CLI."],
        importsClaude: null,
    },
    cursor: {
        label: "Cursor",
        events: ALL_EVENTS,
        eventNames: { PreToolUse: "preToolUse", PostToolUse: "postToolUse", UserPromptSubmit: "beforeSubmitPrompt", SessionStart: "sessionStart", SessionEnd: "sessionEnd", Stop: "stop" },
        matcher: "regex",
        failClosed: ["failClosed", true],
        layout: "flat",
        version: 1,
        hooksFile: (ctx) => ({ path: join(base(ctx, ".cursor"), "hooks.json"), hooksAt: ["hooks"] }),
        mcpFile: (ctx) => ({ path: join(base(ctx, ".cursor"), "mcp.json"), mcpAt: ["mcpServers"] }),
        mcpType: "stdio",
        notes: () => ["Cursor cloud agents run no session hooks."],
        importsClaude: "settings+plugins",
    },
    copilot: {
        label: "GitHub Copilot CLI",
        events: ["PreToolUse", "PostToolUse", "SessionStart", "Stop"],
        eventNames: { PreToolUse: "preToolUse", PostToolUse: "postToolUse", SessionStart: "sessionStart", Stop: "agentStop" },
        matcher: "list",
        failClosed: null,
        timeout: { key: "timeoutSec", ms: false },
        layout: "flat",
        version: 1,
        hooksFile: (ctx) => ({
            path: join(ctx.scope === "user" ? (absEnv(ctx, "COPILOT_HOME") ?? join(ctx.home, ".copilot")) : join(ctx.projectRoot, ".github"), "hooks", `${MCP_NAME}.json`),
            hooksAt: ["hooks"],
        }),
        mcpFile: (ctx) => (ctx.scope === "project" ? { path: join(ctx.projectRoot, ".github", "mcp.json"), mcpAt: ["mcpServers"] } : null),
        mcpType: "local",
        mcpRun: (ctx, mcp) => (ctx.scope === "user" ? { argv: ["copilot", "mcp", "add", MCP_NAME, "--", ...mcpArgv(mcp)], undo: ["copilot", "mcp", "remove", MCP_NAME] } : null),
        notes: () => [
            "Copilot drops the output of userPromptSubmitted hooks, so the prompt hooks are not wired.",
            "A Copilot hook that times out fails open, and the cloud agent reads only .github/hooks.",
        ],
        importsClaude: "project-settings",
    },
    kiro: {
        label: "Kiro",
        events: ["PreToolUse", "PostToolUse", "UserPromptSubmit", "SessionStart", "Stop"],
        matcher: "regex",
        failClosed: null,
        layout: "kiro",
        version: "v1",
        hooksFile: (ctx) => ({ path: join(kiroBase(ctx), "hooks", `${MCP_NAME}.json`), hooksAt: ["hooks"] }),
        mcpFile: (ctx) => ({ path: join(kiroBase(ctx), "settings", "mcp.json"), mcpAt: ["mcpServers"] }),
        notes: (ctx) => [
            "Kiro CLI sessions on the V2 harness read agent-profile hooks, not this file.",
            ...(ctx.scope === "user" ? ["Only Kiro CLI V3 reads ~/.kiro/hooks; the Kiro IDE reads the workspace .kiro/hooks."] : []),
        ],
        importsClaude: null,
    },
    auggie: {
        label: "Auggie",
        events: ["PreToolUse", "PostToolUse"],
        matcher: "regex",
        failClosed: null,
        timeout: { key: "timeout", ms: true },
        hooksFile: (ctx) => ({ path: join(base(ctx, ".augment"), "settings.json"), hooksAt: ["hooks"] }),
        mcpFile: (ctx) => (ctx.scope === "user" ? { path: join(ctx.home, ".augment", "settings.json"), mcpAt: ["mcpServers"] } : null),
        mcpPrinted: (ctx, mcp) => (ctx.scope === "project"
            ? `Register the MCP server for this project with \`auggie mcp add --project ${MCP_NAME}\` (its command and args flags: \`auggie mcp add --help\`), command ${mcp.command}, args ${JSON.stringify(mcp.args)}; --scope user writes it into ~/.augment/settings.json instead.`
            : null),
        notes: () => ["Auggie runs SessionStart, Stop and prompt hooks in the background, so only the guards and the observer are wired: for the lessons, run `ci lessons --format auggie --write`."],
        importsClaude: null,
    },
    junie: {
        label: "Junie",
        events: ["PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop"],
        matcher: "regex",
        failClosed: ["blockOnError", true],
        hooksFile: (ctx) => ({ path: join(base(ctx, ".junie"), "config.json"), hooksAt: ["hooks"] }),
        mcpFile: (ctx) => ({ path: join(base(ctx, ".junie"), "mcp", "mcp.json"), mcpAt: ["mcpServers"] }),
        notes: (ctx) => [
            "Junie runs hooks only in its Early Access build, and ignores SessionStart context: for the lessons, run `ci lessons --format junie --write`.",
            ...(ctx.scope === "project" ? ["Junie reads a project .junie/config.json only when started with --config-location .junie/config.json."] : []),
        ],
        importsClaude: null,
    },
    goose: {
        label: "Goose",
        events: ["PreToolUse", "PostToolUse", "Stop"],
        matcher: "regex",
        failClosed: ["on_failure", "block"],
        hooksFile: (ctx) => ({ path: join(base(ctx, ".agents"), "plugins", MCP_NAME, "hooks", "hooks.json"), hooksAt: ["hooks"] }),
        mcpPrinted: (ctx, mcp) => {
            const config = ctx.platform === "win32"
                ? join(absEnv(ctx, "APPDATA") ?? join(ctx.home, "AppData", "Roaming"), "Block", "goose", "config", "config.yaml")
                : join(ctx.home, ".config", "goose", "config.yaml");
            return `Add the MCP server to ${config} (a Goose plugin cannot carry one):\nextensions:\n  ${MCP_NAME}:\n    type: stdio\n    name: ${MCP_NAME}\n    enabled: true\n    cmd: ${mcp.command}\n    args: ${JSON.stringify(mcp.args)}`;
        },
        notes: () => [
            "Goose acts only on PreToolUse and Stop hooks, and a Stop hook stays fail-open: for the lessons, run `ci lessons --format goose --write`.",
            "Goose runs hook commands with sh -c; on Windows that is unverified.",
        ],
        importsClaude: null,
    },
    cline: {
        label: "Cline",
        events: ["PreToolUse"],
        matcher: "none",
        failClosed: null,
        hooksFile: (ctx) => ({ path: clineDir(ctx), hooksAt: [] }),
        script: true,
        mcpRun: (ctx, mcp) => (ctx.scope === "user" ? { argv: ["cline", "mcp", "add", MCP_NAME, "--yes", "--", ...mcpArgv(mcp)], undo: ["cline", "mcp", "remove", MCP_NAME] } : null),
        mcpPrinted: (ctx, mcp) => [
            ...(ctx.scope === "project" ? [`Cline has no project MCP file. For the Cline CLI, run \`cline mcp add ${MCP_NAME} --yes -- ${mcpArgv(mcp).join(" ")}\` (or install with --scope user --run).`] : []),
            `In the Cline VS Code extension, add to cline_mcp_settings.json (MCP Servers > Configure MCP Servers): ${JSON.stringify({ mcpServers: { [MCP_NAME]: { command: mcp.command, args: mcp.args } } })}`,
        ].join("\n"),
        notes: (ctx) => [
            "Cline runs hooks only while Enable Hooks is on, and a hook error fails open.",
            ...(ctx.scope === "user" ? clineUserNotes(ctx) : []),
        ],
        importsClaude: null,
    },
};
function kiroBase(ctx) {
    return ctx.scope === "user" ? (absEnv(ctx, "KIRO_HOME") ?? join(ctx.home, ".kiro")) : join(ctx.projectRoot, ".kiro");
}
// The VS Code extension's global hooks dir is join(getDocumentsPath(), "Cline",
// "Hooks"), and on Windows getDocumentsPath() follows OneDrive Known Folder
// Move, so it is not always %USERPROFILE%\Documents (skeptic verdict,
// hook_pre_tool). The SDK (CLI) searches resolveDocumentsExtensionPath("Hooks")
// and ~/.cline/hooks, with OneDrive candidates for rules only, not for hooks.
// `documents` is null when win32 gave no usable absolute path: the script
// then goes to ~/Documents and a note says to copy it by hand.
function clineDocuments(ctx) {
    const fallback = join(ctx.home, "Documents");
    if (ctx.platform !== "win32")
        return { dir: fallback, documents: fallback };
    const reported = ctx.documentsDir()?.trim() ?? "";
    const documents = /^[A-Za-z]:[\\/]/.test(reported) && !/[\r\n]/.test(reported) ? join(reported).replace(/(?<!^[A-Za-z]:)\/+$/, "") : null;
    return { dir: documents ?? fallback, documents };
}
function clineDir(ctx) {
    return ctx.scope === "user" ? join(clineDocuments(ctx).dir, "Cline", "Hooks") : join(ctx.projectRoot, ".clinerules", "hooks");
}
function clineUserNotes(ctx) {
    const { dir, documents } = clineDocuments(ctx);
    const hooks = join(dir, "Cline", "Hooks");
    const notes = [`The Cline VS Code extension and the Cline CLI both read user hooks from Documents/Cline/Hooks; only the CLI also reads ~/.cline/hooks.`];
    if (documents === null) {
        notes.push(`The Windows Documents folder could not be resolved, so PreToolUse.ps1 goes to ${hooks}. If Documents is redirected (OneDrive), copy PreToolUse.ps1 by hand into <Documents>\\Cline\\Hooks, or install with --scope project (.clinerules/hooks).`);
    }
    else if (dir.toLowerCase() !== join(ctx.home, "Documents").toLowerCase()) {
        notes.push(`Documents resolves to ${dir}, not ~/Documents (a OneDrive Known Folder Move, for example): the VS Code extension reads ${hooks}, but the Cline CLI's hook lookup has no OneDrive candidate and may not see it. --scope project (.clinerules/hooks) reaches both.`);
    }
    return notes;
}
export function resolveHookAgent(targetId) {
    if (HOOK_AGENT_IDS.includes(targetId) || PLUGIN_AGENT_IDS.includes(targetId))
        return targetId;
    return Object.hasOwn(ALIASES, targetId) ? ALIASES[targetId] : null;
}
export function parseInstallScope(value) {
    return INSTALL_SCOPES.find((scope) => scope === value) ?? null;
}
// The group kinds a plugin PreToolUse matcher stands for: file tools (gated
// with the shells), shells alone, or nothing (Skill: companion-preference
// routes Claude companion plugins, so it is Claude-only).
const FILE_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);
const SHELL_TOOLS = new Set(["Bash", "PowerShell", "Monitor"]);
// The native matcher, undefined for an agent with none, or null when the agent has no tool of the group's kinds.
function nativeMatcher(agent, spec, claudeMatcher) {
    const names = claudeMatcher.split("|");
    const kinds = names.some((name) => FILE_TOOLS.has(name))
        ? new Set(["shell", "file-write", "patch"])
        : names.every((name) => SHELL_TOOLS.has(name)) ? new Set(["shell"]) : new Set();
    const profile = AGENT_PROFILES.find((entry) => entry.id === agent);
    const tools = Object.entries(profile.tools).filter(([, tool]) => kinds.has(tool.kind)).map(([name]) => name);
    if (tools.length === 0)
        return null;
    if (spec.matcher === "none")
        return undefined;
    return spec.matcher === "regex" ? `^(${tools.join("|")})$` : tools.join("|");
}
/**
 * The agent's hooks map: the plugin's events and scripts under the agent's
 * event names, its native matchers and timeout field, commands at the runtime.
 * Always Claude's {matcher, hooks} groups; a flat or Kiro layout is made from
 * it when the file is planned.
 */
export function renderAgentHooks(agent, runtimeDir, failClosed) {
    const spec = specFor(agent);
    const rt = slash(runtimeDir);
    const plugin = getPluginHooksConfig().hooks;
    const out = {};
    for (const event of Object.keys(plugin)) {
        if (!spec.events.includes(event))
            continue;
        const groups = [];
        for (const group of plugin[event]) {
            const matcher = group.matcher === undefined ? undefined : nativeMatcher(agent, spec, group.matcher);
            if (matcher === null)
                continue;
            const hooks = group.hooks.map((hook) => {
                const seconds = hook.timeout ?? 30;
                const handler = {
                    type: "command",
                    command: `${hook.command.replace("${CLAUDE_PLUGIN_ROOT}", () => rt)} --agent ${agent}`,
                    [spec.timeout?.key ?? "timeout"]: spec.timeout?.ms ? seconds * 1000 : seconds,
                };
                if (failClosed && event === "PreToolUse" && spec.failClosed)
                    handler[spec.failClosed[0]] = spec.failClosed[1];
                return handler;
            });
            groups.push(matcher === undefined ? { hooks } : { matcher, hooks });
        }
        if (groups.length > 0)
            out[spec.eventNames?.[event] ?? event] = groups;
    }
    return out;
}
function specFor(agent) {
    if (!Object.hasOwn(SPECS, agent))
        throw new Error(`${agent} has no hook planner. Agents with one: ${HOOK_AGENT_IDS.join(", ")}`);
    return SPECS[agent];
}
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function parseObject(text) {
    if (text === null)
        return null;
    try {
        const value = JSON.parse(text);
        return isObject(value) ? value : "bad";
    }
    catch {
        return "bad";
    }
}
// The object at a key path, created when absent; a non-object on the way is an error.
function objectAt(root, path, file) {
    let node = root;
    for (const key of path) {
        if (node[key] === undefined)
            node[key] = {};
        if (!isObject(node[key]))
            throw new Error(`${file}: \`${path.join(".")}\` is not an object; fix it and rerun.`);
        node = node[key];
    }
    return node;
}
/** Our MCP entry from any runtime version: exactly the {command, args} planAgentInstall renders, plus the agent's `type` where it needs one. */
function isOurMcp(value) {
    if (!isObject(value) || value.command !== "node")
        return false;
    const keys = Object.keys(value).sort().join(",");
    if (keys !== "args,command" && !(keys === "args,command,type" && typeof value.type === "string"))
        return false;
    const args = value.args;
    return isStrings(args) && args.length === 3 && /\/runtime\/[^"/]+\/bin\/mcp-server\.mjs$/.test(args[0]) && args[1] === "--mode" && args[2] === "expert";
}
/** One of our commands for this agent, from any runtime version. */
function isOurCommand(agent, command) {
    return typeof command === "string" && new RegExp(`^node "[^"]*/runtime/[^"/]+/(?:hooks|bin)/[\\w-]+\\.mjs" --agent ${agent}$`).test(command);
}
// Drops the handlers `drop` matches, hook by hook. A group or event list we
// empty goes; malformed rows and foreign handlers stay verbatim. In the flat
// layout an event's list holds the handlers themselves.
function stripHooks(hooks, drop, file, layout) {
    let changed = false;
    for (const [event, groups] of Object.entries(hooks)) {
        if (!Array.isArray(groups))
            throw new Error(`${file}: hooks.${event} is not a list; fix it and rerun.`);
        const kept = [];
        let touched = false;
        for (const group of groups) {
            if (layout === "flat") {
                if (isObject(group) && drop(group.command))
                    touched = true;
                else
                    kept.push(group);
                continue;
            }
            const handlers = isObject(group) ? group.hooks : undefined;
            if (!Array.isArray(handlers)) {
                kept.push(group);
                continue;
            }
            const left = handlers.filter((handler) => !(isObject(handler) && drop(handler.command)));
            if (left.length === handlers.length) {
                kept.push(group);
                continue;
            }
            touched = true;
            if (left.length > 0)
                kept.push({ ...group, hooks: left });
        }
        if (!touched)
            continue;
        changed = true;
        if (kept.length > 0)
            hooks[event] = kept;
        else
            delete hooks[event];
    }
    return changed;
}
// Kiro keeps one list of rows, each naming its trigger, with the command under `action`.
const stripRows = (rows, drop) => rows.filter((row) => !(isObject(row) && isObject(row.action) && drop(row.action.command)));
function flatHandlers(groups) {
    return groups.flatMap((group) => group.hooks.map((hook) => (group.matcher === undefined ? { ...hook } : { ...hook, matcher: group.matcher })));
}
function kiroRows(hooks) {
    return Object.entries(hooks).flatMap(([trigger, groups]) => groups.flatMap((group) => group.hooks.map(({ type, command, ...rest }) => ({
        // One name per row, from the script and its trigger, so no two rows share one.
        name: `${MCP_NAME} ${/\/([\w-]+)\.mjs"/.exec(command)?.[1] ?? "hook"} ${trigger}`,
        trigger,
        ...(group.matcher === undefined ? {} : { matcher: group.matcher }),
        action: { type, command },
        ...rest,
        enabled: true,
    }))));
}
const write = (root) => `${JSON.stringify(root, null, 2)}\n`;
function planFile(ctx, spec, agent, path, hooksAt, hooks, mcpAt, mcp) {
    const existing = parseObject(ctx.read(path));
    if (existing === "bad")
        throw new Error(`${path} is not a JSON object; fix or move it and rerun.`);
    const root = existing ?? {};
    const layout = hooksAt && hooks ? spec.layout : undefined;
    if (hooksAt && hooks) {
        if (spec.version !== undefined) {
            if (root.version === undefined)
                root.version = spec.version;
            else if (root.version !== spec.version)
                throw new Error(`${path}: \`version\` is ${JSON.stringify(root.version)}, not ${JSON.stringify(spec.version)}; fix or move it and rerun.`);
        }
        const drop = (command) => isOurCommand(agent, command);
        if (layout === "kiro") {
            const parent = objectAt(root, hooksAt.slice(0, -1), path);
            const key = hooksAt[hooksAt.length - 1];
            const rows = parent[key] ?? [];
            if (!Array.isArray(rows))
                throw new Error(`${path}: \`${hooksAt.join(".")}\` is not a list; fix it and rerun.`);
            parent[key] = [...stripRows(rows, drop), ...kiroRows(hooks)];
        }
        else {
            const map = objectAt(root, hooksAt, path);
            stripHooks(map, drop, path, layout);
            for (const [event, groups] of Object.entries(hooks)) {
                if (map[event] !== undefined && !Array.isArray(map[event]))
                    throw new Error(`${path}: hooks.${event} is not a list; fix it and rerun.`);
                map[event] = [...(map[event] ?? []), ...(layout === "flat" ? flatHandlers(groups) : groups)];
            }
        }
    }
    if (mcpAt && mcp) {
        const servers = objectAt(root, mcpAt, path);
        // A same-name entry we did not write is the user's: overwriting it would lose it, and the uninstall would then delete it.
        if (servers[MCP_NAME] !== undefined && !isOurMcp(servers[MCP_NAME])) {
            throw new Error(`${path}: \`${[...mcpAt, MCP_NAME].join(".")}\` is already set and this installer did not write it; rename or remove it and rerun.`);
        }
        servers[MCP_NAME] = mcp;
    }
    return { path, content: write(root), created: existing === null, hooksAt, hookCommands: commandsOf(hooks), mcpAt, mcp, ...(layout ? { layout } : {}) };
}
function commandsOf(hooks) {
    return hooks ? Object.values(hooks).flatMap((groups) => groups.flatMap((group) => group.hooks.map((hook) => hook.command))) : [];
}
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
// In every hook script this installer writes; a script without it is the user's.
const SCRIPT_MARK = "continuous-improvement hook, written by `install --target cline --hooks`; `--uninstall --target cline` removes it.";
// Cline runs one script per hook name and has no matcher, so the script runs
// each guard on the same stdin and answers with the first reply (a
// {"cancel":true} deny); a guard passes a tool it does not gate. The Windows
// extension runs only <Name>.ps1 (with powershell -File), elsewhere only an
// extensionless executable, so exactly one of the two is written.
function clineScript(paths, platform) {
    if (platform === "win32") {
        const list = paths.map((path) => `'${path.replace(/'/g, "''")}'`).join(", ");
        // The bytes reach each node process through files, unchanged: a
        // PowerShell pipe or a .NET stdin writer re-encodes them, and Windows
        // PowerShell 5.1 then puts a BOM in front of the JSON.
        return [
            `# ${SCRIPT_MARK}`,
            "# Each guard reads the same stdin; the first one that replies answers Cline.",
            "$inFile = [System.IO.Path]::GetTempFileName()",
            "$outFile = [System.IO.Path]::GetTempFileName()",
            "try {",
            "  $file = [System.IO.File]::Create($inFile)",
            "  [Console]::OpenStandardInput().CopyTo($file)",
            "  $file.Close()",
            "  $status = 0",
            `  foreach ($hook in @(${list})) {`,
            "    $proc = Start-Process -FilePath 'node' -ArgumentList @(('\"' + $hook + '\"'), '--agent', 'cline') -RedirectStandardInput $inFile -RedirectStandardOutput $outFile -NoNewWindow -Wait -PassThru",
            "    if ($proc.ExitCode -ne 0) { $status = $proc.ExitCode }",
            "    $reply = [System.IO.File]::ReadAllBytes($outFile)",
            "    if ([System.Text.Encoding]::UTF8.GetString($reply).Trim() -ne '') {",
            "      [Console]::OpenStandardOutput().Write($reply, 0, $reply.Length)",
            "      exit 0",
            "    }",
            "  }",
            "  exit $status",
            "} finally {",
            "  Remove-Item -LiteralPath $inFile, $outFile -Force -ErrorAction SilentlyContinue",
            "}",
            "",
        ].join("\r\n");
    }
    const list = paths.map((path) => `'${path.replace(/'/g, "'\\''")}'`).join(" ");
    return [
        "#!/bin/sh",
        `# ${SCRIPT_MARK}`,
        "# Each guard reads the same stdin; the first one that replies answers Cline.",
        "payload=$(cat)",
        "status=0",
        `for hook in ${list}; do`,
        `  out=$(printf '%s' "$payload" | node "$hook" --agent cline) || status=$?`,
        `  if [ -n "$out" ]; then`,
        `    printf '%s\\n' "$out"`,
        "    exit 0",
        "  fi",
        "done",
        `exit "$status"`,
        "",
    ].join("\n");
}
function planScripts(ctx, agent, dir, hooks) {
    return Object.entries(hooks).map(([event, groups]) => {
        const path = join(dir, ctx.platform === "win32" ? `${event}.ps1` : event);
        const commands = commandsOf({ [event]: groups });
        const paths = commands.map((command) => new RegExp(`^node "(.+)" --agent ${agent}$`).exec(command)?.[1]).filter((script) => script !== undefined);
        const existing = ctx.read(path);
        if (existing !== null && !existing.includes(SCRIPT_MARK)) {
            throw new Error(`${path} exists and this installer did not write it; ${agent} runs one ${event} script per directory, so merge or move yours and rerun.`);
        }
        const content = clineScript(paths, ctx.platform);
        return {
            path, content, created: existing === null, hooksAt: null, hookCommands: commands, mcpAt: null, mcp: null,
            script: { sha256: sha256(content) }, ...(ctx.platform === "win32" ? {} : { mode: 0o755 }),
        };
    });
}
/** The ledger record of a planned write: what the uninstall needs, without the content. */
export function toLedgerFile(file) {
    const { path, created, hooksAt, hookCommands, mcpAt, mcp, layout, script, skill } = file;
    return { path, created, hooksAt, hookCommands, mcpAt, mcp, ...(layout ? { layout } : {}), ...(script ? { script } : {}), ...(skill === undefined ? {} : { skill }) };
}
// A hook command of ours in a Claude settings file this agent also loads.
function claudeImportWarnings(spec, ctx) {
    if (spec.importsClaude === null)
        return [];
    const warnings = [];
    const claudeDir = join(ctx.home, ".claude");
    const projectFiles = [join(ctx.projectRoot, ".claude", "settings.json"), join(ctx.projectRoot, ".claude", "settings.local.json")];
    const files = spec.importsClaude === "project-settings" ? projectFiles : [join(claudeDir, "settings.json"), join(claudeDir, "settings.local.json"), ...projectFiles];
    for (const file of files) {
        let text;
        try {
            text = ctx.read(file);
        }
        catch {
            continue; // an unreadable settings file only costs the warning
        }
        const parsed = parseObject(text);
        if (!isObject(parsed) || !isObject(parsed.hooks))
            continue;
        const ours = Object.values(parsed.hooks).some((groups) => Array.isArray(groups) && groups.some((group) => isObject(group) && Array.isArray(group.hooks) && group.hooks.some((hook) => isObject(hook) && typeof hook.command === "string" && /continuous-improvement|[\\/]\.claude[\\/]instincts[\\/]/.test(hook.command))));
        if (ours)
            warnings.push(`${spec.label} also loads the continuous-improvement hooks in ${file} (it imports Claude Code hooks), so each hook would fire twice. Keep one of the two installs.`);
    }
    if (spec.importsClaude === "settings+plugins") {
        const plugins = join(claudeDir, "plugins");
        const hit = ctx.listDir(plugins).some((entry) => entry.includes(PACKAGE_NAME) || ctx.listDir(join(plugins, entry)).some((sub) => sub.includes(PACKAGE_NAME)));
        if (hit)
            warnings.push(`${spec.label} also loads the continuous-improvement Claude Code plugin from ${plugins}, so each hook would fire twice. Keep one of the two installs.`);
    }
    return warnings;
}
// PR 15: the agent's SKILL.md copies, each a whole file we own (removed only while unchanged).
function addSkills(plan, agent, ctx) {
    if (ctx.catalog === undefined)
        return;
    const skills = planSkillExport(agent, ctx, ctx.catalog);
    for (const file of skills.files) {
        plan.writes.push({
            path: file.path, content: file.content, created: file.created, hooksAt: null, hookCommands: [], mcpAt: null, mcp: null,
            script: { sha256: sha256(file.content) }, skill: file.name,
        });
    }
    plan.notes.push(...skills.notes);
    plan.warnings.push(...skills.warnings);
}
const PLUGIN_FILE_NOTE = "The plugin file imports the runtime copy by its absolute path on this machine, so keep it out of version control.";
const PLUGINS = {
    opencode: {
        file: (ctx) => join(ctx.scope === "user" ? join(ctx.home, ".config", "opencode") : join(ctx.projectRoot, ".opencode"), "plugins", `${MCP_NAME}.js`),
        render: renderOpenCodePlugin,
        mcpPrinted: (ctx, mcp) => {
            const config = ctx.scope === "user" ? join(ctx.home, ".config", "opencode", "opencode.json") : join(ctx.projectRoot, "opencode.json");
            const command = mcpArgv(mcp);
            return `Add the MCP server to ${config} (JSONC, so it is not edited here). OpenCode 1.x: ${JSON.stringify({ mcp: { [MCP_NAME]: { type: "local", command, enabled: true } } })} OpenCode 2.x: ${JSON.stringify({ mcp: { servers: { [MCP_NAME]: { type: "local", command } } } })}`;
        },
        notes: [
            "OpenCode 1.x needs 1.18.29 or later for this plugin's form and has no Stop gate (session.idle only observes); 2.x continues a turn through experimental.idle.",
            "OpenCode shows a deny to the model as a failed tool call, and the turn goes on. OPENCODE_PURE turns every external plugin off.",
        ],
    },
    amp: {
        file: (ctx) => join(ctx.scope === "user" ? join(absEnv(ctx, "XDG_CONFIG_HOME") ?? join(ctx.home, ".config"), "amp") : join(ctx.projectRoot, ".amp"), "plugins", `${MCP_NAME}.ts`),
        render: renderAmpPlugin,
        // `amp mcp add` writes the user settings, so it runs only at user scope (owner decision on user-level writes).
        mcpRun: (ctx, mcp) => (ctx.scope === "user" ? { argv: ["amp", "mcp", "add", MCP_NAME, "--", ...mcpArgv(mcp)], undo: ["amp", "mcp", "remove", MCP_NAME] } : null),
        mcpPrinted: (ctx, mcp) => (ctx.scope === "project"
            ? `Add to ${join(ctx.projectRoot, ".amp", "settings.json")}: ${JSON.stringify({ "amp.mcpServers": { [MCP_NAME]: { command: mcp.command, args: mcp.args } } })} and run \`amp mcp approve ${MCP_NAME}\` (a workspace MCP server waits for approval), or install with --scope user --run.`
            : null),
        notes: [
            "Amp marks its plugin API experimental. `amp -x` starts the turn before plugins load unless it gets --plugin-ready-timeout, and plugins do not load in Puck or Spaces.",
        ],
    },
};
// OpenCode and Amp (verified research 2026-11-21, plugin_or_extension_packaging
// and hook_pre_tool, skeptic verdicts applied): local plugin files load from
// .opencode/plugins/ and ~/.config/opencode/plugins/, and from .amp/plugins/*.ts
// and $XDG_CONFIG_HOME/amp/plugins/ (else ~/.config/amp/plugins/). MCP: an
// opencode.json `mcp` (1.x) or `mcp.servers` (2.x) entry, printed because the
// file is JSONC; Amp `amp mcp add <name> -- <cmd>` / `amp mcp remove`, or
// `amp.mcpServers` in .amp/settings.json plus `amp mcp approve`.
function planPluginInstall(agent, spec, ctx) {
    const plan = { agent, scope: ctx.scope, writes: [], runs: [], printed: [], notes: [...spec.notes, ...(ctx.scope === "project" ? [PLUGIN_FILE_NOTE] : [])], warnings: [] };
    const path = spec.file(ctx);
    const existing = ctx.read(path);
    if (existing !== null && !existing.includes(pluginMark(agent))) {
        return { ...plan, error: `${path} exists and this installer did not write it; rename or move it and rerun.` };
    }
    const content = spec.render(ctx.runtimeDir, ctx.failClosed);
    plan.writes.push({ path, content, created: existing === null, hooksAt: null, hookCommands: [], mcpAt: null, mcp: null, script: { sha256: sha256(content) } });
    try {
        addSkills(plan, agent, ctx);
    }
    catch (error) {
        return { ...plan, writes: [], error: error instanceof Error ? error.message : String(error) };
    }
    const mcp = { command: "node", args: [`${slash(ctx.runtimeDir)}/bin/mcp-server.mjs`, "--mode", "expert"] };
    const run = spec.mcpRun?.(ctx, mcp) ?? null;
    if (run) {
        plan.runs.push(run);
        plan.notes.push(`\`${run.argv.slice(0, 3).join(" ")}\` may replace an MCP server already named ${MCP_NAME}, which the uninstall would then remove: check \`${run.argv[0]} mcp list\` first.`);
    }
    const printed = spec.mcpPrinted(ctx, mcp);
    if (printed)
        plan.printed.push(printed);
    return plan;
}
/** What installing `agent`'s hooks and MCP server in `ctx.scope` writes, runs and prints. */
export function planAgentInstall(agent, ctx) {
    if (Object.hasOwn(PLUGINS, agent))
        return planPluginInstall(agent, PLUGINS[agent], ctx);
    const spec = specFor(agent);
    const plan = { agent, scope: ctx.scope, writes: [], runs: [], printed: [], notes: spec.notes(ctx), warnings: claudeImportWarnings(spec, ctx) };
    const args = [`${slash(ctx.runtimeDir)}/bin/mcp-server.mjs`, "--mode", "expert"];
    const mcp = spec.mcpType === undefined ? { command: "node", args } : { type: spec.mcpType, command: "node", args };
    try {
        const hooksFile = spec.hooksFile(ctx);
        const mcpFile = spec.mcpFile?.(ctx) ?? null;
        const sameFile = mcpFile !== null && mcpFile.path === hooksFile.path;
        const hooks = renderAgentHooks(agent, ctx.runtimeDir, ctx.failClosed);
        if (spec.script)
            plan.writes.push(...planScripts(ctx, agent, hooksFile.path, hooks));
        else
            plan.writes.push(planFile(ctx, spec, agent, hooksFile.path, hooksFile.hooksAt, hooks, sameFile ? mcpFile.mcpAt : null, sameFile ? mcp : null));
        if (mcpFile !== null && !sameFile)
            plan.writes.push(planFile(ctx, spec, agent, mcpFile.path, null, null, mcpFile.mcpAt, mcp));
        addSkills(plan, agent, ctx);
    }
    catch (error) {
        return { ...plan, writes: [], error: error instanceof Error ? error.message : String(error) };
    }
    const run = spec.mcpRun?.(ctx, mcp) ?? null;
    if (run) {
        plan.runs.push(run);
        plan.notes.push(`\`${run.argv.slice(0, 3).join(" ")}\` may replace an MCP server already named ${MCP_NAME}, which the uninstall would then remove: check \`${run.argv[0]} mcp list\` first.`);
    }
    const printed = spec.mcpPrinted?.(ctx, mcp) ?? null;
    if (printed)
        plan.printed.push(printed);
    if (ctx.failClosed && spec.failClosed === null) {
        plan.notes.push(`${spec.label} has no fail-closed hook option, so --fail-closed changes nothing there: a hook that crashes or times out still fails open.`);
    }
    return plan;
}
function deepEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}
/** The file with exactly the hooks and MCP entry the ledger recorded taken out. */
export function removeOwnedConfig(text, file) {
    if (file.script) {
        if (text === null)
            return { kind: "missing" };
        return sha256(text) === file.script.sha256
            ? { kind: "delete" }
            : { kind: "error", message: `${file.path} changed since it was installed; delete it by hand if you no longer want it.` };
    }
    const root = parseObject(text);
    if (root === null)
        return { kind: "missing" };
    if (root === "bad")
        return { kind: "error", message: `${file.path} is not a JSON object; remove the continuous-improvement entries by hand.` };
    try {
        if (file.hooksAt) {
            const drop = (command) => typeof command === "string" && file.hookCommands.includes(command);
            if (file.layout === "kiro" && file.hooksAt.length > 0) {
                const parent = lookup(root, file.hooksAt.slice(0, -1));
                const key = file.hooksAt[file.hooksAt.length - 1];
                const rows = parent?.[key];
                if (parent && Array.isArray(rows)) {
                    const kept = stripRows(rows, drop);
                    if (kept.length > 0)
                        parent[key] = kept;
                    else if (rows.length > 0)
                        delete parent[key];
                }
            }
            else {
                const map = file.hooksAt.length === 0 ? root : lookup(root, file.hooksAt);
                if (map && stripHooks(map, drop, file.path, file.layout) && file.hooksAt.length > 0 && Object.keys(map).length === 0)
                    dropAt(root, file.hooksAt);
            }
        }
        if (file.mcpAt && file.mcp) {
            const servers = lookup(root, file.mcpAt);
            if (servers && deepEqual(servers[MCP_NAME], file.mcp)) {
                delete servers[MCP_NAME];
                if (Object.keys(servers).length === 0)
                    dropAt(root, file.mcpAt);
            }
        }
    }
    catch (error) {
        return { kind: "error", message: error instanceof Error ? error.message : String(error) };
    }
    // In a flat or Kiro file we created, the `version` we set goes with our hooks.
    const left = Object.keys(root).filter((key) => !(file.layout && key === "version"));
    return file.created && left.length === 0 ? { kind: "delete" } : { kind: "write", content: write(root) };
}
function lookup(root, path) {
    let node = root;
    for (const key of path)
        node = isObject(node) ? node[key] : undefined;
    return isObject(node) ? node : null;
}
function dropAt(root, path) {
    const parent = lookup(root, path.slice(0, -1));
    if (parent)
        delete parent[path[path.length - 1]];
}
export function emptyLedger() {
    return { version: 1, entries: [], runtimes: [] };
}
const isStrings = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
function isEntry(value) {
    if (!isObject(value))
        return false;
    return typeof value.target === "string" && parseInstallScope(value.scope) !== null && (value.project === null || typeof value.project === "string")
        && typeof value.version === "string" && typeof value.runtime === "string" && typeof value.installedAt === "string"
        && Array.isArray(value.files) && value.files.every((file) => isObject(file) && typeof file.path === "string" && typeof file.created === "boolean"
        && (file.hooksAt === null || isStrings(file.hooksAt)) && isStrings(file.hookCommands) && (file.mcpAt === null || isStrings(file.mcpAt))
        && (file.layout === undefined || file.layout === "flat" || file.layout === "kiro")
        && (file.script === undefined || (isObject(file.script) && typeof file.script.sha256 === "string"))
        && (file.skill === undefined || typeof file.skill === "string"))
        && Array.isArray(value.runs) && value.runs.every((run) => isObject(run) && isStrings(run.argv) && (run.undo === null || isStrings(run.undo)) && typeof run.ran === "boolean"
        && (run.cwd === undefined || run.cwd === null || typeof run.cwd === "string"));
}
/** The ledger, an empty one when there is no file, or null when it is corrupt (nothing is then changed). */
export function parseLedger(text) {
    if (text === null)
        return emptyLedger();
    const root = parseObject(text);
    if (!isObject(root) || root.version !== 1 || !Array.isArray(root.entries) || !root.entries.every(isEntry))
        return null;
    if (root.runtimes !== undefined && !isStrings(root.runtimes))
        return null;
    const entries = root.entries.map((entry) => ({ ...entry, runs: entry.runs.map((run) => ({ ...run, cwd: run.cwd ?? null })) }));
    // A ledger written before the history existed: its entries' runtimes are the recorded ones.
    const runtimes = root.runtimes ?? [...new Set(entries.map((entry) => entry.runtime))];
    return { version: 1, entries, runtimes };
}
const sameSlot = (a, b) => a.target === b.target && a.scope === b.scope && a.project === b.project;
export function recordInstall(ledger, entry) {
    return {
        version: 1,
        entries: [...ledger.entries.filter((other) => !sameSlot(other, entry)), entry],
        runtimes: ledger.runtimes.includes(entry.runtime) ? ledger.runtimes : [...ledger.runtimes, entry.runtime],
    };
}
export function runtimesInUse(ledger) {
    return new Set(ledger.entries.map((entry) => entry.runtime));
}
// Like resolveTargets, but unknown names keep their place in the list.
function splitTargets(csv) {
    return [...new Set(csv.split(",").map((name) => name.trim().toLowerCase()).filter((name) => name !== ""))];
}
function flagValue(args, flag) {
    for (let i = 0; i < args.length; i++) {
        if (args[i] === flag)
            return { present: true, value: args[i + 1]?.startsWith("--") ? undefined : args[i + 1] };
        if (args[i].startsWith(`${flag}=`))
            return { present: true, value: args[i].slice(flag.length + 1) };
    }
    return { present: false, value: undefined };
}
/**
 * The hook-install request in an installer argv, or `none` when it has none of
 * the new flags, so every older invocation (`--target <id>` alone included)
 * keeps the existing installer path byte for byte.
 */
export function parseHookArgs(args) {
    const has = (flag) => args.includes(flag);
    const scope = flagValue(args, "--scope");
    const target = flagValue(args, "--target");
    const newFlags = has("--hooks") || has("--dry-run") || has("--run") || has("--fail-closed") || scope.present;
    const listed = target.value === undefined ? [] : splitTargets(target.value);
    const hookOnly = listed.filter((name) => resolveHookAgent(name) !== null && !TARGET_IDS.includes(name));
    const uninstall = has("--uninstall");
    if (!newFlags && !(uninstall ? listed.some((name) => resolveHookAgent(name) !== null) : hookOnly.length > 0))
        return { mode: "none" };
    const fail = (message) => ({ mode: "error", message });
    if (!uninstall && !has("--hooks")) {
        return fail(hookOnly.length > 0
            ? `${hookOnly.join(", ")} needs --hooks: there is no rules-only install for it.`
            : "--dry-run, --scope, --run and --fail-closed: each needs --hooks (or --uninstall --target <agent>).");
    }
    if (target.value === undefined || listed.length === 0)
        return fail(`--hooks needs --target <ids>. Agents with hooks: ${[...HOOK_AGENT_IDS, ...PLUGIN_AGENT_IDS].join(", ")}`);
    const parsedScope = scope.present ? parseInstallScope(scope.value) : "project";
    if (parsedScope === null)
        return fail(`--scope takes ${INSTALL_SCOPES.join(" or ")}.`);
    const agents = [];
    for (const name of listed) {
        const agent = resolveHookAgent(name);
        if (agent === null) {
            return fail(name === "claude"
                ? "claude: the Claude Code install takes none of --hooks, --dry-run or --uninstall --target; run it without them."
                : `${name}: no hook install for this agent in this version. Agents with hooks: ${[...HOOK_AGENT_IDS, ...PLUGIN_AGENT_IDS].join(", ")}${TARGET_IDS.includes(name) ? `; drop --hooks for the ${name} rules file` : ""}.`);
        }
        if (!agents.includes(agent))
            agents.push(agent);
    }
    return {
        mode: uninstall ? "uninstall" : "install",
        agents,
        rulesTargets: uninstall ? [] : listed.filter((name) => TARGET_IDS.includes(name)),
        scope: parsedScope,
        scopeGiven: scope.present,
        dryRun: has("--dry-run"),
        run: has("--run"),
        failClosed: has("--fail-closed"),
    };
}
