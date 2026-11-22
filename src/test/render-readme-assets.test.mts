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
});

describe("the demo capture", () => {
  it("holds no path from the machine it ran on", () => {
    const text = readFileSync(join(REPO_ROOT, CAPTURE_FILE), "utf8");
    assert.doesNotMatch(text, /[A-Za-z]:[\\/](?!\/)|\/Users\/|\/home\/|AppData/);
  });

  it("is what this checkout's hooks and tools print now", async () => {
    const fresh = await capture(REPO_ROOT);
    assert.deepEqual(fresh.demos, committed.demos, "run `npm run build && node bin/capture-readme-demos.mjs`, then `node bin/render-readme-assets.mjs --write`");
  });
});
