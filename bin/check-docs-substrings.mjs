#!/usr/bin/env node
/**
 * Docs Substring Check
 *
 * Verifies that every substring this repo's tests assert on inside a real
 * `*.md` file is currently present in that file. Mechanical enforcement of
 * the "Test/docs sync rule" in CONTRIBUTING.md: a wholesale docs rewrite
 * (README.md, CHANGELOG.md, skill markdown) must preserve the substrings
 * the test suite expects, or update the tests in the same PR.
 *
 * The full test suite (`npm test`) already runs each `assert.match` and
 * fails on drift. This lint adds three things on top:
 *   1. A focused, fast (<500ms) check that only verifies prose substrings.
 *   2. A clean failure surface — it names (target file, expected substring,
 *      originating test) instead of dumping the full doc content into stderr.
 *   3. A standalone CI step that fails before the broader test job has a
 *      chance to bury the drift in unrelated output.
 *
 * The manifest below is the spec. When you add or change a prose-substring
 * assertion in `src/test/*.mts`, add or update the corresponding entry here
 * in the same PR (per the Test/docs sync rule).
 *
 * Usage:
 *   node bin/check-docs-substrings.mjs              # Check the current repo
 *   node bin/check-docs-substrings.mjs <repo-root>  # Check a specific repo root
 *   node bin/check-docs-substrings.mjs --list       # Print the inventory and exit
 *
 * Exit codes:
 *   0 — every substring matches
 *   1 — at least one assertion failed (target file is missing or doesn't
 *       contain the expected substring)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";
export const DOCS_ASSERTIONS = [
    // README.md (src/test/community.test.mts)
    { file: "README.md", pattern: /planning-with-files/i, source: "community.test.mts:88" },
    { file: "README.md", pattern: /task_plan\.md/, source: "community.test.mts:89" },
    { file: "README.md", pattern: /ci_plan_init/, source: "community.test.mts:90" },
    // README.md install hero — locked 2026-05-05 to prevent silent rewording of
    // the install decision rule. The whole install section was restructured to
    // lead with this one line because the previous "pick one path" framing left
    // first-time installers comparison-shopping. Drop or rewrite this and
    // beginner-vs-expert ambiguity returns immediately.
    { file: "README.md", pattern: "If you don't know which to pick, use Beginner.", source: "docs-substrings-manifest:readme-install-decision-rule" },
    // CONTRIBUTING.md (src/test/community.test.mts)
    { file: "CONTRIBUTING.md", pattern: /Contributing/, source: "community.test.mts:16" },
    { file: "CONTRIBUTING.md", pattern: /npm test/, source: "community.test.mts:17" },
    // CONTRIBUTING.md Law Coverage Matrix anchor — locked 2026-05-05. The README
    // points to this section via #law-coverage-matrix; renaming the heading
    // creates a silent 404 in the README link. Lint catches it.
    { file: "CONTRIBUTING.md", pattern: "## Law Coverage Matrix", source: "docs-substrings-manifest:contributing-law-coverage-anchor" },
    // CODE_OF_CONDUCT.md (src/test/community.test.mts)
    { file: "CODE_OF_CONDUCT.md", pattern: /Code of Conduct/, source: "community.test.mts:24" },
    { file: "CODE_OF_CONDUCT.md", pattern: /Contributor Covenant/, source: "community.test.mts:25" },
    // SECURITY.md (src/test/community.test.mts)
    { file: "SECURITY.md", pattern: /Security/, source: "community.test.mts:32" },
    { file: "SECURITY.md", pattern: /Reporting/i, source: "community.test.mts:33" },
    { file: "SECURITY.md", pattern: /Vulnerabilit/i, source: "community.test.mts:34" },
    // .github/ISSUE_TEMPLATE/bug_report.md (src/test/community.test.mts)
    { file: ".github/ISSUE_TEMPLATE/bug_report.md", pattern: /Bug/, source: "community.test.mts:99" },
    { file: ".github/ISSUE_TEMPLATE/bug_report.md", pattern: /Steps to reproduce/, source: "community.test.mts:100" },
    // .github/ISSUE_TEMPLATE/feature_request.md (src/test/community.test.mts)
    { file: ".github/ISSUE_TEMPLATE/feature_request.md", pattern: /Feature/, source: "community.test.mts:107" },
    { file: ".github/ISSUE_TEMPLATE/feature_request.md", pattern: /law/i, source: "community.test.mts:108" },
    // SKILL.md (src/test/skill.test.mts)
    { file: "SKILL.md", pattern: /^---\r?\n/, source: "skill.test.mts:19" },
    { file: "SKILL.md", pattern: /name: continuous-improvement/, source: "skill.test.mts:20" },
    { file: "SKILL.md", pattern: /description:/, source: "skill.test.mts:21" },
    { file: "SKILL.md", pattern: /Law 1.*Research Before Executing/s, source: "skill.test.mts:25" },
    { file: "SKILL.md", pattern: /Law 2.*Plan Is Sacred/s, source: "skill.test.mts:26" },
    { file: "SKILL.md", pattern: /Law 3.*One Thing at a Time/s, source: "skill.test.mts:27" },
    { file: "SKILL.md", pattern: /Law 4.*Verify Before Reporting/s, source: "skill.test.mts:28" },
    { file: "SKILL.md", pattern: /Law 5.*Reflect After/s, source: "skill.test.mts:29" },
    { file: "SKILL.md", pattern: /Law 6.*Iterate/s, source: "skill.test.mts:30" },
    { file: "SKILL.md", pattern: /Law 7.*Learn From Every Session/s, source: "skill.test.mts:31" },
    { file: "SKILL.md", pattern: /Research.*Plan.*Execute.*Verify.*Reflect.*Learn.*Iterate/s, source: "skill.test.mts:36" },
    { file: "SKILL.md", pattern: /Mulahazah/i, source: "skill.test.mts:42" },
    { file: "SKILL.md", pattern: /confidence/i, source: "skill.test.mts:43" },
    { file: "SKILL.md", pattern: /Auto-Level/i, source: "skill.test.mts:44" },
    { file: "SKILL.md", pattern: /id:/, source: "skill.test.mts:48" },
    { file: "SKILL.md", pattern: /trigger:/, source: "skill.test.mts:49" },
    { file: "SKILL.md", pattern: /confidence:/, source: "skill.test.mts:50" },
    { file: "SKILL.md", pattern: /Planning-With-Files/i, source: "skill.test.mts:54" },
    { file: "SKILL.md", pattern: /opt-in/i, source: "skill.test.mts:55" },
    { file: "SKILL.md", pattern: /task_plan\.md/, source: "skill.test.mts:56" },
    // commands/discipline.md (src/test/commands.test.mts)
    { file: "commands/discipline.md", pattern: /^---\r?\n/, source: "commands.test.mts:20" },
    { file: "commands/discipline.md", pattern: /name: discipline/, source: "commands.test.mts:21" },
    { file: "commands/discipline.md", pattern: /description:/, source: "commands.test.mts:22" },
    { file: "commands/discipline.md", pattern: /Research Before Executing/, source: "commands.test.mts:26" },
    { file: "commands/discipline.md", pattern: /Plan Is Sacred/, source: "commands.test.mts:27" },
    { file: "commands/discipline.md", pattern: /One Thing at a Time/, source: "commands.test.mts:28" },
    { file: "commands/discipline.md", pattern: /Verify Before Reporting/, source: "commands.test.mts:29" },
    { file: "commands/discipline.md", pattern: /Reflect After Sessions/, source: "commands.test.mts:30" },
    { file: "commands/discipline.md", pattern: /Iterate One Change/, source: "commands.test.mts:31" },
    { file: "commands/discipline.md", pattern: /Learn From Every Session/, source: "commands.test.mts:32" },
    { file: "commands/discipline.md", pattern: /I'll just quickly/, source: "commands.test.mts:36" },
    { file: "commands/discipline.md", pattern: /This should work/, source: "commands.test.mts:37" },
    { file: "commands/discipline.md", pattern: /Code runs without errors/, source: "commands.test.mts:41" },
    { file: "commands/discipline.md", pattern: /Build passes/, source: "commands.test.mts:42" },
    // commands/dashboard.md (src/test/commands.test.mts)
    { file: "commands/dashboard.md", pattern: /^---\r?\n/, source: "commands.test.mts:56" },
    { file: "commands/dashboard.md", pattern: /name: dashboard/, source: "commands.test.mts:57" },
    { file: "commands/dashboard.md", pattern: /Dashboard/, source: "commands.test.mts:61" },
    { file: "commands/dashboard.md", pattern: /Observations/, source: "commands.test.mts:62" },
    { file: "commands/dashboard.md", pattern: /Instincts/, source: "commands.test.mts:63" },
    { file: "commands/dashboard.md", pattern: /Health/, source: "commands.test.mts:64" },
    { file: "commands/dashboard.md", pattern: /CAPTURE/, source: "commands.test.mts:68" },
    { file: "commands/dashboard.md", pattern: /ANALYZE/, source: "commands.test.mts:69" },
    { file: "commands/dashboard.md", pattern: /beginner|expert/, source: "commands.test.mts:70" },
    // commands/planning-with-files.md (src/test/commands.test.mts)
    { file: "commands/planning-with-files.md", pattern: /^---\r?\n/, source: "commands.test.mts:91" },
    { file: "commands/planning-with-files.md", pattern: /name: planning-with-files/, source: "commands.test.mts:92" },
    { file: "commands/planning-with-files.md", pattern: /description:/, source: "commands.test.mts:93" },
    { file: "commands/planning-with-files.md", pattern: /task_plan\.md/, source: "commands.test.mts:97" },
    { file: "commands/planning-with-files.md", pattern: /findings\.md/, source: "commands.test.mts:98" },
    { file: "commands/planning-with-files.md", pattern: /progress\.md/, source: "commands.test.mts:99" },
    { file: "commands/planning-with-files.md", pattern: /init/i, source: "commands.test.mts:100" },
    { file: "commands/planning-with-files.md", pattern: /status/i, source: "commands.test.mts:101" },
    { file: "commands/planning-with-files.md", pattern: /checkpoint/i, source: "commands.test.mts:102" },
    { file: "commands/planning-with-files.md", pattern: /recover/i, source: "commands.test.mts:103" },
    // Reflection-block mirror files (src/test/reflection-iteration-field.test.mts)
    // Each must contain the literal "Iteration — Next best recommendations (ranked, top 3)" string.
    { file: "SKILL.md", pattern: "Iteration — Next best recommendations (ranked, top 3)", source: "reflection-iteration-field.test.mts:43" },
    { file: "commands/continuous-improvement.md", pattern: "Iteration — Next best recommendations (ranked, top 3)", source: "reflection-iteration-field.test.mts:43" },
    { file: "plugins/continuous-improvement/skills/continuous-improvement/SKILL.md", pattern: "Iteration — Next best recommendations (ranked, top 3)", source: "reflection-iteration-field.test.mts:43" },
    { file: "plugins/continuous-improvement/commands/continuous-improvement.md", pattern: "Iteration — Next best recommendations (ranked, top 3)", source: "reflection-iteration-field.test.mts:43" },
    { file: "skills/proceed-with-the-recommendation.md", pattern: "Iteration — Next best recommendations (ranked, top 3)", source: "reflection-iteration-field.test.mts:43" },
    // Past Mistake Acknowledgment Gate / P-MAG (src/test/past-mistake-gate.test.mts)
    // Source skill + plugin mirror must both contain the Phase 0 heading, the negative-prompt field marker,
    // and the Stop Conditions clearance bullet. Dropping any of the three silently removes part of the gate.
    { file: "skills/proceed-with-the-recommendation.md", pattern: "Phase 0: Acknowledge (Past Mistake Acknowledgment Gate / P-MAG)", source: "past-mistake-gate.test.mts" },
    { file: "plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md", pattern: "Phase 0: Acknowledge (Past Mistake Acknowledgment Gate / P-MAG)", source: "past-mistake-gate.test.mts" },
    { file: "skills/proceed-with-the-recommendation.md", pattern: "Will NOT repeat:", source: "past-mistake-gate.test.mts" },
    { file: "plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md", pattern: "Will NOT repeat:", source: "past-mistake-gate.test.mts" },
    { file: "skills/proceed-with-the-recommendation.md", pattern: "Prior-mistake residue still present", source: "past-mistake-gate.test.mts" },
    { file: "plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md", pattern: "Prior-mistake residue still present", source: "past-mistake-gate.test.mts" },
    // P-MAG third surface (auto-memory feedback_*.md) — locked 2026-05-07 after PR #83.
    // Rule 1 of Phase 0 was upgraded from scanning two surfaces to scanning three so
    // the operator's named past-mistake corrections (which live in
    // ~/.claude/projects/<hash>/memory/feedback_*.md) cannot be silently skipped.
    // Each assertion below catches a specific class of regression:
    //   - "Scan three surfaces"           → reverting the surface count back to two
    //   - "memory/feedback_*.md"          → dropping the glob pattern entirely
    //   - "feedback_past_mistake_gate.md" → generic rewording that loses the concrete anchor
    { file: "skills/proceed-with-the-recommendation.md", pattern: "Scan three surfaces", source: "past-mistake-gate.test.mts" },
    { file: "plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md", pattern: "Scan three surfaces", source: "past-mistake-gate.test.mts" },
    { file: "skills/proceed-with-the-recommendation.md", pattern: "memory/feedback_*.md", source: "past-mistake-gate.test.mts" },
    { file: "plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md", pattern: "memory/feedback_*.md", source: "past-mistake-gate.test.mts" },
    { file: "skills/proceed-with-the-recommendation.md", pattern: "feedback_past_mistake_gate.md", source: "past-mistake-gate.test.mts" },
    { file: "plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md", pattern: "feedback_past_mistake_gate.md", source: "past-mistake-gate.test.mts" },
    // wild-risa-balance recommendation floor (src/test/wild-risa-floor.test.mts)
    // Source skill + plugin mirror must both contain the literal "2 WILD + 5 RISA = 7 items minimum".
    { file: "skills/wild-risa-balance.md", pattern: "2 WILD + 5 RISA = 7 items minimum", source: "wild-risa-floor.test.mts:38" },
    { file: "plugins/continuous-improvement/skills/wild-risa-balance/SKILL.md", pattern: "2 WILD + 5 RISA = 7 items minimum", source: "wild-risa-floor.test.mts:38" },
    // wild-risa-balance audience tiers (src/test/wild-risa-tiers.test.mts)
    // Source + plugin mirror must contain the tier headings, item-count rule, and model-version lock.
    // Dropping any one downgrades the tier contract back to a flat expert-only block.
    { file: "skills/wild-risa-balance.md", pattern: "## Audience Tiers (beginner vs expert)", source: "wild-risa-tiers.test.mts" },
    { file: "plugins/continuous-improvement/skills/wild-risa-balance/SKILL.md", pattern: "## Audience Tiers (beginner vs expert)", source: "wild-risa-tiers.test.mts" },
    { file: "skills/wild-risa-balance.md", pattern: "### Beginner tier (lite shape)", source: "wild-risa-tiers.test.mts" },
    { file: "plugins/continuous-improvement/skills/wild-risa-balance/SKILL.md", pattern: "### Beginner tier (lite shape)", source: "wild-risa-tiers.test.mts" },
    { file: "skills/wild-risa-balance.md", pattern: "### Expert tier", source: "wild-risa-tiers.test.mts" },
    { file: "plugins/continuous-improvement/skills/wild-risa-balance/SKILL.md", pattern: "### Expert tier", source: "wild-risa-tiers.test.mts" },
    { file: "skills/wild-risa-balance.md", pattern: "### Tier signal in the 3-section close", source: "wild-risa-tiers.test.mts" },
    { file: "plugins/continuous-improvement/skills/wild-risa-balance/SKILL.md", pattern: "### Tier signal in the 3-section close", source: "wild-risa-tiers.test.mts" },
    { file: "skills/wild-risa-balance.md", pattern: "3 minimum, 5 maximum", source: "wild-risa-tiers.test.mts" },
    { file: "plugins/continuous-improvement/skills/wild-risa-balance/SKILL.md", pattern: "3 minimum, 5 maximum", source: "wild-risa-tiers.test.mts" },
    { file: "skills/wild-risa-balance.md", pattern: "Opus 4.7", source: "wild-risa-tiers.test.mts" },
    { file: "plugins/continuous-improvement/skills/wild-risa-balance/SKILL.md", pattern: "Opus 4.7", source: "wild-risa-tiers.test.mts" },
    // wild-risa-balance "no" escape valve (src/test/wild-risa-tiers.test.mts)
    // Both tiers must allow `Recommendation: no` when no real recommendation exists; padding to hit
    // the floor is the failure mode. Heading + literal phrase + handoff-action clause are locked.
    { file: "skills/wild-risa-balance.md", pattern: `### The "no" escape valve (both tiers)`, source: "wild-risa-tiers.test.mts" },
    { file: "plugins/continuous-improvement/skills/wild-risa-balance/SKILL.md", pattern: `### The "no" escape valve (both tiers)`, source: "wild-risa-tiers.test.mts" },
    { file: "skills/wild-risa-balance.md", pattern: "Recommendation: no", source: "wild-risa-tiers.test.mts" },
    { file: "plugins/continuous-improvement/skills/wild-risa-balance/SKILL.md", pattern: "Recommendation: no", source: "wild-risa-tiers.test.mts" },
    { file: "skills/wild-risa-balance.md", pattern: "switch context", source: "wild-risa-tiers.test.mts" },
    { file: "plugins/continuous-improvement/skills/wild-risa-balance/SKILL.md", pattern: "switch context", source: "wild-risa-tiers.test.mts" },
    // proceed-with-the-recommendation tier-aware contract (src/test/wild-risa-tiers.test.mts)
    // Phase 1 must accept beginner blocks (3..5 unlabeled); Phase 7 close must render the tier suffix.
    { file: "skills/proceed-with-the-recommendation.md", pattern: "Beginner tier:**", source: "wild-risa-tiers.test.mts" },
    { file: "plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md", pattern: "Beginner tier:**", source: "wild-risa-tiers.test.mts" },
    { file: "skills/proceed-with-the-recommendation.md", pattern: "3 ≤ n ≤ 5", source: "wild-risa-tiers.test.mts" },
    { file: "plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md", pattern: "3 ≤ n ≤ 5", source: "wild-risa-tiers.test.mts" },
    { file: "skills/proceed-with-the-recommendation.md", pattern: "Tier signal in the heading", source: "wild-risa-tiers.test.mts" },
    { file: "plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md", pattern: "Tier signal in the heading", source: "wild-risa-tiers.test.mts" },
    { file: "skills/proceed-with-the-recommendation.md", pattern: "## Recommendation (expert)", source: "wild-risa-tiers.test.mts" },
    { file: "plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md", pattern: "## Recommendation (expert)", source: "wild-risa-tiers.test.mts" },
    { file: "skills/proceed-with-the-recommendation.md", pattern: "## Recommendation (beginner)", source: "wild-risa-tiers.test.mts" },
    { file: "plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md", pattern: "## Recommendation (beginner)", source: "wild-risa-tiers.test.mts" },
    // proceed-with-the-recommendation "no" escape valve in Phase 7 close (src/test/wild-risa-tiers.test.mts)
    // Phase 7 must instruct renderer to ship `no` + the tier-suffixed heading when the surface is exhausted.
    { file: "skills/proceed-with-the-recommendation.md", pattern: `The "no" escape valve (both tiers)`, source: "wild-risa-tiers.test.mts" },
    { file: "plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md", pattern: `The "no" escape valve (both tiers)`, source: "wild-risa-tiers.test.mts" },
    { file: "skills/proceed-with-the-recommendation.md", pattern: "explicit handoff signal", source: "wild-risa-tiers.test.mts" },
    { file: "plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md", pattern: "explicit handoff signal", source: "wild-risa-tiers.test.mts" },
];
export function checkAssertions(repoRoot, assertions = DOCS_ASSERTIONS) {
    const fileCache = new Map();
    const failures = [];
    for (const a of assertions) {
        const fullPath = join(repoRoot, a.file);
        let content = fileCache.get(fullPath);
        if (content === undefined) {
            try {
                content = readFileSync(fullPath, "utf8");
            }
            catch {
                content = null;
            }
            fileCache.set(fullPath, content);
        }
        if (content === null) {
            failures.push({ assertion: a, reason: "target-missing" });
            continue;
        }
        const matched = typeof a.pattern === "string"
            ? content.includes(a.pattern)
            : a.pattern.test(content);
        if (!matched) {
            failures.push({ assertion: a, reason: "pattern-not-found" });
        }
    }
    return failures;
}
function describePattern(p) {
    return typeof p === "string" ? `"${p}"` : p.toString();
}
function printList() {
    const grouped = new Map();
    for (const a of DOCS_ASSERTIONS) {
        const list = grouped.get(a.file) ?? [];
        list.push(a);
        grouped.set(a.file, list);
    }
    console.log(`docs-substrings inventory (${DOCS_ASSERTIONS.length} assertions across ${grouped.size} files):\n`);
    const files = [...grouped.keys()].sort();
    for (const f of files) {
        const items = grouped.get(f);
        console.log(`  ${f}  (${items.length})`);
        for (const a of items) {
            console.log(`    - ${describePattern(a.pattern)}  [${a.source}]`);
        }
    }
}
function main() {
    const args = argv.slice(2);
    if (args.includes("--list")) {
        printList();
        exit(0);
    }
    const repoRoot = args[0] ?? cwd();
    const failures = checkAssertions(repoRoot);
    if (failures.length === 0) {
        console.log(`OK docs-substrings: all ${DOCS_ASSERTIONS.length} substring assertion(s) match their target files.`);
        exit(0);
    }
    console.error(`FAIL docs-substrings: ${failures.length} of ${DOCS_ASSERTIONS.length} assertion(s) failed.\n`);
    for (const f of failures) {
        const a = f.assertion;
        if (f.reason === "target-missing") {
            console.error(`  - ${a.file}: target file not found (asserted by ${a.source}).`);
        }
        else {
            console.error(`  - ${a.file}: missing expected substring ${describePattern(a.pattern)} (asserted by ${a.source}).`);
        }
    }
    console.error("\nFix per CONTRIBUTING.md \"Test/docs sync rule\": tests asserting on prose content must ship in the same PR as the docs change adding the asserted substring. A wholesale docs rewrite must preserve every existing substring — or update the test in the same PR.");
    exit(1);
}
const invokedDirectly = argv[1]?.endsWith("check-docs-substrings.mjs");
if (invokedDirectly) {
    main();
}
