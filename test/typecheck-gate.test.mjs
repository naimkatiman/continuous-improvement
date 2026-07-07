/**
 * Unit tests for the pure typecheck-gate helpers (RISA 4 / G4).
 * No spawning — the compiler-running path is covered by
 * typecheck-stop-hook.test.mts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideTypecheckAction, formatTypecheckReason, hasChangedTsFile, parseChangedFiles, pickTypecheckKind, resolveTypecheckMode, } from "../lib/typecheck-gate.mjs";
describe("typecheck-gate — resolveTypecheckMode", () => {
    it("defaults to off when unset or empty", () => {
        assert.equal(resolveTypecheckMode(undefined), "off");
        assert.equal(resolveTypecheckMode(""), "off");
        assert.equal(resolveTypecheckMode("   "), "off");
    });
    it("parses block and warn case-insensitively", () => {
        assert.equal(resolveTypecheckMode("block"), "block");
        assert.equal(resolveTypecheckMode("BLOCK"), "block");
        assert.equal(resolveTypecheckMode(" Warn "), "warn");
    });
    it("treats any unrecognized value as off (fail-safe)", () => {
        assert.equal(resolveTypecheckMode("on"), "off");
        assert.equal(resolveTypecheckMode("true"), "off");
    });
});
describe("typecheck-gate — hasChangedTsFile / parseChangedFiles", () => {
    it("detects .ts/.tsx/.mts/.cts", () => {
        assert.equal(hasChangedTsFile(["src/a.ts"]), true);
        assert.equal(hasChangedTsFile(["src/a.tsx"]), true);
        assert.equal(hasChangedTsFile(["x.mts"]), true);
        assert.equal(hasChangedTsFile(["x.cts"]), true);
    });
    it("ignores non-TS changes", () => {
        assert.equal(hasChangedTsFile(["README.md", "a.js", "b.json"]), false);
        assert.equal(hasChangedTsFile([]), false);
    });
    it("parseChangedFiles drops blank lines and trims", () => {
        assert.deepEqual(parseChangedFiles("a.ts\n\n  b.md \n"), ["a.ts", "b.md"]);
        assert.deepEqual(parseChangedFiles(""), []);
    });
});
describe("typecheck-gate — pickTypecheckKind", () => {
    it("prefers the npm typecheck script", () => {
        assert.equal(pickTypecheckKind(true, true), "npm");
        assert.equal(pickTypecheckKind(true, false), "npm");
    });
    it("falls back to local tsc", () => {
        assert.equal(pickTypecheckKind(false, true), "tsc");
    });
    it("returns null when neither is available", () => {
        assert.equal(pickTypecheckKind(false, false), null);
    });
});
describe("typecheck-gate — formatTypecheckReason", () => {
    it("keeps only the last N non-empty lines", () => {
        const lines = Array.from({ length: 30 }, (_, i) => `line${i + 1}`).join("\n");
        const reason = formatTypecheckReason(lines, 15);
        assert.match(reason, /fix before ending the turn/);
        assert.match(reason, /line30/);
        assert.doesNotMatch(reason, /line15\b/); // trimmed to the last 15 (16..30)
    });
    it("handles empty output", () => {
        assert.match(formatTypecheckReason(""), /Typecheck FAILED/);
    });
});
describe("typecheck-gate — decideTypecheckAction", () => {
    it("off always allows, even on failure", () => {
        assert.equal(decideTypecheckAction({ mode: "off", ranTypecheck: true, rc: 1 }), "allow");
    });
    it("allows when the check did not run", () => {
        assert.equal(decideTypecheckAction({ mode: "block", ranTypecheck: false, rc: 1 }), "allow");
    });
    it("allows on a clean (rc 0) run", () => {
        assert.equal(decideTypecheckAction({ mode: "block", ranTypecheck: true, rc: 0 }), "allow");
    });
    it("maps a conclusive failure to the mode", () => {
        assert.equal(decideTypecheckAction({ mode: "block", ranTypecheck: true, rc: 2 }), "block");
        assert.equal(decideTypecheckAction({ mode: "warn", ranTypecheck: true, rc: 1 }), "warn");
    });
});
