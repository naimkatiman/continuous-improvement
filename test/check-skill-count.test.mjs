import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { countSkills } from "../bin/check-skill-count.mjs";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CHECKER = join(REPO_ROOT, "bin", "check-skill-count.mjs");
function setupRepo(skillNames, descriptions) {
    const root = mkdtempSync(join(tmpdir(), "skill-count-test-"));
    const bundleSkillsDir = join(root, "plugins", "continuous-improvement", "skills");
    mkdirSync(bundleSkillsDir, { recursive: true });
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    mkdirSync(join(root, "plugins", "continuous-improvement", ".claude-plugin"), { recursive: true });
    for (const name of skillNames) {
        mkdirSync(join(bundleSkillsDir, name), { recursive: true });
        writeFileSync(join(bundleSkillsDir, name, "SKILL.md"), `---\nname: ${name}\n---\n# ${name}\n`);
    }
    writeFileSync(join(root, ".claude-plugin", "marketplace.json"), JSON.stringify({ description: descriptions.marketplace ?? "" }));
    writeFileSync(join(root, "plugins", "continuous-improvement", ".claude-plugin", "plugin.json"), JSON.stringify({ description: descriptions.plugin ?? "" }));
    writeFileSync(join(root, "package.json"), JSON.stringify({ description: descriptions.package ?? "" }));
    return root;
}
describe("check-skill-count — unit", () => {
    it("counts only directories under the bundle skills dir, not loose files", () => {
        const root = setupRepo(["alpha", "beta", "gamma"], {});
        try {
            writeFileSync(join(root, "plugins", "continuous-improvement", "skills", "README.md"), "# README\n");
            assert.equal(countSkills(root), 3);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
describe("check-skill-count — integration", () => {
    it("CLI exits 0 when all three descriptions state the correct count", () => {
        const phrase = "2 bundled skills";
        const root = setupRepo(["alpha", "beta"], {
            marketplace: `The 7 Laws — ${phrase}, gating hooks.`,
            plugin: `The 7 Laws — ${phrase}, gating hooks.`,
            package: `The 7 Laws — ${phrase}, gating hooks.`,
        });
        try {
            const out = execFileSync("node", [CHECKER, root], { encoding: "utf8" });
            assert.match(out, /OK skill-count: all 3 description string\(s\) state "2 bundled skills"/);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("CLI exits 1 and names the stale file when a count drifts", () => {
        const root = setupRepo(["alpha", "beta", "gamma"], {
            marketplace: "The 7 Laws — 3 bundled skills, gating hooks.",
            plugin: "The 7 Laws — 13 bundled skills, gating hooks.",
            package: "The 7 Laws — 3 bundled skills, gating hooks.",
        });
        try {
            let exited = false;
            try {
                execFileSync("node", [CHECKER, root], { encoding: "utf8" });
            }
            catch (err) {
                exited = true;
                const e = err;
                assert.equal(e.status, 1, `expected exit 1, got ${e.status}`);
                assert.match(e.stderr ?? "", /FAIL skill-count: 1 description string\(s\)/);
                assert.match(e.stderr ?? "", /plugin\.json — states "13 bundled skills"/);
            }
            assert.ok(exited, "CLI should have exited non-zero when a count drifts");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("verifies the live repo states the correct bundled-skill count", () => {
        const out = execFileSync("node", [CHECKER, REPO_ROOT], { encoding: "utf8" });
        assert.match(out, /OK skill-count:/);
    });
});
