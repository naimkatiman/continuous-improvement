import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const MIRRORS = [
    {
        path: "skills/wild-risa-balance.md",
        label: "source skill",
    },
    {
        path: "plugins/continuous-improvement/skills/wild-risa-balance/SKILL.md",
        label: "plugin mirror",
    },
];
// Asserted contract literals — every magic string used in `.includes(...)` is
// hoisted here so a single source of truth governs what the skill must say.
const WILD_EXACT_COUNT_LITERAL = "exactly 2";
const RISA_FLOOR_LITERAL = "at least 5";
const RANK_LITERAL = "rank descending by impact";
const NEVER_AUTO_TRIGGER_LITERAL = "Never auto-trigger";
const EXAMPLE_TOTAL_LITERAL = "Total: 7 items (2 WILD + 5 RISA)";
const WILD_EXAMPLE_COUNT = 2;
const RISA_EXAMPLE_COUNT = 5;
const HOW_TO_APPLY_HEADING_RE = /^##\s+How to Apply in a Recommendation List\s*$/im;
const NEXT_H2_RE = /^##\s+/m;
const EXAMPLE_HEADING_RE = /^##\s+Example\s*$/im;
const NUMBERED_TOP_LEVEL_RE = /^(\d+)\.\s+/gm;
const WILD_PILOTS_BLOCK_HEADER_RE = /^[^\n]*WILD pilots[^\n]*$/im;
const RISA_BASELINE_BLOCK_HEADER_RE = /^[^\n]*RISA baseline[^\n]*$/im;
const NUMBERED_LINE_RE = /^(\d+)\.\s+/gm;
function extractSection(content, startRe, mirrorPath, sectionLabel) {
    const startMatch = content.match(startRe);
    assert.ok(startMatch && typeof startMatch.index === "number", `${mirrorPath}: missing "${sectionLabel}" heading — section is gone or renamed.`);
    const start = startMatch.index;
    const headingLineEnd = content.indexOf("\n", start);
    const tailFromBody = content.slice(headingLineEnd + 1);
    const endRel = tailFromBody.search(NEXT_H2_RE);
    const body = endRel === -1 ? tailFromBody : tailFromBody.slice(0, endRel);
    assert.ok(body.trim().length > 0, `${mirrorPath}: "${sectionLabel}" section is empty.`);
    return body;
}
function countTopLevelNumbered(section) {
    NUMBERED_TOP_LEVEL_RE.lastIndex = 0;
    let count = 0;
    while (NUMBERED_TOP_LEVEL_RE.exec(section) !== null) {
        count++;
    }
    NUMBERED_TOP_LEVEL_RE.lastIndex = 0;
    return count;
}
function extractBlockAfterHeader(exampleSection, headerRe, mirrorPath, blockLabel) {
    const headerMatch = exampleSection.match(headerRe);
    assert.ok(headerMatch && typeof headerMatch.index === "number", `${mirrorPath}: Example block is missing the "${blockLabel}" header line.`);
    const start = headerMatch.index;
    const headerLineEnd = exampleSection.indexOf("\n", start);
    const after = exampleSection.slice(headerLineEnd + 1);
    // The block runs until the next blank line OR the next non-numbered, non-empty line.
    const lines = after.split("\n");
    const collected = [];
    for (const line of lines) {
        if (line.trim() === "") {
            if (collected.length > 0)
                break;
            continue;
        }
        if (/^\d+\.\s+/.test(line)) {
            collected.push(line);
            continue;
        }
        // First non-numbered non-blank line ends the block.
        break;
    }
    return collected.join("\n");
}
function countNumberedLines(block) {
    NUMBERED_LINE_RE.lastIndex = 0;
    let count = 0;
    while (NUMBERED_LINE_RE.exec(block) !== null) {
        count++;
    }
    NUMBERED_LINE_RE.lastIndex = 0;
    return count;
}
function assertContains(haystack, needle, mirrorPath, sectionLabel, clauseLabel) {
    assert.ok(haystack.includes(needle), `${mirrorPath} :: ${sectionLabel} :: missing required clause [${clauseLabel}] — expected literal:\n  ${needle}`);
}
describe("wild-risa-balance How to Apply behavioral spec", () => {
    for (const mirror of MIRRORS) {
        describe(`${mirror.label} (${mirror.path})`, () => {
            const content = readFileSync(join(REPO_ROOT, mirror.path), "utf8");
            const howToApply = extractSection(content, HOW_TO_APPLY_HEADING_RE, mirror.path, "## How to Apply in a Recommendation List");
            describe("section structure — 4 numbered top-level sub-rules", () => {
                it(`contains exactly 4 top-level numbered items (1.–4.)`, () => {
                    const count = countTopLevelNumbered(howToApply);
                    assert.equal(count, 4, `${mirror.path}: How to Apply section must contain 4 numbered top-level sub-rules; found ${count}. Each rule encodes a normative behavior — losing one silently degrades the contract.`);
                });
                it(`Rule 1 (WILD pilots line) contains literal "${WILD_EXACT_COUNT_LITERAL}"`, () => {
                    // Rule 1 is the line beginning with "1." that mentions WILD.
                    const rule1Line = howToApply
                        .split("\n")
                        .find((l) => /^1\.\s+/.test(l) && /WILD/i.test(l));
                    assert.ok(rule1Line, `${mirror.path}: could not locate "1." rule line referencing WILD — Rule 1 may have been renumbered or rephrased.`);
                    assertContains(rule1Line, WILD_EXACT_COUNT_LITERAL, mirror.path, "Rule 1 (WILD pilots)", `WILD count literal "${WILD_EXACT_COUNT_LITERAL}"`);
                });
                it(`Rule 2 (RISA baseline line) contains literal "${RISA_FLOOR_LITERAL}"`, () => {
                    const rule2Line = howToApply
                        .split("\n")
                        .find((l) => /^2\.\s+/.test(l) && /RISA/i.test(l));
                    assert.ok(rule2Line, `${mirror.path}: could not locate "2." rule line referencing RISA — Rule 2 may have been renumbered or rephrased.`);
                    assertContains(rule2Line, RISA_FLOOR_LITERAL, mirror.path, "Rule 2 (RISA baseline)", `RISA floor literal "${RISA_FLOOR_LITERAL}"`);
                });
                it(`section contains literal "${RANK_LITERAL}"`, () => {
                    assertContains(howToApply, RANK_LITERAL, mirror.path, "How to Apply", `ranking clause "${RANK_LITERAL}"`);
                });
                it(`section contains never-auto-trigger clause literal "${NEVER_AUTO_TRIGGER_LITERAL}"`, () => {
                    assertContains(howToApply, NEVER_AUTO_TRIGGER_LITERAL, mirror.path, "How to Apply", `never-auto-trigger clause "${NEVER_AUTO_TRIGGER_LITERAL}"`);
                });
            });
            describe("Example block — counts and closing line", () => {
                const exampleSection = extractSection(content, EXAMPLE_HEADING_RE, mirror.path, "## Example");
                it(`WILD pilots example block contains exactly ${WILD_EXAMPLE_COUNT} numbered items`, () => {
                    const wildBlock = extractBlockAfterHeader(exampleSection, WILD_PILOTS_BLOCK_HEADER_RE, mirror.path, "WILD pilots");
                    const found = countNumberedLines(wildBlock);
                    assert.equal(found, WILD_EXAMPLE_COUNT, `${mirror.path}: Example block "WILD pilots" must show exactly ${WILD_EXAMPLE_COUNT} numbered items, found ${found}. The example must mirror the rule "exactly 2".`);
                });
                it(`RISA baseline example block contains exactly ${RISA_EXAMPLE_COUNT} numbered items`, () => {
                    const risaBlock = extractBlockAfterHeader(exampleSection, RISA_BASELINE_BLOCK_HEADER_RE, mirror.path, "RISA baseline");
                    const found = countNumberedLines(risaBlock);
                    assert.equal(found, RISA_EXAMPLE_COUNT, `${mirror.path}: Example block "RISA baseline" must show exactly ${RISA_EXAMPLE_COUNT} numbered items, found ${found}. The example must mirror the rule "at least 5" floor.`);
                });
                it(`Example section contains closing total literal "${EXAMPLE_TOTAL_LITERAL}"`, () => {
                    assertContains(exampleSection, EXAMPLE_TOTAL_LITERAL, mirror.path, "Example", `closing total "${EXAMPLE_TOTAL_LITERAL}"`);
                });
            });
        });
    }
});
