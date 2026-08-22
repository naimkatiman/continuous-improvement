#!/usr/bin/env node
/**
 * Merge instinct buckets that are the same project under different path
 * spellings (C:/ vs c:/ vs C:\). observe/gateguard now hash the canonical
 * root; this CLI copies history into that hash and leaves an alias marker
 * on the old dir. Idempotent. Never deletes a directory.
 *
 * Usage:
 *   node bin/reconcile-instinct-hashes.mjs --dry-run
 *   node bin/reconcile-instinct-hashes.mjs --apply
 *   node bin/reconcile-instinct-hashes.mjs --apply --only 3ef4426c6e15 --only 137f2f54ec70
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { canonicalizeProjectRoot, hashProjectRoot, resolveInstinctsRoot } from "../lib/gateguard-state.mjs";
function countJsonl(path) {
    if (!existsSync(path))
        return 0;
    return readFileSync(path, "utf8").split(/\n/).filter((line) => line.trim() !== "").length;
}
function isoNow() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
export function discoverGroups(instinctsRoot) {
    const groups = new Map();
    let entries;
    try {
        entries = readdirSync(instinctsRoot);
    }
    catch {
        return [];
    }
    for (const name of entries) {
        if (name === "global")
            continue;
        const dir = join(instinctsRoot, name);
        try {
            if (!statSync(dir).isDirectory())
                continue;
        }
        catch {
            continue;
        }
        if (existsSync(join(dir, "alias.json")) && !existsSync(join(dir, "observations.jsonl"))) {
            continue;
        }
        const projectPath = join(dir, "project.json");
        if (!existsSync(projectPath))
            continue;
        let project;
        try {
            project = JSON.parse(readFileSync(projectPath, "utf8"));
        }
        catch {
            continue;
        }
        if (!project.root)
            continue;
        const canonicalRoot = canonicalizeProjectRoot(project.root);
        const canonicalHash = hashProjectRoot(canonicalRoot);
        const bucket = {
            hash: name,
            root: project.root,
            name: project.name ?? name,
            rows: countJsonl(join(dir, "observations.jsonl")),
        };
        const existing = groups.get(canonicalHash);
        if (existing) {
            existing.members.push(bucket);
        }
        else {
            groups.set(canonicalHash, {
                canonicalHash,
                canonicalRoot,
                name: project.name ?? name,
                members: [bucket],
            });
        }
    }
    return [...groups.values()].filter((group) => group.members.some((member) => member.hash !== group.canonicalHash && member.rows > 0));
}
function parseTs(line) {
    try {
        const parsed = JSON.parse(line);
        const value = Date.parse(parsed.ts ?? "");
        return Number.isFinite(value) ? value : 0;
    }
    catch {
        return 0;
    }
}
export function mergeJsonl(sources) {
    const rows = [];
    const seen = new Set();
    for (const file of sources) {
        if (!existsSync(file))
            continue;
        for (const line of readFileSync(file, "utf8").split(/\n/)) {
            const trimmed = line.trim();
            if (!trimmed || seen.has(trimmed))
                continue;
            seen.add(trimmed);
            rows.push(trimmed);
        }
    }
    rows.sort((a, b) => parseTs(a) - parseTs(b) || a.localeCompare(b));
    return rows.length === 0 ? "" : `${rows.join("\n")}\n`;
}
export function selectGroups(groups, only) {
    if (only.length === 0)
        return groups;
    const wanted = new Set(only);
    return groups.filter((group) => wanted.has(group.canonicalHash) || group.members.some((member) => wanted.has(member.hash)));
}
export function applyGroup(instinctsRoot, group) {
    const destDir = join(instinctsRoot, group.canonicalHash);
    mkdirSync(destDir, { recursive: true });
    const destObs = join(destDir, "observations.jsonl");
    const sources = group.members
        .map((member) => join(instinctsRoot, member.hash, "observations.jsonl"))
        .filter((path) => existsSync(path));
    const merged = mergeJsonl(sources);
    writeFileSync(destObs, merged, "utf8");
    let createdAt = isoNow();
    const destProject = join(destDir, "project.json");
    if (existsSync(destProject)) {
        try {
            const existing = JSON.parse(readFileSync(destProject, "utf8"));
            if (existing.created_at)
                createdAt = existing.created_at;
        }
        catch {
            // rewrite below
        }
    }
    writeFileSync(destProject, `${JSON.stringify({
        id: group.canonicalHash,
        name: group.name,
        root: group.canonicalRoot,
        created_at: createdAt,
    })}\n`, "utf8");
    const aliases = [];
    for (const member of group.members) {
        if (member.hash === group.canonicalHash)
            continue;
        const srcDir = join(instinctsRoot, member.hash);
        try {
            for (const file of readdirSync(srcDir)) {
                if (!file.endsWith(".yaml"))
                    continue;
                const dest = join(destDir, file);
                if (!existsSync(dest))
                    copyFileSync(join(srcDir, file), dest);
            }
        }
        catch {
            // missing dir is non-fatal
        }
        const srcObs = join(srcDir, "observations.jsonl");
        if (existsSync(srcObs)) {
            renameSync(srcObs, join(srcDir, `observations.migrated-to-${group.canonicalHash}.jsonl`));
        }
        writeFileSync(join(srcDir, "alias.json"), `${JSON.stringify({
            canonical: group.canonicalHash,
            canonical_root: group.canonicalRoot,
            migrated_at: isoNow(),
            rows: member.rows,
        })}\n`, "utf8");
        aliases.push(member.hash);
    }
    const copiedRows = merged === "" ? 0 : merged.trim().split("\n").length;
    return { copiedRows, aliases };
}
function printPlan(groups) {
    if (groups.length === 0) {
        console.log("No alias observation buckets to merge.");
        return;
    }
    console.log(`Alias groups: ${groups.length}`);
    for (const group of groups) {
        console.log(`  ${group.name} → ${group.canonicalHash} (${group.canonicalRoot})`);
        for (const member of group.members) {
            const mark = member.hash === group.canonicalHash ? "canonical" : "alias";
            console.log(`    ${member.hash}  ${member.rows} rows  ${mark}  root=${member.root}`);
        }
    }
}
function parseOnly(args) {
    const only = [];
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === "--only" && args[i + 1]) {
            only.push(args[i + 1]);
            i += 1;
        }
    }
    return only;
}
function main() {
    const args = argv.slice(2);
    const apply = args.includes("--apply");
    const dryRun = args.includes("--dry-run") || !apply;
    const instinctsRoot = resolveInstinctsRoot();
    const groups = selectGroups(discoverGroups(instinctsRoot), parseOnly(args));
    printPlan(groups);
    if (dryRun) {
        if (groups.length > 0)
            console.log("\nRe-run with --apply to merge.");
        return;
    }
    for (const group of groups) {
        const result = applyGroup(instinctsRoot, group);
        console.log(`merged ${result.copiedRows} rows into ${group.canonicalHash}; aliases ${result.aliases.join(",") || "(none)"}`);
    }
}
const invokedDirectly = argv[1]?.endsWith("reconcile-instinct-hashes.mjs");
if (invokedDirectly) {
    try {
        main();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        exit(1);
    }
}
