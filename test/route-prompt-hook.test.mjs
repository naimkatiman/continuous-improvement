import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
// __dirname resolves to <repo>/test/ at runtime. Hook lives under <repo>/hooks/.
const HOOK_PATH = join(__dirname, "..", "hooks", "route-prompt.mjs");
function buildIsolatedEnv(home) {
    const env = { ...process.env };
    delete env.HOME;
    delete env.USERPROFILE;
    env.HOME = home;
    env.USERPROFILE = home;
    return env;
}
function runHook(payload, home) {
    const input = typeof payload === "string" ? payload : JSON.stringify(payload);
    const result = spawnSync(process.execPath, [HOOK_PATH], {
        input,
        env: buildIsolatedEnv(home),
        encoding: "utf8",
        timeout: 5000,
    });
    if (result.error)
        throw result.error;
    return {
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
    };
}
describe("route-prompt hook", () => {
    let home;
    before(() => {
        home = mkdtempSync(join(tmpdir(), "ci-route-prompt-"));
    });
    after(() => {
        rmSync(home, { recursive: true, force: true });
    });
    it("emits empty stdout for malformed JSON stdin", () => {
        const r = runHook("not json", home);
        assert.equal(r.status, 0);
        assert.equal(r.stdout, "");
    });
    it("emits empty stdout when prompt is missing", () => {
        const r = runHook({ session_id: "x" }, home);
        assert.equal(r.status, 0);
        assert.equal(r.stdout, "");
    });
    it("emits empty stdout when prompt does not match any row", () => {
        const r = runHook({ prompt: "hello world, just saying hi today" }, home);
        assert.equal(r.status, 0);
        assert.equal(r.stdout, "");
    });
    it("matches a TDD prompt to tdd-workflow", () => {
        const r = runHook({ prompt: "Can you write a failing test for the auth module?" }, home);
        assert.equal(r.status, 0);
        const parsed = JSON.parse(r.stdout);
        assert.equal(parsed.hookSpecificOutput.hookEventName, "UserPromptSubmit");
        assert.match(parsed.hookSpecificOutput.additionalContext, /tdd-workflow/);
        assert.match(parsed.hookSpecificOutput.additionalContext, /system-reminder/);
    });
    it("matches a verify prompt to verification-loop", () => {
        const r = runHook({ prompt: "Please verify the build before declaring it done." }, home);
        assert.equal(r.status, 0);
        const parsed = JSON.parse(r.stdout);
        assert.match(parsed.hookSpecificOutput.additionalContext, /verification-loop/);
    });
    it("matches a plan prompt to planning-with-files", () => {
        const r = runHook({ prompt: "Give me a step-by-step plan before any code changes." }, home);
        assert.equal(r.status, 0);
        const parsed = JSON.parse(r.stdout);
        assert.match(parsed.hookSpecificOutput.additionalContext, /planning-with-files/);
    });
    it("matches a security prompt to security-review", () => {
        const r = runHook({ prompt: "Run a security review on the authorization check." }, home);
        assert.equal(r.status, 0);
        const parsed = JSON.parse(r.stdout);
        assert.match(parsed.hookSpecificOutput.additionalContext, /security-review/);
    });
    it("matches a code-review prompt to code-review", () => {
        const r = runHook({ prompt: "Please review my code on the latest diff." }, home);
        assert.equal(r.status, 0);
        const parsed = JSON.parse(r.stdout);
        assert.match(parsed.hookSpecificOutput.additionalContext, /code-review/);
    });
    it("first match wins — TDD pattern beats verify pattern in the same prompt", () => {
        // TDD row comes before verify row; both could match this phrasing.
        const r = runHook({ prompt: "Write a failing test and then verify it passes." }, home);
        assert.equal(r.status, 0);
        const parsed = JSON.parse(r.stdout);
        assert.match(parsed.hookSpecificOutput.additionalContext, /tdd-workflow/);
        assert.doesNotMatch(parsed.hookSpecificOutput.additionalContext, /verification-loop/);
    });
});
