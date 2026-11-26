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
 *     `<!-- agent-matrix:start -->` and `<!-- agent-matrix:end -->`. Both
 *     list only the rows that block a destructive command (the owner's
 *     2026-11-22 call: the README names the agents it works on, and the
 *     landing page follows it); docs/AGENT-SUPPORT.md keeps every row.
 *   - README.md and docs/landing/index.html carry the loop between
 *     `<!-- loop-table:start -->` and `<!-- loop-table:end -->`, a table in
 *     the README and a list of steps on the landing page, both rendered from
 *     lib/loop-stages.mjs with their agent counts taken from the rows.
 *   - assets/readme/agents-map.svg, the README's map of those same rows, is
 *     rendered from them byte for byte.
 *   - .cloudplugin/marketplace.json carries compatibleWith from the rows that
 *     block, and the package.json version (the build writes both).
 *   - No sentence in README.md, QUICKSTART.md, llms.txt, docs/AGENT-SUPPORT.md
 *     or docs/landing/index.html, nor the bold lead of a CHANGELOG.md
 *     [Unreleased] entry, names an agent whose row cannot block a tool call
 *     together with a blocking verb, unless the sentence negates it. A claim
 *     for a conditional row (Junie) must name its condition, and a short name
 *     that a non-blocking row's name extends ("Kiro" beside "Kiro IDE") must
 *     name the surface.
 *   - The rows themselves agree: a blocking row has a pre-tool hook install,
 *     and its "blocks" cell says yes; a non-blocking row says no or "not
 *     claimed". A row whose verified matrix verdict is anything but yes (the
 *     Kiro IDE is partial) claims no blocking, by the flag or by its cell,
 *     except a conditional one (Junie, Early Access only) whose cell names the
 *     condition. A non-blocking row rated partial has a hook install. A
 *     variant row names a base row of the same `--target`.
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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { argv, cwd, exit } from "node:process";
import { HOOK_AGENT_IDS, PLUGIN_AGENT_IDS } from "../lib/agent-install-plans.mjs";
import { AGENT_SUPPORT, blocksPreTool, installFlags, renderCloudplugin, supportTier, } from "../lib/agent-support.mjs";
import { LOOP_TABLE_END, LOOP_TABLE_START, renderLoopStepsHtml, renderLoopTableMarkdown } from "../lib/loop-stages.mjs";
import { IMAGE_WIDTH, PAD, charsFit, rect, richText, svgDocument, text, wrap } from "../lib/readme-svg.mjs";
export const SUPPORT_DOC = "docs/AGENT-SUPPORT.md";
export const CLOUDPLUGIN = ".cloudplugin/marketplace.json";
export const AGENT_MAP_SVG = "assets/readme/agents-map.svg";
export const BLOCK_START = "<!-- agent-matrix:start -->";
export const BLOCK_END = "<!-- agent-matrix:end -->";
export const CLAIM_SCAN_FILES = ["README.md", "QUICKSTART.md", "llms.txt", SUPPORT_DOC, "docs/landing/index.html"];
// Only the bold lead of each [Unreleased] entry is scanned: the lead is the
// outcome a reader takes away, released sections are history, and an entry's
// body walks through mechanism (encoders, exit codes) the sentence heuristic
// cannot tell from a claim. A repository with no CHANGELOG.md has none to check.
export const CHANGELOG_FILE = "CHANGELOG.md";
const REGENERATE = "run `node bin/check-agent-matrix.mjs --write`";
// A bare "gate" is left out: it is nearly always the noun ("the drift gate").
const BLOCK_WORDS = /\b(?:block(?:s|ed|ing)?|den(?:y|ies|ied)|refus(?:e|es|ed)|enforc(?:e|es|ed|ing|ement)|stop(?:s|ped|ping)?|prevent(?:s|ed|ing)?|gat(?:es|ed|ing)|guard(?:s|ed|ing)?\s+against)\b/gi;
const NEGATION = /\b(?:no|not|cannot|never|without|none|nothing|nor|neither)\b|n't\b/i;
// How many words before a blocking verb, in the same clause, a negation may sit and still govern it.
const NEGATION_REACH = 3;
const CLAUSE_BREAK = /[,:;()–—]|\s-\s/;
// "Stop gate", "Stop hook": the agent event, not the verb.
const STOP_EVENT = /\bStop(?=[ -](?:gate|hook|event|boundary)s?\b)/g;
// HTML tags that end a run of text; inline tags (b, code, a, span, td, th) do not.
const HTML_BREAK = /<\/?(?:p|div|li|ul|ol|dl|dt|dd|tr|table|thead|tbody|tfoot|caption|section|article|aside|header|footer|nav|main|h[1-6]|br|hr|pre|blockquote|figure|figcaption|title|head|body|html|script|style|meta|link|details|summary)\b[^>]*>/gi;
// A Markdown line that stands alone: a table row, a heading, a fence or a list item's first line.
const MD_STANDALONE = /^\s*(?:\||#{1,6}\s|```|~~~)/;
const MD_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;
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
/**
 * The condition a conditional row's Blocks cell names, for prose to repeat:
 * "yes, on the Early Access build" gives "Early Access build". Empty when the
 * cell names none, and then no sentence can satisfy it (fail closed).
 */
function conditionOf(row) {
    const match = /^yes,\s*(.*)$/i.exec(row.blocks);
    if (!match)
        return "";
    return (match[1] ?? "")
        .replace(/^(?:on|in|with|while|after|outside|through|when)\s+/i, "")
        .replace(/^(?:the|a|an)\s+/i, "")
        .trim();
}
/** A name of a blocking row that a non-blocking row's name extends ("Kiro", "Kiro IDE"), matched only where no longer name follows it. */
function ambiguousNames(rows) {
    const out = [];
    for (const row of rows.filter((r) => blocksPreTool(r))) {
        for (const name of row.names) {
            const prefix = `${name.toLowerCase()} `;
            const longer = rows.flatMap((other) => other.names.filter((n) => n.toLowerCase().startsWith(prefix)).map((n) => ({ n, other })));
            const blind = longer.filter(({ other }) => !blocksPreTool(other));
            if (blind.length === 0)
                continue;
            const rests = longer.map(({ n }) => escapeRegExp(n.slice(prefix.length)).replace(/ /g, "\\s+"));
            out.push({
                bare: new RegExp(`\\b${escapeRegExp(name)}\\b(?!\\s+(?:${rests.join("|")})\\b)`, "i"),
                name,
                surfaces: `a name of ${row.names[0]} that also covers ${blind.map(({ n }) => n).join(", ")}, which claims no blocking`,
            });
        }
    }
    return out;
}
/** Problems in the rows themselves. */
export function supportViolations(rows) {
    if (rows.length === 0)
        return ["agent-support: the table has no rows"];
    const out = [];
    const seen = new Set();
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const row of rows) {
        const at = `agent-support ${row.id}`;
        if (seen.has(row.id))
            out.push(`${at}: duplicate id`);
        seen.add(row.id);
        if (row.variantOf !== undefined) {
            const base = byId.get(row.variantOf);
            if (base === undefined)
                out.push(`${at}: variant of ${row.variantOf}, which has no row`);
            else if (base.variantOf !== undefined)
                out.push(`${at}: variant of ${row.variantOf}, which is itself a variant`);
        }
        // Fail closed: only the literal verdict "yes", or "conditional" with the
        // condition in the blocks cell, lets a row claim blocking.
        const claimsBlocking = blocksPreTool(row) || /^yes\b/i.test(row.blocks);
        if (claimsBlocking && row.preToolVerdict === "conditional") {
            if (!/^yes, \S/.test(row.blocks))
                out.push(`${at}: the verified matrix rates its pre-tool block conditional, but the blocks cell names no condition ("${row.blocks}")`);
        }
        else if (claimsBlocking && row.preToolVerdict !== "yes") {
            out.push(`${at}: the verified matrix rates its pre-tool block ${JSON.stringify(row.preToolVerdict)}, but the row claims blocking ("${row.blocks}")`);
        }
        // A partial row is published as "hooks run", so it needs a hook install too.
        if (!blocksPreTool(row) && row.preToolVerdict === "partial" && !HOOK_INSTALLS.has(row.variantOf ?? row.id)) {
            out.push(`${at}: rated partial (its hooks run) but the installer has no hook install for it`);
        }
        if (blocksPreTool(row)) {
            if (!HOOK_INSTALLS.has(row.variantOf ?? row.id))
                out.push(`${at}: claims blocking but the installer wires no pre-tool hook for it`);
            if (/^(?:no|not)\b/i.test(row.blocks))
                out.push(`${at}: canBlockPreTool is true but the blocks cell says "${row.blocks}"`);
        }
        else if (row.blocks !== "no" && !/^not claimed\b/.test(row.blocks)) {
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
/** Same length as the input, so offsets still point into the source: tags, &nbsp; and the Stop event name become spaces. */
function blankMarkup(text) {
    const blank = (match) => " ".repeat(match.length);
    return text.replace(/<[^>]*>/g, blank).replace(/&nbsp;/g, blank).replace(STOP_EVENT, blank);
}
/** Markdown runs: a paragraph or list item is one run, and a table row, heading or fence line stands alone. */
function markdownRuns(text) {
    const runs = [];
    let run = null;
    const close = () => {
        if (run)
            runs.push({ start: run.start, text: text.slice(run.start, run.end) });
        run = null;
    };
    let offset = 0;
    for (const line of text.split("\n")) {
        const end = offset + line.length;
        if (line.trim() === "")
            close();
        else if (MD_STANDALONE.test(line)) {
            close();
            runs.push({ start: offset, text: line });
        }
        else {
            if (MD_ITEM.test(line))
                close();
            if (run)
                run.end = end;
            else
                run = { start: offset, end };
        }
        offset = end + 1;
    }
    close();
    return runs;
}
/** Runs of prose that are read as one, cut again at HTML block tags; markup is blanked in place. */
function proseRuns(file, text) {
    const runs = file.endsWith(".html") ? [{ start: 0, text }] : markdownRuns(text);
    return runs.flatMap((run) => {
        const pieces = [];
        let start = 0;
        for (const tag of run.text.matchAll(HTML_BREAK)) {
            pieces.push({ start: run.start + start, text: blankMarkup(run.text.slice(start, tag.index)) });
            start = tag.index + tag[0].length;
        }
        pieces.push({ start: run.start + start, text: blankMarkup(run.text.slice(start)) });
        return pieces;
    });
}
/** True when a negation sits within reach before the verb in the same clause, or the verb is a "Blocks: no" label. */
function negated(sentence, at, verb) {
    const clauses = sentence.slice(0, at).split(CLAUSE_BREAK);
    const before = (clauses[clauses.length - 1] ?? "").trim().split(/\s+/).slice(-NEGATION_REACH);
    if (before.some((word) => NEGATION.test(word)))
        return true;
    return /^[^,;.]*:\s*(?:no|none|never|not)\b(?!\s+(?:just|only)\b)/i.test(sentence.slice(at + verb.length));
}
/**
 * Sentences that name an agent whose row cannot block (anything but a literal
 * true) together with a blocking verb that no negation governs. A sentence is
 * read whole across wrapped lines; the line reported is the verb's.
 */
export function findBlockingClaims(file, text, rows = AGENT_SUPPORT) {
    const wordOf = (name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, "i");
    const names = rows
        .filter((row) => !blocksPreTool(row))
        .flatMap((row) => row.names)
        .map(wordOf);
    const conditional = rows
        .filter((row) => blocksPreTool(row) && row.preToolVerdict === "conditional")
        .map((row) => row.names.map((name) => ({ name: wordOf(name), agent: row.names[0] ?? row.id, condition: conditionOf(row) })));
    const ambiguous = ambiguousNames(rows);
    if (names.length === 0 && conditional.length === 0 && ambiguous.length === 0)
        return [];
    const source = text.replace(/\r/g, " ");
    const claims = [];
    for (const run of proseRuns(file, source)) {
        let from = 0;
        for (const sentence of run.text.split(/(?<=[.!?;])\s+/)) {
            const at = run.text.indexOf(sentence, from);
            from = at + sentence.length;
            const blind = names.some((name) => name.test(sentence));
            const flat = sentence.replace(/\s+/g, " ").toLowerCase();
            const unmet = conditional.flatMap((agentNames) => {
                const hit = agentNames.find(({ name }) => name.test(sentence));
                return hit && (hit.condition === "" || !flat.includes(hit.condition.toLowerCase())) ? [hit] : [];
            });
            const bare = ambiguous.filter(({ bare }) => bare.test(sentence));
            if (!blind && unmet.length === 0 && bare.length === 0)
                continue;
            const verb = [...sentence.matchAll(BLOCK_WORDS)].find((m) => !negated(sentence, m.index, m[0]));
            if (!verb)
                continue;
            const line = source.slice(0, run.start + at + verb.index).split("\n").length;
            const claimText = sentence.replace(/\s+/g, " ").trim();
            if (blind)
                claims.push({ file, line, text: claimText });
            for (const { name, surfaces } of bare) {
                claims.push({ file, line, text: claimText, reason: `claims blocking for "${name}", ${surfaces}; name the surface` });
            }
            for (const { agent, condition } of unmet) {
                claims.push({ file, line, text: claimText, reason: `claims blocking for ${agent} without its condition (${condition === "" ? "its Blocks cell names none" : JSON.stringify(condition)})` });
            }
        }
    }
    return claims;
}
/**
 * Blocking claims in the bold lead of each entry under `## [Unreleased]` (up
 * to the next `## ` heading), reported at the lead's own line. No such
 * section, or no lead, gives none.
 */
export function changelogClaims(text, rows = AGENT_SUPPORT) {
    const lines = text.replace(/\r/g, "").split("\n");
    const start = lines.findIndex((line) => /^##\s+\[Unreleased\]/i.test(line));
    if (start === -1)
        return [];
    const next = lines.findIndex((line, i) => i > start && /^##\s/.test(line));
    const end = next === -1 ? lines.length : next;
    const leads = lines.map((line, i) => {
        if (i <= start || i >= end)
            return "";
        const lead = /^\s*[-*+]\s+\*\*(.+?)\*\*/.exec(line)?.[1];
        return lead === undefined ? "" : `- ${lead}`; // kept a list item, so each lead is read on its own
    });
    return findBlockingClaims(CHANGELOG_FILE, leads.join("\n"), rows);
}
/** The text with the body between the markers replaced, or null when the markers are not one ordered pair. */
export function spliceBlock(text, body, startMark = BLOCK_START, endMark = BLOCK_END) {
    const start = text.indexOf(startMark);
    const end = text.indexOf(endMark);
    if (start === -1 || end === -1 || end < start)
        return null;
    if (text.indexOf(startMark, start + 1) !== -1 || text.indexOf(endMark, end + 1) !== -1)
        return null;
    return `${text.slice(0, start + startMark.length)}\n${body}\n${text.slice(end)}`;
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
/**
 * The landing page's Agents block: only the rows that block a destructive
 * command. A roster of names grouped by tier, under the meanings the README
 * map uses, then the tier table inside a disclosure (it stacks one block per
 * agent at every width). The page's install switch reads each agent's command
 * from the table's Install cell.
 */
export function renderTierHtml(rows = AGENT_SUPPORT) {
    const working = rows.filter((row) => blocksPreTool(row));
    const roster = MAP_GROUPS.flatMap(([tier, heading, meaning]) => {
        const group = working.filter((row) => supportTier(row) === tier);
        if (group.length === 0)
            return [];
        return [`          <div><dt><b>${heading}</b><span>${htmlInline(meaning)}</span></dt>${group.map((row) => `<dd>${htmlInline(row.names[0])}</dd>`).join("")}</div>`];
    });
    const body = working.map((row) => [
        `          <tr role="row">`,
        `            <th role="rowheader" scope="row">${htmlInline(row.names[0])}</th>`,
        `            <td role="cell" data-l="Tier"><b>${supportTier(row)}</b>. Blocks: ${htmlInline(row.blocks)}.</td>`,
        `            <td role="cell" data-l="Install">${row.install.map((cmd) => `<code>${htmlInline(cmd)}</code>`).join("<br>then ")}</td>`,
        `            <td role="cell" data-l="Cannot">${htmlInline(row.cannot)}</td>`,
        `          </tr>`,
    ].join("\n"));
    return [
        `      <div class="ex roster">`,
        `        <dl class="tiers">`,
        ...roster,
        `        </dl>`,
        `        <details class="more">`,
        `          <summary>When each one blocks, its install command and what it cannot do</summary>`,
        `          <div class="drawer"><div class="wide">`,
        `      <table class="files agents" role="table" aria-labelledby="h-agents">`,
        `        <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col"><span class="tag">Agent</span></th><th role="columnheader" scope="col"><span class="tag">Tier</span></th><th role="columnheader" scope="col"><span class="tag">Install</span></th><th role="columnheader" scope="col"><span class="tag">Cannot</span></th></tr></thead>`,
        `        <tbody role="rowgroup">`,
        ...body,
        `        </tbody>`,
        `      </table>`,
        `          </div></div>`,
        `        </details>`,
        `      </div>`,
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
        "continuous-improvement is two pillars for coding agents, ambition and discipline. This page is the discipline side, agent by agent: what the guard does there, how saved lessons reach the model, and what the agent cannot do. Nothing here goes beyond what the 2026-11-21 research verified, with the skeptic corrections applied ([plan](plans/2026-11-21-all-agents.md)). The ambition side is the `be-ambitious` skill. `--hooks` copies it with the other skills to every agent in the tier table that reads skills. It is guidance the agent reads, and no hook checks that it was followed.",
        "",
        "## What the tiers mean",
        "",
        "- **full**: the guard blocks a destructive command before it runs, saved lessons reach the model at session start through a hook, and a Stop hook can send the turn back.",
        "- **partial**: the guard blocks, and one of the other two is missing. A surface whose hooks run but whose deny the research could not confirm is partial too, and no blocking is claimed for it.",
        "- **rules only**: the agent has no hook this package can use, so nothing is blocked. It gets the 7 Laws rules file, and the lessons through `ci lessons`.",
        "",
        "The guard is `hooks/gateguard.mjs` (destructive shell commands and blind edits), with `hooks/hook-pack.mjs` (protected-branch pushes, opt-in) and `hooks/config-guard.mjs` (guardrail config edits, opt-in). Lessons come from `hooks/session.mjs`. The Stop gate is `hooks/typecheck-stop.mjs` and `hooks/goal-drift-stop.mjs`, both off or warn-only until you switch them on (`CI_TYPECHECK_GATE=block`, `CI_GOAL_DRIFT_GATE=block`). The goal-drift block reads the reply from a Claude Code transcript, so it is shown to work on Claude Code only. The tool-call log is `bin/observe.mjs` and the MCP server is `bin/mcp-server.mjs`. `lib/hook-io.mjs` writes each answer in the format the agent reads, and OpenCode and Amp run the same hook files through `lib/hook-bridge.mjs`.",
        "",
        "A blind edit is an edit of an existing file that this conversation's tool-call log shows no read of; with no log yet, every edit that names its file passes. A shell command that names the file counts as a read on every hook agent, and so does a file tool whose path key the research documents. Copilot, Devin and Auggie document none for their file-read tools, so a read through `view` never counts and a read through `read` counts only when it names the file as `path`: read the file through the shell, or run the clear command the deny prints. The write tools of Copilot (`edit`, `str_replace_editor`, `create`), Devin (`edit`, `write`, `notebook_edit`), Auggie (`edit`, `write`, `str-replace-editor`, `save-file`) and Junie (`Write`, `Edit`; hooks on its Early Access build) document no path key either: the guard reads `path`, `file_path`, `filePath` and `target_file` for them (unverified; Devin's `notebook_edit` also `notebook_path`), gates the file it finds there like any edit, and denies a write that names a file at none of those keys, log or no log, with the clear command that lets that tool's path-less writes through for the session; config-guard reports such a write too. An `apply_patch` of Devin, Copilot, Cline or Junie (hooks on its Early Access build), or a Droid `ApplyPatch`, whose patch text names no file at `command`, `patch` or `input` gets the same deny (a Codex `apply_patch`, whose key is documented, gets a warning). A Claude-named write tool of another agent is read with that agent's keys too, so a Grok `Write` is gated on `path`, `filePath` and `target_file` as well as `file_path`. Gemini's `save_memory` names no file and always passes. A tool event from another agent that names no session gets that deny for every edit of an existing file.",
        "",
        "\"Blocks\" means the agent stops the tool call when the hook runs and answers deny. An agent that fails open on a hook crash or timeout, or a setting that turns hooks off (Codex trust, Gemini and Qwen folder trust, Devin Restricted Mode, Copilot `disableAllHooks`), lets the call through. `npx -p continuous-improvement ci doctor --agent <id>` shows what an installed agent loaded, using only its own listing commands.",
        "",
        "\"Checked against\" says what a row rests on: captured runs, the installed binary and its bundled docs on the research host, or the vendor docs only.",
        "",
        "## Tier table",
        "",
        renderTierMarkdown(rows),
        "",
        "`--target <id>` without `--hooks` still writes only the rules file. Add `--scope user` to write the agent's user-level config, `--dry-run` to see every write first, `--run` to run the vendor `mcp add` command, and `--fail-closed` to set the agent's fail-closed option where it has one. `npx continuous-improvement install --uninstall --target <id>` removes what `--hooks` recorded. A vendor `mcp add` it did not undo (run without `--run`, or a failed undo) keeps the agent recorded, and its runtime copy kept, until `--uninstall --target <id> --run` undoes it; an undo that fails twice is taken as removed by hand, and the uninstall says so.",
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
/** GitHub's anchor for a heading: lower case, punctuation dropped, spaces to hyphens. */
export function headingAnchor(heading) {
    return heading.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, "").replace(/ /g, "-");
}
/** The README's `--target` cell: the id and any extra flag the install needs, or the plugin for Claude Code. */
function targetCell(row) {
    const id = /--target (\S+)/.exec(row.install[0] ?? "")?.[1];
    if (id === undefined)
        return "plugin, see [Install](#install)";
    const flags = installFlags(row);
    return `\`${id}\`${flags === "" ? "" : ` (add \`${flags}\`)`}`;
}
/**
 * The README tier table: only the rows that block a destructive command. Each
 * row links to its section in the support doc, which keeps the install
 * commands, the follow-up step and what the agent cannot do.
 */
export function renderReadmeTierMarkdown(rows = AGENT_SUPPORT) {
    const lines = [
        "| Agent | `--target` | Tier | Blocks a destructive command | Lessons at session start | MCP server | Setup and limits |",
        "|---|---|---|---|---|---|---|",
        ...rows.filter((row) => blocksPreTool(row)).map((row) => `| ${row.names[0]} | ${targetCell(row)} | ${supportTier(row)} | ${row.blocks} | ${LESSONS[row.lessons]} | ${row.mcp ? "yes" : "no"} | [details](${SUPPORT_DOC}#${headingAnchor(row.names[0])}) |`),
    ];
    return lines.join("\n");
}
// Every block a doc carries between a marker pair. The README and the landing page have two each.
const RENDERED_BLOCKS = [
    { file: "README.md", start: BLOCK_START, end: BLOCK_END, what: "tier table", render: renderReadmeTierMarkdown },
    { file: "docs/landing/index.html", start: BLOCK_START, end: BLOCK_END, what: "tier table", render: renderTierHtml },
    { file: "README.md", start: LOOP_TABLE_START, end: LOOP_TABLE_END, what: "loop table", render: (rows) => renderLoopTableMarkdown(rows) },
    { file: "docs/landing/index.html", start: LOOP_TABLE_START, end: LOOP_TABLE_END, what: "list of loop steps", render: (rows) => renderLoopStepsHtml(rows) },
];
const MAP_GROUPS = [
    ["full", "Full", "blocks, loads lessons at session start, has a Stop gate"],
    ["partial", "Partial", "blocks; session lessons or the Stop gate are missing"],
];
/**
 * assets/readme/agents-map.svg: one chip per row that blocks a destructive
 * command, grouped by tier under the tier's meaning. The chips carry names
 * only; the README table under the map carries each agent's condition.
 */
export function renderAgentMapSvg(rows = AGENT_SUPPORT) {
    const working = rows.filter((row) => blocksPreTool(row));
    const nameSize = 20;
    const chipH = 42;
    const gapX = 10;
    const gapY = 10;
    const body = [];
    let y = PAD;
    for (const [tier, heading, meaning] of MAP_GROUPS) {
        const group = working.filter((row) => supportTier(row) === tier);
        if (group.length === 0)
            continue;
        body.push(richText(PAD, y + 20, 20, "tx", [{ text: `${heading}: `, bold: true }, { text: meaning }]));
        y += 34;
        let x = PAD;
        for (const row of group) {
            const name = row.names[0] ?? row.id;
            const w = Math.ceil(name.length * nameSize * 0.6) + 32;
            if (x + w > IMAGE_WIDTH - PAD) {
                x = PAD;
                y += chipH + gapY;
            }
            body.push(rect(x, y, w, chipH, "ok-bg", 21));
            body.push(text(x + w / 2, y + 28, nameSize, "tx b", name, "middle"));
            x += w + gapX;
        }
        y += chipH + 26;
    }
    for (const line of wrap("When each one blocks: the table below. Every other agent: docs/AGENT-SUPPORT.md", charsFit(IMAGE_WIDTH - 2 * PAD, 18, "sans"))) {
        body.push(text(PAD, y + 4, 18, "mute", line));
        y += 26;
    }
    y += PAD - 12;
    return svgDocument({
        height: y,
        title: "Where the guard blocks a destructive command",
        desc: `${working.length} agents grouped by tier. ${MAP_GROUPS.map(([tier]) => `${tier}: ${working.filter((row) => supportTier(row) === tier).map((row) => `${row.names[0]} (${row.blocks})`).join(", ")}`).join(". ")}.`,
        body,
    });
}
function claimViolation(claim) {
    return `${claim.file}:${claim.line}: ${claim.reason ?? "claims blocking for an agent that cannot block"}: "${claim.text}"`;
}
/** Every violation, as one line each. Empty means pass. */
export function checkAgentMatrix(repoRoot, rows = AGENT_SUPPORT) {
    const out = supportViolations(rows);
    const doc = read(repoRoot, SUPPORT_DOC);
    if (doc === null)
        out.push(`${SUPPORT_DOC}: missing; ${REGENERATE}`);
    else if (doc.replace(/\r\n/g, "\n") !== renderSupportDoc(rows))
        out.push(`${SUPPORT_DOC}: differs from the rows; ${REGENERATE}`);
    const missing = new Set();
    for (const block of RENDERED_BLOCKS) {
        const text = read(repoRoot, block.file);
        if (text === null) {
            if (!missing.has(block.file))
                out.push(`${block.file}: missing`);
            missing.add(block.file);
            continue;
        }
        const want = spliceBlock(text.replace(/\r\n/g, "\n"), block.render(rows), block.start, block.end);
        if (want === null)
            out.push(`${block.file}: needs exactly one ${block.start} ... ${block.end} marker pair`);
        else if (want !== text.replace(/\r\n/g, "\n"))
            out.push(`${block.file}: the ${block.what} differs from the rows; ${REGENERATE}`);
    }
    const map = read(repoRoot, AGENT_MAP_SVG);
    if (map === null)
        out.push(`${AGENT_MAP_SVG}: missing; ${REGENERATE}`);
    else if (map.replace(/\r\n/g, "\n") !== renderAgentMapSvg(rows))
        out.push(`${AGENT_MAP_SVG}: differs from the rows; ${REGENERATE}`);
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
                const blind = rows.filter((row) => !blocksPreTool(row)).flatMap((row) => [row.id, ...row.compat]);
                const extra = (Array.isArray(have.compatibleWith) ? have.compatibleWith : []).filter((id) => blind.includes(id));
                const named = extra.length === 0 ? "" : ` (it lists ${extra.join(", ")}, whose row does not block)`;
                out.push(`${CLOUDPLUGIN}: compatibleWith is not ${JSON.stringify(want.compatibleWith)}${named}; run \`npm run build\``);
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
        for (const claim of findBlockingClaims(file, text, rows))
            out.push(claimViolation(claim));
    }
    const changelog = read(repoRoot, CHANGELOG_FILE);
    if (changelog !== null)
        for (const claim of changelogClaims(changelog, rows))
            out.push(claimViolation(claim));
    return out;
}
/** Rewrite every rendered surface from the rows. Returns the files written. A file without a marker pair is left alone. */
export function writeAgentMatrix(repoRoot, rows = AGENT_SUPPORT) {
    const written = [];
    writeFileSync(join(repoRoot, SUPPORT_DOC), renderSupportDoc(rows));
    written.push(SUPPORT_DOC);
    for (const block of RENDERED_BLOCKS) {
        const text = read(repoRoot, block.file);
        const next = text === null ? null : spliceBlock(text.replace(/\r\n/g, "\n"), block.render(rows), block.start, block.end);
        if (next === null)
            continue;
        writeFileSync(join(repoRoot, block.file), next);
        if (!written.includes(block.file))
            written.push(block.file);
    }
    mkdirSync(dirname(join(repoRoot, AGENT_MAP_SVG)), { recursive: true });
    writeFileSync(join(repoRoot, AGENT_MAP_SVG), renderAgentMapSvg(rows));
    written.push(AGENT_MAP_SVG);
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
        console.log(`OK agent-matrix: ${AGENT_SUPPORT.length} rows; ${SUPPORT_DOC}, the README and landing tier tables and loop blocks, ${AGENT_MAP_SVG} and ${CLOUDPLUGIN} match the rows, and no scanned doc or ${CHANGELOG_FILE} [Unreleased] lead claims blocking for an agent that cannot block, or leaves out a condition or surface.`);
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
