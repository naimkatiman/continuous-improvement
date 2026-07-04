#!/usr/bin/env node
/**
 * portfolio-health — v0 portfolio repo scorer from LOCAL static signals.
 *
 * Portfolio-spine train (docs/plans/2026-07-04-portfolio-spine.md).
 *
 * Reads the machine-readable registry at portfolio/repos.json and scores each
 * repo 0-100 from local, offline signals only (no network):
 *
 *   - CI configured (`.github/workflows` with at least one yml/yaml)
 *   - Release receipts (`.releases/*.md` or `docs/releases/*.md`, templates excluded)
 *   - Experiment records (`.experiments/*.md` or `docs/experiments/*.md`, templates excluded)
 *   - Commit freshness (`git log -1 --format=%ct` via child_process, guarded)
 *   - High-severity findings from auditWorkflows (imported pure function)
 *
 * Repos without a local checkout score "n/a (no local checkout)" — never a crash.
 * The weighted rubric lives in the named WEIGHT_* constants below and is
 * mirrored in the generated report's appendix.
 *
 * Usage:
 *   node bin/portfolio-health.mjs [--config <path>] [--out <file>]
 *     --config <path>  registry path (default "portfolio/repos.json")
 *     --out <file>     markdown report path (default "reports/portfolio-health.md")
 *     --help           print usage
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { argv, exit } from "node:process";
import { auditWorkflows } from "./audit-actions.mjs";
// Scoring rubric (documented in the report appendix; weights sum to 100).
export const WEIGHT_CI = 25;
export const WEIGHT_RECEIPTS = 20;
export const WEIGHT_EXPERIMENTS = 15;
export const WEIGHT_FRESHNESS = 20;
export const WEIGHT_SECURITY = 20;
export const HIGH_FINDING_PENALTY = 5; // security points lost per high finding
export const RECEIPT_FULL_CREDIT = 3; // receipts needed for full receipt credit
export const EXPERIMENT_FULL_CREDIT = 2; // experiment records needed for full credit
export const FRESH_DAYS = 7; // full freshness credit at or under this
export const STALE_DAYS = 30; // half credit at or under this; zero beyond
const TEMPLATE_NAME = /template/i;
const RECEIPT_DIRS = [".releases", join("docs", "releases")];
const EXPERIMENT_DIRS = [".experiments", join("docs", "experiments")];
function countProofFiles(localPath, dirs) {
    let count = 0;
    for (const dir of dirs) {
        const full = join(localPath, dir);
        if (!existsSync(full))
            continue;
        for (const entry of readdirSync(full)) {
            if (entry.endsWith(".md") && !TEMPLATE_NAME.test(entry))
                count++;
        }
    }
    return count;
}
function readWorkflowFiles(localPath) {
    const dir = join(localPath, ".github", "workflows");
    if (!existsSync(dir))
        return [];
    const files = [];
    for (const entry of readdirSync(dir).sort()) {
        if (!entry.endsWith(".yml") && !entry.endsWith(".yaml"))
            continue;
        try {
            files.push({ path: `.github/workflows/${entry}`, content: readFileSync(join(dir, entry), "utf8") });
        }
        catch {
            // Unreadable workflow file: skip rather than crash the whole report.
        }
    }
    return files;
}
/** Last-commit age in whole days via `git log -1 --format=%ct`. Any failure → null. */
function daysSinceLastCommit(localPath, nowMs) {
    try {
        const out = execFileSync("git", ["-C", localPath, "log", "-1", "--format=%ct"], {
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 10000,
        })
            .toString()
            .trim();
        const epochSeconds = Number.parseInt(out, 10);
        if (!Number.isFinite(epochSeconds) || epochSeconds <= 0)
            return null;
        return Math.max(0, Math.floor((nowMs - epochSeconds * 1000) / 86400000));
    }
    catch {
        return null;
    }
}
/** Gather all local static signals for one checked-out repo. */
export function collectSignals(localPath, opts = {}) {
    const workflows = readWorkflowFiles(localPath);
    const findings = auditWorkflows(workflows);
    return {
        hasCI: workflows.length > 0,
        receiptCount: countProofFiles(localPath, RECEIPT_DIRS),
        experimentCount: countProofFiles(localPath, EXPERIMENT_DIRS),
        daysSinceLastCommit: daysSinceLastCommit(localPath, opts.nowMs ?? Date.now()),
        highFindings: findings.filter((f) => f.severity === "high").length,
    };
}
function freshnessPoints(days) {
    if (days === null)
        return 0;
    if (days <= FRESH_DAYS)
        return WEIGHT_FRESHNESS;
    if (days <= STALE_DAYS)
        return WEIGHT_FRESHNESS / 2;
    return 0;
}
/**
 * Weighted 0-100 score plus the largest-gap risk and its next action.
 * Security credit requires CI: with no workflows there is nothing audited,
 * so a repo cannot earn security points by having no CI at all.
 */
