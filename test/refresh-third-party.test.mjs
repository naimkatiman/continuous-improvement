import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OUR_FILES, readOurFiles, restoreOurFiles } from "../bin/refresh-third-party.mjs";
let root = "";
before(() => {
    root = mkdtempSync(join(tmpdir(), "refresh-ours-"));
});
after(() => {
    if (root)
        rmSync(root, { recursive: true, force: true });
});
const snapshotDir = (name) => join(root, name);
function makeSnapshot(name, files) {
    const dir = snapshotDir(name);
    mkdirSync(dir, { recursive: true });
    for (const [rel, body] of Object.entries(files))
        writeFileSync(join(dir, rel), body);
    return dir;
}
describe("refresh-third-party — OUR_FILES", () => {
    it("names the drift radar and the fork-only allowlist", () => {
        assert.ok(OUR_FILES.includes("OUR_NOTES.md"));
        assert.ok(OUR_FILES.includes(".fork-only-skills.txt"));
    });
});
describe("refresh-third-party — readOurFiles", () => {
    it("captures the files that exist", async () => {
        const dir = makeSnapshot("a", {
            "OUR_NOTES.md": "# radar\nlots of notes",
            ".fork-only-skills.txt": "deploy-receipt\n",
            "README.md": "upstream, not ours",
        });
        const saved = await readOurFiles(dir);
        assert.equal(saved.size, 2);
        assert.equal(saved.get("OUR_NOTES.md")?.toString(), "# radar\nlots of notes");
        assert.equal(saved.get(".fork-only-skills.txt")?.toString(), "deploy-receipt\n");
    });
    it("never captures an upstream file", async () => {
        const dir = makeSnapshot("b", { "OUR_NOTES.md": "x", "README.md": "upstream" });
        const saved = await readOurFiles(dir);
        assert.equal(saved.has("README.md"), false);
    });
    it("skips a file that is absent instead of throwing", async () => {
        const dir = makeSnapshot("c", { "OUR_NOTES.md": "only this one" });
        const saved = await readOurFiles(dir);
        assert.equal(saved.size, 1);
        assert.equal(saved.has(".fork-only-skills.txt"), false);
    });
    it("returns an empty map for a snapshot that has none of them", async () => {
        const dir = makeSnapshot("d", { "README.md": "upstream only" });
        assert.equal((await readOurFiles(dir)).size, 0);
    });
    it("returns an empty map for a directory that does not exist", async () => {
        assert.equal((await readOurFiles(join(root, "nope"))).size, 0);
    });
});
describe("refresh-third-party — restoreOurFiles", () => {
    it("survives the wipe-and-recreate the refresh performs", async () => {
        const dir = makeSnapshot("e", {
            "OUR_NOTES.md": "# drift radar\nrefresh log entries",
            ".fork-only-skills.txt": "deploy-receipt\n",
            "README.md": "upstream",
        });
        const saved = await readOurFiles(dir);
        // What refreshOne does between save and restore.
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "README.md"), "fresh upstream copy");
        const restored = await restoreOurFiles(dir, saved);
        assert.equal(restored, 2);
        assert.equal(readFileSync(join(dir, "OUR_NOTES.md"), "utf8"), "# drift radar\nrefresh log entries");
        assert.equal(readFileSync(join(dir, ".fork-only-skills.txt"), "utf8"), "deploy-receipt\n");
        assert.equal(readFileSync(join(dir, "README.md"), "utf8"), "fresh upstream copy");
    });
    it("restores nothing and reports zero when nothing was saved", async () => {
        const dir = makeSnapshot("f", { "README.md": "upstream" });
        assert.equal(await restoreOurFiles(dir, new Map()), 0);
        assert.equal(existsSync(join(dir, "OUR_NOTES.md")), false);
    });
    it("preserves bytes exactly, including CRLF and trailing whitespace", async () => {
        const body = "line one\r\nline two\r\n\r\n   ";
        const dir = makeSnapshot("g", { "OUR_NOTES.md": body });
        const saved = await readOurFiles(dir);
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
        await restoreOurFiles(dir, saved);
        assert.equal(readFileSync(join(dir, "OUR_NOTES.md"), "utf8"), body);
    });
    it("overwrites an upstream file that happens to share the name", async () => {
        const dir = makeSnapshot("h", { "OUR_NOTES.md": "ours" });
        const saved = await readOurFiles(dir);
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "OUR_NOTES.md"), "upstream shipped one too");
        await restoreOurFiles(dir, saved);
        assert.equal(readFileSync(join(dir, "OUR_NOTES.md"), "utf8"), "ours");
    });
});
