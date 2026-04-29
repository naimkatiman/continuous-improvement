import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const HOOKS_DIR = join(__dirname, "..", "hooks");

// The observe hook is a bash script. We can only run this suite when:
//   (1) a bash interpreter is available on PATH, AND
//   (2) that bash preserves backslashes in env values passed from the host.
//
// Condition (2) excludes Windows + WSL bash (bash.exe), where interop strips
// backslashes from inherited env vars. Git Bash on Windows passes both checks.
// Linux and macOS always pass. Pure Windows (no bash) fails (1).
//
// When we skip, we do so with a clear message so Windows contributors know to
// run `npm test` from within their WSL or Git Bash shell instead.
const SKIP_REASON: string | false = (() => {
  const probe = spawnSync("bash", ["-c", "exit 0"], { stdio: "ignore" });
  if (probe.status !== 0 || probe.error) {
    return "bash not available on PATH";
  }
  const roundTrip = spawnSync(
    "bash",
    ["-c", 'printf "%s" "$PROBE_VAR"'],
    {
      env: { ...process.env, PROBE_VAR: "A\\B\\C" },
      encoding: "utf8",
    }
  );
  if (roundTrip.status !== 0 || roundTrip.stdout !== "A\\B\\C") {
    return "bash mangles env values (WSL interop on Windows); run tests from WSL or Git Bash";
  }
  return false;
})();

// Invoke bash with the hooks directory as cwd so the script is referenced
// relatively. This avoids Windows/WSL/Git-Bash path-translation quirks
// (`D:\\x`, `/d/x`, `/mnt/d/x`) entirely.
function runHook(payload: string, extraEnv: Record<string, string> = {}) {
  const result = spawnSync("bash", ["./observe.sh"], {
    input: payload,
    cwd: HOOKS_DIR,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    timeout: 5000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`hook exited ${result.status}: ${result.stderr}`);
  }
  return result;
}

