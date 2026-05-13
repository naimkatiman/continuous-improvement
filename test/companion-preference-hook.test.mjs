import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
// __dirname resolves to <repo>/test/ at runtime (compiled .mjs lives under
// test/ per tsconfig outDir). Hook lives under <repo>/hooks/.
const HOOK_PATH = join(__dirname, "..", "hooks", "companion-preference.mjs");
function buildIsolatedEnv(home) {
    const env = { ...process.env };
    delete env.HOME;
    delete env.USERPROFILE;
    env.HOME = home;
    env.USERPROFILE = home;
    return env;
}
function runHook(payload, home) {
    const input = typeof payload === "string" ? payload : JSON.stringify(payload);
    const result = spawnSync(process.execPath, [HOOK_PATH], {
        input,
        env: buildIsolatedEnv(home),
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
function setSettings(home, settings) {
    const dir = join(home, ".claude");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "settings.json"), JSON.stringify(settings));
}
function installCompanion(home, pluginName) {
    mkdirSync(join(home, ".claude", "plugins", pluginName), { recursive: true });
}
function decision(r) {
    return JSON.parse(r.stdout);
}
describe("companion-preference hook", () => {
    let home;
    before(() => {
        home = mkdtempSync(join(tmpdir(), "ci-comp-pref-"));
    });
    after(() => {
        rmSync(home, { recursive: true, force: true });
    });
    it("ignores non-Skill tool calls under any mode", () => {
        setSettings(home, {
            continuous_improvement: { companion_preference: "strict-companions" },
        });
        const r = runHook({ tool_name: "Bash", tool_input: { command: "ls" } }, home);
        assert.equal(decision(r).decision, "allow");
        assert.equal(r.stderr, "");
    });
    it("defaults to ci-first when settings.json is missing", () => {
        const isolated = mkdtempSync(join(tmpdir(), "ci-comp-pref-nosettings-"));
        try {
            const r = runHook({ tool_name: "Skill", tool_input: { skill: "tdd-workflow" } }, isolated);
            assert.equal(decision(r).decision, "allow");
            assert.equal(r.stderr, "");
        }
        finally {
            rmSync(isolated, { recursive: true, force: true });
        }
    });
    it("ci-first mode is a no-op even on mapped skills", () => {
        setSettings(home, {
            continuous_improvement: { companion_preference: "ci-first" },
        });
        const r = runHook({ tool_name: "Skill", tool_input: { skill: "tdd-workflow" } }, home);
        assert.equal(decision(r).decision, "allow");
        assert.equal(r.stderr, "");
    });
    it("companions-first emits an advisory on a mapped CI skill", () => {
        setSettings(home, {
            continuous_improvement: { companion_preference: "companions-first" },
        });
        const r = runHook({ tool_name: "Skill", tool_input: { skill: "tdd-workflow" } }, home);
        assert.equal(decision(r).decision, "allow");
        assert.match(r.stderr, /companion_preference=companions-first/);
        assert.match(r.stderr, /superpowers:test-driven-development/);
    });
    it("companions-first is silent on a non-mapped skill", () => {
        setSettings(home, {
            continuous_improvement: { companion_preference: "companions-first" },
        });
        const r = runHook({ tool_name: "Skill", tool_input: { skill: "gateguard" } }, home);
        assert.equal(decision(r).decision, "allow");
        assert.equal(r.stderr, "");
    });
    it("strict-companions blocks a mapped CI skill when the companion is installed", () => {
        setSettings(home, {
            continuous_improvement: { companion_preference: "strict-companions" },
        });
        installCompanion(home, "superpowers");
        const r = runHook({ tool_name: "Skill", tool_input: { skill: "tdd-workflow" } }, home);
        const d = decision(r);
        assert.equal(d.decision, "block");
        assert.match(d.reason ?? "", /superpowers:test-driven-development/);
        assert.match(d.reason ?? "", /strict-companions/);
    });
    it("strict-companions blocks with install hint when the companion is not installed", () => {
        const isolated = mkdtempSync(join(tmpdir(), "ci-comp-pref-strict-noinstall-"));
        try {
            setSettings(isolated, {
                continuous_improvement: { companion_preference: "strict-companions" },
            });
            const r = runHook({ tool_name: "Skill", tool_input: { skill: "tdd-workflow" } }, isolated);
            const d = decision(r);
            assert.equal(d.decision, "block");
            assert.match(d.reason ?? "", /not installed/i);
            assert.match(d.reason ?? "", /plugin install/);
        }
        finally {
            rmSync(isolated, { recursive: true, force: true });
        }
    });
    it("fail-open on malformed JSON input", () => {
        setSettings(home, {
            continuous_improvement: { companion_preference: "strict-companions" },
        });
        const r = runHook("{not valid json", home);
        assert.equal(r.status, 0);
        assert.equal(decision(r).decision, "allow");
    });
});
function projectHash(projectRoot) {
    return createHash("sha256").update(projectRoot).digest("hex").slice(0, 12);
}
function telemetryPath(home, projectRoot) {
    return join(home, ".claude", "instincts", projectHash(projectRoot), "companion-preference.jsonl");
}
function runHookWithProject(payload, home, projectRoot) {
    const input = typeof payload === "string" ? payload : JSON.stringify(payload);
    const env = buildIsolatedEnv(home);
    env.CLAUDE_PROJECT_DIR = projectRoot;
    const result = spawnSync(process.execPath, [HOOK_PATH], {
        input,
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
function readTelemetry(home, projectRoot) {
    const path = telemetryPath(home, projectRoot);
    if (!existsSync(path))
        return [];
    return readFileSync(path, "utf8")
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
}
describe("companion-preference hook telemetry", () => {
    let home;
    let projectRoot;
    before(() => {
        home = mkdtempSync(join(tmpdir(), "ci-comp-pref-tel-"));
        // Use a stable synthetic project root so the hash is deterministic
        // independent of where the test is invoked from.
        projectRoot = "/test/companion-preference-telemetry";
    });
    after(() => {
        rmSync(home, { recursive: true, force: true });
    });
    it("ci-first writes an `observation` row for a mapped CI skill (shadow data)", () => {
        setSettings(home, {
            continuous_improvement: { companion_preference: "ci-first" },
        });
        const r = runHookWithProject({ tool_name: "Skill", tool_input: { skill: "tdd-workflow" } }, home, projectRoot);
        assert.equal(decision(r).decision, "allow");
        assert.equal(r.stderr, "");
        const lines = readTelemetry(home, projectRoot);
        assert.equal(lines.length, 1);
        assert.equal(lines[0].action, "observation");
        assert.equal(lines[0].mode, "ci-first");
        assert.equal(lines[0].ci_skill, "tdd-workflow");
        assert.equal(lines[0].companion, "superpowers:test-driven-development");
        assert.equal(lines[0].plugin, "superpowers");
        assert.equal(lines[0].hook, "companion-preference");
        assert.match(lines[0].ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, "ts is ISO 8601");
    });
    it("ci-first does NOT write telemetry for a non-mapped skill", () => {
        const isolated = mkdtempSync(join(tmpdir(), "ci-comp-pref-tel-nonmapped-"));
        try {
            const isolatedProject = "/test/non-mapped";
            setSettings(isolated, {
                continuous_improvement: { companion_preference: "ci-first" },
            });
            runHookWithProject({ tool_name: "Skill", tool_input: { skill: "gateguard" } }, isolated, isolatedProject);
            assert.equal(readTelemetry(isolated, isolatedProject).length, 0);
        }
        finally {
            rmSync(isolated, { recursive: true, force: true });
        }
    });
    it("companions-first writes an `advisory` row with companion_installed flag", () => {
        const isolated = mkdtempSync(join(tmpdir(), "ci-comp-pref-tel-adv-"));
        try {
            const isolatedProject = "/test/companions-first";
            setSettings(isolated, {
                continuous_improvement: { companion_preference: "companions-first" },
            });
            installCompanion(isolated, "superpowers");
            runHookWithProject({ tool_name: "Skill", tool_input: { skill: "verification-loop" } }, isolated, isolatedProject);
            const lines = readTelemetry(isolated, isolatedProject);
            assert.equal(lines.length, 1);
            assert.equal(lines[0].action, "advisory");
            assert.equal(lines[0].mode, "companions-first");
            assert.equal(lines[0].ci_skill, "verification-loop");
            assert.equal(lines[0].companion_installed, true);
        }
        finally {
            rmSync(isolated, { recursive: true, force: true });
        }
    });
    it("strict-companions writes `block` when companion installed, `block-not-installed` when missing", () => {
        const installed = mkdtempSync(join(tmpdir(), "ci-comp-pref-tel-blk-yes-"));
        const missing = mkdtempSync(join(tmpdir(), "ci-comp-pref-tel-blk-no-"));
        try {
            setSettings(installed, {
                continuous_improvement: { companion_preference: "strict-companions" },
            });
            installCompanion(installed, "superpowers");
            runHookWithProject({ tool_name: "Skill", tool_input: { skill: "tdd-workflow" } }, installed, "/test/strict-installed");
            const installedLines = readTelemetry(installed, "/test/strict-installed");
            assert.equal(installedLines.length, 1);
            assert.equal(installedLines[0].action, "block");
            assert.equal(installedLines[0].companion_installed, true);
            setSettings(missing, {
                continuous_improvement: { companion_preference: "strict-companions" },
            });
            runHookWithProject({ tool_name: "Skill", tool_input: { skill: "tdd-workflow" } }, missing, "/test/strict-missing");
            const missingLines = readTelemetry(missing, "/test/strict-missing");
            assert.equal(missingLines.length, 1);
            assert.equal(missingLines[0].action, "block-not-installed");
            assert.equal(missingLines[0].companion_installed, false);
        }
        finally {
            rmSync(installed, { recursive: true, force: true });
            rmSync(missing, { recursive: true, force: true });
        }
    });
    it("multiple invocations append (not overwrite)", () => {
        const isolated = mkdtempSync(join(tmpdir(), "ci-comp-pref-tel-append-"));
        try {
            const isolatedProject = "/test/append";
            setSettings(isolated, {
                continuous_improvement: { companion_preference: "companions-first" },
            });
            for (let i = 0; i < 3; i += 1) {
                runHookWithProject({ tool_name: "Skill", tool_input: { skill: "tdd-workflow" } }, isolated, isolatedProject);
            }
            const lines = readTelemetry(isolated, isolatedProject);
            assert.equal(lines.length, 3);
            assert.ok(lines.every((l) => l.action === "advisory"));
        }
        finally {
            rmSync(isolated, { recursive: true, force: true });
        }
    });
    it("telemetry write failure does not change the decision (fail-open preserved)", () => {
        // Skip POSIX-permission test on Windows where chmod is a no-op for read-only.
        if (platform() === "win32")
            return;
        const isolated = mkdtempSync(join(tmpdir(), "ci-comp-pref-tel-rdonly-"));
        try {
            const isolatedProject = "/test/readonly";
            setSettings(isolated, {
                continuous_improvement: { companion_preference: "strict-companions" },
            });
            // Pre-create the session dir as read-only so appendFileSync inside the
            // hook fails. The decision must still succeed.
            const sessionDir = join(isolated, ".claude", "instincts", projectHash(isolatedProject));
            mkdirSync(sessionDir, { recursive: true });
            chmodSync(sessionDir, 0o500);
            const r = runHookWithProject({ tool_name: "Skill", tool_input: { skill: "tdd-workflow" } }, isolated, isolatedProject);
            assert.equal(r.status, 0);
            // Block decision still emitted from stdout regardless of telemetry failure.
            assert.equal(decision(r).decision, "block");
            chmodSync(sessionDir, 0o700);
        }
        finally {
            rmSync(isolated, { recursive: true, force: true });
        }
    });
});
