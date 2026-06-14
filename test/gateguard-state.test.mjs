/**
 * Unit tests for gateguard-state path canonicalization + the shared clearance
 * writer. Canonicalization is what lets the hook and any clearance helper agree
 * on the session dir and the per-file key regardless of drive-letter case or
 * path separator — the root cause of the marker-seeding fragility.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { MAX_CLEARED_FILES, STATE_TTL_MS, canonicalizeFileKey, canonicalizeProjectRoot, clearFiles, isFileCleared, loadState, markFileCleared, resolveSessionDir, } from "../lib/gateguard-state.mjs";
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
