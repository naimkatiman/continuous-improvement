// goal-state.mts — Pure goal-drift scorer for the Clear Goal discipline.
//
// No I/O. Turns a task_plan.md body + a list of recent observation rows into a
// DriftReport that says whether recent tool activity still relates to the
// stated goal. The MCP tool ci_goal_check (src/bin/mcp-server.mts) wires the
// file reads around these functions; keeping the logic pure lets the unit
// tests cover the scoring edges without touching the filesystem.
//
// Goal source: a markdown plan with a `## Goal` section (seeded by ci_plan_init).
// Two optional sections sharpen the signal:
//   ## Goal Keywords   — comma/newline list; overrides auto-extraction
//   ## Goal Scope       — `paths:` and `forbidden:` glob lists
// When ## Goal Keywords is absent, keywords are auto-extracted from the prose.
const STOPWORDS = new Set([
    "the", "and", "for", "with", "that", "this", "from", "into", "your", "will",
    "should", "must", "have", "has", "are", "was", "were", "but", "not", "all",
    "any", "can", "use", "using", "used", "via", "per", "out", "its", "their",
    "them", "then", "than", "when", "what", "which", "who", "how", "why", "where",
    "make", "made", "adds", "new", "get", "got", "set", "also", "only", "each",
    "task", "goal", "plan", "work", "working", "build", "building", "code",
]);
const KEYWORD_MIN_LENGTH = 4;
const KEYWORD_CAP = 20;
const DEFAULT_WINDOW = 30;
const DEFAULT_THRESHOLD = 0.3;
const MAX_MISMATCHES = 5;
/**
 * Extract the body of a `## Heading` section. Stops at the next heading of any
 * level. Heading match is case-insensitive on the trimmed text. Returns "" when
 * the section is absent or empty.
 */
export function getSection(markdown, heading) {
    const lines = markdown.split(/\r?\n/);
    const out = [];
    let inSection = false;
    const wanted = heading.trim().toLowerCase();
    for (const line of lines) {
        if (/^#{1,6}\s/.test(line)) {
            if (inSection)
                break;
            inSection = line.replace(/^#{1,6}\s+/, "").trim().toLowerCase() === wanted;
            continue;
        }
        if (inSection)
            out.push(line);
    }
    return out.join("\n").trim();
}
/**
 * Tokenize prose into goal keywords: lowercase, split on non-alphanumeric, drop
 * stopwords, pure-digit tokens, and tokens shorter than KEYWORD_MIN_LENGTH.
 * Deduped, capped at KEYWORD_CAP.
 */
export function extractKeywordsFromProse(prose) {
    const seen = new Set();
    const out = [];
    for (const raw of prose.toLowerCase().split(/[^a-z0-9]+/)) {
        const word = raw.trim();
        if (word.length < KEYWORD_MIN_LENGTH)
            continue;
        if (/^\d+$/.test(word))
            continue;
        if (STOPWORDS.has(word))
            continue;
        if (seen.has(word))
            continue;
        seen.add(word);
        out.push(word);
        if (out.length >= KEYWORD_CAP)
            break;
    }
    return out;
}
function parseKeywordList(body) {
    const seen = new Set();
    const out = [];
    for (const token of body.split(/[,\n]/)) {
        const word = token.replace(/^[-*\s]+/, "").trim().toLowerCase();
        if (!word || seen.has(word))
            continue;
        seen.add(word);
        out.push(word);
    }
    return out;
}
function parseScopeField(scopeBody, field) {
    for (const line of scopeBody.split(/\r?\n/)) {
        const match = line.match(/^\s*[-*]?\s*([A-Za-z_]+)\s*:\s*(.+)$/);
        if (match && match[1].toLowerCase() === field) {
            return match[2]
                .split(",")
                .map((glob) => glob.trim())
                .filter((glob) => glob.length > 0);
        }
    }
    return [];
}
/**
 * Parse a plan markdown into a GoalSpec. Returns null when there is no `## Goal`
 * section (the scorer needs a goal to score against).
 */
export function parseGoalFromPlan(planMarkdown) {
    const prose = getSection(planMarkdown, "Goal");
    if (!prose)
        return null;
    const keywordsSection = getSection(planMarkdown, "Goal Keywords");
    const scopeSection = getSection(planMarkdown, "Goal Scope");
    const parsedKeywords = keywordsSection ? parseKeywordList(keywordsSection) : [];
    // An empty/malformed Goal Keywords section (blank bullets, commas-only) must
    // degrade to prose extraction, exactly like an absent section — otherwise the
    // scorer runs with zero keywords and reports all on-goal work as drift.
    const keywords = parsedKeywords.length > 0 ? parsedKeywords : extractKeywordsFromProse(prose);
    return {
        prose,
        keywords,
        paths: scopeSection ? parseScopeField(scopeSection, "paths") : [],
        forbidden: scopeSection ? parseScopeField(scopeSection, "forbidden") : [],
    };
}
function globToRegExp(glob) {
    let re = "";
    for (let i = 0; i < glob.length; i += 1) {
        const char = glob[i];
        if (char === "*") {
            if (glob[i + 1] === "*") {
                re += ".*";
                i += 1;
                if (glob[i + 1] === "/")
                    i += 1;
            }
            else {
                re += "[^/]*";
            }
        }
        else if ("\\^$.|?+()[]{}".includes(char)) {
            re += `\\${char}`;
        }
        else {
            re += char;
        }
    }
    return new RegExp(`^${re}$`);
}
/**
 * Whether a (possibly absolute) path matches a relative glob. Tries the full
 * normalized path and every `/`-boundary suffix, so `src/auth/**` matches both
 * `src/auth/x.ts` and `/home/me/repo/src/auth/x.ts`.
 */
export function pathMatchesGlob(rawPath, glob) {
    const path = rawPath.replace(/\\/g, "/");
    const re = globToRegExp(glob);
    if (re.test(path))
        return true;
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i += 1) {
        if (re.test(parts.slice(i).join("/")))
            return true;
    }
    return false;
}
/**
 * Score the most recent `window` observations against the goal. An observation
 * "matches" when a goal keyword appears in its tool name / input / output, or
 * its input path falls under a `## Goal Scope` paths glob. An input under a
 * `forbidden` glob is a hard drift signal regardless of keywords.
 */
