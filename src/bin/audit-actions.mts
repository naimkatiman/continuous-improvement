#!/usr/bin/env node
/**
 * audit-actions — static GitHub Actions security scanner.
 *
 * Portfolio-spine train (docs/plans/2026-07-04-portfolio-spine.md).
 *
 * Scans `.github/workflows/*.yml|*.yaml` for the mechanical subset of the
 * checks in templates/actions_security_checklist.md:
 *
 *   (a) missing explicit `permissions:` at workflow AND job level  -> high
 *   (b) `permissions: write-all`                                   -> high
 *   (c) `uses: owner/repo@ref` not pinned to a 40-hex commit SHA   -> medium
 *       (first-party actions/* github/* not SHA-pinned             -> low)
 *   (d) job missing `timeout-minutes`                              -> medium
 *   (e) push/schedule-triggered workflow without `concurrency:`    -> low
 *   (f) `${{ github.event.* }}` / `${{ github.head_ref }}` in run: -> high
 *   (g) pull_request_target/issue_comment/issues trigger combined
 *       with secrets.* usage or write permissions                  -> high
 *
 * Zero runtime dependencies: the YAML handling is hand-rolled, line-oriented
 * parsing of the constrained GitHub-workflow YAML subset (indentation-based
 * key detection). Its limits — naive comment stripping, shallow flow-style
 * parsing, no anchors/aliases, block scalars tracked for run: only — are
 * documented in docs/plans/2026-07-04-portfolio-spine.md. Constructs the
 * parser does not understand produce no findings (false negatives over
 * false positives); the checklist template is the human layer on top.
 *
 * Usage:
 *   node bin/audit-actions.mjs [--repo <path>] [--out <file>] [--strict]
 *     --repo <path>  repository root to scan (default ".")
 *     --out <file>   markdown report path (default "reports/actions-security.md")
 *     --strict       exit 1 when any high-severity finding exists
 *     --help         print usage
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { argv, exit } from "node:process";

export type Severity = "high" | "medium" | "low";

export interface WorkflowFile {
  path: string;
  content: string;
}

export interface Finding {
  file: string;
  line: number;
  severity: Severity;
  check: string;
  message: string;
  remediation: string;
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const SHA_PIN = /^[0-9a-f]{40}$/;
const DANGEROUS_TRIGGERS = ["pull_request_target", "issue_comment", "issues"];
const CONCURRENCY_TRIGGERS = ["push", "schedule"];
const UNTRUSTED_INTERPOLATION = /\$\{\{\s*github\.(?:event\.|head_ref\b)/;
const SECRETS_INTERPOLATION = /\$\{\{\s*secrets\./;

const REMEDIATION: Record<string, string> = {
  "missing-permissions":
    "Declare explicit `permissions:` (default `contents: read`) at the workflow level; add write scopes per-job only where provably needed.",
  "write-all-permissions":
    "Replace `write-all` with the minimal named scopes each job needs.",
  "unpinned-third-party-action":
    "Pin third-party actions to a full 40-hex commit SHA — tags and branches are mutable.",
  "unpinned-first-party-action":
    "Pin first-party actions to a full commit SHA, or at minimum a major version tag.",
  "missing-timeout":
    "Add `timeout-minutes:` to the job to cap runaway or hung runs.",
  "missing-concurrency":
    "Add a `concurrency:` block with a stable group key so overlapping runs cancel or queue.",
  "untrusted-input-in-run":
    "Pass untrusted event text through `env:` and reference it as a quoted shell variable; never interpolate `${{ github.event.* }}` or `${{ github.head_ref }}` directly into `run:`.",
  "dangerous-trigger-with-secrets":
    "Workflows on pull_request_target/issue_comment/issues run with attacker-influenced input; drop secrets/write tokens from them or add a maintainer-approval gate.",
};

interface ParsedJob {
  name: string;
  line: number;
  hasPermissions: boolean;
  hasTimeout: boolean;
  isReusableCall: boolean;
}

interface UsesRef {
  line: number;
  spec: string;
}

interface ParsedWorkflow {
  triggers: string[];
  onLine: number;
  hasWorkflowPermissions: boolean;
  hasConcurrency: boolean;
  hasWritePermission: boolean;
  writeAllLines: number[];
  usesSecrets: boolean;
  usesRefs: UsesRef[];
  runInterpolationLines: number[];
  jobs: ParsedJob[];
}

/** Strip a trailing comment, tracking single/double quotes so `#` inside a quoted scalar survives. */
export function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble) {
      if (i === 0 || line[i - 1] === " " || line[i - 1] === "\t") {
        return line.slice(0, i).trimEnd();
      }
    }
  }
  return line;
}

