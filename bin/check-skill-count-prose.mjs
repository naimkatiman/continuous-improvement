#!/usr/bin/env node
/**
 * Skill Count Prose Check
 *
 * Sibling to `verify:skill-count`. That lint gates the literal phrase
 * "N bundled skills" in the 5 generator-owned manifest surfaces. This lint
 * gates the *human-facing* prose — the phrasings the marketing/docs copy
 * actually uses, which no other invariant checks and which therefore rot
 * silently every time a skill is added without a full prose cascade.
 *
 * Origin: PR #255 (`/roast`, the 26th skill) bumped the gated "N bundled
 * skills" manifests but left README.md / docs/skills.md / docs/skill-use-cases.md
 * / CONTRIBUTING.md / docs/using-this-plugin.md at "25 skills / 14 tier-2".
 * verify:all stayed green because nothing checked those surfaces.
 * `reports/daily-improvement.md` logs three prior rounds of the same drift.
 *
 * Single source of truth: the skill set on disk. The total and the
 * core/featured/tier-1/tier-2/companion breakdown are *derived* from
 * `skills/*.md` + the root `SKILL.md` frontmatter via the same primitives the
 * tier lint uses (`discoverSkillSources`, `parseSkillFrontmatter`,
 * `normalizeTier`). Nothing is hardcoded — add or retire a skill and this lint
 * recomputes the expected numbers, then names every doc that disagrees.
 *
 * Checked surfaces (file → which derived claims it must contain):
 *   - README.md                  breakdown, total-skills, next-ordinal
 *   - docs/skills.md             breakdown, total-skills, total-catalog, next-ordinal
 *   - docs/skill-use-cases.md    breakdown, total-skills
 *   - CONTRIBUTING.md            total-skills
 *   - docs/using-this-plugin.md  total-catalog
 *
 * Usage:
 *   node bin/check-skill-count-prose.mjs              # Check the current repo
 *   node bin/check-skill-count-prose.mjs <repo-root>  # Check a specific repo root
 *
 * Exit codes:
 *   0 — every checked surface states the bundle-derived count
 *   1 — at least one surface states a stale count, or a surface file is missing
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";
import { normalizeTier, parseSkillFrontmatter } from "../lib/skill-tiers.mjs";
import { discoverSkillSources } from "./check-skill-tiers.mjs";
/** Derive the total + per-tier breakdown from `skills/` + root SKILL.md frontmatter. */
export function deriveCounts(repoRoot) {
    const sources = discoverSkillSources(repoRoot);
    const tally = { core: 0, featured: 0, tier1: 0, tier2: 0, companion: 0, unknown: 0 };
    for (const src of sources) {
        const front = parseSkillFrontmatter(readFileSync(src.path, "utf8"));
        switch (normalizeTier(front.tier)) {
            case "core":
                tally.core++;
                break;
            case "featured":
                tally.featured++;
                break;
            case "1":
                tally.tier1++;
                break;
            case "2":
                tally.tier2++;
                break;
            case "companion":
                tally.companion++;
                break;
            default:
                tally.unknown++;
                break;
        }
    }
    const total = sources.length;
    return { ...tally, total, next: total + 1 };
}
/** English ordinal: 1→1st, 2→2nd, 3→3rd, 11→11th, 21→21st, 27→27th. */
export function ordinal(n) {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13)
        return `${n}th`;
    switch (n % 10) {
        case 1:
            return `${n}st`;
        case 2:
            return `${n}nd`;
        case 3:
            return `${n}rd`;
        default:
            return `${n}th`;
    }
}
/** The exact substring a surface must contain for the given check kind. */
export function expectedFor(check, c) {
    switch (check) {
        case "breakdown":
            return `${c.core} core + ${c.featured} featured + ${c.tier1} tier-1 + ${c.tier2} tier-2 + ${c.companion} always-bundled`;
        case "total-skills":
            return `${c.total} skills`;
        case "total-catalog":
            return `${c.total}-skill catalog`;
        case "next-ordinal":
            return `${ordinal(c.next)} skill`;
    }
}
export const PROSE_SURFACES = [
    { file: "README.md", checks: ["breakdown", "total-skills", "next-ordinal"] },
    {
        file: "docs/skills.md",
        checks: ["breakdown", "total-skills", "total-catalog", "next-ordinal"],
    },
    { file: "docs/skill-use-cases.md", checks: ["breakdown", "total-skills"] },
    { file: "CONTRIBUTING.md", checks: ["total-skills"] },
    { file: "docs/using-this-plugin.md", checks: ["total-catalog"] },
];
/**
 * Assert every surface contains every derived claim it owns. `counts` defaults
 * to the value derived from `repoRoot`; pass it explicitly to test the
 * surface-matching logic in isolation.
 */
export function checkProseSurfaces(repoRoot, counts, surfaces = PROSE_SURFACES) {
    const c = counts ?? deriveCounts(repoRoot);
    const failures = [];
    for (const surface of surfaces) {
        let content;
        try {
            content = readFileSync(join(repoRoot, surface.file), "utf8");
        }
        catch {
            content = null;
        }
        for (const check of surface.checks) {
            const expected = expectedFor(check, c);
            if (content === null) {
                failures.push({ file: surface.file, check, expected, reason: "target-missing" });
                continue;
            }
            if (!content.includes(expected)) {
                failures.push({ file: surface.file, check, expected, reason: "stale" });
            }
        }
    }
    return failures;
}
function main() {
    const repoRoot = argv[2] ?? cwd();
    const counts = deriveCounts(repoRoot);
    const failures = checkProseSurfaces(repoRoot, counts);
    if (failures.length === 0) {
        console.log(`OK skill-count-prose: all ${PROSE_SURFACES.length} doc surface(s) state the derived count (total=${counts.total}: ${expectedFor("breakdown", counts)}).`);
        exit(0);
    }
    console.error(`FAIL skill-count-prose: ${failures.length} doc prose claim(s) do not match the bundle-derived count of ${counts.total}.`);
    console.error(`Source of truth: skills/ frontmatter → ${expectedFor("breakdown", counts)} = ${counts.total} skills; next skill is the ${ordinal(counts.next)}.`);
    console.error("");
    for (const f of failures) {
        if (f.reason === "target-missing") {
            console.error(`  ${f.file} — file not found (expected to contain "${f.expected}")`);
        }
        else {
            console.error(`  ${f.file} — missing "${f.expected}" [${f.check}]`);
        }
    }
    console.error("");
    console.error("Fix: bump the prose in the named file(s) to the derived count. When a skill is genuinely added or retired, this lint enumerates every human-facing surface that needs the same change.");
    exit(1);
}
const invokedDirectly = argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("check-skill-count-prose.mjs")) {
    main();
}
