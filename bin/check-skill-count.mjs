#!/usr/bin/env node
/**
 * Skill Count Check
 *
 * The plugin's user-facing description strings claim a bundled-skill count
 * ("N bundled skills"). That number is hand-maintained inside
 * src/lib/plugin-metadata.mts (SHARED_PLUGIN_DESCRIPTION) and package.json,
 * and it drifts every time a skill is added without the count being bumped.
 *
 * Origin: the plugin-flow stress-test (2026-05-14) found marketplace.json and
 * plugin.json both claiming "13 enforcement skills" while the bundle shipped
 * 20. This lint locks the claim to the actual source-of-truth count so the
 * marketplace card can never undersell (or oversell) the bundle again.
 *
 * Source of truth: skill directories under `plugins/continuous-improvement/skills/`
 * (one `<name>/SKILL.md` per skill). This is the literal bundled-skill set —
 * `npm run build` mirrors each `skills/<name>.md` standalone source (plus the
 * core skill, whose standalone source is the repo-root `SKILL.md`) into it, and
 * `verify:skill-mirror` already guarantees parity. Counting the bundle is the
 * honest reading of the phrase "N bundled skills".
 *
 * Checked files (each must contain the literal `<count> bundled skills`):
 *   - .claude-plugin/marketplace.json
 *   - plugins/continuous-improvement/.claude-plugin/plugin.json
 *   - package.json
 *
 * Usage:
 *   node bin/check-skill-count.mjs              # Check the current repo
 *   node bin/check-skill-count.mjs <repo-root>  # Check a specific repo root
 *
 * Exit codes:
 *   0 — every checked file states the correct bundled-skill count
 *   1 — at least one file states a stale or missing count
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";
const BUNDLE_SKILLS_DIR = "plugins/continuous-improvement/skills";
const CHECKED_FILES = [
    ".claude-plugin/marketplace.json",
    "plugins/continuous-improvement/.claude-plugin/plugin.json",
    "package.json",
];
export function countSkills(repoRoot) {
    const skillsDir = join(repoRoot, BUNDLE_SKILLS_DIR);
    const entries = readdirSync(skillsDir);
    return entries.filter((entry) => {
        try {
            return statSync(join(skillsDir, entry)).isDirectory();
        }
        catch {
            return false;
        }
    }).length;
}
function checkFile(repoRoot, relPath, expected) {
    let content;
    try {
        content = readFileSync(join(repoRoot, relPath), "utf8");
    }
    catch {
        return { file: relPath, reason: "missing" };
    }
    // Non-digit boundary before the count so "3 bundled skills" does not match
    // inside "13 bundled skills".
    const expectedPattern = new RegExp(`(?<!\\d)${expected} bundled skills`);
    if (expectedPattern.test(content))
        return null;
    const staleMatch = content.match(/(\d+) bundled skills/);
    return {
        file: relPath,
        reason: staleMatch ? "stale" : "missing",
        found: staleMatch ? staleMatch[0] : undefined,
    };
}
function main() {
    const repoRoot = argv[2] ?? cwd();
    const expected = countSkills(repoRoot);
    const violations = [];
    for (const file of CHECKED_FILES) {
        const v = checkFile(repoRoot, file, expected);
        if (v)
            violations.push(v);
    }
    if (violations.length === 0) {
        console.log(`OK skill-count: all ${CHECKED_FILES.length} description string(s) state "${expected} bundled skills" (matches skills/ source-of-truth).`);
        exit(0);
    }
    console.error(`FAIL skill-count: ${violations.length} description string(s) do not state the actual bundled-skill count of ${expected}.`);
    console.error(`Source of truth is ${expected} kebab-case *.md file(s) under skills/. Each checked file must contain the literal "${expected} bundled skills".`);
    console.error("");
    for (const v of violations) {
        if (v.reason === "stale") {
            console.error(`  ${v.file} — states "${v.found}", expected "${expected} bundled skills"`);
        }
        else {
            console.error(`  ${v.file} — no "<count> bundled skills" phrase found`);
        }
    }
    console.error("");
    console.error("Fix: update SHARED_PLUGIN_DESCRIPTION in src/lib/plugin-metadata.mts and the");
    console.error("package.json description, then re-run `npm run build` to regenerate manifests.");
    exit(1);
}
const invokedDirectly = argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("check-skill-count.mjs")) {
    main();
}
