import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const ITERATION_FIELD = "Iteration — Next best recommendations (ranked, top 3)";
const MIRRORS = [
    { path: "SKILL.md", section: "Law 5 reflection block" },
    {
        path: "commands/continuous-improvement.md",
        section: "Step 1 reflection template",
    },
    {
        path: "plugins/continuous-improvement/skills/continuous-improvement/SKILL.md",
        section: "Law 5 reflection block (plugin mirror)",
    },
    {
        path: "plugins/continuous-improvement/commands/continuous-improvement.md",
        section: "Step 1 reflection template (plugin mirror)",
    },
    {
        path: "skills/proceed-with-claude-recommendation.md",
        section: "Phase 6 reflection block",
    },
];
describe("Reflection block 'Iteration — Next best recommendations' field", () => {
    for (const mirror of MIRRORS) {
        describe(mirror.path, () => {
            let content = "";
            it("exists and is readable", () => {
                content = readFileSync(join(REPO_ROOT, mirror.path), "utf8");
                assert.ok(content.length > 100, `${mirror.path} should not be empty`);
            });
            it(`contains the Iteration field in ${mirror.section}`, () => {
                assert.ok(content.includes(ITERATION_FIELD), `${mirror.path} is missing the Iteration field. Each Reflection block must include the literal:\n  ${ITERATION_FIELD}\nSee SKILL.md Law 5 for the canonical template.`);
            });
            it("contains the 3-item ranked structure (1./2./3.)", () => {
                const idx = content.indexOf(ITERATION_FIELD);
                assert.ok(idx >= 0, "field must exist before structure check");
                const tail = content.slice(idx, idx + 1500);
                assert.match(tail, /\b1\./, `${mirror.path} Iteration block must include item "1."`);
                assert.match(tail, /\b2\./, `${mirror.path} Iteration block must include item "2."`);
                assert.match(tail, /\b3\./, `${mirror.path} Iteration block must include item "3."`);
            });
        });
    }
    it("legacy single-item phrase 'Iteration — Next best recommendation:' is gone (no trailing 's')", () => {
        const legacyPhrase = /Iteration — Next best recommendation:(?!s)/;
        for (const mirror of MIRRORS) {
            const content = readFileSync(join(REPO_ROOT, mirror.path), "utf8");
            assert.ok(!legacyPhrase.test(content), `${mirror.path} still contains the legacy single-item phrase. Update to plural ranked-top-3 form.`);
        }
    });
});
