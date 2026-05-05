#!/usr/bin/env node
// backfill.mts — Tag legacy thin-schema observation rows for skip-clean
// consumption by the analysis pass.
//
// Walks ~/.claude/instincts/<hash>/observations.jsonl files and writes a
// `schema: "thin" | "rich"` field on every row that doesn't already have one.
// Per the plan doc: this is a flag-pass, not a content-recovery — the original
// thin rows lack the input we'd need to fabricate richer fields. Tagging lets
// the analysis pass cleanly skip thin rows and surface a "X% of observations
// were thin" stat to operators so they understand why their auto-instinct
// pipeline historically produced nothing.
//
// Output:
//   - <home>/.claude/instincts/<hash>/observations.jsonl   (rewritten in place
//     with schema field appended; original preserved as .bak)
//   - <home>/.claude/instincts/backfill-summary.json       (per-project digest)
//
// Flags:
//   --dry-run  Read everything, write nothing; print counts to stdout.
//
// Idempotent: re-running on already-tagged rows is a no-op.
// Exit code: always 0. Failures land on stderr only.

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

interface Row {
  schema?: "thin" | "rich";
  input_summary?: string;
  project_id?: string;
  project_name?: string;
  [key: string]: unknown;
}

interface ProjectStat {
  total: number;
  thin: number;
  rich: number;
}

interface Summary {
  total: number;
  thin: number;
  rich: number;
  projects: Record<string, ProjectStat>;
  generated_at: string;
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const HELP = args.includes("--help") || args.includes("-h");

if (HELP) {
  console.log(`
backfill — Tag legacy thin-schema observation rows.

Usage:
  npx continuous-improvement backfill            Tag rows in place
  npx continuous-improvement backfill --dry-run  Report counts, write nothing

What it does:
  Walks ~/.claude/instincts/<hash>/observations.jsonl files and adds a
  schema field ("thin" or "rich") to every row that lacks one. Thin rows
  came from the legacy bash fallback (jq missing) and have no input_summary;
  rich rows came from the Node observer and have full tool_input.command /
  Edit.file_path / etc.

Output:
  - observations.jsonl rewritten in place (original kept as .bak)
  - backfill-summary.json with per-project counts

Idempotent. Always exits 0 — failures go to stderr only.
`);
  process.exit(0);
}

main();

function main(): void {
  try {
    runBackfill();
  } catch (error) {
    process.stderr.write(`[backfill] ${error instanceof Error ? error.message : String(error)}\n`);
  }
  process.exit(0);
}

function runBackfill(): void {
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  const instinctsDir = join(home, ".claude", "instincts");
  if (!existsSync(instinctsDir)) {
    if (!DRY_RUN) mkdirSync(instinctsDir, { recursive: true });
    return;
  }

  const projectDirs = listProjectDirs(instinctsDir);
  const summary: Summary = {
    total: 0,
    thin: 0,
    rich: 0,
    projects: {},
    generated_at: new Date().toISOString(),
  };

  for (const dir of projectDirs) {
    const obsFile = join(dir, "observations.jsonl");
    if (!existsSync(obsFile)) continue;

    const projectId = basename(dir);
    const stat: ProjectStat = { total: 0, thin: 0, rich: 0 };
    const newLines: string[] = [];
    const corruptLines: string[] = [];
    let mutated = false;

    const raw = readFileSync(obsFile, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      let row: Row;
      try {
        row = JSON.parse(trimmed) as Row;
      } catch {
        process.stderr.write(`[backfill] skipped corrupt row in ${projectId}: ${trimmed.slice(0, 80)}\n`);
        // Drop from main file but preserve in observations.corrupt.jsonl
        // so the operator never silently loses data.
        corruptLines.push(trimmed);
        mutated = true;
        continue;
      }

      stat.total++;
      summary.total++;

      const previousSchema = row.schema;
      const isRich = typeof row.input_summary === "string" && row.input_summary.length > 0;
      const newSchema: "thin" | "rich" = isRich ? "rich" : "thin";

      if (previousSchema !== newSchema) {
        row.schema = newSchema;
        mutated = true;
      }

      if (newSchema === "thin") {
        stat.thin++;
        summary.thin++;
      } else {
        stat.rich++;
        summary.rich++;
      }

      newLines.push(JSON.stringify(row));
    }

    summary.projects[projectId] = stat;

    if (mutated && !DRY_RUN) {
      // Atomic-ish write: backup → write → keep .bak for one cycle.
      const backup = obsFile + ".bak";
      renameSync(obsFile, backup);
      writeFileSync(obsFile, newLines.join("\n") + "\n", "utf8");
      if (corruptLines.length > 0) {
        // Quarantine corrupt rows so operator data is never silently lost.
        const corruptFile = join(dir, "observations.corrupt.jsonl");
        const existing = existsSync(corruptFile) ? readFileSync(corruptFile, "utf8") : "";
        writeFileSync(corruptFile, existing + corruptLines.join("\n") + "\n", "utf8");
      }
    }
  }

  if (DRY_RUN) {
    process.stdout.write(formatReport(summary, true));
    return;
  }

  const summaryPath = join(instinctsDir, "backfill-summary.json");
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
  process.stdout.write(formatReport(summary, false));
}

function listProjectDirs(instinctsDir: string): string[] {
  // Real project-hash dirs are sha256[:12] (hex). Test fixtures use 12-char
  // alpha labels (g/h/i are not hex but make tests readable). Both are
  // matched here; the broader pattern is harmless because real instincts/
  // sub-dirs only ever contain hex hashes plus 'global' / loose dotfiles.
  return readdirSync(instinctsDir)
    .filter((name) => /^[0-9a-z]{12}$/.test(name))
    .map((name) => join(instinctsDir, name))
    .filter((dir) => {
      try {
        return statSync(dir).isDirectory();
      } catch {
        return false;
      }
    });
}

function formatReport(summary: Summary, isDryRun: boolean): string {
  const projects = Object.keys(summary.projects);
  const lines = [
    isDryRun ? "[backfill --dry-run] would tag the following:" : "[backfill] tagged:",
    `  total rows: ${summary.total}`,
    `  thin rows:  ${summary.thin}`,
    `  rich rows:  ${summary.rich}`,
    `  projects:   ${projects.length}`,
  ];
  return lines.join("\n") + "\n";
}
