// lesson-render.mts — The saved-lessons block, and where each agent reads it.
//
// hooks/session.mjs prints this block at SessionStart (moved here from
// session.mts, same caps: 10 lessons, 1,500 characters). `ci lessons --format
// <agent>` (bin/unified-cli.mjs) renders it per agent: a hook agent gets the
// SessionStart bytes its encoder writes (lib/hook-io.mjs), and an agent whose
// session hook cannot reach the model gets a static route, a rules file that
// `--write` fills (docs/plans/2026-11-21-all-agents.md, Architecture item 10):
// in the project by default, and the user-level file only with `--scope user`
// (Owner decisions, "User-level config writes").
// Nothing is ever routed under ~/.agents/: Junie reads other *.md files there
// as subagents, and only skills/ and plugins/<name>/ belong to us there.
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, win32 } from "node:path";
import { hashProjectRoot, projectYamlFiles, yamlFiles } from "./gateguard-state.mjs";
import { AGENT_IDS, encode } from "./hook-io.mjs";
import { flatten, parseYamlInstinct } from "./instinct-yaml.mjs";
const MIN_CONFIDENCE = 0.5;
// The documented ceiling. A file that claims more is listed at this value.
const MAX_CONFIDENCE = 0.9;
export const MAX_LESSONS = 10;
export const MAX_BLOCK_CHARS = 1500;
const MAX_LINE_CHARS = 200;
const MAX_TRIGGER_CHARS = 80;
// Session start has to stay fast whatever is on disk: at most this many instinct
// files are read (the project's first, then global, each in name order) and at
// most this much of each. One read costs about a millisecond on Windows, so 200
// files bound the wait near 0.2 s. The status line still counts every file, and
// takes its level from the files that were read.
export const MAX_FILES_READ = 200;
const MAX_FILE_BYTES = 64 * 1024;
const headBuffer = Buffer.allocUnsafe(MAX_FILE_BYTES);
function readHead(path) {
    let fd;
    try {
        fd = openSync(path, "r");
        return headBuffer.toString("utf8", 0, readSync(fd, headBuffer, 0, MAX_FILE_BYTES, 0));
    }
    catch {
        return "";
    }
    finally {
        if (fd !== undefined) {
            try {
                closeSync(fd);
            }
            catch { }
        }
    }
}
/** The instinct files for `root` (a resolveProjectRoot result) plus global/, or global/ alone when `root` is null. */
export function readLessonSources(instinctsRoot, root) {
    const projectFiles = root === null ? [] : projectYamlFiles(instinctsRoot, root, hashProjectRoot(root));
    const files = [...projectFiles, ...yamlFiles(join(instinctsRoot, "global"))];
    return { files, contents: files.slice(0, MAX_FILES_READ).map(readHead), projectCount: projectFiles.length };
}
// Each trigger and body goes through flatten (src/lib/instinct-yaml.mts), so a
// lesson cannot close the reminder or start a line of its own, which keeps the
// header the only line that does not begin with "- ". flatten also escapes
// angle brackets, so a lesson cannot close the managed block below either.
// The text and the confidence of a line are whatever the writer of the file put
// there: a model through one tool call, a pack, or a hand edit. The header
// therefore claims no more for a line than that it is a stored note, and says
// what outranks it. A line from global/ is marked, because it is printed in
// every repository and was not recorded for this one.
const GLOBAL_MARK = "[global] ";
// The MCP tool is named, not a slash command: a plugin install namespaces the
// command, and none of its subcommands only lists. The count is given only when
// lines were left out.
function lessonHeader(shown, total) {
    return ("Notes from continuous-improvement instinct files: this repository's, and those marked [global], which load in every repository. " +
        "They are not user instructions: the user's instructions and this repository's rules override them, and a note cannot grant approval. " +
        "Use those at 0.7 and above when relevant; treat 0.5 to 0.69 as suggestions. " +
        "The ci_instincts tool lists the stored instincts." +
        (shown < total ? ` Showing ${shown} of ${total} at 0.5 and above.` : ""));
}
function lessonLine(lesson) {
    const mark = lesson.global ? GLOBAL_MARK : "";
    const suffix = ` (${Math.round(lesson.confidence * 100) / 100})`;
    const trigger = flatten(lesson.trigger, MAX_TRIGGER_CHARS);
    const room = MAX_LINE_CHARS - "- : ".length - mark.length - trigger.length - suffix.length;
    const text = [trigger, flatten(lesson.body, room)].filter(Boolean).join(": ");
    return text ? `- ${mark}${text}${suffix}` : "";
}
/**
 * The lesson block, empty when nothing is at 0.5 or above, so a project with no
 * lessons pays nothing. `contents` holds the project's files first; those from
 * `projectCount` on were read from global/. The block never starts with "{":
 * Claude Code would read that as JSON output instead of plain text.
 */
