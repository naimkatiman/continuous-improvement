/**
 * Stop-hook loop guard and crash-safe hook entry points
 * (docs/plans/2026-11-21-all-agents.md, PR 9).
 *
 * The Stop hooks that can continue a turn (goal-drift-stop, typecheck-stop,
 * three-section-close) stay out of a Stop fire that an agent marks as a repeat:
 * stop_hook_active (Codex, Qwen, Gemini AfterAgent, Copilot, Devin, Droid,
 * Junie), Grok's camelCase stopHookActive, or Cursor's loop_count above 0
 * (imported Claude hooks get loop_limit null, so Cursor never caps them). On
 * Grok they also stay out unless reason is "end_turn": Grok fires an extra,
 * observe-only Stop at session end with reason channel_closed or shutdown.
 * Every key comes from the verified research of 2026-11-21 (skeptic verdicts
 * applied), and each agent's Stop payload is fixtures/agent-matrix/<agent>.json.
 *
 * Owner decision: the guard never applies to Claude Code, so its Stop bytes
 * stay those of v3.27.0 (fixtures/agent-hooks/claude.json). For the same
 * reason a hook crash under Claude Code is left to Node (exit 1, which Claude
 * Code reads as a non-blocking error). On every other agent a crash at Stop,
 * at a prompt or at session start is exit 0. A PreToolUse crash keeps a
 * non-zero exit (owner decision: the vendor's fail-closed default is kept):
 * exit 1, as Node gave in v3.27.0, for an agent with an encoder (Copilot and
 * the Kiro IDE read it as a deny), and exit 2 for an id with no encoder.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { hashProjectRoot } from "../lib/gateguard-state.mjs";
import { AGENT_IDS, normalizeEvent, settleHook, skipsStopGate } from "../lib/hook-io.mjs";
const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const MATRIX_DIR = join(REPO_ROOT, "fixtures", "agent-matrix");
const INHERITED_ENV = new Set(["path", "pathext", "systemroot", "systemdrive", "windir", "comspec", "temp", "tmp", "tmpdir"]);
const NON_CLAUDE = [...AGENT_IDS.filter((agent) => agent !== "claude"), "unknown", ""];
describe("normalizeEvent, Stop fields", () => {
    it("reads Grok's camelCase stopHookActive as stop-active", () => {
        assert.equal(normalizeEvent("grok", "Stop", { stopHookActive: true }).stopActive, true);
        assert.equal(normalizeEvent("grok", "Stop", { stopHookActive: "true" }).stopActive, false);
        assert.equal(normalizeEvent("grok", "Stop", { stopHookActive: false, stop_hook_active: false }).stopActive, false);
    });
    it("reads Grok's reason as the stop reason when it is a string", () => {
        assert.equal(normalizeEvent("grok", "Stop", { reason: "end_turn" }).stopReason, "end_turn");
        assert.equal(normalizeEvent("grok", "Stop", { reason: "channel_closed" }).stopReason, "channel_closed");
        assert.equal(normalizeEvent("grok", "Stop", { reason: 1 }).stopReason, undefined);
        assert.equal(normalizeEvent("grok", "Stop", {}).stopReason, undefined);
    });
    it("reads Cursor's loop_count: a non-negative integer as given, absent as null, anything else as Infinity", () => {
        assert.equal(normalizeEvent("cursor", "Stop", { loop_count: 0 }).loopCount, 0);
        assert.equal(normalizeEvent("cursor", "Stop", { loop_count: 3 }).loopCount, 3);
        assert.equal(normalizeEvent("cursor", "Stop", {}).loopCount, null);
        for (const value of ["1", -1, 1.5, null, true, {}]) {
            assert.equal(normalizeEvent("cursor", "Stop", { loop_count: value }).loopCount, Number.POSITIVE_INFINITY, JSON.stringify(value));
        }
    });
    it("gives a payload that is not an object no stop fields", () => {
        for (const payload of [null, [], 3, "x", undefined]) {
            const event = normalizeEvent("codex", "Stop", payload);
            assert.equal(event.stopActive, false);
            assert.equal(event.stopReason, undefined);
            assert.equal(event.loopCount, null);
        }
    });
});
describe("skipsStopGate", () => {
    const skips = (agent, payload) => skipsStopGate(normalizeEvent(agent, "Stop", payload));
    it("never skips for Claude Code (owner decision: v3.27.0 bytes)", () => {
        for (const payload of [
            { stop_hook_active: true },
            { stopHookActive: true },
            { loop_count: 4 },
            { loop_count: "x" },
            { reason: "shutdown" },
            {},
            null,
        ]) {
            assert.equal(skips("claude", payload), false, JSON.stringify(payload));
        }
    });
    for (const agent of NON_CLAUDE.filter((id) => id !== "grok")) {
        it(`${agent || "(empty id)"}: skips a repeat fire and only a repeat fire`, () => {
            assert.equal(skips(agent, { stop_hook_active: true }), true);
            assert.equal(skips(agent, { stopHookActive: true }), true);
            assert.equal(skips(agent, { loop_count: 1 }), true);
            assert.equal(skips(agent, { loop_count: "0" }), true, "a loop_count that is not an integer fails closed");
            assert.equal(skips(agent, { stop_hook_active: false }), false);
            assert.equal(skips(agent, { loop_count: 0 }), false);
            assert.equal(skips(agent, {}), false);
            assert.equal(skips(agent, null), false);
            assert.equal(skips(agent, { reason: "shutdown" }), false, "the end_turn rule is Grok's alone");
        });
        it(`${agent || "(empty id)"}: a repeat flag that is present but not a boolean fails closed, like loop_count`, () => {
            for (const value of ["true", "false", 1, 0, null, {}, []]) {
                assert.equal(skips(agent, { stop_hook_active: value }), true, `stop_hook_active ${JSON.stringify(value)}`);
                assert.equal(skips(agent, { stopHookActive: value }), true, `stopHookActive ${JSON.stringify(value)}`);
            }
            assert.equal(skips(agent, { stop_hook_active: false, stopHookActive: false }), false);
        });
    }
    it("claude: a malformed repeat flag changes nothing (v3.27.0 bytes)", () => {
        for (const value of ["true", 1, null]) {
            assert.equal(skips("claude", { stop_hook_active: value }), false, JSON.stringify(value));
            assert.equal(skips("claude", { stopHookActive: value }), false, JSON.stringify(value));
        }
    });
    it("grok: skips unless reason is end_turn, and on a repeat end_turn fire", () => {
        assert.equal(skips("grok", { reason: "end_turn" }), false);
        assert.equal(skips("grok", { reason: "end_turn", stopHookActive: false, stop_hook_active: false }), false);
        for (const payload of [
            { reason: "channel_closed" },
            { reason: "shutdown" },
            { reason: "END_TURN" },
            { reason: 1 },
            {},
            null,
            [],
            { reason: "end_turn", stopHookActive: true },
            { reason: "end_turn", stop_hook_active: true },
            { reason: "end_turn", loop_count: 2 },
            { reason: "end_turn", stopHookActive: "true" },
        ]) {
            assert.equal(skips("grok", payload), true, JSON.stringify(payload));
        }
    });
});
describe("settleHook", () => {
    const OUT = { stdout: "{}\n", stderr: "note\n", exitCode: 2 };
    it("returns the body's output, sync or async", async () => {
        assert.deepEqual(await settleHook(() => OUT, () => "claude"), OUT);
        assert.deepEqual(await settleHook(async () => OUT, () => "codex"), OUT);
        assert.deepEqual(await settleHook(() => OUT), OUT);
    });
    const crash = (agent, event) => settleHook(() => {
        throw new TypeError("Cannot read properties of null (reading 'tool_name')");
    }, agent, event);
    for (const agent of NON_CLAUDE) {
        it(`${agent || "(empty id)"}: a throw outside PreToolUse ends as exit 0, empty stdout, the error on stderr`, async () => {
            for (const event of [undefined, "Stop", "UserPromptSubmit", "SessionStart"]) {
                const out = await crash(() => agent, event);
                assert.equal(out.stdout, "", String(event));
                assert.equal(out.exitCode, 0, String(event));
                assert.match(out.stderr, /^\[continuous-improvement\] hook error: TypeError: Cannot read properties of null/);
            }
        });
    }
    for (const agent of AGENT_IDS.filter((id) => id !== "claude")) {
        it(`${agent}: a PreToolUse throw keeps v3.27.0's exit 1, so the vendor's own crash rule decides`, async () => {
            const out = await crash(() => agent, "PreToolUse");
            assert.equal(out.stdout, "");
            assert.equal(out.exitCode, 1);
            assert.match(out.stderr, /^\[continuous-improvement\] hook error: TypeError: Cannot read properties of null/);
        });
    }
    for (const agent of ["unknown", "", "mystery"]) {
        it(`${agent || "(empty id)"}: a PreToolUse throw for an id with no encoder is the fail-closed exit 2`, async () => {
            const out = await crash(() => agent, "PreToolUse");
            assert.equal(out.stdout, "");
            assert.equal(out.exitCode, 2);
            assert.match(out.stderr, /^\[continuous-improvement\] hook error: TypeError: Cannot read properties of null/);
        });
    }
    it("a PreToolUse throw whose agent cannot be read is the fail-closed exit 2", async () => {
        const out = await crash(() => {
            throw new Error("reader");
        }, "PreToolUse");
        assert.equal(out.exitCode, 2);
        assert.equal(out.stdout, "");
        const none = await settleHook(() => {
            throw new Error("body");
        }, undefined, "PreToolUse");
        assert.equal(none.exitCode, 2);
    });
    it("with no agent reader a throw ends as exit 0", async () => {
        const out = await settleHook(async () => Promise.reject(new Error("boom")));
        assert.equal(out.stdout, "");
        assert.equal(out.exitCode, 0);
        assert.match(out.stderr, /boom/);
    });
    it("claude: the throw is left to Node, the same error object", async () => {
        const error = new TypeError("Cannot read properties of null (reading 'prompt')");
        await assert.rejects(settleHook(() => {
            throw error;
        }, () => "claude"), (thrown) => thrown === error);
        await assert.rejects(settleHook(async () => Promise.reject(error), () => "claude"), (thrown) => thrown === error);
    });
    it("an agent reader that throws ends as exit 0 with the body's error", async () => {
        const out = await settleHook(() => {
            throw new Error("body");
        }, () => {
            throw new Error("reader");
        });
        assert.equal(out.exitCode, 0);
        assert.equal(out.stdout, "");
        assert.match(out.stderr, /Error: body/);
    });
    it("an unprintable throw for another agent still ends as one stderr line", async () => {
        const out = await settleHook(() => {
            throw Object.create(null);
        }, () => "kiro");
        assert.deepEqual(out, { stdout: "", stderr: "[continuous-improvement] hook error: unprintable error\n", exitCode: 0 });
    });
});
const GOAL_PLAN = "# Task Plan\n\n## Goal\nImplement OAuth login with JWT session tokens for the auth service.\n\n## Goal Keywords\noauth, jwt, login, session\n";
const LONG_TEXT = "Work summary. ".repeat(60);
const FAKE_TSC = 'console.error("fake tsc: error TS2322 in a.ts");\nprocess.exit(1);\n';
// Each Stop hook that can continue a turn, the knob that makes it continue on
// the workspace below, and a string its continue reason always holds.
const STOP_HOOKS = [
    { script: "hooks/goal-drift-stop.mjs", env: { CLAUDE_GOAL_DRIFT_GATE: "block" }, marker: "DRIFT" },
    { script: "hooks/typecheck-stop.mjs", env: { CLAUDE_TYPECHECK_GATE: "block" }, marker: "fake tsc: error TS2322" },
    { script: "hooks/three-section-close.mjs", env: { CLAUDE_THREE_SECTION_CLOSE: "1" }, marker: "3-section close" },
];
let root = "";
let home = "";
let project = "";
let transcript = "";
before(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "ci-stop-guard-")));
    home = join(root, "home");
    project = join(root, "project");
    mkdirSync(join(project, "node_modules", "typescript", "bin"), { recursive: true });
    mkdirSync(home, { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: project });
    writeFileSync(join(project, "tsconfig.json"), "{}\n");
    writeFileSync(join(project, "a.ts"), "export const x: number = 1;\n");
    writeFileSync(join(project, "task_plan.md"), GOAL_PLAN);
    writeFileSync(join(project, "node_modules", "typescript", "bin", "tsc"), FAKE_TSC);
    const instincts = join(home, ".claude", "instincts", hashProjectRoot(project));
    mkdirSync(instincts, { recursive: true });
    writeFileSync(join(instincts, "observations.jsonl"), ["src/marketing/banner.ts", "src/dashboard/widget.ts", "docs/roadmap.md"]
        .map((input) => JSON.stringify({ ts: "2026-11-21T12:00:00Z", tool: "Edit", input_summary: input, output_summary: "" }))
        .join("\n") + "\n");
    transcript = join(home, "transcript.jsonl");
    writeFileSync(transcript, JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: LONG_TEXT }] } }) + "\n");
});
after(() => {
    if (root)
        rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
function substitute(value) {
    if (typeof value === "string")
        return value.split("<HOME>").join(home).split("<PROJECT>").join(project);
    if (Array.isArray(value))
        return value.map(substitute);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substitute(item)]));
    }
    return value;
}
function run(script, args, stdin, extraEnv) {
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (INHERITED_ENV.has(key.toLowerCase()) && value !== undefined)
            env[key] = value;
    }
    Object.assign(env, {
        HOME: home,
        USERPROFILE: home,
        CLAUDE_PROJECT_DIR: project,
        GIT_CEILING_DIRECTORIES: root,
        GIT_CONFIG_NOSYSTEM: "1",
        ...extraEnv,
    });
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [join(REPO_ROOT, script), ...args], { cwd: project, env, stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
        child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
        const timer = setTimeout(() => child.kill(), 60_000);
        child.on("error", reject);
        child.on("close", (status) => {
            clearTimeout(timer);
            resolve({ stdout, stderr, status });
        });
        child.stdin.end(stdin);
    });
}
// Every Stop hook on one payload. The payload gets the workspace transcript, so
// goal-drift-stop and three-section-close have a substantive reply to score.
function fireStop(args, stdin) {
    const payload = JSON.stringify({ ...substitute(stdin), transcript_path: transcript });
    return Promise.all(STOP_HOOKS.map((hook) => run(hook.script, args, payload, hook.env)));
}
function detail(hook, output, where) {
    return `${where} ${hook.script}\nstatus: ${output.status}\nstdout: ${output.stdout}\nstderr: ${output.stderr}`;
}
function assertContinued(runs, where) {
    STOP_HOOKS.forEach((hook, index) => {
        const output = runs[index];
        assert.equal(output.status, 0, detail(hook, output, where));
        assert.ok(output.stdout.includes(hook.marker) || output.stderr.includes(hook.marker), detail(hook, output, where));
    });
}
function assertStayedOut(runs, where, hooks = STOP_HOOKS) {
    STOP_HOOKS.forEach((hook, index) => {
        if (!hooks.includes(hook))
            return;
        const output = runs[index];
        assert.equal(output.status, 0, detail(hook, output, where));
        assert.equal(output.stdout, "", detail(hook, output, where));
        assert.ok(!output.stderr.includes(hook.marker), detail(hook, output, where));
    });
}
function repeatOf(stdin) {
    const repeat = { ...stdin };
    let marked = false;
    for (const key of ["stop_hook_active", "stopHookActive"]) {
        if (key in stdin) {
            repeat[key] = true;
            marked = true;
        }
    }
    if ("loop_count" in stdin) {
        repeat.loop_count = 1;
        marked = true;
    }
    return marked ? repeat : null;
}
const stopFixtures = readdirSync(MATRIX_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(join(MATRIX_DIR, file), "utf8")))
    .filter((fixture) => fixture.agent !== "claude" && fixture.events.Stop);
describe("Stop hooks stay out of a repeat fire on other agents", () => {
    it("the fixtures with no repeat signal in their verified Stop payload are the ones listed", () => {
        // Kiro's documented Stop stdin is {hook_event_name, cwd, session_id}; Goose
        // and Auggie send neither stop_hook_active nor loop_count. The guard has
        // nothing to read for them. Cline wires no Stop hook.
        const without = stopFixtures.filter((fixture) => repeatOf(fixture.events.Stop.stdin) === null).map((fixture) => fixture.agent);
        assert.deepEqual(without, ["auggie", "goose", "kiro"]);
    });
    for (const fixture of stopFixtures) {
        const flag = ["--agent", fixture.agent];
        const stdin = fixture.events.Stop.stdin;
        const repeat = repeatOf(stdin);
        it(`${fixture.agent}: the first Stop fire continues the turn`, async () => {
            assertContinued(await fireStop(flag, stdin), `${fixture.agent} first fire`);
        });
        if (repeat) {
            it(`${fixture.agent}: a repeat Stop fire does not continue it again`, async () => {
                assertStayedOut(await fireStop(flag, repeat), `${fixture.agent} repeat fire`);
            });
        }
    }
    it("grok: the session-end Stop fires (channel_closed, shutdown) do nothing", async () => {
        const grok = stopFixtures.find((fixture) => fixture.agent === "grok").events.Stop.stdin;
        assert.equal(grok.reason, "end_turn");
        for (const reason of ["channel_closed", "shutdown"]) {
            assertStayedOut(await fireStop(["--agent", "grok"], { ...grok, reason }), `grok reason ${reason}`);
        }
    });
});
describe("Claude Code Stop bytes are unchanged (owner decision)", () => {
    const claude = JSON.parse(readFileSync(join(MATRIX_DIR, "claude.json"), "utf8")).events.Stop.stdin;
    it("goal-drift-stop and typecheck-stop still continue on stop_hook_active, loop_count and a non-end_turn reason", async () => {
        const runs = await fireStop([], { ...claude, stop_hook_active: true, loop_count: 3, reason: "shutdown" });
        STOP_HOOKS.slice(0, 2).forEach((hook, index) => {
            const output = runs[index];
            assert.equal(output.status, 0, detail(hook, output, "claude"));
            assert.equal(JSON.parse(output.stdout).decision, "block", detail(hook, output, "claude"));
        });
        // three-section-close has guarded on stop_hook_active for Claude Code since before this train.
        assertStayedOut(runs, "claude", [STOP_HOOKS[2]]);
    });
});
describe("bare Stop payloads: the guard applies only where the agent is selected", () => {
    // With no --agent and no CI_AGENT, an agent with no sniff (Codex, Droid,
    // Junie, and Copilot's Stop payload, which names no event) resolves to
    // claude, and the guard never applies to claude. Codex and Droid load the
    // unchanged Claude plugin, which passes no --agent, so a repeat block there
    // is unbounded until the installer renders the flag (docs/deferred.md).
    const repeats = stopFixtures
        .map((fixture) => ({ fixture, repeat: repeatOf(fixture.events.Stop.stdin) }))
        .filter((entry) => entry.repeat !== null);
    it("a repeat fire with no flag still continues on Codex, Copilot, Droid and Junie, and stays out where a sniff names the agent", async () => {
        const continued = [];
        for (const { fixture, repeat } of repeats) {
            const sniffEnv = substitute(fixture.selection?.sniff?.env ?? {});
            const payload = JSON.stringify({ ...substitute(repeat), transcript_path: transcript });
            const output = await run(STOP_HOOKS[0].script, [], payload, { ...STOP_HOOKS[0].env, ...sniffEnv });
            assert.equal(output.status, 0, detail(STOP_HOOKS[0], output, `${fixture.agent} bare`));
            if (output.stdout.includes(STOP_HOOKS[0].marker) || output.stderr.includes(STOP_HOOKS[0].marker))
                continued.push(fixture.agent);
        }
        assert.deepEqual(continued, ["codex", "copilot", "droid", "junie"]);
    });
});
describe("a hook crash ends as exit 0 on every other agent, except at PreToolUse", () => {
    const CRASHERS = [
        { script: "hooks/gateguard.mjs", env: {}, preTool: true },
        { script: "hooks/companion-preference.mjs", env: {}, preTool: true },
        { script: "hooks/route-prompt.mjs", env: { CI_ROUTE_PROMPT: "1" }, preTool: false },
    ];
    for (const hook of CRASHERS) {
        it(`${hook.script} on JSON null stdin`, async () => {
            // A PreToolUse crash keeps v3.27.0's exit 1, which Copilot (fail-closed on
            // errors) and the Kiro IDE read as a deny; every other exit is 0.
            const expected = hook.preTool ? 1 : 0;
            for (const agent of AGENT_IDS.filter((id) => id !== "claude")) {
                const output = await run(hook.script, ["--agent", agent], "null", hook.env);
                const where = `${agent}\nstdout: ${output.stdout}\nstderr: ${output.stderr}`;
                assert.equal(output.status, expected, where);
                assert.equal(output.stdout, "", where);
                assert.match(output.stderr, /^\[continuous-improvement\] hook error: TypeError: Cannot read properties of null/, where);
            }
            // An id with no encoder fails closed at PreToolUse.
            const unknown = await run(hook.script, ["--agent", "unknown"], "null", hook.env);
            assert.equal(unknown.status, hook.preTool ? 2 : 0, unknown.stderr);
            assert.equal(unknown.stdout, "");
            // CI_AGENT selects the agent the same way.
            const viaEnv = await run(hook.script, [], "null", { ...hook.env, CI_AGENT: "copilot" });
            assert.equal(viaEnv.status, expected, viaEnv.stderr);
            // Claude Code keeps the v3.27.0 crash (goldens <hook>/null-stdin): exit 1, Node's own report.
            const claude = await run(hook.script, [], "null", hook.env);
            assert.equal(claude.status, 1, claude.stderr);
            assert.match(claude.stderr, /TypeError: Cannot read properties of null/);
            assert.doesNotMatch(claude.stderr, /hook error/);
        });
    }
});
describe("hook entry points", () => {
    const hooks = readdirSync(join(REPO_ROOT, "hooks")).filter((file) => file.endsWith(".mjs"));
    const code = (file) => readFileSync(join(REPO_ROOT, "hooks", file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    it("covers the twelve hooks", () => {
        assert.equal(hooks.length, 12);
    });
    for (const file of hooks) {
        it(`${file} emits what settleHook returns, reading the agent through hookAgent`, () => {
            assert.match(code(file), /emit\(await settleHook\([\s\S]*?,\s*hookAgent(?:,\s*EVENT)?\)\);/);
        });
    }
    const PRE_TOOL = ["companion-preference.mjs", "config-guard.mjs", "gateguard.mjs", "hook-pack.mjs"];
    it("the PreToolUse hooks are the ones listed", () => {
        const wired = hooks.filter((file) => /const EVENT = "PreToolUse"/.test(code(file))).sort();
        assert.deepEqual(wired, PRE_TOOL);
    });
    for (const file of hooks) {
        const preTool = PRE_TOOL.includes(file);
        it(`${file} ${preTool ? "passes" : "does not pass"} its PreToolUse event to settleHook`, () => {
            const passes = /emit\(await settleHook\([\s\S]*?,\s*hookAgent,\s*EVENT\)\);/.test(code(file));
            assert.equal(passes, preTool);
        });
    }
    for (const file of ["goal-drift-stop.mjs", "typecheck-stop.mjs", "three-section-close.mjs"]) {
        it(`${file} checks skipsStopGate`, () => {
            assert.match(code(file), /\bskipsStopGate\(/);
        });
    }
});
