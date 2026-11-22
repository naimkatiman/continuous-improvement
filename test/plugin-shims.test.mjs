/**
 * In-process plugin shims (docs/plans/2026-11-21-all-agents.md, Architecture
 * item 13, PR 14): OpenCode and Amp have no stdin hooks, only JS/TS plugins
 * that run inside the agent. The bridge turns their tool calls into Claude
 * Code hook payloads, runs this repo's hooks on them, and reads the Claude
 * reply back. The OpenCode file is a dual default export (V1 server(), V2
 * {id, setup}); the Amp file registers tool.call, tool.result, agent.start
 * and agent.end. `install --target opencode|amp --hooks` writes them.
 *
 * Every OpenCode and Amp name, key and return shape below comes from the
 * verified research of 2026-11-21 (result.json research + skeptic verify for
 * OpenCode and Amp); the source files cite each one.
 *
 * RED first: none of the three modules existed, and neither agent had a
 * planner.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HOOK_AGENT_IDS, PLUGIN_AGENT_IDS, parseHookArgs, planAgentInstall, removeOwnedConfig, toLedgerFile, } from "../lib/agent-install-plans.mjs";
import { BRIDGE_HOOKS, createBridge, fileUrl, pluginMark, readReply } from "../lib/hook-bridge.mjs";
import { ampCall, createAmpPlugin, renderAmpPlugin } from "../lib/plugin-shim-amp.mjs";
import { createOpenCodePlugin, openCodeCall, renderOpenCodePlugin } from "../lib/plugin-shim-opencode.mjs";
import { getPluginHooksConfig } from "../lib/plugin-metadata.mjs";
const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const roots = [];
after(() => {
    for (const root of roots)
        rmSync(root, { recursive: true, force: true });
});
function tempDir(prefix) {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
    roots.push(dir);
    return dir;
}
// The spawned hooks inherit this process's env: no host knob (the host sets
// CI_GATEGUARD_EXCLUDE, which turns the file gate off) and a temp HOME.
const HOME = tempDir("ci-shims-home-");
for (const key of Object.keys(process.env))
    if (/^(CI_|CLAUDE_)/.test(key))
        delete process.env[key];
process.env.HOME = HOME;
process.env.USERPROFILE = HOME;
process.env.CLAUDE_CI_UPDATE_CHECK = "off";
// Built from parts so no destructive command is spelled out in this file.
const FORCE_PUSH = ["git", "push", "--for" + "ce", "origin", "main"].join(" ");
const PROJECT = tempDir("ci-shims-project-");
const OK = { stdout: "", stderr: "", exitCode: 0 };
const denyJson = (reason) => `${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } })}\n`;
const blockJson = (reason) => `${JSON.stringify({ decision: "block", reason })}\n`;
function fakeRun(replies = {}, log = []) {
    return async (script, payload) => {
        log.push({ script, payload });
        const reply = replies[script];
        return typeof reply === "function" ? reply() : (reply ?? OK);
    };
}
const opts = (run, over = {}) => ({
    runtimeDir: REPO_ROOT, failClosed: false, cwd: () => PROJECT, platform: "linux", run, ...over,
});
// A fake OpenCode V2 context: the hooks setup registers, and the synthetic messages it admits.
function v2Context() {
    const hooks = new Map();
    const synthetic = [];
    const register = (domain) => async (name, callback) => {
        hooks.set(`${domain}:${name}`, callback);
        return { dispose: async () => { } };
    };
    const ctx = { tool: { hook: register("tool") }, session: { hook: register("session"), synthetic: async (input) => void synthetic.push(input) } };
    return { ctx, hooks, synthetic };
}
function fakeAmp() {
    const handlers = new Map();
    return { amp: { on: (name, handler) => void handlers.set(name, handler) }, handlers };
}
async function load(content, name) {
    const dir = tempDir("ci-shims-file-");
    const file = join(dir, name);
    // The plugin file is ESM in a .js file, which OpenCode's Bun runs as a module.
    // Node 18 reads a .js file as CommonJS unless its package.json says otherwise.
    writeFileSync(join(dir, "package.json"), '{"type":"module"}\n');
    writeFileSync(file, content);
    return (await import(pathToFileURL(file).href)).default;
}
describe("hook-bridge", () => {
    it("reads the Claude reply: a deny JSON, an exit 2 and a {decision:block} block; a crash is an error; anything else allows", () => {
        assert.deepEqual(readReply("PreToolUse", { ...OK, stdout: denyJson("no") }), { kind: "block", reason: "no" });
        assert.deepEqual(readReply("PreToolUse", { ...OK, stdout: blockJson("stop") }), { kind: "block", reason: "stop" });
        assert.deepEqual(readReply("PreToolUse", { stdout: "", stderr: "why\n", exitCode: 2 }), { kind: "block", reason: "why" });
        assert.deepEqual(readReply("PreToolUse", { stdout: "", stderr: "  \n", exitCode: 2 }), { kind: "block", reason: "[continuous-improvement] blocked" });
        assert.deepEqual(readReply("PreToolUse", { stdout: "", stderr: "TypeError: boom", exitCode: 1 }), { kind: "error" });
        assert.deepEqual(readReply("PreToolUse", { stdout: "", stderr: "", exitCode: null }), { kind: "error" });
        assert.deepEqual(readReply("PreToolUse", { ...OK, stdout: "not json" }), { kind: "allow" });
        assert.deepEqual(readReply("PreToolUse", { ...OK, stdout: "null" }), { kind: "allow" });
        assert.deepEqual(readReply("PreToolUse", { ...OK, stdout: JSON.stringify({ hookSpecificOutput: { permissionDecision: "allow" } }) }), { kind: "allow" });
        assert.deepEqual(readReply("Stop", { ...OK, stdout: blockJson("keep going") }), { kind: "block", reason: "keep going" });
        assert.deepEqual(readReply("SessionStart", { ...OK, stdout: "lesson one\n" }), { kind: "context", text: "lesson one" });
        assert.deepEqual(readReply("SessionStart", { ...OK, stdout: "  \n" }), { kind: "allow" });
    });
    it("runs the guards a call's tool reaches, in parallel, and the first deny in table order wins", async () => {
        const log = [];
        const bridge = createBridge(opts(fakeRun({ "hooks/config-guard.mjs": { ...OK, stdout: denyJson("config") }, "hooks/hook-pack.mjs": { stdout: "", stderr: "pack", exitCode: 2 } }, log)));
        assert.equal(await bridge.preTool("s1", { tool: "Bash", input: { command: "x" } }), "pack");
        assert.deepEqual(log.map((call) => call.script), ["hooks/gateguard.mjs", "hooks/hook-pack.mjs", "hooks/config-guard.mjs"]);
        assert.deepEqual(log[0].payload, { hook_event_name: "PreToolUse", session_id: "s1", cwd: PROJECT, tool_name: "Bash", tool_input: { command: "x" } });
        log.length = 0;
        assert.equal(await bridge.preTool("s1", { tool: "Write", input: { file_path: "a.txt", content: "" } }), "config");
        assert.deepEqual(log.map((call) => call.script), ["hooks/gateguard.mjs", "hooks/config-guard.mjs"], "hook-pack gates shells only");
        log.length = 0;
        assert.equal(await bridge.preTool("s1", { tool: "apply_patch", input: { command: "*** Begin Patch\n*** End Patch" } }), "config");
        assert.deepEqual(log.map((call) => call.script), ["hooks/gateguard.mjs", "hooks/config-guard.mjs"]);
        log.length = 0;
        assert.equal(await bridge.preTool("s1", { tool: "Read", input: { file_path: "a.txt" } }), null);
        assert.deepEqual(log, [], "a read reaches no guard");
    });
    it("on win32 a shell call goes to each shell guard as Bash and as PowerShell (flavor unknown); elsewhere as Bash only", async () => {
        const log = [];
        await createBridge(opts(fakeRun({}, log), { platform: "win32" })).preTool("s", { tool: "Bash", input: { command: "x" } });
        assert.deepEqual(log.map((call) => `${call.script} ${String(call.payload.tool_name)}`), [
            "hooks/gateguard.mjs Bash", "hooks/gateguard.mjs PowerShell", "hooks/hook-pack.mjs Bash", "hooks/hook-pack.mjs PowerShell",
            "hooks/config-guard.mjs Bash", "hooks/config-guard.mjs PowerShell",
        ]);
    });
    it("a guard that crashes, times out or cannot start allows by default, and blocks when installed with --fail-closed", async () => {
        for (const reply of [{ stdout: "", stderr: "boom", exitCode: 1 }, { stdout: "", stderr: "", exitCode: null }]) {
            const run = fakeRun({ "hooks/gateguard.mjs": reply });
            assert.equal(await createBridge(opts(run)).preTool("s", { tool: "Bash", input: { command: "ls" } }), null);
            assert.match((await createBridge(opts(run, { failClosed: true })).preTool("s", { tool: "Bash", input: { command: "ls" } })) ?? "", /gateguard.*--fail-closed/);
        }
        const throwing = async () => {
            throw new Error("spawn failed");
        };
        assert.equal(await createBridge(opts(throwing)).preTool("s", { tool: "Bash", input: { command: "ls" } }), null);
        assert.notEqual(await createBridge(opts(throwing, { failClosed: true })).preTool("s", { tool: "Bash", input: { command: "ls" } }), null);
    });
    it("computes the lessons once per session, and continues a stop at most once in a row", async () => {
        const log = [];
        const bridge = createBridge(opts(fakeRun({ "hooks/session.mjs": { ...OK, stdout: "Lesson: read first\n" }, "hooks/typecheck-stop.mjs": { ...OK, stdout: blockJson("tsc failed") } }, log)));
        assert.deepEqual(await Promise.all([bridge.lessons("a"), bridge.lessons("a")]), ["Lesson: read first", "Lesson: read first"]);
        assert.equal(await bridge.lessons("b"), "Lesson: read first");
        assert.equal(log.filter((call) => call.script === "hooks/session.mjs").length, 2, "one run per session");
        assert.deepEqual(log[0].payload, { hook_event_name: "SessionStart", session_id: "a", cwd: PROJECT, source: "startup" });
        assert.equal(await bridge.stop("a"), "tsc failed");
        assert.equal(await bridge.stop("a"), null, "the fire after a continue is a repeat (stop_hook_active)");
        assert.equal(await bridge.stop("a"), "tsc failed");
        assert.deepEqual(log.filter((call) => call.script.includes("-stop")).map((call) => call.script).slice(0, 2), ["hooks/goal-drift-stop.mjs", "hooks/typecheck-stop.mjs"]);
    });
    it("the post-tool observer gets the call and its output, and a failing observer never throws", async () => {
        const log = [];
        await createBridge(opts(fakeRun({}, log))).postTool("s", { tool: "Read", input: { file_path: "a.txt" } }, "text");
        assert.deepEqual(log, [{ script: "bin/observe.mjs", payload: { hook_event_name: "PostToolUse", session_id: "s", cwd: PROJECT, tool_name: "Read", tool_input: { file_path: "a.txt" }, tool_response: "text" } }]);
        const throwing = async () => {
            throw new Error("x");
        };
        await createBridge(opts(throwing)).postTool("s", { tool: "Read", input: {} }, null);
    });
    it("wires the plugin's PreToolUse scripts except the Claude-only Skill group, plus the observer, the session lessons and two Stop gates", () => {
        const plugin = getPluginHooksConfig().hooks;
        const script = (command) => /\/((?:hooks|bin)\/[\w-]+\.mjs)"/.exec(command)[1];
        const pre = plugin.PreToolUse.filter((group) => group.matcher !== "Skill").flatMap((group) => group.hooks.map((hook) => script(hook.command)));
        assert.deepEqual(BRIDGE_HOOKS.preTool.map((hook) => hook.script), pre);
        assert.equal(BRIDGE_HOOKS.postTool, script(plugin.PostToolUse[0].hooks[0].command));
        assert.equal(BRIDGE_HOOKS.session, script(plugin.SessionStart[0].hooks[0].command));
        const stops = plugin.Stop[0].hooks.map((hook) => script(hook.command));
        for (const stop of BRIDGE_HOOKS.stop)
            assert.ok(stops.includes(stop), stop);
    });
    it("the real gateguard denies a destructive shell command through the bridge and allows ls", async () => {
        const bridge = createBridge({ runtimeDir: REPO_ROOT, failClosed: false, cwd: () => PROJECT });
        assert.match((await bridge.preTool("real", { tool: "Bash", input: { command: FORCE_PUSH } })) ?? "", /Destructive command/);
        assert.equal(await bridge.preTool("real", { tool: "Bash", input: { command: "ls" } }), null);
    });
    it("fileUrl is a file URL for a drive or POSIX path, spaces and # escaped, whatever the platform", () => {
        assert.equal(fileUrl("C:/Users/A B/rt/lib/x.mjs"), "file:///C:/Users/A%20B/rt/lib/x.mjs");
        assert.equal(fileUrl("C:\\Users\\a\\x.mjs"), "file:///C:/Users/a/x.mjs");
        assert.equal(fileUrl("/home/u/#rt/x.mjs"), "file:///home/u/%23rt/x.mjs");
    });
});
describe("OpenCode plugin", () => {
    it("maps V1 and V2 tool ids and keys to Claude names; anything else is no gated call", () => {
        const patch = "*** Begin Patch\n*** Update File: a.ts\n*** End Patch";
        const cases = [
            ["bash", { command: "ls", workdir: "/w" }, { tool: "Bash", input: { command: "ls" } }],
            ["shell", { command: "ls" }, { tool: "Bash", input: { command: "ls" } }],
            ["edit", { filePath: "a.ts", oldString: "x", newString: "y" }, { tool: "Edit", input: { file_path: "a.ts", old_string: "x", new_string: "y" } }],
            ["edit", { path: "a.ts", oldString: "x", newString: "y" }, { tool: "Edit", input: { file_path: "a.ts", old_string: "x", new_string: "y" } }],
            ["write", { filePath: "a.ts", content: "c" }, { tool: "Write", input: { file_path: "a.ts", content: "c" } }],
            ["write", { path: "a.ts", content: "c" }, { tool: "Write", input: { file_path: "a.ts", content: "c" } }],
            ["read", { filePath: "a.ts" }, { tool: "Read", input: { file_path: "a.ts" } }],
            ["apply_patch", { patchText: patch }, { tool: "apply_patch", input: { command: patch } }],
            ["patch", { patchText: patch }, { tool: "apply_patch", input: { command: patch } }],
            ["bash", null, { tool: "Bash", input: {} }],
            ["bash", { command: 42 }, { tool: "Bash", input: {} }],
            ["webfetch", { url: "x" }, null],
            ["Bash", { command: "ls" }, null],
            [undefined, { command: "ls" }, null],
            [7, {}, null],
        ];
        for (const [tool, args, expected] of cases)
            assert.deepEqual(openCodeCall(tool, args), expected, `${String(tool)} ${JSON.stringify(args)}`);
    });
    it("renders a local plugin file: our marker, an import of the runtime's shim by file URL, the options, and no @opencode import", () => {
        const text = renderOpenCodePlugin("/home/u/.claude/instincts/runtime/9.9.9", true);
        assert.ok(text.includes(pluginMark("opencode")));
        assert.match(text, /import \{ createOpenCodePlugin \} from "file:\/\/\/home\/u\/\.claude\/instincts\/runtime\/9\.9\.9\/lib\/plugin-shim-opencode\.mjs";/);
        assert.match(text, /export default createOpenCodePlugin\(\{"runtimeDir":"\/home\/u\/\.claude\/instincts\/runtime\/9\.9\.9","failClosed":true\}\);/);
        assert.doesNotMatch(text, /@opencode/);
    });
    it("the generated file's default export is one object with V2's id and setup and V1's server()", async () => {
        const plugin = await load(renderOpenCodePlugin(REPO_ROOT, false), "continuous-improvement.js");
        assert.equal(plugin.id, "continuous-improvement");
        assert.equal(typeof plugin.setup, "function");
        assert.equal(typeof plugin.server, "function");
        assert.equal("tui" in plugin, false, "V1 refuses a default export with both server() and tui()");
    });
    it("V1: tool.execute.before throws on a destructive bash command and resolves on ls (real hooks)", async () => {
        const plugin = await load(renderOpenCodePlugin(REPO_ROOT, false), "continuous-improvement.js");
        const hooks = await plugin.server({ directory: PROJECT, worktree: PROJECT });
        assert.deepEqual(Object.keys(hooks).sort(), ["experimental.chat.system.transform", "tool.execute.after", "tool.execute.before"]);
        await assert.rejects(hooks["tool.execute.before"]({ tool: "bash", sessionID: "ses_1", callID: "c1" }, { args: { command: FORCE_PUSH } }), /Destructive command/);
        await hooks["tool.execute.before"]({ tool: "bash", sessionID: "ses_1", callID: "c2" }, { args: { command: "ls" } });
    });
    it("V1 on a GPT model edits only through apply_patch: a patch that updates an unread file throws under the strict file gate", async () => {
        writeFileSync(join(PROJECT, "notes.txt"), "old\n");
        process.env.CI_GATEGUARD_FILE_GATE = "strict";
        try {
            const hooks = await createOpenCodePlugin({ runtimeDir: REPO_ROOT, failClosed: false }).server({ directory: PROJECT });
            const patchText = "*** Begin Patch\n*** Update File: notes.txt\n@@\n-old\n+new\n*** End Patch";
            await assert.rejects(hooks["tool.execute.before"]({ tool: "apply_patch", sessionID: "ses_p", callID: "c" }, { args: { patchText } }), /notes\.txt/);
        }
        finally {
            delete process.env.CI_GATEGUARD_FILE_GATE;
        }
    });
    it("V2: setup registers execute.before, execute.after, context, prompt and experimental.idle; execute.before rejects a destructive shell call", async () => {
        const plugin = await load(renderOpenCodePlugin(REPO_ROOT, false), "continuous-improvement.js");
        const { ctx, hooks } = v2Context();
        await plugin.setup(ctx);
        assert.deepEqual([...hooks.keys()].sort(), ["session:context", "session:experimental.idle", "session:prompt", "tool:execute.after", "tool:execute.before"]);
        const event = { tool: "shell", sessionID: "ses_2", agent: "build", messageID: "m", id: "c", input: { command: FORCE_PUSH } };
        await assert.rejects(hooks.get("tool:execute.before")(event), /Destructive command/);
        await hooks.get("tool:execute.before")({ ...event, input: { command: "ls" } });
    });
    it("V1 tool.execute.after and V2 execute.after swallow a failing observer", async () => {
        const throwing = async () => {
            throw new Error("observer down");
        };
        const plugin = createOpenCodePlugin(opts(throwing));
        const v1 = await plugin.server({ directory: PROJECT });
        await v1["tool.execute.after"]({ tool: "read", sessionID: "s", callID: "c", args: { filePath: "a" } }, { title: "", output: "x", metadata: {} });
        await v1["tool.execute.after"](null, undefined);
        const { ctx, hooks } = v2Context();
        await plugin.setup(ctx);
        await hooks.get("tool:execute.after")({ tool: "read", sessionID: "s", agent: "a", messageID: "m", id: "c", input: { path: "a" }, status: "completed", result: {} });
    });
    it("lessons: V1 pushes the text onto output.system, V2 pushes a text part onto event.system, on every request of the session", async () => {
        const log = [];
        const plugin = createOpenCodePlugin(opts(fakeRun({ "hooks/session.mjs": { ...OK, stdout: "Lesson: run tests\n" } }, log)));
        const v1 = await plugin.server({ directory: PROJECT });
        const first = { system: ["base"] };
        const second = { system: ["base"] };
        await v1["experimental.chat.system.transform"]({ sessionID: "s", model: {} }, first);
        await v1["experimental.chat.system.transform"]({ sessionID: "s", model: {} }, second);
        assert.deepEqual([first.system, second.system], [["base", "Lesson: run tests"], ["base", "Lesson: run tests"]]);
        const { ctx, hooks } = v2Context();
        await plugin.setup(ctx);
        const request = { sessionID: "v2", system: [] };
        await hooks.get("session:context")(request);
        assert.deepEqual(request.system, [{ type: "text", text: "Lesson: run tests" }]);
        assert.equal(log.filter((call) => call.script === "hooks/session.mjs").length, 2, "one lessons run per session");
    });
    it("V2 idle: a Stop gate that continues admits one synthetic message, the repeat fire and a busy session admit none", async () => {
        const log = [];
        const { ctx, hooks, synthetic } = v2Context();
        await createOpenCodePlugin(opts(fakeRun({ "hooks/goal-drift-stop.mjs": { ...OK, stdout: blockJson("back to the goal") } }, log))).setup(ctx);
        const idle = hooks.get("session:experimental.idle");
        await idle({ sessionID: "s", background: [] });
        await idle({ sessionID: "s", background: [] });
        await idle({ sessionID: "s", background: [{ type: "shell" }] });
        assert.deepEqual(synthetic, [{ sessionID: "s", text: "back to the goal" }]);
    });
});
describe("Amp plugin", () => {
    it("maps Amp's tool names and keys to Claude names; anything else is no gated call", () => {
        const patch = "*** Begin Patch\n*** Add File: b.ts\n+x\n*** End Patch";
        const cases = [
            ["Bash", { cmd: "ls", cwd: "/repo" }, { tool: "Bash", input: { command: "ls" } }],
            ["shell_command", { command: "ls", workdir: "/repo" }, { tool: "Bash", input: { command: "ls" } }],
            ["edit_file", { path: "a.ts", old_str: "x", new_str: "y" }, { tool: "Edit", input: { file_path: "a.ts", old_string: "x", new_string: "y" } }],
            ["create_file", { path: "a.ts", content: "c" }, { tool: "Write", input: { file_path: "a.ts", content: "c" } }],
            ["apply_patch", { patchText: patch }, { tool: "apply_patch", input: { command: patch } }],
            ["Read", { path: "a.ts" }, { tool: "Read", input: { file_path: "a.ts" } }],
            ["read_file", { path: "a.ts" }, { tool: "Read", input: { file_path: "a.ts" } }],
            ["Bash", { command: "ls" }, { tool: "Bash", input: {} }],
            ["Bash", "ls", { tool: "Bash", input: {} }],
            ["Grep", { pattern: "x" }, null],
            ["mcp.tool", {}, null],
            [null, {}, null],
        ];
        for (const [tool, input, expected] of cases)
            assert.deepEqual(ampCall(tool, input), expected, `${String(tool)} ${JSON.stringify(input)}`);
    });
    it("the generated file registers tool.call, tool.result, agent.start and agent.end; tool.call rejects a destructive Bash and allows ls (real hooks)", async () => {
        const text = renderAmpPlugin(REPO_ROOT, false);
        assert.ok(text.includes(pluginMark("amp")));
        assert.doesNotMatch(text, /@ampcode/);
        // Amp loads the .ts file with its embedded Bun; the text is plain JS, so Node loads the same bytes as .mjs.
        const plugin = await load(text, "continuous-improvement.mjs");
        const { amp, handlers } = fakeAmp();
        plugin(amp);
        assert.deepEqual([...handlers.keys()].sort(), ["agent.end", "agent.start", "tool.call", "tool.result"]);
        const call = { toolUseID: "toolu_01", tool: "Bash", input: { cmd: FORCE_PUSH, cwd: PROJECT }, thread: { id: "T-1" } };
        const rejected = (await handlers.get("tool.call")(call, {}));
        assert.equal(rejected.action, "reject-and-continue");
        assert.match(rejected.message, /Destructive command/);
        assert.deepEqual(await handlers.get("tool.call")({ ...call, tool: "shell_command", input: { command: "ls" } }, {}), { action: "allow" });
    });
    it("agent.start returns the lessons as a hidden message on a thread's first turn only", async () => {
        const { amp, handlers } = fakeAmp();
        createAmpPlugin(opts(fakeRun({ "hooks/session.mjs": { ...OK, stdout: "Lesson: small diffs\n" } })))(amp);
        const start = handlers.get("agent.start");
        assert.deepEqual(await start({ thread: { id: "T-1" }, message: "hi", id: "m1" }, {}), { message: { content: "Lesson: small diffs", display: false } });
        assert.deepEqual(await start({ thread: { id: "T-1" }, message: "again", id: "m2" }, {}), {});
        assert.deepEqual(await start({ thread: { id: "T-2" }, message: "hi", id: "m3" }, {}), { message: { content: "Lesson: small diffs", display: false } });
        assert.deepEqual(await start({ message: "no thread" }, {}), {});
    });
    it("agent.end continues with maxContinuations 1 when a Stop gate continues a finished turn, and never after an error or cancel", async () => {
        const { amp, handlers } = fakeAmp();
        createAmpPlugin(opts(fakeRun({ "hooks/typecheck-stop.mjs": { ...OK, stdout: blockJson("fix tsc") } })))(amp);
        const end = handlers.get("agent.end");
        const event = { thread: { id: "T" }, message: "", id: "m", status: "done", messages: [] };
        assert.deepEqual(await end({ ...event, status: "error" }, {}), undefined);
        assert.deepEqual(await end({ ...event, status: "cancelled" }, {}), undefined);
        assert.deepEqual(await end(event, {}), { action: "continue", userMessage: "fix tsc", maxContinuations: 1 });
        assert.deepEqual(await end(event, {}), undefined, "the repeat fire");
    });
    it("tool.result observes and returns nothing, even when the observer fails; a failing guard follows --fail-closed", async () => {
        const throwing = async () => {
            throw new Error("down");
        };
        for (const failClosed of [false, true]) {
            const { amp, handlers } = fakeAmp();
            createAmpPlugin(opts(throwing, { failClosed }))(amp);
            assert.equal(await handlers.get("tool.result")({ toolUseID: "t", tool: "Read", input: { path: "a" }, status: "done", output: "x", thread: { id: "T" } }, {}), undefined);
            const reply = (await handlers.get("tool.call")({ toolUseID: "t", tool: "Bash", input: { cmd: "ls" }, thread: { id: "T" } }, {}));
            assert.equal(reply.action, failClosed ? "reject-and-continue" : "allow");
        }
    });
});
// Review finding (PR 14): the one-continue guard was cleared only by the next
// stop(), so a continuation that never reached it (an Amp cancel or error, an
// OpenCode 2.x interruption, a throwing synthetic()) left it set, and the
// first real Stop after a new prompt let the turn end.
describe("the Stop guard resets on a new user prompt", () => {
    it("bridge: resetStop clears the one-continue guard for that session only", async () => {
        const bridge = createBridge(opts(fakeRun({ "hooks/goal-drift-stop.mjs": { ...OK, stdout: blockJson("drift") } })));
        assert.equal(await bridge.stop("a"), "drift");
        assert.equal(await bridge.stop("b"), "drift");
        bridge.resetStop("a");
        assert.equal(await bridge.stop("a"), "drift", "a new prompt makes the next Stop a first fire");
        assert.equal(await bridge.stop("b"), null, "another session keeps its guard");
        bridge.resetStop(undefined);
    });
    it("Amp: a cancelled continuation then a new prompt gates the next finished turn again", async () => {
        const log = [];
        const { amp, handlers } = fakeAmp();
        createAmpPlugin(opts(fakeRun({ "hooks/goal-drift-stop.mjs": { ...OK, stdout: blockJson("drift: keep going") } }, log)))(amp);
        const start = handlers.get("agent.start");
        const end = handlers.get("agent.end");
        const thread = { id: "T-r" };
        await start({ thread, message: "do x", id: "m1" }, {});
        assert.deepEqual(await end({ thread, status: "done", messages: [] }, {}), { action: "continue", userMessage: "drift: keep going", maxContinuations: 1 });
        assert.equal(await end({ thread, status: "cancelled", messages: [] }, {}), undefined);
        await start({ thread, message: "now do y", id: "m2" }, {});
        assert.deepEqual(await end({ thread, status: "done", messages: [] }, {}), { action: "continue", userMessage: "drift: keep going", maxContinuations: 1 });
        assert.equal(log.filter((call) => call.script === "hooks/goal-drift-stop.mjs").length, 2);
    });
    it("OpenCode 2.x: a user prompt resets the guard, our own synthetic prompt does not, and a throwing synthetic() resets it", async () => {
        const { ctx, hooks, synthetic } = v2Context();
        await createOpenCodePlugin(opts(fakeRun({ "hooks/goal-drift-stop.mjs": { ...OK, stdout: blockJson("back to the goal") } }))).setup(ctx);
        const idle = hooks.get("session:experimental.idle");
        const prompt = hooks.get("session:prompt");
        assert.ok(prompt, "setup registers the session prompt hook");
        await idle({ sessionID: "s", background: [] });
        // The continuation's own prompt carries the text we admitted: still a repeat.
        await prompt({ sessionID: "s", messageID: "m1", prompt: { text: "back to the goal", files: [] } });
        await idle({ sessionID: "s", background: [] });
        assert.equal(synthetic.length, 1, "no loop through our own synthetic message");
        await prompt({ sessionID: "s", messageID: "m2", prompt: { text: "next task", files: [] } });
        await idle({ sessionID: "s", background: [] });
        assert.equal(synthetic.length, 2, "a user prompt makes the next idle a first fire");
        const failing = v2Context();
        let calls = 0;
        failing.ctx.session.synthetic = async () => {
            calls += 1;
            if (calls === 1)
                throw new Error("not admitted");
        };
        await createOpenCodePlugin(opts(fakeRun({ "hooks/goal-drift-stop.mjs": { ...OK, stdout: blockJson("drift") } }))).setup(failing.ctx);
        await failing.hooks.get("session:experimental.idle")({ sessionID: "t", background: [] });
        await failing.hooks.get("session:experimental.idle")({ sessionID: "t", background: [] });
        assert.equal(calls, 2, "nothing was admitted, so the next idle is not a repeat");
    });
});
// Review finding (PR 14): a host API of the wrong shape registered nothing and said nothing.
describe("a host plugin API without the hook registry", () => {
    async function capturingErrors(body) {
        const errors = [];
        const original = console.error;
        console.error = (...args) => void errors.push(args.map(String).join(" "));
        try {
            return { value: await body(), errors };
        }
        finally {
            console.error = original;
        }
    }
    it("OpenCode 2.x setup without ctx.tool.hook fails the plugin load under --fail-closed and warns otherwise", async () => {
        for (const ctx of [{}, { tool: {} }, { tool: { hook: "x" }, session: {} }]) {
            await assert.rejects(createOpenCodePlugin(opts(fakeRun(), { failClosed: true })).setup(ctx), /continuous-improvement.*tool\.hook/);
            const { errors } = await capturingErrors(() => createOpenCodePlugin(opts(fakeRun())).setup(ctx));
            assert.equal(errors.length, 1, JSON.stringify(ctx));
            assert.match(errors[0], /continuous-improvement.*tool\.hook.*ungated/);
        }
        const { errors } = await capturingErrors(() => createOpenCodePlugin(opts(fakeRun(), { failClosed: true })).setup(v2Context().ctx));
        assert.deepEqual(errors, [], "a full context warns about nothing");
    });
    it("Amp without amp.on fails the plugin load under --fail-closed and warns otherwise", async () => {
        for (const amp of [{}, null, { on: 1 }]) {
            assert.throws(() => createAmpPlugin(opts(fakeRun(), { failClosed: true }))(amp), /continuous-improvement.*amp\.on/);
            const { errors } = await capturingErrors(async () => createAmpPlugin(opts(fakeRun()))(amp));
            assert.equal(errors.length, 1, JSON.stringify(amp));
            assert.match(errors[0], /continuous-improvement.*amp\.on.*ungated/);
        }
        const { errors } = await capturingErrors(async () => createAmpPlugin(opts(fakeRun(), { failClosed: true }))(fakeAmp().amp));
        assert.deepEqual(errors, []);
    });
});
const RT = "/home/u/.claude/instincts/runtime/9.9.9";
function ctx(over = {}, files = {}) {
    return {
        scope: "project", runtimeDir: RT, projectRoot: "/work/repo", home: "/home/u", platform: "linux", env: {}, failClosed: false,
        read: (path) => (Object.hasOwn(files, path) ? files[path] : null), listDir: () => [], documentsDir: () => null, ...over,
    };
}
describe("install --target opencode|amp --hooks (planner)", () => {
    it("opencode and amp are plugin agents: hook-only, so they need --hooks; the native hook agents are unchanged", () => {
        assert.deepEqual([...PLUGIN_AGENT_IDS], ["opencode", "amp"]);
        assert.equal(HOOK_AGENT_IDS.includes("opencode") || HOOK_AGENT_IDS.includes("amp"), false);
        for (const agent of PLUGIN_AGENT_IDS) {
            const parsed = parseHookArgs(["install", "--target", agent]);
            assert.match(parsed.mode === "error" ? parsed.message : "", new RegExp(`${agent} needs --hooks`));
        }
        const parsed = parseHookArgs(["install", "--target", "opencode,amp,codex", "--hooks", "--scope", "user"]);
        assert.deepEqual(parsed.mode === "install" ? parsed.agents : null, ["opencode", "amp", "codex"]);
    });
    it("writes one plugin file we own, at the verified path for each scope", () => {
        const paths = (agent, over = {}) => planAgentInstall(agent, ctx(over)).writes.map((write) => write.path);
        assert.deepEqual(paths("opencode"), ["/work/repo/.opencode/plugins/continuous-improvement.js"]);
        assert.deepEqual(paths("opencode", { scope: "user" }), ["/home/u/.config/opencode/plugins/continuous-improvement.js"]);
        assert.deepEqual(paths("amp"), ["/work/repo/.amp/plugins/continuous-improvement.ts"]);
        assert.deepEqual(paths("amp", { scope: "user" }), ["/home/u/.config/amp/plugins/continuous-improvement.ts"]);
        assert.deepEqual(paths("amp", { scope: "user", env: { XDG_CONFIG_HOME: "/xdg" } }), ["/xdg/amp/plugins/continuous-improvement.ts"]);
        assert.deepEqual(paths("amp", { scope: "user", env: { XDG_CONFIG_HOME: "rel" } }), ["/home/u/.config/amp/plugins/continuous-improvement.ts"]);
        const write = planAgentInstall("opencode", ctx({ failClosed: true })).writes[0];
        assert.equal(write.content, renderOpenCodePlugin(RT, true));
        assert.equal(write.created, true);
        assert.ok(write.script?.sha256, "the uninstall deletes it only while unchanged");
    });
    it("a same-name file without our marker is refused; ours is replaced; the uninstall deletes it only while unchanged", () => {
        const path = "/work/repo/.amp/plugins/continuous-improvement.ts";
        const refused = planAgentInstall("amp", ctx({}, { [path]: "export default function (amp) {}\n" }));
        assert.match(refused.error ?? "", /did not write it/);
        assert.deepEqual(refused.writes, []);
        const replaced = planAgentInstall("amp", ctx({}, { [path]: renderAmpPlugin("/old/runtime/1.0.0", false) }));
        assert.equal(replaced.error, undefined);
        assert.equal(replaced.writes[0].created, false);
        const file = toLedgerFile(replaced.writes[0]);
        assert.deepEqual(removeOwnedConfig(replaced.writes[0].content, file), { kind: "delete" });
        assert.equal(removeOwnedConfig(`${replaced.writes[0].content}// mine\n`, file).kind, "error");
    });
    it("MCP: Amp user scope runs `amp mcp add` (undo `amp mcp remove`), project scope prints the .amp/settings.json entry; OpenCode prints the V1 and V2 opencode.json shapes", () => {
        const server = ["node", `${RT}/bin/mcp-server.mjs`, "--mode", "expert"];
        assert.deepEqual(planAgentInstall("amp", ctx({ scope: "user" })).runs, [{ argv: ["amp", "mcp", "add", "continuous-improvement", "--", ...server], undo: ["amp", "mcp", "remove", "continuous-improvement"] }]);
        const project = planAgentInstall("amp", ctx());
        assert.deepEqual(project.runs, []);
        assert.ok(project.printed.join("\n").includes(JSON.stringify({ "amp.mcpServers": { "continuous-improvement": { command: "node", args: server.slice(1) } } })));
        assert.match(project.printed.join("\n"), /amp mcp approve continuous-improvement/);
        const opencode = planAgentInstall("opencode", ctx()).printed.join("\n");
        assert.ok(opencode.includes(JSON.stringify({ mcp: { "continuous-improvement": { type: "local", command: server, enabled: true } } })), "V1");
        assert.ok(opencode.includes(JSON.stringify({ mcp: { servers: { "continuous-improvement": { type: "local", command: server } } } })), "V2");
        assert.deepEqual(planAgentInstall("opencode", ctx({ scope: "user" })).runs, []);
    });
});
describe("install --target opencode,amp --hooks (spawned)", () => {
    it("writes both plugin files in the project; the written OpenCode file denies through the installed runtime; the uninstall removes both", async () => {
        const root = tempDir("ci-shims-install-");
        const home = join(root, "home");
        const project = join(root, "project");
        mkdirSync(home, { recursive: true });
        mkdirSync(project, { recursive: true });
        const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: project, CLAUDE_CI_UPDATE_CHECK: "off", GIT_CEILING_DIRECTORIES: root };
        const install = (args) => spawnSync(process.execPath, [join(REPO_ROOT, "bin", "install.mjs"), ...args], { cwd: project, env, encoding: "utf8", timeout: 60_000 });
        const out = install(["install", "--target", "opencode,amp", "--hooks"]);
        assert.equal(out.status, 0, out.stderr);
        const opencode = join(project, ".opencode", "plugins", "continuous-improvement.js");
        const amp = join(project, ".amp", "plugins", "continuous-improvement.ts");
        assert.ok(existsSync(opencode) && existsSync(amp), out.stdout);
        assert.match(readFileSync(opencode, "utf8"), /runtime\/[^/]+\/lib\/plugin-shim-opencode\.mjs/);
        const plugin = await load(readFileSync(opencode, "utf8"), "continuous-improvement.js");
        const hooks = await plugin.server({ directory: project });
        await assert.rejects(hooks["tool.execute.before"]({ tool: "bash", sessionID: "ses_i", callID: "c" }, { args: { command: FORCE_PUSH } }), /Destructive command/);
        const removed = install(["--uninstall", "--target", "opencode,amp"]);
        assert.equal(removed.status, 0, removed.stderr);
        assert.equal(existsSync(opencode) || existsSync(amp), false);
    });
});
