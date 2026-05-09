#!/usr/bin/env node
/**
 * Doc Runtime-Claims Check
 *
 * Codifies the audit-twice rule (memory: feedback_grep_hook_before_claim).
 *
 * Any user-facing line that claims a runtime hook / PreToolUse gate /
 * physical block must be accompanied by a `hooks/<file>.mjs` reference
 * inside a ±5-line window. Without that anchor, the doc is making a
 * claim a future reader cannot verify against the actual filesystem.
 *
 * Origin: PR #105 shipped a smoke test that promised gateguard would
 * physically block, when the hook did not yet exist. PR #108 built the
 * hook. PR #115 reverted the inverse drift after the hook shipped but
 * docs still said "roadmap." This lint locks the audit-twice rule into
 * automation so the next runtime claim cannot land without its anchor.
 *
 * Scope: QUICKSTART.md, README.md, skills/*.md.
 * Out of scope: bundle mirrors under plugins/, docs/, third-party/.
 *
 * Trigger phrases (case-insensitive substring match on the line):
 *   - "PreToolUse hook"
 *   - "physically block"   (catches "physically blocks", "physical block")
 *   - "runtime gate"
 *
 * Deliberately narrow per the spec that authorized this lint. "runtime
 * hook" was considered and dropped: too prone to false positives on
 * disclaimers ("not a runtime hook", "no runtime hook is bundled").
 * Future trigger additions need an explicit owner decision; do not bolt
 * on phrases just because they sound related.
 *
 * Anchor: any reference matching `hooks/<name>.mjs` (case-insensitive)
 * inside the ±5-line window (the trigger line itself plus 5 lines above
 * and 5 lines below).
 *
 * Usage:
 *   node bin/check-doc-runtime-claims.mjs              # Check the current repo
 *   node bin/check-doc-runtime-claims.mjs <repo-root>  # Check a specific repo root
 *
 * Exit codes:
 *   0 — every runtime-claim line has an in-window hooks/ anchor
 *   1 — at least one claim line is unanchored
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";
const SCAN_FILES = ["QUICKSTART.md", "README.md"];
const SCAN_SKILL_DIR = "skills";
const ANCHOR_WINDOW = 5;
const TRIGGER_PHRASES = [
    "pretooluse hook",
    "physically block",
    "runtime gate",
];
const ANCHOR_PATTERN = /hooks\/[a-z0-9-]+\.mjs/i;
function listSkillFiles(repoRoot) {
    const skillsDir = join(repoRoot, SCAN_SKILL_DIR);
    let entries;
    try {
        entries = readdirSync(skillsDir);
    }
    catch {
        return [];
    }
    return entries
        .filter((f) => /^[a-z][a-z0-9-]*\.md$/.test(f))
        .map((f) => join(SCAN_SKILL_DIR, f))
        .sort();
}
function scanFile(repoRoot, relPath) {
    const fullPath = join(repoRoot, relPath);
    let content;
    try {
        content = readFileSync(fullPath, "utf8");
    }
    catch {
        return [];
    }
    const lines = content.split(/\r?\n/);
    const violations = [];
    for (let i = 0; i < lines.length; i += 1) {
        const lower = lines[i].toLowerCase();
        const matchedPhrase = TRIGGER_PHRASES.find((p) => lower.includes(p));
        if (!matchedPhrase)
            continue;
        const start = Math.max(0, i - ANCHOR_WINDOW);
        const end = Math.min(lines.length - 1, i + ANCHOR_WINDOW);
        const window = lines.slice(start, end + 1).join("\n");
        if (ANCHOR_PATTERN.test(window))
            continue;
        violations.push({
            file: relPath,
            line: i + 1,
            text: lines[i].trim(),
        });
    }
    return violations;
}
function main() {
    const repoRoot = argv[2] ?? cwd();
    const files = [...SCAN_FILES, ...listSkillFiles(repoRoot)];
    const allViolations = [];
    for (const file of files) {
        allViolations.push(...scanFile(repoRoot, file));
    }
    if (allViolations.length === 0) {
        console.log(`OK doc-runtime-claims: every runtime-claim line in ${files.length} scanned file(s) has a hooks/<name>.mjs anchor within ±${ANCHOR_WINDOW} lines.`);
        exit(0);
    }
    console.error(`FAIL doc-runtime-claims: ${allViolations.length} unanchored runtime-claim line(s) found.`);
    console.error(`Each line below contains a runtime-claim phrase but has no hooks/<name>.mjs reference within ±${ANCHOR_WINDOW} lines.`);
    console.error("Add the hook file path inline so a reader can verify the claim against the filesystem.");
    console.error("");
    for (const v of allViolations) {
        console.error(`  ${v.file}:${v.line}`);
        console.error(`    ${v.text}`);
    }
    exit(1);
}
main();
