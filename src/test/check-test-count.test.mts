import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractClaims,
  parseActualCount,
  sumActualCounts,
  findViolations,
} from "../bin/check-test-count.mjs";

// import.meta.dirname landed in Node 20.11 and this repo's CI matrix includes 18,
// where it is undefined. Every other test file resolves its directory this way.
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const strip = (n: string) =>
  `<li><span class="v">${n}</span><span class="k">Tests in the suite</span></li>`;
const ladder = (a: string, b: string) => `tests      PASS  ${a}/${b}`;

const page = (s: string, l: string) => `<html><body>\n${s}\n<pre>\n${l}\n</pre>\n</body></html>`;

describe("check-test-count — extractClaims", () => {
  it("reads the spec strip value, stripping the thousands comma", () => {
    const claims = extractClaims(page(strip("1,271"), ladder("1271", "1271")));
    assert.deepEqual(claims.strip, [1271]);
  });

  it("reads both sides of the verification-loop ladder line", () => {
    const claims = extractClaims(page(strip("1,271"), ladder("1271", "1271")));
    assert.deepEqual(claims.ladder, [1271, 1271]);
  });

  it("accepts a strip value written without a comma", () => {
    const claims = extractClaims(page(strip("999"), ladder("999", "999")));
    assert.deepEqual(claims.strip, [999]);
  });

  it("tolerates extra attributes and whitespace on the strip spans", () => {
    const html = `<li><span  class="v big"  data-x="1"> 1,271 </span><span class='k'> Tests in the suite </span></li>\n${ladder("1271", "1271")}`;
    assert.deepEqual(extractClaims(html).strip, [1271]);
  });

  it("does not match a different strip metric", () => {
    const html = `<li><span class="v">28</span><span class="k">Bundled skills</span></li>`;
    assert.deepEqual(extractClaims(html).strip, []);
  });

  it("finds nothing in a page with no claims", () => {
    const claims = extractClaims("<html><body><p>nothing here</p></body></html>");
    assert.deepEqual(claims.strip, []);
    assert.deepEqual(claims.ladder, []);
  });
});

describe("check-test-count — parseActualCount", () => {
  it("parses the node test runner summary line", () => {
    assert.equal(parseActualCount("ℹ suites 19\nℹ tests 1271\nℹ pass 1265\n"), 1271);
  });

  it("parses the line without the info glyph", () => {
    assert.equal(parseActualCount("tests 1271\n"), 1271);
  });

  it("takes the total, not the pass count, when both are present", () => {
    assert.equal(parseActualCount("ℹ tests 1271\nℹ pass 1265\nℹ fail 6\n"), 1271);
  });

  it("returns null when no summary line is present", () => {
    assert.equal(parseActualCount("some build log with no summary"), null);
  });

  it("returns null for an empty file rather than guessing zero", () => {
    assert.equal(parseActualCount(""), null);
  });
});

describe("check-test-count — findViolations", () => {
  const agreed = { strip: [1271], ladder: [1271, 1271] };

  it("passes when every claim agrees and no actual count is supplied", () => {
    assert.deepEqual(findViolations(agreed, null), []);
  });

  it("passes when the actual run matches the claims", () => {
    assert.deepEqual(findViolations(agreed, 1271), []);
  });

  it("fails closed when the strip claim is missing", () => {
    const v = findViolations({ strip: [], ladder: [1271, 1271] }, null);
    assert.equal(v.length, 1);
    assert.match(v[0], /strip/i);
  });

  it("fails closed when the ladder claim is missing", () => {
    const v = findViolations({ strip: [1271], ladder: [] }, null);
    assert.equal(v.length, 1);
    assert.match(v[0], /ladder|verification/i);
  });

  it("flags two surfaces that disagree with each other", () => {
    const v = findViolations({ strip: [1249], ladder: [1271, 1271] }, null);
    assert.equal(v.length, 1);
    assert.match(v[0], /1249/);
    assert.match(v[0], /1271/);
  });

  it("flags a ladder line whose two sides disagree", () => {
    const v = findViolations({ strip: [1271], ladder: [1271, 1270] }, null);
    assert.equal(v.length, 1);
    assert.match(v[0], /1270/);
  });

  it("flags claims that disagree with the actual run, naming both numbers", () => {
    const v = findViolations(agreed, 1300);
    assert.equal(v.length, 1);
    assert.match(v[0], /1271/);
    assert.match(v[0], /1300/);
  });

  it("reports the internal disagreement first and does not also compare a contested number to the run", () => {
    const v = findViolations({ strip: [1249], ladder: [1271, 1271] }, 1271);
    assert.equal(v.length, 1);
    assert.match(v[0], /1249/);
  });
});

