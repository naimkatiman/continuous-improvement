#!/usr/bin/env node
/**
 * /companion-preference status — read & aggregate hook telemetry.
 *
 * Reads ~/.claude/instincts/<project-hash>/companion-preference.jsonl
 * (or an explicit path via --path), groups events by ci_skill within the
 * configured window (default 7 days), and prints a summary report with
 * per-skill totals, action breakdown, and companion_installed%.
 *
 * Usage:
 *   node bin/companion-preference-status.mjs              # last 7 days, human
 *   node bin/companion-preference-status.mjs --days 30    # 30-day window
 *   node bin/companion-preference-status.mjs --all        # whole file, no window
 *   node bin/companion-preference-status.mjs --json       # machine-readable JSON
 *   node bin/companion-preference-status.mjs --path <p>   # override JSONL path
 *
 * Exit codes:
 *   0 — report rendered (including the "no telemetry recorded yet" case)
 *   1 — argument parse error or unexpected runtime failure
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { argv, exit, stdout } from "node:process";
const ACTIONS = [
    "observation",
    "advisory",
    "block",
    "block-not-installed",
];
function parseArgs(args) {
    const out = { days: 7, all: false, json: false, path: null };
    for (let i = 0; i < args.length; i += 1) {
        const a = args[i];
        if (a === "--days") {
            const v = Number(args[++i]);
            if (!Number.isFinite(v) || v <= 0) {
                process.stderr.write(`--days requires a positive integer (got ${args[i]})\n`);
                exit(1);
            }
            out.days = v;
        }
        else if (a === "--all") {
            out.all = true;
            out.days = null;
        }
        else if (a === "--json") {
            out.json = true;
        }
        else if (a === "--path") {
            out.path = args[++i] ?? null;
            if (!out.path) {
                process.stderr.write(`--path requires a value\n`);
                exit(1);
            }
        }
        else if (a === "--help" || a === "-h") {
            printHelp();
            exit(0);
        }
        else if (a !== undefined) {
            process.stderr.write(`unknown argument: ${a}\n`);
            exit(1);
        }
    }
    return out;
}
function printHelp() {
    stdout.write([
        "Usage: companion-preference-status [options]",
        "",
        "Options:",
        "  --days N       Only count events from the last N days (default 7)",
        "  --all          Ignore the window; count every row in the file",
        "  --json         Emit a machine-readable JSON report",
        "  --path <file>  Override the default JSONL path (testing)",
        "  -h, --help     Print this help",
        "",
    ].join("\n"));
}
function resolveProjectRoot() {
    const fromEnv = process.env.CLAUDE_PROJECT_DIR;
    if (fromEnv)
        return fromEnv;
    try {
        const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        if (root)
            return root;
    }
    catch {
        // not in a git repo
    }
    return "global";
}
function defaultJsonlPath() {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? homedir();
    const hash = createHash("sha256")
        .update(resolveProjectRoot())
        .digest("hex")
        .slice(0, 12);
    return join(home, ".claude", "instincts", hash, "companion-preference.jsonl");
}
function parseJsonl(raw) {
    const rows = [];
    let parseErrors = 0;
    for (const line of raw.split(/\r?\n/)) {
        if (line.trim().length === 0)
            continue;
        try {
            rows.push(JSON.parse(line));
        }
        catch {
            parseErrors += 1;
        }
    }
    return { rows, parseErrors };
}
function aggregate(rows) {
    const bySkill = {};
    const byMode = {};
    const installedYes = {};
    for (const row of rows) {
        const stats = (bySkill[row.ci_skill] ??= {
            total: 0,
            actions: {},
            installed_pct: null,
        });
        stats.total += 1;
        stats.actions[row.action] = (stats.actions[row.action] ?? 0) + 1;
        if (row.companion_installed) {
            installedYes[row.ci_skill] = (installedYes[row.ci_skill] ?? 0) + 1;
        }
        byMode[row.mode] = (byMode[row.mode] ?? 0) + 1;
    }
    for (const [skill, stats] of Object.entries(bySkill)) {
        stats.installed_pct =
            stats.total > 0
                ? Math.round(((installedYes[skill] ?? 0) * 100) / stats.total)
                : null;
    }
    return { bySkill, byMode };
}
function pad(s, width) {
    return s.length >= width ? s : s + " ".repeat(width - s.length);
}
function rpad(n, width) {
    const s = String(n);
    return s.length >= width ? s : " ".repeat(width - s.length) + s;
}
function formatHuman(report) {
    const lines = [];
    const windowLabel = report.window_days === null ? "all-time" : `last ${report.window_days} days`;
    lines.push(`Companion-preference telemetry — ${windowLabel}`);
    lines.push(`File:   ${report.file}`);
    if (report.since)
        lines.push(`Window: ${report.since} to ${new Date().toISOString()}`);
    lines.push("");
    if (report.total_events === 0) {
        lines.push("No events in window.");
    }
    else {
        const skillWidth = Math.max(8, ...Object.keys(report.by_skill).map((k) => k.length));
        const header = pad("ci_skill", skillWidth) +
            "  " +
            ["total", "observation", "advisory", "block", "block-not-installed", "installed%"]
                .map((h) => rpad(h, h.length))
                .join("  ");
        lines.push(header);
        for (const [skill, stats] of Object.entries(report.by_skill).sort((a, b) => b[1].total - a[1].total)) {
            const cells = [
                rpad(stats.total, "total".length),
                rpad(stats.actions.observation ?? 0, "observation".length),
                rpad(stats.actions.advisory ?? 0, "advisory".length),
                rpad(stats.actions.block ?? 0, "block".length),
                rpad(stats.actions["block-not-installed"] ?? 0, "block-not-installed".length),
                rpad(stats.installed_pct === null ? "—" : `${stats.installed_pct}`, "installed%".length),
            ].join("  ");
            lines.push(pad(skill, skillWidth) + "  " + cells);
        }
    }
    lines.push("");
    const modeEntries = Object.entries(report.by_mode);
    if (modeEntries.length > 0) {
        lines.push(`Mode totals: ${modeEntries.map(([k, v]) => `${k} ${v}`).join(", ")}`);
    }
    lines.push(`Total events: ${report.total_events}`);
    if (report.parse_errors > 0)
        lines.push(`Parse errors (skipped): ${report.parse_errors}`);
    return lines.join("\n") + "\n";
}
function main() {
    const args = parseArgs(argv.slice(2));
    const filePath = args.path ?? defaultJsonlPath();
    if (!existsSync(filePath)) {
        stdout.write(`Companion-preference telemetry: no telemetry recorded yet at ${filePath}\n`);
        exit(0);
    }
    const raw = readFileSync(filePath, "utf8");
    const { rows, parseErrors } = parseJsonl(raw);
    const cutoff = args.all || args.days === null
        ? null
        : new Date(Date.now() - args.days * 24 * 3600 * 1000).toISOString();
    const filtered = cutoff === null ? rows : rows.filter((r) => r.ts >= cutoff);
    const { bySkill, byMode } = aggregate(filtered);
    const report = {
        file: filePath,
        window_days: args.all ? null : args.days,
        since: cutoff,
        total_events: filtered.length,
        parse_errors: parseErrors,
        by_skill: bySkill,
        by_mode: byMode,
    };
    if (args.json) {
        stdout.write(JSON.stringify(report, null, 2) + "\n");
    }
    else {
        stdout.write(formatHuman(report));
    }
    exit(0);
}
const invokedDirectly = argv[1]?.endsWith("companion-preference-status.mjs");
if (invokedDirectly) {
    main();
}
export { ACTIONS, aggregate, parseArgs, parseJsonl, };
