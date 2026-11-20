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

// 655bd96 made a protected directory match by its bare name, which is right for
// a delete or a rename, but the same match fed the generic scan, whose write
// indicator was any `>`. A read of the directory with `2>/dev/null` became a
// write. A redirect to another descriptor or to the null device writes no file.
describe("config-guard-gate: a read with an fd redirect is a read", () => {
  const reads: ReadonlyArray<[string, string]> = [
    ["Bash", "ls -la ~/.claude/plugins 2>/dev/null"],
    ["Bash", "ls .claude/hooks 2>/dev/null"],
    ["Bash", "ls -la .claude-plugin 2>&1"],
    ["Bash", "ls ~/.claude/plugins/ 2>/dev/null"],
    ["Bash", "ls -d .claude/hooks .claude/plugins 2>/dev/null"],
    ["Bash", "find ~/.claude/plugins -name '*.json' 2>/dev/null"],
    ["Bash", "du -sh ~/.claude/plugins 2>/dev/null"],
    ["Bash", "git status --short .claude-plugin 2>&1"],
    ["Bash", "git diff --stat -- .claude-plugin plugins 2>&1"],
    ["Bash", "git -C ~/.claude/plugins status 2>&1"],
    ["Bash", "stat .claude-plugin >/dev/null 2>&1 && echo ok"],
    ["Bash", "test -d .claude/hooks &>/dev/null && echo yes"],
    ["Bash", "mkdir -p .claude/hooks 2>/dev/null"],
    ["Bash", "tar -czf backup.tgz .claude/hooks > /dev/null"],
    ["Bash", 'echo "$(ls .claude/hooks)" > /tmp/hooks-list.txt'],
    ["Bash", "git diff --stat -- .claude-plugin plugins > /tmp/stat.txt"],
    // the same redirects after a read of a protected file
    ["Bash", "cat .claude/settings.json 2>/dev/null"],
    ["Bash", "cat .claude/settings.json 2>&1 | head"],
    ["Bash", "grep -c hooks .claude/settings.json 2>/dev/null"],
    ["Bash", "git add .claude-plugin/marketplace.json 2>&1"],
    ["Bash", "git diff --stat -- hooks/hooks.json 2>&1"],
    ["Bash", "cat hooks/hooks.json >&2"],
    ["PowerShell", "Get-ChildItem $HOME\\.claude\\plugins 2>$null"],
    ["PowerShell", "Get-ChildItem .claude\\hooks 2>$null"],
    ["PowerShell", "Get-Content .mcp.json 2>$null"],
    ["PowerShell", "Get-Content .claude\\settings.json -ErrorAction SilentlyContinue 2>$null"],
    ["PowerShell", "Test-Path .claude\\hooks *>$null"],
    ["PowerShell", "git status --short .claude-plugin 2>&1"],
    ["PowerShell", "Get-Item .claude-plugin 3>&1 2>&1 | Out-Null"],
    // creating the directory changes no file in it
    ["PowerShell", "New-Item -ItemType Directory -Force .claude\\hooks | Out-Null"],
  ];
  for (const [tool, command] of reads) {
    it(`${tool}: allows ${command}`, () => {
      assert.equal(classifyMutation(tool, { command }), null);
    });
  }

  const writes: ReadonlyArray<[string, string]> = [
    ["Bash", "echo '{}' > .mcp.json 2>&1"],
    ["Bash", "cat new.json > .claude/settings.json 2>/dev/null"],
    ["Bash", "echo x 2>&1 > .mcp.json"],
    ["Bash", "echo x &> .mcp.json"],
    ["Bash", "echo x &>> .claude/settings.json"],
    ["Bash", "echo x >> .claude/hooks/pre.sh 2>&1"],
    ["Bash", "tee .mcp.json < new.json > /dev/null"],
    ["Bash", "sed -i 's/block/off/' .claude/settings.json 2>/dev/null"],
    ["Bash", "rm -r .claude/plugins 2>/dev/null"],
    ["Bash", "rmdir .claude/hooks 2>&1"],
    ["Bash", "mv .claude/hooks .claude/hooks.off 2>/dev/null"],
    ["Bash", "mv notes.txt .claude/hooks"],
    ["Bash", "node -e \"require('fs').writeFileSync('.claude/settings.json','{}')\" 2>&1"],
    ["Bash", "node -e \"require('fs').rmSync('.claude/hooks',{recursive:true})\" 2>/dev/null"],
    ["PowerShell", "Remove-Item .claude\\hooks -Recurse -Force 2>$null"],
    ["PowerShell", "Remove-Item $env:USERPROFILE\\.claude\\plugins -Recurse *>$null"],
    ["PowerShell", "'{}' | Out-File .mcp.json 2>&1"],
    ["PowerShell", "'{}' > .claude\\settings.json 2>$null"],
    ["PowerShell", "'{}' *> .mcp.json"],
    ["PowerShell", "[IO.Directory]::Delete(\"$HOME\\.claude\\hooks\", $true) 2>$null"],
    ["PowerShell", "New-Item -ItemType File -Force .claude\\hooks\\pre.js 2>$null"],
  ];
  for (const [tool, command] of writes) {
    it(`${tool}: still flags ${command}`, () => {
      assert.notEqual(classifyMutation(tool, { command }), null);
    });
  }
});

