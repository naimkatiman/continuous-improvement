import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseManifestEntries } from "../bin/check-third-party-shape.mjs";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const marketplace = JSON.parse(readFileSync(join(REPO_ROOT, ".claude-plugin", "marketplace.json"), "utf8"));
const companions = marketplace.plugins.filter((p) => p.source.startsWith("./third-party/"));
const manifestEntries = parseManifestEntries(readFileSync(join(REPO_ROOT, "third-party", "MANIFEST.md"), "utf8"));
function snapshotDir(entry) {
    return join(REPO_ROOT, entry.source);
}
function skillNames(dir) {
    const skillsDir = join(dir, "skills");
    if (!existsSync(skillsDir))
        return [];
    return readdirSync(skillsDir).filter((name) => statSync(join(skillsDir, name)).isDirectory());
}
function agentCount(dir) {
    const agentsDir = join(dir, "agents");
    if (!existsSync(agentsDir))
        return 0;
    return readdirSync(agentsDir).filter((f) => f.endsWith(".md") && f !== "README.md").length;
}
// "Skills: a, b and c." or "Skills include: a, b, c." -> ["a", "b", "c"]
function listedNames(description, label) {
    const match = description.match(new RegExp(`\\b${label}(?: include)?: ([^.]+)\\.`));
    if (!match)
        return null;
    return match[1]
        .split(/,\s*(?:and\s+)?|\s+and\s+/)
        .map((s) => s.trim().replace(/^\//, ""))
        .filter((s) => s.length > 0);
}
describe("marketplace companion entries match their vendored snapshots", () => {
    it("lists all four vendored companions", () => {
        assert.deepEqual(companions.map((c) => c.name).sort(), ["agent-skills", "oh-my-claudecode", "ruflo-swarm", "superpowers"]);
    });
    for (const entry of companions) {
        describe(entry.name, () => {
            it("version equals the snapshot's own .claude-plugin/plugin.json version", () => {
                const pluginJson = JSON.parse(readFileSync(join(snapshotDir(entry), ".claude-plugin", "plugin.json"), "utf8"));
                assert.equal(entry.version, pluginJson.version);
            });
            it("skill and agent counts in the description match the snapshot", () => {
                const skills = entry.description.match(/(\d+) skills\b/);
                if (skills)
                    assert.equal(Number(skills[1]), skillNames(snapshotDir(entry)).length, "skill count");
                const agents = entry.description.match(/(\d+) agents\b/);
                if (agents)
                    assert.equal(Number(agents[1]), agentCount(snapshotDir(entry)), "agent count");
            });
            it("every skill named in the description exists in the snapshot", () => {
                const named = listedNames(entry.description, "Skills");
                assert.ok(named && named.length > 0, `description has no "Skills:" list: ${entry.description}`);
                const present = new Set(skillNames(snapshotDir(entry)));
                const missing = named.filter((n) => !present.has(n));
                assert.deepEqual(missing, [], `skills named but not in ${entry.source}/skills/`);
            });
            it("every command named in the description exists in the snapshot", () => {
                const named = listedNames(entry.description, "Commands") ?? [];
                const missing = named.filter((n) => !existsSync(join(snapshotDir(entry), "commands", `${n}.md`)));
                assert.deepEqual(missing, [], `commands named but not in ${entry.source}/commands/`);
            });
            it("the SHA in the description is the one third-party/MANIFEST.md pins", () => {
                const local = entry.source.replace(/^\.\//, "").replace(/\/?$/, "/");
                const pinned = manifestEntries.find((m) => m.localPath?.replace(/\/?$/, "/") === local)?.pinnedSha;
                assert.ok(pinned, `no MANIFEST.md entry for ${local}`);
                const sha = entry.description.match(/\bSHA ([0-9a-f]{7,40})\b/);
                assert.ok(sha, "description names no SHA");
                assert.ok(pinned.startsWith(sha[1]), `description SHA ${sha[1]} is not MANIFEST pin ${pinned}`);
            });
        });
    }
});
