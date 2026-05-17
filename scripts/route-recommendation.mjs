#!/usr/bin/env node
// scripts/route-recommendation.mjs
//
// Route a single recommendation item to its preferred-skill chain + inline
// fallback, using the data-driven routing table in
// `scripts/route-recommendation.routes.json`.
//
// Replaces the 26-row Phase 3 routing table that `proceed-with-the-recommendation`
// would otherwise re-derive every list walk. The skill body cites this script
// once instead of restating the table inline; the routes.json file is the
// programmatic source of truth.
//
// Usage:
//   node scripts/route-recommendation.mjs "<recommendation item>"
//   node scripts/route-recommendation.mjs --json "<recommendation item>"
//   node scripts/route-recommendation.mjs --list           # all rows
//   node scripts/route-recommendation.mjs --list --json    # all rows as JSON
//
// Output (default):
//   Match: <row name>
//   Preferred: <skill1> → <skill2>
//   Fallback: <inline-fallback text>
//   Marker: (Reference behavior — does not require <plugin>.)
//
// Output (--json):
//   { "input": "...", "match": { name, preferred, fallback, marker }, "candidates": [...] }
//
// Cited by:
//   - skills/proceed-with-the-recommendation.md Phase 3 routing table

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { argv, exit, stderr, stdout } from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROUTES_PATH = join(SCRIPT_DIR, "route-recommendation.routes.json");

function loadRoutes() {
  if (!existsSync(ROUTES_PATH)) {
    stderr.write(`routes file not found: ${ROUTES_PATH}\n`);
    exit(3);
  }
  const raw = readFileSync(ROUTES_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.rows)) {
    stderr.write(`routes file is malformed (expected { rows: [...] })\n`);
    exit(3);
  }
  return parsed.rows;
}

function parseArgs() {
  const args = argv.slice(2);
  const out = { json: false, list: false, input: null };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") out.json = true;
    else if (a === "--list") out.list = true;
    else if (a === "-h" || a === "--help") {
      stdout.write(
        "usage: route-recommendation.mjs [--json] <recommendation item>\n" +
          "       route-recommendation.mjs --list [--json]\n",
      );
      exit(0);
    } else {
      positional.push(a);
    }
  }
  if (!out.list) {
    if (positional.length === 0) {
      stderr.write("usage: route-recommendation.mjs [--json] <recommendation item>\n");
      stderr.write("input required: pass the recommendation text as the positional arg\n");
      exit(2);
    }
    out.input = positional.join(" ").trim();
  }
  return out;
}

function compileRow(row) {
  const patterns = Array.isArray(row.patterns) ? row.patterns : [];
  const compiled = [];
  for (const p of patterns) {
    try {
      compiled.push(new RegExp(p, "i"));
    } catch {
      // skip malformed pattern — surface via warning, don't crash
      stderr.write(`warning: bad regex in routes.json (${row.name}): ${p}\n`);
    }
  }
  return { ...row, _compiled: compiled };
}

function matchRow(row, input) {
  for (const re of row._compiled) {
    if (re.test(input)) return true;
  }
  return false;
}

function asciiArrow(preferred) {
  return preferred.join(" -> ");
}

function pretty(matchResult) {
  if (!matchResult.match) {
    return [
      `No routing match for input: "${matchResult.input}"`,
      `ask-operator: this recommendation doesn't fit any known routing row.`,
      `Either pick a row from --list manually, or surface to the operator.`,
      "",
    ].join("\n");
  }
  const m = matchResult.match;
  const lines = [
    `Match: ${m.name}`,
    `Preferred: ${asciiArrow(m.preferred)}`,
    `Fallback: ${m.fallback}`,
  ];
  if (m.marker) {
    lines.push(`Marker: (Reference behavior — does not require ${m.marker}.)`);
  }
  if (matchResult.candidates.length > 1) {
    lines.push("");
    lines.push(`Other candidates (top match wins):`);
    for (const c of matchResult.candidates.slice(1, 4)) {
      lines.push(`  - ${c.name}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function main() {
  const args = parseArgs();
  const rawRows = loadRoutes();
  const rows = rawRows.map(compileRow);

  if (args.list) {
    if (args.json) {
      const stripped = rows.map(({ _compiled, ...row }) => row);
      stdout.write(JSON.stringify({ rows: stripped }, null, 2) + "\n");
      return;
    }
    for (const row of rows) {
      stdout.write(`- ${row.name}\n`);
      stdout.write(`    preferred: ${asciiArrow(row.preferred)}\n`);
    }
    return;
  }

  const candidates = rows.filter((r) => matchRow(r, args.input));
  const result = {
    input: args.input,
    match: candidates.length > 0 ? stripCompiled(candidates[0]) : null,
    candidates: candidates.map(stripCompiled),
  };

  if (args.json) {
    stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    stdout.write(pretty(result));
  }
  // Surface the ask-operator hint on stderr regardless of mode, so callers
  // that read stderr can detect no-match without re-parsing stdout.
  if (!result.match) {
    stderr.write("ask-operator: no routing row matched the input\n");
  }
}

function stripCompiled(row) {
  const { _compiled, ...rest } = row;
  return rest;
}

main();
