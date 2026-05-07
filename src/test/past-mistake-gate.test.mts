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
const THREE_SURFACES_DECLARATION = "Scan three surfaces";
const FEEDBACK_GLOB_PATTERN = "memory/feedback_*.md";
const FEEDBACK_EXAMPLE_ANCHOR = "feedback_past_mistake_gate.md";

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

const REQUIRED_LITERALS: ReadonlyArray<{ literal: string; reason: string }> = [
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
  {
    literal: THREE_SURFACES_DECLARATION,
    reason: "Rule 1 surface count — must read 'three surfaces', not 'two'. Reverting to two silently drops the auto-memory feedback_*.md surface (PR #83).",
  },
  {
    literal: FEEDBACK_GLOB_PATTERN,
    reason: "Auto-memory feedback file pattern — Rule 1 must reference memory/feedback_*.md as a scanned surface. The operator's named corrections live there; without this glob the gate cannot quote them.",
  },
  {
    literal: FEEDBACK_EXAMPLE_ANCHOR,
    reason: "Concrete example anchor — Rule 1 names feedback_past_mistake_gate.md as a real instance so the rule cannot be rationalized into ignoring the surface. Generic rewording loses this anchor.",
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
          assert.ok(
            content.includes(required.literal),
            `${mirror.path} is missing the P-MAG literal:\n  ${required.literal}\n${required.reason}`
          );
        });
      }
    });
  }
});
