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

import { AGENT_PROFILES, type ToolKind } from "./agent-profiles.mjs";
import { TARGET_IDS } from "./install-targets.mjs";
import { PACKAGE_NAME, getPluginHooksConfig } from "./plugin-metadata.mjs";

export const HOOK_AGENT_IDS: readonly string[] = [
  "codex", "qwen", "grok", "devin", "droid", "gemini", "cursor", "copilot", "kiro", "auggie", "junie", "goose", "cline",
];
const ALIASES: Readonly<Record<string, string>> = { windsurf: "devin" };
export const INSTALL_SCOPES = ["project", "user"] as const;
export type InstallScope = (typeof INSTALL_SCOPES)[number];
const MCP_NAME = PACKAGE_NAME;

export interface PlanContext {
  scope: InstallScope;
  /** The absolute runtime dir every command points at. */
  runtimeDir: string;
  projectRoot: string;
  home: string;
  platform: string;
  env: Readonly<Record<string, string | undefined>>;
  failClosed: boolean;
  /** A file's text, or null when it does not exist. */
  read: (path: string) => string | null;
  /** A directory's entry names, or [] when it does not exist. */
  listDir: (path: string) => string[];
}

export interface McpEntry {
  /** Only where the agent requires it (Cursor "stdio", Copilot "local"). */
  type?: string;
  command: string;
  args: string[];
}

/**
 * How the hooks sit under `hooksAt`: Claude's event map of {matcher, hooks}
 * groups (absent), an event map of flat handlers that carry their own matcher
 * (Cursor, Copilot), or one list of {trigger, action} rows (Kiro).
 */
export type HookLayout = "flat" | "kiro";

/** One config file: where our hooks and MCP entry sit in it, and what we own there. */
export interface LedgerFile {
  path: string;
  created: boolean;
  /** Key path of the hooks map ([] = the file root), or null for no hooks. */
  hooksAt: string[] | null;
  hookCommands: string[];
  mcpAt: string[] | null;
  mcp: McpEntry | null;
  layout?: HookLayout;
  /** A hook script we own whole (Cline): removed only while it still hashes to this. */
  script?: { sha256: string };
}

export interface ConfigWrite extends LedgerFile {
  content: string;
  /** File mode for a script the agent executes directly (Cline's sh hook). */
  mode?: number;
}

export interface PlannedRun {
  argv: string[];
  /** The command that reverses it, or null when the vendor has none. */
  undo: string[] | null;
}

export interface InstallPlan {
  agent: string;
  scope: InstallScope;
  writes: ConfigWrite[];
  runs: PlannedRun[];
  /** Steps the user takes: snippets for files we do not write. */
  printed: string[];
  notes: string[];
  warnings: string[];
  error?: string;
}

export interface LedgerEntry {
  target: string;
  scope: InstallScope;
  /** The project root for a project install, null for a user install. */
  project: string | null;
  version: string;
  runtime: string;
  installedAt: string;
  files: LedgerFile[];
  /** `cwd`: where the command ran (the project root at project scope), and so where its undo runs. */
  runs: Array<PlannedRun & { ran: boolean; cwd: string | null }>;
}

export interface Ledger {
  version: 1;
  entries: LedgerEntry[];
  /**
   * Every runtime dir an entry has recorded. Pruning removes only these, so a
   * runtime this ledger never knew about (a moved or lost ledger) is kept.
   */
  runtimes: string[];
}

type Handler = Record<string, unknown> & { command: string };
type Group = { matcher?: string; hooks: Handler[] };
export type HooksMap = Record<string, Group[]>;

