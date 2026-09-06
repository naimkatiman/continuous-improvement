#!/usr/bin/env node
/**
 * Test Count Check
 *
 * The landing page states the size of the test suite in two places: the spec
 * strip ("1,271 / Tests in the suite") and the verification-loop panel
 * ("tests      PASS  1271/1271"). Both are hand-maintained and both drifted
 * twice in a single day on 2026-09-06 — 1,137 to 1,249 to 1,271 — because every
 * PR that adds a test moves the real number and nothing guarded the claim. The
 * skill and command counts are guarded (check-skill-count, check-command-count);
 * this closes the same hole for tests.
 *
 * Unlike skills and commands, the real number cannot be derived from the
 * filesystem: 45 test files generate cases in loops, so counting `it(` / `test(`
 * declarations reports 1,066 against an actual 1,271. Node's runner has no
 * collect-without-running mode either — filtering by name pattern reports the
 * file count, not the test count. The only honest source is an actual run.
 *
 * So the check runs in two layers, and the docs are the source of truth:
 *
 *   1. Locally, inside `verify:all`, it asserts that every surface states the
 *      SAME number. Fast, no suite run, and it catches the two-surfaces-disagree
 *      case that a single-number edit produces.
 *   2. In CI, after `npm test` has already run, `--actual-from <file>` parses
 *      the runner's "tests N" summary out of the captured output and asserts the
 *      claimed number equals reality. No second suite run.
 *
 * A claim that drifts from reality fails CI; two claims that drift apart fail
 * locally. Fail-closed: a missing surface is a violation, not a silent pass.
 *
 * Usage:
 *   node bin/check-test-count.mjs                        # Claims agree with each other
 *   node bin/check-test-count.mjs --actual-from out.txt  # ...and with an actual run
 *   node bin/check-test-count.mjs <repo-root> [--actual-from out.txt]
 *
 * Exit codes:
 *   0 — every stated test count agrees (and matches the run, when supplied)
 *   1 — a surface is missing, surfaces disagree, or a claim is stale
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";
const LANDING = join("docs", "landing", "index.html");
/** The spec strip cell: <span class="v">1,271</span><span class="k">Tests in the suite</span> */
const STRIP_RE = /<span\b[^>]*class=["'][^"']*\bv\b[^"']*["'][^>]*>\s*([\d,]+)\s*<\/span>\s*<span\b[^>]*class=["'][^"']*\bk\b[^"']*["'][^>]*>\s*Tests in the suite\s*<\/span>/gi;
/** The verification-loop panel line: tests      PASS  1271/1271 */
const LADDER_RE = /^tests\s+PASS\s+([\d,]+)\/([\d,]+)\s*$/gim;
/** The node test runner summary: "ℹ tests 1271" */
const ACTUAL_RE = /^\W*tests\s+(\d+)\s*$/im;
const toNumber = (raw) => Number(raw.replace(/,/g, ""));
export function extractClaims(html) {
    const strip = [...html.matchAll(STRIP_RE)].map((m) => toNumber(m[1]));
    const ladder = [...html.matchAll(LADDER_RE)].flatMap((m) => [toNumber(m[1]), toNumber(m[2])]);
    return { strip, ladder };
}
export function parseActualCount(runOutput) {
    const m = ACTUAL_RE.exec(runOutput);
    return m ? Number(m[1]) : null;
}
export function findViolations(claims, actual) {
    const violations = [];
    if (claims.strip.length === 0) {
        violations.push(`the spec strip states no test count (expected a <span class="v">N</span> cell labelled "Tests in the suite").`);
    }
    if (claims.ladder.length === 0) {
        violations.push(`the verification-loop ladder states no test count (expected a "tests      PASS  N/N" line).`);
    }
    if (violations.length > 0)
        return violations;
    const stated = [...claims.strip, ...claims.ladder];
    const distinct = [...new Set(stated)].sort((a, b) => a - b);
    if (distinct.length > 1) {
        // Surfaces disagree with each other. Comparing a contested number to the run
        // would emit a second, derivative violation; fix the disagreement first.
        return [`the stated test counts disagree with each other: ${distinct.join(" vs ")}.`];
    }
    const claimed = distinct[0];
    if (actual !== null && actual !== claimed) {
        violations.push(`every surface states ${claimed} tests but the suite actually ran ${actual}.`);
    }
    return violations;
}
function main() {
    const args = argv.slice(2);
    const actualIdx = args.indexOf("--actual-from");
    const actualPath = actualIdx === -1 ? null : args[actualIdx + 1];
    if (actualIdx !== -1 && !actualPath) {
        console.error("FAIL test-count: --actual-from needs a path to a captured test run.");
        exit(1);
    }
    const repoRoot = args.find((a) => !a.startsWith("--") && a !== actualPath) ?? cwd();
    let html;
    try {
        html = readFileSync(join(repoRoot, LANDING), "utf8");
    }
    catch {
        console.error(`FAIL test-count: cannot read ${LANDING} at ${repoRoot}.`);
        exit(1);
    }
    let actual = null;
    if (actualPath) {
        let runOutput;
        try {
            runOutput = readFileSync(actualPath, "utf8");
        }
        catch {
            console.error(`FAIL test-count: cannot read the captured test run at ${actualPath}.`);
            exit(1);
        }
        actual = parseActualCount(runOutput);
        if (actual === null) {
            console.error(`FAIL test-count: ${actualPath} has no "tests N" summary line, so the claim cannot be checked against a real run.`);
            exit(1);
        }
    }
    const claims = extractClaims(html);
    const violations = findViolations(claims, actual);
    if (violations.length === 0) {
        const claimed = [...claims.strip, ...claims.ladder][0];
        const against = actual === null ? "each other" : `each other and the actual run`;
        console.log(`OK test-count: all ${claims.strip.length + claims.ladder.length} claim(s) state ${claimed} tests, matching ${against}.`);
        exit(0);
    }
    console.error(`FAIL test-count: ${violations.length} issue(s) with the stated test count.`);
    console.error("");
    for (const v of violations)
        console.error(`  ${v}`);
    console.error("");
    console.error(`Fix: run the suite, take the "tests N" total, and update both surfaces in ${LANDING} (the spec strip and the verification-loop panel).`);
    exit(1);
}
const invokedDirectly = argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("check-test-count.mjs")) {
    main();
}
