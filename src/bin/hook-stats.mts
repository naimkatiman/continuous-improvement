#!/usr/bin/env node

/**
 * Hook Stats Reader
 *
 * Reads JSONL telemetry written by Claude Code Stop hooks (e.g. the
 * three-section-close hook) from `<HOME>/.claude/hook-telemetry/*.jsonl`
 * and prints per-hook aggregate counts over a recent time window.
 *
 * Each input line is JSON of the shape:
 *   {
 *     "ts": "<ISO timestamp>",
 *     "hook": "<hook-name>",
 *     "action": "pass" | "block" | "skip-short",
 *     "textLength": <number>,
 *     "missing": <string[]>,
 *     "durationMs": <number>
 *   }
 *
 * The reader is parse-tolerant: malformed lines are skipped silently so
 * the CLI keeps working even when the hook has been crash-restarted mid
 * append. The hook itself is fail-open; the reader matches that posture.
 *
 * Project hash:
 *   The hook keys telemetry files by a 12-char sha256 prefix of the
 *   *project* directory (the dir containing the transcript). For the CLI,
 *   the "project" is the current working directory: we normalize path
 *   separators to forward slash, lowercase on win32, then sha256 and
 *   slice the first 12 hex chars. Pass `--hash=<value>` to override.
 *
 * Usage:
 *   node bin/hook-stats.mjs [--hours=<n>] [--hash=<hash>] [--telemetry-dir=<path>]
 *   node bin/hook-stats.mjs --help
 *
 * Defaults:
 *   --hours          24
 *   --hash           sha256(normalize(process.cwd())).slice(0, 12)
 *   --telemetry-dir  <HOME>/.claude/hook-telemetry
 *
 * Exit codes:
 *   0 — printed aggregate (or "no records" message)
 *   1 — unexpected error
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { argv, cwd, env, exit, stderr, stdout } from "node:process";

interface CliOptions {
  hours: number;
  hash: string | null;
  telemetryDir: string | null;
  help: boolean;
}

interface TelemetryRecord {
  ts: string;
  hook: string;
  action: string;
  textLength?: number;
  missing?: string[];
  durationMs?: number;
}

interface HookAggregate {
  hook: string;
  pass: number;
  block: number;
  skipShort: number;
  total: number;
  durationSum: number;
  durationCount: number;
}

const USAGE = `Usage: node bin/hook-stats.mjs [options]

Reads JSONL telemetry from <HOME>/.claude/hook-telemetry/*.jsonl and
prints per-hook aggregate counts over a recent time window.

Options:
  --hours=<n>            Time window in hours (default: 24)
  --hash=<hash>          Only read this single <hash>.jsonl file
                         (default: sha256 of the current working directory,
                         normalized to forward slashes and lowercased on
                         Windows, then first 12 hex chars)
  --telemetry-dir=<path> Override telemetry dir
                         (default: <HOME>/.claude/hook-telemetry)
  --help                 Show this help and exit 0

Output:
  One line per hook: "<hook> last <hours>h: pass=<n> block=<n>
  skip-short=<n> total=<n> avg-duration=<X>ms".
  If there are no records in the window: "no records in last <hours>h".

The reader is parse-tolerant: malformed JSONL lines are skipped silently.
`;

function parseArgs(rawArgs: readonly string[]): CliOptions {
  const opts: CliOptions = {
    hours: 24,
    hash: null,
    telemetryDir: null,
    help: false,
  };
  for (const arg of rawArgs) {
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
      continue;
    }
    if (arg.startsWith("--hours=")) {
      const raw = arg.slice("--hours=".length);
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`invalid --hours value: ${raw}`);
      }
      opts.hours = n;
      continue;
    }
    if (arg.startsWith("--hash=")) {
      opts.hash = arg.slice("--hash=".length);
      continue;
    }
    if (arg.startsWith("--telemetry-dir=")) {
      opts.telemetryDir = arg.slice("--telemetry-dir=".length);
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

function resolveHomeDir(): string {
  // Mirrors the hook: explicit opt-out requires BOTH env vars empty.
  // OR-semantic would silently disable the CLI when a shell happened to
  // clear one variable while the other still pointed at a valid path.
  const home = env.HOME;
  const userProfile = env.USERPROFILE;
  if (home === "" && userProfile === "") return "";
  if (home) return home;
  if (userProfile) return userProfile;
  try {
    const fromOs = homedir();
    if (fromOs) return fromOs;
  } catch {
    // ignore
  }
  return "";
}

export function projectHashForCwd(workingDir: string): string {
  let normalized = workingDir.split("\\").join("/");
  if (platform() === "win32") normalized = normalized.toLowerCase();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}

function listJsonlFiles(dir: string, hashFilter: string | null): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of entries) {
    if (!name.endsWith(".jsonl")) continue;
    if (hashFilter !== null) {
      if (name !== `${hashFilter}.jsonl`) continue;
    }
    const full = join(dir, name);
    try {
      const stat = statSync(full);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }
    out.push(full);
  }
  return out;
}

function safeJsonParse(line: string): TelemetryRecord | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { hook?: unknown }).hook === "string" &&
      typeof (parsed as { ts?: unknown }).ts === "string" &&
      typeof (parsed as { action?: unknown }).action === "string"
    ) {
      return parsed as TelemetryRecord;
    }
    return null;
  } catch {
    return null;
  }
}

export function aggregate(
  records: readonly TelemetryRecord[],
  cutoffMs: number,
): HookAggregate[] {
  const byHook = new Map<string, HookAggregate>();
  for (const rec of records) {
    const tsMs = Date.parse(rec.ts);
    if (!Number.isFinite(tsMs)) continue;
    if (tsMs < cutoffMs) continue;
    let agg = byHook.get(rec.hook);
    if (!agg) {
      agg = {
        hook: rec.hook,
        pass: 0,
        block: 0,
        skipShort: 0,
        total: 0,
        durationSum: 0,
        durationCount: 0,
      };
      byHook.set(rec.hook, agg);
    }
    agg.total += 1;
    if (rec.action === "pass") agg.pass += 1;
    else if (rec.action === "block") agg.block += 1;
    else if (rec.action === "skip-short") agg.skipShort += 1;
    if (typeof rec.durationMs === "number" && Number.isFinite(rec.durationMs)) {
      agg.durationSum += rec.durationMs;
      agg.durationCount += 1;
    }
  }
  return Array.from(byHook.values()).sort((a, b) =>
    a.hook.localeCompare(b.hook),
  );
}

function formatAggregate(agg: HookAggregate, hours: number): string {
  const avg =
    agg.durationCount > 0
      ? Math.round(agg.durationSum / agg.durationCount)
      : 0;
  return `${agg.hook} last ${hours}h: pass=${agg.pass} block=${agg.block} skip-short=${agg.skipShort} total=${agg.total} avg-duration=${avg}ms`;
}

function main(): void {
  const opts = parseArgs(argv.slice(2));
  if (opts.help) {
    stdout.write(USAGE);
    exit(0);
  }

  let telemetryDir: string;
  if (opts.telemetryDir !== null) {
    telemetryDir = opts.telemetryDir;
  } else {
    const home = resolveHomeDir();
    if (!home) {
      stderr.write("no telemetry dir resolved\n");
      exit(0);
    }
    telemetryDir = join(home, ".claude", "hook-telemetry");
  }

  const hashFilter = opts.hash ?? projectHashForCwd(cwd());
  // When the user did not pass --hash, we still read all files (per spec).
  // Only restrict to a single file when --hash is explicitly set.
  const useHashFilter = opts.hash !== null;
  const files = listJsonlFiles(
    telemetryDir,
    useHashFilter ? hashFilter : null,
  );

  const records: TelemetryRecord[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const rec = safeJsonParse(line);
      if (rec) records.push(rec);
    }
  }

  const cutoffMs = Date.now() - opts.hours * 3600 * 1000;
  const aggregates = aggregate(records, cutoffMs);

  if (aggregates.length === 0) {
    stdout.write(`no records in last ${opts.hours}h\n`);
    exit(0);
  }

  for (const agg of aggregates) {
    stdout.write(formatAggregate(agg, opts.hours) + "\n");
  }
  exit(0);
}

const invokedDirectly =
  argv[1] !== undefined && import.meta.url.endsWith(argv[1].split("\\").join("/"));
if (invokedDirectly || argv[1]?.endsWith("hook-stats.mjs")) {
  try {
    main();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stderr.write(`${message}\n`);
    exit(1);
  }
}
