// observe-event.test.mts — RED-GREEN-REFACTOR coverage for the pure parsers
// that the new Node observer (src/bin/observe.mts) consumes.
//
// These functions have NO I/O. They take raw stdin text + extracted fields and
// return shaped event data. All filesystem and project-hash logic lives in
// src/bin/observe.mts; that entrypoint has its own test file.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseHookPayload,
  summariseInput,
  summariseOutput,
  type HookPayload,
} from "../lib/observe-event.mjs";

describe("parseHookPayload", () => {
  it("parses a well-formed PreToolUse payload", () => {
    const raw = JSON.stringify({
      tool_name: "Bash",
      session_id: "abc-123",
      tool_input: { command: "git status" },
    });
    const result = parseHookPayload(raw);
    assert.ok(result, "should return a non-null payload");
    assert.equal(result.tool_name, "Bash");
    assert.equal(result.session_id, "abc-123");
    assert.deepEqual(result.tool_input, { command: "git status" });
    assert.equal(result.tool_response, undefined, "PreToolUse has no tool_response");
  });

  it("parses a well-formed PostToolUse payload (canonical tool_response)", () => {
    const raw = JSON.stringify({
      tool_name: "Bash",
      session_id: "abc-123",
      tool_input: { command: "echo hi" },
      tool_response: { stdout: "hi", stderr: "", interrupted: false },
    });
    const result = parseHookPayload(raw);
    assert.ok(result);
    assert.deepEqual(result.tool_response, {
      stdout: "hi",
      stderr: "",
      interrupted: false,
    });
  });

  it("accepts legacy tool_output as an alias for tool_response", () => {
    const raw = JSON.stringify({
      tool_name: "Read",
      session_id: "abc-123",
      tool_input: { file_path: "/x" },
      tool_output: "file contents here",
    });
    const result = parseHookPayload(raw);
    assert.ok(result);
    assert.equal(result.tool_response, "file contents here");
  });

  it("accepts toolOutput camelCase as an alias for tool_response", () => {
    const raw = JSON.stringify({
      tool_name: "Read",
      session_id: "abc-123",
      tool_input: { file_path: "/x" },
      toolOutput: "from a third-party harness",
    });
    const result = parseHookPayload(raw);
    assert.ok(result);
    assert.equal(result.tool_response, "from a third-party harness");
  });

  it("prefers tool_response over tool_output when both are present", () => {
    const raw = JSON.stringify({
      tool_name: "Read",
      session_id: "abc-123",
      tool_input: { file_path: "/x" },
      tool_response: "canonical",
      tool_output: "legacy",
    });
    const result = parseHookPayload(raw);
    assert.ok(result);
    assert.equal(result.tool_response, "canonical");
  });

  it("returns null for malformed JSON without throwing", () => {
    const malformed = "{not valid json";
    const result = parseHookPayload(malformed);
    assert.equal(result, null);
  });

  it("returns null for empty input", () => {
    assert.equal(parseHookPayload(""), null);
  });

  it("returns null when tool_name is missing", () => {
    const raw = JSON.stringify({ session_id: "abc" });
    assert.equal(parseHookPayload(raw), null);
  });

  it("returns null when tool_name is empty string", () => {
    const raw = JSON.stringify({ tool_name: "", session_id: "abc" });
    assert.equal(parseHookPayload(raw), null);
  });

  it("tolerates a JSON null payload", () => {
    assert.equal(parseHookPayload("null"), null);
  });

  it("tolerates a JSON array payload", () => {
    assert.equal(parseHookPayload("[1,2,3]"), null);
  });

  it("preserves session_id when missing as empty string (never undefined)", () => {
    const raw = JSON.stringify({ tool_name: "Bash" });
    const result = parseHookPayload(raw);
    assert.ok(result);
    assert.equal(result.session_id, "");
  });
});

