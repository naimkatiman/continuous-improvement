import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkSkillLawTags, descriptionHasLawTag, discoverSkillSources, } from "../bin/check-skill-law-tag.mjs";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CHECKER = join(REPO_ROOT, "bin", "check-skill-law-tag.mjs");
function setupRepo() {
    const root = mkdtempSync(join(tmpdir(), "skill-law-tag-test-"));
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
    const lines = [
        "---",
        ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`),
        "---",
        "",
        "# body",
        "",
    ];
    return lines.join("\n");
}
describe("descriptionHasLawTag — pattern unit", () => {
    it("matches 'Law 1' through 'Law 7'", () => {
        for (let n = 1; n <= 7; n++) {
            assert.ok(descriptionHasLawTag(`Enforces Law ${n} of the 7 Laws.`), `should match "Law ${n}"`);
        }
    });
    it("matches 'Law N' with no space", () => {
        assert.ok(descriptionHasLawTag("Enforces Law4 here."));
    });
    it("matches case-insensitively", () => {
        assert.ok(descriptionHasLawTag("enforces law 2 here"));
        assert.ok(descriptionHasLawTag("ENFORCES LAW 5 HERE"));
    });
    it("matches 'all 7 Laws' for the orchestrator", () => {
        assert.ok(descriptionHasLawTag("Orchestrator for all 7 Laws of AI Agent Discipline."));
    });
    it("matches 'Law activator' for dispatchers", () => {
        assert.ok(descriptionHasLawTag("Law activator for the 7 Laws."));
    });
    it("does NOT match 'Law 0' or 'Law 8' (out of range)", () => {
        assert.equal(descriptionHasLawTag("Mentions Law 0 only."), false);
        assert.equal(descriptionHasLawTag("Mentions Law 8 only."), false);
    });
    it("does NOT match generic text without any Law tag", () => {
        assert.equal(descriptionHasLawTag("Does some useful thing for the agent."), false);
    });
    it("does NOT match an empty description", () => {
        assert.equal(descriptionHasLawTag(""), false);
    });
});
describe("checkSkillLawTags — unit", () => {
    it("returns no problems when every non-core skill carries a Law tag", () => {
        const root = setupRepo();
        try {
            writeCore(root, frontmatter({
                name: "continuous-improvement",
                tier: "core",
                description: '"The 7 Laws spec itself."',
            }));
            writeSkill(root, "alpha", frontmatter({
                name: "alpha",
                tier: '"1"',
                description: '"Enforces Law 1 (Research Before Executing). Does X."',
            }));
            writeSkill(root, "beta", frontmatter({
                name: "beta",
                tier: "featured",
                description: '"Orchestrator for all 7 Laws. Walks the list."',
            }));
            writeSkill(root, "gamma", frontmatter({
                name: "gamma",
                tier: "companion",
                description: '"Law activator. Dispatches to Law-aligned skills."',
            }));
            const problems = checkSkillLawTags(root);
            assert.equal(problems.length, 0, `expected zero problems, got: ${JSON.stringify(problems)}`);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("flags a non-core skill whose description has no Law tag", () => {
        const root = setupRepo();
        try {
            writeCore(root, frontmatter({
                name: "continuous-improvement",
                tier: "core",
                description: '"The 7 Laws spec."',
            }));
            writeSkill(root, "alpha", frontmatter({
                name: "alpha",
                tier: '"1"',
                description: '"Just does a useful thing without naming a Law."',
            }));
            const problems = checkSkillLawTags(root);
            assert.equal(problems.length, 1);
            assert.equal(problems[0].name, "alpha");
            assert.match(problems[0].description, /useful thing/);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("exempts the core skill (tier: core) from the Law-tag requirement", () => {
        const root = setupRepo();
        try {
            // Core has NO Law tag in its description — that's fine, it IS the spec.
            writeCore(root, frontmatter({
                name: "continuous-improvement",
                tier: "core",
                description: '"Install structured self-improvement loops without any Law tag here."',
            }));
            const problems = checkSkillLawTags(root);
            assert.equal(problems.length, 0, `core skill should be exempt: ${JSON.stringify(problems)}`);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("flags a skill with a missing description field", () => {
        const root = setupRepo();
        try {
            writeCore(root, frontmatter({
                name: "continuous-improvement",
                tier: "core",
                description: '"core spec"',
            }));
            // No description: key at all.
            writeSkill(root, "alpha", frontmatter({ name: "alpha", tier: '"1"' }));
            const problems = checkSkillLawTags(root);
            assert.equal(problems.length, 1);
            assert.equal(problems[0].name, "alpha");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("ignores skills/README.md (it's a README, not a skill)", () => {
        const root = setupRepo();
        try {
            writeCore(root, frontmatter({
                name: "continuous-improvement",
                tier: "core",
                description: '"core spec"',
            }));
            writeFileSync(join(root, "skills", "README.md"), "# README\n\nNo Law tag, by design.\n");
            const problems = checkSkillLawTags(root);
            assert.equal(problems.length, 0);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("returns empty source list when skills/ dir is missing and no root SKILL.md", () => {
        const root = mkdtempSync(join(tmpdir(), "skill-law-tag-empty-"));
        try {
            const sources = discoverSkillSources(root);
            assert.equal(sources.length, 0);
            const problems = checkSkillLawTags(root);
            assert.equal(problems.length, 0);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
describe("check-skill-law-tag — integration (CLI)", () => {
    it("CLI exits 0 with OK message on a clean synthetic repo", () => {
        const root = setupRepo();
        try {
            writeCore(root, frontmatter({
                name: "continuous-improvement",
                tier: "core",
                description: '"core spec"',
            }));
            writeSkill(root, "alpha", frontmatter({
                name: "alpha",
                tier: "featured",
                description: '"Enforces Law 4 of the 7 Laws."',
            }));
            const out = execFileSync("node", [CHECKER, root], { encoding: "utf8" });
            assert.match(out, /OK skill-law-tag/);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("CLI exits 1 with FAIL message when a skill is missing a Law tag", () => {
        const root = setupRepo();
        try {
            writeCore(root, frontmatter({
                name: "continuous-improvement",
                tier: "core",
                description: '"core spec"',
            }));
            writeSkill(root, "alpha", frontmatter({
                name: "alpha",
                tier: '"1"',
                description: '"Just useful, no Law tag."',
            }));
            let exited = false;
            try {
                execFileSync("node", [CHECKER, root], { encoding: "utf8" });
            }
            catch (err) {
                exited = true;
                const e = err;
                assert.equal(e.status, 1, `expected exit 1, got ${e.status}`);
                assert.match(e.stderr ?? "", /FAIL skill-law-tag: 1 skill\(s\)/);
                assert.match(e.stderr ?? "", /no recognized Law tag/);
            }
            assert.ok(exited, "CLI should have exited non-zero when a Law tag is missing");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
describe("check-skill-law-tag — live repo", () => {
    it("verifies the live repo has zero Law-tag problems", () => {
        const problems = checkSkillLawTags(REPO_ROOT);
        assert.equal(problems.length, 0, `live repo has skill-law-tag problems: ${JSON.stringify(problems, null, 2)}`);
    });
});
