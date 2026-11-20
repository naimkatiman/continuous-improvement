import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { hashProjectRoot } from "../lib/gateguard-state.mjs";
import { getPluginHooksConfig } from "../lib/plugin-metadata.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SESSION_HOOK = join(REPO_ROOT, "hooks", "session.mjs");

type LifecycleEvent = "PostToolUse" | "SessionStart" | "SessionEnd";

function commandsFor(event: LifecycleEvent): string[] {
  const entries = getPluginHooksConfig().hooks[event] ?? [];
  return entries.flatMap((entry) => entry.hooks.map((hook) => hook.command));
}

function runSession(input: string, home: string, projectRoot: string) {
  const result = spawnSync(process.execPath, [SESSION_HOOK], {
    input,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      CLAUDE_PROJECT_DIR: projectRoot,
    },
    timeout: 5000,
  });
  if (result.error) throw result.error;
  return result;
}

describe("plugin-managed hook runtime portability", () => {
  it("emits only the hooks key accepted by every supported host", () => {
    assert.deepEqual(Object.keys(getPluginHooksConfig()), ["hooks"]);
  });

  it("uses Node for observation and session lifecycle hooks", () => {
    assert.deepEqual(commandsFor("PostToolUse"), [
      'node "${CLAUDE_PLUGIN_ROOT}/bin/observe.mjs"',
    ]);
    assert.deepEqual(commandsFor("SessionStart"), [
      'node "${CLAUDE_PLUGIN_ROOT}/hooks/session.mjs"',
    ]);
    assert.deepEqual(commandsFor("SessionEnd"), [
      'node "${CLAUDE_PLUGIN_ROOT}/hooks/session.mjs"',
    ]);

    for (const event of ["PostToolUse", "SessionStart", "SessionEnd"] as const) {
      for (const command of commandsFor(event)) {
        assert.doesNotMatch(command, /(^|\s)bash(?:\.exe)?\s/i, `${event} must not require Bash`);
      }
    }
  });

  // Claude Code on Windows exposes a first-class PowerShell tool with the same
  // { command } input as Bash. A matcher that names only Bash never spawns the
  // guard for a PowerShell call, so the shell guards must name both.
  it("registers the shell-command guards for the PowerShell tool as well as Bash", () => {
    const preToolUse = getPluginHooksConfig().hooks.PreToolUse ?? [];
    const matcherFor = (script: string): string | undefined => {
      const entry = preToolUse.find((candidate) =>
        candidate.hooks.some((hook) => hook.command.includes(`/hooks/${script}"`)),
      );
      assert.ok(entry, `${script} must be registered on PreToolUse`);
      return entry.matcher;
    };

    assert.equal(matcherFor("hook-pack.mjs"), "Bash|PowerShell|Monitor");
    assert.equal(matcherFor("config-guard.mjs"), "Bash|PowerShell|Monitor|Edit|MultiEdit|Write|NotebookEdit");
    assert.equal(matcherFor("gateguard.mjs"), "Bash|PowerShell|Monitor|Edit|MultiEdit|Write|NotebookEdit");
    assert.equal(matcherFor("companion-preference.mjs"), "Skill");

    // An entry that names a shell tool must name all three. Monitor's
    // { command } runs in the same shell as Bash.
    for (const entry of preToolUse) {
      assert.ok(entry.matcher, "every PreToolUse group names its tools");
      const tools = entry.matcher.split("|");
      for (const shellTool of ["PowerShell", "Monitor"]) {
        assert.equal(
          tools.includes(shellTool),
          tools.includes("Bash"),
          `matcher "${entry.matcher}" names one shell tool without the others`,
        );
      }
    }
  });

  // Applies a PreToolUse matcher the way Claude Code does (hooks reference,
  // "Matcher patterns"): "*", "" or no matcher matches every tool; a value of
  // only letters, digits, _, -, spaces, "," and "|" is a list of exact names;
  // anything else is a JavaScript regular expression, unanchored. A matcher
  // that matches Bash also runs for a shell command started with Monitor.
  function matcherMatches(matcher: string | undefined, toolName: string): boolean {
    if (matcher === undefined || matcher === "" || matcher === "*") return true;
    const test = (name: string): boolean =>
      /^[A-Za-z0-9_\- ,|]+$/.test(matcher)
        ? matcher.split(/[|,]/).map((part) => part.trim()).includes(name)
        : new RegExp(matcher).test(name);
    return test(toolName) || (toolName === "Monitor" && test("Bash"));
  }

  function preToolUseScriptsFor(toolName: string): string[] {
    const preToolUse = getPluginHooksConfig().hooks.PreToolUse ?? [];
    return preToolUse
      .filter((entry) => matcherMatches(entry.matcher, toolName))
      .flatMap((entry) => entry.hooks.map((hook) => /\/hooks\/([\w-]+)\.mjs"/.exec(hook.command)?.[1] ?? hook.command));
  }

  // gateguard can deny only the file tools and the shell tools, and
  // companion-preference acts only on Skill. A read-only call spawns no
  // PreToolUse process; the observer on PostToolUse still sees every tool.
  it("spawns a PreToolUse hook only for the tools it can act on", () => {
    for (const toolName of ["Read", "Grep", "Glob", "mcp__memory__create_entities"]) {
      assert.deepEqual(preToolUseScriptsFor(toolName), [], `${toolName} must match no PreToolUse group`);
    }
    for (const toolName of ["Edit", "Write"]) {
      assert.deepEqual(preToolUseScriptsFor(toolName), ["gateguard", "config-guard"], toolName);
    }
    for (const toolName of ["Bash", "PowerShell", "Monitor"]) {
      assert.deepEqual(preToolUseScriptsFor(toolName), ["gateguard", "hook-pack", "config-guard"], toolName);
    }
    assert.deepEqual(preToolUseScriptsFor("Skill"), ["companion-preference"]);
  });

  it("gives hooks enough time to start on a loaded Windows host", () => {
    for (const [event, entries] of Object.entries(getPluginHooksConfig().hooks)) {
      for (const entry of entries) {
        for (const hook of entry.hooks) {
          assert.ok(
            hook.timeout >= 15,
            `${event} hook has an unsafe ${hook.timeout}s timeout: ${hook.command}`,
          );
        }
      }
    }
  });

  it("reports the SessionStart level from the current project bucket", () => {
    const fixture = join(tmpdir(), `ci-session-hook-${Date.now()}`);
    const home = join(fixture, "home");
    const projectRoot = join(fixture, "project");
    const projectHash = hashProjectRoot(projectRoot);
    const projectDir = join(home, ".claude", "instincts", projectHash);

    try {
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(
        join(projectDir, "observations.jsonl"),
        Array.from({ length: 20 }, (_, index) => JSON.stringify({ index })).join("\n") + "\n",
      );
      writeFileSync(join(projectDir, "reliable.yaml"), "confidence: 0.8\n");

      const result = runSession(
        JSON.stringify({ hook_event_name: "SessionStart", session_id: "portable-start" }),
        home,
        projectRoot,
      );

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.match(
        result.stderr,
        /\[continuous-improvement\] Level: AUTO-APPLY \| Observations: 20 \| Instincts: 1/,
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("recognizes SessionEnd from the canonical hook_event_name field", () => {
    const fixture = join(tmpdir(), `ci-session-end-${Date.now()}`);
    const home = join(fixture, "home");
    const projectRoot = join(fixture, "project");

    try {
      mkdirSync(projectRoot, { recursive: true });
      const result = runSession(
        JSON.stringify({ hook_event_name: "SessionEnd", session_id: "portable-end" }),
        home,
        projectRoot,
      );

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.equal(
        result.stderr.trim(),
        "[continuous-improvement] Session ending. Run /continuous-improvement to reflect and capture learnings.",
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("fails open on malformed input", () => {
    const fixture = join(tmpdir(), `ci-session-malformed-${Date.now()}`);
    try {
      mkdirSync(fixture, { recursive: true });
      const result = runSession("{not-json", fixture, fixture);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
