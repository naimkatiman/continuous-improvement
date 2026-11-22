/**
 * Claude Code hook goldens.
 *
 * PR 1 of the all-agents train (docs/plans/2026-11-21-all-agents.md, "Claude
 * regression guard"). Every hook entry point the plugin wires in
 * plugins/continuous-improvement/hooks/hooks.json runs over the Claude Code
 * payloads in fixtures/agent-hooks/claude.json, and its stdout, stderr and exit
 * code must equal the golden recorded there against the v3.27.0 scripts. The
 * later refactors (hook-io, gateguard-decide, agent paths, encoders) have to
 * keep every golden byte-identical: a diff here is a Claude Code behaviour
 * change, not a fixture to refresh.
 *
 * Determinism. Each case gets its own temp root with `home/` and `project/`.
 * HOME and USERPROFILE point at that home, CLAUDE_PROJECT_DIR at that project,
 * and the child env is built from an allowlist (PATH, SystemRoot and the like),
 * so a CI_* or CLAUDE_* knob in the developer's shell never decides a golden.
 * GIT_CEILING_DIRECTORIES stops git from finding a repository above the temp
 * root. Session ids, transcript rows and observation timestamps are fixed in
 * the fixture, and no compared output carries the wall clock. Before
 * comparing, the temp paths, the repo root and the project hash are replaced by
 * <HOME>, <PROJECT>, <ROOT>, <REPO> and <PROJECT_HASH> in every spelling a hook
 * prints (native, forward-slash, JSON-escaped). A Node crash report keeps its
 * error and repository frames and loses what the runtime decides (see
 * normalizeNodeCrash), so it compares the same on every Node and OS in CI.
 *
 * Re-recording is for an intended Claude behaviour change only, stated in the
 * PR that makes it:
 *   npm run build && CI_RECORD_GOLDENS=1 node --test test/agent-claude-golden.test.mjs
 */

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { hashProjectRoot } from "../lib/gateguard-state.mjs";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const FIXTURE_PATH = join(REPO_ROOT, "fixtures", "agent-hooks", "claude.json");
const PLUGIN_HOOKS_JSON = join(REPO_ROOT, "plugins", "continuous-improvement", "hooks", "hooks.json");
const RECORD = process.env.CI_RECORD_GOLDENS === "1";
const STEP_TIMEOUT_MS = 30_000;
const IGNORE_CASE = process.platform === "win32";

// The only parent env a hook child sees. Everything a hook reads beyond these
// is set by the case, so the host's own gate configuration cannot leak in.
const INHERITED_ENV = new Set(["path", "pathext", "systemroot", "systemdrive", "windir", "comspec", "temp", "tmp", "tmpdir"]);

interface Golden {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

interface Step {
  hook: string;
  event: string;
  env?: Record<string, string | null>;
  stdin?: unknown;
  stdinRaw?: string;
  expect?: Golden;
}

interface Setup {
  dirs?: string[];
  files?: Record<string, unknown>;
  git?: string[][];
}

interface GoldenCase {
  id: string;
  note?: string;
  setup?: Setup;
  steps: Step[];
}

interface Fixture {
  cases: GoldenCase[];
  [key: string]: unknown;
}

interface CaseDirs {
  root: string;
  home: string;
  project: string;
  hash: string;
}

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;

function substitute(text: string, dirs: CaseDirs): string {
  return text
    .split("<PROJECT_HASH>").join(dirs.hash)
    .split("<HOME>").join(dirs.home)
    .split("<PROJECT>").join(dirs.project)
    .split("<ROOT>").join(dirs.root);
}

function substituteDeep(value: unknown, dirs: CaseDirs): unknown {
  if (typeof value === "string") return substitute(value, dirs);
  if (Array.isArray(value)) return value.map((item) => substituteDeep(item, dirs));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substituteDeep(item, dirs)]));
  }
  return value;
}

