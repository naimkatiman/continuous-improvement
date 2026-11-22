/**
 * The write tools whose path key the research does not document.
 *
 * Copilot CLI's `str_replace_editor` and `create` and Auggie's legacy
 * `str-replace-editor` and `save-file` are matched by the installed hooks
 * (Copilot preToolUse matcher `...|edit|str_replace_editor|apply_patch|create`,
 * Auggie `^(...|str-replace-editor|save-file)$`), but their profiles named no
 * path key, so the blind-edit gate and config-guard found no file and allowed
 * every write (closure audit 2 on fix/agent-train-closeout-2, writesweep
 * "UNGATED"). The verified research names the tools and not their argument
 * keys (research GitHub Copilot tool_names: "`edit` (also `str_replace_editor`,
 * `apply_patch`), `create` (file write)"; research [Auggie] tool_names: "Legacy
 * 0.x names launch-process, view, str-replace-editor and save-file still
 * match"), so the profiles read the common keys path, file_path, filePath and
 * target_file, unverified, and a write that names none of them is denied, not
 * allowed.
 *
 * The payload shapes are the agents' verified ones from
 * fixtures/agent-matrix/{copilot,auggie}.json: Copilot camelCase sessionId,
 * cwd, toolName and toolArgs as a JSON string; Auggie conversation_id,
 * workspace_roots, tool_name and tool_input.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { AGENT_PROFILES, CLAUDE_TOOL_NAMES, inboundPaths, pathRequiredFor, profileInboundTool, resolveInboundTool } from "../lib/agent-profiles.mjs";
import { resolveProjectRoot } from "../lib/agent-paths.mjs";
import { classifyMutation } from "../lib/config-guard-gate.mjs";
import { decideGateguard, readGateguardConfig } from "../lib/gateguard-decide.mjs";
import { hashProjectRoot } from "../lib/gateguard-state.mjs";
import { normalizeEvent } from "../lib/hook-io.mjs";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const INHERITED_ENV = new Set(["path", "pathext", "systemroot", "systemdrive", "windir", "comspec", "temp", "tmp", "tmpdir"]);
const KEYS = ["path", "file_path", "filePath", "target_file"] as const;
const TOOLS = [
  { agent: "copilot", tool: "str_replace_editor" },
  { agent: "copilot", tool: "create" },
  { agent: "auggie", tool: "str-replace-editor" },
  { agent: "auggie", tool: "save-file" },
] as const;
type Agent = (typeof TOOLS)[number]["agent"];

interface DenyShape {
  exitCode: 0 | 2;
  json?: Record<string, unknown>;
  reasonAt?: string[][];
}

interface Run {
  stdout: string;
  stderr: string;
  status: number | null;
}

interface Dirs {
  root: string;
  home: string;
  project: string;
}

const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function fixture(agent: Agent): { expect: { deny: DenyShape }; evidence: { read: unknown } } {
  return JSON.parse(readFileSync(join(REPO_ROOT, "fixtures", "agent-matrix", `${agent}.json`), "utf8")) as {
    expect: { deny: DenyShape };
    evidence: { read: unknown };
  };
}

function workspace(): { dirs: Dirs; read: string; unread: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ci-agent-write-")));
  roots.push(root);
  const home = join(root, "home");
  const project = join(root, "project");
  mkdirSync(home, { recursive: true });
  mkdirSync(join(project, ".claude"), { recursive: true });
  writeFileSync(join(project, "notes.txt"), "a\n");
  writeFileSync(join(project, "other.txt"), "a\n");
  writeFileSync(join(project, ".claude", "settings.json"), "{}\n");
  // Forward slashes: Copilot's toolArgs is a JSON string, where a backslash is an escape.
  const slashed = project.split("\\").join("/");
  return { dirs: { root, home, project }, read: `${slashed}/notes.txt`, unread: `${slashed}/other.txt` };
}

/** The agent's verified PreToolUse shape (fixtures/agent-matrix/<agent>.json evidence.edit) with another tool and args. */
function preTool(agent: Agent, tool: string, args: Record<string, unknown>, session: string, project: string): unknown {
  const cwd = project.split("\\").join("/");
  if (agent === "copilot") return { sessionId: session, timestamp: 1763712000002, cwd, toolName: tool, toolArgs: JSON.stringify(args) };
  return { hook_event_name: "PreToolUse", conversation_id: session, workspace_roots: [cwd], tool_name: tool, tool_input: args };
}

