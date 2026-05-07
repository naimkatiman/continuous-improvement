#!/usr/bin/env node
/**
 * Friction Harvest — turn observation rows into typed instincts.
 *
 * PR D of the second-release train (item 8 from the 28-day usage report).
 *
 * Reads `~/.claude/instincts/<project-hash>/observations.jsonl` produced by
 * the Mulahazah hook (see `hooks/observe.sh` and `src/lib/observe-event.mts`),
 * classifies failure rows into typed instincts, aggregates by deduplication
 * key, scores confidence with a recency-weighted decay, and appends new
 * instincts to `<project-hash>/instincts.jsonl`. Idempotent: re-running on
 * the same observations does not duplicate previously-written instincts.
 *
 * Schema awareness:
 *   - Rich-schema rows (input_summary + output_summary present) are the
 *     contract surface. The classifier reads output_summary to detect
 *     command-not-found, permission-denied, file-not-read, etc.
 *   - Thin-schema rows (no input/output fields — emitted by the bash
 *     fallback when jq is missing AND the Node observer is not on PATH)
 *     return null from classifyObservation. The CLI reports the gap
 *     explicitly rather than misclassifying.
 *
 * Slash-command wrapper (commands/harvest.md), Law-7 SKILL.md prose, and
 * a scheduled trigger are explicitly out of scope for this PR. The trim
 * is documented in docs/plans/2026-05-07-second-release-train.md.
 *
 * Usage:
 *   node bin/harvest-friction.mjs                # current project
 *   node bin/harvest-friction.mjs <project-hash> # specific project
 *   node bin/harvest-friction.mjs --list         # show classifications without writing
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";

export type FrictionType = "wrong_approach" | "buggy_code" | "env_issue" | "permission_block";

export interface ObservationRow {
  ts: string;
  event: string;
  session: string;
  tool: string;
  input_summary?: string;
  output_summary?: string;
  project_id: string;
  project_name: string;
}

export interface ClassifiedFriction {
  type: FrictionType;
  tool: string;
  summary: string;
  evidence_ts: string;
  dedup_key: string;
}

export interface Instinct extends ClassifiedFriction {
  confidence: number;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
}

const SUMMARY_TRUNCATE = 120;
const DEDUP_KEY_INPUT_TRUNCATE = 120;

/**
 * Stable deduplication key. Truncates summary at 120 chars before hashing so
 * minor output variance (timestamps, retry counts, paths) past the boundary
 * does not split the same friction event into multiple instincts.
 */
export function computeDedupKey(c: { type: FrictionType; tool: string; summary: string }): string {
  const truncated = c.summary.length > DEDUP_KEY_INPUT_TRUNCATE
    ? c.summary.slice(0, DEDUP_KEY_INPUT_TRUNCATE)
    : c.summary;
  return createHash("sha1").update(`${c.type}|${c.tool}|${truncated}`).digest("hex");
}

/**
 * Classify a single observation row. Returns null when:
 *   - The row is not a tool_complete event (no failure signal yet)
 *   - The row lacks output_summary (thin-schema row — gap, not classifiable)
 *   - The output does not match any known friction pattern (success row)
 *
 * Heuristics are deliberately specific to keep false-positive rate low.
 * Each branch matches a documented failure mode the operator hit on this
 * host in the last 28 days.
 */
export function classifyObservation(row: ObservationRow): ClassifiedFriction | null {
  if (row.event !== "tool_complete") return null;
  const out = row.output_summary;
  if (out === undefined || out === "") return null;

  const tool = row.tool;
  const summary = out.length > SUMMARY_TRUNCATE ? out.slice(0, SUMMARY_TRUNCATE) : out;

  // env_issue — missing tooling, wrong shell flavor, missing env var.
  // Match before permission_block because "command not found" is a stronger signal
  // than the generic "Permission denied" tail of the output.
  if (
    /command not found/i.test(out) ||
    /not recognized as (?:an internal|the name)/i.test(out) ||
    /is not recognized as a cmdlet/i.test(out)
  ) {
    return build("env_issue", tool, summary, row.ts);
  }

  // permission_block — harness, sandbox, or OS denied the action.
  if (
    /permission denied/i.test(out) ||
    /harness[- ]blocked/i.test(out) ||
    /sandbox/i.test(out) ||
    /operation not permitted/i.test(out)
  ) {
    return build("permission_block", tool, summary, row.ts);
  }

  // wrong_approach — agent acted on stale state. The "file changed since last
  // read" signal is the canonical case (parallel actor or skipped Read).
  if (
    /file changed since last read/i.test(out) ||
    /modified by (?:another session|the user)/i.test(out)
  ) {
    return build("wrong_approach", tool, summary, row.ts);
  }

  // buggy_code — agent's own input was malformed for the tool contract.
  // Includes Edit-without-Read, ambiguous old_string, file-too-large, etc.
  if (
    /file has not been read/i.test(out) ||
    /old_string is not unique/i.test(out) ||
    /string_to_replace not found/i.test(out) ||
    /file too large/i.test(out)
  ) {
    return build("buggy_code", tool, summary, row.ts);
  }

  return null;
}

