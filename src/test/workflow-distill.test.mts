// workflow-distill.test.mts — spawn integration test for the workflow-distill Stop hook.
//
// The pure detection logic (workflowRunFromObservations) is covered in
// skill-distill.test.mts. This exercises the I/O wrapper end-to-end:
// project-hash resolution, observations read, mode handling, the one-time
// stderr nudge, and the per-run dedup state. CLAUDE_PROJECT_DIR is set so the
// hash is deterministic and git is never consulted. Fail-open by construction:
// every path exits 0 and never blocks.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const HOOK_PATH = join(__dirname, "..", "hooks", "workflow-distill.mjs");

const WORKFLOW_SCRIPT =
  "export const meta = { name: 'demo-flow', description: 'fan out three readers', " +
  "phases: [{ title: 'Read' }, { title: 'Synthesize' }] }\nawait parallel([])";

let home = "";
let project = "";

function instinctsDirFor(projectRoot: string): string {
  const hash = createHash("sha256").update(projectRoot).digest("hex").slice(0, 12);
  return join(home, ".claude", "instincts", hash);
}

function workflowRow(session: string): string {
  return JSON.stringify({
    ts: "2026-06-25T12:00:00Z",
    session,
    tool: "Workflow",
    input_summary: JSON.stringify({ script: WORKFLOW_SCRIPT }),
    output_summary: JSON.stringify({ status: "async_launched", runId: "wf_demo", summary: "demo" }),
  });
}

function verifyRow(session: string): string {
  return JSON.stringify({
    ts: "2026-06-25T12:01:00Z",
    session,
    tool: "Bash",
    input_summary: "npm run verify:all",
    output_summary: "OK — all checks passed",
  });
}

function seedObservations(projectRoot: string, rows: string[]): void {
  const dir = instinctsDirFor(projectRoot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "observations.jsonl"), rows.join("\n") + "\n");
}

function runHook(mode: string): { status: number | null; stdout: string; stderr: string } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.HOME;
  delete env.USERPROFILE;
  env.HOME = home;
  env.USERPROFILE = home;
  env.CLAUDE_PROJECT_DIR = project;
  if (mode === "__unset__") {
    delete env.CLAUDE_WORKFLOW_DISTILL_NUDGE;
  } else {
    env.CLAUDE_WORKFLOW_DISTILL_NUDGE = mode;
  }
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify({ transcript_path: "" }),
    env,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

describe("workflow-distill hook", () => {
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ci-wd-home-"));
    project = mkdtempSync(join(tmpdir(), "ci-wd-proj-"));
  });

  afterEach(() => {
    for (const dir of [home, project]) {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        // Windows stdio/handle linger
      }
    }
  });

  it("nudges once on a verified workflow run when mode=on", () => {
    seedObservations(project, [workflowRow("s1"), verifyRow("s1")]);
    const { status, stdout, stderr } = runHook("on");
    assert.equal(status, 0);
    assert.equal(stdout.trim(), "", "the nudge is advisory — it must never emit a block decision on stdout");
    assert.match(stderr, /workflow-distill/);
    assert.match(stderr, /ci_distill_from_workflow/);
    assert.match(stderr, /demo-flow/);
  });

  it("is a no-op by default (env unset)", () => {
    seedObservations(project, [workflowRow("s1"), verifyRow("s1")]);
    const { status, stdout, stderr } = runHook("__unset__");
    assert.equal(status, 0);
    assert.equal(stdout.trim(), "");
    assert.equal(stderr.trim(), "", "default-off: a verified run must not nudge unless the operator opts in");
  });

  it("is a no-op when mode=off", () => {
    seedObservations(project, [workflowRow("s1"), verifyRow("s1")]);
    const { status, stderr } = runHook("off");
    assert.equal(status, 0);
    assert.equal(stderr.trim(), "");
  });

  it("does not nudge an unverified run (Workflow launched, no following verify)", () => {
    seedObservations(project, [workflowRow("s1")]);
    const { status, stderr } = runHook("on");
    assert.equal(status, 0);
    assert.equal(stderr.trim(), "", "no verify-exit-0 follows the launch — fail closed, no nudge");
  });

  it("does not nudge when there are no observations", () => {
    const { status, stderr } = runHook("on");
    assert.equal(status, 0);
    assert.equal(stderr.trim(), "");
  });

  it("dedups — a second Stop on the same run stays silent", () => {
    seedObservations(project, [workflowRow("s1"), verifyRow("s1")]);
    const first = runHook("on");
    assert.match(first.stderr, /ci_distill_from_workflow/, "first Stop nudges");
    const second = runHook("on");
    assert.equal(second.status, 0);
    assert.equal(second.stderr.trim(), "", "the run was already nudged — dedup state suppresses the repeat");
  });
});
