import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = existsSync(join(__dirname, "..", "package.json"))
    ? join(__dirname, "..")
    : join(__dirname, "..", "..");
assert.ok(existsSync(join(REPO_ROOT, "package.json")), `REPO_ROOT sanity check failed — ${REPO_ROOT}/package.json not found`);
const CHECKER = join(REPO_ROOT, "bin", "check-scripts-citation-drift.mjs");
function setupRepo(files) {
    const root = mkdtempSync(join(tmpdir(), "scripts-citation-drift-"));
    for (const file of files) {
        const full = join(root, file.relPath);
        mkdirSync(join(full, ".."), { recursive: true });
        writeFileSync(full, file.contents);
    }
    return root;
}
function runChecker(altRoot) {
    try {
        const out = execFileSync("node", [CHECKER, altRoot], { encoding: "utf8" });
        return { exit: 0, stdout: out, stderr: "" };
    }
    catch (err) {
        const e = err;
        return { exit: e.status ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
    }
}
const INVENTORY_HEADER = `# scripts/\n\n## Inventory\n\n| Script | Purpose | Cited by |\n|---|---|---|\n`;
describe("check-scripts-citation-drift — integration", () => {
    it("CLI exits 0 when every script is inventoried and every citation reconciles both ways", () => {
        const root = setupRepo([
            { relPath: "scripts/alpha.sh", contents: "#!/usr/bin/env bash\n" },
            { relPath: "scripts/beta.mjs", contents: "// beta\n" },
            {
                relPath: "scripts/README.md",
                contents: INVENTORY_HEADER +
                    "| `alpha.sh` | Alpha primitive | `skills/uno.md` (Section A) |\n" +
                    "| `beta.mjs` | Beta primitive | `skills/dos.md` (Section B), `skills/uno.md` (Section A) |\n",
            },
            { relPath: "skills/uno.md", contents: "# uno\n\nUses `scripts/alpha.sh` and also `scripts/beta.mjs` in Section A.\n" },
            { relPath: "skills/dos.md", contents: "# dos\n\nUses `scripts/beta.mjs` in Section B.\n" },
        ]);
        try {
            const { exit, stdout } = runChecker(root);
            assert.equal(exit, 0, `expected exit 0, got ${exit}`);
            assert.match(stdout, /OK scripts-citation-drift:/);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("Side A — CLI exits 1 when a script file is missing from the inventory table", () => {
        const root = setupRepo([
            { relPath: "scripts/alpha.sh", contents: "#!/usr/bin/env bash\n" },
            { relPath: "scripts/orphan.mjs", contents: "// orphan, not in inventory\n" },
            {
                relPath: "scripts/README.md",
                contents: INVENTORY_HEADER +
                    "| `alpha.sh` | Alpha primitive | `skills/uno.md` (Section A) |\n",
            },
            { relPath: "skills/uno.md", contents: "# uno\n\nUses `scripts/alpha.sh`.\n" },
        ]);
        try {
            const { exit, stderr } = runChecker(root);
            assert.equal(exit, 1, `expected exit 1, got ${exit}`);
            assert.match(stderr, /Side A/);
            assert.match(stderr, /orphan\.mjs/);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("Side B — CLI exits 1 when the README claims a skill cites a script but the skill body does not", () => {
        const root = setupRepo([
            { relPath: "scripts/alpha.sh", contents: "#!/usr/bin/env bash\n" },
            {
                relPath: "scripts/README.md",
                contents: INVENTORY_HEADER +
                    "| `alpha.sh` | Alpha primitive | `skills/liar.md` (Section A) |\n",
            },
            { relPath: "skills/liar.md", contents: "# liar\n\nDoes not actually mention any script path.\n" },
        ]);
        try {
            const { exit, stderr } = runChecker(root);
            assert.equal(exit, 1, `expected exit 1, got ${exit}`);
            assert.match(stderr, /Side B/);
            assert.match(stderr, /liar\.md.*does not contain "scripts\/alpha\.sh"/);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("Side C — CLI exits 1 when a skill cites a real script that the inventory row does not list it under", () => {
        const root = setupRepo([
            { relPath: "scripts/alpha.sh", contents: "#!/usr/bin/env bash\n" },
            {
                relPath: "scripts/README.md",
                contents: INVENTORY_HEADER +
                    "| `alpha.sh` | Alpha primitive | `skills/uno.md` (Section A) |\n",
            },
            { relPath: "skills/uno.md", contents: "# uno\n\nUses `scripts/alpha.sh`.\n" },
            { relPath: "skills/ghost.md", contents: "# ghost\n\nAlso uses `scripts/alpha.sh`, but README has not been updated.\n" },
        ]);
        try {
            const { exit, stderr } = runChecker(root);
            assert.equal(exit, 1, `expected exit 1, got ${exit}`);
            assert.match(stderr, /Side C/);
            assert.match(stderr, /ghost\.md.*cites "scripts\/alpha\.sh".*not listed/);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("excludes scripts/README.md from the Side A inventory requirement", () => {
        const root = setupRepo([
            { relPath: "scripts/alpha.sh", contents: "#!/usr/bin/env bash\n" },
            {
                relPath: "scripts/README.md",
                contents: INVENTORY_HEADER +
                    "| `alpha.sh` | Alpha primitive | `skills/uno.md` (Section A) |\n",
            },
            { relPath: "skills/uno.md", contents: "# uno\n\nUses `scripts/alpha.sh`.\n" },
        ]);
        try {
            const { exit } = runChecker(root);
            assert.equal(exit, 0, `expected exit 0, got ${exit}`);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("supports multi-file inventory rows (e.g. `route-recommendation.mjs` + `route-recommendation.routes.json`)", () => {
        const root = setupRepo([
            { relPath: "scripts/foo.mjs", contents: "// foo\n" },
            { relPath: "scripts/foo.data.json", contents: "{}\n" },
            {
                relPath: "scripts/README.md",
                contents: INVENTORY_HEADER +
                    "| `foo.mjs` + `foo.data.json` | Foo primitive | `skills/uno.md` (Section A) |\n",
            },
            { relPath: "skills/uno.md", contents: "# uno\n\nUses `scripts/foo.mjs` which reads `scripts/foo.data.json`.\n" },
        ]);
        try {
            const { exit } = runChecker(root);
            assert.equal(exit, 0, `expected exit 0, got ${exit}`);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("fails closed when an inventoried helper file is missing", () => {
        const root = setupRepo([
            {
                relPath: "scripts/README.md",
                contents: INVENTORY_HEADER +
                    "| `alpha.sh` | Alpha primitive | `skills/uno.md` (Section A) |\n",
            },
            { relPath: "skills/uno.md", contents: "# uno\n\nUses `scripts/alpha.sh`.\n" },
        ]);
        try {
            const { exit, stderr } = runChecker(root);
            assert.equal(exit, 1, `expected exit 1, got ${exit}`);
            assert.match(stderr, /alpha\.sh/);
            assert.match(stderr, /missing/i);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("fails closed when the scripts directory is absent", () => {
        const root = setupRepo([]);
        try {
            const { exit, stderr } = runChecker(root);
            assert.equal(exit, 1, `expected exit 1, got ${exit}`);
            assert.match(stderr, /scripts/i);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("fails closed when scripts/ exists without its inventory README", () => {
        const root = setupRepo([]);
        mkdirSync(join(root, "scripts"), { recursive: true });
        try {
            const { exit, stderr } = runChecker(root);
            assert.equal(exit, 1, `expected exit 1, got ${exit}`);
            assert.match(stderr, /README|inventory/i);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("fails closed when the scripts inventory has no rows", () => {
        const root = setupRepo([
            {
                relPath: "scripts/README.md",
                contents: INVENTORY_HEADER,
            },
        ]);
        try {
            const { exit, stderr } = runChecker(root);
            assert.equal(exit, 1, `expected exit 1, got ${exit}`);
            assert.match(stderr, /inventory/i);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("the live repo passes the lint (baseline holds — all 3 sides reconciled)", () => {
        const out = execFileSync("node", [CHECKER, REPO_ROOT], { encoding: "utf8" });
        assert.match(out, /OK scripts-citation-drift:/);
    });
});
