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
        const publishJob = nextJobOffset === -1 ? afterPublishJob : afterPublishJob.slice(0, nextJobOffset);
        const upgradeIndex = publishJob.indexOf("run: npm install -g npm@11.18.0");
        const publishIndex = publishJob.indexOf("npm publish --access public --provenance");
        assert.notEqual(upgradeIndex, -1, "publish job must install pinned npm 11.18.0");
        assert.ok(publishIndex > upgradeIndex, "publish job must upgrade npm before publishing");
        assert.doesNotMatch(publishJob, /\bnpx\b[^\n]*npm[^\n]*publish/);
    });
});
