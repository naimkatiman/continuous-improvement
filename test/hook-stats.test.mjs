import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CLI = join(REPO_ROOT, "bin", "hook-stats.mjs");
function makeEntry(overrides = {}) {
    return {
        ts: new Date().toISOString(),
        hook: "three-section-close",
        action: "pass",
        textLength: 1200,
        missing: [],
        durationMs: 5,
        ...overrides,
    };
}
function writeJsonl(file, entries) {
    const body = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    writeFileSync(file, body, "utf8");
}
function runCli(args) {
    const result = spawnSync(process.execPath, [CLI, ...args], {
        encoding: "utf8",
        timeout: 10000,
    });
    if (result.error)
        throw result.error;
    return {
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
    };
}
describe("hook-stats CLI", () => {
    const tempDirs = [];
    function freshTelemetryDir() {
        const dir = mkdtempSync(join(tmpdir(), "hook-stats-test-"));
        tempDirs.push(dir);
        return dir;
    }
    after(() => {
        for (const dir of tempDirs) {
            rmSync(dir, { recursive: true, force: true });
        }
    });
    it("--help exits 0 and prints usage on stdout", () => {
        const res = runCli(["--help"]);
        assert.equal(res.status, 0, `stderr: ${res.stderr}`);
        assert.match(res.stdout, /Usage: node bin\/hook-stats\.mjs/);
        assert.match(res.stdout, /--hours=<n>/);
        assert.match(res.stdout, /--hash=<hash>/);
        assert.match(res.stdout, /--telemetry-dir=<path>/);
    });
    it("happy path: aggregates pass/block/skip-short counts and avg duration", () => {
        const dir = freshTelemetryDir();
        const file = join(dir, "abcdef012345.jsonl");
        const now = Date.now();
        const entries = [];
        // 5 pass with durationMs 10
        for (let i = 0; i < 5; i++) {
            entries.push(makeEntry({
                ts: new Date(now - i * 60_000).toISOString(),
                action: "pass",
                durationMs: 10,
            }));
        }
        // 3 block with durationMs 20
        for (let i = 0; i < 3; i++) {
            entries.push(makeEntry({
                ts: new Date(now - (i + 5) * 60_000).toISOString(),
                action: "block",
                durationMs: 20,
            }));
        }
        // 2 skip-short with durationMs 30
        for (let i = 0; i < 2; i++) {
            entries.push(makeEntry({
                ts: new Date(now - (i + 8) * 60_000).toISOString(),
                action: "skip-short",
                durationMs: 30,
            }));
        }
        writeJsonl(file, entries);
        const res = runCli([`--telemetry-dir=${dir}`, "--hours=24"]);
        assert.equal(res.status, 0, `stderr: ${res.stderr}`);
        // avg = (5*10 + 3*20 + 2*30) / 10 = (50 + 60 + 60) / 10 = 17 (rounded)
        assert.match(res.stdout, /three-section-close last 24h: pass=5 block=3 skip-short=2 total=10 avg-duration=17ms/);
    });
    it("filters out records older than the --hours window", () => {
        const dir = freshTelemetryDir();
        const file = join(dir, "deadbeef0001.jsonl");
        const now = Date.now();
        const fresh1 = makeEntry({
            ts: new Date(now - 60_000).toISOString(),
            action: "pass",
            durationMs: 4,
        });
        const fresh2 = makeEntry({
            ts: new Date(now - 120_000).toISOString(),
            action: "block",
            durationMs: 6,
        });
        const stale = makeEntry({
            ts: new Date(now - 48 * 3600 * 1000).toISOString(),
            action: "pass",
            durationMs: 999,
        });
        writeJsonl(file, [fresh1, fresh2, stale]);
        const res = runCli([`--telemetry-dir=${dir}`, "--hours=24"]);
        assert.equal(res.status, 0, `stderr: ${res.stderr}`);
        // Only the 2 fresh records counted; avg = (4 + 6)/2 = 5
        assert.match(res.stdout, /three-section-close last 24h: pass=1 block=1 skip-short=0 total=2 avg-duration=5ms/);
    });
    it("tolerates malformed JSONL lines and counts only valid records", () => {
        const dir = freshTelemetryDir();
        const file = join(dir, "ffffffffffff.jsonl");
        const now = Date.now();
        const valid1 = JSON.stringify(makeEntry({
            ts: new Date(now - 60_000).toISOString(),
            action: "pass",
            durationMs: 8,
        }));
        const valid2 = JSON.stringify(makeEntry({
            ts: new Date(now - 120_000).toISOString(),
            action: "block",
            durationMs: 12,
        }));
        // Garbage between valid lines and at the end.
        const body = [valid1, "{not-json", "", valid2, "trailing garbage"].join("\n");
        writeFileSync(file, body + "\n", "utf8");
        const res = runCli([`--telemetry-dir=${dir}`, "--hours=24"]);
        assert.equal(res.status, 0, `stderr: ${res.stderr}`);
        assert.match(res.stdout, /three-section-close last 24h: pass=1 block=1 skip-short=0 total=2 avg-duration=10ms/);
    });
    it("prints 'no records' when telemetry dir exists but has no JSONL files", () => {
        const dir = freshTelemetryDir();
        const res = runCli([`--telemetry-dir=${dir}`, "--hours=24"]);
        assert.equal(res.status, 0, `stderr: ${res.stderr}`);
        assert.match(res.stdout, /no records in last 24h/);
    });
    it("--hash filter restricts reading to a single <hash>.jsonl file", () => {
        const dir = freshTelemetryDir();
        const fileA = join(dir, "aaaaaaaaaaaa.jsonl");
        const fileB = join(dir, "bbbbbbbbbbbb.jsonl");
        const now = Date.now();
        writeJsonl(fileA, [
            makeEntry({
                ts: new Date(now - 60_000).toISOString(),
                action: "pass",
                durationMs: 7,
                hook: "three-section-close",
            }),
        ]);
        writeJsonl(fileB, [
            makeEntry({
                ts: new Date(now - 60_000).toISOString(),
                action: "block",
                durationMs: 999,
                hook: "three-section-close",
            }),
            makeEntry({
                ts: new Date(now - 90_000).toISOString(),
                action: "block",
                durationMs: 999,
                hook: "three-section-close",
            }),
        ]);
        const res = runCli([
            `--telemetry-dir=${dir}`,
            "--hours=24",
            "--hash=aaaaaaaaaaaa",
        ]);
        assert.equal(res.status, 0, `stderr: ${res.stderr}`);
        assert.match(res.stdout, /three-section-close last 24h: pass=1 block=0 skip-short=0 total=1 avg-duration=7ms/);
        // Should NOT include the bbbb file's records.
        assert.doesNotMatch(res.stdout, /total=2/);
        assert.doesNotMatch(res.stdout, /total=3/);
    });
    it("groups multiple hooks separately in output", () => {
        const dir = freshTelemetryDir();
        const file = join(dir, "112233445566.jsonl");
        const now = Date.now();
        const entries = [
            makeEntry({
                ts: new Date(now - 30_000).toISOString(),
                hook: "alpha-hook",
                action: "pass",
                durationMs: 2,
            }),
            makeEntry({
                ts: new Date(now - 30_000).toISOString(),
                hook: "alpha-hook",
                action: "pass",
                durationMs: 4,
            }),
            makeEntry({
                ts: new Date(now - 30_000).toISOString(),
                hook: "beta-hook",
                action: "block",
                durationMs: 100,
            }),
        ];
        writeJsonl(file, entries);
        const res = runCli([`--telemetry-dir=${dir}`, "--hours=24"]);
        assert.equal(res.status, 0, `stderr: ${res.stderr}`);
        assert.match(res.stdout, /alpha-hook last 24h: pass=2 block=0 skip-short=0 total=2 avg-duration=3ms/);
        assert.match(res.stdout, /beta-hook last 24h: pass=0 block=1 skip-short=0 total=1 avg-duration=100ms/);
    });
    it("appends are visible: re-running picks up newly added lines", () => {
        const dir = freshTelemetryDir();
        const file = join(dir, "0011223344aa.jsonl");
        const now = Date.now();
        writeJsonl(file, [
            makeEntry({
                ts: new Date(now - 30_000).toISOString(),
                action: "pass",
                durationMs: 5,
            }),
        ]);
        let res = runCli([`--telemetry-dir=${dir}`, "--hours=24"]);
        assert.match(res.stdout, /total=1/);
        appendFileSync(file, JSON.stringify(makeEntry({
            ts: new Date().toISOString(),
            action: "block",
            durationMs: 9,
        })) + "\n", "utf8");
        res = runCli([`--telemetry-dir=${dir}`, "--hours=24"]);
        assert.match(res.stdout, /three-section-close last 24h: pass=1 block=1 skip-short=0 total=2 avg-duration=7ms/);
    });
});
