import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const INSTALL_SCRIPT = join(__dirname, "..", "bin", "install.mjs");
const SKILL_SOURCE = join(__dirname, "..", "SKILL.md");
const ALL_COMMAND_FILES = [
    "continuous-improvement.md",
    "planning-with-files.md",
    "proceed-with-the-recommendation.md",
    "discipline.md",
    "dashboard.md",
    "learn-eval.md",
];
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
    it("installs all 6 command files in beginner mode", () => {
        for (const commandFile of ALL_COMMAND_FILES) {
            const commandPath = join(tempHome, ".claude", "commands", commandFile);
            assert.ok(existsSync(commandPath), `${commandFile} should be installed`);
        }
    });
    it("installs Node observer artifacts alongside observe.sh", () => {
        const observerJs = join(tempHome, ".claude", "instincts", "bin", "observe.mjs");
        const observeEvent = join(tempHome, ".claude", "instincts", "lib", "observe-event.mjs");
        assert.ok(existsSync(observerJs), "bin/observe.mjs should be installed");
        assert.ok(existsSync(observeEvent), "lib/observe-event.mjs should be installed");
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
describe("installer - expert mode", () => {
    let tempHome = "";
    before(() => {
        tempHome = join(tmpdir(), `ci-test-expert-${Date.now()}`);
        mkdirSync(join(tempHome, ".claude"), { recursive: true });
        execFileSync("node", [INSTALL_SCRIPT, "install", "--mode", "expert"], {
            env: { ...process.env, HOME: tempHome },
            encoding: "utf8",
        });
    });
    after(() => {
        rmSync(tempHome, { recursive: true, force: true });
    });
    it("installs session.sh", () => {
        const sessionPath = join(tempHome, ".claude", "instincts", "session.sh");
        assert.ok(existsSync(sessionPath), "session.sh should ship in expert mode");
    });
    it("registers continuous-improvement MCP server in settings.json", () => {
        const settingsPath = join(tempHome, ".claude", "settings.json");
        const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
        assert.ok(settings.mcpServers, "mcpServers key should exist");
        const server = settings.mcpServers?.["continuous-improvement"];
        assert.ok(server, "continuous-improvement MCP server should be registered");
        assert.equal(server?.command, "node", "MCP server should run via node");
    });
    it("adds SessionStart and SessionEnd hooks pointing at session.sh", () => {
        const settingsPath = join(tempHome, ".claude", "settings.json");
        const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
        assert.ok(Array.isArray(settings.hooks?.SessionStart), "SessionStart should be an array");
        assert.ok(Array.isArray(settings.hooks?.SessionEnd), "SessionEnd should be an array");
        const startHasSession = (settings.hooks?.SessionStart || []).some((entry) => Array.isArray(entry.hooks) &&
            entry.hooks.some((hook) => hook.command?.includes("session.sh")));
        const endHasSession = (settings.hooks?.SessionEnd || []).some((entry) => Array.isArray(entry.hooks) &&
            entry.hooks.some((hook) => hook.command?.includes("session.sh")));
        assert.ok(startHasSession, "SessionStart should have session.sh hook");
        assert.ok(endHasSession, "SessionEnd should have session.sh hook");
    });
});
describe("installer - foreign-hook preservation", () => {
    let tempHome = "";
    before(() => {
        tempHome = join(tmpdir(), `ci-test-foreign-${Date.now()}`);
        mkdirSync(join(tempHome, ".claude"), { recursive: true });
        const seed = {
            hooks: {
                PreToolUse: [
                    { matcher: "", hooks: [{ type: "command", command: "echo foreign-pre" }] },
                ],
                PostToolUse: [
                    { matcher: "", hooks: [{ type: "command", command: "echo foreign-post" }] },
                ],
            },
            theme: "dark",
        };
        writeFileSync(join(tempHome, ".claude", "settings.json"), JSON.stringify(seed, null, 2) + "\n");
        execFileSync("node", [INSTALL_SCRIPT, "install"], {
            env: { ...process.env, HOME: tempHome },
            encoding: "utf8",
        });
    });
    after(() => {
        rmSync(tempHome, { recursive: true, force: true });
    });
    it("preserves a foreign PreToolUse hook through install", () => {
        const settingsPath = join(tempHome, ".claude", "settings.json");
        const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
        const hasForeign = (settings.hooks?.PreToolUse || []).some((entry) => Array.isArray(entry.hooks) &&
            entry.hooks.some((hook) => hook.command?.includes("foreign-pre")));
        assert.ok(hasForeign, "Foreign PreToolUse hook should survive install");
    });
    it("preserves non-hook settings keys", () => {
        const settingsPath = join(tempHome, ".claude", "settings.json");
        const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
        assert.equal(settings.theme, "dark", "Foreign settings keys must not be clobbered");
    });
    it("preserves the foreign hook through uninstall", () => {
        execFileSync("node", [INSTALL_SCRIPT, "--uninstall"], {
            env: { ...process.env, HOME: tempHome },
            encoding: "utf8",
        });
        const settingsPath = join(tempHome, ".claude", "settings.json");
        const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
        const hasForeign = (settings.hooks?.PreToolUse || []).some((entry) => Array.isArray(entry.hooks) &&
            entry.hooks.some((hook) => hook.command?.includes("foreign-pre")));
        assert.ok(hasForeign, "Foreign PreToolUse hook must NOT be removed by uninstall");
        const hasObserve = (settings.hooks?.PreToolUse || []).some((entry) => Array.isArray(entry.hooks) &&
            entry.hooks.some((hook) => hook.command?.includes("observe.sh")));
        assert.ok(!hasObserve, "observe.sh hook should still be removed");
    });
});
describe("installer - input validation", () => {
    let tempHome = "";
    before(() => {
        tempHome = join(tmpdir(), `ci-test-invalid-${Date.now()}`);
        mkdirSync(join(tempHome, ".claude"), { recursive: true });
    });
    after(() => {
        rmSync(tempHome, { recursive: true, force: true });
    });
    it("exits non-zero when given an unknown command", () => {
        const result = spawnSync("node", [INSTALL_SCRIPT, "bogusverb"], {
            env: { ...process.env, HOME: tempHome },
            encoding: "utf8",
        });
        assert.notEqual(result.status, 0, "Unknown command should exit non-zero");
    });
    it("falls back to beginner when --mode value is unknown", () => {
        const output = execFileSync("node", [INSTALL_SCRIPT, "install", "--mode", "alien"], {
            env: { ...process.env, HOME: tempHome },
            encoding: "utf8",
        });
        assert.match(output, /mode: beginner/, "Invalid mode should fall back to beginner");
    });
});
describe("installer - pack loader", () => {
    let tempHome = "";
    before(() => {
        tempHome = join(tmpdir(), `ci-test-pack-${Date.now()}`);
        mkdirSync(join(tempHome, ".claude"), { recursive: true });
    });
    after(() => {
        rmSync(tempHome, { recursive: true, force: true });
    });
    it("loads instincts from a known pack into the project hash dir", () => {
        execFileSync("node", [INSTALL_SCRIPT, "install", "--pack", "react"], {
            env: { ...process.env, HOME: tempHome },
            cwd: tempHome,
            encoding: "utf8",
        });
        const instinctsRoot = join(tempHome, ".claude", "instincts");
        assert.ok(existsSync(instinctsRoot), "instincts root should exist after --pack");
        const projectDirs = readdirSync(instinctsRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && entry.name !== "global")
            .map((entry) => entry.name);
        const candidateDirs = existsSync(join(instinctsRoot, "global"))
            ? [...projectDirs, "global"]
            : projectDirs;
        let foundYaml = false;
        for (const dir of candidateDirs) {
            const yamlFiles = readdirSync(join(instinctsRoot, dir)).filter((file) => file.endsWith(".yaml"));
            if (yamlFiles.length > 0) {
                foundYaml = true;
                break;
            }
        }
        assert.ok(foundYaml, "At least one .yaml instinct should be loaded by --pack react");
    });
    it("reports an unknown pack with a helpful message", () => {
        const result = spawnSync("node", [INSTALL_SCRIPT, "install", "--pack", "doesnotexist"], {
            env: { ...process.env, HOME: tempHome },
            cwd: tempHome,
            encoding: "utf8",
        });
        const combined = (result.stdout ?? "") + (result.stderr ?? "");
        assert.match(combined, /Unknown pack/, "Unknown pack name should produce error output");
    });
});
describe("installer - marketplace collision warning", () => {
    let tempHome = "";
    before(() => {
        tempHome = join(tmpdir(), `ci-test-collision-${Date.now()}`);
        mkdirSync(join(tempHome, ".claude"), { recursive: true });
    });
    after(() => {
        rmSync(tempHome, { recursive: true, force: true });
    });
    it("warns when a marketplace install of continuous-improvement is present", () => {
        mkdirSync(join(tempHome, ".claude", "plugins", "continuous-improvement"), {
            recursive: true,
        });
        const result = spawnSync("node", [INSTALL_SCRIPT, "install"], {
            env: { ...process.env, HOME: tempHome },
            cwd: tempHome,
            encoding: "utf8",
        });
        const combined = (result.stdout ?? "") + (result.stderr ?? "");
        assert.match(combined, /Possible Beginner\+Expert collision/);
    });
    it("does not warn on a clean ~/.claude with no plugins dir", () => {
        const cleanHome = join(tmpdir(), `ci-test-clean-${Date.now()}`);
        mkdirSync(join(cleanHome, ".claude"), { recursive: true });
        try {
            const result = spawnSync("node", [INSTALL_SCRIPT, "install"], {
                env: { ...process.env, HOME: cleanHome },
                cwd: cleanHome,
                encoding: "utf8",
            });
            const combined = (result.stdout ?? "") + (result.stderr ?? "");
            assert.doesNotMatch(combined, /Possible Beginner\+Expert collision/);
        }
        finally {
            rmSync(cleanHome, { recursive: true, force: true });
        }
    });
});
