import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkProseSurfaces,
  deriveCounts,
  ordinal,
  type SkillCounts,
} from "../bin/check-skill-count-prose.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CHECKER = join(REPO_ROOT, "bin", "check-skill-count-prose.mjs");

// A repo whose skills/ frontmatter drives the derived counts.
function setupSkillRepo(tiers: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "skill-count-prose-"));
  writeFileSync(
    join(root, "SKILL.md"),
    `---\nname: continuous-improvement\ntier: core\n---\n# core\n`,
  );
  mkdirSync(join(root, "skills"), { recursive: true });
  for (const [name, tier] of Object.entries(tiers)) {
    writeFileSync(
      join(root, "skills", `${name}.md`),
      `---\nname: ${name}\ntier: "${tier}"\n---\n# ${name}\n`,
    );
  }
  return root;
}

// A repo holding only the prose surface files (counts passed in explicitly).
function setupDocsRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "skill-count-prose-docs-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

const COUNTS: SkillCounts = {
  core: 1,
  featured: 1,
  tier1: 6,
  tier2: 15,
  companion: 3,
  unknown: 0,
  total: 26,
  next: 27,
};

// All-correct prose for COUNTS. Each value is the minimum string its surface
// must contain to pass.
function goodDocs(): Record<string, string> {
  return {
    "README.md":
      "The plugin ships 26 skills — 1 core + 1 featured + 6 tier-1 + 15 tier-2 + 3 always-bundled. Adding a 27th skill.",
    "docs/skills.md":
      "# the full 26-skill catalog\n1 core + 1 featured + 6 tier-1 + 15 tier-2 + 3 always-bundled = 26 skills. how to add a 27th skill.",
    "docs/skill-use-cases.md":
      "ships 26 skills (1 core + 1 featured + 6 tier-1 + 15 tier-2 + 3 always-bundled companions).",
    "CONTRIBUTING.md": 'The "26 skills" count appears in both.',
    "docs/using-this-plugin.md": "the full 26-skill catalog with per-skill descriptions.",
  };
}

