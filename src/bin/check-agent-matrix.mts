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
 *     `<!-- agent-matrix:start -->` and `<!-- agent-matrix:end -->`. The
 *     README lists only the rows that block a destructive command (the owner's
 *     2026-11-22 call: the README names the agents it works on); the landing
 *     table and docs/AGENT-SUPPORT.md keep every row.
 *   - assets/readme/agents-map.svg, the README's map of those same rows, is
 *     rendered from them byte for byte.
 *   - .cloudplugin/marketplace.json carries compatibleWith from the rows and
 *     the package.json version (the build writes both).
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
import {
  AGENT_SUPPORT,
  blocksPreTool,
  renderCloudplugin,
  supportTier,
  type AgentSupport,
} from "../lib/agent-support.mjs";
import { IMAGE_WIDTH, PAD, charsFit, rect, svgDocument, text, wrap } from "../lib/readme-svg.mjs";

export const SUPPORT_DOC = "docs/AGENT-SUPPORT.md";
export const CLOUDPLUGIN = ".cloudplugin/marketplace.json";
export const AGENT_MAP_SVG = "assets/readme/agents-map.svg";
export const BLOCK_START = "<!-- agent-matrix:start -->";
export const BLOCK_END = "<!-- agent-matrix:end -->";
export const CLAIM_SCAN_FILES: readonly string[] = ["README.md", "QUICKSTART.md", "llms.txt", SUPPORT_DOC, "docs/landing/index.html"];
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
const HOOK_INSTALLS: ReadonlySet<string> = new Set(["claude", ...HOOK_AGENT_IDS, ...PLUGIN_AGENT_IDS]);

const EVIDENCE: Readonly<Record<AgentSupport["evidence"], string>> = {
  tested: "captured runs",
  local: "installed binary",
  docs: "vendor docs",
};
const LESSONS: Readonly<Record<AgentSupport["lessons"], string>> = {
  hook: "yes",
  "rules file": "rules file",
  none: "no",
};

export interface Claim {
  file: string;
  line: number;
  text: string;
  /** Set when the agent can block but the sentence leaves out its condition, or names two surfaces of which one cannot block. */
  reason?: string;
}

/**
 * The condition a conditional row's Blocks cell names, for prose to repeat:
 * "yes, on the Early Access build" gives "Early Access build". Empty when the
 * cell names none, and then no sentence can satisfy it (fail closed).
 */
function conditionOf(row: AgentSupport): string {
  const match = /^yes,\s*(.*)$/i.exec(row.blocks);
  if (!match) return "";
  return (match[1] ?? "")
    .replace(/^(?:on|in|with|while|after|outside|through|when)\s+/i, "")
    .replace(/^(?:the|a|an)\s+/i, "")
    .trim();
}

interface ConditionalName {
  name: RegExp;
  agent: string;
  condition: string;
}

interface AmbiguousName {
  bare: RegExp;
  name: string;
  surfaces: string;
}

