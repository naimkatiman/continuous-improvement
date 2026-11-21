// agent-doctor.mts — `ci doctor --agent <id>`: runs the agent's own listing
// commands and reports what each one printed
// (docs/plans/2026-11-21-all-agents.md, PR 16 and the Gates section).
//
// Owner decision: everything before an end-to-end approval uses listing
// commands only. No probe here starts a model turn, sends a prompt or runs a
// task, and src/test/agent-doctor.test.mts fails on an `exec`, `-p`, `run`,
// `chat` or prompt argument in this table, and on any JSON-RPC method outside
// DOCTOR_RPC_METHODS.
//
// Every command comes from the 2026-11-21 research `no_model_checks` for that
// agent (result.json research[i].no_model_checks), with the skeptic verdicts
// (verify[i]) applied where they correct it. A listing the research marks as
// unreliable or slow is left out, and so is one that needs an interactive
// session (`/hooks`, `/mcp`); those are printed as notes instead.

import { spawn, type ChildProcess } from "node:child_process";
import { statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

import { resolveHookAgent } from "./agent-install-plans.mjs";
import { PACKAGE_NAME, VERSION, getPluginHooksConfig } from "./plugin-metadata.mjs";
import { redactSecrets } from "./redact-secrets.mjs";

export interface RpcRequest {
  method: string;
  /** `"<cwd>"` anywhere in the params is replaced with the doctor's cwd. */
  params?: unknown;
  /** A notification: no id, no reply awaited. */
  notify?: boolean;
}

export interface DoctorProbe {
  bin: string;
  args: readonly string[];
  /** Where the research names this command. */
  source: string;
  /** JSON-RPC requests written to stdin, one per line; the reply to the last one is the result. */
  rpc?: readonly RpcRequest[];
  /** Turns the last RPC result into one line. */
  summarize?: (result: unknown) => string;
}

/** The JSON-RPC methods a probe may send: the handshake and a listing. */
export const DOCTOR_RPC_METHODS: readonly string[] = ["initialize", "initialized", "hooks/list"];

const R = "research no_model_checks";
const cli = (bin: string, args: readonly string[], source: string): DoctorProbe => ({ bin, args, source });

export const DOCTOR_PROBES: Readonly<Record<string, readonly DoctorProbe[]>> = {
  codex: [
    cli("codex", ["--version"], `${R} (Codex): prints codex-cli 0.171.0`),
    cli("codex", ["features", "list"], `${R} (Codex): hooks and plugins feature flags`),
    cli("codex", ["plugin", "list", "--json"], `${R} (Codex): pluginId, installed, enabled`),
    cli("codex", ["mcp", "list", "--json"], `${R} (Codex): MCP servers, transport and args`),
    {
      bin: "codex",
      args: ["app-server"],
      source: `${R} (Codex): app-server stdio JSON-RPC initialize, initialized, hooks/list (eventName, command, trustStatus untrusted|trusted|modified|managed); replayed locally against codex-cli 0.171.0, which exits on stdin EOF before replying, so stdin stays open until the reply`,
      rpc: [
        { method: "initialize", params: { clientInfo: { name: `${PACKAGE_NAME}-doctor`, version: VERSION } } },
        { method: "initialized", notify: true },
        { method: "hooks/list", params: { cwds: ["<cwd>"] } },
      ],
      summarize: (result) => summarizeCodexHooks(result),
    },
  ],
  gemini: [
    cli("gemini", ["--version"], `${R} (Gemini): prints 0.41.2`),
    cli("gemini", ["extensions", "list"], `${R} (Gemini): name, path, enabled, MCP servers, skills; not hooks`),
    cli("gemini", ["mcp", "list"], `${R} (Gemini): spawns each stdio server, Connected/Disconnected, no model call`),
  ],
  qwen: [
    cli("qwen", ["--version"], `${R} (Qwen): prints 0.28.0`),
    cli("qwen", ["extensions", "list"], `${R} (Qwen): per extension path, origin, enabled, skills, MCP servers; not hooks`),
    cli("qwen", ["mcp", "list"], `${R} (Qwen): configured servers with connection state`),
  ],
  cursor: [
    cli("cursor", ["--version"], `${R} (Cursor): IDE CLI version, no model`),
  ],
  copilot: [
    cli("copilot", ["--version"], `${R} (Copilot)`),
    cli("copilot", ["plugin", "list", "--json"], `${R} (Copilot)`),
    cli("copilot", ["mcp", "list"], `${R} (Copilot); skeptic mcp_servers: confirmed`),
    cli("copilot", ["skill", "list"], `${R} (Copilot)`),
  ],
  grok: [
    cli("grok", ["--version"], `${R} (Grok): prints grok 1.0.85`),
    cli("grok", ["inspect", "--json"], `${R} (Grok): plugins, skills, MCP servers; hooks only when the cwd is trusted`),
    cli("grok", ["mcp", "list"], `${R} (Grok)`),
    cli("grok", ["mcp", "doctor", PACKAGE_NAME], `${R} (Grok): handshake and tool count (19 tools)`),
  ],
  devin: [
    cli("devin", ["--version"], `${R} (Devin): prints devin 3000.14.30833`),
    cli("devin", ["mcp", "list", "--process-model", "in-process"], `${R} (Devin): each server and its source file`),
    cli("devin", ["plugins", "list", "--process-model", "in-process"], `${R} (Devin)`),
    cli("devin", ["skills", "list", "--process-model", "in-process"], `${R} (Devin): each skill with its source path`),
  ],
  kiro: [
    cli("kiro-cli", ["--version"], `${R} (Kiro): 3.0.0 or later`),
    cli("kiro-cli", ["mcp", "list"], `${R} (Kiro); skeptic no_model_checks: confirmed`),
    cli("kiro-cli", ["agent", "list"], `${R} (Kiro)`),
  ],
  droid: [
    cli("droid", ["-v"], `${R} ([Droid]): -v, --version`),
    cli("droid", ["plugin", "list"], `${R} ([Droid]): List installed plugins`),
    cli("droid", ["mcp", "list"], `${R} ([Droid]); skeptic [Droid] mcp_servers: droid mcp list IS documented`),
  ],
  auggie: [
    cli("auggie", ["--version"], `${R} ([Auggie])`),
    cli("auggie", ["mcp", "list"], `${R} ([Auggie]): Display all configured MCP servers`),
  ],
  junie: [
    cli("junie", ["--version"], `${R} ([Junie]); skeptic [Junie] headless_mode: --version exists for a no-model check`),
  ],
  cline: [
    cli("cline", ["--version"], `${R} (Cline): -V, --version`),
    cli("cline", ["config", "hooks", "--json"], `${R} (Cline): lists discovered hook files without a task`),
    cli("cline", ["config", "mcp", "--json"], `${R} (Cline)`),
    cli("cline", ["config", "skills", "--json"], `${R} (Cline)`),
  ],
  goose: [
    cli("goose", ["--version"], `${R} ([Goose])`),
    cli("goose", ["info", "-v"], `${R} ([Goose]): configuration, environment variables and enabled extensions`),
    cli("goose", ["skills", "list"], `${R} ([Goose]): installed and discoverable skills with source locations`),
  ],
  opencode: [
    cli("opencode", ["--version"], `${R} (OpenCode)`),
    cli("opencode", ["debug", "config"], `${R} (OpenCode): resolved configuration (plugin, mcp, instructions)`),
    cli("opencode", ["debug", "skill"], `${R} (OpenCode): list all available skills`),
    cli("opencode", ["mcp", "list"], `${R} (OpenCode): spawns the servers but calls no model`),
  ],
  amp: [
    cli("amp", ["version"], `${R} (Amp): Print the version number and exit`),
    cli("amp", ["plugins", "list"], `${R} (Amp): loaded plugins, sources, events, commands and tools`),
    cli("amp", ["mcp", "list"], `${R} (Amp): List available MCP servers`),
    cli("amp", ["skills", "list", "--json"], `${R} (Amp)`),
  ],
};

/** What the research says a listing cannot show, or where the rest is checked. */
const DOCTOR_NOTES: Readonly<Record<string, string>> = {
  gemini: "No Gemini CLI command lists hooks; `gemini extensions list` shows the extension that carries them.",
  qwen: "`qwen extensions list` does not list hooks.",
  cursor: "The Cursor CLI (`agent`) is not probed: on some hosts `agent` is another vendor's binary (the research found Grok's agent.exe first on PATH). In the IDE, Customize > Hooks lists the loaded hooks.",
  grok: "`grok inspect` lists plugin hooks only when the current directory is trusted.",
  devin: "Devin Desktop ships devin.exe under resources/app/extensions/windsurf/devin/bin, which may not be on PATH. `/hooks` inside a session lists the loaded hooks.",
  kiro: "`/hooks` inside a kiro-cli session lists the hooks; `kiro-cli doctor` was removed in 3.0.0.",
  droid: "`/hooks` inside the TUI shows the configured hooks.",
  auggie: "`/hooks` inside the TUI shows the configured hooks and any configuration problems.",
  junie: "Junie has no listing command; `/mcp` and `/skills` inside the TUI show what loaded.",
};

export const DOCTOR_AGENTS: readonly string[] = Object.keys(DOCTOR_PROBES);

export const DOCTOR_USAGE = `Usage: ci doctor --agent <${DOCTOR_AGENTS.join("|")}>`;

/** `--agent <id>` or `--agent=<id>`, exact id or the windsurf alias. Anything else throws. */
export function parseDoctorArgs(args: readonly string[]): { agent: string } {
  let given: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--agent") given = args[++i] ?? "";
    else if (arg.startsWith("--agent=")) given = arg.slice("--agent=".length);
    else throw new Error(`${DOCTOR_USAGE}\nUnexpected argument: ${arg}`);
  }
  if (given === undefined) throw new Error(DOCTOR_USAGE);
  const agent = resolveHookAgent(given);
  if (agent === null || !Object.hasOwn(DOCTOR_PROBES, agent)) {
    throw new Error(`${DOCTOR_USAGE}\nUnknown --agent: ${JSON.stringify(given)}. Valid: ${DOCTOR_AGENTS.join(", ")}, windsurf`);
  }
  return { agent };
}