// The destination of a copy was "the last operand", so whatever followed the
// destination took its place: a redirect, the value of a named parameter, the
// value of a colon-bound switch.
describe("config-guard-gate: a copy onto a protected file, whatever follows the destination", () => {
  const overwrites: ReadonlyArray<[string, string]> = [
    ["Bash", "cp new.json .claude/settings.json 2>&1"],
    ["Bash", "cp new.json .claude/settings.json 2>/dev/null"],
    ["Bash", "cp -f new.json ~/.claude/settings.json 2>&1 | tail -2"],
    ["Bash", "cp new.json .claude/settings.json > /dev/null"],
    ["Bash", "cp new.json .claude/settings.json -v"],
    ["Bash", "cp new.json .claude/settings.json --preserve mode"],
    ["Bash", "cp --preserve=mode new.json .claude/settings.json 2>&1"],
    ["Bash", "cp new.json -f .claude/settings.json"],
    ["Bash", "cp evil.js .claude/hooks 2>/dev/null"],
    ["Bash", "cp -t .claude/hooks evil.js"],
    ["Bash", "cp --target-directory=.claude/hooks evil.js other.js"],
    ["Bash", "cp a.json b.json > .mcp.json"],
    ["PowerShell", "Copy-Item new.json .claude\\settings.json -ErrorAction Stop"],
    ["PowerShell", "Copy-Item new.json .claude\\settings.json 2>&1"],
    ["PowerShell", "Copy-Item new.json .claude\\settings.json 2>$null"],
    ["PowerShell", "Copy-Item -Path new.json .claude\\settings.json -Encoding utf8"],
    ["PowerShell", "Copy-Item new.json .claude\\settings.json -Confirm:$false"],
    ["PowerShell", "Copy-Item new.json .claude\\settings.json -Force:$true"],
    ["PowerShell", "Copy-Item -ErrorAction Stop new.json .claude\\settings.json"],
    ["PowerShell", "Copy-Item new.json .claude\\settings.json -Force -PassThru | Out-Null"],
    ["PowerShell", "copy new.json .claude\\settings.json -Force 2>&1"],
    ["PowerShell", "cpi -Force new.json .mcp.json -ErrorAction SilentlyContinue"],
    ["PowerShell", "Copy-Item new.json -Destination .claude\\settings.json -ErrorAction Stop 2>&1"],
  ];
  for (const [tool, command] of overwrites) {
    it(`${tool}: flags ${command}`, () => {
      const hit = classifyMutation(tool, { command });
      assert.notEqual(hit, null);
      assert.equal(hit?.via, "bash");
    });
  }

  // The protected file is the source: a backup is a read, whatever follows.
  const backups: ReadonlyArray<[string, string]> = [
    ["Bash", "cp .claude/settings.json backup/ 2>&1"],
    ["Bash", "cp -p .claude/settings.json backup/ 2>/dev/null"],
    ["Bash", "cp .claude/settings.json .mcp.json backup/"],
    ["Bash", "cp -r .claude/hooks backup/hooks 2>/dev/null"],
    ["Bash", "cp .claude/settings.json /tmp/settings.backup.json -v"],
    ["Bash", "cp -t backup/ .claude/settings.json .mcp.json"],
    ["Bash", "cp --target-directory=backup .claude/settings.json"],
    ["Bash", "cp .claude/settings.json backup/ > /dev/null 2>&1"],
    ["PowerShell", "Copy-Item .claude\\settings.json backup\\ -ErrorAction Stop"],
    ["PowerShell", "Copy-Item .claude\\settings.json $env:TEMP\\settings.backup.json -Force"],
    ["PowerShell", "Copy-Item -ErrorAction Stop .claude\\settings.json backup\\"],
    ["PowerShell", "Copy-Item -Path .claude\\settings.json -Destination backup\\settings.json -Force 2>&1"],
    ["PowerShell", "Copy-Item .claude\\settings.json backup\\settings.json -Confirm:$false"],
    ["PowerShell", "Copy-Item -LiteralPath .claude\\settings.json backup\\ -Force:$true 2>$null"],
  ];
  for (const [tool, command] of backups) {
    it(`${tool}: allows ${command}`, () => {
      assert.equal(classifyMutation(tool, { command }), null);
    });
  }
});

