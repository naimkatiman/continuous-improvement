/**
 * Every hook against every agent (docs/plans/2026-11-21-all-agents.md, PR 8).
 *
 * fixtures/agent-matrix/<agent>.json holds one hook stdin per Claude Code event
 * the plugin wires, in that agent's verified payload shape, each with its source
 * and the date it was checked; keys the source does not document are listed
 * under `unverified`. For each agent this runs the built hooks with
 * `--agent <id>` and checks three things:
 *
 * - deny: gateguard over a destructive command prints the agent's verified deny
 *   shape (or exit 2 with the reason on stderr where that is the agent's deny);
 * - allow: every wired hook over a routine payload prints nothing on stdout and
 *   exits 0, because stray stdout blocks every tool call on Cursor 3.x and
 *   breaks Copilot and Goose parsing;
 * - context: session.mjs at session start puts a stored lesson in the agent's
 *   verified context field, or prints nothing where the agent has none.
 *
 * It also runs the deny without the flag: through the agent's env sniff, and
 * with no agent signal at all, where a Claude-shaped payload gets the claude
 * bytes and any other shape gets the exit 2 fallback, never an allow.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { AGENT_IDS } from "../lib/hook-io.mjs";
const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const MATRIX_DIR = join(REPO_ROOT, "fixtures", "agent-matrix");
const PLUGIN_HOOKS_JSON = join(REPO_ROOT, "plugins", "continuous-improvement", "hooks", "hooks.json");
const INHERITED_ENV = new Set(["path", "pathext", "systemroot", "systemdrive", "windir", "comspec", "temp", "tmp", "tmpdir"]);
// Built from parts so this file's text never holds the whole command.
const DESTRUCTIVE = ["git", "push", "--force", "origin", "main"].join(" ");
const DESTRUCTIVE_RULE = "git-push-force";
const ROUTINE = "git status";
const LESSON = "Run npm run build first.";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const roots = [];
after(() => {
    for (const root of roots)
        rmSync(root, { recursive: true, force: true });
});
function loadFixtures() {
    return readdirSync(MATRIX_DIR)
        .filter((file) => file.endsWith(".json"))
        .sort()
        .map((file) => JSON.parse(readFileSync(join(MATRIX_DIR, file), "utf8")));
}
function wiredHooks() {
    const wiring = JSON.parse(readFileSync(PLUGIN_HOOKS_JSON, "utf8"));
    return Object.entries(wiring.hooks).flatMap(([event, groups]) => groups.flatMap((group) => group.hooks.map((hook) => {
        const script = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"/.exec(hook.command)?.[1];
        assert.ok(script, `unrecognised hook command in hooks.json: ${hook.command}`);
        return { script, event };
    })));
}
function workspace(lesson) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "ci-agent-matrix-")));
    roots.push(root);
    const home = join(root, "home");
    const project = join(root, "project");
    mkdirSync(project, { recursive: true });
    mkdirSync(home, { recursive: true });
    if (lesson) {
        const dir = join(home, ".claude", "instincts", "global");
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "build-before-stage.yaml"), `id: build-before-stage\ntrigger: "when staging generated files"\nconfidence: 0.8\ndomain: workflow\nsource: manual\nscope: global\nproject_id: global\ncreated: "2026-11-21"\nlast_seen: "2026-11-21"\nobservation_count: 1\n---\n${LESSON}\n`);
    }
    return { root, home, project };
}
function substitute(value, dirs, command) {
    if (typeof value === "string") {
        // The JSON-encoded strings (Copilot toolArgs, Cline parameters) hold only
        // <COMMAND>, which has no character JSON escapes.
        return value.split("<HOME>").join(dirs.home).split("<PROJECT>").join(dirs.project).split("<COMMAND>").join(command);
    }
    if (Array.isArray(value))
        return value.map((item) => substitute(item, dirs, command));
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substitute(item, dirs, command)]));
    }
    return value;
}
function runHook(script, args, payload, command, extraEnv, lesson = false, dirs = workspace(lesson)) {
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
    });
    for (const [key, value] of Object.entries(extraEnv))
        env[key] = String(substitute(value, dirs, command));
    const stdin = JSON.stringify(substitute(payload.stdin, dirs, command));
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [join(REPO_ROOT, script), ...args], { cwd: dirs.project, env, stdio: ["pipe", "pipe", "pipe"] });
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
        child.stdin.end(stdin);
    });
}
function at(value, path) {
    return path.reduce((node, key) => (node !== null && typeof node === "object" ? node[key] : undefined), value);
}
function assertSubset(actual, expected, where) {
    if (expected !== null && typeof expected === "object") {
        for (const [key, value] of Object.entries(expected))
            assertSubset(at(actual, [key]), value, `${where}.${key}`);
    }
    else {
        assert.equal(actual, expected, where);
    }
}
function assertDeny(expect, run, where, needle = DESTRUCTIVE_RULE) {
    const detail = `${where}\nstdout: ${run.stdout}\nstderr: ${run.stderr}`;
    assert.equal(run.status, expect.exitCode, detail);
    if (expect.exitCode === 2) {
        assert.equal(run.stdout, "", detail);
        assert.ok(run.stderr.includes(needle), detail);
        return;
    }
    const output = JSON.parse(run.stdout);
    assertSubset(output, expect.json, detail);
    for (const path of expect.reasonAt) {
        const reason = at(output, path);
        assert.ok(typeof reason === "string" && reason.includes(needle), `${detail}\nreason at ${path.join(".")}`);
    }
}
function assertContext(expect, run, where) {
    const detail = `${where}\nstdout: ${run.stdout}\nstderr: ${run.stderr}`;
    assert.equal(run.status, 0, detail);
    if ("none" in expect) {
        assert.equal(run.stdout, "", detail);
    }
    else if ("plain" in expect) {
        assert.ok(run.stdout.includes(LESSON) && !run.stdout.startsWith("{"), detail);
    }
    else {
        const text = at(JSON.parse(run.stdout), expect.jsonAt);
        assert.ok(typeof text === "string" && text.includes(LESSON), detail);
    }
}
const CLAUDE_DENY = {
    source: "fixtures/agent-matrix/claude.json",
    exitCode: 0,
    json: { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" } },
    reasonAt: [["hookSpecificOutput", "permissionDecisionReason"]],
};
const FALLBACK_DENY = { source: "src/lib/hook-io.mts encodeUnknown", exitCode: 2, stderrReason: true };
const fixtures = loadFixtures();
const wired = wiredHooks();
describe("agent matrix fixtures", () => {
    it("cover every agent with an encoder, one file each", () => {
        assert.deepEqual(fixtures.map((fixture) => fixture.agent).sort(), [...AGENT_IDS].sort());
    });
    for (const fixture of fixtures) {
        it(`${fixture.agent}: every payload carries its source, the date checked and its unverified keys`, () => {
            assert.ok(fixture.source.length > 0);
            assert.match(fixture.checked, DATE);
            assert.ok(fixture.expect.deny.source.length > 0);
            assert.ok(fixture.expect.context.source.length > 0);
            if (fixture.selection.sniff)
                assert.ok(fixture.selection.sniff.source.length > 0);
            else
                assert.ok((fixture.selection.sniffNote ?? "").length > 0, "a fixture with no sniff says why");
            for (const [event, payload] of Object.entries(fixture.events)) {
                assert.ok(payload.source.length > 0, event);
                assert.match(payload.checked, DATE, event);
                assert.ok(Array.isArray(payload.unverified), event);
            }
        });
        it(`${fixture.agent}: every wired event has a payload or says why the agent has none`, () => {
            assert.ok(fixture.events.PreToolUse && fixture.events.SessionStart, "PreToolUse and SessionStart are required");
            for (const event of new Set(wired.map((hook) => hook.event))) {
                const covered = event in fixture.events;
                const absent = (fixture.absent[event] ?? "").length > 0;
                assert.ok(covered !== absent, `${event}: exactly one of events or absent`);
            }
        });
    }
});
for (const fixture of fixtures) {
    const flag = ["--agent", fixture.agent];
    const pre = fixture.events.PreToolUse;
    describe(`${fixture.agent} through every hook`, () => {
        it("deny: gateguard prints the agent's verified deny", async () => {
            assertDeny(fixture.expect.deny, await runHook("hooks/gateguard.mjs", flag, pre, DESTRUCTIVE, {}), `${fixture.agent} --agent`);
        });
        it("deny without --agent: the sniff picks the agent, or there is none", { skip: fixture.selection.sniff ? false : "no sniff" }, async () => {
            const run = await runHook("hooks/gateguard.mjs", [], pre, DESTRUCTIVE, fixture.selection.sniff.env);
            assertDeny(fixture.expect.deny, run, `${fixture.agent} sniff`);
        });
        it(`deny with no agent signal: ${fixture.selection.bare}, never an allow`, async () => {
            const run = await runHook("hooks/gateguard.mjs", [], pre, DESTRUCTIVE, {});
            assertDeny(fixture.selection.bare === "claude" ? CLAUDE_DENY : FALLBACK_DENY, run, `${fixture.agent} bare`);
        });
        it("deny through CI_AGENT matches --agent", async () => {
            assertDeny(fixture.expect.deny, await runHook("hooks/gateguard.mjs", [], pre, DESTRUCTIVE, { CI_AGENT: fixture.agent }), `${fixture.agent} CI_AGENT`);
        });
        it("allow: every wired hook prints nothing on stdout and exits 0", async () => {
            const hooks = wired.filter((hook) => hook.event in fixture.events);
            const runs = await Promise.all(hooks.map((hook) => runHook(hook.script, flag, fixture.events[hook.event], ROUTINE, {})));
            hooks.forEach((hook, index) => {
                const run = runs[index];
                const where = `${fixture.agent} ${hook.script} on ${hook.event}\nstdout: ${run.stdout}\nstderr: ${run.stderr}`;
                assert.equal(run.status, 0, where);
                assert.equal(run.stdout, "", where);
            });
        });
        it("context: session start puts a stored lesson in the agent's verified field", async () => {
            const run = await runHook("hooks/session.mjs", flag, fixture.events.SessionStart, ROUTINE, {}, true);
            assertContext(fixture.expect.context, run, `${fixture.agent} --agent`);
        });
        it("context without --agent: the sniff picks the agent's field at session start too", { skip: fixture.selection.sniff ? false : "no sniff" }, async () => {
            const run = await runHook("hooks/session.mjs", [], fixture.events.SessionStart, ROUTINE, fixture.selection.sniff.env, true);
            assertContext(fixture.expect.context, run, `${fixture.agent} sniff`);
        });
    });
}
describe("a session payload that names no event", () => {
    // Copilot's camelCase sessionStart is read as SessionStart by its source alone,
    // so a payload with no event key and no start source prints no lessons.
    for (const stdin of [
        { sessionId: "c", cwd: "<PROJECT>" },
        { sessionId: "c", cwd: "<PROJECT>", source: "compact" },
        { sessionId: "c", cwd: "<PROJECT>", source: 3 },
        { sessionId: "c", cwd: "<PROJECT>", source: "new", event: "Stop" },
    ]) {
        it(`prints no lessons for ${JSON.stringify(stdin)}`, async () => {
            const run = await runHook("hooks/session.mjs", ["--agent", "copilot"], { source: "edge case", checked: "2026-11-22", unverified: [], stdin }, ROUTINE, {}, true);
            assert.equal(run.status, 0, run.stderr);
            assert.equal(run.stdout, "", run.stderr);
        });
    }
});
describe("an agent id with no encoder", () => {
    it("fails closed: a deny is exit 2 with the reason on stderr, not an allow", async () => {
        const pre = fixtures.find((fixture) => fixture.agent === "claude").events.PreToolUse;
        assertDeny(FALLBACK_DENY, await runHook("hooks/gateguard.mjs", ["--agent", "zed"], pre, DESTRUCTIVE, {}), "--agent zed");
    });
});
// Observe a read, then gate an edit (plan Architecture item 9, PR 18). Each
// fixture's `evidence` holds a PostToolUse read and a PreToolUse edit in that
// agent's verified shape, with the session at the agent's own key. The observer
// and gateguard run with the --agent the installer renders, in one workspace,
// in the default evidence mode of the file gate.
function fill(value, session, file) {
    const text = JSON.stringify(value).split("<SESSION>").join(session).split("<FILE>").join(file);
    return { source: "evidence", checked: "2026-11-22", unverified: [], stdin: JSON.parse(text) };
}
function evidenceWorkspace() {
    const dirs = workspace(false);
    // Forward slashes: Copilot's toolArgs is a JSON string, where a backslash is an escape.
    const project = dirs.project.split("\\").join("/");
    writeFileSync(join(dirs.project, "notes.txt"), "a\n");
    writeFileSync(join(dirs.project, "other.txt"), "a\n");
    return { dirs, read: `${project}/notes.txt`, unread: `${project}/other.txt` };
}
describe("observe a read, then gate the edit, on every hook agent", () => {
    for (const fixture of fixtures) {
        const flag = ["--agent", fixture.agent];
        const { evidence } = fixture;
        it(`${fixture.agent}: the evidence case carries its source and names the session and file in both payloads`, () => {
            assert.ok(evidence.source.length > 0);
            assert.match(evidence.checked, DATE);
            assert.ok(Array.isArray(evidence.unverified));
            for (const payload of [evidence.read, evidence.edit]) {
                const text = JSON.stringify(payload);
                assert.ok(text.includes("<SESSION>") && text.includes("<FILE>"), text);
            }
        });
        it(`${fixture.agent}: a read clears the edit of that file in the same session only`, async () => {
            const { dirs, read, unread } = evidenceWorkspace();
            const observed = await runHook("bin/observe.mjs", flag, fill(evidence.read, "session-a", read), ROUTINE, {}, false, dirs);
            assert.equal(observed.status, 0, observed.stderr);
            assert.equal(observed.stdout, "", observed.stderr);
            assert.equal(observed.stderr, "", "the observer catches every throw, so a crash shows only on stderr");
            const allowed = await runHook("hooks/gateguard.mjs", flag, fill(evidence.edit, "session-a", read), ROUTINE, {}, false, dirs);
            assert.equal(allowed.status, 0, `${fixture.agent} edit after read\nstdout: ${allowed.stdout}\nstderr: ${allowed.stderr}`);
            assert.equal(allowed.stdout, "", `${fixture.agent} edit after read\nstderr: ${allowed.stderr}`);
            const neverRead = await runHook("hooks/gateguard.mjs", flag, fill(evidence.edit, "session-a", unread), ROUTINE, {}, false, dirs);
            assertDeny(fixture.expect.deny, neverRead, `${fixture.agent} edit of a file never read`, "other.txt");
            const otherSession = await runHook("hooks/gateguard.mjs", flag, fill(evidence.edit, "session-b", read), ROUTINE, {}, false, dirs);
            assertDeny(fixture.expect.deny, otherSession, `${fixture.agent} edit in another session`, "notes.txt");
        });
    }
    it("an agent payload that names no session cannot be cleared by a read, not even by its own session-less read", async () => {
        const goose = fixtures.find((fixture) => fixture.agent === "goose");
        const strip = (payload) => {
            const { session_id: _session, ...rest } = payload.stdin;
            return { ...payload, stdin: rest };
        };
        const { dirs, read } = evidenceWorkspace();
        await runHook("bin/observe.mjs", ["--agent", "goose"], strip(fill(goose.evidence.read, "x", read)), ROUTINE, {}, false, dirs);
        const run = await runHook("hooks/gateguard.mjs", ["--agent", "goose"], strip(fill(goose.evidence.edit, "x", read)), ROUTINE, {}, false, dirs);
        assertDeny(goose.expect.deny, run, "goose edit with no session id", "names no session");
    });
});
