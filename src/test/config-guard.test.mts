/**
 * Tests for the config-guard PreToolUse hook: a mutation of the files that
 * wire the guardrails (`.claude/settings*.json`, `.mcp.json`, `hooks.json`,
 * `.claude/hooks/`, `.claude/plugins/`, `.claude-plugin/`) is warned about by
 * default and denied under CI_CONFIG_GUARD=block. Ported as an idea from
 * karanb192/claude-code-hooks `config-guard` (MIT); the code is ours.
 *
 * RED first: neither lib/config-guard-gate.mjs nor hooks/config-guard.mjs exists.
 * Pure logic is importable here; the runtime hook is exercised by spawning the
 * built hooks/config-guard.mjs over stdin, mirroring hook-pack.test.mts.
 *
 * Plan: docs/plans/2026-09-06-lovable-site-repo.md (cherry-pick #1)
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { classifyMutation, decide, matchProtectedPath, parseMode } from "../lib/config-guard-gate.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const HOOK_PATH = join(REPO_ROOT, "hooks", "config-guard.mjs");

interface HookResult {
  decision: "allow" | "block";
  reason?: string;
  stderr: string;
}

function runHook(
  toolName: string,
  toolInput: Record<string, unknown>,
  env: Record<string, string | undefined>,
): HookResult {
  const payload = JSON.stringify({ tool_name: toolName, tool_input: toolInput });
  const fullEnv: NodeJS.ProcessEnv = { ...process.env };
  delete fullEnv.CI_CONFIG_GUARD;
  delete fullEnv.CI_CONFIG_GUARD_ALLOW;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete fullEnv[k];
    else fullEnv[k] = v;
  }
  const result = spawnSync(process.execPath, [HOOK_PATH], { input: payload, encoding: "utf8", env: fullEnv });
  assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
  const stdout = result.stdout.trim();
  if (stdout === "") return { decision: "allow", stderr: result.stderr };
  const parsed = JSON.parse(stdout) as {
    hookSpecificOutput?: { hookEventName?: string; permissionDecision?: string; permissionDecisionReason?: string };
  };
  const out = parsed.hookSpecificOutput;
  assert.equal(out?.hookEventName, "PreToolUse");
  assert.equal(out?.permissionDecision, "deny");
  return { decision: "block", reason: out?.permissionDecisionReason, stderr: result.stderr };
}

describe("config-guard-gate: parseMode", () => {
  it("defaults to warn when unset, empty, or unrecognized", () => {
    assert.equal(parseMode(undefined), "warn");
    assert.equal(parseMode(""), "warn");
    assert.equal(parseMode("nonsense"), "warn");
  });
  it("recognizes warn/block/off case-insensitively", () => {
    assert.equal(parseMode("BLOCK"), "block");
    assert.equal(parseMode(" off "), "off");
    assert.equal(parseMode("Warn"), "warn");
  });
});

describe("config-guard-gate: matchProtectedPath", () => {
  const protectedPaths = [
    ".claude/settings.json",
    ".claude/settings.local.json",
    "C:\\Users\\me\\.claude\\settings.json",
    "/home/me/.claude/settings.local.json",
    ".mcp.json",
    "D:/proj/.mcp.json",
    "plugins/continuous-improvement/hooks/hooks.json",
    "~/.claude/hooks/shell-guard.js",
    "C:/Users/me/.claude/plugins/installed_plugins.json",
    "/home/me/.claude/plugins/cache/mp/ci/3.23.0/hooks/gateguard.mjs",
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    // A protected directory named without a trailing slash is the directory
    // itself: removing or renaming it takes every file in it along.
    ".claude/hooks",
    "C:\\Users\\me\\.claude\\plugins",
    "repo/.claude-plugin",
  ];
  for (const p of protectedPaths) {
    it(`protects ${p}`, () => {
      assert.notEqual(matchProtectedPath(p), null, `expected a pattern for ${p}`);
    });
  }

  const openPaths = [
    "src/hooks/gateguard.mts",
    "README.md",
    ".claude/CLAUDE.md",
    "config/settings.json",
    "docs/settings.local.json",
    "hooks.json.md",
    "src/lib/config-guard-gate.mts",
    "src/hooks",
    "docs/plugins",
    ".claude/hooks-notes.md",
    "",
  ];
  for (const p of openPaths) {
    it(`leaves ${p || "<empty>"} alone`, () => {
      assert.equal(matchProtectedPath(p), null);
    });
  }
});

describe("config-guard-gate: classifyMutation", () => {
  it("flags Edit/Write/MultiEdit/NotebookEdit on a protected path", () => {
    assert.equal(classifyMutation("Edit", { file_path: ".claude/settings.json" })?.via, "file");
    assert.equal(classifyMutation("Write", { file_path: "D:/proj/.mcp.json" })?.via, "file");
    assert.equal(
      classifyMutation("MultiEdit", { edits: [{ file_path: "README.md" }, { file_path: ".claude/settings.local.json" }] })?.target,
      ".claude/settings.local.json",
    );
    assert.equal(classifyMutation("NotebookEdit", { notebook_path: ".claude/settings.json" })?.via, "file");
  });

  it("never flags read-only tools", () => {
    assert.equal(classifyMutation("Read", { file_path: ".claude/settings.json" }), null);
    assert.equal(classifyMutation("Grep", { pattern: "hooks", path: ".claude/settings.json" }), null);
    assert.equal(classifyMutation("Glob", { pattern: ".claude/**" }), null);
  });

  it("flags Bash mutations that target a protected path", () => {
    const hits: Array<[string, string]> = [
      ["echo '{}' > ~/.claude/settings.json", "bash"],
      ["printf x >> .claude/settings.local.json", "bash"],
      ["cat new.json | tee .mcp.json", "bash"],
      ["sed -i 's/a/b/' .mcp.json", "bash"],
      ["rm .claude/settings.json", "bash"],
      ["mv other.json ~/.claude/settings.json", "bash"],
      ["cp fresh.json plugins/ci/hooks/hooks.json", "bash"],
      ["Set-Content -Path .claude/settings.json -Value '{}'", "bash"],
      ["node -e \"require('fs').writeFileSync('.claude/settings.json','{}')\"", "bash"],
      ["claude plugin uninstall continuous-improvement", "claude-cli"],
      ["claude mcp remove context7", "claude-cli"],
      ["claude config set model opus", "claude-cli"],
    ];
    for (const [command, via] of hits) {
      const hit = classifyMutation("Bash", { command });
      assert.notEqual(hit, null, `expected a hit for: ${command}`);
      assert.equal(hit?.via, via, command);
    }
  });

  it("allows Bash that only reads a protected path, or writes elsewhere", () => {
    const allowed = [
      "cat ~/.claude/settings.json",
      "grep -n hooks .claude/settings.json",
      "node hooks/gateguard.mjs < payload.json",
      "cp .claude/settings.json backup/settings.json",
      "echo x > notes/settings.md",
      "npm run build",
      "git status",
      "claude --version",
      "claude plugin list",
      "",
    ];
    for (const command of allowed) {
      assert.equal(classifyMutation("Bash", { command }), null, `expected allow for: ${command}`);
    }
  });

  // Claude Code on Windows exposes a first-class PowerShell tool whose input
  // is the same { command } shape as Bash, so the same command must classify
  // the same under either tool name.
  it("flags a PowerShell-tool mutation exactly like the Bash-tool form", () => {
    const hits: Array<[string, string]> = [
      ["Set-Content -Path .claude/settings.json -Value '{}'", "bash"],
      ["Set-Content -Path C:\\Users\\me\\.claude\\settings.json -Value '{}'", "bash"],
      ["'{}' | Out-File .claude/settings.local.json", "bash"],
      ["Add-Content .mcp.json 'x'", "bash"],
      ["Remove-Item .mcp.json", "bash"],
      ["Copy-Item fresh.json plugins/ci/hooks/hooks.json", "bash"],
      ["echo '{}' > ~/.claude/settings.json", "bash"],
      ["claude plugin uninstall continuous-improvement", "claude-cli"],
    ];
    for (const [command, via] of hits) {
      const viaBash = classifyMutation("Bash", { command });
      assert.equal(viaBash?.via, via, `control (Bash) should hit for: ${command}`);
      assert.deepEqual(classifyMutation("PowerShell", { command }), viaBash, `PowerShell should hit for: ${command}`);
    }
  });

  it("allows a PowerShell-tool command that only reads a protected path, or writes elsewhere", () => {
    const allowed = [
      "Get-Content .claude/settings.json",
      "Get-ChildItem .claude/hooks/",
      "Copy-Item .claude/settings.json backup/settings.json",
      "Set-Content -Path notes/settings.md -Value x",
      "git status",
      "",
    ];
    for (const command of allowed) {
      assert.equal(classifyMutation("PowerShell", { command }), null, `expected allow for: ${command}`);
    }
  });

  // The first PowerShell pass only knew six full cmdlet names with a positional
  // destination. PowerShell writes a file through aliases, New-Item -Force
  // (which truncates), a rename or move of the protected file itself, a named
  // or colon-bound parameter, a .NET file API, and inside a script block.
  const powershellNativeWrites: ReadonlyArray<string> = [
    // aliases of Set-Content, Add-Content, Clear-Content, Remove-Item, New-Item
    "sc .claude/settings.json '{}'",
    "'{}' | sc .claude\\settings.json",
    "ac .claude\\settings.json 'x'",
    "clc .claude\\settings.json",
    "ri .mcp.json",
    "erase .claude\\settings.json",
    "New-Item -ItemType File -Force .claude/settings.json",
    "ni -Force -ItemType File .claude\\settings.json",
    "$null = New-Item -ItemType File -Force .claude/settings.json",
    "Export-Clixml .claude/settings.json",
    // the protected file is the source of a rename or move
    "Rename-Item .claude/settings.json settings.bak",
    "ren .claude\\settings.json settings.bak",
    "Move-Item .claude/settings.json backup/",
    "Move-Item .claude\\settings.json $env:TEMP\\s.json",
    "mv .claude/settings.json backup/",
    // copy aliases, and a destination named instead of last
    "copy evil.json .claude\\settings.json",
    "cpi evil.json .claude\\settings.json",
    "Copy-Item -Destination .claude/settings.json -Path fresh.json",
    "Copy-Item -Destination:.claude/settings.json -Path:fresh.json",
    // a colon-bound parameter
    "Set-Content -Path:'.claude/settings.json' -Value '{}'",
    "Set-Content -Path:.claude\\settings.json -Value '{}'",
    // .NET file APIs
    "[System.IO.File]::WriteAllText(\"$HOME\\.claude\\settings.json\", '{}')",
    "[IO.File]::WriteAllText('.claude/settings.json', '{}')",
    "[IO.File]::WriteAllText(\"$PWD\\.claude\\settings.json\", '{}')",
    "[IO.File]::AppendAllText('.mcp.json', 'x')",
    "[IO.File]::Delete('.mcp.json')",
    // the Windows PowerShell 5.1 form of `A && B`
    "if ($?) { Copy-Item fresh.json .claude/settings.json }",
    // a protected directory itself, not a file inside it
    "Remove-Item .claude\\hooks -Recurse",
    "Remove-Item $env:USERPROFILE\\.claude\\plugins -Recurse -Force",
    "rd .claude-plugin",
  ];
  for (const command of powershellNativeWrites) {
    it(`flags the PowerShell write: ${command}`, () => {
      const hit = classifyMutation("PowerShell", { command });
      assert.notEqual(hit, null, `expected a hit for: ${command}`);
      assert.equal(hit?.via, "bash");
    });
  }

  const powershellNativeReads: ReadonlyArray<string> = [
    "Copy-Item -Path .claude/settings.json -Destination backup/settings.json",
    "Copy-Item -Destination backup/settings.json -Path .claude/settings.json",
    "cpi .claude\\settings.json backup\\settings.json",
    "Get-Content .claude/settings.json | Select-String hooks",
    "Test-Path .claude/hooks",
    "Get-ChildItem .claude\\plugins",
    "[IO.File]::ReadAllText('.claude/settings.json')",
    "if (Test-Path .claude/settings.json) { Get-Content .claude/settings.json }",
    "New-Item -ItemType Directory out",
    "Rename-Item notes.md notes.bak",
    "sc notes/settings.md 'x'",
  ];
  for (const command of powershellNativeReads) {
    it(`allows the PowerShell read or unrelated write: ${command}`, () => {
      assert.equal(classifyMutation("PowerShell", { command }), null);
    });
  }
});

describe("config-guard-gate: decide", () => {
  it("off allows everything", () => {
    assert.equal(decide("off", true, "r").action, "allow");
  });
  it("warn warns on a hit, allows otherwise", () => {
    assert.equal(decide("warn", true, "r").action, "warn");
    assert.equal(decide("warn", false, "r").action, "allow");
  });
  it("block denies a hit, allows otherwise", () => {
    assert.equal(decide("block", true, "r").action, "block");
    assert.equal(decide("block", false, "r").action, "allow");
  });
});

describe("hooks/config-guard.mjs (runtime PreToolUse hook)", () => {
  it("is present in the repo", () => {
    assert.ok(existsSync(HOOK_PATH), `expected ${HOOK_PATH} to exist`);
  });

  it("denies an Edit of .claude/settings.json in block mode, naming the bypass", () => {
    const r = runHook("Edit", { file_path: ".claude/settings.json", old_string: "a", new_string: "b" }, { CI_CONFIG_GUARD: "block" });
    assert.equal(r.decision, "block");
    assert.match(r.reason ?? "", /config-guard/);
    assert.match(r.reason ?? "", /CI_CONFIG_GUARD_ALLOW=true/);
  });

  it("warns (never blocks) by default", () => {
    const r = runHook("Write", { file_path: ".mcp.json", content: "{}" }, {});
    assert.equal(r.decision, "allow");
    assert.match(r.stderr, /config-guard/);
  });

  it("is a no-op in off mode", () => {
    const r = runHook("Write", { file_path: ".mcp.json", content: "{}" }, { CI_CONFIG_GUARD: "off" });
    assert.equal(r.decision, "allow");
    assert.doesNotMatch(r.stderr, /config-guard/);
  });

  it("CI_CONFIG_GUARD_ALLOW=true lets one call through block mode and says so", () => {
    const r = runHook(
      "Edit",
      { file_path: ".claude/settings.json", old_string: "a", new_string: "b" },
      { CI_CONFIG_GUARD: "block", CI_CONFIG_GUARD_ALLOW: "true" },
    );
    assert.equal(r.decision, "allow");
    assert.match(r.stderr, /CI_CONFIG_GUARD_ALLOW/);
  });

  it("denies a Bash redirect into .mcp.json in block mode", () => {
    const r = runHook("Bash", { command: "printf '{}' > .mcp.json" }, { CI_CONFIG_GUARD: "block" });
    assert.equal(r.decision, "block");
  });

  it("allows a Bash read of a protected file in block mode", () => {
    const r = runHook("Bash", { command: "cat .claude/settings.json" }, { CI_CONFIG_GUARD: "block" });
    assert.equal(r.decision, "allow");
    assert.equal(r.stderr, "");
  });

  // The same shell edit through either shell tool: the Bash rows are the
  // control, the PowerShell rows are the defect (they were allowed).
  const shellEdits: ReadonlyArray<string> = [
    "Set-Content -Path .claude/settings.json -Value '{}'",
    "printf '{}' > .mcp.json",
    "claude mcp remove context7",
  ];
  for (const tool of ["Bash", "PowerShell"]) {
    for (const command of shellEdits) {
      it(`${tool} in block mode: denies ${command}`, () => {
        const r = runHook(tool, { command }, { CI_CONFIG_GUARD: "block" });
        assert.equal(r.decision, "block");
        assert.match(r.reason ?? "", /config-guard/);
      });
    }

    it(`${tool} in warn mode: a shell edit of .claude/settings.json is allowed with a stderr notice`, () => {
      const r = runHook(tool, { command: shellEdits[0]! }, {});
      assert.equal(r.decision, "allow");
      assert.ok(
        r.stderr.includes(`config-guard: ${tool} would modify .claude/settings.json`),
        `expected a warning naming ${tool}, got: ${r.stderr}`,
      );
    });
  }

  it("allows a PowerShell read of a protected file in block mode", () => {
    const r = runHook("PowerShell", { command: "Get-Content .claude/settings.json" }, { CI_CONFIG_GUARD: "block" });
    assert.equal(r.decision, "allow");
    assert.equal(r.stderr, "");
  });

  // PowerShell-native spellings of the same write, through the spawned hook.
  const powershellNativeEdits: ReadonlyArray<string> = [
    "sc .claude/settings.json '{}'",
    "New-Item -ItemType File -Force .claude/settings.json",
    "Rename-Item .claude/settings.json settings.bak",
    "Copy-Item -Destination .claude/settings.json -Path fresh.json",
    "Set-Content -Path:'.claude/settings.json' -Value '{}'",
    "[IO.File]::WriteAllText('.claude/settings.json', '{}')",
    "if ($?) { Copy-Item fresh.json .claude/settings.json }",
    "Remove-Item .claude\\hooks -Recurse",
  ];
  for (const command of powershellNativeEdits) {
    it(`PowerShell in block mode: denies ${command}`, () => {
      const r = runHook("PowerShell", { command }, { CI_CONFIG_GUARD: "block" });
      assert.equal(r.decision, "block");
      assert.match(r.reason ?? "", /config-guard/);
    });
  }

  it("allows a PowerShell copy of a protected file to a backup in block mode", () => {
    const r = runHook(
      "PowerShell",
      { command: "Copy-Item -Destination backup/settings.json -Path .claude/settings.json" },
      { CI_CONFIG_GUARD: "block" },
    );
    assert.equal(r.decision, "allow");
    assert.equal(r.stderr, "");
  });

  it("ignores unrelated tools and paths", () => {
    assert.equal(runHook("Read", { file_path: ".claude/settings.json" }, { CI_CONFIG_GUARD: "block" }).decision, "allow");
    assert.equal(runHook("Edit", { file_path: "src/index.ts", old_string: "a", new_string: "b" }, { CI_CONFIG_GUARD: "block" }).decision, "allow");
  });

  it("fails open on malformed stdin", () => {
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: "not json",
      encoding: "utf8",
      env: { ...process.env, CI_CONFIG_GUARD: "block" },
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "");
  });
});
