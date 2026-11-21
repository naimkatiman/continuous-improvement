#!/usr/bin/env node
/**
 * Agent Matrix Check
 *
 * The per-agent tier table is the public promise of what each coding agent
 * gets. Its rows live in lib/agent-support.mjs. This check holds every doc a
 * user reads before installing to those rows:
 *
 *   - docs/AGENT-SUPPORT.md is rendered from the rows, whole.
 *   - README.md and docs/landing/index.html carry the tier table between
 *     `<!-- agent-matrix:start -->` and `<!-- agent-matrix:end -->`.
 *   - .cloudplugin/marketplace.json carries compatibleWith from the rows and
 *     the package.json version (the build writes both).
 *   - No sentence in README.md, QUICKSTART.md, llms.txt, docs/AGENT-SUPPORT.md
 *     or docs/landing/index.html names an agent whose row cannot block a tool
 *     call together with a blocking verb, unless the sentence negates it.
 *   - The rows themselves agree: a blocking row has a pre-tool hook install,
 *     and its "blocks" cell says yes; a non-blocking row says no.
 *
 * Fail-closed: a missing file, a missing or repeated marker, and a row whose
 * canBlockPreTool is anything but true (read as non-blocking) are violations.
 *
 * Usage:
 *   node bin/check-agent-matrix.mjs                  # check the current repo
 *   node bin/check-agent-matrix.mjs <repo-root>      # check a specific repo root
 *   node bin/check-agent-matrix.mjs --write [root]   # rewrite every rendered surface
 *
 * Exit codes:
 *   0 — every surface matches the rows
 *   1 — at least one violation
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";
import { HOOK_AGENT_IDS, PLUGIN_AGENT_IDS } from "../lib/agent-install-plans.mjs";
import { AGENT_SUPPORT, blocksPreTool, renderCloudplugin, supportTier, } from "../lib/agent-support.mjs";
export const SUPPORT_DOC = "docs/AGENT-SUPPORT.md";
export const CLOUDPLUGIN = ".cloudplugin/marketplace.json";
export const BLOCK_START = "<!-- agent-matrix:start -->";
export const BLOCK_END = "<!-- agent-matrix:end -->";
export const CLAIM_SCAN_FILES = ["README.md", "QUICKSTART.md", "llms.txt", SUPPORT_DOC, "docs/landing/index.html"];
const REGENERATE = "run `node bin/check-agent-matrix.mjs --write`";
const BLOCK_WORDS = /\b(?:block(?:s|ed|ing)?|den(?:y|ies|ied)|refus(?:e|es|ed)|enforc(?:e|es|ed|ing|ement))\b/i;
const NEGATION = /\b(?:no|not|cannot|never|without|none|nothing)\b|n't\b/i;
const HOOK_INSTALLS = new Set(["claude", ...HOOK_AGENT_IDS, ...PLUGIN_AGENT_IDS]);
const EVIDENCE = {
    tested: "captured runs",
    local: "installed binary",
    docs: "vendor docs",
};
const LESSONS = {
    hook: "yes",
    "rules file": "rules file",
    none: "no",
};
/** Problems in the rows themselves. */
export function supportViolations(rows) {
    if (rows.length === 0)
        return ["agent-support: the table has no rows"];
    const out = [];
    const seen = new Set();
    for (const row of rows) {
        const at = `agent-support ${row.id}`;
        if (seen.has(row.id))
            out.push(`${at}: duplicate id`);
        seen.add(row.id);
        if (blocksPreTool(row)) {
            if (!HOOK_INSTALLS.has(row.id))
                out.push(`${at}: claims blocking but the installer wires no pre-tool hook for it`);
            if (/^no\b/i.test(row.blocks))
                out.push(`${at}: canBlockPreTool is true but the blocks cell says "${row.blocks}"`);
        }
        else if (row.blocks !== "no") {
            out.push(`${at}: canBlockPreTool is not true but the blocks cell says "${row.blocks}"`);
        }
        if (row.install.length === 0 || row.install.some((cmd) => cmd.trim() === ""))
            out.push(`${at}: no install command`);
        for (const cell of [...row.names, row.blocks, ...row.install, row.then, row.cannot, row.source]) {
            if (cell.includes("|"))
                out.push(`${at}: a cell contains "|", which breaks the Markdown table`);
            if (/[\r\n]/.test(cell))
                out.push(`${at}: a cell contains a newline`);
        }
    }
    return out;
}
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function plainText(line) {
    return line.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
}
/**
 * Sentences that name an agent whose row cannot block (anything but a literal
 * true) together with a blocking verb, and do not negate it. Each line is split
 * into sentences, HTML tags read as spaces.
 */
