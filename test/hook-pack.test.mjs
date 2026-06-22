/**
 * Tests for the enforcing-hook pack (v1): push-to-main + commit-size PreToolUse gates.
 *
 * Pure gate logic lives in src/lib/hook-pack-gate.mts (importable here — the
 * test-imports-only invariant forbids importing from hooks/). The runtime hook
 * src/hooks/hook-pack.mts is exercised by spawning the built hooks/hook-pack.mjs
 * over stdin, mirroring gateguard-hook.test.mts.
 *
 * Plan: docs/plans/2026-06-17-enforcing-hook-pack.md
 */
import { spawnSync, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { parseMode, classifyCommand, isProtectedBranch, evaluatePush, evaluateCommitSize, decide, COMMIT_FILE_LIMIT, } from "../lib/hook-pack-gate.mjs";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const HOOK_PATH = join(REPO_ROOT, "hooks", "hook-pack.mjs");
function runHook(toolName, toolInput, mode, cwd) {
    const payload = JSON.stringify({ tool_name: toolName, tool_input: toolInput });
    const env = { ...process.env };
    if (mode === undefined)
        delete env.CLAUDE_CI_HOOKPACK_GATE;
    else
        env.CLAUDE_CI_HOOKPACK_GATE = mode;
    const result = spawnSync(process.execPath, [HOOK_PATH], {
        input: payload,
        encoding: "utf8",
        env,
        cwd,
    });
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
    const stdout = result.stdout.trim();
    if (stdout === "")
        return { decision: "allow", stderr: result.stderr };
    const parsed = JSON.parse(stdout);
    const out = parsed.hookSpecificOutput;
    assert.equal(out?.hookEventName, "PreToolUse", "deny output names the hook event");
    assert.equal(out?.permissionDecision, "deny", "non-empty output must be a deny");
    return { decision: "block", reason: out?.permissionDecisionReason, stderr: result.stderr };
}
describe("hook-pack-gate: parseMode", () => {
    it("defaults to warn when unset, empty, or unrecognized", () => {
        assert.equal(parseMode(undefined), "warn");
        assert.equal(parseMode(""), "warn");
        assert.equal(parseMode("garbage"), "warn");
    });
    it("recognizes warn/block/off case-insensitively", () => {
        assert.equal(parseMode("warn"), "warn");
        assert.equal(parseMode("BLOCK"), "block");
        assert.equal(parseMode(" off "), "off");
    });
});
describe("hook-pack-gate: classifyCommand", () => {
    it("classifies git push / commit at command position", () => {
        assert.equal(classifyCommand("git push origin main"), "push");
        assert.equal(classifyCommand("  git push"), "push");
        assert.equal(classifyCommand("git commit -m x"), "commit");
        assert.equal(classifyCommand("git add . && git commit -m x"), "commit");
    });
    it("returns other for unrelated commands and non-command mentions", () => {
        assert.equal(classifyCommand("npm test"), "other");
        assert.equal(classifyCommand("git status"), "other");
        assert.equal(classifyCommand("echo git push"), "other");
        assert.equal(classifyCommand(""), "other");
    });
});
describe("hook-pack-gate: isProtectedBranch", () => {
    it("treats main/master/release-* as protected", () => {
        assert.equal(isProtectedBranch("main"), true);
        assert.equal(isProtectedBranch("master"), true);
        assert.equal(isProtectedBranch("release/1.0"), true);
    });
    it("treats feature/dev branches as unprotected", () => {
        assert.equal(isProtectedBranch("feature/x"), false);
        assert.equal(isProtectedBranch("develop"), false);
    });
});
describe("hook-pack-gate: evaluatePush", () => {
    it("gates an explicit push to a protected branch regardless of current branch", () => {
        assert.equal(evaluatePush("git push origin main", "feature/x").gated, true);
        assert.equal(evaluatePush("git push -u origin main", "feature/x").gated, true);
        assert.equal(evaluatePush("git push origin HEAD:main", "x").gated, true);
        assert.equal(evaluatePush("git push origin release/1.0", "x").gated, true);
    });
    it("allows an explicit push to a feature branch", () => {
        assert.equal(evaluatePush("git push origin feature/x", "main").gated, false);
    });
    it("falls back to the current branch when no explicit target is given", () => {
        assert.equal(evaluatePush("git push", "main").gated, true);
        assert.equal(evaluatePush("git push", "feature/x").gated, false);
    });
    it("never gates a dry-run push", () => {
        assert.equal(evaluatePush("git push --dry-run origin main", "main").gated, false);
    });
});
describe("hook-pack-gate: evaluateCommitSize", () => {
    it("gates a commit staging more than the limit", () => {
        assert.equal(evaluateCommitSize("git commit -m x", COMMIT_FILE_LIMIT + 1).gated, true);
    });
    it("allows a commit at or under the limit", () => {
        assert.equal(evaluateCommitSize("git commit -m x", COMMIT_FILE_LIMIT).gated, false);
        assert.equal(evaluateCommitSize("git commit -m x", 0).gated, false);
    });
    it("never gates an --amend (no new files added)", () => {
        assert.equal(evaluateCommitSize("git commit --amend -m x", 99).gated, false);
    });
});
describe("hook-pack-gate: decide", () => {
    it("off allows everything", () => {
        assert.equal(decide("off", true, "r").action, "allow");
    });
    it("warn warns on a gated action, allows otherwise", () => {
        assert.equal(decide("warn", true, "r").action, "warn");
        assert.equal(decide("warn", false, "r").action, "allow");
    });
    it("block denies a gated action, allows otherwise", () => {
        assert.equal(decide("block", true, "r").action, "block");
        assert.equal(decide("block", false, "r").action, "allow");
    });
});
describe("hooks/hook-pack.mjs (runtime PreToolUse hook)", () => {
    it("is present in the repo", () => {
        assert.ok(existsSync(HOOK_PATH), `expected ${HOOK_PATH} to exist`);
    });
    it("blocks a push to main in block mode", () => {
        const r = runHook("Bash", { command: "git push origin main" }, "block");
        assert.equal(r.decision, "block");
        assert.match(r.reason ?? "", /protected|feature branch|PR/i);
    });
    it("allows a push to a feature branch in block mode", () => {
        assert.equal(runHook("Bash", { command: "git push origin feature/x" }, "block").decision, "allow");
    });
    it("warns (never blocks) on a push to main in warn mode", () => {
        const r = runHook("Bash", { command: "git push origin main" }, "warn");
        assert.equal(r.decision, "allow");
        assert.match(r.stderr, /hook-pack|protected|main/i);
    });
    it("defaults to warn when the env var is unset", () => {
        assert.equal(runHook("Bash", { command: "git push origin main" }, undefined).decision, "allow");
    });
    it("is a no-op in off mode", () => {
        const r = runHook("Bash", { command: "git push origin main" }, "off");
        assert.equal(r.decision, "allow");
        assert.equal(r.stderr.trim(), "");
    });
    it("ignores unrelated Bash commands", () => {
        assert.equal(runHook("Bash", { command: "npm test" }, "block").decision, "allow");
    });
    it("ignores non-Bash tools", () => {
        assert.equal(runHook("Read", { file_path: "/tmp/x" }, "block").decision, "allow");
    });
});
describe("hooks/hook-pack.mjs commit-size gate (temp repo)", () => {
    let repo = "";
    function makeRepoWithStaged(count) {
        const dir = mkdtempSync(join(tmpdir(), "hookpack-repo-"));
        const run = (args) => execFileSync("git", args, { cwd: dir, stdio: ["ignore", "ignore", "ignore"] });
        run(["init", "-q"]);
        for (let i = 0; i < count; i += 1) {
            writeFileSync(join(dir, `f${i}.txt`), `${i}\n`);
        }
        run(["add", "-A"]);
        return dir;
    }
    after(() => {
        if (repo)
            rmSync(repo, { recursive: true, force: true });
    });
    it("blocks a commit staging more than 15 files in block mode", () => {
        repo = makeRepoWithStaged(16);
        const r = runHook("Bash", { command: "git commit -m x" }, "block", repo);
        assert.equal(r.decision, "block");
        assert.match(r.reason ?? "", /15|one[- ]concern|split/i);
    });
    it("allows a commit staging 15 files in block mode", () => {
        const dir = makeRepoWithStaged(15);
        try {
            assert.equal(runHook("Bash", { command: "git commit -m x" }, "block", dir).decision, "allow");
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
describe("hook-pack registration", () => {
    it("is wired in the plugin bundle PreToolUse hooks, with gateguard still first", () => {
        const hooksJsonPath = join(REPO_ROOT, "plugins", "continuous-improvement", "hooks", "hooks.json");
        assert.ok(existsSync(hooksJsonPath), "plugin-bundle hooks.json should exist");
        const hooksJson = JSON.parse(readFileSync(hooksJsonPath, "utf8"));
        const preToolUse = hooksJson.hooks.PreToolUse ?? [];
        assert.ok(preToolUse.length > 0, "PreToolUse hooks present");
        assert.match(preToolUse[0].hooks[0].command, /gateguard\.mjs/, "gateguard must remain the first PreToolUse hook");
        const commands = preToolUse.flatMap((entry) => entry.hooks.map((h) => h.command));
        assert.ok(commands.some((c) => /hook-pack\.mjs/.test(c)), "hook-pack must be registered in PreToolUse");
    });
    it("bundles the hook-pack-gate lib core the bundled hook imports", () => {
        // The bundled hooks/hook-pack.mjs imports ../lib/hook-pack-gate.mjs; if the
        // generator's copyFileTo list omits it, the installed plugin's hook crashes
        // at runtime even though repo-root tests pass. Pin the bundle copy.
        const bundledLib = join(REPO_ROOT, "plugins", "continuous-improvement", "lib", "hook-pack-gate.mjs");
        assert.ok(existsSync(bundledLib), `expected ${bundledLib} to be bundled`);
    });
});