export function scoreObservations(observations, goal, opts = {}) {
    const window = opts.window && opts.window > 0 ? opts.window : DEFAULT_WINDOW;
    const threshold = typeof opts.threshold === "number" && Number.isFinite(opts.threshold)
        ? opts.threshold
        : DEFAULT_THRESHOLD;
    const recent = observations.slice(-window);
    const total = recent.length;
    if (total === 0) {
        return {
            status: "no-data",
            score: 0,
            threshold,
            matching: 0,
            forbidden: 0,
            total: 0,
            goalKeywords: goal.keywords,
            topMismatches: [],
            reason: "No observations in the window yet.",
        };
    }
    const keywords = goal.keywords.map((kw) => kw.toLowerCase()).filter((kw) => kw.length > 0);
    let matching = 0;
    let forbidden = 0;
    const mismatches = [];
    for (const obs of recent) {
        const input = (obs.input_summary ?? "").toString();
        const output = (obs.output_summary ?? "").toString();
        const tool = (obs.tool ?? "").toString();
        const haystack = `${tool}\n${input}\n${output}`.toLowerCase();
        const record = { ts: (obs.ts ?? "").toString(), tool, summary: input || output };
        const isForbidden = goal.forbidden.length > 0 &&
            input.length > 0 &&
            goal.forbidden.some((glob) => pathMatchesGlob(input, glob));
        if (isForbidden) {
            forbidden += 1;
            mismatches.push(record);
            continue;
        }
        const keywordHit = keywords.some((kw) => haystack.includes(kw));
        const pathHit = goal.paths.length > 0 &&
            input.length > 0 &&
            goal.paths.some((glob) => pathMatchesGlob(input, glob));
        if (keywordHit || pathHit) {
            matching += 1;
        }
        else {
            mismatches.push(record);
        }
    }
    const score = matching / total;
    let status;
    let reason;
    if (forbidden > 0) {
        status = "drift";
        reason = `${forbidden} of ${total} recent observations touched forbidden paths.`;
    }
    else if (score >= threshold) {
        status = "on-goal";
        reason = `${matching}/${total} recent observations relate to the goal (threshold ${threshold}).`;
    }
    else {
        status = "drift";
        reason = `Only ${matching}/${total} recent observations relate to the goal (threshold ${threshold}).`;
    }
    return {
        status,
        score,
        threshold,
        matching,
        forbidden,
        total,
        goalKeywords: goal.keywords,
        topMismatches: mismatches.slice(-MAX_MISMATCHES).reverse(),
        reason,
    };
}
/**
 * Render a DriftReport as a markdown block for the MCP tool output. Pure
 * string -> string so the formatting is unit-testable.
 */
export function formatDriftReport(report) {
    const label = report.status === "on-goal"
        ? "ON GOAL"
        : report.status === "drift"
            ? "DRIFT"
            : "NO DATA";
    const pct = Math.round(report.score * 100);
    const lines = [
        `**Status:** ${label}`,
        `**Score:** ${pct}% (${report.matching}/${report.total} matched, threshold ${Math.round(report.threshold * 100)}%)`,
        `**Reason:** ${report.reason}`,
    ];
    if (report.goalKeywords.length > 0) {
        lines.push(`**Goal keywords:** ${report.goalKeywords.join(", ")}`);
    }
    if (report.topMismatches.length > 0) {
        lines.push("", `**Top off-goal activity (most recent ${report.topMismatches.length}):**`);
        for (const mismatch of report.topMismatches) {
            const stamp = mismatch.ts ? `[${mismatch.ts}] ` : "";
            const summary = mismatch.summary.length > 100 ? `${mismatch.summary.slice(0, 100)}…` : mismatch.summary;
            lines.push(`- ${stamp}${mismatch.tool || "(tool?)"} — ${summary || "(no summary)"}`);
        }
    }
    if (report.status === "drift") {
        lines.push("", "_Drift detected. Either steer back to the goal, or update the `## Goal` section in your plan if the goal has legitimately changed._");
    }
    return lines.join("\n");
}