describe("summariseInput", () => {
  it("extracts Bash command head", () => {
    const summary = summariseInput("Bash", { command: "git status --porcelain" });
    assert.equal(summary, "git status --porcelain");
  });

  it("truncates Bash commands beyond 500 chars", () => {
    const long = "echo " + "x".repeat(600);
    const summary = summariseInput("Bash", { command: long });
    assert.equal(summary.length, 500);
    assert.ok(summary.startsWith("echo "));
  });

  it("extracts Edit file_path", () => {
    const summary = summariseInput("Edit", {
      file_path: "/d/Ai/continuous-improvement/src/lib/observe-event.mts",
      old_string: "foo",
      new_string: "bar",
    });
    assert.equal(summary, "/d/Ai/continuous-improvement/src/lib/observe-event.mts");
  });

  it("extracts Write file_path", () => {
    const summary = summariseInput("Write", {
      file_path: "/tmp/output.txt",
      content: "hello world",
    });
    assert.equal(summary, "/tmp/output.txt");
  });

  it("extracts Read file_path", () => {
    const summary = summariseInput("Read", { file_path: "/x/y.md" });
    assert.equal(summary, "/x/y.md");
  });

  it("extracts Grep pattern", () => {
    const summary = summariseInput("Grep", { pattern: "TODO\\(.*\\)", path: "src/" });
    assert.equal(summary, "TODO\\(.*\\)");
  });

  it("extracts Glob pattern", () => {
    const summary = summariseInput("Glob", { pattern: "**/*.mts" });
    assert.equal(summary, "**/*.mts");
  });

  it("falls back to JSON-stringified input when tool is unknown", () => {
    const summary = summariseInput("MysteryTool", { foo: "bar", baz: 42 });
    assert.match(summary, /"foo":"bar"/);
    assert.match(summary, /"baz":42/);
  });

  it("truncates the JSON fallback to 500 chars", () => {
    const big = { data: "x".repeat(2000) };
    const summary = summariseInput("Unknown", big);
    assert.equal(summary.length, 500);
  });

  it("returns empty string when input is null or undefined", () => {
    assert.equal(summariseInput("Bash", null), "");
    assert.equal(summariseInput("Bash", undefined), "");
  });

  it("returns empty string when expected field is missing on a known tool", () => {
    assert.equal(summariseInput("Bash", { not_command: "x" }), "");
    assert.equal(summariseInput("Edit", { not_file_path: "x" }), "");
  });

  it("coerces numeric fields to string before truncation", () => {
    const summary = summariseInput("Unknown", { count: 42 });
    assert.equal(typeof summary, "string");
    assert.match(summary, /"count":42/);
  });
});

describe("summariseOutput", () => {
  it("truncates string output to 200 chars", () => {
    const long = "x".repeat(500);
    const summary = summariseOutput(long);
    assert.equal(summary.length, 200);
  });

  it("preserves shorter output unchanged", () => {
    const summary = summariseOutput("ok");
    assert.equal(summary, "ok");
  });

  it("returns empty string for null/undefined", () => {
    assert.equal(summariseOutput(null), "");
    assert.equal(summariseOutput(undefined), "");
  });

  it("JSON-stringifies object output before truncation", () => {
    const summary = summariseOutput({ ok: true, message: "done" });
    assert.match(summary, /"ok":true/);
    assert.match(summary, /"message":"done"/);
  });

  it("truncates JSON-stringified objects to 200 chars", () => {
    const big = { items: Array(200).fill("item") };
    const summary = summariseOutput(big);
    assert.equal(summary.length, 200);
  });

  it("coerces numeric output to string", () => {
    assert.equal(summariseOutput(42), "42");
    assert.equal(summariseOutput(0), "0");
  });

  it("coerces boolean output to string", () => {
    assert.equal(summariseOutput(true), "true");
    assert.equal(summariseOutput(false), "false");
  });
});

describe("HookPayload type contract", () => {
  it("exposes the documented fields", () => {
    // Type-only assertion: if the import compiles and the fields below
    // are accessible without `any`, the contract holds.
    const sample: HookPayload = {
      tool_name: "Bash",
      session_id: "x",
      tool_input: { command: "ls" },
      tool_response: undefined,
    };
    assert.equal(sample.tool_name, "Bash");
  });
});
