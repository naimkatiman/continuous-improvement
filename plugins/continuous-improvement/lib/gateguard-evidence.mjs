// gateguard-evidence.mts — Has this session looked at a file?
//
// The gateguard file gate (src/hooks/gateguard.mts) allows an edit of an
// existing file when the observation log shows the session looked at it. This
// file answers that from the rows src/bin/observe.mts writes, one JSON object
// per line:
//
//   { ts, event, session, tool, input_summary, output_summary, ... }
//
// What a summary holds is decided by src/lib/observe-event.mts, and three of
// its choices shape the comparison here:
//   - Read, Edit, Write and NotebookEdit store the path. MultiEdit and
//     NotebookRead store the tool input as JSON text, cut at 500 characters.
//   - Every summary is cut (500 characters in, 200 out), so a path or a name
//     that was cut off is not found. That errs on the side of the deny.
//   - Every summary went through the secret redactor, so a path with a
//     secret-shaped part (a long hex directory, say) is stored altered. The
//     target is passed through the observer's own summariser before it is
//     compared, which keeps the two in step.
//
// Only tool_complete rows count. An install that also observes PreToolUse
// writes a tool_start row for an edit the gate then denies, and that row is
// the blind attempt itself.
//
// Imported by the gateguard hook only. The plugin bundler copies lib files one
// by one (the copyFileTo list in src/bin/generate-plugin-manifests.mts), and
// this file and its import are on that list.
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { resolveInboundTool } from "./agent-profiles.mjs";
import { summariseInput } from "./observe-event.mjs";
import { parsePatchPaths } from "./patch-paths.mjs";
/** Tools that act on one file: the row counts when its recorded path is the target. */
const FILE_TOOLS = new Set(["Read", "Edit", "Write", "MultiEdit", "NotebookEdit", "NotebookRead"]);
/** Shell and search tools: the row counts when its command, pattern or output names the target. */
const MENTION_TOOLS = new Set(["Bash", "PowerShell", "Grep", "Glob"]);
// Other agents' rows carry their own tool names (lib/agent-profiles.mjs). The
// observer records a file alias by its path, a shell by its command and a patch
// by its text, and keeps a search alias's input as JSON. A patch row counts for
// the files its headers name, as a Write row counts for its file_path: a name
// in a new file's body is not a look at that file.
function isFileTool(tool) {
    const kind = resolveInboundTool(tool)?.kind;
    return FILE_TOOLS.has(tool) || kind === "file-read" || kind === "file-write";
}
function isPatchTool(tool) {
    return resolveInboundTool(tool)?.kind === "patch";
}
function isMentionTool(tool) {
    const kind = resolveInboundTool(tool)?.kind;
    return MENTION_TOOLS.has(tool) || kind === "shell" || kind === "search";
}
// Windows file names and drive letters do not distinguish case.
const IGNORE_CASE = process.platform === "win32";
const LINE_FEED = 0x0a;
// A path value inside a tool input stored as JSON text. An input cut before the
// closing quote does not match, so half a path is never compared.
const JSON_PATH_VALUE_RE = /"(?:file_path|notebook_path)":"((?:[^"\\]|\\.)*)"/g;
// One JSON string escape: \uXXXX, or a backslash and the character it escapes.
const JSON_ESCAPE_RE = /\\(?:u([0-9a-fA-F]{4})|(.))/g;
// A name that JSON.stringify writes differently from how it is spelled.
const ESCAPED_IN_JSON_RE = /["\\\u0000-\u001f]/;
// The characters a file name is made of, for the edges of a mention. A dot
// counts on the right only when more of a name follows it, so `a.ts.` at the
// end of a sentence is a mention of a.ts and `a.ts.bak` is not.
const NAME_CHARACTER = String.raw `\p{L}\p{N}_\-`;
/** What the observer writes for a path: redacted, then cut at its input budget. */
function asRecorded(path) {
    return summariseInput("Read", { file_path: path });
}
/**
 * One spelling per file: absolute against `cwd`, `.` and `..` resolved, and on
 * Windows one separator and one case. `resolve` does the separators there.
 */
function fileKey(path, cwd) {
    const absolute = resolve(cwd, path);
    return IGNORE_CASE ? absolute.toLowerCase() : absolute;
}
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function describeTarget(path, cwd) {
    const recorded = asRecorded(resolve(cwd, path));
    const base = basename(resolve(cwd, path));
    const names = [...new Set([base, asRecorded(base), basename(resolve(cwd, recorded))])].filter((name) => name !== "");
    const alternatives = names.map(escapeRegExp).join("|");
    return {
        path,
        key: fileKey(recorded, cwd),
        names,
        mention: names.length === 0
            ? null
            : new RegExp(`(?<![${NAME_CHARACTER}.])(?:${alternatives})(?![${NAME_CHARACTER}]|\\.[${NAME_CHARACTER}])`, IGNORE_CASE ? "iu" : "u"),
    };
}
/**
 * A cheap test a line has to pass before it is parsed: every row that can count
 * holds the base name of a target, in a path or in a mention. Null when that
 * cannot be read off the raw line, and then every row of the session is parsed.
 */
function buildPrefilter(targets) {
    const names = targets.flatMap((target) => target.names);
    const readable = targets.every((target) => target.names.length > 0) && !names.some((name) => ESCAPED_IN_JSON_RE.test(name));
    return readable ? new RegExp(names.map(escapeRegExp).join("|"), IGNORE_CASE ? "iu" : "u") : null;
}
function parseRow(line) {
    let parsed;
    try {
        parsed = JSON.parse(line);
    }
    catch {
        return null;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
        return null;
    const fields = parsed;
    const text = (value) => (typeof value === "string" ? value : "");
    return {
        session: text(fields.session),
        event: text(fields.event),
        tool: text(fields.tool),
        input_summary: text(fields.input_summary),
        output_summary: text(fields.output_summary),
    };
}
/**
 * The paths a file-tool row recorded. The summary is the path itself, or the
 * tool input as JSON text with the path inside it; both readings are returned
 * and the wrong one matches nothing.
 */
function recordedPaths(inputSummary) {
    const paths = inputSummary === "" ? [] : [inputSummary];
    for (const match of inputSummary.matchAll(JSON_PATH_VALUE_RE)) {
        try {
            const value = JSON.parse(`"${match[1]}"`);
            if (typeof value === "string" && value !== "")
                paths.push(value);
        }
        catch {
            // Not a JSON string after all.
        }
    }
    return paths;
}
/** JSON text with its string escapes undone. A line break becomes a space. */
function unescapeJsonText(text) {
    return text.replace(JSON_ESCAPE_RE, (_match, hex, escaped) => {
        if (hex !== undefined)
            return String.fromCharCode(Number.parseInt(hex, 16));
        return "nrtbf".includes(escaped) ? " " : escaped;
    });
}
/**
 * True when `summary` names the file. A summary of an object is JSON text, in
 * which a line break before the name is the two characters `\n` and the `n`
 * reads as part of a longer name, so the text is also tried with its escapes
 * undone. A raw command is tried as written first: `D:\repo\new.ts` has to
 * stay a path.
 */
function mentions(summary, mention) {
    if (summary === "")
        return false;
    if (mention.test(summary))
        return true;
    return summary.includes("\\") && mention.test(unescapeJsonText(summary));
}
function isEvidence(row, target, cwd) {
    if (isFileTool(row.tool)) {
        return recordedPaths(row.input_summary).some((path) => fileKey(path, cwd) === target.key);
    }
    if (isPatchTool(row.tool)) {
        return parsePatchPaths(row.input_summary).some((path) => fileKey(path, cwd) === target.key);
    }
    if (target.mention === null)
        return false;
    return mentions(row.input_summary, target.mention) || mentions(row.output_summary, target.mention);
}
/**
 * Which of `paths` this session has looked at, going by the observation log at
 * `logFile`. Returns the paths (as given) with a row to show for them, or null
 * when there is no log to read, in which case the caller cannot judge.
 *
 * A row counts when it is a completed call of this session and either a file
 * tool recorded the same file, a patch header named it, or a shell or search
 * tool named the file's base name in its command, pattern or output. Relative
 * paths, on either side, are resolved against `cwd`.
 *
 * The log is searched from its end and the search stops once every path is
 * accounted for. It runs before every edit of a file the session state does
 * not know, on a log of up to 10,000 rows, so the bytes are searched for the
 * session id and only the lines that hold it are decoded: decoding the whole
 * file costs more than everything else here put together.
 */
export function findEvidence(logFile, sessionId, cwd, paths) {
    let log;
    try {
        log = readFileSync(logFile);
    }
    catch {
        return null;
    }
    const seen = new Set();
    const targets = [...new Set(paths)].map((path) => describeTarget(path, cwd));
    const prefilter = buildPrefilter(targets);
    // JSON.stringify of the id is how the id sits in a row, whatever the spacing.
    // Inside a summary every quote is escaped, so a hit is a field of the row.
    const sessionNeedle = Buffer.from(JSON.stringify(sessionId), "utf8");
    let from = log.length;
    while (seen.size < targets.length) {
        const hit = log.lastIndexOf(sessionNeedle, from);
        if (hit === -1)
            break;
        const start = log.lastIndexOf(LINE_FEED, hit) + 1;
        const lineFeed = log.indexOf(LINE_FEED, hit);
        const line = log.toString("utf8", start, lineFeed === -1 ? log.length : lineFeed);
        const row = prefilter === null || prefilter.test(line) ? parseRow(line) : null;
        if (row !== null &&
            row.session === sessionId &&
            row.event === "tool_complete" &&
            (isFileTool(row.tool) || isPatchTool(row.tool) || isMentionTool(row.tool))) {
            for (const target of targets) {
                if (!seen.has(target.path) && isEvidence(row, target, cwd))
                    seen.add(target.path);
            }
        }
        if (start === 0)
            break;
        from = start - 1;
    }
    return seen;
}