function envValue(env: NodeJS.ProcessEnv, name: string, platform: string): string | undefined {
  if (platform !== "win32") return env[name];
  const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : env[key];
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * The absolute path `bin` runs from, or null. Relative PATH entries are
 * skipped, so a binary planted in the current directory is never picked. On
 * win32 only PATHEXT names count (an extensionless npm sh shim is not runnable
 * there).
 */
export function findOnPath(bin: string, env: NodeJS.ProcessEnv, platform: string): string | null {
  const dirs = (envValue(env, "PATH", platform) ?? "").split(platform === "win32" ? ";" : delimiter);
  const exts = platform === "win32"
    ? (envValue(env, "PATHEXT", platform) ?? ".COM;.EXE;.BAT;.CMD").split(";").filter((ext) => ext.startsWith("."))
    : [""];
  for (const dir of dirs) {
    const clean = dir.trim().replace(/^"(.*)"$/, "$1");
    if (!clean || !isAbsolute(clean)) continue;
    for (const ext of exts) {
      const candidate = join(clean, bin + ext.toLowerCase());
      if (isFile(candidate)) return candidate;
      if (ext && isFile(join(clean, bin + ext))) return join(clean, bin + ext);
    }
  }
  return null;
}

// Our hook scripts by basename (gateguard, session, observe, ...), read from
// the hook table the plugin ships, so a renamed hook is still counted.
function ourHookNames(): Set<string> {
  const names = new Set<string>();
  for (const groups of Object.values(getPluginHooksConfig().hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        const match = /\/(?:hooks|bin)\/([a-z-]+)\.mjs/.exec(hook.command);
        if (match) names.add(match[1]!);
      }
    }
  }
  return names;
}