export function findBlockingClaims(file, text, rows = AGENT_SUPPORT) {
    const names = rows
        .filter((row) => !blocksPreTool(row))
        .flatMap((row) => row.names)
        .map((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, "i"));
    if (names.length === 0)
        return [];
    const claims = [];
    text.split(/\r?\n/).forEach((raw, index) => {
        for (const sentence of plainText(raw).split(/(?<=[.!?;])\s+/)) {
            if (!BLOCK_WORDS.test(sentence) || NEGATION.test(sentence))
                continue;
            if (names.some((name) => name.test(sentence)))
                claims.push({ file, line: index + 1, text: sentence.trim() });
        }
    });
    return claims;
}
/** The text with the body between the markers replaced, or null when the markers are not one ordered pair. */
export function spliceBlock(text, body) {
    const start = text.indexOf(BLOCK_START);
    const end = text.indexOf(BLOCK_END);
    if (start === -1 || end === -1 || end < start)
        return null;
    if (text.indexOf(BLOCK_START, start + 1) !== -1 || text.indexOf(BLOCK_END, end + 1) !== -1)
        return null;
    return `${text.slice(0, start + BLOCK_START.length)}\n${body}\n${text.slice(end)}`;
}
function installCell(row) {
    return row.install.map((cmd) => `\`${cmd}\``).join(", then ");
}
/** The tier table, Markdown. */
export function renderTierMarkdown(rows = AGENT_SUPPORT) {
    const lines = [
        "| Agent | Tier | Blocks a destructive command | Lessons at session start | Install | Cannot |",
        "|---|---|---|---|---|---|",
        ...rows.map((row) => `| ${row.names[0]} | ${supportTier(row)} | ${row.blocks} | ${LESSONS[row.lessons]} | ${installCell(row)} | ${row.cannot} |`),
    ];
    return lines.join("\n");
}
function htmlInline(text) {
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
}
/** The tier table, HTML for the landing page (stacks like the files table on narrow screens). */
export function renderTierHtml(rows = AGENT_SUPPORT) {
    const body = rows.map((row) => [
        `          <tr role="row">`,
        `            <th role="rowheader" scope="row">${htmlInline(row.names[0])}</th>`,
        `            <td role="cell" data-l="Tier"><b>${supportTier(row)}</b>. Blocks: ${htmlInline(row.blocks)}.</td>`,
        `            <td role="cell" data-l="Install">${row.install.map((cmd) => `<code>${htmlInline(cmd)}</code>`).join("<br>then ")}</td>`,
        `            <td role="cell" data-l="Cannot">${htmlInline(row.cannot)}</td>`,
        `          </tr>`,
    ].join("\n"));
    return [
        `      <table class="files agents" role="table" aria-labelledby="h-agents">`,
        `        <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col"><span class="tag">Agent</span></th><th role="columnheader" scope="col"><span class="tag">Tier</span></th><th role="columnheader" scope="col"><span class="tag">Install</span></th><th role="columnheader" scope="col"><span class="tag">Cannot</span></th></tr></thead>`,
        `        <tbody role="rowgroup">`,
        ...body,
        `        </tbody>`,
        `      </table>`,
    ].join("\n");
}
/** docs/AGENT-SUPPORT.md, whole. */
export function renderSupportDoc(rows = AGENT_SUPPORT) {
    const sections = rows.map((row) => [
        `### ${row.names[0]}`,
        "",
        `- Tier: ${supportTier(row)}`,
        `- Blocks a destructive command: ${row.blocks}`,
        `- Lessons at session start: ${LESSONS[row.lessons]}`,
        `- Stop gate: ${row.stopGate ? "yes" : "no"}`,
        `- MCP server: ${row.mcp ? "yes" : "no"}`,
        `- Checked against: ${EVIDENCE[row.evidence]}`,
        `- Install: ${installCell(row)}`,
        ...(row.then === "" ? [] : [`- Then: ${row.then}`]),
        `- Cannot: ${row.cannot}`,
        `- Source: ${row.source}`,
    ].join("\n"));
    return [
        "<!-- Generated from src/lib/agent-support.mts by `node bin/check-agent-matrix.mjs --write`. Do not edit by hand; `npm run verify:agent-matrix` fails on drift. -->",
        "",
        "# Agent support",
        "",
        "continuous-improvement is guardrails for coding agents, built for Claude Code first. This page is the promise for every other agent: what the guard does there, how saved lessons reach the model, and what the agent cannot do. Nothing here goes beyond what the 2026-11-21 research verified, with the skeptic corrections applied ([plan](plans/2026-11-21-all-agents.md)).",
        "",
        "## What the tiers mean",
        "",
        "- **full**: the guard blocks a destructive command before it runs, saved lessons reach the model at session start through a hook, and a Stop hook can send the turn back.",
        "- **partial**: the guard blocks, and one of the other two is missing.",
        "- **rules only**: the agent has no hook this package can use, so nothing is blocked. It gets the 7 Laws rules file, and the lessons through `ci lessons`.",
        "",
        "The guard is `hooks/gateguard.mjs` (destructive shell commands and blind edits), with `hooks/hook-pack.mjs` (protected-branch pushes, opt-in) and `hooks/config-guard.mjs` (guardrail config edits, opt-in). Lessons come from `hooks/session.mjs`. The Stop gate is `hooks/typecheck-stop.mjs` and `hooks/goal-drift-stop.mjs`, both off or warn-only until you switch them on (`CI_TYPECHECK_GATE=block`, `CI_GOAL_DRIFT_GATE=block`). The tool-call log is `bin/observe.mjs` and the MCP server is `bin/mcp-server.mjs`. `lib/hook-io.mjs` writes each answer in the format the agent reads, and OpenCode and Amp run the same hook files through `lib/hook-bridge.mjs`.",
        "",
        "\"Blocks\" means the agent stops the tool call when the hook runs and answers deny. An agent that fails open on a hook crash or timeout, or a setting that turns hooks off (Codex trust, Gemini and Qwen folder trust, Devin Restricted Mode, Copilot `disableAllHooks`), lets the call through. `npx -p continuous-improvement ci doctor --agent <id>` shows what an installed agent loaded, using only its own listing commands.",
        "",
        "\"Checked against\" says what a row rests on: captured runs, the installed binary and its bundled docs on the research host, or the vendor docs only.",
        "",
        "## Tier table",
        "",
        renderTierMarkdown(rows),
        "",
        "`--target <id>` without `--hooks` still writes only the rules file. Add `--scope user` to write the agent's user-level config, `--dry-run` to see every write first, `--run` to run the vendor `mcp add` command, and `--fail-closed` to set the agent's fail-closed option where it has one. `npx continuous-improvement install --uninstall --target <id>` removes what `--hooks` recorded.",
        "",
        "## Per agent",
        "",
        sections.join("\n\n"),
        "",
    ].join("\n");
}
function read(repoRoot, rel) {
    try {
        return readFileSync(join(repoRoot, rel), "utf8");
    }
    catch {
        return null;
    }
}
function packageVersion(repoRoot) {
    const text = read(repoRoot, "package.json");
    if (text === null)
        return null;
    try {
        const version = JSON.parse(text).version;
        return typeof version === "string" ? version : null;
    }
    catch {
        return null;
    }
}
const BLOCK_RENDERERS = [
    ["README.md", renderTierMarkdown],
    ["docs/landing/index.html", renderTierHtml],
];
/** Every violation, as one line each. Empty means pass. */
export function checkAgentMatrix(repoRoot, rows = AGENT_SUPPORT) {
    const out = supportViolations(rows);
    const doc = read(repoRoot, SUPPORT_DOC);
    if (doc === null)
        out.push(`${SUPPORT_DOC}: missing; ${REGENERATE}`);
    else if (doc.replace(/\r\n/g, "\n") !== renderSupportDoc(rows))
        out.push(`${SUPPORT_DOC}: differs from the rows; ${REGENERATE}`);
    for (const [file, render] of BLOCK_RENDERERS) {
        const text = read(repoRoot, file);
        if (text === null) {
            out.push(`${file}: missing`);
            continue;
        }
        const want = spliceBlock(text.replace(/\r\n/g, "\n"), render(rows));
        if (want === null)
            out.push(`${file}: needs exactly one ${BLOCK_START} ... ${BLOCK_END} marker pair`);
        else if (want !== text.replace(/\r\n/g, "\n"))
            out.push(`${file}: the tier table differs from the rows; ${REGENERATE}`);
    }
    const version = packageVersion(repoRoot);
    const manifest = read(repoRoot, CLOUDPLUGIN);
    if (version === null)
        out.push("package.json: missing or has no version");
    if (manifest === null)
        out.push(`${CLOUDPLUGIN}: missing`);
    if (version !== null && manifest !== null) {
        try {
            const have = JSON.parse(manifest);
            const want = JSON.parse(renderCloudplugin(manifest, version, rows));
            if (have.version !== version)
                out.push(`${CLOUDPLUGIN}: version ${String(have.version)} is not the package version ${version}; run \`npm run build\``);
            if (JSON.stringify(have.compatibleWith) !== JSON.stringify(want.compatibleWith)) {
                out.push(`${CLOUDPLUGIN}: compatibleWith is not ${JSON.stringify(want.compatibleWith)}; run \`npm run build\``);
            }
        }
        catch (error) {
            out.push(`${CLOUDPLUGIN}: ${error.message}`);
        }
    }
    for (const file of CLAIM_SCAN_FILES) {
        const text = read(repoRoot, file);
        if (text === null) {
            if (file !== SUPPORT_DOC)
                out.push(`${file}: missing, so its claims cannot be checked`);
            continue;
        }
        for (const claim of findBlockingClaims(file, text, rows)) {
            out.push(`${claim.file}:${claim.line}: claims blocking for an agent that cannot block: "${claim.text}"`);
        }
    }
    return out;
}
/** Rewrite every rendered surface from the rows. Returns the files written. A file without a marker pair is left alone. */
export function writeAgentMatrix(repoRoot, rows = AGENT_SUPPORT) {
    const written = [];
    writeFileSync(join(repoRoot, SUPPORT_DOC), renderSupportDoc(rows));
    written.push(SUPPORT_DOC);
    for (const [file, render] of BLOCK_RENDERERS) {
        const text = read(repoRoot, file);
        const next = text === null ? null : spliceBlock(text.replace(/\r\n/g, "\n"), render(rows));
        if (next === null)
            continue;
        writeFileSync(join(repoRoot, file), next);
        written.push(file);
    }
    const version = packageVersion(repoRoot);
    const manifest = read(repoRoot, CLOUDPLUGIN);
    if (version !== null && manifest !== null) {
        writeFileSync(join(repoRoot, CLOUDPLUGIN), renderCloudplugin(manifest, version, rows));
        written.push(CLOUDPLUGIN);
    }
    return written;
}
function main() {
    const args = argv.slice(2);
    const write = args.includes("--write");
    const repoRoot = args.find((arg) => arg !== "--write") ?? cwd();
    if (write) {
        for (const file of writeAgentMatrix(repoRoot))
            console.log(`wrote ${file}`);
    }
    const violations = checkAgentMatrix(repoRoot);
    if (violations.length === 0) {
        console.log(`OK agent-matrix: ${AGENT_SUPPORT.length} agents; ${SUPPORT_DOC}, the README and landing tier tables and ${CLOUDPLUGIN} match the rows, and no scanned doc claims blocking for an agent that cannot block.`);
        exit(0);
    }
    console.error(`FAIL agent-matrix: ${violations.length} violation(s).\n`);
    for (const v of violations)
        console.error(`  ${v}`);
    exit(1);
}
const invokedDirectly = argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("check-agent-matrix.mjs")) {
    main();
}