/** The agent's own verified read (a shell `cat <FILE>`), from its fixture. */
function shellRead(agent: Agent, session: string, file: string, project: string): unknown {
  const text = JSON.stringify(fixture(agent).evidence.read)
    .split("<SESSION>").join(session)
    .split("<FILE>").join(file)
    .split("<PROJECT>").join(project.split("\\").join("/"));
  return JSON.parse(text) as unknown;
}

function runScript(script: string, args: string[], stdin: unknown, dirs: Dirs, extraEnv: Record<string, string> = {}): Promise<Run> {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (INHERITED_ENV.has(key.toLowerCase()) && value !== undefined) env[key] = value;
  }
  Object.assign(env, {
    HOME: dirs.home,
    USERPROFILE: dirs.home,
    CLAUDE_PROJECT_DIR: dirs.project,
    GIT_CEILING_DIRECTORIES: dirs.root,
    GIT_CONFIG_NOSYSTEM: "1",
    ...extraEnv,
  });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [isAbsolute(script) ? script : join(REPO_ROOT, script), ...args], { cwd: dirs.project, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    const timer = setTimeout(() => child.kill(), 30_000);
    child.on("error", reject);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, status });
    });
    child.stdin.end(typeof stdin === "string" ? stdin : JSON.stringify(stdin));
  });
}

function at(value: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((node, key) => (node !== null && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), value);
}

/** The deny reason, asserting the agent's verified deny shape. */
function denyReason(agent: Agent, run: Run, where: string): string {
  const shape = fixture(agent).expect.deny;
  const detail = `${where}\nstatus: ${run.status}\nstdout: ${run.stdout}\nstderr: ${run.stderr}`;
  assert.equal(run.status, shape.exitCode, detail);
  if (shape.exitCode === 2) return run.stderr;
  assert.notEqual(run.stdout, "", detail);
  const output = JSON.parse(run.stdout) as unknown;
  for (const [key, value] of Object.entries(shape.json ?? {})) {
    if (value !== null && typeof value === "object") {
      for (const [inner, expected] of Object.entries(value)) assert.equal(at(output, [key, inner]), expected, detail);
    } else {
      assert.equal(at(output, [key]), value, detail);
    }
  }
  const reason = at(output, shape.reasonAt![0]!);
  assert.equal(typeof reason, "string", detail);
  return reason as string;
}

function assertAllowed(run: Run, where: string): void {
  const detail = `${where}\nstdout: ${run.stdout}\nstderr: ${run.stderr}`;
  assert.equal(run.status, 0, detail);
  assert.equal(run.stdout, "", detail);
}

/** Seeds this session's observation log with a shell read of `file`. */
async function observeRead(agent: Agent, session: string, file: string, dirs: Dirs): Promise<void> {
  const run = await runScript("bin/observe.mjs", ["--agent", agent], shellRead(agent, session, file, dirs.project), dirs);
  assert.equal(run.status, 0, run.stderr);
}

