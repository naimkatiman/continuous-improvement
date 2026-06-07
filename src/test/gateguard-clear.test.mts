/**
 * Tests for the gateguard-clear CLI — the no-MCP clearance surface the block
 * reason names. Spawns the built bin/gateguard-clear.mjs like the hook test
 * spawns the hook.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CLI = join(__dirname, "..", "bin", "gateguard-clear.mjs");

function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("bin/gateguard-clear.mjs", () => {
  let dir = "";

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "ggclear-"));
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("clears a file via --state and records the canonical key", () => {
    const state = join(dir, "gateguard-session.json");
    const result = run(["D:\\proj\\a.ts", "--state", state]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(state), "state file written");
    const parsed = JSON.parse(readFileSync(state, "utf8")) as { cleared_files: Record<string, unknown> };
    assert.ok("d:/proj/a.ts" in parsed.cleared_files, "canonical key recorded");
    assert.match(result.stdout, /Cleared 1/);
  });

  it("clears multiple files in one call and creates the state dir", () => {
    const state = join(dir, "nested", "gateguard-session.json");
    const result = run(["x/one.ts", "x/two.ts", "--state", state]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(readFileSync(state, "utf8")) as { cleared_files: Record<string, unknown> };
    assert.ok("x/one.ts" in parsed.cleared_files);
    assert.ok("x/two.ts" in parsed.cleared_files);
  });

  it("exits non-zero with usage when no file paths are given", () => {
    const result = run(["--state", join(dir, "gateguard-session.json")]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage/i);
  });

  it("falls back to the resolved session dir when --state is omitted", () => {
    const sess = mkdtempSync(join(tmpdir(), "ggclear-resolved-"));
    try {
      const result = run(["D:/proj/b.ts"], { GATEGUARD_SESSION_DIR: sess });
      assert.equal(result.status, 0, result.stderr);
      const parsed = JSON.parse(readFileSync(join(sess, "gateguard-session.json"), "utf8")) as {
        cleared_files: Record<string, unknown>;
      };
      assert.ok("d:/proj/b.ts" in parsed.cleared_files);
    } finally {
      rmSync(sess, { recursive: true, force: true });
    }
  });
});
