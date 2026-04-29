import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
// __dirname resolves to <repo>/test/ at runtime (compiled .mjs lives under
// test/ per tsconfig outDir). Hook lives under <repo>/hooks/.
const HOOK_PATH = join(__dirname, "..", "hooks", "three-section-close.mjs");
const REQUIRED_HEADINGS = [
    "What has been done",
    "What is next",
    "Recommendation",
];
function projectHashFor(transcriptPath) {
    const dir = dirname(transcriptPath);
    let normalized = dir.split("\\").join("/");
    if (platform() === "win32")
        normalized = normalized.toLowerCase();
    return createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}
function writeAssistantTranscript(path, text) {
    const line = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text }] },
    });
    writeFileSync(path, `${line}\n`);
}
function buildIsolatedEnv(home) {
    // Strip the real HOME/USERPROFILE so the hook only sees our temp dir.
    // Process.env spread loses the inheritance, so we re-add PATH explicitly.
    const env = { ...process.env };
    delete env.HOME;
    delete env.USERPROFILE;
    env.HOME = home;
    // Windows resolves homedir from USERPROFILE; set it too so platform code
    // paths agree regardless of which is consulted first.
    env.USERPROFILE = home;
    return env;
}
function runHook(payload, env) {
    const result = spawnSync(process.execPath, [HOOK_PATH], {
        input: payload,
        env,
        encoding: "utf8",
        timeout: 5000,
    });
    if (result.error)
        throw result.error;
    return {
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
    };
}
function readTelemetryLines(home, transcriptPath) {
    const file = join(home, ".claude", "hook-telemetry", `${projectHashFor(transcriptPath)}.jsonl`);
    if (!existsSync(file))
        return [];
    const raw = readFileSync(file, "utf8");
    return raw
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
}
// Snapshot the real ~/.claude/hook-telemetry/ directory so tests can prove
// they did not leak telemetry into the developer's actual home dir while
// HOME/USERPROFILE were manipulated. Returns a Set of file basenames; an
// empty Set is returned if the directory does not exist.
function snapshotRealTelemetryDir() {
    const dir = join(homedir(), ".claude", "hook-telemetry");
    if (!existsSync(dir))
        return new Set();
    return new Set(readdirSync(dir));
}
function assertNoRealTelemetryLeak(before, label) {
    const after = snapshotRealTelemetryDir();
    const newFiles = [];
    for (const f of after) {
        if (!before.has(f))
            newFiles.push(f);
    }
    assert.deepEqual(newFiles, [], `${label}: hook leaked telemetry into real ~/.claude/hook-telemetry/: ${newFiles.join(", ")}`);
}
describe("three-section-close.mjs telemetry", () => {
    let rootTemp = "";
    before(() => {
        rootTemp = mkdtempSync(join(tmpdir(), "three-sec-root-"));
    });
    after(() => {
        rmSync(rootTemp, { recursive: true, force: true });
    });
    // Each test gets its own HOME so telemetry writes can't leak between cases.
    let home = "";
    let transcriptDir = "";
    beforeEach(() => {
        home = mkdtempSync(join(rootTemp, "home-"));
        transcriptDir = mkdtempSync(join(rootTemp, "transcripts-"));
    });
    it("records a pass entry for a compliant long reply", () => {
        const transcript = join(transcriptDir, "pass.jsonl");
        const body = [
            "Lots of substantive work prose. ".repeat(20),
            "## What has been done",
            "- changed things",
            "## What is next",
            "1. a\n2. b\n3. c\n4. d\n5. e",
            "## Recommendation",
            "1. ship it",
        ].join("\n\n");
        writeAssistantTranscript(transcript, body);
        const env = buildIsolatedEnv(home);
        const result = runHook(JSON.stringify({ transcript_path: transcript }), env);
        assert.equal(result.status, 0, "hook should exit 0");
        assert.equal(result.stdout, "", "no stdout on pass path");
        const entries = readTelemetryLines(home, transcript);
        assert.equal(entries.length, 1, "exactly one telemetry line written");
        const [entry] = entries;
        assert.equal(entry.hook, "three-section-close");
        assert.equal(entry.action, "pass");
        assert.deepEqual(entry.missing, [], "missing array empty on pass");
        assert.ok(entry.textLength >= 600, "textLength gates above threshold");
        assert.equal(typeof entry.durationMs, "number");
        assert.ok(!Number.isNaN(Date.parse(entry.ts)), "ts is ISO timestamp");
    });
    it("records a block entry naming the absent heading(s)", () => {
        const transcript = join(transcriptDir, "block.jsonl");
        // ≥ 600 chars but missing all three sections.
        const body = "Long technical narrative without the required close. ".repeat(20);
        writeAssistantTranscript(transcript, body);
        const env = buildIsolatedEnv(home);
        const result = runHook(JSON.stringify({ transcript_path: transcript }), env);
        assert.equal(result.status, 0, "hook still exits 0; block goes via stdout");
        const parsed = JSON.parse(result.stdout);
        assert.equal(parsed.decision, "block");
        for (const heading of REQUIRED_HEADINGS) {
            assert.match(parsed.reason ?? "", new RegExp(heading));
        }
        const entries = readTelemetryLines(home, transcript);
        assert.equal(entries.length, 1, "exactly one telemetry line written");
        const [entry] = entries;
        assert.equal(entry.action, "block");
        assert.deepEqual(entry.missing, REQUIRED_HEADINGS, "missing lists every absent heading");
        assert.ok(entry.textLength >= 600);
    });
    it("records a skip-short entry for a short reply", () => {
        const transcript = join(transcriptDir, "short.jsonl");
        writeAssistantTranscript(transcript, "ok done");
        const env = buildIsolatedEnv(home);
        const result = runHook(JSON.stringify({ transcript_path: transcript }), env);
        assert.equal(result.status, 0);
        assert.equal(result.stdout, "");
        const entries = readTelemetryLines(home, transcript);
        assert.equal(entries.length, 1);
        const [entry] = entries;
        assert.equal(entry.action, "skip-short");
        assert.deepEqual(entry.missing, []);
        assert.ok(entry.textLength < 600, "textLength below gate threshold");
    });
    it("fails open when the telemetry directory cannot be created", () => {
        // Point HOME at a regular file so mkdirSync(.../.claude/hook-telemetry)
        // must fail (cannot create a child of a file). The hook must still
        // pass/block correctly via stdout, and must NOT silently re-route the
        // write to the real ~/.claude/hook-telemetry/ directory.
        const blockerFile = join(rootTemp, `home-as-file-${Date.now()}.txt`);
        writeFileSync(blockerFile, "not a directory");
        const transcript = join(transcriptDir, "fail-open.jsonl");
        const body = "Long body without sections. ".repeat(25);
        writeAssistantTranscript(transcript, body);
        const realBefore = snapshotRealTelemetryDir();
        const env = buildIsolatedEnv(blockerFile);
        const result = runHook(JSON.stringify({ transcript_path: transcript }), env);
        assert.equal(result.status, 0, "hook still exits 0 even with unwritable HOME");
        const parsed = JSON.parse(result.stdout);
        assert.equal(parsed.decision, "block", "block emit still works");
        assert.equal(result.stderr, "", "no stderr on fail-open telemetry");
        // Drift-catch: the mkdir failure path must not silently bypass to the
        // operator's real home dir. Snapshot before/after; no new files.
        assertNoRealTelemetryLeak(realBefore, "unwritable-telemetry-dir test");
    });
    it("explicit opt-out via empty HOME/USERPROFILE skips telemetry without falling back to os.homedir()", () => {
        const transcript = join(transcriptDir, "no-home.jsonl");
        const body = [
            "Filler. ".repeat(30),
            "## What has been done",
            "x",
            "## What is next",
            "1. a\n2. b\n3. c\n4. d\n5. e",
            "## Recommendation",
            "no",
        ].join("\n\n");
        writeAssistantTranscript(transcript, body);
        // Empty-string HOME and USERPROFILE = explicit operator opt-out signal.
        // The hook must short-circuit and write nothing. Critically, it must
        // NOT fall back to os.homedir() (which would pollute the real
        // ~/.claude/hook-telemetry/ during every `npm test` run — the bug this
        // test was previously a false positive for).
        const env = { ...process.env };
        env.HOME = "";
        env.USERPROFILE = "";
        const realBefore = snapshotRealTelemetryDir();
        const result = runHook(JSON.stringify({ transcript_path: transcript }), env);
        assert.equal(result.status, 0, "hook exits 0 with empty HOME/USERPROFILE");
        assert.equal(result.stdout, "", "compliant reply still passes");
        assert.equal(result.stderr, "", "no error escapes to stderr");
        // Confirm no telemetry was written under our isolated `home` either —
        // the hook had no place to write it.
        const entries = readTelemetryLines(home, transcript);
        assert.equal(entries.length, 0, "no telemetry written under isolated HOME");
        // Drift-catch: the real ~/.claude/hook-telemetry/ must be untouched.
        // Without the empty-string opt-out, resolveHomeDir() would call
        // os.homedir() and write a JSONL line into the developer's real home.
        assertNoRealTelemetryLeak(realBefore, "empty-HOME opt-out test");
    });
    it("uses a project hash that differs across distinct transcript directories", () => {
        const transcriptA = join(transcriptDir, "a.jsonl");
        const otherDir = mkdtempSync(join(rootTemp, "transcripts-other-"));
        const transcriptB = join(otherDir, "b.jsonl");
        const body = "Short ok"; // skip-short keeps the test fast and deterministic
        writeAssistantTranscript(transcriptA, body);
        writeAssistantTranscript(transcriptB, body);
        const env = buildIsolatedEnv(home);
        runHook(JSON.stringify({ transcript_path: transcriptA }), env);
        runHook(JSON.stringify({ transcript_path: transcriptB }), env);
        const hashA = projectHashFor(transcriptA);
        const hashB = projectHashFor(transcriptB);
        assert.notEqual(hashA, hashB, "different transcript dirs hash differently");
        const fileA = join(home, ".claude", "hook-telemetry", `${hashA}.jsonl`);
        const fileB = join(home, ".claude", "hook-telemetry", `${hashB}.jsonl`);
        assert.ok(existsSync(fileA), "telemetry file for project A exists");
        assert.ok(existsSync(fileB), "telemetry file for project B exists");
    });
    it("does not write telemetry when transcript file does not exist", () => {
        const transcript = join(transcriptDir, "missing.jsonl");
        const env = buildIsolatedEnv(home);
        const result = runHook(JSON.stringify({ transcript_path: transcript }), env);
        assert.equal(result.status, 0);
        assert.equal(result.stdout, "");
        // The hook returns before reaching telemetry; expect no file.
        const dirAfter = join(home, ".claude", "hook-telemetry");
        assert.equal(existsSync(dirAfter), false, "telemetry dir not created");
    });
    it("appends a second telemetry line on a second invocation in the same project", () => {
        const transcript = join(transcriptDir, "repeat.jsonl");
        writeAssistantTranscript(transcript, "short body");
        const env = buildIsolatedEnv(home);
        runHook(JSON.stringify({ transcript_path: transcript }), env);
        runHook(JSON.stringify({ transcript_path: transcript }), env);
        const entries = readTelemetryLines(home, transcript);
        assert.equal(entries.length, 2, "two appended telemetry lines");
        for (const entry of entries) {
            assert.equal(entry.action, "skip-short");
        }
    });
});
// Sanity: the production hook file we are testing actually exists and is
// executable as a Node script. Catches setup mistakes early.
describe("three-section-close.mjs presence", () => {
    it("has the expected hook file on disk", () => {
        assert.ok(existsSync(HOOK_PATH), `hook file should exist at ${HOOK_PATH}`);
    });
    it("can be imported without throwing parse errors", () => {
        const dummyHome = mkdtempSync(join(tmpdir(), "three-sec-noop-"));
        try {
            const env = buildIsolatedEnv(dummyHome);
            const result = runHook("", env);
            assert.equal(result.status, 0, "hook handles empty stdin cleanly");
            assert.equal(result.stdout, "");
            assert.equal(result.stderr, "");
        }
        finally {
            rmSync(dummyHome, { recursive: true, force: true });
            // Also ensure parent fragments cleaned (mkdtempSync may leave bones)
            const parentLeftover = dirname(dummyHome);
            if (parentLeftover === tmpdir()) {
                // tmpdir() — never delete
            }
        }
    });
});
