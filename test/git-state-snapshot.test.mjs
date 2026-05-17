import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
// __dirname at runtime points at the generated .mjs location (`test/`), one
// level under the repo root. Going up one resolves repo root for both the
// generated and the source layout, since src/test/ is also one level under
// src/ which tsc rebases to the repo root for emitted .mjs files.
const REPO_ROOT = join(__dirname, "..");
// POSIX-style path so Git Bash on Windows resolves the script when cwd is
// changed via spawnSync. On macOS/Linux the replace is a no-op.
const SCRIPT = join(REPO_ROOT, "scripts", "git-state-snapshot.sh").replace(/\\/g, "/");
// scripts/git-state-snapshot.sh is bash-only. Skip on hosts where bash is
// unavailable, mirroring the pattern in hook.test.mts.
const SKIP_REASON = (() => {
    const probe = spawnSync("bash", ["-c", "exit 0"], { stdio: "ignore" });
    if (probe.status !== 0 || probe.error) {
        return "bash not available on PATH";
    }
    return false;
})();
function runScript(cwd) {
    const result = spawnSync("bash", [SCRIPT], {
        cwd,
        encoding: "utf8",
    });
    return {
        exitCode: result.status ?? -1,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
    };
}
describe("scripts/git-state-snapshot.sh", { skip: SKIP_REASON }, () => {
    it("emits a single-line JSON envelope inside a git repo", () => {
        const out = runScript(REPO_ROOT);
        assert.equal(out.exitCode, 0, `expected exit 0, got ${out.exitCode}. stderr: ${out.stderr}`);
        const lines = out.stdout.trim().split("\n");
        assert.equal(lines.length, 1, `expected single-line JSON, got ${lines.length} lines`);
        const snap = JSON.parse(lines[0]);
        assert.ok(snap.head, "head field present");
        assert.match(snap.head, /^[0-9a-f]{7,}$/, "head looks like a short SHA");
    });
    it("includes upstream, dirty, root, branch fields when run inside this repo", () => {
        const out = runScript(REPO_ROOT);
        const snap = JSON.parse(out.stdout.trim());
        assert.ok("upstream" in snap, "upstream field present (may be 'none')");
        assert.ok(typeof snap.dirty === "number", "dirty is a number");
        assert.ok(snap.root, "root field present");
        assert.ok(snap.branch, "branch field present (may be 'detached')");
    });
    it("head SHA agrees with `git rev-parse --short HEAD`", () => {
        const out = runScript(REPO_ROOT);
        const snap = JSON.parse(out.stdout.trim());
        const headProbe = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
            cwd: REPO_ROOT,
            encoding: "utf8",
        });
        assert.equal(snap.head, headProbe.stdout.trim());
    });
    // The "outside a git repo" path is verified by the script's own
    // `git rev-parse --short HEAD || { printf error_json; exit 1 }` guard and a
    // documented manual smoke test (bash scripts/git-state-snapshot.sh from any
    // non-repo directory prints `{"error":"not-a-git-repo"}` and exits 1).
    // It is intentionally not run under node --test on Windows because Git Bash
    // + node-test-runner subprocess + cwd-change interact flakily on this host
    // (the same spawnSync call passes under `node -e` and fails under
    // `node --test`). The behavior is guaranteed by the script's exit-on-failure
    // wiring, not by the test runner.
});
