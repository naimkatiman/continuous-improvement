/**
 * RED-phase test for the runtime PreToolUse gateguard hook.
 *
 * Spec: docs(gateguard) PR #105 amended the docs to call the runtime hook
 * "roadmap, not bundled." Issue #106 tracks the actual hook implementation.
 * This file is the failing test that GREEN-phase work must turn green.
 *
 * The hook contract follows Claude Code's PreToolUse format:
 *   stdin  : JSON { tool_name, tool_input }
 *   stdout : empty on allow (no output = no opinion); on deny the
 *            { hookSpecificOutput: { hookEventName: "PreToolUse",
 *              permissionDecision: "deny", permissionDecisionReason } } shape
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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

interface PreToolUseHookOutput {
  hookSpecificOutput?: {
    hookEventName?: string;
    permissionDecision?: string;
    permissionDecisionReason?: string;
  };
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
  // Allow is empty stdout (no opinion). Anything else must be the documented
  // PreToolUse deny shape — a bare { decision: "allow" } fails Claude Code's
  // hook-output schema validation.
  if (stdout === "") return { decision: "allow" };
  const parsed = JSON.parse(stdout) as PreToolUseHookOutput;
  const out = parsed.hookSpecificOutput;
  assert.equal(out?.hookEventName, "PreToolUse", "deny output names the hook event");
  assert.equal(out?.permissionDecision, "deny", "non-empty output must be a deny");
  return { decision: "block", reason: out?.permissionDecisionReason };
}

function seedClearedFiles(sessionDir: string, files: string[]): void {
  writeFileSync(
    join(sessionDir, "gateguard-session.json"),
    `${JSON.stringify(
      {
        created_at: new Date().toISOString(),
        cleared_files: Object.fromEntries(
          files.map((file) => [file, { cleared_at: new Date().toISOString() }]),
        ),
      },
      null,
      2,
    )}\n`,
  );
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

    it("first Write call with an empty file_path falls back to <unknown>", () => {
      const decision = runHook("Write", { file_path: "", content: "hello" }, sessionDir);
      assert.equal(decision.decision, "block");
      assert.match(decision.reason ?? "", /Before creating <unknown>, present these facts:/);
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

    it("MultiEdit blocks when one edited file has clearance and another does not", () => {
      seedClearedFiles(sessionDir, ["already-cleared.txt"]);

      const decision = runHook(
        "MultiEdit",
        {
          edits: [
            { file_path: "already-cleared.txt", old_string: "x", new_string: "y" },
            { file_path: "needs-clearance.txt", old_string: "a", new_string: "b" },
          ],
        },
        sessionDir,
      );

      assert.equal(decision.decision, "block");
      assert.match(decision.reason ?? "", /Before editing 2 files \(already-cleared\.txt, needs-clearance\.txt\)/);
      assert.match(decision.reason ?? "", /already-cleared\.txt/);
      assert.match(decision.reason ?? "", /needs-clearance\.txt/);
    });

    it("MultiEdit with facts does not exceed the per-session cap", () => {
      const capSessionDir = mkdtempSync(join(tmpdir(), "gateguard-cap-test-"));
      try {
        const seeded = Array.from({ length: 48 }, (_, index) => `seed-${index + 1}.txt`);
        seedClearedFiles(capSessionDir, seeded);

        const edits = Array.from({ length: 5 }, (_, index) => ({
          file_path: `batch-${index + 1}.txt`,
          old_string: "x",
          new_string: "y",
        }));

        const decision = runHook("MultiEdit", { edits, _gateguard_facts_presented: true }, capSessionDir);
        assert.equal(decision.decision, "block", "cap-exceeding multi-edit should be blocked");

        const state = JSON.parse(readFileSync(join(capSessionDir, "gateguard-session.json"), "utf8")) as {
          cleared_files?: Record<string, unknown>;
        };
        assert.ok((state.cleared_files ? Object.keys(state.cleared_files).length : 0) <= 50);
      } finally {
        rmSync(capSessionDir, { recursive: true, force: true });
      }
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

    it("MultiEdit with facts clears every edited file and allows a retry", () => {
      const edits = [
        { file_path: "multi-a.txt", old_string: "x", new_string: "y" },
        { file_path: "multi-b.txt", old_string: "p", new_string: "q" },
      ];

      const blocked = runHook("MultiEdit", { edits }, sessionDir);
      assert.equal(blocked.decision, "block", "first multi-edit blocks");

      const allowed = runHook(
        "MultiEdit",
        { edits, _gateguard_facts_presented: true },
        sessionDir,
      );
      assert.equal(allowed.decision, "allow", "multi-edit with facts is allowed");

      const retry = runHook("MultiEdit", { edits }, sessionDir);
      assert.equal(retry.decision, "allow", "retry is allowed after all files are cleared");
    });
  });

  describe("canonical clearance + block-reason clearance action", () => {
    it("recognizes a clearance across drive-case and separator forms", () => {
      const dir = mkdtempSync(join(tmpdir(), "gateguard-canon-"));
      try {
        seedClearedFiles(dir, ["d:/proj/file.ts"]);
        const decision = runHook("Write", { file_path: "D:\\proj\\file.ts", content: "x" }, dir);
        assert.equal(
          decision.decision,
          "allow",
          "a file cleared as d:/proj/file.ts must be allowed when received as D:\\proj\\file.ts",
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("block reason names the in-harness clearance action", () => {
      const dir = mkdtempSync(join(tmpdir(), "gateguard-reason-"));
      try {
        const decision = runHook("Write", { file_path: "fresh-file.ts", content: "x" }, dir);
        assert.equal(decision.decision, "block");
        assert.match(decision.reason ?? "", /ci_gateguard_clear|gateguard-clear\.mjs/);
        // Route B must advertise state_path so the agent passes the session-scoped
        // path to ci_gateguard_clear; without it the MCP clear falls back to the
        // unscoped canonical dir and misses the session state.
        assert.match(decision.reason ?? "", /state_path:/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("block reason CLI args are JSON-escaped, not bare-quoted", () => {
      const dir = mkdtempSync(join(tmpdir(), "gateguard-esc-"));
      try {
        const decision = runHook("Write", { file_path: 'a"b.ts', content: "x" }, dir);
        assert.equal(decision.decision, "block");
        const cliLine = (decision.reason ?? "").split("\n").find((line) => line.includes("gateguard-clear.mjs")) ?? "";
        assert.match(cliLine, /a\\"b\.ts/, "CLI arg must be JSON-escaped");
        assert.doesNotMatch(cliLine, /"a"b\.ts"/, "CLI arg must not contain a bare unescaped quote");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("block reason CLI command uses a resolved path, not the literal ${CLAUDE_PLUGIN_ROOT}", () => {
      const dir = mkdtempSync(join(tmpdir(), "gateguard-resolved-"));
      try {
        const decision = runHook("Write", { file_path: "fresh-resolved.ts", content: "x" }, dir);
        assert.equal(decision.decision, "block");
        const reason = decision.reason ?? "";
        assert.doesNotMatch(
          reason,
          /\$\{CLAUDE_PLUGIN_ROOT\}/,
          "block reason must not print the unexpanded ${CLAUDE_PLUGIN_ROOT} — it is empty in the agent shell",
        );
        const cliLine = reason.split("\n").find((line) => line.includes("gateguard-clear.mjs")) ?? "";
        assert.match(cliLine, /bin\/gateguard-clear\.mjs/, "CLI path must resolve to the bin script");
        assert.match(cliLine, /--state/, "CLI command must pass --state for resolution-proof clearance");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});

// RISA 1 / G3 — the destructive-bash scan must not match patterns that appear
// only inside the PROSE of a commit message or PR body. A verified commit whose
// message mentions "drop"/"format"/"truncate" was being stranded on its own
// wording. Genuine destructive commands (the verb is command syntax, not quoted
// prose) must still gate.
describe("hooks/gateguard.mjs — destructive-bash message-arg carve-out (RISA 1 / G3)", () => {
  let sessionDir = "";

  before(() => {
    sessionDir = mkdtempSync(join(tmpdir(), "gateguard-msgarg-"));
  });

  after(() => {
    rmSync(sessionDir, { recursive: true, force: true });
  });

  it("git commit -m with destructive words in the message is allowed", () => {
    const decision = runHook(
      "Bash",
      { command: 'git commit -m "refactor: drop the stale format helper"' },
      sessionDir,
    );
    assert.equal(decision.decision, "allow", "commit-message prose must not trip the destructive gate");
  });

  it("gh pr create --body with destructive words in the body is allowed", () => {
    const decision = runHook(
      "Bash",
      { command: 'gh pr create --title "cleanup" --body "truncate the logs and remove old files"' },
      sessionDir,
    );
    assert.equal(decision.decision, "allow", "PR-body prose must not trip the destructive gate");
  });

  it("git commit -m with single-quoted destructive prose is allowed", () => {
    const decision = runHook(
      "Bash",
      { command: "git commit -m 'drop table cleanup: rename the format column'" },
      sessionDir,
    );
    assert.equal(decision.decision, "allow", "single-quoted message prose must not trip the gate");
  });

  it("git branch -D (genuine destructive) still blocks despite a benign context", () => {
    const decision = runHook("Bash", { command: "git branch -D feat/old-branch" }, sessionDir);
    assert.equal(decision.decision, "block", "force-delete branch must still gate");
    assert.match(decision.reason ?? "", /rollback|delete|destructive/i);
  });

  it("rm -rf outside any quoted message still blocks", () => {
    const decision = runHook("Bash", { command: "rm -rf node_modules" }, sessionDir);
    assert.equal(decision.decision, "block", "rm -rf must still gate");
  });

  it("a destructive command hidden in bash -c is NOT carved out (-c is not a message flag)", () => {
    const decision = runHook("Bash", { command: 'bash -c "rm -rf /tmp/x"' }, sessionDir);
    assert.equal(decision.decision, "block", "bash -c carries a command to run, not prose — must still gate");
  });

  it("a plain benign commit message is allowed (no regression)", () => {
    const decision = runHook("Bash", { command: 'git commit -m "add gateguard tests"' }, sessionDir);
    assert.equal(decision.decision, "allow");
  });
});

// Session isolation: the cap and clearance state must NOT bleed across
// concurrent same-day sessions. Drives the production path (no
// GATEGUARD_SESSION_DIR override) with HOME/USERPROFILE pinned to a temp dir so
// the hook resolves its own session-scoped dir from the stdin session_id.
describe("hooks/gateguard.mjs — per-session isolation (no shared cap)", () => {
  let tempHome = "";

  before(() => {
    tempHome = mkdtempSync(join(tmpdir(), "gg-session-iso-"));
  });

  after(() => {
    rmSync(tempHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  function runScoped(sessionId: string, toolInput: Record<string, unknown>): HookDecision {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: tempHome,
      USERPROFILE: tempHome,
      CLAUDE_PROJECT_DIR: "d:/proj/iso",
    };
    delete env.GATEGUARD_SESSION_DIR;
    const payload = JSON.stringify({ tool_name: "Edit", tool_input: toolInput, session_id: sessionId });
    const result = spawnSync(process.execPath, [HOOK_PATH], { input: payload, encoding: "utf8", env });
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
    const stdout = result.stdout.trim();
    if (stdout === "") return { decision: "allow" };
    const parsed = JSON.parse(stdout) as PreToolUseHookOutput;
    return { decision: "block", reason: parsed.hookSpecificOutput?.permissionDecisionReason };
  }

  it("clearing a file in session A does not clear it in session B", () => {
    const file = "d:/proj/iso/a.ts";
    // Session A presents facts → file cleared and recorded in A's session dir.
    assert.equal(
      runScoped("session-A", { file_path: file, _gateguard_facts_presented: true }).decision,
      "allow",
      "facts-flagged clear in session A must be allowed",
    );
    // Session A retry without facts → allowed (A already cleared it).
    assert.equal(
      runScoped("session-A", { file_path: file }).decision,
      "allow",
      "session A retry must see its own clearance",
    );
    // Session B never cleared it → blocked. (Current shared-dir code wrongly allows.)
    const blockResult = runScoped("session-B", { file_path: file });
    assert.equal(blockResult.decision, "block", "session B must NOT inherit session A's clearance");
    // The block reason must carry the session-scoped state_path so route B clears
    // the right dir — pinned to session-B so a regression in scoping is visible.
    assert.match(blockResult.reason ?? "", /state_path:/, "block reason advertises the MCP state_path");
    assert.match(blockResult.reason ?? "", /session-B/, "state_path references the session-B scoped dir");
  });
});

// CI_GATEGUARD_EXCLUDE lets a user opt specific low-risk path substrings out of
// the fact-forcing gate. Default (unset) must not change any existing behavior.
describe("hooks/gateguard.mjs — CI_GATEGUARD_EXCLUDE opt-in path exclusion", () => {
  let dir = "";

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "gateguard-exclude-"));
  });

  after(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function runWithExclude(
    toolName: string,
    toolInput: Record<string, unknown>,
    exclude: string | undefined,
  ): HookDecision {
    const env: NodeJS.ProcessEnv = { ...process.env, GATEGUARD_SESSION_DIR: dir };
    if (exclude === undefined) delete env.CI_GATEGUARD_EXCLUDE;
    else env.CI_GATEGUARD_EXCLUDE = exclude;
    const payload = JSON.stringify({ tool_name: toolName, tool_input: toolInput });
    const result = spawnSync(process.execPath, [HOOK_PATH], { input: payload, encoding: "utf8", env });
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
    const stdout = result.stdout.trim();
    if (stdout === "") return { decision: "allow" };
    const parsed = JSON.parse(stdout) as PreToolUseHookOutput;
    return { decision: "block", reason: parsed.hookSpecificOutput?.permissionDecisionReason };
  }

  it("a fresh Write under an excluded fragment bypasses the gate", () => {
    const decision = runWithExclude("Write", { file_path: "d:/vault/MyWiki/notes/new.md", content: "x" }, "/mywiki/");
    assert.equal(decision.decision, "allow");
  });

  it("the same path still gates when CI_GATEGUARD_EXCLUDE is unset (default is unchanged)", () => {
    const decision = runWithExclude("Write", { file_path: "d:/vault/MyWiki/notes/new.md", content: "x" }, undefined);
    assert.equal(decision.decision, "block");
  });

  it("exclusion matches case-insensitively and across path separators", () => {
    const decision = runWithExclude(
      "Edit",
      { file_path: "D:\\Vault\\MyWiki\\notes\\new.md", old_string: "x", new_string: "y" },
      "/mywiki/",
    );
    assert.equal(decision.decision, "allow");
  });

  it("a MultiEdit batch still gates when only some targets are excluded", () => {
    const decision = runWithExclude(
      "MultiEdit",
      {
        edits: [
          { file_path: "d:/vault/MyWiki/a.md", old_string: "x", new_string: "y" },
          { file_path: "d:/vault/src/app.ts", old_string: "a", new_string: "b" },
        ],
      },
      "/mywiki/",
    );
    assert.equal(decision.decision, "block");
    assert.match(decision.reason ?? "", /app\.ts/);
  });
});
