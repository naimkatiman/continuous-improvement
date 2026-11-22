#!/usr/bin/env node
/**
 * README images
 *
 * Draws the README's images under assets/readme/ as SVG: the terminal cards
 * from the real runs in demo/captures/demos.json (written by
 * bin/capture-readme-demos.mjs), and the two diagrams. Every line a card shows
 * as output is looked up in the capture first, and drawing fails when it is
 * not there, so a card cannot show output nobody ran. Monospace is kept for
 * commands, paths and captured output. The agents map is drawn
 * by bin/check-agent-matrix.mjs from the support table instead.
 *
 * Usage:
 *   node bin/render-readme-assets.mjs            # exit 1 when a committed image differs
 *   node bin/render-readme-assets.mjs --write    # redraw every image
 *
 * GitHub and npm load these files by relative path from the default branch, so
 * an image must be merged before the release that references it.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { argv, cwd, exit } from "node:process";
import { pathToFileURL } from "node:url";
import { CAPTURE_FILE } from "./capture-readme-demos.mjs";
import { IMAGE_WIDTH, PAD, arrow, charsFit, rect, richText, svgDocument, text, wrap, wrapRanges } from "../lib/readme-svg.mjs";
export const ASSET_DIR = "assets/readme";
/** Every string a demo holds, raw and with each JSON line's string values decoded. */
export function demoCorpus(demo) {
    const parts = [];
    const strings = (value) => {
        if (typeof value === "string")
            parts.push(value);
        else if (Array.isArray(value))
            value.forEach(strings);
        else if (value !== null && typeof value === "object")
            Object.values(value).forEach(strings);
    };
    for (const step of demo.steps) {
        parts.push(step.label, step.run, `exit ${step.exit}`, ...(step.files ?? []));
        for (const field of [step.stdin ?? "", step.stdout, step.stderr]) {
            parts.push(field);
            for (const line of field.split("\n")) {
                try {
                    strings(JSON.parse(line));
                }
                catch {
                    // a plain text line is already in the corpus
                }
            }
        }
    }
    return parts.join("\n");
}
function demoById(capture, id) {
    const demo = capture.demos.find((d) => d.id === id);
    if (!demo)
        throw new Error(`${CAPTURE_FILE} has no demo "${id}"; run \`node bin/capture-readme-demos.mjs\``);
    return demo;
}
function stepOf(demo, label) {
    const step = demo.steps.find((s) => s.label === label);
    if (!step)
        throw new Error(`demo ${demo.id} has no step "${label}"`);
    return step;
}
/** The string value at `key` in the first JSON line of the output. */
function jsonField(output, ...keys) {
    for (const line of output.split("\n")) {
        let at;
        try {
            at = JSON.parse(line);
        }
        catch {
            continue;
        }
        for (const key of keys)
            at = at !== null && typeof at === "object" ? at[key] : undefined;
        if (typeof at === "string")
            return at;
    }
    throw new Error(`no ${keys.join(".")} in ${output.slice(0, 80)}`);
}
/** The `"key":"deny"` pair an agent's reply carries, exactly as printed. */
function decision(output) {
    const match = /"(?:permissionDecision|decision|permission)":"deny"/.exec(output);
    if (!match)
        throw new Error(`no deny decision in ${output.slice(0, 80)}`);
    return match[0];
}
function firstLine(text, starting) {
    const line = text.split("\n").find((l) => l.startsWith(starting));
    if (line === undefined)
        throw new Error(`no line starting "${starting}"`);
    return line;
}
const isQuietAllow = (step) => step.exit === 0 && step.stdout === "" && step.stderr === "";
const out = (t, tone = "tx", extra = {}) => ({ text: t, tone, mono: true, evidence: true, ...extra });
const label = (t, tone = "tx", extra = {}) => ({ text: t, tone, mono: false, evidence: false, ...extra });
// Monospace is for commands, paths and captured output; explanations are in the sans face.
const LINE = { mono: 18, sans: 18, height: 26 };
const TITLE = 22;
const INNER = IMAGE_WIDTH - 2 * PAD - 32;
/**
 * A captured line as plain text plus its bold ranges. With `md`, a Markdown
 * heading loses its `#` marks and is bold, and each `**x**` is drawn bold
 * without the asterisks. The evidence check reads the raw line, not this.
 */
