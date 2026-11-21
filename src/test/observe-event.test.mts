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

  // Secrets that only a length-thresholded rule catches: cut down to their
  // first `inside` characters they are no longer a match, so a cut-then-redact
  // order writes that head into the row. A named secret would not show the
  // order: `Authorization: Bearer x` is redacted at any length.
  const JWT_HEAD = "eyJhbGciOiJIUzI1NiJ9";
  const STRADDLERS: ReadonlyArray<{ shape: string; lead: string; secret: string; inside: number; placeholder: string }> = [
    {
      shape: "a bare 48-hex key",
      lead: "",
      secret: "9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3928",
      inside: 25,
      placeholder: "<hex-redacted:9f8e7d6c>",
    },
    {
      shape: "a provider-prefixed token",
      lead: "",
      secret: `ghp_${"Zk9Qw2".repeat(6)}`,
      inside: 15,
      placeholder: "<token-redacted>",
    },
    {
      shape: "a Bearer token with no header name",
      lead: "Bearer ",
      secret: "Qm9x7KpL2".repeat(4),
      inside: 12,
      placeholder: "Bearer <redacted>",
    },
    {
      shape: "a JWT",
      lead: "",
      secret: `${JWT_HEAD}.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpM`,
      inside: 30,
      placeholder: "<jwt-redacted>",
    },
    {
      // Its third segment starts 600 characters past the cut: the redactor has
      // to read that far ahead to see a JWT at all.
      shape: "a JWT with a 600-character payload",
      lead: "",
      secret: `${JWT_HEAD}.${"eyJzdWIiOiIxMjM0NTY3ODkwIn0".repeat(23).slice(0, 600)}.SflKxwRJSMeKKF2QT4fwpM`,
      inside: 30,
      placeholder: "<jwt-redacted>",
    },
  ];

  // Text whose secret starts `inside` chars ahead of `cut` and ends past it,
  // and the same text with the secret already replaced. The padding ends in a
  // space, so the secret starts at a word boundary.
  function straddling(
    cut: number,
    lead: string,
    secret: string,
    inside: number,
    placeholder = "",
  ): { text: string; redacted: string } {
    const start = cut - inside;
    const padding = `${"pad ".repeat(cut).slice(0, start - lead.length - 1)} `;
    const text = `${padding}${lead}${secret} tail`;
    assert.equal(text.indexOf(secret), start, "fixture: the secret starts inside the budget");
    assert.ok(start + secret.length > cut, "fixture: the secret ends past the budget");
    return { text, redacted: `${padding}${placeholder} tail` };
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

  // The row is the redacted text cut to the budget, never the cut text redacted.
  for (const { shape, lead, secret, inside, placeholder } of STRADDLERS) {
    it(`leaves no head of ${shape} behind when it straddles the 500-char input cut`, () => {
      const { text, redacted } = straddling(500, lead, secret, inside, placeholder);
      const summary = summariseInput("Bash", { command: text });
      assert.ok(!summary.includes(secret.slice(0, 12)), summary.slice(-60));
      assert.equal(summary, redacted.slice(0, 500));
    });

    it(`leaves no head of ${shape} behind when it straddles the 200-char output cut`, () => {
      const { text, redacted } = straddling(200, lead, secret, inside, placeholder);
      const summary = summariseOutput(text);
      assert.ok(!summary.includes(secret.slice(0, 12)), summary.slice(-60));
      assert.equal(summary, redacted.slice(0, 200));
    });
  }

  it("leaves no key head behind when it straddles the cut inside Bash stdout", () => {
    // 30 of the key's 48 characters sit inside the leaf's own 200-char budget,
    // fewer than the 32 the hex rule needs, and 19 of them inside the row.
    const { secret, placeholder } = STRADDLERS[0]!;
    const { text, redacted } = straddling(200, "", secret, 30, placeholder);
    const summary = summariseOutput({ stdout: text, stderr: "", interrupted: false });
    assert.ok(!summary.includes(secret.slice(0, 12)), summary.slice(-60));
    assert.equal(summary, JSON.stringify({ stdout: redacted }).slice(0, 200));
  });

  it("leaves no token head behind when a named secret straddles either cut", () => {
    for (const cut of [500, 200]) {
      const { text } = straddling(cut, BEARER_LEAD, BEARER, 10);
      const summary = cut === 500 ? summariseInput("Bash", { command: text }) : summariseOutput(text);
      assert.ok(summary.length <= cut, `budget exceeded: ${summary.length}`);
      assert.ok(!summary.includes(BEARER.slice(0, 8)), summary.slice(-60));
      assert.match(summary, /Bearer <redacted>/);
    }
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

  it("keeps a dotted file name and a dotted test id, which are not JWTs", () => {
    const file_path = "D:/proj/src/users/user-preferences.controller.integration.spec.ts";
    assert.equal(summariseInput("Edit", { file_path, old_string: "a", new_string: "b" }), file_path);
    const stdout = "FAIL: test_upload_link_unlink (test_server.CrmServerTests.test_upload_link_unlink)";
    assert.equal(summariseOutput({ stdout, stderr: "" }), JSON.stringify({ stdout, stderr: "" }));
  });

  it("keeps the command that follows an empty assignment, and the next line of a blank .env entry", () => {
    const command = "OPENAI_API_KEY= pytest -q";
    assert.equal(summariseInput("Bash", { command }), command);
    assert.equal(
      summariseOutput({ stdout: "OPENAI_API_KEY=\nANTHROPIC_API_KEY=\n", stderr: "", interrupted: false }),
      '{"stdout":"OPENAI_API_KEY=\\nANTHROPIC_API_KEY=\\n","stderr":"","interrupted":false}',
    );
  });

  it("stays cheap on a payload far larger than the budget", () => {
    // A run of `eyJ-` is the slow case for the JWT pattern, which retries at
    // every `eyJ` and walks the rest of the run: redacting these 200 KB whole
    // takes many seconds across the three calls, the bounded head takes
    // milliseconds.
    const blob = "eyJ-".repeat(50_000);
    const started = process.hrtime.bigint();
    summariseInput("Bash", { command: blob });
    summariseOutput(blob);
    summariseOutput({ stdout: blob });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(elapsedMs < 1000, `three summaries took ${elapsedMs.toFixed(0)}ms`);
  });

  it("bounds the redaction work of one event, however many long leaves it has", () => {
    // Every string leaf is redacted on its own, and a run of `eyJ-` costs most
    // of a millisecond per leaf. The work budget stops after the few leaves
    // that can reach the row; without it these 8,000 leaves take many seconds.
    const leaf = "eyJ-".repeat(50_000);
    const leaves = Array.from({ length: 8_000 }, () => leaf);
    const content = leaves.map((text) => ({ type: "text", text }));
    const started = process.hrtime.bigint();
    const input = summariseInput("mcp__x__y", { items: leaves });
    const output = summariseOutput({ content });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(input.length, 500);
    assert.equal(output.length, 200);
    assert.ok(elapsedMs < 1000, `two summaries took ${elapsedMs.toFixed(0)}ms`);
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
    assert.equal(summary, '{"stdout":"Generated:\\n<hex-redacted:9f8e7d6c>\\ndone\\n","stderr":"","interrupted":false}');

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
    assert.equal(summary, `{"command":"$k = @'\\n<hex-redacted:9f8e7d6c>\\n'@"}`);
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

  // `key`, `keys` and `token` are ordinary property names (a key press, a cache
  // key, a list of keys). Under one of them a value is replaced only when it is
  // credential-shaped; everything else is treated like any other leaf.
  it("keeps an ordinary value under a property named key, keys or token", () => {
    const cases: ReadonlyArray<[string, unknown]> = [
      ["mcp__playwright__browser_press_key", { key: "Enter" }],
      ["mcp__kv__get", { namespace: "sessions", key: "user:42:profile" }],
      ["mcp__db__query", { sql: "select * from t", keys: ["a", "b"], token: 123456 }],
      ["TodoWrite", { todos: [{ content: "rotate api key: done", status: "completed" }] }],
    ];
    for (const [tool, input] of cases) {
      assert.equal(summariseInput(tool, input), JSON.stringify(input));
      assert.equal(summariseOutput(input), JSON.stringify(input));
    }
  });

  it("replaces a credential-shaped value under a property named key, keys or token, however it is nested", () => {
    const summary = summariseInput("mcp__x__y", {
      key: SECRET,
      keys: [SECRET, "a"],
      token: { value: SECRET, type: "Bearer", note: `PASSWORD=${SECRET}` },
      keep: SECRET,
    });
    assert.equal(
      summary,
      '{"key":"<redacted>","keys":["<redacted>","a"],"token":{"value":"<redacted>","type":"Bearer","note":"<redacted>"},"keep":"hunter2SECRETvalue"}',
    );
  });

  it("decides on the part of a long value that can reach the row", () => {
    // The credential sits 2 MB into the value, far past the cut: the head is
    // ordinary text and is kept.
    const summary = summariseInput("mcp__x__y", { key: `${"word ".repeat(400_000)}${SECRET}` });
    assert.equal(summary.length, 500);
    assert.match(summary, /^\{"key":"word word /);
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

// Plan PR 18 (Architecture item 9): every hook agent's verified PostToolUse
// shape, from fixtures/agent-matrix/<agent>.json and the research rows they cite.
describe("parseHookPayload: other agents' payloads", () => {
  const parse = (value: unknown, agent: string) => parseHookPayload(JSON.stringify(value), agent);

  it("reads Copilot's camelCase toolName, toolArgs (a JSON string) and toolResult, and sessionId", () => {
    const result = parse({ sessionId: "c1", cwd: "/p", toolName: "bash", toolArgs: "{\"command\":\"cat a.txt\"}", toolResult: { resultType: "success", textResultForLlm: "x" } }, "copilot");
    assert.ok(result);
    assert.equal(result.tool_name, "bash");
    assert.deepEqual(result.tool_input, { command: "cat a.txt" });
    assert.deepEqual(result.tool_response, { resultType: "success", textResultForLlm: "x" });
    assert.equal(result.session_id, "c1");
    assert.equal(result.complete, true);
  });

  it("reads Copilot's snake form tool_result", () => {
    const result = parse({ hook_event_name: "PostToolUse", session_id: "c1", tool_name: "bash", tool_input: { command: "ls" }, tool_result: { result_type: "success", text_result_for_llm: "x" } }, "copilot");
    assert.deepEqual(result?.tool_response, { result_type: "success", text_result_for_llm: "x" });
    assert.equal(result?.complete, true);
  });

  it("reads Cline's nested postToolUse and its result, and taskId as the session", () => {
    const result = parse({ hookName: "PostToolUse", taskId: "t1", postToolUse: { toolName: "read_file", parameters: { path: "a.txt" }, result: "body", success: true } }, "cline");
    assert.ok(result);
    assert.equal(result.tool_name, "read_file");
    assert.deepEqual(result.tool_input, { path: "a.txt" });
    assert.equal(result.tool_response, "body");
    assert.equal(result.session_id, "t1");
    assert.equal(result.complete, true);
  });

  it("marks Goose's PostToolUse complete though it carries no result, and its PreToolUse not", () => {
    const post = parse({ event: "PostToolUse", session_id: "g1", tool_name: "shell", tool_input: { command: "cat a.txt" }, working_dir: "/p" }, "goose");
    assert.equal(post?.tool_response, undefined);
    assert.equal(post?.complete, true);
    const pre = parse({ event: "PreToolUse", session_id: "g1", tool_name: "shell", tool_input: { command: "ls" }, tool_call_id: "c2" }, "goose");
    assert.equal(pre?.complete, false);
    assert.equal(pre?.tool_use_id, "c2");
  });

  it("classifies by Gemini's AfterTool and BeforeTool, Cursor's camelCase and Grok's hookEventName", () => {
    assert.equal(parse({ hook_event_name: "AfterTool", session_id: "s", tool_name: "read_file" }, "gemini")?.complete, true);
    assert.equal(parse({ hook_event_name: "BeforeTool", session_id: "s", tool_name: "read_file", tool_response: "x" }, "gemini")?.complete, false);
    assert.equal(parse({ hook_event_name: "postToolUse", conversation_id: "c", tool_name: "Read" }, "cursor")?.complete, true);
    assert.equal(parse({ hookEventName: "post_tool_use", session_id: "s", tool_name: "read_file" }, "grok")?.complete, true);
  });

  it("reads Grok's toolResult and toolUseId, and Cursor's and Auggie's conversation_id", () => {
    const grok = parse({ hookEventName: "post_tool_use", session_id: "s", tool_name: "read_file", toolResult: "x", toolUseId: "u1" }, "grok");
    assert.equal(grok?.tool_response, "x");
    assert.equal(grok?.tool_use_id, "u1");
    assert.equal(parse({ hook_event_name: "postToolUse", conversation_id: "c9", tool_name: "Read", tool_output: "x" }, "cursor")?.session_id, "c9");
    assert.equal(parse({ hook_event_name: "PostToolUse", conversation_id: "a9", tool_name: "bash", tool_output: "o", tool_result: "r" }, "auggie")?.session_id, "a9");
  });

  it("takes Devin's tool_response.output for another agent, and keeps Claude's tool_response whole", () => {
    const response = { success: true, output: "file body", error: null };
    assert.equal(parse({ hook_event_name: "PostToolUse", session_id: "d", tool_name: "exec", tool_response: response }, "devin")?.tool_response, "file body");
    assert.deepEqual(parse({ hook_event_name: "PostToolUse", session_id: "d", tool_name: "Bash", tool_response: response }, "claude")?.tool_response, response);
  });

  it("keeps Claude's classification by result: a PostToolUse with no tool_response stays tool_start", () => {
    const result = parse({ hook_event_name: "PostToolUse", session_id: "s", tool_name: "Bash", tool_input: "raw", tool_use_id: "toolu_1" }, "claude");
    assert.equal(result?.complete, false);
    assert.equal(result?.tool_input, "raw", "Claude's tool_input is kept as sent");
    assert.equal(result?.tool_use_id, "toolu_1");
  });

  it("an event name it does not know falls back to the result", () => {
    assert.equal(parse({ event: "Weird", session_id: "s", tool_name: "shell" }, "goose")?.complete, false);
    assert.equal(parse({ event: "Weird", session_id: "s", tool_name: "shell", tool_response: "x" }, "goose")?.complete, true);
  });

  it("writes nothing for an unknown shape, an empty nested call or malformed toolArgs with no name", () => {
    for (const value of [
      { event: "PostToolUse", session_id: "s" },
      { hookName: "PostToolUse", taskId: "t", postToolUse: {} },
      { hookName: "PostToolUse", taskId: "t", postToolUse: { toolName: 3 } },
      { hookName: "PostToolUse", postToolUse: null },
      { sessionId: "c", toolName: "" },
      { toolArgs: "{not json" },
    ]) {
      assert.equal(parse(value, "copilot"), null, JSON.stringify(value));
    }
  });

  it("keeps a call with malformed toolArgs, with empty input", () => {
    const result = parse({ sessionId: "c", toolName: "bash", toolArgs: "{not json", toolResult: {} }, "copilot");
    assert.deepEqual(result?.tool_input, {});
  });

  it("names no session and no call id when the payload has none, or a blank call id", () => {
    const result = parse({ event: "PostToolUse", tool_name: "shell", tool_use_id: "" }, "goose");
    assert.equal(result?.session_id, "");
    assert.equal(result?.tool_use_id, "");
  });
});
