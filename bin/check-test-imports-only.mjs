#!/usr/bin/env node
/**
 * Test-Imports-Only Invariant Check
 *
 * Enforces the test-isolation discipline that emerged from the composability
 * refactor train (PRs #144–#148): every test file's non-`node:*` import must
 * resolve to exactly one of `../bin/<x>.mjs` or `../lib/<x>.mjs`.
 *
 * Catches:
 *   - cross-test coupling (one test importing another test or shared helper)
 *   - bare npm specifiers leaking into the test surface
 *   - reach-through into `hooks/`, `scripts/`, `src/`, or deeper paths under
 *     `bin/` or `lib/`
 *
 * Baseline: all 56 `src/test/*.test.mts` files pass today.
 *
 * Usage:
 *   node bin/check-test-imports-only.mjs              # Check the current repo
 *   node bin/check-test-imports-only.mjs <repo-root>  # Check a specific repo root
 *
 * Exit codes:
 *   0 — every scanned test file imports only from node:* or ../bin/*.mjs or ../lib/*.mjs
 *   1 — at least one scanned test file imports something outside the allow-list
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix, sep } from "node:path";
import { argv, cwd, exit } from "node:process";
const TEST_SOURCE_DIR = "src/test";
const ORPHAN_TESTS = [];
const ALLOWED_PRODUCTION_PATH = /^\.\.\/(bin|lib)\/[A-Za-z0-9._-]+\.mjs$/;
export function isAllowedSpecifier(specifier) {
    if (specifier.startsWith("node:"))
        return true;
    if (ALLOWED_PRODUCTION_PATH.test(specifier))
        return true;
    return false;
}
export function extractImports(content) {
    const lines = content.split(/\r?\n/);
    const fromClause = /\bfrom\s+["']([^"']+)["']/;
    const importStart = /^\s*import\b/;
    const out = [];
    let inImport = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (!inImport) {
            if (!importStart.test(line))
                continue;
            const m = fromClause.exec(line);
            if (m && m[1] !== undefined) {
                out.push({ line: i + 1, specifier: m[1] });
                // single-line import resolved; stay in 'searching'
            }
            else {
                inImport = true;
            }
        }
        else {
            const m = fromClause.exec(line);
            if (m && m[1] !== undefined) {
                out.push({ line: i + 1, specifier: m[1] });
                inImport = false;
            }
        }
    }
    return out;
}
function discoverTestFiles(repoRoot) {
    const found = [];
    const dir = join(repoRoot, TEST_SOURCE_DIR);
    if (existsSync(dir) && statSync(dir).isDirectory()) {
        for (const entry of readdirSync(dir)) {
            if (entry.endsWith(".test.mts")) {
                found.push(join(TEST_SOURCE_DIR, entry));
            }
        }
    }
    for (const orphan of ORPHAN_TESTS) {
        if (existsSync(join(repoRoot, orphan))) {
            found.push(orphan);
        }
    }
    return found.sort();
}
function toPosix(relPath) {
    return relPath.split(sep).join(posix.sep);
}
function main() {
    const repoRoot = argv[2] ?? cwd();
    const files = discoverTestFiles(repoRoot);
    const violations = [];
    let productionImports = 0;
    for (const relPath of files) {
        const content = readFileSync(join(repoRoot, relPath), "utf8");
        const imports = extractImports(content);
        for (const { line, specifier } of imports) {
            if (!isAllowedSpecifier(specifier)) {
                violations.push({ file: toPosix(relPath), line, specifier });
            }
            else if (!specifier.startsWith("node:")) {
                productionImports += 1;
            }
        }
    }
    if (violations.length === 0) {
        console.log(`OK test-imports-only: ${files.length} test file(s), ${productionImports} production import(s), all within node:* or ../bin/*.mjs or ../lib/*.mjs.`);
        exit(0);
    }
    console.error(`FAIL test-imports-only: ${violations.length} non-node import(s) outside the allow-list.`);
    console.error("");
    for (const v of violations) {
        console.error(`  ${v.file}:${v.line} — imports "${v.specifier}"`);
    }
    console.error("");
    console.error("Allow-list: node:* builtins, ../bin/<name>.mjs, ../lib/<name>.mjs.");
    console.error("Fix: replace the offending import with a node:* equivalent, an allowed");
    console.error("production import, or a `spawnSync` of the compiled `.mjs`.");
    exit(1);
}
const scriptPathFromArgv = argv[1];
const isMainModule = scriptPathFromArgv !== undefined &&
    (import.meta.url.endsWith(scriptPathFromArgv.replace(/\\/g, "/")) ||
        scriptPathFromArgv.endsWith("check-test-imports-only.mjs"));
if (isMainModule) {
    main();
}
