import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const FLOOR_LITERAL = "2 WILD + 5 RISA = 7 items minimum";
const MIRRORS = [
    {
        path: "skills/wild-risa-balance.md",
        section: "How to Apply in a Recommendation List",
    },
    {
        path: "plugins/continuous-improvement/skills/wild-risa-balance/SKILL.md",
        section: "How to Apply in a Recommendation List (plugin mirror)",
    },
];
describe("wild-risa-balance recommendation floor", () => {
    for (const mirror of MIRRORS) {
        describe(mirror.path, () => {
            let content = "";
            it("exists and is readable", () => {
                content = readFileSync(join(REPO_ROOT, mirror.path), "utf8");
                assert.ok(content.length > 100, `${mirror.path} should not be empty`);
            });
            it(`contains the floor literal in ${mirror.section}`, () => {
                assert.ok(content.includes(FLOOR_LITERAL), `${mirror.path} is missing the recommendation floor literal. The skill must specify:\n  ${FLOOR_LITERAL}\nDropping this floor silently degrades lists to flat 2+2 blocks where bold and safe items compete equally.`);
            });
        });
    }
});
