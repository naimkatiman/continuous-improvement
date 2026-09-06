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
 * And, for the prefixes we vendor (oh-my-claudecode, superpowers, agent-skills,
 * ruflo-swarm), that every declared target actually EXISTS in its snapshot under
 * third-party/<snapshot>/skills/<name>/. Declaring a target only asserted intent;
 * nothing checked the destination. oh-my-claudecode:ultrawork was declared after
 * upstream deleted it, and oh-my-claudecode:retrospective was declared for months
 * having never existed upstream at all — both with this check green.
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
 *   1 — at least one routing target is unaccounted for, or a declared vendored
 *       target has no directory in its snapshot
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";
const ORCHESTRATOR_SKILL_PATH = "skills/proceed-with-the-recommendation.md";
const OPTIONAL_COMPANIONS_PATH = "optional-companions.json";
const PLUGIN_SKILLS_DIR = "plugins/continuous-improvement/skills";
const SECTION_HEADER = "### Routing Table (with Inline Fallbacks)";
/**
 * Routing-target prefix -> vendored snapshot directory under third-party/.
 *
 * Declaring a target in optional-companions.json only asserted that we MEANT to
 * route somewhere; nothing checked the destination existed. So when
 * oh-my-claudecode 5.x deleted `ultrawork`, this check stayed green while the
 * routing table named a skill upstream no longer ships (#308, fixed in #309) —
 * and `oh-my-claudecode:retrospective` had been declared for months without ever
 * existing upstream at all. For prefixes we vendor, the snapshot is ground truth.
 *
 * Prefixes NOT listed here (host built-ins, `frontend-design:`, `commit-commands:`)
 * are deliberately unchecked: we have no local copy to check them against, and
 * guessing would make this fail closed on things it cannot see.
 */
export const VENDORED_PREFIXES = {
    "oh-my-claudecode": "oh-my-claudecode",
    superpowers: "superpowers",
    "agent-skills": "addy-agent-skills",
    "ruflo-swarm": "ruflo-swarm",
};
/** Repo-relative skill path a vendored target must resolve to, or null if unvendored. */
export function resolveVendoredSkillPath(target) {
    const idx = target.indexOf(":");
    if (idx < 0)
        return null;
    const dir = VENDORED_PREFIXES[target.slice(0, idx)];
    if (!dir)
        return null;
    // Everything after the FIRST colon is the skill name, colons included.
    return `third-party/${dir}/skills/${target.slice(idx + 1)}`;
}
/** Vendored targets with no directory in their snapshot. */
export function findMissingVendoredTargets(repoRoot, targets) {
    const missing = [];
    for (const target of targets) {
        const rel = resolveVendoredSkillPath(target);
        if (rel === null)
            continue;
        const abs = join(repoRoot, rel);
        if (!existsSync(abs))
            missing.push({ target, expectedPath: abs });
    }
    return missing;
}
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
    // Declared is not the same as existing: for prefixes we vendor, the snapshot
    // is ground truth. Checks the declared companion set, so a target that is
    // declared but never referenced is still caught.
    const missingVendored = findMissingVendoredTargets(repoRoot, optional);
    return {
        targets,
        drifts,
        bundledCount: bundled.size,
        optionalCount: optional.size,
        missingVendored,
    };
}
function main() {
    const repoRoot = argv[2] ?? cwd();
    const { targets, drifts, bundledCount, optionalCount, missingVendored } = checkRoutingTargets(repoRoot);
    if (missingVendored.length > 0) {
        console.error(`FAIL routing-targets: ${missingVendored.length} declared target(s) do not exist in the vendored snapshot.\n`);
        for (const m of missingVendored) {
            console.error(`  - "${m.target}"`);
            console.error(`      Declared in ${OPTIONAL_COMPANIONS_PATH}, but no directory at:`);
            console.error(`      ${m.expectedPath}`);
        }
        console.error(`\nEither upstream removed or renamed the skill (retarget the routing rows and this ` +
            `declaration), or the snapshot is stale (refresh it with ` +
            `'node bin/refresh-third-party.mjs <name>'). Declaring a target does not make it exist.`);
        exit(1);
    }
    if (drifts.length === 0) {
        console.log(`OK routing-targets: all ${targets.length} routing target(s) accounted for ` +
            `(${bundledCount} bundled skill(s), ${optionalCount} optional companion(s) declared, ` +
            `every vendored target present in its snapshot).`);
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