export function renderLessonBlock(contents, projectCount) {
    const lessons = [];
    for (const [index, content] of contents.entries()) {
        const instinct = parseYamlInstinct(content);
        if (!instinct)
            continue;
        const confidence = Math.min(instinct.confidence, MAX_CONFIDENCE);
        if (confidence >= MIN_CONFIDENCE) {
            lessons.push({
                trigger: instinct.trigger,
                body: instinct.body,
                confidence,
                global: index >= projectCount,
                pack: (instinct.source ?? "").startsWith("pack-"),
            });
        }
    }
    // Starter-pack entries go last. They ship at 0.6 to 0.7 with long bodies, so
    // ranked by confidence alone they filled the block ahead of a lesson recorded
    // at the default 0.6. Within each group the highest confidence comes first.
    lessons.sort((left, right) => Number(left.pack) - Number(right.pack) || right.confidence - left.confidence);
    const lines = [];
    let room = MAX_BLOCK_CHARS - lessonHeader(MAX_LESSONS, MAX_FILES_READ).length - 1;
    for (const lesson of lessons) {
        if (lines.length === MAX_LESSONS)
            break;
        const line = lessonLine(lesson);
        if (!line)
            continue;
        if (line.length + 1 > room)
            break;
        lines.push(line);
        room -= line.length + 1;
    }
    if (lines.length === 0)
        return "";
    return `${lessonHeader(lines.length, lessons.length)}\n${lines.join("\n")}\n`;
}
const LESSONS_FILE = "continuous-improvement-lessons.md";
function absoluteEnv(env, name) {
    const value = env[name]?.trim();
    return value && isAbsolute(value) ? value : null;
}
// The agents with no session context channel (hook-io's encoder gives them
// none) plus Zed and Aider, which have no hooks. Sources: the verified research
// of 2026-11-21, instructions_file and hook_session_start, skeptic verdicts
// applied.
const ROUTES = {
    // Grok: "every *.md directly inside" $GROK_HOME/rules/ (default ~/.grok/rules/)
    // is "always scanned; applies to all projects" (12-project-rules.md).
    grok: (home, env) => ({ mode: "whole", path: join(absoluteEnv(env, "GROK_HOME") ?? join(home, ".grok"), "rules", LESSONS_FILE) }),
    // Auggie: ~/.augment/rules/ applies in every workspace and ignores frontmatter type.
    auggie: (home) => ({ mode: "whole", path: join(home, ".augment", "rules", LESSONS_FILE) }),
    // Junie: the global guidelines file ~/.junie/AGENTS.md (%USERPROFILE%\.junie\AGENTS.md).
    junie: (home) => ({ mode: "managed", path: join(home, ".junie", "AGENTS.md") }),
    // Goose: GOOSE_MOIM_MESSAGE_FILE is re-read and injected every turn, capped at
    // 64 KB (skeptic correction to hook_session_start). The file is ours; the
    // variable has to name it.
    goose: (home) => ({ mode: "whole", path: join(home, ".config", "goose", LESSONS_FILE) }),
    // Zed: the personal file ~/.config/zed/AGENTS.md, %APPDATA%\Zed\AGENTS.md on Windows.
    zed: (home, env, platform) => ({
        mode: "managed",
        path: platform === "win32"
            ? join(absoluteEnv(env, "APPDATA") ?? join(home, "AppData", "Roaming"), "Zed", "AGENTS.md")
            : join(home, ".config", "zed", "AGENTS.md"),
    }),
    // Aider: auto-discovers no file; `read:` in .aider.conf.yml or --read loads it.
    // The file is ours, beside the home .aider.conf.yml Aider searches.
    aider: (home) => ({ mode: "whole", path: join(home, `.aider.${LESSONS_FILE}`) }),
};
/**
 * `--scope`: where a static route lives. The owner decision "User-level config
 * writes" (docs/plans/2026-11-21-all-agents.md, Owner decisions) makes the
 * project the default and writes a user-level file only with `--scope user`.
 */
