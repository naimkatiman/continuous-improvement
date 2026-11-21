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

import { posix } from "node:path";

import { AGENT_PROFILES, type ToolKind } from "./agent-profiles.mjs";
import { TARGET_IDS } from "./install-targets.mjs";
import { PACKAGE_NAME, getPluginHooksConfig } from "./plugin-metadata.mjs";

export const HOOK_AGENT_IDS: readonly string[] = ["codex", "qwen", "grok", "devin", "droid"];
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
  command: string;
  args: string[];
}

/** One config file: where our hooks and MCP entry sit in it, and what we own there. */
export interface LedgerFile {
  path: string;
  created: boolean;
  /** Key path of the hooks map ([] = the file root), or null for no hooks. */
  hooksAt: string[] | null;
  hookCommands: string[];
  mcpAt: string[] | null;
  mcp: McpEntry | null;
}

export interface ConfigWrite extends LedgerFile {
  content: string;
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
  events: readonly string[];
  matcher: "regex" | "list";
  failClosed: [string, unknown] | null;
  hooksFile: (ctx: PlanContext) => { path: string; hooksAt: string[] };
  /** A JSON file the MCP entry is merged into (same path = same file). */
  mcpFile?: (ctx: PlanContext) => { path: string; mcpAt: string[] };
  mcpRun?: (ctx: PlanContext, mcp: McpEntry) => PlannedRun | null;
  mcpPrinted?: (ctx: PlanContext, mcp: McpEntry) => string | null;
  notes: (ctx: PlanContext) => string[];
  /** Imports ~/.claude and .claude settings hooks (and, for grok, Claude plugins). */
  importsClaude: "settings" | "settings+plugins" | null;
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
};

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

function nativeMatcher(agent: string, spec: AgentSpec, claudeMatcher: string): string | null {
  const names = claudeMatcher.split("|");
  const kinds: ReadonlySet<ToolKind> = names.some((name) => FILE_TOOLS.has(name))
    ? new Set<ToolKind>(["shell", "file-write", "patch"])
    : names.every((name) => SHELL_TOOLS.has(name)) ? new Set<ToolKind>(["shell"]) : new Set<ToolKind>();
  const profile = AGENT_PROFILES.find((entry) => entry.id === agent)!;
  const tools = Object.entries(profile.tools).filter(([, tool]) => kinds.has(tool.kind)).map(([name]) => name);
  if (tools.length === 0) return null;
  return spec.matcher === "regex" ? `^(${tools.join("|")})$` : tools.join("|");
}

/** The agent's hooks map: the plugin's events and scripts, its native matchers, commands at the runtime. */
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
        const handler: Handler = {
          type: "command",
          command: `${hook.command.replace("${CLAUDE_PLUGIN_ROOT}", () => rt)} --agent ${agent}`,
          timeout: hook.timeout ?? 30,
        };
        if (failClosed && event === "PreToolUse" && spec.failClosed) handler[spec.failClosed[0]] = spec.failClosed[1];
        return handler;
      });
      groups.push(matcher === undefined ? { hooks } : { matcher, hooks });
    }
    if (groups.length > 0) out[event] = groups;
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

