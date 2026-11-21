import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

interface HookCommand {
  command?: string;
}

interface HookEntry {
  hooks?: HookCommand[];
}

interface TestSettings {
  hooks?: {
    PostToolUse?: HookEntry[];
    PreToolUse?: HookEntry[];
    SessionStart?: HookEntry[];
    SessionEnd?: HookEntry[];
  };
  mcpServers?: Record<string, { command: string; args: string[] }>;
  theme?: string;
}

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const INSTALL_SCRIPT = join(__dirname, "..", "bin", "install.mjs");
const PACKAGED_SESSION_HOOK = join(__dirname, "..", "hooks", "session.mjs");
const SKILL_SOURCE = join(__dirname, "..", "SKILL.md");
const SHIP_SKILL_SOURCE = join(__dirname, "..", "skills", "ship.md");
const SHIP_SKILL_OWNER_FILE = ".continuous-improvement-owner";

const ALL_COMMAND_FILES = [
  "continuous-improvement.md",
  "planning-with-files.md",
  "proceed-with-the-recommendation.md",
  "discipline.md",
  "dashboard.md",
  "learn-eval.md",
] as const;

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

  it("installs with Bash absent because runtime hooks are Node-native", () => {
    const root = join(tmpdir(), `ci-test-no-bash-${process.pid}-${Date.now()}`);
    const home = join(root, "home");
    mkdirSync(join(home, ".claude"), { recursive: true });

    try {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        PATH: "",
        CLAUDE_CI_UPDATE_CHECK: "off",
      };
      const result = spawnSync(process.execPath, [INSTALL_SCRIPT, "install"], {
        cwd: root,
        env,
        encoding: "utf8",
      });
      const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      assert.equal(result.status, 0, combined);
      const settings = JSON.parse(
        readFileSync(join(home, ".claude", "settings.json"), "utf8"),
      ) as TestSettings;
      const commands = (settings.hooks?.PostToolUse ?? [])
        .flatMap((entry) => entry.hooks ?? [])
        .map((hook) => hook.command ?? "");
      assert.ok(commands.some((command) => command.startsWith('node "')));
      assert.ok(commands.every((command) => !command.startsWith("bash ")));
    } finally {
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

  it("installs ship as a global Claude Code skill", () => {
    execFileSync("node", [INSTALL_SCRIPT, "install"], {
      env: { ...process.env, HOME: tempHome, CLAUDE_CI_UPDATE_CHECK: "off" },
      encoding: "utf8",
    });

    const skillPath = join(tempHome, ".claude", "skills", "ship", "SKILL.md");
    assert.ok(existsSync(skillPath), "ship/SKILL.md should be installed globally");

    const installed = readFileSync(skillPath, "utf8");
    const source = readFileSync(SHIP_SKILL_SOURCE, "utf8");
    assert.equal(installed, source, "Installed ship skill should match its packaged source");
    assert.match(installed, /user-invocable: true/, "native skill should expose /ship");
    assert.equal(
      readFileSync(join(tempHome, ".claude", "skills", "ship", SHIP_SKILL_OWNER_FILE), "utf8"),
      "continuous-improvement\n",
      "global ship skill should carry an ownership marker",
    );
    assert.equal(
      existsSync(join(tempHome, ".claude", "commands", "ship.md")),
      false,
      "installer should not create a duplicate legacy /ship command",
    );
  });

  it("does not install the legacy observe.sh shim", () => {
    const hookPath = join(tempHome, ".claude", "instincts", "observe.sh");
    assert.equal(existsSync(hookPath), false);
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

  it("installs the Node observer artifacts used by the hook command", () => {
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
      writeFileSync(
        settingsPath,
        JSON.stringify(
          {
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
          },
          null,
          2,
        ) + "\n",
      );

      execFileSync("node", [INSTALL_SCRIPT, "install", "--mode", "expert"], {
        env: { ...process.env, HOME: winHome },
        encoding: "utf8",
      });

      const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as TestSettings;
      const observeCommands = (settings.hooks?.PreToolUse || [])
        .flatMap((entry) => entry.hooks || [])
        .map((hook) => hook.command)
        .filter((command): command is string => Boolean(command));
      const observeCommand = observeCommands.find((command) => command.includes("bin/observe.mjs"));
      const sessionCommand = settings.hooks?.SessionStart?.[0]?.hooks?.[0]?.command;

      assert.ok(observeCommand, "Node observer hook command should exist");
      assert.match(observeCommand, /^node ".+bin\/observe\.mjs"$/);
      assert.doesNotMatch(observeCommand, /\\/);
      assert.equal(
        observeCommands.filter((command) => command.includes("bin/observe.mjs")).length,
        1,
        "legacy observe hook should be replaced, not duplicated",
      );
      assert.ok(observeCommands.every((command) => !command.startsWith("bash ")));

      assert.ok(sessionCommand, "session.mjs hook command should exist in expert mode");
      assert.match(sessionCommand, /^node ".+session\.mjs"$/);
      assert.doesNotMatch(sessionCommand, /\\/);
    } finally {
      rmSync(winRoot, { recursive: true, force: true });
    }
  });

  it("patches settings.json with hooks", () => {
    const settingsPath = join(tempHome, ".claude", "settings.json");
    assert.ok(existsSync(settingsPath), "settings.json should exist");

    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as TestSettings;
    assert.ok(settings.hooks, "hooks key should exist");
    assert.ok(Array.isArray(settings.hooks.PreToolUse), "PreToolUse should be an array");
    assert.ok(Array.isArray(settings.hooks.PostToolUse), "PostToolUse should be an array");

    const hasObserveHook = (settings.hooks.PreToolUse || []).some(
      (entry) =>
        Array.isArray(entry.hooks) &&
        entry.hooks.some((hook) => hook.command?.includes("bin/observe.mjs"))
    );
    assert.ok(hasObserveHook, "PreToolUse should have the Node observer hook");
  });

  it("does not duplicate hooks on re-install", () => {
    execFileSync("node", [INSTALL_SCRIPT, "install"], {
      env: { ...process.env, HOME: tempHome },
      encoding: "utf8",
    });

    const settingsPath = join(tempHome, ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as TestSettings;

    const observeHooks = (settings.hooks?.PreToolUse || []).filter(
      (entry) =>
        Array.isArray(entry.hooks) &&
        entry.hooks.some((hook) => hook.command?.includes("bin/observe.mjs"))
    );
    assert.equal(observeHooks.length, 1, "Should have exactly one Node observer hook after re-install");
  });

  it("uninstalls cleanly", () => {
    execFileSync("node", [INSTALL_SCRIPT, "--uninstall"], {
      env: { ...process.env, HOME: tempHome },
      encoding: "utf8",
    });

    const skillPath = join(tempHome, ".claude", "skills", "continuous-improvement", "SKILL.md");
    assert.ok(!existsSync(skillPath), "SKILL.md should be removed");

    const shipSkillPath = join(tempHome, ".claude", "skills", "ship", "SKILL.md");
    assert.ok(!existsSync(shipSkillPath), "ship/SKILL.md should be removed");

    const hookPath = join(tempHome, ".claude", "instincts", "bin", "observe.mjs");
    assert.ok(!existsSync(hookPath), "observe.mjs should be removed");

    const planningCommandPath = join(tempHome, ".claude", "commands", "planning-with-files.md");
    assert.ok(!existsSync(planningCommandPath), "planning-with-files command should be removed");

    const settingsPath = join(tempHome, ".claude", "settings.json");
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as TestSettings;
      for (const hookType of ["PreToolUse", "PostToolUse"] as const) {
        const hasObserveHook = (settings.hooks?.[hookType] || []).some(
          (entry) =>
            Array.isArray(entry.hooks) &&
            entry.hooks.some((hook) => /(?:observe\.sh|bin\/observe\.mjs)/.test(hook.command ?? "")),
        );
        assert.ok(!hasObserveHook, `${hookType} observer hooks should be removed`);
      }
    }
  });
});

describe("installer - foreign ship skill preservation", () => {
  it("never overwrites or uninstalls an unowned global ship skill", () => {
    const tempHome = join(tmpdir(), `ci-test-foreign-ship-${Date.now()}`);
    const shipDir = join(tempHome, ".claude", "skills", "ship");
    const shipPath = join(shipDir, "SKILL.md");
    const foreignContent = "# My existing ship skill\n";
    mkdirSync(shipDir, { recursive: true });
    writeFileSync(shipPath, foreignContent);

    try {
      const installResult = spawnSync(process.execPath, [INSTALL_SCRIPT, "install"], {
        env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome, CLAUDE_CI_UPDATE_CHECK: "off" },
        encoding: "utf8",
      });
      const installOutput = `${installResult.stdout ?? ""}${installResult.stderr ?? ""}`;
      assert.equal(installResult.status, 0, installOutput);
      assert.match(installOutput, /preserved.*existing.*ship skill/i);
      assert.match(installOutput, /Done with warning\./);
      assert.doesNotMatch(installOutput, /\nFailed\.\n/);
      assert.match(installOutput, /package \/ship was not installed/i);
      assert.doesNotMatch(installOutput, /For one defect, run: \/ship/);
      assert.equal(readFileSync(shipPath, "utf8"), foreignContent);
      assert.equal(existsSync(join(shipDir, SHIP_SKILL_OWNER_FILE)), false);

      execFileSync("node", [INSTALL_SCRIPT, "--uninstall"], {
        env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome },
        encoding: "utf8",
      });
      assert.equal(readFileSync(shipPath, "utf8"), foreignContent);
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });
});