describe("the profiles of the write tools with no documented path key", () => {
  for (const { agent, tool } of TOOLS) {
    it(`${agent} ${tool}: a file write that reads path, file_path, filePath and target_file in that order, and needs one of them`, () => {
      const alias = resolveInboundTool(tool);
      assert.ok(alias, tool);
      assert.equal(alias.kind, "file-write");
      assert.deepEqual(alias.agents, [agent]);
      assert.deepEqual(alias.input.path, [...KEYS]);
      assert.equal(alias.pathRequired, true);
      const source = AGENT_PROFILES.find((profile) => profile.id === agent)!.source;
      assert.match(source, new RegExp(`${tool}.*unverified`), `${agent}'s source says the keys of ${tool} are unverified`);
    });

    it(`${agent} ${tool}: reads the file at each key, and none from empty, malformed or unknown input`, () => {
      const alias = resolveInboundTool(tool)!;
      for (const key of KEYS) assert.deepEqual(inboundPaths(alias, { [key]: "a.txt", content: "x" }), ["a.txt"], key);
      assert.deepEqual(inboundPaths(alias, { path: "a.txt", file_path: "a.txt" }), ["a.txt"]);
      for (const input of [{}, null, [], "a.txt", 3, { path: "" }, { path: 3 }, { file: "a.txt" }, { paths: ["a.txt"] }]) {
        assert.deepEqual(inboundPaths(alias, input), [], JSON.stringify(input));
      }
    });
  }

  it("leaves every other tool as it was: no other file tool needs a path, and Claude names are no alias", () => {
    // The second review adds the other file-write tools of the profiles that
    // document no path key, and the patch tools whose patch key is unverified.
    const required = new Set<string>([...TOOLS.map((entry) => entry.tool), "edit", "write", "notebook_edit", "apply_patch", "ApplyPatch"]);
    for (const profile of AGENT_PROFILES) {
      for (const name of Object.keys(profile.tools)) {
        const alias = resolveInboundTool(name);
        if (alias === null || required.has(name)) continue;
        assert.equal(alias.pathRequired, false, `${profile.id}.${name}`);
      }
    }
    for (const name of ["Edit", "Write", "MultiEdit", "NotebookEdit", "Read"]) assert.equal(resolveInboundTool(name), null, name);
  });
});

describe("config-guard over the write tools with no documented path key", () => {
  for (const { tool } of TOOLS) {
    it(`${tool}: a write to .claude/settings.json at any key is a guardrail-config mutation`, () => {
      for (const key of KEYS) {
        const hit = classifyMutation(tool, { [key]: "/repo/.claude/settings.json", content: "{}" });
        assert.ok(hit, key);
        assert.equal(hit.via, "file", key);
        assert.equal(hit.target, "/repo/.claude/settings.json", key);
      }
    });

    it(`${tool}: a write to an ordinary file is not`, () => {
      assert.equal(classifyMutation(tool, { path: "/repo/src/a.ts", content: "x" }), null);
    });

    it(`${tool}: a write that names no file at any key it reads is reported, never passed as no mutation`, () => {
      for (const input of [{}, { content: "x" }, { path: "" }, { path: 3 }, { file: "/repo/.claude/settings.json" }]) {
        const hit = classifyMutation(tool, input as Record<string, unknown>);
        assert.ok(hit, JSON.stringify(input));
        assert.equal(hit.via, "no-path", JSON.stringify(input));
        for (const key of KEYS) assert.ok(hit.target.includes(key), `${hit.target} names ${key}`);
      }
    });
  }

  it("keeps a Claude write that names no file as no mutation, as before", () => {
    assert.equal(classifyMutation("Write", {}), null);
    assert.equal(classifyMutation("Edit", { content: "x" }), null);
  });
});

