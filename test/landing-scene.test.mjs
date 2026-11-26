/**
 * The landing page's 3D world (docs/landing/landing.js), run without a GPU.
 * The owner's direction of 2026-11-25 is that the page leads with the two
 * pillars and the loop, so the first image must not be the guard's gate and
 * nothing may replay a refusal above Discipline. landing.js is one browser
 * script, so these tests run it in a vm against the real index.html, with a
 * stub document and a stub WebGL context that keeps the boxes each frame draws.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { LOOP_STAGES } from "../lib/loop-stages.mjs";
const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel) => readFileSync(join(REPO_ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const html = read("docs/landing/index.html");
const script = read("docs/landing/landing.js");
const unescape = (text) => text.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const sectionOf = (id) => {
    const at = html.search(new RegExp(`<section[^>]* id="${id}"`));
    assert.notEqual(at, -1, `the landing page has no #${id} section`);
    return html.slice(at, html.indexOf("</section>", at));
};
/** The attributes of every opening tag that carries `attribute`, in document order. */
const tagsWith = (markup, attribute) => [...markup.matchAll(new RegExp(`<\\w+ ([^>]*\\b${attribute}(?:="[^"]*")?[^>]*)>`, "g"))].map((tag) => new Map([...tag[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((m) => [m[1], unescape(m[2] ?? "")])));
const sections = tagsWith(html, "data-cam").map((attrs) => ({ id: attrs.get("id"), cam: attrs.get("data-cam"), attrs }));
const MARK_CLASS = { "refuses by default": "deny", "off until you switch it on": "off", "records and loads": "on", none: "none" };
const marks = LOOP_STAGES.map((stage) => MARK_CLASS[stage.mark]);
class El {
    attrs;
    style = {};
    classes = new Set();
    parts = new Map();
    listeners = new Map();
    className = "";
    textContent = "";
    innerHTML = "";
    presses = 0;
    rect = { top: 0, right: 0, height: 0 };
    constructor(attrs = new Map()) { this.attrs = attrs; }
    classList = {
        add: (name) => { this.classes.add(name); },
        remove: (name) => { this.classes.delete(name); },
        contains: (name) => this.classes.has(name),
        toggle: (name, on) => { if (on)
            this.classes.add(name);
        else
            this.classes.delete(name); },
    };
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    hasAttribute(name) { return this.attrs.has(name); }
    setAttribute(name, value) { if (name === "aria-pressed" && value === "true")
        this.presses++; this.attrs.set(name, value); }
    addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
    appendChild() { }
    querySelector(selector) { if (!this.parts.has(selector))
        this.parts.set(selector, new El()); return this.parts.get(selector); }
    getBoundingClientRect() { return this.rect; }
}
const VIEW = { width: 1280, height: 900 };
const HEIGHTS = { top: 1000, loop: 1600, ambition: 1200, discipline: 1900, agents: 1000 };
/** The page at a fixed viewport, driven one frame at a time. */
class Page {
    chips;
    byId = new Map();
    sectionEls;
    tops = new Map();
    window;
    next = null;
    clock = 0;
    uploads = [];
    drawn = [];
    scrollListeners = [];
    created = [];
    constructor(reduced = false) {
        this.chips = tagsWith(html, "data-call").map((attrs) => new El(attrs));
        let y = 0;
        this.sectionEls = sections.map(({ id, attrs }) => {
            const el = new El(attrs);
            el.rect = { top: y, right: 0, height: HEIGHTS[id] ?? 846 };
            this.tops.set(id, y);
            y += el.rect.height;
            return el;
        });
        const copy = new El();
        copy.rect = { top: 0, right: 631, height: 900 };
        const steps = (sectionOf("ambition").split('<ol class="steps">')[1] ?? "").split("<li>").length - 1;
        const tiles = [...sectionOf("discipline").matchAll(/<li[^>]*><b>/g)].length;
        const lists = {
            "[data-call]": this.chips,
            "[data-cam]": this.sectionEls,
            "tr[data-hook]": tagsWith(html, "data-hook").map((attrs) => new El(attrs)),
            "[data-cost]": tagsWith(html, "data-cost").map((attrs) => new El(attrs)),
            "li[data-loop]": tagsWith(html, "data-loop").map((attrs) => new El(attrs)),
            "#ambition .steps > li": Array.from({ length: steps }, () => new El()),
            "#discipline .tiles > li": Array.from({ length: tiles }, () => new El()),
        };
        this.el("world").attrs.set("id", "world");
        Object.assign(this.el("world"), { getContext: () => this.gl() });
        const document = {
            documentElement: new El(),
            hidden: false,
            querySelectorAll: (selector) => lists[selector] ?? [],
            querySelector: (selector) => (selector === ".hero .copy" ? copy : null),
            getElementById: (id) => this.el(id),
            createElement: () => { const el = new El(); this.created.push(el); return el; },
            addEventListener: () => undefined,
        };
        this.window = {
            document,
            location: { search: "" },
            // a frame's timestamp trails the script's own clock, as it does in a browser
            performance: { now: () => this.clock + 400 },
            innerWidth: VIEW.width,
            innerHeight: VIEW.height,
            devicePixelRatio: 1,
            scrollY: 0,
            matchMedia: (query) => ({ matches: reduced && query.includes("reduced-motion"), addEventListener: () => undefined }),
            addEventListener: (type, fn) => { if (type === "scroll")
                this.scrollListeners.push(fn); },
            requestAnimationFrame: (fn) => { this.next = fn; },
        };
        this.window["window"] = this.window;
        vm.runInNewContext(script, this.window);
    }
    el(id) { if (!this.byId.has(id))
        this.byId.set(id, new El()); return this.byId.get(id); }
    gl() {
        const calls = {
            getShaderParameter: () => true,
            getProgramParameter: (_program, name) => (name === "LINK_STATUS" ? true : 0),
            getParameter: () => 4,
            bufferSubData: (_target, _offset, data) => {
                const floats = Array.from(data);
                const boxes = [];
                for (let o = 0; o < floats.length; o += 16) {
                    const [x, y, z, hx, hy, hz, rot, , , , , , r, g, b] = floats.slice(o, o + 16);
                    boxes.push({ x: x, y: y, z: z, hx: hx, hy: hy, hz: hz, rot: rot, emi: [r, g, b] });
                }
                this.uploads.push(boxes);
            },
        };
        return new Proxy({}, { get: (_target, name) => (typeof name === "string" && /^[A-Z_0-9]+$/.test(name) ? name : calls[String(name)] ?? (() => ({}))) });
    }
    /** Scrolls so that `offset` pixels of the section are above the screen. */
    scrollTo(id, offset = 0) {
        const y = this.tops.get(id) + offset;
        this.window["scrollY"] = y;
        sections.forEach((section, i) => { this.sectionEls[i].rect.top = this.tops.get(section.id) - y; });
        this.scrollListeners.forEach((fn) => fn());
        return this;
    }
    /** Runs the animation loop; returns the highest verdict light seen on the gate. */
    run(seconds) {
        let peak = 0;
        for (let i = 0; i < Math.round(seconds / 0.04); i++) {
            const frame = this.next;
            this.uploads = [];
            this.clock += 40;
            frame(this.clock);
            if (this.uploads[0])
                this.drawn = this.uploads[0];
            peak = Math.max(peak, this.window["__scene"].curtain ?? 0);
        }
        return peak;
    }
    /** The opaque boxes of the last drawn frame. */
    boxes() { assert.ok(this.drawn.length > 0, "a frame was drawn"); return this.drawn; }
    replays() { return this.chips.reduce((n, chip) => n + chip.presses, 0); }
    /** The world's labels that are on screen, as their text. */
    labels() { return this.created.filter((el) => el.className.startsWith("hud ") && el.classes.has("show")).map((el) => (el.textContent || el.innerHTML).replace(/<[^>]*>/g, "")); }
    verdictFloats() { return this.el("verdict").classes.has("float"); }
}
/** The gate, its rail and the log stand along the x axis at the world's origin. */
const atGate = (boxes) => boxes.filter((b) => Math.abs(b.x) < 8 && Math.abs(b.z) < 3);
const PILLAR_SECTIONS = ["top", "loop", "ambition"];
describe("the camera of each section of the landing page", () => {
    const views = new Map([...(/var SECT = \{([\s\S]*?)\n {2}\};/.exec(script)[1]).matchAll(/^\s+(\w+):\s+(\{.*\}),$/gm)].map((m) => [m[1], m[2]]));
    it("the hero, the loop and Ambition each have their own key, and none of them looks at the gate", () => {
        const keys = PILLAR_SECTIONS.map((id) => sections.find((s) => s.id === id).cam);
        assert.deepEqual(keys, ["hero", "loop", "ambition"]);
        const gateBox = /box: (\w+|\[\[.*?\]\]),/.exec(views.get("gate"))[1];
        for (const key of keys) {
            assert.ok(views.has(key), `landing.js has a view named ${key}`);
            assert.ok(!views.get(key).includes(gateBox), `${key} does not frame the gate`);
            assert.notEqual(views.get(key), views.get("gate"), key);
        }
    });
    it("the gate's key belongs to Discipline alone", () => {
        assert.deepEqual(sections.filter((s) => s.cam === "gate").map((s) => s.id), ["discipline"]);
        assert.equal(sections.find((s) => s.id === "agents").cam, "agents");
    });
    it("a section taller than the screen holds its view, so no neighbour's set shows beside its text", () => {
        for (const id of [...PILLAR_SECTIONS, "discipline", "agents"])
            assert.ok(sections.find((s) => s.id === id).attrs.has("data-cam-hold"), id);
        const page = new Page().scrollTo("ambition", 1200 - VIEW.height);
        page.run(2);
        assert.equal(atGate(page.boxes()).length, 0, "the last screenful of Ambition still has no gate");
    });
});
describe("the set behind the hero, the loop and Ambition", () => {
    for (const id of PILLAR_SECTIONS) {
        it(`#${id} shows two pillars and seven tablets, and no gate`, () => {
            const page = new Page().scrollTo(id);
            page.run(3);
            const boxes = page.boxes();
            assert.equal(atGate(boxes).length, 0, "nothing of the gate is drawn");
            assert.equal(boxes.filter((b) => b.hx < 0.05 && b.hy > 0.5).length, 14, "two upright edges for each of seven tablets");
        });
    }
    it("the gate and the log are drawn in Discipline and Agents, and the pillars are not", () => {
        for (const id of ["discipline", "agents"]) {
            const page = new Page().scrollTo(id, 50);
            page.run(4);
            const boxes = page.boxes();
            assert.ok(atGate(boxes).length > 20, id);
            assert.ok(boxes.every((b) => b.x > -17), `${id}: the pillars have sunk`);
        }
    });
    it("stands one tablet per step in a ring, in loop order, each edged in the mark of its step", () => {
        const page = new Page(true).scrollTo("top");
        page.run(0.2);
        const edges = page.boxes().filter((b) => b.hx < 0.05 && b.hy > 0.5);
        const tablets = LOOP_STAGES.map((_, i) => [edges[2 * i], edges[2 * i + 1]]);
        const kind = ([r, g]) => (r === 0 ? "off" : r > 3 * g ? "deny" : r > 0.3 ? "on" : "none");
        assert.deepEqual(tablets.map(([a]) => kind(a.emi)), marks);
        const centre = tablets.map(([a, b]) => [(a.x + b.x) / 2, (a.z + b.z) / 2]);
        const cx = centre.reduce((s, p) => s + p[0], 0) / 7, cz = centre.reduce((s, p) => s + p[1], 0) / 7;
        const angle = centre.map(([x, z]) => Math.atan2(x - cx, z - cz));
        angle.forEach((a, i) => {
            const step = ((angle[(i + 1) % 7] - a) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            assert.ok(Math.abs(step - (2 * Math.PI) / 7) < 0.02, `step ${i + 1} to the next: ${step}`);
        });
    });
    it("raises Ambition above Discipline, and makes Discipline the broader of the two", () => {
        const page = new Page(true).scrollTo("top");
        page.run(0.2);
        const solid = page.boxes().filter((b) => b.hx > 0.15 && Math.abs(b.hx - b.hz) < 1e-6);
        const columns = new Map();
        for (const b of solid)
            columns.set(b.x.toFixed(2), [...(columns.get(b.x.toFixed(2)) ?? []), b]);
        assert.equal(columns.size, 2, "two pillars");
        const [ambition, discipline] = [...columns.values()].map((c) => ({ top: Math.max(...c.map((b) => b.y + b.hy)), width: Math.max(...c.filter((b) => b.y > 0.3).map((b) => b.hx)) })).sort((a, b) => b.top - a.top);
        assert.ok(ambition.top > discipline.top + 1, "Ambition reaches higher");
        assert.ok(discipline.width > ambition.width * 1.4, "Discipline is broader");
    });
    it("runs a pulse round the ring in loop order, and with reduced motion draws none and stands still", () => {
        const moving = new Page().scrollTo("top"), still = new Page(true).scrollTo("top");
        moving.run(1);
        still.run(1);
        const first = still.boxes();
        // a scroll event makes a page with reduced motion draw again
        still.scrollTo("top").run(1);
        assert.notEqual(still.boxes(), first, "a second frame was drawn");
        assert.deepEqual(still.boxes(), first, "and it is the same picture");
        assert.equal(moving.boxes().length - first.length, 4, "the pulse and its tail");
        const pulse = () => moving.boxes().filter((b) => Math.abs(b.hx - 0.17) < 1e-6)[0];
        const edges = first.filter((b) => b.hx < 0.05 && b.hy > 0.5);
        const centre = (i) => [(edges[2 * i].x + edges[2 * i + 1].x) / 2, (edges[2 * i].z + edges[2 * i + 1].z) / 2];
        const nearest = [];
        for (let i = 0; i < 300; i++) {
            moving.run(0.04);
            const p = pulse();
            const d = LOOP_STAGES.map((_, k) => Math.hypot(centre(k)[0] - p.x, centre(k)[1] - p.z));
            const at = d.indexOf(Math.min(...d));
            if (nearest[nearest.length - 1] !== at)
                nearest.push(at);
        }
        assert.ok(nearest.length >= 8, "more than one lap in 12 s");
        nearest.slice(1).forEach((at, i) => assert.equal(at, (nearest[i] + 1) % 7, `after ${LOOP_STAGES[nearest[i]].name}`));
    });
    it("names the two pillars in the hero and Ambition, and the seven steps in the loop", () => {
        for (const id of ["top", "ambition"]) {
            const page = new Page(true).scrollTo(id);
            page.run(0.2);
            assert.deepEqual(page.labels(), ["Ambition a skill", "Discipline hooks"], id);
        }
        const loop = new Page(true).scrollTo("loop");
        loop.run(0.2);
        assert.deepEqual(loop.labels(), LOOP_STAGES.map((stage) => stage.name));
    });
    it("draws no more boxes a frame than the largest set the page already had", () => {
        const count = (id) => { const page = new Page().scrollTo(id); page.run(4); return page.boxes().length; };
        assert.ok(count("top") <= count("native"), `${count("top")} in the hero`);
    });
});
describe("the guard's replay on the landing page", () => {
    for (const id of PILLAR_SECTIONS) {
        it(`never starts, floats its verdict card or lights the gate red while #${id} holds the screen`, () => {
            const page = new Page().scrollTo(id);
            assert.equal(page.run(20), 0, "no verdict light");
            assert.equal(page.replays(), 0, "no call was replayed");
            assert.equal(page.verdictFloats(), false, "no verdict card");
        });
    }
    it("runs in Discipline, and stops in Agents", () => {
        const page = new Page().scrollTo("discipline", 300);
        assert.ok(page.run(12) > 0.5, "a refused call lights the gate");
        assert.ok(page.replays() > 0 && page.verdictFloats());
        page.scrollTo("agents", 100);
        page.run(3);
        const before = page.replays();
        assert.equal(page.run(15), 0, "the light is out");
        assert.equal(page.replays(), before, "no further call is replayed");
        assert.equal(page.verdictFloats(), false);
    });
    it("waits for the visitor's own pick when motion is reduced", () => {
        const page = new Page(true).scrollTo("discipline", 300);
        const before = page.replays();
        assert.equal(page.run(15), 0, "no verdict light without a call, even when the first frame's clock runs backwards");
        assert.equal(page.replays(), before);
        assert.ok(!page.labels().some((text) => text.includes("row")), "no row is announced when none was added");
    });
});
describe("the stills that stand in for the world", () => {
    const hero = sectionOf("top");
    it("the hero's still is the two pillars and the seven tablets in their marks, and no gate", () => {
        const tablets = [...hero.matchAll(/<rect class="t (\w+)" data-step="(\d)"/g)].sort((a, b) => Number(a[2]) - Number(b[2]));
        assert.deepEqual(tablets.map((m) => Number(m[2])), LOOP_STAGES.map((_, i) => i + 1));
        assert.deepEqual(tablets.map((m) => m[1]), marks);
        assert.deepEqual([...hero.matchAll(/<text [^>]*>([^<]+)<\/text>/g)].map((m) => m[1]), ["Ambition", "Discipline"]);
        assert.doesNotMatch(hero, /class="still"/);
        assert.ok(sectionOf("discipline").includes('class="still"'), "the flat gate is under Discipline");
    });
    it("is shown without WebGL and without scripting, and hidden otherwise", () => {
        assert.match(html, /^\.still-loop \{ display: none;/m);
        assert.match(html, /^\.nogl \.still-loop \{ display: block; \}/m);
        assert.match(html, /<noscript><style>\.still-loop \{ display: block; \}<\/style><\/noscript>\n<\/head>/);
    });
});
describe("the landing page's switch names", () => {
    it("every Switch cell names the CI_ variable, the one name every agent's user is given", () => {
        const cells = [...html.matchAll(/<td data-l="Switch">(.*?)<\/td>/g), ...html.matchAll(/<dt>Switch<\/dt><dd>(.*?)<\/dd>/g)].map((m) => m[1]);
        assert.ok(cells.length > 20, "the cells were read");
        for (const cell of cells)
            assert.doesNotMatch(cell, /\bCLAUDE_/, cell);
    });
    it("the steps to try it cover both pillars, and do not count what an installer prints", () => {
        const off = sectionOf("off");
        const steps = [...off.slice(0, off.indexOf("</ol>")).matchAll(/<li><span>(.*?)<\/span><\/li>/g)].map((m) => m[1]);
        const words = ["zero", "One", "Two", "Three", "Four", "Five", "Six"];
        assert.match(off, new RegExp(`<h2 id="h-off">${words[steps.length]} steps to try it\\.`));
        assert.doesNotMatch(steps[0], /\b(?:one|two|\d+) steps?\b/i);
        assert.match(steps[0], /Codex: trust each hook in <code>\/hooks<\/code>/);
        assert.ok(steps.some((step) => step.includes("<code>be-ambitious</code>")), "Ambition");
        assert.ok(steps.some((step) => step.includes("hooks/gateguard.mjs")), "Discipline");
    });
});
