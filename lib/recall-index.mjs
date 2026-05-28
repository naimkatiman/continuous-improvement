// recall-index.mts — Pure BM25 episodic search over observation rows.
//
// No I/O. Turns a list of observation rows into a searchable in-memory index
// and answers ranked queries with redacted snippets. The MCP tool ci_recall
// (src/bin/mcp-server.mts) reads observations.jsonl and wires these functions;
// keeping the index pure lets the unit tests cover tokenization, ranking,
// recency filtering, and secret redaction without touching the filesystem.
//
// v1 is dependency-free (preserves the package's zero-runtime-deps property):
// the index is rebuilt per query from the row list. At current observation
// volumes (well under 100k rows) the rebuild is sub-50ms; a node:sqlite FTS5
// migration is a follow-up if volumes grow.
const STOPWORDS = new Set([
    "the", "and", "for", "with", "that", "this", "from", "into", "your", "are",
    "was", "were", "but", "not", "all", "any", "can", "its", "out", "has", "had",
]);
const TOKEN_MIN_LENGTH = 2;
const BM25_K1 = 1.5;
const BM25_B = 0.75;
const DEFAULT_K = 5;
const SNIPPET_RADIUS = 60;
/** Lowercase, split on non-alphanumeric, drop stopwords and tokens shorter than TOKEN_MIN_LENGTH. */
export function tokenize(text) {
    const out = [];
    for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
        if (raw.length < TOKEN_MIN_LENGTH)
            continue;
        if (STOPWORDS.has(raw))
            continue;
        out.push(raw);
    }
    return out;
}
/**
 * Redact common secret shapes from a snippet before it is surfaced. Conservative
 * by design: matches AWS access keys, JWT-shaped triplets, bearer tokens,
 * KEY/SECRET/TOKEN/PASSWORD assignments, and long hex strings. Applied to every
 * snippet returned by query().
 */
export function redactSecrets(text) {
    return text
        .replace(/AKIA[0-9A-Z]{16}/g, "AKIA<redacted>")
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]{20,}=*/gi, "Bearer <redacted>")
        .replace(/\b([A-Za-z][A-Za-z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD))(\s*[:=]\s*)(\S+)/gi, "$1$2<redacted>")
        .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "<jwt-redacted>")
        .replace(/\b[a-f0-9]{32,}\b/gi, "<hex-redacted>");
}
function docText(obs) {
    return [obs.tool ?? "", obs.input_summary ?? "", obs.output_summary ?? ""]
        .filter((part) => part.length > 0)
        .join("  ");
}
/** Build an in-memory BM25 index from a list of observation rows. */
export function buildIndex(observations) {
    const docs = [];
    const df = new Map();
    let totalLength = 0;
    observations.forEach((obs, index) => {
        const text = docText(obs);
        const tokens = tokenize(text);
        const tf = new Map();
        for (const token of tokens) {
            tf.set(token, (tf.get(token) ?? 0) + 1);
        }
        for (const term of tf.keys()) {
            df.set(term, (df.get(term) ?? 0) + 1);
        }
        docs.push({ obs, index, text, tf, length: tokens.length });
        totalLength += tokens.length;
    });
    return {
        docs,
        df,
        avgdl: docs.length > 0 ? totalLength / docs.length : 0,
        n: docs.length,
    };
}
function idf(index, term) {
    const df = index.df.get(term) ?? 0;
    return Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
}
function scoreDoc(index, doc, queryTerms) {
    let score = 0;
    for (const term of queryTerms) {
        const freq = doc.tf.get(term);
        if (!freq)
            continue;
        const denom = freq + BM25_K1 * (1 - BM25_B + (BM25_B * doc.length) / (index.avgdl || 1));
        score += idf(index, term) * ((freq * (BM25_K1 + 1)) / denom);
    }
    return score;
}
/** Parse an ISO timestamp or a relative window ("7d", "24h", "30m") into a cutoff epoch-ms. */
export function parseSince(since, now) {
    const relative = since.trim().match(/^(\d+)\s*([dhm])$/i);
    if (relative) {
        const amount = Number(relative[1]);
        const unit = relative[2].toLowerCase();
        const ms = unit === "d" ? 86_400_000 : unit === "h" ? 3_600_000 : 60_000;
        return now - amount * ms;
    }
    const parsed = Date.parse(since);
    return Number.isNaN(parsed) ? null : parsed;
}
function obsSession(obs) {
    return (obs.session ?? obs.session_id ?? "").toString();
}
function makeSnippet(text, queryTerms) {
    const lower = text.toLowerCase();
    let pos = -1;
    for (const term of queryTerms) {
        const found = lower.indexOf(term);
        if (found !== -1 && (pos === -1 || found < pos))
            pos = found;
    }
    if (pos === -1)
        pos = 0;
    const start = Math.max(0, pos - SNIPPET_RADIUS);
    const end = Math.min(text.length, pos + SNIPPET_RADIUS);
    let snippet = text.slice(start, end);
    if (start > 0)
        snippet = `…${snippet}`;
    if (end < text.length)
        snippet = `${snippet}…`;
    return redactSecrets(snippet);
}
/**
 * Rank observations against a query with BM25. Results are sorted by score
 * descending, ties broken by recency (ts descending). `since` filters out rows
 * older than an ISO timestamp or relative window. Snippets are redacted.
 */
export function query(index, queryString, opts = {}) {
    const queryTerms = [...new Set(tokenize(queryString))];
    if (queryTerms.length === 0)
        return [];
    const k = opts.k && opts.k > 0 ? opts.k : DEFAULT_K;
    const cutoff = opts.since ? parseSince(opts.since, opts.now ?? Date.now()) : null;
    const hits = [];
    for (const doc of index.docs) {
        const ts = (doc.obs.ts ?? "").toString();
        if (cutoff !== null && ts) {
            const tsMs = Date.parse(ts);
            if (!Number.isNaN(tsMs) && tsMs < cutoff)
                continue;
        }
        const score = scoreDoc(index, doc, queryTerms);
        if (score <= 0)
            continue;
        hits.push({
            ts,
            session: obsSession(doc.obs),
            tool: (doc.obs.tool ?? "").toString(),
            snippet: makeSnippet(doc.text, queryTerms),
            score,
            index: doc.index,
        });
    }
    hits.sort((a, b) => (b.score !== a.score ? b.score - a.score : b.ts.localeCompare(a.ts)));
    return hits.slice(0, k);
}
/** Render ranked hits as a markdown block for the MCP tool output. Pure string -> string. */
export function formatRecallHits(hits, queryString) {
    if (hits.length === 0) {
        return `No past observations matched "${queryString}". Try broader or different terms — recall is lexical, not semantic.`;
    }
    const lines = [`## Recall: "${queryString}"`, "", `${hits.length} match(es), most relevant first:`, ""];
    for (const hit of hits) {
        const stamp = hit.ts ? `[${hit.ts}] ` : "";
        lines.push(`- ${stamp}**${hit.tool || "(tool?)"}** (score ${hit.score.toFixed(2)})`);
        lines.push(`  ${hit.snippet || "(no summary)"}`);
    }
    return lines.join("\n");
}
