import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
const landingDriftPath = join(process.cwd(), ".github", "workflows", "landing-drift.yml");
const ciPath = join(process.cwd(), ".github", "workflows", "ci.yml");
function jobBody(workflow, jobName) {
    const marker = `\n  ${jobName}:\n`;
    const start = workflow.indexOf(marker);
    assert.notEqual(start, -1, `workflow must define the ${jobName} job`);
    const after = workflow.slice(start + marker.length);
    const next = after.search(/\n  [a-zA-Z0-9_-]+:\n/);
    return next === -1 ? after : after.slice(0, next);
}
describe("landing-drift workflow — test-count bump PR", () => {
    const workflow = readFileSync(landingDriftPath, "utf8");
    it("runs on main only, so the bot branch cannot retrigger itself", () => {
        assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/);
        assert.doesNotMatch(workflow, /pull_request:/);
    });
    it("has a bump-test-count job separate from the REV drift job", () => {
        assert.match(workflow, /\n  drift:\n/);
        assert.match(workflow, /\n  bump-test-count:\n/);
        const bump = jobBody(workflow, "bump-test-count");
        assert.doesNotMatch(bump, /\bneeds:\s*drift\b/);
    });
    it("runs the suite, writes the landing count, and opens a PR instead of failing red", () => {
        const bump = jobBody(workflow, "bump-test-count");
        assert.match(bump, /set -euo pipefail/);
        assert.match(bump, /tee test-run\.log/);
        assert.match(bump, /check-test-count\.mjs --write --actual-from test-run\.log/);
        assert.match(bump, /gh pr create/);
        assert.doesNotMatch(bump, /peter-evans\/create-pull-request/);
        assert.match(bump, /chore\/landing-test-count/);
        assert.match(bump, /git push --force-with-lease origin chore\/landing-test-count/);
        assert.doesNotMatch(bump, /git push --force /);
    });
    it("grants the bump job contents write and pull-requests write, not the REV job", () => {
        const bump = jobBody(workflow, "bump-test-count");
        const drift = jobBody(workflow, "drift");
        assert.match(bump, /contents:\s*write/);
        assert.match(bump, /pull-requests:\s*write/);
        assert.doesNotMatch(drift, /contents:\s*write/);
        assert.doesNotMatch(drift, /pull-requests:\s*write/);
    });
    it("stages only docs/landing/index.html", () => {
        const bump = jobBody(workflow, "bump-test-count");
        assert.match(bump, /git add docs\/landing\/index\.html/);
        assert.doesNotMatch(bump, /git add -A/);
        assert.doesNotMatch(bump, /git add \./);
    });
    it("still fails the REV job when the deployed page is stale", () => {
        const drift = jobBody(workflow, "drift");
        assert.match(drift, /Deployed landing is STALE/);
        assert.match(drift, /exit 1/);
    });
    it("does not open a bump PR from a fork", () => {
        const bump = jobBody(workflow, "bump-test-count");
        assert.match(bump, /github\.repository\s*==\s*'naimkatiman\/continuous-improvement'/);
    });
});
describe("CI workflow — test count on pull requests", () => {
    it("does not require the landing count to match the run, so a feature PR is not a manual bump", () => {
        const ci = readFileSync(ciPath, "utf8");
        assert.doesNotMatch(ci, /check-test-count\.mjs --actual-from/);
        assert.match(ci, /check-test-count\.mjs/);
    });
});