// A string is written as given, an array as JSON lines, an object as JSON.
function fileContent(spec: unknown, dirs: CaseDirs): string {
  const value = substituteDeep(spec, dirs);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((row) => `${JSON.stringify(row)}\n`).join("");
  return `${JSON.stringify(value, null, 2)}\n`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The spellings of one path a hook can print: native, forward-slash (the
// gateguard clear command), and JSON-escaped inside a stdout decision.
function pathForms(path: string): string[] {
  const forward = path.replace(/\\/g, "/");
  const forms = [path, forward, path.replace(/\\/g, "\\\\")];
  return [...new Set(forms)].sort((left, right) => right.length - left.length);
}

// The file URL spellings of a directory in a Node stack trace: forward slashes
// behind file:/// on Windows or file:// on POSIX, raw or percent-encoded.
function fileUrlForms(path: string): string[] {
  const forward = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const url = `file://${forward.startsWith("/") ? "" : "/"}${forward}`;
  return [...new Set([url, encodeURI(url)])].sort((left, right) => right.length - left.length);
}

// An uncaught exception makes Node print the throwing source line, the stack
// and a "Node.js v<version>" trailer. The golden keeps what the hook decides
// (the error, the repository frames, exit code 1) and drops what the runtime
// decides: the version, frames outside the repository, CRLF line ends on Windows, and
// line and column numbers that move with any edit to the generated .mjs. The
// same crash on Node 18 to 24, Windows or Linux, normalizes to the same text.
function normalizeNodeCrash(text: string, repoRoot: string): string {
  if (!/\r?\nNode\.js v\d+\.\d+\.\d+\r?\n?$/.test(text)) return text;
  const trailer = /\nNode\.js v\d+\.\d+\.\d+\n?$/;
  let out = text.replace(/\r\n/g, "\n");
  for (const form of fileUrlForms(repoRoot)) {
    out = out.replace(new RegExp(escapeRegExp(form), IGNORE_CASE ? "gi" : "g"), "<REPO_URL>");
  }
  const lines = out
    .replace(/^<REPO_URL>\S*:\d+\n.*\n[ \t]*\^+[ \t]*\n\n/, "")
    .replace(trailer, "\nNode.js <NODE_VERSION>\n")
    .split("\n");
  return lines
    .filter((line) => !/^\s+at /.test(line) || line.includes("<REPO_URL>"))
    .map((line) => line.replace(/(<REPO_URL>[^\s:()]*):\d+:\d+/g, "$1:<LINE>:<COL>"))
    .join("\n");
}

function normalize(text: string, dirs: CaseDirs): string {
  const replacements: Array<[string, string]> = [
    ["<HOME>", dirs.home],
    ["<PROJECT>", dirs.project],
    ["<ROOT>", dirs.root],
    ["<REPO>", REPO_ROOT.replace(/[\\/]+$/, "")],
  ];
  let out = normalizeNodeCrash(text, REPO_ROOT);
  for (const [placeholder, path] of replacements) {
    for (const form of pathForms(path)) {
      out = out.replace(new RegExp(escapeRegExp(form), IGNORE_CASE ? "gi" : "g"), placeholder);
    }
  }
  return out.split(dirs.hash).join("<PROJECT_HASH>");
}

function baseEnv(dirs: CaseDirs): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (INHERITED_ENV.has(key.toLowerCase()) && value !== undefined) env[key] = value;
  }
  env.HOME = dirs.home;
  env.USERPROFILE = dirs.home;
  env.CLAUDE_PROJECT_DIR = dirs.project;
  env.GIT_CEILING_DIRECTORIES = dirname(dirs.root);
  env.GIT_CONFIG_NOSYSTEM = "1";
  return env;
}

function stepEnv(step: Step, dirs: CaseDirs): NodeJS.ProcessEnv {
  const env = baseEnv(dirs);
  for (const [key, value] of Object.entries(step.env ?? {})) {
    if (value === null) delete env[key];
    else env[key] = substitute(value, dirs);
  }
  return env;
}

function stepStdin(step: Step, dirs: CaseDirs): string {
  if (typeof step.stdinRaw === "string") return step.stdinRaw;
  if (step.stdin === undefined) return "";
  return JSON.stringify(substituteDeep(step.stdin, dirs));
}

