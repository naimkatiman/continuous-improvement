#!/usr/bin/env node

/**
 * continuous-improvement installer
 *
 * Usage:
 *   npx continuous-improvement install                          # auto-detect & install (beginner)
 *   npx continuous-improvement install --target claude          # install to ~/.claude/skills/ + Mulahazah
 *   npx continuous-improvement install --target openclaw        # install to ~/.openclaw/skills/
 *   npx continuous-improvement install --target cursor          # install to ~/.cursor/skills/
 *   npx continuous-improvement install --target all             # install to all detected targets
 *   npx continuous-improvement install --mode beginner          # hooks only (default)
 *   npx continuous-improvement install --mode expert            # hooks + MCP server + session hooks
 *   npx continuous-improvement install --mode mcp               # MCP server only (any editor)
 *   npx continuous-improvement install --uninstall              # remove from all targets
 */

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

type InstallMode = "beginner" | "expert" | "mcp";
type TargetKey = "claude" | "openclaw" | "cursor" | "codex";
type HookType = "PreToolUse" | "PostToolUse" | "SessionStart" | "SessionEnd";

interface TargetConfig {
  dir: string;
  label: string;
}

interface HookCommand {
  command: string;
  type: "command";
}

interface HookEntry {
  hooks: HookCommand[];
  matcher: string;
}

interface McpServerConfig {
  args: string[];
  command: string;
}

interface ClaudeSettings {
  hooks?: Partial<Record<HookType, HookEntry[]>>;
  mcpServers?: Record<string, McpServerConfig>;
}

interface PackInstinct {
  body: string;
  confidence: number;
  domain?: string;
  id: string;
  trigger: string;
}

