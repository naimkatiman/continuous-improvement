import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// __dirname resolves to <repo>/test/ at runtime — compiled .mjs lives under
// test/ per tsconfig outDir. The doc + .mts source live under <repo>/skills/
// and <repo>/src/hooks/ respectively.
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DOC_PATH = join(REPO_ROOT, "skills", "superpowers.md");
const HOOK_SOURCE_PATH = join(
  REPO_ROOT,
  "src",
  "hooks",
  "companion-preference.mts",
);

interface DocPair {
  ciSkill: string;
  companion: string;
  plugin: string;
}

interface MapEntry {
  companion: string;
  plugin: string;
}

function parseDocTable(markdown: string): DocPair[] {
  const sectionAnchor = "### Which rows the override affects";
  const idx = markdown.indexOf(sectionAnchor);
  assert.notEqual(
    idx,
    -1,
    "superpowers.md is missing the '### Which rows the override affects' section",
  );
  const nextHeading = markdown.indexOf("\n### ", idx + sectionAnchor.length);
  const section = markdown.slice(
    idx,
    nextHeading === -1 ? markdown.length : nextHeading,
  );

  const rowRegex = /^\|\s*[^|]+\|\s*`ci:([^`]+)`\s*\|\s*([^|]+)\|/gm;
  const pairs: DocPair[] = [];
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(section)) !== null) {
    const ciSkill = match[1]?.trim();
    const companionCell = match[2]?.trim();
    if (!ciSkill || !companionCell) continue;
    const firstCompanion = companionCell.split(",")[0]?.trim();
    if (!firstCompanion) continue;
    const stripped = firstCompanion.replace(/^`|`$/g, "");
    const colonIdx = stripped.indexOf(":");
    if (colonIdx === -1) continue;
    pairs.push({
      ciSkill,
      companion: stripped,
      plugin: stripped.slice(0, colonIdx),
    });
  }
  return pairs;
}

function parseOverridesMap(source: string): Record<string, MapEntry> {
  const startMarker = "const OVERRIDES: Record<string, Override> = {";
  const start = source.indexOf(startMarker);
  assert.notEqual(
    start,
    -1,
    "companion-preference.mts is missing 'const OVERRIDES: Record<string, Override> = {'",
  );
  let depth = 0;
  let end = -1;
  for (let i = start + startMarker.length - 1; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  assert.notEqual(end, -1, "OVERRIDES map: could not find closing brace");
  const block = source.slice(start, end);

  const entries: Record<string, MapEntry> = {};
  const entryRegex =
    /(?:"([^"]+)"|(\w[\w-]*))\s*:\s*\{\s*companion\s*:\s*"([^"]+)"\s*,\s*plugin\s*:\s*"([^"]+)"\s*,?\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = entryRegex.exec(block)) !== null) {
    const key = m[1] ?? m[2];
    if (!key) continue;
    entries[key] = { companion: m[3] ?? "", plugin: m[4] ?? "" };
  }
  return entries;
}

describe("companion-preference doc drift", () => {
  const doc = readFileSync(DOC_PATH, "utf8");
  const source = readFileSync(HOOK_SOURCE_PATH, "utf8");
  const docPairs = parseDocTable(doc);
  const overrides = parseOverridesMap(source);

  it("parses at least one doc-table row", () => {
    assert.ok(
      docPairs.length > 0,
      "Expected to parse at least one row from superpowers.md doc table",
    );
  });

  it("parses at least one OVERRIDES entry", () => {
    assert.ok(
      Object.keys(overrides).length > 0,
      "Expected to parse at least one entry from OVERRIDES map",
    );
  });

  it("every doc-table CI skill appears in OVERRIDES with matching companion + plugin", () => {
    for (const pair of docPairs) {
      const entry = overrides[pair.ciSkill];
      assert.ok(
        entry,
        `Doc row 'ci:${pair.ciSkill}' has no corresponding key in OVERRIDES map. ` +
          `Add { "${pair.ciSkill}": { companion: "${pair.companion}", plugin: "${pair.plugin}" } } to src/hooks/companion-preference.mts.`,
      );
      assert.equal(
        entry.companion,
        pair.companion,
        `Doc row 'ci:${pair.ciSkill}' lists companion '${pair.companion}' but OVERRIDES has '${entry.companion}'.`,
      );
      assert.equal(
        entry.plugin,
        pair.plugin,
        `Doc row 'ci:${pair.ciSkill}' lists plugin '${pair.plugin}' but OVERRIDES has '${entry.plugin}'.`,
      );
    }
  });
});