for (const { agent, tool } of TOOLS) {
  const flag = ["--agent", agent];

  describe(`${agent} ${tool} through the installed hooks`, () => {
    it("denies a write of an existing file the session never read, at every key", async () => {
      const { dirs, read, unread } = workspace();
      await observeRead(agent, "s1", read, dirs);
      for (const key of KEYS) {
        const run = await runScript("hooks/gateguard.mjs", flag, preTool(agent, tool, { [key]: unread, content: "x" }, "s1", dirs.project), dirs);
        const reason = denyReason(agent, run, `${agent} ${tool} ${key} unread`);
        assert.ok(reason.includes("other.txt"), reason);
      }
    });

    it("allows a write of the file the session read", async () => {
      const { dirs, read } = workspace();
      await observeRead(agent, "s1", read, dirs);
      for (const key of KEYS) {
        const run = await runScript("hooks/gateguard.mjs", flag, preTool(agent, tool, { [key]: read, content: "x" }, "s1", dirs.project), dirs);
        assertAllowed(run, `${agent} ${tool} ${key} after the read`);
      }
    });

    it("config-guard denies a write to .claude/settings.json under CI_CONFIG_GUARD=block", async () => {
      const { dirs } = workspace();
      const settings = `${dirs.project.split("\\").join("/")}/.claude/settings.json`;
      for (const key of KEYS) {
        const run = await runScript("hooks/config-guard.mjs", flag, preTool(agent, tool, { [key]: settings, content: "{}" }, "s1", dirs.project), dirs, { CI_CONFIG_GUARD: "block" });
        const reason = denyReason(agent, run, `${agent} ${tool} ${key} settings.json`);
        assert.ok(reason.includes(".claude/settings.json"), reason);
      }
    });

    it("denies a write that names no file at any key, and the clear route the reason prints lets it through", async () => {
      const { dirs, read } = workspace();
      await observeRead(agent, "s1", read, dirs);
      const payload = preTool(agent, tool, { content: "x", file: read }, "s1", dirs.project);
      const reason = denyReason(agent, await runScript("hooks/gateguard.mjs", flag, payload, dirs), `${agent} ${tool} no path`);
      assert.ok(reason.includes(tool), reason);
      for (const key of KEYS) assert.ok(reason.includes(key), `${reason}\nnames ${key}`);
      assert.ok(reason.includes("gateguard-clear"), reason);

      // The reason's clear command, run as printed (its quoted arguments are JSON strings).
      const line = reason.split("\n").find((text) => text.includes("gateguard-clear"))!;
      const command = line.slice(line.indexOf("node ") + "node ".length);
      const args = [...command.matchAll(/"(?:[^"\\]|\\.)*"|--state/g)].map((match) => (match[0].startsWith("\"") ? (JSON.parse(match[0]) as string) : match[0]));
      const [script, ...rest] = args;
      assert.ok(script && script.endsWith("gateguard-clear.mjs"), command);
      const cleared = await runScript(script, rest, "", dirs);
      assert.equal(cleared.status, 0, cleared.stderr);
      assertAllowed(await runScript("hooks/gateguard.mjs", flag, payload, dirs), `${agent} ${tool} no path after the clear`);

      // The clearance is the tool's own: the other tool of the agent still gets the deny.
      const other = TOOLS.find((entry) => entry.agent === agent && entry.tool !== tool)!.tool;
      denyReason(agent, await runScript("hooks/gateguard.mjs", flag, preTool(agent, other, { content: "x" }, "s1", dirs.project), dirs), `${agent} ${other} no path`);
    });

    it("denies a write that names no file before any observation log exists", async () => {
      const { dirs } = workspace();
      const run = await runScript("hooks/gateguard.mjs", flag, preTool(agent, tool, { content: "x" }, "s1", dirs.project), dirs);
      assert.ok(denyReason(agent, run, `${agent} ${tool} no path, no log`).includes(tool));
    });

    it("config-guard denies a write that names no file under CI_CONFIG_GUARD=block and warns by default", async () => {
      const { dirs } = workspace();
      const payload = preTool(agent, tool, { content: "{}" }, "s1", dirs.project);
      const blocked = await runScript("hooks/config-guard.mjs", flag, payload, dirs, { CI_CONFIG_GUARD: "block" });
      assert.ok(denyReason(agent, blocked, `${agent} ${tool} no path, block`).includes(tool));
      const warned = await runScript("hooks/config-guard.mjs", flag, payload, dirs);
      assertAllowed(warned, `${agent} ${tool} no path, warn`);
      assert.ok(warned.stderr.includes("config-guard") && warned.stderr.includes(tool), warned.stderr);
    });

    it("lets CI_GATEGUARD_FILE_GATE=off through, as for every file tool", async () => {
      const { dirs } = workspace();
      const run = await runScript("hooks/gateguard.mjs", flag, preTool(agent, tool, { content: "x" }, "s1", dirs.project), dirs, { CI_GATEGUARD_FILE_GATE: "off" });
      assertAllowed(run, `${agent} ${tool} no path, gate off`);
    });
  });
}

// --- Second review of PR 21 -------------------------------------------------
//
// Three write routes still reached an allow with no path the guard checked
// (second review of fix/agent-train-closeout-2, repro1.sh and sweep2.out):
//   1. A Claude-named write tool of another agent (Grok `Write`, documented
//      with the path in `path` on the daemon and Cursor route and the alias
//      `filePath` on WriteInput) was read with the Claude keys only.
//   2. The other file-write tools of the profiles that document no path key
//      (Copilot `edit`; Devin `edit`, `write`, `notebook_edit`; Auggie `edit`,
//      `write`; Junie `Write`, `Edit`) got keys only from the tool-name merge.
//   3. A patch through a tool whose patch key is unverified (Devin, Copilot,
//      Junie and Cline `apply_patch`, Droid `ApplyPatch`) that named no file
//      was allowed with a notice.

