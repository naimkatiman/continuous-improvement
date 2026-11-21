/**
 * Unit tests for gateguard-state path canonicalization + the shared clearance
 * writer. Canonicalization is what lets the hook and any clearance helper agree
 * on the session dir and the per-file key regardless of drive-letter case or
 * path separator — the root cause of the marker-seeding fragility.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { MAX_CLEARED_FILES, STATE_TTL_MS, canonicalizeFileKey, canonicalizeProjectRoot, clearFiles, hashProjectRoot, isFileCleared, loadState, markFileCleared, resolveMaxClearedFiles, resolveSessionDir, saveState, writeFileAtomic, } from "../lib/gateguard-state.mjs";
describe("resolveMaxClearedFiles", () => {
    it("defaults to 1000 distinct files per session", () => {
        assert.equal(resolveMaxClearedFiles({}), 1000);
    });
    it("honours a positive integer GATEGUARD_MAX_CLEARED_FILES", () => {
        assert.equal(resolveMaxClearedFiles({ GATEGUARD_MAX_CLEARED_FILES: "5000" }), 5000);
        assert.equal(resolveMaxClearedFiles({ GATEGUARD_MAX_CLEARED_FILES: "25" }), 25);
    });
    it("ignores a missing, zero, negative or non-numeric override", () => {
        for (const value of ["", "0", "-3", "lots", "1.5e"]) {
            assert.equal(resolveMaxClearedFiles({ GATEGUARD_MAX_CLEARED_FILES: value }), 1000, value);
        }
    });
    it("MAX_CLEARED_FILES is the resolved value for this process", () => {
        assert.equal(MAX_CLEARED_FILES, resolveMaxClearedFiles(process.env));
    });
});
describe("canonicalizeProjectRoot", () => {
    it("lowercases a Windows drive letter", () => {
        assert.equal(canonicalizeProjectRoot("D:/Ai/x"), "d:/Ai/x");
    });
    it("converts backslashes to forward slashes", () => {
        assert.equal(canonicalizeProjectRoot("d:\\Ai\\x"), "d:/Ai/x");
    });
    it("normalizes drive case AND separators together", () => {
        assert.equal(canonicalizeProjectRoot("D:\\Ai\\x"), "d:/Ai/x");
    });
    it("strips a trailing slash", () => {
        assert.equal(canonicalizeProjectRoot("d:/Ai/x/"), "d:/Ai/x");
    });
    it("collapses multiple trailing slashes", () => {
        assert.equal(canonicalizeProjectRoot("d:/proj//"), "d:/proj");
        assert.equal(canonicalizeFileKey("d:/Ai/x///"), "d:/Ai/x");
    });
    it("leaves a POSIX path unchanged", () => {
        assert.equal(canonicalizeProjectRoot("/home/u/x"), "/home/u/x");
    });
    it("leaves a relative path unchanged", () => {
        assert.equal(canonicalizeProjectRoot("x"), "x");
    });
});
describe("hashProjectRoot", () => {
    it("hashes C:/, c:/, and backslash forms to the same id", () => {
        const a = hashProjectRoot("C:/Ai/DrSaid-standup");
        const b = hashProjectRoot("c:/Ai/DrSaid-standup");
        const c = hashProjectRoot("C:\\Ai\\DrSaid-standup");
        assert.equal(a, b);
        assert.equal(a, c);
        assert.match(a, /^[0-9a-f]{12}$/);
    });
});
describe("canonicalizeFileKey", () => {
    it("normalizes drive case and separators", () => {
        assert.equal(canonicalizeFileKey("D:\\Ai\\x\\a.ts"), "d:/Ai/x/a.ts");
    });
    it("is a no-op on relative keys so existing test keys keep matching", () => {
        assert.equal(canonicalizeFileKey("scratch.txt"), "scratch.txt");
    });
    it("does NOT lowercase directory/file names, only the drive letter", () => {
        assert.equal(canonicalizeFileKey("D:/Ai/MyDir/File.TS"), "d:/Ai/MyDir/File.TS");
    });
});
describe("resolveSessionDir canonical hashing", () => {
    it("resolves drive-case/separator-equivalent roots to the same dir", () => {
        const prevProj = process.env.CLAUDE_PROJECT_DIR;
        const prevSess = process.env.GATEGUARD_SESSION_DIR;
        try {
            delete process.env.GATEGUARD_SESSION_DIR;
            process.env.CLAUDE_PROJECT_DIR = "d:\\Ai\\continuous-improvement";
            const a = resolveSessionDir();
            process.env.CLAUDE_PROJECT_DIR = "D:/Ai/continuous-improvement/";
            const b = resolveSessionDir();
            assert.equal(a, b);
        }
        finally {
            if (prevProj === undefined)
                delete process.env.CLAUDE_PROJECT_DIR;
            else
                process.env.CLAUDE_PROJECT_DIR = prevProj;
            if (prevSess === undefined)
                delete process.env.GATEGUARD_SESSION_DIR;
            else
                process.env.GATEGUARD_SESSION_DIR = prevSess;
        }
    });
});
describe("resolveSessionDir session scoping", () => {
    let prevProj;
    let prevSess;
    before(() => {
        prevProj = process.env.CLAUDE_PROJECT_DIR;
        prevSess = process.env.GATEGUARD_SESSION_DIR;
        delete process.env.GATEGUARD_SESSION_DIR;
        process.env.CLAUDE_PROJECT_DIR = "d:/Ai/continuous-improvement";
    });
    after(() => {
        if (prevProj === undefined)
            delete process.env.CLAUDE_PROJECT_DIR;
        else
            process.env.CLAUDE_PROJECT_DIR = prevProj;
        if (prevSess === undefined)
            delete process.env.GATEGUARD_SESSION_DIR;
        else
            process.env.GATEGUARD_SESSION_DIR = prevSess;
    });
    it("nests a session id under a sessions/ subdir of the legacy project dir", () => {
        const legacy = resolveSessionDir();
        assert.equal(resolveSessionDir("sess-A"), join(legacy, "sessions", "sess-A"));
    });
    it("gives different session ids different dirs", () => {
        assert.notEqual(resolveSessionDir("sess-A"), resolveSessionDir("sess-B"));
    });
    it("is deterministic for the same session id", () => {
        assert.equal(resolveSessionDir("sess-A"), resolveSessionDir("sess-A"));
    });
    it("falls back to the legacy unscoped dir with no session id (back-compat)", () => {
        const legacy = resolveSessionDir();
        assert.ok(!legacy.split(/[\\/]/).includes("sessions"), "legacy dir has no sessions/ segment");
        assert.notEqual(resolveSessionDir("sess-A"), legacy);
    });
    it("treats an empty session id as no session id", () => {
        assert.equal(resolveSessionDir(""), resolveSessionDir());
    });
    it("sanitizes a traversal session id so it cannot escape the sessions/ dir", () => {
        const base = join(resolveSessionDir(), "sessions");
        const scoped = resolveSessionDir("../../etc/passwd");
        assert.ok(scoped.startsWith(base), "stays under sessions/");
        assert.ok(!scoped.split(/[\\/]/).includes(".."), "no .. segment survives sanitization");
    });
    it("maps an all-unsafe session id to a pure-underscore segment (degenerate input)", () => {
        const base = join(resolveSessionDir(), "sessions");
        assert.equal(resolveSessionDir("@@@"), join(base, "___"));
    });
    it("caps the session id at 64 chars with replace happening before slice", () => {
        const base = join(resolveSessionDir(), "sessions");
        assert.equal(resolveSessionDir("a".repeat(65)), join(base, "a".repeat(64)));
        // 65 unsafe chars: every one is replaced first, then sliced to 64 — no
        // traversal sequence can survive the order of operations.
        const scopedUnsafe = resolveSessionDir("/".repeat(65));
        assert.equal(scopedUnsafe, join(base, "_".repeat(64)));
        assert.ok(!scopedUnsafe.split(/[\\/]/).includes(".."), "no .. survives");
    });
    it("env override wins and ignores the session id", () => {
        const override = join(tmpdir(), "gg-override");
        process.env.GATEGUARD_SESSION_DIR = override;
        try {
            assert.equal(resolveSessionDir("sess-A"), override);
        }
        finally {
            delete process.env.GATEGUARD_SESSION_DIR;
        }
    });
});
describe("loadState TTL self-heal", () => {
    let dir = "";
    before(() => {
        dir = mkdtempSync(join(tmpdir(), "gg-ttl-"));
    });
    after(() => {
        rmSync(dir, { recursive: true, force: true });
    });
    function writeState(createdAt) {
        writeFileSync(join(dir, "gateguard-session.json"), `${JSON.stringify({ created_at: createdAt, cleared_files: { "d:/x.ts": { cleared_at: createdAt } } }, null, 2)}\n`);
    }
    it("resets cleared_files when created_at is older than STATE_TTL_MS", () => {
        writeState(new Date(Date.now() - STATE_TTL_MS - 60_000).toISOString());
        assert.deepEqual(loadState(dir).cleared_files, {});
    });
    it("preserves cleared_files within the TTL window", () => {
        writeState(new Date(Date.now() - 60_000).toISOString());
        assert.ok("d:/x.ts" in loadState(dir).cleared_files);
    });
    it("treats an unparseable created_at as expired (fail-closed)", () => {
        writeState("not-a-date");
        assert.deepEqual(loadState(dir).cleared_files, {});
    });
    it("treats a missing created_at field as expired (fail-closed)", () => {
        writeFileSync(join(dir, "gateguard-session.json"), `${JSON.stringify({ cleared_files: { "d:/x.ts": { cleared_at: "2020-01-01T00:00:00.000Z" } } }, null, 2)}\n`);
        assert.deepEqual(loadState(dir).cleared_files, {});
    });
    it("persists a fresh epoch on expiry so the cap re-applies immediately", () => {
        writeState(new Date(Date.now() - STATE_TTL_MS - 60_000).toISOString());
        const first = loadState(dir);
        const second = loadState(dir);
        assert.deepEqual(first.cleared_files, {});
        assert.deepEqual(second.cleared_files, {});
        // Without persistence the second load would re-read the still-expired file
        // and mint a NEW epoch; equality proves the first load wrote the reset, so
        // the cap counts from zero on the next call instead of resetting every load.
        assert.equal(first.created_at, second.created_at, "new epoch persisted, not regenerated each load");
    });
});
describe("markFileCleared / isFileCleared canonical matching", () => {
    it("markFileCleared stores the canonical key", () => {
        const state = markFileCleared({ created_at: "t", cleared_files: {} }, "D:\\Ai\\a.ts");
        assert.ok("d:/Ai/a.ts" in state.cleared_files);
    });
    it("isFileCleared matches across drive-case and separator forms", () => {
        const state = markFileCleared({ created_at: "t", cleared_files: {} }, "D:\\Ai\\a.ts");
        assert.equal(isFileCleared(state, "d:/Ai/a.ts"), true);
        assert.equal(isFileCleared(state, "D:\\Ai\\a.ts"), true);
        assert.equal(isFileCleared(state, "d:\\Ai\\a.ts"), true);
    });
    it("isFileCleared is false for an uncleared file", () => {
        const state = markFileCleared({ created_at: "t", cleared_files: {} }, "D:\\Ai\\a.ts");
        assert.equal(isFileCleared(state, "d:/Ai/b.ts"), false);
    });
});
describe("clearFiles shared writer", () => {
    let dir = "";
    before(() => {
        dir = mkdtempSync(join(tmpdir(), "gg-state-"));
    });
    after(() => {
        rmSync(dir, { recursive: true, force: true });
    });
    it("writes canonical markers and reports them cleared", () => {
        const result = clearFiles(dir, ["D:\\Ai\\a.ts", "d:/Ai/b.ts"]);
        assert.deepEqual([...result.cleared].sort(), ["d:/Ai/a.ts", "d:/Ai/b.ts"]);
        const state = loadState(dir);
        assert.ok("d:/Ai/a.ts" in state.cleared_files);
        assert.ok("d:/Ai/b.ts" in state.cleared_files);
    });
    it("is idempotent across path forms for the same canonical key", () => {
        clearFiles(dir, ["D:\\Ai\\c.ts"]);
        const before = Object.keys(loadState(dir).cleared_files).length;
        clearFiles(dir, ["d:/Ai/c.ts"]);
        assert.equal(Object.keys(loadState(dir).cleared_files).length, before);
    });
    it("respects the cap and reports skipped files", () => {
        const capDir = mkdtempSync(join(tmpdir(), "gg-cap-"));
        try {
            const seed = Array.from({ length: MAX_CLEARED_FILES }, (_, i) => `/seed/${i}.ts`);
            clearFiles(capDir, seed);
            const result = clearFiles(capDir, ["/over/the/cap.ts"]);
            assert.deepEqual(result.cleared, []);
            assert.deepEqual(result.skippedForCap, ["/over/the/cap.ts"]);
        }
        finally {
            rmSync(capDir, { recursive: true, force: true });
        }
    });
});
describe("writeFileAtomic", () => {
    let dir = "";
    before(() => {
        dir = mkdtempSync(join(tmpdir(), "gg-atomic-"));
    });
    after(() => {
        rmSync(dir, { recursive: true, force: true });
    });
    function codedError(code) {
        const err = new Error(`${code}: simulated rename failure`);
        err.code = code;
        return err;
    }
    // Throws one simulated error per queued code, then does a real move, and
    // records every (from, to) pair so a test can see where the temp file was.
    function flakyRename(failures) {
        const calls = [];
        const queue = [...failures];
        return {
            calls,
            rename: (from, to) => {
                calls.push([from, to]);
                const code = queue.shift();
                if (code)
                    throw codedError(code);
                writeFileSync(to, readFileSync(from));
                rmSync(from);
            },
        };
    }
    function leftovers(target) {
        return readdirSync(dirname(target)).filter((name) => name !== "state.json");
    }
    it("writes the data and leaves no temp file behind", () => {
        const sub = mkdtempSync(join(dir, "plain-"));
        const target = join(sub, "state.json");
        writeFileAtomic(target, "{\"a\":1}\n");
        assert.equal(readFileSync(target, "utf8"), "{\"a\":1}\n");
        assert.deepEqual(leftovers(target), []);
    });
    it("writes the temp file in the target's directory and renames it over the target", () => {
        const sub = mkdtempSync(join(dir, "same-dir-"));
        const target = join(sub, "state.json");
        const fake = flakyRename([]);
        writeFileAtomic(target, "x", fake.rename);
        assert.equal(fake.calls.length, 1);
        const [from, to] = fake.calls[0];
        assert.equal(to, target);
        assert.notEqual(from, target);
        assert.equal(dirname(from), dirname(target), "a cross-directory rename is not atomic");
    });
    for (const code of ["EPERM", "EBUSY"]) {
        it(`retries the rename once on ${code} and succeeds`, () => {
            const sub = mkdtempSync(join(dir, `retry-${code}-`));
            const target = join(sub, "state.json");
            const fake = flakyRename([code]);
            writeFileAtomic(target, "after", fake.rename);
            assert.equal(fake.calls.length, 2);
            assert.equal(readFileSync(target, "utf8"), "after");
            assert.deepEqual(leftovers(target), []);
        });
    }
    it("throws after a second EPERM, keeps the old file and removes the temp file", () => {
        const sub = mkdtempSync(join(dir, "twice-"));
        const target = join(sub, "state.json");
        writeFileSync(target, "before");
        const fake = flakyRename(["EPERM", "EPERM"]);
        assert.throws(() => writeFileAtomic(target, "after", fake.rename), { code: "EPERM" });
        assert.equal(fake.calls.length, 2, "exactly one retry");
        assert.equal(readFileSync(target, "utf8"), "before");
        assert.deepEqual(leftovers(target), []);
    });
    for (const code of ["EACCES", "ENOENT", "EXDEV"]) {
        it(`does not retry ${code}, throws it and removes the temp file`, () => {
            const sub = mkdtempSync(join(dir, `noretry-${code}-`));
            const target = join(sub, "state.json");
            writeFileSync(target, "before");
            const fake = flakyRename([code]);
            assert.throws(() => writeFileAtomic(target, "after", fake.rename), { code });
            assert.equal(fake.calls.length, 1);
            assert.equal(readFileSync(target, "utf8"), "before");
            assert.deepEqual(leftovers(target), []);
        });
    }
    it("does not retry an error that carries no code", () => {
        const sub = mkdtempSync(join(dir, "nocode-"));
        const target = join(sub, "state.json");
        let calls = 0;
        const rename = () => {
            calls += 1;
            throw new Error("no code");
        };
        assert.throws(() => writeFileAtomic(target, "after", rename), /no code/);
        assert.equal(calls, 1);
        assert.deepEqual(leftovers(target), []);
    });
});
describe("saveState concurrency", () => {
    let dir = "";
    const libUrl = new URL("../lib/gateguard-state.mjs", import.meta.url).href;
    before(() => {
        dir = mkdtempSync(join(tmpdir(), "gg-race-"));
    });
    after(() => {
        rmSync(dir, { recursive: true, force: true });
    });
    it("keeps the on-disk format: pretty JSON with a trailing newline", () => {
        const sub = mkdtempSync(join(dir, "format-"));
        const state = { created_at: "2026-11-21T00:00:00.000Z", cleared_files: { "d:/a.ts": { cleared_at: "t" } } };
        saveState(sub, state);
        assert.equal(readFileSync(join(sub, "gateguard-session.json"), "utf8"), `${JSON.stringify(state, null, 2)}\n`);
        assert.deepEqual(readdirSync(sub), ["gateguard-session.json"]);
    });
    function runNode(script, args) {
        return new Promise((resolve, reject) => {
            const child = spawn(process.execPath, ["--input-type=module", "-e", script, ...args], {
                stdio: ["ignore", "pipe", "pipe"],
            });
            let out = "";
            let err = "";
            child.stdout.on("data", (chunk) => (out += chunk.toString()));
            child.stderr.on("data", (chunk) => (err += chunk.toString()));
            child.on("error", reject);
            child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`exit ${code}: ${err}`))));
        });
    }
    // Each writer saves a large state whose every value names the writer, so a
    // torn read fails JSON.parse and an interleaved one mixes writer ids. A
    // writer error (a rename that still loses to a reader after its one retry)
    // is counted and tolerated: a lost cache write is the hook's existing policy,
    // a torn file is not.
    const KEYS = 3000;
    const ROUNDS = 60;
    const WRITER = `
    const [url, sessionDir, id, rounds, keys] = process.argv.slice(1);
    const { saveState } = await import(url);
    const cleared_files = {};
    for (let i = 0; i < Number(keys); i++) cleared_files["w" + id + "/" + "f".repeat(20) + i + ".ts"] = { cleared_at: "w" + id };
    let failed = 0;
    for (let r = 0; r < Number(rounds); r++) {
      try { saveState(sessionDir, { created_at: new Date().toISOString(), cleared_files }); } catch { failed++; }
    }
    process.stdout.write(JSON.stringify({ failed }));
  `;
    const READER = `
    const { existsSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const [sessionDir, keys] = process.argv.slice(1);
    const target = join(sessionDir, "gateguard-session.json");
    const stop = join(sessionDir, "stop");
    const verdict = (raw) => {
      let parsed;
      try { parsed = JSON.parse(raw); } catch { return "torn"; }
      const values = Object.values(parsed.cleared_files ?? {});
      if (values.length === 0) return "seed";
      const ids = new Set(values.map((v) => v.cleared_at));
      return ids.size === 1 && values.length === Number(keys) ? "whole" : "interleaved";
    };
    const counts = { whole: 0, seed: 0, torn: 0, interleaved: 0, readError: 0 };
    while (!existsSync(stop)) {
      let raw;
      try { raw = readFileSync(target, "utf8"); } catch { counts.readError++; continue; }
      counts[verdict(raw)]++;
    }
    process.stdout.write(JSON.stringify(counts));
  `;
    it("concurrent writers never leave a truncated or interleaved file", async () => {
        const sessionDir = mkdtempSync(join(dir, "race-"));
        const target = join(sessionDir, "gateguard-session.json");
        saveState(sessionDir, { created_at: new Date().toISOString(), cleared_files: {} });
        const reader = runNode(READER, [sessionDir, String(KEYS)]);
        const writers = ["1", "2", "3", "4"].map((id) => runNode(WRITER, [libUrl, sessionDir, id, String(ROUNDS), String(KEYS)]));
        const results = (await Promise.all(writers)).map((out) => JSON.parse(out));
        writeFileSync(join(sessionDir, "stop"), "");
        const counts = JSON.parse(await reader);
        const seen = JSON.stringify({ counts, results });
        assert.equal(counts.torn, 0, `torn reads: ${seen}`);
        assert.equal(counts.interleaved, 0, `interleaved reads: ${seen}`);
        assert.ok(counts.whole > 0, `the reader never saw a complete state: ${seen}`);
        const failed = results.reduce((sum, r) => sum + r.failed, 0);
        assert.ok(failed < results.length * ROUNDS, `every write failed: ${seen}`);
        const final = JSON.parse(readFileSync(target, "utf8"));
        const values = Object.values(final.cleared_files);
        assert.equal(values.length, KEYS);
        assert.equal(new Set(values.map((v) => v.cleared_at)).size, 1, "the final file holds one writer's state");
        const strays = readdirSync(sessionDir).filter((name) => name !== "gateguard-session.json" && name !== "stop");
        assert.deepEqual(strays, [], "no temp files left behind");
        assert.equal(existsSync(target), true);
    });
});
