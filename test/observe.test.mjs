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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
// Compiled path is test/observe.test.mjs → repo root is one level up.
const REPO_ROOT = join(__dirname, "..");
const OBSERVE_BIN = join(REPO_ROOT, "bin", "observe.mjs");
function runObserve(payload, extraEnv = {}) {
    const result = spawnSync("node", [OBSERVE_BIN], {
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
