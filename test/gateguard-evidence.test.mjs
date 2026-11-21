/**
 * The gateguard file gate, default mode: evidence instead of attestation.
 *
 * CI_GATEGUARD_FILE_GATE picks the mode. Unset, the hook allows an edit when
 * the target is a new file, when the session state already holds a clearance,
 * or when this session's rows in the project's observation log show the file
 * was looked at. A blind edit of an existing file is denied with a two-line
 * reason. `strict` is the fact-list gate, `off` skips the file gate.
 *
 * Observation rows are written by spawning the real bin/observe.mjs with
 * PostToolUse payloads, so these tests break if the hook and the observer ever
 * disagree on what a row holds. HOME and USERPROFILE point at a temp dir, and
 * the host's own gate configuration is cleared for every spawn.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalizeFileKey, hashProjectRoot } from "../lib/gateguard-state.mjs";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const HOOK_PATH = join(REPO_ROOT, "hooks", "gateguard.mjs");
const BUNDLED_HOOK_PATH = join(REPO_ROOT, "plugins", "continuous-improvement", "hooks", "gateguard.mjs");
const OBSERVE_PATH = join(REPO_ROOT, "bin", "observe.mjs");
const CLEAR_CLI_PATH = join(REPO_ROOT, "bin", "gateguard-clear.mjs");
const HOST_GATE_VARIABLES = [
    "GATEGUARD_SESSION_DIR",
    "GATEGUARD_MAX_CLEARED_FILES",
    "CI_GATEGUARD_FILE_GATE",
    "CI_GATEGUARD_TARGET_LOCK",
];
function makeFixture() {
    const root = mkdtempSync(join(tmpdir(), "gg-evidence-"));
    const home = join(root, "home");
    const project = join(root, "project");
    mkdirSync(home);
    mkdirSync(join(project, "src"), { recursive: true });
    return { root, home, project };
}
function removeFixture(fixture) {
    rmSync(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
function envFor(fixture, extra = {}) {
    const env = {
        ...process.env,
        HOME: fixture.home,
        USERPROFILE: fixture.home,
        CLAUDE_PROJECT_DIR: fixture.project,
        CI_GATEGUARD_EXCLUDE: "",
    };
    for (const name of HOST_GATE_VARIABLES)
        delete env[name];
    return { ...env, ...extra };
}
/** Create a file under the fixture project and return its absolute path. */
function makeFile(fixture, relativePath) {
    const path = join(fixture.project, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "export const value = 1;\n");
    return path;
}
/** Passed as the tool response to get a row for a tool that has not run. */
const NOT_RUN = Symbol("tool has not run");
/**
 * Record one observation row through the real observer. A PostToolUse payload
 * carries tool_response; NOT_RUN leaves it out, which is the PreToolUse shape
 * and is stored as a tool_start row.
 */
