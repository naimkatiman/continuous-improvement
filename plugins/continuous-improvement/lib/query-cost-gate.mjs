/**
 * Pure helpers for the query-cost nudge Stop hook (RISA 5 / G5).
 *
 * The hook (src/hooks/query-cost-nudge.mts) does the I/O — git, the per-session
 * dedup marker, emitting the reminder. Everything here is pure and unit-tested.
 *
 * Opt-in via CLAUDE_QUERY_COST_NUDGE=on (default off). When on and the working
 * tree has changed DB/query files at turn end, the hook injects a once-per-session
 * reminder (via Stop `additionalContext`) to run a D1-aware cost audit before
 * finishing — the surprise-D1-bill class the insights flagged. Never blocks.
 */
export function resolveQueryCostNudge(raw) {
    return (raw ?? "").trim().toLowerCase() === "on" ? "on" : "off";
}
// DB / query source paths. Case-insensitive; the caller passes forward-slash
// paths straight from `git diff --name-only` (git always uses forward slashes).
const QUERY_PATH_RES = [
    /\.sql$/i,
    /\.prisma$/i,
    /(^|\/)migrations?\//i,
    /(^|\/)db\//i,
    /(^|\/)schema\.(ts|js|mjs|cjs|cts|mts|prisma|sql)$/i,
    /drizzle/i,
];
export function isQueryPath(filePath) {
    const path = (filePath ?? "").replace(/\\/g, "/").trim();
    if (path === "")
        return false;
    return QUERY_PATH_RES.some((re) => re.test(path));
}
export function parseChangedFiles(gitOutput) {
    return (gitOutput ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}
export function changedQueryPaths(files) {
    return files.filter((file) => isQueryPath(file));
}
export function buildQueryCostReminder(paths) {
    const list = paths.slice(0, 8).map((path) => path.replace(/\\/g, "/")).join(", ");
    return [
        "<system-reminder>",
        `Query-cost check: you changed DB/query file(s) this session (${list}).`,
        "Before finishing, audit cost — dispatch the database-reviewer agent, or check directly:",
        "  - EXPLAIN QUERY PLAN each new/changed query; no full table SCAN on a hot path.",
        "  - Every WHERE / JOIN / ORDER BY column is index-covered; no N+1 loops.",
        "  - D1: rows_read is billed per row SCANNED (not returned) — add covering indexes and cache hot reads (KV) instead of re-querying.",
        "  - No unbounded query — add LIMIT / pagination.",
        "One-time per-session reminder (CLAUDE_QUERY_COST_NUDGE).",
        "</system-reminder>",
    ].join("\n");
}
