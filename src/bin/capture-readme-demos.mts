#!/usr/bin/env node

/**
 * README demo capture
 *
 * Runs every demo the README shows against this checkout's built code and
 * writes the normalised output to demo/captures/demos.json. The README images
 * (bin/render-readme-assets.mjs) draw their terminal text from that file, and
 * a test fails when a card shows a line the capture does not hold, so no demo
 * output is typed by hand.
 *
 * Each demo runs in its own temp HOME/USERPROFILE with a minimal inherited env
 * (PATH and the Windows system variables only), so neither the host's real
 * instincts store nor a switch such as CI_GATEGUARD_EXCLUDE reaches a hook.
 * Every agent's payload comes from fixtures/agent-matrix/<id>.json. The output
 * is normalised so it reads the same on any host: each temp root becomes "~",
 * this checkout "<plugin>", the 12-hex project bucket "<hash>" and a git SHA
 * "<sha>". Two runs on one checkout give the same file byte for byte.
 *
 * Destructive commands are assembled from parts here, so no shell line or file
 * in the repository spells one out for a host guard to trip on.
 *
 * Usage:
 *   npm run build && node bin/capture-readme-demos.mjs          # writes demo/captures/demos.json
 *   node bin/capture-readme-demos.mjs --stdout                  # prints it instead
 *   node bin/render-readme-assets.mjs --write                   # then redraw the images
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { argv, cwd, execPath, exit, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { hashProjectRoot } from "../lib/gateguard-state.mjs";

export const CAPTURE_FILE = "demo/captures/demos.json";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

export interface Step {
  /** What this step is, or the agent it ran for. */
  label: string;
  /** The command line that ran, with the repo-relative script. */
  run: string;
  stdin?: string;
  exit: number | null;
  stdout: string;
  stderr: string;
  /** Files the step left behind, normalised. */
  files?: string[];
}

export interface Demo {
  id: string;
  title: string;
  how: string;
  steps: Step[];
}

export interface Capture {
  about: string;
  /** package.json version of the checkout the demos ran on. */
  version: string;
  /** True when CHANGELOG.md has entries under [Unreleased], so the code is ahead of that version. */
  unreleased: boolean;
  demos: Demo[];
}

const INHERITED = new Set(["path", "pathext", "systemroot", "systemdrive", "windir", "comspec", "temp", "tmp", "tmpdir"]);
const FORCE_PUSH = ["git", "push", "--force", "origin", "main"].join(" ");
const RM_PROBE = ["rm", "-rf", "./ci-guard-probe-does-not-exist"].join(" ");
const PUSH_MAIN = ["git", "push", "origin", "main"].join(" ");
const BENIGN = "git status";

interface Dirs {
  root: string;
  home: string;
  project: string;
}

interface Agent {
  id: string;
  label: string;
  flag: string[];
  env: (d: Dirs) => Record<string, string>;
}

// How each agent's own install wires the hook: --agent <id> (Claude Code is
// the default and gets no flag), plus the env that agent sets on its hooks.
const AGENTS: readonly Agent[] = [
  { id: "claude", label: "Claude Code", flag: [], env: (d) => ({ CLAUDE_PROJECT_DIR: d.project }) },
  { id: "codex", label: "Codex CLI", flag: ["--agent", "codex"], env: () => ({}) },
  { id: "gemini", label: "Gemini CLI", flag: ["--agent", "gemini"], env: (d) => ({ GEMINI_SESSION_ID: "gemini-session", GEMINI_PROJECT_DIR: d.project, CLAUDE_PROJECT_DIR: d.project }) },
  { id: "cursor", label: "Cursor", flag: ["--agent", "cursor"], env: (d) => ({ CURSOR_VERSION: "3.20.17", CURSOR_PROJECT_DIR: d.project, CLAUDE_PROJECT_DIR: d.project }) },
  { id: "copilot", label: "GitHub Copilot CLI", flag: ["--agent", "copilot"], env: () => ({}) },
  { id: "kiro", label: "Kiro CLI", flag: ["--agent", "kiro"], env: () => ({}) },
];