function plainOf(line) {
    if (!line.md)
        return { plain: line.text, bold: line.bold ? [[0, line.text.length]] : [] };
    const heading = /^#+\s+(.*)$/.exec(line.text);
    if (heading)
        return { plain: heading[1], bold: [[0, heading[1].length]] };
    const parts = line.text.split("**");
    if (parts.length % 2 === 0)
        return { plain: line.text, bold: line.bold ? [[0, line.text.length]] : [] };
    let plain = "";
    const bold = [];
    parts.forEach((part, i) => {
        if (i % 2 === 1 || line.bold)
            bold.push([plain.length, plain.length + part.length]);
        plain += part;
    });
    return { plain, bold };
}
function spansIn(plain, bold, from, to) {
    const cuts = new Set([from, to]);
    for (const [a, b] of bold)
        for (const at of [a, b])
            if (at > from && at < to)
                cuts.add(at);
    const points = [...cuts].sort((x, y) => x - y);
    const spans = [];
    for (let i = 0; i + 1 < points.length; i++) {
        const [a, b] = [points[i], points[i + 1]];
        const isBold = bold.some(([s, e]) => a >= s && b <= e);
        spans.push({ text: plain.slice(a, b), bold: isBold });
    }
    return spans;
}
/**
 * Wrap a line to the card. The prefix stays on the first piece and the suffix
 * on the last; a continuation is indented under the text after the line's
 * indent and bullet, and by at least two spaces.
 */
