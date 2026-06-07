/**
 * Unit tests for gateguard-state path canonicalization + the shared clearance
 * writer. Canonicalization is what lets the hook and any clearance helper agree
 * on the session dir and the per-file key regardless of drive-letter case or
 * path separator — the root cause of the marker-seeding fragility.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import {
  MAX_CLEARED_FILES,
  canonicalizeFileKey,
  canonicalizeProjectRoot,
  clearFiles,
  isFileCleared,
  loadState,
  markFileCleared,
  resolveSessionDir,
} from "../lib/gateguard-state.mjs";

describe("canonicalizeProjectRoot", () => {
  it("lowercases a Windows drive letter", () => {
    assert.equal(canonicalizeProjectRoot("D:/Ai/x"), "d:/Ai/x");
  });

  it("converts backslashes to forward slashes", () => {
    assert.equal(canonicalizeProjectRoot("d:\\Ai\\x"), "d:/Ai/x");
  });

  it("normalizes drive case AND separators together", () => {
    assert.equal(canonicalizeProjectRoot("D:\\Ai\\x"), "d:/Ai/x");
  });

  it("strips a trailing slash", () => {
    assert.equal(canonicalizeProjectRoot("d:/Ai/x/"), "d:/Ai/x");
  });

  it("leaves a POSIX path unchanged", () => {
    assert.equal(canonicalizeProjectRoot("/home/u/x"), "/home/u/x");
  });

  it("leaves a relative path unchanged", () => {
    assert.equal(canonicalizeProjectRoot("x"), "x");
  });
});

describe("canonicalizeFileKey", () => {
  it("normalizes drive case and separators", () => {
    assert.equal(canonicalizeFileKey("D:\\Ai\\x\\a.ts"), "d:/Ai/x/a.ts");
  });

  it("is a no-op on relative keys so existing test keys keep matching", () => {
    assert.equal(canonicalizeFileKey("scratch.txt"), "scratch.txt");
  });

  it("does NOT lowercase directory/file names, only the drive letter", () => {
    assert.equal(canonicalizeFileKey("D:/Ai/MyDir/File.TS"), "d:/Ai/MyDir/File.TS");
  });
});

describe("resolveSessionDir canonical hashing", () => {
  it("resolves drive-case/separator-equivalent roots to the same dir", () => {
    const prevProj = process.env.CLAUDE_PROJECT_DIR;
    const prevSess = process.env.GATEGUARD_SESSION_DIR;
    try {
      delete process.env.GATEGUARD_SESSION_DIR;
      process.env.CLAUDE_PROJECT_DIR = "d:\\Ai\\continuous-improvement";
      const a = resolveSessionDir();
      process.env.CLAUDE_PROJECT_DIR = "D:/Ai/continuous-improvement/";
      const b = resolveSessionDir();
      assert.equal(a, b);
    } finally {
      if (prevProj === undefined) delete process.env.CLAUDE_PROJECT_DIR;
      else process.env.CLAUDE_PROJECT_DIR = prevProj;
      if (prevSess === undefined) delete process.env.GATEGUARD_SESSION_DIR;
      else process.env.GATEGUARD_SESSION_DIR = prevSess;
    }
  });
});

describe("markFileCleared / isFileCleared canonical matching", () => {
  it("markFileCleared stores the canonical key", () => {
    const state = markFileCleared({ created_at: "t", cleared_files: {} }, "D:\\Ai\\a.ts");
    assert.ok("d:/Ai/a.ts" in state.cleared_files);
  });

  it("isFileCleared matches across drive-case and separator forms", () => {
    const state = markFileCleared({ created_at: "t", cleared_files: {} }, "D:\\Ai\\a.ts");
    assert.equal(isFileCleared(state, "d:/Ai/a.ts"), true);
    assert.equal(isFileCleared(state, "D:\\Ai\\a.ts"), true);
    assert.equal(isFileCleared(state, "d:\\Ai\\a.ts"), true);
  });

  it("isFileCleared is false for an uncleared file", () => {
    const state = markFileCleared({ created_at: "t", cleared_files: {} }, "D:\\Ai\\a.ts");
    assert.equal(isFileCleared(state, "d:/Ai/b.ts"), false);
  });
});

describe("clearFiles shared writer", () => {
  let dir = "";

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "gg-state-"));
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes canonical markers and reports them cleared", () => {
    const result = clearFiles(dir, ["D:\\Ai\\a.ts", "d:/Ai/b.ts"]);
    assert.deepEqual([...result.cleared].sort(), ["d:/Ai/a.ts", "d:/Ai/b.ts"]);
    const state = loadState(dir);
    assert.ok("d:/Ai/a.ts" in state.cleared_files);
    assert.ok("d:/Ai/b.ts" in state.cleared_files);
  });

  it("is idempotent across path forms for the same canonical key", () => {
    clearFiles(dir, ["D:\\Ai\\c.ts"]);
    const before = Object.keys(loadState(dir).cleared_files).length;
    clearFiles(dir, ["d:/Ai/c.ts"]);
    assert.equal(Object.keys(loadState(dir).cleared_files).length, before);
  });

  it("respects the cap and reports skipped files", () => {
    const capDir = mkdtempSync(join(tmpdir(), "gg-cap-"));
    try {
      const seed = Array.from({ length: MAX_CLEARED_FILES }, (_, i) => `/seed/${i}.ts`);
      clearFiles(capDir, seed);
      const result = clearFiles(capDir, ["/over/the/cap.ts"]);
      assert.deepEqual(result.cleared, []);
      assert.deepEqual(result.skippedForCap, ["/over/the/cap.ts"]);
    } finally {
      rmSync(capDir, { recursive: true, force: true });
    }
  });
});
