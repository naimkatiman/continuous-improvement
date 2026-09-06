import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractClaims, parseActualCount, findViolations, applyTestCount, } from "../bin/check-test-count.mjs";
// import.meta.dirname landed in Node 20.11 and this repo's CI matrix includes 18,
// where it is undefined. Every other test file resolves its directory this way.
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const strip = (n) => `<li><span class="v">${n}</span><span class="k">Tests in the suite</span></li>`;
const ladder = (a, b) => `tests      PASS  ${a}/${b}`;
const page = (s, l) => `<html><body>\n${s}\n<pre>\n${l}\n</pre>\n</body></html>`;
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
    it("takes the last tests N line, which is the runner summary", () => {
        assert.equal(parseActualCount("tests 3\nℹ tests 1271\n"), 1271);
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
    it("applyTestCount on the shipped page keeps neighbor cells and agrees with extractClaims", () => {
        const html = readFileSync(join(REPO_ROOT, "docs", "landing", "index.html"), "utf8");
        const claimed = extractClaims(html).strip[0];
        const { html: out } = applyTestCount(html, claimed + 1);
        assert.deepEqual(extractClaims(out).strip, [claimed + 1]);
        assert.deepEqual(extractClaims(out).ladder, [claimed + 1, claimed + 1]);
        assert.match(out, />28</);
        assert.match(out, />v3\.25\.0</);
    });
});
const neighbors = `
<li><span class="v">28</span><span class="k">Bundled skills</span></li>
<li><span class="v">v3.25.0</span><span class="k">Current rev</span></li>
`;
describe("check-test-count — applyTestCount", () => {
    it("rewrites the strip with a thousands comma and the ladder without one", () => {
        const html = page(strip("1,271") + neighbors, ladder("1271", "1271"));
        const { html: out, changed } = applyTestCount(html, 1300);
        assert.equal(changed, true);
        assert.deepEqual(extractClaims(out), { strip: [1300], ladder: [1300, 1300] });
        assert.match(out, />1,300</);
        assert.match(out, /PASS  1300\/1300/);
    });
    it("rewrites when the digit width and the thousands comma both change", () => {
        const html = page(strip("999"), ladder("999", "999"));
        const { html: out } = applyTestCount(html, 1000);
        assert.deepEqual(extractClaims(out), { strip: [1000], ladder: [1000, 1000] });
        assert.match(out, />1,000</);
        assert.match(out, /PASS  1000\/1000/);
    });
    it("reports unchanged when both surfaces already state the actual count", () => {
        const html = page(strip("1,300"), ladder("1300", "1300"));
        const { html: out, changed } = applyTestCount(html, 1300);
        assert.equal(changed, false);
        assert.equal(out, html);
    });
    it("rewrites both surfaces to the actual count when they disagree with each other", () => {
        const html = page(strip("1,249"), ladder("1271", "1271"));
        const { html: out } = applyTestCount(html, 1300);
        assert.deepEqual(extractClaims(out), { strip: [1300], ladder: [1300, 1300] });
    });
    it("does not touch the bundled-skills cell or the current-rev marker", () => {
        const html = page(strip("1,271") + neighbors, ladder("1271", "1271"));
        const { html: out } = applyTestCount(html, 1300);
        assert.match(out, />28</);
        assert.match(out, />v3\.25\.0</);
    });
    it("throws when the spec strip is missing rather than writing a partial page", () => {
        const html = page("", ladder("1271", "1271"));
        assert.throws(() => applyTestCount(html, 1300), /strip/i);
    });
    it("throws when the verification-loop ladder is missing rather than writing a partial page", () => {
        const html = page(strip("1,271"), "");
        assert.throws(() => applyTestCount(html, 1300), /ladder|verification/i);
    });
    it("rejects a non-integer actual count", () => {
        const html = page(strip("1,271"), ladder("1271", "1271"));
        assert.throws(() => applyTestCount(html, 1.5), RangeError);
        assert.throws(() => applyTestCount(html, -1), RangeError);
        assert.throws(() => applyTestCount(html, Number.NaN), RangeError);
    });
});
describe("check-test-count — --write CLI", () => {
    const CHECKER = join(REPO_ROOT, "bin", "check-test-count.mjs");
    function setupLanding(html, runLog) {
        const root = mkdtempSync(join(tmpdir(), "test-count-write-"));
        mkdirSync(join(root, "docs", "landing"), { recursive: true });
        writeFileSync(join(root, "docs", "landing", "index.html"), html);
        const log = join(root, "test-run.log");
        writeFileSync(log, runLog);
        return { root, log };
    }
    it("writes both surfaces from --actual-from and exits 0", () => {
        const { root, log } = setupLanding(page(strip("1,271"), ladder("1271", "1271")), "ℹ tests 1300\nℹ pass 1300\n");
        try {
            const stdout = execFileSync("node", [CHECKER, root, "--write", "--actual-from", log], {
                encoding: "utf8",
            });
            assert.match(stdout, /wrote 1300/);
            const html = readFileSync(join(root, "docs", "landing", "index.html"), "utf8");
            assert.deepEqual(extractClaims(html), { strip: [1300], ladder: [1300, 1300] });
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("exits 0 without rewriting when the landing already matches the run", () => {
        const html = page(strip("1,300"), ladder("1300", "1300"));
        const { root, log } = setupLanding(html, "tests 1300\n");
        try {
            const stdout = execFileSync("node", [CHECKER, root, "--write", "--actual-from", log], {
                encoding: "utf8",
            });
            assert.match(stdout, /already states 1300/);
            assert.equal(readFileSync(join(root, "docs", "landing", "index.html"), "utf8"), html);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("fails closed when --write is given without --actual-from", () => {
        const { root } = setupLanding(page(strip("1,271"), ladder("1271", "1271")), "tests 1300\n");
        try {
            execFileSync("node", [CHECKER, root, "--write"], { encoding: "utf8" });
            assert.fail("--write without --actual-from should exit non-zero");
        }
        catch (error) {
            const failure = error;
            assert.equal(failure.status, 1);
            assert.match(failure.stderr ?? "", /--write requires --actual-from/);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("does not write the file when the spec strip is missing", () => {
        const html = page("", ladder("1271", "1271"));
        const { root, log } = setupLanding(html, "tests 1300\n");
        try {
            execFileSync("node", [CHECKER, root, "--write", "--actual-from", log], { encoding: "utf8" });
            assert.fail("missing strip should exit non-zero");
        }
        catch (error) {
            const failure = error;
            assert.equal(failure.status, 1);
            assert.match(failure.stderr ?? "", /strip/i);
            assert.equal(readFileSync(join(root, "docs", "landing", "index.html"), "utf8"), html);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
