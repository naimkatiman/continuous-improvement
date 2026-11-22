/**
 * agent-paths: the one instincts root and project root every hook and the
 * observer resolve (docs/plans/2026-11-21-all-agents.md, Architecture item 1).
 *
 * The env var names come from the 2026-11-21 all-agents research and its
 * skeptic pass: Qwen sets QWEN_PROJECT_DIR, CLAUDE_PROJECT_DIR and
 * GEMINI_PROJECT_DIR; Gemini sets GEMINI_PROJECT_DIR; Cursor sets
 * CURSOR_PROJECT_DIR; Devin sets DEVIN_PROJECT_DIR; Droid sets
 * FACTORY_PROJECT_DIR; Auggie sets AUGMENT_PROJECT_DIR; Grok sets
 * GROK_WORKSPACE_ROOT. The payload keys are `cwd` (Claude, Codex, Gemini, Qwen,
 * Grok, Copilot, Cursor, Droid), `working_dir` (Goose tool events) and
 * `workspace_roots` (Cursor, Auggie).
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { GLOBAL_PROJECT_ROOT, PROJECT_DIR_ENV, resolveInstinctsRoot, resolveProjectRoot, } from "../lib/agent-paths.mjs";
import { canonicalizeProjectRoot, hashProjectRoot, resolveInstinctsRoot as stateInstinctsRoot, resolveSessionDir, resolveProjectRoot as stateProjectRoot, } from "../lib/gateguard-state.mjs";
const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const TOUCHED_ENV = [
    ...PROJECT_DIR_ENV,
    "CI_INSTINCTS_HOME",
    "HOME",
    "USERPROFILE",
    "GIT_CEILING_DIRECTORIES",
];
// Runs fn with exactly the given values for the env vars this module reads;
// every one not named is unset. Restores the previous values afterwards.
function withEnv(values, fn) {
    const saved = new Map(TOUCHED_ENV.map((key) => [key, process.env[key]]));
    for (const key of TOUCHED_ENV)
        delete process.env[key];
    Object.assign(process.env, values);
    try {
        return fn();
    }
    finally {
        for (const [key, value] of saved) {
            if (value === undefined)
                delete process.env[key];
            else
                process.env[key] = value;
        }
    }
}
function gitToplevel(cwd) {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim();
}
function same(actual, expected) {
    assert.equal(canonicalizeProjectRoot(actual), canonicalizeProjectRoot(expected));
}
describe("resolveInstinctsRoot", () => {
    it("defaults to <home>/.claude/instincts from HOME", () => {
        withEnv({ HOME: "/h/home", USERPROFILE: "/h/profile" }, () => {
            assert.equal(resolveInstinctsRoot(), join("/h/home", ".claude", "instincts"));
        });
    });
    it("falls back to USERPROFILE when HOME is empty or unset", () => {
        withEnv({ HOME: "", USERPROFILE: "/h/profile" }, () => {
            assert.equal(resolveInstinctsRoot(), join("/h/profile", ".claude", "instincts"));
        });
        withEnv({ USERPROFILE: "/h/profile" }, () => {
            assert.equal(resolveInstinctsRoot(), join("/h/profile", ".claude", "instincts"));
        });
    });
    it("uses the home the caller passes", () => {
        withEnv({ HOME: "/h/home" }, () => {
            assert.equal(resolveInstinctsRoot("/h/other"), join("/h/other", ".claude", "instincts"));
        });
    });
    it("CI_INSTINCTS_HOME replaces the whole root, over HOME and a passed home", () => {
        const override = resolve(tmpdir(), "ci-store");
        withEnv({ HOME: "/h/home", CI_INSTINCTS_HOME: override }, () => {
            assert.equal(resolveInstinctsRoot(), override);
            assert.equal(resolveInstinctsRoot("/h/other"), override);
        });
    });
    it("CI_INSTINCTS_HOME is trimmed", () => {
        const override = resolve(tmpdir(), "ci-store");
        withEnv({ HOME: "/h/home", CI_INSTINCTS_HOME: `  ${override}\t` }, () => {
            assert.equal(resolveInstinctsRoot(), override);
        });
    });
    // A relative store would resolve against each process's own cwd, so a hook,
    // the observer and the MCP server spawned in different directories would use
    // different stores. Payload dirs are refused for the same reason.
    it("ignores a relative CI_INSTINCTS_HOME and keeps the default root", () => {
        for (const value of ["rel/store", "  rel/store  ", ".", "./store", "..\\store"]) {
            withEnv({ HOME: "/h/home", CI_INSTINCTS_HOME: value }, () => {
                assert.equal(resolveInstinctsRoot(), join("/h/home", ".claude", "instincts"), JSON.stringify(value));
            });
        }
    });
    it("ignores an empty or blank CI_INSTINCTS_HOME", () => {
        for (const value of ["", "   ", "\t"]) {
            withEnv({ HOME: "/h/home", CI_INSTINCTS_HOME: value }, () => {
                assert.equal(resolveInstinctsRoot(), join("/h/home", ".claude", "instincts"), JSON.stringify(value));
            });
        }
    });
    it("is the function gateguard-state exports to the bins", () => {
        assert.equal(stateInstinctsRoot, resolveInstinctsRoot);
        assert.equal(stateProjectRoot, resolveProjectRoot);
    });
});
describe("resolveProjectRoot: env vars", () => {
    it("checks the agents' project env vars in the plan order", () => {
        assert.deepEqual(PROJECT_DIR_ENV, [
            "CLAUDE_PROJECT_DIR",
            "QWEN_PROJECT_DIR",
            "GEMINI_PROJECT_DIR",
            "CURSOR_PROJECT_DIR",
            "DEVIN_PROJECT_DIR",
            "FACTORY_PROJECT_DIR",
            "AUGMENT_PROJECT_DIR",
            "GROK_WORKSPACE_ROOT",
        ]);
    });
    it("each env var alone is the root, returned as given", () => {
        for (const name of PROJECT_DIR_ENV) {
            withEnv({ [name]: `/agents/${name}` }, () => {
                assert.equal(resolveProjectRoot({ cwd: REPO_ROOT }), `/agents/${name}`, name);
            });
        }
    });
    it("CLAUDE_PROJECT_DIR wins over every other agent's var and the payload", () => {
        const all = Object.fromEntries(PROJECT_DIR_ENV.map((name) => [name, `/agents/${name}`]));
        withEnv(all, () => {
            assert.equal(resolveProjectRoot({ cwd: REPO_ROOT, workspace_roots: [REPO_ROOT] }), "/agents/CLAUDE_PROJECT_DIR");
        });
    });
    it("an earlier var wins over a later one", () => {
        withEnv({ GEMINI_PROJECT_DIR: "/g", GROK_WORKSPACE_ROOT: "/x" }, () => {
            assert.equal(resolveProjectRoot(), "/g");
        });
    });
    it("skips an empty or blank var and keeps looking", () => {
        withEnv({ CLAUDE_PROJECT_DIR: "", QWEN_PROJECT_DIR: "   ", CURSOR_PROJECT_DIR: "/c" }, () => {
            assert.equal(resolveProjectRoot(), "/c");
        });
    });
    it("keeps a padded value byte for byte, so the observation bucket does not move", () => {
        withEnv({ CLAUDE_PROJECT_DIR: " /padded " }, () => {
            assert.equal(resolveProjectRoot(), " /padded ");
        });
    });
    it("takes the env var even when the directory does not exist (test fixtures use synthetic paths)", () => {
        withEnv({ CLAUDE_PROJECT_DIR: "/no/such/dir/anywhere" }, () => {
            assert.equal(resolveProjectRoot(), "/no/such/dir/anywhere");
        });
    });
});
describe("resolveProjectRoot: payload and git", () => {
    let base = "";
    let repo = "";
    let repo2 = "";
    let plain = "";
    let outside = "";
    before(() => {
        base = mkdtempSync(join(tmpdir(), "ci-agent-paths-"));
        repo = join(base, "repo");
        repo2 = join(base, "repo2");
        plain = join(base, "plain");
        outside = join(base, "outside");
        mkdirSync(join(repo, "packages", "app"), { recursive: true });
        mkdirSync(repo2, { recursive: true });
        mkdirSync(plain, { recursive: true });
        mkdirSync(outside, { recursive: true });
        for (const dir of [repo, repo2]) {
            execFileSync("git", ["init", "-q", dir], { env: { ...process.env, GIT_CEILING_DIRECTORIES: base } });
        }
        writeFileSync(join(plain, "file.txt"), "x");
    });
    after(() => {
        rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    });
    // The process cwd sits in a directory that is not a repo, so a result that
    // came from the cwd fallback would be "global", never the payload's repo.
    function inOutside(fn) {
        const previous = process.cwd();
        process.chdir(outside);
        try {
            return withEnv({ GIT_CEILING_DIRECTORIES: base }, fn);
        }
        finally {
            process.chdir(previous);
        }
    }
    it("with no env var and no payload, outside a repo, is global", () => {
        inOutside(() => assert.equal(resolveProjectRoot(), GLOBAL_PROJECT_ROOT));
        assert.equal(GLOBAL_PROJECT_ROOT, "global");
    });
    it("with no env var and no payload, inside a repo, is the git toplevel of the process cwd", () => {
        withEnv({}, () => same(resolveProjectRoot(), gitToplevel(process.cwd())));
    });
    it("payload cwd in a repo resolves to that repo's toplevel", () => {
        inOutside(() => same(resolveProjectRoot({ cwd: repo }), gitToplevel(repo)));
    });
    it("payload cwd in a subdirectory resolves to the toplevel, the same bucket as the repo root", () => {
        inOutside(() => {
            const fromSub = resolveProjectRoot({ cwd: join(repo, "packages", "app") });
            same(fromSub, gitToplevel(repo));
            assert.equal(hashProjectRoot(fromSub), hashProjectRoot(resolveProjectRoot({ cwd: repo })));
        });
    });
    // A reader with no payload (workflow-distill, typecheck-stop, the MCP
    // server) resolves from the process cwd. A non-git payload dir must land in
    // the same bucket, or the observer writes where those readers never look.
    it("payload cwd outside any repo falls through to the process cwd: global outside a repo", () => {
        inOutside(() => {
            assert.equal(resolveProjectRoot({ cwd: plain }), GLOBAL_PROJECT_ROOT);
            assert.equal(resolveProjectRoot({ cwd: plain }), resolveProjectRoot());
        });
    });
    it("payload cwd outside any repo falls through to the process cwd: its toplevel inside a repo", () => {
        const previous = process.cwd();
        process.chdir(repo2);
        try {
            withEnv({ GIT_CEILING_DIRECTORIES: base }, () => same(resolveProjectRoot({ cwd: plain }), gitToplevel(repo2)));
        }
        finally {
            process.chdir(previous);
        }
    });
    it("a non-git payload dir and no payload give the gateguard hook and the MCP fallback one session dir", () => {
        inOutside(() => assert.equal(resolveSessionDir("s1", { cwd: plain }), resolveSessionDir("s1")));
    });
    it("reads working_dir (Goose) and workspace_roots[0] (Cursor, Auggie)", () => {
        inOutside(() => {
            same(resolveProjectRoot({ working_dir: repo }), gitToplevel(repo));
            same(resolveProjectRoot({ workspace_roots: [repo, plain] }), gitToplevel(repo));
        });
    });
    it("prefers cwd, then working_dir, then workspace_roots[0]", () => {
        inOutside(() => {
            same(resolveProjectRoot({ cwd: repo2, working_dir: repo, workspace_roots: [repo] }), gitToplevel(repo2));
            same(resolveProjectRoot({ working_dir: repo2, workspace_roots: [repo] }), gitToplevel(repo2));
            same(resolveProjectRoot({ cwd: plain, working_dir: repo2, workspace_roots: [repo] }), gitToplevel(repo2));
        });
    });
    it("an env var still wins over the payload", () => {
        inOutside(() => {
            withEnv({ GIT_CEILING_DIRECTORIES: base, DEVIN_PROJECT_DIR: "/devin" }, () => {
                assert.equal(resolveProjectRoot({ cwd: repo }), "/devin");
            });
        });
    });
    it("skips a payload dir that is relative, missing, a file, blank or not a string", () => {
        const rejected = [
            { cwd: "." },
            { cwd: "repo" },
            { cwd: join(base, "missing") },
            { cwd: join(plain, "file.txt") },
            { cwd: "" },
            { cwd: "   " },
            { cwd: 42 },
            { cwd: null },
            { cwd: ["/x"] },
            { cwd: { path: repo } },
            { working_dir: false },
            { workspace_roots: [] },
            { workspace_roots: "not-an-array" },
            { workspace_roots: [42, repo] },
            { workspace_roots: [""] },
        ];
        inOutside(() => {
            for (const payload of rejected) {
                assert.equal(resolveProjectRoot(payload), GLOBAL_PROJECT_ROOT, JSON.stringify(payload));
            }
        });
    });
    it("falls through a rejected cwd to the next payload key", () => {
        inOutside(() => same(resolveProjectRoot({ cwd: join(base, "missing"), working_dir: repo }), gitToplevel(repo)));
    });
    it("ignores a payload that is not a plain object", () => {
        inOutside(() => {
            for (const payload of [undefined, null, [], [repo], "string", 7, true]) {
                assert.equal(resolveProjectRoot(payload), GLOBAL_PROJECT_ROOT, JSON.stringify(payload));
            }
        });
    });
    it("ignores payload keys it does not know (workspaceRoot, workspaceRoots)", () => {
        inOutside(() => {
            assert.equal(resolveProjectRoot({ workspaceRoot: repo, workspaceRoots: [repo] }), GLOBAL_PROJECT_ROOT);
        });
    });
});
describe("hooks and observer use the shared root", () => {
    let base = "";
    let home = "";
    let store = "";
    let repo = "";
    let outside = "";
    let plain = "";
    before(() => {
        base = mkdtempSync(join(tmpdir(), "ci-agent-paths-hooks-"));
        home = join(base, "home");
        store = join(base, "store");
        repo = join(base, "repo");
        outside = join(base, "outside");
        plain = join(base, "plain");
        for (const dir of [home, store, repo, outside, plain])
            mkdirSync(dir, { recursive: true });
        execFileSync("git", ["init", "-q", repo], { env: { ...process.env, GIT_CEILING_DIRECTORIES: base } });
    });
    after(() => {
        rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    });
    // Every test starts from an empty default root and an empty store, so one
    // test's writes can never satisfy another's assertion.
    function reset() {
        rmSync(join(home, ".claude"), { recursive: true, force: true });
        rmSync(store, { recursive: true, force: true });
        mkdirSync(store);
    }
    function childEnv(extra) {
        const env = { ...process.env, HOME: home, USERPROFILE: home, GIT_CEILING_DIRECTORIES: base };
        // The host's own CI_*, CLAUDE_* and GATEGUARD_* settings (a CI_GATEGUARD_EXCLUDE,
        // say) must not decide what a hook does here.
        for (const key of Object.keys(env)) {
            if (/^(CI_|CLAUDE_|GATEGUARD_)/i.test(key) || PROJECT_DIR_ENV.includes(key))
                delete env[key];
        }
        return { ...env, ...extra };
    }
    function run(script, payload, extra) {
        const result = spawnSync(process.execPath, [join(REPO_ROOT, script)], {
            input: JSON.stringify(payload),
            cwd: outside,
            env: childEnv(extra),
            encoding: "utf8",
            timeout: 10_000,
        });
        if (result.error)
            throw result.error;
        return result;
    }
    function observationFiles(root) {
        if (!existsSync(root))
            return [];
        return readdirSync(root)
            .map((name) => join(root, name, "observations.jsonl"))
            .filter((file) => existsSync(file));
    }
    const toolPayload = (cwd) => ({
        session_id: "agent-paths",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "git status" },
        cwd,
    });
    for (const [label, script] of [
        ["bin/observe.mjs", "bin/observe.mjs"],
        ["the bundled observer", "plugins/continuous-improvement/bin/observe.mjs"],
    ]) {
        it(`${label} buckets by the payload cwd's repo when no project env var is set`, () => {
            reset();
            const result = run(script, toolPayload(repo), {});
            assert.equal(result.status, 0, result.stderr);
            const expected = join(home, ".claude", "instincts", hashProjectRoot(canonicalizeProjectRoot(gitToplevel(repo))));
            assert.ok(existsSync(join(expected, "observations.jsonl")), `no observations under ${expected}`);
        });
        it(`${label} writes under CI_INSTINCTS_HOME when it is set`, () => {
            reset();
            const result = run(script, toolPayload(repo), { CI_INSTINCTS_HOME: store, CLAUDE_PROJECT_DIR: repo });
            assert.equal(result.status, 0, result.stderr);
            const files = observationFiles(store);
            assert.equal(files.length, 1, `expected one observations.jsonl under ${store}`);
            assert.equal(dirname(files[0]), join(store, hashProjectRoot(canonicalizeProjectRoot(repo))));
            assert.equal(existsSync(join(home, ".claude", "instincts")), false, "the default root was written");
        });
    }
    // Codex, say, sets no project env var. In a directory that is not a repo the
    // observer must write the bucket that workflow-distill (no payload) reads.
    it("workflow-distill nudges on a run the observer recorded from a non-git payload cwd", () => {
        reset();
        const observed = run("bin/observe.mjs", toolPayload(plain), {});
        assert.equal(observed.status, 0, observed.stderr);
        const files = observationFiles(join(home, ".claude", "instincts"));
        assert.equal(files.length, 1, "expected one observations.jsonl");
        assert.equal(dirname(files[0]), join(home, ".claude", "instincts", hashProjectRoot(GLOBAL_PROJECT_ROOT)));
        const script = "export const meta = { name: 'agent-paths-flow', description: 'd', phases: [{ title: 'Read' }] }\nawait parallel([])";
        const rows = [
            {
                ts: "2026-11-21T12:00:00Z",
                session: "s",
                tool: "Workflow",
                input_summary: JSON.stringify({ script }),
                output_summary: JSON.stringify({ status: "async_launched", runId: "wf_x" }),
            },
            { ts: "2026-11-21T12:01:00Z", session: "s", tool: "Bash", input_summary: "npm run verify:all", output_summary: "OK" },
        ];
        writeFileSync(files[0], rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
        const result = run("hooks/workflow-distill.mjs", { hook_event_name: "Stop", session_id: "s", cwd: plain }, {
            CLAUDE_WORKFLOW_DISTILL_NUDGE: "on",
        });
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stderr, /workflow-distill: verified workflow run "agent-paths-flow"/);
    });
    it("session.mjs loads a global lesson from CI_INSTINCTS_HOME", () => {
        reset();
        mkdirSync(join(store, "global"), { recursive: true });
        writeFileSync(join(store, "global", "agent-paths-lesson.yaml"), "id: agent-paths-lesson\ntrigger: when the store moves\nconfidence: 0.8\n---\nRead lessons from CI_INSTINCTS_HOME.\n");
        const result = run("hooks/session.mjs", { hook_event_name: "SessionStart", session_id: "s" }, {
            CI_INSTINCTS_HOME: store,
            CLAUDE_PROJECT_DIR: repo,
        });
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /when the store moves/);
        assert.match(result.stderr, /Instincts: 1/);
    });
    it("gateguard keeps its session state under CI_INSTINCTS_HOME", () => {
        reset();
        const target = join(repo, "a.txt");
        writeFileSync(target, "x");
        const payload = {
            session_id: "agent-paths-gate",
            hook_event_name: "PreToolUse",
            tool_name: "Edit",
            tool_input: { file_path: target, old_string: "x", new_string: "y", _gateguard_facts_presented: true },
            cwd: repo,
        };
        const result = run("hooks/gateguard.mjs", payload, {
            CI_INSTINCTS_HOME: store,
            CLAUDE_PROJECT_DIR: repo,
            CI_GATEGUARD_FILE_GATE: "strict",
        });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, "");
        const state = join(store, hashProjectRoot(repo), "sessions", "agent-paths-gate", "gateguard-session.json");
        assert.ok(existsSync(state), `no state at ${state}`);
        assert.match(readFileSync(state, "utf8"), /a\.txt/);
        assert.equal(existsSync(join(home, ".claude", "instincts")), false, "the default root was written");
    });
});