interface ProjectHash {
  hash: string;
  root: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_SOURCE = join(__dirname, "..", "SKILL.md");
const SKILL_NAME = "continuous-improvement";
const REPO_ROOT = join(__dirname, "..");
const COMMAND_FILES = [
  "continuous-improvement.md",
  "planning-with-files.md",
  "proceed-with-claude-recommendation.md",
  "discipline.md",
  "dashboard.md",
] as const;
const HOOK_TYPES: readonly HookType[] = ["PreToolUse", "PostToolUse"];
const SESSION_HOOK_TYPES: readonly HookType[] = ["SessionStart", "SessionEnd"];

function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

function isInstallMode(value: string | undefined): value is InstallMode {
  return value === "beginner" || value === "expert" || value === "mcp";
}

function isTargetKey(value: string | undefined): value is TargetKey {
  return value === "claude" || value === "openclaw" || value === "cursor" || value === "codex";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

const rawArgs = process.argv.slice(2);
const modeIndex = rawArgs.indexOf("--mode");
const requestedMode = modeIndex !== -1 ? rawArgs[modeIndex + 1] : undefined;
const INSTALL_MODE: InstallMode = isInstallMode(requestedMode) ? requestedMode : "beginner";

const TARGETS: Record<TargetKey, TargetConfig> = {
  claude: {
    label: "Claude Code",
    dir: join(getHomeDir(), ".claude", "skills", SKILL_NAME),
  },
  openclaw: {
    label: "OpenClaw",
    dir: join(getHomeDir(), ".openclaw", "skills", SKILL_NAME),
  },
  cursor: {
    label: "Cursor",
    dir: join(getHomeDir(), ".cursor", "skills", SKILL_NAME),
  },
  codex: {
    label: "Codex",
    dir: join(getHomeDir(), ".codex", "skills", SKILL_NAME),
  },
};

function detectTargets(): TargetKey[] {
  const detected: TargetKey[] = [];
  for (const [key, target] of Object.entries(TARGETS) as Array<[TargetKey, TargetConfig]>) {
    const parentDir = dirname(target.dir);
    const configDir = dirname(parentDir);
    if (existsSync(configDir)) {
      detected.push(key);
    }
  }
  return detected;
}

function installTo(key: TargetKey): boolean {
  const target = TARGETS[key];

  try {
    if (INSTALL_MODE === "mcp") {
      if (key === "claude") {
        setupMulahazah();
        console.log(`  ✓ ${target.label} → MCP server only`);
      } else {
        console.log(`  ⊘ ${target.label} — MCP mode only applies to Claude Code`);
      }
      return true;
    }

    mkdirSync(target.dir, { recursive: true });
    copyFileSync(SKILL_SOURCE, join(target.dir, "SKILL.md"));
    console.log(`  ✓ ${target.label} → ${target.dir}/SKILL.md`);

    if (key === "claude") {
      setupMulahazah();
    }

    return true;
  } catch (error) {
    console.error(`  ✗ ${target.label}: ${getErrorMessage(error)}`);
    return false;
  }
}

function setupMulahazah(): void {
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

  if (INSTALL_MODE === "expert" || INSTALL_MODE === "mcp") {
    setupMcpServer();
  }
}

function setupMcpServer(): void {
  const home = getHomeDir();
  const mcpServerPath = join(REPO_ROOT, "bin", "mcp-server.mjs");
  const mcpMode: "beginner" | "expert" = INSTALL_MODE === "mcp" ? "beginner" : "expert";
  const settingsPath = join(home, ".claude", "settings.json");
  const settings = existsSync(settingsPath) ? readJsonFile<ClaudeSettings>(settingsPath) : {};

  if (settings === null) {
    console.warn("  ! Could not parse settings.json — skipping MCP setup");
    return;
  }

  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }

  const alreadySetup = settings.mcpServers["continuous-improvement"];
  if (!alreadySetup) {
    settings.mcpServers["continuous-improvement"] = {
      command: "node",
      args: [mcpServerPath, "--mode", mcpMode],
    };
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    console.log(`  ✓ MCP server registered (mode: ${mcpMode})`);
  } else {
    console.log("  ✓ MCP server already registered — no change");
  }

  const desktopConfigPath = join(home, ".claude", "claude_desktop_config.json");
  if (!existsSync(desktopConfigPath)) {
    return;
  }

  const desktopConfig = readJsonFile<ClaudeSettings>(desktopConfigPath);
  if (!desktopConfig) {
    return;
  }

  if (!desktopConfig.mcpServers) {
    desktopConfig.mcpServers = {};
  }

  if (!desktopConfig.mcpServers["continuous-improvement"]) {
    desktopConfig.mcpServers["continuous-improvement"] = {
      command: "node",
      args: [mcpServerPath, "--mode", mcpMode],
    };
    writeFileSync(desktopConfigPath, JSON.stringify(desktopConfig, null, 2) + "\n");
    console.log("  ✓ Claude Desktop MCP config updated");
  }
}

function hookAlreadyPatched(entries: HookEntry[], scriptName: string): boolean {
  return entries.some((entry) =>
    Array.isArray(entry.hooks) &&
    entry.hooks.some((hook) => hook.command.includes(scriptName))
  );
}

function patchClaudeSettings(observePath: string): void {
  const settingsPath = join(getHomeDir(), ".claude", "settings.json");
  const settings = existsSync(settingsPath) ? readJsonFile<ClaudeSettings>(settingsPath) : {};

  if (settings === null) {
    console.warn(`  ! Could not parse ${settingsPath} — skipping hook patch`);
    return;
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const hookEntry: HookEntry = {
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
    const hookEntries = settings.hooks[hookType] as HookEntry[];
    if (!hookAlreadyPatched(hookEntries, "observe.sh")) {
      hookEntries.push(hookEntry);
      changed = true;
    }
  }

  if (INSTALL_MODE === "expert") {
    const sessionPath = join(getHomeDir(), ".claude", "instincts", "session.sh");
    const sessionHook: HookEntry = {
      matcher: "",
      hooks: [{ type: "command", command: `bash "${sessionPath}"` }],
    };

    for (const hookType of SESSION_HOOK_TYPES) {
      if (!Array.isArray(settings.hooks[hookType])) {
        settings.hooks[hookType] = [];
      }
      const hookEntries = settings.hooks[hookType] as HookEntry[];
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
  } else {
    console.log("  ✓ settings.json already has hooks — no change needed");
  }
}

function uninstallAll(): void {
  console.log("\nUninstalling continuous-improvement skill...\n");
  const home = getHomeDir();
  let removed = 0;

  for (const [, target] of Object.entries(TARGETS) as Array<[TargetKey, TargetConfig]>) {
    const skillFile = join(target.dir, "SKILL.md");
    if (!existsSync(skillFile)) {
      continue;
    }

    try {
      rmSync(target.dir, { recursive: true });
      console.log(`  ✓ Removed skill from ${target.label}`);
      removed++;
    } catch (error) {
      console.error(`  ✗ ${target.label}: ${getErrorMessage(error)}`);
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
    } catch (error) {
      console.error(`  ✗ ${commandName}: ${getErrorMessage(error)}`);
    }
  }

  for (const hookFile of ["observe.sh", "session.sh"] as const) {
    const filePath = join(home, ".claude", "instincts", hookFile);
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      rmSync(filePath);
      console.log(`  ✓ Removed ${hookFile}`);
    } catch (error) {
      console.error(`  ✗ ${hookFile}: ${getErrorMessage(error)}`);
    }
  }

  const settingsPath = join(home, ".claude", "settings.json");
  if (existsSync(settingsPath)) {
    const settings = readJsonFile<ClaudeSettings>(settingsPath);
    if (settings) {
      let changed = false;

      for (const hookType of [...HOOK_TYPES, ...SESSION_HOOK_TYPES]) {
        const hookEntries = settings.hooks?.[hookType];
        if (!Array.isArray(hookEntries)) {
          continue;
        }

        const nextEntries = hookEntries.filter((entry) =>
          !entry.hooks.some((hook) =>
            hook.command.includes("observe.sh") || hook.command.includes("session.sh")
          )
        );

        if (nextEntries.length !== hookEntries.length) {
          changed = true;
        }

        settings.hooks![hookType] = nextEntries;
      }

      if (settings.mcpServers?.["continuous-improvement"]) {
        delete settings.mcpServers["continuous-improvement"];
        changed = true;
      }

      if (changed) {
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
        console.log("  ✓ Removed hooks and MCP server from settings.json");
      }
    } else {
      console.warn("  ! Could not clean settings.json — remove hooks manually");
    }
  }

  const desktopConfigPath = join(home, ".claude", "claude_desktop_config.json");
  if (existsSync(desktopConfigPath)) {
    const desktopConfig = readJsonFile<ClaudeSettings>(desktopConfigPath);
    if (desktopConfig?.mcpServers?.["continuous-improvement"]) {
      delete desktopConfig.mcpServers["continuous-improvement"];
      writeFileSync(desktopConfigPath, JSON.stringify(desktopConfig, null, 2) + "\n");
      console.log("  ✓ Removed MCP server from Claude Desktop config");
    }
  }

  if (removed === 0) {
    console.log("  No skill installations found.");
  }

  console.log(
    "\n  Note: Instinct data in ~/.claude/instincts/ was preserved.\n" +
      "  To remove learned data too: rm -rf ~/.claude/instincts/\n"
  );
}

function printUsage(): void {
  console.log(`
Usage: npx continuous-improvement install [options]

Options:
  --target <name>   Install to specific target (claude, openclaw, cursor, codex, all)
  --mode <mode>     Installation mode:
                      beginner  — hooks only, no MCP server (default)
                      expert    — hooks + MCP server + session hooks + all tools
                      mcp       — MCP server only (works with any MCP client)
  --uninstall       Remove from all targets
  --help            Show this help

Modes explained:
  BEGINNER (default)   Just works. Hooks capture silently, instincts grow over time.
                       3 tools via /continuous-improvement command.

  EXPERT               Everything in beginner + MCP server with 12 tools:
                       planning files, import/export, manual instinct creation,
                       observation viewer, confidence tuning. Plus session hooks.

  MCP                  MCP server only — for editors that support MCP but not
                       Claude Code hooks (Cursor, Zed, Windsurf, VS Code).

Examples:
  npx continuous-improvement install                        # beginner (default)
  npx continuous-improvement install --mode expert          # full power
  npx continuous-improvement install --mode mcp             # MCP server only
  npx continuous-improvement install --target all            # install everywhere
  npx continuous-improvement install --uninstall             # remove all
`);
}

function getProjectHashSync(): ProjectHash {
  try {
    const root = execSync("git rev-parse --show-toplevel 2>/dev/null", { encoding: "utf8" }).trim();
    const hash = createHash("sha256").update(root).digest("hex").slice(0, 12);
    return { root, hash };
  } catch {
    return { root: "global", hash: "global" };
  }
}

const args = process.argv.slice(2);
const command = args[0];
const validCommands = new Set(["install", "--help", "-h", "--uninstall"]);

if (args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(0);
}

if (!command || !validCommands.has(command)) {
  printUsage();
  process.exit(command ? 1 : 0);
}

if (args.includes("--uninstall")) {
  uninstallAll();
  process.exit(0);
}

console.log(`
continuous-improvement v3.2 (mode: ${INSTALL_MODE})
Research → Plan → Execute → Verify → Reflect → Learn → Iterate
`);

const targetIndex = args.indexOf("--target");
let targets: TargetKey[];

if (targetIndex !== -1 && args[targetIndex + 1]) {
  const requested = args[targetIndex + 1]?.toLowerCase();
  if (requested === "all") {
    targets = Object.keys(TARGETS) as TargetKey[];
  } else if (isTargetKey(requested)) {
    targets = [requested];
  } else {
    console.error(`Unknown target: ${requested}`);
    console.error(`Available: ${Object.keys(TARGETS).join(", ")}, all`);
    process.exit(1);
  }
} else {
  targets = detectTargets();
  if (targets.length === 0) {
    console.log("No supported agent configs detected. Installing to Claude Code by default.\n");
    targets = ["claude"];
  } else {
    console.log(`Detected: ${targets.map((target) => TARGETS[target].label).join(", ")}\n`);
  }
}

console.log("Installing...\n");

let installed = 0;
for (const target of targets) {
  if (installTo(target)) {
    installed++;
  }
}

const hasClaude = targets.includes("claude");
const modeInfo: Record<InstallMode, string> = {
  beginner: "Hooks are capturing silently. System auto-levels as you use it.",
  expert: "Full plugin active: hooks + MCP server + session hooks. 12 tools available.",
  mcp: "MCP server registered. Connect from any MCP-compatible editor.",
};

const packIndex = rawArgs.indexOf("--pack");
if (packIndex !== -1 && rawArgs[packIndex + 1]) {
  const packName = rawArgs[packIndex + 1];
  const packPath = join(REPO_ROOT, "instinct-packs", `${packName}.json`);
  if (existsSync(packPath)) {
    const project = getProjectHashSync();
    const targetDir = join(getHomeDir(), ".claude", "instincts", project.hash);
    mkdirSync(targetDir, { recursive: true });

    const instincts = JSON.parse(readFileSync(packPath, "utf8")) as PackInstinct[];
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
  } else {
    const available = readdirSync(join(REPO_ROOT, "instinct-packs"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(".json", ""));
    console.error(`  ✗ Unknown pack: ${packName}. Available: ${available.join(", ")}`);
  }
}

console.log(`
${installed > 0 ? "Done." : "Failed."} Installed to ${installed}/${targets.length} target(s).
${hasClaude ? `\n${modeInfo[INSTALL_MODE]}` : ""}
Next steps:
  1. Start a new Claude Code session
  2. Say: "Use the continuous-improvement framework to [your task]"
  3. If a task needs persistent planning, run: /planning-with-files
  4. After your first task, run: /continuous-improvement
  5. Try: /discipline for quick reference, /dashboard for instinct health
${INSTALL_MODE === "expert" ? "\nMCP tools available: ci_status, ci_instincts, ci_reflect, ci_reinforce,\n  ci_create_instinct, ci_observations, ci_export, ci_import, ci_plan_init,\n  ci_plan_status, ci_dashboard, ci_load_pack" : ""}
${INSTALL_MODE === "mcp" ? "\nMCP tools available: ci_status, ci_instincts, ci_reflect" : ""}
Available instinct packs: npx continuous-improvement install --pack react|python|go
`);
