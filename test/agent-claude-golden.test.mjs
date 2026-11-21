/**
 * Claude Code hook goldens.
 *
 * PR 1 of the all-agents train (docs/plans/2026-11-21-all-agents.md, "Claude
 * regression guard"). Every hook entry point the plugin wires in
 * plugins/continuous-improvement/hooks/hooks.json runs over the Claude Code
 * payloads in fixtures/agent-hooks/claude.json, and its stdout, stderr and exit
 * code must equal the golden recorded there against the v3.27.0 scripts. The
 * later refactors (hook-io, gateguard-decide, agent paths, encoders) have to
 * keep every golden byte-identical: a diff here is a Claude Code behaviour
 * change, not a fixture to refresh.
 *
 * Determinism. Each case gets its own temp root with `home/` and `project/`.
 * HOME and USERPROFILE point at that home, CLAUDE_PROJECT_DIR at that project,
 * and the child env is built from an allowlist (PATH, SystemRoot and the like),
 * so a CI_* or CLAUDE_* knob in the developer's shell never decides a golden.
 * GIT_CEILING_DIRECTORIES stops git from finding a repository above the temp
 * root. Session ids, transcript rows and observation timestamps are fixed in
 * the fixture, and no compared output carries the wall clock. Before
 * comparing, the temp paths, the repo root and the project hash are replaced by
 * <HOME>, <PROJECT>, <ROOT>, <REPO> and <PROJECT_HASH> in every spelling a hook
 * prints (native, forward-slash, JSON-escaped).
 *
 * Re-recording is for an intended Claude behaviour change only, stated in the
 * PR that makes it:
 *   npm run build && CI_RECORD_GOLDENS=1 node --test test/agent-claude-golden.test.mjs
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { hashProjectRoot } from "../lib/gateguard-state.mjs";
const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const FIXTURE_PATH = join(REPO_ROOT, "fixtures", "agent-hooks", "claude.json");
const PLUGIN_HOOKS_JSON = join(REPO_ROOT, "plugins", "continuous-improvement", "hooks", "hooks.json");
const RECORD = process.env.CI_RECORD_GOLDENS === "1";
const STEP_TIMEOUT_MS = 30_000;
const IGNORE_CASE = process.platform === "win32";
// The only parent env a hook child sees. Everything a hook reads beyond these
// is set by the case, so the host's own gate configuration cannot leak in.
const INHERITED_ENV = new Set(["path", "pathext", "systemroot", "systemdrive", "windir", "comspec", "temp", "tmp", "tmpdir"]);
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
function substitute(text, dirs) {
    return text
        .split("<PROJECT_HASH>").join(dirs.hash)
        .split("<HOME>").join(dirs.home)
        .split("<PROJECT>").join(dirs.project)
        .split("<ROOT>").join(dirs.root);
}
function substituteDeep(value, dirs) {
    if (typeof value === "string")
        return substitute(value, dirs);
    if (Array.isArray(value))
        return value.map((item) => substituteDeep(item, dirs));
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substituteDeep(item, dirs)]));
    }
    return value;
}
// A string is written as given, an array as JSON lines, an object as JSON.
function fileContent(spec, dirs) {
    const value = substituteDeep(spec, dirs);
    if (typeof value === "string")
        return value;
    if (Array.isArray(value))
        return value.map((row) => `${JSON.stringify(row)}\n`).join("");
    return `${JSON.stringify(value, null, 2)}\n`;
}
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// The spellings of one path a hook can print: native, forward-slash (the
// gateguard clear command), and JSON-escaped inside a stdout decision.
function pathForms(path) {
    const forward = path.replace(/\\/g, "/");
    const forms = [path, forward, path.replace(/\\/g, "\\\\")];
    return [...new Set(forms)].sort((left, right) => right.length - left.length);
}
function normalize(text, dirs) {
    const replacements = [
        ["<HOME>", dirs.home],
        ["<PROJECT>", dirs.project],
        ["<ROOT>", dirs.root],
        ["<REPO>", REPO_ROOT.replace(/[\\/]+$/, "")],
    ];
    let out = text;
    for (const [placeholder, path] of replacements) {
        for (const form of pathForms(path)) {
            out = out.replace(new RegExp(escapeRegExp(form), IGNORE_CASE ? "gi" : "g"), placeholder);
        }
    }
    return out.split(dirs.hash).join("<PROJECT_HASH>");
}
function baseEnv(dirs) {
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (INHERITED_ENV.has(key.toLowerCase()) && value !== undefined)
            env[key] = value;
    }
    env.HOME = dirs.home;
    env.USERPROFILE = dirs.home;
    env.CLAUDE_PROJECT_DIR = dirs.project;
    env.GIT_CEILING_DIRECTORIES = dirname(dirs.root);
    env.GIT_CONFIG_NOSYSTEM = "1";
    return env;
}
function stepEnv(step, dirs) {
    const env = baseEnv(dirs);
    for (const [key, value] of Object.entries(step.env ?? {})) {
        if (value === null)
            delete env[key];
        else
            env[key] = substitute(value, dirs);
    }
    return env;
}
function stepStdin(step, dirs) {
    if (typeof step.stdinRaw === "string")
        return step.stdinRaw;
    if (step.stdin === undefined)
        return "";
    return JSON.stringify(substituteDeep(step.stdin, dirs));
}
function runHook(script, stdin, env, cwd) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(process.execPath, [join(REPO_ROOT, script)], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
        const stdout = [];
        const stderr = [];
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error(`${script} did not exit within ${STEP_TIMEOUT_MS} ms`));
        }, STEP_TIMEOUT_MS);
        child.stdout.on("data", (chunk) => stdout.push(chunk));
        child.stderr.on("data", (chunk) => stderr.push(chunk));
        child.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            resolvePromise({
                stdout: Buffer.concat(stdout).toString("utf8"),
                stderr: Buffer.concat(stderr).toString("utf8"),
                exitCode: code,
            });
        });
        child.stdin.on("error", () => {
            // A hook that exits before reading stdin closes the pipe; that is its result, not a test error.
        });
        child.stdin.end(stdin);
    });
}
function prepare(goldenCase) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "ci-claude-golden-")));
    const home = join(root, "home");
    const project = join(root, "project");
    mkdirSync(home);
    mkdirSync(project);
    const dirs = { root, home, project, hash: hashProjectRoot(project) };
    const setup = goldenCase.setup ?? {};
    for (const dir of setup.dirs ?? [])
        mkdirSync(substitute(dir, dirs), { recursive: true });
    for (const [path, spec] of Object.entries(setup.files ?? {})) {
        const target = substitute(path, dirs);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, fileContent(spec, dirs));
    }
    for (const args of setup.git ?? []) {
        execFileSync("git", args, { cwd: project, env: baseEnv(dirs), stdio: ["ignore", "ignore", "pipe"] });
    }
    return dirs;
}
async function runCase(goldenCase) {
    const dirs = prepare(goldenCase);
    try {
        const results = [];
        for (const step of goldenCase.steps) {
            const raw = await runHook(step.hook, stepStdin(step, dirs), stepEnv(step, dirs), dirs.project);
            results.push({ stdout: normalize(raw.stdout, dirs), stderr: normalize(raw.stderr, dirs), exitCode: raw.exitCode });
        }
        return results;
    }
    finally {
        rmSync(dirs.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
}
const recorded = new Map();
describe("Claude Code hook goldens (fixtures/agent-hooks/claude.json)", { concurrency: 8 }, () => {
    after(() => {
        if (!RECORD)
            return;
        const cases = fixture.cases.map((goldenCase) => {
            const goldens = recorded.get(goldenCase.id);
            if (!goldens)
                return goldenCase;
            return { ...goldenCase, steps: goldenCase.steps.map((step, index) => ({ ...step, expect: goldens[index] })) };
        });
        writeFileSync(FIXTURE_PATH, `${JSON.stringify({ ...fixture, cases }, null, 2)}\n`);
    });
    for (const goldenCase of fixture.cases) {
        it(goldenCase.id, async () => {
            const results = await runCase(goldenCase);
            if (RECORD) {
                recorded.set(goldenCase.id, results);
                return;
            }
            results.forEach((result, index) => {
                const step = goldenCase.steps[index];
                const label = `${goldenCase.id} step ${index + 1} (${step.hook} ${step.event})`;
                assert.ok(step.expect, `${label} has no recorded golden`);
                assert.deepEqual(result, step.expect, `${label} no longer matches the v3.27.0 golden`);
            });
        });
    }
});
describe("Claude golden fixture coverage", () => {
    const steps = fixture.cases.flatMap((goldenCase) => goldenCase.steps);
    const covered = new Set(steps.map((step) => `${step.hook} ${step.event}`));
    it("has a case for every hook and event the plugin wires", () => {
        const wiring = JSON.parse(readFileSync(PLUGIN_HOOKS_JSON, "utf8"));
        const wired = [];
        for (const [event, groups] of Object.entries(wiring.hooks)) {
            for (const group of groups) {
                for (const hook of group.hooks) {
                    const script = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"/.exec(hook.command)?.[1];
                    assert.ok(script, `unrecognised hook command in hooks.json: ${hook.command}`);
                    wired.push(`${script} ${event}`);
                }
            }
        }
        assert.ok(wired.length > 0, "hooks.json wires no hooks");
        assert.deepEqual(wired.filter((key) => !covered.has(key)), []);
    });
    it("has a case for every hook entry point under hooks/", () => {
        const entryPoints = readdirSync(join(REPO_ROOT, "hooks"))
            .filter((file) => file.endsWith(".mjs"))
            .map((file) => `hooks/${file}`);
        const hooksInFixture = new Set(steps.map((step) => step.hook));
        assert.deepEqual(entryPoints.filter((hook) => !hooksInFixture.has(hook)), []);
    });
    it("gives every case a unique id and every payload the event its step names", () => {
        const ids = fixture.cases.map((goldenCase) => goldenCase.id);
        assert.equal(new Set(ids).size, ids.length, "duplicate case id");
        for (const step of steps) {
            const payload = step.stdin;
            if (payload && typeof payload === "object" && "hook_event_name" in payload) {
                assert.equal(payload.hook_event_name, step.event, `${step.hook}: stdin event differs from step event`);
            }
        }
    });
});
