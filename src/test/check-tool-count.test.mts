import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { countTools } from "../bin/check-tool-count.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CHECKER = join(REPO_ROOT, "bin", "check-tool-count.mjs");

interface RepoOpts {
  expert: number;
  beginner: number;
  skillsClaim: number;
  mcpClaim: number;
}

function toolsArray(n: number): { tools: { name: string }[] } {
  return { tools: Array.from({ length: n }, (_, i) => ({ name: `ci_t${i}` })) };
}

function setupRepo(opts: RepoOpts): string {
  const root = mkdtempSync(join(tmpdir(), "tool-count-test-"));
  mkdirSync(join(root, "plugins"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "src", "bin"), { recursive: true });
  writeFileSync(join(root, "plugins", "expert.json"), JSON.stringify(toolsArray(opts.expert)));
  writeFileSync(join(root, "plugins", "beginner.json"), JSON.stringify(toolsArray(opts.beginner)));
  writeFileSync(
    join(root, "docs", "skills.md"),
    `Tier 2 skills, the MCP server (${opts.skillsClaim} tools), session hooks, /learn-eval.\n`,
  );
  writeFileSync(
    join(root, "src", "bin", "mcp-server.mts"),
    ` * Two modes: beginner (${opts.mcpClaim} tools) and expert (all tools).\n`,
  );
  return root;
}

describe("check-tool-count — unit", () => {
  it("countTools reads tools[].length from the generated manifest", () => {
    const root = setupRepo({ expert: 18, beginner: 4, skillsClaim: 18, mcpClaim: 4 });
    try {
      assert.equal(countTools(root, "expert"), 18);
      assert.equal(countTools(root, "beginner"), 4);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("check-tool-count — integration", () => {
  it("CLI exits 0 when every claim matches the manifest counts", () => {
    const root = setupRepo({ expert: 18, beginner: 4, skillsClaim: 18, mcpClaim: 4 });
    try {
      const out = execFileSync("node", [CHECKER, root], { encoding: "utf8" });
      assert.match(out, /OK tool-count: all 2 claim\(s\) match the generated manifests \(expert=18, beginner=4\)\./);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("CLI exits 1 and names the stale claim when the expert count drifts", () => {
    // Catalog grew to 19 but docs/skills.md still says 18.
    const root = setupRepo({ expert: 19, beginner: 4, skillsClaim: 18, mcpClaim: 4 });
    try {
      let exited = false;
      try {
        execFileSync("node", [CHECKER, root], { encoding: "utf8" });
      } catch (err) {
        exited = true;
        const e = err as { status?: number; stderr?: string };
        assert.equal(e.status, 1, `expected exit 1, got ${e.status}`);
        assert.match(e.stderr ?? "", /FAIL tool-count: 1 claim\(s\)/);
        assert.match(e.stderr ?? "", /docs\/skills\.md — expert MCP tool count: states "MCP server \(18 tools\)", expected 19/);
      }
      assert.ok(exited, "CLI should have exited non-zero when the expert count drifts");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("CLI exits 1 when the beginner source comment drifts", () => {
    const root = setupRepo({ expert: 18, beginner: 4, skillsClaim: 18, mcpClaim: 3 });
    try {
      let exited = false;
      try {
        execFileSync("node", [CHECKER, root], { encoding: "utf8" });
      } catch (err) {
        exited = true;
        const e = err as { status?: number; stderr?: string };
        assert.equal(e.status, 1, `expected exit 1, got ${e.status}`);
        assert.match(e.stderr ?? "", /beginner mode tool count: states "beginner \(3 tools\)", expected 4/);
      }
      assert.ok(exited, "CLI should have exited non-zero when the beginner comment drifts");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("verifies the live repo has zero tool-count drift", () => {
    const out = execFileSync("node", [CHECKER, REPO_ROOT], { encoding: "utf8" });
    assert.match(out, /OK tool-count:/);
  });
});
