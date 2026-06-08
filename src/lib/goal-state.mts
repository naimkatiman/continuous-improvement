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

const STOPWORDS = new Set<string>([
  "the", "and", "for", "with", "that", "this", "from", "into", "your", "will",
  "should", "must", "have", "has", "are", "was", "were", "but", "not", "all",
  "any", "can", "use", "using", "used", "via", "per", "out", "its", "their",
  "them", "then", "than", "when", "what", "which", "who", "how", "why", "where",
  "make", "made", "adds", "new", "get", "got", "set", "also", "only", "each",
  "task", "goal", "plan", "work", "working", "build", "building", "code",
]);

// 4 suits Latin/Cyrillic/Thai prose (Thai combining marks are now kept; see
// extractKeywordsFromProse regex). Korean Hangul words are typically 2-3 chars
// but represent full concepts, so they get a script-aware floor of 2.
const KEYWORD_MIN_LENGTH = 4;

function keywordMinLengthFor(word: string): number {
  if (/\p{Script=Hangul}/u.test(word)) return 2;
  return KEYWORD_MIN_LENGTH;
}
const KEYWORD_CAP = 20;
const DEFAULT_WINDOW = 30;
const DEFAULT_THRESHOLD = 0.3;
const MAX_MISMATCHES = 5;

export interface GoalSpec {
  prose: string;
  keywords: string[];
  paths: string[];
  forbidden: string[];
}

export interface GoalObservation {
  ts?: string;
  tool?: string;
  input_summary?: string;
  output_summary?: string;
}

export type DriftStatus = "on-goal" | "drift" | "no-data";

export interface Mismatch {
  ts: string;
  tool: string;
  summary: string;
}

export interface DriftReport {
  status: DriftStatus;
  score: number;
  threshold: number;
  matching: number;
  forbidden: number;
  total: number;
  goalKeywords: string[];
  topMismatches: Mismatch[];
  reason: string;
}

/**
 * Extract the body of a `## Heading` section. Stops at the next heading of any
 * level. Heading match is case-insensitive on the trimmed text. Returns "" when
 * the section is absent or empty.
 */
export function getSection(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let inSection = false;
  const wanted = heading.trim().toLowerCase();

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      if (inSection) break;
      inSection = line.replace(/^#{1,6}\s+/, "").trim().toLowerCase() === wanted;
      continue;
    }
    if (inSection) out.push(line);
  }

  return out.join("\n").trim();
}

/**
 * Tokenize prose into goal keywords: lowercase, split on any non-letter /
 * non-number / non-mark (Unicode-aware, so accented Latin / Cyrillic / CJK /
 * Thai survive), drop stopwords, pure-digit tokens, and tokens shorter than
 * KEYWORD_MIN_LENGTH. Deduped, capped at KEYWORD_CAP.
 */
