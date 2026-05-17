#!/usr/bin/env node
// scripts/scan-past-mistakes.mjs
//
// Scan the three past-mistake surfaces named in Phase 0 P-MAG of
// `proceed-with-the-recommendation` and surface their content as a
// machine-readable list, so the skill's most-skipped phase becomes
// mechanically detectable: if the scan never runs, no output is emitted.
//
// Surfaces (all three are scanned every invocation):
//   1. observations.jsonl  — JSONL lines whose type (or legacy event field)
//      is "failure" or "correction". Last N (default 10) returned.
//   2. memory feedback     — every feedback_*.md file in the project's
//      auto-memory directory whose frontmatter declares `type: feedback`.
//   3. CLAUDE.md           — rows extracted from a "## Past Mistakes" table
//      in the project's CLAUDE.md (markdown table, first column = date).
//
// Defaults derive each path from the project root (positional arg; default
// cwd). All three can be overridden explicitly via flags for testing or
// non-default layouts.
//
// Usage:
//   node scripts/scan-past-mistakes.mjs                       # cwd default
//   node scripts/scan-past-mistakes.mjs <repo-root>           # explicit root
//   node scripts/scan-past-mistakes.mjs --json                # JSON output
//   node scripts/scan-past-mistakes.mjs \
//     --observations <path> --memory-dir <dir> --claude-md <path>
//   node scripts/scan-past-mistakes.mjs --max-observations 25
//
// Active-in-scope assessment is the LLM's job, not the script's. The script
// surfaces raw entries with citations; the skill body annotates each line
// with "Active in current scope: yes|no" based on the current task.
//
// Cited by:
//   - skills/proceed-with-the-recommendation.md Phase 0 Rule 1

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { argv, cwd, exit, stdout } from "node:process";

function parseArgs() {
  const args = argv.slice(2);
  const out = {
    json: false,
    root: cwd(),
    observations: null,
    memoryDir: null,
    claudeMd: null,
    maxObservations: 10,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") {
      out.json = true;
    } else if (a === "--observations") {
      out.observations = args[++i];
    } else if (a === "--memory-dir") {
      out.memoryDir = args[++i];
    } else if (a === "--claude-md") {
      out.claudeMd = args[++i];
    } else if (a === "--max-observations") {
      out.maxObservations = parseInt(args[++i], 10) || 10;
    } else if (a === "-h" || a === "--help") {
      stdout.write(
        "usage: scan-past-mistakes.mjs [--json] [<repo-root>]\n" +
          "       [--observations <path>] [--memory-dir <dir>] [--claude-md <path>]\n" +
          "       [--max-observations <n>]\n",
      );
      exit(0);
    } else {
      out.root = a;
    }
  }
  return out;
}

// Map a project root to the auto-memory subdirectory name. Lowercases the
// Windows drive letter and replaces path separators with dashes, matching
// the convention used by `~/.claude/projects/<hash>/memory/` and
// `~/.claude/instincts/<hash>/`. On POSIX paths the leading slash becomes
// a leading dash, which is fine — the host has the same path on both
// surfaces and the resolved file existence is what's checked, not the
// hash format itself.
function projectHash(root) {
  let p = root;
  p = p.replace(/^([A-Za-z]):/, (_m, d) => d.toLowerCase() + ":");
  p = p.replace(/:[\\/]/, "--");
  p = p.replace(/[\\/]/g, "-");
  return p;
}

function defaultObservationsPath(root) {
  return join(homedir(), ".claude", "instincts", projectHash(root), "observations.jsonl");
}

function defaultMemoryDir(root) {
  return join(homedir(), ".claude", "projects", projectHash(root), "memory");
}

function defaultClaudeMdPath(root) {
  return join(root, "CLAUDE.md");
}

function scanObservations(path, maxN) {
  if (!path || !existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/);
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    // Support both the current `type` field and the legacy `event` field
    // (per feedback_observer_field_name_bug — pre-2026-05-06T00:38Z rows).
    const t = obj.type ?? obj.event;
    if (t !== "failure" && t !== "correction") continue;
    const summary =
      obj.summary ??
      obj.output_summary ??
      (typeof obj.tool_response === "string"
        ? obj.tool_response
        : JSON.stringify(obj).slice(0, 240));
    matches.push({
      line: i + 1,
      ts: obj.ts ?? obj.timestamp ?? null,
      type: t,
      summary,
    });
  }
  // Last N (chronologically — JSONL is append-only).
  return matches.slice(-maxN);
}

