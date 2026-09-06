import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLAIM_FILES, parseVerifyAllChain, parseClaims, findViolations, checkInvariantCount, } from "../bin/check-invariant-count.mjs";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const chainOf = (...names) => names.map((n) => `npm run ${n}`).join(" && ");
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
});