interface AgentSpec {
  label: string;
  /** The Claude Code events wired, in the plugin's order. */
  events: readonly string[];
  /** The agent's own name for a Claude event, where it differs. */
  eventNames?: Readonly<Record<string, string>>;
  /** `none`: the agent has no matcher (Cline); the group is still dropped when no tool of its kind exists. */
  matcher: "regex" | "list" | "none";
  failClosed: [string, unknown] | null;
  /** Default: the handler's `timeout`, in seconds. */
  timeout?: { key: string; ms: boolean };
  layout?: HookLayout;
  /** A `version` the file root must carry. */
  version?: string | number;
  /** The config file, or for a `script` agent the dir its hook scripts go in. */
  hooksFile: (ctx: PlanContext) => { path: string; hooksAt: string[] };
  /** Cline: one script per hook name instead of a JSON config. */
  script?: true;
  /** A JSON file the MCP entry is merged into (same path = same file). */
  mcpFile?: (ctx: PlanContext) => { path: string; mcpAt: string[] } | null;
  mcpType?: string;
  mcpRun?: (ctx: PlanContext, mcp: McpEntry) => PlannedRun | null;
  mcpPrinted?: (ctx: PlanContext, mcp: McpEntry) => string | null;
  notes: (ctx: PlanContext) => string[];
  /** Imports ~/.claude and .claude settings hooks (and Claude plugins), or only the project's .claude settings. */
  importsClaude: "settings" | "settings+plugins" | "project-settings" | null;
}

const ALL_EVENTS = ["PreToolUse", "PostToolUse", "UserPromptSubmit", "SessionStart", "SessionEnd", "Stop"] as const;

const slash = (path: string): string => path.replace(/\\/g, "/");
const join = (...parts: string[]): string => posix.join(...parts.map(slash));

function absEnv(ctx: PlanContext, key: string): string | null {
  const value = ctx.env[key]?.trim();
  return value && (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) ? slash(value) : null;
}

const base = (ctx: PlanContext, dir: string): string => (ctx.scope === "user" ? join(ctx.home, dir) : join(ctx.projectRoot, dir));
const mcpArgv = (mcp: McpEntry): string[] => [mcp.command, ...mcp.args];

const SPECS: Readonly<Record<string, AgentSpec>> = {
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
      ...(ctx.scope === "user" ? ["The Cline CLI reads user hooks from ~/.cline/hooks, not ~/Documents/Cline/Hooks: --scope project (.clinerules/hooks) reaches both."] : []),
    ],
    importsClaude: null,
  },
};

function kiroBase(ctx: PlanContext): string {
  return ctx.scope === "user" ? (absEnv(ctx, "KIRO_HOME") ?? join(ctx.home, ".kiro")) : join(ctx.projectRoot, ".kiro");
}

function clineDir(ctx: PlanContext): string {
  return ctx.scope === "user" ? join(ctx.home, "Documents", "Cline", "Hooks") : join(ctx.projectRoot, ".clinerules", "hooks");
}

export function resolveHookAgent(targetId: string): string | null {
  if (HOOK_AGENT_IDS.includes(targetId)) return targetId;
  return Object.hasOwn(ALIASES, targetId) ? ALIASES[targetId]! : null;
}

export function parseInstallScope(value: unknown): InstallScope | null {
  return INSTALL_SCOPES.find((scope) => scope === value) ?? null;
}

// The group kinds a plugin PreToolUse matcher stands for: file tools (gated
// with the shells), shells alone, or nothing (Skill: companion-preference
// routes Claude companion plugins, so it is Claude-only).
const FILE_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);
const SHELL_TOOLS = new Set(["Bash", "PowerShell", "Monitor"]);

// The native matcher, undefined for an agent with none, or null when the agent has no tool of the group's kinds.
function nativeMatcher(agent: string, spec: AgentSpec, claudeMatcher: string): string | null | undefined {
  const names = claudeMatcher.split("|");
  const kinds: ReadonlySet<ToolKind> = names.some((name) => FILE_TOOLS.has(name))
    ? new Set<ToolKind>(["shell", "file-write", "patch"])
    : names.every((name) => SHELL_TOOLS.has(name)) ? new Set<ToolKind>(["shell"]) : new Set<ToolKind>();
  const profile = AGENT_PROFILES.find((entry) => entry.id === agent)!;
  const tools = Object.entries(profile.tools).filter(([, tool]) => kinds.has(tool.kind)).map(([name]) => name);
  if (tools.length === 0) return null;
  if (spec.matcher === "none") return undefined;
  return spec.matcher === "regex" ? `^(${tools.join("|")})$` : tools.join("|");
}

/**
 * The agent's hooks map: the plugin's events and scripts under the agent's
 * event names, its native matchers and timeout field, commands at the runtime.
 * Always Claude's {matcher, hooks} groups; a flat or Kiro layout is made from
 * it when the file is planned.
 */
