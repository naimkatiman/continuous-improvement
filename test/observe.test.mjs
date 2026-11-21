// observe.test.mts — Coverage for the new Node observer entrypoint
// (src/bin/observe.mts → bin/observe.mjs).
//
// Spawns `node bin/observe.mjs` as a subprocess with a temp HOME, pipes
// JSON payloads to stdin, and asserts the resulting observations.jsonl
// content. Mirrors the pattern used in src/test/hook.test.mts for the
// legacy bash hook so behavior parity is checked side-by-side.
//
// These tests do NOT require jq, bash, or any external dependency — that
// is the whole point of replacing observe.sh.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
// Compiled path is test/observe.test.mjs → repo root is one level up.
const REPO_ROOT = join(__dirname, "..");
const OBSERVE_BIN = join(REPO_ROOT, "bin", "observe.mjs");
// The plugin bundle ships its own copy of the observer and of every lib module
// it imports; `/plugin install` runs this one, not bin/observe.mjs.
const BUNDLED_OBSERVE_BIN = join(REPO_ROOT, "plugins", "continuous-improvement", "bin", "observe.mjs");
function runObserve(payload, extraEnv = {}, bin = OBSERVE_BIN) {
    const result = spawnSync("node", [bin], {
        input: payload,
        env: { ...process.env, ...extraEnv },
        encoding: "utf8",
        timeout: 5000,
    });
    if (result.error)
        throw result.error;
    return result;
}
function instinctsDirOf(home) {
    return join(home, ".claude", "instincts");
}
function findProjectDir(home) {
    const dir = instinctsDirOf(home);
    const entries = readdirSync(dir).filter((entry) => entry !== "global");
    assert.ok(entries.length > 0, "expected at least one project hash dir");
    return join(dir, entries[0]);
}
function readObservations(home) {
    const file = join(findProjectDir(home), "observations.jsonl");
    if (!existsSync(file))
        return [];
    return readFileSync(file, "utf8")
        .trim()
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line));
}
describe("observe.mjs (Node observer entrypoint)", () => {
    let tempHome = "";
    before(() => {
        tempHome = join(tmpdir(), `ci-node-observe-${Date.now()}`);
        mkdirSync(tempHome, { recursive: true });
    });
    after(() => {
        rmSync(tempHome, { recursive: true, force: true });
    });
    it("exits 0 with empty stdin and writes no observation", () => {
        const result = runObserve("", { HOME: tempHome });
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(existsSync(instinctsDirOf(tempHome)), false, "no dir created on empty input");
    });
    it("exits 0 on malformed JSON without writing", () => {
        const result = runObserve("{not json", { HOME: tempHome });
        assert.equal(result.status, 0);
    });
    it("exits 0 when tool_name is missing", () => {
        const result = runObserve(JSON.stringify({ session_id: "x" }), { HOME: tempHome });
        assert.equal(result.status, 0);
    });
    it("writes a tool_start row for a Bash payload with rich input_summary", () => {
        const payload = JSON.stringify({
            tool_name: "Bash",
            session_id: "session-A",
            tool_input: { command: "git status --porcelain" },
        });
        const result = runObserve(payload, {
            HOME: tempHome,
            CLAUDE_PROJECT_DIR: "/tmp/test-project-A",
        });
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        const rows = readObservations(tempHome);
        const last = rows[rows.length - 1];
        assert.equal(last.tool, "Bash");
        assert.equal(last.event, "tool_start");
        assert.equal(last.session, "session-A");
        assert.equal(last.input_summary, "git status --porcelain", "rich schema captures Bash command");
        assert.equal(last.output_summary, "", "no output on tool_start");
        assert.match(last.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        assert.match(last.project_id, /^[0-9a-f]{12}$/, "project_id is sha256 first 12 hex");
    });
    it("writes a tool_complete row for a payload with canonical tool_response", () => {
        const payload = JSON.stringify({
            tool_name: "Bash",
            session_id: "session-B",
            tool_input: { command: "echo hi" },
            tool_response: { stdout: "hi\n", stderr: "", interrupted: false },
        });
        const result = runObserve(payload, {
            HOME: tempHome,
            CLAUDE_PROJECT_DIR: "/tmp/test-project-A",
        });
        assert.equal(result.status, 0);
        const rows = readObservations(tempHome);
        const last = rows[rows.length - 1];
        assert.equal(last.event, "tool_complete");
        assert.equal(last.input_summary, "echo hi", "rich schema captures Bash command on Post events too");
        assert.match(last.output_summary, /"stdout":"hi/);
    });
    it("treats legacy tool_output as tool_response for back-compat", () => {
        const payload = JSON.stringify({
            tool_name: "Read",
            session_id: "session-B-legacy",
            tool_input: { file_path: "/tmp/foo.txt" },
            tool_output: "file contents here",
        });
        const result = runObserve(payload, {
            HOME: tempHome,
            CLAUDE_PROJECT_DIR: "/tmp/test-project-A",
        });
        assert.equal(result.status, 0);
        const rows = readObservations(tempHome);
        const last = rows[rows.length - 1];
        assert.equal(last.event, "tool_complete");
        assert.equal(last.input_summary, "/tmp/foo.txt");
        assert.equal(last.output_summary, "file contents here");
    });
    it("captures Edit file_path in input_summary", () => {
        const payload = JSON.stringify({
            tool_name: "Edit",
            session_id: "session-C",
            tool_input: {
                file_path: "/d/x/y.mts",
                old_string: "foo",
                new_string: "bar",
            },
        });
        runObserve(payload, {
            HOME: tempHome,
            CLAUDE_PROJECT_DIR: "/tmp/test-project-A",
        });
        const rows = readObservations(tempHome);
        const last = rows[rows.length - 1];
        assert.equal(last.input_summary, "/d/x/y.mts");
    });
    it("writes project.json on first observation", () => {
        const projectDir = findProjectDir(tempHome);
        const projectJson = join(projectDir, "project.json");
        assert.ok(existsSync(projectJson), "project.json should exist");
        const project = JSON.parse(readFileSync(projectJson, "utf8"));
        assert.match(project.id ?? "", /^[0-9a-f]{12}$/);
        assert.equal(project.root, "/tmp/test-project-A");
        assert.ok(project.name, "name should be present");
        assert.ok(project.created_at, "created_at should be present");
    });
    it("does not overwrite project.json on subsequent observations", () => {
        const projectDir = findProjectDir(tempHome);
        const projectJson = join(projectDir, "project.json");
        const before = readFileSync(projectJson, "utf8");
        runObserve(JSON.stringify({
            tool_name: "Bash",
            session_id: "session-D",
            tool_input: { command: "echo hi" },
        }), {
            HOME: tempHome,
            CLAUDE_PROJECT_DIR: "/tmp/test-project-A",
        });
        const after = readFileSync(projectJson, "utf8");
        assert.equal(before, after, "project.json must not change on later writes");
    });
    it("uses CLAUDE_PROJECT_DIR env when set", () => {
        const result = runObserve(JSON.stringify({
            tool_name: "Bash",
            session_id: "session-env",
            tool_input: { command: "ls" },
        }), {
            HOME: tempHome,
            CLAUDE_PROJECT_DIR: "/tmp/distinct-project",
        });
        assert.equal(result.status, 0);
        const dirs = readdirSync(instinctsDirOf(tempHome)).filter((d) => d !== "global");
        assert.ok(dirs.length >= 2, "should have created a second project hash dir for the distinct CLAUDE_PROJECT_DIR");
    });
    it("falls back to 'global' when no project dir can be resolved", () => {
        const isolatedHome = join(tmpdir(), `ci-node-observe-isolated-${Date.now()}`);
        mkdirSync(isolatedHome, { recursive: true });
        try {
            // Run from a non-git tmp dir with CLAUDE_PROJECT_DIR unset.
            const tmpCwd = join(tmpdir(), `ci-node-observe-cwd-${Date.now()}`);
            mkdirSync(tmpCwd, { recursive: true });
            const result = spawnSync("node", [OBSERVE_BIN], {
                input: JSON.stringify({
                    tool_name: "Bash",
                    session_id: "session-global",
                    tool_input: { command: "ls" },
                }),
                env: {
                    ...process.env,
                    HOME: isolatedHome,
                    CLAUDE_PROJECT_DIR: "",
                },
                cwd: tmpCwd,
                encoding: "utf8",
                timeout: 5000,
            });
            assert.equal(result.status, 0, `stderr: ${result.stderr}`);
            const dirs = readdirSync(instinctsDirOf(isolatedHome));
            assert.ok(dirs.length >= 1, "should have produced a project hash dir from 'global' root");
            rmSync(tmpCwd, { recursive: true, force: true });
        }
        finally {
            rmSync(isolatedHome, { recursive: true, force: true });
        }
    });
    it("writes C:/ and c:/ project dirs into one hash bucket", () => {
        const isolatedHome = join(tmpdir(), `ci-node-observe-canon-${Date.now()}`);
        mkdirSync(isolatedHome, { recursive: true });
        try {
            const payload = JSON.stringify({
                tool_name: "Read",
                session_id: "canon-case",
                tool_input: { file_path: "README.md" },
            });
            const first = runObserve(payload, {
                HOME: isolatedHome,
                USERPROFILE: isolatedHome,
                CLAUDE_PROJECT_DIR: "C:/Ai/continuous-improvement",
            });
            const second = runObserve(payload, {
                HOME: isolatedHome,
                USERPROFILE: isolatedHome,
                CLAUDE_PROJECT_DIR: "c:/Ai/continuous-improvement",
            });
            assert.equal(first.status, 0, `stderr: ${first.stderr}`);
            assert.equal(second.status, 0, `stderr: ${second.stderr}`);
            const dirs = readdirSync(instinctsDirOf(isolatedHome)).filter((d) => d !== "global");
            assert.equal(dirs.length, 1, `expected one bucket, got ${dirs.join(",")}`);
            const projectDir = join(instinctsDirOf(isolatedHome), dirs[0]);
            const rows = readFileSync(join(projectDir, "observations.jsonl"), "utf8")
                .trim()
                .split("\n");
            assert.equal(rows.length, 2);
            const project = JSON.parse(readFileSync(join(projectDir, "project.json"), "utf8"));
            assert.equal(project.root, "c:/Ai/continuous-improvement");
        }
        finally {
            rmSync(isolatedHome, { recursive: true, force: true });
        }
    });
    it("completes a single invocation in under 500ms (Windows budget)", () => {
        const start = Date.now();
        runObserve(JSON.stringify({
            tool_name: "Bash",
            session_id: "session-perf",
            tool_input: { command: "ls" },
        }), {
            HOME: tempHome,
            CLAUDE_PROJECT_DIR: "/tmp/test-project-A",
        });
        const elapsed = Date.now() - start;
        assert.ok(elapsed < 500, `observe took ${elapsed}ms, budget is 500ms`);
    });
});
// What lands on disk is what leaks: these read observations.jsonl as raw text,
// so a secret in any field of the row fails them. Both values are fakes.
describe("observe.mjs keeps secrets out of observations.jsonl", () => {
    const BEARER = "sk-FAKE0123456789abcdefghijklmnopqrstuv";
    const KV_SECRET = "FAKEvalue-9f8e7d6c5b4a";
    const payload = JSON.stringify({
        tool_name: "Bash",
        session_id: "session-secrets",
        tool_input: {
            command: `API_TOKEN=${KV_SECRET} curl -H "Authorization: Bearer ${BEARER}" https://api.example.test/v1/items`,
        },
        tool_response: {
            stdout: `Authorization: Bearer ${BEARER}\nAPI_TOKEN=${KV_SECRET}\n`,
            stderr: "",
            interrupted: false,
        },
    });
    const observers = [
        ["bin/observe.mjs", OBSERVE_BIN],
        ["the plugin bundle's bin/observe.mjs", BUNDLED_OBSERVE_BIN],
    ];
    for (const [label, bin] of observers) {
        it(`${label} writes a row with neither the bearer token nor the KEY=value secret`, () => {
            const home = mkdtempSync(join(tmpdir(), "ci-node-observe-secrets-"));
            try {
                const result = runObserve(payload, { HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: "/tmp/test-project-secrets" }, bin);
                assert.equal(result.status, 0, `stderr: ${result.stderr}`);
                const raw = readFileSync(join(findProjectDir(home), "observations.jsonl"), "utf8");
                assert.ok(!raw.includes(BEARER), `bearer token at rest: ${raw}`);
                assert.ok(!raw.includes(KV_SECRET), `KEY=value secret at rest: ${raw}`);
                const lines = raw.split("\n").filter((line) => line.length > 0);
                assert.equal(lines.length, 1, "exactly one row is written");
                const row = JSON.parse(lines[0]);
                assert.equal(row.tool, "Bash");
                assert.equal(row.event, "tool_complete");
                assert.equal(row.input_summary, 'API_TOKEN=<redacted> curl -H "Authorization: Bearer <redacted>" https://api.example.test/v1/items');
                assert.match(row.output_summary, /^\{"stdout":"Authorization: Bearer <redacted>/);
            }
            finally {
                rmSync(home, { recursive: true, force: true });
            }
        });
    }
    // One PostToolUse payload per secret shape. Each row is checked against the
    // raw file, so the fake value in any field of the written row fails it.
    const LEAK = "hunter2SECRETvalue";
    const leakCases = [
        // [what leaks, tool_name, tool_input, tool_response]
        [
            "a bare PASSWORD= / --password= name",
            "Bash",
            { command: `mysql -uroot --password=${LEAK} app` },
            { stdout: `SECRET=${LEAK}\nPASSWORD=${LEAK}\n`, stderr: "", interrupted: false },
        ],
        [
            "the words after the first of a quoted passphrase",
            "Bash",
            { command: `DB_PASSWORD="correct horse ${LEAK} staple" ./run.sh` },
            { stdout: `API_TOKEN='part one ${LEAK}'\n`, stderr: "", interrupted: false },
        ],
        [
            "a quoted passphrase in a PowerShell command",
            "PowerShell",
            { command: `$env:DB_PASSWORD = "two words ${LEAK}"; ./run.ps1`, description: "Run the script" },
            "ok",
        ],
        [
            "a password property of an MCP tool input",
            "mcp__db__connect",
            { host: "db.test", user: "app", password: LEAK },
            { ok: true },
        ],
        [
            "a JSON request body and a JSON reply",
            "Bash",
            { command: `curl -s -X POST https://x.test/login -d '{"user":"a","password":"${LEAK}"}'` },
            { stdout: `{"access_token":"ya29.${LEAK}","token_type":"Bearer"}`, stderr: "", interrupted: false },
        ],
        [
            "a clientSecret property in a file the Read tool returned",
            "Read",
            { file_path: "config/app.json" },
            { type: "text", file: { filePath: "config/app.json", content: `{"clientSecret": "${LEAK}"}` } },
        ],
        [
            "a password inside a connection URL",
            "Bash",
            { command: `psql postgres://admin:${LEAK}@db.example.test:5432/app` },
            { stdout: `DATABASE_URL=postgres://app:${LEAK}@db.test:5432/app\n`, stderr: "", interrupted: false },
        ],
        [
            "curl -u credentials and a non-Bearer Authorization header",
            "Bash",
            { command: `curl -u admin:${LEAK} -H "Authorization: token ${LEAK}" https://x.test` },
            { stdout: "ok", stderr: "", interrupted: false },
        ],
        [
            "an Authorization entry of a header map",
            "WebFetch",
            { url: "https://x.test", headers: { Authorization: `Basic ${LEAK}`, Accept: "application/json" } },
            "ok",
        ],
        [
            "a secret flag whose value is the next argument",
            "Bash",
            { command: `mysql -u root --password ${LEAK} db` },
            { stdout: "ok", stderr: "", interrupted: false },
        ],
    ];
    for (const [label, bin] of observers) {
        for (const [what, toolName, toolInput, toolResponse] of leakCases) {
            it(`${label} keeps ${what} out of the row`, () => {
                const home = mkdtempSync(join(tmpdir(), "ci-node-observe-leak-"));
                try {
                    const result = runObserve(JSON.stringify({
                        tool_name: toolName,
                        session_id: "session-leak",
                        tool_input: toolInput,
                        tool_response: toolResponse,
                    }), { HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: "/tmp/test-project-leak" }, bin);
                    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
                    const raw = readFileSync(join(findProjectDir(home), "observations.jsonl"), "utf8");
                    assert.equal(raw.split("\n").filter((line) => line.length > 0).length, 1, "exactly one row is written");
                    assert.ok(!raw.includes(LEAK), `secret at rest: ${raw}`);
                }
                finally {
                    rmSync(home, { recursive: true, force: true });
                }
            });
        }
    }
});
// Plan PR 18 (Architecture item 9 and the owner decisions on the optional
// `agent` field and the (session, tool_use_id) dedupe).
describe("observe.mjs: other agents' rows", () => {
    const homes = [];
    after(() => {
        for (const home of homes)
            rmSync(home, { recursive: true, force: true });
    });
    function freshHome() {
        const home = mkdtempSync(join(tmpdir(), "ci-observe-agent-"));
        homes.push(home);
        return home;
    }
    function observeAs(home, args, payload, bin = OBSERVE_BIN) {
        const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: "/tmp/test-project-agents" };
        delete env.CI_AGENT;
        delete env.CI_INSTINCTS_HOME;
        const result = spawnSync("node", [bin, ...args], { input: JSON.stringify(payload), env, encoding: "utf8", timeout: 5000 });
        if (result.error)
            throw result.error;
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, "", result.stderr);
        // The observer catches every throw and exits 0, so a crash shows only here.
        assert.equal(result.stderr, "");
    }
    const rows = (home) => readObservations(home);
    const cursorRead = { conversation_id: "c1", hook_event_name: "postToolUse", cursor_version: "3.20.17", tool_name: "Read", tool_input: { file_path: "/p/a.txt" }, tool_output: "x", tool_use_id: "u1", cwd: "/p" };
    it("names the agent and the call id on a non-Claude row, after the Claude fields", () => {
        for (const bin of [OBSERVE_BIN, BUNDLED_OBSERVE_BIN]) {
            const home = freshHome();
            observeAs(home, ["--agent", "cursor"], cursorRead, bin);
            const [row] = rows(home);
            assert.deepEqual(Object.keys(row), ["ts", "event", "session", "tool", "input_summary", "output_summary", "project_id", "project_name", "agent", "tool_use_id"], bin);
            assert.equal(row.agent, "cursor");
            assert.equal(row.tool_use_id, "u1");
            assert.equal(row.session, "c1");
            assert.equal(row.event, "tool_complete");
        }
    });
    it("leaves a Claude row's fields as they were, with or without --agent claude", () => {
        for (const args of [[], ["--agent", "claude"]]) {
            const home = freshHome();
            observeAs(home, args, { session_id: "s", hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: "/p/a.txt" }, tool_response: "x", tool_use_id: "toolu_1" });
            assert.deepEqual(Object.keys(rows(home)[0]), ["ts", "event", "session", "tool", "input_summary", "output_summary", "project_id", "project_name"]);
        }
    });
    it("writes a call once when it fires twice with the same session, call id and event", () => {
        const home = freshHome();
        observeAs(home, ["--agent", "cursor"], cursorRead);
        observeAs(home, ["--agent", "cursor"], cursorRead);
        assert.equal(rows(home).length, 1);
    });
    it("writes both rows when the session, the call id or the event differs, or there is no call id", () => {
        const home = freshHome();
        observeAs(home, ["--agent", "cursor"], cursorRead);
        observeAs(home, ["--agent", "cursor"], { ...cursorRead, conversation_id: "c2" });
        observeAs(home, ["--agent", "cursor"], { ...cursorRead, tool_use_id: "u2" });
        observeAs(home, ["--agent", "cursor"], { ...cursorRead, hook_event_name: "preToolUse", tool_output: undefined });
        const goose = { event: "PostToolUse", session_id: "g", tool_name: "shell", tool_input: { command: "cat a.txt" } };
        observeAs(home, ["--agent", "goose"], goose);
        observeAs(home, ["--agent", "goose"], goose);
        assert.deepEqual(rows(home).map((row) => [row.session, row.tool_use_id, row.event]), [
            ["c1", "u1", "tool_complete"], ["c2", "u1", "tool_complete"], ["c1", "u2", "tool_complete"], ["c1", "u1", "tool_start"],
            ["g", undefined, "tool_complete"], ["g", undefined, "tool_complete"],
        ]);
    });
    it("a Claude-selected fire of a call another agent's row already holds is not written again", () => {
        const home = freshHome();
        const grok = { hookEventName: "post_tool_use", hook_event_name: "PostToolUse", session_id: "g1", tool_name: "read_file", tool_input: { file_path: "/p/a.txt" }, tool_use_id: "call-1", tool_response: "x" };
        observeAs(home, ["--agent", "grok"], grok);
        observeAs(home, [], { ...grok, hookEventName: undefined });
        assert.equal(rows(home).length, 1);
    });
    it("writes no row for Copilot or Cline payloads with no tool name, and a row labelled unknown for an unidentified agent", () => {
        const home = freshHome();
        observeAs(home, ["--agent", "copilot"], { sessionId: "c", toolArgs: "{}" });
        observeAs(home, ["--agent", "cline"], { hookName: "PostToolUse", taskId: "t", postToolUse: {} });
        assert.equal(existsSync(join(instinctsDirOf(home))) ? rows(home).length : 0, 0);
        observeAs(home, [], { event: "PostToolUse", session_id: "g", tool_name: "shell", tool_input: { command: "ls" } });
        assert.deepEqual(rows(home).map((row) => [row.agent, row.event]), [["unknown", "tool_complete"]]);
    });
});