function build(type: FrictionType, tool: string, summary: string, evidence_ts: string): ClassifiedFriction {
  return {
    type,
    tool,
    summary,
    evidence_ts,
    dedup_key: computeDedupKey({ type, tool, summary }),
  };
}

/**
 * Aggregate classifications by dedup_key into Instincts with frequency and
 * recency-weighted confidence.
 *
 * Confidence model (deliberately simple for the first cut; tune in a follow-up
 * once the operator has confirmed the classifier output is plausible):
 *   confidence = min(1.0, log10(occurrence_count + 1) * recency_factor)
 *   recency_factor = 0.5 + 0.5 * exp(-days_since_last_seen / 14)
 *
 * A single occurrence today: confidence ≈ log10(2) * 1.0 ≈ 0.30.
 * Ten occurrences today:     confidence ≈ log10(11) * 1.0 ≈ 1.04 → clamp 1.0.
 * One occurrence 30 days ago: confidence ≈ log10(2) * (0.5 + 0.5 * 0.118) ≈ 0.17.
 */
export function aggregateInstincts(classified: ClassifiedFriction[]): Instinct[] {
  if (classified.length === 0) return [];

  const groups = new Map<string, ClassifiedFriction[]>();
  for (const c of classified) {
    const list = groups.get(c.dedup_key) ?? [];
    list.push(c);
    groups.set(c.dedup_key, list);
  }

  const now = Date.now();
  const instincts: Instinct[] = [];
  for (const [, group] of groups) {
    const sorted = [...group].sort((a, b) => a.evidence_ts.localeCompare(b.evidence_ts));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const occurrence_count = group.length;

    const lastSeenMs = Date.parse(last.evidence_ts);
    const daysSince = isFinite(lastSeenMs) ? (now - lastSeenMs) / 86400000 : 0;
    const recency_factor = 0.5 + 0.5 * Math.exp(-Math.max(0, daysSince) / 14);
    const raw = Math.log10(occurrence_count + 1) * recency_factor;
    const confidence = Math.max(0, Math.min(1, raw));

    instincts.push({
      type: first.type,
      tool: first.tool,
      summary: first.summary,
      evidence_ts: last.evidence_ts,
      dedup_key: first.dedup_key,
      confidence,
      occurrence_count,
      first_seen: first.evidence_ts,
      last_seen: last.evidence_ts,
    });
  }

  return instincts.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Read existing instincts.jsonl and return the set of dedup keys already
 * recorded. Missing file is treated as empty (idempotent first run).
 * Malformed lines are skipped silently — a partially-written instincts.jsonl
 * should not block the next harvest.
 */
export function loadExistingDedupKeys(instinctsJsonlPath: string): Set<string> {
  if (!existsSync(instinctsJsonlPath)) return new Set();
  const keys = new Set<string>();
  const content = readFileSync(instinctsJsonlPath, "utf8");
  for (const line of content.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const obj = JSON.parse(line) as { dedup_key?: unknown };
      if (typeof obj.dedup_key === "string") keys.add(obj.dedup_key);
    } catch {
      // Skip malformed line.
    }
  }
  return keys;
}

interface HarvestResult {
  totalRows: number;
  toolCompleteRows: number;
  classifiedRows: number;
  thinSchemaRows: number;
  newInstincts: Instinct[];
  skippedExisting: number;
}