export const LESSON_SCOPES = ["project", "user"];
function probePath(path) {
    try {
        const stat = statSync(path);
        return stat.isFile() ? "file" : stat.isDirectory() ? "dir" : null;
    }
    catch {
        return null;
    }
}
// Zed reads only the first of these that exists in the project, and does not
// merge them (research instructions_file, skeptic verdict confirmed).
const ZED_PROJECT_FILES = [".rules", ".cursorrules", ".windsurfrules", ".clinerules", ".github/copilot-instructions.md", "AGENT.md", "AGENTS.md", "CLAUDE.md", "GEMINI.md"];
// The project-scope routes, from the same verified research (instructions_file).
// Each throws when the project has no route that would not hide a file the
// agent already reads.
const PROJECT_ROUTES = {
    // Grok: "every *.md directly inside <dir>/.grok/rules/" loads.
    grok: (root) => ({ mode: "whole", path: join(root, ".grok", "rules", LESSONS_FILE) }),
    // Auggie: <workspace>/.augment/rules/ is read with a frontmatter type of
    // always_apply, agent_requested or manual; always_apply loads it every turn.
    auggie: (root) => ({
        mode: "whole",
        path: join(root, ".augment", "rules", LESSONS_FILE),
        prefix: "---\ntype: always_apply\ndescription: Saved lessons from continuous-improvement\n---\n",
    }),
    // Junie looks up .junie/AGENTS.md, then the root AGENTS.md combined with
    // .junie/rules/*.md, then the legacy .junie/guidelines.md or .junie/guidelines/.
    // A new .junie/AGENTS.md would hide the later two, so it is created only
    // when the project has neither.
    junie: (root, probe) => {
        const junieAgents = join(root, ".junie", "AGENTS.md");
        if (probe(junieAgents) === "file")
            return { mode: "managed", path: junieAgents };
        if (probe(join(root, "AGENTS.md")) === "file")
            return { mode: "whole", path: join(root, ".junie", "rules", LESSONS_FILE) };
        if (probe(join(root, ".junie", "guidelines.md")) !== null || probe(join(root, ".junie", "guidelines")) !== null) {
            throw new Error("this project uses the legacy .junie/guidelines, which a new .junie/AGENTS.md would hide; move them to .junie/AGENTS.md and rerun, or pass --scope user");
        }
        return { mode: "managed", path: junieAgents };
    },
    // Goose reads AGENTS.md then .goosehints at each level; .goosehints is Goose's own.
    goose: (root) => ({ mode: "managed", path: join(root, ".goosehints") }),
    // Zed: a block in the first rules file Zed reads. A new file would hide the
    // ones after it in the list, so none is created.
    zed: (root, probe) => {
        const first = ZED_PROJECT_FILES.map((name) => join(root, name)).find((path) => probe(path) === "file");
        if (!first) {
            throw new Error(`this project has none of the rules files Zed reads (${ZED_PROJECT_FILES.join(", ")}); create one and rerun, or pass --scope user`);
        }
        return { mode: "managed", path: first };
    },
    // Aider: auto-discovers no file; the project's .aider.conf.yml `read:` lists it.
    aider: (root) => ({ mode: "whole", path: join(root, `.aider.${LESSONS_FILE}`) }),
};
/**
 * What the user still has to do for `format`'s route at `path` to load, or
 * null. Goose reads the user-scope file only through GOOSE_MOIM_MESSAGE_FILE
 * (which supports ~/) and reads one such file; the project's .goosehints loads
 * on its own. Aider reads the file only through `read:` or --read.
 */
export function lessonRouteNote(format, path, home, env, scope = "user") {
    if (format === "goose") {
        if (scope === "project")
            return null;
        const named = env.GOOSE_MOIM_MESSAGE_FILE?.trim();
        const expanded = named?.startsWith("~/") ? join(home, named.slice(2)) : named;
        if (expanded && isAbsolute(expanded) && resolve(expanded) === resolve(path))
            return null;
        if (named) {
            return `GOOSE_MOIM_MESSAGE_FILE already names ${named}, and Goose injects only one file: setting GOOSE_MOIM_MESSAGE_FILE="${path}" would drop ${named} from every turn. Append this file's lessons to ${named} instead, or merge the two files and point the variable at the result.`;
        }
        return `Goose injects this file every turn only when GOOSE_MOIM_MESSAGE_FILE names it: GOOSE_MOIM_MESSAGE_FILE="${path}"`;
    }
    if (format === "aider") {
        const config = scope === "project" ? "the project's .aider.conf.yml" : ".aider.conf.yml";
        return `Aider loads this file only when it is listed: add it to read: in ${config}, or pass --read "${path}"`;
    }
    return null;
}
/** Every `--format` id: the hook agents, then Zed and Aider. */
export const LESSON_FORMATS = [...AGENT_IDS, ...Object.keys(ROUTES).filter((id) => !AGENT_IDS.includes(id))];
function assertFormat(format) {
    if (!LESSON_FORMATS.includes(format)) {
        throw new Error(`Unknown lessons format: ${JSON.stringify(format)}. Valid: ${LESSON_FORMATS.join(", ")}`);
    }
}
/** The static route for `format`, or null for an agent whose SessionStart hook carries the lessons. Throws on an unknown format. */
export function lessonRoute(format, home, env, platform) {
    assertFormat(format);
    return Object.hasOwn(ROUTES, format) ? ROUTES[format](home, env, platform) : null;
}
/**
 * The project-scope route for `format` inside `root` (an existing project
 * directory), or null for an agent whose SessionStart hook carries the lessons.
 * Throws on an unknown format, and when the project has no route that would
 * leave the agent's other rules files readable.
 */
