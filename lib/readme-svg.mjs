// readme-svg.mts — The pieces every README image is drawn from.
//
// The README images under assets/readme/ are SVG strings built here, not drawn
// by hand, so a test can render them again and fail when a committed file
// differs. GitHub serves a README image from raw.githubusercontent.com under
// "default-src 'none'; style-src 'unsafe-inline'; sandbox", and npmjs.com loads
// the same URL, so an image may carry an inline <style> and nothing else: no
// script, no web font, no external href. Text uses the system font stacks.
//
// Each image restyles itself for a dark color scheme with its own
// `@media (prefers-color-scheme: dark)` block. The colors are GitHub's own
// light and dark palette, so the images sit on either page background.
// Read only by bin/render-readme-assets.mjs, bin/check-agent-matrix.mjs and
// their tests. Pure: no I/O.
export const SANS = `-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif`;
export const MONO = `ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace`;
/** The width every README image is drawn at; the README shows each one at this width or less. */
export const IMAGE_WIDTH = 820;
/** Side padding inside an image. */
export const PAD = 24;
// Rough glyph advances, as a share of the font size, used only to wrap text.
// Set on the wide side so a line never runs past its box in any of the stacks.
const MONO_ADVANCE = 0.61;
const SANS_ADVANCE = 0.56;
const BOLD_ADVANCE = 0.6;
const LIGHT = {
    bg: "#ffffff",
    panel: "#f6f8fa",
    line: "#d0d7de",
    tx: "#1f2328",
    mute: "#59636e",
    deny: "#cf222e",
    denyBg: "#ffebe9",
    ok: "#1a7f37",
    okBg: "#dafbe1",
    accent: "#0969da",
    accentBg: "#ddf4ff",
    warn: "#9a6700",
    warnBg: "#fff8c5",
};
const DARK = {
    bg: "#0d1117",
    panel: "#161b22",
    line: "#3d444d",
    tx: "#f0f6fc",
    mute: "#9198a1",
    deny: "#ff7b72",
    denyBg: "#3d1214",
    ok: "#3fb950",
    okBg: "#12301c",
    accent: "#4493f8",
    accentBg: "#0c2d5a",
    warn: "#d29922",
    warnBg: "#3a2a07",
};
function palette(colors) {
    const c = colors;
    return [
        `.bg{fill:${c.bg}}`,
        `.panel{fill:${c.panel};stroke:${c.line}}`,
        `.rule{stroke:${c.line}}`,
        `.tx{fill:${c.tx}}`,
        `.mute{fill:${c.mute}}`,
        `.deny{fill:${c.deny}}`,
        `.deny-bg{fill:${c.denyBg};stroke:${c.deny}}`,
        `.ok{fill:${c.ok}}`,
        `.ok-bg{fill:${c.okBg};stroke:${c.ok}}`,
        `.accent{fill:${c.accent}}`,
        `.accent-bg{fill:${c.accentBg};stroke:${c.accent}}`,
        `.warn{fill:${c.warn}}`,
        `.warn-bg{fill:${c.warnBg};stroke:${c.warn}}`,
        `.arrow{stroke:${c.mute};fill:none}`,
        `.head{fill:${c.mute}}`,
    ].join("");
}
const STYLE = [
    `text{font-family:${SANS}}`,
    `.mono{font-family:${MONO}}`,
    `.b{font-weight:600}`,
    palette(LIGHT),
    `@media (prefers-color-scheme:dark){${palette(DARK)}}`,
].join("");
/** XML-escaped text for an element body or an attribute. */
export function esc(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/** How many characters of `face` at `size` fit in `width`. */
export function charsFit(width, size, face) {
    const advance = face === "mono" ? MONO_ADVANCE : face === "bold" ? BOLD_ADVANCE : SANS_ADVANCE;
    return Math.max(1, Math.floor(width / (size * advance)));
}
/**
 * Break text into lines of at most `max` characters, at spaces where it can.
 * A word longer than a line is cut. Every line is a substring of the input,
 * so a wrapped capture line can still be found in the capture.
 */
export function wrap(text, max) {
    const out = [];
    let rest = text.replace(/\s+$/, "");
    while (rest.length > max) {
        const cut = rest.lastIndexOf(" ", max);
        const at = cut > max / 3 ? cut : max;
        out.push(rest.slice(0, at).replace(/\s+$/, ""));
        rest = rest.slice(at).replace(/^ +/, "");
    }
    out.push(rest);
    return out;
}
/** One line of text. `cls` holds the color and face classes. */
export function text(x, y, size, cls, body, anchor = "start") {
    const a = anchor === "start" ? "" : ` text-anchor="${anchor}"`;
    return `<text x="${x}" y="${y}" font-size="${size}" class="${cls}"${a} xml:space="preserve">${esc(body)}</text>`;
}
export function rect(x, y, w, h, cls, r = 8) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" class="${cls}"/>`;
}
/** A straight arrow from (x1,y1) to (x2,y2) with a filled head. */
export function arrow(x1, y1, x2, y2) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const size = 9;
    const p = (a) => `${round(x2 - size * Math.cos(angle - a))},${round(y2 - size * Math.sin(angle - a))}`;
    return `<line x1="${x1}" y1="${y1}" x2="${round(x2 - size * 0.8 * Math.cos(angle))}" y2="${round(y2 - size * 0.8 * Math.sin(angle))}" class="arrow" stroke-width="2"/><polygon points="${x2},${y2} ${p(0.45)} ${p(-0.45)}" class="head"/>`;
}
function round(n) {
    return Math.round(n * 10) / 10;
}
/** A whole SVG file, IMAGE_WIDTH wide, ending in a newline. */
export function svgDocument(doc) {
    const h = Math.ceil(doc.height);
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${IMAGE_WIDTH} ${h}" width="${IMAGE_WIDTH}" height="${h}" role="img" aria-labelledby="title desc">`,
        `<title id="title">${esc(doc.title)}</title>`,
        `<desc id="desc">${esc(doc.desc)}</desc>`,
        `<style>${STYLE}</style>`,
        rect(0, 0, IMAGE_WIDTH, h, "bg", 12),
        ...doc.body,
        `</svg>`,
        "",
    ].join("\n");
}
