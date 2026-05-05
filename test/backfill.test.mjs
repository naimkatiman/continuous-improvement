// backfill.test.mts — Coverage for `npx continuous-improvement backfill`.
//
// The backfill subcommand walks ~/.claude/instincts/<hash>/observations.jsonl
// files, detects "thin schema" rows (rows captured by the legacy bash
// fallback that lack `input_summary`), and tags each thin row with
// `schema: "thin"` so the analysis pass can skip them cleanly. Per the plan
// doc (Track B), this is a flag-pass, not a content-recovery — the original
// thin rows lack the input we'd need to fabricate richer fields.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const BACKFILL_BIN = join(REPO_ROOT, "bin", "backfill.mjs");
function makeTempHome() {
    const home = join(tmpdir(), `ci-backfill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(home, { recursive: true });
    return home;
}
function instinctsDirOf(home) {
    return join(home, ".claude", "instincts");
}
function makeProject(home, hash, rows) {
    const dir = join(instinctsDirOf(home), hash);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "observations.jsonl");
    writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
    writeFileSync(join(dir, "project.json"), JSON.stringify({ id: hash, name: `proj-${hash}`, root: `/tmp/${hash}`, created_at: "2026-05-05T00:00:00Z" }) + "\n", "utf8");
    return file;
}
function runBackfill(home, extraArgs = []) {
    return spawnSync("node", [BACKFILL_BIN, ...extraArgs], {
        env: { ...process.env, HOME: home, USERPROFILE: home },
        encoding: "utf8",
        timeout: 10_000,
    });
}
function readJsonl(file) {
    if (!existsSync(file))
        return [];
    return readFileSync(file, "utf8")
        .trim()
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line));
}
describe("backfill.mjs subcommand", () => {
    it("tags every thin row in a pure-thin file", () => {
        const home = makeTempHome();
        try {
            const file = makeProject(home, "aaaaaaaaaaaa", [
                // Thin schema: no input_summary or output_summary fields.
                { ts: "2026-04-29T01:00:00Z", event: "tool_start", session: "s1", tool: "Bash", project_id: "aaaaaaaaaaaa", project_name: "proj-a" },
                { ts: "2026-04-29T01:00:01Z", event: "tool_start", session: "s1", tool: "Edit", project_id: "aaaaaaaaaaaa", project_name: "proj-a" },
                { ts: "2026-04-29T01:00:02Z", event: "tool_start", session: "s1", tool: "Read", project_id: "aaaaaaaaaaaa", project_name: "proj-a" },
            ]);
            const result = runBackfill(home);
            assert.equal(result.status, 0, `stderr: ${result.stderr}`);
            const rows = readJsonl(file);
            assert.equal(rows.length, 3);
            for (const row of rows) {
                assert.equal(row.schema, "thin", `row missing thin tag: ${JSON.stringify(row)}`);
            }
        }
        finally {
            rmSync(home, { recursive: true, force: true });
        }
    });
    it("leaves rich rows untouched (no schema field added if input_summary present)", () => {
        const home = makeTempHome();
        try {
            const file = makeProject(home, "bbbbbbbbbbbb", [
                // Rich schema: has input_summary populated.
                { ts: "2026-05-05T01:00:00Z", event: "tool_start", session: "s2", tool: "Bash", input_summary: "git status", output_summary: "", project_id: "bbbbbbbbbbbb", project_name: "proj-b" },
            ]);
            const result = runBackfill(home);
            assert.equal(result.status, 0);
            const rows = readJsonl(file);
            assert.equal(rows.length, 1);
            assert.equal(rows[0].schema, "rich", "rich row should be tagged 'rich'");
            assert.equal(rows[0].input_summary, "git status", "input_summary preserved");
        }
        finally {
            rmSync(home, { recursive: true, force: true });
        }
    });
    it("handles a mixed file: tags thin, preserves rich content", () => {
        const home = makeTempHome();
        try {
            const file = makeProject(home, "cccccccccccc", [
                { ts: "t1", event: "tool_start", session: "s1", tool: "Bash", project_id: "cccccccccccc", project_name: "proj-c" }, // thin
                { ts: "t2", event: "tool_start", session: "s1", tool: "Edit", input_summary: "/x/y.ts", output_summary: "", project_id: "cccccccccccc", project_name: "proj-c" }, // rich
                { ts: "t3", event: "tool_start", session: "s1", tool: "Read", project_id: "cccccccccccc", project_name: "proj-c" }, // thin
            ]);
            const result = runBackfill(home);
            assert.equal(result.status, 0);
            const rows = readJsonl(file);
            assert.equal(rows.length, 3);
            assert.equal(rows[0].schema, "thin");
            assert.equal(rows[1].schema, "rich");
            assert.equal(rows[1].input_summary, "/x/y.ts", "rich input_summary preserved across backfill");
            assert.equal(rows[2].schema, "thin");
        }
        finally {
            rmSync(home, { recursive: true, force: true });
        }
    });
    it("emits a summary.json digest with per-project counts", () => {
        const home = makeTempHome();
        try {
            makeProject(home, "dddddddddddd", [
                { ts: "t1", event: "tool_start", session: "s1", tool: "Bash", project_id: "dddddddddddd", project_name: "proj-d" }, // thin
                { ts: "t2", event: "tool_start", session: "s1", tool: "Bash", input_summary: "ls", output_summary: "", project_id: "dddddddddddd", project_name: "proj-d" }, // rich
            ]);
            makeProject(home, "eeeeeeeeeeee", [
                { ts: "t3", event: "tool_start", session: "s2", tool: "Read", project_id: "eeeeeeeeeeee", project_name: "proj-e" }, // thin
            ]);
            const result = runBackfill(home);
            assert.equal(result.status, 0);
            const summaryPath = join(instinctsDirOf(home), "backfill-summary.json");
            assert.ok(existsSync(summaryPath), "summary.json must be written");
            const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
            assert.equal(summary.total, 3);
            assert.equal(summary.thin, 2);
            assert.equal(summary.rich, 1);
            assert.equal(summary.projects.dddddddddddd.thin, 1);
            assert.equal(summary.projects.dddddddddddd.rich, 1);
            assert.equal(summary.projects.eeeeeeeeeeee.thin, 1);
        }
        finally {
            rmSync(home, { recursive: true, force: true });
        }
    });
    it("skips corrupt JSON lines without crashing, logs to stderr", () => {
        const home = makeTempHome();
        try {
            const projectDir = join(instinctsDirOf(home), "ffffffffffff");
            mkdirSync(projectDir, { recursive: true });
            const file = join(projectDir, "observations.jsonl");
            writeFileSync(file, [
                JSON.stringify({ ts: "t1", event: "tool_start", session: "s", tool: "Bash", project_id: "ffffffffffff", project_name: "proj-f" }),
                "{not json",
                JSON.stringify({ ts: "t2", event: "tool_start", session: "s", tool: "Edit", input_summary: "/x", output_summary: "", project_id: "ffffffffffff", project_name: "proj-f" }),
            ].join("\n") + "\n", "utf8");
            const result = runBackfill(home);
            assert.equal(result.status, 0, "exit 0 even with corrupt rows");
            assert.match(result.stderr, /skipped|corrupt|invalid/i, "stderr should mention the corrupt row");
            const rows = readJsonl(file);
            assert.ok(rows.length >= 2, `expected at least 2 valid rows, got ${rows.length}`);
        }
        finally {
            rmSync(home, { recursive: true, force: true });
        }
    });
    it("is idempotent: re-running does not re-tag already-tagged rows", () => {
        const home = makeTempHome();
        try {
            const file = makeProject(home, "gggggggggggg", [
                { ts: "t1", event: "tool_start", session: "s", tool: "Bash", project_id: "gggggggggggg", project_name: "proj-g" },
            ]);
            const first = runBackfill(home);
            assert.equal(first.status, 0);
            const after1 = readFileSync(file, "utf8");
            const second = runBackfill(home);
            assert.equal(second.status, 0);
            const after2 = readFileSync(file, "utf8");
            assert.equal(after1, after2, "re-running backfill must produce a byte-identical file");
        }
        finally {
            rmSync(home, { recursive: true, force: true });
        }
    });
    it("creates a one-cycle backup before rewriting", () => {
        const home = makeTempHome();
        try {
            const file = makeProject(home, "hhhhhhhhhhhh", [
                { ts: "t1", event: "tool_start", session: "s", tool: "Bash", project_id: "hhhhhhhhhhhh", project_name: "proj-h" },
            ]);
            const result = runBackfill(home);
            assert.equal(result.status, 0);
            const backup = file + ".bak";
            assert.ok(existsSync(backup), ".bak file should exist after backfill");
        }
        finally {
            rmSync(home, { recursive: true, force: true });
        }
    });
    it("--dry-run reports counts without modifying files", () => {
        const home = makeTempHome();
        try {
            const file = makeProject(home, "iiiiiiiiiiii", [
                { ts: "t1", event: "tool_start", session: "s", tool: "Bash", project_id: "iiiiiiiiiiii", project_name: "proj-i" },
            ]);
            const before = readFileSync(file, "utf8");
            const result = runBackfill(home, ["--dry-run"]);
            assert.equal(result.status, 0);
            const after = readFileSync(file, "utf8");
            assert.equal(before, after, "dry-run must not modify observations.jsonl");
            assert.match(result.stdout, /thin|rich|total/i);
            const summaryPath = join(instinctsDirOf(home), "backfill-summary.json");
            assert.equal(existsSync(summaryPath), false, "dry-run should not write summary.json");
        }
        finally {
            rmSync(home, { recursive: true, force: true });
        }
    });
    it("exits 0 when there are no projects yet (fresh install)", () => {
        const home = makeTempHome();
        try {
            mkdirSync(instinctsDirOf(home), { recursive: true });
            const result = runBackfill(home);
            assert.equal(result.status, 0);
        }
        finally {
            rmSync(home, { recursive: true, force: true });
        }
    });
});