describe("observe.sh hook", { skip: SKIP_REASON }, () => {
  let tempHome = "";

  before(() => {
    tempHome = join(tmpdir(), `ci-hook-test-${Date.now()}`);
    mkdirSync(tempHome, { recursive: true });
  });

  after(() => {
    rmSync(tempHome, { recursive: true, force: true });
  });

  it("exits 0 with empty input", () => {
    runHook("", { HOME: tempHome });
    assert.ok(true, "Hook should exit 0 with empty input");
  });

  it("exits 0 with valid tool call JSON", () => {
    const payload = JSON.stringify({
      tool_name: "Read",
      session_id: "test-session-123",
      tool_input: { file_path: "/tmp/test.txt" },
    });
    runHook(payload, { HOME: tempHome });
    assert.ok(true, "Hook should exit 0 with valid input");
  });

  it("writes observation to JSONL file", () => {
    const payload = JSON.stringify({
      tool_name: "Bash",
      session_id: "test-session-456",
      tool_input: { command: "ls" },
    });
    runHook(payload, {
      HOME: tempHome,
      CLAUDE_PROJECT_DIR: "/tmp/test-project",
    });

    const instinctsDir = join(tempHome, ".claude", "instincts");
    assert.ok(existsSync(instinctsDir), "instincts dir should be created");

    const dirs = readdirSync(instinctsDir).filter(
      (dir) => dir !== "global" && dir !== "observe.sh"
    );
    assert.ok(dirs.length > 0, "Should have created a project directory");

    const observationsFile = join(instinctsDir, dirs[0], "observations.jsonl");
    assert.ok(existsSync(observationsFile), "observations.jsonl should exist");

    const content = readFileSync(observationsFile, "utf8").trim();
    const lines = content.split("\n");
    assert.ok(lines.length >= 1, "Should have at least one observation");

    const observation = JSON.parse(lines[lines.length - 1]) as {
      event?: string;
      project_id?: string;
      tool?: string;
      ts?: string;
    };
    assert.equal(observation.tool, "Bash", "Tool name should be Bash");
    assert.equal(observation.event, "tool_start", "Event should be tool_start");
    assert.ok(observation.ts, "Should have timestamp");
    assert.ok(observation.project_id, "Should have project_id");
  });

  it("writes project.json for new projects", () => {
    const instinctsDir = join(tempHome, ".claude", "instincts");
    const dirs = readdirSync(instinctsDir).filter(
      (dir) => dir !== "global" && dir !== "observe.sh"
    );

    const projectJson = join(instinctsDir, dirs[0], "project.json");
    assert.ok(existsSync(projectJson), "project.json should exist");

    const project = JSON.parse(readFileSync(projectJson, "utf8")) as {
      created_at?: string;
      id?: string;
      name?: string;
    };
    assert.ok(project.id, "Should have id");
    assert.ok(project.name, "Should have name");
    assert.ok(project.created_at, "Should have created_at");
  });

  it("handles tool_complete events", () => {
    const payload = JSON.stringify({
      tool_name: "Read",
      session_id: "test-session-789",
      tool_input: { file_path: "/tmp/test.txt" },
      tool_output: { content: "file contents here" },
    });

    runHook(payload, {
      HOME: tempHome,
      CLAUDE_PROJECT_DIR: "/tmp/test-project",
    });

    const instinctsDir = join(tempHome, ".claude", "instincts");
    const dirs = readdirSync(instinctsDir).filter(
      (dir) => dir !== "global" && dir !== "observe.sh"
    );
    const observationsFile = join(instinctsDir, dirs[0], "observations.jsonl");
    const lines = readFileSync(observationsFile, "utf8").trim().split("\n");
    const lastObservation = JSON.parse(lines[lines.length - 1]) as { event?: string };
    assert.equal(lastObservation.event, "tool_complete", "Should detect tool_complete event");
  });

  it("completes within 2000ms", () => {
    const payload = JSON.stringify({
      tool_name: "Grep",
      session_id: "perf-test",
      tool_input: { pattern: "test" },
    });

    const start = performance.now();
    runHook(payload, {
      HOME: tempHome,
      CLAUDE_PROJECT_DIR: "/tmp/test-project",
    });
    const elapsed = performance.now() - start;
    // Budget covers Windows/Git Bash overhead: bash startup + hook script + AV interception
    // can total ~1.0–1.5s in practice on Windows. Linux/macOS typically completes in <300ms.
    assert.ok(elapsed < 2000, `Hook should complete within 2000ms (took ${elapsed.toFixed(0)}ms)`);
  });
});

// ===========================================================================
// three-section-close.sh — Stop hook that requires every substantive assistant
// reply to close with What has been done / What is next / Recommendation.
// ===========================================================================

function runThreeSectionClose(
  payload: string,
  extraEnv: Record<string, string> = {},
) {
  // Empty-string HOME/USERPROFILE = explicit opt-out signal recognized by
  // three-section-close.mjs. This blocks the hook from writing telemetry into
  // the developer's real ~/.claude/hook-telemetry/ during every `npm test` run.
  // None of the cases in this file assert on telemetry presence; they only
  // check stdout/status. Callers can still override via extraEnv if needed.
  const result = spawnSync(process.execPath, ["./three-section-close.mjs"], {
    input: payload,
    cwd: HOOKS_DIR,
    env: { ...process.env, HOME: "", USERPROFILE: "", ...extraEnv },
    encoding: "utf8",
    timeout: 5000,
  });
  if (result.error) throw result.error;
  return result;
}

function writeAssistantTranscript(path: string, text: string): void {
  const line = JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "text", text }] },
  });
  writeFileSync(path, `${line}\n`);
}

