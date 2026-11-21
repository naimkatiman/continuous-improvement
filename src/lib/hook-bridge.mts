// hook-bridge.mts — Runs this repo's hooks for an agent whose hooks are
// in-process plugin calls (docs/plans/2026-11-21-all-agents.md, Architecture
// item 13): OpenCode and Amp have no stdin hooks, no exit codes and no
// decision JSON, only JS/TS functions inside the agent (verified research
// 2026-11-21, hook_pre_tool for OpenCode and Amp: "OpenCode has no subprocess
// hooks"; "There is no shell-hook config").
//
// The plugin shims (plugin-shim-opencode.mjs, plugin-shim-amp.mjs) turn the
// agent's call into a Claude-named one; the bridge sends it to the hooks as a
// Claude Code payload with `--agent claude` and reads the Claude reply back,
// so every guard keeps the one code path the Claude goldens pin. Each hook
// runs in `node` from the stable runtime copy, not in the agent's own runtime:
// both agents load plugins with Bun (Amp's is embedded, OpenCode V1 installs
// plugins with Bun), and the hooks are built and tested on Node only.
//
// Fail mode: a hook that crashes, times out or cannot start allows the call
// (owner decision: the fail-open default most agents have is kept); with
// `failClosed` (install --fail-closed) it blocks it. Loop guard: with
// `--agent claude` the Stop hooks do not check stop_hook_active, so the bridge
// itself skips the Stop fire right after one it continued, the non-Claude rule
// of hook-io's skipsStopGate.

import { spawn } from "node:child_process";
import { join } from "node:path";

import { classifierShells } from "./agent-profiles.mjs";

/** A tool call under its Claude Code name and input keys. `apply_patch` carries the patch text in `command`, as Codex's does. */
export interface BridgeCall {
  tool: string;
  input: Record<string, unknown>;
}

export interface HookReply {
  stdout: string;
  stderr: string;
  /** null: the hook did not exit on its own (timed out) or never started. */
  exitCode: number | null;
}

/** Runs one hook script (relative to the runtime dir) on one payload. */
export type HookRunner = (script: string, payload: Record<string, unknown>) => Promise<HookReply>;

export interface BridgeOptions {
  /** The stable runtime copy the scripts run from (install-runtime.mjs). */
  runtimeDir: string;
  /** Block a call when a guard fails to answer (install --fail-closed). */
  failClosed: boolean;
  /** The project directory sent as the payload cwd. Default: process.cwd(). */
  cwd?: () => string;
  platform?: string;
  /** Default: spawn `node <runtimeDir>/<script> --agent claude`. */
  run?: HookRunner;
}

export type Reply = { kind: "allow" } | { kind: "block"; reason: string } | { kind: "context"; text: string } | { kind: "error" };

export interface Bridge {
  /** The deny reason, or null to let the call run. */
  preTool(sessionId: string | undefined, call: BridgeCall): Promise<string | null>;
  /** Records the call for the observer. Never throws. */
  postTool(sessionId: string | undefined, call: BridgeCall, output: unknown): Promise<void>;
  /** The saved lessons for a session, computed once per session; null when there are none. */
  lessons(sessionId: string | undefined): Promise<string | null>;
  /** The reason to continue the turn, or null to let it end. */
  stop(sessionId: string | undefined): Promise<string | null>;
}

const SHELL_TOOLS = ["Bash", "PowerShell"];
const FILE_TOOLS = ["Edit", "Write", "apply_patch"];

/**
 * The scripts the bridge runs, from the plugin's own table (hooks/hooks.json,
 * getPluginHooksConfig). PreToolUse: each group's scripts with the Claude tools
 * its matcher names; a group that names file tools also takes patches, as the
 * install planner renders it for Codex. The Skill group (companion-preference)
 * routes Claude Code companion plugins, so it is Claude-only. Stop: the two
 * gates that continue a turn on their own evidence; three-section-close reads
 * the Claude transcript, and workflow-distill and query-cost-nudge never
 * continue a non-Claude turn (plan PR 9). A test keeps this in step with the
 * plugin table.
 */
export const BRIDGE_HOOKS = {
  preTool: [
    { script: "hooks/gateguard.mjs", tools: [...SHELL_TOOLS, ...FILE_TOOLS] },
    { script: "hooks/hook-pack.mjs", tools: SHELL_TOOLS },
    { script: "hooks/config-guard.mjs", tools: [...SHELL_TOOLS, ...FILE_TOOLS] },
  ],
  postTool: "bin/observe.mjs",
  session: "hooks/session.mjs",
  stop: ["hooks/goal-drift-stop.mjs", "hooks/typecheck-stop.mjs"],
} as const;

// The plugin table's hook timeout (plugin-metadata hookTimeoutSeconds).
const HOOK_TIMEOUT_MS = 30_000;
// hook-io's fixed line for a blank deny reason.
const BLANK_REASON = "[continuous-improvement] blocked";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * The Claude Code reading of a hook's reply (hook-io encodeClaude): exit 2
 * blocks with stderr as the reason; at exit 0 a PreToolUse permissionDecision
 * deny or a {decision:"block"} blocks (at Stop it continues), and SessionStart
 * stdout is context. Any other non-zero exit is a hook error. Anything else
 * allows, as Claude Code reads it.
 */
