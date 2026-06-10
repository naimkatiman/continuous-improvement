import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MANAGED_BEGIN,
  MANAGED_END,
  TARGET_IDS,
  mergeManagedBlock,
  planTargetWrites,
  resolveTargets,
  stripFrontmatter,
} from "../lib/install-targets.mjs";

const SAMPLE_SKILL = [
  "---",
  "name: continuous-improvement",
  "tier: core",
  'description: "Install structured self-improvement loops."',
  "---",
  "",
  "# continuous-improvement",
  "",
  "## Law 1: Research Before Executing",
  "",
  "Before writing code or taking action, research first.",
  "",
].join("\n");

function readNothing(): string | null {
  return null;
}

describe("TARGET_IDS registry", () => {
  it("lists claude first and covers all v1 platforms", () => {
    assert.equal(TARGET_IDS[0], "claude");
    for (const id of ["gemini", "codex", "cursor", "windsurf", "zed", "aider", "copilot"]) {
      assert.ok(TARGET_IDS.includes(id), `missing target id: ${id}`);
    }
  });
});

describe("resolveTargets", () => {
  it("splits a comma list, trims, lowercases, and dedupes preserving order", () => {
    const result = resolveTargets(" Gemini , codex,gemini ");
    assert.deepEqual(result.targets, ["gemini", "codex"]);
    assert.deepEqual(result.unknown, []);
  });

  it("reports unknown names without dropping valid ones", () => {
    const result = resolveTargets("gemini,nope,zed");
    assert.deepEqual(result.targets, ["gemini", "zed"]);
    assert.deepEqual(result.unknown, ["nope"]);
  });

  it("returns empty lists for an empty or whitespace-only value", () => {
    assert.deepEqual(resolveTargets(""), { targets: [], unknown: [] });
    assert.deepEqual(resolveTargets(" , "), { targets: [], unknown: [] });
  });
});

describe("stripFrontmatter", () => {
  it("drops the leading frontmatter block and leading blank lines", () => {
    const body = stripFrontmatter(SAMPLE_SKILL);
    assert.ok(body.startsWith("# continuous-improvement"));
    assert.ok(!body.includes("tier: core"));
  });

  it("returns content unchanged when there is no frontmatter", () => {
    const plain = "# heading\n\nbody\n";
    assert.equal(stripFrontmatter(plain), plain);
  });

  it("does not treat a later horizontal rule as frontmatter", () => {
    const plain = "# heading\n\n---\n\nbody\n";
    assert.equal(stripFrontmatter(plain), plain);
  });
});

describe("mergeManagedBlock", () => {
  const block = `${MANAGED_BEGIN}\nseven laws body\n${MANAGED_END}`;

  it("creates the file content when nothing exists", () => {
    const merged = mergeManagedBlock(null, block);
    assert.ok(merged.startsWith(MANAGED_BEGIN));
    assert.ok(merged.endsWith("\n"));
  });

  it("appends after existing user content without clobbering it", () => {
    const merged = mergeManagedBlock("# My own rules\n\nKeep these.\n", block);
    assert.ok(merged.startsWith("# My own rules"));
    assert.ok(merged.includes("Keep these."));
    assert.ok(merged.includes("seven laws body"));
  });

  it("replaces only the managed region on reinstall", () => {
    const existing = `before\n\n${MANAGED_BEGIN}\nold body\n${MANAGED_END}\n\nafter\n`;
    const updated = mergeManagedBlock(existing, block);
    assert.ok(updated.includes("before"));
    assert.ok(updated.includes("after"));
    assert.ok(updated.includes("seven laws body"));
    assert.ok(!updated.includes("old body"));
  });

  it("is idempotent — a second merge with the same block is a no-op", () => {
    const once = mergeManagedBlock("# Mine\n", block);
    const twice = mergeManagedBlock(once, block);
    assert.equal(twice, once);
  });
});

