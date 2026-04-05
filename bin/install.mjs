#!/usr/bin/env node

/**
 * continuous-improvement installer
 *
 * Usage:
 *   npx continuous-improvement install                # auto-detect & install
 *   npx continuous-improvement install --target claude # install to ~/.claude/skills/ + Mulahazah
 *   npx continuous-improvement install --target openclaw # install to ~/.openclaw/skills/
 *   npx continuous-improvement install --target cursor # install to ~/.cursor/skills/
 *   npx continuous-improvement install --target all    # install to all detected targets
 *   npx continuous-improvement install --uninstall     # remove from all targets
 */

import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_SOURCE = join(__dirname, "..", "SKILL.md");
const SKILL_NAME = "continuous-improvement";
const REPO_ROOT = join(__dirname, "..");

const TARGETS = {
  claude: {
    label: "Claude Code",
    dir: join(homedir(), ".claude", "skills", SKILL_NAME),
  },
  openclaw: {
    label: "OpenClaw",
    dir: join(homedir(), ".openclaw", "skills", SKILL_NAME),
  },
  cursor: {
    label: "Cursor",
    dir: join(homedir(), ".cursor", "skills", SKILL_NAME),
  },
  codex: {
    label: "Codex",
    dir: join(homedir(), ".codex", "skills", SKILL_NAME),
  },
};

function detectTargets() {
  const detected = [];
  for (const [key, target] of Object.entries(TARGETS)) {
    const parentDir = dirname(target.dir);
    const configDir = dirname(parentDir);
    if (existsSync(configDir)) {
      detected.push(key);
    }
  }
  return detected;
}

function installTo(key) {
  const target = TARGETS[key];
  if (!target) {
    console.error(`  Unknown target: ${key}`);
    return false;
  }

  try {
    mkdirSync(target.dir, { recursive: true });
    copyFileSync(SKILL_SOURCE, join(target.dir, "SKILL.md"));
    console.log(`  ✓ ${target.label} → ${target.dir}/SKILL.md`);

    if (key === "claude") {
      setupMulahazah();
    }

    return true;
  } catch (err) {
    console.error(`  ✗ ${target.label}: ${err.message}`);
    return false;
  }
}

function setupMulahazah() {
  const home = homedir();
  const instinctsDir = join(home, ".claude", "instincts");
  const globalDir = join(instinctsDir, "global");

  // 1. Create directory structure
  mkdirSync(globalDir, { recursive: true });
  console.log(`  ✓ Instincts dir → ${instinctsDir}/`);

  // 2. Copy observe.sh and make executable
  const observeSrc = join(REPO_ROOT, "hooks", "observe.sh");
  const observeDest = join(instinctsDir, "observe.sh");
  if (existsSync(observeSrc)) {
    copyFileSync(observeSrc, observeDest);
    chmodSync(observeDest, 0o755);
    console.log(`  ✓ observe.sh → ${observeDest}`);
  }

  // 3. Copy /continuous-improvement command
  const commandsDir = join(home, ".claude", "commands");
  mkdirSync(commandsDir, { recursive: true });
  const cmdSrc = join(REPO_ROOT, "commands", "continuous-improvement.md");
  const cmdDest = join(commandsDir, "continuous-improvement.md");
  if (existsSync(cmdSrc)) {
    copyFileSync(cmdSrc, cmdDest);
    console.log(`  ✓ /continuous-improvement command → ${cmdDest}`);
  }

  // 4. Patch ~/.claude/settings.json with hooks
  patchClaudeSettings(observeDest);
}

function patchClaudeSettings(observePath) {
  const settingsPath = join(homedir(), ".claude", "settings.json");

  let settings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    } catch {
      console.warn(`  ! Could not parse ${settingsPath} — skipping hook patch`);
      return;
    }
  }

  if (!settings.hooks) settings.hooks = {};

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

  for (const hookType of ["PreToolUse", "PostToolUse"]) {
    if (!Array.isArray(settings.hooks[hookType])) {
      settings.hooks[hookType] = [];
    }
    const alreadyPatched = settings.hooks[hookType].some(
      (h) =>
        Array.isArray(h.hooks) &&
        h.hooks.some((hh) => hh.command && hh.command.includes("observe.sh"))
    );
    if (!alreadyPatched) {
      settings.hooks[hookType].push(hookEntry);
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    console.log(`  ✓ Patched ~/.claude/settings.json with PreToolUse/PostToolUse hooks`);
  } else {
    console.log(`  ✓ settings.json already has observe.sh hooks — no change needed`);
  }
}