function runHook(script: string, stdin: string, env: NodeJS.ProcessEnv, cwd: string): Promise<Golden> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [join(REPO_ROOT, script)], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${script} did not exit within ${STEP_TIMEOUT_MS} ms`));
    }, STEP_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        exitCode: code,
      });
    });
    child.stdin.on("error", () => {
      // A hook that exits before reading stdin closes the pipe; that is its result, not a test error.
    });
    child.stdin.end(stdin);
  });
}

function prepare(goldenCase: GoldenCase): CaseDirs {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ci-claude-golden-")));
  const home = join(root, "home");
  const project = join(root, "project");
  mkdirSync(home);
  mkdirSync(project);
  const dirs: CaseDirs = { root, home, project, hash: hashProjectRoot(project) };
  const setup = goldenCase.setup ?? {};
  for (const dir of setup.dirs ?? []) mkdirSync(substitute(dir, dirs), { recursive: true });
  for (const [path, spec] of Object.entries(setup.files ?? {})) {
    const target = substitute(path, dirs);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, fileContent(spec, dirs));
  }
  for (const args of setup.git ?? []) {
    execFileSync("git", args, { cwd: project, env: baseEnv(dirs), stdio: ["ignore", "ignore", "pipe"] });
  }
  return dirs;
}

async function runCase(goldenCase: GoldenCase): Promise<Golden[]> {
  const dirs = prepare(goldenCase);
  try {
    const results: Golden[] = [];
    for (const step of goldenCase.steps) {
      const raw = await runHook(step.hook, stepStdin(step, dirs), stepEnv(step, dirs), dirs.project);
      results.push({ stdout: normalize(raw.stdout, dirs), stderr: normalize(raw.stderr, dirs), exitCode: raw.exitCode });
    }
    return results;
  } finally {
    rmSync(dirs.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

const recorded = new Map<string, Golden[]>();

describe("Claude Code hook goldens (fixtures/agent-hooks/claude.json)", { concurrency: 8 }, () => {
  after(() => {
    if (!RECORD) return;
    const cases = fixture.cases.map((goldenCase) => {
      const goldens = recorded.get(goldenCase.id);
      if (!goldens) return goldenCase;
      return { ...goldenCase, steps: goldenCase.steps.map((step, index) => ({ ...step, expect: goldens[index] })) };
    });
    writeFileSync(FIXTURE_PATH, `${JSON.stringify({ ...fixture, cases }, null, 2)}\n`);
  });

  for (const goldenCase of fixture.cases) {
    it(goldenCase.id, async () => {
      const results = await runCase(goldenCase);
      if (RECORD) {
        recorded.set(goldenCase.id, results);
        return;
      }
      results.forEach((result, index) => {
        const step = goldenCase.steps[index]!;
        const label = `${goldenCase.id} step ${index + 1} (${step.hook} ${step.event})`;
        assert.ok(step.expect, `${label} has no recorded golden`);
        assert.deepEqual(result, step.expect, `${label} no longer matches the v3.27.0 golden`);
      });
    });
  }
});

const NON_OBJECT_STDIN = ["null", "[]"];
const BAD_STDIN = ["{not json", ""];

// The env that switches each opt-in Stop and prompt hook on.
const ENABLED_MODE: Record<string, Record<string, string>> = {
  "hooks/recall-briefing.mjs": { CLAUDE_RECALL_BRIEFING: "1" },
  "hooks/three-section-close.mjs": { CLAUDE_THREE_SECTION_CLOSE: "1" },
  "hooks/goal-drift-stop.mjs": { CLAUDE_GOAL_DRIFT_GATE: "block" },
  "hooks/workflow-distill.mjs": { CLAUDE_WORKFLOW_DISTILL_NUDGE: "on" },
  "hooks/typecheck-stop.mjs": { CLAUDE_TYPECHECK_GATE: "block" },
  "hooks/query-cost-nudge.mjs": { CLAUDE_QUERY_COST_NUDGE: "on" },
};

function wiredHooks(): Array<{ script: string; event: string }> {
  const wiring = JSON.parse(readFileSync(PLUGIN_HOOKS_JSON, "utf8")) as {
    hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
  };
  const wired: Array<{ script: string; event: string }> = [];
  for (const [event, groups] of Object.entries(wiring.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        const script = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"/.exec(hook.command)?.[1];
        assert.ok(script, `unrecognised hook command in hooks.json: ${hook.command}`);
        wired.push({ script, event });
      }
    }
  }
  return wired;
}

function hookEntryPoints(): string[] {
  return readdirSync(join(REPO_ROOT, "hooks"))
    .filter((file) => file.endsWith(".mjs"))
    .map((file) => `hooks/${file}`);
}

describe("Node crash normalization", () => {
  const crash = (root: string, version: string, internal: string[]): string => {
    const url = fileUrlForms(root)[0]!;
    return [
      `${url}/hooks/gateguard.mjs:401`,
      '    const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "";',
      "                                    ^",
      "",
      "TypeError: Cannot read properties of null (reading 'tool_name')",
      `    at main (${url}/hooks/gateguard.mjs:401:37)`,
      `    at ${url}/hooks/gateguard.mjs:514:7`,
      ...internal,
      "",
      `Node.js ${version}`,
      "",
    ].join("\n");
  };
  const expected = [
    "TypeError: Cannot read properties of null (reading 'tool_name')",
    "    at main (<REPO_URL>/hooks/gateguard.mjs:<LINE>:<COL>)",
    "    at <REPO_URL>/hooks/gateguard.mjs:<LINE>:<COL>",
    "",
    "Node.js <NODE_VERSION>",
    "",
  ].join("\n");

  // Node on Windows ends the lines of an uncaught-exception report with CRLF.
  it("gives a Windows Node 24 crash and a Linux Node 18 crash the same text", () => {
    const windows = crash("D:\\a\\ci\\ci", "v24.12.0", [
      "    at ModuleJob.run (node:internal/modules/esm/module_job:413:25)",
      "    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:660:26)",
    ]).replace(/\n/g, "\r\n");
    const linux = crash("/home/runner/work/ci/ci", "v18.20.8", [
      "    at ModuleJob.run (node:internal/modules/esm/module_job:194:25)",
      "    at async Promise.all (index 0)",
    ]);
    assert.equal(normalizeNodeCrash(windows, "D:\\a\\ci\\ci"), expected);
    assert.equal(normalizeNodeCrash(linux, "/home/runner/work/ci/ci"), expected);
  });

  it("matches a percent-encoded repository URL", () => {
    const root = "/home/runner/my repo";
    assert.equal(normalizeNodeCrash(crash(root, "v20.19.0", []), root), expected);
    assert.match(fileUrlForms(root)[0]!, /my%20repo/);
  });

  it("leaves stderr without a crash trailer unchanged", () => {
    const warning = "[gateguard] unknown CI_GATEGUARD_FILE_GATE value; using evidence\n    at the default\n";
    assert.equal(normalizeNodeCrash(warning, "/home/runner/work/ci/ci"), warning);
    assert.equal(normalizeNodeCrash("", "/home/runner/work/ci/ci"), "");
  });
});

describe("Claude golden fixture coverage", () => {
  const steps = fixture.cases.flatMap((goldenCase) => goldenCase.steps);
  const covered = new Set(steps.map((step) => `${step.hook} ${step.event}`));

  it("has a case for every hook and event the plugin wires", () => {
    const wired = wiredHooks();
    assert.ok(wired.length > 0, "hooks.json wires no hooks");
    assert.deepEqual(wired.map(({ script, event }) => `${script} ${event}`).filter((key) => !covered.has(key)), []);
  });

  it("has a case for every hook entry point under hooks/", () => {
    const hooksInFixture = new Set(steps.map((step) => step.hook));
    assert.deepEqual(hookEntryPoints().filter((hook) => !hooksInFixture.has(hook)), []);
  });

  // JSON that parses but is not an object reaches property reads that a parse
  // failure never does (v3.27.0 gateguard, companion-preference and an enabled
  // route-prompt crash on null), so every hook pins both.
  it("gives every hook a golden for stdin that is JSON but not an object", () => {
    const hooks = [...new Set([...wiredHooks().map(({ script }) => script), ...hookEntryPoints()])];
    const missing: string[] = [];
    for (const hook of hooks) {
      for (const raw of NON_OBJECT_STDIN) {
        if (!steps.some((step) => step.hook === hook && step.stdinRaw === raw)) missing.push(`${hook} ${raw}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  // An opt-in hook that is off returns before it reads stdin, so its
  // parse-failure path only runs with the hook switched on.
  it("runs malformed and empty stdin through each opt-in Stop and prompt hook switched on", () => {
    const missing: string[] = [];
    for (const [hook, enabled] of Object.entries(ENABLED_MODE)) {
      for (const raw of BAD_STDIN) {
        const found = steps.some(
          (step) =>
            step.hook === hook &&
            step.stdinRaw === raw &&
            Object.entries(enabled).every(([key, value]) => step.env?.[key] === value),
        );
        if (!found) missing.push(`${hook} ${JSON.stringify(raw)}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  it("marks the goldens that pin the v3.27.0 NotebookEdit defect", () => {
    const byId = new Map(fixture.cases.map((goldenCase) => [goldenCase.id, goldenCase]));
    const blind = byId.get("gateguard/evidence-blind-notebook-edit-allow");
    assert.ok(blind, "no golden for a blind NotebookEdit with an observation log present");
    const logged = Object.keys(blind.setup?.files ?? {}).some((path) => path.endsWith("/observations.jsonl"));
    assert.ok(logged, "the blind NotebookEdit case has no observation log, so it tests the no-log path");
    const payload = blind.steps[0]?.stdin as { tool_name?: unknown } | undefined;
    assert.equal(payload?.tool_name, "NotebookEdit");
    for (const id of ["gateguard/evidence-blind-notebook-edit-allow", "gateguard/strict-notebook-edit-deny"]) {
      const note = byId.get(id)?.note ?? "";
      assert.match(note, /notebook_path/, `${id} does not say which key gateguard ignores`);
      assert.match(note, /v3\.27\.0 defect/, `${id} does not say it pins a known defect`);
      assert.match(note, /docs\/deferred\.md/, `${id} does not point at the deferred fix`);
    }
  });

  it("gives every case a unique id and every payload the event its step names", () => {
    const ids = fixture.cases.map((goldenCase) => goldenCase.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate case id");
    for (const step of steps) {
      const payload = step.stdin as { hook_event_name?: unknown } | undefined;
      if (payload && typeof payload === "object" && "hook_event_name" in payload) {
        assert.equal(payload.hook_event_name, step.event, `${step.hook}: stdin event differs from step event`);
      }
    }
  });
});
