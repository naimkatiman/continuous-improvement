import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

interface PackInstinct {
  body: string;
  confidence: number;
  domain: string;
  id: string;
  trigger: string;
}

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PACKS_DIR = join(__dirname, "..", "instinct-packs");

describe("instinct-packs directory", () => {
  it("exists", () => {
    assert.ok(existsSync(PACKS_DIR), "instinct-packs/ directory should exist");
  });

  it("contains at least 3 packs", () => {
    const packs = readdirSync(PACKS_DIR).filter((file) => file.endsWith(".json"));
    assert.ok(packs.length >= 3, `Expected at least 3 packs, got ${packs.length}`);
  });
});

// Language packs (react/python/go) are seeded language conventions: ≥5 instincts.
// The meta pack carries promoted reflection-instincts about the system itself
// (auto-instinct gap, parallel-call discipline) — kept small on purpose, ≥2.
const PACK_FLOORS: Record<string, number> = { react: 5, python: 5, go: 5, meta: 2 };
for (const [packName, floor] of Object.entries(PACK_FLOORS)) {
  describe(`instinct-packs/${packName}.json`, () => {
    let instincts: PackInstinct[] = [];

    it("is valid JSON", () => {
      const content = readFileSync(join(PACKS_DIR, `${packName}.json`), "utf8");
      instincts = JSON.parse(content) as PackInstinct[];
    });

    it("is a non-empty array", () => {
      assert.ok(Array.isArray(instincts), "Should be an array");
      assert.ok(instincts.length >= floor, `Expected at least ${floor} instincts, got ${instincts.length}`);
    });

    it("each instinct has required fields", () => {
      for (const instinct of instincts) {
        assert.ok(instinct.id, `Instinct missing id: ${JSON.stringify(instinct)}`);
        assert.ok(instinct.trigger, `Instinct ${instinct.id} missing trigger`);
        assert.ok(instinct.body, `Instinct ${instinct.id} missing body`);
        assert.ok(typeof instinct.confidence === "number", `Instinct ${instinct.id} confidence must be a number`);
      }
    });

    it("all IDs are unique", () => {
      const ids = instincts.map((instinct) => instinct.id);
      const unique = new Set(ids);
      assert.equal(unique.size, ids.length, `Duplicate IDs found: ${ids.filter((id, index) => ids.indexOf(id) !== index)}`);
    });

    it("IDs are kebab-case", () => {
      for (const instinct of instincts) {
        assert.match(instinct.id, /^[a-z][a-z0-9-]+$/, `ID "${instinct.id}" should be kebab-case`);
      }
    });

    it("confidence values are in valid range (0.0-0.9)", () => {
      for (const instinct of instincts) {
        assert.ok(instinct.confidence >= 0 && instinct.confidence <= 0.9, `Instinct ${instinct.id} confidence ${instinct.confidence} out of range`);
      }
    });

    it("domain is a valid value", () => {
      const validDomains = ["workflow", "patterns", "testing", "tooling", "code-style", "meta"];
      for (const instinct of instincts) {
        assert.ok(
          validDomains.includes(instinct.domain),
          `Instinct ${instinct.id} has invalid domain "${instinct.domain}". Valid: ${validDomains.join(", ")}`
        );
      }
    });

    it("body is substantive (at least 20 chars)", () => {
      for (const instinct of instincts) {
        assert.ok(instinct.body.length >= 20, `Instinct ${instinct.id} body too short: "${instinct.body}"`);
      }
    });

    it("trigger starts with 'when'", () => {
      for (const instinct of instincts) {
        assert.match(instinct.trigger.toLowerCase(), /^when/, `Instinct ${instinct.id} trigger should start with "when": "${instinct.trigger}"`);
      }
    });
  });
}