function parseFrontmatter(content) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fm[kv[1]] = value;
  }
  return fm;
}

function scanFeedbackMemories(dir) {
  if (!dir || !existsSync(dir)) return [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const file of entries) {
    if (!file.startsWith("feedback_") || !file.endsWith(".md")) continue;
    let content;
    try {
      content = readFileSync(join(dir, file), "utf8");
    } catch {
      continue;
    }
    const fm = parseFrontmatter(content);
    if (!fm) continue;
    // Only surface entries explicitly typed as feedback.
    if (fm.type && fm.type !== "feedback") continue;
    out.push({
      file,
      name: fm.name ?? null,
      description: fm.description ?? null,
    });
  }
  out.sort((a, b) => a.file.localeCompare(b.file));
  return out;
}

function scanClaudeMdPastMistakes(path) {
  if (!path || !existsSync(path)) return [];
  const content = readFileSync(path, "utf8");
  const headingIdx = content.search(/^##\s+Past Mistakes\s*$/m);
  if (headingIdx === -1) return [];

  // Slice from the heading to the start of the next ## heading (or EOF).
  const fromHeading = content.slice(headingIdx);
  const nextSectionRel = fromHeading.slice(2).search(/^##\s/m);
  const section = nextSectionRel === -1 ? fromHeading : fromHeading.slice(0, nextSectionRel + 2);

  const out = [];
  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trim();
    // Skip blank, heading, and the markdown table divider.
    if (!line || line.startsWith("#")) continue;
    if (/^\|[\s|:-]+\|$/.test(line)) continue;
    if (!line.startsWith("|") || !line.endsWith("|")) continue;

    // Parse pipe-delimited cells; strip leading/trailing pipe.
    const inner = line.slice(1, -1);
    const cells = inner.split("|").map((c) => c.trim());
    if (cells.length < 2) continue;

    // Header detection: literal "Date" first cell.
    if (cells[0].toLowerCase() === "date") continue;
    if (/^[-: ]+$/.test(cells[0])) continue;

    out.push({
      date: cells[0],
      mistake: cells[1] ?? "",
      lesson: cells[2] ?? null,
    });
  }
  return out;
}

function pretty(scan) {
  const total = scan.observations.length + scan.feedback.length + scan.claude_md.length;
  if (total === 0) return "No prior mistakes recorded — proceed.\n";

  const out = [`Past mistakes scanned: ${total} found across 3 surfaces.`, ""];

  if (scan.observations.length > 0) {
    out.push(`== observations.jsonl (${scan.observations.length}) ==`);
    for (const o of scan.observations) {
      const ts = o.ts ? `${o.ts} ` : "";
      out.push(`  [line ${o.line}] ${ts}${o.type}: ${o.summary}`);
    }
    out.push("");
  }

  if (scan.feedback.length > 0) {
    out.push(`== feedback memories (${scan.feedback.length}) ==`);
    for (const f of scan.feedback) {
      out.push(`  [${f.file}] ${f.name ?? ""}`);
      if (f.description) out.push(`    — ${f.description}`);
    }
    out.push("");
  }

  if (scan.claude_md.length > 0) {
    out.push(`== CLAUDE.md Past Mistakes (${scan.claude_md.length}) ==`);
    for (const e of scan.claude_md) {
      out.push(`  [${e.date}] ${e.mistake}`);
      if (e.lesson) out.push(`    Lesson: ${e.lesson}`);
    }
  }

  return out.join("\n") + "\n";
}

function main() {
  const args = parseArgs();
  const obsPath = args.observations ?? defaultObservationsPath(args.root);
  const memDir = args.memoryDir ?? defaultMemoryDir(args.root);
  const claudeMd = args.claudeMd ?? defaultClaudeMdPath(args.root);

  const scan = {
    observations: scanObservations(obsPath, args.maxObservations),
    feedback: scanFeedbackMemories(memDir),
    claude_md: scanClaudeMdPastMistakes(claudeMd),
    sources: {
      observations: obsPath,
      memory_dir: memDir,
      claude_md: claudeMd,
    },
  };

  if (args.json) {
    stdout.write(JSON.stringify(scan, null, 2) + "\n");
  } else {
    stdout.write(pretty(scan));
  }
}

main();