export function scoreRepo(s) {
    const ci = s.hasCI ? WEIGHT_CI : 0;
    const receipts = Math.round((WEIGHT_RECEIPTS * Math.min(s.receiptCount, RECEIPT_FULL_CREDIT)) / RECEIPT_FULL_CREDIT);
    const experiments = Math.round((WEIGHT_EXPERIMENTS * Math.min(s.experimentCount, EXPERIMENT_FULL_CREDIT)) / EXPERIMENT_FULL_CREDIT);
    const freshness = freshnessPoints(s.daysSinceLastCommit);
    const security = s.hasCI ? Math.max(0, WEIGHT_SECURITY - HIGH_FINDING_PENALTY * s.highFindings) : 0;
    const score = ci + receipts + experiments + freshness + security;
    // Largest points gap wins; ties resolve in this fixed order (worst first).
    const gaps = [
        {
            lost: WEIGHT_SECURITY - security,
            risk: s.hasCI
                ? `${s.highFindings} high-severity Actions finding(s)`
                : "No CI, so no security signal exists",
            action: s.hasCI
                ? "Run ci-audit-actions --strict and fix the high findings"
                : "Add CI first, then run ci-audit-actions",
        },
        {
            lost: WEIGHT_CI - ci,
            risk: "No CI configured (.github/workflows is empty or missing)",
            action: "Add a CI workflow that runs the test suite on push",
        },
        {
            lost: WEIGHT_FRESHNESS - freshness,
            risk: s.daysSinceLastCommit === null
                ? "Last-commit date unknown (git unavailable or no history)"
                : `No commits in ${s.daysSinceLastCommit} day(s)`,
            action: "Land one small maintenance commit or archive the repo deliberately",
        },
        {
            lost: WEIGHT_RECEIPTS - receipts,
            risk: `Only ${s.receiptCount} release receipt(s) on record`,
            action: "Write a .releases/ receipt for the next ship (template in continuous-improvement)",
        },
        {
            lost: WEIGHT_EXPERIMENTS - experiments,
            risk: `Only ${s.experimentCount} experiment record(s) on record`,
            action: "Record the next hypothesis in .experiments/ before building",
        },
    ];
    gaps.sort((a, b) => b.lost - a.lost);
    const top = gaps[0];
    if (top.lost === 0) {
        return { score, topRisk: "none", nextAction: "Keep the receipts flowing" };
    }
    return { score, topRisk: top.risk, nextAction: top.action };
}
/** Registry loader with explicit validation — fail fast on malformed config. */
export function loadConfig(configPath) {
    const raw = readFileSync(configPath, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
        throw new Error(`portfolio registry ${configPath} must be a JSON array of repo entries`);
    }
    const entries = [];
    for (let i = 0; i < data.length; i++) {
        const e = data[i];
        const missing = [];
        if (typeof e.repo !== "string" || e.repo === "")
            missing.push("repo");
        if (typeof e.lane !== "string" || e.lane === "")
            missing.push("lane");
        if (typeof e.localPath !== "string" || e.localPath === "")
            missing.push("localPath");
        if (typeof e.active !== "boolean")
            missing.push("active");
        if (missing.length > 0) {
            throw new Error(`portfolio registry entry ${i} has missing/invalid field(s): ${missing.join(", ")}`);
        }
        entries.push({ repo: e.repo, lane: e.lane, localPath: e.localPath, active: e.active });
    }
    return entries;
}
/**
 * One row per entry. Missing local checkouts degrade to an "n/a" row.
 * Deterministic ordering: scored rows worst-first (score asc, then repo),
 * then n/a rows alphabetically.
 */
