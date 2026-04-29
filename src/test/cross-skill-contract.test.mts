import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// ----- Asserted contract literals (single source of truth) ----------------
//
// Half 1: proceed-with-the-recommendation must reference wild-risa-balance
// in its Phase 1 section, naming both the upstream skill and the block-shape
// contract phrasing.
const PROCEED_WILD_RISA_REF_LITERAL = "wild-risa-balance";
const PROCEED_PHASE1_BLOCK_SHAPE_LITERAL = "2 WILD + at least 5 RISA";
// The exact "composed under" phrase as written in the SKILL.md (with the
// embedded backticks around the skill name).
const PROCEED_COMPOSED_UNDER_LITERAL = "composed under `wild-risa-balance`";

// Half 2: wild-risa-balance must reference proceed-with-the-recommendation
// as its execution arm, plus the auto-trigger discipline literal.
const WILD_PROCEED_REF_LITERAL = "proceed-with-the-recommendation";
const WILD_EXECUTION_ARM_LITERAL = "execution arm";
const WILD_NEVER_AUTO_TRIGGER_LITERAL = "Never auto-trigger";

// ----- Mirror tables -------------------------------------------------------

const PROCEED_MIRRORS: ReadonlyArray<{ path: string; label: string }> = [
  {
    path: "skills/proceed-with-the-recommendation.md",
    label: "source skill",
  },
  {
    path: "plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md",
    label: "plugin mirror",
  },
];

const WILD_MIRRORS: ReadonlyArray<{ path: string; label: string }> = [
  {
    path: "skills/wild-risa-balance.md",
    label: "source skill",
  },
  {
    path: "plugins/continuous-improvement/skills/wild-risa-balance/SKILL.md",
    label: "plugin mirror",
  },
];

// ----- Heading regexes (m flag — heading casing is stable) ----------------

const PHASE_1_HEADING_RE = /^##\s+Phase\s+1:/m;
const NEXT_H2_RE = /^##\s+/m;

// ----- Section extraction --------------------------------------------------

function extractPhase1(content: string, mirrorPath: string): string {
  const startMatch = content.match(PHASE_1_HEADING_RE);
  assert.ok(
    startMatch && typeof startMatch.index === "number",
    `${mirrorPath}: missing "## Phase 1:" heading — Phase 1 section is gone or renamed.`,
  );
  const start = startMatch!.index!;
  const headingLineEnd = content.indexOf("\n", start);
  const tailFromBody = content.slice(headingLineEnd + 1);
  const endRel = tailFromBody.search(NEXT_H2_RE);
  const body = endRel === -1 ? tailFromBody : tailFromBody.slice(0, endRel);
  assert.ok(
    body.trim().length > 0,
    `${mirrorPath}: "## Phase 1:" section is empty.`,
  );
  return body;
}

function assertContains(
  haystack: string,
  needle: string,
  mirrorPath: string,
  half: string,
  clauseLabel: string,
): void {
  assert.ok(
    haystack.includes(needle),
    `${mirrorPath} :: ${half} :: ${clauseLabel} :: missing required literal: ${needle}`,
  );
}

// ----- Half 1 — proceed-with-the-recommendation references wild-risa-balance

describe("cross-skill contract — proceed-with-the-recommendation references wild-risa-balance", () => {
  for (const mirror of PROCEED_MIRRORS) {
    describe(`${mirror.label} (${mirror.path})`, () => {
      const content = readFileSync(join(REPO_ROOT, mirror.path), "utf8");
      const phase1 = extractPhase1(content, mirror.path);

      it("Phase 1 names wild-risa-balance as the upstream skill", () => {
        assertContains(
          phase1,
          PROCEED_WILD_RISA_REF_LITERAL,
          mirror.path,
          "Half 1",
          "Phase 1 cross-reference to wild-risa-balance",
        );
      });

      it("Phase 1 contains the block-shape contract literal '2 WILD + at least 5 RISA'", () => {
        assertContains(
          phase1,
          PROCEED_PHASE1_BLOCK_SHAPE_LITERAL,
          mirror.path,
          "Half 1",
          "Phase 1 block-shape contract literal",
        );
      });

      it("file declares the list was 'composed under `wild-risa-balance`'", () => {
        assertContains(
          content,
          PROCEED_COMPOSED_UNDER_LITERAL,
          mirror.path,
          "Half 1",
          "composed-under upstream-skill phrase",
        );
      });
    });
  }
});

// ----- Half 2 — wild-risa-balance references proceed-with-the-recommendation

describe("cross-skill contract — wild-risa-balance references proceed-with-the-recommendation", () => {
  for (const mirror of WILD_MIRRORS) {
    describe(`${mirror.label} (${mirror.path})`, () => {
      const content = readFileSync(join(REPO_ROOT, mirror.path), "utf8");

      it("file names proceed-with-the-recommendation as a related skill", () => {
        assertContains(
          content,
          WILD_PROCEED_REF_LITERAL,
          mirror.path,
          "Half 2",
          "cross-reference to proceed-with-the-recommendation",
        );
      });

      it("file describes proceed-with-the-recommendation as the 'execution arm'", () => {
        assertContains(
          content,
          WILD_EXECUTION_ARM_LITERAL,
          mirror.path,
          "Half 2",
          "execution-arm role description",
        );
      });

      it("file anchors the auto-trigger discipline with literal 'Never auto-trigger'", () => {
        assertContains(
          content,
          WILD_NEVER_AUTO_TRIGGER_LITERAL,
          mirror.path,
          "Half 2",
          "auto-trigger discipline literal",
        );
      });
    });
  }
});
