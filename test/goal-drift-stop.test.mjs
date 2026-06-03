// goal-drift-stop.test.mts — spawn integration test for the goal-drift Stop hook.
//
// The pure decision logic is covered in goal-drift-gate.test.mts. This exercises
// the I/O wrapper end-to-end: project-hash resolution, observations read, goal
// read, mode handling, and the block/warn/off output contract. CLAUDE_PROJECT_DIR
// is set so the hash is deterministic and git is never consulted.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const HOOK_PATH = join(__dirname, "..", "hooks", "goal-drift-stop.mjs");
const GOAL_PLAN = [
    "# Task Plan",
    "",
    "## Goal",
    "Implement OAuth login with JWT session tokens for the auth service.",
    "",
    "## Goal Keywords",
    "oauth, jwt, login, session",
    "",
].join("\n");
const LONG_TEXT = "Work summary. ".repeat(60); // ~840 chars, a substantive wrap-up
let home = "";
let project = "";
let transcriptPath = "";
function instinctsDirFor(projectRoot) {
    const hash = createHash("sha256").update(projectRoot).digest("hex").slice(0, 12);
    return join(home, ".claude", "instincts", hash);
}
function seedObservations(projectRoot, inputs) {
    const dir = instinctsDirFor(projectRoot);
    mkdirSync(dir, { recursive: true });
    const rows = inputs
        .map((input) => JSON.stringify({ ts: "2026-06-03T12:00:00Z", tool: "Edit", input_summary: input, output_summary: "" }))
        .join("\n");
    writeFileSync(join(dir, "observations.jsonl"), rows + "\n");
}
function runHook(mode) {
    const env = { ...process.env };
    delete env.HOME;
    delete env.USERPROFILE;
    env.HOME = home;
    env.USERPROFILE = home;
    env.CLAUDE_PROJECT_DIR = project;
    env.CLAUDE_GOAL_DRIFT_GATE = mode;
    const result = spawnSync(process.execPath, [HOOK_PATH], {
        input: JSON.stringify({ transcript_path: transcriptPath }),
        env,
        encoding: "utf8",
    });
    return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}
describe("goal-drift-stop hook", () => {
    beforeEach(() => {
        home = mkdtempSync(join(tmpdir(), "ci-gd-home-"));
        project = mkdtempSync(join(tmpdir(), "ci-gd-proj-"));
        writeFileSync(join(project, "task_plan.md"), GOAL_PLAN);
        transcriptPath = join(home, "transcript.jsonl");
        writeFileSync(transcriptPath, JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: LONG_TEXT }] } }) + "\n");
    });
    afterEach(() => {
        for (const dir of [home, project]) {
            try {
                rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            }
            catch {
                // Windows stdio/handle linger
            }
        }
    });
    it("blocks a drifted wrap-up when mode=block", () => {
        seedObservations(project, ["src/marketing/banner.ts", "src/dashboard/widget.ts", "docs/roadmap.md"]);
        const { stdout } = runHook("block");
        const decision = JSON.parse(stdout.trim());
        assert.equal(decision.decision, "block");
        assert.match(decision.reason, /DRIFT/i);
    });
    it("warns (never blocks) on drift when mode=warn", () => {
        seedObservations(project, ["src/marketing/banner.ts", "src/dashboard/widget.ts", "docs/roadmap.md"]);
        const { status, stdout, stderr } = runHook("warn");
        assert.equal(status, 0);
        assert.equal(stdout.trim(), "", "warn mode must not emit a block decision on stdout");
        assert.match(stderr, /goal-drift/);
    });
    it("is a no-op when mode=off", () => {
        seedObservations(project, ["src/marketing/banner.ts", "src/dashboard/widget.ts", "docs/roadmap.md"]);
        const { status, stdout, stderr } = runHook("off");
        assert.equal(status, 0);
        assert.equal(stdout.trim(), "");
        assert.equal(stderr.trim(), "");
    });
    it("does not block on-goal work even in block mode", () => {
        seedObservations(project, ["src/auth/oauth-login.ts", "src/auth/session.ts", "src/auth/jwt.ts"]);
        const { status, stdout } = runHook("block");
        assert.equal(status, 0);
        assert.equal(stdout.trim(), "", "on-goal work must not be blocked");
    });
});
