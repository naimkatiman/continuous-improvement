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
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { AGENT_PROFILES, inboundPaths, resolveInboundTool } from "../lib/agent-profiles.mjs";
import { classifyMutation } from "../lib/config-guard-gate.mjs";
const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const INHERITED_ENV = new Set(["path", "pathext", "systemroot", "systemdrive", "windir", "comspec", "temp", "tmp", "tmpdir"]);
const KEYS = ["path", "file_path", "filePath", "target_file"];
const TOOLS = [
    { agent: "copilot", tool: "str_replace_editor" },
    { agent: "copilot", tool: "create" },
    { agent: "auggie", tool: "str-replace-editor" },
    { agent: "auggie", tool: "save-file" },
];
const roots = [];
after(() => {
    for (const root of roots)
        rmSync(root, { recursive: true, force: true });
});
function fixture(agent) {
    return JSON.parse(readFileSync(join(REPO_ROOT, "fixtures", "agent-matrix", `${agent}.json`), "utf8"));
}
function workspace() {
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
function preTool(agent, tool, args, session, project) {
    const cwd = project.split("\\").join("/");
    if (agent === "copilot")
        return { sessionId: session, timestamp: 1763712000002, cwd, toolName: tool, toolArgs: JSON.stringify(args) };
    return { hook_event_name: "PreToolUse", conversation_id: session, workspace_roots: [cwd], tool_name: tool, tool_input: args };
}
/** The agent's own verified read (a shell `cat <FILE>`), from its fixture. */
function shellRead(agent, session, file, project) {
    const text = JSON.stringify(fixture(agent).evidence.read)
        .split("<SESSION>").join(session)
        .split("<FILE>").join(file)
        .split("<PROJECT>").join(project.split("\\").join("/"));
    return JSON.parse(text);
}
function runScript(script, args, stdin, dirs, extraEnv = {}) {
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (INHERITED_ENV.has(key.toLowerCase()) && value !== undefined)
            env[key] = value;
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
        child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
        child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
        const timer = setTimeout(() => child.kill(), 30_000);
        child.on("error", reject);
        child.on("close", (status) => {
            clearTimeout(timer);
            resolve({ stdout, stderr, status });
        });
        child.stdin.end(typeof stdin === "string" ? stdin : JSON.stringify(stdin));
    });
}
function at(value, path) {
    return path.reduce((node, key) => (node !== null && typeof node === "object" ? node[key] : undefined), value);
}
/** The deny reason, asserting the agent's verified deny shape. */
function denyReason(agent, run, where) {
    const shape = fixture(agent).expect.deny;
    const detail = `${where}\nstatus: ${run.status}\nstdout: ${run.stdout}\nstderr: ${run.stderr}`;
    assert.equal(run.status, shape.exitCode, detail);
    if (shape.exitCode === 2)
        return run.stderr;
    assert.notEqual(run.stdout, "", detail);
    const output = JSON.parse(run.stdout);
    for (const [key, value] of Object.entries(shape.json ?? {})) {
        if (value !== null && typeof value === "object") {
            for (const [inner, expected] of Object.entries(value))
                assert.equal(at(output, [key, inner]), expected, detail);
        }
        else {
            assert.equal(at(output, [key]), value, detail);
        }
    }
    const reason = at(output, shape.reasonAt[0]);
    assert.equal(typeof reason, "string", detail);
    return reason;
}
function assertAllowed(run, where) {
    const detail = `${where}\nstdout: ${run.stdout}\nstderr: ${run.stderr}`;
    assert.equal(run.status, 0, detail);
    assert.equal(run.stdout, "", detail);
}
/** Seeds this session's observation log with a shell read of `file`. */
async function observeRead(agent, session, file, dirs) {
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
            const source = AGENT_PROFILES.find((profile) => profile.id === agent).source;
            assert.match(source, new RegExp(`${tool}.*unverified`), `${agent}'s source says the keys of ${tool} are unverified`);
        });
        it(`${agent} ${tool}: reads the file at each key, and none from empty, malformed or unknown input`, () => {
            const alias = resolveInboundTool(tool);
            for (const key of KEYS)
                assert.deepEqual(inboundPaths(alias, { [key]: "a.txt", content: "x" }), ["a.txt"], key);
            assert.deepEqual(inboundPaths(alias, { path: "a.txt", file_path: "a.txt" }), ["a.txt"]);
            for (const input of [{}, null, [], "a.txt", 3, { path: "" }, { path: 3 }, { file: "a.txt" }, { paths: ["a.txt"] }]) {
                assert.deepEqual(inboundPaths(alias, input), [], JSON.stringify(input));
            }
        });
    }
    it("leaves every other tool as it was: no other file tool needs a path, and Claude names are no alias", () => {
        const required = new Set(TOOLS.map((entry) => entry.tool));
        for (const profile of AGENT_PROFILES) {
            for (const name of Object.keys(profile.tools)) {
                const alias = resolveInboundTool(name);
                if (alias === null || required.has(name))
                    continue;
                assert.equal(alias.pathRequired, false, `${profile.id}.${name}`);
            }
        }
        for (const name of ["Edit", "Write", "MultiEdit", "NotebookEdit", "Read"])
            assert.equal(resolveInboundTool(name), null, name);
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
                const hit = classifyMutation(tool, input);
                assert.ok(hit, JSON.stringify(input));
                assert.equal(hit.via, "no-path", JSON.stringify(input));
                for (const key of KEYS)
                    assert.ok(hit.target.includes(key), `${hit.target} names ${key}`);
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
            for (const key of KEYS)
                assert.ok(reason.includes(key), `${reason}\nnames ${key}`);
            assert.ok(reason.includes("gateguard-clear"), reason);
            // The reason's clear command, run as printed (its quoted arguments are JSON strings).
            const line = reason.split("\n").find((text) => text.includes("gateguard-clear"));
            const command = line.slice(line.indexOf("node ") + "node ".length);
            const args = [...command.matchAll(/"(?:[^"\\]|\\.)*"|--state/g)].map((match) => (match[0].startsWith("\"") ? JSON.parse(match[0]) : match[0]));
            const [script, ...rest] = args;
            assert.ok(script && script.endsWith("gateguard-clear.mjs"), command);
            const cleared = await runScript(script, rest, "", dirs);
            assert.equal(cleared.status, 0, cleared.stderr);
            assertAllowed(await runScript("hooks/gateguard.mjs", flag, payload, dirs), `${agent} ${tool} no path after the clear`);
            // The clearance is the tool's own: the other tool of the agent still gets the deny.
            const other = TOOLS.find((entry) => entry.agent === agent && entry.tool !== tool).tool;
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
