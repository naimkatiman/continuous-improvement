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
  const ours = (trustStatus: string, script = "gateguard") => ({ command: `node "/rt/hooks/${script}.mjs" --agent codex`, trustStatus });

  it("counts our hooks by trust status and tells the user to open /hooks", () => {
    const text = summarizeCodexHooks({ data: [{ cwd: "/p", hooks: [ours("untrusted"), ours("trusted", "session"), ours("untrusted", "observe"), { command: "node other.js", trustStatus: "untrusted" }] }] });
    assert.match(text, /3 continuous-improvement hooks: 1 trusted, 2 untrusted/);
    assert.match(text, /\/hooks/);
  });

  it("says so when every hook of ours is trusted, and when none is listed", () => {
    assert.match(summarizeCodexHooks({ data: [{ hooks: [ours("trusted")] }] }), /1 continuous-improvement hook: 1 trusted$/);
    assert.match(summarizeCodexHooks({ data: [{ hooks: [{ command: "node x.js", trustStatus: "trusted" }] }] }), /no continuous-improvement hooks/);
    assert.match(summarizeCodexHooks({ data: [] }), /no continuous-improvement hooks/);
  });

  it("reads a plugin hook by its pluginId", () => {
    assert.match(summarizeCodexHooks({ data: [{ hooks: [{ command: "node x.mjs", pluginId: "continuous-improvement@mkt", trustStatus: "modified" }] }] }), /1 continuous-improvement hook: 1 modified/);
  });

  it("reports an unreadable result instead of throwing", () => {
    for (const bad of [null, undefined, 1, "x", {}, { data: null }, { data: [null] }, { data: [{ hooks: "x" }] }, { data: [{ hooks: [null, 1, { command: 3 }] }] }]) {
      const text = summarizeCodexHooks(bad);
      assert.equal(typeof text, "string", JSON.stringify(bad));
    }
    assert.match(summarizeCodexHooks(null), /could not read/);
    assert.match(summarizeCodexHooks({ data: null }), /could not read/);
  });

  it("counts a hook of ours with no trust status as unknown", () => {
    assert.match(summarizeCodexHooks({ data: [{ hooks: [{ command: "node /rt/hooks/gateguard.mjs" }] }] }), /1 unknown/);
  });
});

// A stand-in vendor CLI: it logs its argv to <name>-calls.jsonl, prints one
// line, and exits with FAKE_EXIT. As `app-server` it answers the JSON-RPC
// requests, and answers hooks/list with one hook of ours and one foreign hook
// (FAKE_SILENT makes it answer nothing).
function fakeCli(root: string, name: string): { bin: string; log: string } {
  const bin = join(root, "fakebin");
  mkdirSync(bin, { recursive: true });
  const log = join(root, `${name}-calls.jsonl`);
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
    `        ? { data: [{ cwd: m.params.cwds[0], hooks: [{ command: "node /rt/hooks/gateguard.mjs --agent codex", trustStatus: "untrusted" }, { command: "node other.js", trustStatus: "trusted" }] }] }`,
    `        : { userAgent: "fake" };`,
    `      process.stdout.write(JSON.stringify({ id: m.id, result }) + "\\n");`,
    `    }`,
    `  });`,
    `} else {`,
    `  process.stdout.write("fake ${name} " + args.join(" ") + "\\n");`,
    `  process.exitCode = Number(process.env.FAKE_EXIT ?? 0);`,
    `}`,
    "",
  ].join("\n"));
  writeFileSync(join(bin, `${name}.cmd`), `@node "%~dp0${name}-fake.cjs" %*\r\n`);
  writeFileSync(join(bin, name), `#!/bin/sh\nexec node "$(dirname "$0")/${name}-fake.cjs" "$@"\n`, { mode: 0o755 });
  return { bin, log };
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
});
