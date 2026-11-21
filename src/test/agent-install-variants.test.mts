/**
 * The install planner for the PR 13 agents (docs/plans/2026-11-21-all-agents.md,
 * Per-agent tier and install, PR 13): gemini, cursor, copilot, kiro, auggie,
 * junie, goose and cline. Pure: every file read goes through the context.
 *
 * Their configs differ from the PR 12 agents in shape: Gemini, Cursor and
 * Copilot rename the events, Gemini and Auggie take timeouts in ms, Cursor and
 * Copilot list flat handlers with a `version: 1` root, Kiro keeps one `hooks`
 * array of {trigger, action} rows under `version: "v1"`, and Cline runs one
 * script file per hook name with no JSON config. Each spawned check below runs
 * the rendered Cline script with the interpreter Cline uses on this platform.
 *
 * RED first: none of the eight had a planner.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  HOOK_AGENT_IDS,
  type InstallPlan,
  type PlanContext,
  parseHookArgs,
  parseLedger,
  planAgentInstall,
  removeOwnedConfig,
  toLedgerFile,
} from "../lib/agent-install-plans.mjs";
import { resolveDocumentsDir } from "../lib/install-runtime.mjs";

const RT = "/home/u/.claude/instincts/runtime/9.9.9";
const HOME = "/home/u";
const ROOT = "/work/repo";
const MCP = { command: "node", args: [`${RT}/bin/mcp-server.mjs`, "--mode", "expert"] };
const NEW_AGENTS = ["gemini", "cursor", "copilot", "kiro", "auggie", "junie", "goose", "cline"] as const;
const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const roots: string[] = [];

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function ctx(over: Partial<PlanContext> = {}, files: Record<string, string> = {}, dirs: Record<string, string[]> = {}): PlanContext {
  return {
    scope: "project",
    runtimeDir: RT,
    projectRoot: ROOT,
    home: HOME,
    platform: "linux",
    env: {},
    failClosed: false,
    read: (path) => (Object.hasOwn(files, path) ? files[path]! : null),
    listDir: (path) => dirs[path] ?? [],
    documentsDir: () => null,
    ...over,
  };
}

type Json = Record<string, any>;

function ok(plan: InstallPlan): InstallPlan {
  assert.equal(plan.error, undefined, plan.error);
  return plan;
}

function json(plan: InstallPlan, index = 0): Json {
  return JSON.parse(ok(plan).writes[index]!.content) as Json;
}

const cmd = (agent: string, script: string): string => `node "${RT}/${script}.mjs" --agent ${agent}`;

describe("PR 13 agents: ids and flags", () => {
  it("adds the eight agents to the planner, after the PR 12 five", () => {
    assert.deepEqual([...HOOK_AGENT_IDS], ["codex", "qwen", "grok", "devin", "droid", ...NEW_AGENTS]);
  });

  it("takes the PR 12 flag rules: a hook-only id needs --hooks, a rules target with --hooks also keeps its rules file", () => {
    for (const agent of ["kiro", "auggie", "junie", "goose", "cline"]) {
      const parsed = parseHookArgs(["install", "--target", agent]);
      assert.equal(parsed.mode, "error", agent);
      assert.match(parsed.mode === "error" ? parsed.message : "", new RegExp(`${agent} needs --hooks`));
    }
    const parsed = parseHookArgs(["install", "--target", "gemini,cursor,copilot,kiro", "--hooks", "--scope", "user", "--fail-closed"]);
    assert.equal(parsed.mode, "install");
    assert.deepEqual(parsed.mode === "install" ? [parsed.agents, parsed.rulesTargets, parsed.scope, parsed.failClosed] : null,
      [["gemini", "cursor", "copilot", "kiro"], ["gemini", "cursor", "copilot"], "user", true]);
    // Without a new flag, the rules-file install of gemini, cursor and copilot is untouched.
    assert.deepEqual(parseHookArgs(["install", "--target", "gemini,cursor,copilot"]), { mode: "none" });
    const uninstall = parseHookArgs(["--uninstall", "--target", "goose"]);
    assert.deepEqual(uninstall.mode === "uninstall" ? uninstall.agents : null, ["goose"]);
  });

  it("no plan passes --consent or --trust, in either scope, with or without --fail-closed", () => {
    for (const agent of NEW_AGENTS) {
      for (const scope of ["project", "user"] as const) {
        for (const platform of ["linux", "win32"]) {
          const text = JSON.stringify(planAgentInstall(agent, ctx({ scope, platform, failClosed: true })));
          assert.doesNotMatch(text, /--consent|--trust|trusted_hooks/, `${agent} ${scope} ${platform}`);
        }
      }
    }
  });

  it("points every command at the runtime with --agent <id>, and never at the plugin root or the Skill hook", () => {
    for (const agent of NEW_AGENTS.filter((id) => id !== "cline")) {
      const text = ok(planAgentInstall(agent, ctx())).writes.map((write) => write.content).join("\n");
      assert.ok(text.includes(JSON.stringify(cmd(agent, "hooks/gateguard")).slice(1, -1)), agent);
      assert.doesNotMatch(text, /CLAUDE_PLUGIN_ROOT|companion-preference/, agent);
    }
  });
});

describe("gemini", () => {
  it("merges the hooks under Gemini's event names and the MCP server into one settings.json, timeouts in ms", () => {
    const settings = `${ROOT}/.gemini/settings.json`;
    const plan = planAgentInstall("gemini", ctx({}, { [settings]: JSON.stringify({ theme: "x", context: { fileName: "GEMINI.md" } }) }));
    assert.deepEqual(ok(plan).writes.map((write) => write.path), [settings]);
    const root = json(plan);
    assert.equal(root.theme, "x");
    assert.deepEqual(Object.keys(root.hooks), ["BeforeTool", "AfterTool", "BeforeAgent", "SessionStart", "SessionEnd", "AfterAgent"]);
    assert.equal(root.hooks.BeforeTool[0].matcher, "^(run_shell_command|replace|write_file|save_memory)$");
    assert.equal(root.hooks.BeforeTool[1].matcher, "^(run_shell_command)$");
    for (const hook of Object.values(root.hooks as Record<string, Json[]>).flat().flatMap((group) => group.hooks)) {
      assert.deepEqual(Object.keys(hook), ["type", "command", "timeout"]);
      assert.equal(hook.timeout, 30_000);
    }
    assert.deepEqual(root.mcpServers, { "continuous-improvement": MCP });
    assert.deepEqual(plan.runs, []);
    assert.equal(ok(planAgentInstall("gemini", ctx({ scope: "user" }))).writes[0]!.path, `${HOME}/.gemini/settings.json`);
    assert.ok(plan.notes.some((line) => /trust/.test(line)));
  });
});

describe("cursor", () => {
  it("writes version 1 hooks.json with flat handlers under camelCase events, and mcp.json with type stdio", () => {
    const plan = ok(planAgentInstall("cursor", ctx()));
    assert.deepEqual(plan.writes.map((write) => write.path), [`${ROOT}/.cursor/hooks.json`, `${ROOT}/.cursor/mcp.json`]);
    const hooks = json(plan);
    assert.equal(hooks.version, 1);
    assert.deepEqual(Object.keys(hooks.hooks), ["preToolUse", "postToolUse", "beforeSubmitPrompt", "sessionStart", "sessionEnd", "stop"]);
    const pre = hooks.hooks.preToolUse as Json[];
    assert.deepEqual(pre[0], { type: "command", command: cmd("cursor", "hooks/gateguard"), timeout: 30, matcher: "^(Shell|Write|Delete)$" });
    assert.equal(pre[1].matcher, "^(Shell)$");
    assert.deepEqual(hooks.hooks.stop.map((hook: Json) => hook.command), ["three-section-close", "goal-drift-stop", "workflow-distill", "typecheck-stop", "query-cost-nudge"].map((name) => cmd("cursor", `hooks/${name}`)));
    assert.deepEqual(json(plan, 1), { mcpServers: { "continuous-improvement": { type: "stdio", ...MCP } } });
    assert.deepEqual(ok(planAgentInstall("cursor", ctx({ scope: "user" }))).writes.map((write) => write.path), [`${HOME}/.cursor/hooks.json`, `${HOME}/.cursor/mcp.json`]);
  });

  it("sets failClosed on the preToolUse handlers only with --fail-closed", () => {
    const closed = json(planAgentInstall("cursor", ctx({ failClosed: true })));
    for (const [event, handlers] of Object.entries(closed.hooks as Record<string, Json[]>)) {
      for (const handler of handlers) assert.equal(handler.failClosed, event === "preToolUse" ? true : undefined, event);
    }
    assert.ok(!JSON.stringify(json(planAgentInstall("cursor", ctx()))).includes("failClosed"));
  });

  it("merges over an existing hooks.json: foreign handlers kept, an earlier runtime replaced, idempotent", () => {
    const file = `${ROOT}/.cursor/hooks.json`;
    const old = `node "${HOME}/.claude/instincts/runtime/1.0.0/hooks/gateguard.mjs" --agent cursor`;
    const foreign = { command: "./mine.sh", matcher: "Shell" };
    const existing = JSON.stringify({ version: 1, hooks: { preToolUse: [foreign, null, { command: old, matcher: "Shell" }], afterFileEdit: [foreign] } });
    const plan = ok(planAgentInstall("cursor", ctx({}, { [file]: existing })));
    const hooks = json(plan).hooks as Record<string, Json[]>;
    assert.deepEqual(hooks.afterFileEdit, [foreign]);
    assert.deepEqual(hooks.preToolUse!.slice(0, 2), [foreign, null]);
    assert.ok(!JSON.stringify(hooks).includes("runtime/1.0.0"));
    const again = ok(planAgentInstall("cursor", ctx({}, { [file]: plan.writes[0]!.content })));
    assert.equal(again.writes[0]!.content, plan.writes[0]!.content);
    // The uninstall puts the file back as it was.
    const removed = removeOwnedConfig(plan.writes[0]!.content, toLedgerFile(plan.writes[0]!));
    assert.equal(removed.kind, "write");
    assert.deepEqual(JSON.parse(removed.kind === "write" ? removed.content : "{}"), { version: 1, hooks: { preToolUse: [foreign, null], afterFileEdit: [foreign] } });
  });

  it("refuses a hooks.json with another version, or with handlers that are not a list", () => {
    const file = `${ROOT}/.cursor/hooks.json`;
    for (const text of [JSON.stringify({ version: 2, hooks: {} }), JSON.stringify({ version: "1" }), JSON.stringify({ version: 1, hooks: { preToolUse: {} } }), JSON.stringify({ hooks: [] })]) {
      const plan = planAgentInstall("cursor", ctx({}, { [file]: text }));
      assert.match(plan.error ?? "", /\.cursor\/hooks\.json/, text);
      assert.deepEqual(plan.writes, [], text);
    }
  });

  it("warns when Cursor also imports our Claude Code hooks or plugin", () => {
    const claudeHook = JSON.stringify({ hooks: { PostToolUse: [{ hooks: [{ command: `node "${HOME}/.claude/instincts/bin/observe.mjs"` }] }] } });
    assert.ok(planAgentInstall("cursor", ctx({}, { [`${HOME}/.claude/settings.json`]: claudeHook })).warnings.some((line) => /twice/.test(line)));
    const plugin = planAgentInstall("cursor", ctx({}, {}, { [`${HOME}/.claude/plugins`]: ["continuous-improvement@x"] }));
    assert.ok(plugin.warnings.some((line) => /plugin/.test(line) && /twice/.test(line)));
  });
});

describe("copilot", () => {
  it("writes its own version 1 hooks file with camelCase events, timeoutSec and a plain name list", () => {
    const plan = ok(planAgentInstall("copilot", ctx()));
    assert.deepEqual(plan.writes.map((write) => write.path), [`${ROOT}/.github/hooks/continuous-improvement.json`, `${ROOT}/.github/mcp.json`]);
    const hooks = json(plan);
    assert.equal(hooks.version, 1);
    assert.deepEqual(Object.keys(hooks.hooks), ["preToolUse", "postToolUse", "sessionStart", "agentStop"]);
    const pre = hooks.hooks.preToolUse as Json[];
    assert.deepEqual(Object.keys(pre[0]!), ["type", "command", "timeoutSec", "matcher"]);
    assert.equal(pre[0]!.timeoutSec, 30);
    assert.equal(pre[0]!.matcher, "Bash|bash|powershell|edit|str_replace_editor|apply_patch|create");
    assert.equal(pre[1]!.matcher, "Bash|bash|powershell");
    assert.deepEqual(json(plan, 1), { mcpServers: { "continuous-improvement": { type: "local", ...MCP } } });
    assert.deepEqual(plan.runs, []);
  });

  it("user scope: $COPILOT_HOME or ~/.copilot hooks, and `copilot mcp add` as a run with its undo", () => {
    const plan = ok(planAgentInstall("copilot", ctx({ scope: "user" })));
    assert.deepEqual(plan.writes.map((write) => write.path), [`${HOME}/.copilot/hooks/continuous-improvement.json`]);
    assert.deepEqual(plan.runs, [{ argv: ["copilot", "mcp", "add", "continuous-improvement", "--", "node", ...MCP.args], undo: ["copilot", "mcp", "remove", "continuous-improvement"] }]);
    assert.equal(ok(planAgentInstall("copilot", ctx({ scope: "user", env: { COPILOT_HOME: "/c" } }))).writes[0]!.path, "/c/hooks/continuous-improvement.json");
  });

  it("warns when the repository's .claude/settings.json carries our hooks, which Copilot also reads", () => {
    const claudeHook = JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: "node \"/x/continuous-improvement/hooks/goal-drift-stop.mjs\"" }] }] } });
    assert.equal(planAgentInstall("copilot", ctx({}, { [`${ROOT}/.claude/settings.json`]: claudeHook })).warnings.length, 1);
    assert.equal(planAgentInstall("copilot", ctx({}, { [`${HOME}/.claude/settings.json`]: claudeHook })).warnings.length, 0, "Copilot does not read ~/.claude");
  });
});

describe("kiro", () => {
  it("writes a version v1 hooks array of {name, trigger, matcher, action, timeout, enabled} rows and the MCP server in settings/mcp.json", () => {
    const plan = ok(planAgentInstall("kiro", ctx()));
    assert.deepEqual(plan.writes.map((write) => write.path), [`${ROOT}/.kiro/hooks/continuous-improvement.json`, `${ROOT}/.kiro/settings/mcp.json`]);
    const file = json(plan);
    assert.equal(file.version, "v1");
    assert.ok(Array.isArray(file.hooks));
    assert.deepEqual([...new Set((file.hooks as Json[]).map((row) => row.trigger))], ["PreToolUse", "PostToolUse", "UserPromptSubmit", "SessionStart", "Stop"]);
    const gate = (file.hooks as Json[])[0]!;
    assert.deepEqual(gate, {
      name: "continuous-improvement gateguard PreToolUse",
      trigger: "PreToolUse",
      matcher: "^(execute_bash|execute_pwsh|execute_cmd|shell|fs_write|fs_append|str_replace|delete_file|write)$",
      action: { type: "command", command: cmd("kiro", "hooks/gateguard") },
      timeout: 30,
      enabled: true,
    });
    for (const row of (file.hooks as Json[]).filter((entry) => entry.trigger !== "PreToolUse")) assert.equal(row.matcher, undefined, row.name);
    assert.equal(new Set((file.hooks as Json[]).map((row) => row.name)).size, (file.hooks as Json[]).length, "names are unique");
    assert.deepEqual(json(plan, 1), { mcpServers: { "continuous-improvement": MCP } });
    const user = ok(planAgentInstall("kiro", ctx({ scope: "user", env: { KIRO_HOME: "/k" } })));
    assert.deepEqual(user.writes.map((write) => write.path), ["/k/hooks/continuous-improvement.json", "/k/settings/mcp.json"]);
    assert.equal(ok(planAgentInstall("kiro", ctx({ scope: "user" }))).writes[0]!.path, `${HOME}/.kiro/hooks/continuous-improvement.json`);
  });

  it("keeps foreign rows, replaces ours, and the uninstall takes out exactly ours", () => {
    const file = `${ROOT}/.kiro/hooks/continuous-improvement.json`;
    const foreign = { name: "mine", trigger: "Stop", action: { type: "command", command: "echo hi" } };
    const old = { name: "x", trigger: "PreToolUse", action: { type: "command", command: `node "${HOME}/.claude/instincts/runtime/1.0.0/hooks/gateguard.mjs" --agent kiro` } };
    const plan = ok(planAgentInstall("kiro", ctx({}, { [file]: JSON.stringify({ version: "v1", hooks: [foreign, "junk", old] }) })));
    const rows = json(plan).hooks as unknown[];
    assert.deepEqual(rows.slice(0, 2), [foreign, "junk"]);
    assert.ok(!JSON.stringify(rows).includes("runtime/1.0.0"));
    const removed = removeOwnedConfig(plan.writes[0]!.content, toLedgerFile(plan.writes[0]!));
    assert.deepEqual(JSON.parse(removed.kind === "write" ? removed.content : "{}"), { version: "v1", hooks: [foreign, "junk"] });
    for (const text of [JSON.stringify({ version: "v2", hooks: [] }), JSON.stringify({ version: "v1", hooks: {} })]) {
      assert.match(planAgentInstall("kiro", ctx({}, { [file]: text })).error ?? "", /continuous-improvement\.json/, text);
    }
    const created = ok(planAgentInstall("kiro", ctx()));
    assert.deepEqual(removeOwnedConfig(created.writes[0]!.content, toLedgerFile(created.writes[0]!)), { kind: "delete" });
  });
});

describe("auggie", () => {
  it("wires only the guard and observer (the rest runs in the background), timeouts in ms, MCP in the user settings", () => {
    const plan = ok(planAgentInstall("auggie", ctx({ scope: "user" })));
    assert.deepEqual(plan.writes.map((write) => write.path), [`${HOME}/.augment/settings.json`]);
    const root = json(plan);
    assert.deepEqual(Object.keys(root.hooks), ["PreToolUse", "PostToolUse"]);
    assert.equal(root.hooks.PreToolUse[0].matcher, "^(bash|launch-process|edit|write|str-replace-editor|save-file)$");
    assert.equal(root.hooks.PreToolUse[0].hooks[0].timeout, 30_000);
    assert.deepEqual(root.mcpServers, { "continuous-improvement": MCP });
    const project = ok(planAgentInstall("auggie", ctx()));
    assert.deepEqual(project.writes.map((write) => write.path), [`${ROOT}/.augment/settings.json`]);
    assert.equal(json(project).mcpServers, undefined);
    assert.ok(project.printed.some((line) => line.includes("auggie mcp add") && line.includes("--project")));
    assert.ok(project.notes.some((line) => /ci lessons --format auggie/.test(line)));
  });
});

describe("junie", () => {
  it("merges hooks into config.json with blockOnError under --fail-closed, and the MCP server into mcp/mcp.json", () => {
    const plan = ok(planAgentInstall("junie", ctx({ scope: "user", failClosed: true })));
    assert.deepEqual(plan.writes.map((write) => write.path), [`${HOME}/.junie/config.json`, `${HOME}/.junie/mcp/mcp.json`]);
    const root = json(plan);
    assert.deepEqual(Object.keys(root.hooks), ["PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop"]);
    assert.equal(root.hooks.PreToolUse[0].matcher, "^(Bash|powershell|Write|Edit|apply_patch)$");
    for (const [event, groups] of Object.entries(root.hooks as Record<string, Json[]>)) {
      for (const hook of groups.flatMap((group) => group.hooks)) assert.equal(hook.blockOnError, event === "PreToolUse" ? true : undefined, event);
    }
    assert.deepEqual(json(plan, 1), { mcpServers: { "continuous-improvement": MCP } });
    const project = ok(planAgentInstall("junie", ctx()));
    assert.deepEqual(project.writes.map((write) => write.path), [`${ROOT}/.junie/config.json`, `${ROOT}/.junie/mcp/mcp.json`]);
    assert.ok(project.notes.some((line) => line.includes("--config-location")));
  });
});

describe("goose", () => {
  it("writes a hook-only plugin under .agents/plugins, on_failure block under --fail-closed, and prints the config.yaml extension", () => {
    const plan = ok(planAgentInstall("goose", ctx({ failClosed: true })));
    assert.deepEqual(plan.writes.map((write) => write.path), [`${ROOT}/.agents/plugins/continuous-improvement/hooks/hooks.json`]);
    const root = json(plan);
    assert.deepEqual(Object.keys(root), ["hooks"]);
    assert.deepEqual(Object.keys(root.hooks), ["PreToolUse", "PostToolUse", "Stop"]);
    assert.equal(root.hooks.PreToolUse[0].matcher, "^(shell|write|edit)$");
    assert.equal(root.hooks.PreToolUse[0].hooks[0].on_failure, "block");
    assert.equal(root.hooks.Stop[0].hooks[0].on_failure, undefined);
    assert.ok(plan.printed.some((line) => line.includes("extensions:") && line.includes("type: stdio") && line.includes(`${RT}/bin/mcp-server.mjs`)));
    assert.ok(plan.printed.some((line) => line.includes(`${HOME}/.config/goose/config.yaml`)));
    assert.ok(planAgentInstall("goose", ctx({ platform: "win32", env: { APPDATA: "C:\\Users\\u\\AppData\\Roaming" } })).printed.some((line) => line.includes("C:/Users/u/AppData/Roaming/Block/goose/config/config.yaml")));
    assert.equal(ok(planAgentInstall("goose", ctx({ scope: "user" }))).writes[0]!.path, `${HOME}/.agents/plugins/continuous-improvement/hooks/hooks.json`);
    assert.ok(!plan.writes.some((write) => write.path.endsWith(".md")), "no .md file Junie would read as a subagent");
  });
});

describe("cline", () => {
  it("writes exactly one PreToolUse script for the platform: an executable sh file, or PreToolUse.ps1 on win32", () => {
    const linux = ok(planAgentInstall("cline", ctx()));
    assert.deepEqual(linux.writes.map((write) => write.path), [`${ROOT}/.clinerules/hooks/PreToolUse`]);
    assert.equal(linux.writes[0]!.mode, 0o755);
    assert.match(linux.writes[0]!.content, /^#!\/bin\/sh\n/);
    const win = ok(planAgentInstall("cline", ctx({ platform: "win32" })));
    assert.deepEqual(win.writes.map((write) => write.path), [`${ROOT}/.clinerules/hooks/PreToolUse.ps1`]);
    assert.equal(win.writes[0]!.mode, undefined);
    for (const write of [linux.writes[0]!, win.writes[0]!]) {
      for (const hook of ["gateguard", "hook-pack", "config-guard"]) assert.ok(write.content.includes(`${RT}/hooks/${hook}.mjs`), hook);
      assert.doesNotMatch(write.content, /companion-preference|observe\.mjs|CLAUDE_PLUGIN_ROOT/);
      assert.match(write.content, /--agent\W+cline/);
    }
    assert.equal(ok(planAgentInstall("cline", ctx({ scope: "user" }))).writes[0]!.path, `${HOME}/Documents/Cline/Hooks/PreToolUse`);
    assert.ok(linux.printed.some((line) => line.includes("cline_mcp_settings.json") || line.includes("cline mcp add")));
    assert.deepEqual(linux.runs, []);
    const user = ok(planAgentInstall("cline", ctx({ scope: "user" })));
    assert.deepEqual(user.runs, [{ argv: ["cline", "mcp", "add", "continuous-improvement", "--yes", "--", "node", ...MCP.args], undo: ["cline", "mcp", "remove", "continuous-improvement"] }]);
  });

  it("refuses a hook file of the same name it did not write, and replaces its own", () => {
    const path = `${ROOT}/.clinerules/hooks/PreToolUse`;
    const foreign = planAgentInstall("cline", ctx({}, { [path]: "#!/bin/sh\necho mine\n" }));
    assert.match(foreign.error ?? "", /PreToolUse/);
    assert.deepEqual(foreign.writes, []);
    const first = ok(planAgentInstall("cline", ctx({ runtimeDir: `${HOME}/.claude/instincts/runtime/1.0.0` })));
    const again = ok(planAgentInstall("cline", ctx({}, { [path]: first.writes[0]!.content })));
    assert.equal(again.writes[0]!.created, false);
    assert.ok(again.writes[0]!.content.includes(RT));
  });

  it("the uninstall deletes the script it wrote, and refuses one that was edited since", () => {
    const write = ok(planAgentInstall("cline", ctx())).writes[0]!;
    const file = toLedgerFile(write);
    assert.deepEqual(removeOwnedConfig(write.content, file), { kind: "delete" });
    assert.deepEqual(removeOwnedConfig(null, file), { kind: "missing" });
    assert.equal(removeOwnedConfig(`${write.content}echo extra\n`, file).kind, "error");
    // The ledger round-trips the new file fields and refuses a malformed one.
    const ledger = { version: 1, entries: [{ target: "cline", scope: "project", project: ROOT, version: "9.9.9", runtime: RT, installedAt: "x", files: [file], runs: [] }] };
    assert.deepEqual(parseLedger(JSON.stringify(ledger))!.entries[0]!.files[0], file);
    for (const bad of [{ ...file, script: { sha256: 1 } }, { ...file, script: "x" }, { ...file, layout: "tree" }]) {
      assert.equal(parseLedger(JSON.stringify({ ...ledger, entries: [{ ...ledger.entries[0], files: [bad] }] })), null, JSON.stringify(bad));
    }
  });
});

// The VS Code extension's global hooks dir is join(getDocumentsPath(), "Cline",
// "Hooks"), and on Windows getDocumentsPath() follows OneDrive Known Folder
// Move, so %USERPROFILE%\Documents is not where it looks; the SDK's hooks
// lookup (resolveHooksConfigSearchPaths: Documents/Cline/Hooks and
// ~/.cline/hooks) has no OneDrive candidate (skeptic verdict, hook_pre_tool).
describe("cline user scope: the Documents folder", () => {
  const WIN_HOME = "C:/Users/u";
  const winUser = (documentsDir: () => string | null) => planAgentInstall("cline", ctx({ scope: "user", platform: "win32", home: WIN_HOME, documentsDir }));

  it("on win32 writes into the Documents folder Windows reports, a OneDrive-redirected one included, and says the CLI may miss it", () => {
    const plan = ok(winUser(() => "C:\\Users\\u\\OneDrive\\Documents"));
    assert.deepEqual(plan.writes.map((write) => write.path), ["C:/Users/u/OneDrive/Documents/Cline/Hooks/PreToolUse.ps1"]);
    const note = plan.notes.find((line) => line.includes("OneDrive")) ?? "";
    assert.ok(note.includes("C:/Users/u/OneDrive/Documents"), note);
    assert.match(note, /--scope project/);
  });

  it("on win32 an unredirected Documents folder (other slashes and case) gets no redirect note", () => {
    const plan = ok(winUser(() => "c:\\users\\u\\Documents\\"));
    assert.deepEqual(plan.writes.map((write) => write.path), ["c:/users/u/Documents/Cline/Hooks/PreToolUse.ps1"]);
    assert.ok(!plan.notes.some((line) => /OneDrive|redirect|by hand/i.test(line)), plan.notes.join("\n"));
  });

  it("on win32 an unresolved, empty, relative or multi-line Documents path falls back to ~/Documents and says to copy the script by hand", () => {
    for (const value of [null, "", "   ", "Documents", "C:\\Users\\u\\Documents\nC:\\Other", "\\\\?\\"]) {
      const plan = ok(winUser(() => value));
      assert.deepEqual(plan.writes.map((write) => write.path), [`${WIN_HOME}/Documents/Cline/Hooks/PreToolUse.ps1`], JSON.stringify(value));
      assert.ok(plan.notes.some((line) => /by hand/.test(line) && line.includes("PreToolUse.ps1")), `${JSON.stringify(value)}: ${plan.notes.join("\n")}`);
    }
  });

  it("asks for the Documents folder only on win32 at user scope", () => {
    const never = (): string | null => {
      throw new Error("documentsDir must not be called");
    };
    assert.equal(ok(planAgentInstall("cline", ctx({ scope: "user", documentsDir: never }))).writes[0]!.path, `${HOME}/Documents/Cline/Hooks/PreToolUse`);
    assert.equal(ok(planAgentInstall("cline", ctx({ platform: "win32", documentsDir: never }))).writes[0]!.path, `${ROOT}/.clinerules/hooks/PreToolUse.ps1`);
    assert.equal(ok(planAgentInstall("codex", ctx({ scope: "user", platform: "win32", documentsDir: never }))).error, undefined);
  });

  it("the user-scope note says the extension and the CLI both read Documents/Cline/Hooks, and only the CLI reads ~/.cline/hooks", () => {
    for (const plan of [ok(planAgentInstall("cline", ctx({ scope: "user" }))), ok(winUser(() => "C:\\Users\\u\\Documents"))]) {
      const notes = plan.notes.join("\n");
      assert.doesNotMatch(notes, /not ~\/Documents/);
      assert.match(notes, /VS Code extension and the Cline CLI both read user hooks from .*Documents\/Cline\/Hooks/);
      assert.match(notes, /only the CLI also reads ~\/\.cline\/hooks/);
    }
    assert.ok(!ok(planAgentInstall("cline", ctx())).notes.some((line) => line.includes("~/.cline/hooks")));
  });
});

describe("resolveDocumentsDir", () => {
  it("returns null off Windows without starting a process", () => {
    for (const platform of ["linux", "darwin", "freebsd"]) assert.equal(resolveDocumentsDir(platform), null);
  });

  it("on Windows returns the absolute Documents folder Windows reports", { skip: process.platform !== "win32" }, () => {
    const dir = resolveDocumentsDir("win32");
    assert.ok(dir !== null && /^[A-Za-z]:[\\/]/.test(dir) && !/[\r\n]/.test(dir), String(dir));
    assert.equal(statSync(dir).isDirectory(), true);
  });
});

// The script Cline would run, run the way Cline runs it on this platform.
function runClineScript(content: string, input: string, env: NodeJS.ProcessEnv = process.env): { status: number | null; stdout: string; stderr: string } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ci-cline-hook-")));
  roots.push(dir);
  const win = process.platform === "win32";
  const file = join(dir, win ? "PreToolUse.ps1" : "PreToolUse");
  writeFileSync(file, content, { mode: 0o755 });
  const [exe, args] = win ? ["powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file]] : ["sh", [file]];
  const result = spawnSync(exe, args as string[], { input, encoding: "utf8", env, timeout: 60_000 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("cline: the rendered script, spawned", () => {
  it("passes the same stdin to each hook in turn and answers with the first reply, leaving later hooks unrun", () => {
    const rt = realpathSync(mkdtempSync(join(tmpdir(), "ci-cline-rt-")));
    roots.push(rt);
    mkdirSync(join(rt, "hooks"), { recursive: true });
    const seen = join(rt, "seen.txt");
    // gateguard allows (prints nothing), hook-pack replies, config-guard must not run.
    writeFileSync(join(rt, "hooks", "gateguard.mjs"), `import { appendFileSync, readFileSync } from "node:fs"; appendFileSync(${JSON.stringify(seen)}, "gateguard:" + readFileSync(0, "utf8").trim() + "|" + process.argv.slice(2).join(" ") + "\\n");\n`);
    writeFileSync(join(rt, "hooks", "hook-pack.mjs"), `import { readFileSync } from "node:fs"; const input = JSON.parse(readFileSync(0, "utf8")); process.stdout.write(JSON.stringify({ cancel: true, errorMessage: "saw " + input.note }) + "\\n");\n`);
    writeFileSync(join(rt, "hooks", "config-guard.mjs"), `import { appendFileSync } from "node:fs"; appendFileSync(${JSON.stringify(seen)}, "config-guard ran\\n");\n`);
    const plan = ok(planAgentInstall("cline", ctx({ runtimeDir: rt, platform: process.platform })));
    const input = JSON.stringify({ note: "café ü" });
    const out = runClineScript(plan.writes[0]!.content, input);
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(JSON.parse(out.stdout), { cancel: true, errorMessage: "saw café ü" });
    assert.equal(readFileSync(seen, "utf8").trim(), `gateguard:${input}|--agent cline`);
  });

  it("with the real hooks, a destructive command in a Cline payload gets {cancel: true}, and a harmless one gets no reply", () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "ci-cline-home-")));
    roots.push(home);
    const plan = ok(planAgentInstall("cline", ctx({ runtimeDir: REPO_ROOT, platform: process.platform })));
    const payload = (command: string): string => JSON.stringify({
      clineVersion: "4.1.27", hookName: "PreToolUse", timestamp: "1763712000000", workspaceRoots: [home], taskId: "t",
      preToolUse: { toolName: "run_commands", parameters: { commands: JSON.stringify([command]) } },
    });
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, CI_INSTINCTS_HOME: join(home, "instincts") };
    delete env.CLAUDE_PROJECT_DIR;
    const denied = runClineScript(plan.writes[0]!.content, payload(["git", "push", "--force", "origin", "main"].join(" ")), env);
    assert.equal(denied.status, 0, denied.stderr);
    assert.equal((JSON.parse(denied.stdout) as Json).cancel, true, denied.stdout);
    const allowed = runClineScript(plan.writes[0]!.content, payload("git status"), env);
    assert.equal(allowed.stdout.trim(), "", allowed.stderr);
  });
});
