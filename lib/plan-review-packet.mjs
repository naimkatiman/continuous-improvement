/**
 * plan-review-packet: turn a plan doc into a commentable review packet.
 *
 * Pure markdown transform — no IO. Splits a `docs/plans/*.md` plan into
 * anchored sections, extracts a TLDR, and renders a packet a reviewer can
 * comment on inline (one `> Comment (R#):` slot per section).
 */
const TLDR_HEADINGS = new Set(["goal", "summary", "overview", "tldr"]);
const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;
function normalize(markdown) {
    return markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
/** Split a plan into reviewable level-2/3 sections, each with a stable [R#] anchor. */
export function splitSections(markdown) {
    const lines = normalize(markdown).split("\n");
    const sections = [];
    let current = null;
    let counter = 0;
    const flush = () => {
        if (!current)
            return;
        counter += 1;
        sections.push({
            heading: current.heading,
            level: current.level,
            anchor: `R${counter}`,
            body: current.body.join("\n").trim(),
        });
        current = null;
    };
    for (const line of lines) {
        const match = HEADING_RE.exec(line);
        const level = match ? match[1].length : 0;
        if (level === 1) {
            flush();
        }
        else if (level === 2 || level === 3) {
            flush();
            current = { heading: match[2].trim(), level, body: [] };
        }
        else if (current) {
            current.body.push(line);
        }
    }
    flush();
    return sections;
}
/** First non-empty, non-heading paragraph of a block of markdown. */
function firstParagraph(text) {
    for (const block of text.split(/\n\s*\n/)) {
        const kept = block
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !/^#{1,6}(\s|$)/.test(l));
        if (kept.length > 0)
            return kept.join("\n");
    }
    return "";
}
/** Extract a one-glance TLDR: a Goal/Summary/Overview section, else the first paragraph. */
export function extractTldr(markdown) {
    const goal = splitSections(markdown).find((s) => TLDR_HEADINGS.has(s.heading.trim().toLowerCase()));
    if (goal)
        return firstParagraph(goal.body);
    return firstParagraph(normalize(markdown));
}
function extractTitle(markdown) {
    for (const line of normalize(markdown).split("\n")) {
        const match = /^#\s+(.*\S)\s*$/.exec(line);
        if (match)
            return match[1].trim();
    }
    return "Plan Review";
}
/** Render a commentable review packet from a plan doc. */
export function buildReviewPacket(markdown, options = {}) {
    const title = extractTitle(markdown);
    const tldr = extractTldr(markdown);
    const sections = splitSections(markdown);
    const out = [`# Review packet: ${title}`, ""];
    if (options.source)
        out.push(`Source: ${options.source}`);
    out.push(`TLDR: ${tldr || "(none — skim the sections below)"}`, "");
    out.push("> How to comment: reply under each `> Comment (R#):` line. The `[R#]` anchors are stable references you can cite back.", "", "---", "");
    if (sections.length === 0) {
        out.push("_No reviewable sections found in this plan._", "");
        return out.join("\n");
    }
    for (const section of sections) {
        out.push(`${"#".repeat(section.level)} ${section.heading} [${section.anchor}]`, "");
        if (section.body)
            out.push(section.body, "");
        out.push(`> Comment (${section.anchor}):`, "");
    }
    return out.join("\n");
}
