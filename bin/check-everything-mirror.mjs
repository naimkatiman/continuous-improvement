#!/usr/bin/env node
/**
 * Everything Mirror Check
 *
 * Verifies that every non-skill, non-manifest file under
 * plugins/continuous-improvement/ has a byte-identical sibling at the same
 * relative path under the repo root. Catches drift across commands/, hooks/
 * (excluding the plugin-only hooks.json), instinct-packs/, templates/, lib/,
 * bin/, and the LICENSE file — surfaces that check-skill-mirror.mjs does not
 * cover.
 *
 * Skills are intentionally excluded because their flat-vs-plugin layout is
 * structurally different (skills/<name>.md vs plugins/.../skills/<name>/SKILL.md)
 * and check-skill-mirror.mjs already enforces that pair. A few plugin-only
 * surfaces are explicitly allowlisted: the .claude-plugin/ manifests, the
 * generated bundle README.md and skills/README.md, and hooks/hooks.json.
 *
 * Usage:
 *   node bin/check-everything-mirror.mjs              # Check the current repo
 *   node bin/check-everything-mirror.mjs <repo-root>  # Check a specific repo root
 *
 * Exit codes:
 *   0 — every mirrored file matches its flat-tree sibling
 *   1 — at least one drift detected (missing flat sibling or content mismatch)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { argv, cwd, exit } from "node:process";
const PLUGIN_ROOT_REL = "plugins/continuous-improvement";
// Paths under PLUGIN_ROOT_REL that are intentionally plugin-only (no flat
// sibling expected) or are covered by another lint. Stored with forward
// slashes; matched against the file's relative-to-plugin-root path normalized
// the same way.
const EXCLUDE_FILES = new Set([
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    "README.md",
    "hooks/hooks.json",
    "skills/README.md",
]);
// Whole directories under PLUGIN_ROOT_REL that this lint never walks into.
const EXCLUDE_DIRS = new Set(["skills", ".claude-plugin"]);
function toForward(p) {
    return p.split(sep).join("/");
}
export function discoverMirrorPairs(repoRoot) {
    const pluginRoot = join(repoRoot, PLUGIN_ROOT_REL);
    const out = [];
    function walk(dir) {
        let entries;
        try {
            entries = readdirSync(dir);
        }
        catch {
            return;
        }
        for (const name of entries) {
            const full = join(dir, name);
            let stat;
            try {
                stat = statSync(full);
            }
            catch {
                continue;
            }
            const relFromPlugin = toForward(relative(pluginRoot, full));
            if (stat.isDirectory()) {
                if (EXCLUDE_DIRS.has(relFromPlugin))
                    continue;
                walk(full);
                continue;
            }
            if (!stat.isFile())
                continue;
            if (EXCLUDE_FILES.has(relFromPlugin))
                continue;
            out.push({
                relPath: relFromPlugin,
                pluginPath: full,
                flatPath: join(repoRoot, relFromPlugin),
            });
        }
    }
    walk(pluginRoot);
    return out.sort((a, b) => a.relPath.localeCompare(b.relPath));
}
export function checkMirrorPairs(repoRoot) {
    const pairs = discoverMirrorPairs(repoRoot);
    const drifts = [];
    for (const pair of pairs) {
        let flatContent;
        try {
            flatContent = readFileSync(pair.flatPath);
        }
        catch {
            drifts.push({
                relPath: pair.relPath,
                reason: "missing-flat",
                pluginPath: pair.pluginPath,
                flatPath: pair.flatPath,
            });
            continue;
        }
        const pluginContent = readFileSync(pair.pluginPath);
        if (!pluginContent.equals(flatContent)) {
            drifts.push({
                relPath: pair.relPath,
                reason: "content-drift",
                pluginPath: pair.pluginPath,
                flatPath: pair.flatPath,
                pluginBytes: pluginContent.length,
                flatBytes: flatContent.length,
            });
        }
    }
    return drifts;
}
function main() {
    const repoRoot = argv[2] ?? cwd();
    const pairs = discoverMirrorPairs(repoRoot);
    const drifts = checkMirrorPairs(repoRoot);
    if (drifts.length === 0) {
        console.log(`OK everything-mirror: all ${pairs.length} mirrored file(s) match their flat-tree sibling.`);
        exit(0);
    }
    console.error(`FAIL everything-mirror: ${drifts.length} drift(s) detected across ${pairs.length} mirrored file(s).\n`);
    for (const d of drifts) {
        if (d.reason === "missing-flat") {
            console.error(`  - ${d.relPath}: plugin copy exists but flat sibling is missing.`);
            console.error(`      plugin: ${d.pluginPath}`);
            console.error(`      flat:   ${d.flatPath} (NOT FOUND)`);
        }
        else {
            console.error(`  - ${d.relPath}: byte drift between plugin and flat copy (${d.pluginBytes} vs ${d.flatBytes} bytes).`);
            console.error(`      plugin: ${d.pluginPath}`);
            console.error(`      flat:   ${d.flatPath}`);
        }
    }
    console.error("\nFix: every change to a mirrored file under plugins/continuous-improvement/ must be applied to its flat-tree sibling at the same relative path in the same PR. Plugin-only files (.claude-plugin/manifests, hooks/hooks.json, the bundle README.md, skills/README.md) are allowlisted; skills are covered by check-skill-mirror.mjs.");
    exit(1);
}
const invokedDirectly = argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("check-everything-mirror.mjs")) {
    main();
}
