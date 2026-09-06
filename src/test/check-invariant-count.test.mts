import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLAIM_FILES,
  OUTSIDE_CHAIN_VERIFY_SCRIPTS,
  parseVerifyAllChain,
  parseClaims,
  findViolations,
  findOrphanVerifyScripts,
  checkInvariantCount,
} from "../bin/check-invariant-count.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const chainOf = (...names: string[]) =>
  names.map((n) => `npm run ${n}`).join(" && ");

describe("check-invariant-count — parseVerifyAllChain", () => {
  it("splits verify:* invariants from the trailing non-verify steps", () => {
    const got = parseVerifyAllChain(chainOf("verify:a", "verify:b", "typecheck"));
    assert.deepEqual(got.invariants, ["a", "b"]);
    assert.deepEqual(got.trailing, ["typecheck"]);
  });

  it("keeps chain order, which is the order the docs list", () => {
    const got = parseVerifyAllChain(chainOf("verify:zebra", "verify:alpha", "typecheck"));
    assert.deepEqual(got.invariants, ["zebra", "alpha"]);
  });

  it("handles hyphenated invariant names", () => {
    const got = parseVerifyAllChain(chainOf("verify:skill-count-prose", "typecheck"));
    assert.deepEqual(got.invariants, ["skill-count-prose"]);
  });

  it("returns empty lists for an empty chain rather than throwing", () => {
    const got = parseVerifyAllChain("");
    assert.deepEqual(got.invariants, []);
    assert.deepEqual(got.trailing, []);
  });
});

describe("check-invariant-count — parseClaims", () => {
  it("reads the long form with its name list", () => {
    const claims = parseClaims("run `npm run verify:all` (2 content invariants + typecheck: a, b, typecheck).");
    assert.equal(claims.length, 1);
    assert.equal(claims[0].count, 2);
    assert.deepEqual(claims[0].names, ["a", "b", "typecheck"]);
  });

  it("reads the short form, which states no names", () => {
    const claims = parseClaims("4. `npm run verify:all` (17 invariants + typecheck)");
    assert.equal(claims.length, 1);
    assert.equal(claims[0].count, 17);
    assert.equal(claims[0].names, null);
  });

  it("finds several claims in one file", () => {
    const claims = parseClaims("(3 invariants + typecheck)\nand later (3 invariants + typecheck)");
    assert.equal(claims.length, 2);
  });

  it("finds nothing in prose that merely mentions verify:all", () => {
    assert.deepEqual(parseClaims("just run `npm run verify:all` before pushing"), []);
  });
});

describe("check-invariant-count — findViolations", () => {
  const chain = { invariants: ["a", "b", "c"], trailing: ["typecheck"] };

  it("passes when the count and the ordered list both match", () => {
    const claims = { "X.md": [{ count: 3, names: ["a", "b", "c", "typecheck"] }] };
    assert.deepEqual(findViolations(chain, claims), []);
  });

  it("passes a short-form claim that states only the count", () => {
    assert.deepEqual(findViolations(chain, { "X.md": [{ count: 3, names: null }] }), []);
  });

  it("flags a stale count, naming both numbers and the file", () => {
    const v = findViolations(chain, { "X.md": [{ count: 2, names: null }] });
    assert.equal(v.length, 1);
    assert.match(v[0], /X\.md/);
    assert.match(v[0], /2/);
    assert.match(v[0], /3/);
  });

  it("flags a name list missing a newly added invariant", () => {
    const v = findViolations(chain, { "X.md": [{ count: 3, names: ["a", "b", "typecheck"] }] });
    assert.equal(v.length, 1);
    assert.match(v[0], /c/);
  });

  it("flags a name list that is out of chain order", () => {
    const v = findViolations(chain, { "X.md": [{ count: 3, names: ["b", "a", "c", "typecheck"] }] });
    assert.equal(v.length, 1);
    assert.match(v[0], /order/i);
  });

  it("flags a name list that forgot the trailing typecheck", () => {
    const v = findViolations(chain, { "X.md": [{ count: 3, names: ["a", "b", "c"] }] });
    assert.equal(v.length, 1);
  });

  it("fails closed when a scanned file states no claim at all", () => {
    const v = findViolations(chain, { "X.md": [] });
    assert.equal(v.length, 1);
    assert.match(v[0], /no .*claim/i);
  });

  it("reports every offending file, not just the first", () => {
    const v = findViolations(chain, { "X.md": [{ count: 9, names: null }], "Y.md": [] });
    assert.equal(v.length, 2);
  });
});

