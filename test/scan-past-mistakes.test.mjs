import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
assert.ok(existsSync(join(REPO_ROOT, "package.json")), `REPO_ROOT sanity check failed — ${REPO_ROOT}/package.json not found`);
const SCRIPT = join(REPO_ROOT, "scripts", "scan-past-mistakes.mjs");
function runJson(args) {
    const result = spawnSync("node", [SCRIPT, "--json", ...args], { encoding: "utf8" });
    let scan = null;
    if (result.stdout) {
        try {
            scan = JSON.parse(result.stdout);
        }
        catch {
            // leave null
        }
    }
    return {
        exitCode: result.status ?? -1,
        scan,
        stderr: (result.stderr ?? "").trim(),
        stdout: result.stdout ?? "",
    };
}
function runPretty(args) {
    const result = spawnSync("node", [SCRIPT, ...args], { encoding: "utf8" });
    return {
        exitCode: result.status ?? -1,
        stdout: result.stdout ?? "",
        stderr: (result.stderr ?? "").trim(),
    };
}
function makeTempScope() {
    const dir = mkdtempSync(join(tmpdir(), "scan-past-mistakes-test-"));
    return {
        dir,
        obsPath: join(dir, "observations.jsonl"),
        memDir: join(dir, "memory"),
        claudeMdPath: join(dir, "CLAUDE.md"),
    };
}
function explicitArgs(scope) {
    return [
        "--observations", scope.obsPath,
        "--memory-dir", scope.memDir,
        "--claude-md", scope.claudeMdPath,
    ];
}
describe("scripts/scan-past-mistakes.mjs", () => {
    it("emits 'No prior mistakes recorded' when all three surfaces are empty/missing", () => {
        const scope = makeTempScope();
        try {
            const out = runPretty(explicitArgs(scope));
            assert.equal(out.exitCode, 0, `stderr: ${out.stderr}`);
            assert.match(out.stdout, /No prior mistakes recorded/);
        }
        finally {
            rmSync(scope.dir, { recursive: true, force: true });
        }
    });
    it("filters observations.jsonl by type: failure or correction", () => {
        const scope = makeTempScope();
        try {
            const lines = [
                JSON.stringify({ ts: "2026-01-01T00:00:00Z", type: "tool_call" }),
                JSON.stringify({ ts: "2026-01-02T00:00:00Z", type: "failure", summary: "build broke" }),
                JSON.stringify({ ts: "2026-01-03T00:00:00Z", type: "correction", summary: "operator corrected approach" }),
                JSON.stringify({ ts: "2026-01-04T00:00:00Z", type: "success" }),
            ];
            writeFileSync(scope.obsPath, lines.join("\n") + "\n");
            const out = runJson(explicitArgs(scope));
            assert.equal(out.exitCode, 0, `stderr: ${out.stderr}`);
            assert.equal(out.scan.observations.length, 2);
            assert.equal(out.scan.observations[0].type, "failure");
            assert.equal(out.scan.observations[1].type, "correction");
        }
        finally {
            rmSync(scope.dir, { recursive: true, force: true });
        }
    });
    it("limits observations to --max-observations (default 10) most recent", () => {
        const scope = makeTempScope();
        try {
            const lines = [];
            for (let i = 1; i <= 15; i++) {
                lines.push(JSON.stringify({ ts: `2026-01-${String(i).padStart(2, "0")}T00:00:00Z`, type: "failure", summary: `failure ${i}` }));
            }
            writeFileSync(scope.obsPath, lines.join("\n") + "\n");
            const out = runJson(explicitArgs(scope));
            assert.equal(out.scan.observations.length, 10);
            // Last 10 means failures 6..15
            assert.match(out.scan.observations[0].summary, /failure 6$/);
            assert.match(out.scan.observations[9].summary, /failure 15$/);
        }
        finally {
            rmSync(scope.dir, { recursive: true, force: true });
        }
    });
    it("scans feedback_*.md memory entries with type: feedback frontmatter", () => {
        const scope = makeTempScope();
        try {
            mkdirSync(scope.memDir, { recursive: true });
            writeFileSync(join(scope.memDir, "feedback_no_force_push.md"), "---\nname: No force push\ndescription: Force push erases history\ntype: feedback\n---\n\nDon't use --force on shared branches.\n");
            writeFileSync(join(scope.memDir, "feedback_test_isolation.md"), "---\nname: Test isolation\ndescription: Each test sets up its own data\ntype: feedback\n---\n\nNo shared state between tests.\n");
            // A non-feedback file in the same dir → ignored
            writeFileSync(join(scope.memDir, "user_profile.md"), "---\nname: User profile\ntype: user\n---\n\nUser is a senior engineer.\n");
            // A non-feedback_ prefix file → ignored
            writeFileSync(join(scope.memDir, "project_note.md"), "---\nname: Project note\ntype: project\n---\n\nProject deadline is Friday.\n");
            const out = runJson(explicitArgs(scope));
            assert.equal(out.scan.feedback.length, 2, "only the two feedback_* files");
            const names = out.scan.feedback.map((f) => f.name).sort();
            assert.deepEqual(names, ["No force push", "Test isolation"]);
        }
        finally {
            rmSync(scope.dir, { recursive: true, force: true });
        }
    });
    it("extracts past-mistake rows from CLAUDE.md '## Past Mistakes' table", () => {
        const scope = makeTempScope();
        try {
            writeFileSync(scope.claudeMdPath, [
                "# CLAUDE.md\n",
                "Some preamble.\n",
                "## Past Mistakes\n",
                "Dated entries.\n",
                "| Date | Mistake | Lesson | Enforcement |",
                "|---|---|---|---|",
                "| 2026-05-08 | Direct .mjs edit | .mts is source | verify:generated |",
                "| 2026-05-09 | git add . staged phantoms | Use explicit filenames | docs |",
                "## Another Section\n",
                "Should not appear.",
            ].join("\n"));
            const out = runJson(explicitArgs(scope));
            assert.equal(out.scan.claude_md.length, 2);
            assert.equal(out.scan.claude_md[0].date, "2026-05-08");
            assert.match(out.scan.claude_md[0].mistake, /\.mjs edit/);
            assert.equal(out.scan.claude_md[1].date, "2026-05-09");
        }
        finally {
            rmSync(scope.dir, { recursive: true, force: true });
        }
    });
    it("--json output is valid JSON with three top-level surfaces", () => {
        const scope = makeTempScope();
        try {
            const out = runJson(explicitArgs(scope));
            assert.equal(out.exitCode, 0);
            assert.ok(out.scan, "JSON parsed");
            assert.ok(Array.isArray(out.scan.observations));
            assert.ok(Array.isArray(out.scan.feedback));
            assert.ok(Array.isArray(out.scan.claude_md));
            assert.ok(out.scan.sources);
        }
        finally {
            rmSync(scope.dir, { recursive: true, force: true });
        }
    });
    it("default mode (no --json) prints a human-readable summary", () => {
        const scope = makeTempScope();
        try {
            mkdirSync(scope.memDir, { recursive: true });
            writeFileSync(join(scope.memDir, "feedback_alpha.md"), "---\nname: Alpha\ndescription: Alpha rule\ntype: feedback\n---\n\nbody\n");
            const out = runPretty(explicitArgs(scope));
            assert.equal(out.exitCode, 0);
            assert.match(out.stdout, /Past mistakes scanned/);
            assert.match(out.stdout, /feedback_alpha\.md/);
            assert.match(out.stdout, /Alpha rule/);
        }
        finally {
            rmSync(scope.dir, { recursive: true, force: true });
        }
    });
});
