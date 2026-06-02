// recall-index.test.mts — unit tests for the BM25 episodic-recall index.
//
// Pure functions, no filesystem. The .mjs import resolves only after
// `npm run build` regenerates the emitted artifact — per the .mts-is-source
// rule, never edit the .mjs directly.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIndex, formatRecallHits, parseSince, query, redactSecrets, tokenize, } from "../lib/recall-index.mjs";
function obs(partial) {
    return { ts: "2026-05-28T12:00:00Z", tool: "Bash", input_summary: "", output_summary: "", ...partial };
}
describe("tokenize", () => {
    it("lowercases and splits on non-alphanumeric", () => {
        assert.deepEqual(tokenize("npm run Build-Test"), ["npm", "run", "build", "test"]);
    });
    it("drops stopwords and one-char tokens", () => {
        const tokens = tokenize("the a permission denied");
        assert.ok(!tokens.includes("the"));
        assert.ok(!tokens.includes("a"));
        assert.deepEqual(tokens, ["permission", "denied"]);
    });
});
describe("redactSecrets", () => {
    it("redacts AWS access keys", () => {
        assert.equal(redactSecrets("key AKIAIOSFODNN7EXAMPLE here"), "key AKIA<redacted> here");
    });
    it("redacts JWT-shaped triplets", () => {
        const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N";
        assert.equal(redactSecrets(`token ${jwt}`), "token <jwt-redacted>");
    });
    it("redacts bearer tokens", () => {
        assert.match(redactSecrets("Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456"), /Bearer <redacted>/);
    });
    it("redacts KEY/SECRET/PASSWORD assignments", () => {
        assert.equal(redactSecrets("MY_API_KEY=supersecretvalue"), "MY_API_KEY=<redacted>");
        assert.equal(redactSecrets("DB_PASSWORD: hunter2hunter2"), "DB_PASSWORD: <redacted>");
    });
    it("redacts long hex strings", () => {
        assert.equal(redactSecrets("sha 0123456789abcdef0123456789abcdef done"), "sha <hex-redacted> done");
    });
    it("does not redact ordinary code", () => {
        const ordinary = 'console.log("test result ok")';
        assert.equal(redactSecrets(ordinary), ordinary);
    });
});
describe("buildIndex + query", () => {
    const observations = [
        obs({ ts: "2026-05-20T10:00:00Z", tool: "Bash", input_summary: "git push origin main", output_summary: "Permission denied: harness blocked direct push to main" }),
        obs({ ts: "2026-05-22T10:00:00Z", tool: "Bash", input_summary: "npm run build", output_summary: "build succeeded" }),
        obs({ ts: "2026-05-25T10:00:00Z", tool: "Edit", input_summary: "src/auth/login.ts", output_summary: "ok" }),
        obs({ ts: "2026-05-27T10:00:00Z", tool: "Bash", input_summary: "jq -r .x", output_summary: "bash: jq: command not found" }),
    ];
    it("returns empty for an empty query", () => {
        const index = buildIndex(observations);
        assert.deepEqual(query(index, ""), []);
    });
    it("ranks the most relevant observation first", () => {
        const index = buildIndex(observations);
        const hits = query(index, "permission denied push");
        assert.ok(hits.length > 0);
        assert.match(hits[0].snippet, /Permission denied/);
    });
    it("returns no hits when nothing matches", () => {
        const index = buildIndex(observations);
        assert.deepEqual(query(index, "kubernetes helm chart"), []);
    });
    it("respects the k limit", () => {
        const index = buildIndex(observations);
        const hits = query(index, "bash build push jq", { k: 1 });
        assert.equal(hits.length, 1);
    });
    it("filters out rows older than a relative since window", () => {
        const index = buildIndex(observations);
        const now = Date.parse("2026-05-28T10:00:00Z");
        const hits = query(index, "command not found push denied", { since: "3d", now });
        assert.ok(hits.every((h) => Date.parse(h.ts) >= now - 3 * 86_400_000));
        assert.ok(hits.some((h) => h.snippet.includes("command not found")));
        assert.ok(!hits.some((h) => h.snippet.includes("Permission denied")));
    });
    it("redacts secrets in snippets", () => {
        const withSecret = [obs({ input_summary: "export AWS_SECRET=topsecretvalue123", output_summary: "set permission scope" })];
        const index = buildIndex(withSecret);
        const hits = query(index, "permission scope");
        assert.ok(hits.length > 0);
        assert.ok(!hits[0].snippet.includes("topsecretvalue123"));
    });
});
describe("parseSince", () => {
    const now = Date.parse("2026-05-28T12:00:00Z");
    it("parses relative day/hour/minute windows", () => {
        assert.equal(parseSince("7d", now), now - 7 * 86_400_000);
        assert.equal(parseSince("24h", now), now - 24 * 3_600_000);
        assert.equal(parseSince("30m", now), now - 30 * 60_000);
    });
    it("parses ISO timestamps", () => {
        assert.equal(parseSince("2026-05-01T00:00:00Z", now), Date.parse("2026-05-01T00:00:00Z"));
    });
    it("returns null for garbage", () => {
        assert.equal(parseSince("not-a-date", now), null);
    });
});
describe("formatRecallHits", () => {
    it("renders a no-match message", () => {
        assert.match(formatRecallHits([], "xyz"), /No past observations matched/);
    });
    it("renders ranked hits with scores", () => {
        const out = formatRecallHits([{ ts: "2026-05-20T10:00:00Z", session: "s1", tool: "Bash", snippet: "permission denied", score: 1.23, index: 0 }], "permission");
        assert.match(out, /Recall: "permission"/);
        assert.match(out, /Bash/);
        assert.match(out, /1\.23/);
    });
});
describe("query — since window with undated rows (audit #5)", () => {
    it("excludes rows with missing or unparseable ts when a since window is active", () => {
        const now = Date.parse("2026-05-28T12:00:00Z");
        const index = buildIndex([
            obs({ ts: "", input_summary: "permission denied missing timestamp" }),
            obs({ ts: "not-a-real-date", input_summary: "permission denied garbage timestamp" }),
        ]);
        const hits = query(index, "permission denied", { since: "1d", now });
        assert.equal(hits.length, 0, "undateable rows must fail closed under a time-bounded query");
    });
    it("still returns undated rows when no since window is set", () => {
        const index = buildIndex([obs({ ts: "", input_summary: "permission denied no timestamp" })]);
        const hits = query(index, "permission denied", {});
        assert.equal(hits.length, 1, "undated rows are excluded only under an active since filter");
    });
});