export function extractKeywordsFromProse(prose: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of prose.toLowerCase().split(/[^\p{L}\p{N}\p{M}]+/u)) {
    const word = raw.trim();
    if (word.length < keywordMinLengthFor(word)) continue;
    if (/^\p{N}+$/u.test(word)) continue;
    if (STOPWORDS.has(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    out.push(word);
    if (out.length >= KEYWORD_CAP) break;
  }

  return out;
}

function parseKeywordList(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of body.split(/[,\n]/)) {
    const word = token.replace(/^[-*\s]+/, "").trim().toLowerCase();
    if (!word || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
  }
  return out;
}

function parseScopeField(scopeBody: string, field: string): string[] {
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
export function parseGoalFromPlan(planMarkdown: string): GoalSpec | null {
  const prose = getSection(planMarkdown, "Goal");
  if (!prose) return null;

  const keywordsSection = getSection(planMarkdown, "Goal Keywords");
  const scopeSection = getSection(planMarkdown, "Goal Scope");
  const parsedKeywords = keywordsSection ? parseKeywordList(keywordsSection) : [];
  // An empty/malformed Goal Keywords section (blank bullets, commas-only) must
  // degrade to prose extraction, exactly like an absent section — otherwise the
  // scorer runs with zero keywords and reports all on-goal work as drift.
  const keywords =
    parsedKeywords.length > 0 ? parsedKeywords : extractKeywordsFromProse(prose);

  return {
    prose,
    keywords,
    paths: scopeSection ? parseScopeField(scopeSection, "paths") : [],
    forbidden: scopeSection ? parseScopeField(scopeSection, "forbidden") : [],
  };
}

function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i += 1;
        if (glob[i + 1] === "/") i += 1;
      } else {
        re += "[^/]*";
      }
    } else if ("\\^$.|?+()[]{}".includes(char)) {
      re += `\\${char}`;
    } else {
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
export function pathMatchesGlob(rawPath: string, glob: string): boolean {
  const path = rawPath.replace(/\\/g, "/");
  const re = globToRegExp(glob);
  if (re.test(path)) return true;

  const parts = path.split("/");
  for (let i = 1; i < parts.length; i += 1) {
    if (re.test(parts.slice(i).join("/"))) return true;
  }
  return false;
}

/**
 * Score the most recent `window` observations against the goal. An observation
 * "matches" when a goal keyword appears in its tool name / input / output, or
 * its input path falls under a `## Goal Scope` paths glob. An input under a
 * `forbidden` glob is a hard drift signal regardless of keywords.
 */
export function scoreObservations(
  observations: GoalObservation[],
  goal: GoalSpec,
  opts: { window?: number; threshold?: number } = {},
): DriftReport {
  // Reject an explicitly-provided out-of-range window instead of silently
  // coercing it to the default — an operator typo (window=0, -5, 2.5) must not
  // read as "unset". An absent window legitimately means "use the default".
  if (opts.window !== undefined && (!Number.isInteger(opts.window) || opts.window <= 0)) {
    throw new RangeError(
      `window must be a positive integer; got ${opts.window}. Omit it to use the default of ${DEFAULT_WINDOW}.`,
    );
  }
  const window = opts.window ?? DEFAULT_WINDOW;
  const threshold =
    typeof opts.threshold === "number" && Number.isFinite(opts.threshold)
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
  const mismatches: Mismatch[] = [];

  for (const obs of recent) {
    const input = (obs.input_summary ?? "").toString();
    const output = (obs.output_summary ?? "").toString();
    const tool = (obs.tool ?? "").toString();
    const haystack = `${tool}\n${input}\n${output}`.toLowerCase();
    const record: Mismatch = { ts: (obs.ts ?? "").toString(), tool, summary: input || output };

    const isForbidden =
      goal.forbidden.length > 0 &&
      input.length > 0 &&
      goal.forbidden.some((glob) => pathMatchesGlob(input, glob));
    if (isForbidden) {
      forbidden += 1;
      mismatches.push(record);
      continue;
    }

    const keywordHit = keywords.some((kw) => haystack.includes(kw));
    const pathHit =
      goal.paths.length > 0 &&
      input.length > 0 &&
      goal.paths.some((glob) => pathMatchesGlob(input, glob));

    if (keywordHit || pathHit) {
      matching += 1;
    } else {
      mismatches.push(record);
    }
  }

  const score = matching / total;
  let status: DriftStatus;
  let reason: string;

  if (forbidden > 0) {
    status = "drift";
    reason = `${forbidden} of ${total} recent observations touched forbidden paths.`;
  } else if (score >= threshold) {
    status = "on-goal";
    reason = `${matching}/${total} recent observations relate to the goal (threshold ${threshold}).`;
  } else {
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
export function formatDriftReport(report: DriftReport): string {
  const label =
    report.status === "on-goal"
      ? "ON GOAL"
      : report.status === "drift"
        ? "DRIFT"
        : "NO DATA";
  const pct = Math.round(report.score * 100);

  const lines: string[] = [
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
    lines.push(
      "",
      "_Drift detected. Either steer back to the goal, or update the `## Goal` section in your plan if the goal has legitimately changed._",
    );
  }

  return lines.join("\n");
}
