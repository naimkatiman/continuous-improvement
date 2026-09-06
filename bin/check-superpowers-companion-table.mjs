#!/usr/bin/env node
/**
 * Superpowers Companion-Table Check
 *
 * `commands/superpowers.md` § "Routing surface (four sources)" is the dispatcher
 * cheat-sheet: which companion snapshot we route into, and example skill names.
 * `verify:routing-targets` only sees `optional-companions.json` and the
 * orchestrator routing table. This command file named `ultrawork`, `ultraqa`
 * and `deep-dive` for months after oh-my-claudecode 5.x deleted them, and
 * every other gate stayed green.
 *
 * Source of truth for a vendored example is the snapshot directory
 * `third-party/<name>/skills/<skill>/`. Source of truth for a bundled example
 * is `skills/<skill>.md`. Slash commands and MCP wildcards (`/swarm`, `swarm_*`)
 * are not skills and are ignored.
 *
 * Usage:
 *   node bin/check-superpowers-companion-table.mjs              # current repo
 *   node bin/check-superpowers-companion-table.mjs <repo-root>  # specific root
 *
 * Exit codes:
 *   0 — every named companion-table skill exists in its snapshot
 *   1 — at least one named skill is missing, or the table heading is gone
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";
export const COMMAND_PATH = "commands/superpowers.md";
export const SECTION_HEADER = "## Routing surface (four sources)";
const SNAPSHOT_RE = /third-party\/([a-z0-9-]+)\//;
const SKIP_WILDCARD = /\*/;
const SKIP_SLASH = /^\//;
const SKIP_MCP_PREFIX = /^[a-z][a-z0-9]*_$/i;
/** Backtick tokens in the examples cell, minus commands and MCP wildcards. */
export function extractSkillRefs(examplesCell) {
    const tokens = [...examplesCell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    const names = [];
    for (const token of tokens) {
        if (SKIP_SLASH.test(token) || SKIP_WILDCARD.test(token) || SKIP_MCP_PREFIX.test(token)) {
            continue;
        }
        if (token.startsWith(":")) {
            names.push(token.slice(1));
            continue;
        }
        const colon = token.indexOf(":");
        names.push(colon >= 0 ? token.slice(colon + 1) : token);
    }
    return names;
}
function classifyRow(lives) {
    const snap = SNAPSHOT_RE.exec(lives);
    if (snap)
        return { snapshotDir: snap[1], kind: "vendored" };
    if (/\bbundled\b/i.test(lives))
        return { snapshotDir: null, kind: "bundled" };
    return { snapshotDir: null, kind: "other" };
}
export function extractCompanionTableRows(markdown) {
    const lines = markdown.split(/\r?\n/);
    const headerIdx = lines.findIndex((line) => line.trim() === SECTION_HEADER);
    if (headerIdx === -1) {
        throw new Error(`companion-table section header not found: "${SECTION_HEADER}"`);
    }
    const rows = [];
    let sawHeaderRow = false;
    let sawDividerRow = false;
    let inTable = false;
    for (let i = headerIdx + 1; i < lines.length; i += 1) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith("## "))
            break;
        if (!trimmed.startsWith("|")) {
            if (inTable)
                break;
            continue;
        }
        if (!sawHeaderRow) {
            sawHeaderRow = true;
            inTable = true;
            continue;
        }
        if (!sawDividerRow) {
            sawDividerRow = true;
            continue;
        }
        const cells = trimmed.split("|").map((c) => c.trim());
        const source = cells[1] ?? "";
        const lives = cells[2] ?? "";
        const examples = cells[3] ?? "";
        const { snapshotDir, kind } = classifyRow(lives);
        rows.push({
            source,
            lives,
            snapshotDir,
            kind,
            skills: extractSkillRefs(examples),
        });
    }
    return rows;
}
function expectedPath(row, skill) {
    if (row.kind === "bundled")
        return join("skills", `${skill}.md`);
    return join("third-party", row.snapshotDir ?? "unknown", "skills", skill);
}
export function checkSuperpowersCompanionTable(repoRoot) {
    const markdown = readFileSync(join(repoRoot, COMMAND_PATH), "utf8");
    const rows = extractCompanionTableRows(markdown);
    const refs = [];
    const missing = [];
    for (const row of rows) {
        if (row.kind === "other")
            continue;
        if (row.kind === "vendored" && row.skills.length === 0) {
            missing.push({
                skill: "no snapshot skills named",
                source: row.source,
                expectedPath: join("third-party", row.snapshotDir ?? "unknown", "skills"),
            });
            continue;
        }
        for (const skill of row.skills) {
            const rel = expectedPath(row, skill);
            const ref = {
                skill,
                source: row.source,
                kind: row.kind,
                expectedPath: rel,
            };
            refs.push(ref);
            const abs = join(repoRoot, rel);
            if (!existsSync(abs)) {
                missing.push({ skill, source: row.source, expectedPath: abs });
            }
        }
    }
    return { rows, refs, missing };
}
function main() {
    const repoRoot = argv[2] ?? cwd();
    let result;
    try {
        result = checkSuperpowersCompanionTable(repoRoot);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`FAIL superpowers-companion-table: ${message}`);
        exit(1);
    }
    if (result.missing.length === 0) {
        console.log(`OK superpowers-companion-table: all ${result.refs.length} companion-table skill(s) exist in their snapshots.`);
        exit(0);
    }
    console.error(`FAIL superpowers-companion-table: ${result.missing.length} named skill(s) in ${COMMAND_PATH} do not exist in the vendored snapshot.\n`);
    for (const m of result.missing) {
        console.error(`  - "${m.skill}"  (row ${m.source})`);
        console.error(`      expected: ${m.expectedPath}`);
    }
    console.error(`\nThe companion table is a cheat-sheet, not a wish list. Retarget the examples ` +
        `cell to a skill the snapshot still ships, or refresh the snapshot. This is the ` +
        `gate that would have caught ultrawork / ultraqa / deep-dive the day they were deleted.`);
    exit(1);
}
const invokedDirectly = argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("check-superpowers-companion-table.mjs")) {
    main();
}
