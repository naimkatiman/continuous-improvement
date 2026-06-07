#!/usr/bin/env node
/**
 * Tool Count Check
 *
 * Docs and source comments claim the size of the MCP tool surface
 * ("N tools"). Those numbers drift every time a tool is added without the
 * claim being bumped — exactly what the 2026-06-07 post-merge audit (PR #203)
 * found: docs/skills.md said "12 tools" and src/bin/mcp-server.mts said
 * "beginner (3 tools)" while the catalog had grown to 18 expert / 4 beginner,
 * and `verify:all` stayed green because no invariant covered those strings.
 *
 * Source of truth: the GENERATED, committed manifests
 *   - plugins/expert.json   tools[].length  (expert mode = all tools)
 *   - plugins/beginner.json tools[].length  (beginner mode)
 * Both are generated from src/lib/plugin-metadata.mts by `npm run build` and
 * pinned against drift by `verify:generated`, so they are the honest count.
 *
 * Each ASSERTION names a file, a capture regex around its tool-count claim, and
 * which mode's count the captured integer must equal. Precise per-claim regexes
 * avoid false positives on historical CHANGELOG or vendored "N tools" strings.
 * The installer banner is intentionally NOT listed: PR #203 made it derive the
 * count from getToolNames("expert") at runtime, so it can never drift.
 *
 * Usage:
 *   node bin/check-tool-count.mjs              # Check the current repo
 *   node bin/check-tool-count.mjs <repo-root>  # Check a specific repo root
 *
 * Exit codes:
 *   0 — every claim matches the manifest count
 *   1 — at least one claim is stale or missing
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";
const MANIFEST = {
    expert: "plugins/expert.json",
    beginner: "plugins/beginner.json",
};
const ASSERTIONS = [
    {
        file: "docs/skills.md",
        pattern: /MCP server \((\d+) tools\)/,
        mode: "expert",
        label: "expert MCP tool count",
    },
    {
        file: "src/bin/mcp-server.mts",
        pattern: /beginner \((\d+) tools\)/,
        mode: "beginner",
        label: "beginner mode tool count",
    },
];
export function countTools(repoRoot, mode) {
    const raw = readFileSync(join(repoRoot, MANIFEST[mode]), "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.tools)) {
        throw new Error(`${MANIFEST[mode]} has no "tools" array`);
    }
    return parsed.tools.length;
}
function checkAssertion(repoRoot, a, expected) {
    let content;
    try {
        content = readFileSync(join(repoRoot, a.file), "utf8");
    }
    catch {
        return { file: a.file, label: a.label, reason: "missing", expected };
    }
    const m = content.match(a.pattern);
    if (!m)
        return { file: a.file, label: a.label, reason: "missing", expected };
    if (Number(m[1]) === expected)
        return null;
    return { file: a.file, label: a.label, reason: "stale", found: m[0], expected };
}
export function checkToolCount(repoRoot) {
    const counts = {
        expert: countTools(repoRoot, "expert"),
        beginner: countTools(repoRoot, "beginner"),
    };
    const violations = [];
    for (const a of ASSERTIONS) {
        const v = checkAssertion(repoRoot, a, counts[a.mode]);
        if (v)
            violations.push(v);
    }
    return { violations, counts };
}
function main() {
    const repoRoot = argv[2] ?? cwd();
    const { violations, counts } = checkToolCount(repoRoot);
    if (violations.length === 0) {
        console.log(`OK tool-count: all ${ASSERTIONS.length} claim(s) match the generated manifests ` +
            `(expert=${counts.expert}, beginner=${counts.beginner}).`);
        exit(0);
    }
    console.error(`FAIL tool-count: ${violations.length} claim(s) do not match the generated tool manifests ` +
        `(expert=${counts.expert}, beginner=${counts.beginner}).`);
    console.error("");
    for (const v of violations) {
        if (v.reason === "stale") {
            console.error(`  ${v.file} — ${v.label}: states "${v.found}", expected ${v.expected}`);
        }
        else {
            console.error(`  ${v.file} — ${v.label}: no matching tool-count claim found (expected ${v.expected})`);
        }
    }
    console.error("");
    console.error("Fix: bump the claim to match plugins/{expert,beginner}.json tools[].length, or add the");
    console.error("tool to BEGINNER_TOOL_ENTRIES/EXPERT_TOOL_ENTRIES in src/lib/plugin-metadata.mts and");
    console.error("re-run `npm run build` to regenerate the manifests.");
    exit(1);
}
const invokedDirectly = argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("check-tool-count.mjs")) {
    main();
}
