import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkRoutingTargets,
  discoverBundledSkills,
  extractRoutingTargets,
  loadOptionalCompanions,
} from "../bin/check-routing-targets.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CHECKER = join(REPO_ROOT, "bin", "check-routing-targets.mjs");
const PLUGIN_SKILLS = "plugins/continuous-improvement/skills";

function setupRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "routing-targets-test-"));
  mkdirSync(join(root, PLUGIN_SKILLS), { recursive: true });
  mkdirSync(join(root, "skills"), { recursive: true });
  return root;
}

function writeBundled(root: string, name: string): void {
  const dir = join(root, PLUGIN_SKILLS, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `# ${name}\n`);
}

function writeOrchestrator(root: string, tableRows: string[]): void {
  const body = [
    "# Proceed With The Recommendation",
    "",
    "## Phase 3 — Route",
    "",
    "### Routing Table (with Inline Fallbacks)",
    "",
    "| Recommendation type | Preferred skill | Inline fallback |",
    "|---|---|---|",
    ...tableRows,
    "",
    "## Phase 4 — Verify",
    "",
    "Smallest check that proves correctness.",
    "",
  ].join("\n");
  writeFileSync(
    join(root, "skills", "proceed-with-the-recommendation.md"),
    body,
  );
}

function writeOptionalCompanions(root: string, companions: string[]): void {
  writeFileSync(
    join(root, "optional-companions.json"),
    JSON.stringify(
      {
        _doc: "test fixture",
        optional_companions: companions,
      },
      null,
      2,
    ),
  );
}

describe("check-routing-targets — parser", () => {
  it("extracts every backtick-quoted token from the Preferred skill column", () => {
    const md = [
      "### Routing Table (with Inline Fallbacks)",
      "",
      "| Recommendation type | Preferred skill | Inline fallback |",
      "|---|---|---|",
      "| One target | `alpha` | inline |",
      "| Two targets | `beta` or `gamma` | inline |",
      "| Sub-skill notation | `superpowers:writing-plans` | inline |",
      "",
      "## Next Section",
      "",
    ].join("\n");
    const targets = extractRoutingTargets(md);
    assert.deepEqual(
      targets.map((t) => t.target),
      ["alpha", "beta", "gamma", "superpowers:writing-plans"],
    );
  });

  it("stops parsing at the next ## or ### header", () => {
    const md = [
      "### Routing Table (with Inline Fallbacks)",
      "",
      "| col1 | col2 | col3 |",
      "|---|---|---|",
      "| Real row | `alpha` | inline |",
      "",
      "### Some Other Subsection",
      "",
      "| Recommendation type | Preferred skill | Inline fallback |",
      "|---|---|---|",
      "| Should NOT be parsed | `noise` | inline |",
    ].join("\n");
    const targets = extractRoutingTargets(md);
    assert.deepEqual(
      targets.map((t) => t.target),
      ["alpha"],
    );
  });

  it("throws when the routing-table section header is missing", () => {
    assert.throws(
      () => extractRoutingTargets("# A skill\n\nNo routing table here.\n"),
      /Routing-table section header not found/,
    );
  });

  it("ignores backtick tokens in the Inline fallback column", () => {
    const md = [
      "### Routing Table (with Inline Fallbacks)",
      "",
      "| col1 | col2 | col3 |",
      "|---|---|---|",
      "| Row A | `alpha` | edit `~/.claude/settings.json` then restart |",
      "",
    ].join("\n");
    const targets = extractRoutingTargets(md);
    assert.deepEqual(
      targets.map((t) => t.target),
      ["alpha"],
    );
  });
});

describe("check-routing-targets — invariant", () => {
  it("returns zero drifts when every target is either bundled or declared optional", () => {
    const root = setupRepo();
    try {
      writeBundled(root, "alpha");
      writeOrchestrator(root, [
        "| Bundled row | `alpha` | inline |",
        "| Optional row | `beta` | inline |",
      ]);
      writeOptionalCompanions(root, ["beta"]);
      const result = checkRoutingTargets(root);
      assert.equal(result.drifts.length, 0);
      assert.equal(result.targets.length, 2);
      assert.equal(result.bundledCount, 1);
      assert.equal(result.optionalCount, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags a target that is neither bundled nor declared optional", () => {
    const root = setupRepo();
    try {
      writeBundled(root, "alpha");
      writeOrchestrator(root, [
        "| Bundled row | `alpha` | inline |",
        "| Unknown row | `gamma` | inline |",
      ]);
      writeOptionalCompanions(root, []);
      const result = checkRoutingTargets(root);
      assert.equal(result.drifts.length, 1);
      assert.equal(result.drifts[0].target, "gamma");
      assert.equal(result.drifts[0].recommendationType, "Unknown row");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("treats bundled and bare-namespace as exact-match (does not auto-resolve sub-skills)", () => {
    const root = setupRepo();
    try {
      writeBundled(root, "superpowers");
      writeOrchestrator(root, [
        "| Sub-skill row | `superpowers:writing-plans` | inline |",
      ]);
      writeOptionalCompanions(root, []);
      const result = checkRoutingTargets(root);
      assert.equal(result.drifts.length, 1);
      assert.equal(result.drifts[0].target, "superpowers:writing-plans");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("loadOptionalCompanions throws on a malformed companions file", () => {
    const root = setupRepo();
    try {
      writeFileSync(
        join(root, "optional-companions.json"),
        JSON.stringify({ wrong_key: [] }),
      );
      assert.throws(() => loadOptionalCompanions(root), /missing or non-array/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("discoverBundledSkills returns an empty set when the plugin skills dir is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "routing-targets-empty-"));
    try {
      assert.equal(discoverBundledSkills(root).size, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("check-routing-targets — CLI", () => {
  it("exits 0 with OK message on a clean synthetic repo", () => {
    const root = setupRepo();
    try {
      writeBundled(root, "alpha");
      writeOrchestrator(root, [
        "| Bundled row | `alpha` | inline |",
        "| Optional row | `beta` | inline |",
      ]);
      writeOptionalCompanions(root, ["beta"]);
      const out = execFileSync("node", [CHECKER, root], { encoding: "utf8" });
      assert.match(
        out,
        /OK routing-targets: all 2 routing target\(s\) accounted for/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits 1 with FAIL message on a drifted synthetic repo", () => {
    const root = setupRepo();
    try {
      writeBundled(root, "alpha");
      writeOrchestrator(root, [
        "| Unknown row | `gamma` | inline |",
      ]);
      writeOptionalCompanions(root, []);
      let exited = false;
      try {
        execFileSync("node", [CHECKER, root], { encoding: "utf8" });
      } catch (err) {
        exited = true;
        const e = err as { status?: number; stderr?: string };
        assert.equal(e.status, 1, `expected exit 1, got ${e.status}`);
        assert.match(
          e.stderr ?? "",
          /FAIL routing-targets: 1 unaccounted target/,
        );
        assert.match(e.stderr ?? "", /"gamma"/);
      }
      assert.ok(exited, "CLI should have exited non-zero on drift");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("check-routing-targets — live repo", () => {
  it("verifies the live repo has zero unaccounted routing targets", () => {
    const result = checkRoutingTargets(REPO_ROOT);
    assert.equal(
      result.drifts.length,
      0,
      `live repo has unaccounted routing targets: ${JSON.stringify(result.drifts, null, 2)}`,
    );
  });
});
