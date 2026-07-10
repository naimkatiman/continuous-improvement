/**
 * Integration tests for the query-cost nudge Stop hook (RISA 5 / G5).
 * Spawns hooks/query-cost-nudge.mjs against throwaway temp git repos, with HOME
 * pinned to a temp dir so the per-session dedup marker is isolated.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const HOOK_PATH = join(__dirname, "..", "hooks", "query-cost-nudge.mjs");
const scratch = [];
function tempDir(prefix) {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    scratch.push(dir);
    return dir;
}
function setupRepo(files) {
    const dir = tempDir("qc-repo-");
    execFileSync("git", ["init", "-q"], { cwd: dir });
    for (const [name, content] of Object.entries(files)) {
        const full = join(dir, name);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content);
    }
    execFileSync("git", ["add", "-A"], { cwd: dir });
    return dir;
}
function runHook(repo, home, mode, sessionId) {
    const env = {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        CLAUDE_PROJECT_DIR: repo,
    };
    if (mode === undefined)
        delete env.CLAUDE_QUERY_COST_NUDGE;
    else
        env.CLAUDE_QUERY_COST_NUDGE = mode;
    const result = spawnSync(process.execPath, [HOOK_PATH], {
        input: JSON.stringify({ session_id: sessionId }),
        encoding: "utf8",
        env,
    });
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
    const stdout = result.stdout.trim();
    if (stdout === "")
        return { nudged: false };
    const parsed = JSON.parse(stdout);
    return { nudged: true, context: parsed.hookSpecificOutput?.additionalContext };
}
describe("hooks/query-cost-nudge.mjs (RISA 5 / G5)", () => {
    after(() => {
        for (const dir of scratch)
            rmSync(dir, { recursive: true, force: true });
    });
    it("on + changed migration file → nudges with the cost checklist", () => {
        const repo = setupRepo({ "migrations/0001_init.sql": "CREATE TABLE t (id INTEGER);\n" });
        const home = tempDir("qc-home-");
        const res = runHook(repo, home, "on", "sess-A");
        assert.equal(res.nudged, true);
        assert.match(res.context ?? "", /migrations\/0001_init\.sql/);
        assert.match(res.context ?? "", /database-reviewer/);
        assert.match(res.context ?? "", /rows_read/);
    });
    it("on + untracked migration file → nudges with the cost checklist", () => {
        const repo = setupRepo({ "README.md": "fixture\n" });
        const migration = join(repo, "migrations", "0002_untracked.sql");
        mkdirSync(dirname(migration), { recursive: true });
        writeFileSync(migration, "ALTER TABLE t ADD COLUMN name TEXT;\n");
        const home = tempDir("qc-home-");
        const res = runHook(repo, home, "on", "sess-untracked");
        assert.equal(res.nudged, true);
        assert.match(res.context ?? "", /migrations\/0002_untracked\.sql/);
    });
    it("second Stop in the same session stays silent (dedup)", () => {
        const repo = setupRepo({ "db/queries.sql": "SELECT 1;\n" });
        const home = tempDir("qc-home-");
        assert.equal(runHook(repo, home, "on", "sess-B").nudged, true, "first Stop nudges");
        assert.equal(runHook(repo, home, "on", "sess-B").nudged, false, "second Stop is deduped");
    });
    it("no changed DB/query file → silent", () => {
        const repo = setupRepo({ "src/Button.tsx": "export const B = 1;\n" });
        const home = tempDir("qc-home-");
        assert.equal(runHook(repo, home, "on", "sess-C").nudged, false);
    });
    it("off (default) → silent even with a changed .sql file", () => {
        const repo = setupRepo({ "schema.sql": "CREATE TABLE t (id INTEGER);\n" });
        const home = tempDir("qc-home-");
        assert.equal(runHook(repo, home, undefined, "sess-D").nudged, false);
    });
});
