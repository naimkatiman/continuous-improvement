#!/usr/bin/env node
/**
 * README images
 *
 * Draws the README's images under assets/readme/ as SVG: the terminal cards
 * from the real runs in demo/captures/demos.json (written by
 * bin/capture-readme-demos.mjs), and the two diagrams. Every line a card shows
 * as output is looked up in the capture first, and drawing fails when it is
 * not there, so a card cannot show output nobody ran. The agents map is drawn
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
import { IMAGE_WIDTH, PAD, arrow, charsFit, rect, svgDocument, text, wrap } from "../lib/readme-svg.mjs";
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
function capturedOn(capture) {
    return `Captured on ${capture.version}${capture.unreleased ? " plus the Unreleased changes" : ""}: ${CAPTURE_FILE}`;
}
const out = (t, tone = "tx", extra = {}) => ({ text: t, tone, mono: true, evidence: true, ...extra });
const label = (t, tone = "tx", extra = {}) => ({ text: t, tone, mono: false, evidence: false, ...extra });
const LINE = { mono: 18, sans: 19, height: 26 };
const INNER = IMAGE_WIDTH - 2 * PAD - 32;
/** Wrap a line to the card, keeping its prefix on the first piece and its suffix on the last. */
function layout(lines) {
    return lines.flatMap((line) => {
        const size = line.mono ? LINE.mono : LINE.sans;
        const max = charsFit(INNER, size, line.mono ? "mono" : line.bold ? "bold" : "sans");
        const room = max - (line.prefix?.length ?? 0);
        // A continuation lines up under the text after the line's indent and bullet.
        const hang = " ".repeat((line.prefix?.length ?? 0) + (/^\s*(?:[-·ℹ•]\s+)?/.exec(line.text)?.[0].length ?? 0));
        const pieces = line.text === "" ? [""] : wrap(line.text, Math.max(8, room));
        return pieces.map((piece, i) => {
            const next = { ...line, text: piece };
            if (i > 0)
                next.prefix = hang === "" ? undefined : hang;
            if (i < pieces.length - 1)
                delete next.suffix;
            return next;
        });
    });
}
function drawLine(x, y, line) {
    const size = line.mono ? LINE.mono : LINE.sans;
    const face = `${line.mono ? " mono" : ""}${line.bold ? " b" : ""}`;
    const body = `${line.prefix ?? ""}${line.text}${line.suffix ?? ""}`;
    return text(x, y, size, `${line.tone}${face}`, body);
}
/** A terminal card: a title, a source line, then sections of lines on a panel. */
function card(file, demo, capture, title, desc, sections) {
    const body = [];
    let y = PAD + 24;
    body.push(text(PAD, y, 24, "tx b", title));
    y += 28;
    body.push(text(PAD, y, 16, "mute", capturedOn(capture)));
    y += 18;
    const laid = sections.map((s) => ({ heading: s.heading, lines: layout(s.lines) }));
    const panelTop = y;
    const panelH = laid.reduce((h, s) => h + (s.heading === undefined ? 0 : LINE.height + 6) + s.lines.length * LINE.height + 18, 14);
    body.push(rect(PAD, panelTop, IMAGE_WIDTH - 2 * PAD, panelH, "panel"));
    y += 14;
    const evidence = [];
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
            if (line.evidence && line.text.trim() !== "")
                evidence.push(line.text.trim());
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
    let y = PAD + 24;
    body.push(text(PAD, y, 24, "tx b", title));
    y += 28;
    body.push(text(PAD, y, 16, "mute", capturedOn(capture)));
    y += 20;
    body.push(rect(PAD, y, IMAGE_WIDTH - 2 * PAD, 50, "panel"));
    body.push(text(PAD + 16, y + 32, 20, "mute mono", "$ "));
    body.push(text(PAD + 16 + 24, y + 32, 20, "tx mono b", command));
    y += 64;
    const nameW = 236;
    for (const step of deny.steps) {
        const reply = step.stdout !== "" ? decision(step.stdout) : `exit ${step.exit}`;
        const reason = step.stdout !== "" ? jsonField(step.stdout, ...(step.stdout.includes("hookSpecificOutput") ? ["hookSpecificOutput", "permissionDecisionReason"] : step.stdout.includes("user_message") ? ["user_message"] : step.stdout.includes('"reason"') ? ["reason"] : ["permissionDecisionReason"])) : step.stderr;
        const rule = firstLine(reason, "Matched rule:");
        evidence.push(reply, rule);
        const h = 68;
        body.push(rect(PAD, y, IMAGE_WIDTH - 2 * PAD, h, "deny-bg"));
        body.push(text(PAD + 16, y + 42, 20, "tx b", step.label));
        body.push(text(PAD + nameW, y + 28, LINE.mono, "deny mono b", reply + (step.stdout === "" ? "  (reason on stderr)" : "")));
        body.push(text(PAD + nameW, y + 54, LINE.mono, "tx mono", rule));
        y += h + 8;
    }
    y += 4;
    body.push(rect(PAD, y, IMAGE_WIDTH - 2 * PAD, 56, "ok-bg"));
    body.push(text(PAD + 16, y + 35, 19, "ok b", `$ ${jsonField(allow.steps[0].stdin ?? "", "tool_input", "command")}`));
    evidence.push(jsonField(allow.steps[0].stdin ?? "", "tool_input", "command"));
    body.push(text(PAD + nameW, y + 35, 19, "tx", `allowed on all ${allow.steps.length}: exit 0, no output`));
    y += 56 + PAD;
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
    return card(`${ASSET_DIR}/demo-install-dry-run.svg`, demo, capture, "What --dry-run prints for Gemini CLI", "The installer's dry run for --target gemini --hooks: the runtime copy, settings.json, GEMINI.md and 28 skills it would write, two notes on Gemini CLI, and nothing written.", [
        { lines: [out(step.run.replace(/^npx /, "npx "), "tx", { prefix: "$ ", bold: true })] },
        { lines: lines.map((l) => out(l, l.includes("would") ? "tx" : l.startsWith("Dry run") ? "ok" : "mute")) },
        { lines: [out((step.files ?? []).join(", "), "ok", { prefix: "files in the project afterwards: " })] },
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
    return card(`${ASSET_DIR}/demo-blind-edit.svg`, demo, capture, "Codex CLI: an edit before a read is refused", "Codex CLI sends an apply_patch of src/app.ts before reading it and the guard denies it; after a logged read the same patch is allowed.", [
        { heading: `1. ${first.label}`, lines: [label("bin/observe.mjs: exit 0, no output", "mute")] },
        { heading: `2. ${edit.label}`, lines: [out(jsonField(edit.stdin ?? "", "tool_name"), "tx", { prefix: "tool call: " }), out(decision(edit.stdout), "deny", { bold: true }), out(firstLine(reason, "This session's"), "tx")] },
        { heading: `3. ${read.label}`, lines: [out(jsonField(read.stdin ?? "", "tool_input", "command"), "tx", { prefix: "$ " }), label("bin/observe.mjs: exit 0, no output", "mute")] },
        { heading: `4. ${again.label}`, lines: [label("hooks/gateguard.mjs: exit 0, no output, so the patch goes through", "ok", { bold: true })] },
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
    return card(`${ASSET_DIR}/demo-session-lesson.svg`, demo, capture, "A saved lesson reaches the next session", "A lesson saved with the ci_create_instinct MCP tool is printed into Gemini CLI's context by hooks/session.mjs when the next session starts.", [
        { heading: "1. Save a lesson with the MCP tool ci_create_instinct", lines: [out(created, "tx"), out((save.files ?? []).join(", "), "mute")] },
        { heading: "2. Gemini CLI starts a session; hooks/session.mjs answers", lines: [out(sentence, "mute", { suffix: " ..." }), out(lesson, "accent", { bold: true })] },
    ]);
}
function lintCard(capture) {
    const demo = demoById(capture, "lint-transcript");
    const step = stepOf(demo, "lint");
    const report = step.stdout.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("---") && !l.startsWith("*Generated"));
    return card(`${ASSET_DIR}/demo-lint-transcript.svg`, demo, capture, "The transcript linter on an unchecked edit", "ci-lint-transcript scores a two-event session, an edit with no lookup and a commit with no test run, at 43 of 100 with two HIGH violations.", [
        { lines: [out(step.run.replace(/^npx -p continuous-improvement /, ""), "tx", { prefix: "$ ", bold: true }), label("session.jsonl: an Edit of src/app.ts, then a git commit", "mute")] },
        { lines: report.map((l) => out(l, l.includes("[HIGH]") ? "deny" : l.startsWith("**Score") ? "tx" : "mute", { bold: l.startsWith("**Score") || l.includes("[HIGH]") })) },
    ]);
}
function drawBox(b) {
    const out = [rect(b.x, b.y, b.w, b.h, b.cls)];
    out.push(text(b.x + 16, b.y + 30, 20, `${b.titleTone} b`, b.title));
    b.lines.forEach((line, i) => out.push(text(b.x + 16, b.y + 56 + i * 24, 17, "mute mono", line)));
    return out;
}
/** How a tool call goes through: the guard decides, an allowed call is logged, saved lessons load at the next start. */
function heroFlow() {
    const body = [];
    const title = "How a tool call goes through";
    const left = PAD + 40;
    const full = IMAGE_WIDTH - PAD - left;
    const half = (full - 16) / 2;
    body.push(text(PAD, PAD + 24, 24, "tx b", title));
    const boxes = [
        { x: left, y: 76, w: full, h: 70, cls: "panel", title: "1. The agent asks to run a tool call", titleTone: "tx", lines: ["a shell command, an edit, a write"] },
        { x: left, y: 186, w: full, h: 94, cls: "accent-bg", title: "2. The guard hook decides before it runs", titleTone: "accent", lines: ["hooks/gateguard.mjs", "answers through lib/hook-io.mjs in the agent's format"] },
        { x: left, y: 320, w: half, h: 94, cls: "deny-bg", title: "Refused", titleTone: "deny", lines: ["the reply names the rule", "the call is not logged"] },
        { x: left + half + 16, y: 320, w: half, h: 94, cls: "ok-bg", title: "Allowed", titleTone: "ok", lines: ["the hook prints nothing", "and the call runs"] },
        { x: left + half + 16, y: 454, w: half, h: 94, cls: "panel", title: "3. One log row per call", titleTone: "tx", lines: ["bin/observe.mjs, redacted,", "on your own disk"] },
        { x: left, y: 588, w: full, h: 70, cls: "panel", title: "4. Saved lessons load when the next session starts", titleTone: "tx", lines: ["hooks/session.mjs, at most 10 lines"] },
    ];
    for (const b of boxes)
        body.push(...drawBox(b));
    const mid = left + full / 2;
    body.push(arrow(mid, 146, mid, 184));
    body.push(arrow(left + half / 2, 280, left + half / 2, 318));
    body.push(arrow(left + half + 16 + half / 2, 280, left + half + 16 + half / 2, 318));
    body.push(arrow(left + half + 16 + half / 2, 414, left + half + 16 + half / 2, 452));
    body.push(arrow(left + half + 16 + half / 2, 548, left + half + 16 + half / 2, 586));
    // The loop back to the agent, in the lane at the left.
    const lane = PAD + 14;
    body.push(`<path d="M ${left} 623 H ${lane} V 111 H ${left - 9}" class="arrow" stroke-width="2"/>`);
    body.push(`<polygon points="${left},111 ${left - 10},105 ${left - 10},117" class="head"/>`);
    const y = 700;
    body.push(text(IMAGE_WIDTH / 2, y, 18, "mute", "No model calls  ·  no network calls  ·  Node 18 or newer", "middle"));
    return {
        file: `${ASSET_DIR}/hero-flow.svg`,
        demos: [],
        evidence: [],
        svg: svgDocument({
            height: y + PAD,
            title,
            desc: "The agent asks to run a tool call. The guard hook, hooks/gateguard.mjs, decides before it runs: a refused call gets a reply naming the rule; an allowed call runs, and bin/observe.mjs writes one redacted log row. Saved lessons load when the next session starts. No model calls and no network calls.",
            body,
        }),
    };
}
/** The memory loop: log, search, a lesson, the next session start. */
function memoryLoop() {
    const body = [];
    const title = "Memory: a log, a search, and lessons";
    const left = PAD;
    const w = IMAGE_WIDTH - 2 * PAD;
    body.push(text(PAD, PAD + 24, 24, "tx b", title));
    const boxes = [
        { x: left, y: 70, w, h: 94, cls: "panel", title: "Log: one redacted row per tool call", titleTone: "tx", lines: ["bin/observe.mjs → observations.jsonl", "secrets in known shapes are redacted first"] },
        { x: left, y: 194, w, h: 94, cls: "panel", title: "Search: /recall <words>", titleTone: "tx", lines: ["ci_recall MCP tool, BM25 over the current log", "lexical: no shared word, no result"] },
        { x: left, y: 318, w, h: 94, cls: "accent-bg", title: "Lesson: a YAML note with a confidence", titleTone: "accent", lines: ["saved by /continuous-improvement or ci_create_instinct", "starts at 0.6 unless set; ci_reinforce +0.15 / -0.1"] },
        { x: left, y: 442, w, h: 94, cls: "panel", title: "Next session start", titleTone: "tx", lines: ["hooks/session.mjs prints lessons at 0.5 or higher", "at most 10 lines and 1,500 characters"] },
    ];
    for (const b of boxes)
        body.push(...drawBox(b));
    const mid = IMAGE_WIDTH / 2;
    for (const y of [164, 288, 412])
        body.push(arrow(mid, y + 2, mid, y + 28));
    const y = 576;
    body.push(rect(left, y - 26, w, 44, "warn-bg"));
    body.push(text(mid, y + 2, 18, "warn b", "Notes, not enforcement: nothing applies a lesson", "middle"));
    return {
        file: `${ASSET_DIR}/memory-loop.svg`,
        demos: [],
        evidence: [],
        svg: svgDocument({
            height: y + 18 + PAD,
            title,
            desc: "bin/observe.mjs logs one redacted row per tool call. /recall searches it with BM25 through ci_recall. A lesson is a YAML note that starts at 0.6 and ci_reinforce moves by +0.15 or -0.1. hooks/session.mjs prints lessons at 0.5 or higher at the next session start, at most 10 lines. Lessons are notes; nothing applies them.",
            body,
        }),
    };
}
/** Every image this script owns, drawn from the capture. Throws when a card's output is not in the capture. */
export function renderReadmeAssets(capture) {
    const assets = [forcePushCard(capture), installCard(capture), blindEditCard(capture), sessionCard(capture), lintCard(capture), heroFlow(), memoryLoop()];
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
