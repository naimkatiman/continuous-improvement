import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const INSTALL_SCRIPT = join(__dirname, "..", "bin", "install.mjs");
const SKILL_SOURCE = join(__dirname, "..", "SKILL.md");
const ORIGINAL_PATH = process.env.PATH;
function findGitBashBin() {
    if (process.platform !== "win32")
        return null;
    const candidates = [];
    try {
        const gitExecPath = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim();
        candidates.push(join(dirname(dirname(dirname(gitExecPath))), "bin"));
    }
    catch {
        // Fall through to conventional install roots.
    }
    if (process.env.ProgramFiles)
        candidates.push(join(process.env.ProgramFiles, "Git", "bin"));
    if (process.env.LOCALAPPDATA)
        candidates.push(join(process.env.LOCALAPPDATA, "Programs", "Git", "bin"));
    return candidates.find((candidate) => existsSync(join(candidate, "bash.exe"))) ?? null;
}
const GIT_BASH_BIN = findGitBashBin();
before(() => {
    if (process.platform !== "win32")
        return;
    assert.ok(GIT_BASH_BIN, "Windows installer tests require Git Bash");
    process.env.PATH = `${GIT_BASH_BIN}${delimiter}${ORIGINAL_PATH ?? ""}`;
});
after(() => {
    if (ORIGINAL_PATH === undefined) {
        delete process.env.PATH;
    }
    else {
        process.env.PATH = ORIGINAL_PATH;
    }
});
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
    it("refuses Windows Bash that passes --version but cannot read Windows hook paths", () => {
        const root = join(tmpdir(), `ci-test-bash-path-${process.pid}-${Date.now()}`);
        const home = join(root, "home");
        const fakeBin = join(root, "bin");
        mkdirSync(join(home, ".claude"), { recursive: true });
        mkdirSync(fakeBin, { recursive: true });
        try {
            const fakeBash = join(fakeBin, process.platform === "win32" ? "bash.exe" : "bash");
            if (process.platform === "win32") {
                // node.exe answers --version but rejects Bash's -c probe, matching the
                // capability boundary without relying on WSL being installed in CI.
                copyFileSync(process.execPath, fakeBash);
            }
            else {
                writeFileSync(fakeBash, '#!/usr/bin/env node\nif (process.argv[2] === "--version") process.exit(0);\nprocess.exit(1);\n');
                chmodSync(fakeBash, 0o755);
            }
            const env = {
                ...process.env,
                HOME: home,
                USERPROFILE: home,
                PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`,
                CLAUDE_CI_UPDATE_CHECK: "off",
            };
            if (process.platform !== "win32") {
                const forceWindows = join(root, "force-win32.cjs");
                writeFileSync(forceWindows, 'Object.defineProperty(process, "platform", { value: "win32" });\n');
                env.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--require=${forceWindows}`]
                    .filter((value) => Boolean(value))
                    .join(" ");
                env.comspec = "/bin/sh";
                env.ComSpec = "/bin/sh";
            }
            const result = spawnSync(process.execPath, [INSTALL_SCRIPT, "install"], {
                cwd: root,
                env,
                encoding: "utf8",
            });
            const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
            assert.notEqual(result.status, 0, `installer accepted an incompatible Bash:\n${combined}`);
            assert.match(combined, /Git Bash/i);
            assert.equal(existsSync(join(home, ".claude", "skills", "continuous-improvement", "SKILL.md")), false, "compatibility refusal must happen before installation writes");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
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
    it("normalizes hook command paths for Windows-style homes", () => {
        const winRoot = join(tmpdir(), `ci-test-win-${Date.now()}`);
        try {
            const winHome = join(winRoot, "Users\\naim");
            mkdirSync(join(winHome, ".claude"), { recursive: true });
            const settingsPath = join(winHome, ".claude", "settings.json");
            writeFileSync(settingsPath, JSON.stringify({
                hooks: {
                    PreToolUse: [
                        {
                            matcher: "",
                            hooks: [
                                {
                                    type: "command",
                                    command: 'bash "C:\\Users\\naim\\.claude\\instincts\\observe.sh"',
                                },
                            ],
                        },
                    ],
                },
            }, null, 2) + "\n");
            execFileSync("node", [INSTALL_SCRIPT, "install", "--mode", "expert"], {
                env: { ...process.env, HOME: winHome },
                encoding: "utf8",
            });
            const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
            const observeCommands = (settings.hooks?.PreToolUse || [])
                .flatMap((entry) => entry.hooks || [])
                .map((hook) => hook.command)
                .filter((command) => Boolean(command));
            const observeCommand = observeCommands.find((command) => command.includes("observe.sh"));
            const sessionCommand = settings.hooks?.SessionStart?.[0]?.hooks?.[0]?.command;
            assert.ok(observeCommand, "observe.sh hook command should exist");
            assert.match(observeCommand, /^bash ".+observe\.sh"$/);
            assert.doesNotMatch(observeCommand, /\\/);
            assert.equal(observeCommands.filter((command) => command.includes("observe.sh")).length, 1, "broken legacy observe.sh hook should be replaced, not duplicated");
            assert.ok(sessionCommand, "session.sh hook command should exist in expert mode");
            assert.match(sessionCommand, /^bash ".+session\.sh"$/);
            assert.doesNotMatch(sessionCommand, /\\/);
        }
        finally {
            rmSync(winRoot, { recursive: true, force: true });
        }
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
describe("installer - exact hook matching", () => {
    let tempHome = "";
    before(() => {
        tempHome = join(tmpdir(), `ci-test-exact-${Date.now()}`);
        mkdirSync(join(tempHome, ".claude"), { recursive: true });
        const seed = {
            hooks: {
                PreToolUse: [
                    {
                        matcher: "",
                        hooks: [{ type: "command", command: "echo observe.sh but not really" }],
                    },
                ],
                SessionStart: [
                    {
                        matcher: "",
                        hooks: [{ type: "command", command: "echo session.sh but not really" }],
                    },
                ],
            },
        };
        writeFileSync(join(tempHome, ".claude", "settings.json"), JSON.stringify(seed, null, 2) + "\n");
        execFileSync("node", [INSTALL_SCRIPT, "install", "--mode", "expert"], {
            env: { ...process.env, HOME: tempHome },
            encoding: "utf8",
        });
    });
    after(() => {
        rmSync(tempHome, { recursive: true, force: true });
    });
    it("installs the real observe and session hooks even when foreign commands mention their names", () => {
        const settingsPath = join(tempHome, ".claude", "settings.json");
        const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
        const observeCommand = `bash "${join(tempHome, ".claude", "instincts", "observe.sh").replace(/\\/g, "/")}"`;
        const sessionCommand = `bash "${join(tempHome, ".claude", "instincts", "session.sh").replace(/\\/g, "/")}"`;
        const preToolCommands = (settings.hooks?.PreToolUse || [])
            .flatMap((entry) => entry.hooks || [])
            .map((hook) => hook.command)
            .filter((command) => Boolean(command));
        const sessionStartCommands = (settings.hooks?.SessionStart || [])
            .flatMap((entry) => entry.hooks || [])
            .map((hook) => hook.command)
            .filter((command) => Boolean(command));
        assert.equal(preToolCommands.filter((command) => command === observeCommand).length, 1, "real observe.sh hook should be installed exactly once");
        assert.equal(sessionStartCommands.filter((command) => command === sessionCommand).length, 1, "real session.sh hook should be installed exactly once");
    });
});
describe("installer - cleanup persistence coexistence", () => {
    let tempHome = "";
    before(() => {
        tempHome = join(tmpdir(), `ci-test-cleanup-${Date.now()}`);
        mkdirSync(join(tempHome, ".claude"), { recursive: true });
        const cleanObserveCommand = `bash "${join(tempHome, ".claude", "instincts", "observe.sh").replace(/\\/g, "/")}"`;
        const seed = {
            hooks: {
                PreToolUse: [
                    {
                        matcher: "",
                        hooks: [{ type: "command", command: cleanObserveCommand }],
                    },
                    {
                        matcher: "",
                        hooks: [
                            {
                                type: "command",
                                command: 'bash "C:\\Users\\naim\\.claude\\instincts\\observe.sh"',
                            },
                        ],
                    },
                ],
            },
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
    it("removes the broken legacy observe hook while keeping the existing clean hook once", () => {
        const settingsPath = join(tempHome, ".claude", "settings.json");
        const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
        const preToolCommands = (settings.hooks?.PreToolUse || [])
            .flatMap((entry) => entry.hooks || [])
            .map((hook) => hook.command)
            .filter((command) => Boolean(command));
        const cleanObserveCommand = `bash "${join(tempHome, ".claude", "instincts", "observe.sh").replace(/\\/g, "/")}"`;
        assert.equal(preToolCommands.filter((command) => command === cleanObserveCommand).length, 1, "existing clean observe hook should remain exactly once");
        assert.equal(preToolCommands.filter((command) => command.includes("observe.sh") && command.includes("\\")).length, 0, "broken legacy observe hook should be removed");
    });
});
// Regression: prior to PR #74 the installer dropped the entire PreToolUse entry
// to remove a broken backslash-laden observe.sh hook, which silently wiped any
// foreign command sharing the same entry. The fix filters at the hook level.
describe("installer - mixed-entry preservation", () => {
    let tempHome = "";
    before(() => {
        tempHome = join(tmpdir(), `ci-test-mixed-${Date.now()}`);
        mkdirSync(join(tempHome, ".claude"), { recursive: true });
        const seed = {
            hooks: {
                PreToolUse: [
                    {
                        matcher: "",
                        hooks: [
                            { type: "command", command: "echo mixed-foreign-pre" },
                            {
                                type: "command",
                                command: 'bash "C:\\Users\\naim\\.claude\\instincts\\observe.sh"',
                            },
                        ],
                    },
                ],
            },
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
    it("preserves a foreign command sharing an entry with a broken observe hook", () => {
        const settingsPath = join(tempHome, ".claude", "settings.json");
        const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
        const allCommands = (settings.hooks?.PreToolUse || [])
            .flatMap((entry) => entry.hooks || [])
            .map((hook) => hook.command)
            .filter((command) => Boolean(command));
        assert.ok(allCommands.some((command) => command === "echo mixed-foreign-pre"), "Foreign command must survive even when it shares an entry with a broken observe hook");
        assert.ok(!allCommands.some((command) => command.includes("observe.sh") && command.includes("\\")), "Broken backslash-laden observe.sh hook must be removed");
        assert.ok(allCommands.some((command) => command.includes("observe.sh")), "A fresh forward-slash observe.sh hook must be installed");
    });
    // The uninstall arm of the same regression. Install separates the foreign
    // and observe.sh hooks into distinct entries, so we re-seed the mixed entry
    // directly before --uninstall to prove the uninstall path filters per-hook.
    // Entry-level filtering would wipe the foreign command along with the
    // broken observe hook in the same entry.
    it("removes a broken observe hook on uninstall while preserving the shared-entry foreign command", () => {
        const settingsPath = join(tempHome, ".claude", "settings.json");
        const seed = {
            hooks: {
                PreToolUse: [
                    {
                        matcher: "",
                        hooks: [
                            { type: "command", command: "echo mixed-foreign-pre" },
                            {
                                type: "command",
                                command: 'bash "C:\\Users\\naim\\.claude\\instincts\\observe.sh"',
                            },
                        ],
                    },
                ],
            },
        };
        writeFileSync(settingsPath, JSON.stringify(seed, null, 2) + "\n");
        execFileSync("node", [INSTALL_SCRIPT, "--uninstall"], {
            env: { ...process.env, HOME: tempHome },
            encoding: "utf8",
        });
        const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
        const allCommands = (settings.hooks?.PreToolUse || [])
            .flatMap((entry) => entry.hooks || [])
            .map((hook) => hook.command)
            .filter((command) => Boolean(command));
        assert.ok(allCommands.some((command) => command === "echo mixed-foreign-pre"), "Foreign command must survive --uninstall when it shares an entry with a broken observe hook");
        assert.ok(!allCommands.some((command) => command.includes("observe.sh")), "Broken observe.sh hook sharing the entry must be removed by --uninstall");
    });
    it("preserves malformed hook rows while removing empty broken-only entries", () => {
        const settingsPath = join(tempHome, ".claude", "settings.json");
        const seed = {
            hooks: {
                PreToolUse: [
                    null,
                    { matcher: "", hooks: null },
                    { matcher: "", hooks: [{ type: "command" }] },
                    {
                        matcher: "",
                        hooks: [
                            {
                                type: "command",
                                command: 'bash "C:\\Users\\naim\\.claude\\instincts\\observe.sh"',
                            },
                        ],
                    },
                ],
            },
        };
        writeFileSync(settingsPath, JSON.stringify(seed, null, 2) + "\n");
        execFileSync("node", [INSTALL_SCRIPT, "install"], {
            env: { ...process.env, HOME: tempHome },
            encoding: "utf8",
        });
        const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
        const entries = settings.hooks?.PreToolUse || [];
        assert.ok(entries.some((entry) => entry === null), "null hook row should be preserved");
        assert.ok(entries.some((entry) => entry && entry.hooks === null), "rows with hooks:null should be preserved");
        assert.ok(entries.some((entry) => {
            if (!entry || !Array.isArray(entry.hooks))
                return false;
            return entry.hooks.some((hook) => hook.command === undefined) && entry.hooks.length === 1;
        }), "rows with malformed hook objects should be preserved");
        assert.ok(!entries.some((entry) => Array.isArray(entry?.hooks) && entry.hooks.length === 0), "empty hook rows should not remain after filtering");
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