function isOurCodexHook(hook: Record<string, unknown>, names: Set<string>): boolean {
  if (typeof hook.pluginId === "string" && hook.pluginId.startsWith(`${PACKAGE_NAME}@`)) return true;
  if (typeof hook.command !== "string") return false;
  const match = /[\\/](?:hooks|bin)[\\/]([a-z-]+)\.mjs\b/.exec(hook.command);
  return match !== null && names.has(match[1]!);
}

/**
 * One line from a Codex `hooks/list` result: how many of our hooks Codex sees,
 * by trust status. Untrusted hooks do not run until the user trusts them in
 * /hooks (plan, Per-agent tier: Codex).
 */
export function summarizeCodexHooks(result: unknown): string {
  const data = (result as { data?: unknown } | null | undefined)?.data;
  if (!Array.isArray(data)) return "could not read the hooks/list result";
  const names = ourHookNames();
  const counts = new Map<string, number>();
  let total = 0;
  for (const entry of data) {
    const hooks = (entry as { hooks?: unknown } | null)?.hooks;
    if (!Array.isArray(hooks)) continue;
    for (const hook of hooks) {
      if (hook === null || typeof hook !== "object" || !isOurCodexHook(hook as Record<string, unknown>, names)) continue;
      const status = (hook as { trustStatus?: unknown }).trustStatus;
      const key = typeof status === "string" && status ? status : "unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total++;
    }
  }
  if (total === 0) return `no ${PACKAGE_NAME} hooks in this directory`;
  const parts = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([status, n]) => `${n} ${status}`);
  const line = `${total} ${PACKAGE_NAME} hook${total === 1 ? "" : "s"}: ${parts.join(", ")}`;
  const pending = total - (counts.get("trusted") ?? 0) - (counts.get("managed") ?? 0);
  return pending > 0 ? `${line}. They do not run until trusted: open /hooks in Codex.` : line;
}

