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

// Rows are redacted when they are written, not when they are read: every
// summary below ends up at rest in observations.jsonl. Both values are fakes.
describe("secret redaction at write time", () => {
  const BEARER = "sk-FAKE0123456789abcdefghijklmnopqrstuv";
  const KV_SECRET = "FAKEvalue-9f8e7d6c5b4a";
  const BEARER_LEAD = 'curl -H "Authorization: Bearer ';

  // A command whose bearer token starts `before` chars ahead of `cut` and ends
  // past it, so a cut-then-redact order would leave the token head in the row.
  function straddling(cut: number, before: number): string {
    const padding = "pad ".repeat(cut).slice(0, cut - before - BEARER_LEAD.length);
    const text = `${padding}${BEARER_LEAD}${BEARER}" https://api.example.test`;
    assert.equal(text.indexOf(BEARER), cut - before, "fixture: token starts inside the budget");
    assert.ok(text.indexOf(BEARER) + BEARER.length > cut, "fixture: token ends past the budget");
    return text;
  }

  it("redacts a bearer token from a Bash command head and keeps the rest", () => {
    const summary = summariseInput("Bash", {
      command: `${BEARER_LEAD}${BEARER}" https://api.example.test/v1/items`,
    });
    assert.equal(summary, `${BEARER_LEAD}<redacted>" https://api.example.test/v1/items`);
  });

  it("redacts a KEY=value assignment from a Bash command head", () => {
    const summary = summariseInput("Bash", {
      command: `API_TOKEN=${KV_SECRET} ./deploy.sh --env staging`,
    });
    assert.equal(summary, "API_TOKEN=<redacted> ./deploy.sh --env staging");
  });

  it("redacts secrets from the JSON fallback of an unknown tool", () => {
    const summary = summariseInput("WebFetch", {
      url: "https://api.example.test",
      headers: { Authorization: `Bearer ${BEARER}` },
    });
    assert.ok(!summary.includes(BEARER), summary);
    assert.match(summary, /"url":"https:\/\/api\.example\.test"/);
    assert.match(summary, /"Authorization":"Bearer <redacted>"/);
  });

  it("redacts secrets from string output", () => {
    const summary = summariseOutput(
      `export API_TOKEN=${KV_SECRET}\nAuthorization: Bearer ${BEARER}\ndone`,
    );
    assert.equal(summary, "export API_TOKEN=<redacted>\nAuthorization: Bearer <redacted>\ndone");
  });

  it("redacts secrets from object output (the Bash tool_response shape)", () => {
    const summary = summariseOutput({
      stdout: `Authorization: Bearer ${BEARER}\nAPI_TOKEN=${KV_SECRET}\n`,
      stderr: "",
      interrupted: false,
    });
    assert.ok(!summary.includes(BEARER), summary);
    assert.ok(!summary.includes(KV_SECRET), summary);
    assert.match(summary, /^\{"stdout":"Authorization: Bearer <redacted>/);
  });

  it("leaves no token head behind when a secret straddles the 500-char input cut", () => {
    const summary = summariseInput("Bash", { command: straddling(500, 10) });
    assert.ok(summary.length <= 500, `input budget exceeded: ${summary.length}`);
    assert.ok(!summary.includes(BEARER.slice(0, 8)), summary.slice(-60));
    assert.match(summary, /Bearer <redacted>/);
  });

  it("leaves no token head behind when a secret straddles the 200-char output cut", () => {
    const summary = summariseOutput(straddling(200, 10));
    assert.ok(summary.length <= 200, `output budget exceeded: ${summary.length}`);
    assert.ok(!summary.includes(BEARER.slice(0, 8)), summary.slice(-60));
    assert.match(summary, /Bearer <redacted>/);
  });

  it("holds both budgets when redaction makes the text longer", () => {
    // Each one-char value becomes a ten-char placeholder.
    const many = "A_KEY=1 ".repeat(100);
    const input = summariseInput("Bash", { command: many });
    const output = summariseOutput(many);
    assert.equal(input.length, 500);
    assert.equal(output.length, 200);
    assert.ok(input.startsWith("A_KEY=<redacted> A_KEY=<redacted> "), input.slice(0, 40));
    assert.ok(output.startsWith("A_KEY=<redacted> A_KEY=<redacted> "), output.slice(0, 40));
  });

  it("leaves text with no secret shape untouched", () => {
    const command = "git log --oneline -5 && npm run verify:all";
    assert.equal(summariseInput("Bash", { command }), command);
    assert.equal(summariseOutput(command), command);
  });

  // The transcript linter reads the verification command out of this row, so a
  // redaction that runs on to the end of the command costs the session Law 4.
  it("keeps the command that follows a quoted string ending in a secret name", () => {
    for (const command of [
      'grep -n "apiKey:" src/config.ts | head -5 && npm test',
      "grep -rn 'password=' config/ ; npm run build",
    ]) {
      assert.equal(summariseInput("Bash", { command }), command);
      assert.equal(summariseInput("PowerShell", { command }), JSON.stringify({ command }));
    }
  });

  it("stays cheap on a payload far larger than the budget", () => {
    // Dash-separated text is the slow case for the JWT pattern: redacting these
    // 30 KB whole takes seconds across the three calls, the bounded head takes
    // milliseconds.
    const blob = "ab-".repeat(10_000);
    const started = process.hrtime.bigint();
    summariseInput("Bash", { command: blob });
    summariseOutput(blob);
    summariseOutput({ stdout: blob });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(elapsedMs < 1000, `three summaries took ${elapsedMs.toFixed(0)}ms`);
  });
});

// An object summary (every unknown tool's input, and the Bash tool_response)
// used to be redacted after JSON.stringify. In that text a newline is the two
// characters backslash + n: the n glues a secret on the next line to a word
// character, and an unquoted value never meets the whitespace that ends it.
describe("secret redaction of object summaries happens before they are serialised", () => {
  const HEX = "9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3928";
  const SECRET = "hunter2SECRETvalue";

  it("redacts a hex key on the second line of Bash stdout", () => {
    const summary = summariseOutput({ stdout: `Generated:\n${HEX}\ndone\n`, stderr: "", interrupted: false });
    assert.equal(summary, '{"stdout":"Generated:\\n<hex-redacted>\\ndone\\n","stderr":"","interrupted":false}');

    const labelled = summariseOutput({ stdout: `Your API key:\n${HEX}\n`, stderr: "", interrupted: false });
    assert.ok(!labelled.includes(HEX), labelled);
    assert.match(labelled, /"stderr":"","interrupted":false\}$/, "the rest of the row survives");
  });

  it("redacts a hex key after a tab and after a CRLF line break", () => {
    const tabbed = summariseOutput({ stdout: `key\t${HEX}`, stderr: "", interrupted: false });
    const crlf = summariseOutput({ stdout: `Your API key:\r\n${HEX}\r\n`, stderr: "", interrupted: false });
    assert.ok(!tabbed.includes(HEX), tabbed);
    assert.ok(!crlf.includes(HEX), crlf);
  });

  it("redacts a hex key inside a PowerShell here-string command", () => {
    const summary = summariseInput("PowerShell", { command: `$k = @'\n${HEX}\n'@` });
    assert.equal(summary, `{"command":"$k = @'\\n<hex-redacted>\\n'@"}`);
  });

  it("keeps the lines after a redacted assignment in Bash stdout", () => {
    const summary = summariseOutput({
      stdout: "DB_PASSWORD=x\nDB_HOST=localhost\nError: connection refused",
      stderr: "",
      interrupted: false,
    });
    assert.equal(
      summary,
      '{"stdout":"DB_PASSWORD=<redacted>\\nDB_HOST=localhost\\nError: connection refused","stderr":"","interrupted":false}',
    );
  });

  it("keeps the words a friction classifier reads after a redacted token line", () => {
    const summary = summariseOutput({
      stdout: "",
      stderr: "GITHUB_TOKEN=x\nPermission denied (publickey)",
      interrupted: false,
    });
    assert.match(summary, /Permission denied \(publickey\)/);
  });

  it("keeps the fields after a redacted assignment in an unknown tool's input", () => {
    const summary = summariseInput("mcp__x__y", { a: "API_TOKEN=abc", b: "important", c: "more-important" });
    assert.equal(summary, '{"a":"API_TOKEN=<redacted>","b":"important","c":"more-important"}');
  });

  it("redacts the value of a secret-named property whatever its type", () => {
    const summary = summariseInput("mcp__x__y", {
      API_TOKEN: SECRET,
      pin_token: 123456,
      nested: { password: { hint: SECRET } },
      list: [{ "x-api-key": SECRET }, "plain"],
      keep: "v",
    });
    assert.equal(
      summary,
      '{"API_TOKEN":"<redacted>","pin_token":"<redacted>","nested":{"password":"<redacted>"},"list":[{"x-api-key":"<redacted>"},"plain"],"keep":"v"}',
    );
  });

  it("serialises what JSON.stringify would for a payload with nothing to redact", () => {
    const input = { url: "https://example.test/a?b=1", depth: 2, flags: [true, null, "x"], nested: { n: 1.5 } };
    assert.equal(summariseInput("WebFetch", input), JSON.stringify(input));
    assert.equal(summariseOutput(input), JSON.stringify(input));
  });

  it("never writes a leaf it did not redact, however many leaves there are", () => {
    // Each leaf shrinks to a short placeholder, so a budget counted on the
    // input would run out while later leaves still land inside the cut.
    const many = Array.from({ length: 400 }, () => HEX.repeat(20));
    const input = summariseInput("mcp__x__y", { values: many });
    const output = summariseOutput({ values: many });
    assert.ok(input.length <= 500, `input budget exceeded: ${input.length}`);
    assert.ok(output.length <= 200, `output budget exceeded: ${output.length}`);
    assert.ok(!input.includes(HEX.slice(0, 16)), input.slice(0, 120));
    assert.ok(!output.includes(HEX.slice(0, 16)), output.slice(0, 120));
  });

  // A header map holds the credential without the header name in front of it,
  // so the Authorization rule needs the name of the property it sits under.
  it("redacts an Authorization entry of a header map and keeps the scheme", () => {
    const summary = summariseInput("WebFetch", {
      url: "https://x.test",
      headers: { Authorization: `Basic ${SECRET}`, "Proxy-Authorization": SECRET, Accept: "application/json" },
    });
    assert.equal(
      summary,
      '{"url":"https://x.test","headers":{"Authorization":"Basic <redacted>","Proxy-Authorization":"<redacted>","Accept":"application/json"}}',
    );
  });

  it("returns an empty summary for a value JSON cannot serialise", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    assert.equal(summariseOutput(cyclic), "");
    assert.equal(summariseInput("mcp__x__y", cyclic), "");
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
