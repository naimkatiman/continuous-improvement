// instinct-yaml.mts: the one parser for an instinct file
// (~/.claude/instincts/<project-hash>/<id>.yaml or ~/.claude/instincts/global/<id>.yaml).
//
// bin/mcp-server.mjs (ci_instincts, ci_reinforce, ci_distill_promote) and
// hooks/session.mjs (the SessionStart lesson block) both import it, so a file is
// an instinct, and has the confidence it has, by the same rules on both paths.
// The format is what writeInstinct in src/bin/mcp-server.mts writes: `key: value`
// lines, a `---` line, then the body. flatten() below is how both print a
// stored trigger or body to the model.
export function parseYamlInstinct(content) {
    // Windows PowerShell 5.1 writes UTF-8 with a byte order mark by default; left
    // in place it hides the `id:` key on the first line.
    const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    const lines = text.split("\n");
    const meta = {};
    let body = "";
    let inBody = false;
    for (const line of lines) {
        if (line.trim() === "---" && Object.keys(meta).length > 0) {
            inBody = true;
            continue;
        }
        if (inBody) {
            body += `${line}\n`;
            continue;
        }
        const match = line.match(/^(\w[\w_-]*):\s*(.+)/);
        if (!match) {
            continue;
        }
        const rawValue = match[2].trim().replace(/^["']|["']$/g, "");
        // A number may carry a trailing YAML comment ('confidence: 0.3  # demoted').
        // Text values keep theirs: a quoted trigger can contain " #".
        const numberText = rawValue.replace(/\s+#.*$/, "");
        const value = numberText !== "" && !Number.isNaN(Number(numberText))
            ? Number(numberText)
            : rawValue;
        meta[match[1]] = value;
    }
    if (typeof meta.id !== "string" || typeof meta.trigger !== "string") {
        return null;
    }
    return {
        id: meta.id,
        trigger: meta.trigger,
        body: body.trim(),
        confidence: typeof meta.confidence === "number" ? meta.confidence : 0.6,
        domain: typeof meta.domain === "string" ? meta.domain : undefined,
        source: typeof meta.source === "string" ? meta.source : undefined,
        scope: meta.scope === "global" || meta.scope === "project" ? meta.scope : undefined,
        project_id: typeof meta.project_id === "string" ? meta.project_id : undefined,
        created: typeof meta.created === "string" ? meta.created : undefined,
        last_seen: typeof meta.last_seen === "string" ? meta.last_seen : undefined,
        observation_count: typeof meta.observation_count === "number" ? meta.observation_count : undefined,
    };
}
// Only this much of a trigger or body (or `max`, when larger) is looked at
// before it is cut to fit.
const MAX_RAW_CHARS = 2000;
// Instinct text is data: a model wrote it, or it came from an imported pack.
// Wherever it is printed to the model (the SessionStart block, ci_instincts),
// each field becomes one line of plain text. Compatibility forms are folded (a
// full-width bracket becomes the ASCII one), invisible format characters are
// dropped, control characters and every kind of line break become a space, and
// angle brackets are escaped. A stored field can then neither close a system
// reminder nor start a line of its own. At most `max` characters are kept;
// pass Infinity to keep the whole field.
export function flatten(text, max) {
    const flat = text
        .slice(0, Math.max(max, MAX_RAW_CHARS))
        .normalize("NFKC")
        .replace(/[\p{Cf}\p{Cs}]+/gu, "")
        .replace(/[\p{Cc}\s]+/gu, " ")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .trim();
    if (flat.length <= max)
        return flat;
    return `${flat.slice(0, max - 3).replace(/[\uD800-\uDBFF]$/, "").trimEnd()}...`;
}
