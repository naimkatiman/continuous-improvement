#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, cwd } from "node:process";
import { fileURLToPath } from "node:url";
const VERSION_RE = "([0-9]+\\.[0-9]+\\.[0-9]+)";
function firstMatch(content, pattern) {
    return pattern.exec(content)?.[1] ?? null;
}
export function checkLandingVersion(repoRoot) {
    const packagePath = resolve(repoRoot, "package.json");
    const landingPath = resolve(repoRoot, "docs", "landing", "index.html");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    const packageVersion = typeof packageJson.version === "string" ? packageJson.version : "";
    const landing = readFileSync(landingPath, "utf8");
    const markers = {
        badge: firstMatch(landing, new RegExp(`<span\\b[^>]*class=["'][^"']*\\bver\\b[^"']*["'][^>]*>\\s*v${VERSION_RE}\\s*</span>`, "i")),
        hero: firstMatch(landing, new RegExp(`<span\\b[^>]*class=["'][^"']*\\bkicker\\b[^"']*["'][^>]*>[\\s\\S]*?\\bREV\\s+${VERSION_RE}[\\s\\S]*?</span>`, "i")),
        current: firstMatch(landing, new RegExp(`<span\\b[^>]*class=["'][^"']*\\bv\\b[^"']*["'][^>]*>\\s*v${VERSION_RE}\\s*</span>\\s*<span\\b[^>]*class=["'][^"']*\\bk\\b[^"']*["'][^>]*>\\s*Current rev\\s*</span>`, "i")),
        footer: firstMatch(landing, new RegExp(`<span\\b[^>]*class=["'][^"']*\\bfoot-doc\\b[^"']*["'][^>]*>[\\s\\S]*?\\bREV\\s+${VERSION_RE}[\\s\\S]*?</span>`, "i")),
    };
    const errors = [];
    if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(packageVersion)) {
        errors.push(`package.json has an invalid version: ${packageVersion || "<missing>"}`);
    }
    const missing = Object.entries(markers)
        .filter(([, version]) => version === null)
        .map(([name]) => name);
    if (missing.length > 0) {
        errors.push(`landing release marker(s) missing: ${missing.join(", ")}`);
    }
    const landingVersions = [...new Set(Object.values(markers).filter((value) => value !== null))];
    if (landingVersions.length > 1) {
        errors.push(`landing release markers are mixed: ${landingVersions.join(", ")}`);
    }
    for (const [name, version] of Object.entries(markers)) {
        if (version !== null && version !== packageVersion) {
            errors.push(`${name} marker is ${version}; package.json is ${packageVersion}`);
        }
    }
    return { ok: errors.length === 0, packageVersion, markers, errors };
}
function main() {
    const repoRoot = argv[2] ?? cwd();
    try {
        const result = checkLandingVersion(repoRoot);
        if (result.ok) {
            console.log(`OK landing-version: all 4 markers match package.json ${result.packageVersion}.`);
            return;
        }
        console.error(`FAIL landing-version: ${result.errors.join("; ")}`);
        process.exitCode = 1;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`FAIL landing-version: ${message}`);
        process.exitCode = 1;
    }
}
const entryPath = argv[1] ? resolve(argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
    main();
}