// Join-Path is the idiomatic way to build a home-relative path in PowerShell.
// The operand was split at whitespace, so the path kept the `)` (and quote) of
// the expression it sat in and matched nothing; the writer branch then returned
// before any other scan.
describe("config-guard-gate: a write whose path is an expression", () => {
  const writes: ReadonlyArray<[string, string]> = [
    ["PowerShell", "Set-Content -Path (Join-Path $HOME '.claude\\settings.json') -Value $json"],
    ["PowerShell", "Set-Content (Join-Path $HOME '.claude\\settings.json') '{}'"],
    ["PowerShell", "Set-Content -Force (Join-Path $HOME '.claude\\settings.json') '{}'"],
    ["PowerShell", "$json | Out-File -FilePath (Join-Path $env:USERPROFILE '.claude\\settings.json') -Encoding utf8"],
    ["PowerShell", "Out-File -FilePath:(Join-Path $HOME '.claude\\settings.json') -InputObject $json"],
    ["PowerShell", "Set-Content -Path \"$(Join-Path $HOME '.claude\\settings.json')\" -Value $json"],
    ["PowerShell", "$json | Set-Content -Path (Resolve-Path .claude\\settings.json)"],
    ["PowerShell", "Set-Content -LiteralPath (Join-Path $HOME '.claude\\settings.json') -Value $x"],
    ["PowerShell", "Add-Content -LiteralPath \"$(Resolve-Path .mcp.json)\" -Value 'x'"],
    ["PowerShell", "Set-Content -Path (Join-Path (Join-Path $HOME '.claude') 'settings.json') -Value $json"],
    ["PowerShell", "Set-Content -Path ([IO.Path]::Combine($HOME, '.claude', 'settings.json')) -Value $json"],
    ["PowerShell", "Clear-Content (Join-Path $PWD '.mcp.json')"],
    ["PowerShell", "New-Item -ItemType File -Force -Path (Join-Path $HOME '.claude\\settings.json')"],
    ["PowerShell", "Remove-Item (Join-Path $HOME '.claude\\hooks') -Recurse"],
    ["PowerShell", "Remove-Item -Path (Join-Path $HOME '.claude\\settings.json') -Force"],
    ["PowerShell", "Copy-Item new.json (Join-Path $HOME '.claude\\settings.json') -Force"],
    ["PowerShell", "Copy-Item -Destination (Join-Path $HOME '.claude\\settings.json') -Path new.json"],
    ["PowerShell", "Move-Item (Join-Path $HOME '.claude\\settings.json') backup\\"],
    ["PowerShell", "Move-Item new.json (Join-Path $HOME '.claude\\settings.json') -Force"],
    ["PowerShell", "if ($?) { Set-Content -Path (Join-Path $HOME '.claude\\settings.json') -Value $json }"],
    ["Bash", 'tee "$(git rev-parse --show-toplevel)/.claude/settings.json" < new.json'],
    ["Bash", 'rm -f "$(git rev-parse --show-toplevel)/.mcp.json"'],
    ["Bash", 'cp new.json "$(git rev-parse --show-toplevel)/.claude/settings.json"'],
    ["Bash", 'mv "$(git rev-parse --show-toplevel)/.claude/settings.json" /tmp/'],
  ];
  for (const [tool, command] of writes) {
    it(`${tool}: flags ${command}`, () => {
      const hit = classifyMutation(tool, { command });
      assert.notEqual(hit, null);
      assert.equal(hit?.via, "bash");
    });
  }

  // The expression is a read, or it is the value that is written, not the
  // place it is written to.
  const reads: ReadonlyArray<[string, string]> = [
    ["PowerShell", "Get-Content (Join-Path $HOME '.claude\\settings.json') -Raw"],
    ["PowerShell", "$s = Get-Content (Join-Path $HOME '.claude\\settings.json') -Raw | ConvertFrom-Json"],
    ["PowerShell", "Test-Path (Join-Path $HOME '.claude\\hooks')"],
    ["PowerShell", "Copy-Item (Join-Path $HOME '.claude\\settings.json') backup\\settings.json"],
    ["PowerShell", "Copy-Item -Path (Join-Path $HOME '.claude\\settings.json') -Destination backup\\"],
    ["PowerShell", "Set-Content -Path out.txt -Value (Join-Path $HOME '.claude\\settings.json')"],
    ["PowerShell", "Set-Content out.txt (Join-Path $HOME '.claude\\settings.json')"],
    ["PowerShell", "Set-Content -Path out.txt (Join-Path $HOME '.claude\\settings.json')"],
    ["PowerShell", "Out-File -FilePath out.json -InputObject (Get-Content (Join-Path $HOME '.claude\\settings.json') -Raw)"],
    ["PowerShell", "Add-Content -Path log.txt -Value (Get-Date)"],
    ["PowerShell", "Set-Content -Path (Join-Path $out 'report.json') -Value $json"],
    ["PowerShell", "Remove-Item (Join-Path $env:TEMP 'scratch') -Recurse -Force"],
    ["Bash", 'cp "$(git rev-parse --show-toplevel)/.claude/settings.json" /tmp/settings.backup.json'],
    ["Bash", 'cat "$(git rev-parse --show-toplevel)/.claude/settings.json" | head'],
  ];
  for (const [tool, command] of reads) {
    it(`${tool}: allows ${command}`, () => {
      assert.equal(classifyMutation(tool, { command }), null);
    });
  }
});