export function renderAgentHooks(agent: string, runtimeDir: string, failClosed: boolean): HooksMap {
  const spec = specFor(agent);
  const rt = slash(runtimeDir);
  const plugin = getPluginHooksConfig().hooks as Record<string, Array<{ matcher?: string; hooks: Array<{ command: string; timeout?: number }> }>>;
  const out: HooksMap = {};
  for (const event of Object.keys(plugin)) {
    if (!spec.events.includes(event)) continue;
    const groups: Group[] = [];
    for (const group of plugin[event]!) {
      const matcher = group.matcher === undefined ? undefined : nativeMatcher(agent, spec, group.matcher);
      if (matcher === null) continue;
      const hooks = group.hooks.map((hook) => {
        const seconds = hook.timeout ?? 30;
        const handler: Handler = {
          type: "command",
          command: `${hook.command.replace("${CLAUDE_PLUGIN_ROOT}", () => rt)} --agent ${agent}`,
          [spec.timeout?.key ?? "timeout"]: spec.timeout?.ms ? seconds * 1000 : seconds,
        };
        if (failClosed && event === "PreToolUse" && spec.failClosed) handler[spec.failClosed[0]] = spec.failClosed[1];
        return handler;
      });
      groups.push(matcher === undefined ? { hooks } : { matcher, hooks });
    }
    if (groups.length > 0) out[spec.eventNames?.[event] ?? event] = groups;
  }
  return out;
}

function specFor(agent: string): AgentSpec {
  if (!Object.hasOwn(SPECS, agent)) throw new Error(`${agent} has no hook planner. Agents with one: ${HOOK_AGENT_IDS.join(", ")}`);
  return SPECS[agent]!;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => value !== null && typeof value === "object" && !Array.isArray(value);

function parseObject(text: string | null): Json | null | "bad" {
  if (text === null) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return isObject(value) ? value : "bad";
  } catch {
    return "bad";
  }
}

// The object at a key path, created when absent; a non-object on the way is an error.
function objectAt(root: Json, path: readonly string[], file: string): Json {
  let node = root;
  for (const key of path) {
    if (node[key] === undefined) node[key] = {};
    if (!isObject(node[key])) throw new Error(`${file}: \`${path.join(".")}\` is not an object; fix it and rerun.`);
    node = node[key] as Json;
  }
  return node;
}

/** Our MCP entry from any runtime version: exactly the {command, args} planAgentInstall renders, plus the agent's `type` where it needs one. */
function isOurMcp(value: unknown): boolean {
  if (!isObject(value) || value.command !== "node") return false;
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "args,command" && !(keys === "args,command,type" && typeof value.type === "string")) return false;
  const args = value.args;
  return isStrings(args) && args.length === 3 && /\/runtime\/[^"/]+\/bin\/mcp-server\.mjs$/.test(args[0]!) && args[1] === "--mode" && args[2] === "expert";
}

/** One of our commands for this agent, from any runtime version. */
function isOurCommand(agent: string, command: unknown): boolean {
  return typeof command === "string" && new RegExp(`^node "[^"]*/runtime/[^"/]+/(?:hooks|bin)/[\\w-]+\\.mjs" --agent ${agent}$`).test(command);
}

type Drop = (command: unknown) => boolean;

// Drops the handlers `drop` matches, hook by hook. A group or event list we
// empty goes; malformed rows and foreign handlers stay verbatim. In the flat
// layout an event's list holds the handlers themselves.
function stripHooks(hooks: Json, drop: Drop, file: string, layout?: HookLayout): boolean {
  let changed = false;
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) throw new Error(`${file}: hooks.${event} is not a list; fix it and rerun.`);
    const kept: unknown[] = [];
    let touched = false;
    for (const group of groups) {
      if (layout === "flat") {
        if (isObject(group) && drop(group.command)) touched = true;
        else kept.push(group);
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
      if (left.length > 0) kept.push({ ...(group as Json), hooks: left });
    }
    if (!touched) continue;
    changed = true;
    if (kept.length > 0) hooks[event] = kept;
    else delete hooks[event];
  }
  return changed;
}

