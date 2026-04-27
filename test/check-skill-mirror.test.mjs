import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkPairs, discoverPairs } from "../bin/check-skill-mirror.mjs";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CHECKER = join(REPO_ROOT, "bin", "check-skill-mirror.mjs");
const PLUGIN_SKILLS = "plugins/continuous-improvement/skills";
function setupRepo() {
    const root = mkdtempSync(join(tmpdir(), "skill-mirror-test-"));
    mkdirSync(join(root, PLUGIN_SKILLS), { recursive: true });
    mkdirSync(join(root, "skills"), { recursive: true });
    return root;
}
function writePair(root, name, pluginContent, standaloneContent) {
    const skillDir = join(root, PLUGIN_SKILLS, name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), pluginContent);
    if (standaloneContent !== null) {
        const standalonePath = name === "continuous-improvement"
            ? join(root, "SKILL.md")
            : join(root, "skills", `${name}.md`);
        writeFileSync(standalonePath, standaloneContent);
    }
}
describe("check-skill-mirror — unit", () => {
    it("returns no drifts when every pair is byte-identical", () => {
        const root = setupRepo();
        try {
            writePair(root, "alpha", "alpha body\n", "alpha body\n");
            writePair(root, "beta", "beta body\n", "beta body\n");
            const drifts = checkPairs(root);
            assert.equal(drifts.length, 0, `expected no drifts, got: ${JSON.stringify(drifts)}`);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("detects content drift between plugin and standalone copy", () => {
        const root = setupRepo();
        try {
            writePair(root, "alpha", "alpha body v2\n", "alpha body v1\n");
            const drifts = checkPairs(root);
            assert.equal(drifts.length, 1);
            assert.equal(drifts[0].name, "alpha");
            assert.equal(drifts[0].reason, "content-drift");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("detects missing standalone copy", () => {
        const root = setupRepo();
        try {
            writePair(root, "alpha", "alpha body\n", null);
            const drifts = checkPairs(root);
            assert.equal(drifts.length, 1);
            assert.equal(drifts[0].name, "alpha");
            assert.equal(drifts[0].reason, "missing-standalone");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("maps the core continuous-improvement skill to root SKILL.md", () => {
        const root = setupRepo();
        try {
            writePair(root, "continuous-improvement", "core body\n", "core body\n");
            const pairs = discoverPairs(root);
            assert.equal(pairs.length, 1);
            assert.equal(pairs[0].name, "continuous-improvement");
            const standaloneSuffix = pairs[0].standalonePath
                .replace(/\\/g, "/")
                .slice(root.replace(/\\/g, "/").length);
            assert.equal(standaloneSuffix, "/SKILL.md", `core skill standalone path should be root SKILL.md, got: ${pairs[0].standalonePath}`);
            const drifts = checkPairs(root);
            assert.equal(drifts.length, 0);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("ignores non-directory entries and dirs without a SKILL.md", () => {
        const root = setupRepo();
        try {
            writePair(root, "alpha", "alpha body\n", "alpha body\n");
            mkdirSync(join(root, PLUGIN_SKILLS, "empty-dir"), { recursive: true });
            writeFileSync(join(root, PLUGIN_SKILLS, "stray.txt"), "noise");
            const pairs = discoverPairs(root);
            assert.equal(pairs.length, 1);
            assert.equal(pairs[0].name, "alpha");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("returns empty list when plugin skills dir is missing", () => {
        const root = mkdtempSync(join(tmpdir(), "skill-mirror-empty-"));
        try {
            const pairs = discoverPairs(root);
            assert.equal(pairs.length, 0);
            const drifts = checkPairs(root);
            assert.equal(drifts.length, 0);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
describe("check-skill-mirror — integration", () => {
    it("CLI exits 0 with OK message on a clean synthetic repo", () => {
        const root = setupRepo();
        try {
            writePair(root, "alpha", "alpha\n", "alpha\n");
            writePair(root, "beta", "beta\n", "beta\n");
            const out = execFileSync("node", [CHECKER, root], { encoding: "utf8" });
            assert.match(out, /OK skill-mirror: all 2 skill pair\(s\) match/);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("CLI exits 1 with FAIL message on a drifted synthetic repo", () => {
        const root = setupRepo();
        try {
            writePair(root, "alpha", "alpha v2\n", "alpha v1\n");
            let exited = false;
            try {
                execFileSync("node", [CHECKER, root], { encoding: "utf8" });
            }
            catch (err) {
                exited = true;
                const e = err;
                assert.equal(e.status, 1, `expected exit 1, got ${e.status}`);
                assert.match(e.stderr ?? "", /FAIL skill-mirror: 1 drift\(s\)/);
                assert.match(e.stderr ?? "", /content drift/);
            }
            assert.ok(exited, "CLI should have exited non-zero on drift");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("verifies the live repo has zero drifts", () => {
        const drifts = checkPairs(REPO_ROOT);
        assert.equal(drifts.length, 0, `live repo has skill-mirror drift: ${JSON.stringify(drifts, null, 2)}`);
    });
});