// Two more ways a command names the file it writes without that file being a
// plain operand: New-Item splits it over -Path and -Name, and a download names
// it with its output option.
describe("config-guard-gate: a target named by New-Item -Path/-Name or by a download's output option", () => {
  const writes: ReadonlyArray<[string, string]> = [
    ["PowerShell", "New-Item -Path .claude -Name settings.json -ItemType File -Force"],
    ["PowerShell", "New-Item -ItemType File -Path $HOME\\.claude -Name settings.local.json"],
    ["PowerShell", "ni .claude -Name settings.json -Force"],
    ["PowerShell", "New-Item -Path . -Name .mcp.json -ItemType File"],
    ["PowerShell", "New-Item -Name hooks.json -Path plugins\\ci\\hooks -Force"],
    ["PowerShell", "New-Item -Path (Join-Path $HOME '.claude') -Name settings.json -ItemType File"],
    ["PowerShell", "Invoke-WebRequest $u -OutFile .mcp.json"],
    ["PowerShell", "iwr https://example.com/s.json -OutFile $HOME\\.claude\\settings.json"],
    ["PowerShell", "Invoke-RestMethod $u -OutFile:.mcp.json"],
    ["PowerShell", "Invoke-WebRequest -Uri $u -OutFile (Join-Path $HOME '.claude\\settings.json')"],
    ["Bash", "curl -o .mcp.json https://example.com/mcp.json"],
    ["Bash", "curl -sSL https://example.com/s.json --output ~/.claude/settings.json"],
    ["Bash", "wget -O .mcp.json https://example.com/mcp.json"],
    ["Bash", "wget -q --output-document=.claude/settings.json https://example.com/s.json"],
    // no output option: the redirect into a quoted path is still found by the
    // generic scan, as it is for any other command
    ["Bash", 'curl -s https://example.com/s.json > "my dir/.claude/settings.json"'],
    ["PowerShell", "(Invoke-WebRequest $u).Content | Set-Content .mcp.json"],
  ];
  for (const [tool, command] of writes) {
    it(`${tool}: flags ${command}`, () => {
      const hit = classifyMutation(tool, { command });
      assert.notEqual(hit, null);
      assert.equal(hit?.via, "bash");
    });
  }

  const elsewhere: ReadonlyArray<[string, string]> = [
    ["PowerShell", "New-Item -Path out -Name settings.json -ItemType File"],
    ["PowerShell", "New-Item -ItemType Directory -Path .claude -Name notes"],
    ["PowerShell", "New-Item -ItemType Directory -Path .claude -Name hooks"],
    ["PowerShell", "Invoke-WebRequest https://example.com/.mcp.json -OutFile downloaded.json"],
    ["PowerShell", "(Invoke-WebRequest https://example.com/hooks.json).Content | ConvertFrom-Json"],
    ["Bash", "curl -s https://raw.githubusercontent.com/o/r/main/.mcp.json -o /tmp/mcp.json"],
    ["Bash", "curl -s https://example.com/hooks.json | head"],
  ];
  for (const [tool, command] of elsewhere) {
    it(`${tool}: allows ${command}`, () => {
      assert.equal(classifyMutation(tool, { command }), null);
    });
  }
});

