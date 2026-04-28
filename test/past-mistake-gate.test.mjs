import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const PHASE_0_HEADING = "Phase 0: Acknowledge (Past Mistake Acknowledgment Gate / P-MAG)";
const NEGATIVE_PROMPT_FIELD = "Will NOT repeat:";
const STOP_CONDITION_BULLET = "Prior-mistake residue still present";
const MIRRORS = [
    {
        path: "skills/proceed-with-the-recommendation.md",
        label: "source skill",
    },
    {
        path: "plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md",
        label: "plugin mirror",
    },
];
const REQUIRED_LITERALS = [
    {
        literal: PHASE_0_HEADING,
        reason: "Phase 0 section heading — dropping it removes the whole P-MAG gate.",
    },
    {
        literal: NEGATIVE_PROMPT_FIELD,
        reason: "Negative-prompt field — Rule 3 lives in the Phase 2 plan template via this marker.",
    },
    {
        literal: STOP_CONDITION_BULLET,
        reason: "Stop Conditions bullet — Rule 2 clearance gate is enumerated as a hard halt via this line.",
    },
];
describe("proceed-with-the-recommendation past-mistake-gate (P-MAG)", () => {
    for (const mirror of MIRRORS) {
        const content = readFileSync(join(REPO_ROOT, mirror.path), "utf8");
        describe(`${mirror.label} (${mirror.path})`, () => {
            it("exists and is non-empty", () => {
                assert.ok(content.length > 100, `${mirror.path} should not be empty`);
            });
            for (const required of REQUIRED_LITERALS) {
                it(`contains literal: ${required.literal}`, () => {
                    assert.ok(content.includes(required.literal), `${mirror.path} is missing the P-MAG literal:\n  ${required.literal}\n${required.reason}`);
                });
            }
        });
    }
});