describe("three-section-close.mjs hook", () => {
  let tempDir = "";

  before(() => {
    tempDir = join(tmpdir(), `ci-three-section-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function transcriptPath(name: string): string {
    return join(tempDir, `${name}.jsonl`);
  }

  it("exits 0 with empty input", () => {
    const result = runThreeSectionClose("");
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
  });

  it("exits 0 when transcript_path is missing", () => {
    const result = runThreeSectionClose(JSON.stringify({ session_id: "x" }));
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
  });

  it("exits 0 when transcript file does not exist", () => {
    const result = runThreeSectionClose(
      JSON.stringify({ transcript_path: join(tempDir, "missing.jsonl") }),
    );
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
  });

  it("exits 0 for a short message (skip threshold)", () => {
    const tp = transcriptPath("short");
    writeAssistantTranscript(tp, "ok, will do.");
    const result = runThreeSectionClose(
      JSON.stringify({ transcript_path: tp }),
    );
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "");
  });

  it("blocks a long message missing all three sections", () => {
    const tp = transcriptPath("long-missing");
    // 700+ char body with prose but no required headings
    const body = "Here is a long writeup of the changes I just made. ".repeat(20);
    writeAssistantTranscript(tp, body);
    const result = runThreeSectionClose(
      JSON.stringify({ transcript_path: tp }),
    );
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout) as {
      decision?: string;
      reason?: string;
    };
    assert.equal(parsed.decision, "block");
    assert.match(parsed.reason ?? "", /What has been done/);
    assert.match(parsed.reason ?? "", /What is next/);
    assert.match(parsed.reason ?? "", /Recommendation/);
  });

  it("blocks a long message missing only Recommendation", () => {
    const tp = transcriptPath("missing-rec");
    const body = [
      "## What has been done",
      "Some stuff was done. ".repeat(20),
      "## What is next",
      "1. step\n2. step\n3. step\n4. step\n5. step",
      "More body text. ".repeat(20),
    ].join("\n\n");
    writeAssistantTranscript(tp, body);
    const result = runThreeSectionClose(
      JSON.stringify({ transcript_path: tp }),
    );
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout) as { decision?: string; reason?: string };
    assert.equal(parsed.decision, "block");
    assert.doesNotMatch(parsed.reason ?? "", /What has been done/);
    assert.doesNotMatch(parsed.reason ?? "", /What is next/);
    assert.match(parsed.reason ?? "", /Recommendation/);
  });

  it("allows a long message with all three sections present", () => {
    const tp = transcriptPath("compliant");
    const body = [
      "Big summary block. ".repeat(20),
      "## What has been done",
      "- did the thing",
      "## What is next",
      "1. a\n2. b\n3. c\n4. d\n5. e",
      "## Recommendation",
      "1. top\n2. mid\n3. low",
    ].join("\n\n");
    writeAssistantTranscript(tp, body);
    const result = runThreeSectionClose(
      JSON.stringify({ transcript_path: tp }),
    );
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "");
  });

  it("allows a long message with all three sections at any heading level", () => {
    const tp = transcriptPath("h3");
    const body = [
      "Filler body. ".repeat(20),
      "### What has been done",
      "stuff",
      "### What is next",
      "1. a\n2. b\n3. c\n4. d\n5. e",
      "### Recommendation",
      "no",
    ].join("\n\n");
    writeAssistantTranscript(tp, body);
    const result = runThreeSectionClose(
      JSON.stringify({ transcript_path: tp }),
    );
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "");
  });

  it("uses only the LAST assistant turn (not earlier ones)", () => {
    const tp = transcriptPath("multi-turn");
    const earlier = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          {
            type: "text",
            // Earlier turn that has the close — should NOT save the new one
            text: [
              "Earlier filler. ".repeat(30),
              "## What has been done",
              "## What is next",
              "## Recommendation",
            ].join("\n\n"),
          },
        ],
      },
    });
    const userTurn = JSON.stringify({
      type: "user",
      message: { content: [{ type: "text", text: "ok do more" }] },
    });
    const latest = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          {
            type: "text",
            text: "Latest reply with no close. ".repeat(30),
          },
        ],
      },
    });
    writeFileSync(tp, `${earlier}\n${userTurn}\n${latest}\n`);
    const result = runThreeSectionClose(
      JSON.stringify({ transcript_path: tp }),
    );
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout) as { decision?: string };
    assert.equal(
      parsed.decision,
      "block",
      "earlier compliant turn should not satisfy the lint for the latest non-compliant turn",
    );
  });
});
