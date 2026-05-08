/**
 * RED-phase test for the runtime PreToolUse gateguard hook.
 *
 * Spec: docs(gateguard) PR #105 amended the docs to call the runtime hook
 * "roadmap, not bundled." Issue #106 tracks the actual hook implementation.
 * This file is the failing test that GREEN-phase work must turn green.
 *
 * The hook contract follows Claude Code's PreToolUse format:
 *   stdin  : JSON { tool_name, tool_input }
 *   stdout : JSON { decision: "allow" | "block", reason?: string }
 *   exit   : 0 always (decision is in stdout)
 *
 * Three-stage gate (per skills/gateguard.md):
 *   1. DENY  — first Edit/Write/MultiEdit/destructive-Bash blocked, message
 *              names the facts the agent must present
 *   2. FORCE — agent presents facts (out of band — model-side discipline)
 *   3. ALLOW — once a per-session marker exists for the file, retry passes
 *
 * Read-only and exploratory tools (Read, Grep, Glob, routine Bash) bypass
 * the gate so the agent can investigate without tripping itself.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, before, after } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const HOOK_PATH = join(REPO_ROOT, "hooks", "gateguard.mjs");

interface HookDecision {
  decision: "allow" | "block";
  reason?: string;
}

function runHook(toolName: string, toolInput: Record<string, unknown>, sessionDir: string): HookDecision {
  const payload = JSON.stringify({ tool_name: toolName, tool_input: toolInput });
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: payload,
    encoding: "utf8",
    env: {
      ...process.env,
      GATEGUARD_SESSION_DIR: sessionDir,
    },
  });
  assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
  const stdout = result.stdout.trim();
  assert.notEqual(stdout, "", "hook must emit a JSON decision on stdout");
  return JSON.parse(stdout) as HookDecision;
}

describe("hooks/gateguard.mjs (runtime PreToolUse hook — issue #106)", () => {
  let sessionDir = "";

  before(() => {
    sessionDir = mkdtempSync(join(tmpdir(), "gateguard-test-"));
  });

  after(() => {
    if (sessionDir) {
      rmSync(sessionDir, { recursive: true, force: true });
    }
  });

  describe("existence", () => {
    it("hooks/gateguard.mjs is present in the repo", () => {
      assert.ok(
        existsSync(HOOK_PATH),
        `expected ${HOOK_PATH} to exist — see issue #106 acceptance criteria`,
      );
    });

    it("hooks/gateguard.mjs is wired as the first PreToolUse hook in the plugin bundle", () => {
      // The runtime hooks.json is generated into the plugin bundle by the build,
      // not into the repo-root hooks/. Source-of-truth lives in
      // src/lib/plugin-metadata.mts → getPluginHooksConfig().
      // readFileSync + JSON.parse — avoids Node's ESM URL scheme requirement on
      // Windows (`import("d:\\...")` fails with ERR_UNSUPPORTED_ESM_URL_SCHEME).
      const hooksJsonPath = join(
        REPO_ROOT,
        "plugins",
        "continuous-improvement",
        "hooks",
        "hooks.json",
      );
      assert.ok(existsSync(hooksJsonPath), "plugin-bundle hooks.json should exist");
      const hooksJson = JSON.parse(readFileSync(hooksJsonPath, "utf8")) as {
        hooks: { PreToolUse?: Array<{ hooks: Array<{ command: string }> }> };
      };
      const preToolUse = hooksJson.hooks.PreToolUse;
      assert.ok(Array.isArray(preToolUse) && preToolUse.length > 0, "PreToolUse hooks present");
      const first = preToolUse[0]!.hooks[0]!;
      assert.match(first.command, /gateguard\.mjs/, "first PreToolUse hook must be gateguard");
    });
  });

  describe("DENY stage — first mutating tool call blocks", () => {
    it("first Write call is blocked with a fact-list reason", () => {
      const decision = runHook(
        "Write",
        { file_path: "scratch.txt", content: "hello" },
        sessionDir,
      );
      assert.equal(decision.decision, "block");
      assert.match(decision.reason ?? "", /import|require|Glob|user'?s? .*instruction/i);
    });

    it("first Edit call is blocked with a fact-list reason", () => {
      const decision = runHook(
        "Edit",
        { file_path: "src/lib/plugin-metadata.mts", old_string: "x", new_string: "y" },
        sessionDir,
      );
      assert.equal(decision.decision, "block");
      assert.match(decision.reason ?? "", /import|public function|user'?s? .*instruction/i);
    });

    it("destructive Bash (rm -rf) is blocked with rollback-plan demand", () => {
      const decision = runHook("Bash", { command: "rm -rf node_modules" }, sessionDir);
      assert.equal(decision.decision, "block");
      assert.match(decision.reason ?? "", /rollback|delete|destructive/i);
    });
  });

  describe("ALLOW stage — read-only and exploratory tools bypass the gate", () => {
    it("Read is allowed without facts", () => {
      const decision = runHook("Read", { file_path: "README.md" }, sessionDir);
      assert.equal(decision.decision, "allow");
    });

    it("Grep is allowed without facts", () => {
      const decision = runHook("Grep", { pattern: "TODO" }, sessionDir);
      assert.equal(decision.decision, "allow");
    });

    it("Glob is allowed without facts", () => {
      const decision = runHook("Glob", { pattern: "**/*.ts" }, sessionDir);
      assert.equal(decision.decision, "allow");
    });

    it("routine Bash (git status) is allowed", () => {
      const decision = runHook("Bash", { command: "git status" }, sessionDir);
      assert.equal(decision.decision, "allow");
    });
  });

  describe("ALLOW stage — retry after gate clearance passes", () => {
    it("Write to a path that has cleared the gate is allowed", () => {
      const file = "scratch-cleared.txt";
      const blocked = runHook("Write", { file_path: file, content: "x" }, sessionDir);
      assert.equal(blocked.decision, "block", "first write blocks");

      // FORCE stage is model-side — the agent presents facts out of band.
      // The hook records gate clearance via per-session state. Simulate that
      // clearance by re-invoking with a clearance signal: the second call
      // carries `_gateguard_facts_presented: true` to indicate the agent has
      // satisfied the gate. Implementation detail of the hook contract.
      const allowed = runHook(
        "Write",
        { file_path: file, content: "x", _gateguard_facts_presented: true },
        sessionDir,
      );
      assert.equal(allowed.decision, "allow", "second write with facts allowed");
    });
  });
});
