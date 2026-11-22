/**
 * The README images are drawn from data: the terminal cards from the real runs
 * in demo/captures/demos.json, the agents map from lib/agent-support.mjs. These
 * tests fail when a committed image differs from what the data draws now, when
 * a card shows output the capture does not hold, and when the capture no
 * longer matches what this checkout's hooks print.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { AGENT_MAP_SVG } from "../bin/check-agent-matrix.mjs";
import { CAPTURE_FILE, capture, type Capture } from "../bin/capture-readme-demos.mjs";
import { ASSET_DIR, demoCorpus, readCapture, renderReadmeAssets, staleAssets } from "../bin/render-readme-assets.mjs";
import { DARK, IMAGE_WIDTH, LIGHT, MIN_PHONE_PX, smallestPhonePx } from "../lib/readme-svg.mjs";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const committed = readCapture(REPO_ROOT);

describe("README images", () => {
  it("match what the capture draws now, byte for byte", () => {
    assert.deepEqual(staleAssets(REPO_ROOT), [], "run `node bin/render-readme-assets.mjs --write`");
  });

  it("show only output lines that are in the capture", () => {
    for (const asset of renderReadmeAssets(committed)) {
      const corpus = asset.demos.map((id) => demoCorpus(committed.demos.find((d) => d.id === id)!)).join("\n");
      for (const line of asset.evidence) assert.ok(corpus.includes(line), `${asset.file}: "${line}"`);
      if (asset.file.includes("/demo-")) assert.ok(asset.evidence.length > 0, `${asset.file} shows no captured output`);
    }
  });

  it("refuse to draw a refusal, or a quiet allow, that the capture does not show", () => {
    const copy = (): Capture => JSON.parse(JSON.stringify(committed)) as Capture;
    const allowed = copy();
    const push = allowed.demos.find((d) => d.id === "force-push")!;
    push.steps[0]!.stdout = push.steps[0]!.stdout.replace('"permissionDecision":"deny"', '"permissionDecision":"allow"');
    assert.throws(() => renderReadmeAssets(allowed), /no deny decision/);
    const noisy = copy();
    noisy.demos.find((d) => d.id === "git-status")!.steps[2]!.stdout = "{}";
    assert.throws(() => renderReadmeAssets(noisy), /git-status/);
    const ruleless = copy();
    const kiro = ruleless.demos.find((d) => d.id === "force-push")!.steps.find((s) => s.label === "Kiro CLI")!;
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
    const lum = (hex: string): number => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: string, b: string): number => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    for (const [scheme, p] of [["light", LIGHT], ["dark", DARK]] as const) {
      // Each tone on the page, on a panel, and on its own tinted fill; body text on every fill.
      for (const tone of ["tx", "mute", "deny", "ok", "accent", "warn"] as const) {
        const own = `${tone}Bg`;
        const fills: Array<keyof typeof LIGHT> = ["bg", "panel", ...(own in p ? [own as keyof typeof LIGHT] : [])];
        for (const bg of fills) assert.ok(ratio(p[tone], p[bg]) >= 4.5, `${scheme} ${tone} on ${bg}: ${ratio(p[tone], p[bg]).toFixed(2)}`);
      }
      for (const bg of ["denyBg", "okBg", "accentBg", "warnBg"] as const) assert.ok(ratio(p.tx, p[bg]) >= 4.5, `${scheme} tx on ${bg}`);
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

  it("opens with the six-agent demo, right under the badges", () => {
    const hero = readme.indexOf("assets/readme/demo-force-push.svg");
    assert.ok(hero > readme.indexOf("img.shields.io") && hero < readme.indexOf("\n## "), "the hero sits above the first section");
  });
});

describe("the demo capture", () => {
  it("ran on this package version, so a release cannot ship the last version's demos", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { version: string };
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