describe("check-test-count — against the real landing page", () => {
  it("the shipped landing page states a test count on both surfaces, in agreement", () => {
    const html = readFileSync(join(REPO_ROOT, "docs", "landing", "index.html"), "utf8");
    const claims = extractClaims(html);
    assert.ok(claims.strip.length > 0, "spec strip must state a test count");
    assert.ok(claims.ladder.length > 0, "verification-loop panel must state a test count");
    assert.deepEqual(findViolations(claims, null), []);
  });
});

describe("check-test-count — sumActualCounts (sharded runs)", () => {
  it("sums the summary line of every shard", () => {
    assert.equal(sumActualCounts(["ℹ tests 2400\nℹ pass 2400", "ℹ tests 2492\nℹ pass 2490"]), 4892);
  });

  it("matches parseActualCount for a single unsharded run", () => {
    assert.equal(sumActualCounts(["ℹ tests 4892"]), 4892);
  });

  it("returns null when any shard has no summary line, so a lost shard cannot pass", () => {
    assert.equal(sumActualCounts(["ℹ tests 2400", "npm ERR! the runner crashed"]), null);
  });

  it("returns null for no runs at all rather than summing to zero", () => {
    assert.equal(sumActualCounts([]), null);
  });
});

describe("check-test-count — CLI with repeated --actual-from", () => {
  const BIN = join(REPO_ROOT, "bin", "check-test-count.mjs");

  const run = (root: string, logs: string[]): number => {
    const args = [BIN, root, ...logs.flatMap((l) => ["--actual-from", l])];
    try {
      execFileSync(process.execPath, args, { stdio: "pipe" });
      return 0;
    } catch (err) {
      return (err as { status: number }).status;
    }
  };

  const withRepo = (fn: (root: string, log: (name: string, body: string) => string) => void): void => {
    const root = mkdtempSync(join(tmpdir(), "ci-test-count-"));
    try {
      mkdirSync(join(root, "docs", "landing"), { recursive: true });
      writeFileSync(join(root, "docs", "landing", "index.html"), page(strip("10"), ladder("10", "10")));
      fn(root, (name, body) => {
        const path = join(root, name);
        writeFileSync(path, body);
        return path;
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it("passes when the shards add up to the stated count", () => {
    withRepo((root, log) => {
      assert.equal(run(root, [log("a.log", "ℹ tests 4"), log("b.log", "ℹ tests 6")]), 0);
    });
  });

  it("fails when one shard is checked alone", () => {
    withRepo((root, log) => {
      assert.equal(run(root, [log("a.log", "ℹ tests 4")]), 1);
    });
  });

  it("fails when an ignored --test-shard flag makes both shards run everything", () => {
    withRepo((root, log) => {
      assert.equal(run(root, [log("a.log", "ℹ tests 10"), log("b.log", "ℹ tests 10")]), 1);
    });
  });

  it("fails closed when a shard log has no summary line", () => {
    withRepo((root, log) => {
      assert.equal(run(root, [log("a.log", "ℹ tests 10"), log("b.log", "crashed")]), 1);
    });
  });
});