/** Our MCP entry from any runtime version: exactly the {command, args} planAgentInstall renders. */
function isOurMcp(value: unknown): boolean {
  if (!isObject(value) || Object.keys(value).sort().join(",") !== "args,command" || value.command !== "node") return false;
  const args = value.args;
  return isStrings(args) && args.length === 3 && /\/runtime\/[^"/]+\/bin\/mcp-server\.mjs$/.test(args[0]!) && args[1] === "--mode" && args[2] === "expert";
}

/** One of our commands for this agent, from any runtime version. */
function isOurCommand(agent: string, command: unknown): boolean {
  return typeof command === "string" && new RegExp(`^node "[^"]*/runtime/[^"/]+/(?:hooks|bin)/[\\w-]+\\.mjs" --agent ${agent}$`).test(command);
}

// Drops the handlers `drop` matches, hook by hook. A group or event list we
// empty goes; malformed rows and foreign handlers stay verbatim.
function stripHooks(hooks: Json, drop: (command: unknown) => boolean, file: string): boolean {
  let changed = false;
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) throw new Error(`${file}: hooks.${event} is not a list; fix it and rerun.`);
    const kept: unknown[] = [];
    let touched = false;
    for (const group of groups) {
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

const write = (root: Json): string => `${JSON.stringify(root, null, 2)}\n`;

function planFile(
  ctx: PlanContext, agent: string, path: string, hooksAt: string[] | null, hooks: HooksMap | null, mcpAt: string[] | null, mcp: McpEntry | null,
): ConfigWrite {
  const existing = parseObject(ctx.read(path));
  if (existing === "bad") throw new Error(`${path} is not a JSON object; fix or move it and rerun.`);
  const root = existing ?? {};
  if (hooksAt && hooks) {
    const map = objectAt(root, hooksAt, path);
    stripHooks(map, (command) => isOurCommand(agent, command), path);
    for (const [event, groups] of Object.entries(hooks)) {
      if (map[event] !== undefined && !Array.isArray(map[event])) throw new Error(`${path}: hooks.${event} is not a list; fix it and rerun.`);
      map[event] = [...((map[event] as unknown[] | undefined) ?? []), ...groups];
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
  const hookCommands = hooks ? Object.values(hooks).flatMap((groups) => groups.flatMap((group) => group.hooks.map((hook) => hook.command))) : [];
  return { path, content: write(root), created: existing === null, hooksAt, hookCommands, mcpAt, mcp };
}

// A hook command of ours in a Claude settings file this agent also loads.
function claudeImportWarnings(spec: AgentSpec, ctx: PlanContext): string[] {
  if (spec.importsClaude === null) return [];
  const warnings: string[] = [];
  const claudeDir = join(ctx.home, ".claude");
  const files = [join(claudeDir, "settings.json"), join(claudeDir, "settings.local.json"), join(ctx.projectRoot, ".claude", "settings.json"), join(ctx.projectRoot, ".claude", "settings.local.json")];
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
  const mcp: McpEntry = { command: "node", args: [`${slash(ctx.runtimeDir)}/bin/mcp-server.mjs`, "--mode", "expert"] };
  try {
    const hooksFile = spec.hooksFile(ctx);
    const mcpFile = spec.mcpFile?.(ctx) ?? null;
    const sameFile = mcpFile !== null && mcpFile.path === hooksFile.path;
    const hooks = renderAgentHooks(agent, ctx.runtimeDir, ctx.failClosed);
    plan.writes.push(planFile(ctx, agent, hooksFile.path, hooksFile.hooksAt, hooks, sameFile ? mcpFile.mcpAt : null, sameFile ? mcp : null));
    if (mcpFile !== null && !sameFile) plan.writes.push(planFile(ctx, agent, mcpFile.path, null, null, mcpFile.mcpAt, mcp));
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
  const root = parseObject(text);
  if (root === null) return { kind: "missing" };
  if (root === "bad") return { kind: "error", message: `${file.path} is not a JSON object; remove the continuous-improvement entries by hand.` };
  try {
    if (file.hooksAt) {
      const map = file.hooksAt.length === 0 ? root : lookup(root, file.hooksAt);
      if (map && stripHooks(map, (command) => typeof command === "string" && file.hookCommands.includes(command), file.path) && file.hooksAt.length > 0 && Object.keys(map).length === 0) {
        dropAt(root, file.hooksAt);
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
  return file.created && Object.keys(root).length === 0 ? { kind: "delete" } : { kind: "write", content: write(root) };
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
      && (file.hooksAt === null || isStrings(file.hooksAt)) && isStrings(file.hookCommands) && (file.mcpAt === null || isStrings(file.mcpAt)))
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