function indentOf(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === " ") n++;
  return n;
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

/** Trigger names from an inline `on:` value — scalar (`push`) or flow list (`[push, schedule]`). */
function parseInlineTriggers(value: string): string[] {
  const v = value.trim();
  if (v.startsWith("[")) {
    return v
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map((t) => unquote(t))
      .filter((t) => t !== "");
  }
  return v === "" ? [] : [unquote(v)];
}

/**
 * Parse one workflow into the facts the checks need. Line-oriented,
 * indentation-based; see the module header for the documented subset limits.
 */
export function parseWorkflow(content: string): ParsedWorkflow {
  const parsed: ParsedWorkflow = {
    triggers: [],
    onLine: 1,
    hasWorkflowPermissions: false,
    hasConcurrency: false,
    hasWritePermission: false,
    writeAllLines: [],
    usesSecrets: false,
    usesRefs: [],
    runInterpolationLines: [],
    jobs: [],
  };

  const lines = content.split(/\r?\n/);
  let topKey = "";
  let onNestedIndent = -1;
  let jobNameIndent = -1;
  let jobPropIndent = -1;
  let currentJob: ParsedJob | null = null;
  let permBlockIndent = -1; // inside a permissions: block (workflow or job level)
  let runBlockIndent = -1; // inside a run: | block scalar

  for (let i = 0; i < lines.length; i++) {
    const raw = stripComment(lines[i] ?? "");
    if (raw.trim() === "") continue;
    const lineNo = i + 1;
    const indent = indentOf(raw);
    let text = raw.trim();

    if (SECRETS_INTERPOLATION.test(raw)) parsed.usesSecrets = true;

    if (runBlockIndent >= 0) {
      if (indent > runBlockIndent) {
        if (UNTRUSTED_INTERPOLATION.test(raw)) parsed.runInterpolationLines.push(lineNo);
        continue;
      }
      runBlockIndent = -1;
    }

    if (permBlockIndent >= 0 && indent <= permBlockIndent) permBlockIndent = -1;
    if (permBlockIndent >= 0 && /:\s*(write|write-all)\s*$/.test(text)) {
      parsed.hasWritePermission = true;
      if (/write-all\s*$/.test(text)) parsed.writeAllLines.push(lineNo);
      continue;
    }

    // Normalize step-item lines ("- uses: x", "- run: y") to key/value form.
    const isListItem = text.startsWith("- ");
    if (isListItem) text = text.slice(2).trim();

    const keyMatch = /^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/.exec(text);

    if (indent === 0 && keyMatch && !isListItem) {
      topKey = keyMatch[1];
      const value = keyMatch[2].trim();
      onNestedIndent = -1;
      if (topKey === "on") {
        parsed.onLine = lineNo;
        parsed.triggers.push(...parseInlineTriggers(value));
      } else if (topKey === "permissions") {
        parsed.hasWorkflowPermissions = true;
        notePermissionsValue(parsed, value, lineNo);
        if (value === "") permBlockIndent = indent;
      } else if (topKey === "concurrency") {
        parsed.hasConcurrency = true;
      } else if (topKey === "jobs") {
        jobNameIndent = -1;
        jobPropIndent = -1;
      }
      continue;
    }

    if (topKey === "on" && keyMatch && !isListItem) {
      if (onNestedIndent === -1) onNestedIndent = indent;
      if (indent === onNestedIndent) parsed.triggers.push(keyMatch[1]);
      continue;
    }

    if (topKey !== "jobs" || !keyMatch) continue;

    // First nested key under jobs: fixes the job-name indent level.
    if (jobNameIndent === -1 && !isListItem) jobNameIndent = indent;

    if (indent === jobNameIndent && !isListItem && keyMatch[2].trim() === "") {
      currentJob = { name: keyMatch[1], line: lineNo, hasPermissions: false, hasTimeout: false, isReusableCall: false };
      parsed.jobs.push(currentJob);
      jobPropIndent = -1;
      continue;
    }

    if (currentJob === null) continue;
    if (jobPropIndent === -1 && indent > jobNameIndent && !isListItem) jobPropIndent = indent;

    const key = keyMatch[1];
    const value = keyMatch[2].trim();
    const isJobProp = indent === jobPropIndent && !isListItem;

    if (isJobProp && key === "permissions") {
      currentJob.hasPermissions = true;
      notePermissionsValue(parsed, value, lineNo);
      if (value === "") permBlockIndent = indent;
      continue;
    }
    if (isJobProp && key === "timeout-minutes") {
      currentJob.hasTimeout = true;
      continue;
    }
    if (key === "uses") {
      if (isJobProp) currentJob.isReusableCall = true;
      parsed.usesRefs.push({ line: lineNo, spec: unquote(value) });
      continue;
    }
    if (key === "run") {
      if (/^[|>][+-]?\d*$/.test(value)) {
        runBlockIndent = indent;
      } else if (UNTRUSTED_INTERPOLATION.test(value)) {
        parsed.runInterpolationLines.push(lineNo);
      }
    }
  }

  return parsed;
}

