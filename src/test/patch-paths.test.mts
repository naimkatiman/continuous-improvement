/**
 * The apply_patch path parser.
 *
 * Codex sends every edit as `apply_patch` with the whole patch text in
 * tool_input.command, and the file paths are only in its header lines (verified
 * research, Codex entry: "file paths only inside the '*** Add File: / *** Update
 * File: / *** Delete File:' patch headers"). Devin, Cline, Copilot, Junie and
 * Droid send patches the same way. A gate that cannot read the paths cannot
 * judge the edit, so the parser must find every header and nothing else.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parsePatchPaths } from "../lib/patch-paths.mjs";

describe("parsePatchPaths", () => {
  it("reads the Add, Update and Delete File headers in order", () => {
    const patch = [
      "*** Begin Patch",
      "*** Add File: src/new.ts",
      "+export const a = 1;",
      "*** Update File: src/old.ts",
      "@@ export const b",
      "-export const b = 1;",
      "+export const b = 2;",
      "*** Delete File: src/gone.ts",
      "*** End Patch",
    ].join("\n");
    assert.deepEqual(parsePatchPaths(patch), ["src/new.ts", "src/old.ts", "src/gone.ts"]);
  });

  it("reads a Move to line as a second target of its Update", () => {
    const patch = "*** Begin Patch\n*** Update File: a.ts\n*** Move to: b.ts\n@@\n-x\n+y\n*** End Patch";
    assert.deepEqual(parsePatchPaths(patch), ["a.ts", "b.ts"]);
  });

  it("reads CRLF patches and drops the carriage return from the path", () => {
    const patch = "*** Begin Patch\r\n*** Update File: package.json\r\n@@\r\n-a\r\n+b\r\n*** End Patch\r\n";
    assert.deepEqual(parsePatchPaths(patch), ["package.json"]);
  });

  it("keeps a path with spaces and trims only the edges", () => {
    assert.deepEqual(parsePatchPaths("*** Update File:   docs/my notes.md  \n"), ["docs/my notes.md"]);
  });

  it("does not read a header-shaped line inside a hunk", () => {
    const patch = [
      "*** Begin Patch",
      "*** Update File: README.md",
      "@@",
      "+*** Add File: not-a-target.ts",
      "-*** Delete File: also-not.ts",
      " *** Update File: context-line.ts",
      "*** End Patch",
    ].join("\n");
    assert.deepEqual(parsePatchPaths(patch), ["README.md"]);
  });

  it("lists a path once when two headers name it", () => {
    const patch = "*** Update File: a.ts\n*** Update File: a.ts\n*** Delete File: a.ts\n";
    assert.deepEqual(parsePatchPaths(patch), ["a.ts"]);
  });

  it("skips a header with no path", () => {
    assert.deepEqual(parsePatchPaths("*** Update File:\n*** Add File:    \n*** Delete File: x.ts"), ["x.ts"]);
  });

  it("reads headers without the Begin and End lines", () => {
    assert.deepEqual(parsePatchPaths("*** Update File: lib/x.mjs\n@@\n-a\n+b"), ["lib/x.mjs"]);
  });

  it("returns no paths for empty, unknown and non-string input", () => {
    assert.deepEqual(parsePatchPaths(""), []);
    assert.deepEqual(parsePatchPaths("diff --git a/x b/x\n--- a/x\n+++ b/x"), []);
    assert.deepEqual(parsePatchPaths("*** Begin Patch\n*** End Patch"), []);
    assert.deepEqual(parsePatchPaths(undefined), []);
    assert.deepEqual(parsePatchPaths(null), []);
    assert.deepEqual(parsePatchPaths(42), []);
    assert.deepEqual(parsePatchPaths({ command: "*** Update File: a.ts" }), []);
  });

  it("is case-sensitive about the header words, as the patch grammar is", () => {
    assert.deepEqual(parsePatchPaths("*** update file: a.ts\n*** UPDATE FILE: b.ts"), []);
  });
});