function agent(id: string): Agent {
  const found = AGENTS.find((a) => a.id === id);
  if (!found) throw new Error(`no agent ${id}`);
  return found;
}

const slash = (path: string): string => path.split("\\").join("/");

class Session {
  private readonly roots: string[] = [];
  private readonly swaps: Array<[string, string]> = [];

  constructor(private readonly repo: string, private readonly runs: string) {
    this.addPath(repo, "<plugin>");
  }

  newRoot(tag: string): Dirs {
    const root = realpathSync.native(mkdtempSync(join(this.runs, `${tag}-`)));
    this.roots.push(root);
    this.addPath(root, "~");
    const project = join(root, "project");
    mkdirSync(project, { recursive: true });
    return { root, home: root, project };
  }

  cleanup(): void {
    for (const root of this.roots) rmSync(root, { recursive: true, force: true });
    rmSync(this.runs, { recursive: true, force: true });
  }

  env(dirs: Dirs, extra: Record<string, string> = {}): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (INHERITED.has(key.toLowerCase()) && value !== undefined) env[key] = value;
    }
    return { ...env, HOME: dirs.home, USERPROFILE: dirs.home, GIT_CEILING_DIRECTORIES: dirs.root, GIT_CONFIG_NOSYSTEM: "1", ...extra };
  }

  run(script: string, args: string[], dirs: Dirs, stdin = "", extra: Record<string, string> = {}): Promise<{ exit: number | null; stdout: string; stderr: string }> {
    return new Promise((done, fail) => {
      const child = spawn(execPath, [join(this.repo, script), ...args], { cwd: dirs.project, env: this.env(dirs, extra), stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => (out += chunk));
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => (err += chunk));
      const timer = setTimeout(() => child.kill(), 60_000);
      child.on("error", fail);
      child.on("close", (status) => {
        clearTimeout(timer);
        done({ exit: status, stdout: out, stderr: err });
      });
      child.stdin.end(stdin);
    });
  }

  git(dirs: Dirs, args: string[], at = dirs.project): string {
    const r = spawnSync("git", ["-c", "user.name=demo", "-c", "user.email=demo@example.invalid", "-c", "core.autocrlf=false", "-c", "init.defaultBranch=main", ...args], {
      cwd: at,
      env: this.env(dirs, { GIT_AUTHOR_DATE: "2026-11-22T09:00:00Z", GIT_COMMITTER_DATE: "2026-11-22T09:00:00Z" }),
      encoding: "utf8",
    });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
    return r.stdout.trim();
  }

  addPath(abs: string, replacement: string): void {
    const variants = new Set([abs, slash(abs), abs.split("\\").join("\\\\")]);
    for (const v of [...variants]) {
      if (/^[A-Za-z]:/.test(v)) {
        variants.add(v[0]!.toLowerCase() + v.slice(1));
        variants.add(v[0]!.toUpperCase() + v.slice(1));
        variants.add(`/${v[0]!.toLowerCase()}${v.slice(2)}`);
      }
    }
    for (const v of variants) this.swaps.push([v, replacement]);
  }

  addLiteral(value: string, replacement: string): void {
    this.swaps.push([value, replacement]);
  }

  /** Learn each project bucket the hooks created, so it reads as <hash>. */
  collectHashes(dirs: Dirs): void {
    let entries: string[] = [];
    try {
      entries = readdirSync(join(dirs.home, ".claude", "instincts"));
    } catch {
      return;
    }
    for (const entry of entries) if (/^[0-9a-f]{12}$/.test(entry)) this.addLiteral(entry, "<hash>");
  }

  /** Literal swaps, longest first, then forward slashes after a normalised root. */
  text(value: string): string {
    let out = value;
    for (const [from, to] of [...this.swaps].sort((x, y) => y[0].length - x[0].length)) out = out.split(from).join(to);
    return out.replace(/(~|<plugin>)((?:[\\/][A-Za-z0-9._@<>-]+)+)/g, (_m, head: string, tail: string) => head + slash(tail));
  }

  private deep(value: Json): Json {
    if (typeof value === "string") return this.text(value);
    if (Array.isArray(value)) return value.map((v) => this.deep(v));
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.deep(v)]));
    return value;
  }

  /** A line that is compact JSON is decoded, normalised and re-encoded, so an escape is never read as a path separator. */
  output(text: string): string {
    return text
      .split("\n")
      .map((line) => {
        try {
          const parsed = JSON.parse(line) as Json;
          if (parsed !== null && typeof parsed === "object" && JSON.stringify(parsed) === line) return JSON.stringify(this.deep(parsed));
        } catch {
          // not JSON: normalise as text
        }
        return this.text(line);
      })
      .join("\n");
  }

  /** Literal swaps only, for values learnt after a string was captured (the project bucket). */
  literal(value: string): string {
    let out = value;
    for (const [from, to] of [...this.swaps].sort((x, y) => y[0].length - x[0].length)) out = out.split(from).join(to);
    return out;
  }
}

