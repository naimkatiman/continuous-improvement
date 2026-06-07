// goal-state.test.mts — unit tests for the Clear Goal drift scorer.
//
// Pure functions, no filesystem. The .mjs import resolves only after
// `npm run build` regenerates the emitted artifact — per the .mts-is-source
// rule, never edit the .mjs directly.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractKeywordsFromProse, formatDriftReport, getSection, parseGoalFromPlan, pathMatchesGlob, scoreObservations, } from "../lib/goal-state.mjs";
function obs(partial) {
    return { ts: "2026-05-28T12:00:00Z", tool: "Bash", input_summary: "", output_summary: "", ...partial };
}
const PLAN_FULL = `# Task Plan

## Goal
Implement OAuth login with JWT session tokens for the auth service.

## Goal Keywords
oauth, jwt, login, session

## Goal Scope
paths: src/auth/**, test/auth/**
forbidden: src/marketing/**

## Status
Not started
`;
const PLAN_MINIMAL = `# Task Plan

## Goal
Refactor the parser to support streaming input.

## Status
Not started
`;
describe("getSection", () => {
    it("extracts a section body and stops at the next heading", () => {
        assert.equal(getSection(PLAN_MINIMAL, "Goal"), "Refactor the parser to support streaming input.");
    });
    it("is case-insensitive on the heading", () => {
        assert.equal(getSection(PLAN_MINIMAL, "goal"), "Refactor the parser to support streaming input.");
    });
    it("returns empty string for an absent section", () => {
        assert.equal(getSection(PLAN_MINIMAL, "Goal Scope"), "");
    });
    it("does not bleed Goal into Goal Keywords", () => {
        assert.equal(getSection(PLAN_FULL, "Goal"), "Implement OAuth login with JWT session tokens for the auth service.");
    });
});
describe("extractKeywordsFromProse", () => {
    it("drops stopwords, short tokens, and pure digits", () => {
        const kws = extractKeywordsFromProse("Implement the OAuth 2026 login flow for users");
        assert.ok(kws.includes("oauth"));
        assert.ok(kws.includes("login"));
        assert.ok(kws.includes("flow"));
        assert.ok(kws.includes("users"));
        assert.ok(!kws.includes("the"));
        assert.ok(!kws.includes("for"));
        assert.ok(!kws.includes("2026"));
    });
    it("dedupes and lowercases", () => {
        const kws = extractKeywordsFromProse("Parser parser PARSER streaming");
        assert.deepEqual(kws, ["parser", "streaming"]);
    });
    it("caps at 20 keywords", () => {
        const prose = Array.from({ length: 40 }, (_, i) => `keyword${i}aaaa`).join(" ");
        assert.equal(extractKeywordsFromProse(prose).length, 20);
    });
    it("keeps accented Latin, Cyrillic, and CJK tokens (item 4)", () => {
        const kws = extractKeywordsFromProse("Implement café authentication вход системы 認証画面");
        assert.ok(kws.includes("café"), "accented Latin token must survive tokenization");
        assert.ok(kws.includes("вход"), "Cyrillic token must survive tokenization");
        assert.ok(kws.includes("системы"), "longer Cyrillic token must survive tokenization");
        assert.ok(kws.includes("認証画面"), "CJK token at the length floor must survive tokenization");
    });
    it("keeps Thai words with combining marks at the length floor (Thai follow-up)", () => {
        const kws = extractKeywordsFromProse("Implement ม้านั่ง กระโดด");
        assert.ok(kws.includes("ม้านั่ง"), "Thai keyword with tone mark must survive tokenization");
        assert.ok(kws.includes("กระโดด"), "Thai keyword with vowel mark must survive tokenization");
    });
    it("drops pure non-ASCII numeral runs, not just ASCII digits (item 4 follow-up)", () => {
        // The unicode splitter now lets Arabic-Indic ١٢٣٤٥ (5 digits) survive and
        // clear the 4-char floor; the digit-drop filter must catch it like "12345".
        const kws = extractKeywordsFromProse("deploy version ١٢٣٤٥ login");
        assert.ok(kws.includes("deploy"));
        assert.ok(kws.includes("login"));
        assert.ok(!kws.includes("١٢٣٤٥"), "a pure non-ASCII numeral run must be dropped, not kept as a keyword");
    });
});
describe("parseGoalFromPlan", () => {
    it("returns null when there is no Goal section", () => {
        assert.equal(parseGoalFromPlan("# Task Plan\n\n## Status\nNot started\n"), null);
    });
    it("auto-extracts keywords when no Goal Keywords section", () => {
        const goal = parseGoalFromPlan(PLAN_MINIMAL);
        assert.ok(goal);
        assert.ok(goal.keywords.includes("parser"));
        assert.ok(goal.keywords.includes("streaming"));
        assert.deepEqual(goal.paths, []);
        assert.deepEqual(goal.forbidden, []);
    });
    it("uses explicit Goal Keywords and Goal Scope when present", () => {
        const goal = parseGoalFromPlan(PLAN_FULL);
        assert.ok(goal);
        assert.deepEqual(goal.keywords, ["oauth", "jwt", "login", "session"]);
        assert.deepEqual(goal.paths, ["src/auth/**", "test/auth/**"]);
        assert.deepEqual(goal.forbidden, ["src/marketing/**"]);
    });
});
describe("pathMatchesGlob", () => {
    it("matches a relative glob against a relative path", () => {
        assert.ok(pathMatchesGlob("src/auth/login.ts", "src/auth/**"));
    });
    it("matches a relative glob against an absolute path via suffix", () => {
        assert.ok(pathMatchesGlob("/home/me/repo/src/auth/login.ts", "src/auth/**"));
    });
    it("does not match unrelated paths", () => {
        assert.ok(!pathMatchesGlob("src/marketing/banner.ts", "src/auth/**"));
    });
    it("supports single-star segment globs", () => {
        assert.ok(pathMatchesGlob("src/auth/login.test.ts", "src/auth/*.test.ts"));
        assert.ok(!pathMatchesGlob("src/auth/nested/login.test.ts", "src/auth/*.test.ts"));
    });
});
describe("scoreObservations", () => {
    const goal = {
        prose: "auth",
        keywords: ["oauth", "jwt", "login"],
        paths: ["src/auth/**"],
        forbidden: ["src/marketing/**"],
    };
    it("reports no-data on an empty window", () => {
        const report = scoreObservations([], goal);
        assert.equal(report.status, "no-data");
        assert.equal(report.total, 0);
    });
    it("scores on-goal when keywords match", () => {
        const observations = [
            obs({ tool: "Edit", input_summary: "src/auth/login.ts" }),
            obs({ tool: "Bash", input_summary: "npm test -- oauth" }),
            obs({ tool: "Read", input_summary: "README.md" }),
        ];
        const report = scoreObservations(observations, goal);
        assert.equal(report.status, "on-goal");
        assert.equal(report.matching, 2);
        assert.equal(report.total, 3);
    });
    it("scores drift when most activity is off-goal", () => {
        const observations = [
            obs({ tool: "Edit", input_summary: "src/dashboard/widget.ts" }),
            obs({ tool: "Edit", input_summary: "src/dashboard/chart.ts" }),
            obs({ tool: "Read", input_summary: "docs/roadmap.md" }),
            obs({ tool: "Bash", input_summary: "npm run lint" }),
        ];
        const report = scoreObservations(observations, goal);
        assert.equal(report.status, "drift");
        assert.equal(report.matching, 0);
        assert.ok(report.topMismatches.length > 0);
    });
    it("treats forbidden-path activity as hard drift even with keyword hits", () => {
        const observations = [
            obs({ tool: "Edit", input_summary: "src/auth/login.ts" }),
            obs({ tool: "Edit", input_summary: "src/marketing/landing.ts" }),
        ];
        const report = scoreObservations(observations, goal);
        assert.equal(report.status, "drift");
        assert.equal(report.forbidden, 1);
    });
    it("honors a custom window", () => {
        const observations = Array.from({ length: 50 }, (_, i) => obs({ tool: "Read", input_summary: i < 45 ? "unrelated.ts" : "src/auth/login.ts" }));
        const report = scoreObservations(observations, goal, { window: 5 });
        assert.equal(report.total, 5);
        assert.equal(report.matching, 5);
        assert.equal(report.status, "on-goal");
    });
    it("orders top mismatches most-recent first", () => {
        const observations = [
            obs({ ts: "t1", tool: "Edit", input_summary: "a.ts" }),
            obs({ ts: "t2", tool: "Edit", input_summary: "b.ts" }),
        ];
        const report = scoreObservations(observations, goal);
        assert.equal(report.topMismatches[0]?.ts, "t2");
    });
});
describe("formatDriftReport", () => {
    it("renders an on-goal report without the steer-back nudge", () => {
        const report = scoreObservations([obs({ tool: "Edit", input_summary: "src/auth/login.ts" })], { prose: "", keywords: ["login"], paths: [], forbidden: [] });
        const out = formatDriftReport(report);
        assert.match(out, /ON GOAL/);
        assert.doesNotMatch(out, /Drift detected/);
    });
    it("renders a drift report with the steer-back nudge and mismatches", () => {
        const report = scoreObservations([obs({ tool: "Edit", input_summary: "src/other/thing.ts" })], { prose: "", keywords: ["login"], paths: [], forbidden: [] });
        const out = formatDriftReport(report);
        assert.match(out, /DRIFT/);
        assert.match(out, /Drift detected/);
        assert.match(out, /off-goal activity/);
    });
});
describe("parseGoalFromPlan — empty Goal Keywords section (audit #1)", () => {
    it("falls back to prose keywords when the section parses empty, not permanent drift", () => {
        const plan = [
            "## Goal",
            "Implement OAuth login with JWT session tokens for the auth service.",
            "",
            "## Goal Keywords",
            "- ",
            "- ",
            "",
            "## Status",
            "x",
        ].join("\n");
        const goal = parseGoalFromPlan(plan);
        assert.ok(goal);
        assert.ok(goal.keywords.length > 0, "an empty keyword section must fall back to prose keywords, not yield []");
        const report = scoreObservations([
            obs({ tool: "Edit", input_summary: "src/auth/oauth-login.ts", output_summary: "jwt session" }),
            obs({ tool: "Edit", input_summary: "src/auth/session.ts", output_summary: "login" }),
        ], goal);
        assert.notEqual(report.status, "drift", "on-goal work must not be reported as drift");
        assert.ok(report.matching > 0, "prose-derived keywords should match the on-goal observations");
    });
});
describe("scoreObservations — out-of-range window (item 3)", () => {
    const goal = { prose: "", keywords: ["login"], paths: [], forbidden: [] };
    const one = [obs({ tool: "Edit", input_summary: "src/auth/login.ts" })];
    it("defaults to the standard window when window is undefined", () => {
        assert.equal(scoreObservations(one, goal).total, 1);
    });
    it("honors a valid positive integer window", () => {
        assert.equal(scoreObservations(one, goal, { window: 5 }).total, 1);
    });
    for (const bad of [0, -5, 2.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        it(`rejects an explicit out-of-range window (${bad}) instead of silently defaulting`, () => {
            assert.throws(() => scoreObservations(one, goal, { window: bad }), /window/i, `window=${bad} must be rejected, not coerced to the default`);
        });
    }
});
describe("scoreObservations — non-finite threshold (audit #2)", () => {
    it("falls back to the default threshold instead of corrupting the report on NaN", () => {
        const goal = { prose: "", keywords: ["login"], paths: [], forbidden: [] };
        const report = scoreObservations([obs({ tool: "Edit", input_summary: "src/auth/login.ts" })], goal, { threshold: Number.NaN });
        assert.ok(Number.isFinite(report.threshold), "threshold must be finite, not NaN");
        assert.doesNotMatch(formatDriftReport(report), /NaN/);
        assert.notEqual(report.status, "drift", "a 100%-matching observation must not be forced to drift");
    });
});
