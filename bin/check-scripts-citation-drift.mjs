#!/usr/bin/env node
/**
 * Scripts-Citation-Drift Invariant Check
 *
 * Locks the inventory-citation contract stated in scripts/README.md:
 *
 *   "When a new script lands here, add a row to this table in the same PR
 *    and cite the script from at least one skill — otherwise the script is
 *    dead code on arrival."
 *
 * Three sides of the contract are enforced as one invariant:
 *
 *   Side A — every file in scripts/ (excluding README.md) must appear in the
 *            Inventory table's Script column.
 *   Side B — for every Inventory row, every `skills/<name>.md` token in the
 *            Cited by cell must reference a file whose body contains the
 *            literal substring `scripts/<script-filename>` for at least one
 *            of the row's scripts.
 *   Side C — every skills/*.md that mentions `scripts/<filename>` for an
 *            inventoried script must appear in that script's row's Cited by
 *            cell.
 *
 * Origin: ongoing composability refactor (PRs #144–#148, #149) extracts
 * shared primitives into scripts/. Without enforcement, the inventory and
 * citations drift the first time a script lands without README + skill
 * plumbing. The lint locks the contract in CI on every PR.
 *
 * Usage:
 *   node bin/check-scripts-citation-drift.mjs              # Check the current repo
 *   node bin/check-scripts-citation-drift.mjs <repo-root>  # Check a specific repo root
 *
 * Exit codes:
 *   0 — all three sides reconciled
 *   1 — at least one drift on at least one side
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix, sep } from "node:path";
import { argv, cwd, exit } from "node:process";
const SCRIPTS_DIR = "scripts";
const SCRIPTS_README = "scripts/README.md";
const SKILLS_DIR = "skills";
const TABLE_HEADER_LINE = "| Script | Purpose | Cited by |";
export function parseInventoryTable(readmeContent) {
    const lines = readmeContent.split(/\r?\n/);
    const headerIdx = lines.findIndex((l) => l.trim() === TABLE_HEADER_LINE);
    if (headerIdx === -1)
        return [];
    const rows = [];
    for (let i = headerIdx + 2; i < lines.length; i++) {
        const line = lines[i] ?? "";
        const trimmed = line.trim();
        if (!trimmed.startsWith("|"))
            break;
        if (trimmed === "")
            break;
        const cells = trimmed.split("|").slice(1, -1).map((c) => c.trim());
        if (cells.length < 3)
            continue;
        const scriptCell = cells[0] ?? "";
        const citedByCell = cells[2] ?? "";
        const scripts = [...scriptCell.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? "");
        const skills = [...citedByCell.matchAll(/`(skills\/[^`]+)`/g)].map((m) => m[1] ?? "");
        rows.push({ scripts, skills, raw: trimmed });
    }
    return rows;
}
function listScriptFiles(repoRoot) {
    const dir = join(repoRoot, SCRIPTS_DIR);
    if (!existsSync(dir) || !statSync(dir).isDirectory())
        return [];
    return readdirSync(dir)
        .filter((entry) => {
        if (entry === "README.md")
            return false;
        try {
            return statSync(join(dir, entry)).isFile();
        }
        catch {
            return false;
        }
    })
        .sort();
}
function listSkillFiles(repoRoot) {
    const dir = join(repoRoot, SKILLS_DIR);
    if (!existsSync(dir) || !statSync(dir).isDirectory())
        return [];
    const skills = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
            skills.push(`${SKILLS_DIR}/${entry.name}`);
            continue;
        }
        if (entry.isDirectory() &&
            existsSync(join(dir, entry.name, "SKILL.md"))) {
            skills.push(`${SKILLS_DIR}/${entry.name}.md`);
        }
    }
    return skills.sort();
}
function resolveSkillFile(repoRoot, skillPath) {
    const flatPath = join(repoRoot, skillPath);
    if (existsSync(flatPath))
        return flatPath;
    const bundledSkill = /^skills\/([^/]+)\.md$/.exec(skillPath);
    if (bundledSkill?.[1]) {
        return join(repoRoot, SKILLS_DIR, bundledSkill[1], "SKILL.md");
    }
    return flatPath;
}
function toPosix(relPath) {
    return relPath.split(sep).join(posix.sep);
}
export function checkRepo(repoRoot) {
    const structure = [];
    const sideA = [];
    const sideB = [];
    const sideC = [];
    const scriptsPath = join(repoRoot, SCRIPTS_DIR);
    const readmePath = join(repoRoot, SCRIPTS_README);
    const scriptsDirectoryExists = existsSync(scriptsPath) && statSync(scriptsPath).isDirectory();
    const readmeExists = scriptsDirectoryExists && existsSync(readmePath);
    const readmeContent = readmeExists ? readFileSync(readmePath, "utf8") : "";
    const rows = parseInventoryTable(readmeContent);
    if (!scriptsDirectoryExists) {
        structure.push("scripts/ directory is missing");
    }
    else if (!readmeExists) {
        structure.push("scripts/README.md inventory is missing");
    }
    else if (rows.length === 0) {
        structure.push("scripts/README.md inventory has no rows");
    }
    const scriptFiles = listScriptFiles(repoRoot);
    const inventoryScripts = new Set();
    for (const row of rows) {
        for (const s of row.scripts)
            inventoryScripts.add(s);
    }
    for (const file of scriptFiles) {
        if (!inventoryScripts.has(file)) {
            sideA.push(file);
        }
    }
    let citationCount = 0;
    const rowsByScript = new Map();
    for (const row of rows) {
        for (const s of row.scripts) {
            if (!rowsByScript.has(s))
                rowsByScript.set(s, row);
        }
    }
    for (const row of rows) {
        for (const skillPath of row.skills) {
            citationCount += 1;
            const fullSkill = resolveSkillFile(repoRoot, skillPath);
            let skillBody = "";
            try {
                skillBody = readFileSync(fullSkill, "utf8");
            }
            catch {
                sideB.push(`${skillPath} — file does not exist (referenced by row "${row.scripts.join(", ")}")`);
                continue;
            }
            const anyCited = row.scripts.some((script) => skillBody.includes(`scripts/${script}`));
            if (!anyCited) {
                const claimedScripts = row.scripts.map((s) => `scripts/${s}`).join(" or ");
                sideB.push(`${skillPath} does not contain "${claimedScripts}" (claimed by row "${row.scripts.join(" + ")}")`);
            }
        }
    }
    const skillFiles = listSkillFiles(repoRoot);
    for (const skillPath of skillFiles) {
        let body = "";
        try {
            body = readFileSync(resolveSkillFile(repoRoot, skillPath), "utf8");
        }
        catch {
            continue;
        }
        for (const inventoryScript of inventoryScripts) {
            const needle = `scripts/${inventoryScript}`;
            if (!body.includes(needle))
                continue;
            const row = rowsByScript.get(inventoryScript);
            if (!row)
                continue;
            if (!row.skills.includes(skillPath)) {
                sideC.push(`${skillPath} cites "${needle}" but is not listed in that script's Cited by cell`);
            }
        }
    }
    return {
        structure,
        sideA,
        sideB,
        sideC,
        scriptCount: scriptFiles.length,
        citationCount,
    };
}
function main() {
    const repoRoot = argv[2] ?? cwd();
    const result = checkRepo(repoRoot);
    const totalViolations = result.structure.length +
        result.sideA.length +
        result.sideB.length +
        result.sideC.length;
    if (totalViolations === 0) {
        console.log(`OK scripts-citation-drift: ${result.scriptCount} script(s), ${result.citationCount} skill citation(s), all three sides reconciled.`);
        exit(0);
    }
    console.error(`FAIL scripts-citation-drift: ${totalViolations} drift(s) across the inventory-citation contract.`);
    if (result.structure.length > 0) {
        console.error("");
        console.error("Contract structure:");
        for (const v of result.structure) {
            console.error(`  ${toPosix(v)}`);
        }
    }
    if (result.sideA.length > 0) {
        console.error("");
        console.error("Side A — script files missing from scripts/README.md inventory table:");
        for (const v of result.sideA) {
            console.error(`  ${toPosix(v)}`);
        }
    }
    if (result.sideB.length > 0) {
        console.error("");
        console.error("Side B — inventory rows claim a citation the skill body does not contain:");
        for (const v of result.sideB) {
            console.error(`  ${toPosix(v)}`);
        }
    }
    if (result.sideC.length > 0) {
        console.error("");
        console.error("Side C — skill cites a real inventoried script but is not listed in that script's Cited by cell:");
        for (const v of result.sideC) {
            console.error(`  ${toPosix(v)}`);
        }
    }
    console.error("");
    console.error("Fix: restore scripts/ and its inventory, update Side A/C, or correct the Side B skill citation.");
    exit(1);
}
const scriptPathFromArgv = argv[1];
const isMainModule = scriptPathFromArgv !== undefined &&
    (import.meta.url.endsWith(scriptPathFromArgv.replace(/\\/g, "/")) ||
        scriptPathFromArgv.endsWith("check-scripts-citation-drift.mjs"));
if (isMainModule) {
    main();
}