/** Record write-all / inline write scopes from a `permissions:` value. */
function notePermissionsValue(parsed: ParsedWorkflow, value: string, lineNo: number): void {
  if (value === "") return;
  if (/^["']?write-all["']?$/.test(value)) {
    parsed.hasWritePermission = true;
    parsed.writeAllLines.push(lineNo);
  } else if (/:\s*write\b/.test(value)) {
    // Inline flow map, e.g. permissions: {contents: write}
    parsed.hasWritePermission = true;
  }
}

function checkFile(file: WorkflowFile): Finding[] {
  const w = parseWorkflow(file.content);
  const findings: Finding[] = [];
  const add = (line: number, severity: Severity, check: string, message: string): void => {
    findings.push({ file: file.path, line, severity, check, message, remediation: REMEDIATION[check] ?? "" });
  };

  // (a) permissions absent everywhere
  if (!w.hasWorkflowPermissions && !w.jobs.some((j) => j.hasPermissions)) {
    add(1, "high", "missing-permissions", "No explicit `permissions:` at the workflow level or on any job — the workflow runs with the default token grant.");
  }

  // (b) write-all
  for (const line of w.writeAllLines) {
    add(line, "high", "write-all-permissions", "`permissions: write-all` grants every scope to the workflow token.");
  }

  // (c) unpinned uses references
  for (const ref of w.usesRefs) {
    const finding = classifyUsesRef(ref);
    if (finding) add(ref.line, finding.severity, finding.check, finding.message);
  }

  // (d) missing timeout-minutes per job (reusable-workflow call jobs excluded)
  for (const job of w.jobs) {
    if (!job.isReusableCall && !job.hasTimeout) {
      add(job.line, "medium", "missing-timeout", `Job \`${job.name}\` has no \`timeout-minutes\`.`);
    }
  }

  // (e) push/schedule without concurrency
  if (!w.hasConcurrency && w.triggers.some((t) => CONCURRENCY_TRIGGERS.includes(t))) {
    add(w.onLine, "low", "missing-concurrency", "Workflow is triggered by push/schedule but declares no `concurrency:` block.");
  }

  // (f) untrusted interpolation inside run:
  for (const line of w.runInterpolationLines) {
    add(line, "high", "untrusted-input-in-run", "Untrusted event text (`github.event.*` / `github.head_ref`) is interpolated directly into a `run:` shell command.");
  }

  // (g) dangerous trigger combined with secrets or write permissions
  const dangerous = w.triggers.filter((t) => DANGEROUS_TRIGGERS.includes(t));
  if (dangerous.length > 0 && (w.usesSecrets || w.hasWritePermission)) {
    add(w.onLine, "high", "dangerous-trigger-with-secrets", `Trigger \`${dangerous.join("`, `")}\` is combined with ${w.usesSecrets ? "secrets access" : "write permissions"}.`);
  }

  return findings;
}

function classifyUsesRef(ref: UsesRef): { severity: Severity; check: string; message: string } | null {
  const spec = ref.spec;
  if (spec === "" || spec.startsWith("./") || spec.startsWith("docker://")) return null;
  const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/[^@]*)?(?:@(.+))?$/.exec(spec);
  if (!m) return null;
  const owner = m[1];
  const gitRef = m[3] ?? "";
  if (SHA_PIN.test(gitRef)) return null;
  const firstParty = owner === "actions" || owner === "github";
  if (firstParty) {
    return {
      severity: "low",
      check: "unpinned-first-party-action",
      message: `First-party action \`${spec}\` is not pinned to a commit SHA.`,
    };
  }
  return {
    severity: "medium",
    check: "unpinned-third-party-action",
    message: `Third-party action \`${spec}\` is not pinned to a 40-hex commit SHA.`,
  };
}