function uninstallAll() {
  console.log("\nUninstalling continuous-improvement skill...\n");
  const home = homedir();
  let removed = 0;

  // 1. Remove skill files from all targets
  for (const [key, target] of Object.entries(TARGETS)) {
    const skillFile = join(target.dir, "SKILL.md");
    if (existsSync(skillFile)) {
      try {
        rmSync(target.dir, { recursive: true });
        console.log(`  ✓ Removed skill from ${target.label}`);
        removed++;
      } catch (err) {
        console.error(`  ✗ ${target.label}: ${err.message}`);
      }
    }
  }

  // 2. Remove /continuous-improvement command
  const cmdFile = join(home, ".claude", "commands", "continuous-improvement.md");
  if (existsSync(cmdFile)) {
    try {
      rmSync(cmdFile);
      console.log(`  ✓ Removed /continuous-improvement command`);
    } catch (err) {
      console.error(`  ✗ Command file: ${err.message}`);
    }
  }

  // 3. Remove observe.sh from instincts dir
  const observeFile = join(home, ".claude", "instincts", "observe.sh");
  if (existsSync(observeFile)) {
    try {
      rmSync(observeFile);
      console.log(`  ✓ Removed observe.sh`);
    } catch (err) {
      console.error(`  ✗ observe.sh: ${err.message}`);
    }
  }

  // 4. Remove hooks from settings.json
  const settingsPath = join(home, ".claude", "settings.json");
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
      let changed = false;
      for (const hookType of ["PreToolUse", "PostToolUse"]) {
        if (Array.isArray(settings.hooks?.[hookType])) {
          const before = settings.hooks[hookType].length;
          settings.hooks[hookType] = settings.hooks[hookType].filter(
            (h) =>
              !(
                Array.isArray(h.hooks) &&
                h.hooks.some(
                  (hh) => hh.command && hh.command.includes("observe.sh")
                )
              )
          );
          if (settings.hooks[hookType].length < before) changed = true;
        }
      }
      if (changed) {
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
        console.log(`  ✓ Removed hooks from settings.json`);
      }
    } catch {
      console.warn(`  ! Could not clean settings.json — remove hooks manually`);
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

function printUsage() {
  console.log(`
Usage: npx continuous-improvement install [options]

Options:
  --target <name>   Install to specific target (claude, openclaw, cursor, codex, all)
  --uninstall       Remove from all targets
  --help            Show this help

Examples:
  npx continuous-improvement install              # auto-detect & install
  npx continuous-improvement install --target all  # install everywhere
  npx continuous-improvement install --uninstall   # remove all
`);
}

// --- Main ---

const args = process.argv.slice(2);
const command = args[0];

if (args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(0);
}

if (!command || !["install", "--help", "-h", "--uninstall"].includes(command)) {
  printUsage();
  process.exit(command ? 1 : 0);
}

if (args.includes("--uninstall")) {
  uninstallAll();
  process.exit(0);
}

console.log(`
continuous-improvement v2.2
Research → Plan → Execute → Verify → Reflect → Learn → Iterate
`);

const targetIdx = args.indexOf("--target");
let targets;

if (targetIdx !== -1 && args[targetIdx + 1]) {
  const requested = args[targetIdx + 1].toLowerCase();
  if (requested === "all") {
    targets = Object.keys(TARGETS);
  } else if (TARGETS[requested]) {
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
    console.log(`Detected: ${targets.map((t) => TARGETS[t].label).join(", ")}\n`);
  }
}

console.log("Installing...\n");

let installed = 0;
for (const t of targets) {
  if (installTo(t)) installed++;
}

const hasClaude = targets.includes("claude");

console.log(`
${installed > 0 ? "Done." : "Failed."} Installed to ${installed}/${targets.length} target(s).
${hasClaude ? "\nHooks are capturing. System auto-levels as you use it." : ""}
Next steps:
  1. Start a new Claude Code session
  2. Say: "Use the continuous-improvement framework to [your task]"
  3. After your first task, run: /continuous-improvement
`);