interface Outcome {
  code: number | null;
  output: string;
  timedOut: boolean;
  startError?: string;
  rpcError?: string;
  rpcResult?: unknown;
}

const OUTPUT_CAP = 64 * 1024;
const SHOWN_LINES = 12;
const SHOWN_CHARS = 240;

function spawnProbe(path: string, args: readonly string[], platform: string, env: NodeJS.ProcessEnv, cwd: string): ChildProcess {
  // A .cmd or .bat shim runs only through cmd.exe. Every token in the table is
  // a plain word (the test pins it), and the path is quoted; a path cmd.exe
  // would still expand is refused.
  if (platform === "win32" && /\.(cmd|bat)$/i.test(path)) {
    if (/[%"^!]/.test(path)) throw new Error(`refusing to run ${path} through cmd.exe`);
    return spawn(`"${path}" ${args.join(" ")}`, { shell: true, env, cwd, windowsHide: true });
  }
  return spawn(path, [...args], { env, cwd, windowsHide: true });
}

function withCwd(value: unknown, cwd: string): unknown {
  if (value === "<cwd>") return cwd;
  if (Array.isArray(value)) return value.map((item) => withCwd(item, cwd));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withCwd(item, cwd)]));
  }
  return value;
}

function runProbe(path: string, probe: DoctorProbe, opts: DoctorOptions): Promise<Outcome> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawnProbe(path, probe.args, opts.platform, opts.env, opts.cwd);
    } catch (error) {
      resolve({ code: null, output: "", timedOut: false, startError: error instanceof Error ? error.message : String(error) });
      return;
    }
    let output = "";
    let rpcBuffer = "";
    let done = false;
    const rpc = probe.rpc ?? [];
    let lastId = 0;
    const finish = (outcome: Partial<Outcome>): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code: null, output, timedOut: false, ...outcome });
    };
    const timer = setTimeout(() => {
      child.kill();
      child.stdin?.destroy();
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.unref();
      finish({ timedOut: true });
    }, opts.timeoutMs);
    const collect = (chunk: Buffer): void => {
      if (output.length < OUTPUT_CAP) output += chunk.toString("utf8");
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      if (rpc.length === 0) {
        collect(chunk);
        return;
      }
      rpcBuffer += chunk.toString("utf8");
      const lines = rpcBuffer.split("\n");
      rpcBuffer = lines.pop() ?? "";
      for (const line of lines) {
        let message: { id?: unknown; result?: unknown; error?: { message?: unknown } };
        try {
          message = JSON.parse(line) as typeof message;
        } catch {
          continue;
        }
        if (message.id !== lastId) continue;
        child.stdin?.end();
        if (message.error !== undefined) finish({ code: 0, rpcError: String(message.error?.message ?? JSON.stringify(message.error)) });
        else finish({ code: 0, rpcResult: message.result });
      }
    });
    child.stderr?.on("data", collect);
    child.on("error", (error) => finish({ startError: error.message }));
    child.on("close", (code) => finish({ code, rpcError: rpc.length > 0 ? "exited before it replied" : undefined }));
    if (rpc.length > 0) {
      let id = 0;
      for (const request of rpc) {
        const message: Record<string, unknown> = { method: request.method };
        if (!request.notify) message.id = lastId = ++id;
        if (request.params !== undefined) message.params = withCwd(request.params, opts.cwd);
        child.stdin?.write(`${JSON.stringify(message)}\n`);
      }
    } else {
      child.stdin?.end();
    }
  });
}

