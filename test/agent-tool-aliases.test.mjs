/**
 * The Claude plugin hooks over other agents' tool names.
 *
 * Grok, Qwen, Codex, Cursor 3.x, Devin and Droid load this repo's unchanged
 * Claude plugin, and their payloads carry their own tool names. Before the
 * inbound aliases (src/lib/agent-profiles.mts) gateguard, hook-pack and
 * config-guard allowed every name they did not know, so a destructive command
 * through `run_terminal_command` exited 0 with empty stdout. The cases in
 * fixtures/agent-hooks/{codex,grok,qwen}.json run the built hooks over each
 * agent's verified payload shape and pin the decision: deny (a
 * permissionDecision deny on stdout), allow (empty stdout) or warn (empty
 * stdout, a reason on stderr). Exit is 0 in every case.
 *
 * Each case gets a temp home and project, an env built from an allowlist
 * (so the host's own CI_* knobs never decide a case), and CLAUDE_PROJECT_DIR
 * at the project, as fixtures/agent-hooks/claude.json does.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { AGENT_PROFILES, resolveInboundTool } from "../lib/agent-profiles.mjs";
import { classifyMutation } from "../lib/config-guard-gate.mjs";
import { hashProjectRoot } from "../lib/gateguard-state.mjs";
import { summariseInput } from "../lib/observe-event.mjs";
const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const FIXTURE_AGENTS = ["codex", "grok", "qwen"];
const INHERITED_ENV = new Set(["path", "pathext", "systemroot", "systemdrive", "windir", "comspec", "temp", "tmp", "tmpdir"]);
const roots = [];
after(() => {
    for (const root of roots)
        rmSync(root, { recursive: true, force: true });
});
function substitute(value, dirs) {
    if (typeof value === "string") {
        return value.split("<PROJECT_HASH>").join(dirs.hash).split("<HOME>").join(dirs.home).split("<PROJECT>").join(dirs.project);
    }
    if (Array.isArray(value))
        return value.map((item) => substitute(item, dirs));
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substitute(item, dirs)]));
    }
    return value;
}
function prepare(aliasCase) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "ci-agent-alias-")));
    roots.push(root);
    const home = join(root, "home");
    const project = join(root, "project");
    mkdirSync(home);
    mkdirSync(project);
    const dirs = { root, home, project, hash: hashProjectRoot(project) };
    for (const [path, spec] of Object.entries(aliasCase.setup?.files ?? {})) {
        const target = substitute(path, dirs);
        const value = substitute(spec, dirs);
        mkdirSync(dirname(target), { recursive: true });
        const text = typeof value === "string" ? value : value.map((row) => `${JSON.stringify(row)}\n`).join("");
        writeFileSync(target, text);
    }
    return dirs;
}
function runStep(step, dirs) {
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (INHERITED_ENV.has(key.toLowerCase()) && value !== undefined)
            env[key] = value;
    }
    Object.assign(env, {
        HOME: dirs.home,
        USERPROFILE: dirs.home,
        CLAUDE_PROJECT_DIR: dirs.project,
        GIT_CEILING_DIRECTORIES: dirname(dirs.root),
        GIT_CONFIG_NOSYSTEM: "1",
        ...step.env,
    });
    const result = spawnSync(process.execPath, [join(REPO_ROOT, step.hook)], {
        cwd: dirs.project,
        env,
        input: JSON.stringify(substitute(step.stdin, dirs)),
        encoding: "utf8",
        timeout: 30_000,
    });
    return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}
function assertDecision(id, step, got) {
    const where = `${id} ${step.hook}\nstdout: ${got.stdout}\nstderr: ${got.stderr}`;
    assert.equal(got.status, 0, where);
    if (step.expect.decision === "deny") {
        const output = JSON.parse(got.stdout);
        assert.equal(output.hookSpecificOutput?.permissionDecision, "deny", where);
    }
    else {
        assert.equal(got.stdout, "", where);
        if (step.expect.decision === "warn")
            assert.notEqual(got.stderr, "", where);
    }
    if (step.expect.stdoutIncludes)
        assert.ok(got.stdout.includes(step.expect.stdoutIncludes), where);
    if (step.expect.stderrIncludes)
        assert.ok(got.stderr.includes(step.expect.stderrIncludes), where);
}
for (const agent of FIXTURE_AGENTS) {
    const fixture = JSON.parse(readFileSync(join(REPO_ROOT, "fixtures", "agent-hooks", `${agent}.json`), "utf8"));
    describe(`${agent} payloads through the Claude plugin hooks`, () => {
        it("is the fixture for this agent", () => {
            assert.equal(fixture.agent, agent);
            assert.ok(fixture.cases.length > 0);
        });
        for (const aliasCase of fixture.cases) {
            const onHost = aliasCase.platform === undefined || (aliasCase.platform === "win32") === (process.platform === "win32");
            it(aliasCase.id, { skip: onHost ? false : `${aliasCase.platform} only` }, () => {
                const dirs = prepare(aliasCase);
                for (const step of aliasCase.steps)
                    assertDecision(aliasCase.id, step, runStep(step, dirs));
            });
        }
    });
}
describe("every inbound shell alias", () => {
    const shells = [
        ...new Set(AGENT_PROFILES.flatMap((profile) => Object.keys(profile.tools)).filter((name) => resolveInboundTool(name)?.kind === "shell")),
    ];
    it("covers the names the fail-open was reproduced on", () => {
        for (const name of ["run_terminal_command", "run_shell_command", "exec_command", "Shell", "execute_bash", "exec", "Execute"]) {
            assert.ok(shells.includes(name), name);
        }
    });
    for (const name of shells) {
        it(`${name}: gateguard denies a destructive command and allows a routine one`, () => {
            const dirs = prepare({ id: name, steps: [] });
            const stdin = (command) => ({ hook_event_name: "PreToolUse", session_id: "s", cwd: "<PROJECT>", tool_name: name, tool_input: { command } });
            const deny = { hook: "hooks/gateguard.mjs", stdin: stdin("git push --force origin main"), expect: { decision: "deny" } };
            const allow = { hook: "hooks/gateguard.mjs", stdin: stdin("git status"), expect: { decision: "allow" } };
            assertDecision(name, deny, runStep(deny, dirs));
            assertDecision(name, allow, runStep(allow, dirs));
        });
    }
});
describe("observe summariseInput over inbound aliases", () => {
    it("records a shell alias by its command", () => {
        assert.equal(summariseInput("run_terminal_command", { command: "npm test" }), "npm test");
        assert.equal(summariseInput("exec_command", { cmd: "ls -la" }), "ls -la");
    });
    it("records a file alias by its path", () => {
        assert.equal(summariseInput("read_file", { file_path: "/repo/a.ts" }), "/repo/a.ts");
        assert.equal(summariseInput("write", { path: "/repo/b.ts", content: "x" }), "/repo/b.ts");
    });
    it("keeps a search alias's whole input, whose keys differ by agent", () => {
        assert.equal(summariseInput("grep_search", { pattern: "TODO", path: "." }), '{"pattern":"TODO","path":"."}');
    });
    it("records a patch by its text, so a header names the file for the evidence gate", () => {
        const patch = "*** Begin Patch\n*** Update File: src/app.ts\n*** End Patch";
        assert.equal(summariseInput("apply_patch", { command: patch }), patch);
    });
    it("returns an empty string when an alias's field is missing, as for a Claude tool", () => {
        assert.equal(summariseInput("run_shell_command", { cwd: "/" }), "");
        assert.equal(summariseInput("read_file", {}), "");
    });
    it("redacts a secret in an alias's command", () => {
        const secret = "ghp_" + "a".repeat(36);
        assert.ok(!summariseInput("run_shell_command", { command: `curl -H "token ${secret}" x` }).includes(secret));
    });
    it("keeps the JSON fallback for an unknown tool", () => {
        assert.equal(summariseInput("no_such_tool", { a: 1 }), '{"a":1}');
    });
});
describe("config-guard classifyMutation over inbound aliases", () => {
    it("reads a patch's Delete File header as a write to that file", () => {
        const hit = classifyMutation("apply_patch", { command: "*** Begin Patch\n*** Delete File: .mcp.json\n*** End Patch" });
        assert.equal(hit?.target, ".mcp.json");
        assert.equal(hit?.via, "file");
    });
    it("leaves a patch of ordinary files alone", () => {
        assert.equal(classifyMutation("apply_patch", { command: "*** Update File: src/app.ts\n" }), null);
    });
    it("classifies a shell alias command with the shell rules", () => {
        assert.equal(classifyMutation("Execute", { command: "cp x .mcp.json" })?.via, "bash");
    });
});