/** A name of a blocking row that a non-blocking row's name extends ("Kiro", "Kiro IDE"), matched only where no longer name follows it. */
function ambiguousNames(rows: readonly AgentSupport[]): AmbiguousName[] {
  const out: AmbiguousName[] = [];
  for (const row of rows.filter((r) => blocksPreTool(r))) {
    for (const name of row.names) {
      const prefix = `${name.toLowerCase()} `;
      const longer = rows.flatMap((other) => other.names.filter((n) => n.toLowerCase().startsWith(prefix)).map((n) => ({ n, other })));
      const blind = longer.filter(({ other }) => !blocksPreTool(other));
      if (blind.length === 0) continue;
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
export function supportViolations(rows: readonly AgentSupport[]): string[] {
  if (rows.length === 0) return ["agent-support: the table has no rows"];
  const out: string[] = [];
  const seen = new Set<string>();
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of rows) {
    const at = `agent-support ${row.id}`;
    if (seen.has(row.id)) out.push(`${at}: duplicate id`);
    seen.add(row.id);
    if (row.variantOf !== undefined) {
      const base = byId.get(row.variantOf);
      if (base === undefined) out.push(`${at}: variant of ${row.variantOf}, which has no row`);
      else if (base.variantOf !== undefined) out.push(`${at}: variant of ${row.variantOf}, which is itself a variant`);
    }
    // Fail closed: only the literal verdict "yes", or "conditional" with the
    // condition in the blocks cell, lets a row claim blocking.
    const claimsBlocking = blocksPreTool(row) || /^yes\b/i.test(row.blocks);
    if (claimsBlocking && row.preToolVerdict === "conditional") {
      if (!/^yes, \S/.test(row.blocks)) out.push(`${at}: the verified matrix rates its pre-tool block conditional, but the blocks cell names no condition ("${row.blocks}")`);
    } else if (claimsBlocking && row.preToolVerdict !== "yes") {
      out.push(`${at}: the verified matrix rates its pre-tool block ${JSON.stringify(row.preToolVerdict)}, but the row claims blocking ("${row.blocks}")`);
    }
    // A partial row is published as "hooks run", so it needs a hook install too.
    if (!blocksPreTool(row) && row.preToolVerdict === "partial" && !HOOK_INSTALLS.has(row.variantOf ?? row.id)) {
      out.push(`${at}: rated partial (its hooks run) but the installer has no hook install for it`);
    }
    if (blocksPreTool(row)) {
      if (!HOOK_INSTALLS.has(row.variantOf ?? row.id)) out.push(`${at}: claims blocking but the installer wires no pre-tool hook for it`);
      if (/^(?:no|not)\b/i.test(row.blocks)) out.push(`${at}: canBlockPreTool is true but the blocks cell says "${row.blocks}"`);
    } else if (row.blocks !== "no" && !/^not claimed\b/.test(row.blocks)) {
      out.push(`${at}: canBlockPreTool is not true but the blocks cell says "${row.blocks}"`);
    }
    if (row.install.length === 0 || row.install.some((cmd) => cmd.trim() === "")) out.push(`${at}: no install command`);
    for (const cell of [...row.names, row.blocks, ...row.install, row.then, row.cannot, row.source]) {
      if (cell.includes("|")) out.push(`${at}: a cell contains "|", which breaks the Markdown table`);
      if (/[\r\n]/.test(cell)) out.push(`${at}: a cell contains a newline`);
    }
  }
  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Same length as the input, so offsets still point into the source: tags, &nbsp; and the Stop event name become spaces. */
function blankMarkup(text: string): string {
  const blank = (match: string): string => " ".repeat(match.length);
  return text.replace(/<[^>]*>/g, blank).replace(/&nbsp;/g, blank).replace(STOP_EVENT, blank);
}

interface Run {
  start: number;
  text: string;
}

/** Markdown runs: a paragraph or list item is one run, and a table row, heading or fence line stands alone. */
function markdownRuns(text: string): Run[] {
  const runs: Run[] = [];
  let run: { start: number; end: number } | null = null;
  const close = (): void => {
    if (run) runs.push({ start: run.start, text: text.slice(run.start, run.end) });
    run = null;
  };
  let offset = 0;
  for (const line of text.split("\n")) {
    const end = offset + line.length;
    if (line.trim() === "") close();
    else if (MD_STANDALONE.test(line)) {
      close();
      runs.push({ start: offset, text: line });
    } else {
      if (MD_ITEM.test(line)) close();
      if (run) run.end = end;
      else run = { start: offset, end };
    }
    offset = end + 1;
  }
  close();
  return runs;
}

/** Runs of prose that are read as one, cut again at HTML block tags; markup is blanked in place. */
function proseRuns(file: string, text: string): Run[] {
  const runs = file.endsWith(".html") ? [{ start: 0, text }] : markdownRuns(text);
  return runs.flatMap((run) => {
    const pieces: Run[] = [];
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
function negated(sentence: string, at: number, verb: string): boolean {
  const clauses = sentence.slice(0, at).split(CLAUSE_BREAK);
  const before = (clauses[clauses.length - 1] ?? "").trim().split(/\s+/).slice(-NEGATION_REACH);
  if (before.some((word) => NEGATION.test(word))) return true;
  return /^[^,;.]*:\s*(?:no|none|never|not)\b(?!\s+(?:just|only)\b)/i.test(sentence.slice(at + verb.length));
}

/**
 * Sentences that name an agent whose row cannot block (anything but a literal
 * true) together with a blocking verb that no negation governs. A sentence is
 * read whole across wrapped lines; the line reported is the verb's.
 */
export function findBlockingClaims(file: string, text: string, rows: readonly AgentSupport[] = AGENT_SUPPORT): Claim[] {
  const wordOf = (name: string): RegExp => new RegExp(`\\b${escapeRegExp(name)}\\b`, "i");
  const names = rows
    .filter((row) => !blocksPreTool(row))
    .flatMap((row) => row.names)
    .map(wordOf);
  const conditional: ConditionalName[][] = rows
    .filter((row) => blocksPreTool(row) && row.preToolVerdict === "conditional")
    .map((row) => row.names.map((name) => ({ name: wordOf(name), agent: row.names[0] ?? row.id, condition: conditionOf(row) })));
  const ambiguous = ambiguousNames(rows);
  if (names.length === 0 && conditional.length === 0 && ambiguous.length === 0) return [];
  const source = text.replace(/\r/g, " ");
  const claims: Claim[] = [];
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
      if (!blind && unmet.length === 0 && bare.length === 0) continue;
      const verb = [...sentence.matchAll(BLOCK_WORDS)].find((m) => !negated(sentence, m.index, m[0]));
      if (!verb) continue;
      const line = source.slice(0, run.start + at + verb.index).split("\n").length;
      const claimText = sentence.replace(/\s+/g, " ").trim();
      if (blind) claims.push({ file, line, text: claimText });
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
export function changelogClaims(text: string, rows: readonly AgentSupport[] = AGENT_SUPPORT): Claim[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const start = lines.findIndex((line) => /^##\s+\[Unreleased\]/i.test(line));
  if (start === -1) return [];
  const next = lines.findIndex((line, i) => i > start && /^##\s/.test(line));
  const end = next === -1 ? lines.length : next;
  const leads = lines.map((line, i) => {
    if (i <= start || i >= end) return "";
    const lead = /^\s*[-*+]\s+\*\*(.+?)\*\*/.exec(line)?.[1];
    return lead === undefined ? "" : `- ${lead}`; // kept a list item, so each lead is read on its own
  });
  return findBlockingClaims(CHANGELOG_FILE, leads.join("\n"), rows);
}

/** The text with the body between the markers replaced, or null when the markers are not one ordered pair. */
export function spliceBlock(text: string, body: string): string | null {
  const start = text.indexOf(BLOCK_START);
  const end = text.indexOf(BLOCK_END);
  if (start === -1 || end === -1 || end < start) return null;
  if (text.indexOf(BLOCK_START, start + 1) !== -1 || text.indexOf(BLOCK_END, end + 1) !== -1) return null;
  return `${text.slice(0, start + BLOCK_START.length)}\n${body}\n${text.slice(end)}`;
}

function installCell(row: AgentSupport): string {
  return row.install.map((cmd) => `\`${cmd}\``).join(", then ");
}

/** The tier table, Markdown. */
export function renderTierMarkdown(rows: readonly AgentSupport[] = AGENT_SUPPORT): string {
  const lines = [
    "| Agent | Tier | Blocks a destructive command | Lessons at session start | Install | Cannot |",
    "|---|---|---|---|---|---|",
    ...rows.map((row) =>
      `| ${row.names[0]} | ${supportTier(row)} | ${row.blocks} | ${LESSONS[row.lessons]} | ${installCell(row)} | ${row.cannot} |`),
  ];
  return lines.join("\n");
}

function htmlInline(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** The tier table, HTML for the landing page (stacks like the files table on narrow screens). */
export function renderTierHtml(rows: readonly AgentSupport[] = AGENT_SUPPORT): string {
  const body = rows.map((row) => [
    `          <tr role="row">`,
    `            <th role="rowheader" scope="row">${htmlInline(row.names[0]!)}</th>`,
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
export function renderSupportDoc(rows: readonly AgentSupport[] = AGENT_SUPPORT): string {
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
    "continuous-improvement is guardrails for coding agents. This page is the promise for each agent: what the guard does there, how saved lessons reach the model, and what the agent cannot do. Nothing here goes beyond what the 2026-11-21 research verified, with the skeptic corrections applied ([plan](plans/2026-11-21-all-agents.md)).",
    "",
    "## What the tiers mean",
    "",
    "- **full**: the guard blocks a destructive command before it runs, saved lessons reach the model at session start through a hook, and a Stop hook can send the turn back.",
    "- **partial**: the guard blocks, and one of the other two is missing. A surface whose hooks run but whose deny the research could not confirm is partial too, and no blocking is claimed for it.",
    "- **rules only**: the agent has no hook this package can use, so nothing is blocked. It gets the 7 Laws rules file, and the lessons through `ci lessons`.",
    "",
    "The guard is `hooks/gateguard.mjs` (destructive shell commands and blind edits), with `hooks/hook-pack.mjs` (protected-branch pushes, opt-in) and `hooks/config-guard.mjs` (guardrail config edits, opt-in). Lessons come from `hooks/session.mjs`. The Stop gate is `hooks/typecheck-stop.mjs` and `hooks/goal-drift-stop.mjs`, both off or warn-only until you switch them on (`CI_TYPECHECK_GATE=block`, `CI_GOAL_DRIFT_GATE=block`). The tool-call log is `bin/observe.mjs` and the MCP server is `bin/mcp-server.mjs`. `lib/hook-io.mjs` writes each answer in the format the agent reads, and OpenCode and Amp run the same hook files through `lib/hook-bridge.mjs`.",
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

function read(repoRoot: string, rel: string): string | null {
  try {
    return readFileSync(join(repoRoot, rel), "utf8");
  } catch {
    return null;
  }
}

function packageVersion(repoRoot: string): string | null {
  const text = read(repoRoot, "package.json");
  if (text === null) return null;
  try {
    const version = (JSON.parse(text) as { version?: unknown }).version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/** The README tier table: only the rows that block a destructive command. */
export function renderReadmeTierMarkdown(rows: readonly AgentSupport[] = AGENT_SUPPORT): string {
  return renderTierMarkdown(rows.filter((row) => blocksPreTool(row)));
}

const BLOCK_RENDERERS: ReadonlyArray<readonly [string, (rows: readonly AgentSupport[]) => string]> = [
  ["README.md", renderReadmeTierMarkdown],
  ["docs/landing/index.html", renderTierHtml],
];

const MAP_GROUPS: ReadonlyArray<readonly [ReturnType<typeof supportTier>, string]> = [
  ["full", "Full: blocks, loads lessons at session start, has a Stop gate"],
  ["partial", "Partial: blocks; session lessons or the Stop gate are missing"],
];

/**
 * assets/readme/agents-map.svg: one tile per row that blocks a destructive
 * command, grouped by tier, each with its Blocks cell verbatim as the
 * condition. A conditional row (Junie) gets the warning color.
 */
export function renderAgentMapSvg(rows: readonly AgentSupport[] = AGENT_SUPPORT): string {
  const working = rows.filter((row) => blocksPreTool(row));
  const gap = 16;
  const colW = (IMAGE_WIDTH - 2 * PAD - gap) / 2;
  const inner = colW - 34;
  const nameSize = 21;
  const condSize = 19;
  const condLine = 25;
  const body: string[] = [];
  let y = PAD + 26;
  body.push(text(PAD, y, 26, "tx b", "Where the guard blocks a destructive command"));
  y += 32;
  for (const line of wrap(`${working.length} agents, one hook file: hooks/gateguard.mjs. Each tile shows that agent's Blocks cell from src/lib/agent-support.mts.`, charsFit(IMAGE_WIDTH - 2 * PAD, 18, "sans"))) {
    body.push(text(PAD, y, 18, "mute", line));
    y += 24;
  }
  for (const [tier, heading] of MAP_GROUPS) {
    const group = working.filter((row) => supportTier(row) === tier);
    if (group.length === 0) continue;
    y += 14;
    body.push(text(PAD, y + 20, 20, "tx b", heading));
    y += 34;
    for (let i = 0; i < group.length; i += 2) {
      const pair = group.slice(i, i + 2).map((row) => ({ row, lines: wrap(row.blocks, charsFit(inner, condSize, "sans")) }));
      const h = 22 + nameSize + Math.max(...pair.map((p) => p.lines.length)) * condLine;
      pair.forEach(({ row, lines }, col) => {
        const x = PAD + col * (colW + gap);
        const tone = row.preToolVerdict === "conditional" ? "warn" : "ok";
        body.push(rect(x, y, colW, h, "panel"));
        body.push(rect(x, y, 6, h, `${tone}-bg`, 3));
        body.push(text(x + 20, y + 10 + nameSize, nameSize, "tx b", row.names[0] ?? row.id));
        lines.forEach((line, n) => body.push(text(x + 20, y + 10 + nameSize + condLine * (n + 1) - 2, condSize, tone, line)));
      });
      y += h + 12;
    }
  }
  y += 10;
  body.push(text(PAD, y + 14, 17, "mute", "Every row, including agents where nothing is blocked: docs/AGENT-SUPPORT.md"));
  y += 14 + PAD;
  return svgDocument({
    height: y,
    title: "Where the guard blocks a destructive command",
    desc: `${working.length} agents grouped by tier. ${MAP_GROUPS.map(([tier]) => `${tier}: ${working.filter((row) => supportTier(row) === tier).map((row) => `${row.names[0]} (${row.blocks})`).join(", ")}`).join(". ")}.`,
    body,
  });
}

function claimViolation(claim: Claim): string {
  return `${claim.file}:${claim.line}: ${claim.reason ?? "claims blocking for an agent that cannot block"}: "${claim.text}"`;
}

/** Every violation, as one line each. Empty means pass. */
export function checkAgentMatrix(repoRoot: string, rows: readonly AgentSupport[] = AGENT_SUPPORT): string[] {
  const out = supportViolations(rows);

  const doc = read(repoRoot, SUPPORT_DOC);
  if (doc === null) out.push(`${SUPPORT_DOC}: missing; ${REGENERATE}`);
  else if (doc.replace(/\r\n/g, "\n") !== renderSupportDoc(rows)) out.push(`${SUPPORT_DOC}: differs from the rows; ${REGENERATE}`);

  for (const [file, render] of BLOCK_RENDERERS) {
    const text = read(repoRoot, file);
    if (text === null) {
      out.push(`${file}: missing`);
      continue;
    }
    const want = spliceBlock(text.replace(/\r\n/g, "\n"), render(rows));
    if (want === null) out.push(`${file}: needs exactly one ${BLOCK_START} ... ${BLOCK_END} marker pair`);
    else if (want !== text.replace(/\r\n/g, "\n")) out.push(`${file}: the tier table differs from the rows; ${REGENERATE}`);
  }

  const map = read(repoRoot, AGENT_MAP_SVG);
  if (map === null) out.push(`${AGENT_MAP_SVG}: missing; ${REGENERATE}`);
  else if (map.replace(/\r\n/g, "\n") !== renderAgentMapSvg(rows)) out.push(`${AGENT_MAP_SVG}: differs from the rows; ${REGENERATE}`);

  const version = packageVersion(repoRoot);
  const manifest = read(repoRoot, CLOUDPLUGIN);
  if (version === null) out.push("package.json: missing or has no version");
  if (manifest === null) out.push(`${CLOUDPLUGIN}: missing`);
  if (version !== null && manifest !== null) {
    try {
      const have = JSON.parse(manifest) as { version?: unknown; compatibleWith?: unknown };
      const want = JSON.parse(renderCloudplugin(manifest, version, rows)) as { compatibleWith: string[] };
      if (have.version !== version) out.push(`${CLOUDPLUGIN}: version ${String(have.version)} is not the package version ${version}; run \`npm run build\``);
      if (JSON.stringify(have.compatibleWith) !== JSON.stringify(want.compatibleWith)) {
        out.push(`${CLOUDPLUGIN}: compatibleWith is not ${JSON.stringify(want.compatibleWith)}; run \`npm run build\``);
      }
    } catch (error) {
      out.push(`${CLOUDPLUGIN}: ${(error as Error).message}`);
    }
  }

  for (const file of CLAIM_SCAN_FILES) {
    const text = read(repoRoot, file);
    if (text === null) {
      if (file !== SUPPORT_DOC) out.push(`${file}: missing, so its claims cannot be checked`);
      continue;
    }
    for (const claim of findBlockingClaims(file, text, rows)) out.push(claimViolation(claim));
  }
  const changelog = read(repoRoot, CHANGELOG_FILE);
  if (changelog !== null) for (const claim of changelogClaims(changelog, rows)) out.push(claimViolation(claim));
  return out;
}

/** Rewrite every rendered surface from the rows. Returns the files written. A file without a marker pair is left alone. */
export function writeAgentMatrix(repoRoot: string, rows: readonly AgentSupport[] = AGENT_SUPPORT): string[] {
  const written: string[] = [];
  writeFileSync(join(repoRoot, SUPPORT_DOC), renderSupportDoc(rows));
  written.push(SUPPORT_DOC);
  for (const [file, render] of BLOCK_RENDERERS) {
    const text = read(repoRoot, file);
    const next = text === null ? null : spliceBlock(text.replace(/\r\n/g, "\n"), render(rows));
    if (next === null) continue;
    writeFileSync(join(repoRoot, file), next);
    written.push(file);
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

function main(): void {
  const args = argv.slice(2);
  const write = args.includes("--write");
  const repoRoot = args.find((arg) => arg !== "--write") ?? cwd();
  if (write) {
    for (const file of writeAgentMatrix(repoRoot)) console.log(`wrote ${file}`);
  }
  const violations = checkAgentMatrix(repoRoot);
  if (violations.length === 0) {
    console.log(`OK agent-matrix: ${AGENT_SUPPORT.length} rows; ${SUPPORT_DOC}, the README and landing tier tables, ${AGENT_MAP_SVG} and ${CLOUDPLUGIN} match the rows, and no scanned doc or ${CHANGELOG_FILE} [Unreleased] lead claims blocking for an agent that cannot block, or leaves out a condition or surface.`);
    exit(0);
  }
  console.error(`FAIL agent-matrix: ${violations.length} violation(s).\n`);
  for (const v of violations) console.error(`  ${v}`);
  exit(1);
}

const invokedDirectly = argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("check-agent-matrix.mjs")) {
  main();
}
