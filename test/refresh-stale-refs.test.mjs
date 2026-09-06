import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { REFERENCE_SOURCES, listSkillDirs, findRemovedSkills, findStaleReferences, } from "../bin/refresh-third-party.mjs";
let root = "";
before(() => {
    root = mkdtempSync(join(tmpdir(), "stale-refs-"));
});
after(() => {
    if (root)
        rmSync(root, { recursive: true, force: true });
});
function makeSkills(rel, names) {
    const dir = join(root, rel, "skills");
    mkdirSync(dir, { recursive: true });
    for (const n of names) {
        mkdirSync(join(dir, n), { recursive: true });
        writeFileSync(join(dir, n, "SKILL.md"), "x");
    }
    return join(root, rel);
}
function makeRepo(rel, files) {
    const repo = join(root, rel);
    for (const [p, body] of Object.entries(files)) {
        const abs = join(repo, p);
        mkdirSync(join(abs, ".."), { recursive: true });
        writeFileSync(abs, body);
    }
    return repo;
}
describe("refresh-third-party — listSkillDirs", () => {
    it("lists skill directories, sorted", () => {
        const snap = makeSkills("s1", ["beta", "alpha"]);
        assert.deepEqual(listSkillDirs(snap), ["alpha", "beta"]);
    });
    it("returns an empty list when there is no skills directory", () => {
        assert.deepEqual(listSkillDirs(join(root, "nope")), []);
    });
});
describe("refresh-third-party — findRemovedSkills", () => {
    it("returns what the old snapshot had and the new one does not", () => {
        assert.deepEqual(findRemovedSkills(["a", "b", "c"], ["a", "c", "d"]), ["b"]);
    });
    it("returns nothing when upstream only added skills", () => {
        assert.deepEqual(findRemovedSkills(["a"], ["a", "b"]), []);
    });
    it("returns nothing for identical sets", () => {
        assert.deepEqual(findRemovedSkills(["a", "b"], ["b", "a"]), []);
    });
    it("returns every removal, not just the first", () => {
        assert.deepEqual(findRemovedSkills(["a", "b", "c"], ["a"]), ["b", "c"]);
    });
});
describe("refresh-third-party — findStaleReferences", () => {
    it("flags a removed skill our source still names, and says where", () => {
        const repo = makeRepo("r1", {
            "optional-companions.json": `{"optional_companions":["omc:ultrawork"]}`,
            "skills/superpowers.md": "route to `omc:ultrawork` then ralph",
        });
        const stale = findStaleReferences(repo, "omc", ["ultrawork"]);
        assert.equal(stale.length, 1);
        assert.equal(stale[0].skill, "ultrawork");
        assert.equal(stale[0].files.length, 2);
    });
    it("says nothing when the removed skill is not referenced", () => {
        const repo = makeRepo("r2", { "optional-companions.json": `{"optional_companions":["omc:kept"]}` });
        assert.deepEqual(findStaleReferences(repo, "omc", ["gone"]), []);
    });
    it("matches only the prefixed form, so a bare word in prose is not a false positive", () => {
        const repo = makeRepo("r3", { "skills/a.md": "we should review the release process" });
        assert.deepEqual(findStaleReferences(repo, "omc", ["release", "review"]), []);
    });
    it("does not match a different plugin's skill of the same name", () => {
        const repo = makeRepo("r4", { "skills/a.md": "use `superpowers:ultrawork`" });
        assert.deepEqual(findStaleReferences(repo, "omc", ["ultrawork"]), []);
    });
    it("does not match a longer skill name that starts with the removed one", () => {
        const repo = makeRepo("r5", { "skills/a.md": "use `omc:ultrawork-plus`" });
        assert.deepEqual(findStaleReferences(repo, "omc", ["ultrawork"]), []);
    });
    it("reports several removed skills together", () => {
        const repo = makeRepo("r6", { "skills/a.md": "`omc:one` and `omc:two`" });
        const stale = findStaleReferences(repo, "omc", ["one", "two", "three"]);
        assert.deepEqual(stale.map((s) => s.skill), ["one", "two"]);
    });
    it("never scans the vendored snapshots themselves", () => {
        assert.ok(REFERENCE_SOURCES.every((p) => !p.startsWith("third-party")), "scanning third-party/ would match the snapshot being replaced");
    });
    it("returns nothing when no skills were removed", () => {
        const repo = makeRepo("r7", { "skills/a.md": "`omc:anything`" });
        assert.deepEqual(findStaleReferences(repo, "omc", []), []);
    });
});