function layout(lines) {
    return lines.flatMap((line) => {
        const { plain, bold } = plainOf(line);
        const size = line.mono ? LINE.mono : LINE.sans;
        const max = charsFit(INNER, size, line.mono ? "mono" : line.bold ? "bold" : "sans");
        const prefix = line.prefix ?? "";
        const lead = /^\s*(?:[-·ℹ•]\s+)?/.exec(plain)?.[0].length ?? 0;
        const hang = " ".repeat(Math.max(2, prefix.length + lead));
        const ranges = plain === "" ? [[0, 0]] : wrapRanges(plain, Math.max(8, max - prefix.length), Math.max(8, max - hang.length));
        return ranges.map(([a, b], i) => {
            const spans = [];
            if (i === 0 && prefix !== "")
                spans.push({ text: prefix, bold: line.bold });
            if (i > 0)
                spans.push({ text: hang });
            spans.push(...spansIn(plain, bold, a, b));
            if (i === ranges.length - 1 && line.suffix)
                spans.push({ text: line.suffix });
            return { spans, tone: line.tone, mono: line.mono };
        });
    });
}
function drawLine(x, y, line) {
    return richText(x, y, line.mono ? LINE.mono : LINE.sans, `${line.tone}${line.mono ? " mono" : ""}`, line.spans);
}
/** A terminal card: a title, then sections of lines on a panel. */
function card(file, demo, title, desc, sections) {
    const body = [];
    let y = PAD + TITLE;
    body.push(text(PAD, y, TITLE, "tx b", title));
    y += 16;
    const evidence = sections.flatMap((s) => s.lines.filter((l) => l.evidence && l.text.trim() !== "").map((l) => l.text.trim()));
    const laid = sections.map((s) => ({ heading: s.heading, lines: layout(s.lines) }));
    const panelTop = y;
    const panelH = laid.reduce((h, s) => h + (s.heading === undefined ? 0 : LINE.height + 6) + s.lines.length * LINE.height + 18, 14);
    body.push(rect(PAD, panelTop, IMAGE_WIDTH - 2 * PAD, panelH, "panel"));
    y += 14;
    laid.forEach((s, i) => {
        if (i > 0)
            body.push(`<line x1="${PAD + 16}" y1="${y - 4}" x2="${IMAGE_WIDTH - PAD - 16}" y2="${y - 4}" class="rule" stroke-width="1"/>`);
        if (s.heading !== undefined) {
            y += LINE.height;
            body.push(text(PAD + 16, y, LINE.sans, "tx b", s.heading));
            y += 6;
        }
        for (const line of s.lines) {
            y += LINE.height;
            body.push(drawLine(PAD + 16, y, line));
        }
        y += 18;
    });
    y = panelTop + panelH + PAD;
    return { file, demos: [demo.id], evidence, svg: svgDocument({ height: y, title, desc, body }) };
}
/** The hero: one force push, six agents' replies from one hook file, and git status allowed on all six. */
function forcePushCard(capture) {
    const deny = demoById(capture, "force-push");
    const allow = demoById(capture, "git-status");
    const command = jsonField(deny.steps[0].stdin ?? "", "tool_input", "command");
    if (!allow.steps.every(isQuietAllow))
        throw new Error("git-status: a step printed something or exited non-zero");
    const evidence = [command];
    const body = [];
    const title = "One hook file, six agents, the same refusal";
    const right = IMAGE_WIDTH - PAD - 16;
    let y = PAD + TITLE;
    body.push(text(PAD, y, TITLE, "tx b", title));
    y += 16;
    body.push(rect(PAD, y, IMAGE_WIDTH - 2 * PAD, 48, "panel"));
    body.push(richText(PAD + 16, y + 31, 20, "tx mono", [{ text: "$ " }, { text: command, bold: true }]));
    y += 48 + 30;
    body.push(text(PAD + 16, y, LINE.sans, "mute", "Agent"));
    body.push(text(right, y, LINE.sans, "mute", "How the agent gets the deny", "end"));
    y += 12;
    for (const step of deny.steps) {
        const reply = step.stdout !== "" ? decision(step.stdout) : `exit ${step.exit}`;
        const reason = step.stdout !== "" ? jsonField(step.stdout, ...(step.stdout.includes("hookSpecificOutput") ? ["hookSpecificOutput", "permissionDecisionReason"] : step.stdout.includes("user_message") ? ["user_message"] : step.stdout.includes('"reason"') ? ["reason"] : ["permissionDecisionReason"])) : step.stderr;
        const rule = firstLine(reason, "Matched rule:");
        evidence.push(reply, rule);
        const h = 66;
        body.push(rect(PAD, y, IMAGE_WIDTH - 2 * PAD, h, "deny-bg"));
        body.push(text(PAD + 16, y + 28, 20, "tx b", step.label));
        body.push(text(right, y + 28, LINE.mono, "deny mono b", reply + (step.stdout === "" ? ", reason on stderr" : ""), "end"));
        body.push(text(PAD + 16, y + 54, LINE.mono, "tx mono", rule));
        y += h + 8;
    }
    y += 4;
    const status = jsonField(allow.steps[0].stdin ?? "", "tool_input", "command");
    evidence.push(status);
    body.push(rect(PAD, y, IMAGE_WIDTH - 2 * PAD, 52, "ok-bg"));
    body.push(text(PAD + 16, y + 33, 20, "ok mono b", `$ ${status}`));
    body.push(text(right, y + 33, LINE.sans, "tx", `allowed on all ${allow.steps.length}: exit 0, no output`, "end"));
    y += 52 + PAD;
    return {
        file: `${ASSET_DIR}/demo-force-push.svg`,
        demos: ["force-push", "git-status"],
        evidence,
        svg: svgDocument({
            height: y,
            title,
            desc: `${command} sent through hooks/gateguard.mjs as ${deny.steps.map((s) => s.label).join(", ")}. Each reply is a deny in that agent's own format naming the rule git-push-force; git status is allowed on all six with no output.`,
            body,
        }),
    };
}
function installCard(capture) {
    const demo = demoById(capture, "install-dry-run");
    const step = stepOf(demo, "dry run");
    const lines = step.stdout.split("\n").filter((l) => l.trim() !== "");
    return card(`${ASSET_DIR}/demo-install-dry-run.svg`, demo, "What --dry-run prints for Gemini CLI", "The installer's dry run for --target gemini --hooks, run through npx: the runtime copy, settings.json, GEMINI.md and 28 skills it would write, two notes on Gemini CLI, and nothing written.", [
        { lines: [out(step.run, "tx", { prefix: "$ ", bold: true })] },
        { lines: lines.map((l) => out(l, l.includes("would") ? "tx" : l.startsWith("Dry run") ? "ok" : "mute")) },
        { lines: [label("Files in the project afterwards:", "mute"), out((step.files ?? []).join(", "), "ok")] },
    ]);
}
function blindEditCard(capture) {
    const demo = demoById(capture, "blind-edit-codex");
    const [first, edit, read, again] = demo.steps;
    if (!first || !edit || !read || !again)
        throw new Error("blind-edit-codex: expected four steps");
    for (const s of [first, read, again])
        if (!isQuietAllow(s))
            throw new Error(`blind-edit-codex: "${s.label}" printed something`);
    const reason = jsonField(edit.stdout, "hookSpecificOutput", "permissionDecisionReason");
    const quiet = (script) => label(`${script}: exit 0, no output`, "mute", { mono: true });
    return card(`${ASSET_DIR}/demo-blind-edit.svg`, demo, "Codex CLI: an edit before a read is refused", "Codex CLI sends an apply_patch of src/app.ts before reading it and the guard denies it; after a logged read the same patch is allowed.", [
        { heading: `1. ${first.label}`, lines: [quiet("bin/observe.mjs")] },
        { heading: `2. ${edit.label}`, lines: [out(jsonField(edit.stdin ?? "", "tool_name"), "tx", { prefix: "tool call: " }), out(decision(edit.stdout), "deny", { bold: true }), out(firstLine(reason, "This session's"), "tx")] },
        { heading: `3. ${read.label}`, lines: [out(jsonField(read.stdin ?? "", "tool_input", "command"), "tx", { prefix: "$ " }), quiet("bin/observe.mjs")] },
        { heading: `4. ${again.label}`, lines: [label("hooks/gateguard.mjs: exit 0, no output", "ok", { mono: true, bold: true }), label("so the patch goes through", "ok")] },
    ]);
}
function sessionCard(capture) {
    const demo = demoById(capture, "session-lesson");
    const save = stepOf(demo, "ci_create_instinct over MCP");
    const start = stepOf(demo, "Gemini CLI starts a session");
    const created = jsonField(save.stdout, "result", "content", "0", "text");
    const context = jsonField(start.stdout, "hookSpecificOutput", "additionalContext");
    const head = firstLine(context, "Notes from");
    const sentence = head.slice(0, head.indexOf(".") + 1);
    const lesson = firstLine(context, "- ");
    return card(`${ASSET_DIR}/demo-session-lesson.svg`, demo, "A saved lesson reaches the next session", "A lesson saved with the ci_create_instinct MCP tool is printed into Gemini CLI's context by hooks/session.mjs when the next session starts.", [
        { heading: "1. Save a lesson with the MCP tool ci_create_instinct", lines: [out(created, "tx", { md: true }), out((save.files ?? []).join(", "), "mute")] },
        { heading: "2. Gemini CLI starts a session; hooks/session.mjs answers", lines: [out(sentence, "mute", { suffix: " ..." }), out(lesson, "accent", { bold: true })] },
    ]);
}
function lintCard(capture) {
    const demo = demoById(capture, "lint-transcript");
    const step = stepOf(demo, "lint");
    const report = step.stdout.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("---") && !l.startsWith("*Generated"));
    return card(`${ASSET_DIR}/demo-lint-transcript.svg`, demo, "The transcript linter on an unchecked edit", "ci-lint-transcript scores a two-event session, an edit with no lookup and a commit with no test run, at 43 of 100 with two HIGH violations, each named after one of the 7 Laws.", [
        { lines: [out(step.run.replace(/^npx -p continuous-improvement /, ""), "tx", { prefix: "$ ", bold: true }), label("session.jsonl: an Edit of src/app.ts, then a git commit", "mute")] },
        { lines: report.map((l) => out(l, l.includes("[HIGH]") ? "deny" : l.startsWith("**Score") ? "tx" : "mute", { md: true, bold: l.includes("[HIGH]") })) },
    ]);
}
const BOX = { title: 20, line: 18, step: 25 };
/** A box's lines after wrapping to its width. */
function boxLines(b) {
    return b.lines.flatMap((line) => wrap(line.t, charsFit(b.w - 32, BOX.line, line.mono ? "mono" : "sans")).map((t) => ({ t, mono: line.mono })));
}
function boxHeight(b) {
    return 44 + boxLines(b).length * BOX.step;
}
function drawBox(b) {
    if (b.title.length > charsFit(b.w - 32, BOX.title, "bold"))
        throw new Error(`box title too long for its width: ${b.title}`);
    const lines = boxLines(b);
    const drawn = [rect(b.x, b.y, b.w, boxHeight(b), b.cls)];
    drawn.push(text(b.x + 16, b.y + 30, BOX.title, `${b.titleTone} b`, b.title));
    lines.forEach((line, i) => drawn.push(text(b.x + 16, b.y + 57 + i * BOX.step, BOX.line, `mute${line.mono ? " mono" : ""}`, line.t)));
    return drawn;
}
/** How a tool call goes through: the guard decides, an allowed call is logged, saved lessons load at the next start. */
function heroFlow() {
    const body = [];
    const left = PAD + 28;
    const full = IMAGE_WIDTH - PAD - left;
    const half = (full - 16) / 2;
    const gap = 36;
    let y = PAD;
    const ask = { x: left, y, w: full, cls: "panel", title: "1. The agent asks to run a tool call", titleTone: "tx", lines: [{ t: "a shell command, an edit, a write" }] };
    y += boxHeight(ask) + gap;
    const guard = { x: left, y, w: full, cls: "accent-bg", title: "2. The guard hook decides first", titleTone: "accent", lines: [{ t: "hooks/gateguard.mjs", mono: true }, { t: "answers in the format the agent reads" }] };
    y += boxHeight(guard) + gap;
    const refused = { x: left, y, w: half, cls: "deny-bg", title: "Refused", titleTone: "deny", lines: [{ t: "the reply names the rule" }, { t: "the call does not run" }] };
    const allowed = { x: left + half + 16, y, w: half, cls: "ok-bg", title: "Allowed", titleTone: "ok", lines: [{ t: "the hook prints nothing" }, { t: "and the call runs" }] };
    y += Math.max(boxHeight(refused), boxHeight(allowed)) + gap;
    const log = { x: left, y, w: full, cls: "panel", title: "3. The call gets one log row", titleTone: "tx", lines: [{ t: "bin/observe.mjs", mono: true }, { t: "redacted, on your own disk" }] };
    y += boxHeight(log) + gap;
    const next = { x: left, y, w: full, cls: "panel", title: "4. Lessons load at the next session", titleTone: "tx", lines: [{ t: "hooks/session.mjs", mono: true }, { t: "at most 10 lines" }] };
    y += boxHeight(next);
    for (const b of [ask, guard, refused, allowed, log, next])
        body.push(...drawBox(b));
    const down = (x, from, to) => arrow(x, from.y + boxHeight(from) + 2, x, to.y - 2);
    const mid = left + full / 2;
    const allowedMid = allowed.x + half / 2;
    body.push(down(mid, ask, guard));
    body.push(down(left + half / 2, guard, refused));
    body.push(down(allowedMid, guard, allowed));
    body.push(down(allowedMid, allowed, log));
    body.push(down(allowedMid, log, next));
    // The loop back to the agent, in the lane at the left.
    const lane = PAD + 10;
    const from = next.y + boxHeight(next) / 2;
    const to = ask.y + boxHeight(ask) / 2;
    body.push(`<path d="M ${left} ${from} H ${lane} V ${to} H ${left - 9}" class="arrow" stroke-width="2"/>`);
    body.push(`<polygon points="${left},${to} ${left - 10},${to - 6} ${left - 10},${to + 6}" class="head"/>`);
    y += 36;
    body.push(text(IMAGE_WIDTH / 2, y, BOX.line, "mute", "The hooks make no model or network calls", "middle"));
    return {
        file: `${ASSET_DIR}/hero-flow.svg`,
        demos: [],
        evidence: [],
        svg: svgDocument({
            height: y + PAD,
            title: "How a tool call goes through",
            desc: "The agent asks to run a tool call. The guard hook, hooks/gateguard.mjs, decides before it runs: a refused call gets a reply naming the rule and does not run; an allowed call runs, and bin/observe.mjs writes one redacted log row. Saved lessons load when the next session starts. The hooks make no model or network calls.",
            body,
        }),
    };
}
/** The memory parts: a log with a search over it, and lessons that load at session start. Two tracks, nothing between them. */
function memoryParts() {
    const body = [];
    const colW = (IMAGE_WIDTH - 2 * PAD - 16) / 2;
    const leftX = PAD;
    const rightX = PAD + colW + 16;
    const gap = 36;
    const top = PAD;
    const log = { x: leftX, y: top, w: colW, cls: "panel", title: "1. Log", titleTone: "tx", lines: [{ t: "bin/observe.mjs", mono: true }, { t: "one redacted row per tool call, on your disk" }] };
    const lessons = { x: rightX, y: top, w: colW, cls: "accent-bg", title: "3. Lessons", titleTone: "accent", lines: [{ t: "ci_create_instinct", mono: true }, { t: "a YAML note that starts at 0.6; you move it with ci_reinforce" }] };
    const row2 = top + Math.max(boxHeight(log), boxHeight(lessons)) + gap;
    const search = { x: leftX, y: row2, w: colW, cls: "panel", title: "2. Search", titleTone: "tx", lines: [{ t: "ci_recall", mono: true }, { t: "BM25 over the log; no shared word, no result" }] };
    const load = { x: rightX, y: row2, w: colW, cls: "panel", title: "Next session start", titleTone: "tx", lines: [{ t: "hooks/session.mjs", mono: true }, { t: "prints lessons at 0.5 or higher, at most 10 lines" }] };
    for (const b of [log, lessons, search, load])
        body.push(...drawBox(b));
    body.push(arrow(leftX + colW / 2, top + boxHeight(log) + 2, leftX + colW / 2, row2 - 2));
    body.push(arrow(rightX + colW / 2, top + boxHeight(lessons) + 2, rightX + colW / 2, row2 - 2));
    let y = row2 + Math.max(boxHeight(search), boxHeight(load)) + 20;
    body.push(rect(PAD, y, IMAGE_WIDTH - 2 * PAD, 44, "warn-bg"));
    body.push(text(IMAGE_WIDTH / 2, y + 28, BOX.line, "warn b", "Notes, not enforcement: nothing applies a lesson", "middle"));
    y += 44;
    return {
        file: `${ASSET_DIR}/memory-parts.svg`,
        demos: [],
        evidence: [],
        svg: svgDocument({
            height: y + PAD,
            title: "Memory: a log you can search, and lessons",
            desc: "Two separate parts. bin/observe.mjs writes one redacted row per tool call, and ci_recall searches that log with BM25. Apart from that, ci_create_instinct saves a lesson as a YAML note starting at 0.6, which ci_reinforce moves, and hooks/session.mjs prints lessons at 0.5 or higher when the next session starts. Nothing applies a lesson.",
            body,
        }),
    };
}
/** Every image this script owns, drawn from the capture. Throws when a card's output is not in the capture. */
export function renderReadmeAssets(capture) {
    const assets = [forcePushCard(capture), installCard(capture), blindEditCard(capture), sessionCard(capture), lintCard(capture), heroFlow(), memoryParts()];
    for (const asset of assets) {
        const corpus = asset.demos.map((id) => demoCorpus(demoById(capture, id))).join("\n");
        for (const line of asset.evidence) {
            if (!corpus.includes(line))
                throw new Error(`${asset.file} shows "${line}", which is not in the ${asset.demos.join(" or ")} capture`);
        }
    }
    return assets;
}
export function readCapture(repoRoot) {
    return JSON.parse(readFileSync(join(repoRoot, CAPTURE_FILE), "utf8"));
}
/** Images whose committed file is missing or differs from what the capture draws now. */
export function staleAssets(repoRoot) {
    return renderReadmeAssets(readCapture(repoRoot)).flatMap((asset) => {
        let have = null;
        try {
            have = readFileSync(join(repoRoot, asset.file), "utf8").replace(/\r\n/g, "\n");
        }
        catch {
            have = null;
        }
        return have === asset.svg ? [] : [asset.file];
    });
}
function main() {
    const args = argv.slice(2);
    const repoRoot = args.find((arg) => !arg.startsWith("--")) ?? cwd();
    if (args.includes("--write")) {
        for (const asset of renderReadmeAssets(readCapture(repoRoot))) {
            mkdirSync(dirname(join(repoRoot, asset.file)), { recursive: true });
            writeFileSync(join(repoRoot, asset.file), asset.svg);
            console.log(`wrote ${asset.file}`);
        }
    }
    const stale = staleAssets(repoRoot);
    if (stale.length === 0) {
        console.log(`OK readme-assets: every image under ${ASSET_DIR}/ matches what ${CAPTURE_FILE} draws.`);
        exit(0);
    }
    console.error(`FAIL readme-assets: ${stale.join(", ")} differ; run \`node bin/render-readme-assets.mjs --write\`.`);
    exit(1);
}
if (argv[1] !== undefined && import.meta.url === pathToFileURL(argv[1]).href) {
    main();
}
