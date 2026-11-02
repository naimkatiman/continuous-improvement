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
 *   2. `landing-drift.yml` runs the suite, then `--write --actual-from` rewrites
 *      both surfaces and opens a PR. Feature PRs are no longer blocked on the
 *      number; a missed bump is a bot PR, not a red check on the work that
 *      moved the count.
 *
 * Two claims that drift apart still fail locally. `--write` is fail-closed: a
 * missing surface throws rather than writing a partial page.
 *
 * Usage:
 *   node bin/check-test-count.mjs                        # Claims agree with each other
 *   node bin/check-test-count.mjs --actual-from out.txt  # ...and with an actual run
 *   node bin/check-test-count.mjs --write --actual-from out.txt  # Rewrite both surfaces
 *   node bin/check-test-count.mjs <repo-root> [--write] [--actual-from out.txt]
 *
 * Exit codes:
 *   0 — every stated test count agrees (and matches the run, when supplied),
 *       or --write succeeded (rewrote or already matching)
 *   1 — a surface is missing, surfaces disagree, a claim is stale, or --write
 *       was given without --actual-from
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";
const LANDING = join("docs", "landing", "index.html");
/** The spec strip cell: <span class="v">1,271</span><span class="k">Tests in the suite</span> */
const STRIP_RE = /<span\b[^>]*class=["'][^"']*\bv\b[^"']*["'][^>]*>\s*([\d,]+)\s*<\/span>\s*<span\b[^>]*class=["'][^"']*\bk\b[^"']*["'][^>]*>\s*Tests in the suite\s*<\/span>/gi;
/** The verification-loop panel line: tests      PASS  1271/1271 */
const LADDER_RE = /^tests\s+PASS\s+([\d,]+)\/([\d,]+)\s*$/gim;
const toNumber = (raw) => Number(raw.replace(/,/g, ""));
export function extractClaims(html) {
    STRIP_RE.lastIndex = 0;
    LADDER_RE.lastIndex = 0;
    const strip = [...html.matchAll(STRIP_RE)].map((m) => toNumber(m[1]));
    const ladder = [...html.matchAll(LADDER_RE)].flatMap((m) => [toNumber(m[1]), toNumber(m[2])]);
    return { strip, ladder };
}
export function parseActualCount(runOutput) {
    const matches = [...runOutput.matchAll(/^\W*tests\s+(\d+)\s*$/gim)];
    if (matches.length === 0)
        return null;
    return Number(matches[matches.length - 1][1]);
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
/**
 * Rewrite both landing test-count surfaces to `actual`. Strip uses a thousands
 * comma (`1,300`); the ladder does not (`1300/1300`). Throws rather than
 * writing a partial page if either surface is missing.
 */
export function applyTestCount(html, actual) {
    if (!Number.isInteger(actual) || actual < 0) {
        throw new RangeError(`actual test count must be a non-negative integer, got ${String(actual)}`);
    }
    STRIP_RE.lastIndex = 0;
    LADDER_RE.lastIndex = 0;
    const stripMatches = [...html.matchAll(STRIP_RE)];
    const ladderMatches = [...html.matchAll(LADDER_RE)];
    if (stripMatches.length === 0) {
        throw new Error("cannot write: the spec strip states no test count.");
    }
    if (ladderMatches.length === 0) {
        throw new Error("cannot write: the verification-loop ladder states no test count.");
    }
    const stripText = actual.toLocaleString("en-US");
    const ladderText = String(actual);
    const replacements = [];
    for (const m of stripMatches) {
        if (m.index === undefined) {
            throw new Error("cannot write: spec strip match has no index.");
        }
        const numStart = m.index + m[0].indexOf(m[1]);
        replacements.push({ start: numStart, end: numStart + m[1].length, text: stripText });
    }
    for (const m of ladderMatches) {
        if (m.index === undefined) {
            throw new Error("cannot write: verification-loop ladder match has no index.");
        }
        const aStart = m.index + m[0].indexOf(m[1]);
        const bStart = m.index + m[0].lastIndexOf(m[2]);
        replacements.push({ start: aStart, end: aStart + m[1].length, text: ladderText });
        replacements.push({ start: bStart, end: bStart + m[2].length, text: ladderText });
    }
    replacements.sort((a, b) => b.start - a.start);
    let out = html;
    for (const r of replacements) {
        out = `${out.slice(0, r.start)}${r.text}${out.slice(r.end)}`;
    }
    return { html: out, changed: out !== html };
}
function main() {
    const args = argv.slice(2);
    const write = args.includes("--write");
    const actualIdx = args.indexOf("--actual-from");
    const actualPath = actualIdx === -1 ? null : args[actualIdx + 1];
    if (actualIdx !== -1 && !actualPath) {
        console.error("FAIL test-count: --actual-from needs a path to a captured test run.");
        exit(1);
    }
    if (write && actualIdx === -1) {
        console.error("FAIL test-count: --write requires --actual-from <file>.");
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
    if (write) {
        if (actual === null) {
            console.error("FAIL test-count: --write requires --actual-from <file>.");
            exit(1);
        }
        let result;
        try {
            result = applyTestCount(html, actual);
        }
        catch (error) {
            console.error(`FAIL test-count: ${error instanceof Error ? error.message : String(error)}`);
            exit(1);
        }
        if (result.changed) {
            writeFileSync(join(repoRoot, LANDING), result.html);
            console.log(`OK test-count: wrote ${actual} to both surfaces in ${LANDING}.`);
        }
        else {
            console.log(`OK test-count: ${LANDING} already states ${actual} tests.`);
        }
        exit(0);
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