// The guard runs on every shell call, some of which carry a whole file in a
// heredoc or a quoted argument. No pattern in it may rescan the rest of a long
// run without spaces from every character: each of these is read in one pass.
describe("config-guard-gate: classification time on a long run without spaces", () => {
  const inputs: ReadonlyArray<[string, string]> = [
    ["parentheses", "(a".repeat(100_000)],
    ["separators", "a;b|c&".repeat(34_000)],
    ["redirect signs", ">a".repeat(100_000)],
    ["digits before a redirect", `${"7".repeat(200_000)}>out.txt`],
    ["protected directory names", ".claude/".repeat(25_000)],
    ["assignments", "a=b,".repeat(50_000)],
    ["quotes", "'a".repeat(100_000)],
    ["a path", "/usr/local/".repeat(18_000)],
  ];
  const shapes: ReadonlyArray<[string, (blob: string) => string]> = [
    ["as one token", (blob) => blob],
    ["as the value of a write", (blob) => `Set-Content -Path out.txt -Value '${blob}'`],
    ["after a copy", (blob) => `cp a.txt b.txt ${blob}`],
  ];
  for (const [name, blob] of inputs) {
    for (const [shape, wrap] of shapes) {
      it(`reads 200 KB of ${name} ${shape} in under a second`, () => {
        const command = wrap(blob);
        const started = performance.now();
        classifyMutation("Bash", { command });
        classifyMutation("PowerShell", { command });
        const elapsed = performance.now() - started;
        assert.ok(elapsed < 1000, `took ${elapsed.toFixed(0)} ms for ${command.length} chars`);
      });
    }
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

  // The settings path built with Join-Path, the PowerShell idiom.
  it("PowerShell in block mode: denies a write to a path built with Join-Path, and allows the read", () => {
    const joined = "(Join-Path $HOME '.claude\\settings.json')";
    for (const command of [
      `Set-Content -Path ${joined} -Value $json`,
      `$json | Out-File -FilePath ${joined} -Encoding utf8`,
      `Copy-Item new.json ${joined} -Force`,
    ]) {
      const r = runHook("PowerShell", { command }, { CI_CONFIG_GUARD: "block" });
      assert.equal(r.decision, "block", command);
      assert.match(r.reason ?? "", /config-guard/);
    }
    const read = runHook("PowerShell", { command: `Get-Content ${joined} -Raw` }, { CI_CONFIG_GUARD: "block" });
    assert.equal(read.decision, "allow");
    assert.equal(read.stderr, "");
  });

  // A copy onto the settings file with something after the destination.
  const trailingCopies: ReadonlyArray<[string, string]> = [
    ["Bash", "cp new.json .claude/settings.json 2>&1"],
    ["PowerShell", "Copy-Item new.json .claude\\settings.json -ErrorAction Stop"],
    ["PowerShell", "Copy-Item new.json .claude\\settings.json -Confirm:$false"],
  ];
  for (const [tool, command] of trailingCopies) {
    it(`${tool} in block mode: denies ${command}`, () => {
      const r = runHook(tool, { command }, { CI_CONFIG_GUARD: "block" });
      assert.equal(r.decision, "block");
      assert.match(r.reason ?? "", /config-guard/);
    });
  }

  it("allows a backup copy that ends in a redirect in block mode", () => {
    const r = runHook("Bash", { command: "cp .claude/settings.json backup/ 2>&1" }, { CI_CONFIG_GUARD: "block" });
    assert.equal(r.decision, "allow");
    assert.equal(r.stderr, "");
  });

  // A read of a protected directory or file that silences stderr.
  const silencedReads: ReadonlyArray<[string, string]> = [
    ["Bash", "ls -la ~/.claude/plugins 2>/dev/null"],
    ["Bash", "git status --short .claude-plugin 2>&1"],
    ["Bash", "cat .claude/settings.json 2>/dev/null"],
    ["PowerShell", "Get-ChildItem $HOME\\.claude\\plugins 2>$null"],
  ];
  for (const [tool, command] of silencedReads) {
    it(`${tool}: ${command} is allowed in block mode and prints nothing in warn mode`, () => {
      const blocked = runHook(tool, { command }, { CI_CONFIG_GUARD: "block" });
      assert.equal(blocked.decision, "allow", blocked.reason ?? "");
      assert.equal(runHook(tool, { command }, {}).stderr, "");
    });
  }

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
