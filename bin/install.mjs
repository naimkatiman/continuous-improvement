#!/usr/bin/env node
/**
 * continuous-improvement installer (Claude Code)
 *
 * Usage:
 *   npx continuous-improvement install                # beginner mode (default)
 *   npx continuous-improvement install --mode expert  # + MCP server + session hooks
 *   npx continuous-improvement install --pack react   # load starter instinct pack
 *   npx continuous-improvement install --uninstall    # remove everything
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_SOURCE = join(__dirname, "..", "SKILL.md");
const SKILL_NAME = "continuous-improvement";
const REPO_ROOT = join(__dirname, "..");
const COMMAND_FILES = [
    "continuous-improvement.md",
    "dashboard.md",
    "discipline.md",
    "harvest.md",
    "learn-eval.md",
    "planning-with-files.md",
    "proceed-with-the-recommendation.md",
    "ralph.md",
    "release-train.md",
    "seven-laws.md",
    "superpowers.md",
    "swarm.md",
    "workspace-surface-audit.md",
];
const HOOK_TYPES = ["PreToolUse", "PostToolUse"];
const SESSION_HOOK_TYPES = ["SessionStart", "SessionEnd"];
function getHomeDir() {
    return process.env.HOME || process.env.USERPROFILE || homedir();
}
function isInstallMode(value) {
    return value === "beginner" || value === "expert";
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function readJsonFile(filePath) {
    try {
        return JSON.parse(readFileSync(filePath, "utf8"));
    }
    catch {
        return null;
    }
}
const rawArgs = process.argv.slice(2);
const modeIndex = rawArgs.indexOf("--mode");
const requestedMode = modeIndex !== -1 ? rawArgs[modeIndex + 1] : undefined;
const INSTALL_MODE = isInstallMode(requestedMode) ? requestedMode : "beginner";
const SKILL_DIR = join(getHomeDir(), ".claude", "skills", SKILL_NAME);
function installSkill() {
    try {
        mkdirSync(SKILL_DIR, { recursive: true });
        copyFileSync(SKILL_SOURCE, join(SKILL_DIR, "SKILL.md"));
        console.log(`  ✓ Claude Code skill → ${SKILL_DIR}/SKILL.md`);
        setupMulahazah();
        return true;
    }
    catch (error) {
        console.error(`  ✗ Install failed: ${getErrorMessage(error)}`);
        return false;
    }
}
function setupMulahazah() {
    const home = getHomeDir();
    const instinctsDir = join(home, ".claude", "instincts");
    const globalDir = join(instinctsDir, "global");
    mkdirSync(globalDir, { recursive: true });
    console.log(`  ✓ Instincts dir → ${instinctsDir}/`);
    const observeSrc = join(REPO_ROOT, "hooks", "observe.sh");
    const observeDest = join(instinctsDir, "observe.sh");
    if (existsSync(observeSrc)) {
        copyFileSync(observeSrc, observeDest);
        chmodSync(observeDest, 0o755);
        console.log(`  ✓ observe.sh → ${observeDest}`);
    }
    // Node observer (Phase 1 of the two-phase hook). The bash shim above
    // exec's this when `node` and the file are both present; otherwise it
    // falls back to the in-bash thin-schema path. Layout under instinctsDir
    // mirrors the repo's bin/ + lib/ structure so the relative import in
    // observe.mjs (`../lib/observe-event.mjs`) resolves correctly.
    const observerJsSrc = join(REPO_ROOT, "bin", "observe.mjs");
    const observeEventSrc = join(REPO_ROOT, "lib", "observe-event.mjs");
    if (existsSync(observerJsSrc) && existsSync(observeEventSrc)) {
        const binDir = join(instinctsDir, "bin");
        const libDir = join(instinctsDir, "lib");
        mkdirSync(binDir, { recursive: true });
        mkdirSync(libDir, { recursive: true });
        const observerJsDest = join(binDir, "observe.mjs");
        const observeEventDest = join(libDir, "observe-event.mjs");
        copyFileSync(observerJsSrc, observerJsDest);
        copyFileSync(observeEventSrc, observeEventDest);
        console.log(`  ✓ Node observer → ${observerJsDest}`);
    }
    if (INSTALL_MODE === "expert") {
        const sessionSrc = join(REPO_ROOT, "hooks", "session.sh");
        const sessionDest = join(instinctsDir, "session.sh");
        if (existsSync(sessionSrc)) {
            copyFileSync(sessionSrc, sessionDest);
            chmodSync(sessionDest, 0o755);
            console.log(`  ✓ session.sh → ${sessionDest}`);
        }
    }
    const commandsDir = join(home, ".claude", "commands");
    mkdirSync(commandsDir, { recursive: true });
    for (const commandFile of COMMAND_FILES) {
        const commandSource = join(REPO_ROOT, "commands", commandFile);
        const commandDest = join(commandsDir, commandFile);
        if (existsSync(commandSource)) {
            copyFileSync(commandSource, commandDest);
            console.log(`  ✓ /${commandFile.replace(".md", "")} command → ${commandDest}`);
        }
    }
    patchClaudeSettings(observeDest);
    if (INSTALL_MODE === "expert") {
        setupMcpServer();
    }
}
function setupMcpServer() {
    const home = getHomeDir();
    const mcpServerPath = join(REPO_ROOT, "bin", "mcp-server.mjs");
    const settingsPath = join(home, ".claude", "settings.json");
    const settings = existsSync(settingsPath) ? readJsonFile(settingsPath) : {};
    if (settings === null) {
        console.warn("  ! Could not parse settings.json — skipping MCP setup");
        return;
    }
    if (!settings.mcpServers) {
        settings.mcpServers = {};
    }
    if (!settings.mcpServers["continuous-improvement"]) {
        settings.mcpServers["continuous-improvement"] = {
            command: "node",
            args: [mcpServerPath, "--mode", "expert"],
        };
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
        console.log("  ✓ MCP server registered (mode: expert)");
    }
    else {
        console.log("  ✓ MCP server already registered — no change");
    }
    const desktopConfigPath = join(home, ".claude", "claude_desktop_config.json");
    if (!existsSync(desktopConfigPath)) {
        return;
    }
    const desktopConfig = readJsonFile(desktopConfigPath);
    if (!desktopConfig) {
        return;
    }
    if (!desktopConfig.mcpServers) {
        desktopConfig.mcpServers = {};
    }
    if (!desktopConfig.mcpServers["continuous-improvement"]) {
        desktopConfig.mcpServers["continuous-improvement"] = {
            command: "node",
            args: [mcpServerPath, "--mode", "expert"],
        };
        writeFileSync(desktopConfigPath, JSON.stringify(desktopConfig, null, 2) + "\n");
        console.log("  ✓ Claude Desktop MCP config updated");
    }
}
function hookAlreadyPatched(entries, scriptName) {
    return entries.some((entry) => Array.isArray(entry.hooks) &&
        entry.hooks.some((hook) => hook.command.includes(scriptName)));
}
function patchClaudeSettings(observePath) {
    const settingsPath = join(getHomeDir(), ".claude", "settings.json");
    const settings = existsSync(settingsPath) ? readJsonFile(settingsPath) : {};
    if (settings === null) {
        console.warn(`  ! Could not parse ${settingsPath} — skipping hook patch`);
        return;
    }
    if (!settings.hooks) {
        settings.hooks = {};
    }
    const hookEntry = {
        matcher: "",
        hooks: [
            {
                type: "command",
                command: `bash "${observePath}"`,
            },
        ],
    };
    let changed = false;
    for (const hookType of HOOK_TYPES) {
        if (!Array.isArray(settings.hooks[hookType])) {
            settings.hooks[hookType] = [];
        }
        const hookEntries = settings.hooks[hookType];
        if (!hookAlreadyPatched(hookEntries, "observe.sh")) {
            hookEntries.push(hookEntry);
            changed = true;
        }
    }
    if (INSTALL_MODE === "expert") {
        const sessionPath = join(getHomeDir(), ".claude", "instincts", "session.sh");
        const sessionHook = {
            matcher: "",
            hooks: [{ type: "command", command: `bash "${sessionPath}"` }],
        };
        for (const hookType of SESSION_HOOK_TYPES) {
            if (!Array.isArray(settings.hooks[hookType])) {
                settings.hooks[hookType] = [];
            }
            const hookEntries = settings.hooks[hookType];
            if (!hookAlreadyPatched(hookEntries, "session.sh")) {
                hookEntries.push(sessionHook);
                changed = true;
            }
        }
    }
    if (changed) {
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
        const hookTypes = INSTALL_MODE === "expert"
            ? "PreToolUse/PostToolUse/SessionStart/SessionEnd"
            : "PreToolUse/PostToolUse";
        console.log(`  ✓ Patched ~/.claude/settings.json with ${hookTypes} hooks`);
    }
    else {
        console.log("  ✓ settings.json already has hooks — no change needed");
    }
}
function uninstallAll() {
    console.log("\nUninstalling continuous-improvement skill...\n");
    const home = getHomeDir();
    let removed = 0;
    if (existsSync(SKILL_DIR)) {
        try {
            rmSync(SKILL_DIR, { recursive: true });
            console.log("  ✓ Removed Claude Code skill");
            removed++;
        }
        catch (error) {
            console.error(`  ✗ Skill removal failed: ${getErrorMessage(error)}`);
        }
    }
    for (const commandName of COMMAND_FILES) {
        const commandFile = join(home, ".claude", "commands", commandName);
        if (!existsSync(commandFile)) {
            continue;
        }
        try {
            rmSync(commandFile);
            console.log(`  ✓ Removed /${commandName.replace(".md", "")} command`);
        }
        catch (error) {
            console.error(`  ✗ ${commandName}: ${getErrorMessage(error)}`);
        }
    }
    for (const hookFile of ["observe.sh", "session.sh"]) {
        const filePath = join(home, ".claude", "instincts", hookFile);
        if (!existsSync(filePath)) {
            continue;
        }
        try {
            rmSync(filePath);
            console.log(`  ✓ Removed ${hookFile}`);
        }
        catch (error) {
            console.error(`  ✗ ${hookFile}: ${getErrorMessage(error)}`);
        }
    }
    // Remove the Node observer artifacts deployed alongside observe.sh.
    for (const observerFile of [
        join("bin", "observe.mjs"),
        join("lib", "observe-event.mjs"),
    ]) {
        const filePath = join(home, ".claude", "instincts", observerFile);
        if (!existsSync(filePath))
            continue;
        try {
            rmSync(filePath);
            console.log(`  ✓ Removed ${observerFile}`);
        }
        catch (error) {
            console.error(`  ✗ ${observerFile}: ${getErrorMessage(error)}`);
        }
    }
    const settingsPath = join(home, ".claude", "settings.json");
    if (existsSync(settingsPath)) {
        const settings = readJsonFile(settingsPath);
        if (settings) {
            let changed = false;
            for (const hookType of [...HOOK_TYPES, ...SESSION_HOOK_TYPES]) {
                const hookEntries = settings.hooks?.[hookType];
                if (!Array.isArray(hookEntries)) {
                    continue;
                }
                const nextEntries = hookEntries.filter((entry) => !entry.hooks.some((hook) => hook.command.includes("observe.sh") || hook.command.includes("session.sh")));
                if (nextEntries.length !== hookEntries.length) {
                    changed = true;
                }
                settings.hooks[hookType] = nextEntries;
            }
            if (settings.mcpServers?.["continuous-improvement"]) {
                delete settings.mcpServers["continuous-improvement"];
                changed = true;
            }
            if (changed) {
                writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
                console.log("  ✓ Removed hooks and MCP server from settings.json");
            }
        }
        else {
            console.warn("  ! Could not clean settings.json — remove hooks manually");
        }
    }
    const desktopConfigPath = join(home, ".claude", "claude_desktop_config.json");
    if (existsSync(desktopConfigPath)) {
        const desktopConfig = readJsonFile(desktopConfigPath);
        if (desktopConfig?.mcpServers?.["continuous-improvement"]) {
            delete desktopConfig.mcpServers["continuous-improvement"];
            writeFileSync(desktopConfigPath, JSON.stringify(desktopConfig, null, 2) + "\n");
            console.log("  ✓ Removed MCP server from Claude Desktop config");
        }
    }
    if (removed === 0) {
        console.log("  No skill installations found.");
    }
    console.log("\n  Note: Instinct data in ~/.claude/instincts/ was preserved.\n" +
        "  To remove learned data too: rm -rf ~/.claude/instincts/\n");
}
function printUsage() {
    console.log(`
Usage: npx continuous-improvement <subcommand> [options]

Subcommands:
  install      Install the plugin (default subcommand)
  backfill     Tag legacy thin-schema rows in observations.jsonl files
  --uninstall  Remove all installed files

Options for 'install':
  --mode <mode>     Installation mode:
                      beginner  — hooks + skill + commands (default)
                      expert    — beginner + MCP server + session hooks
  --pack <name>     Load a starter instinct pack (react, python, go, meta)
  --help            Show this help

Options for 'backfill':
  --dry-run         Report counts only, no file writes
  --help            Show backfill-specific help

Examples:
  npx continuous-improvement install                # beginner (default)
  npx continuous-improvement install --mode expert  # full power
  npx continuous-improvement install --pack react   # load React instincts
  npx continuous-improvement backfill --dry-run     # report thin/rich row counts
  npx continuous-improvement backfill               # tag rows in place
  npx continuous-improvement install --uninstall    # remove everything
`);
}
function getProjectHashSync() {
    try {
        const root = execSync("git rev-parse --show-toplevel 2>/dev/null", { encoding: "utf8" }).trim();
        const hash = createHash("sha256").update(root).digest("hex").slice(0, 12);
        return { root, hash };
    }
    catch {
        return { root: "global", hash: "global" };
    }
}
const args = process.argv.slice(2);
const command = args[0];
const validCommands = new Set(["install", "backfill", "--help", "-h", "--uninstall"]);
if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
}
if (!command || !validCommands.has(command)) {
    printUsage();
    process.exit(command ? 1 : 0);
}
if (command === "backfill") {
    // Delegate to bin/backfill.mjs without spawning a separate process so the
    // user gets one binary surface. Forward the remaining args (e.g. --dry-run).
    const { execFileSync } = await import("node:child_process");
    const backfillBin = join(REPO_ROOT, "bin", "backfill.mjs");
    try {
        execFileSync("node", [backfillBin, ...args.slice(1)], { stdio: "inherit" });
    }
    catch {
        // backfill.mjs always exits 0; if execFileSync threw, propagate the exit
        // status without a stack trace so operator output stays clean.
    }
    process.exit(0);
}
if (args.includes("--uninstall")) {
    uninstallAll();
    process.exit(0);
}
console.log(`
continuous-improvement (mode: ${INSTALL_MODE})
Research → Plan → Execute → Verify → Reflect → Learn → Iterate
`);
console.log("Installing to Claude Code...\n");
const installed = installSkill() ? 1 : 0;
const modeInfo = {
    beginner: "Hooks are capturing silently. System auto-levels as you use it.",
    expert: "Full plugin active: hooks + MCP server + session hooks. 12 tools available.",
};
const packIndex = rawArgs.indexOf("--pack");
if (packIndex !== -1 && rawArgs[packIndex + 1]) {
    const packName = rawArgs[packIndex + 1];
    const packPath = join(REPO_ROOT, "instinct-packs", `${packName}.json`);
    if (existsSync(packPath)) {
        const project = getProjectHashSync();
        const targetDir = join(getHomeDir(), ".claude", "instincts", project.hash);
        mkdirSync(targetDir, { recursive: true });
        const instincts = JSON.parse(readFileSync(packPath, "utf8"));
        let loaded = 0;
        for (const instinct of instincts) {
            const instinctPath = join(targetDir, `${instinct.id}.yaml`);
            if (existsSync(instinctPath)) {
                continue;
            }
            const today = new Date().toISOString().split("T")[0];
            const yaml = [
                `id: ${instinct.id}`,
                `trigger: "${instinct.trigger}"`,
                `confidence: ${instinct.confidence}`,
                `domain: ${instinct.domain || "workflow"}`,
                `source: pack-${packName}`,
                "scope: project",
                `project_id: ${project.hash}`,
                `created: "${today}"`,
                `last_seen: "${today}"`,
                "observation_count: 0",
                "---",
                instinct.body,
            ].join("\n");
            writeFileSync(instinctPath, yaml + "\n");
            loaded++;
        }
        console.log(`  ✓ Loaded ${loaded}/${instincts.length} instincts from ${packName} pack`);
    }
    else {
        const available = readdirSync(join(REPO_ROOT, "instinct-packs"))
            .filter((file) => file.endsWith(".json"))
            .map((file) => file.replace(".json", ""));
        console.error(`  ✗ Unknown pack: ${packName}. Available: ${available.join(", ")}`);
    }
}
console.log(`
${installed === 1 ? "Done." : "Failed."}
${modeInfo[INSTALL_MODE]}

Next steps:
  1. Start a new Claude Code session
  2. Say: "Use the continuous-improvement framework to [your task]"
  3. If a task needs persistent planning, run: /planning-with-files
  4. After your first task, run: /continuous-improvement
  5. Try: /discipline for quick reference, /dashboard for instinct health
${INSTALL_MODE === "expert" ? "\nMCP tools available: ci_status, ci_instincts, ci_reflect, ci_reinforce,\n  ci_create_instinct, ci_observations, ci_export, ci_import, ci_plan_init,\n  ci_plan_status, ci_dashboard, ci_load_pack" : ""}
Available instinct packs: npx continuous-improvement install --pack react|python|go|meta
`);