const NEWLY_REQUIRED = [
  { agent: "copilot", tool: "edit" },
  { agent: "devin", tool: "edit" },
  { agent: "devin", tool: "write" },
  { agent: "devin", tool: "notebook_edit" },
  { agent: "auggie", tool: "edit" },
  { agent: "auggie", tool: "write" },
  { agent: "junie", tool: "Write" },
  { agent: "junie", tool: "Edit" },
] as const;
const UNVERIFIED_PATCH = [
  { agent: "devin", tool: "apply_patch" },
  { agent: "copilot", tool: "apply_patch" },
  { agent: "junie", tool: "apply_patch" },
  { agent: "cline", tool: "apply_patch" },
  { agent: "droid", tool: "ApplyPatch" },
] as const;
const PATCH_KEYS = ["command", "patch", "input"] as const;
const patchFor = (file: string): string => `*** Begin Patch\n*** Update File: ${file}\n@@\n-a\n+b\n*** End Patch`;

describe("each agent's own reading of a tool (profileInboundTool, pathRequiredFor)", () => {
  for (const { agent, tool } of NEWLY_REQUIRED) {
    it(`${agent} ${tool}: a file write that reads the unverified keys and needs one of them`, () => {
      const own = profileInboundTool(agent, tool);
      assert.ok(own, `${agent} ${tool}`);
      assert.equal(own.kind, "file-write");
      assert.deepEqual(own.agents, [agent]);
      assert.equal(own.pathRequired, true);
      for (const key of KEYS) assert.ok(own.input.path.includes(key), `${agent} ${tool} reads ${key}`);
      assert.equal(pathRequiredFor(agent, tool), true);
      const source = AGENT_PROFILES.find((profile) => profile.id === agent)!.source;
      assert.match(source, new RegExp(`\\b${tool}\\b.*unverified`), `${agent}'s source says the keys of ${tool} are unverified`);
    });
  }

  it("devin notebook_edit also reads notebook_path, the key Devin's Claude-shaped payloads would use", () => {
    assert.ok(profileInboundTool("devin", "notebook_edit")!.input.path.includes("notebook_path"));
    assert.deepEqual(inboundPaths(resolveInboundTool("notebook_edit")!, { notebook_path: "a.ipynb" }), ["a.ipynb"]);
  });

  for (const { agent, tool } of UNVERIFIED_PATCH) {
    it(`${agent} ${tool}: a patch whose key is unverified must name a file`, () => {
      assert.equal(profileInboundTool(agent, tool)?.kind, "patch");
      assert.equal(pathRequiredFor(agent, tool), true);
    });
  }

  it("keeps the documented readings and the unidentified agent as they were", () => {
    // Codex documents apply_patch's key (command): an unreadable patch stays a notice.
    assert.equal(pathRequiredFor("codex", "apply_patch"), false);
    // An event no agent was selected for reads the merged alias. A patch keeps
    // the notice (Codex sends apply_patch through the unchanged Claude plugin),
    // and a file write any agent marks needs its path.
    assert.equal(pathRequiredFor("claude", "apply_patch"), false);
    assert.equal(pathRequiredFor("claude", "edit"), true);
    assert.equal(pathRequiredFor("claude", "str_replace_editor"), true);
    assert.equal(pathRequiredFor("claude", "Write"), false);
    assert.equal(pathRequiredFor("nope", "edit"), true);
    assert.equal(pathRequiredFor("nope", "Write"), false);
    // Agents that document their keys.
    assert.equal(pathRequiredFor("qwen", "edit"), false);
    assert.equal(pathRequiredFor("goose", "write"), false);
    assert.equal(pathRequiredFor("grok", "Write"), false);
    assert.equal(pathRequiredFor("cursor", "Write"), false);
    assert.equal(pathRequiredFor("droid", "Edit"), false);
  });

  it("gives null for an agent with no profile, a name the agent does not use, and the claude agent", () => {
    assert.equal(profileInboundTool("nope", "edit"), null);
    assert.equal(profileInboundTool("grok", "edit"), null);
    assert.equal(profileInboundTool("claude", "Write"), null);
    assert.equal(profileInboundTool("grok", ""), null);
    assert.equal(profileInboundTool("grok", "constructor"), null);
  });

  it("reads a Claude-named tool with its agent's keys: Grok Write reads path, filePath, target_file and file_path", () => {
    const own = profileInboundTool("grok", "Write")!;
    for (const key of ["path", "filePath", "target_file", "file_path"]) assert.deepEqual(inboundPaths(own, { [key]: "a.txt" }), ["a.txt"], key);
  });
});