describe("check-invariant-count — orphan verify:* scripts", () => {
  const chain = { invariants: ["skill-mirror", "routing-targets"], trailing: ["typecheck"] };

  it("flags a verify:* script that is not in the verify:all chain", () => {
    const orphans = findOrphanVerifyScripts(
      { "verify:all": "npm run verify:skill-mirror", "verify:skill-mirror": "node x", "verify:foo": "node y" },
      chain,
    );
    assert.deepEqual(orphans, ["verify:foo"]);
  });

  it("does not flag verify:generated, which is a CI git-diff gate not a content invariant", () => {
    const orphans = findOrphanVerifyScripts(
      {
        "verify:all": "npm run verify:skill-mirror",
        "verify:skill-mirror": "node x",
        "verify:routing-targets": "node z",
        "verify:generated": "npm run build && git diff --exit-code",
      },
      chain,
    );
    assert.deepEqual(orphans, []);
  });

  it("does not flag verify:all itself", () => {
    assert.deepEqual([...OUTSIDE_CHAIN_VERIFY_SCRIPTS], ["verify:all", "verify:generated"]);
    assert.deepEqual(
      findOrphanVerifyScripts({ "verify:all": "npm run verify:skill-mirror", "verify:skill-mirror": "node x", "verify:routing-targets": "node z" }, chain),
      [],
    );
  });

  it("reports every orphan, not just the first", () => {
    const orphans = findOrphanVerifyScripts(
      { "verify:all": "x", "verify:alpha": "a", "verify:beta": "b", "verify:skill-mirror": "c" },
      chain,
    );
    assert.deepEqual(orphans, ["verify:alpha", "verify:beta"]);
  });

  it("checkInvariantCount fails when package.json gains a verify:* script the chain never runs", () => {
    const root = mkdtempSync(join(tmpdir(), "invariant-count-orphan-"));
    try {
      const claim =
        "(2 content invariants + typecheck: skill-mirror, routing-targets, typecheck) and (2 invariants + typecheck)";
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          scripts: {
            "verify:all": "npm run verify:skill-mirror && npm run verify:routing-targets && npm run typecheck",
            "verify:skill-mirror": "node x",
            "verify:routing-targets": "node z",
            "verify:generated": "npm run build && git diff --exit-code",
            "verify:foo": "node y",
          },
        }),
      );
      writeFileSync(join(root, "CLAUDE.md"), claim);
      writeFileSync(join(root, "AGENTS.md"), claim);
      mkdirSync(join(root, "docs"));
      writeFileSync(join(root, "docs", "RELEASING.md"), claim);
      const { violations } = checkInvariantCount(root);
      assert.equal(violations.length, 1);
      assert.match(violations[0], /script "verify:foo"/);
      assert.match(violations[0], /not in the verify:all chain/);
      assert.ok(!violations.some((v) => /script "verify:generated"/.test(v)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("check-invariant-count — against the real repo", () => {
  it("scans the three files that carry the claim", () => {
    assert.deepEqual(CLAIM_FILES, ["CLAUDE.md", "AGENTS.md", join("docs", "RELEASING.md")]);
  });

  it("every claim in the repo matches the actual verify:all chain", () => {
    assert.deepEqual(checkInvariantCount(REPO_ROOT).violations, []);
  });

  it("derives the invariant list from package.json, not a hardcoded copy", () => {
    const { chain } = checkInvariantCount(REPO_ROOT);
    assert.ok(chain.invariants.includes("test-count"), "test-count shipped in #306");
    assert.ok(chain.invariants.includes("routing-targets"));
    assert.deepEqual(chain.trailing, ["typecheck"]);
  });

  it("every verify:* script is in the verify:all chain, except the documented outsiders", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const { chain } = checkInvariantCount(REPO_ROOT);
    assert.deepEqual(findOrphanVerifyScripts(pkg.scripts, chain), []);
  });
});
