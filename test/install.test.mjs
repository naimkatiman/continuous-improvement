import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const INSTALL_SCRIPT = join(__dirname, "..", "bin", "install.mjs");
const SKILL_SOURCE = join(__dirname, "..", "SKILL.md");
describe("installer", () => {
    let tempHome = "";
    before(() => {
        tempHome = join(tmpdir(), `ci-test-${Date.now()}`);
        mkdirSync(join(tempHome, ".claude"), { recursive: true });
    });
    after(() => {
        rmSync(tempHome, { recursive: true, force: true });
    });
    it("shows usage when run with no arguments", () => {
        const output = execFileSync("node", [INSTALL_SCRIPT], {
            env: { ...process.env, HOME: tempHome },
            encoding: "utf8",
        });
        assert.match(output, /Usage:/);
    });
    it("shows usage with --help", () => {
        const output = execFileSync("node", [INSTALL_SCRIPT, "--help"], {
            env: { ...process.env, HOME: tempHome },
            encoding: "utf8",
        });
        assert.match(output, /--mode/);
        assert.match(output, /--uninstall/);
    });
    it("installs skill to Claude Code", () => {
        execFileSync("node", [INSTALL_SCRIPT, "install"], {
            env: { ...process.env, HOME: tempHome },
            encoding: "utf8",
        });
        const skillPath = join(tempHome, ".claude", "skills", "continuous-improvement", "SKILL.md");
        assert.ok(existsSync(skillPath), "SKILL.md should be installed");
        const installed = readFileSync(skillPath, "utf8");
        const source = readFileSync(SKILL_SOURCE, "utf8");
        assert.equal(installed, source, "Installed SKILL.md should match source");
    });
    it("installs observe.sh hook", () => {
        const hookPath = join(tempHome, ".claude", "instincts", "observe.sh");
        assert.ok(existsSync(hookPath), "observe.sh should be installed");
    });
    it("installs /continuous-improvement command", () => {
        const commandPath = join(tempHome, ".claude", "commands", "continuous-improvement.md");
        assert.ok(existsSync(commandPath), "command file should be installed");
    });
    it("installs /planning-with-files command", () => {
        const commandPath = join(tempHome, ".claude", "commands", "planning-with-files.md");
        assert.ok(existsSync(commandPath), "planning-with-files command should be installed");
    });
    it("patches settings.json with hooks", () => {
        const settingsPath = join(tempHome, ".claude", "settings.json");
        assert.ok(existsSync(settingsPath), "settings.json should exist");
        const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
        assert.ok(settings.hooks, "hooks key should exist");
        assert.ok(Array.isArray(settings.hooks.PreToolUse), "PreToolUse should be an array");
        assert.ok(Array.isArray(settings.hooks.PostToolUse), "PostToolUse should be an array");
        const hasObserveHook = (settings.hooks.PreToolUse || []).some((entry) => Array.isArray(entry.hooks) &&
            entry.hooks.some((hook) => hook.command?.includes("observe.sh")));
        assert.ok(hasObserveHook, "PreToolUse should have observe.sh hook");
    });
    it("does not duplicate hooks on re-install", () => {
        execFileSync("node", [INSTALL_SCRIPT, "install"], {
            env: { ...process.env, HOME: tempHome },
            encoding: "utf8",
        });
        const settingsPath = join(tempHome, ".claude", "settings.json");
        const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
        const observeHooks = (settings.hooks?.PreToolUse || []).filter((entry) => Array.isArray(entry.hooks) &&
            entry.hooks.some((hook) => hook.command?.includes("observe.sh")));
        assert.equal(observeHooks.length, 1, "Should have exactly one observe.sh hook after re-install");
    });
    it("uninstalls cleanly", () => {
        execFileSync("node", [INSTALL_SCRIPT, "--uninstall"], {
            env: { ...process.env, HOME: tempHome },
            encoding: "utf8",
        });
        const skillPath = join(tempHome, ".claude", "skills", "continuous-improvement", "SKILL.md");
        assert.ok(!existsSync(skillPath), "SKILL.md should be removed");
        const hookPath = join(tempHome, ".claude", "instincts", "observe.sh");
        assert.ok(!existsSync(hookPath), "observe.sh should be removed");
        const planningCommandPath = join(tempHome, ".claude", "commands", "planning-with-files.md");
        assert.ok(!existsSync(planningCommandPath), "planning-with-files command should be removed");
        const settingsPath = join(tempHome, ".claude", "settings.json");
        if (existsSync(settingsPath)) {
            const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
            const hasObserveHook = (settings.hooks?.PreToolUse || []).some((entry) => Array.isArray(entry.hooks) &&
                entry.hooks.some((hook) => hook.command?.includes("observe.sh")));
            assert.ok(!hasObserveHook, "observe.sh hook should be removed from settings");
        }
    });
});