describe("every Claude-named write tool of every agent, through the gate and config-guard (in process)", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ci-agent-claude-named-")));
  roots.push(root);
  const project = join(root, "project");
  const unread = join(project, "unread.txt");
  const settings = join(project, ".claude", "settings.json");
  const saved: Record<string, string | undefined> = {};
  const ENV = { CI_INSTINCTS_HOME: join(root, "instincts"), GATEGUARD_SESSION_DIR: join(root, "session"), CI_GATEGUARD_EXCLUDE: "", CLAUDE_GATEGUARD_EXCLUDE: "" };
  const payload = (tool: string, input: Record<string, unknown>): Record<string, unknown> => ({ session_id: "s1", cwd: project, hook_event_name: "PreToolUse", tool_name: tool, tool_input: input });
  const decide = (agent: string, tool: string, input: Record<string, unknown>) =>
    decideGateguard(normalizeEvent(agent, "PreToolUse", payload(tool, input)), readGateguardConfig({}, "/plugin/bin/gateguard-clear.mjs"));

  before(() => {
    for (const [key, value] of Object.entries(ENV)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
    mkdirSync(join(project, ".claude"), { recursive: true });
    mkdirSync(ENV.GATEGUARD_SESSION_DIR, { recursive: true });
    writeFileSync(unread, "a\n");
    writeFileSync(settings, "{}\n");
    // An observation log with a row for another file: the gate can judge, and finds no read.
    const logDir = join(ENV.CI_INSTINCTS_HOME, hashProjectRoot(resolveProjectRoot(payload("Write", {}))));
    mkdirSync(logDir, { recursive: true });
    const row = { ts: "2026-11-22T00:00:00Z", event: "tool_complete", session: "s1", tool: "Read", input_summary: join(project, "other.txt"), output_summary: "a" };
    writeFileSync(join(logDir, "observations.jsonl"), `${JSON.stringify(row)}\n`);
  });
  after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const claudeNamed = AGENT_PROFILES.flatMap((profile) =>
    Object.entries(profile.tools)
      .filter(([name, spec]) => CLAUDE_TOOL_NAMES.includes(name) && spec.kind === "file-write")
      .map(([name]) => ({ agent: profile.id, tool: name })),
  );

  it("finds the Claude-named write tools the profiles list", () => {
    assert.deepEqual(claudeNamed.map((entry) => `${entry.agent}.${entry.tool}`).sort(), ["cursor.Write", "droid.Edit", "grok.Write", "junie.Edit", "junie.Write"]);
  });

  for (const { agent, tool } of claudeNamed) {
    it(`${agent} ${tool}: an unread file at each key its agent reads, and at file_path, is denied`, async () => {
      for (const key of new Set([...profileInboundTool(agent, tool)!.input.path, "file_path"])) {
        const decision = await decide(agent, tool, { [key]: unread, content: "x" });
        assert.equal(decision.kind, "deny", `${agent} ${tool} ${key}`);
        assert.ok(decision.kind === "deny" && decision.reason.includes("unread.txt"), `${agent} ${tool} ${key}`);
      }
    });

    it(`${agent} ${tool}: config-guard reports .claude/settings.json at each key`, () => {
      for (const key of new Set([...profileInboundTool(agent, tool)!.input.path, "file_path"])) {
        const hit = classifyMutation(tool, { [key]: settings, content: "{}" }, agent);
        assert.equal(hit?.via, "file", `${agent} ${tool} ${key}`);
        assert.equal(hit?.target, settings, `${agent} ${tool} ${key}`);
      }
    });
  }

  it("junie Write and Edit that name no file are denied and reported", async () => {
    for (const tool of ["Write", "Edit"]) {
      const decision = await decide("junie", tool, { content: "x", file: unread });
      assert.equal(decision.kind, "deny", tool);
      assert.ok(decision.kind === "deny" && decision.reason.includes(`no-path:${tool}`), tool);
      assert.equal(classifyMutation(tool, { content: "x" }, "junie")?.via, "no-path", tool);
    }
  });

  it("a Claude Code event keeps reading file_path only, and a Claude write that names no file stays no mutation", async () => {
    assert.equal((await decide("claude", "Write", { path: unread, content: "x" })).kind, "allow");
    assert.equal((await decide("claude", "Write", { file_path: unread, content: "x" })).kind, "deny");
    assert.equal(classifyMutation("Write", { path: settings, content: "{}" }, "claude"), null);
    assert.equal(classifyMutation("Write", { path: settings, content: "{}" }), null);
    assert.equal(classifyMutation("Write", {}, "grok"), null);
  });

  it("a known agent whose key is documented needs no extra path: Cursor Write naming no file is no mutation", () => {
    assert.equal(classifyMutation("Write", { content: "x" }, "cursor"), null);
  });

  for (const { agent, tool } of NEWLY_REQUIRED.filter((entry) => !CLAUDE_TOOL_NAMES.includes(entry.tool))) {
    it(`${agent} ${tool}: a write naming no file is denied and reported`, async () => {
      const decision = await decide(agent, tool, { content: "x" });
      assert.equal(decision.kind, "deny", `${agent} ${tool}`);
      assert.ok(decision.kind === "deny" && decision.reason.includes(`no-path:${tool}`), decision.kind === "deny" ? decision.reason : "");
      assert.equal(classifyMutation(tool, { content: "x" }, agent)?.via, "no-path");
      assert.equal(classifyMutation(tool, { content: "x" })?.via, "no-path", "the merged alias too");
    });
  }

  for (const { agent, tool } of UNVERIFIED_PATCH) {
    it(`${agent} ${tool}: a patch under an unread key, or with no file header, is denied and reported`, async () => {
      for (const input of [{ diff: patchFor(unread) }, { command: "*** Begin Patch\n*** End Patch" }, {}]) {
        const decision = await decide(agent, tool, input);
        const where = `${agent} ${tool} ${JSON.stringify(input)}`;
        assert.equal(decision.kind, "deny", where);
        const reason = decision.kind === "deny" ? decision.reason : "";
        assert.ok(reason.includes(`no-path:${tool}`), reason);
        for (const key of PATCH_KEYS) assert.ok(reason.includes(key), `${reason}\nnames ${key}`);
        assert.equal(classifyMutation(tool, input, agent)?.via, "no-path", where);
      }
      // A patch whose header the gate reads is gated on that file as before.
      const read = await decide(agent, tool, { patch: patchFor(unread) });
      assert.ok(read.kind === "deny" && read.reason.includes("unread.txt"));
      assert.equal(classifyMutation(tool, { input: patchFor(settings) }, agent)?.via, "file");
    });
  }

  it("codex apply_patch, and an apply_patch no agent was selected for, keep the notice for a patch with no file header", async () => {
    for (const agent of ["codex", "claude"]) {
      const decision = await decide(agent, "apply_patch", { command: "*** Begin Patch\n*** End Patch" });
      assert.equal(decision.kind, "allow", agent);
      assert.match(decision.notices?.[0] ?? "", /apply_patch names no file the gate can read/, agent);
      assert.equal(classifyMutation("apply_patch", { command: "*** Begin Patch\n*** End Patch" }, agent), null, agent);
    }
  });
});

