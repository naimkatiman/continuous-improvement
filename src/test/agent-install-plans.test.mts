/**
 * The install planner for the agents with a native hook config
 * (docs/plans/2026-11-21-all-agents.md, Architecture item 12, PR 12): codex,
 * qwen, grok, devin and droid. Pure: every file read goes through the context,
 * so each plan is checked without a temp dir.
 *
 * RED first: lib/agent-install-plans.mjs does not exist.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  HOOK_AGENT_IDS,
  type InstallPlan,
  type LedgerEntry,
  type PlanContext,
  emptyLedger,
  parseHookArgs,
  parseInstallScope,
  parseLedger,
  planAgentInstall,
  recordInstall,
  removeOwnedConfig,
  renderAgentHooks,
  resolveHookAgent,
  runtimesInUse,
} from "../lib/agent-install-plans.mjs";

const RT = "/home/u/.claude/instincts/runtime/9.9.9";
const HOME = "/home/u";
const ROOT = "/work/repo";

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
    ...over,
  };
}

function only(plan: InstallPlan): { path: string; json: Record<string, unknown> } {
  assert.equal(plan.error, undefined, plan.error);
  assert.equal(plan.writes.length >= 1, true);
  const write = plan.writes[0]!;
  return { path: write.path, json: JSON.parse(write.content) as Record<string, unknown> };
}

type Group = { matcher?: string; hooks: Array<Record<string, unknown>> };
type Hooks = Record<string, Group[]>;

function commands(hooks: Hooks): string[] {
  // A malformed row (null, no hooks list) has no command.
  return Object.values(hooks).flatMap((groups) => groups.flatMap((group) => (Array.isArray(group?.hooks) ? group.hooks.map((hook) => String(hook.command)) : [])));
}

describe("hook agents and scopes", () => {
  it("names the five planner agents, maps windsurf to devin and rejects anything else", () => {
    assert.deepEqual([...HOOK_AGENT_IDS], ["codex", "qwen", "grok", "devin", "droid"]);
    assert.equal(resolveHookAgent("windsurf"), "devin");
    assert.equal(resolveHookAgent("devin"), "devin");
    for (const bad of ["", "claude", "gemini", "Codex", "unknown", "codex "]) assert.equal(resolveHookAgent(bad), null, bad);
  });

  it("takes only the exact lowercase scopes", () => {
    assert.equal(parseInstallScope("project"), "project");
    assert.equal(parseInstallScope("user"), "user");
    for (const bad of [undefined, null, "", "User", "global", " user", 1]) assert.equal(parseInstallScope(bad), null, String(bad));
  });

  it("throws for an agent with no planner", () => {
    assert.throws(() => planAgentInstall("gemini", ctx()), /no hook planner/);
    assert.throws(() => planAgentInstall("unknown", ctx()), /no hook planner/);
  });
});

describe("parseHookArgs", () => {
  it("leaves every invocation without a new flag to the existing installer", () => {
    for (const args of [[], ["install"], ["install", "--target", "codex"], ["--uninstall"], ["install", "--mode", "expert"], ["--uninstall", "--target", "claude"], ["--uninstall", "--target", "gemini,cursor"]]) {
      assert.deepEqual(parseHookArgs(args), { mode: "none" }, args.join(" "));
    }
  });

  it("parses an install with the defaults: project scope, no dry run, no runs, vendor fail behaviour", () => {
    assert.deepEqual(parseHookArgs(["install", "--target", "codex,Windsurf, qwen,codex", "--hooks"]), {
      mode: "install", agents: ["codex", "devin", "qwen"], rulesTargets: ["codex", "windsurf"], scope: "project",
      scopeGiven: false, dryRun: false, run: false, failClosed: false,
    });
    const parsed = parseHookArgs(["install", "--target=droid", "--hooks", "--scope=user", "--dry-run", "--run", "--fail-closed"]);
    assert.equal(parsed.mode, "install");
    assert.deepEqual(parsed.mode === "install" ? [parsed.agents, parsed.scope, parsed.dryRun, parsed.run, parsed.failClosed] : null, [["droid"], "user", true, true, true]);
  });

  it("parses --uninstall --target for a hook agent", () => {
    const parsed = parseHookArgs(["--uninstall", "--target", "grok", "--scope", "user"]);
    assert.equal(parsed.mode, "uninstall");
    assert.deepEqual(parsed.mode === "uninstall" ? [parsed.agents, parsed.scope] : null, [["grok"], "user"]);
  });

  it("refuses a malformed or incomplete request", () => {
    const cases: Array<[string[], RegExp]> = [
      [["install", "--hooks"], /--target/],
      [["install", "--target", "--hooks"], /--target/],
      [["install", "--target", "", "--hooks"], /--target/],
      [["install", "--target", "codex", "--hooks", "--scope"], /--scope/],
      [["install", "--target", "codex", "--hooks", "--scope", "User"], /--scope/],
      [["install", "--target", "codex", "--hooks", "--scope="], /--scope/],
      [["install", "--target", "codex", "--dry-run"], /needs --hooks/],
      [["install", "--target", "codex", "--scope", "user"], /needs --hooks/],
      [["install", "--target", "codex", "--run"], /needs --hooks/],
      [["install", "--target", "codex", "--fail-closed"], /needs --hooks/],
      [["install", "--target", "qwen"], /needs --hooks/],
      [["install", "--target", "gemini", "--hooks"], /gemini/],
      [["install", "--target", "claude,codex", "--hooks"], /claude/],
      [["install", "--target", "mystery", "--hooks"], /mystery/],
    ];
    for (const [args, message] of cases) {
      const parsed = parseHookArgs(args);
      assert.equal(parsed.mode, "error", args.join(" "));
      assert.match(parsed.mode === "error" ? parsed.message : "", message, args.join(" "));
    }
  });
});

describe("renderAgentHooks", () => {
  it("points every command at the runtime with --agent, drops the Claude-only Skill hook, and never names the plugin root", () => {
    for (const agent of HOOK_AGENT_IDS) {
      const all = commands(renderAgentHooks(agent, "C:\\Users\\u\\.claude\\instincts\\runtime\\9.9.9", false) as Hooks);
      assert.ok(all.length > 0, agent);
      for (const command of all) {
        assert.match(command, new RegExp(`^node "C:/Users/u/\\.claude/instincts/runtime/9\\.9\\.9/(hooks|bin)/[a-z-]+\\.mjs" --agent ${agent}$`), command);
        assert.doesNotMatch(command, /CLAUDE_PLUGIN_ROOT|companion-preference/);
      }
      assert.ok(all.some((command) => command.includes("/hooks/gateguard.mjs")), agent);
      assert.ok(all.some((command) => command.includes("/bin/observe.mjs")), agent);
    }
  });

  it("renders each agent's events and native matchers from the plugin table crossed with its profile", () => {
    const codex = renderAgentHooks("codex", RT, false) as Hooks;
    assert.deepEqual(Object.keys(codex), ["PreToolUse", "PostToolUse", "UserPromptSubmit", "SessionStart", "Stop"]);
    assert.deepEqual(codex.PreToolUse!.map((group) => group.matcher), ["^(Bash|apply_patch|exec_command)$", "^(Bash|exec_command)$", "^(Bash|apply_patch|exec_command)$"]);
    assert.equal(codex.PostToolUse![0]!.matcher, undefined);
    assert.equal(codex.Stop![0]!.hooks.length, 5);

    const qwen = renderAgentHooks("qwen", RT, false) as Hooks;
    assert.deepEqual(Object.keys(qwen), ["PreToolUse", "PostToolUse", "UserPromptSubmit", "SessionStart", "SessionEnd", "Stop"]);
    assert.equal(qwen.PreToolUse![0]!.matcher, "run_shell_command|monitor|edit|write_file|notebook_edit");
    assert.equal(qwen.PreToolUse![1]!.matcher, "run_shell_command|monitor");

    const grok = renderAgentHooks("grok", RT, false) as Hooks;
    assert.deepEqual(Object.keys(grok), ["PreToolUse", "PostToolUse", "Stop"]);
    for (const group of grok.PreToolUse!) assert.match(group.matcher!, /^[A-Za-z0-9_|-]+$/, "Grok reads only a plain name list as exact");
    assert.equal(grok.PreToolUse![1]!.matcher, "run_terminal_command|run_terminal_cmd|Shell");

    const devin = renderAgentHooks("devin", RT, false) as Hooks;
    assert.deepEqual(Object.keys(devin), ["PreToolUse", "PostToolUse", "UserPromptSubmit", "SessionStart", "SessionEnd", "Stop"]);
    assert.equal(devin.PreToolUse![1]!.matcher, "^(exec|shell_command)$");

    const droid = renderAgentHooks("droid", RT, false) as Hooks;
    assert.equal(droid.PreToolUse![0]!.matcher, "Execute|Edit|Create|ApplyPatch");
    assert.equal(droid.PreToolUse![1]!.matcher, "Execute");
  });

  it("sets the vendor fail-closed field on the PreToolUse handlers only, and only with --fail-closed", () => {
    const field: Record<string, [string, unknown] | null> = {
      codex: null, qwen: null, grok: ["failClosed", true], devin: ["fail_closed", true], droid: ["onFailure", "block"],
    };
    for (const agent of HOOK_AGENT_IDS) {
      const open = renderAgentHooks(agent, RT, false) as Hooks;
      const closed = renderAgentHooks(agent, RT, true) as Hooks;
      for (const hook of Object.values(open).flat().flatMap((group) => group.hooks)) {
        assert.deepEqual(Object.keys(hook), ["type", "command", "timeout"], agent);
        assert.equal(hook.timeout, 30);
      }
      for (const [event, groups] of Object.entries(closed)) {
        for (const hook of groups.flatMap((group) => group.hooks)) {
          const expected = field[agent];
          if (event === "PreToolUse" && expected) assert.equal(hook[expected[0]], expected[1], `${agent} ${event}`);
          else assert.deepEqual(Object.keys(hook), ["type", "command", "timeout"], `${agent} ${event}`);
        }
      }
    }
  });
});

describe("planAgentInstall: where each agent's config goes", () => {
  it("codex project: .codex/hooks.json, the MCP server as a printed config.toml snippet, the /hooks trust step printed", () => {
    const plan = planAgentInstall("codex", ctx());
    const { path, json } = only(plan);
    assert.equal(path, `${ROOT}/.codex/hooks.json`);
    assert.deepEqual(Object.keys(json), ["hooks"]);
    assert.deepEqual(plan.runs, []);
    assert.ok(plan.printed.some((line) => line.includes("[mcp_servers.continuous-improvement]") && line.includes(`${RT}/bin/mcp-server.mjs`)));
    assert.ok(plan.notes.some((line) => line.includes("/hooks")));
  });

  it("codex user: $CODEX_HOME or ~/.codex, and `codex mcp add` as a run with its undo", () => {
    const plan = planAgentInstall("codex", ctx({ scope: "user" }));
    assert.equal(only(plan).path, `${HOME}/.codex/hooks.json`);
    assert.deepEqual(plan.runs, [{
      argv: ["codex", "mcp", "add", "continuous-improvement", "--", "node", `${RT}/bin/mcp-server.mjs`, "--mode", "expert"],
      undo: ["codex", "mcp", "remove", "continuous-improvement"],
    }]);
    assert.equal(only(planAgentInstall("codex", ctx({ scope: "user", env: { CODEX_HOME: "/opt/codex" } }))).path, "/opt/codex/hooks.json");
    assert.equal(only(planAgentInstall("codex", ctx({ scope: "user", env: { CODEX_HOME: "rel/codex" } }))).path, `${HOME}/.codex/hooks.json`);
  });

  it("no plan passes --consent or --trust, or writes Codex hook trust", () => {
    for (const agent of HOOK_AGENT_IDS) {
      for (const scope of ["project", "user"] as const) {
        const plan = planAgentInstall(agent, ctx({ scope, failClosed: true }));
        const text = JSON.stringify(plan);
        assert.doesNotMatch(text, /--consent|--trust|hooks\.state|trusted_hash/, `${agent} ${scope}`);
      }
    }
  });

  it("qwen: hooks and mcpServers merged into settings.json, foreign settings kept, no vendor run", () => {
    const settings = `${ROOT}/.qwen/settings.json`;
    const plan = planAgentInstall("qwen", ctx({}, { [settings]: JSON.stringify({ theme: "dark", mcpServers: { other: { command: "x" } } }) }));
    const { path, json } = only(plan);
    assert.equal(path, settings);
    assert.equal(json.theme, "dark");
    assert.deepEqual(json.mcpServers, {
      other: { command: "x" },
      "continuous-improvement": { command: "node", args: [`${RT}/bin/mcp-server.mjs`, "--mode", "expert"] },
    });
    assert.deepEqual(plan.runs, []);
    assert.equal(plan.writes[0]!.created, false);
    assert.equal(only(planAgentInstall("qwen", ctx({ scope: "user" }))).path, `${HOME}/.qwen/settings.json`);
  });

  it("grok: its own hooks file, `grok mcp add --scope`, and the Claude double-firing warning", () => {
    const plan = planAgentInstall("grok", ctx());
    assert.equal(only(plan).path, `${ROOT}/.grok/hooks/continuous-improvement.json`);
    assert.deepEqual(plan.runs[0]!.argv, ["grok", "mcp", "add", "continuous-improvement", "--scope", "project", "--", "node", `${RT}/bin/mcp-server.mjs`, "--mode", "expert"]);
    assert.equal(only(planAgentInstall("grok", ctx({ scope: "user", env: { GROK_HOME: "/g" } }))).path, "/g/hooks/continuous-improvement.json");
    assert.deepEqual(plan.warnings, []);
    const claudeHook = JSON.stringify({ hooks: { PostToolUse: [{ hooks: [{ type: "command", command: `node "${HOME}/.claude/instincts/bin/observe.mjs"` }] }] } });
    const warned = planAgentInstall("grok", ctx({}, { [`${HOME}/.claude/settings.json`]: claudeHook }));
    assert.ok(warned.warnings.some((line) => line.includes(`${HOME}/.claude/settings.json`) && /twice/.test(line)));
    const plugin = planAgentInstall("grok", ctx({}, {}, { [`${HOME}/.claude/plugins`]: ["marketplaces"], [`${HOME}/.claude/plugins/marketplaces`]: ["continuous-improvement"] }));
    assert.ok(plugin.warnings.some((line) => /plugin/.test(line) && /twice/.test(line)));
  });

  it("devin: .devin/hooks.v1.json with no wrapper, the user hooks key in config.json per platform, `devin mcp add -s`", () => {
    const plan = planAgentInstall("devin", ctx());
    const { path, json } = only(plan);
    assert.equal(path, `${ROOT}/.devin/hooks.v1.json`);
    assert.ok(Array.isArray(json.PreToolUse));
    assert.deepEqual(plan.runs[0]!.argv.slice(0, 6), ["devin", "mcp", "add", "continuous-improvement", "-s", "project"]);
    assert.equal(only(planAgentInstall("devin", ctx({ scope: "user" }))).path, `${HOME}/.config/devin/config.json`);
    const win = only(planAgentInstall("devin", ctx({ scope: "user", platform: "win32", env: { APPDATA: "/u/AppData/Roaming" } })));
    assert.equal(win.path, "/u/AppData/Roaming/devin/config.json");
    assert.deepEqual(Object.keys(win.json), ["hooks"]);
    const claudeHook = JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: "node \"/x/continuous-improvement/hooks/goal-drift-stop.mjs\"" }] }] } });
    assert.ok(planAgentInstall("devin", ctx({}, { [`${ROOT}/.claude/settings.json`]: claudeHook })).warnings.length === 1);
  });

  it("droid: hooks.json keyed by event, the MCP server in mcp.json", () => {
    const plan = planAgentInstall("droid", ctx({ scope: "user" }));
    assert.equal(plan.error, undefined);
    assert.deepEqual(plan.writes.map((write) => write.path), [`${HOME}/.factory/hooks.json`, `${HOME}/.factory/mcp.json`]);
    assert.ok(Array.isArray((JSON.parse(plan.writes[0]!.content) as Hooks).PreToolUse));
    assert.deepEqual(Object.keys(JSON.parse(plan.writes[1]!.content) as object), ["mcpServers"]);
    assert.deepEqual(planAgentInstall("droid", ctx()).writes.map((write) => write.path), [`${ROOT}/.factory/hooks.json`, `${ROOT}/.factory/mcp.json`]);
  });

  it("notes that --fail-closed has no vendor option on codex and qwen", () => {
    for (const agent of ["codex", "qwen"]) {
      assert.ok(planAgentInstall(agent, ctx({ failClosed: true })).notes.some((line) => /fail-closed/.test(line) && /fails? open/.test(line)), agent);
      assert.ok(!planAgentInstall(agent, ctx()).notes.some((line) => /fail-closed/.test(line)), agent);
    }
  });
});

describe("planAgentInstall: merging into a config that exists", () => {
  const file = `${ROOT}/.codex/hooks.json`;
  const foreign = { matcher: "Bash", hooks: [{ type: "command", command: "my-own-guard" }] };

  it("keeps foreign entries and malformed rows, and replaces the commands of an earlier runtime", () => {
    const old = `node "${HOME}/.claude/instincts/runtime/1.0.0/hooks/gateguard.mjs" --agent codex`;
    const mixed = { matcher: "Bash", hooks: [{ type: "command", command: old }, { type: "command", command: "keep-me" }] };
    const existing = JSON.stringify({ other: 1, hooks: { PreToolUse: [foreign, null, { matcher: "x" }, mixed], Notification: [foreign] } });
    const plan = planAgentInstall("codex", ctx({}, { [file]: existing }));
    const json = only(plan).json as { other: number; hooks: Hooks };
    assert.equal(json.other, 1);
    assert.deepEqual(json.hooks.Notification, [foreign]);
    const pre = json.hooks.PreToolUse!;
    assert.deepEqual(pre.slice(0, 4), [foreign, null, { matcher: "x" }, { matcher: "Bash", hooks: [{ type: "command", command: "keep-me" }] }]);
    assert.ok(!commands(json.hooks).includes(old));
    assert.ok(commands(json.hooks).includes(`node "${RT}/hooks/gateguard.mjs" --agent codex`));
    assert.equal(plan.writes[0]!.created, false);
  });

  it("is idempotent: installing over its own output changes nothing", () => {
    const first = planAgentInstall("codex", ctx()).writes[0]!.content;
    const second = planAgentInstall("codex", ctx({}, { [file]: first })).writes[0]!.content;
    assert.equal(second, first);
  });

  it("does not take another agent's commands for its own", () => {
    const other = `node "${HOME}/.claude/instincts/runtime/1.0.0/hooks/gateguard.mjs" --agent qwen`;
    const existing = JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: "command", command: other }] }] } });
    assert.ok(commands((only(planAgentInstall("codex", ctx({}, { [file]: existing }))).json as { hooks: Hooks }).hooks).includes(other));
  });

  it("refuses a config it cannot merge into, and plans no write", () => {
    for (const text of ["{not json", "[]", "null", "3", JSON.stringify({ hooks: [] }), JSON.stringify({ hooks: { PreToolUse: {} } })]) {
      const plan = planAgentInstall("codex", ctx({}, { [file]: text }));
      assert.match(plan.error ?? "", /\.codex\/hooks\.json/, text);
      assert.deepEqual(plan.writes, [], text);
    }
    const qwen = planAgentInstall("qwen", ctx({}, { [`${ROOT}/.qwen/settings.json`]: JSON.stringify({ mcpServers: [] }) }));
    assert.match(qwen.error ?? "", /mcpServers/);
  });

  it("refuses to overwrite a continuous-improvement MCP entry it did not write, and replaces one of its own from an earlier runtime", () => {
    const files = { qwen: `${ROOT}/.qwen/settings.json`, droid: `${ROOT}/.factory/mcp.json` };
    const foreignEntries: unknown[] = [
      { command: "npx", args: ["continuous-improvement", "mcp"] },
      { command: "node", args: [`${RT}/bin/mcp-server.mjs`, "--mode", "expert"], env: { X: "1" } },
      { command: "node", args: ["/elsewhere/bin/mcp-server.mjs", "--mode", "expert"] },
      "not an object",
      null,
    ];
    for (const [agent, path] of Object.entries(files)) {
      for (const foreign of foreignEntries) {
        const plan = planAgentInstall(agent, ctx({}, { [path]: JSON.stringify({ mcpServers: { "continuous-improvement": foreign } }) }));
        assert.match(plan.error ?? "", /mcpServers\.continuous-improvement/, `${agent} ${JSON.stringify(foreign)}`);
        assert.deepEqual(plan.writes, []);
      }
      const earlier = { command: "node", args: [`${HOME}/.claude/instincts/runtime/1.0.0/bin/mcp-server.mjs`, "--mode", "expert"] };
      const plan = planAgentInstall(agent, ctx({}, { [path]: JSON.stringify({ mcpServers: { "continuous-improvement": earlier } }) }));
      assert.equal(plan.error, undefined, agent);
      const write = plan.writes.find((entry) => entry.path === path)!;
      assert.deepEqual((JSON.parse(write.content) as { mcpServers: Record<string, unknown> }).mcpServers["continuous-improvement"], { command: "node", args: [`${RT}/bin/mcp-server.mjs`, "--mode", "expert"] });
    }
  });

  it("notes, for every vendor `mcp add`, that it may replace a server of the same name", () => {
    for (const [agent, scope] of [["codex", "user"], ["grok", "project"], ["devin", "project"]] as const) {
      const plan = planAgentInstall(agent, ctx({ scope }));
      assert.equal(plan.runs.length, 1, agent);
      assert.ok(plan.notes.some((line) => line.includes(`${agent} mcp list`) && /replace/.test(line)), agent);
    }
    assert.ok(!planAgentInstall("qwen", ctx()).notes.some((line) => /mcp list/.test(line)));
  });
});

describe("the install ledger", () => {
  function entry(plan: InstallPlan, over: Partial<LedgerEntry> = {}): LedgerEntry {
    return {
      target: plan.agent, scope: plan.scope, project: ROOT, version: "9.9.9", runtime: RT, installedAt: "2026-11-22T00:00:00.000Z",
      files: plan.writes.map(({ path, created, hooksAt, hookCommands, mcpAt, mcp }) => ({ path, created, hooksAt, hookCommands, mcpAt, mcp })),
      runs: plan.runs.map((run) => ({ ...run, ran: false, cwd: null })),
      ...over,
    };
  }

  it("parses a missing ledger as empty and refuses a corrupt one", () => {
    assert.deepEqual(parseLedger(null), emptyLedger());
    for (const bad of ["{bad", "[]", "null", JSON.stringify({ version: 2, entries: [] }), JSON.stringify({ version: 1, entries: {} }), JSON.stringify({ version: 1, entries: [{ target: 1 }] })]) {
      assert.equal(parseLedger(bad), null, bad);
    }
  });

  it("keeps one entry per target, scope and project, and reports the runtimes in use", () => {
    const codex = entry(planAgentInstall("codex", ctx()));
    let ledger = recordInstall(emptyLedger(), codex);
    ledger = recordInstall(ledger, { ...codex, runtime: "/rt/2" });
    ledger = recordInstall(ledger, { ...codex, project: "/other", runtime: "/rt/3" });
    ledger = recordInstall(ledger, { ...codex, scope: "user", project: null, runtime: "/rt/4" });
    assert.equal(ledger.entries.length, 3);
    assert.deepEqual([...runtimesInUse(ledger)].sort(), ["/rt/2", "/rt/3", "/rt/4"]);
    assert.deepEqual(parseLedger(JSON.stringify(ledger)), ledger);
  });

  it("remembers every runtime it ever recorded, so pruning touches only those", () => {
    const codex = entry(planAgentInstall("codex", ctx()));
    let ledger = recordInstall(emptyLedger(), codex);
    ledger = recordInstall(ledger, { ...codex, runtime: "/rt/2" });
    assert.deepEqual(ledger.entries.map((e) => e.runtime), ["/rt/2"]);
    assert.deepEqual(ledger.runtimes, [RT, "/rt/2"]);
    assert.deepEqual(recordInstall(ledger, { ...codex, runtime: "/rt/2" }).runtimes, [RT, "/rt/2"], "no duplicates");
    // A ledger with no history yet takes its entries' runtimes as recorded.
    assert.deepEqual(parseLedger(JSON.stringify({ version: 1, entries: [codex] }))!.runtimes, [RT]);
    for (const bad of [{ version: 1, entries: [], runtimes: {} }, { version: 1, entries: [], runtimes: [1] }]) assert.equal(parseLedger(JSON.stringify(bad)), null);
  });

  it("uninstall removes exactly what was written: our commands and our MCP entry, nothing foreign", () => {
    const settings = `${ROOT}/.qwen/settings.json`;
    const foreignHook = { matcher: "run_shell_command", hooks: [{ type: "command", command: "mine" }] };
    const before = JSON.stringify({ theme: "dark", hooks: { PreToolUse: [foreignHook] }, mcpServers: { other: { command: "x" } } });
    const plan = planAgentInstall("qwen", ctx({}, { [settings]: before }));
    const file = entry(plan).files[0]!;
    const removed = removeOwnedConfig(plan.writes[0]!.content, file);
    assert.equal(removed.kind, "write");
    assert.deepEqual(JSON.parse(removed.kind === "write" ? removed.content : "{}"), JSON.parse(before));
  });

  it("uninstall deletes a file it created once nothing else is in it, and leaves a changed MCP entry", () => {
    const plan = planAgentInstall("qwen", ctx());
    const file = entry(plan).files[0]!;
    assert.equal(file.created, true);
    assert.deepEqual(removeOwnedConfig(plan.writes[0]!.content, file), { kind: "delete" });
    const edited = JSON.parse(plan.writes[0]!.content) as { mcpServers: Record<string, unknown> };
    edited.mcpServers["continuous-improvement"] = { command: "node", args: ["elsewhere"] };
    const kept = removeOwnedConfig(JSON.stringify(edited), file);
    assert.equal(kept.kind, "write");
    assert.deepEqual(JSON.parse(kept.kind === "write" ? kept.content : "{}"), { mcpServers: { "continuous-improvement": { command: "node", args: ["elsewhere"] } } });
  });

  it("uninstall skips a missing file and refuses one it cannot parse", () => {
    const file = entry(planAgentInstall("devin", ctx())).files[0]!;
    assert.deepEqual(removeOwnedConfig(null, file), { kind: "missing" });
    assert.equal(removeOwnedConfig("{oops", file).kind, "error");
    assert.equal(removeOwnedConfig("[]", file).kind, "error");
  });
});
