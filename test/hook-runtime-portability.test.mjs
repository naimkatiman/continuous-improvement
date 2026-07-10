import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { getPluginHooksConfig } from "../lib/plugin-metadata.mjs";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SESSION_HOOK = join(REPO_ROOT, "hooks", "session.mjs");
function commandsFor(event) {
    const entries = getPluginHooksConfig().hooks[event] ?? [];
    return entries.flatMap((entry) => entry.hooks.map((hook) => hook.command));
}
function runSession(input, home, projectRoot) {
    const result = spawnSync(process.execPath, [SESSION_HOOK], {
        input,
        encoding: "utf8",
        env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            CLAUDE_PROJECT_DIR: projectRoot,
        },
        timeout: 5000,
    });
    if (result.error)
        throw result.error;
    return result;
}
describe("plugin-managed hook runtime portability", () => {
    it("emits only the hooks key accepted by every supported host", () => {
        assert.deepEqual(Object.keys(getPluginHooksConfig()), ["hooks"]);
    });
    it("uses Node for observation and session lifecycle hooks", () => {
        assert.deepEqual(commandsFor("PostToolUse"), [
            'node "${CLAUDE_PLUGIN_ROOT}/bin/observe.mjs"',
        ]);
        assert.deepEqual(commandsFor("SessionStart"), [
            'node "${CLAUDE_PLUGIN_ROOT}/hooks/session.mjs"',
        ]);
        assert.deepEqual(commandsFor("SessionEnd"), [
            'node "${CLAUDE_PLUGIN_ROOT}/hooks/session.mjs"',
        ]);
        for (const event of ["PostToolUse", "SessionStart", "SessionEnd"]) {
            for (const command of commandsFor(event)) {
                assert.doesNotMatch(command, /(^|\s)bash(?:\.exe)?\s/i, `${event} must not require Bash`);
            }
        }
    });
    it("reports the SessionStart level from the current project bucket", () => {
        const fixture = join(tmpdir(), `ci-session-hook-${Date.now()}`);
        const home = join(fixture, "home");
        const projectRoot = join(fixture, "project");
        const projectHash = createHash("sha256")
            .update(projectRoot)
            .digest("hex")
            .slice(0, 12);
        const projectDir = join(home, ".claude", "instincts", projectHash);
        try {
            mkdirSync(projectDir, { recursive: true });
            writeFileSync(join(projectDir, "observations.jsonl"), Array.from({ length: 20 }, (_, index) => JSON.stringify({ index })).join("\n") + "\n");
            writeFileSync(join(projectDir, "reliable.yaml"), "confidence: 0.8\n");
            const result = runSession(JSON.stringify({ hook_event_name: "SessionStart", session_id: "portable-start" }), home, projectRoot);
            assert.equal(result.status, 0, `stderr: ${result.stderr}`);
            assert.equal(result.stdout, "");
            assert.match(result.stderr, /\[continuous-improvement\] Level: AUTO-APPLY \| Observations: 20 \| Instincts: 1/);
        }
        finally {
            rmSync(fixture, { recursive: true, force: true });
        }
    });
    it("recognizes SessionEnd from the canonical hook_event_name field", () => {
        const fixture = join(tmpdir(), `ci-session-end-${Date.now()}`);
        const home = join(fixture, "home");
        const projectRoot = join(fixture, "project");
        try {
            mkdirSync(projectRoot, { recursive: true });
            const result = runSession(JSON.stringify({ hook_event_name: "SessionEnd", session_id: "portable-end" }), home, projectRoot);
            assert.equal(result.status, 0, `stderr: ${result.stderr}`);
            assert.equal(result.stdout, "");
            assert.equal(result.stderr.trim(), "[continuous-improvement] Session ending. Run /continuous-improvement to reflect and capture learnings.");
        }
        finally {
            rmSync(fixture, { recursive: true, force: true });
        }
    });
    it("fails open on malformed input", () => {
        const fixture = join(tmpdir(), `ci-session-malformed-${Date.now()}`);
        try {
            mkdirSync(fixture, { recursive: true });
            const result = runSession("{not-json", fixture, fixture);
            assert.equal(result.status, 0, `stderr: ${result.stderr}`);
            assert.equal(result.stdout, "");
            assert.equal(result.stderr, "");
        }
        finally {
            rmSync(fixture, { recursive: true, force: true });
        }
    });
});