describe("installer - global ship skill replacement safety", () => {
  it("breaks an owned hard link without overwriting its external target", () => {
    const tempHome = join(tmpdir(), `ci-test-linked-ship-${Date.now()}`);
    const shipDir = join(tempHome, ".claude", "skills", "ship");
    const shipPath = join(shipDir, "SKILL.md");
    const externalPath = join(tempHome, "external-ship.md");
    const externalContent = "# External file must remain unchanged\n";
    mkdirSync(shipDir, { recursive: true });
    writeFileSync(join(shipDir, SHIP_SKILL_OWNER_FILE), "continuous-improvement\n");
    writeFileSync(externalPath, externalContent);
    linkSync(externalPath, shipPath);

    try {
      const result = spawnSync(process.execPath, [INSTALL_SCRIPT, "install"], {
        env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome, CLAUDE_CI_UPDATE_CHECK: "off" },
        encoding: "utf8",
      });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      assert.equal(result.status, 0, output);
      assert.equal(readFileSync(externalPath, "utf8"), externalContent);
      assert.equal(readFileSync(shipPath, "utf8"), readFileSync(SHIP_SKILL_SOURCE, "utf8"));
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it("exits nonzero when the requested installation cannot be written", () => {
    const tempHome = join(tmpdir(), `ci-test-install-failure-${Date.now()}`);
    const skillsDir = join(tempHome, ".claude", "skills");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(join(skillsDir, "continuous-improvement"), "path collision\n");

    try {
      const result = spawnSync(process.execPath, [INSTALL_SCRIPT, "install"], {
        env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome, CLAUDE_CI_UPDATE_CHECK: "off" },
        encoding: "utf8",
      });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      assert.notEqual(result.status, 0, output);
      assert.match(output, /Install failed/i);
      assert.match(output, /\nFailed\.\n/);
      assert.match(output, /Installation incomplete/i);
      assert.doesNotMatch(output, /Hooks are capturing silently|Next steps:|For one defect, run: \/ship/);
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it("exits nonzero when uninstall cannot safely clean owned settings", () => {
    const tempHome = join(tmpdir(), `ci-test-uninstall-failure-${Date.now()}`);
    const claudeDir = join(tempHome, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, "settings.json"), "{not-json\n");

    try {
      const result = spawnSync(process.execPath, [INSTALL_SCRIPT, "--uninstall"], {
        env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome },
        encoding: "utf8",
      });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      assert.notEqual(result.status, 0, output);
      assert.match(output, /Could not clean settings\.json/i);
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it("rejects a staging-root junction redirected into skill discovery", () => {
    const tempHome = join(tmpdir(), `ci-test-staging-junction-${Date.now()}`);
    const claudeDir = join(tempHome, ".claude");
    const skillsDir = join(claudeDir, "skills");
    const stagingRoot = join(claudeDir, ".continuous-improvement-staging");
    mkdirSync(skillsDir, { recursive: true });
    symlinkSync(skillsDir, stagingRoot, process.platform === "win32" ? "junction" : "dir");

    try {
      const result = spawnSync(process.execPath, [INSTALL_SCRIPT, "install"], {
        env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome, CLAUDE_CI_UPDATE_CHECK: "off" },
        encoding: "utf8",
      });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      assert.notEqual(result.status, 0, output);
      assert.match(output, /staging.*(?:link|junction|symbolic)/i);
      assert.equal(existsSync(join(skillsDir, "ship")), false);
      assert.equal(
        readdirSync(skillsDir).some((entry) => entry.startsWith("ship-")),
        false,
        "failed staging must not create a discoverable ghost skill",
      );
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
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

  it("installs session.mjs", () => {
    const sessionPath = join(tempHome, ".claude", "instincts", "hooks", "session.mjs");
    assert.ok(existsSync(sessionPath), "session.mjs should ship in expert mode");
  });

  it("registers continuous-improvement MCP server in settings.json", () => {
    const settingsPath = join(tempHome, ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as TestSettings;
    assert.ok(settings.mcpServers, "mcpServers key should exist");
    const server = settings.mcpServers?.["continuous-improvement"];
    assert.ok(server, "continuous-improvement MCP server should be registered");
    assert.equal(server?.command, "node", "MCP server should run via node");
  });

  it("adds SessionStart and SessionEnd hooks pointing at session.mjs", () => {
    const settingsPath = join(tempHome, ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as TestSettings;
    assert.ok(Array.isArray(settings.hooks?.SessionStart), "SessionStart should be an array");
    assert.ok(Array.isArray(settings.hooks?.SessionEnd), "SessionEnd should be an array");

    const startHasSession = (settings.hooks?.SessionStart || []).some(
      (entry) =>
        Array.isArray(entry.hooks) &&
        entry.hooks.some((hook) => hook.command?.includes("session.mjs"))
    );
    const endHasSession = (settings.hooks?.SessionEnd || []).some(
      (entry) =>
        Array.isArray(entry.hooks) &&
        entry.hooks.some((hook) => hook.command?.includes("session.mjs"))
    );
    assert.ok(startHasSession, "SessionStart should have session.mjs hook");
    assert.ok(endHasSession, "SessionEnd should have session.mjs hook");
  });
});

// Regression: the installer copied bin/observe.mjs and hooks/session.mjs into
// ~/.claude without the ../lib modules they import. Both died at module load
// with ERR_MODULE_NOT_FOUND on every invocation, so an npm install recorded
// zero observations while the installer reported "Full plugin active". These
// tests run the real installer and then start what it installed, from where it
// installed it.
describe("installer - installed entrypoints start from the installed tree", () => {
  const RELATIVE_IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+)["']/g;
  let root = "";
  let home = "";
  let projectRoot = "";
  let env: NodeJS.ProcessEnv = {};

  function findFiles(dir: string, suffix: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return findFiles(full, suffix);
      return entry.name.endsWith(suffix) ? [full] : [];
    });
  }

  function readSettings(): TestSettings {
    return JSON.parse(
      readFileSync(join(home, ".claude", "settings.json"), "utf8"),
    ) as TestSettings;
  }

  // The script behind each `node "<path>"` hook command the installer wired.
  function hookScripts(entries: HookEntry[] | undefined): string[] {
    return (entries ?? [])
      .flatMap((entry) => entry?.hooks ?? [])
      .map((hook) => /^node "(.+)"$/.exec(hook.command ?? "")?.[1])
      .filter((script): script is string => Boolean(script))
      .map((script) => resolve(script));
  }

  function wiredScripts(): string[] {
    const settings = readSettings();
    const fromHooks = Object.values(settings.hooks ?? {}).flatMap((entries) => hookScripts(entries));
    const fromMcp = Object.values(settings.mcpServers ?? {})
      .filter((server) => server.command === "node")
      .map((server) => resolve(server.args[0]));
    return [...fromHooks, ...fromMcp];
  }

  function runHook(script: string, payload: Record<string, unknown>) {
    const result = spawnSync(process.execPath, [script], {
      input: JSON.stringify(payload),
      cwd: projectRoot,
      env,
      encoding: "utf8",
      timeout: 30_000,
    });
    if (result.error) throw result.error;
    return result;
  }

  before(() => {
    root = join(tmpdir(), `ci-test-entrypoints-${process.pid}-${Date.now()}`);
    home = join(root, "home");
    projectRoot = join(root, "project");
    mkdirSync(join(home, ".claude"), { recursive: true });
    mkdirSync(projectRoot, { recursive: true });
    env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      CLAUDE_PROJECT_DIR: projectRoot,
      CLAUDE_CI_UPDATE_CHECK: "off",
      // A CI_INSTINCT_LOAD set in the developer's own shell must not hide the lesson block.
      CI_INSTINCT_LOAD: "",
    };
    const result = spawnSync(process.execPath, [INSTALL_SCRIPT, "install", "--mode", "expert"], {
      cwd: root,
      env,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${result.stdout ?? ""}${result.stderr ?? ""}`);
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("resolves every relative import of every script the installer wired or copied", () => {
    const wired = wiredScripts();
    const copied = findFiles(join(home, ".claude"), ".mjs");
    assert.ok(wired.length > 0, "expert install should wire at least one script");
    assert.ok(copied.length > 0, "expert install should copy at least one script");

    const missing: string[] = [];
    const seen = new Set<string>();
    const queue = [...wired, ...copied];
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      assert.ok(existsSync(file), `installer wired or copied a script that is not on disk: ${file}`);
      for (const match of readFileSync(file, "utf8").matchAll(RELATIVE_IMPORT_RE)) {
        const target = resolve(dirname(file), match[1]);
        if (!existsSync(target)) {
          missing.push(`${file} imports ${match[1]}`);
        } else if (target.endsWith(".mjs")) {
          queue.push(target);
        }
      }
    }

    assert.deepEqual(missing.sort(), [], "every relative import must exist in the installed layout");
  });

  it("the wired observer exits 0 and records one observation row", () => {
    const [observer] = hookScripts(readSettings().hooks?.PostToolUse);
    assert.ok(observer, "PostToolUse should be wired to a node script");

    const result = runHook(observer, {
      session_id: "installed-entrypoint",
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo hi" },
      tool_response: { stdout: "hi" },
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);

    const observationFiles = findFiles(join(home, ".claude", "instincts"), "observations.jsonl");
    assert.equal(observationFiles.length, 1, "one observations.jsonl should exist under the temp HOME");
    const rows = readFileSync(observationFiles[0], "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(rows.length, 1, "exactly one observation row should have landed");
    assert.equal(rows[0].tool, "Bash");
    assert.equal(rows[0].event, "tool_complete");
    assert.equal(rows[0].session, "installed-entrypoint");
  });

  it("the wired session hook exits 0 and reports the level", () => {
    const [session] = hookScripts(readSettings().hooks?.SessionStart);
    assert.ok(session, "SessionStart should be wired to a node script");

    const result = runHook(session, {
      session_id: "installed-entrypoint",
      hook_event_name: "SessionStart",
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(
      result.stderr,
      /\[continuous-improvement\] Level: \S+ \| Observations: \d+ \| Instincts: \d+/,
    );
  });

  // The lesson block is the one path by which a recorded instinct reaches a
  // later session, so the installed copy must print it, not only the packaged one.
  it("the wired session hook prints the same lesson block as the packaged hook", () => {
    const [session] = hookScripts(readSettings().hooks?.SessionStart);
    assert.ok(session, "SessionStart should be wired to a node script");
    const globalDir = join(home, ".claude", "instincts", "global");
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(
      join(globalDir, "build-before-staging.yaml"),
      [
        "id: build-before-staging",
        'trigger: "when staging generated files"',
        "confidence: 0.8",
        "scope: global",
        "---",
        "Run npm run build first.",
        "",
      ].join("\n"),
    );
    const payload = { session_id: "installed-entrypoint", hook_event_name: "SessionStart" };

    const installed = runHook(session, payload);
    const packaged = runHook(PACKAGED_SESSION_HOOK, payload);

    assert.equal(installed.status, 0, `stderr: ${installed.stderr}`);
    assert.match(installed.stdout, /^Notes from continuous-improvement instinct files/);
    assert.match(
      installed.stdout,
      /\n- \[global\] when staging generated files: Run npm run build first\. \(0\.8\)\n$/,
    );
    assert.equal(installed.stdout, packaged.stdout);
  });

  it("uninstall removes every script the installer copied", () => {
    const result = spawnSync(process.execPath, [INSTALL_SCRIPT, "--uninstall"], {
      cwd: root,
      env,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${result.stdout ?? ""}${result.stderr ?? ""}`);
    assert.deepEqual(
      findFiles(join(home, ".claude"), ".mjs"),
      [],
      "no installer-copied script should survive --uninstall",
    );
  });
});

// Regression: the session hook was installed at instincts/session.mjs with its
// libs in ~/.claude/lib. Node resolves ../lib from the REAL path of the entry
// module, so when ~/.claude/instincts is a symlink or junction (synced folder,
// dotfiles manager, instincts moved to a data drive) ../lib pointed beside the
// link target, where nothing was copied, and every SessionStart and SessionEnd
// died at module load while the installer reported success.
describe("installer - session hook starts when ~/.claude/instincts is a link", () => {
  let root = "";
  let home = "";
  let linkTarget = "";
  let projectRoot = "";
  let env: NodeJS.ProcessEnv = {};

  function wiredScript(hookType: "PostToolUse" | "SessionStart" | "SessionEnd"): string {
    const settings = JSON.parse(
      readFileSync(join(home, ".claude", "settings.json"), "utf8"),
    ) as TestSettings;
    const script = (settings.hooks?.[hookType] ?? [])
      .flatMap((entry) => entry?.hooks ?? [])
      .map((hook) => /^node "(.+)"$/.exec(hook.command ?? "")?.[1])
      .find((candidate): candidate is string => Boolean(candidate));
    assert.ok(script, `${hookType} should be wired to a node script`);
    return resolve(script);
  }

  function runHook(script: string, payload: Record<string, unknown>) {
    const result = spawnSync(process.execPath, [script], {
      input: JSON.stringify(payload),
      cwd: projectRoot,
      env,
      encoding: "utf8",
      timeout: 30_000,
    });
    if (result.error) throw result.error;
    return result;
  }

  before(() => {
    root = join(tmpdir(), `ci-test-linked-instincts-${process.pid}-${Date.now()}`);
    home = join(root, "home");
    linkTarget = join(root, "elsewhere", "instincts-data");
    projectRoot = join(root, "project");
    mkdirSync(join(home, ".claude"), { recursive: true });
    mkdirSync(linkTarget, { recursive: true });
    mkdirSync(projectRoot, { recursive: true });
    symlinkSync(
      linkTarget,
      join(home, ".claude", "instincts"),
      process.platform === "win32" ? "junction" : "dir",
    );
    env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      CLAUDE_PROJECT_DIR: projectRoot,
      CLAUDE_CI_UPDATE_CHECK: "off",
    };
    const result = spawnSync(process.execPath, [INSTALL_SCRIPT, "install", "--mode", "expert"], {
      cwd: root,
      env,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${result.stdout ?? ""}${result.stderr ?? ""}`);
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("the wired SessionStart hook exits 0 and reports the level", () => {
    const result = runHook(wiredScript("SessionStart"), {
      session_id: "linked-instincts",
      hook_event_name: "SessionStart",
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(
      result.stderr,
      /\[continuous-improvement\] Level: \S+ \| Observations: \d+ \| Instincts: \d+/,
    );
  });

  it("the wired SessionEnd hook exits 0", () => {
    const result = runHook(wiredScript("SessionEnd"), {
      session_id: "linked-instincts",
      hook_event_name: "SessionEnd",
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });

  it("the wired observer still exits 0 in the same layout", () => {
    const result = runHook(wiredScript("PostToolUse"), {
      session_id: "linked-instincts",
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo hi" },
      tool_response: { stdout: "hi" },
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });

  it("keeps every installed lib inside the instincts tree", () => {
    assert.equal(
      existsSync(join(home, ".claude", "lib")),
      false,
      "the installer must not write into the shared ~/.claude/lib",
    );
    assert.equal(
      existsSync(join(root, "elsewhere", "lib")),
      false,
      "nothing may be resolved from beside the link target",
    );
    for (const libFile of ["gateguard-state.mjs", "instinct-yaml.mjs", "resolve-home-dir.mjs"]) {
      assert.ok(
        existsSync(join(linkTarget, "lib", libFile)),
        `${libFile} should sit in instincts/lib, which moves with the link`,
      );
    }
  });
});

// The session hook used to be wired as node ".../instincts/session.mjs". An
// install over that layout must move the row to the new location (not leave
// two session hooks), and an uninstall must still recognise the old row.
describe("installer - migrates the pre-move session hook location", () => {
  function seedOldLayout(tempHome: string): { oldCommand: string; oldFile: string; settingsPath: string } {
    const settingsPath = join(tempHome, ".claude", "settings.json");
    const oldFile = join(tempHome, ".claude", "instincts", "session.mjs");
    const oldCommand = `node "${oldFile.replace(/\\/g, "/")}"`;
    mkdirSync(join(tempHome, ".claude", "instincts"), { recursive: true });
    writeFileSync(oldFile, "// pre-move session hook\n");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          SessionStart: [{ matcher: "", hooks: [{ type: "command", command: oldCommand }] }],
          SessionEnd: [{ matcher: "", hooks: [{ type: "command", command: oldCommand }] }],
        },
      }, null, 2) + "\n",
    );
    return { oldCommand, oldFile, settingsPath };
  }

  function sessionCommands(settingsPath: string, hookType: "SessionStart" | "SessionEnd"): string[] {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as TestSettings;
    return (settings.hooks?.[hookType] || [])
      .flatMap((entry) => entry.hooks || [])
      .map((hook) => hook.command ?? "");
  }

  it("install replaces the old row with the new location and removes the old file", () => {
    const tempHome = join(tmpdir(), `ci-test-session-move-${process.pid}-${Date.now()}`);
    try {
      const { oldCommand, oldFile, settingsPath } = seedOldLayout(tempHome);
      const newFile = join(tempHome, ".claude", "instincts", "hooks", "session.mjs");
      const newCommand = `node "${newFile.replace(/\\/g, "/")}"`;

      for (let run = 0; run < 2; run += 1) {
        execFileSync("node", [INSTALL_SCRIPT, "install", "--mode", "expert"], {
          env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome, CLAUDE_CI_UPDATE_CHECK: "off" },
          encoding: "utf8",
        });
        for (const hookType of ["SessionStart", "SessionEnd"] as const) {
          const commands = sessionCommands(settingsPath, hookType);
          assert.equal(commands.filter((command) => command === newCommand).length, 1, `${hookType} run ${run}`);
          assert.equal(commands.includes(oldCommand), false, `${hookType} must drop the old row`);
        }
        assert.ok(existsSync(newFile), "session.mjs should be installed at instincts/hooks");
        assert.equal(existsSync(oldFile), false, "the old instincts/session.mjs should be removed");
      }
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it("uninstall removes an old-location row and file without a reinstall first", () => {
    const tempHome = join(tmpdir(), `ci-test-session-move-uninstall-${process.pid}-${Date.now()}`);
    try {
      const { oldFile, settingsPath } = seedOldLayout(tempHome);
      execFileSync("node", [INSTALL_SCRIPT, "--uninstall"], {
        env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome, CLAUDE_CI_UPDATE_CHECK: "off" },
        encoding: "utf8",
      });
      for (const hookType of ["SessionStart", "SessionEnd"] as const) {
        assert.deepEqual(sessionCommands(settingsPath, hookType), []);
      }
      assert.equal(existsSync(oldFile), false);
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });
});

describe("installer - lifecycle mode transitions", () => {
  it("migrates legacy expert hooks through beginner reinstalls and uninstalls cleanly", () => {
    const tempHome = join(tmpdir(), `ci-test-lifecycle-transition-${Date.now()}`);
    const settingsPath = join(tempHome, ".claude", "settings.json");
    const legacyForward = `bash "${join(tempHome, ".claude", "instincts", "session.sh").replace(/\\/g, "/")}"`;
    const legacyBackslash = 'bash "C:\\Users\\naim\\.claude\\instincts\\session.sh"';
    mkdirSync(join(tempHome, ".claude"), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          SessionStart: [{ matcher: "", hooks: [{ type: "command", command: legacyForward }] }],
          SessionEnd: [{ matcher: "", hooks: [{ type: "command", command: legacyBackslash }] }],
        },
      }, null, 2) + "\n",
    );

    try {
      for (let run = 0; run < 2; run += 1) {
        execFileSync("node", [INSTALL_SCRIPT, "install"], {
          env: { ...process.env, HOME: tempHome },
          encoding: "utf8",
        });
        const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as TestSettings;
        const expected = `node "${join(tempHome, ".claude", "instincts", "hooks", "session.mjs").replace(/\\/g, "/")}"`;
        for (const hookType of ["SessionStart", "SessionEnd"] as const) {
          const commands = (settings.hooks?.[hookType] || [])
            .flatMap((entry) => entry.hooks || [])
            .map((hook) => hook.command);
          assert.equal(commands.filter((command) => command === expected).length, 1);
          assert.ok(commands.every((command) => !command?.includes("session.sh")));
        }
        assert.ok(existsSync(join(tempHome, ".claude", "instincts", "hooks", "session.mjs")));
      }

      execFileSync("node", [INSTALL_SCRIPT, "--uninstall"], {
        env: { ...process.env, HOME: tempHome },
        encoding: "utf8",
      });
      const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as TestSettings;
      for (const hookType of ["SessionStart", "SessionEnd"] as const) {
        const commands = (settings.hooks?.[hookType] || [])
          .flatMap((entry) => entry.hooks || [])
          .map((hook) => hook.command ?? "");
        assert.ok(commands.every((command) => !/(?:session\.sh|session\.mjs)/.test(command)));
      }
      assert.equal(existsSync(join(tempHome, ".claude", "instincts", "hooks", "session.mjs")), false);
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
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
    writeFileSync(
      join(tempHome, ".claude", "settings.json"),
      JSON.stringify(seed, null, 2) + "\n",
    );

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
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as TestSettings;
    const hasForeign = (settings.hooks?.PreToolUse || []).some(
      (entry) =>
        Array.isArray(entry.hooks) &&
        entry.hooks.some((hook) => hook.command?.includes("foreign-pre"))
    );
    assert.ok(hasForeign, "Foreign PreToolUse hook should survive install");
  });

  it("preserves non-hook settings keys", () => {
    const settingsPath = join(tempHome, ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as TestSettings;
    assert.equal(settings.theme, "dark", "Foreign settings keys must not be clobbered");
  });

  it("preserves the foreign hook through uninstall", () => {
    execFileSync("node", [INSTALL_SCRIPT, "--uninstall"], {
      env: { ...process.env, HOME: tempHome },
      encoding: "utf8",
    });

    const settingsPath = join(tempHome, ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as TestSettings;
    const hasForeign = (settings.hooks?.PreToolUse || []).some(
      (entry) =>
        Array.isArray(entry.hooks) &&
        entry.hooks.some((hook) => hook.command?.includes("foreign-pre"))
    );
    assert.ok(hasForeign, "Foreign PreToolUse hook must NOT be removed by uninstall");

    const hasObserve = (settings.hooks?.PreToolUse || []).some(
      (entry) =>
        Array.isArray(entry.hooks) &&
        entry.hooks.some((hook) => /(?:observe\.sh|bin\/observe\.mjs)/.test(hook.command ?? ""))
    );
    assert.ok(!hasObserve, "installer-owned observer hooks should still be removed");
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
    writeFileSync(
      join(tempHome, ".claude", "settings.json"),
      JSON.stringify(seed, null, 2) + "\n",
    );

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
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as TestSettings;
    const observeCommand = `node "${join(tempHome, ".claude", "instincts", "bin", "observe.mjs").replace(/\\/g, "/")}"`;
    const sessionCommand = `node "${join(tempHome, ".claude", "instincts", "hooks", "session.mjs").replace(/\\/g, "/")}"`;

    const preToolCommands = (settings.hooks?.PreToolUse || [])
      .flatMap((entry) => entry.hooks || [])
      .map((hook) => hook.command)
      .filter((command): command is string => Boolean(command));
    const sessionStartCommands = (settings.hooks?.SessionStart || [])
      .flatMap((entry) => entry.hooks || [])
      .map((hook) => hook.command)
      .filter((command): command is string => Boolean(command));

    assert.equal(
      preToolCommands.filter((command) => command === observeCommand).length,
      1,
      "real Node observer hook should be installed exactly once",
    );
    assert.equal(
      sessionStartCommands.filter((command) => command === sessionCommand).length,
      1,
      "real Node session hook should be installed exactly once",
    );
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
    writeFileSync(
      join(tempHome, ".claude", "settings.json"),
      JSON.stringify(seed, null, 2) + "\n",
    );

    execFileSync("node", [INSTALL_SCRIPT, "install"], {
      env: { ...process.env, HOME: tempHome },
      encoding: "utf8",
    });
  });

  after(() => {
    rmSync(tempHome, { recursive: true, force: true });
  });

  it("migrates every legacy observe hook to one Node command", () => {
    const settingsPath = join(tempHome, ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as TestSettings;
    const preToolCommands = (settings.hooks?.PreToolUse || [])
      .flatMap((entry) => entry.hooks || [])
      .map((hook) => hook.command)
      .filter((command): command is string => Boolean(command));
    const nodeObserveCommand = `node "${join(tempHome, ".claude", "instincts", "bin", "observe.mjs").replace(/\\/g, "/")}"`;

    assert.equal(
      preToolCommands.filter((command) => command === nodeObserveCommand).length,
      1,
      "Node observer hook should exist exactly once",
    );
    assert.equal(
      preToolCommands.filter((command) => command.includes("observe.sh")).length,
      0,
      "all legacy observe hooks should be removed",
    );
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
    writeFileSync(
      join(tempHome, ".claude", "settings.json"),
      JSON.stringify(seed, null, 2) + "\n",
    );

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
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as TestSettings;
    const allCommands = (settings.hooks?.PreToolUse || [])
      .flatMap((entry) => entry.hooks || [])
      .map((hook) => hook.command)
      .filter((command): command is string => Boolean(command));

    assert.ok(
      allCommands.some((command) => command === "echo mixed-foreign-pre"),
      "Foreign command must survive even when it shares an entry with a broken observe hook",
    );
    assert.ok(
      !allCommands.some(
        (command) => command.includes("observe.sh") && command.includes("\\"),
      ),
      "Broken backslash-laden observe.sh hook must be removed",
    );
    assert.ok(
      allCommands.some((command) => command.includes("bin/observe.mjs")),
      "A fresh Node observer hook must be installed",
    );
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

    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as TestSettings;
    const allCommands = (settings.hooks?.PreToolUse || [])
      .flatMap((entry) => entry.hooks || [])
      .map((hook) => hook.command)
      .filter((command): command is string => Boolean(command));

    assert.ok(
      allCommands.some((command) => command === "echo mixed-foreign-pre"),
      "Foreign command must survive --uninstall when it shares an entry with a broken observe hook",
    );
    assert.ok(
      !allCommands.some((command) => command.includes("observe.sh")),
      "Broken observe.sh hook sharing the entry must be removed by --uninstall",
    );
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

    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      hooks?: { PreToolUse?: Array<{ hooks?: HookCommand[] } | null> };
    };
    const entries = settings.hooks?.PreToolUse || [];

    assert.ok(entries.some((entry) => entry === null), "null hook row should be preserved");
    assert.ok(
      entries.some((entry) => entry && entry.hooks === null),
      "rows with hooks:null should be preserved",
    );
    assert.ok(
      entries.some((entry) => {
        if (!entry || !Array.isArray(entry.hooks)) return false;
        return entry.hooks.some((hook) => hook.command === undefined) && entry.hooks.length === 1;
      }),
      "rows with malformed hook objects should be preserved",
    );
    assert.ok(
      !entries.some((entry) => Array.isArray(entry?.hooks) && entry.hooks.length === 0),
      "empty hook rows should not remain after filtering",
    );
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
      const yamlFiles = readdirSync(join(instinctsRoot, dir)).filter((file) =>
        file.endsWith(".yaml"),
      );
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
    } finally {
      rmSync(cleanHome, { recursive: true, force: true });
    }
  });
});