function observe(fixture, session, toolName, toolInput, toolResponse = "ok") {
    const payload = {
        hook_event_name: toolResponse === NOT_RUN ? "PreToolUse" : "PostToolUse",
        cwd: fixture.project,
        tool_name: toolName,
        tool_input: toolInput,
    };
    if (session !== undefined)
        payload.session_id = session;
    if (toolResponse !== NOT_RUN)
        payload.tool_response = toolResponse;
    const result = spawnSync(process.execPath, [OBSERVE_PATH], {
        input: JSON.stringify(payload),
        encoding: "utf8",
        cwd: fixture.project,
        env: envFor(fixture),
    });
    assert.equal(result.status, 0, `observer exited non-zero: ${result.stderr}`);
    assert.equal(result.stderr, "", "observer wrote to stderr");
}
/** A row from another session, so the log exists without being evidence. */
function seedLog(fixture) {
    observe(fixture, "seed-session", "Read", { file_path: join(fixture.project, "seed-only.txt") });
}
function gate(fixture, session, toolName, toolInput, extraEnv = {}, hookPath = HOOK_PATH) {
    const payload = {
        hook_event_name: "PreToolUse",
        cwd: fixture.project,
        tool_name: toolName,
        tool_input: toolInput,
    };
    if (session !== undefined)
        payload.session_id = session;
    // The hook's own working directory is not the project: a relative target has
    // to be resolved against the cwd in the payload.
    const result = spawnSync(process.execPath, [hookPath], {
        input: JSON.stringify(payload),
        encoding: "utf8",
        cwd: fixture.home,
        env: envFor(fixture, extraEnv),
    });
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
    const stdout = result.stdout.trim();
    if (stdout === "")
        return { decision: "allow", reason: "", stderr: result.stderr };
    const parsed = JSON.parse(stdout);
    const out = parsed.hookSpecificOutput;
    assert.equal(out?.hookEventName, "PreToolUse", "deny output names the hook event");
    assert.equal(out?.permissionDecision, "deny", "non-empty output must be a deny");
    return { decision: "block", reason: out?.permissionDecisionReason ?? "", stderr: result.stderr };
}
function sessionStateFile(fixture, session) {
    return join(fixture.home, ".claude", "instincts", hashProjectRoot(fixture.project), "sessions", session, "gateguard-session.json");
}
function clearedKeys(stateFile) {
    if (!existsSync(stateFile))
        return [];
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    return Object.keys(state.cleared_files ?? {});
}
const forwardSlashes = (path) => path.replace(/\\/g, "/");
/** The short deny: the file was not read, read it, with the clear command as the fallback. */
function assertUnreadDeny(run, file) {
    assert.equal(run.decision, "block", "a blind edit of an existing file must be denied");
    const lines = run.reason.split("\n");
    assert.ok(lines.length <= 2, `the reason must be two lines at most, got ${lines.length}:\n${run.reason}`);
    assert.ok(lines[0].includes(file), `the first line names the file, got: ${lines[0]}`);
    // A file the user attached with @, or the IDE attached, is in context with no
    // row in the log, so the reason states what the log shows, not that the file
    // was never read, and names that case beside the clear command.
    assert.doesNotMatch(run.reason, /has not been read/);
    assert.match(lines[0], /observation log shows no read of/);
    assert.match(lines[0], /Read it, then retry/);
    assert.match(lines[1] ?? "", /attached with @ or by the IDE/);
    assert.match(lines[1] ?? "", /gateguard-clear\.mjs/, "the second line is the clear command");
    assert.match(lines[1] ?? "", /--state /);
    assert.doesNotMatch(run.reason, /present these facts/);
}
/** The strict deny, as hooks/gateguard.mjs has printed it since the clear routes were added. */
function strictReason(verb, file, stateFile) {
    const quoted = JSON.stringify(forwardSlashes(file));
    const state = JSON.stringify(forwardSlashes(stateFile));
    const cli = JSON.stringify(forwardSlashes(CLEAR_CLI_PATH));
    return [
        `Before ${verb} ${file}, present these facts:`,
        "",
        "  1. List ALL files that import/require this file (use Grep)",
        "  2. List the public functions/classes affected by this change",
        "  3. If this file reads/writes data files, show field names, structure, and date format",
        "  4. Quote the user's current instruction verbatim",
        "",
        "Then clear the gate and retry the same call. Either route works:",
        `  A. Bash (always works — run verbatim): node ${cli} --state ${state} ${quoted}`,
        `  B. MCP tool (when the continuous-improvement server is connected): ci_gateguard_clear  {file_paths: [${quoted}], state_path: ${state}}`,
        "  Both canonicalize paths — drive-letter case and separators don't matter.",
        "  (Harnesses that forward unknown tool params may instead retry the call with",
        "  `_gateguard_facts_presented: true`; Claude Code's strict schema rejects that, so use A or B.)",
    ].join("\n");
}
const EDIT = { old_string: "1", new_string: "2" };
describe("hooks/gateguard.mjs file gate, evidence mode (the default)", () => {
    let fixture;
    let counter = 0;
    const nextSession = () => `sess-${++counter}`;
    before(() => {
        fixture = makeFixture();
        seedLog(fixture);
    });
    after(() => {
        removeFixture(fixture);
    });
    it("allows a Write to a file that does not exist yet", () => {
        const file = join(fixture.project, "src", "brand-new.ts");
        const run = gate(fixture, nextSession(), "Write", { file_path: file, content: "x" });
        assert.equal(run.decision, "allow", run.reason);
    });
    it("allows an Edit after a Read of the file, with no clear call", () => {
        const session = nextSession();
        const file = makeFile(fixture, "src/read-first.ts");
        observe(fixture, session, "Read", { file_path: file }, { type: "text", file: { filePath: file } });
        const run = gate(fixture, session, "Edit", { file_path: file, ...EDIT });
        assert.equal(run.decision, "allow", run.reason);
    });
    it("denies a blind Edit of an existing file with the short reason", () => {
        const file = makeFile(fixture, "src/blind.ts");
        assertUnreadDeny(gate(fixture, nextSession(), "Edit", { file_path: file, ...EDIT }), file);
    });
    it("denies a blind Write over an existing file with the short reason", () => {
        const file = makeFile(fixture, "src/blind-write.ts");
        assertUnreadDeny(gate(fixture, nextSession(), "Write", { file_path: file, content: "x" }), file);
    });
    it("allows an Edit after an earlier Write of the same file in the session", () => {
        const session = nextSession();
        const file = makeFile(fixture, "src/written-earlier.ts");
        observe(fixture, session, "Write", { file_path: file, content: "x" }, { type: "create", filePath: file });
        const run = gate(fixture, session, "Edit", { file_path: file, ...EDIT });
        assert.equal(run.decision, "allow", run.reason);
    });
    it("allows an Edit after an earlier Edit of the same file in the session", () => {
        const session = nextSession();
        const file = makeFile(fixture, "src/edited-earlier.ts");
        observe(fixture, session, "Edit", { file_path: file, ...EDIT }, { filePath: file });
        const run = gate(fixture, session, "Edit", { file_path: file, ...EDIT });
        assert.equal(run.decision, "allow", run.reason);
    });
    it("counts an earlier MultiEdit row, which the observer stores as stringified JSON", () => {
        const session = nextSession();
        const file = makeFile(fixture, "src/multi-edited.ts");
        observe(fixture, session, "MultiEdit", { file_path: file, edits: [EDIT] });
        const run = gate(fixture, session, "Edit", { file_path: file, ...EDIT });
        assert.equal(run.decision, "allow", run.reason);
    });
    it("does not count a Read of the file under a different session id", () => {
        const file = makeFile(fixture, "src/other-session.ts");
        observe(fixture, "someone-else", "Read", { file_path: file });
        assertUnreadDeny(gate(fixture, nextSession(), "Edit", { file_path: file, ...EDIT }), file);
    });
    it("does not count a Read of a different file", () => {
        const session = nextSession();
        const file = makeFile(fixture, "src/unread-sibling.ts");
        observe(fixture, session, "Read", { file_path: makeFile(fixture, "src/read-sibling.ts") });
        assertUnreadDeny(gate(fixture, session, "Edit", { file_path: file, ...EDIT }), file);
    });
    it("does not count a row the observer wrote before the tool ran", () => {
        // An install that also observes PreToolUse records a denied Edit as a
        // tool_start row. That row is the blind attempt itself, not a look at the file.
        const session = nextSession();
        const file = makeFile(fixture, "src/attempted.ts");
        observe(fixture, session, "Edit", { file_path: file, ...EDIT }, NOT_RUN);
        assertUnreadDeny(gate(fixture, session, "Edit", { file_path: file, ...EDIT }), file);
    });
    it("allows an Edit after a cat of the file through Bash", () => {
        const session = nextSession();
        const file = makeFile(fixture, "src/catted.ts");
        observe(fixture, session, "Bash", { command: "cat src/catted.ts" }, { stdout: "export const value = 1;\n", stderr: "" });
        const run = gate(fixture, session, "Edit", { file_path: file, ...EDIT });
        assert.equal(run.decision, "allow", run.reason);
    });
    it("allows an Edit when a Bash command's output names the file (a grep hit, a listing)", () => {
        const session = nextSession();
        const grepHit = makeFile(fixture, "src/grep-hit.ts");
        const listed = makeFile(fixture, "src/listed.ts");
        observe(fixture, session, "Bash", { command: "grep -rn value src" }, { stdout: "src/grep-hit.ts:1:export const value = 1;\n", stderr: "" });
        // The name starts a line here: in the stored JSON text it follows the two characters \n.
        observe(fixture, session, "Bash", { command: "ls src" }, { stdout: "aaa.ts\nlisted.ts\n", stderr: "" });
        assert.equal(gate(fixture, session, "Edit", { file_path: grepHit, ...EDIT }).decision, "allow");
        assert.equal(gate(fixture, session, "Edit", { file_path: listed, ...EDIT }).decision, "allow");
    });
    it("allows an Edit after the PowerShell, Grep or Glob tool showed the file", () => {
        const session = nextSession();
        const viaPowerShell = makeFile(fixture, "src/via-powershell.ts");
        const viaGrep = makeFile(fixture, "src/via-grep.ts");
        const viaGlob = makeFile(fixture, "src/via-glob.ts");
        observe(fixture, session, "PowerShell", { command: `Get-Content ${viaPowerShell}` }, { stdout: "x", stderr: "" });
        observe(fixture, session, "Grep", { pattern: "value" }, { mode: "files_with_matches", filenames: ["src/via-grep.ts"], numFiles: 1 });
        observe(fixture, session, "Glob", { pattern: "src/**/via-glob.ts" }, { filenames: [], numFiles: 0 });
        for (const file of [viaPowerShell, viaGrep, viaGlob]) {
            const run = gate(fixture, session, "Edit", { file_path: file, ...EDIT });
            assert.equal(run.decision, "allow", `${file}: ${run.reason}`);
        }
    });
    it("does not take a longer file name for a mention of a shorter one", () => {
        const session = nextSession();
        const file = makeFile(fixture, "config.json");
        observe(fixture, session, "Bash", { command: "cat tsconfig.json config.json5 config.json.bak" }, { stdout: "{}", stderr: "" });
        assertUnreadDeny(gate(fixture, session, "Edit", { file_path: file, ...EDIT }), file);
    });
    it("matches a relative target against an absolute row, and the reverse, through the payload cwd", () => {
        const session = nextSession();
        const readAbsolute = makeFile(fixture, "src/read-absolute.ts");
        const readRelative = makeFile(fixture, "src/read-relative.ts");
        observe(fixture, session, "Read", { file_path: readAbsolute });
        observe(fixture, session, "Read", { file_path: relative(fixture.project, readRelative) });
        const relativeTarget = gate(fixture, session, "Edit", { file_path: relative(fixture.project, readAbsolute), ...EDIT });
        assert.equal(relativeTarget.decision, "allow", relativeTarget.reason);
        const absoluteTarget = gate(fixture, session, "Edit", { file_path: readRelative, ...EDIT });
        assert.equal(absoluteTarget.decision, "allow", absoluteTarget.reason);
    });
    it("matches Windows spellings of one path: separators, drive-letter case, name case", { skip: process.platform !== "win32" }, () => {
        const session = nextSession();
        const file = makeFile(fixture, "src/Widget.ts");
        observe(fixture, session, "Read", { file_path: file });
        const drive = file.charAt(0);
        const flippedDrive = drive === drive.toLowerCase() ? drive.toUpperCase() : drive.toLowerCase();
        const respelled = forwardSlashes(flippedDrive + file.slice(1)).replace("Widget.ts", "widget.ts");
        assert.notEqual(respelled, file);
        const run = gate(fixture, session, "Edit", { file_path: respelled, ...EDIT });
        assert.equal(run.decision, "allow", run.reason);
    });
    it("does not match a path that differs only in case on POSIX", { skip: process.platform === "win32" }, () => {
        const session = nextSession();
        const file = makeFile(fixture, "src/cased.ts");
        observe(fixture, session, "Read", { file_path: join(fixture.project, "src", "Cased.ts") });
        assertUnreadDeny(gate(fixture, session, "Edit", { file_path: file, ...EDIT }), file);
    });
    it("still finds the row when the observer redacted part of the path", () => {
        const session = nextSession();
        const file = makeFile(fixture, "cache/0123456789abcdef0123456789abcdef01234567/data.json");
        observe(fixture, session, "Read", { file_path: file });
        const log = readFileSync(join(fixture.home, ".claude", "instincts", hashProjectRoot(fixture.project), "observations.jsonl"), "utf8");
        assert.match(log, /<hex-redacted:01234567>/, "the fixture path must be one the observer redacts");
        const run = gate(fixture, session, "Edit", { file_path: file, ...EDIT });
        assert.equal(run.decision, "allow", run.reason);
    });
    it("judges each file of a batch and names only the unread ones", () => {
        const session = nextSession();
        const read = makeFile(fixture, "src/batch-read.ts");
        const unread = makeFile(fixture, "src/batch-unread.ts");
        const fresh = join(fixture.project, "src", "batch-new.ts");
        observe(fixture, session, "Read", { file_path: read });
        const run = gate(fixture, session, "MultiEdit", {
            edits: [
                { file_path: read, ...EDIT },
                { file_path: unread, ...EDIT },
                { file_path: fresh, ...EDIT },
            ],
        });
        assertUnreadDeny(run, unread);
        assert.ok(!run.reason.includes(read), "a file that was read is not named");
        assert.ok(!run.reason.includes(fresh), "a new file is not named");
    });
    it("names every unread file of a batch in the same two lines", () => {
        const first = makeFile(fixture, "src/batch-unread-a.ts");
        const second = makeFile(fixture, "src/batch-unread-b.ts");
        const run = gate(fixture, nextSession(), "MultiEdit", {
            edits: [
                { file_path: first, ...EDIT },
                { file_path: second, ...EDIT },
            ],
        });
        assert.equal(run.decision, "block");
        const lines = run.reason.split("\n");
        assert.equal(lines.length, 2, run.reason);
        assert.doesNotMatch(run.reason, /have not been read/);
        assert.match(lines[0], /observation log shows no read of 2 files/);
        assert.match(lines[0], /Read them, then retry/);
        assert.match(lines[1], /attached with @ or by the IDE/);
        for (const file of [first, second]) {
            assert.ok(lines[0].includes(file), `the first line names ${file}`);
            assert.ok(lines[1].includes(JSON.stringify(forwardSlashes(file))), `the clear command names ${file}`);
        }
    });
    it("keeps the manual clear route: the printed command clears the file", () => {
        const session = nextSession();
        const file = makeFile(fixture, "src/cleared-by-hand.ts");
        const denied = gate(fixture, session, "Edit", { file_path: file, ...EDIT });
        assertUnreadDeny(denied, file);
        const printedState = /--state ("(?:[^"\\]|\\.)*")/.exec(denied.reason);
        assert.ok(printedState, `no --state argument in: ${denied.reason}`);
        const stateFile = JSON.parse(printedState[1]);
        assert.equal(forwardSlashes(stateFile), forwardSlashes(sessionStateFile(fixture, session)));
        const cleared = spawnSync(process.execPath, [CLEAR_CLI_PATH, "--state", stateFile, file], {
            encoding: "utf8",
            env: envFor(fixture),
        });
        assert.equal(cleared.status, 0, cleared.stderr);
        const retry = gate(fixture, session, "Edit", { file_path: file, ...EDIT });
        assert.equal(retry.decision, "allow", retry.reason);
    });
    it("remembers an evidence allow in session state so the next edit skips the scan", () => {
        const session = nextSession();
        const file = makeFile(fixture, "src/remembered.ts");
        observe(fixture, session, "Read", { file_path: file });
        assert.equal(gate(fixture, session, "Edit", { file_path: file, ...EDIT }).decision, "allow");
        assert.deepEqual(clearedKeys(sessionStateFile(fixture, session)), [canonicalizeFileKey(file)]);
    });
    it("allows on evidence when the cleared-files cap is full, and does not grow the state", () => {
        const session = nextSession();
        const stateFile = sessionStateFile(fixture, session);
        mkdirSync(dirname(stateFile), { recursive: true });
        const now = new Date().toISOString();
        writeFileSync(stateFile, `${JSON.stringify({
            created_at: now,
            cleared_files: { "seed-1.txt": { cleared_at: now }, "seed-2.txt": { cleared_at: now } },
        })}\n`);
        const cap = { GATEGUARD_MAX_CLEARED_FILES: "2" };
        const read = makeFile(fixture, "src/cap-read.ts");
        const unread = makeFile(fixture, "src/cap-unread.ts");
        observe(fixture, session, "Read", { file_path: read });
        const run = gate(fixture, session, "Edit", { file_path: read, ...EDIT }, cap);
        assert.equal(run.decision, "allow", run.reason);
        assert.deepEqual(clearedKeys(stateFile), ["seed-1.txt", "seed-2.txt"], "a full cap skips the caching");
        // The cap never turns into the reason for an unread file either.
        assertUnreadDeny(gate(fixture, session, "Edit", { file_path: unread, ...EDIT }, cap), unread);
    });
    it("still denies an out-of-repo write that has evidence when the target lock is on", () => {
        const session = nextSession();
        const outside = join(fixture.root, "elsewhere", "stray.ts");
        mkdirSync(dirname(outside), { recursive: true });
        writeFileSync(outside, "x\n");
        observe(fixture, session, "Read", { file_path: outside });
        const unlocked = gate(fixture, session, "Edit", { file_path: outside, ...EDIT });
        assert.equal(unlocked.decision, "allow", "control: the Read is evidence when the lock is off");
        const locked = gate(fixture, nextSession(), "Edit", { file_path: outside, ...EDIT }, { CI_GATEGUARD_TARGET_LOCK: "block" });
        assert.equal(locked.decision, "block");
        assert.match(locked.reason, /outside the session project root/i);
        const lockedWithEvidence = gate(fixture, session, "Edit", { file_path: outside, ...EDIT }, { CI_GATEGUARD_TARGET_LOCK: "block" });
        assert.equal(lockedWithEvidence.decision, "block");
        assert.match(lockedWithEvidence.reason, /outside the session project root/i);
    });
    it("still honours CI_GATEGUARD_EXCLUDE and says so on stderr", () => {
        const file = makeFile(fixture, "docs/wiki/page.md");
        const run = gate(fixture, nextSession(), "Edit", { file_path: file, ...EDIT }, { CI_GATEGUARD_EXCLUDE: "docs/wiki" });
        assert.equal(run.decision, "allow");
        assert.match(run.stderr, /skipped by CI_GATEGUARD_EXCLUDE/);
    });
    it("matches rows that carry no session id when the hook payload carries none", () => {
        const file = makeFile(fixture, "src/no-session.ts");
        assertUnreadDeny(gate(fixture, undefined, "Edit", { file_path: file, ...EDIT }), file);
        observe(fixture, undefined, "Read", { file_path: file });
        const run = gate(fixture, undefined, "Edit", { file_path: file, ...EDIT });
        assert.equal(run.decision, "allow", run.reason);
    });
    it("the bundled plugin copy of the hook loads its libs and applies the same gate", () => {
        const session = nextSession();
        const read = makeFile(fixture, "src/bundle-read.ts");
        const unread = makeFile(fixture, "src/bundle-unread.ts");
        observe(fixture, session, "Read", { file_path: read });
        const allowed = gate(fixture, session, "Edit", { file_path: read, ...EDIT }, {}, BUNDLED_HOOK_PATH);
        assert.equal(allowed.decision, "allow", allowed.reason);
        assert.equal(allowed.stderr, "", "the bundled hook must not fail at module load");
        assertUnreadDeny(gate(fixture, session, "Edit", { file_path: unread, ...EDIT }, {}, BUNDLED_HOOK_PATH), unread);
    });
});
describe("hooks/gateguard.mjs file gate, no observation log", () => {
    let fixture;
    before(() => {
        fixture = makeFixture();
    });
    after(() => {
        removeFixture(fixture);
    });
    it("allows an Edit of an existing file when the project has no observation log", () => {
        const file = makeFile(fixture, "src/no-log.ts");
        const run = gate(fixture, "sess-no-log", "Edit", { file_path: file, ...EDIT });
        assert.equal(run.decision, "allow", run.reason);
    });
});
describe("hooks/gateguard.mjs file gate, CI_GATEGUARD_FILE_GATE modes", () => {
    let fixture;
    let counter = 0;
    const nextSession = () => `mode-${++counter}`;
    before(() => {
        fixture = makeFixture();
        seedLog(fixture);
    });
    after(() => {
        removeFixture(fixture);
    });
    for (const value of ["strict", " Strict "]) {
        it(`${JSON.stringify(value)} gives the fact-list deny, for a new file and for a file that was read`, () => {
            const session = nextSession();
            const strict = { CI_GATEGUARD_FILE_GATE: value };
            const stateFile = sessionStateFile(fixture, session);
            const fresh = join(fixture.project, "src", `strict-new-${counter}.ts`);
            const write = gate(fixture, session, "Write", { file_path: fresh, content: "x" }, strict);
            assert.equal(write.decision, "block");
            assert.equal(write.reason, strictReason("creating", fresh, stateFile));
            const read = makeFile(fixture, `src/strict-read-${counter}.ts`);
            observe(fixture, session, "Read", { file_path: read });
            const edit = gate(fixture, session, "Edit", { file_path: read, ...EDIT }, strict);
            assert.equal(edit.decision, "block");
            assert.equal(edit.reason, strictReason("editing", read, stateFile));
            assert.equal(edit.stderr, "");
        });
    }
    it("off skips the file gate", () => {
        const file = makeFile(fixture, "src/gate-off.ts");
        const run = gate(fixture, nextSession(), "Edit", { file_path: file, ...EDIT }, { CI_GATEGUARD_FILE_GATE: "off" });
        assert.equal(run.decision, "allow", run.reason);
        assert.equal(run.stderr, "");
    });
    it("an empty value is the default", () => {
        const session = nextSession();
        const file = makeFile(fixture, "src/empty-value.ts");
        const empty = { CI_GATEGUARD_FILE_GATE: "" };
        const denied = gate(fixture, session, "Edit", { file_path: file, ...EDIT }, empty);
        assertUnreadDeny(denied, file);
        assert.equal(denied.stderr, "");
        observe(fixture, session, "Read", { file_path: file });
        assert.equal(gate(fixture, session, "Edit", { file_path: file, ...EDIT }, empty).decision, "allow");
    });
    it("an unknown value behaves as evidence and names the accepted values on stderr", () => {
        const session = nextSession();
        const unknown = { CI_GATEGUARD_FILE_GATE: "banana" };
        const file = makeFile(fixture, "src/unknown-mode.ts");
        const fresh = join(fixture.project, "src", "unknown-mode-new.ts");
        const denied = gate(fixture, session, "Edit", { file_path: file, ...EDIT }, unknown);
        assertUnreadDeny(denied, file);
        const notice = denied.stderr.trim().split("\n");
        assert.equal(notice.length, 1, `expected one stderr line, got: ${denied.stderr}`);
        assert.match(notice[0], /CI_GATEGUARD_FILE_GATE/);
        assert.match(notice[0], /banana/);
        assert.match(notice[0], /evidence, strict, off/);
        assert.equal(gate(fixture, session, "Write", { file_path: fresh, content: "x" }, unknown).decision, "allow");
        observe(fixture, session, "Read", { file_path: file });
        assert.equal(gate(fixture, session, "Edit", { file_path: file, ...EDIT }, unknown).decision, "allow");
    });
    // The shell rules do not belong to the file gate: no mode moves them.
    for (const value of ["evidence", "strict", "off", "banana"]) {
        it(`${value}: a destructive command and an unquoted @{u} are still denied`, () => {
            const mode = { CI_GATEGUARD_FILE_GATE: value };
            const destructive = gate(fixture, nextSession(), "Bash", { command: ["rm", "-rf", "build"].join(" ") }, mode);
            assert.equal(destructive.decision, "block");
            assert.match(destructive.reason, /Destructive command requested/);
            const braceRef = gate(fixture, nextSession(), "Bash", { command: "git rev-parse @{u}" }, mode);
            assert.equal(braceRef.decision, "block");
            assert.match(braceRef.reason, /Unquoted git ref @\{u\}/);
        });
        it(`${value}: the target lock still denies an out-of-repo write`, () => {
            const outside = join(fixture.root, "elsewhere", `locked-${value}.ts`);
            const run = gate(fixture, nextSession(), "Write", { file_path: outside, content: "x" }, {
                CI_GATEGUARD_FILE_GATE: value,
                CI_GATEGUARD_TARGET_LOCK: "block",
            });
            assert.equal(run.decision, "block");
            assert.match(run.reason, /outside the session project root/i);
        });
    }
});
