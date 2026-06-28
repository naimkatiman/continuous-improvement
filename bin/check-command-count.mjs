#!/usr/bin/env node
/**
 * Command Count Check
 *
 * The README "## Slash commands" section is hand-maintained: a fenced list of
 * `/command  description` lines plus "All N commands" / "All N ship" count
 * claims. The skill count is guarded (check-skill-count, check-skill-count-prose)
 * but the command count was not — it silently drifted to "18" while 28 commands
 * shipped (reconciled by hand in PR #263). This lint locks the README list and
 * its count claims to the actual shipped command set so the drift cannot recur.
 *
 * Source of truth: `commands/*.md` (flat source, excluding README.md) — the set
 * a contributor edits when adding a command. `npm run build` mirrors it into the
 * bundle and `verify:everything-mirror` already guarantees parity.
 *
 * The check asserts, against the README "## Slash commands" section:
 *   1. set parity — the fenced `/command` lines equal the commands/*.md set
 *      (reports `missing` = shipped-but-unlisted, `extra` = listed-but-unshipped)
 *   2. count claims — every "All N commands" / "All N ship" number equals the
 *      actual command count
 *
 * Fail-closed: a missing section, an empty list, or a missing count claim each
 * produce a violation rather than a silent pass.
 *
 * Usage:
 *   node bin/check-command-count.mjs              # Check the current repo
 *   node bin/check-command-count.mjs <repo-root>  # Check a specific repo root
 *
 * Exit codes:
 *   0 — README lists every shipped command and every count claim matches
 *   1 — at least one command missing/extra, or a count claim is stale/missing
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";
const COMMANDS_DIR = "commands";
const README = "README.md";
export function listCommandFiles(repoRoot) {
    return readdirSync(join(repoRoot, COMMANDS_DIR))
        .filter((f) => f.endsWith(".md") && f !== "README.md")
        .map((f) => f.slice(0, -3))
        .sort();
}
export function parseReadmeSlashCommands(content) {
    // Locate the "## Slash commands" section: from its heading to the next H2 (or EOF).
    const heading = /^##\s+Slash commands\s*$/im.exec(content);
    if (!heading)
        return { hasSection: false, listed: [], counts: [] };
    const rest = content.slice(heading.index + heading[0].length);
    const nextH2 = /^##\s+/m.exec(rest);
    const section = nextH2 ? rest.slice(0, nextH2.index) : rest;
    // Listed commands: lines that begin with "/<name>" at column 0 (the fenced list).
    const listed = [...section.matchAll(/^\/([a-z][a-z0-9-]*)/gm)].map((m) => m[1]);
    // Count claims: "All N commands" / "All N ship".
    const counts = [...section.matchAll(/All (\d+) (?:commands|ship)/g)].map((m) => Number(m[1]));
    return { hasSection: true, listed, counts };
}
export function findViolations(actualNames, parsed) {
    if (!parsed.hasSection) {
        return ["README has no '## Slash commands' section — cannot verify the command list."];
    }
    const violations = [];
    if (parsed.listed.length === 0) {
        violations.push("the '## Slash commands' section lists no commands (expected the fenced /command block).");
    }
    const actual = new Set(actualNames);
    const listed = new Set(parsed.listed);
    for (const name of actualNames) {
        if (!listed.has(name))
            violations.push(`missing: /${name} ships in commands/ but is not listed in the README.`);
    }
    for (const name of parsed.listed) {
        if (!actual.has(name))
            violations.push(`extra: /${name} is listed in the README but has no commands/${name}.md.`);
    }
    if (parsed.counts.length === 0) {
        violations.push("no 'All N commands' count claim found in the section.");
    }
    for (const n of parsed.counts) {
        if (n !== actualNames.length) {
            violations.push(`count claim states ${n} but commands/ ships ${actualNames.length}.`);
        }
    }
    return violations;
}
function main() {
    const repoRoot = argv[2] ?? cwd();
    const actual = listCommandFiles(repoRoot);
    let content;
    try {
        content = readFileSync(join(repoRoot, README), "utf8");
    }
    catch {
        console.error(`FAIL command-count: cannot read ${README} at ${repoRoot}.`);
        exit(1);
    }
    const parsed = parseReadmeSlashCommands(content);
    const violations = findViolations(actual, parsed);
    if (violations.length === 0) {
        console.log(`OK command-count: README lists all ${actual.length} command(s) and every count claim matches commands/.`);
        exit(0);
    }
    console.error(`FAIL command-count: ${violations.length} issue(s) between the README "Slash commands" section and commands/.`);
    console.error("");
    for (const v of violations)
        console.error(`  ${v}`);
    console.error("");
    console.error("Fix: update the README '## Slash commands' fenced list and its 'All N commands' / 'All N ship' counts to match commands/*.md.");
    exit(1);
}
const invokedDirectly = argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("check-command-count.mjs")) {
    main();
}
