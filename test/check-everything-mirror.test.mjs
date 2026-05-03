import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkMirrorPairs,
  discoverMirrorPairs,
} from "../bin/check-everything-mirror.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CHECKER = join(REPO_ROOT, "bin", "check-everything-mirror.mjs");
const PLUGIN_ROOT_REL = "plugins/continuous-improvement";

function setupRepo() {
  const root = mkdtempSync(join(tmpdir(), "everything-mirror-test-"));
  mkdirSync(join(root, PLUGIN_ROOT_REL), { recursive: true });
  return root;
}

// Write a mirrored pair: same relative path under flat root and plugin root.
// Pass standaloneContent === null to omit the flat sibling (missing-flat case).
function writePair(root, relPath, pluginContent, standaloneContent) {
  const pluginPath = join(root, PLUGIN_ROOT_REL, relPath);
  mkdirSync(join(pluginPath, ".."), { recursive: true });
  writeFileSync(pluginPath, pluginContent);
  if (standaloneContent !== null) {
    const flatPath = join(root, relPath);
    mkdirSync(join(flatPath, ".."), { recursive: true });
    writeFileSync(flatPath, standaloneContent);
  }
}

describe("check-everything-mirror — unit", () => {
  it("returns no drifts when every mirrored file matches its flat sibling", () => {
    const root = setupRepo();
    try {
      writePair(root, "commands/foo.md", "foo body\n", "foo body\n");
      writePair(
        root,
        "instinct-packs/bar.json",
        '{"x":1}\n',
        '{"x":1}\n',
      );
      writePair(
        root,
        "templates/baz/qux.md",
        "qux body\n",
        "qux body\n",
      );
      const drifts = checkMirrorPairs(root);
      assert.equal(
        drifts.length,
        0,
        `expected no drifts, got: ${JSON.stringify(drifts)}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("detects content drift between plugin and flat copy", () => {
    const root = setupRepo();
    try {
      writePair(
        root,
        "commands/foo.md",
        "foo body v2\n",
        "foo body v1\n",
      );
      const drifts = checkMirrorPairs(root);
      assert.equal(drifts.length, 1);
      assert.equal(drifts[0].relPath, "commands/foo.md");
      assert.equal(drifts[0].reason, "content-drift");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("detects missing flat sibling", () => {
    const root = setupRepo();
    try {
      writePair(root, "commands/foo.md", "foo body\n", null);
      const drifts = checkMirrorPairs(root);
      assert.equal(drifts.length, 1);
      assert.equal(drifts[0].relPath, "commands/foo.md");
      assert.equal(drifts[0].reason, "missing-flat");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("excludes the allowlisted plugin-only files from comparison", () => {
    const root = setupRepo();
    try {
      // .claude-plugin/* and skills/ are skipped wholesale; README.md and
      // hooks/hooks.json are skipped by name. None of these need a flat sibling.
      mkdirSync(join(root, PLUGIN_ROOT_REL, ".claude-plugin"), {
        recursive: true,
      });
      writeFileSync(
        join(root, PLUGIN_ROOT_REL, ".claude-plugin", "plugin.json"),
        '{"name":"x"}\n',
      );
      writeFileSync(
        join(root, PLUGIN_ROOT_REL, ".claude-plugin", "marketplace.json"),
        '{"name":"x"}\n',
      );
      writeFileSync(
        join(root, PLUGIN_ROOT_REL, "README.md"),
        "plugin readme\n",
      );
      mkdirSync(join(root, PLUGIN_ROOT_REL, "hooks"), { recursive: true });
      writeFileSync(
        join(root, PLUGIN_ROOT_REL, "hooks", "hooks.json"),
        "{}\n",
      );
      mkdirSync(join(root, PLUGIN_ROOT_REL, "skills", "alpha"), {
        recursive: true,
      });
      writeFileSync(
        join(root, PLUGIN_ROOT_REL, "skills", "alpha", "SKILL.md"),
        "skill body\n",
      );
      writeFileSync(
        join(root, PLUGIN_ROOT_REL, "skills", "README.md"),
        "skills readme\n",
      );
      const pairs = discoverMirrorPairs(root);
      assert.equal(
        pairs.length,
        0,
        `expected zero discovered pairs (all allowlisted), got: ${JSON.stringify(pairs.map((p) => p.relPath))}`,
      );
      const drifts = checkMirrorPairs(root);
      assert.equal(drifts.length, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns empty list when plugin root is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "everything-mirror-empty-"));
    try {
      const pairs = discoverMirrorPairs(root);
      assert.equal(pairs.length, 0);
      const drifts = checkMirrorPairs(root);
      assert.equal(drifts.length, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("check-everything-mirror — integration", () => {
  it("CLI exits 0 with OK message on a clean synthetic repo", () => {
    const root = setupRepo();
    try {
      writePair(root, "commands/foo.md", "foo\n", "foo\n");
      writePair(root, "lib/bar.mjs", "export const x = 1;\n", "export const x = 1;\n");
      const out = execFileSync("node", [CHECKER, root], { encoding: "utf8" });
      assert.match(out, /OK everything-mirror: all 2 mirrored file\(s\) match/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("CLI exits 1 with FAIL message on a drifted synthetic repo", () => {
    const root = setupRepo();
    try {
      writePair(root, "commands/foo.md", "foo v2\n", "foo v1\n");
      let exited = false;
      try {
        execFileSync("node", [CHECKER, root], { encoding: "utf8" });
      } catch (err) {
        exited = true;
        const e = err;
        assert.equal(e.status, 1, `expected exit 1, got ${e.status}`);
        assert.match(
          e.stderr ?? "",
          /FAIL everything-mirror: 1 drift\(s\)/,
        );
        assert.match(e.stderr ?? "", /byte drift/);
      }
      assert.ok(exited, "CLI should have exited non-zero on drift");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("verifies the live repo has zero everything-mirror drifts", () => {
    const drifts = checkMirrorPairs(REPO_ROOT);
    assert.equal(
      drifts.length,
      0,
      `live repo has everything-mirror drift: ${JSON.stringify(drifts, null, 2)}`,
    );
  });
});
