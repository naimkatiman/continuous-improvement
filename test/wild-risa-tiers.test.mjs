import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const WILD_RISA_MIRRORS = {
    source: "skills/wild-risa-balance.md",
    pluginMirror: "plugins/continuous-improvement/skills/wild-risa-balance/SKILL.md",
};
const PROCEED_MIRRORS = {
    source: "skills/proceed-with-the-recommendation.md",
    pluginMirror: "plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md",
};
const WILD_RISA_LITERALS = [
    {
        literal: "## Audience Tiers (beginner vs expert)",
        rationale: "section heading — without it the tier split is invisible to skill consumers",
    },
    {
        literal: "### Beginner tier (lite shape)",
        rationale: "beginner subsection — without it the lite shape rule is gone",
    },
    {
        literal: "### Expert tier",
        rationale: "expert subsection — without it the default-tier shape is gone",
    },
    {
        literal: "### Tier signal in the 3-section close",
        rationale: "tier-signal-in-close subsection — required for self-describing audit trail",
    },
    {
        literal: "3 minimum, 5 maximum",
        rationale: "beginner item-count rule — defends against silent reversion to floor-only",
    },
    {
        literal: "Opus 4.7",
        rationale: "model-version lock — forces a deliberate update when moving beyond Opus 4.7",
    },
    {
        literal: `### The "no" escape valve (both tiers)`,
        rationale: "no-escape subsection — without it the operator handoff signal is lost and tiers degrade to padding",
    },
    {
        literal: "Recommendation: no",
        rationale: "literal escape phrase — defends against silent rephrasing that would orphan the handoff convention",
    },
    {
        literal: "switch context",
        rationale: "operator action clause — defends the handoff semantic (fresh session / different agent / different framing)",
    },
];
const PROCEED_LITERALS = [
    {
        literal: "Beginner tier:**",
        rationale: "Phase 1 contract beginner-tier bullet — accepts 3..5 unlabeled blocks",
    },
    {
        literal: "3 ≤ n ≤ 5",
        rationale: "Phase 1 contract beginner-tier item-count clause — exact bounds matter",
    },
    {
        literal: "Tier signal in the heading",
        rationale: "Phase 7 close paragraph header — instructs renderer to add tier suffix",
    },
    {
        literal: "## Recommendation (expert)",
        rationale: "Phase 7 close — expert tier-suffixed heading example",
    },
    {
        literal: "## Recommendation (beginner)",
        rationale: "Phase 7 close — beginner tier-suffixed heading example",
    },
    {
        literal: `The "no" escape valve (both tiers)`,
        rationale: "Phase 7 close paragraph header — locks the operator handoff signal in the renderer contract",
    },
    {
        literal: "explicit handoff signal",
        rationale: "Phase 7 close clause naming the no-escape semantic — defends against silent rewording into 'optional skip'",
    },
];
function assertLiteralPresent(filePath, literal, rationale) {
    const content = readFileSync(join(REPO_ROOT, filePath), "utf8");
    assert.ok(content.includes(literal), `${filePath} is missing required tier literal:\n  ${JSON.stringify(literal)}\nWhy this literal is locked: ${rationale}.\nDropping it would silently downgrade the tier contract — the same failure mode the existing "2 WILD + 5 RISA = 7 items minimum" floor lint guards against.`);
}
describe("wild-risa-balance audience tier contract", () => {
    for (const filePath of [WILD_RISA_MIRRORS.source, WILD_RISA_MIRRORS.pluginMirror]) {
        describe(filePath, () => {
            for (const { literal, rationale } of WILD_RISA_LITERALS) {
                it(`contains literal ${JSON.stringify(literal)}`, () => {
                    assertLiteralPresent(filePath, literal, rationale);
                });
            }
        });
    }
});
describe("proceed-with-the-recommendation tier-aware contract", () => {
    for (const filePath of [PROCEED_MIRRORS.source, PROCEED_MIRRORS.pluginMirror]) {
        describe(filePath, () => {
            for (const { literal, rationale } of PROCEED_LITERALS) {
                it(`contains literal ${JSON.stringify(literal)}`, () => {
                    assertLiteralPresent(filePath, literal, rationale);
                });
            }
        });
    }
});