describe("planTargetWrites", () => {
  it("throws for the claude target — that path is the existing installer flow", () => {
    assert.throws(() => planTargetWrites("claude", SAMPLE_SKILL, readNothing));
  });

  it("throws for an unknown target", () => {
    assert.throws(() => planTargetWrites("emacs", SAMPLE_SKILL, readNothing));
  });

  it("gemini writes a managed block into GEMINI.md without skill frontmatter", () => {
    const plan = planTargetWrites("gemini", SAMPLE_SKILL, readNothing);
    assert.equal(plan.writes.length, 1);
    assert.equal(plan.writes[0].relPath, "GEMINI.md");
    assert.ok(plan.writes[0].content.includes(MANAGED_BEGIN));
    assert.ok(plan.writes[0].content.includes("Law 1"));
    assert.ok(!plan.writes[0].content.includes("tier: core"));
  });

  it("codex writes the agents.md standard file", () => {
    const plan = planTargetWrites("codex", SAMPLE_SKILL, readNothing);
    assert.deepEqual(
      plan.writes.map((w) => w.relPath),
      ["AGENTS.md"],
    );
  });

  it("gemini preserves existing user content via the managed block", () => {
    const plan = planTargetWrites("gemini", SAMPLE_SKILL, (relPath) =>
      relPath === "GEMINI.md" ? "# Project context\n" : null,
    );
    assert.ok(plan.writes[0].content.startsWith("# Project context"));
    assert.ok(plan.writes[0].content.includes(MANAGED_BEGIN));
  });

  it("cursor writes a whole .mdc rule file with alwaysApply frontmatter", () => {
    const plan = planTargetWrites("cursor", SAMPLE_SKILL, readNothing);
    assert.equal(plan.writes[0].relPath, ".cursor/rules/continuous-improvement.mdc");
    assert.ok(plan.writes[0].content.startsWith("---\n"));
    assert.ok(plan.writes[0].content.includes("alwaysApply: true"));
    assert.ok(!plan.writes[0].content.includes(MANAGED_BEGIN));
  });

  it("windsurf writes its own rule file with the plain body", () => {
    const plan = planTargetWrites("windsurf", SAMPLE_SKILL, readNothing);
    assert.equal(plan.writes[0].relPath, ".windsurf/rules/continuous-improvement.md");
    assert.ok(plan.writes[0].content.startsWith("# continuous-improvement"));
  });

  it("zed and copilot use managed blocks in shared files", () => {
    assert.equal(planTargetWrites("zed", SAMPLE_SKILL, readNothing).writes[0].relPath, ".rules");
    assert.equal(
      planTargetWrites("copilot", SAMPLE_SKILL, readNothing).writes[0].relPath,
      ".github/copilot-instructions.md",
    );
  });

  it("aider writes CONVENTIONS.md and creates a minimal conf when none exists", () => {
    const plan = planTargetWrites("aider", SAMPLE_SKILL, readNothing);
    assert.deepEqual(
      plan.writes.map((w) => w.relPath),
      ["CONVENTIONS.md", ".aider.conf.yml"],
    );
    const conf = plan.writes[1].content;
    assert.ok(conf.includes("read:"));
    assert.ok(conf.includes("CONVENTIONS.md"));
  });

  it("aider leaves an existing conf untouched and explains the manual step", () => {
    const plan = planTargetWrites("aider", SAMPLE_SKILL, (relPath) =>
      relPath === ".aider.conf.yml" ? "model: gpt-5\n" : null,
    );
    assert.deepEqual(
      plan.writes.map((w) => w.relPath),
      ["CONVENTIONS.md"],
    );
    assert.ok(plan.notes.some((note) => note.includes(".aider.conf.yml")));
  });

  it("every non-claude plan notes that hooks/MCP/instincts stay Claude Code-only", () => {
    for (const id of ["gemini", "codex", "cursor", "windsurf", "zed", "aider", "copilot"]) {
      const plan = planTargetWrites(id, SAMPLE_SKILL, readNothing);
      assert.ok(
        plan.notes.some((note) => note.includes("Claude Code")),
        `missing Claude Code-only note for ${id}`,
      );
    }
  });
});