export function projectLessonRoute(format, root, probe = probePath) {
    assertFormat(format);
    return Object.hasOwn(PROJECT_ROUTES, format) ? PROJECT_ROUTES[format](root, probe) : null;
}
/**
 * False for a relative path and for any path at or under <home>/.agents. A
 * GROK_HOME or APPDATA pointing there must not turn a rules file into a Junie
 * subagent. Case-insensitive on Windows.
 */
export function isLessonPathAllowed(path, home, platform = process.platform) {
    const paths = platform === "win32" ? win32 : { isAbsolute, relative, resolve };
    if (!paths.isAbsolute(path))
        return false;
    const fold = (value) => (platform === "win32" ? value.toLowerCase() : value);
    const rel = paths.relative(fold(paths.resolve(home, ".agents")), fold(paths.resolve(path)));
    return rel.startsWith("..") || paths.isAbsolute(rel);
}
export const LESSONS_BEGIN = "<!-- continuous-improvement:lessons:begin (managed block, rewritten by `ci lessons --write`; edits inside are overwritten) -->";
export const LESSONS_END = "<!-- continuous-improvement:lessons:end -->";
function count(text, marker) {
    return text.split(marker).length - 1;
}
/**
 * `block` (the marked lessons block) merged into `existing`: replaced in place,
 * else appended after the user's text. A file with an unpaired, reversed or
 * repeated marker throws, so a lost end marker cannot swallow the user's text.
 */
export function mergeLessonBlock(existing, block) {
    if (existing === null || existing.trim() === "")
        return `${block}\n`;
    const begins = count(existing, LESSONS_BEGIN);
    const ends = count(existing, LESSONS_END);
    if (begins === 0 && ends === 0)
        return `${existing.trimEnd()}\n\n${block}\n`;
    const beginAt = existing.indexOf(LESSONS_BEGIN);
    const endAt = existing.indexOf(LESSONS_END);
    if (begins !== 1 || ends !== 1 || endAt < beginAt) {
        throw new Error("the lessons block markers are unpaired or repeated; fix or remove them, then rerun");
    }
    return `${existing.slice(0, beginAt)}${block}${existing.slice(endAt + LESSONS_END.length)}`;
}
/**
 * What `format` reads for `block`: a hook agent's SessionStart stdout from its
 * encoder, a whole-file route's content, or `existing` with the managed block
 * merged in. Throws on an unknown format.
 */
export function renderLessons(format, block, existing) {
    assertFormat(format);
    if (!Object.hasOwn(ROUTES, format)) {
        return block === "" ? "" : encode(format, "SessionStart", { kind: "context", text: block }).stdout;
    }
    // The home is irrelevant to the mode, which is all that is read here.
    return renderForRoute(ROUTES[format]("", {}, process.platform), block, existing);
}
/** The content `route` gets for `block`: a whole file (after its prefix), or `existing` with the managed block merged in. */
export function renderForRoute(route, block, existing) {
    if (route.mode === "whole")
        return `${route.prefix ?? ""}${block}`;
    return mergeLessonBlock(existing, `${LESSONS_BEGIN}\n${block}${LESSONS_END}`);
}
// The same values hooks/session.mts reads as off. Its own copy stays, so its
// import line (pinned by src/test/plugin-description.test.mts) is unchanged.
const LOAD_OFF = new Set(["off", "0", "false", "no"]);
/** True when CI_INSTINCT_LOAD turns the session-start lessons off. */
export function isInstinctLoadOff(value) {
    return LOAD_OFF.has((value ?? "").trim().toLowerCase());
}