// Kiro keeps one list of rows, each naming its trigger, with the command under `action`.
const stripRows = (rows: readonly unknown[], drop: Drop): unknown[] => rows.filter((row) => !(isObject(row) && isObject(row.action) && drop(row.action.command)));

function flatHandlers(groups: readonly Group[]): Json[] {
  return groups.flatMap((group) => group.hooks.map((hook) => (group.matcher === undefined ? { ...hook } : { ...hook, matcher: group.matcher })));
}

function kiroRows(hooks: HooksMap): Json[] {
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

const write = (root: Json): string => `${JSON.stringify(root, null, 2)}\n`;

function planFile(
  ctx: PlanContext, spec: AgentSpec, agent: string, path: string, hooksAt: string[] | null, hooks: HooksMap | null, mcpAt: string[] | null, mcp: McpEntry | null,
): ConfigWrite {
  const existing = parseObject(ctx.read(path));
  if (existing === "bad") throw new Error(`${path} is not a JSON object; fix or move it and rerun.`);
  const root = existing ?? {};
  const layout = hooksAt && hooks ? spec.layout : undefined;
  if (hooksAt && hooks) {
    if (spec.version !== undefined) {
      if (root.version === undefined) root.version = spec.version;
      else if (root.version !== spec.version) throw new Error(`${path}: \`version\` is ${JSON.stringify(root.version)}, not ${JSON.stringify(spec.version)}; fix or move it and rerun.`);
    }
    const drop: Drop = (command) => isOurCommand(agent, command);
    if (layout === "kiro") {
      const parent = objectAt(root, hooksAt.slice(0, -1), path);
      const key = hooksAt[hooksAt.length - 1]!;
      const rows = parent[key] ?? [];
      if (!Array.isArray(rows)) throw new Error(`${path}: \`${hooksAt.join(".")}\` is not a list; fix it and rerun.`);
      parent[key] = [...stripRows(rows, drop), ...kiroRows(hooks)];
    } else {
      const map = objectAt(root, hooksAt, path);
      stripHooks(map, drop, path, layout);
      for (const [event, groups] of Object.entries(hooks)) {
        if (map[event] !== undefined && !Array.isArray(map[event])) throw new Error(`${path}: hooks.${event} is not a list; fix it and rerun.`);
        map[event] = [...((map[event] as unknown[] | undefined) ?? []), ...(layout === "flat" ? flatHandlers(groups) : groups)];
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

function commandsOf(hooks: HooksMap | null): string[] {
  return hooks ? Object.values(hooks).flatMap((groups) => groups.flatMap((group) => group.hooks.map((hook) => hook.command))) : [];
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

// In every hook script this installer writes; a script without it is the user's.
const SCRIPT_MARK = "continuous-improvement hook, written by `install --target cline --hooks`; `--uninstall --target cline` removes it.";

// Cline runs one script per hook name and has no matcher, so the script runs
// each guard on the same stdin and answers with the first reply (a
// {"cancel":true} deny); a guard passes a tool it does not gate. The Windows
// extension runs only <Name>.ps1 (with powershell -File), elsewhere only an
// extensionless executable, so exactly one of the two is written.
function clineScript(paths: readonly string[], platform: string): string {
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

function planScripts(ctx: PlanContext, agent: string, dir: string, hooks: HooksMap): ConfigWrite[] {
  return Object.entries(hooks).map(([event, groups]) => {
    const path = join(dir, ctx.platform === "win32" ? `${event}.ps1` : event);
    const commands = commandsOf({ [event]: groups });
    const paths = commands.map((command) => new RegExp(`^node "(.+)" --agent ${agent}$`).exec(command)?.[1]).filter((script): script is string => script !== undefined);
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
export function toLedgerFile(file: ConfigWrite): LedgerFile {
  const { path, created, hooksAt, hookCommands, mcpAt, mcp, layout, script } = file;
  return { path, created, hooksAt, hookCommands, mcpAt, mcp, ...(layout ? { layout } : {}), ...(script ? { script } : {}) };
}

// A hook command of ours in a Claude settings file this agent also loads.
function claudeImportWarnings(spec: AgentSpec, ctx: PlanContext): string[] {
  if (spec.importsClaude === null) return [];
  const warnings: string[] = [];
  const claudeDir = join(ctx.home, ".claude");
  const projectFiles = [join(ctx.projectRoot, ".claude", "settings.json"), join(ctx.projectRoot, ".claude", "settings.local.json")];
  const files = spec.importsClaude === "project-settings" ? projectFiles : [join(claudeDir, "settings.json"), join(claudeDir, "settings.local.json"), ...projectFiles];
  for (const file of files) {
    let text: string | null;
    try {
      text = ctx.read(file);
    } catch {
      continue; // an unreadable settings file only costs the warning
    }
    const parsed = parseObject(text);
    if (!isObject(parsed) || !isObject(parsed.hooks)) continue;
    const ours = Object.values(parsed.hooks).some((groups) => Array.isArray(groups) && groups.some((group) =>
      isObject(group) && Array.isArray(group.hooks) && group.hooks.some((hook) =>
        isObject(hook) && typeof hook.command === "string" && /continuous-improvement|[\\/]\.claude[\\/]instincts[\\/]/.test(hook.command))));
    if (ours) warnings.push(`${spec.label} also loads the continuous-improvement hooks in ${file} (it imports Claude Code hooks), so each hook would fire twice. Keep one of the two installs.`);
  }
  if (spec.importsClaude === "settings+plugins") {
    const plugins = join(claudeDir, "plugins");
    const hit = ctx.listDir(plugins).some((entry) => entry.includes(PACKAGE_NAME) || ctx.listDir(join(plugins, entry)).some((sub) => sub.includes(PACKAGE_NAME)));
    if (hit) warnings.push(`${spec.label} also loads the continuous-improvement Claude Code plugin from ${plugins}, so each hook would fire twice. Keep one of the two installs.`);
  }
  return warnings;
}

/** What installing `agent`'s hooks and MCP server in `ctx.scope` writes, runs and prints. */
export function planAgentInstall(agent: string, ctx: PlanContext): InstallPlan {
  const spec = specFor(agent);
  const plan: InstallPlan = { agent, scope: ctx.scope, writes: [], runs: [], printed: [], notes: spec.notes(ctx), warnings: claudeImportWarnings(spec, ctx) };
  const args = [`${slash(ctx.runtimeDir)}/bin/mcp-server.mjs`, "--mode", "expert"];
  const mcp: McpEntry = spec.mcpType === undefined ? { command: "node", args } : { type: spec.mcpType, command: "node", args };
  try {
    const hooksFile = spec.hooksFile(ctx);
    const mcpFile = spec.mcpFile?.(ctx) ?? null;
    const sameFile = mcpFile !== null && mcpFile.path === hooksFile.path;
    const hooks = renderAgentHooks(agent, ctx.runtimeDir, ctx.failClosed);
    if (spec.script) plan.writes.push(...planScripts(ctx, agent, hooksFile.path, hooks));
    else plan.writes.push(planFile(ctx, spec, agent, hooksFile.path, hooksFile.hooksAt, hooks, sameFile ? mcpFile.mcpAt : null, sameFile ? mcp : null));
    if (mcpFile !== null && !sameFile) plan.writes.push(planFile(ctx, spec, agent, mcpFile.path, null, null, mcpFile.mcpAt, mcp));
  } catch (error) {
    return { ...plan, writes: [], error: error instanceof Error ? error.message : String(error) };
  }
  const run = spec.mcpRun?.(ctx, mcp) ?? null;
  if (run) {
    plan.runs.push(run);
    plan.notes.push(`\`${run.argv.slice(0, 3).join(" ")}\` may replace an MCP server already named ${MCP_NAME}, which the uninstall would then remove: check \`${run.argv[0]} mcp list\` first.`);
  }
  const printed = spec.mcpPrinted?.(ctx, mcp) ?? null;
  if (printed) plan.printed.push(printed);
  if (ctx.failClosed && spec.failClosed === null) {
    plan.notes.push(`${spec.label} has no fail-closed hook option, so --fail-closed changes nothing there: a hook that crashes or times out still fails open.`);
  }
  return plan;
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export type RemoveResult = { kind: "write"; content: string } | { kind: "delete" } | { kind: "missing" } | { kind: "error"; message: string };

/** The file with exactly the hooks and MCP entry the ledger recorded taken out. */
export function removeOwnedConfig(text: string | null, file: LedgerFile): RemoveResult {
  if (file.script) {
    if (text === null) return { kind: "missing" };
    return sha256(text) === file.script.sha256
      ? { kind: "delete" }
      : { kind: "error", message: `${file.path} changed since it was installed; delete it by hand if you no longer want it.` };
  }
  const root = parseObject(text);
  if (root === null) return { kind: "missing" };
  if (root === "bad") return { kind: "error", message: `${file.path} is not a JSON object; remove the continuous-improvement entries by hand.` };
  try {
    if (file.hooksAt) {
      const drop: Drop = (command) => typeof command === "string" && file.hookCommands.includes(command);
      if (file.layout === "kiro" && file.hooksAt.length > 0) {
        const parent = lookup(root, file.hooksAt.slice(0, -1));
        const key = file.hooksAt[file.hooksAt.length - 1]!;
        const rows = parent?.[key];
        if (parent && Array.isArray(rows)) {
          const kept = stripRows(rows, drop);
          if (kept.length > 0) parent[key] = kept;
          else if (rows.length > 0) delete parent[key];
        }
      } else {
        const map = file.hooksAt.length === 0 ? root : lookup(root, file.hooksAt);
        if (map && stripHooks(map, drop, file.path, file.layout) && file.hooksAt.length > 0 && Object.keys(map).length === 0) dropAt(root, file.hooksAt);
      }
    }
    if (file.mcpAt && file.mcp) {
      const servers = lookup(root, file.mcpAt);
      if (servers && deepEqual(servers[MCP_NAME], file.mcp)) {
        delete servers[MCP_NAME];
        if (Object.keys(servers).length === 0) dropAt(root, file.mcpAt);
      }
    }
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
  // In a flat or Kiro file we created, the `version` we set goes with our hooks.
  const left = Object.keys(root).filter((key) => !(file.layout && key === "version"));
  return file.created && left.length === 0 ? { kind: "delete" } : { kind: "write", content: write(root) };
}

function lookup(root: Json, path: readonly string[]): Json | null {
  let node: unknown = root;
  for (const key of path) node = isObject(node) ? node[key] : undefined;
  return isObject(node) ? node : null;
}

function dropAt(root: Json, path: readonly string[]): void {
  const parent = lookup(root, path.slice(0, -1));
  if (parent) delete parent[path[path.length - 1]!];
}

export function emptyLedger(): Ledger {
  return { version: 1, entries: [], runtimes: [] };
}

const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

function isEntry(value: unknown): value is LedgerEntry {
  if (!isObject(value)) return false;
  return typeof value.target === "string" && parseInstallScope(value.scope) !== null && (value.project === null || typeof value.project === "string")
    && typeof value.version === "string" && typeof value.runtime === "string" && typeof value.installedAt === "string"
    && Array.isArray(value.files) && value.files.every((file) => isObject(file) && typeof file.path === "string" && typeof file.created === "boolean"
      && (file.hooksAt === null || isStrings(file.hooksAt)) && isStrings(file.hookCommands) && (file.mcpAt === null || isStrings(file.mcpAt))
      && (file.layout === undefined || file.layout === "flat" || file.layout === "kiro")
      && (file.script === undefined || (isObject(file.script) && typeof file.script.sha256 === "string")))
    && Array.isArray(value.runs) && value.runs.every((run) => isObject(run) && isStrings(run.argv) && (run.undo === null || isStrings(run.undo)) && typeof run.ran === "boolean"
      && (run.cwd === undefined || run.cwd === null || typeof run.cwd === "string"));
}

/** The ledger, an empty one when there is no file, or null when it is corrupt (nothing is then changed). */
export function parseLedger(text: string | null): Ledger | null {
  if (text === null) return emptyLedger();
  const root = parseObject(text);
  if (!isObject(root) || root.version !== 1 || !Array.isArray(root.entries) || !root.entries.every(isEntry)) return null;
  if (root.runtimes !== undefined && !isStrings(root.runtimes)) return null;
  const entries = root.entries.map((entry) => ({ ...entry, runs: entry.runs.map((run) => ({ ...run, cwd: run.cwd ?? null })) }));
  // A ledger written before the history existed: its entries' runtimes are the recorded ones.
  const runtimes = (root.runtimes as string[] | undefined) ?? [...new Set(entries.map((entry) => entry.runtime))];
  return { version: 1, entries, runtimes };
}

const sameSlot = (a: LedgerEntry, b: LedgerEntry): boolean => a.target === b.target && a.scope === b.scope && a.project === b.project;

export function recordInstall(ledger: Ledger, entry: LedgerEntry): Ledger {
  return {
    version: 1,
    entries: [...ledger.entries.filter((other) => !sameSlot(other, entry)), entry],
    runtimes: ledger.runtimes.includes(entry.runtime) ? ledger.runtimes : [...ledger.runtimes, entry.runtime],
  };
}

export function runtimesInUse(ledger: Ledger): Set<string> {
  return new Set(ledger.entries.map((entry) => entry.runtime));
}

export type HookArgs =
  | { mode: "none" }
  | { mode: "error"; message: string }
  | {
      mode: "install" | "uninstall";
      agents: string[];
      /** The rules-file targets in the list, installed as without --hooks. */
      rulesTargets: string[];
      scope: InstallScope;
      scopeGiven: boolean;
      dryRun: boolean;
      run: boolean;
      failClosed: boolean;
    };

// Like resolveTargets, but unknown names keep their place in the list.
function splitTargets(csv: string): string[] {
  return [...new Set(csv.split(",").map((name) => name.trim().toLowerCase()).filter((name) => name !== ""))];
}

function flagValue(args: readonly string[], flag: string): { present: boolean; value: string | undefined } {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) return { present: true, value: args[i + 1]?.startsWith("--") ? undefined : args[i + 1] };
    if (args[i]!.startsWith(`${flag}=`)) return { present: true, value: args[i]!.slice(flag.length + 1) };
  }
  return { present: false, value: undefined };
}

/**
 * The hook-install request in an installer argv, or `none` when it has none of
 * the new flags, so every older invocation (`--target <id>` alone included)
 * keeps the existing installer path byte for byte.
 */
export function parseHookArgs(args: readonly string[]): HookArgs {
  const has = (flag: string): boolean => args.includes(flag);
  const scope = flagValue(args, "--scope");
  const target = flagValue(args, "--target");
  const newFlags = has("--hooks") || has("--dry-run") || has("--run") || has("--fail-closed") || scope.present;
  const listed = target.value === undefined ? [] : splitTargets(target.value);
  const hookOnly = listed.filter((name) => resolveHookAgent(name) !== null && !TARGET_IDS.includes(name));
  const uninstall = has("--uninstall");
  if (!newFlags && !(uninstall ? listed.some((name) => resolveHookAgent(name) !== null) : hookOnly.length > 0)) return { mode: "none" };
  const fail = (message: string): HookArgs => ({ mode: "error", message });
  if (!uninstall && !has("--hooks")) {
    return fail(hookOnly.length > 0
      ? `${hookOnly.join(", ")} needs --hooks: there is no rules-only install for it.`
      : "--dry-run, --scope, --run and --fail-closed: each needs --hooks (or --uninstall --target <agent>).");
  }
  if (target.value === undefined || listed.length === 0) return fail(`--hooks needs --target <ids>. Agents with hooks: ${HOOK_AGENT_IDS.join(", ")}`);
  const parsedScope = scope.present ? parseInstallScope(scope.value) : "project";
  if (parsedScope === null) return fail(`--scope takes ${INSTALL_SCOPES.join(" or ")}.`);
  const agents: string[] = [];
  for (const name of listed) {
    const agent = resolveHookAgent(name);
    if (agent === null) {
      return fail(name === "claude"
        ? "claude: the Claude Code install takes none of --hooks, --dry-run or --uninstall --target; run it without them."
        : `${name}: no hook install for this agent in this version. Agents with hooks: ${HOOK_AGENT_IDS.join(", ")}${TARGET_IDS.includes(name) ? `; drop --hooks for the ${name} rules file` : ""}.`);
    }
    if (!agents.includes(agent)) agents.push(agent);
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
