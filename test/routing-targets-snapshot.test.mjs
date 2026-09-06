import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { VENDORED_PREFIXES, resolveVendoredSkillPath, findMissingVendoredTargets, checkRoutingTargets, } from "../bin/check-routing-targets.mjs";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
let root = "";
before(() => {
    root = mkdtempSync(join(tmpdir(), "rt-snapshot-"));
    // A miniature third-party tree with one real skill per snapshot.
    for (const [, dir] of Object.entries(VENDORED_PREFIXES)) {
        mkdirSync(join(root, "third-party", dir, "skills", "present"), { recursive: true });
        writeFileSync(join(root, "third-party", dir, "skills", "present", "SKILL.md"), "x");
    }
});
after(() => {
    if (root)
        rmSync(root, { recursive: true, force: true });
});
describe("check-routing-targets — VENDORED_PREFIXES", () => {
    it("maps the routing prefix to its snapshot directory where they differ", () => {
        assert.equal(VENDORED_PREFIXES["agent-skills"], "addy-agent-skills");
    });
    it("covers the four snapshots that routing targets name", () => {
        for (const p of ["oh-my-claudecode", "superpowers", "agent-skills", "ruflo-swarm"]) {
            assert.ok(VENDORED_PREFIXES[p], `${p} must map to a snapshot directory`);
        }
    });
});
describe("check-routing-targets — resolveVendoredSkillPath", () => {
    it("returns the snapshot path for a vendored prefix", () => {
        assert.equal(resolveVendoredSkillPath("oh-my-claudecode:ultragoal"), "third-party/oh-my-claudecode/skills/ultragoal");
    });
    it("uses the mapped directory, not the prefix, when they differ", () => {
        assert.equal(resolveVendoredSkillPath("agent-skills:context-engineering"), "third-party/addy-agent-skills/skills/context-engineering");
    });
    it("returns null for a prefix we do not vendor, so host plugins are never flagged", () => {
        assert.equal(resolveVendoredSkillPath("frontend-design:frontend-design"), null);
        assert.equal(resolveVendoredSkillPath("commit-commands:commit"), null);
    });
    it("returns null for an unprefixed target", () => {
        assert.equal(resolveVendoredSkillPath("code-review"), null);
        assert.equal(resolveVendoredSkillPath("simplify"), null);
    });
    it("keeps a colon that appears inside the skill name", () => {
        assert.equal(resolveVendoredSkillPath("superpowers:a:b"), "third-party/superpowers/skills/a:b");
    });
});
describe("check-routing-targets — findMissingVendoredTargets", () => {
    it("passes a target whose skill directory exists in the snapshot", () => {
        assert.deepEqual(findMissingVendoredTargets(root, ["superpowers:present"]), []);
    });
    it("flags a target the snapshot does not ship", () => {
        const missing = findMissingVendoredTargets(root, ["oh-my-claudecode:ultrawork"]);
        assert.equal(missing.length, 1);
        assert.equal(missing[0].target, "oh-my-claudecode:ultrawork");
        assert.match(missing[0].expectedPath, /third-party[\\/]oh-my-claudecode[\\/]skills[\\/]ultrawork/);
    });
    it("ignores unvendored prefixes and bare names entirely", () => {
        const missing = findMissingVendoredTargets(root, [
            "frontend-design:frontend-design",
            "commit-commands:commit",
            "code-review",
            "simplify",
        ]);
        assert.deepEqual(missing, []);
    });
    it("reports every missing target, not just the first", () => {
        const missing = findMissingVendoredTargets(root, [
            "oh-my-claudecode:ultrawork",
            "oh-my-claudecode:retrospective",
            "superpowers:present",
        ]);
        assert.equal(missing.length, 2);
    });
    it("returns nothing for an empty target list", () => {
        assert.deepEqual(findMissingVendoredTargets(root, []), []);
    });
});
describe("check-routing-targets — against the real repo", () => {
    it("every declared vendored companion exists in its snapshot", () => {
        const result = checkRoutingTargets(REPO_ROOT);
        assert.deepEqual(result.missingVendored.map((m) => m.target), [], "a declared oh-my-claudecode:/superpowers:/agent-skills:/ruflo-swarm: target has no directory in the vendored snapshot");
    });
    it("still reports zero unaccounted routing targets", () => {
        assert.deepEqual(checkRoutingTargets(REPO_ROOT).drifts, []);
    });
});
