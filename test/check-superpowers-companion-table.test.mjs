import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SECTION_HEADER, extractCompanionTableRows, extractSkillRefs, checkSuperpowersCompanionTable, } from "../bin/check-superpowers-companion-table.mjs";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CHECKER = join(REPO_ROOT, "bin", "check-superpowers-companion-table.mjs");
function setupRepo() {
    const root = mkdtempSync(join(tmpdir(), "companion-table-"));
    mkdirSync(join(root, "commands"), { recursive: true });
    mkdirSync(join(root, "skills"), { recursive: true });
    return root;
}
function writeCommand(root, tableRows) {
    const body = [
        "# /superpowers",
        "",
        SECTION_HEADER,
        "",
        "| Source | Where it lives | Examples of what it routes to |",
        "|---|---|---|",
        ...tableRows,
        "",
        "## Distinct variants — never collapse them",
        "",
        "Noise table that must not be parsed:",
        "",
        "| Short name | Obra | CI |",
        "|---|---|---|",
        "| `ralph` | not present | bundled |",
        "",
    ].join("\n");
    writeFileSync(join(root, "commands", "superpowers.md"), body);
}
function writeVendoredSkill(root, snapshot, name) {
    const dir = join(root, "third-party", snapshot, "skills", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), `# ${name}\n`);
}
function writeBundledSkill(root, name) {
    writeFileSync(join(root, "skills", `${name}.md`), `# ${name}\n`);
}
describe("check-superpowers-companion-table — extractSkillRefs", () => {
    it("expands Obra's `:writing-plans` shorthand after a `superpowers:` prefix", () => {
        const refs = extractSkillRefs("`superpowers:brainstorming`, `:writing-plans`, `:executing-plans`");
        assert.deepEqual(refs, ["brainstorming", "writing-plans", "executing-plans"]);
    });
    it("keeps bare OMC skill names as-is", () => {
        const refs = extractSkillRefs("`release`, `ultragoal`, `launch`, `deep-interview`");
        assert.deepEqual(refs, ["release", "ultragoal", "launch", "deep-interview"]);
    });
    it("drops slash commands and MCP wildcards so they cannot pass as skills", () => {
        const refs = extractSkillRefs("`swarm-init`, `monitor-stream`; `swarm_*` and `agent_*` MCP tools; `/swarm`, `/watch`");
        assert.deepEqual(refs, ["swarm-init", "monitor-stream"]);
    });
});
describe("check-superpowers-companion-table — parser", () => {
    it("reads only the Routing surface table, not later tables", () => {
        const md = [
            SECTION_HEADER,
            "",
            "| Source | Where it lives | Examples of what it routes to |",
            "|---|---|---|",
            "| `oh-my-claudecode` | vendored at `third-party/oh-my-claudecode/` | `ultragoal` |",
            "",
            "## Distinct variants",
            "",
            "| Short name | Obra | CI |",
            "|---|---|---|",
            "| `ralph` | not present | bundled |",
            "",
        ].join("\n");
        const rows = extractCompanionTableRows(md);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].snapshotDir, "oh-my-claudecode");
        assert.deepEqual(rows[0].skills, ["ultragoal"]);
    });
    it("throws when the companion-table heading is missing", () => {
        assert.throws(() => extractCompanionTableRows("# /superpowers\n\nNo table here.\n"), /companion-table section header not found/i);
    });
});
describe("check-superpowers-companion-table — the three deleted skills", () => {
    it("flags ultrawork, ultraqa and deep-dive when the snapshot no longer ships them", () => {
        const root = setupRepo();
        try {
            writeVendoredSkill(root, "oh-my-claudecode", "ultragoal");
            writeVendoredSkill(root, "oh-my-claudecode", "launch");
            writeCommand(root, [
                "| `oh-my-claudecode` | vendored at `third-party/oh-my-claudecode/`, pinned SHA `4820f56` (v5.3.0) | `release`, `ultrawork`, `ultraqa`, `deep-dive`, `ultragoal` |",
            ]);
            const result = checkSuperpowersCompanionTable(root);
            const missing = result.missing.map((m) => m.skill).sort();
            assert.deepEqual(missing, ["deep-dive", "release", "ultraqa", "ultrawork"]);
            assert.ok(result.missing.every((m) => m.expectedPath.includes("oh-my-claudecode")));
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("passes the same row once those three names are gone", () => {
        const root = setupRepo();
        try {
            writeVendoredSkill(root, "oh-my-claudecode", "ultragoal");
            writeVendoredSkill(root, "oh-my-claudecode", "launch");
            writeCommand(root, [
                "| `oh-my-claudecode` | vendored at `third-party/oh-my-claudecode/` | `ultragoal`, `launch` |",
            ]);
            const result = checkSuperpowersCompanionTable(root);
            assert.deepEqual(result.missing, []);
            assert.deepEqual(result.refs.map((r) => r.skill).sort(), ["launch", "ultragoal"]);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
describe("check-superpowers-companion-table — invariant", () => {
    it("flags a bundled example that skills/ does not ship", () => {
        const root = setupRepo();
        try {
            writeBundledSkill(root, "gateguard");
            writeCommand(root, [
                "| `continuous-improvement` | bundled — always present | `gateguard`, `safety-guard` |",
            ]);
            const result = checkSuperpowersCompanionTable(root);
            assert.equal(result.missing.length, 1);
            assert.equal(result.missing[0].skill, "safety-guard");
            assert.match(result.missing[0].expectedPath, /skills[\\/]safety-guard\.md$/);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("fails closed when a vendored row names no snapshot skills", () => {
        const root = setupRepo();
        try {
            writeCommand(root, [
                "| `ruflo-swarm` | vendored at `third-party/ruflo-swarm/` | `swarm_*`; `/swarm`, `/watch` |",
            ]);
            const result = checkSuperpowersCompanionTable(root);
            assert.ok(result.missing.length >= 1);
            assert.match(result.missing[0].skill, /no snapshot skills/i);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
describe("check-superpowers-companion-table — CLI", () => {
    it("exits 0 on a table whose named skills all exist", () => {
        const root = setupRepo();
        try {
            writeVendoredSkill(root, "oh-my-claudecode", "ultragoal");
            writeCommand(root, [
                "| `oh-my-claudecode` | vendored at `third-party/oh-my-claudecode/` | `ultragoal` |",
            ]);
            const out = execFileSync("node", [CHECKER, root], { encoding: "utf8" });
            assert.match(out, /OK superpowers-companion-table/);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("exits 1 and names ultrawork when the snapshot dropped it", () => {
        const root = setupRepo();
        try {
            writeVendoredSkill(root, "oh-my-claudecode", "ultragoal");
            writeCommand(root, [
                "| `oh-my-claudecode` | vendored at `third-party/oh-my-claudecode/` | `ultrawork`, `ultraqa`, `deep-dive` |",
            ]);
            let exited = false;
            try {
                execFileSync("node", [CHECKER, root], { encoding: "utf8" });
            }
            catch (err) {
                exited = true;
                const e = err;
                assert.equal(e.status, 1);
                assert.match(e.stderr ?? "", /FAIL superpowers-companion-table/);
                assert.match(e.stderr ?? "", /ultrawork/);
                assert.match(e.stderr ?? "", /ultraqa/);
                assert.match(e.stderr ?? "", /deep-dive/);
            }
            assert.ok(exited, "CLI should have exited non-zero");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
describe("check-superpowers-companion-table — live repo", () => {
    it("every skill named in commands/superpowers.md's companion table exists in its snapshot", () => {
        const result = checkSuperpowersCompanionTable(REPO_ROOT);
        assert.deepEqual(result.missing.map((m) => m.skill), [], `companion table names skills the snapshot does not ship: ${JSON.stringify(result.missing, null, 2)}`);
    });
});
