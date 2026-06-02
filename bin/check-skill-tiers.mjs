#!/usr/bin/env node
/**
 * Skill Tier Check
 *
 * Verifies that every source skill in skills/<name>.md (and the core
 * SKILL.md at the repo root) declares a recognized `tier:` value in its
 * YAML frontmatter. The generator groups skills into the bundled README
 * by tier; an untagged skill silently slides into the "Other skills"
 * bucket, which is easy to miss in review. This lint surfaces missing or
 * unrecognized tiers as a hard failure.
 *
 * Recognized tier values (see src/lib/skill-tiers.mts):
 *   "core" "featured" "1" "2" "companion"
 *
 * Usage:
 *   node bin/check-skill-tiers.mjs              # Check the current repo
 *   node bin/check-skill-tiers.mjs <repo-root>  # Check a specific repo root
 *
 * Exit codes:
 *   0 — every source skill declares a recognized tier
 *   1 — at least one skill is missing or has an unrecognized tier
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";
import { normalizeTier, parseSkillFrontmatter, } from "../lib/skill-tiers.mjs";
const SKILLS_DIR = "skills";
const CORE_SKILL_FILE = "SKILL.md";
const CORE_SKILL_NAME = "continuous-improvement";
export function discoverSkillSources(repoRoot) {
    const out = [];
    // Core skill (root SKILL.md) is always present and represents the
    // continuous-improvement framework itself; treat it as a checked source.
    const corePath = join(repoRoot, CORE_SKILL_FILE);
    try {
        statSync(corePath);
        out.push({ name: CORE_SKILL_NAME, path: corePath });
    }
    catch {
        // No root SKILL.md — this is a misconfigured repo, but the lint should
        // not error here; the skill-mirror lint covers that case.
    }
    const skillsDir = join(repoRoot, SKILLS_DIR);
    let entries;
    try {
        entries = readdirSync(skillsDir);
    }
    catch {
        return out;
    }
    for (const entry of entries) {
        if (!entry.endsWith(".md"))
            continue;
        if (entry === "README.md")
            continue;
        const fullPath = join(skillsDir, entry);
        try {
            const stat = statSync(fullPath);
            if (!stat.isFile())
                continue;
        }
        catch {
            continue;
        }
        out.push({ name: entry.replace(/\.md$/, ""), path: fullPath });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}
export function checkSkillTiers(repoRoot) {
    const sources = discoverSkillSources(repoRoot);
    const problems = [];
    for (const src of sources) {
        const content = readFileSync(src.path, "utf8");
        const front = parseSkillFrontmatter(content);
        const rawTier = front.tier;
        if (!rawTier || rawTier.trim() === "") {
            problems.push({ name: src.name, path: src.path, reason: "missing" });
            continue;
        }
        const normalized = normalizeTier(rawTier);
        if (normalized === "unknown") {
            problems.push({
                name: src.name,
                path: src.path,
                reason: "unrecognized",
                rawTier,
            });
        }
    }
    return problems;
}
function main() {
    const repoRoot = argv[2] ?? cwd();
    const sources = discoverSkillSources(repoRoot);
    const problems = checkSkillTiers(repoRoot);
    if (problems.length === 0) {
        console.log(`OK skill-tiers: all ${sources.length} skill source(s) declare a recognized tier.`);
        exit(0);
    }
    console.error(`FAIL skill-tiers: ${problems.length} skill(s) with missing or unrecognized tier (out of ${sources.length} source(s)).\n`);
    for (const p of problems) {
        if (p.reason === "missing") {
            console.error(`  - ${p.name}: no \`tier:\` field in frontmatter`);
        }
        else {
            console.error(`  - ${p.name}: \`tier: ${p.rawTier ?? ""}\` is not a recognized value`);
        }
        console.error(`      file: ${p.path}`);
    }
    console.error("\nFix: add a `tier:` field to the source skill's YAML frontmatter. Recognized values: core, featured, \"1\", \"2\", companion. The generator uses this to group skills into the bundled README by tier; an untagged skill slides into the catch-all 'Other skills' bucket and is easy to miss in review.");
    exit(1);
}
const invokedDirectly = argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("check-skill-tiers.mjs")) {
    main();
}
