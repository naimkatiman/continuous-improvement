// recall-briefing.mts — Pure decision core for the proactive recall-briefing hook.
//
// No I/O. Given (enabled, already-briefed, prompt, ranked recall hits), decides
// whether to inject a one-time-per-session "you've touched related work before"
// system-reminder and renders it. The hook (src/hooks/recall-briefing.mts) does
// the filesystem work — read the prompt, read observations.jsonl, build the BM25
// index (recall-index.mts), track per-session state — then calls decideBriefing.
// Keeping the decision pure lets the unit tests cover every gate and boundary
// (disabled / already-briefed / empty-or-short prompt / no hits / malformed
// input) without touching the filesystem, per the repo lesson that green gates
// do not prove boundary safety.
//
// This is an amplifier, not a gate: it never blocks a prompt. It only surfaces
// prior context so the agent reuses a past fix instead of re-deriving it. It is
// opt-in (the hook checks an env flag) and fires at most once per session.
export const DEFAULT_MAX_HITS = 3;
export const DEFAULT_MIN_PROMPT_LENGTH = 12;
/** Render ranked hits as a compact UserPromptSubmit system-reminder. Pure string. */
export function formatBriefing(hits) {
    const lines = [
        "<system-reminder>",
        "Recall briefing: this project has prior sessions that touched related work. Before re-deriving a fix, consider the `ci_recall` MCP tool (or `/recall`) for full context. Most relevant past activity:",
    ];
    for (const h of hits) {
        const stamp = h && h.ts ? `[${h.ts}] ` : "";
        const tool = (h && h.tool) || "(tool?)";
        const snippet = ((h && h.snippet) || "").replace(/\s+/g, " ").trim();
        lines.push(`- ${stamp}${tool}: ${snippet || "(no summary)"}`);
    }
    lines.push("</system-reminder>");
    return lines.join("\n");
}
/**
 * Decide whether to inject a recall briefing. Fails closed: any disabling
 * condition (opted out, already briefed, prompt below the noise floor, no hits,
 * malformed input) returns shouldBrief=false and never throws.
 */
export function decideBriefing(params) {
    const none = { shouldBrief: false, reminder: null };
    if (!params || params.enabled !== true)
        return none;
    if (params.alreadyBriefed === true)
        return none;
    const prompt = typeof params.prompt === "string" ? params.prompt : "";
    const minLen = typeof params.minPromptLength === "number" && params.minPromptLength >= 0
        ? params.minPromptLength
        : DEFAULT_MIN_PROMPT_LENGTH;
    if (prompt.trim().length < minLen)
        return none;
    const maxHits = typeof params.maxHits === "number" && params.maxHits > 0
        ? Math.floor(params.maxHits)
        : DEFAULT_MAX_HITS;
    const hits = Array.isArray(params.hits) ? params.hits.slice(0, maxHits) : [];
    if (hits.length === 0)
        return none;
    return { shouldBrief: true, reminder: formatBriefing(hits) };
}