export interface DoctorOptions {
  env: NodeJS.ProcessEnv;
  platform: string;
  cwd: string;
  timeoutMs: number;
  write: (line: string) => void;
}

function shown(text: string): string[] {
  const lines = redactSecrets(text).replace(/\r\n?/g, "\n").split("\n").filter((line) => line.trim() !== "");
  const head = lines.slice(0, SHOWN_LINES).map((line) => `  ${line.length > SHOWN_CHARS ? `${line.slice(0, SHOWN_CHARS)}...` : line}`);
  if (lines.length > SHOWN_LINES) head.push(`  (${lines.length - SHOWN_LINES} more lines)`);
  return head;
}

/** Runs the agent's probes in order. True when every probe ran and exited 0. */
export async function runDoctor(agent: string, opts: DoctorOptions): Promise<boolean> {
  if (!Object.hasOwn(DOCTOR_PROBES, agent)) {
    throw new Error(`${DOCTOR_USAGE}\nUnknown --agent: ${JSON.stringify(agent)}. Valid: ${DOCTOR_AGENTS.join(", ")}, windsurf`);
  }
  const probes = DOCTOR_PROBES[agent]!;
  opts.write(`ci doctor --agent ${agent}: listing commands only; none of them sends a prompt or starts a model turn.`);
  const paths = new Map<string, string | null>();
  let ok = 0;
  for (const probe of probes) {
    if (!paths.has(probe.bin)) {
      const path = findOnPath(probe.bin, opts.env, opts.platform);
      paths.set(probe.bin, path);
      if (path === null) opts.write(`${probe.bin}: not found on PATH, so its probes did not run.`);
    }
    const path = paths.get(probe.bin);
    if (!path) continue;
    const rpcNote = probe.rpc ? ` (JSON-RPC: ${probe.rpc.map((request) => request.method).join(", ")})` : "";
    opts.write(`$ ${probe.bin} ${probe.args.join(" ")}${rpcNote}`);
    const outcome = await runProbe(path, probe, opts);
    let status: string;
    if (outcome.startError !== undefined) status = `could not start: ${outcome.startError}`;
    else if (outcome.timedOut) status = `timed out after ${Math.round(opts.timeoutMs / 1000)}s`;
    else if (outcome.rpcError !== undefined) status = `no reply: ${outcome.rpcError}`;
    else if (outcome.code !== 0) status = `exit ${outcome.code ?? "(signal)"}`;
    else status = "ok";
    if (probe.rpc && outcome.rpcResult !== undefined) {
      opts.write(`  ${probe.summarize ? probe.summarize(outcome.rpcResult) : "replied"}`);
    } else if (!probe.rpc || status !== "ok") {
      for (const line of shown(outcome.output)) opts.write(line);
    }
    opts.write(`  -> ${status}`);
    if (status === "ok") ok++;
  }
  const note = DOCTOR_NOTES[agent];
  if (note) opts.write(`Note: ${note}`);
  opts.write(`${ok} of ${probes.length} probes ok.`);
  return ok === probes.length;
}