export function harvest(observationsPath: string, instinctsPath: string): HarvestResult {
  if (!existsSync(observationsPath)) {
    return { totalRows: 0, toolCompleteRows: 0, classifiedRows: 0, thinSchemaRows: 0, newInstincts: [], skippedExisting: 0 };
  }
  const content = readFileSync(observationsPath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim() !== "");
  const classified: ClassifiedFriction[] = [];
  let toolCompleteRows = 0;
  let thinSchemaRows = 0;
  for (const line of lines) {
    let row: ObservationRow;
    try {
      row = JSON.parse(line) as ObservationRow;
    } catch {
      continue;
    }
    if (row.event === "tool_complete") {
      toolCompleteRows++;
      if (row.output_summary === undefined || row.output_summary === "") {
        thinSchemaRows++;
        continue;
      }
    }
    const c = classifyObservation(row);
    if (c) classified.push(c);
  }
  const allInstincts = aggregateInstincts(classified);
  const existing = loadExistingDedupKeys(instinctsPath);
  const newInstincts = allInstincts.filter((i) => !existing.has(i.dedup_key));
  return {
    totalRows: lines.length,
    toolCompleteRows,
    classifiedRows: classified.length,
    thinSchemaRows,
    newInstincts,
    skippedExisting: allInstincts.length - newInstincts.length,
  };
}

function defaultProjectHash(): string {
  // Mirror the bash hook's hashing rule: sha256(project_root) → first 12 hex chars.
  // Keeps the CLI compatible with whatever directory the bash hook was already
  // populating, without re-implementing project-root detection here.
  const root = cwd();
  return createHash("sha256").update(root).digest("hex").slice(0, 12);
}

function main(): void {
  const args = argv.slice(2);
  const listOnly = args.includes("--list");
  const positional = args.filter((a) => !a.startsWith("--"));
  const projectHash = positional[0] ?? defaultProjectHash();
  const projectDir = join(homedir(), ".claude", "instincts", projectHash);
  const observationsPath = join(projectDir, "observations.jsonl");
  const instinctsPath = join(projectDir, "instincts.jsonl");

  const result = harvest(observationsPath, instinctsPath);

  console.log(`harvest-friction project=${projectHash}`);
  console.log(`  observations rows:    ${result.totalRows}`);
  console.log(`  tool_complete rows:   ${result.toolCompleteRows}`);
  console.log(`  classified failures:  ${result.classifiedRows}`);
  console.log(`  thin-schema rows:     ${result.thinSchemaRows}`);
  console.log(`  new instincts:        ${result.newInstincts.length}`);
  console.log(`  skipped (existing):   ${result.skippedExisting}`);

  if (result.totalRows > 0 && result.toolCompleteRows === 0) {
    console.log("");
    console.log("WARNING: observations contain only tool_start events.");
    console.log("  The bash fallback in hooks/observe.sh emits tool_start when jq is missing AND");
    console.log("  the Node observer is not on PATH — never tool_complete with output_summary,");
    console.log("  which is what the classifier needs.");
    console.log("  Install jq (winget install jqlang.jq | brew install jq | apt install jq)");
    console.log("  OR ensure hooks/bin/observe.mjs is reachable from the hook script.");
  } else if (result.thinSchemaRows > 0 && result.classifiedRows === 0) {
    console.log("");
    console.log("WARNING: tool_complete rows found but lack output_summary fields.");
    console.log("  The classifier needs the rich-schema output_summary to detect failures.");
    console.log("  Confirm the Node observer (src/bin/observe.mts) is the active hook.");
  }

  if (result.newInstincts.length === 0) {
    return;
  }

  console.log("");
  console.log("New instincts:");
  for (const i of result.newInstincts) {
    const conf = i.confidence.toFixed(2);
    console.log(`  [${conf}] ${i.type} on ${i.tool} (×${i.occurrence_count}): ${i.summary}`);
  }

  if (listOnly) return;

  for (const i of result.newInstincts) {
    appendFileSync(instinctsPath, JSON.stringify(i) + "\n");
  }
  console.log(`\nAppended ${result.newInstincts.length} instinct(s) to ${instinctsPath}`);
}

const invokedDirectly = argv[1]?.endsWith("harvest-friction.mjs");
if (invokedDirectly) {
  main();
  exit(0);
}