/**
 * Pure scanner: workflow files in, deterministic findings out.
 * Sorted by file path, then line, then severity, then check id.
 */
export function auditWorkflows(files: WorkflowFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    findings.push(...checkFile(file));
  }
  return findings.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.check.localeCompare(b.check),
  );
}

/** Markdown report: summary table on top, findings grouped per workflow file. */
export function renderReport(findings: Finding[], opts: { scannedFiles?: string[] } = {}): string {
  const scanned = opts.scannedFiles ?? [...new Set(findings.map((f) => f.file))].sort();
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity]++;

  const out: string[] = [];
  out.push("# GitHub Actions security audit");
  out.push("");
  out.push(`Scanned ${scanned.length} workflow file(s). Checks and remediation follow templates/actions_security_checklist.md.`);
  out.push("");
  out.push("## Summary");
  out.push("");
  out.push("| Severity | Count |");
  out.push("|---|---|");
  out.push(`| high | ${counts.high} |`);
  out.push(`| medium | ${counts.medium} |`);
  out.push(`| low | ${counts.low} |`);
  out.push("");

  if (findings.length === 0) {
    out.push("No findings. All scanned workflows pass the mechanical checks.");
    out.push("");
    return out.join("\n");
  }

  const byFile = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byFile.get(f.file) ?? [];
    list.push(f);
    byFile.set(f.file, list);
  }
  for (const [file, list] of byFile) {
    out.push(`## ${file}`);
    out.push("");
    out.push("| Severity | Line | Finding | Remediation |");
    out.push("|---|---|---|---|");
    for (const f of list) {
      out.push(`| ${f.severity} | ${f.line} | ${f.message} | ${f.remediation} |`);
    }
    out.push("");
  }
  return out.join("\n");
}

function listWorkflowFiles(repoRoot: string): WorkflowFile[] {
  const dir = join(repoRoot, ".github", "workflows");
  if (!existsSync(dir)) return [];
  const files: WorkflowFile[] = [];
  for (const entry of readdirSync(dir).sort()) {
    if (!entry.endsWith(".yml") && !entry.endsWith(".yaml")) continue;
    files.push({
      path: `.github/workflows/${entry}`,
      content: readFileSync(join(dir, entry), "utf8"),
    });
  }
  return files;
}

const USAGE = `Usage: node bin/audit-actions.mjs [--repo <path>] [--out <file>] [--strict]

  --repo <path>  repository root to scan (default ".")
  --out <file>   markdown report path (default "reports/actions-security.md")
  --strict       exit 1 when any high-severity finding exists
  --help         print this usage
`;

function main(): number {
  const args = argv.slice(2);
  if (args.includes("--help")) {
    console.log(USAGE);
    return 0;
  }
  const repoIdx = args.indexOf("--repo");
  const outIdx = args.indexOf("--out");
  const repoRoot = repoIdx >= 0 ? (args[repoIdx + 1] ?? ".") : ".";
  const outPath = outIdx >= 0 ? (args[outIdx + 1] ?? "reports/actions-security.md") : "reports/actions-security.md";
  const strict = args.includes("--strict");

  const files = listWorkflowFiles(repoRoot);
  const findings = auditWorkflows(files);
  const report = renderReport(findings, { scannedFiles: files.map((f) => f.path) });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, report);

  const high = findings.filter((f) => f.severity === "high").length;
  console.log(`audit-actions: ${files.length} workflow file(s), ${findings.length} finding(s) (${high} high).`);
  console.log(`Report written to ${outPath}`);

  if (strict && high > 0) return 1;
  return 0;
}

const invokedDirectly = argv[1]?.endsWith("audit-actions.mjs");
if (invokedDirectly) {
  exit(main());
}