export function buildRows(entries, opts = {}) {
    const rows = entries.map((entry) => {
        if (!existsSync(entry.localPath)) {
            return {
                repo: entry.repo,
                lane: entry.lane,
                score: null,
                scoreLabel: "n/a (no local checkout)",
                topRisk: "No local checkout on this host",
                nextAction: `Clone to ${entry.localPath} or set active:false in the registry`,
            };
        }
        const signals = collectSignals(entry.localPath, opts);
        const { score, topRisk, nextAction } = scoreRepo(signals);
        return { repo: entry.repo, lane: entry.lane, score, scoreLabel: String(score), topRisk, nextAction };
    });
    return rows.sort((a, b) => {
        if (a.score === null && b.score === null)
            return a.repo.localeCompare(b.repo);
        if (a.score === null)
            return 1;
        if (b.score === null)
            return -1;
        return a.score - b.score || a.repo.localeCompare(b.repo);
    });
}
/** Markdown report: scored table (worst first) + how-scores-are-computed appendix. */
export function renderReport(rows, generatedAt) {
    const out = [];
    out.push("# Portfolio health report");
    out.push("");
    out.push(`Generated at: ${generatedAt}`);
    out.push("");
    out.push(`Scored ${rows.filter((r) => r.score !== null).length} repo(s) from local signals; ${rows.filter((r) => r.score === null).length} without a local checkout. Worst score first.`);
    out.push("");
    out.push("| Repo | Score | Top Risk | Next Action |");
    out.push("|---|---|---|---|");
    for (const r of rows) {
        out.push(`| ${r.repo} | ${r.scoreLabel} | ${r.topRisk} | ${r.nextAction} |`);
    }
    out.push("");
    out.push("## How scores are computed");
    out.push("");
    out.push("v0 scores use LOCAL static signals only — no network calls. Weights (sum 100):");
    out.push("");
    out.push("| Signal | Weight | Full credit |");
    out.push("|---|---|---|");
    out.push(`| CI configured (.github/workflows with >=1 yml/yaml) | ${WEIGHT_CI} | present |`);
    out.push(`| Release receipts (.releases/ or docs/releases/, templates excluded) | ${WEIGHT_RECEIPTS} | ${RECEIPT_FULL_CREDIT}+ receipts |`);
    out.push(`| Experiment records (.experiments/ or docs/experiments/, templates excluded) | ${WEIGHT_EXPERIMENTS} | ${EXPERIMENT_FULL_CREDIT}+ records |`);
    out.push(`| Commit freshness (git log -1 --format=%ct, guarded) | ${WEIGHT_FRESHNESS} | <=${FRESH_DAYS} days; half <=${STALE_DAYS} days |`);
    out.push(`| Actions security (high findings from audit-actions) | ${WEIGHT_SECURITY} | 0 high findings; -${HIGH_FINDING_PENALTY}/finding; requires CI |`);
    out.push("");
    out.push("Repos without a local checkout are reported as n/a rather than guessed at.");
    out.push("");
    return out.join("\n");
}
const USAGE = `Usage: node bin/portfolio-health.mjs [--config <path>] [--out <file>]

  --config <path>  registry path (default "portfolio/repos.json")
  --out <file>     markdown report path (default "reports/portfolio-health.md")
  --help           print this usage
`;
function main() {
    const args = argv.slice(2);
    if (args.includes("--help")) {
        console.log(USAGE);
        return 0;
    }
    const configIdx = args.indexOf("--config");
    const outIdx = args.indexOf("--out");
    const configPath = configIdx >= 0 ? (args[configIdx + 1] ?? "portfolio/repos.json") : "portfolio/repos.json";
    const outPath = outIdx >= 0 ? (args[outIdx + 1] ?? "reports/portfolio-health.md") : "reports/portfolio-health.md";
    const entries = loadConfig(configPath).filter((e) => e.active);
    const rows = buildRows(entries);
    const report = renderReport(rows, new Date().toISOString());
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, report);
    const scored = rows.filter((r) => r.score !== null);
    console.log(`portfolio-health: ${entries.length} active repo(s), ${scored.length} scored, ${rows.length - scored.length} without local checkout.`);
    console.log(`Report written to ${outPath}`);
    return 0;
}
const invokedDirectly = argv[1]?.endsWith("portfolio-health.mjs");
if (invokedDirectly) {
    exit(main());
}