function fill(value: Json, map: Record<string, string>): Json {
  if (typeof value === "string") {
    let s = value;
    for (const [k, v] of Object.entries(map)) s = s.split(k).join(v);
    return s;
  }
  if (Array.isArray(value)) return value.map((x) => fill(x, map));
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, map)]));
  return value;
}

function fixture(repo: string, id: string): JsonObject {
  return JSON.parse(readFileSync(join(repo, "fixtures", "agent-matrix", `${id}.json`), "utf8")) as JsonObject;
}

function pick(obj: Json, ...keys: string[]): Json {
  let at: Json = obj;
  for (const key of keys) {
    if (at === null || typeof at !== "object" || Array.isArray(at) || !(key in at)) throw new Error(`fixture has no ${keys.join(".")}`);
    at = at[key]!;
  }
  return at;
}

function placeholders(dirs: Dirs, extra: Record<string, string> = {}): Record<string, string> {
  return { "<HOME>": slash(dirs.home), "<PROJECT>": slash(dirs.project), ...extra };
}

function hookRun(script: string, a: Agent): string {
  return ["node", script, ...a.flag].join(" ");
}

function unreleased(repo: string): boolean {
  let text = "";
  try {
    text = readFileSync(join(repo, "CHANGELOG.md"), "utf8");
  } catch {
    return false;
  }
  const lines = text.replace(/\r/g, "").split("\n");
  const start = lines.findIndex((line) => /^##\s+\[Unreleased\]/i.test(line));
  if (start === -1) return false;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return rest.slice(0, end === -1 ? rest.length : end).some((line) => /^\s*[-*+]\s+\S/.test(line));
}

export async function capture(repoArg: string): Promise<Capture> {
  const repo = realpathSync.native(resolve(repoArg));
  const runs = mkdtempSync(join(tmpdir(), "ci-readme-demos-"));
  const s = new Session(repo, runs);
  const demos: Demo[] = [];
  try {
    // 1-3. One hook file, every agent: a force push to main, git status, the rm probe.
    {
      const dirs = s.newRoot("gate");
      const deny: Step[] = [];
      const allow: Step[] = [];
      for (const a of AGENTS) {
        const stdin = (command: string): string => JSON.stringify(fill(pick(fixture(repo, a.id), "events", "PreToolUse", "stdin"), placeholders(dirs, { "<COMMAND>": command })));
        for (const [list, command] of [[deny, FORCE_PUSH], [allow, BENIGN]] as const) {
          const r = await s.run("hooks/gateguard.mjs", a.flag, dirs, stdin(command), a.env(dirs));
          list.push({ label: a.label, run: hookRun("hooks/gateguard.mjs", a), stdin: s.output(stdin(command)), exit: r.exit, stdout: s.output(r.stdout), stderr: s.output(r.stderr) });
        }
      }
      demos.push({ id: "force-push", title: `${FORCE_PUSH}, sent by six agents to one hook file`, how: "Each agent's PreToolUse payload from fixtures/agent-matrix on stdin, one temp HOME.", steps: deny });
      demos.push({ id: "git-status", title: "git status, sent by the same six agents", how: "The same payloads with the command git status.", steps: allow });
      const claude = agent("claude");
      const probe = JSON.stringify(fill(pick(fixture(repo, "claude"), "events", "PreToolUse", "stdin"), placeholders(dirs, { "<COMMAND>": RM_PROBE })));
      const r = await s.run("hooks/gateguard.mjs", [], dirs, probe, claude.env(dirs));
      demos.push({ id: "rm-probe", title: "The README probe command, denied", how: "Claude Code's PreToolUse payload on stdin.", steps: [{ label: claude.label, run: hookRun("hooks/gateguard.mjs", claude), stdin: s.output(probe), exit: r.exit, stdout: s.output(r.stdout), stderr: s.output(r.stderr) }] });
    }

    // 4. The blind-edit gate on Codex CLI: denied, the read observed, the same edit allowed.
    {
      const a = agent("codex");
      const fx = fixture(repo, a.id);
      const dirs = s.newRoot("edit");
      mkdirSync(join(dirs.project, "src"), { recursive: true });
      writeFileSync(join(dirs.project, "src", "app.ts"), "a\n");
      const map = placeholders(dirs, { "<SESSION>": `${a.id}-session`, "<FILE>": slash(join(dirs.project, "src", "app.ts")) });
      const env = a.env(dirs);
      // With no observation log the gate has nothing to judge by and allows,
      // so the session starts with a logged git status.
      const first = fill(pick(fx, "events", "PostToolUse", "stdin"), { ...map, "<COMMAND>": BENIGN }) as JsonObject;
      for (const key of ["session_id", "conversation_id", "sessionId"]) if (key in first) first[key] = `${a.id}-session`;
      const edit = JSON.stringify(fill(pick(fx, "evidence", "edit"), map));
      const read = JSON.stringify(fill(pick(fx, "evidence", "read"), map));
      const plan: Array<[string, string, string]> = [
        ["the session's first call, git status, is logged", "bin/observe.mjs", JSON.stringify(first)],
        ["edit src/app.ts before reading it", "hooks/gateguard.mjs", edit],
        ["the read of src/app.ts is logged", "bin/observe.mjs", read],
        ["the same edit again", "hooks/gateguard.mjs", edit],
      ];
      const steps: Step[] = [];
      for (const [label, script, stdin] of plan) {
        const r = await s.run(script, a.flag, dirs, stdin, env);
        steps.push({ label, run: hookRun(script, a), stdin: s.output(stdin), exit: r.exit, stdout: s.output(r.stdout), stderr: s.output(r.stderr) });
      }
      s.collectHashes(dirs);
      demos.push({ id: "blind-edit-codex", title: "Codex CLI: a blind edit denied, the read logged, the same edit allowed", how: "Four runs in one temp project and HOME; src/app.ts exists on disk.", steps: steps.map((step) => ({ ...step, stdin: s.literal(step.stdin ?? ""), stdout: s.literal(step.stdout), stderr: s.literal(step.stderr) })) });
    }

    // 5. A lesson saved through the MCP server loads at the next session start.
    {
      const dirs = s.newRoot("session");
      const rpc = [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "demo", version: "0" } } },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "ci_create_instinct", arguments: { id: "build-before-stage", trigger: "when staging generated files", body: "Run npm run build first; the .mjs files are generated.", confidence: 0.8 } } },
      ].map((m) => JSON.stringify(m)).join("\n") + "\n";
      const mcp = await s.run("bin/mcp-server.mjs", ["--mode", "expert"], dirs, rpc, { CLAUDE_PROJECT_DIR: dirs.project });
      const reply = mcp.stdout.split("\n").find((line) => line.includes('"id":2'));
      s.collectHashes(dirs);
      const store = join(dirs.home, ".claude", "instincts");
      const files = readdirSync(store).flatMap((d) => {
        try {
          return readdirSync(join(store, d)).filter((f) => f.endsWith(".yaml")).map((f) => s.literal(`~/.claude/instincts/${d}/${f}`));
        } catch {
          return [];
        }
      });
      const steps: Step[] = [{ label: "ci_create_instinct over MCP", run: "node bin/mcp-server.mjs --mode expert", stdin: s.output(rpc.split("\n")[2] ?? ""), exit: mcp.exit, stdout: s.literal(s.output(reply ?? mcp.stdout)), stderr: s.literal(s.output(mcp.stderr)), files }];
      const gemini = agent("gemini");
      const stdin = JSON.stringify(fill(pick(fixture(repo, gemini.id), "events", "SessionStart", "stdin"), placeholders(dirs)));
      const r = await s.run("hooks/session.mjs", gemini.flag, dirs, stdin, gemini.env(dirs));
      steps.push({ label: "Gemini CLI starts a session", run: hookRun("hooks/session.mjs", gemini), stdin: s.literal(s.output(stdin)), exit: r.exit, stdout: s.literal(s.output(r.stdout)), stderr: s.literal(s.output(r.stderr)) });
      demos.push({ id: "session-lesson", title: "A lesson saved over MCP loads when Gemini CLI starts a session", how: "The MCP server over stdio (initialize, then tools/call), then the SessionStart hook, in one temp HOME.", steps });
    }

    // 6. The installer's dry run for Gemini CLI hooks.
    {
      const dirs = s.newRoot("install");
      // A project-scope install needs a git repository; outside one it writes nothing and exits 1.
      // The run line names the npx form the README gives; it runs this checkout's bin/install.mjs.
      s.git(dirs, ["init", "-q"]);
      const args = ["install", "--target", "gemini", "--hooks", "--dry-run"];
      const r = await s.run("bin/install.mjs", args, dirs);
      demos.push({ id: "install-dry-run", title: "Installer dry run for Gemini CLI", how: "bin/install.mjs in a temp git repository with a temp HOME.", steps: [{ label: "dry run", run: `npx continuous-improvement ${args.join(" ")}`, exit: r.exit, stdout: s.output(r.stdout), stderr: s.output(r.stderr), files: readdirSync(dirs.project) }] });
    }

    // 7. The push gate in block mode, through the CI_* alias.
    {
      const dirs = s.newRoot("push");
      s.git(dirs, ["init", "-q"]);
      const claude = agent("claude");
      const stdin = JSON.stringify(fill(pick(fixture(repo, claude.id), "events", "PreToolUse", "stdin"), placeholders(dirs, { "<COMMAND>": PUSH_MAIN })));
      const r = await s.run("hooks/hook-pack.mjs", [], dirs, stdin, { ...claude.env(dirs), CI_HOOKPACK_GATE: "block" });
      demos.push({ id: "push-gate", title: "A push to main with CI_HOOKPACK_GATE=block", how: "Claude Code's PreToolUse payload on stdin, in a temp git repository.", steps: [{ label: claude.label, run: "CI_HOOKPACK_GATE=block node hooks/hook-pack.mjs", stdin: s.output(stdin), exit: r.exit, stdout: s.output(r.stdout), stderr: s.output(r.stderr) }] });
    }

    // 8. The transcript linter on an edit with no lookup and no test run.
    {
      const dirs = s.newRoot("lint");
      const rows = [
        { ts: "2026-11-22T09:00:00Z", session: "s1", tool: "Edit", input_summary: "src/app.ts", tool_input: { file_path: "src/app.ts", old_string: "42", new_string: "43" } },
        { ts: "2026-11-22T09:00:05Z", session: "s1", tool: "Bash", input_summary: 'git commit -m "bump answer"', tool_input: { command: 'git commit -m "bump answer"' } },
      ];
      const input = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
      writeFileSync(join(dirs.project, "session.jsonl"), input);
      const r = await s.run("bin/lint-transcript.mjs", ["session.jsonl"], dirs);
      demos.push({ id: "lint-transcript", title: "The transcript linter on an edit with no lookup and no test run", how: "bin/lint-transcript.mjs on a two-row file of flat tool events.", steps: [{ label: "lint", run: "npx -p continuous-improvement ci-lint-transcript session.jsonl", stdin: input, exit: r.exit, stdout: s.output(r.stdout), stderr: s.output(r.stderr) }] });
    }

    // 9. The goal check: ci_plan_init writes the goal, then ci_goal_check scores two logs against it.
    // The log rows are written here with fixed times (bin/observe.mjs would stamp the clock), in
    // the bucket the server reads for this project.
    {
      const dirs = s.newRoot("goal");
      const hash = hashProjectRoot(dirs.project);
      const bucket = join(dirs.home, ".claude", "instincts", hash);
      mkdirSync(bucket, { recursive: true });
      s.addLiteral(hash, "<hash>");
      const writeLog = (rows: ReadonlyArray<readonly [string, string]>): void =>
        writeFileSync(join(bucket, "observations.jsonl"), rows.map(([tool, input], i) => JSON.stringify({ ts: `2026-11-22T09:00:0${i}Z`, session: "s1", tool, input_summary: input, output_summary: "" })).join("\n") + "\n");
      const hello = [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "demo", version: "0" } } },
        { jsonrpc: "2.0", method: "notifications/initialized" },
      ].map((m) => JSON.stringify(m));
      const call = (id: number, name: string, args: JsonObject): string => JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
      const run = "node bin/mcp-server.mjs --mode expert";
      const server = async (calls: readonly string[]): Promise<{ exit: number | null; stderr: string; reply: (id: number) => string }> => {
        const r = await s.run("bin/mcp-server.mjs", ["--mode", "expert"], dirs, [...hello, ...calls].join("\n") + "\n", { CLAUDE_PROJECT_DIR: dirs.project });
        return { exit: r.exit, stderr: s.output(r.stderr), reply: (id) => s.output(r.stdout.split("\n").find((line) => line.includes(`"id":${id}`)) ?? r.stdout) };
      };
      const init = call(2, "ci_plan_init", { goal: "Add retry with backoff to the payment webhook handler" });
      const check = (id: number): string => call(id, "ci_goal_check", {});
      writeLog([["Edit", "docs/landing/index.html"], ["Bash", "npm run lint"], ["Edit", "README.md"], ["Read", "src/theme/colors.ts"]]);
      const first = await server([init, check(3)]);
      const files = readdirSync(dirs.project).sort();
      writeLog([["Read", "src/webhooks/payment.ts"], ["Edit", "src/webhooks/payment.ts"], ["Bash", "npm test -- payment-webhook"], ["Edit", "src/webhooks/retry.ts"]]);
      const second = await server([check(2)]);
      if (!first.reply(3).includes("DRIFT") || !second.reply(2).includes("ON GOAL")) throw new Error(`goal-check: expected DRIFT then ON GOAL, got ${first.reply(3)} and ${second.reply(2)}`);
      demos.push({
        id: "goal-check",
        title: "ci_goal_check on a log that left the goal, then on one that follows it",
        how: "The MCP server over stdio in one temp HOME and project: ci_plan_init writes task_plan.md, then ci_goal_check runs against a four-row tool-call log written with fixed times, twice.",
        steps: [
          { label: "ci_plan_init over MCP", run, stdin: s.output(init), exit: first.exit, stdout: first.reply(2), stderr: first.stderr, files },
          { label: "ci_goal_check, four logged calls on other files", run, stdin: check(3), exit: first.exit, stdout: first.reply(3), stderr: first.stderr },
          { label: "ci_goal_check, four logged calls on the webhook handler", run, stdin: check(2), exit: second.exit, stdout: second.reply(2), stderr: second.stderr },
        ],
      });
    }
  } finally {
    s.cleanup();
  }

  const version = (JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as { version: string }).version;
  return {
    about: "Written by `node bin/capture-readme-demos.mjs` from real runs of this checkout's hooks and tools. bin/render-readme-assets.mjs draws the README images from it. Do not edit by hand.",
    version,
    unreleased: unreleased(repo),
    demos,
  };
}

async function main(): Promise<void> {
  const args = argv.slice(2);
  const repo = args.find((arg) => !arg.startsWith("--")) ?? cwd();
  const result = `${JSON.stringify(await capture(repo), null, 2)}\n`;
  if (args.includes("--stdout")) {
    stdout.write(result);
    return;
  }
  const out = join(repo, CAPTURE_FILE);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, result);
  console.log(`wrote ${CAPTURE_FILE}`);
}

if (argv[1] !== undefined && import.meta.url === pathToFileURL(argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    exit(1);
  });
}
