import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkSkillTiers, discoverSkillSources } from "../bin/check-skill-tiers.mjs";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CHECKER = join(REPO_ROOT, "bin", "check-skill-tiers.mjs");
function setupRepo() {
    const root = mkdtempSync(join(tmpdir(), "skill-tiers-test-"));
    mkdirSync(join(root, "skills"), { recursive: true });
    return root;
}
function writeCore(root, body) {
    writeFileSync(join(root, "SKILL.md"), body);
}
function writeSkill(root, name, body) {
    writeFileSync(join(root, "skills", `${name}.md`), body);
}
function frontmatter(fields) {
    const lines = ["---", ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`), "---", "", "# body", ""];
    return lines.join("\n");
}
describe("check-skill-tiers — unit", () => {
    it("returns no problems when every skill declares a recognized tier", () => {
        const root = setupRepo();
        try {
            writeCore(root, frontmatter({ name: "continuous-improvement", tier: "core" }));
            writeSkill(root, "alpha", frontmatter({ name: "alpha", tier: "featured" }));
            writeSkill(root, "beta", frontmatter({ name: "beta", tier: '"1"' }));
            writeSkill(root, "gamma", frontmatter({ name: "gamma", tier: '"2"' }));
            writeSkill(root, "delta", frontmatter({ name: "delta", tier: "companion" }));
            const problems = checkSkillTiers(root);
            assert.equal(problems.length, 0, `expected zero problems, got: ${JSON.stringify(problems)}`);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("flags a skill with no `tier:` field as 'missing'", () => {
        const root = setupRepo();
        try {
            writeCore(root, frontmatter({ name: "continuous-improvement", tier: "core" }));
            writeSkill(root, "alpha", frontmatter({ name: "alpha" })); // no tier key
            const problems = checkSkillTiers(root);
            assert.equal(problems.length, 1);
            assert.equal(problems[0].name, "alpha");
            assert.equal(problems[0].reason, "missing");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("flags a skill with an unrecognized tier value as 'unrecognized'", () => {
        const root = setupRepo();
        try {
            writeCore(root, frontmatter({ name: "continuous-improvement", tier: "core" }));
            writeSkill(root, "alpha", frontmatter({ name: "alpha", tier: "premium" }));
            const problems = checkSkillTiers(root);
            assert.equal(problems.length, 1);
            assert.equal(problems[0].name, "alpha");
            assert.equal(problems[0].reason, "unrecognized");
            assert.equal(problems[0].rawTier, "premium");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("flags the core SKILL.md when its tier is missing or unrecognized", () => {
        const root = setupRepo();
        try {
            // Core has no tier
            writeCore(root, frontmatter({ name: "continuous-improvement" }));
            const problems = checkSkillTiers(root);
            assert.equal(problems.length, 1);
            assert.equal(problems[0].name, "continuous-improvement");
            assert.equal(problems[0].reason, "missing");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("ignores skills/README.md (it's a README, not a skill)", () => {
        const root = setupRepo();
        try {
            writeCore(root, frontmatter({ name: "continuous-improvement", tier: "core" }));
            writeFileSync(join(root, "skills", "README.md"), "# README\n\nNo tier here, by design.\n");
            const problems = checkSkillTiers(root);
            assert.equal(problems.length, 0);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("returns empty source list when skills/ dir is missing and no root SKILL.md", () => {
        const root = mkdtempSync(join(tmpdir(), "skill-tiers-empty-"));
        try {
            const sources = discoverSkillSources(root);
            assert.equal(sources.length, 0);
            const problems = checkSkillTiers(root);
            assert.equal(problems.length, 0);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("accepts variants like 'tier1', 'TIER-2', 'FEATURED' via normalizeTier", () => {
        const root = setupRepo();
        try {
            writeCore(root, frontmatter({ name: "continuous-improvement", tier: "core" }));
            writeSkill(root, "alpha", frontmatter({ name: "alpha", tier: "FEATURED" }));
            writeSkill(root, "beta", frontmatter({ name: "beta", tier: "tier1" }));
            writeSkill(root, "gamma", frontmatter({ name: "gamma", tier: "tier-2" }));
            const problems = checkSkillTiers(root);
            assert.equal(problems.length, 0, `accepted variants should not flag: ${JSON.stringify(problems)}`);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
describe("check-skill-tiers — integration", () => {
    it("CLI exits 0 with OK message on a clean synthetic repo", () => {
        const root = setupRepo();
        try {
            writeCore(root, frontmatter({ name: "continuous-improvement", tier: "core" }));
            writeSkill(root, "alpha", frontmatter({ name: "alpha", tier: "featured" }));
            const out = execFileSync("node", [CHECKER, root], { encoding: "utf8" });
            assert.match(out, /OK skill-tiers: all 2 skill source\(s\) declare a recognized tier/);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("CLI exits 1 with FAIL message when a skill is missing tier", () => {
        const root = setupRepo();
        try {
            writeCore(root, frontmatter({ name: "continuous-improvement", tier: "core" }));
            writeSkill(root, "alpha", frontmatter({ name: "alpha" })); // missing tier
            let exited = false;
            try {
                execFileSync("node", [CHECKER, root], { encoding: "utf8" });
            }
            catch (err) {
                exited = true;
                const e = err;
                assert.equal(e.status, 1, `expected exit 1, got ${e.status}`);
                assert.match(e.stderr ?? "", /FAIL skill-tiers: 1 skill\(s\)/);
                assert.match(e.stderr ?? "", /no `tier:` field/);
            }
            assert.ok(exited, "CLI should have exited non-zero when tier is missing");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("verifies the live repo has zero tier problems", () => {
        const problems = checkSkillTiers(REPO_ROOT);
        assert.equal(problems.length, 0, `live repo has skill-tier problems: ${JSON.stringify(problems, null, 2)}`);
    });
});
