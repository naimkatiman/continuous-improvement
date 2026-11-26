/**
 * The README images are drawn from data: the terminal cards from the real runs
 * in demo/captures/demos.json, the agents map from lib/agent-support.mjs, the
 * two pillars and the loop from lib/loop-stages.mjs. These
 * tests fail when a committed image differs from what the data draws now, when
 * a card shows output the capture does not hold, and when the capture no
 * longer matches what this checkout's hooks print.
 */
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { AGENT_MAP_SVG } from "../bin/check-agent-matrix.mjs";
import { CAPTURE_FILE, capture } from "../bin/capture-readme-demos.mjs";
import { ASSET_DIR, LANDING_DEMO_END, LANDING_DEMO_START, LANDING_PAGE, demoCorpus, readCapture, renderLandingForcePush, renderReadmeAssets, staleAssets } from "../bin/render-readme-assets.mjs";
import { DARK, IMAGE_WIDTH, LIGHT, MIN_PHONE_PX, smallestPhonePx } from "../lib/readme-svg.mjs";
const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const committed = readCapture(REPO_ROOT);
describe("README images", () => {
    it("match what the capture draws now, byte for byte", () => {
        assert.deepEqual(staleAssets(REPO_ROOT), [], "run `node bin/render-readme-assets.mjs --write`");
    });
    it("show only output lines that are in the capture", () => {
        for (const asset of renderReadmeAssets(committed)) {
            const corpus = asset.demos.map((id) => demoCorpus(committed.demos.find((d) => d.id === id))).join("\n");
            for (const line of asset.evidence)
                assert.ok(corpus.includes(line), `${asset.file}: "${line}"`);
            if (asset.file.includes("/demo-"))
                assert.ok(asset.evidence.length > 0, `${asset.file} shows no captured output`);
        }
    });
    it("refuse to draw a refusal, or a quiet allow, that the capture does not show", () => {
        const copy = () => JSON.parse(JSON.stringify(committed));
        const allowed = copy();
        const push = allowed.demos.find((d) => d.id === "force-push");
        push.steps[0].stdout = push.steps[0].stdout.replace('"permissionDecision":"deny"', '"permissionDecision":"allow"');
        assert.throws(() => renderReadmeAssets(allowed), /no deny decision/);
        const noisy = copy();
        noisy.demos.find((d) => d.id === "git-status").steps[2].stdout = "{}";
        assert.throws(() => renderReadmeAssets(noisy), /git-status/);
        const drifted = copy();
        const check = drifted.demos.find((d) => d.id === "goal-check").steps[1];
        check.stdout = check.stdout.replace("**Status:** DRIFT", "**Status:** ON GOAL");
        assert.throws(() => renderReadmeAssets(drifted), /goal-check/);
        const ruleless = copy();
        const kiro = ruleless.demos.find((d) => d.id === "force-push").steps.find((s) => s.label === "Kiro CLI");
        kiro.stderr = kiro.stderr.replace("Matched rule:", "Rule:");
        assert.throws(() => renderReadmeAssets(ruleless), /Matched rule/);
    });
    it("are every file under assets/readme, each one an image GitHub and npm can show", () => {
        const drawn = [...renderReadmeAssets(committed).map((a) => a.file), AGENT_MAP_SVG].sort();
        const onDisk = readdirSync(join(REPO_ROOT, ASSET_DIR)).map((f) => `${ASSET_DIR}/${f}`).sort();
        assert.deepEqual(onDisk, drawn);
        for (const file of drawn) {
            const svg = readFileSync(join(REPO_ROOT, file), "utf8");
            assert.match(svg, /<title id="title">[^<]+<\/title>/, file);
            assert.match(svg, /<desc id="desc">[^<]+<\/desc>/, file);
            assert.match(svg, /@media \(prefers-color-scheme:dark\)/, file);
            assert.doesNotMatch(svg, /<script|@import|@font-face|href=|url\(|<foreignObject/i, file);
        }
    });
    it("keep every line readable on a 390px phone: no text under 10px once scaled down", () => {
        for (const file of [...renderReadmeAssets(committed).map((a) => a.file), AGENT_MAP_SVG]) {
            const px = smallestPhonePx(readFileSync(join(REPO_ROOT, file), "utf8"));
            assert.ok(px >= MIN_PHONE_PX, `${file}: smallest text is ${px.toFixed(1)}px on a phone`);
        }
    });
    it("show no raw Markdown marks and no capture version inside a card", () => {
        for (const asset of renderReadmeAssets(committed)) {
            assert.doesNotMatch(asset.svg, />[^<]*\*\*[^<]*</, asset.file);
            assert.doesNotMatch(asset.svg, />#+ /, asset.file);
            assert.doesNotMatch(asset.svg, /Captured on/, asset.file);
        }
    });
    it("use a palette whose text colors reach 4.5:1 on their backgrounds, light and dark", () => {
        const lum = (hex) => {
            const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
        for (const [scheme, p] of [["light", LIGHT], ["dark", DARK]]) {
            // Each tone on the page, on a panel, and on its own tinted fill; body text on every fill.
            for (const tone of ["tx", "mute", "deny", "ok", "accent", "warn"]) {
                const own = `${tone}Bg`;
                const fills = ["bg", "panel", ...(own in p ? [own] : [])];
                for (const bg of fills)
                    assert.ok(ratio(p[tone], p[bg]) >= 4.5, `${scheme} ${tone} on ${bg}: ${ratio(p[tone], p[bg]).toFixed(2)}`);
            }
            for (const bg of ["denyBg", "okBg", "accentBg", "warnBg"])
                assert.ok(ratio(p.tx, p[bg]) >= 4.5, `${scheme} tx on ${bg}`);
        }
    });
});
describe("the README's use of the images", () => {
    const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
    const tags = [...readme.matchAll(/<img\b[^>]*\bsrc="(assets\/readme\/[^"]+)"[^>]*>/g)];
    it("shows every image under assets/readme, each once, through an HTML img with alt text", () => {
        const drawn = [...renderReadmeAssets(committed).map((a) => a.file), AGENT_MAP_SVG].sort();
        assert.deepEqual(tags.map((t) => t[1]).sort(), drawn);
        for (const [tag] of tags) {
            assert.match(tag, /\balt="[^"]{40,}"/, tag);
            assert.ok(tag.includes(` width="${IMAGE_WIDTH}"`), `${tag} is shown at the width it is drawn at`);
        }
        assert.doesNotMatch(readme, /!\[[^\]]*\]\(assets\/readme\//, "a Markdown image's alt text is read by the claim scan; use <img>");
    });
    // The owner's direction of 2026-11-25: the two pillars and the loop lead, and
    // the destructive-command guard is one proof under Discipline.
    it("opens with the two pillars and the loop, between the badges and the first section", () => {
        const first = readme.indexOf("\n## ");
        const hero = readme.indexOf("assets/readme/pillars-loop.svg");
        assert.ok(hero > readme.indexOf("img.shields.io") && hero < first, "the pillars image sits above the first section");
        assert.equal(tags[0][1], "assets/readme/pillars-loop.svg", "it is the first image");
    });
    it("shows the six-agent demo under Discipline, never above the first section", () => {
        const demo = readme.indexOf("assets/readme/demo-force-push.svg");
        const discipline = readme.indexOf("\n## Discipline\n");
        const next = readme.indexOf("\n## ", discipline + 1);
        assert.ok(discipline !== -1 && demo > discipline && demo < next, "the six-agent demo sits in the Discipline section");
        assert.ok(demo > readme.indexOf("\n## "), "and below the first section heading");
    });
});
// The landing page shows the force-push capture as markup, in its own exhibit
// components. The panel is written from the capture like the images are.
describe("the landing page's cross-agent panel", () => {
    const html = renderLandingForcePush(committed);
    const push = committed.demos.find((d) => d.id === "force-push");
    const status = committed.demos.find((d) => d.id === "git-status");
    const corpus = `${demoCorpus(push)}\n${demoCorpus(status)}`;
    const unescape = (t) => t.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const page = readFileSync(join(REPO_ROOT, LANDING_PAGE), "utf8").replace(/\r\n/g, "\n");
    it("is in the page between its one marker pair, as the capture draws it now", () => {
        assert.ok(page.includes(`${LANDING_DEMO_START}\n${html}\n${LANDING_DEMO_END}`), "run `node bin/render-readme-assets.mjs --write`");
        assert.equal(page.split(LANDING_DEMO_START).length, 2);
        assert.equal(page.split(LANDING_DEMO_END).length, 2);
    });
    // The owner's direction of 2026-11-25: the guard is one proof under Discipline, not the first thing the page shows.
    it("sits in the Discipline section, below the hero, the loop and Ambition", () => {
        const section = page.lastIndexOf("<section", page.indexOf(LANDING_DEMO_START));
        assert.match(page.slice(section, page.indexOf(">", section)), /id="discipline"/);
        for (const id of ["top", "loop", "ambition"]) {
            const at = page.search(new RegExp(`<section[^>]* id="${id}"`));
            assert.ok(at !== -1 && at < section, `#${id} comes first`);
        }
    });
    it("gives each agent one row with the decision pair or exit code it got, and one tape with its payload and command line", () => {
        assert.equal(push.steps.length, 6);
        const rows = [...html.matchAll(/<li><span>([^<]+)<\/span> <span class="rv"><b>([^<]+)<\/b>([^<]*)<\/span><\/li>/g)];
        assert.deepEqual(rows.map((r) => r[1]), push.steps.map((s) => s.label));
        for (const [i, step] of push.steps.entries()) {
            const [, , reply, note] = rows[i];
            if (step.stdout === "") {
                assert.equal(reply, `exit ${step.exit}`);
                assert.equal(note, ", reason on stderr");
                assert.ok(step.stderr.includes("Matched rule: git-push-force"));
            }
            else {
                assert.ok(step.stdout.includes(reply), `${step.label}: ${reply}`);
                assert.match(reply, /:"deny"$/);
                assert.equal(note, "");
            }
            assert.equal(html.split(`<p class="cap">${step.label}</p>`).length, 2, `${step.label} tape`);
            assert.ok(unescape(html).includes(`payload  ${step.stdin}\n\n$ ${step.run}\n`), `${step.label} payload and command line`);
        }
        assert.match(html, /<code>git status<\/code> <span class="rv">all 6: <b>exit 0<\/b>, no output<\/span>/);
    });
    it("shows no line in a tape that the capture does not hold", () => {
        const tapes = [...html.matchAll(/<pre class="tape">([\s\S]*?)<\/pre>/g)].map((m) => unescape(m[1]));
        assert.equal(tapes.length, 1 + push.steps.length);
        for (const tape of tapes) {
            for (const line of tape.split("\n")) {
                if (line.trim() === "" || /^\((?:stdout empty|(?:stderr empty, )?exit \d+)\)$/.test(line))
                    continue;
                const shown = line.replace(/^(?:payload {2}|\$ |stderr: )/, "");
                assert.ok(corpus.includes(shown), `not in the capture: "${shown.slice(0, 80)}"`);
            }
        }
        for (const step of push.steps)
            assert.ok(tapes.some((t) => t.includes(step.stdout === "" ? step.stderr.trimEnd() : step.stdout.trimEnd())), `${step.label} reply`);
    });
    it("names the hook file every agent ran, and the capture's own title", () => {
        assert.match(html, /<p class="meta">hooks\/gateguard\.mjs<\/p>/);
        for (const step of push.steps)
            assert.ok(step.run.includes("hooks/gateguard.mjs"), step.label);
        assert.ok(unescape(html).includes(`${push.title}. ${push.how}`));
    });
    it("refuses to draw when an agent sent another command, a reply names another rule, or git status was not a quiet allow", () => {
        const copy = () => JSON.parse(JSON.stringify(committed));
        const other = copy();
        const gemini = other.demos.find((d) => d.id === "force-push").steps.find((s) => s.label === "Gemini CLI");
        gemini.stdin = gemini.stdin.replace("git push --force origin main", "git push origin main");
        assert.throws(() => renderLandingForcePush(other), /Gemini CLI did not send/);
        const ruled = copy();
        const cursor = ruled.demos.find((d) => d.id === "force-push").steps.find((s) => s.label === "Cursor");
        cursor.stdout = cursor.stdout.replaceAll("Matched rule: git-push-force", "Matched rule: substring:git push");
        assert.throws(() => renderLandingForcePush(ruled), /name 2 rules/);
        const noisy = copy();
        noisy.demos.find((d) => d.id === "git-status").steps[0].stdout = "{}";
        assert.throws(() => renderLandingForcePush(noisy), /git-status/);
    });
    it("is covered by the drift check: a page whose panel differs, or has lost a marker, is reported stale", () => {
        const root = mkdtempSync(join(tmpdir(), "landing-panel-"));
        try {
            for (const dir of [ASSET_DIR, dirname(CAPTURE_FILE), dirname(LANDING_PAGE)])
                mkdirSync(join(root, dir), { recursive: true });
            for (const file of readdirSync(join(REPO_ROOT, ASSET_DIR)))
                copyFileSync(join(REPO_ROOT, ASSET_DIR, file), join(root, ASSET_DIR, file));
            copyFileSync(join(REPO_ROOT, CAPTURE_FILE), join(root, CAPTURE_FILE));
            writeFileSync(join(root, LANDING_PAGE), page);
            assert.deepEqual(staleAssets(root), []);
            const edited = page.replace('"decision":<b>"deny"</b>', '"decision":<b>"allow"</b>');
            assert.notEqual(edited, page);
            writeFileSync(join(root, LANDING_PAGE), edited);
            assert.deepEqual(staleAssets(root), [LANDING_PAGE]);
            writeFileSync(join(root, LANDING_PAGE), page.replace(LANDING_DEMO_END, ""));
            assert.deepEqual(staleAssets(root), [LANDING_PAGE]);
        }
        finally {
            rmSync(root, { recursive: true, force: true, maxRetries: 3 });
        }
    });
});
describe("the demo capture", () => {
    it("ran on this package version, so a release cannot ship the last version's demos", () => {
        const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
        assert.equal(committed.version, pkg.version, "run `node bin/capture-readme-demos.mjs`, then `node bin/render-readme-assets.mjs --write` (docs/RELEASING.md, step 1)");
    });
    it("holds no path from the machine it ran on", () => {
        const text = readFileSync(join(REPO_ROOT, CAPTURE_FILE), "utf8");
        assert.doesNotMatch(text, /[A-Za-z]:[\\/](?!\/)|\/Users\/|\/home\/|AppData/);
    });
    it("is what this checkout's hooks and tools print now", async () => {
        const fresh = await capture(REPO_ROOT);
        assert.deepEqual(fresh.demos, committed.demos, "run `npm run build && node bin/capture-readme-demos.mjs`, then `node bin/render-readme-assets.mjs --write`");
    });
});