// The repro cells end to end through the installed hooks, each in its agent's
// verified payload shape (fixtures/agent-matrix/<agent>.json evidence.edit and
// evidence.read).
function agentFixture(agent: string, part: "edit" | "read", file: string, project: string): Record<string, unknown> {
  const fx = JSON.parse(readFileSync(join(REPO_ROOT, "fixtures", "agent-matrix", `${agent}.json`), "utf8")) as { evidence: Record<string, unknown> };
  const slashed = project.split("\\").join("/");
  const text = JSON.stringify(fx.evidence[part])
    .split("<SESSION>").join("s1")
    .split("<PROJECT>").join(slashed)
    .split("<HOME>").join(slashed)
    .split("<FILE>").join(file);
  return JSON.parse(text) as Record<string, unknown>;
}

function agentPre(agent: string, tool: string, input: Record<string, unknown>, project: string): unknown {
  const payload = agentFixture(agent, "edit", "unused", project);
  if ("toolArgs" in payload) return { ...payload, toolName: tool, toolArgs: JSON.stringify(input) };
  const out: Record<string, unknown> = { ...payload, tool_name: tool, tool_input: input };
  if ("toolName" in payload) out.toolName = tool;
  if ("toolInput" in payload) out.toolInput = input;
  return out;
}

function denyOf(agent: string, run: Run, where: string): string {
  const shape = (JSON.parse(readFileSync(join(REPO_ROOT, "fixtures", "agent-matrix", `${agent}.json`), "utf8")) as { expect: { deny: DenyShape } }).expect.deny;
  const detail = `${where}\nstatus: ${run.status}\nstdout: ${run.stdout}\nstderr: ${run.stderr}`;
  assert.equal(run.status, shape.exitCode, detail);
  if (shape.exitCode === 2) return run.stderr;
  assert.notEqual(run.stdout, "", detail);
  const reason = at(JSON.parse(run.stdout) as unknown, shape.reasonAt![0]!);
  assert.equal(typeof reason, "string", detail);
  return reason as string;
}

