import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const workflowPath = join(process.cwd(), ".github", "workflows", "release.yml");

describe("release workflow", () => {
  it("installs the pinned publisher before using it directly", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const publishJobMarker = "\n  publish:\n";
    const publishJobStart = workflow.indexOf(publishJobMarker);
    assert.notEqual(publishJobStart, -1, "release workflow must define the publish job");

    const afterPublishJob = workflow.slice(publishJobStart + publishJobMarker.length);
    const nextJobOffset = afterPublishJob.search(/\n  [a-zA-Z0-9_-]+:\n/);
    const publishJob =
      nextJobOffset === -1 ? afterPublishJob : afterPublishJob.slice(0, nextJobOffset);
    const upgradeIndex = publishJob.indexOf("run: npm install -g npm@11.18.0");
    const publishIndex = publishJob.indexOf("npm publish --access public --provenance");

    assert.notEqual(upgradeIndex, -1, "publish job must install pinned npm 11.18.0");
    assert.ok(publishIndex > upgradeIndex, "publish job must upgrade npm before publishing");
    assert.doesNotMatch(publishJob, /\bnpx\b[^\n]*npm[^\n]*publish/);
  });

  it("gates on CI having passed on the tagged commit instead of re-running the suite", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const gateIndex = workflow.indexOf("actions/workflows/ci.yml/runs?head_sha=$GITHUB_SHA&event=push");
    const publishIndex = workflow.indexOf("npm publish --access public --provenance");

    assert.notEqual(gateIndex, -1, "release must look up ci.yml's push run for the tagged SHA");
    assert.ok(publishIndex > gateIndex, "the CI gate must run before npm publish");
    assert.match(workflow, /^      actions: read$/m, "the job needs actions: read to query workflow runs");
    assert.doesNotMatch(workflow, /run: node --test test\/\*\.test\.mjs/, "release must not re-run the suite CI already ran");
  });
});

describe("ci workflow", () => {
  const ciPath = join(process.cwd(), ".github", "workflows", "ci.yml");

  it("cancels stale PR runs but never cancels a push-to-main run the release gate depends on", () => {
    const workflow = readFileSync(ciPath, "utf8");
    assert.match(workflow, /^concurrency:\n  group: ci-\$\{\{ github\.event_name == 'pull_request' && github\.ref \|\| github\.sha \}\}\n  cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m);
  });

  it("runs the suite once, after the explicit build step", () => {
    const workflow = readFileSync(ciPath, "utf8");
    assert.match(workflow, /node --test test\/\*\.test\.mjs 2>&1 \| tee test-run\.log/);
    assert.doesNotMatch(workflow, /npm test 2>&1/, "npm test rebuilds; the build step already ran");
  });
});
