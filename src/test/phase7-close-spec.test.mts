import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const MIRRORS: ReadonlyArray<{ path: string; label: string }> = [
  {
    path: "skills/proceed-with-the-recommendation.md",
    label: "source skill",
  },
  {
    path: "plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md",
    label: "plugin mirror",
  },
];

// Asserted contract literals — every magic string used in `.includes(...)` is
// hoisted here so a single source of truth governs what the skill must say.
const HEADING_DONE_LITERAL = "### 1. What has been done";
const HEADING_NEXT_LITERAL = "### 2. What is next";
const HEADING_RECOMMENDATION_LITERAL = "### 3. Recommendation";

const TIER_1_LITERAL = "Tier 1 — strong fit";
const TIER_2_LITERAL = "Tier 2 — high-fit complements";
const SKIP_TIER_LITERAL = "Skip these — already covered";
const TIER_1_CITATION_LITERAL = "concrete file/line/rule citation";

const WANT_ME_TO_LITERAL = "Want me to:";
const EXACTLY_TWO_OPTIONS_LITERAL = "exactly two options";

const TINY_LIST_EXEMPTION_LITERAL = "Tiny-list exemption:";
const TINY_LIST_THRESHOLD_LITERAL = "≤1 item";

const PHASE_7_HEADING_RE = /^##\s+Phase\s+7:\s+End-of-Run Summary[^\n]*$/m;
const NEXT_H2_RE = /^##\s+/m;

function extractPhase7(content: string, mirrorPath: string): string {
  const startMatch = content.match(PHASE_7_HEADING_RE);
  assert.ok(
    startMatch && typeof startMatch.index === "number",
    `${mirrorPath}: missing "## Phase 7: End-of-Run Summary" heading — Phase 7 section is gone or renamed.`,
  );
  const start = startMatch!.index!;
  const headingLineEnd = content.indexOf("\n", start);
  const tailFromBody = content.slice(headingLineEnd + 1);
  const endRel = tailFromBody.search(NEXT_H2_RE);
  const body = endRel === -1 ? tailFromBody : tailFromBody.slice(0, endRel);
  assert.ok(
    body.trim().length > 0,
    `${mirrorPath}: "## Phase 7" section is empty.`,
  );
  return body;
}

function assertContains(
  haystack: string,
  needle: string,
  mirrorPath: string,
  clauseLabel: string,
): void {
  assert.ok(
    haystack.includes(needle),
    `${mirrorPath} :: Phase 7 :: ${clauseLabel} :: missing required literal: ${needle}`,
  );
}

describe("proceed-with-the-recommendation Phase 7 close behavioral spec", () => {
  for (const mirror of MIRRORS) {
    describe(`${mirror.label} (${mirror.path})`, () => {
      const content = readFileSync(join(REPO_ROOT, mirror.path), "utf8");
      const phase7 = extractPhase7(content, mirror.path);

      describe("3-section close shape", () => {
        it(`contains literal "${HEADING_DONE_LITERAL}"`, () => {
          assertContains(
            phase7,
            HEADING_DONE_LITERAL,
            mirror.path,
            "3-section close — section 1 heading",
          );
        });

        it(`contains literal "${HEADING_NEXT_LITERAL}"`, () => {
          assertContains(
            phase7,
            HEADING_NEXT_LITERAL,
            mirror.path,
            "3-section close — section 2 heading",
          );
        });

        it(`contains literal "${HEADING_RECOMMENDATION_LITERAL}"`, () => {
          assertContains(
            phase7,
            HEADING_RECOMMENDATION_LITERAL,
            mirror.path,
            "3-section close — section 3 heading",
          );
        });

        it("the three section headings appear in strict order 1 → 2 → 3", () => {
          const idxDone = phase7.indexOf(HEADING_DONE_LITERAL);
          const idxNext = phase7.indexOf(HEADING_NEXT_LITERAL);
          const idxRec = phase7.indexOf(HEADING_RECOMMENDATION_LITERAL);
          assert.ok(
            idxDone >= 0 && idxNext >= 0 && idxRec >= 0,
            `${mirror.path} :: Phase 7 :: 3-section close :: one or more section headings missing — cannot verify ordering. Indexes: done=${idxDone}, next=${idxNext}, rec=${idxRec}.`,
          );
          assert.ok(
            idxDone < idxNext && idxNext < idxRec,
            `${mirror.path} :: Phase 7 :: 3-section close :: section headings out of order — expected 1 → 2 → 3, got indexes done=${idxDone}, next=${idxNext}, rec=${idxRec}.`,
          );
        });
      });

      describe("Tiered Recommendation block", () => {
        it(`contains literal "${TIER_1_LITERAL}"`, () => {
          assertContains(
            phase7,
            TIER_1_LITERAL,
            mirror.path,
            "Tiered Recommendation — Tier 1 row label",
          );
        });

        it(`contains literal "${TIER_2_LITERAL}"`, () => {
          assertContains(
            phase7,
            TIER_2_LITERAL,
            mirror.path,
            "Tiered Recommendation — Tier 2 row label",
          );
        });

        it(`contains literal "${SKIP_TIER_LITERAL}"`, () => {
          assertContains(
            phase7,
            SKIP_TIER_LITERAL,
            mirror.path,
            "Tiered Recommendation — Skip row label",
          );
        });

        it(`Tier 1 evidence rule mentions literal "${TIER_1_CITATION_LITERAL}"`, () => {
          assertContains(
            phase7,
            TIER_1_CITATION_LITERAL,
            mirror.path,
            "Tiered Recommendation — Tier 1 concrete-citation requirement",
          );
        });
      });

      describe("Want me to: block", () => {
        it(`contains literal "${WANT_ME_TO_LITERAL}"`, () => {
          assertContains(
            phase7,
            WANT_ME_TO_LITERAL,
            mirror.path,
            "Want me to: block — prompt prefix",
          );
        });

        it(`contains literal "${EXACTLY_TWO_OPTIONS_LITERAL}"`, () => {
          assertContains(
            phase7,
            EXACTLY_TWO_OPTIONS_LITERAL,
            mirror.path,
            "Want me to: block — exactly-two-options rule",
          );
        });
      });

      describe("Tiny-list exemption", () => {
        it(`contains literal "${TINY_LIST_EXEMPTION_LITERAL}"`, () => {
          assertContains(
            phase7,
            TINY_LIST_EXEMPTION_LITERAL,
            mirror.path,
            "Tiny-list exemption — clause prefix",
          );
        });

        it(`contains literal "${TINY_LIST_THRESHOLD_LITERAL}"`, () => {
          assertContains(
            phase7,
            TINY_LIST_THRESHOLD_LITERAL,
            mirror.path,
            "Tiny-list exemption — ≤1 item threshold",
          );
        });
      });
    });
  }
});
