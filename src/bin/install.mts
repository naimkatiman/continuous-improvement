#!/usr/bin/env node

/**
 * continuous-improvement installer (Claude Code)
 *
 * Usage:
 *   npx continuous-improvement install                # beginner mode (default)
 *   npx continuous-improvement install --mode expert  # + MCP server + session hooks
 *   npx continuous-improvement install --pack react   # load starter instinct pack
 *   npx continuous-improvement install --target gemini,codex  # skill into other agents' rules files
 *   npx continuous-improvement install --uninstall    # remove everything
 */

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { getToolNames } from "../lib/plugin-metadata.mjs";
import { TARGET_IDS, planTargetWrites, resolveTargets } from "../lib/install-targets.mjs";

type InstallMode = "beginner" | "expert";
type HookType = "PreToolUse" | "PostToolUse" | "SessionStart" | "SessionEnd";

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
  hooks?: Partial<Record<HookType, Array<HookEntry | null>>>;
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
  "verify-install.md",
  "workspace-surface-audit.md",
] as const;
const HOOK_TYPES: readonly HookType[] = ["PreToolUse", "PostToolUse"];
const SESSION_HOOK_TYPES: readonly HookType[] = ["SessionStart", "SessionEnd"];
// Iterated by install cleanup and uninstall cleanup. Deduped via Set so an
// accidental overlap between HOOK_TYPES and SESSION_HOOK_TYPES never causes
// a hook bucket to be processed twice.
const ALL_HOOK_TYPES: readonly HookType[] = Array.from(
  new Set<HookType>([...HOOK_TYPES, ...SESSION_HOOK_TYPES]),
);

// Our installer writes `bash ".../.claude/instincts/(observe|session).sh"`.
// Older Windows installs sometimes stored the same command with backslashes in
// the quoted path; those no-op because bash can't resolve them. We strip only
// that installer-owned command shape so foreign hooks that merely mention
// observe.sh/session.sh survive.
const INSTALLER_OBSERVE_SESSION_COMMAND_RE =
  /^bash ".*[\\/]\.claude[\\/]instincts[\\/](?:observe|session)\.sh"$/;

function isBrokenObserveOrSessionCommand(command: unknown): boolean {
  if (typeof command !== "string") return false;
  return command.includes("\\") && INSTALLER_OBSERVE_SESSION_COMMAND_RE.test(command);
}

// Any installer-owned observe.sh / session.sh hook command, broken or clean.
// Used by uninstall to drop both freshly-installed forward-slash hooks and any
// stale legacy entries. Pairs with isBrokenObserveOrSessionCommand above.
function isOurObserveOrSessionCommand(command: unknown): boolean {
  if (typeof command !== "string") return false;
  return INSTALLER_OBSERVE_SESSION_COMMAND_RE.test(command);
}

function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

function toBashPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function isInstallMode(value: string | undefined): value is InstallMode {
  return value === "beginner" || value === "expert";
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

// The observation hooks (hooks/observe.sh, hooks/session.sh) are bash scripts.
// On Windows without Git Bash / WSL the hook commands written into settings.json
// silently no-op, so the user finishes install thinking observation capture is
// live when it never fires. Refuse the install with one actionable line instead.
function assertBashAvailableOnWindows(): void {
  if (process.platform !== "win32") return;
  try {
    execSync("bash --version", { stdio: "ignore" });
  } catch {
    console.error(
      "  ✗ Install refused: the observation hooks (hooks/observe.sh, hooks/session.sh) " +
        "are bash scripts, but `bash --version` is not on PATH. Install Git Bash or WSL, " +
        "reopen your shell, and re-run — see README → Troubleshooting install.",
    );
    process.exit(1);
  }
}

// The marketplace `/plugin install` path and this npx installer both write into
// ~/.claude/. Running both duplicates hooks, commands, and skills. We cannot
// fully resolve Claude Code's marketplace layout from here, so this is a loud
// best-effort warning, not a hard refuse — a scan failure must never block install.
function warnOnMarketplaceCollision(): void {
  const pluginsDir = join(getHomeDir(), ".claude", "plugins");
  if (!existsSync(pluginsDir)) return;
  let hit = false;
  try {
    for (const entry of readdirSync(pluginsDir)) {
      if (entry.includes(SKILL_NAME)) {
        hit = true;
        break;
      }
      const sub = join(pluginsDir, entry);
      try {
        if (
          statSync(sub).isDirectory() &&
          readdirSync(sub).some((e) => e.includes(SKILL_NAME))
        ) {
          hit = true;
          break;
        }
      } catch {
        // unreadable entry — skip it
      }
    }
  } catch {
    // best-effort — never block install on a scan failure
    return;
  }
  if (hit) {
    console.warn(
      "\n  ! Possible Beginner+Expert collision: a marketplace install of\n" +
        "    continuous-improvement looks present under ~/.claude/plugins/. Running the\n" +
        "    npx installer on top of it duplicates hooks/commands/skills in ~/.claude/.\n" +
        "    Pick ONE path — marketplace (/plugin install) or npx — not both.\n",
    );
  }
}

const rawArgs = process.argv.slice(2);
const modeIndex = rawArgs.indexOf("--mode");
const requestedMode = modeIndex !== -1 ? rawArgs[modeIndex + 1] : undefined;
const INSTALL_MODE: InstallMode = isInstallMode(requestedMode) ? requestedMode : "beginner";

const SKILL_DIR = join(getHomeDir(), ".claude", "skills", SKILL_NAME);

function installSkill(): boolean {
  try {
    mkdirSync(SKILL_DIR, { recursive: true });
    copyFileSync(SKILL_SOURCE, join(SKILL_DIR, "SKILL.md"));
    console.log(`  ✓ Claude Code skill → ${SKILL_DIR}/SKILL.md`);
    setupMulahazah();
    return true;
  } catch (error) {
    console.error(`  ✗ Install failed: ${getErrorMessage(error)}`);
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

function setupMcpServer(): void {
  const home = getHomeDir();
  const mcpServerPath = join(REPO_ROOT, "bin", "mcp-server.mjs");
  const settingsPath = join(home, ".claude", "settings.json");
  const settings = existsSync(settingsPath) ? readJsonFile<ClaudeSettings>(settingsPath) : {};

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
      args: [mcpServerPath, "--mode", "expert"],
    };
    writeFileSync(desktopConfigPath, JSON.stringify(desktopConfig, null, 2) + "\n");
    console.log("  ✓ Claude Desktop MCP config updated");
  }
}

function hookAlreadyPatched(entries: HookEntry[], expectedCommand: string): boolean {
  return entries.some((entry) =>
    entry &&
    Array.isArray(entry.hooks) &&
    entry.hooks.some(
      (hook) => typeof hook?.command === "string" && hook.command === expectedCommand,
    )
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

  // Strip broken legacy observe/session hooks at the hook level, not the entry
  // level. A single entry may carry a foreign command alongside a broken hook;
  // dropping the whole entry to remove the broken hook would also wipe the
  // foreign one. Malformed rows (missing/non-array .hooks) are preserved verbatim
  // — we don't know enough to filter them safely, and dropping risks data loss.
  let changed = false;

  for (const hookType of ALL_HOOK_TYPES) {
    const hookEntries = settings.hooks[hookType];
    if (!Array.isArray(hookEntries)) continue;

    let entryListChanged = false;
    const cleanedEntries: Array<HookEntry | null> = [];

    for (const entry of hookEntries) {
      const entryHooks = (entry as HookEntry | null | undefined)?.hooks;
      if (!Array.isArray(entryHooks)) {
        cleanedEntries.push(entry);
        continue;
      }

      const filteredHooks = entryHooks.filter(
        (hook) => !isBrokenObserveOrSessionCommand(hook?.command),
      );

      if (filteredHooks.length === entryHooks.length) {
        cleanedEntries.push(entry);
        continue;
      }

      entryListChanged = true;
      if (filteredHooks.length > 0) {
        const cleanedEntry: HookEntry = {
          ...(entry as HookEntry),
          hooks: filteredHooks,
        };
        cleanedEntries.push(cleanedEntry);
      }
    }

    if (entryListChanged) {
      settings.hooks[hookType] = cleanedEntries as HookEntry[];
      changed = true;
    }
  }

  const observeCommand = `bash "${toBashPath(observePath)}"`;

  for (const hookType of HOOK_TYPES) {
    if (!Array.isArray(settings.hooks[hookType])) {
      settings.hooks[hookType] = [];
    }
    const hookEntries = settings.hooks[hookType] as HookEntry[];
    if (!hookAlreadyPatched(hookEntries, observeCommand)) {
      hookEntries.push({
        matcher: "",
        hooks: [
          {
            type: "command",
            command: observeCommand,
          },
        ],
      });
      changed = true;
    }
  }

  if (INSTALL_MODE === "expert") {
    const sessionPath = join(getHomeDir(), ".claude", "instincts", "session.sh");
    const sessionCommand = `bash "${toBashPath(sessionPath)}"`;

    for (const hookType of SESSION_HOOK_TYPES) {
      if (!Array.isArray(settings.hooks[hookType])) {
        settings.hooks[hookType] = [];
      }
      const hookEntries = settings.hooks[hookType] as HookEntry[];
      if (!hookAlreadyPatched(hookEntries, sessionCommand)) {
        hookEntries.push({
          matcher: "",
          hooks: [{ type: "command", command: sessionCommand }],
        });
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

  if (existsSync(SKILL_DIR)) {
    try {
      rmSync(SKILL_DIR, { recursive: true });
      console.log("  ✓ Removed Claude Code skill");
      removed++;
    } catch (error) {
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

  // Remove the Node observer artifacts deployed alongside observe.sh.
  for (const observerFile of [
    join("bin", "observe.mjs"),
    join("lib", "observe-event.mjs"),
  ]) {
    const filePath = join(home, ".claude", "instincts", observerFile);
    if (!existsSync(filePath)) continue;
    try {
      rmSync(filePath);
      console.log(`  ✓ Removed ${observerFile}`);
    } catch (error) {
      console.error(`  ✗ ${observerFile}: ${getErrorMessage(error)}`);
    }
  }

  const settingsPath = join(home, ".claude", "settings.json");
  if (existsSync(settingsPath)) {
    const settings = readJsonFile<ClaudeSettings>(settingsPath);
    if (settings) {
      let changed = false;

      // Filter at the hook level, not the entry level. A foreign command may
      // share an entry with one of ours; entry-level deletion would silently
      // wipe the foreign hook. Malformed rows (missing/non-array .hooks) are
      // preserved verbatim — we don't know enough to filter them safely.
      // ALL_HOOK_TYPES dedupes any future overlap between HOOK_TYPES and
      // SESSION_HOOK_TYPES so a bucket is never processed twice.
      for (const hookType of ALL_HOOK_TYPES) {
        const hookEntries = settings.hooks?.[hookType];
        if (!Array.isArray(hookEntries)) {
          continue;
        }

        let entryListChanged = false;
        const cleanedEntries: Array<HookEntry | null> = [];

        for (const entry of hookEntries) {
          const entryHooks = (entry as HookEntry | null | undefined)?.hooks;
          if (!Array.isArray(entryHooks)) {
            cleanedEntries.push(entry);
            continue;
          }

          const filteredHooks = entryHooks.filter(
            (hook) => !isOurObserveOrSessionCommand(hook?.command),
          );

          if (filteredHooks.length === entryHooks.length) {
            cleanedEntries.push(entry);
            continue;
          }

          entryListChanged = true;
          if (filteredHooks.length > 0) {
            const cleanedEntry: HookEntry = {
          ...(entry as HookEntry),
          hooks: filteredHooks,
        };
        cleanedEntries.push(cleanedEntry);
          }
        }

        if (entryListChanged) {
          settings.hooks![hookType] = cleanedEntries as HookEntry[];
          changed = true;
        }
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
  --target <names>  Comma-separated platform list (default: claude):
                      claude    — full install: hooks + skill + commands
                      gemini    — GEMINI.md (Gemini CLI)
                      codex     — AGENTS.md (Codex CLI / agents.md standard)
                      cursor    — .cursor/rules/continuous-improvement.mdc
                      windsurf  — .windsurf/rules/continuous-improvement.md
                      zed       — .rules
                      aider     — CONVENTIONS.md + .aider.conf.yml
                      copilot   — .github/copilot-instructions.md
                    Non-claude targets write the 7-Laws skill text into the
                    current project; hooks/MCP/instincts stay Claude Code-only.
  --help            Show this help

Options for 'backfill':
  --dry-run         Report counts only, no file writes
  --help            Show backfill-specific help

Examples:
  npx continuous-improvement install                # beginner (default)
  npx continuous-improvement install --mode expert  # full power
  npx continuous-improvement install --pack react   # load React instincts
  npx continuous-improvement install --target gemini,codex  # other agents' rules files
  npx continuous-improvement backfill --dry-run     # report thin/rich row counts
  npx continuous-improvement backfill               # tag rows in place
  npx continuous-improvement install --uninstall    # remove everything
`);
}

function getProjectHashSync(): ProjectHash {
  try {
    // No shell redirect — `2>/dev/null` breaks under cmd.exe (tries to open a
    // file literally named /dev/null); ignore stderr via stdio instead.
    const root = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const hash = createHash("sha256").update(root).digest("hex").slice(0, 12);
    return { root, hash };
  } catch {
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
  } catch {
    // backfill.mjs always exits 0; if execFileSync threw, propagate the exit
    // status without a stack trace so operator output stays clean.
  }
  process.exit(0);
}

if (args.includes("--uninstall")) {
  uninstallAll();
  process.exit(0);
}

// --target <names>: comma-separated platform list, default claude-only.
// Non-claude targets receive the skill text in their platform's rules file
// (project-level); the full hook/MCP/instinct install stays Claude Code-only.
const targetFlagIndex = rawArgs.indexOf("--target");
let requestedTargets: string[] = ["claude"];
if (targetFlagIndex !== -1) {
  const targetCsv = rawArgs[targetFlagIndex + 1];
  if (!targetCsv || targetCsv.startsWith("--")) {
    console.error(`--target requires a value. Valid targets: ${TARGET_IDS.join(", ")}`);
    process.exit(1);
  }
  const resolved = resolveTargets(targetCsv);
  if (resolved.unknown.length > 0) {
    console.error(
      `Unknown --target name(s): ${resolved.unknown.join(", ")}. Valid targets: ${TARGET_IDS.join(", ")}`,
    );
    process.exit(1);
  }
  if (resolved.targets.length === 0) {
    console.error(`--target requires at least one name. Valid targets: ${TARGET_IDS.join(", ")}`);
    process.exit(1);
  }
  requestedTargets = resolved.targets;
}

function installNonClaudeTargets(targetIds: string[]): void {
  const skillMd = readFileSync(SKILL_SOURCE, "utf8");
  const project = getProjectHashSync();
  const projectRoot = project.root === "global" ? process.cwd() : project.root;
  const readExisting = (relPath: string): string | null => {
    const absPath = join(projectRoot, relPath);
    return existsSync(absPath) ? readFileSync(absPath, "utf8") : null;
  };
  const notes = new Set<string>();
  for (const targetId of targetIds) {
    const plan = planTargetWrites(targetId, skillMd, readExisting);
    for (const write of plan.writes) {
      const absPath = join(projectRoot, write.relPath);
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, write.content);
      console.log(`  ✓ ${targetId} → ${write.relPath}`);
    }
    for (const note of plan.notes) notes.add(note);
  }
  for (const note of notes) console.log(`  ℹ ${note}`);
}

const nonClaudeTargets = requestedTargets.filter((targetId) => targetId !== "claude");
if (nonClaudeTargets.length > 0) {
  console.log("\ncontinuous-improvement multi-platform install\n");
  installNonClaudeTargets(nonClaudeTargets);
  if (!requestedTargets.includes("claude")) {
    console.log("\nDone. Claude Code install skipped (not in --target list).");
    process.exit(0);
  }
}

console.log(`
continuous-improvement (mode: ${INSTALL_MODE})
Research → Plan → Execute → Verify → Reflect → Learn → Iterate
`);

assertBashAvailableOnWindows();
warnOnMarketplaceCollision();

console.log("Installing to Claude Code...\n");

const installed = installSkill() ? 1 : 0;

const modeInfo: Record<InstallMode, string> = {
  beginner: "Hooks are capturing silently. System auto-levels as you use it.",
  expert: `Full plugin active: hooks + MCP server + session hooks. ${getToolNames("expert").length} tools available.`,
};

const packIndex = rawArgs.indexOf("--pack");
if (packIndex !== -1 && rawArgs[packIndex + 1]) {
  const packName = rawArgs[packIndex + 1];
  const packPath = join(REPO_ROOT, "instinct-packs", `${packName}.json`);
  if (existsSync(packPath)) {
    const project = getProjectHashSync();
    const targetDir = join(getHomeDir(), ".claude", "instincts", project.hash);
    mkdirSync(targetDir, { recursive: true });

    let instincts: PackInstinct[] = [];
    try {
      instincts = JSON.parse(readFileSync(packPath, "utf8")) as PackInstinct[];
    } catch (error) {
      console.error(
        `  ✗ Pack "${packName}" could not be loaded: ${getErrorMessage(error)}\n` +
          `    ${packPath} is not valid JSON. No instincts were written — fix or re-fetch the pack file.`,
      );
    }
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
${installed === 1 ? "Done." : "Failed."}
${modeInfo[INSTALL_MODE]}

Next steps:
  1. Start a new Claude Code session
  2. Say: "Use the continuous-improvement framework to [your task]"
  3. If a task needs persistent planning, run: /planning-with-files
  4. After your first task, run: /continuous-improvement
  5. Try: /discipline for quick reference, /dashboard for instinct health
${INSTALL_MODE === "expert" ? `\nMCP tools available (${getToolNames("expert").length}): ${getToolNames("expert").join(", ")}` : ""}
Available instinct packs: npx continuous-improvement install --pack react|python|go|meta
`);
