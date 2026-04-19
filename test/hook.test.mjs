import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const HOOKS_DIR = join(__dirname, "..", "hooks");
// The observe hook is a bash script. We can only run this suite when:
//   (1) a bash interpreter is available on PATH, AND
//   (2) that bash preserves backslashes in env values passed from the host.
//
// Condition (2) excludes Windows + WSL bash (bash.exe), where interop strips
// backslashes from inherited env vars. Git Bash on Windows passes both checks.
// Linux and macOS always pass. Pure Windows (no bash) fails (1).
//
// When we skip, we do so with a clear message so Windows contributors know to
// run `npm test` from within their WSL or Git Bash shell instead.
const SKIP_REASON = (() => {
    const probe = spawnSync("bash", ["-c", "exit 0"], { stdio: "ignore" });
    if (probe.status !== 0 || probe.error) {
        return "bash not available on PATH";
    }
    const roundTrip = spawnSync("bash", ["-c", 'printf "%s" "$PROBE_VAR"'], {
        env: { ...process.env, PROBE_VAR: "A\\B\\C" },
        encoding: "utf8",
    });
    if (roundTrip.status !== 0 || roundTrip.stdout !== "A\\B\\C") {
        return "bash mangles env values (WSL interop on Windows); run tests from WSL or Git Bash";
    }
    return false;
})();
// Invoke bash with the hooks directory as cwd so the script is referenced
// relatively. This avoids Windows/WSL/Git-Bash path-translation quirks
// (`D:\\x`, `/d/x`, `/mnt/d/x`) entirely.
function runHook(payload, extraEnv = {}) {
    const result = spawnSync("bash", ["./observe.sh"], {
        input: payload,
        cwd: HOOKS_DIR,
        env: { ...process.env, ...extraEnv },
        encoding: "utf8",
        timeout: 5000,
    });
    if (result.error)
        throw result.error;
    if (result.status !== 0) {
        throw new Error(`hook exited ${result.status}: ${result.stderr}`);
    }
    return result;
}
describe("observe.sh hook", { skip: SKIP_REASON }, () => {
    let tempHome = "";
    before(() => {
        tempHome = join(tmpdir(), `ci-hook-test-${Date.now()}`);
        mkdirSync(tempHome, { recursive: true });
    });
    after(() => {
        rmSync(tempHome, { recursive: true, force: true });
    });
    it("exits 0 with empty input", () => {
        runHook("", { HOME: tempHome });
        assert.ok(true, "Hook should exit 0 with empty input");
    });
    it("exits 0 with valid tool call JSON", () => {
        const payload = JSON.stringify({
            tool_name: "Read",
            session_id: "test-session-123",
            tool_input: { file_path: "/tmp/test.txt" },
        });
        runHook(payload, { HOME: tempHome });
        assert.ok(true, "Hook should exit 0 with valid input");
    });
    it("writes observation to JSONL file", () => {
        const payload = JSON.stringify({
            tool_name: "Bash",
            session_id: "test-session-456",
            tool_input: { command: "ls" },
        });
        runHook(payload, {
            HOME: tempHome,
            CLAUDE_PROJECT_DIR: "/tmp/test-project",
        });
        const instinctsDir = join(tempHome, ".claude", "instincts");
        assert.ok(existsSync(instinctsDir), "instincts dir should be created");
        const dirs = readdirSync(instinctsDir).filter((dir) => dir !== "global" && dir !== "observe.sh");
        assert.ok(dirs.length > 0, "Should have created a project directory");
        const observationsFile = join(instinctsDir, dirs[0], "observations.jsonl");
        assert.ok(existsSync(observationsFile), "observations.jsonl should exist");
        const content = readFileSync(observationsFile, "utf8").trim();
        const lines = content.split("\n");
        assert.ok(lines.length >= 1, "Should have at least one observation");
        const observation = JSON.parse(lines[lines.length - 1]);
        assert.equal(observation.tool, "Bash", "Tool name should be Bash");
        assert.equal(observation.event, "tool_start", "Event should be tool_start");
        assert.ok(observation.ts, "Should have timestamp");
        assert.ok(observation.project_id, "Should have project_id");
    });
    it("writes project.json for new projects", () => {
        const instinctsDir = join(tempHome, ".claude", "instincts");
        const dirs = readdirSync(instinctsDir).filter((dir) => dir !== "global" && dir !== "observe.sh");
        const projectJson = join(instinctsDir, dirs[0], "project.json");
        assert.ok(existsSync(projectJson), "project.json should exist");
        const project = JSON.parse(readFileSync(projectJson, "utf8"));
        assert.ok(project.id, "Should have id");
        assert.ok(project.name, "Should have name");
        assert.ok(project.created_at, "Should have created_at");
    });
    it("handles tool_complete events", () => {
        const payload = JSON.stringify({
            tool_name: "Read",
            session_id: "test-session-789",
            tool_input: { file_path: "/tmp/test.txt" },
            tool_output: { content: "file contents here" },
        });
        runHook(payload, {
            HOME: tempHome,
            CLAUDE_PROJECT_DIR: "/tmp/test-project",
        });
        const instinctsDir = join(tempHome, ".claude", "instincts");
        const dirs = readdirSync(instinctsDir).filter((dir) => dir !== "global" && dir !== "observe.sh");
        const observationsFile = join(instinctsDir, dirs[0], "observations.jsonl");
        const lines = readFileSync(observationsFile, "utf8").trim().split("\n");
        const lastObservation = JSON.parse(lines[lines.length - 1]);
        assert.equal(lastObservation.event, "tool_complete", "Should detect tool_complete event");
    });
    it("completes within 500ms", () => {
        const payload = JSON.stringify({
            tool_name: "Grep",
            session_id: "perf-test",
            tool_input: { pattern: "test" },
        });
        const start = performance.now();
        runHook(payload, {
            HOME: tempHome,
            CLAUDE_PROJECT_DIR: "/tmp/test-project",
        });
        const elapsed = performance.now() - start;
        // Generous budget — on Windows/Git Bash, spawning bash alone costs ~100-300ms.
        assert.ok(elapsed < 500, `Hook should complete within 500ms (took ${elapsed.toFixed(0)}ms)`);
    });
});