export function readReply(event: string, reply: HookReply): Reply {
  if (reply.exitCode === 2) return { kind: "block", reason: reply.stderr.trim() || BLANK_REASON };
  if (reply.exitCode !== 0) return { kind: "error" };
  const text = reply.stdout.trim();
  if (text === "") return { kind: "allow" };
  let json: Record<string, unknown> | null = null;
  try {
    json = asRecord(JSON.parse(text));
  } catch {
    // plain stdout: context at SessionStart, transcript text elsewhere
  }
  if (json === null) return event === "SessionStart" ? { kind: "context", text } : { kind: "allow" };
  const specific = asRecord(json.hookSpecificOutput);
  if (event === "PreToolUse" && specific?.permissionDecision === "deny") {
    return { kind: "block", reason: String(specific.permissionDecisionReason ?? "").trim() || BLANK_REASON };
  }
  if (json.decision === "block") return { kind: "block", reason: String(json.reason ?? "").trim() || BLANK_REASON };
  if (typeof specific?.additionalContext === "string" && specific.additionalContext.trim() !== "") return { kind: "context", text: specific.additionalContext.trim() };
  return { kind: "allow" };
}

function spawnRunner(runtimeDir: string, cwd: () => string): HookRunner {
  return (script, payload) => new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const done = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode });
    };
    // `node` by name: inside the agent, process.execPath is Bun.
    const child = spawn("node", [join(runtimeDir, script), "--agent", "claude"], { cwd: cwd(), stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const timer = setTimeout(() => {
      child.kill();
      done(null);
    }, HOOK_TIMEOUT_MS);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.on("error", () => done(null));
    child.on("close", (code) => done(code));
    child.stdin.on("error", () => {}); // a hook that exits before reading stdin
    child.stdin.end(JSON.stringify(payload));
  });
}

export function createBridge(options: BridgeOptions): Bridge {
  const cwd = options.cwd ?? (() => process.cwd());
  const run = options.run ?? spawnRunner(options.runtimeDir, cwd);
  const platform = options.platform ?? process.platform;
  const lessons = new Map<string, Promise<string | null>>();
  const continued = new Set<string>();

  const base = (event: string, sessionId: string | undefined): Record<string, unknown> => ({
    hook_event_name: event, ...(sessionId === undefined ? {} : { session_id: sessionId }), cwd: cwd(),
  });
  const ask = async (event: string, script: string, payload: Record<string, unknown>): Promise<Reply> => {
    try {
      return readReply(event, await run(script, payload));
    } catch {
      return { kind: "error" };
    }
  };

  return {
    async preTool(sessionId, call) {
      // A shell's flavor is not documented for either agent, so on win32 it is read as both (Architecture item 8).
      const names = SHELL_TOOLS.includes(call.tool) ? classifierShells("unknown", platform) : [call.tool];
      const jobs = BRIDGE_HOOKS.preTool.filter((hook) => (hook.tools as readonly string[]).includes(call.tool)).flatMap((hook) =>
        names.map((name) => ({ script: hook.script, payload: { ...base("PreToolUse", sessionId), tool_name: name, tool_input: call.input } })));
      const replies = await Promise.all(jobs.map((job) => ask("PreToolUse", job.script, job.payload)));
      for (const [index, reply] of replies.entries()) {
        if (reply.kind === "block") return reply.reason;
        if (reply.kind === "error" && options.failClosed) {
          return `[continuous-improvement] ${jobs[index]!.script} did not answer, and this plugin was installed with --fail-closed, so the call is blocked.`;
        }
      }
      return null;
    },
    async postTool(sessionId, call, output) {
      await ask("PostToolUse", BRIDGE_HOOKS.postTool, { ...base("PostToolUse", sessionId), tool_name: call.tool, tool_input: call.input, tool_response: output ?? null });
    },
    lessons(sessionId) {
      const key = sessionId ?? "";
      let pending = lessons.get(key);
      if (pending === undefined) {
        pending = ask("SessionStart", BRIDGE_HOOKS.session, { ...base("SessionStart", sessionId), source: "startup" })
          .then((reply) => (reply.kind === "context" ? reply.text : null));
        lessons.set(key, pending);
      }
      return pending;
    },
    async stop(sessionId) {
      const key = sessionId ?? "";
      if (continued.delete(key)) return null;
      const payload = { ...base("Stop", sessionId), stop_hook_active: false };
      const replies = await Promise.all(BRIDGE_HOOKS.stop.map((script) => ask("Stop", script, payload)));
      const reason = replies.find((reply): reply is { kind: "block"; reason: string } => reply.kind === "block")?.reason ?? null;
      if (reason !== null) continued.add(key);
      return reason;
    },
  };
}

/** The line in every plugin file the installer writes; a file without it is the user's. */
export function pluginMark(agent: string): string {
  return `continuous-improvement plugin, written by \`install --target ${agent} --hooks\`; \`--uninstall --target ${agent}\` removes it.`;
}

/** A file: URL for an absolute drive (C:/...) or POSIX path, the same on every platform. */
export function fileUrl(path: string): string {
  const slashed = path.replace(/\\/g, "/");
  const rooted = /^[A-Za-z]:\//.test(slashed) ? `/${slashed}` : slashed;
  return `file://${encodeURI(rooted).replace(/#/g, "%23").replace(/\?/g, "%3F")}`;
}

/** The text of a plugin file: our mark, then a default export built by `factory` from the runtime's lib. */
export function renderPluginFile(agent: string, module: string, factory: string, runtimeDir: string, failClosed: boolean): string {
  const rt = runtimeDir.replace(/\\/g, "/");
  return [
    `// ${pluginMark(agent)}`,
    `import { ${factory} } from ${JSON.stringify(fileUrl(`${rt}/lib/${module}`))};`,
    "",
    `export default ${factory}(${JSON.stringify({ runtimeDir: rt, failClosed })});`,
    "",
  ].join("\n");
}