describe("the second-review repro cells through the installed hooks", () => {
  const cells: Array<{ agent: string; tool: string; key: string; extra: Record<string, unknown> }> = [
    { agent: "grok", tool: "Write", key: "path", extra: { content: "x" } },
    { agent: "grok", tool: "Write", key: "filePath", extra: { content: "x" } },
    { agent: "copilot", tool: "edit", key: "filePath", extra: { old_str: "a", new_str: "b" } },
    { agent: "devin", tool: "notebook_edit", key: "notebook_path", extra: { new_source: "x" } },
    { agent: "auggie", tool: "write", key: "filePath", extra: { content: "x" } },
    { agent: "junie", tool: "Write", key: "path", extra: { content: "x" } },
  ];

  for (const { agent, tool, key, extra } of cells) {
    it(`${agent} ${tool} {${key}}: the gate denies an unread file and config-guard block denies .claude/settings.json`, async () => {
      const { dirs, read, unread } = workspace();
      const flag = ["--agent", agent];
      // The observation log exists: this agent's own verified read of another file.
      assert.equal((await runScript("bin/observe.mjs", flag, agentFixture(agent, "read", read, dirs.project), dirs)).status, 0);
      const run = await runScript("hooks/gateguard.mjs", flag, agentPre(agent, tool, { [key]: unread, ...extra }, dirs.project), dirs);
      const reason = denyOf(agent, run, `${agent} ${tool} ${key}`);
      assert.ok(reason.includes("other.txt"), reason);
      const settings = `${dirs.project.split("\\").join("/")}/.claude/settings.json`;
      const blocked = await runScript("hooks/config-guard.mjs", flag, agentPre(agent, tool, { [key]: settings, ...extra }, dirs.project), dirs, { CI_CONFIG_GUARD: "block" });
      assert.ok(denyOf(agent, blocked, `${agent} ${tool} ${key} config-guard`).includes(".claude/settings.json"));
    });
  }

  it("devin apply_patch with the patch under diff: the gate denies with the no-path clear route, config-guard block denies", async () => {
    const { dirs, unread } = workspace();
    const flag = ["--agent", "devin"];
    const run = await runScript("hooks/gateguard.mjs", flag, agentPre("devin", "apply_patch", { diff: patchFor(unread) }, dirs.project), dirs);
    const reason = denyOf("devin", run, "devin apply_patch diff");
    assert.ok(reason.includes("no-path:apply_patch") && reason.includes("gateguard-clear"), reason);
    const settings = `${dirs.project.split("\\").join("/")}/.claude/settings.json`;
    const blocked = await runScript("hooks/config-guard.mjs", flag, agentPre("devin", "apply_patch", { diff: patchFor(settings) }, dirs.project), dirs, { CI_CONFIG_GUARD: "block" });
    assert.ok(denyOf("devin", blocked, "devin apply_patch diff config-guard").includes("apply_patch"));
  });
});
