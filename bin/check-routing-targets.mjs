#!/usr/bin/env node
/**
 * Routing-Target Invariant Check
 *
 * Verifies that every routing target named in the orchestrator skill at
 * skills/proceed-with-the-recommendation.md § "Routing Table (with Inline
 * Fallbacks)" either:
 *   (a) ships bundled at plugins/continuous-improvement/skills/<name>/SKILL.md, or
 *   (b) is declared in the root-level optional-companions.json file.
 *
 * Catches: a routing-table row that names a skill the bundle does not ship and
 * the maintainer has not declared as an optional companion. Without this gate,
 * such drift only surfaces at runtime when the orchestrator routes to a target
 * that resolves to neither a bundled skill nor an inline fallback the
 * maintainer was tracking.
 *
 * Usage:
 *   node bin/check-routing-targets.mjs              # Check the current repo
 *   node bin/check-routing-targets.mjs <repo-root>  # Check a specific repo root
 *
 * Exit codes:
 *   0 — every routing target is accounted for (bundled or optional-declared)
 *   1 — at least one routing target is unaccounted for
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";
const ORCHESTRATOR_SKILL_PATH = "skills/proceed-with-the-recommendation.md";
const OPTIONAL_COMPANIONS_PATH = "optional-companions.json";
const PLUGIN_SKILLS_DIR = "plugins/continuous-improvement/skills";
const SECTION_HEADER = "### Routing Table (with Inline Fallbacks)";
export function discoverBundledSkills(repoRoot) {
    const dir = join(repoRoot, PLUGIN_SKILLS_DIR);
    let entries;
    try {
        entries = readdirSync(dir);
    }
    catch {
        return new Set();
    }
    const names = new Set();
    for (const name of entries) {
        const skillFile = join(dir, name, "SKILL.md");
        try {
            const stat = statSync(skillFile);
            if (stat.isFile())
                names.add(name);
        }
        catch {
            /* not a skill dir */
        }
    }
    return names;
}
export function loadOptionalCompanions(repoRoot) {
    const path = join(repoRoot, OPTIONAL_COMPANIONS_PATH);
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data.optional_companions)) {
        throw new Error(`${OPTIONAL_COMPANIONS_PATH}: missing or non-array "optional_companions" field`);
    }
    return new Set(data.optional_companions);
}
export function extractRoutingTargets(orchestratorMarkdown) {
    const lines = orchestratorMarkdown.split(/\r?\n/);
    const headerIdx = lines.findIndex((line) => line.trim() === SECTION_HEADER);
    if (headerIdx === -1) {
        throw new Error(`Routing-table section header not found: "${SECTION_HEADER}"`);
    }
    const targets = [];
    let inTable = false;
    let sawHeaderRow = false;
    let sawDividerRow = false;
    for (let i = headerIdx + 1; i < lines.length; i += 1) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith("## ") || trimmed.startsWith("### "))
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
        // cells[0] and cells[last] are empty strings from leading/trailing pipes.
        // cells[1] = "Recommendation type", cells[2] = "Preferred skill", cells[3] = "Inline fallback".
        const preferredCell = cells[2] ?? "";
        const tokens = [...preferredCell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
        for (const token of tokens) {
            targets.push({
                rowIndex: targets.length,
                recommendationType: cells[1] ?? "",
                target: token,
            });
        }
    }
    return targets;
}
export function checkRoutingTargets(repoRoot) {
    const orchestratorPath = join(repoRoot, ORCHESTRATOR_SKILL_PATH);
    const orchestratorContent = readFileSync(orchestratorPath, "utf8");
    const targets = extractRoutingTargets(orchestratorContent);
    const bundled = discoverBundledSkills(repoRoot);
    const optional = loadOptionalCompanions(repoRoot);
    const drifts = [];
    for (const t of targets) {
        if (bundled.has(t.target))
            continue;
        if (optional.has(t.target))
            continue;
        drifts.push(t);
    }
    return {
        targets,
        drifts,
        bundledCount: bundled.size,
        optionalCount: optional.size,
    };
}
function main() {
    const repoRoot = argv[2] ?? cwd();
    const { targets, drifts, bundledCount, optionalCount } = checkRoutingTargets(repoRoot);
    if (drifts.length === 0) {
        console.log(`OK routing-targets: all ${targets.length} routing target(s) accounted for ` +
            `(${bundledCount} bundled skill(s), ${optionalCount} optional companion(s) declared).`);
        exit(0);
    }
    console.error(`FAIL routing-targets: ${drifts.length} unaccounted target(s) in ${ORCHESTRATOR_SKILL_PATH}.\n`);
    for (const d of drifts) {
        console.error(`  - "${d.target}" — referenced by row "${d.recommendationType}"`);
        console.error(`      Not bundled at ${PLUGIN_SKILLS_DIR}/${d.target}/SKILL.md`);
        console.error(`      Not declared in ${OPTIONAL_COMPANIONS_PATH}`);
    }
    console.error(`\nFix: either bundle the skill (add plugins/continuous-improvement/skills/<name>/SKILL.md ` +
        `via the source skill + 'npm run build'), OR declare it in ${OPTIONAL_COMPANIONS_PATH} ` +
        `with a pointer note in docs/audits/.`);
    exit(1);
}
const invokedDirectly = argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("check-routing-targets.mjs")) {
    main();
}