describe("check-skill-count-prose — deriveCounts", () => {
  it("derives 28 total / 17 tier-2 / next 29 from the live repo", () => {
    const c = deriveCounts(REPO_ROOT);
    assert.equal(c.total, 28, `expected total 28, got ${c.total}`);
    assert.equal(c.core, 1);
    assert.equal(c.featured, 1);
    assert.equal(c.tier1, 6);
    assert.equal(c.tier2, 17);
    assert.equal(c.companion, 3);
    assert.equal(c.next, 29);
  });

  it("derives the breakdown from frontmatter on a fixture", () => {
    const root = setupSkillRepo({ feat: "featured", a: "1", b: "2", c: "2", d: "companion" });
    try {
      const c = deriveCounts(root);
      // core (SKILL.md) + 1 featured + 1 tier-1 + 2 tier-2 + 1 companion = 6
      assert.equal(c.core, 1);
      assert.equal(c.featured, 1);
      assert.equal(c.tier1, 1);
      assert.equal(c.tier2, 2);
      assert.equal(c.companion, 1);
      assert.equal(c.total, 6);
      assert.equal(c.next, 7);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("check-skill-count-prose — ordinal", () => {
  it("renders English ordinals including the 11–13 exception", () => {
    assert.equal(ordinal(1), "1st");
    assert.equal(ordinal(2), "2nd");
    assert.equal(ordinal(3), "3rd");
    assert.equal(ordinal(4), "4th");
    assert.equal(ordinal(11), "11th");
    assert.equal(ordinal(12), "12th");
    assert.equal(ordinal(13), "13th");
    assert.equal(ordinal(21), "21st");
    assert.equal(ordinal(22), "22nd");
    assert.equal(ordinal(27), "27th");
  });
});

describe("check-skill-count-prose — checkProseSurfaces", () => {
  it("returns zero failures when every surface is current", () => {
    const root = setupDocsRepo(goodDocs());
    try {
      const failures = checkProseSurfaces(root, COUNTS);
      assert.deepEqual(failures, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags a stale total (25 skills) on the named surface", () => {
    const docs = goodDocs();
    docs["README.md"] = docs["README.md"].replace("26 skills", "25 skills");
    const root = setupDocsRepo(docs);
    try {
      const failures = checkProseSurfaces(root, COUNTS);
      const hit = failures.find((f) => f.file === "README.md" && f.check === "total-skills");
      assert.ok(hit, "expected a total-skills failure on README.md");
      assert.equal(hit?.reason, "stale");
      assert.match(hit?.expected ?? "", /26 skills/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags a stale tier-2 breakdown number", () => {
    const docs = goodDocs();
    docs["docs/skills.md"] = docs["docs/skills.md"].replace("15 tier-2", "14 tier-2");
    const root = setupDocsRepo(docs);
    try {
      const failures = checkProseSurfaces(root, COUNTS);
      const hit = failures.find((f) => f.file === "docs/skills.md" && f.check === "breakdown");
      assert.ok(hit, "expected a breakdown failure on docs/skills.md");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags a stale ordinal (26th instead of 27th)", () => {
    const docs = goodDocs();
    docs["README.md"] = docs["README.md"].replace("27th skill", "26th skill");
    const root = setupDocsRepo(docs);
    try {
      const failures = checkProseSurfaces(root, COUNTS);
      const hit = failures.find((f) => f.file === "README.md" && f.check === "next-ordinal");
      assert.ok(hit, "expected a next-ordinal failure on README.md");
      assert.match(hit?.expected ?? "", /27th skill/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports a missing surface file as target-missing, not a crash", () => {
    const docs = goodDocs();
    delete docs["CONTRIBUTING.md"];
    const root = setupDocsRepo(docs);
    try {
      const failures = checkProseSurfaces(root, COUNTS);
      const hit = failures.find((f) => f.file === "CONTRIBUTING.md");
      assert.ok(hit, "expected a failure for the missing CONTRIBUTING.md");
      assert.equal(hit?.reason, "target-missing");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes on the live repo (counts derived from frontmatter)", () => {
    const failures = checkProseSurfaces(REPO_ROOT);
    assert.deepEqual(
      failures,
      [],
      `live repo prose drift: ${JSON.stringify(failures, null, 2)}`,
    );
  });
});

describe("check-skill-count-prose — CLI", () => {
  it("exits 0 on the live repo", () => {
    const out = execFileSync("node", [CHECKER, REPO_ROOT], { encoding: "utf8" });
    assert.match(out, /OK skill-count-prose:/);
  });

  it("exits 1 and names the stale surface on a drifted fixture", () => {
    const root = setupSkillRepo({ feat: "featured", a: "1", b: "2", c: "companion" });
    // core + featured + 1 tier-1 + 1 tier-2 + 1 companion = 5, next = 6
    writeFileSync(
      join(root, "README.md"),
      "ships 99 skills — 1 core + 1 featured + 1 tier-1 + 1 tier-2 + 1 always-bundled. Adding a 6th skill.",
    );
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "docs", "skills.md"),
      "# the full 5-skill catalog\n1 core + 1 featured + 1 tier-1 + 1 tier-2 + 1 always-bundled = 5 skills. how to add a 6th skill.",
    );
    writeFileSync(
      join(root, "docs", "skill-use-cases.md"),
      "ships 5 skills (1 core + 1 featured + 1 tier-1 + 1 tier-2 + 1 always-bundled companions).",
    );
    writeFileSync(join(root, "CONTRIBUTING.md"), 'The "5 skills" count.');
    writeFileSync(join(root, "docs", "using-this-plugin.md"), "the full 5-skill catalog.");
    try {
      let exited = false;
      try {
        execFileSync("node", [CHECKER, root], { encoding: "utf8" });
      } catch (err) {
        exited = true;
        const e = err as { status?: number; stderr?: string };
        assert.equal(e.status, 1, `expected exit 1, got ${e.status}`);
        assert.match(e.stderr ?? "", /FAIL skill-count-prose:/);
        assert.match(e.stderr ?? "", /README\.md/);
      }
      assert.ok(exited, "CLI should have exited non-zero on the drifted README");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
