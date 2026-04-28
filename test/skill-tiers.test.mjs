import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupSkillsByTier, normalizeTier, parseSkillFrontmatter, renderBundledSkillsReadme, } from "../lib/skill-tiers.mjs";
describe("parseSkillFrontmatter", () => {
    it("returns empty object when no frontmatter is present", () => {
        const out = parseSkillFrontmatter("# Just a heading\n\nNo frontmatter here.\n");
        assert.deepEqual(out, {});
    });
    it("reads plain top-level scalar fields", () => {
        const md = [
            "---",
            "name: gateguard",
            "tier: \"1\"",
            "description: Fact-forcing gate.",
            "---",
            "",
            "# body",
        ].join("\n");
        const out = parseSkillFrontmatter(md);
        assert.equal(out.name, "gateguard");
        assert.equal(out.tier, "1");
        assert.equal(out.description, "Fact-forcing gate.");
    });
    it("strips both single-quoted and double-quoted scalars", () => {
        const md = [
            "---",
            'name: "alpha"',
            "tier: 'featured'",
            "---",
        ].join("\n");
        const out = parseSkillFrontmatter(md);
        assert.equal(out.name, "alpha");
        assert.equal(out.tier, "featured");
    });
    it("collapses folded block scalars (description: >) into one line", () => {
        const md = [
            "---",
            "name: para-memory-files",
            "tier: \"1\"",
            "description: >",
            "  File-based memory system using PARA.",
            "  Three layers: knowledge graph, daily notes, and tacit knowledge.",
            "---",
        ].join("\n");
        const out = parseSkillFrontmatter(md);
        assert.equal(out.name, "para-memory-files");
        assert.equal(out.tier, "1");
        assert.equal(out.description, "File-based memory system using PARA. Three layers: knowledge graph, daily notes, and tacit knowledge.");
    });
    it("handles >- block scalars the same as >", () => {
        const md = [
            "---",
            "name: token-budget-advisor",
            "tier: \"2\"",
            "description: >-",
            "  Offers the user an informed choice about response depth.",
            "---",
        ].join("\n");
        const out = parseSkillFrontmatter(md);
        assert.equal(out.description, "Offers the user an informed choice about response depth.");
    });
    it("ignores nested keys and only captures top-level fields", () => {
        const md = [
            "---",
            "name: gateguard",
            "tier: \"1\"",
            "nested:",
            "  child: ignored",
            "description: kept",
            "---",
        ].join("\n");
        const out = parseSkillFrontmatter(md);
        assert.equal(out.name, "gateguard");
        assert.equal(out.description, "kept");
    });
});
describe("normalizeTier", () => {
    it("maps known canonical values", () => {
        assert.equal(normalizeTier("core"), "core");
        assert.equal(normalizeTier("featured"), "featured");
        assert.equal(normalizeTier("1"), "1");
        assert.equal(normalizeTier("2"), "2");
        assert.equal(normalizeTier("companion"), "companion");
    });
    it("accepts variants", () => {
        assert.equal(normalizeTier("Tier1"), "1");
        assert.equal(normalizeTier("tier-2"), "2");
        assert.equal(normalizeTier("FEATURED"), "featured");
    });
    it("falls back to 'unknown' for missing or unrecognized values", () => {
        assert.equal(normalizeTier(undefined), "unknown");
        assert.equal(normalizeTier(""), "unknown");
        assert.equal(normalizeTier("garbage"), "unknown");
    });
});
describe("groupSkillsByTier", () => {
    it("groups skills into the correct buckets and sorts each bucket", () => {
        const skills = [
            { name: "verification-loop", tier: "1" },
            { name: "gateguard", tier: "1" },
            { name: "ralph", tier: "companion" },
            { name: "proceed-with-the-recommendation", tier: "featured" },
            { name: "continuous-improvement", tier: "core" },
            { name: "mystery", tier: "unknown" },
        ];
        const groups = groupSkillsByTier(skills);
        assert.deepEqual(groups.core.map((s) => s.name), ["continuous-improvement"]);
        assert.deepEqual(groups.featured.map((s) => s.name), ["proceed-with-the-recommendation"]);
        assert.deepEqual(groups["1"].map((s) => s.name), ["gateguard", "verification-loop"]);
        assert.deepEqual(groups["2"], []);
        assert.deepEqual(groups.companion.map((s) => s.name), ["ralph"]);
        assert.deepEqual(groups.unknown.map((s) => s.name), ["mystery"]);
    });
});
describe("renderBundledSkillsReadme", () => {
    function render() {
        return renderBundledSkillsReadme([
            {
                name: "continuous-improvement",
                tier: "core",
                description: "The 7 Laws.",
            },
            {
                name: "proceed-with-the-recommendation",
                tier: "featured",
                description: "The execution arm.",
            },
            { name: "gateguard", tier: "1", description: "Fact gate." },
            { name: "verification-loop", tier: "1" },
            { name: "safety-guard", tier: "2", description: "Runtime guard." },
            { name: "ralph", tier: "companion", description: "Autonomous loop." },
        ]);
    }
    it("emits a 'do not edit' banner at the top", () => {
        const out = render();
        assert.match(out, /^# Bundled Skills \(generated\)/);
        assert.match(out, /Do not edit anything in this directory/);
    });
    it("places core skill in its own section, before featured", () => {
        const out = render();
        const corePos = out.indexOf("## Core skill");
        const featuredPos = out.indexOf("## Featured companion");
        assert.ok(corePos > 0, "should have ## Core skill heading");
        assert.ok(featuredPos > 0, "should have ## Featured companion heading");
        assert.ok(corePos < featuredPos, "core must precede featured");
    });
    it("marks the featured tier with a star, but not the core tier", () => {
        const out = render();
        assert.match(out, /- `proceed-with-the-recommendation` ⭐/, "featured skill must carry the star marker");
        assert.doesNotMatch(out, /- `continuous-improvement` ⭐/, "core skill must not carry the star (it's not a companion)");
    });
    it("renders tier 1 and tier 2 headings with descriptive labels", () => {
        const out = render();
        assert.match(out, /## Tier 1 — beginner-mode pairing/);
        assert.match(out, /## Tier 2 — expert-mode add-ons/);
    });
    it("appends descriptions when present and omits the dash when absent", () => {
        const out = render();
        // gateguard has a description
        assert.match(out, /- `gateguard` — Fact gate\./);
        // verification-loop has no description in this test
        assert.match(out, /^- `verification-loop`$/m);
    });
    it("skips empty tier sections so an absent tier produces no heading", () => {
        const out = renderBundledSkillsReadme([
            { name: "only-core", tier: "core" },
        ]);
        assert.match(out, /## Core skill/);
        assert.doesNotMatch(out, /## Featured companion/);
        assert.doesNotMatch(out, /## Tier 1/);
        assert.doesNotMatch(out, /## Tier 2/);
        assert.doesNotMatch(out, /## Always-bundled companions/);
        assert.doesNotMatch(out, /## Other skills/);
    });
    it("groups skills with unknown tier under '## Other skills' so missing tags surface", () => {
        const out = renderBundledSkillsReadme([
            { name: "unlabeled", tier: "unknown" },
        ]);
        assert.match(out, /## Other skills\n- `unlabeled`/);
    });
});
