/**
 * `ci doctor --agent <id>` (docs/plans/2026-11-21-all-agents.md, PR 16 and the
 * Gates section): it runs the agent's own listing commands and nothing else.
 * "`ci doctor` may only run listing commands. A test asserts its probe table
 * contains no `exec`, `-p`, `run`, `chat` or prompt argument." That test is the
 * first describe below.
 *
 * RED first: lib/agent-doctor.mjs did not exist and `ci doctor` was an unknown
 * command.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DOCTOR_AGENTS,
  DOCTOR_PROBES,
  DOCTOR_RPC_METHODS,
  findOnPath,
  parseDoctorArgs,
  runDoctor,
  summarizeCodexHooks,
} from "../lib/agent-doctor.mjs";
import { HOOK_AGENT_IDS, PLUGIN_AGENT_IDS } from "../lib/agent-install-plans.mjs";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const CLI = join(REPO_ROOT, "bin", "unified-cli.mjs");
const roots: string[] = [];

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ci-doctor-")));
  roots.push(root);
  return root;
}

// Arguments that start a model turn or run code somewhere: exec/run/chat
// subcommands, print and prompt flags (`-p` is Codex, Gemini, Qwen, Copilot and
// Grok print mode; `-x` is Amp execute), and anything carrying "prompt" (Codex
// `debug prompt-input`).
const FORBIDDEN = new Set(["exec", "-p", "run", "chat", "prompt", "--prompt", "--print", "-x", "--execute", "--task", "acp", "--acp"]);

describe("the probe table runs listing commands only", () => {
  const all = Object.entries(DOCTOR_PROBES).flatMap(([agent, probes]) => probes.map((probe) => ({ agent, probe })));

  it("has no exec, -p, run, chat or prompt argument", () => {
    assert.ok(all.length > 0);
    for (const { agent, probe } of all) {
      for (const token of [probe.bin, ...probe.args]) {
        const lower = token.toLowerCase();
        assert.ok(!FORBIDDEN.has(lower), `${agent}: ${probe.bin} ${probe.args.join(" ")} carries ${token}`);
        assert.ok(!lower.includes("prompt"), `${agent}: ${probe.bin} ${probe.args.join(" ")} carries a prompt argument`);
      }
    }
  });

  it("sends only listing JSON-RPC methods", () => {
    assert.deepEqual([...DOCTOR_RPC_METHODS].sort(), ["hooks/list", "initialize", "initialized"]);
    for (const { agent, probe } of all) {
      for (const request of probe.rpc ?? []) {
        assert.ok(DOCTOR_RPC_METHODS.includes(request.method), `${agent}: rpc method ${request.method}`);
      }
    }
  });

  it("uses tokens a Windows cmd.exe line cannot reinterpret, and cites a source for every probe", () => {
    for (const { agent, probe } of all) {
      for (const token of [probe.bin, ...probe.args]) assert.match(token, /^[A-Za-z0-9._\/:=-]+$/, `${agent}: ${token}`);
      assert.ok(probe.source.trim().length > 0, `${agent}: ${probe.bin} ${probe.args.join(" ")} has no source`);
    }
  });

  it("covers every agent install --hooks can install, and only those", () => {
    assert.deepEqual([...DOCTOR_AGENTS].sort(), [...HOOK_AGENT_IDS, ...PLUGIN_AGENT_IDS].sort());
    for (const agent of DOCTOR_AGENTS) assert.ok(DOCTOR_PROBES[agent]!.length > 0, agent);
  });
});

describe("parseDoctorArgs", () => {
  it("takes --agent <id> and --agent=<id>, and the windsurf alias", () => {
    assert.deepEqual(parseDoctorArgs(["--agent", "codex"]), { agent: "codex" });
    assert.deepEqual(parseDoctorArgs(["--agent=qwen"]), { agent: "qwen" });
    assert.deepEqual(parseDoctorArgs(["--agent", "windsurf"]), { agent: "devin" });
  });

  it("refuses a missing, empty, unknown or wrong-case agent, and stray arguments", () => {
    for (const args of [[], ["--agent"], ["--agent", ""], ["--agent="], ["--agent", "nope"], ["--agent", "Codex"], ["--agent", "claude"], ["--agent", "codex", "extra"], ["codex"]]) {
      assert.throws(() => parseDoctorArgs(args), /Usage: ci doctor --agent/, JSON.stringify(args));
    }
    assert.throws(() => parseDoctorArgs(["--agent", "nope"]), /Unknown --agent: "nope"\. Valid: .*codex/);
  });
});

describe("findOnPath", () => {
  it("finds a PATHEXT file on win32 and a plain file elsewhere, case-insensitive PATH key on win32", () => {
    const root = tempRoot();
    const dir = join(root, "bin");
    mkdirSync(dir);
    writeFileSync(join(dir, "codex.cmd"), "@echo off\r\n");
    writeFileSync(join(dir, "codex"), "#!/bin/sh\n", { mode: 0o755 });
    assert.equal(findOnPath("codex", { Path: dir, PATHEXT: ".EXE;.CMD" }, "win32"), join(dir, "codex.cmd"));
    assert.equal(findOnPath("codex", { PATH: dir }, "linux"), join(dir, "codex"));
  });

  it("returns null for an empty or missing PATH, a missing binary, and skips relative PATH entries", () => {
    const root = tempRoot();
    writeFileSync(join(root, "codex.cmd"), "@echo off\r\n");
    assert.equal(findOnPath("codex", {}, "win32"), null);
    assert.equal(findOnPath("codex", { PATH: "" }, "linux"), null);
    assert.equal(findOnPath("nope", { PATH: root }, "linux"), null);
    assert.equal(findOnPath("codex", { PATH: ".", PATHEXT: ".CMD" }, "win32"), null);
    assert.equal(findOnPath("codex", { PATH: "relative/dir" }, "linux"), null);
  });

  it("skips a directory that has the binary's name", () => {
    const root = tempRoot();
    mkdirSync(join(root, "codex"));
    assert.equal(findOnPath("codex", { PATH: root }, "linux"), null);
  });
});

describe("summarizeCodexHooks", () => {
  const RT = "/home/u/.claude/instincts/runtime/3.27.0";
  const ours = (trustStatus: string, script = "gateguard") => ({ command: `node "${RT}/hooks/${script}.mjs" --agent codex`, trustStatus });
  const line = (result: unknown): string => summarizeCodexHooks(result).line;

  it("counts our hooks by trust status and tells the user to open /hooks", () => {
    const summary = summarizeCodexHooks({ data: [{ cwd: "/p", hooks: [ours("untrusted"), ours("trusted", "session"), ours("untrusted", "observe"), { command: "node other.js", trustStatus: "untrusted" }] }] });
    assert.match(summary.line, /3 continuous-improvement hooks: 1 trusted, 2 untrusted/);
    assert.match(summary.line, /\/hooks/);
    assert.equal(summary.ok, true);
  });

  it("says so when every hook of ours is trusted, and when none is listed", () => {
    assert.match(line({ data: [{ hooks: [ours("trusted")] }] }), /1 continuous-improvement hook: 1 trusted$/);
    assert.match(line({ data: [{ hooks: [{ command: "node x.js", trustStatus: "trusted" }] }] }), /no continuous-improvement hooks/);
    assert.match(line({ data: [] }), /no continuous-improvement hooks/);
    assert.equal(summarizeCodexHooks({ data: [] }).ok, true);
  });

  it("reads a plugin hook by its pluginId", () => {
    assert.match(line({ data: [{ hooks: [{ command: "node x.mjs", pluginId: "continuous-improvement@mkt", trustStatus: "modified" }] }] }), /1 continuous-improvement hook: 1 modified/);
  });

  it("does not count another plugin's hook, or one outside the runtime copy, as ours because of its script name", () => {
    // Review finding: a foreign plugin's hooks/session.mjs was counted as ours.
    const foreign = { command: "node /home/u/some-other-tool/hooks/session.mjs", trustStatus: "trusted", pluginId: "other-tool@mkt" };
    const loose = { command: "python3 ~/.codex/bin/observe.mjs", trustStatus: "trusted" };
    const prefixed = { command: `node "${RT}/hooks/gateguard.mjs"`, trustStatus: "trusted", pluginId: "continuous-improvement-fork@mkt" };
    assert.match(line({ data: [{ hooks: [foreign, loose, prefixed] }] }), /no continuous-improvement hooks/);
    assert.match(line({ data: [{ hooks: [foreign, ours("untrusted")] }] }), /1 continuous-improvement hook: 1 untrusted/);
  });

  it("reports an unreadable result instead of throwing", () => {
    for (const bad of [null, undefined, 1, "x", {}, { data: null }, { data: [null] }, { data: [{ hooks: "x" }] }, { data: [{ hooks: [null, 1, { command: 3 }] }] }]) {
      const summary = summarizeCodexHooks(bad);
      assert.equal(typeof summary.line, "string", JSON.stringify(bad));
    }
    for (const bad of [null, undefined, 1, "x", {}, { data: null }, { hooks: [] }]) {
      const summary = summarizeCodexHooks(bad);
      assert.match(summary.line, /could not read/, JSON.stringify(bad));
      assert.equal(summary.ok, false, JSON.stringify(bad));
    }
  });

  it("counts a hook of ours with no trust status as unknown", () => {
    assert.match(line({ data: [{ hooks: [{ command: `node ${RT}/hooks/gateguard.mjs` }] }] }), /1 unknown/);
  });
});

// A stand-in vendor CLI: it logs its argv to <name>-calls.jsonl, prints one
// line, and exits with FAKE_EXIT. As `app-server` it answers the JSON-RPC
// requests, and answers hooks/list with one hook of ours and one foreign hook
// (FAKE_SILENT makes it answer nothing, FAKE_SHAPE answers {hooks: []}). With
// FAKE_HANG it records its pid in <name>-pids.txt and never exits. As
// `features list` it prints a warning and 30 flags before hooks, plugins and
// skill_search, as codex-cli 0.171.0 does (they are rows 90 and later there).
function fakeCli(root: string, name: string): { bin: string; log: string; pids: string } {
  const bin = join(root, "fakebin");
  mkdirSync(bin, { recursive: true });
  const log = join(root, `${name}-calls.jsonl`);
  const pids = join(root, `${name}-pids.txt`);
  const script = join(bin, `${name}-fake.cjs`);
  writeFileSync(script, [
    `const fs = require("node:fs");`,
    `const args = process.argv.slice(2);`,
    `fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");`,
    `if (args[0] === "app-server") {`,
    `  let buf = "";`,
    `  process.stdin.on("data", (d) => {`,
    `    buf += d;`,
    `    const lines = buf.split("\\n"); buf = lines.pop();`,
    `    for (const line of lines) {`,
    `      if (!line.trim() || process.env.FAKE_SILENT) continue;`,
    `      const m = JSON.parse(line);`,
    `      fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ rpc: m.method, params: m.params ?? null }) + "\\n");`,
    `      if (m.id === undefined) continue;`,
    `      const result = m.method === "hooks/list"`,
    `        ? (process.env.FAKE_SHAPE ? { hooks: [] } : { data: [{ cwd: m.params.cwds[0], hooks: [{ command: "node /u/.claude/instincts/runtime/3.27.0/hooks/gateguard.mjs --agent codex", trustStatus: "untrusted" }, { command: "node other.js", trustStatus: "trusted" }] }] })`,
    `        : { userAgent: "fake" };`,
    `      process.stdout.write(JSON.stringify({ id: m.id, result }) + "\\n");`,
    `    }`,
    `  });`,
    `} else if (process.env.FAKE_HANG) {`,
    `  fs.appendFileSync(${JSON.stringify(pids)}, process.pid + "\\n");`,
    `  setInterval(() => {}, 1000);`,
    `} else if (args[0] === "features") {`,
    `  const rows = ["WARNING: proceeding, even though we could not update PATH"];`,
    `  for (let i = 0; i < 30; i++) rows.push("flag_" + i + "  stable  false");`,
    `  rows.push("hooks  stable  true", "plugin_hooks  removed  false", "plugins  stable  true", "skill_search  stable  true", "zzz_last  stable  false");`,
    `  process.stdout.write(rows.join("\\n") + "\\n");`,
    `} else {`,
    `  process.stdout.write("fake ${name} " + args.join(" ") + "\\n");`,
    `  process.exitCode = Number(process.env.FAKE_EXIT ?? 0);`,
    `}`,
    "",
  ].join("\n"));
  writeFileSync(join(bin, `${name}.cmd`), `@node "%~dp0${name}-fake.cjs" %*\r\n`);
  // ${0%/*} is the shell's own dirname: fakeEnv's PATH has no /usr/bin, so the dirname program is not found.
  writeFileSync(join(bin, name), `#!/bin/sh\nexec node "\${0%/*}/${name}-fake.cjs" "$@"\n`, { mode: 0o755 });
  return { bin, log, pids };
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function calls(log: string): unknown[] {
  return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line) as unknown) : [];
}

// PATH holds the fake bin and node's own dir, nothing else.
function fakeEnv(bin: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: `${bin}${delimiter}${dirname(process.execPath)}`, ...extra };
  for (const key of ["SystemRoot", "SYSTEMROOT", "ComSpec", "COMSPEC", "PATHEXT", "TEMP", "TMP"]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

describe("runDoctor", () => {
  it("runs exactly the agent's probe table, in order, and the Codex hooks/list RPC", async () => {
    const root = tempRoot();
    const { bin, log } = fakeCli(root, "codex");
    const out: string[] = [];
    const ok = await runDoctor("codex", { env: fakeEnv(bin), platform: process.platform, cwd: root, timeoutMs: 20_000, write: (line) => out.push(line) });
    const text = out.join("\n");
    assert.equal(ok, true, text);
    const argvs = calls(log).filter((entry) => Array.isArray(entry));
    assert.deepEqual(argvs, DOCTOR_PROBES.codex!.map((probe) => [...probe.args]));
    const rpcs = calls(log).filter((entry) => !Array.isArray(entry)) as Array<{ rpc: string; params: unknown }>;
    assert.deepEqual(rpcs.map((entry) => entry.rpc), ["initialize", "initialized", "hooks/list"]);
    assert.deepEqual(rpcs[2]!.params, { cwds: [root] });
    assert.match(text, /1 continuous-improvement hook: 1 untrusted/);
    assert.match(text, /fake codex --version/);
    assert.match(text, /listing commands only/);
  });

  it("runs nothing and fails when the agent's CLI is not on PATH", async () => {
    const root = tempRoot();
    const out: string[] = [];
    const ok = await runDoctor("qwen", { env: fakeEnv(join(root, "empty")), platform: process.platform, cwd: root, timeoutMs: 5_000, write: (line) => out.push(line) });
    assert.equal(ok, false);
    assert.match(out.join("\n"), /qwen: not found on PATH/);
  });

  it("fails on a probe that exits non-zero and shows the exit code", async () => {
    const root = tempRoot();
    const { bin } = fakeCli(root, "qwen");
    const out: string[] = [];
    const ok = await runDoctor("qwen", { env: fakeEnv(bin, { FAKE_EXIT: "3" }), platform: process.platform, cwd: root, timeoutMs: 20_000, write: (line) => out.push(line) });
    assert.equal(ok, false);
    assert.match(out.join("\n"), /exit 3/);
  });

  it("times out an RPC probe that never answers", async () => {
    const root = tempRoot();
    const { bin } = fakeCli(root, "codex");
    const out: string[] = [];
    const ok = await runDoctor("codex", { env: fakeEnv(bin, { FAKE_SILENT: "1" }), platform: process.platform, cwd: root, timeoutMs: 3_000, write: (line) => out.push(line) });
    assert.equal(ok, false);
    assert.match(out.join("\n"), /timed out/);
  });

  it("fails the Codex hooks/list probe when its result cannot be read", async () => {
    // Review finding: an unreadable reply printed "could not read" and then "-> ok", exit 0.
    const root = tempRoot();
    const { bin } = fakeCli(root, "codex");
    const out: string[] = [];
    const ok = await runDoctor("codex", { env: fakeEnv(bin, { FAKE_SHAPE: "1" }), platform: process.platform, cwd: root, timeoutMs: 20_000, write: (line) => out.push(line) });
    const text = out.join("\n");
    assert.equal(ok, false, text);
    assert.match(text, /could not read the hooks\/list result\n  -> unreadable reply/);
    assert.match(text, /4 of 5 probes ok/);
  });

  it("prints the hooks, plugins and skill_search rows of codex features list, not the first rows", async () => {
    // Review finding: the first 12 of ~225 alphabetical rows never reached hooks (row 90) or plugins (row 140).
    const root = tempRoot();
    const { bin } = fakeCli(root, "codex");
    const out: string[] = [];
    await runDoctor("codex", { env: fakeEnv(bin), platform: process.platform, cwd: root, timeoutMs: 20_000, write: (line) => out.push(line) });
    const text = out.join("\n");
    const section = text.slice(text.indexOf("$ codex features list"), text.indexOf("$ codex plugin list"));
    assert.match(section, /\n  hooks  stable  true\n  plugins  stable  true\n  skill_search  stable  true\n  -> ok/);
    assert.doesNotMatch(section, /flag_0|WARNING|plugin_hooks|zzz_last/);
  });

  it("ends the whole process tree of a probe that times out, so nothing it started outlives the doctor", async () => {
    // Review finding: on win32 a .cmd shim runs through cmd.exe, and killing
    // cmd.exe left the real CLI running after the doctor returned.
    const root = tempRoot();
    const { bin, pids } = fakeCli(root, "junie");
    const out: string[] = [];
    let started: number[] = [];
    try {
      const ok = await runDoctor("junie", { env: fakeEnv(bin, { FAKE_HANG: "1" }), platform: process.platform, cwd: root, timeoutMs: 4_000, write: (line) => out.push(line) });
      assert.equal(ok, false);
      assert.match(out.join("\n"), /timed out after 4s/);
      started = existsSync(pids) ? readFileSync(pids, "utf8").trim().split("\n").map(Number) : [];
      assert.equal(started.length, DOCTOR_PROBES.junie!.length, "the hanging fake recorded its pid");
      assert.deepEqual(started.filter(alive), [], "a probe process outlived the doctor");
    } finally {
      for (const pid of started.filter(alive)) process.kill(pid);
    }
  });

  it("redacts a credential-shaped value a listing prints", async () => {
    const root = tempRoot();
    const { bin } = fakeCli(root, "amp");
    const token = ["sk", "proj", "abcdefghijklmnopqrstuvwxyz0123456789ABCD"].join("-");
    const script = join(bin, "amp-fake.cjs");
    writeFileSync(script, `process.stdout.write("API_KEY=${token}\\n");\n`);
    const out: string[] = [];
    await runDoctor("amp", { env: fakeEnv(bin), platform: process.platform, cwd: root, timeoutMs: 20_000, write: (line) => out.push(line) });
    assert.ok(!out.join("\n").includes(token), out.join("\n"));
  });

  it("refuses an agent it has no probes for, running nothing", async () => {
    const root = tempRoot();
    const { bin, log } = fakeCli(root, "claude");
    await assert.rejects(runDoctor("claude", { env: fakeEnv(bin), platform: process.platform, cwd: root, timeoutMs: 5_000, write: () => {} }), /Unknown --agent/);
    assert.deepEqual(calls(log), []);
  });
});

describe("ci doctor (spawned)", () => {
  function ci(args: string[], env: NodeJS.ProcessEnv, cwd: string): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf8", timeout: 60_000 });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  it("exits 0 when every probe passes and 1 when the CLI is missing", () => {
    const root = tempRoot();
    const { bin, log } = fakeCli(root, "gemini");
    const pass = ci(["doctor", "--agent", "gemini"], fakeEnv(bin), root);
    assert.equal(pass.status, 0, pass.stdout + pass.stderr);
    assert.deepEqual(calls(log), DOCTOR_PROBES.gemini!.map((probe) => [...probe.args]));
    const missing = ci(["doctor", "--agent", "gemini"], fakeEnv(join(root, "empty")), root);
    assert.equal(missing.status, 1);
    assert.match(missing.stdout, /gemini: not found on PATH/);
  });

  it("exits 1 on an unknown agent and lists the valid ids", () => {
    const root = tempRoot();
    const out = ci(["doctor", "--agent", "nope"], fakeEnv(join(root, "empty")), root);
    assert.equal(out.status, 1);
    assert.match(out.stderr, /Unknown --agent: "nope"/);
  });

  it("is listed in the help text", () => {
    const root = tempRoot();
    const out = ci(["--help"], fakeEnv(join(root, "empty")), root);
    assert.match(out.stdout, /doctor --agent <agent>/);
  });

  it("prints its usage and exits 0 on --help or -h, running no probe", () => {
    const root = tempRoot();
    const { bin, log } = fakeCli(root, "gemini");
    for (const flag of ["--help", "-h"]) {
      const out = ci(["doctor", flag], fakeEnv(bin), root);
      assert.equal(out.status, 0, out.stdout + out.stderr);
      assert.match(out.stdout, /^Usage: ci doctor --agent </);
      assert.equal(out.stderr, "");
    }
    assert.deepEqual(calls(log), []);
  });
});

// PR 19 (docs/plans/2026-11-21-all-agents.md): probe defects 6 and 7 and critic gap 10.
describe("runDoctor: what a listing says about our server and hooks", () => {
  const longRuntime = `C:/Users/someone/AppData/Local/Temp/${"x".repeat(200)}/.claude/instincts/runtime/3.27.0`;
  function scripted(root: string, name: string, body: string): string {
    const { bin } = fakeCli(root, name);
    writeFileSync(join(bin, `${name}-fake.cjs`), body);
    return bin;
  }
  const doctor = async (agent: string, bin: string, root: string, extra: Record<string, string> = {}): Promise<{ ok: boolean; text: string }> => {
    const out: string[] = [];
    const ok = await runDoctor(agent, { env: fakeEnv(bin, extra), platform: process.platform, cwd: root, timeoutMs: 20_000, write: (line) => out.push(line) });
    return { ok, text: out.join("\n") };
  };

  it("fails a Gemini mcp list that shows our server Disconnected, names the trust step, and keeps the state at the end of a long line", async () => {
    const root = tempRoot();
    const bin = scripted(root, "gemini", [
      "const a = process.argv.slice(2);",
      `if (a[0] === "mcp") process.stdout.write("Configured MCP servers:\\n\\n✗ continuous-improvement: node ${longRuntime}/bin/mcp-server.mjs --mode expert (stdio) - Disconnected\\n");`,
      "else process.stdout.write(\"listed\\n\");",
      "",
    ].join("\n"));
    const { ok, text } = await doctor("gemini", bin, root);
    assert.equal(ok, false, text);
    assert.match(text, /\(stdio\) - Disconnected\n/);
    assert.match(text, /continuous-improvement is listed but not connected/);
    assert.match(text, /untrusted folder/);
    assert.match(text, /2 of 3 probes ok/);
    // The note describes the shipped settings.json merge, not an extension.
    assert.doesNotMatch(text, /extension that carries/);
    assert.match(text, /settings\.json/);
  });

  it("strips ANSI codes and passes a Qwen mcp list that shows our server Connected", async () => {
    const root = tempRoot();
    const bin = scripted(root, "qwen", [
      "const a = process.argv.slice(2);",
      `if (a[0] === "mcp") process.stdout.write("\\x1b[32m✓\\x1b[0m continuous-improvement: node ${longRuntime}/bin/mcp-server.mjs --mode expert (stdio) - Connected\\n");`,
      "else process.stdout.write(\"listed\\n\");",
      "",
    ].join("\n"));
    const { ok, text } = await doctor("qwen", bin, root);
    assert.equal(ok, true, text);
    assert.match(text, /✓ continuous-improvement: node .*\(stdio\) - Connected/);
    assert.ok(!text.includes("\x1b"), JSON.stringify(text));
  });

  it("counts our hooks in grok inspect --json instead of printing the JSON, and says when the folder is not trusted", async () => {
    const root = tempRoot();
    const bin = scripted(root, "grok", [
      "const a = process.argv.slice(2);",
      "if (a[0] === \"inspect\") process.stdout.write(process.env.FAKE_INSPECT);",
      "else process.stdout.write(\"listed\\n\");",
      "",
    ].join("\n"));
    // The shape `grok inspect --json` printed on Grok 1.0.85 (scratchpad e2e-grok/inspect-home.json).
    const hook = (event: string, path: string) => ({ event, hookType: "command", target: `node "${longRuntime}/${path}.mjs" --agent grok`, source: { type: "user" } });
    const foreign = { event: "pre_tool_use", hookType: "command", target: "node other.js", source: { type: "user" } };
    const trusted = JSON.stringify({ projectTrusted: true, hooks: [hook("pre_tool_use", "hooks/gateguard"), hook("post_tool_use", "bin/observe"), foreign] }, null, 2);
    const listed = await doctor("grok", bin, root, { FAKE_INSPECT: trusted });
    assert.equal(listed.ok, true, listed.text);
    assert.match(listed.text, /\$ grok inspect --json\n  2 continuous-improvement hooks of 3 listed\n  -> ok/);
    assert.doesNotMatch(listed.text, /"projectTrusted"|"event"/);

    const untrusted = await doctor("grok", bin, root, { FAKE_INSPECT: JSON.stringify({ projectTrusted: false, hooks: [] }) });
    assert.equal(untrusted.ok, true, untrusted.text);
    assert.match(untrusted.text, /no hooks listed: this folder is not trusted, and Grok lists hooks only in a trusted folder/);

    const garbage = await doctor("grok", bin, root, { FAKE_INSPECT: "not json" });
    assert.equal(garbage.ok, false, garbage.text);
    assert.match(garbage.text, /could not read the grok inspect --json output\n  -> unreadable output/);
  });
});
