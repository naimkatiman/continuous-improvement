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

const PHASE_0_HEADING_RE = /^##\s+Phase\s+0:\s+Acknowledge.*P-MAG.*$/im;
const PHASE_1_HEADING_RE = /^##\s+Phase\s+1:/im;
const RULE_HEADING_RE = /^###\s+Rule\s+([123])\b[^\n]*$/gim;

type RuleSection = { rule: 1 | 2 | 3; heading: string; body: string };

function extractPhase0(content: string, mirrorPath: string): string {
  const startMatch = content.match(PHASE_0_HEADING_RE);
  assert.ok(
    startMatch && typeof startMatch.index === "number",
    `${mirrorPath}: missing "## Phase 0: Acknowledge ... P-MAG" heading — Phase 0 section is gone.`
  );
  const start = startMatch!.index!;
  const tail = content.slice(start);
  const endRel = tail.search(PHASE_1_HEADING_RE);
  assert.ok(
    endRel > 0,
    `${mirrorPath}: missing "## Phase 1:" heading after Phase 0 — cannot bound the Phase 0 section.`
  );
  return tail.slice(0, endRel);
}

function extractRules(phase0: string, mirrorPath: string): Map<1 | 2 | 3, RuleSection> {
  const rules = new Map<1 | 2 | 3, RuleSection>();
  const matches: Array<{ rule: 1 | 2 | 3; heading: string; index: number }> = [];
  RULE_HEADING_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RULE_HEADING_RE.exec(phase0)) !== null) {
    const ruleNum = Number(m[1]) as 1 | 2 | 3;
    matches.push({ rule: ruleNum, heading: m[0], index: m.index });
  }
  RULE_HEADING_RE.lastIndex = 0;

  assert.ok(
    matches.length >= 3,
    `${mirrorPath}: expected at least 3 "### Rule N" subsections inside Phase 0, found ${matches.length}.`
  );

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const next = matches[i + 1];
    const body = phase0.slice(cur.index, next ? next.index : phase0.length);
    rules.set(cur.rule, { rule: cur.rule, heading: cur.heading, body });
  }

  for (const n of [1, 2, 3] as const) {
    assert.ok(
      rules.has(n),
      `${mirrorPath}: Phase 0 is missing "### Rule ${n}" subsection.`
    );
  }
  return rules;
}

function assertContains(
  haystack: string,
  needle: string,
  mirrorPath: string,
  ruleLabel: string,
  clauseLabel: string
): void {
  assert.ok(
    haystack.includes(needle),
    `${mirrorPath} :: ${ruleLabel} :: missing required clause [${clauseLabel}] — expected literal:\n  ${needle}`
  );
}

function assertMatches(
  haystack: string,
  pattern: RegExp,
  mirrorPath: string,
  ruleLabel: string,
  clauseLabel: string
): void {
  assert.ok(
    pattern.test(haystack),
    `${mirrorPath} :: ${ruleLabel} :: missing required clause [${clauseLabel}] — expected pattern:\n  ${pattern}`
  );
}

describe("proceed-with-the-recommendation P-MAG Phase 0 behavioral spec", () => {
  for (const mirror of MIRRORS) {
    describe(`${mirror.label} (${mirror.path})`, () => {
      const content = readFileSync(join(REPO_ROOT, mirror.path), "utf8");
      const phase0 = extractPhase0(content, mirror.path);
      const rules = extractRules(phase0, mirror.path);

      describe("Rule 1 — acknowledge before context", () => {
        const rule1 = rules.get(1)!.body;

        it("references observations.jsonl literally", () => {
          assertContains(
            rule1,
            "observations.jsonl",
            mirror.path,
            "Rule 1",
            "observations.jsonl reference"
          );
        });

        it("defines the quote-line format with literal 'Past mistake observed:'", () => {
          assertContains(
            rule1,
            "Past mistake observed:",
            mirror.path,
            "Rule 1",
            "quote-line format prefix 'Past mistake observed:'"
          );
        });

        it("defines the empty-surfaces fallback line", () => {
          assertContains(
            rule1,
            "No prior mistakes recorded — proceed.",
            mirror.path,
            "Rule 1",
            "empty-surfaces fallback line"
          );
        });
      });

      describe("Rule 2 — clearance gate", () => {
        const rule2 = rules.get(2)!.body;

        it("contains the literal halt prefix 'BLOCKED on prior mistake:'", () => {
          assertContains(
            rule2,
            "BLOCKED on prior mistake:",
            mirror.path,
            "Rule 2",
            "halt prefix 'BLOCKED on prior mistake:'"
          );
        });

        it("enumerates residue-still-present trigger", () => {
          assertContains(
            rule2,
            "residue",
            mirror.path,
            "Rule 2",
            "residue trigger keyword"
          );
          assertMatches(
            rule2,
            /unrotated|stale|unreverted/i,
            mirror.path,
            "Rule 2",
            "residue concrete examples (unrotated|stale|unreverted)"
          );
        });

        it("enumerates unrun-verification trigger", () => {
          assertContains(
            rule2,
            "verification step",
            mirror.path,
            "Rule 2",
            "verification-step trigger keyword"
          );
          assertMatches(
            rule2,
            /never run|was never run/i,
            mirror.path,
            "Rule 2",
            "verification-step never-run phrasing"
          );
        });

        it("enumerates unresolved needs-approval trigger", () => {
          assertContains(
            rule2,
            "needs-approval",
            mirror.path,
            "Rule 2",
            "unresolved 'needs-approval' trigger keyword"
          );
        });
      });

      describe("Rule 3 — negative prompt", () => {
        const rule3 = rules.get(3)!.body;

        it("contains the literal 'Will NOT repeat:'", () => {
          assertContains(
            rule3,
            "Will NOT repeat:",
            mirror.path,
            "Rule 3",
            "negative-prompt prefix 'Will NOT repeat:'"
          );
        });

        it("requires a specific prior session citation", () => {
          assertContains(
            rule3,
            "cite a specific prior session",
            mirror.path,
            "Rule 3",
            "specific-prior-session citation requirement"
          );
        });

        it("explicitly disqualifies generic anti-patterns near a generic example", () => {
          assertContains(
            rule3,
            "do not qualify",
            mirror.path,
            "Rule 3",
            "generic anti-pattern disqualifier 'do not qualify'"
          );
          assertMatches(
            rule3,
            /\([^)]*will not[^)]*\)[^\n]{0,80}do not qualify/i,
            mirror.path,
            "Rule 3",
            "generic example shown in parens immediately before 'do not qualify'"
          );
        });
      });
    });
  }
});
