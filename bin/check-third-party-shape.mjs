#!/usr/bin/env node
/**
 * Third-Party Snapshot Shape Invariant
 *
 * Verifies that every `third-party/<name>/` snapshot directory conforms to the
 * vendor playbook documented in `third-party/README.md`. For each snapshot
 * directory the check asserts:
 *
 *   1. `OUR_NOTES.md` exists and is non-empty
 *   2. `LICENSE` exists
 *   3. `third-party/MANIFEST.md` has at least one `### <heading>` block whose
 *      `Local path` row points at this snapshot directory
 *   4. The matching MANIFEST entry has a `Pinned SHA` row containing a
 *      40-char lowercase hex string wrapped in backticks
 *
 * The mapping between snapshot directory and MANIFEST heading is NOT identity
 * (e.g. dir `superpowers` <-> heading `obra/superpowers`). The check looks up
 * by `Local path`, not by name.
 *
 * Usage:
 *   node bin/check-third-party-shape.mjs              # check the current repo
 *   node bin/check-third-party-shape.mjs <repo-root>  # check a specific repo root
 *
 * Exit codes:
 *   0 - every snapshot is shape-compliant
 *   1 - at least one drift found
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";
const THIRD_PARTY_DIR = "third-party";
const MANIFEST_FILENAME = "MANIFEST.md";
const OUR_NOTES_FILENAME = "OUR_NOTES.md";
const LICENSE_FILENAME = "LICENSE";
const SHA_RE = /^[0-9a-f]{40}$/;
export function discoverSnapshots(repoRoot) {
    const dir = join(repoRoot, THIRD_PARTY_DIR);
    let entries;
    try {
        entries = readdirSync(dir);
    }
    catch {
        return [];
    }
    const snapshots = [];
    for (const name of entries) {
        const full = join(dir, name);
        let entryStat;
        try {
            entryStat = statSync(full);
        }
        catch {
            continue;
        }
        if (!entryStat.isDirectory())
            continue;
        snapshots.push({
            name,
            hasOurNotes: hasNonEmptyFile(join(full, OUR_NOTES_FILENAME)),
            hasLicense: fileExists(join(full, LICENSE_FILENAME)),
        });
    }
    return snapshots;
}
function fileExists(path) {
    try {
        return statSync(path).isFile();
    }
    catch {
        return false;
    }
}
function hasNonEmptyFile(path) {
    try {
        const s = statSync(path);
        return s.isFile() && s.size > 0;
    }
    catch {
        return false;
    }
}
export function parseManifestEntries(manifestText) {
    const lines = manifestText.split(/\r?\n/);
    const entries = [];
    let current = null;
    const flush = () => {
        if (current && current.localPath !== null)
            entries.push(current);
        current = null;
    };
    for (const line of lines) {
        const headingMatch = line.match(/^###\s+(.+?)\s*$/);
        if (headingMatch) {
            flush();
            current = { heading: headingMatch[1], pinnedSha: null, localPath: null };
            continue;
        }
        if (line.match(/^##\s+/) || line.match(/^#\s+/)) {
            flush();
            continue;
        }
        if (!current)
            continue;
        const shaRow = line.match(/^\|\s*Pinned SHA\s*\|\s*`?([0-9a-fA-F]+)`?\s*\|/);
        if (shaRow) {
            current.pinnedSha = shaRow[1].toLowerCase();
            continue;
        }
        const pathRow = line.match(/^\|\s*Local path\s*\|\s*`?([^`|]+?)`?\s*\|/);
        if (pathRow) {
            current.localPath = pathRow[1].trim();
            continue;
        }
    }
    flush();
    return entries;
}
function normalizeLocalPath(p) {
    let out = p.replace(/\\/g, "/").replace(/\/+$/, "");
    if (out.startsWith("./"))
        out = out.slice(2);
    return out;
}
export function checkThirdPartyShape(repoRoot) {
    const snapshots = discoverSnapshots(repoRoot);
    const manifestPath = join(repoRoot, THIRD_PARTY_DIR, MANIFEST_FILENAME);
    let manifestText = "";
    try {
        manifestText = readFileSync(manifestPath, "utf8");
    }
    catch {
        /* no manifest at all - every snapshot will fail no-manifest-entry */
    }
    const entries = parseManifestEntries(manifestText);
    const entryByLocalPath = new Map();
    for (const e of entries) {
        if (e.localPath)
            entryByLocalPath.set(normalizeLocalPath(e.localPath), e);
    }
    const drifts = [];
    for (const snap of snapshots) {
        if (!snap.hasOurNotes) {
            drifts.push({
                kind: "missing-our-notes",
                snapshot: snap.name,
                detail: `expected non-empty ${OUR_NOTES_FILENAME} at ${THIRD_PARTY_DIR}/${snap.name}/`,
            });
        }
        if (!snap.hasLicense) {
            drifts.push({
                kind: "missing-license",
                snapshot: snap.name,
                detail: `expected ${LICENSE_FILENAME} at ${THIRD_PARTY_DIR}/${snap.name}/`,
            });
        }
        const expectedPath = `${THIRD_PARTY_DIR}/${snap.name}`;
        const entry = entryByLocalPath.get(expectedPath);
        if (!entry) {
            drifts.push({
                kind: "no-manifest-entry",
                snapshot: snap.name,
                detail: `no MANIFEST.md ### block has Local path \`${expectedPath}/\``,
            });
            continue;
        }
        if (!entry.pinnedSha || !SHA_RE.test(entry.pinnedSha)) {
            drifts.push({
                kind: "invalid-sha",
                snapshot: snap.name,
                detail: `MANIFEST entry "${entry.heading}" has Pinned SHA "${entry.pinnedSha ?? "(none)"}" - expected 40-char lowercase hex`,
            });
        }
    }
    return {
        drifts,
        snapshotCount: snapshots.length,
        manifestEntryCount: entries.length,
    };
}
function main() {
    const repoRoot = argv[2] ?? cwd();
    const { drifts, snapshotCount, manifestEntryCount } = checkThirdPartyShape(repoRoot);
    if (drifts.length === 0) {
        console.log(`OK third-party-shape: all ${snapshotCount} snapshot(s) compliant ` +
            `(${manifestEntryCount} MANIFEST entr${manifestEntryCount === 1 ? "y" : "ies"} with Local path).`);
        exit(0);
    }
    console.error(`FAIL third-party-shape: ${drifts.length} drift(s) across ${snapshotCount} snapshot(s).\n`);
    for (const d of drifts) {
        console.error(`  - [${d.kind}] ${d.snapshot}`);
        if (d.detail)
            console.error(`      ${d.detail}`);
    }
    console.error(`\nFix: see third-party/README.md "Layout" + third-party/MANIFEST.md ` +
        `existing entries for the playbook shape (OUR_NOTES.md, LICENSE, ` +
        `### <heading> block with Pinned SHA + Local path rows).`);
    exit(1);
}
const invokedDirectly = argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("check-third-party-shape.mjs")) {
    main();
}
