/**
 * `install --target <agent> --hooks` (docs/plans/2026-11-21-all-agents.md,
 * Architecture items 11 and 12, PR 12), spawned against a temp HOME and a temp
 * project: the stable runtime copy, the install ledger, --scope, --dry-run,
 * --run, --fail-closed and --uninstall --target.
 *
 * RED first: --hooks, --scope, --dry-run, --run and --fail-closed were
 * ignored, `--target qwen` was an unknown target, and `--uninstall --target
 * codex` ran the Claude Code uninstall.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { planTargetWrites } from "../lib/install-targets.mjs";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const INSTALL = join(REPO_ROOT, "bin", "install.mjs");
const VERSION = (JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { version: string }).version;
const INHERITED_ENV = new Set(["path", "pathext", "systemroot", "comspec", "temp", "tmp", "windir", "systemdrive"]);
const roots: string[] = [];

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

interface Box {
  home: string;
  project: string;
  root: string;
  fakeBin: string;
}

function box(): Box {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ci-install-hooks-")));
  roots.push(root);
  const home = join(root, "home");
  const project = join(root, "project");
  const fakeBin = join(root, "fakebin");
  mkdirSync(home, { recursive: true });
  mkdirSync(project, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  return { home, project, root, fakeBin };
}

// A stand-in vendor CLI that records its argv, one JSON line per call, and the
// cwd it ran in, one line per call in <name>-cwd.jsonl.
function fakeCli(b: Box, name: string): string {
  const log = join(b.root, `${name}-calls.jsonl`);
  const cwdLog = join(b.root, `${name}-cwd.jsonl`);
  const script = join(b.fakeBin, `${name}-record.cjs`);
  writeFileSync(script, [
    `require("node:fs").appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + "\\n");`,
    `require("node:fs").appendFileSync(${JSON.stringify(cwdLog)}, JSON.stringify(process.cwd()) + "\\n");`,
    "",
  ].join("\n"));
  writeFileSync(join(b.fakeBin, `${name}.cmd`), `@node "%~dp0${name}-record.cjs" %*\r\n`);
  writeFileSync(join(b.fakeBin, name), `#!/bin/sh\nexec node "$(dirname "$0")/${name}-record.cjs" "$@"\n`, { mode: 0o755 });
  return log;
}

function run(b: Box, args: string[], extraEnv: Record<string, string | undefined> = {}, cwd = b.project): { status: number | null; stdout: string; stderr: string } {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (INHERITED_ENV.has(key.toLowerCase()) && value !== undefined) env[key] = value;
  }
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  Object.assign(env, {
    HOME: b.home,
    USERPROFILE: b.home,
    APPDATA: join(b.home, "AppData", "Roaming"),
    CLAUDE_PROJECT_DIR: b.project,
    CLAUDE_CI_UPDATE_CHECK: "off",
    GIT_CEILING_DIRECTORIES: b.root,
    [pathKey]: `${b.fakeBin}${delimiter}${env[pathKey] ?? ""}`,
    ...extraEnv,
  });
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  const result = spawnSync(process.execPath, [INSTALL, ...args], { cwd, env, encoding: "utf8", timeout: 60_000 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function tree(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? tree(join(dir, entry.name), base) : [relative(base, join(dir, entry.name)).replace(/\\/g, "/")]))
    .sort();
}

function slash(path: string): string {
  return path.replace(/\\/g, "/");
}

const instincts = (b: Box): string => join(b.home, ".claude", "instincts");
const runtime = (b: Box, version = VERSION): string => join(instincts(b), "runtime", version);
const ledgerPath = (b: Box): string => join(instincts(b), "global", "install-ledger.json");

type Hooks = Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>;

describe("install --target without --hooks is unchanged", () => {
  it("writes the same rules files and prints the same bytes as before, with no runtime and no ledger", () => {
    const b = box();
    const out = run(b, ["install", "--target", "codex,windsurf"]);
    assert.equal(out.status, 0, out.stderr);
    const skillMd = readFileSync(join(REPO_ROOT, "SKILL.md"), "utf8");
    const codex = planTargetWrites("codex", skillMd, () => null);
    const windsurf = planTargetWrites("windsurf", skillMd, () => null);
    const expected = [
      "",
      "continuous-improvement multi-platform install",
      "",
      "  ✓ codex → AGENTS.md",
      "  ✓ windsurf → .windsurf/rules/continuous-improvement.md",
      ...[...new Set([...codex.notes, ...windsurf.notes])].map((note) => `  ℹ ${note}`),
      "",
      "Done. Claude Code install skipped (not in --target list).",
      "",
    ].join("\n");
    assert.equal(out.stdout, expected);
    assert.equal(readFileSync(join(b.project, "AGENTS.md"), "utf8"), codex.writes[0]!.content);
    assert.deepEqual(tree(b.home), []);
  });

  it("still runs the Claude Code uninstall for --uninstall alone and for --uninstall --target claude", () => {
    const b = box();
    for (const args of [["--uninstall"], ["--uninstall", "--target", "claude"]]) {
      const out = run(b, args);
      assert.equal(out.status, 0, out.stderr);
      assert.match(out.stdout, /Uninstalling continuous-improvement skills/);
    }
  });
});

describe("install --hooks --dry-run", () => {
  it("writes nothing anywhere, in either scope (temp HOME stays empty)", () => {
    for (const scope of ["project", "user"]) {
      const b = box();
      const out = run(b, ["install", "--target", "codex,qwen,grok,devin,droid,windsurf", "--hooks", "--dry-run", "--scope", scope, "--run", "--fail-closed"]);
      assert.equal(out.status, 0, out.stderr);
      assert.deepEqual(tree(b.home), [], scope);
      assert.deepEqual(tree(b.project), [], scope);
      assert.match(out.stdout, /Dry run: nothing was written/);
      assert.ok(out.stdout.includes(slash(runtime(b))), "names the runtime it would copy");
    }
  });
});

describe("install --hooks", () => {
  it("defaults to the project scope: the config lands in the project, the home gets only the runtime and the ledger", () => {
    const b = box();
    const out = run(b, ["install", "--target", "qwen", "--hooks"]);
    assert.equal(out.status, 0, out.stderr);
    assert.ok(existsSync(join(b.project, ".qwen", "settings.json")));
    const homeFiles = tree(b.home);
    assert.ok(homeFiles.length > 0);
    for (const file of homeFiles) {
      assert.ok(file.startsWith(`.claude/instincts/runtime/${VERSION}/`) || file === ".claude/instincts/global/install-ledger.json", file);
    }
    const settings = JSON.parse(readFileSync(join(b.project, ".qwen", "settings.json"), "utf8")) as { hooks: Hooks; mcpServers: Record<string, { args: string[] }> };
    const gateguard = settings.hooks.PreToolUse![0]!.hooks[0]!.command;
    assert.equal(gateguard, `node "${slash(runtime(b))}/hooks/gateguard.mjs" --agent qwen`);
    assert.equal(settings.mcpServers["continuous-improvement"]!.args[0], `${slash(runtime(b))}/bin/mcp-server.mjs`);
    const ledger = JSON.parse(readFileSync(ledgerPath(b), "utf8")) as { entries: Array<{ target: string; scope: string; runtime: string }> };
    assert.deepEqual(ledger.entries.map((entry) => [entry.target, entry.scope, entry.runtime]), [["qwen", "project", slash(runtime(b))]]);
  });

  it("writes the user-level config only with --scope user", () => {
    const b = box();
    const out = run(b, ["install", "--target", "qwen", "--hooks", "--scope", "user"]);
    assert.equal(out.status, 0, out.stderr);
    assert.ok(existsSync(join(b.home, ".qwen", "settings.json")));
    assert.deepEqual(tree(b.project), []);
  });

  it("copies a runtime that runs on its own: the rendered gateguard command denies a destructive command", () => {
    const b = box();
    assert.equal(run(b, ["install", "--target", "qwen", "--hooks"]).status, 0);
    for (const file of ["hooks/gateguard.mjs", "hooks/route-table.json", "bin/observe.mjs", "bin/mcp-server.mjs", "lib/hook-io.mjs", "package.json"]) {
      assert.ok(existsSync(join(runtime(b), file)), file);
    }
    const payload = JSON.stringify({
      hook_event_name: "PreToolUse", tool_name: "run_shell_command", tool_input: { command: ["git", "push", "--force", "origin", "main"].join(" ") },
      session_id: "t", cwd: b.project, timestamp: "2026-11-22T00:00:00.000Z",
    });
    const hook = spawnSync(process.execPath, [join(runtime(b), "hooks", "gateguard.mjs"), "--agent", "qwen"], {
      input: payload, encoding: "utf8", cwd: b.project,
      env: { ...process.env, HOME: b.home, USERPROFILE: b.home, CLAUDE_PROJECT_DIR: b.project },
    });
    assert.match(hook.stdout, /"permissionDecision":"deny"/, hook.stderr);
  });

  it("prunes an older runtime the ledger recorded once no install uses it, and keeps one the ledger still uses", () => {
    const b = box();
    mkdirSync(join(runtime(b, "0.0.1"), "hooks"), { recursive: true });
    writeFileSync(join(runtime(b, "0.0.1"), "hooks", "marker"), "old");
    mkdirSync(dirname(ledgerPath(b)), { recursive: true });
    writeFileSync(ledgerPath(b), JSON.stringify({ version: 1, entries: [], runtimes: [slash(runtime(b, "0.0.1"))] }));
    assert.equal(run(b, ["install", "--target", "grok", "--hooks"]).status, 0);
    assert.ok(!existsSync(runtime(b, "0.0.1")), "a recorded runtime nothing uses is pruned");

    mkdirSync(runtime(b, "0.0.2"), { recursive: true });
    const ledger = JSON.parse(readFileSync(ledgerPath(b), "utf8")) as { entries: Array<Record<string, unknown>> };
    ledger.entries.push({ ...ledger.entries[0]!, target: "droid", runtime: slash(runtime(b, "0.0.2")), files: [], runs: [] });
    writeFileSync(ledgerPath(b), JSON.stringify(ledger));
    assert.equal(run(b, ["install", "--target", "grok", "--hooks"]).status, 0);
    assert.ok(existsSync(runtime(b, "0.0.2")), "a runtime another install still points at is kept");
  });

  it("never prunes a runtime the ledger has no record of (a moved ledger, or an install that failed before recording)", () => {
    const b = box();
    mkdirSync(join(runtime(b, "0.0.3"), "hooks"), { recursive: true });
    writeFileSync(join(runtime(b, "0.0.3"), "hooks", "marker"), "live config may point here");
    assert.equal(run(b, ["install", "--target", "grok", "--hooks"]).status, 0);
    assert.ok(existsSync(join(runtime(b, "0.0.3"), "hooks", "marker")));
    const ledger = JSON.parse(readFileSync(ledgerPath(b), "utf8")) as { runtimes: string[] };
    assert.deepEqual(ledger.runtimes, [slash(runtime(b))]);
  });

  it("refuses a project-scope install outside a project, so a home directory's user-level configs are never written as the project's", () => {
    const b = box();
    // cwd is the home, which is not inside a git repo, and no project-dir env var is set.
    const outside = run(b, ["install", "--target", "codex,qwen,grok,droid", "--hooks"], { CLAUDE_PROJECT_DIR: undefined }, b.home);
    assert.equal(outside.status, 1, outside.stdout);
    assert.match(outside.stderr, /--scope user/);
    assert.deepEqual(tree(b.home), []);
    // A project root that is the home directory itself is refused the same way, the dry run too.
    for (const extra of [[], ["--dry-run"]]) {
      const atHome = run(b, ["install", "--target", "codex", "--hooks", ...extra], { CLAUDE_PROJECT_DIR: b.home }, b.home);
      assert.equal(atHome.status, 1, atHome.stdout);
      assert.match(atHome.stderr, /--scope user/);
      assert.deepEqual(tree(b.home), [], extra.join(" "));
    }
    // An explicit --scope user from the home still installs the user-level files.
    const user = run(b, ["install", "--target", "qwen", "--hooks", "--scope", "user"], { CLAUDE_PROJECT_DIR: undefined }, b.home);
    assert.equal(user.status, 0, user.stderr);
    assert.ok(existsSync(join(b.home, ".qwen", "settings.json")));
  });

  it("records each agent as soon as its files are written, so a later agent's failure still leaves an exact uninstall", () => {
    const b = box();
    // .factory is a file, so droid's write fails after codex's has landed.
    writeFileSync(join(b.project, ".factory"), "not a dir\n");
    const out = run(b, ["install", "--target", "codex,droid", "--hooks"]);
    assert.equal(out.status, 1, out.stdout);
    assert.ok(existsSync(join(b.project, ".codex", "hooks.json")));
    const ledger = JSON.parse(readFileSync(ledgerPath(b), "utf8")) as { entries: Array<{ target: string }> };
    assert.deepEqual(ledger.entries.map((entry) => entry.target), ["codex"]);
    const uninstall = run(b, ["--uninstall", "--target", "codex"]);
    assert.equal(uninstall.status, 0, uninstall.stderr);
    assert.ok(!existsSync(join(b.project, ".codex", "hooks.json")), "the recorded codex config is removed");
  });

  it("rolls back an agent's earlier files when one of its later writes fails", { skip: process.getuid?.() === 0 }, () => {
    const b = box();
    mkdirSync(join(b.project, ".factory"));
    const mcp = join(b.project, ".factory", "mcp.json");
    writeFileSync(mcp, "{}\n");
    chmodSync(mcp, 0o444); // readable when planned, refused when written (hooks.json is written first)
    try {
      const out = run(b, ["install", "--target", "droid", "--hooks"]);
      assert.equal(out.status, 1, out.stdout);
      assert.ok(!existsSync(join(b.project, ".factory", "hooks.json")), "the hooks file written before the failure is rolled back");
      assert.equal(readFileSync(mcp, "utf8"), "{}\n");
      const entries = existsSync(ledgerPath(b)) ? (JSON.parse(readFileSync(ledgerPath(b), "utf8")) as { entries: unknown[] }).entries : [];
      assert.deepEqual(entries, []);
    } finally {
      chmodSync(mcp, 0o644);
    }
  });

  it("refuses to replace a continuous-improvement MCP entry it did not write, and leaves the file as it was", () => {
    const b = box();
    mkdirSync(join(b.project, ".qwen"), { recursive: true });
    const settings = join(b.project, ".qwen", "settings.json");
    const before = `${JSON.stringify({ mcpServers: { "continuous-improvement": { command: "npx", args: ["continuous-improvement", "mcp"] } } })}\n`;
    writeFileSync(settings, before);
    const out = run(b, ["install", "--target", "qwen", "--hooks"]);
    assert.equal(out.status, 1, out.stdout);
    assert.match(out.stderr, /mcpServers\.continuous-improvement/);
    assert.equal(readFileSync(settings, "utf8"), before);
    assert.ok(!existsSync(ledgerPath(b)));
  });

  it("keeps the previous runtime and writes nothing when the install fails", () => {
    const b = box();
    mkdirSync(join(runtime(b, "0.0.1"), "hooks"), { recursive: true });
    mkdirSync(join(b.project, ".codex"), { recursive: true });
    writeFileSync(join(b.project, ".codex", "hooks.json"), "{not json");
    const out = run(b, ["install", "--target", "qwen,codex", "--hooks"]);
    assert.equal(out.status, 1);
    assert.match(out.stderr, /\.codex\/hooks\.json/);
    assert.ok(existsSync(runtime(b, "0.0.1")));
    assert.ok(!existsSync(runtime(b)));
    assert.ok(!existsSync(join(b.project, ".qwen")));
    assert.ok(!existsSync(ledgerPath(b)));
  });

  it("refuses an unusable request before writing anything", () => {
    const b = box();
    for (const args of [
      ["install", "--hooks"],
      ["install", "--target", "qwen"],
      ["install", "--target", "zed", "--hooks"],
      ["install", "--target", "codex", "--hooks", "--scope", "global"],
      ["install", "--target", "codex", "--dry-run"],
      ["install", "--target", "claude", "--hooks"],
    ]) {
      const out = run(b, args);
      assert.equal(out.status, 1, args.join(" "));
      assert.deepEqual(tree(b.home), [], args.join(" "));
      assert.deepEqual(tree(b.project), [], args.join(" "));
    }
  });

  it("warns when the agent also imports the Claude Code hooks, so each would fire twice", () => {
    const b = box();
    mkdirSync(join(b.home, ".claude"), { recursive: true });
    const observe = `node "${slash(b.home)}/.claude/instincts/bin/observe.mjs"`;
    writeFileSync(join(b.home, ".claude", "settings.json"), JSON.stringify({ hooks: { PostToolUse: [{ matcher: "", hooks: [{ type: "command", command: observe }] }] } }));
    const out = run(b, ["install", "--target", "devin", "--hooks", "--dry-run"]);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout + out.stderr, /twice/);
  });
});

describe("install --hooks --run and vendor consent", () => {
  it("without --run prints the vendor command and runs nothing", () => {
    const b = box();
    const calls = fakeCli(b, "codex");
    const out = run(b, ["install", "--target", "codex", "--hooks", "--scope", "user"]);
    assert.equal(out.status, 0, out.stderr);
    assert.ok(!existsSync(calls));
    assert.match(out.stdout, /codex mcp add continuous-improvement -- node /);
    assert.match(out.stdout, /\/hooks/);
  });

  it("with --run runs only `codex mcp add`, never --consent or --trust, and never writes hook trust", () => {
    const b = box();
    const calls = fakeCli(b, "codex");
    const out = run(b, ["install", "--target", "codex", "--hooks", "--scope", "user", "--run"]);
    assert.equal(out.status, 0, out.stderr);
    const argvs = readFileSync(calls, "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[]);
    assert.deepEqual(argvs, [["mcp", "add", "continuous-improvement", "--", "node", `${slash(runtime(b))}/bin/mcp-server.mjs`, "--mode", "expert"]]);
    assert.doesNotMatch(JSON.stringify(argvs) + out.stdout, /--consent|--trust/);
    assert.ok(!existsSync(join(b.home, ".codex", "config.toml")));
    const hooks = JSON.parse(readFileSync(join(b.home, ".codex", "hooks.json"), "utf8")) as { hooks: Hooks };
    assert.equal(hooks.hooks.PreToolUse![0]!.matcher, "^(Bash|apply_patch|exec_command)$");
    const ledger = JSON.parse(readFileSync(ledgerPath(b), "utf8")) as { entries: Array<{ runs: Array<{ ran: boolean }> }> };
    assert.deepEqual(ledger.entries[0]!.runs.map((entry) => entry.ran), [true]);
  });

  it("--fail-closed sets the vendor option where one exists", () => {
    const b = box();
    assert.equal(run(b, ["install", "--target", "droid", "--hooks", "--fail-closed"]).status, 0);
    const hooks = JSON.parse(readFileSync(join(b.project, ".factory", "hooks.json"), "utf8")) as Record<string, Array<{ hooks: Array<{ onFailure?: string }> }>>;
    assert.equal(hooks.PreToolUse![0]!.hooks[0]!.onFailure, "block");
    assert.equal(hooks.Stop![0]!.hooks[0]!.onFailure, undefined);
  });
});

describe("install --uninstall --target", () => {
  it("removes exactly what the ledger recorded and keeps foreign settings", () => {
    const b = box();
    mkdirSync(join(b.project, ".qwen"), { recursive: true });
    const before = { theme: "dark", hooks: { PreToolUse: [{ matcher: "run_shell_command", hooks: [{ type: "command", command: "mine" }] }] } };
    writeFileSync(join(b.project, ".qwen", "settings.json"), JSON.stringify(before));
    assert.equal(run(b, ["install", "--target", "qwen,droid", "--hooks"]).status, 0);

    const out = run(b, ["--uninstall", "--target", "qwen"]);
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(b.project, ".qwen", "settings.json"), "utf8")), before);
    assert.doesNotMatch(out.stdout, /Uninstalling continuous-improvement skills/, "the Claude Code uninstall does not run");
    const ledger = JSON.parse(readFileSync(ledgerPath(b), "utf8")) as { entries: Array<{ target: string }> };
    assert.deepEqual(ledger.entries.map((entry) => entry.target), ["droid"]);
    assert.ok(existsSync(runtime(b)), "droid still uses the runtime");

    assert.equal(run(b, ["--uninstall", "--target", "droid"]).status, 0);
    assert.ok(!existsSync(join(b.project, ".factory", "hooks.json")), "a file the install created is deleted");
    assert.ok(!existsSync(runtime(b)), "no install uses the runtime any more");
    assert.deepEqual((JSON.parse(readFileSync(ledgerPath(b), "utf8")) as { entries: unknown[] }).entries, []);
  });

  it("runs a vendor undo only for a command the install actually ran", () => {
    const b = box();
    const calls = fakeCli(b, "devin");
    assert.equal(run(b, ["install", "--target", "devin", "--hooks"]).status, 0);
    const out = run(b, ["--uninstall", "--target", "devin", "--run"]);
    assert.equal(out.status, 0, out.stderr);
    assert.ok(!existsSync(calls), "devin mcp remove is not run for an mcp add that never ran");
    assert.match(out.stdout, /if you ran devin mcp add .*, undo it: devin mcp remove continuous-improvement/);

    assert.equal(run(b, ["install", "--target", "devin", "--hooks", "--run"]).status, 0);
    assert.equal(run(b, ["--uninstall", "--target", "devin", "--run"]).status, 0);
    const argvs = readFileSync(calls, "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[]);
    assert.deepEqual(argvs.map((argv) => argv.slice(0, 2)), [["mcp", "add"], ["mcp", "remove"]]);
  });

  it("runs a project-scope vendor command in the project root, also from a subdirectory, and its undo there too", () => {
    const b = box();
    fakeCli(b, "grok");
    fakeCli(b, "devin");
    const sub = join(b.project, "packages", "app");
    mkdirSync(sub, { recursive: true });
    const cwds = (name: string): string[] => readFileSync(join(b.root, `${name}-cwd.jsonl`), "utf8").trim().split("\n").map((line) => realpathSync(JSON.parse(line) as string));
    const out = run(b, ["install", "--target", "grok,devin", "--hooks", "--run"], {}, sub);
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(cwds("grok"), [b.project], "grok mcp add --scope project writes relative to its cwd");
    assert.deepEqual(cwds("devin"), [b.project], "devin mcp add -s project writes relative to its cwd");
    const ledger = JSON.parse(readFileSync(ledgerPath(b), "utf8")) as { entries: Array<{ target: string; runs: Array<{ cwd: string | null }> }> };
    assert.deepEqual(ledger.entries.map((entry) => [entry.target, entry.runs.map((r) => r.cwd)]), [["grok", [slash(b.project)]], ["devin", [slash(b.project)]]]);
    assert.equal(run(b, ["--uninstall", "--target", "devin", "--run"], {}, b.home).status, 0);
    assert.deepEqual(cwds("devin"), [b.project, b.project], "the undo runs where the add ran");
  });

  it("reports nothing to do when the ledger has no install for the target, and --dry-run removes nothing", () => {
    const b = box();
    const none = run(b, ["--uninstall", "--target", "grok"]);
    assert.equal(none.status, 0, none.stderr);
    assert.match(none.stdout, /nothing recorded/i);
    assert.equal(run(b, ["install", "--target", "grok", "--hooks"]).status, 0);
    const before = tree(b.root);
    assert.equal(run(b, ["--uninstall", "--target", "grok", "--dry-run"]).status, 0);
    assert.deepEqual(tree(b.root), before);
  });
});

describe("install --hooks for the PR 13 agents (gemini, cursor, copilot, kiro, auggie, junie, goose, cline)", () => {
  const AGENTS = "gemini,cursor,copilot,kiro,auggie,junie,goose,cline";

  it("a dry run writes nothing anywhere, in either scope", () => {
    for (const scope of ["project", "user"]) {
      const b = box();
      const out = run(b, ["install", "--target", AGENTS, "--hooks", "--dry-run", "--scope", scope, "--run", "--fail-closed"]);
      assert.equal(out.status, 0, out.stderr);
      assert.deepEqual(tree(b.home), [], scope);
      assert.deepEqual(tree(b.project), [], scope);
      assert.match(out.stdout, /Dry run: nothing was written/);
    }
  });

  it("installs each agent's config in the project, and the uninstall leaves the project as it was apart from the rules files", () => {
    const b = box();
    mkdirSync(join(b.project, ".cursor"), { recursive: true });
    const foreign = JSON.stringify({ version: 1, hooks: { afterFileEdit: [{ command: "./mine.sh" }] } }, null, 2);
    writeFileSync(join(b.project, ".cursor", "hooks.json"), foreign);
    const out = run(b, ["install", "--target", AGENTS, "--hooks"]);
    assert.equal(out.status, 0, out.stderr);
    const clineHook = process.platform === "win32" ? ".clinerules/hooks/PreToolUse.ps1" : ".clinerules/hooks/PreToolUse";
    // PR 18: Cline also gets the PostToolUse observer script.
    const clineObserver = process.platform === "win32" ? ".clinerules/hooks/PostToolUse.ps1" : ".clinerules/hooks/PostToolUse";
    const written = [
      ".agents/plugins/continuous-improvement/hooks/hooks.json", ".augment/settings.json", clineHook, clineObserver, ".cursor/hooks.json", ".cursor/mcp.json",
      ".gemini/settings.json", ".github/hooks/continuous-improvement.json", ".github/mcp.json", ".junie/config.json", ".junie/mcp/mcp.json",
      ".kiro/hooks/continuous-improvement.json", ".kiro/settings/mcp.json",
    ];
    const rules = planTargetWrites("gemini", readFileSync(join(REPO_ROOT, "SKILL.md"), "utf8"), () => null).writes.map((write) => write.relPath)
      .concat([".cursor/rules/continuous-improvement.mdc", ".github/copilot-instructions.md"]);
    // PR 15: each agent also gets the skill copies in its skills dir (src/test/skill-export.test.mts pins them).
    const skillCopy = (file: string): boolean => /^\.[\w-]+\/skills\/[a-z0-9-]+\/SKILL\.md$/.test(file);
    assert.deepEqual(tree(b.project).filter((file) => !skillCopy(file)), [...written, ...rules].sort());
    assert.deepEqual([...new Set(tree(b.project).filter(skillCopy).map((file) => file.split("/")[0]))].sort(), [".agents", ".augment", ".cline", ".cursor", ".gemini", ".github", ".junie", ".kiro"]);
    const cursor = JSON.parse(readFileSync(join(b.project, ".cursor", "hooks.json"), "utf8")) as { hooks: Record<string, Array<{ command: string }>> };
    assert.equal(cursor.hooks.preToolUse![0]!.command, `node "${slash(runtime(b))}/hooks/gateguard.mjs" --agent cursor`);
    assert.deepEqual(cursor.hooks.afterFileEdit, [{ command: "./mine.sh" }]);
    if (process.platform !== "win32") assert.equal(statSync(join(b.project, clineHook)).mode & 0o111, 0o111, "the Cline sh hook is executable");

    const removed = run(b, ["--uninstall", "--target", AGENTS]);
    assert.equal(removed.status, 0, removed.stderr);
    // PR 19: the rules files --hooks wrote are in the ledger now, and go with the uninstall.
    assert.deepEqual(tree(b.project), [".cursor/hooks.json"]);
    assert.ok(rules.length > 0);
    assert.deepEqual(JSON.parse(readFileSync(join(b.project, ".cursor", "hooks.json"), "utf8")), JSON.parse(foreign));
  });
});

// PR 19 (docs/plans/2026-11-21-all-agents.md): the uninstall does exactly what
// the docs say. Probe defects 1, 8, 9 and 10 and critic gaps 3, 7 and 11.
type LedgerJson = {
  version: number;
  entries: Array<{ target: string; scope: string; pending?: boolean; files: Array<{ path: string; created: boolean; managedBlock?: boolean }>; runs: Array<{ argv: string[]; undo: string[] | null; ran: boolean }> }>;
  runtimes: string[];
};
const ledgerOf = (b: Box): LedgerJson => JSON.parse(readFileSync(ledgerPath(b), "utf8")) as LedgerJson;
const argvsOf = (log: string): string[][] => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[]) : []);

describe("install --uninstall --target keeps a vendor registration it did not undo", () => {
  it("Codex without --run: prints the undo, keeps the entry pending and the runtime, and a later --run completes it", () => {
    const b = box();
    const calls = fakeCli(b, "codex");
    assert.equal(run(b, ["install", "--target", "codex", "--hooks", "--scope", "user", "--run"]).status, 0);
    const first = run(b, ["--uninstall", "--target", "codex", "--scope", "user"]);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /run yourself: codex mcp remove continuous-improvement/);
    assert.match(first.stdout, /--uninstall --target codex --scope user --run/);
    assert.ok(!existsSync(join(b.home, ".codex", "hooks.json")), "the hook config still goes");
    assert.ok(existsSync(join(runtime(b), "bin", "mcp-server.mjs")), "the runtime the registration points at stays");
    const pending = ledgerOf(b);
    assert.deepEqual(pending.entries.map((entry) => [entry.target, entry.scope, entry.pending, entry.files.length]), [["codex", "user", true, 0]]);
    assert.deepEqual(pending.entries[0]!.runs.map((r) => r.undo), [["codex", "mcp", "remove", "continuous-improvement"]]);
    assert.deepEqual(pending.runtimes, [slash(runtime(b))]);
    assert.deepEqual(argvsOf(calls).map((argv) => argv.slice(0, 2)), [["mcp", "add"]]);

    const second = run(b, ["--uninstall", "--target", "codex", "--scope", "user", "--run"]);
    assert.equal(second.status, 0, second.stderr);
    assert.doesNotMatch(second.stdout, /Nothing recorded/);
    assert.deepEqual(argvsOf(calls).map((argv) => argv.slice(0, 2)), [["mcp", "add"], ["mcp", "remove"]]);
    assert.deepEqual(ledgerOf(b), { version: 1, entries: [], runtimes: [] });
    assert.ok(!existsSync(runtime(b)), "the runtime goes once nothing points at it");
  });

  it("a run with no undo command keeps the entry pending until the user removed it by hand and ran the uninstall again", () => {
    const b = box();
    fakeCli(b, "grok");
    assert.equal(run(b, ["install", "--target", "grok", "--hooks", "--scope", "user", "--run"]).status, 0);
    // A ledger written before Grok's undo was known (PRs 12 to 18) holds undo: null.
    const seeded = ledgerOf(b);
    seeded.entries[0]!.runs[0]!.undo = null;
    writeFileSync(ledgerPath(b), JSON.stringify(seeded));
    const first = run(b, ["--uninstall", "--target", "grok", "--scope", "user", "--run"]);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /has no undo command; remove what it added by hand, then run this uninstall again/);
    assert.ok(existsSync(runtime(b)));
    assert.deepEqual(ledgerOf(b).entries.map((entry) => [entry.target, entry.pending]), [["grok", true]]);

    const second = run(b, ["--uninstall", "--target", "grok", "--scope", "user", "--run"]);
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(ledgerOf(b).entries, []);
    assert.ok(!existsSync(runtime(b)));
  });

  it("undoes Grok's MCP step with `grok mcp remove <name> --scope <scope>`, where the add ran", () => {
    const b = box();
    const calls = fakeCli(b, "grok");
    assert.equal(run(b, ["install", "--target", "grok", "--hooks", "--run"]).status, 0);
    const out = run(b, ["--uninstall", "--target", "grok", "--run"], {}, b.home);
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(argvsOf(calls)[1], ["mcp", "remove", "continuous-improvement", "--scope", "project"]);
    const cwds = readFileSync(join(b.root, "grok-cwd.jsonl"), "utf8").trim().split("\n").map((line) => realpathSync(JSON.parse(line) as string));
    assert.deepEqual(cwds, [b.project, b.project]);
    assert.deepEqual(ledgerOf(b).entries, []);
  });

  it("an undo that fails keeps the entry pending, except Grok's 'No MCP server named' (it is already gone)", () => {
    const b = box();
    fakeCli(b, "grok");
    // Grok 1.0.85 exits 1 with "No MCP server named '<name>' in user config" on stderr for a server it does not have.
    appendFileSync(join(b.fakeBin, "grok-record.cjs"), 'if (process.argv[3] === "remove" && process.env.FAKE_REMOVE) { process.stderr.write(process.env.FAKE_REMOVE + "\\n"); process.exitCode = 1; }\n');
    assert.equal(run(b, ["install", "--target", "grok", "--hooks", "--scope", "user", "--run"]).status, 0);
    const failed = run(b, ["--uninstall", "--target", "grok", "--scope", "user", "--run"], { FAKE_REMOVE: "boom" });
    assert.equal(failed.status, 1, failed.stdout);
    assert.match(failed.stderr, /boom/);
    assert.deepEqual(ledgerOf(b).entries.map((entry) => entry.pending), [true]);
    assert.ok(existsSync(runtime(b)));

    const gone = run(b, ["--uninstall", "--target", "grok", "--scope", "user", "--run"], { FAKE_REMOVE: "No MCP server named 'continuous-improvement' in user config" });
    assert.equal(gone.status, 0, gone.stderr);
    assert.deepEqual(ledgerOf(b).entries, []);
    assert.ok(!existsSync(runtime(b)));
  });

  it("a --uninstall --target that finds nothing at its scope names the entry at the other scope and the flag", () => {
    const b = box();
    assert.equal(run(b, ["install", "--target", "codex", "--hooks", "--scope", "user"]).status, 0);
    const bare = run(b, ["--uninstall", "--target", "codex"]);
    assert.equal(bare.status, 0, bare.stderr);
    assert.match(bare.stdout, /Nothing recorded for codex \(scope: project\)/);
    assert.match(bare.stdout, /codex is recorded at scope user: `--uninstall --target codex --scope user` removes it/);
    assert.ok(existsSync(join(b.home, ".codex", "hooks.json")), "nothing was removed");

    assert.equal(run(b, ["install", "--target", "qwen", "--hooks"]).status, 0);
    const user = run(b, ["--uninstall", "--target", "qwen", "--scope", "user"]);
    assert.equal(user.status, 0, user.stderr);
    assert.ok(user.stdout.includes(`qwen is recorded at scope project in ${slash(b.project)}: run \`--uninstall --target qwen\` there`), user.stdout);
  });

  it("drops the runtimes it pruned from the ledger", () => {
    const b = box();
    mkdirSync(join(runtime(b, "0.0.1"), "hooks"), { recursive: true });
    mkdirSync(dirname(ledgerPath(b)), { recursive: true });
    writeFileSync(ledgerPath(b), JSON.stringify({ version: 1, entries: [], runtimes: [slash(runtime(b, "0.0.1"))] }));
    assert.equal(run(b, ["install", "--target", "qwen", "--hooks"]).status, 0);
    assert.ok(!existsSync(runtime(b, "0.0.1")));
    assert.deepEqual(ledgerOf(b).runtimes, [slash(runtime(b))]);
    assert.equal(run(b, ["--uninstall", "--target", "qwen"]).status, 0);
    assert.deepEqual(ledgerOf(b).runtimes, []);
  });
});

describe("install --hooks records the rules file it writes", () => {
  it("the uninstall takes out our managed block from a rules file that was there, and deletes one it created, also after a reinstall", () => {
    const b = box();
    const mine = "# Mine\n\nKeep this.\n";
    writeFileSync(join(b.project, "AGENTS.md"), mine);
    for (let i = 0; i < 2; i++) assert.equal(run(b, ["install", "--target", "codex,gemini", "--hooks"]).status, 0);
    assert.match(readFileSync(join(b.project, "AGENTS.md"), "utf8"), /continuous-improvement:begin/);
    const files = (target: string) => ledgerOf(b).entries.find((entry) => entry.target === target)!.files.filter((file) => file.managedBlock);
    assert.deepEqual(files("codex").map((file) => [file.path, file.created]), [[slash(join(b.project, "AGENTS.md")), false]]);
    assert.deepEqual(files("gemini").map((file) => [file.path, file.created]), [[slash(join(b.project, "GEMINI.md")), true]], "a reinstall keeps created");

    const out = run(b, ["--uninstall", "--target", "codex,gemini"]);
    assert.equal(out.status, 0, out.stderr);
    assert.equal(readFileSync(join(b.project, "AGENTS.md"), "utf8"), mine);
    assert.ok(!existsSync(join(b.project, "GEMINI.md")));
  });

  it("keeps a rules file whose text outside our block changed, and a whole rules file that was there before", () => {
    const b = box();
    mkdirSync(join(b.project, ".cursor", "rules"), { recursive: true });
    writeFileSync(join(b.project, ".cursor", "rules", "continuous-improvement.mdc"), "mine\n");
    assert.equal(run(b, ["install", "--target", "codex,cursor", "--hooks"]).status, 0);
    const agents = join(b.project, "AGENTS.md");
    writeFileSync(agents, `${readFileSync(agents, "utf8")}\nAdded later.\n`);
    assert.equal(run(b, ["--uninstall", "--target", "codex,cursor"]).status, 0);
    assert.equal(readFileSync(agents, "utf8"), "Added later.\n");
    assert.ok(existsSync(join(b.project, ".cursor", "rules", "continuous-improvement.mdc")), "not ours to delete");
  });

  it("with --scope user outside a project, writes no rules file into the cwd or the home, and says why", () => {
    const b = box();
    const elsewhere = join(b.root, "elsewhere");
    mkdirSync(elsewhere);
    for (const cwd of [b.home, elsewhere]) {
      const dry = run(b, ["install", "--target", "codex,gemini", "--hooks", "--scope", "user", "--dry-run"], { CLAUDE_PROJECT_DIR: undefined }, cwd);
      assert.equal(dry.status, 0, dry.stderr);
      assert.doesNotMatch(dry.stdout, /would (create|update) \S*(AGENTS|GEMINI)\.md/);
      assert.match(dry.stdout, /AGENTS\.md \(codex rules\) is not written: no project directory/);
    }
    const out = run(b, ["install", "--target", "codex,gemini", "--hooks", "--scope", "user"], { CLAUDE_PROJECT_DIR: undefined }, elsewhere);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /GEMINI\.md \(gemini rules\) is not written: no project directory/);
    for (const dir of [b.home, elsewhere]) {
      assert.ok(!existsSync(join(dir, "AGENTS.md")), dir);
      assert.ok(!existsSync(join(dir, "GEMINI.md")), dir);
    }
  });
});

describe("install --hooks --scope user follows GEMINI_CLI_HOME and QWEN_HOME", () => {
  it("writes the config and skills where Gemini and Qwen read them with a split HOME, and the uninstall finds them there", () => {
    const b = box();
    const cliHome = join(b.root, "gemini-cli-home");
    const qwenHome = join(b.root, "qwen-home");
    const env = { GEMINI_CLI_HOME: cliHome, QWEN_HOME: qwenHome };
    const out = run(b, ["install", "--target", "gemini,qwen", "--hooks", "--scope", "user"], env);
    assert.equal(out.status, 0, out.stderr);
    // Gemini CLI 0.41.2 homedir() returns GEMINI_CLI_HOME and adds .gemini; Qwen 0.28.0 getGlobalQwenDir() returns QWEN_HOME.
    assert.ok(existsSync(join(cliHome, ".gemini", "settings.json")));
    assert.ok(tree(join(cliHome, ".gemini", "skills")).length > 0);
    assert.ok(existsSync(join(qwenHome, "settings.json")));
    assert.ok(tree(join(qwenHome, "skills")).length > 0);
    assert.ok(!existsSync(join(b.home, ".gemini")) && !existsSync(join(b.home, ".qwen")), tree(b.home).filter((f) => !f.startsWith(".claude/")).join("\n"));
    assert.equal(run(b, ["--uninstall", "--target", "gemini,qwen", "--scope", "user"], env).status, 0);
    assert.ok(!existsSync(join(cliHome, ".gemini", "settings.json")));
    assert.ok(!existsSync(join(qwenHome, "settings.json")));
  });
});
