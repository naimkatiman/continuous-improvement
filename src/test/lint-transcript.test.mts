import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

interface TranscriptEvent {
  event?: string;
  tool?: string;
  tool_input?: Record<string, unknown>;
}

interface LintJsonResult {
  score: number;
  stats: {
    researchTools: number;
    toolCalls: number;
    totalEvents: number;
    verifyTools: number;
    writeTools: number;
  };
  violations: Array<{
    law: number;
  }>;
}

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const LINTER = join(__dirname, "..", "bin", "lint-transcript.mjs");
const OBSERVER = join(__dirname, "..", "bin", "observe.mjs");

// A Claude Code session transcript (~/.claude/projects/<project>/<session>.jsonl)
// as the CLI writes it: every row is an envelope with a `type`, a tool call is a
// `tool_use` block inside an `assistant` row, and its result comes back as a
// `tool_result` block inside a `user` row. This session makes three Edit/Write
// calls with no research before them and never runs a test.
const CLAUDE_CODE_TRANSCRIPT_WITH_VIOLATIONS: unknown[] = [
  { type: "file-history-snapshot", messageId: "u1", snapshot: { trackedFileBackups: {} }, isSnapshotUpdate: false },
  {
    type: "user",
    uuid: "u1",
    parentUuid: null,
    sessionId: "sess-transcript",
    cwd: "/repo",
    message: { role: "user", content: "add a retry to the fetch helper" },
  },
  {
    type: "assistant",
    uuid: "a1",
    parentUuid: "u1",
    sessionId: "sess-transcript",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "Adding the retry." },
        { type: "tool_use", id: "toolu_01", name: "Edit", input: { file_path: "/repo/src/fetch.ts", old_string: "get(", new_string: "retry(get, " } },
      ],
    },
  },
  {
    type: "user",
    uuid: "u2",
    parentUuid: "a1",
    sessionId: "sess-transcript",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_01", content: "The file /repo/src/fetch.ts has been updated." }] },
  },
  {
    type: "assistant",
    uuid: "a2",
    parentUuid: "u2",
    sessionId: "sess-transcript",
    message: {
      role: "assistant",
      content: [
        { type: "tool_use", id: "toolu_02", name: "Write", input: { file_path: "/repo/src/retry.ts", content: "export function retry() {}\n" } },
        { type: "tool_use", id: "toolu_03", name: "Edit", input: { file_path: "/repo/src/index.ts", old_string: "", new_string: "export * from './retry';\n" } },
      ],
    },
  },
  {
    type: "user",
    uuid: "u3",
    parentUuid: "a2",
    sessionId: "sess-transcript",
    message: {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "toolu_02", content: "File created successfully at: /repo/src/retry.ts" },
        { type: "tool_result", tool_use_id: "toolu_03", content: "The file /repo/src/index.ts has been updated." },
      ],
    },
  },
  { type: "system", subtype: "turn_duration", sessionId: "sess-transcript", durationMs: 4200 },
  {
    type: "assistant",
    uuid: "a3",
    parentUuid: "u3",
    sessionId: "sess-transcript",
    message: { role: "assistant", content: [{ type: "text", text: "Done. The fetch helper now retries." }] },
  },
];

/** One tool call as a Claude Code transcript records it: the assistant row, then its result row. */
function transcriptToolCall(id: string, name: string, input: Record<string, unknown>): unknown[] {
  return [
    { type: "assistant", sessionId: "sess-transcript", message: { role: "assistant", content: [{ type: "tool_use", id, name, input }] } },
    { type: "user", sessionId: "sess-transcript", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "ok" }] } },
  ];
}

/** One observations.jsonl row as bin/observe.mjs writes it: the tool input is a summary string. */
function observation(tool: string, inputSummary: string, outputSummary = ""): unknown {
  return {
    ts: "2026-11-20T09:00:00Z",
    event: "tool_complete",
    session: "sess-observations",
    tool,
    input_summary: inputSummary,
    output_summary: outputSummary,
    project_id: "0123456789ab",
    project_name: "repo",
  };
}

// The plugin's own observation log for a session that writes two files with no
// research before them, then runs the tests.
const OBSERVATIONS_WITH_VIOLATIONS: unknown[] = [
  observation("Edit", "/repo/src/fetch.ts", '{"filePath":"/repo/src/fetch.ts"}'),
  observation("Write", "/repo/src/retry.ts", '{"type":"create","filePath":"/repo/src/retry.ts"}'),
  observation("Bash", "npm test", '{"stdout":"tests 12\\npass 12\\nfail 0"}'),
];

function lintRows(rows: unknown[], flags: string[] = []): { status: number | null; stdout: string } {
  const dir = join(tmpdir(), `ci-lint-rows-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "transcript.jsonl");
  writeFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  try {
    const result = spawnSync("node", [LINTER, file, ...flags], { encoding: "utf8" });
    return { status: result.status, stdout: result.stdout };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Lint raw JSONL lines exactly as given, for input that is not one object per line. */
function lintLines(lines: string[], flags: string[] = []): { status: number | null; stdout: string; stderr: string } {
  const dir = join(tmpdir(), `ci-lint-lines-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "transcript.jsonl");
  writeFileSync(file, lines.join("\n") + "\n");
  try {
    const result = spawnSync("node", [LINTER, file, ...flags], { encoding: "utf8" });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function lawsOf(result: LintJsonResult): number[] {
  return result.violations.map((violation) => violation.law);
}

function lintEvents(events: TranscriptEvent[], flags: string[] = []): string {
  const dir = join(tmpdir(), `ci-lint-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "transcript.jsonl");
  writeFileSync(file, events.map((event) => JSON.stringify(event)).join("\n") + "\n");
  try {
    return execFileSync("node", [LINTER, file, ...flags], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("lint-transcript.mjs", () => {
  it("shows help with --help", () => {
    const output = execFileSync("node", [LINTER, "--help"], { encoding: "utf8" });
    assert.match(output, /Agent Transcript Linter/);
    assert.match(output, /--stdin/);
    assert.match(output, /--strict/);
    assert.match(output, /--json/);
  });

  it("exits 0 with no events from stdin", () => {
    const dir = join(tmpdir(), `ci-lint-empty-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "empty.jsonl");
    writeFileSync(file, "\n");
    try {
      const output = execFileSync("node", [LINTER, file], { encoding: "utf8" });
      assert.match(output, /No events found/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detects Law 1 violation (writes without research)", () => {
    const events: TranscriptEvent[] = [
      { tool: "Write", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
      { tool: "Write", event: "tool_start", tool_input: { file_path: "/tmp/b.ts" } },
    ];
    const output = lintEvents(events);
    assert.match(output, /Law 1/);
    assert.match(output, /Research Before Executing/);
  });

  it("no Law 1 violation when research precedes writes", () => {
    const events: TranscriptEvent[] = [
      { tool: "Grep", event: "tool_start", tool_input: { pattern: "test" } },
      { tool: "Read", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
      { tool: "Write", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
    ];
    const result = JSON.parse(lintEvents(events, ["--json"])) as LintJsonResult;
    const law1Violations = result.violations.filter((violation) => violation.law === 1);
    assert.equal(law1Violations.length, 0, "Should have no Law 1 violations");
  });

  it("detects Law 4 violation (no verification)", () => {
    const events: TranscriptEvent[] = [
      { tool: "Read", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
      { tool: "Edit", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
    ];
    const output = lintEvents(events);
    assert.match(output, /Law 4/);
    assert.match(output, /Verify Before Reporting/);
  });

  it("no Law 4 violation when tests are run", () => {
    const events: TranscriptEvent[] = [
      { tool: "Read", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
      { tool: "Edit", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
      { tool: "Bash", event: "tool_start", tool_input: { command: "npm test" } },
    ];
    const result = JSON.parse(lintEvents(events, ["--json"])) as LintJsonResult;
    const law4Violations = result.violations.filter((violation) => violation.law === 4);
    assert.equal(law4Violations.length, 0, "Should have no Law 4 violations");
  });

  it("detects Law 3 violation (too many consecutive edits)", () => {
    const events: TranscriptEvent[] = [
      { tool: "Read", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
      ...Array.from({ length: 7 }, (_, index): TranscriptEvent => ({
        tool: "Edit",
        event: "tool_start",
        tool_input: { file_path: `/tmp/file${index}.ts` },
      })),
    ];
    const output = lintEvents(events);
    assert.match(output, /Law 3/);
  });

  it("outputs JSON with --json flag", () => {
    const events: TranscriptEvent[] = [{ tool: "Read", event: "tool_start", tool_input: {} }];
    const result = JSON.parse(lintEvents(events, ["--json"])) as LintJsonResult;
    assert.ok("violations" in result);
    assert.ok("stats" in result);
    assert.ok("score" in result);
    assert.ok(typeof result.score === "number");
  });

  it("calculates discipline score", () => {
    const events: TranscriptEvent[] = [
      { tool: "Grep", event: "tool_start", tool_input: { pattern: "test" } },
      { tool: "Read", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
      { tool: "Edit", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
      { tool: "Bash", event: "tool_start", tool_input: { command: "npm test" } },
    ];
    const result = JSON.parse(lintEvents(events, ["--json"])) as LintJsonResult;
    assert.equal(result.score, 100, "Perfect discipline should score 100");
  });

  it("reads from file path", () => {
    const tempDir = join(tmpdir(), `ci-lint-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    const filePath = join(tempDir, "transcript.jsonl");
    writeFileSync(filePath, '{"tool":"Read","event":"tool_start","tool_input":{}}\n');
    const output = execFileSync("node", [LINTER, filePath], { encoding: "utf8" });
    assert.match(output, /Agent Discipline Report/);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("--strict exits 1 on violations", () => {
    const events: TranscriptEvent[] = [
      { tool: "Write", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
    ];
    let exitCode = 0;
    try {
      lintEvents(events, ["--strict"]);
    } catch (error) {
      exitCode = typeof (error as { status?: number }).status === "number"
        ? (error as { status: number }).status
        : 0;
    }
    assert.equal(exitCode, 1, "Should exit 1 with --strict and violations");
  });

  it("--strict exits 0 on clean transcript", () => {
    const events: TranscriptEvent[] = [
      { tool: "Grep", event: "tool_start", tool_input: { pattern: "x" } },
      { tool: "Read", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
      { tool: "Edit", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
      { tool: "Bash", event: "tool_start", tool_input: { command: "npm test" } },
    ];
    const output = lintEvents(events, ["--strict"]);
    assert.match(output, /No law violations/);
  });

  it("uses the GitHub Action transcript-path input when no CLI path is provided", () => {
    const tempDir = join(tmpdir(), `ci-lint-gh-input-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    const filePath = join(tempDir, "transcript.jsonl");
    const events: TranscriptEvent[] = [
      { tool: "Grep", event: "tool_start", tool_input: { pattern: "x" } },
      { tool: "Read", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
      { tool: "Edit", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
      { tool: "Bash", event: "tool_start", tool_input: { command: "npm test" } },
    ];
    writeFileSync(filePath, events.map((event) => JSON.stringify(event)).join("\n") + "\n");

    try {
      const output = execFileSync("node", [LINTER], {
        encoding: "utf8",
        env: { ...process.env, "INPUT_TRANSCRIPT-PATH": filePath },
      });
      assert.match(output, /No law violations/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("uses the GitHub Action observations-path input as a fallback", () => {
    const tempDir = join(tmpdir(), `ci-lint-gh-observations-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    const filePath = join(tempDir, "observations.jsonl");
    const events: TranscriptEvent[] = [
      { tool: "Read", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
    ];
    writeFileSync(filePath, events.map((event) => JSON.stringify(event)).join("\n") + "\n");

    try {
      const output = execFileSync("node", [LINTER], {
        encoding: "utf8",
        env: { ...process.env, "INPUT_OBSERVATIONS-PATH": filePath },
      });
      assert.match(output, /Agent Discipline Report/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("uses the GitHub Action strict input", () => {
    const tempDir = join(tmpdir(), `ci-lint-gh-strict-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    const filePath = join(tempDir, "transcript.jsonl");
    const events: TranscriptEvent[] = [
      { tool: "Write", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
    ];
    writeFileSync(filePath, events.map((event) => JSON.stringify(event)).join("\n") + "\n");

    try {
      let status = 0;
      let stdout = "";
      try {
        stdout = execFileSync("node", [LINTER], {
          encoding: "utf8",
          env: { ...process.env, "INPUT_TRANSCRIPT-PATH": filePath, INPUT_STRICT: "true" },
        });
      } catch (error) {
        status = typeof (error as { status?: number }).status === "number"
          ? (error as { status: number }).status
          : 0;
        stdout = String((error as { stdout?: string }).stdout ?? "");
      }
      assert.equal(status, 1, "strict action input should fail on violations");
      assert.match(stdout, /Law 1/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("writes the declared GitHub Action report output", () => {
    const tempDir = join(tmpdir(), `ci-lint-gh-output-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    const filePath = join(tempDir, "transcript.jsonl");
    const githubOutput = join(tempDir, "github-output.txt");
    const events: TranscriptEvent[] = [
      { tool: "Write", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
    ];
    writeFileSync(filePath, events.map((event) => JSON.stringify(event)).join("\n") + "\n");

    try {
      execFileSync("node", [LINTER, filePath], {
        encoding: "utf8",
        env: { ...process.env, GITHUB_OUTPUT: githubOutput },
      });
      const output = readFileSync(githubOutput, "utf8");
      assert.match(output, /^violations=3$/m);
      assert.match(output, /^score=14$/m);
      const reportMatch = output.match(/^report<<CI_REPORT_EOF\n([\s\S]*?)\nCI_REPORT_EOF$/m);
      assert.ok(reportMatch, "GITHUB_OUTPUT should contain a multiline report output");
      assert.match(reportMatch[1] ?? "", /Agent Discipline Report/);
      assert.match(reportMatch[1] ?? "", /Law 1/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("tracks stats correctly", () => {
    const events: TranscriptEvent[] = [
      { tool: "Grep", event: "tool_start", tool_input: {} },
      { tool: "Read", event: "tool_start", tool_input: {} },
      { tool: "Glob", event: "tool_start", tool_input: {} },
      { tool: "Write", event: "tool_start", tool_input: { file_path: "/tmp/a.ts" } },
      { tool: "Edit", event: "tool_start", tool_input: { file_path: "/tmp/b.ts" } },
      { tool: "Bash", event: "tool_start", tool_input: { command: "jest" } },
    ];
    const result = JSON.parse(lintEvents(events, ["--json"])) as LintJsonResult;
    assert.equal(result.stats.researchTools, 3);
    assert.equal(result.stats.writeTools, 2);
    assert.equal(result.stats.verifyTools, 1);
  });

  it("--help names the three accepted input formats", () => {
    const output = execFileSync("node", [LINTER, "--help"], { encoding: "utf8" });
    assert.match(output, /Claude Code transcript/);
    assert.match(output, /observations\.jsonl/);
    assert.match(output, /tool_input/);
  });

  describe("Claude Code transcript rows (tool_use blocks inside assistant messages)", () => {
    it("reports unresearched, unverified Edit/Write calls and exits 1 under --strict", () => {
      const { status, stdout } = lintRows(CLAUDE_CODE_TRANSCRIPT_WITH_VIOLATIONS, ["--strict"]);
      assert.doesNotMatch(stdout, /No law violations/);
      assert.match(stdout, /Law 1: Research Before Executing/);
      assert.match(stdout, /3 writes with 0 research operations/);
      assert.match(stdout, /Law 4: Verify Before Reporting/);
      assert.equal(status, 1, "a transcript with violations must fail --strict");
    });

    it("counts one event per tool_use block and none for the other rows", () => {
      const { stdout } = lintRows(CLAUDE_CODE_TRANSCRIPT_WITH_VIOLATIONS, ["--json"]);
      const result = JSON.parse(stdout) as LintJsonResult;
      assert.equal(result.stats.totalEvents, 3);
      assert.equal(result.stats.toolCalls, 3);
      assert.equal(result.stats.writeTools, 3);
      assert.equal(result.stats.researchTools, 0);
      assert.equal(result.stats.verifyTools, 0);
      assert.deepEqual(lawsOf(result), [1, 1, 1, 1, 4]);
    });

    it("reads research and the Bash command of a disciplined session, which stays clean under --strict", () => {
      const rows = [
        ...transcriptToolCall("toolu_11", "Grep", { pattern: "retry" }),
        ...transcriptToolCall("toolu_12", "Read", { file_path: "/repo/src/fetch.ts" }),
        ...transcriptToolCall("toolu_13", "Edit", { file_path: "/repo/src/fetch.ts", old_string: "a", new_string: "b" }),
        ...transcriptToolCall("toolu_14", "Bash", { command: "npm test", description: "Run the tests" }),
      ];
      const result = JSON.parse(lintRows(rows, ["--json"]).stdout) as LintJsonResult;
      assert.equal(result.stats.researchTools, 2);
      assert.equal(result.stats.writeTools, 1);
      assert.equal(result.stats.verifyTools, 1);
      assert.deepEqual(lawsOf(result), []);

      const strict = lintRows(rows, ["--strict"]);
      assert.match(strict.stdout, /No law violations/);
      assert.equal(strict.status, 0);
    });
  });

  describe("observations.jsonl rows (tool input stored as input_summary)", () => {
    it("reports the unresearched writes, sees the test run, and exits 1 under --strict", () => {
      const result = JSON.parse(lintRows(OBSERVATIONS_WITH_VIOLATIONS, ["--json"]).stdout) as LintJsonResult;
      assert.equal(result.stats.writeTools, 2);
      assert.equal(result.stats.verifyTools, 1, "the Bash command lives in input_summary");
      assert.deepEqual(lawsOf(result), [1, 1, 1], "Law 1 only: the test run rules out Law 4");

      const strict = lintRows(OBSERVATIONS_WITH_VIOLATIONS, ["--strict"]);
      assert.match(strict.stdout, /Law 1: Research Before Executing/);
      assert.doesNotMatch(strict.stdout, /Law 4/);
      assert.equal(strict.status, 1, "an observation log with violations must fail --strict");
    });

    it("keeps a researched, verified session clean under --strict", () => {
      const rows = [
        observation("Grep", "retry"),
        observation("Read", "/repo/src/fetch.ts"),
        observation("Edit", "/repo/src/fetch.ts"),
        observation("Bash", "npm test", '{"stdout":"pass 12"}'),
      ];
      const { status, stdout } = lintRows(rows, ["--strict"]);
      assert.match(stdout, /No law violations/);
      assert.equal(status, 0);
    });

    it("reads the edited file path from input_summary (Law 6 counts distinct files)", () => {
      const rows = [
        observation("Grep", "retry"),
        observation("Glob", "src/**/*.ts"),
        observation("Read", "/repo/src/fetch.ts"),
        ...Array.from({ length: 9 }, (_, index) => [
          observation("Edit", `/repo/src/file${index}.ts`),
          ...(index % 3 === 2 ? [observation("Bash", "npm test")] : []),
        ]).flat(),
      ];
      const result = JSON.parse(lintRows(rows, ["--json"]).stdout) as LintJsonResult;
      assert.deepEqual(lawsOf(result), [6]);
      assert.equal(lintRows(rows, ["--strict"]).status, 1);
    });
  });

  // Claude Code on Windows has a first-class PowerShell tool with the same
  // { command } input as Bash. A test run through it is the same verification,
  // and reading only `Bash` turned every Windows session into a Law 4 failure.
  describe("a test run through the PowerShell tool counts as verification", () => {
    it("in a Claude Code transcript", () => {
      const rows = [
        ...transcriptToolCall("toolu_21", "Read", { file_path: "/repo/src/fetch.ts" }),
        ...transcriptToolCall("toolu_22", "Edit", { file_path: "/repo/src/fetch.ts", old_string: "a", new_string: "b" }),
        ...transcriptToolCall("toolu_23", "PowerShell", { command: "npm test", description: "Run tests" }),
      ];
      const result = JSON.parse(lintRows(rows, ["--json"]).stdout) as LintJsonResult;
      assert.equal(result.stats.verifyTools, 1);
      assert.deepEqual(lawsOf(result), []);
      assert.equal(lintRows(rows, ["--strict"]).status, 0);
    });

    it("in observations.jsonl, where the observer stores the PowerShell input as JSON", () => {
      const rows = [
        observation("Read", "/repo/src/fetch.ts"),
        observation("Edit", "/repo/src/fetch.ts"),
        observation("PowerShell", '{"command":"npm test","description":"Run tests"}', "ok"),
      ];
      const result = JSON.parse(lintRows(rows, ["--json"]).stdout) as LintJsonResult;
      assert.equal(result.stats.verifyTools, 1);
      assert.deepEqual(lawsOf(result), []);
      assert.equal(lintRows(rows, ["--strict"]).status, 0);
    });

    it("in observations.jsonl when the 500-character cut left the JSON unterminated", () => {
      const cut = `{"command":"npm test -- ${"--grep case ".repeat(60)}`.slice(0, 500);
      const rows = [
        observation("Read", "/repo/src/fetch.ts"),
        observation("Edit", "/repo/src/fetch.ts"),
        observation("PowerShell", cut, "ok"),
      ];
      const result = JSON.parse(lintRows(rows, ["--json"]).stdout) as LintJsonResult;
      assert.equal(result.stats.verifyTools, 1);
    });

    it("in a flat tool event", () => {
      const rows = [
        { tool: "Read", tool_input: { file_path: "/repo/src/fetch.ts" } },
        { tool: "Edit", tool_input: { file_path: "/repo/src/fetch.ts" } },
        { tool_name: "PowerShell", tool_input: { command: "npm run build" } },
      ];
      const result = JSON.parse(lintRows(rows, ["--json"]).stdout) as LintJsonResult;
      assert.equal(result.stats.verifyTools, 1);
      assert.deepEqual(lawsOf(result), []);
    });

    it("a PowerShell command that is not a test or build run is still not verification", () => {
      const rows = [
        ...transcriptToolCall("toolu_31", "Read", { file_path: "/repo/src/fetch.ts" }),
        ...transcriptToolCall("toolu_32", "Edit", { file_path: "/repo/src/fetch.ts", old_string: "a", new_string: "b" }),
        ...transcriptToolCall("toolu_33", "PowerShell", { command: "Get-ChildItem src" }),
      ];
      const result = JSON.parse(lintRows(rows, ["--json"]).stdout) as LintJsonResult;
      assert.equal(result.stats.verifyTools, 0);
      assert.deepEqual(lawsOf(result), [4]);
    });
  });

  // MultiEdit and NotebookEdit change files exactly as Edit does. Counting only
  // `Write` and `Edit` gave a session that used them the false clean result the
  // transcript reader was added to remove.
  describe("MultiEdit and NotebookEdit calls count as writes", () => {
    it("reports unresearched, unverified MultiEdit and NotebookEdit calls in a transcript", () => {
      const rows = [
        ...transcriptToolCall("toolu_41", "MultiEdit", {
          file_path: "/repo/src/a.ts",
          edits: [{ old_string: "a", new_string: "b" }],
        }),
        ...transcriptToolCall("toolu_42", "NotebookEdit", { notebook_path: "/repo/analysis.ipynb", new_source: "x = 1" }),
      ];
      const result = JSON.parse(lintRows(rows, ["--json"]).stdout) as LintJsonResult;
      assert.equal(result.stats.writeTools, 2);
      assert.deepEqual(lawsOf(result), [1, 1, 1, 4]);

      const strict = lintRows(rows, ["--strict"]);
      assert.doesNotMatch(strict.stdout, /No law violations/);
      assert.equal(strict.status, 1);
    });

    it("counts the notebook path as an edited file (Law 6 counts distinct files)", () => {
      const rows = [
        ...transcriptToolCall("toolu_50", "Read", { file_path: "/repo/README.md" }),
        ...transcriptToolCall("toolu_51", "Grep", { pattern: "cell" }),
        ...transcriptToolCall("toolu_52", "Glob", { pattern: "**/*.ipynb" }),
        ...Array.from({ length: 9 }, (_, index) => [
          ...transcriptToolCall(`toolu_6${index}`, "NotebookEdit", { notebook_path: `/repo/nb${index}.ipynb`, new_source: "x" }),
          ...(index % 3 === 2 ? transcriptToolCall(`toolu_7${index}`, "Bash", { command: "npm test" }) : []),
        ]).flat(),
      ];
      const result = JSON.parse(lintRows(rows, ["--json"]).stdout) as LintJsonResult;
      assert.deepEqual(lawsOf(result), [6]);
    });

    it("reports them in observations.jsonl and in flat tool events", () => {
      const observations = [
        // What the observer stores: the JSON head for MultiEdit, a path (or nothing) for NotebookEdit.
        observation("MultiEdit", '{"file_path":"/repo/src/a.ts","edits":[{"old_string":"a","new_string":"b"}]}'),
        observation("NotebookEdit", ""),
      ];
      const fromObservations = JSON.parse(lintRows(observations, ["--json"]).stdout) as LintJsonResult;
      assert.equal(fromObservations.stats.writeTools, 2);
      assert.deepEqual(lawsOf(fromObservations), [1, 1, 1, 4]);

      const flat = [
        { tool: "MultiEdit", tool_input: { file_path: "/repo/src/a.ts" } },
        { tool_name: "NotebookEdit", tool_input: { notebook_path: "/repo/analysis.ipynb" } },
      ];
      const fromFlat = JSON.parse(lintRows(flat, ["--json"]).stdout) as LintJsonResult;
      assert.equal(fromFlat.stats.writeTools, 2);
    });

    it("--help says that a file written through a shell command is not counted", () => {
      const output = execFileSync("node", [LINTER, "--help"], { encoding: "utf8" });
      assert.match(output, /Not counted as a write/);
      assert.match(output, /shell command/);
    });
  });

  // On a long or resumed session Claude Code writes earlier rows into the same
  // file again, so one call (same tool_use id) appears two to five times. Each
  // copy used to be counted: the two longest real transcripts reported 3,664
  // and 3,830 calls for 1,541 and 2,023 distinct ones.
  describe("a transcript row written into the file more than once", () => {
    const edit = (id: string, file: string): unknown[] =>
      transcriptToolCall(id, "Edit", { file_path: file, old_string: "a", new_string: "b" });

    it("counts a tool_use block once, however often its row is repeated", () => {
      const firstThreeEdits = [
        ...edit("toolu_e1", "/repo/src/a.ts"),
        ...edit("toolu_e2", "/repo/src/a.ts"),
        ...edit("toolu_e3", "/repo/src/a.ts"),
      ];
      const rows = [
        ...transcriptToolCall("toolu_g1", "Grep", { pattern: "retry" }),
        ...transcriptToolCall("toolu_r1", "Read", { file_path: "/repo/src/a.ts" }),
        ...firstThreeEdits,
        ...firstThreeEdits, // the same three rows, written a second time
        ...firstThreeEdits, // and a third
        ...edit("toolu_e4", "/repo/src/a.ts"),
        ...transcriptToolCall("toolu_t1", "Bash", { command: "npm test" }),
      ];
      const result = JSON.parse(lintRows(rows, ["--json"]).stdout) as LintJsonResult;
      assert.equal(result.stats.toolCalls, 7, "two lookups, four edits, one test run");
      assert.equal(result.stats.writeTools, 4);
      assert.deepEqual(lawsOf(result), [], "four edits in a row are not ten consecutive edits");
      assert.equal(lintRows(rows, ["--strict"]).status, 0);
    });

    it("still counts two calls that have the same input and different ids", () => {
      const rows = [
        ...transcriptToolCall("toolu_r1", "Read", { file_path: "/repo/src/a.ts" }),
        ...transcriptToolCall("toolu_r2", "Read", { file_path: "/repo/src/a.ts" }),
      ];
      const result = JSON.parse(lintRows(rows, ["--json"]).stdout) as LintJsonResult;
      assert.equal(result.stats.toolCalls, 2);
    });

    it("counts every tool_use block that carries no id", () => {
      const noId = { type: "assistant", sessionId: "sess-transcript", message: { role: "assistant", content: [{ type: "tool_use", name: "Read", input: { file_path: "/repo/src/a.ts" } }] } };
      const result = JSON.parse(lintRows([noId, noId], ["--json"]).stdout) as LintJsonResult;
      assert.equal(result.stats.toolCalls, 2);
    });
  });

  // A line can be valid JSON without being an object. Such a line is not a tool
  // call: `null` used to end the run with a TypeError and no report, and a
  // number, a string or an array was counted as a call.
  describe("a line that is JSON but not an object", () => {
    const READ = JSON.stringify({ tool: "Read", tool_input: { file_path: "/repo/src/a.ts" } });
    const EDIT = JSON.stringify({ tool: "Edit", tool_input: { file_path: "/repo/src/a.ts" } });

    it("skips a null line and still reports on the rows around it", () => {
      const { status, stdout, stderr } = lintLines([READ, "null", EDIT], ["--json"]);
      assert.equal(stderr, "");
      assert.equal(status, 0);
      const result = JSON.parse(stdout) as LintJsonResult;
      assert.equal(result.stats.toolCalls, 2);
      assert.equal(result.stats.researchTools, 1);
      assert.equal(result.stats.writeTools, 1);
    });

    it("does not count a number, a string or an array as a tool call", () => {
      const result = JSON.parse(lintLines(["42", '"hello"', "[1,2]", "true", READ], ["--json"]).stdout) as LintJsonResult;
      assert.equal(result.stats.totalEvents, 1);
      assert.equal(result.stats.toolCalls, 1);
    });

    it("reports no events for a file that holds only such lines", () => {
      const { status, stdout } = lintLines(["null", "42", "[]"]);
      assert.match(stdout, /No events found/);
      assert.equal(status, 0);
    });
  });

  // The npm installer wires the observer on PreToolUse and PostToolUse, so its
  // log holds two rows per tool call: tool_start, then tool_complete. The
  // plugin wires PostToolUse only. A row is a hook event, not a tool call, and
  // reading each row as a call counted every call of an npm install twice.
  describe("observations.jsonl rows written on both PreToolUse and PostToolUse", () => {
    /** One tool call as an npm-installed observer logs it: a start row, then a complete row. */
    function paired(tool: string, inputSummary: string): unknown[] {
      const complete = observation(tool, inputSummary, "ok") as Record<string, unknown>;
      return [{ ...complete, event: "tool_start", output_summary: "" }, complete];
    }

    const DISCIPLINED: ReadonlyArray<readonly [string, string]> = [
      ["Read", "/repo/src/fetch.ts"],
      ["Edit", "/repo/src/fetch.ts"],
      ["Edit", "/repo/src/fetch.ts"],
      ["Edit", "/repo/src/fetch.ts"],
      ["Bash", "npm test"],
    ];

    it("lints a paired log the same as the PostToolUse-only log of the same session", () => {
      const pairedRows = DISCIPLINED.flatMap(([tool, summary]) => paired(tool, summary));
      const postOnlyRows = DISCIPLINED.map(([tool, summary]) => observation(tool, summary, "ok"));
      const fromPaired = JSON.parse(lintRows(pairedRows, ["--json"]).stdout) as LintJsonResult;
      const fromPostOnly = JSON.parse(lintRows(postOnlyRows, ["--json"]).stdout) as LintJsonResult;

      assert.equal(fromPaired.stats.totalEvents, 5, "five tool calls, not ten hook events");
      assert.equal(fromPaired.stats.writeTools, 3);
      assert.equal(fromPaired.stats.verifyTools, 1);
      assert.deepEqual(lawsOf(fromPaired), []);
      assert.deepEqual(fromPaired, fromPostOnly);

      const strict = lintRows(pairedRows, ["--strict"]);
      assert.match(strict.stdout, /No law violations/);
      assert.equal(strict.status, 0, "three edits with research and a test run are not six consecutive edits");
    });

    it("pairs interleaved calls and repeated identical calls one to one", () => {
      const [readStart, readComplete] = paired("Read", "/repo/a.ts");
      const [grepStart, grepComplete] = paired("Grep", "retry");
      const rows = [
        readStart, grepStart, readComplete, grepComplete, // two calls in parallel
        ...paired("Edit", "/repo/a.ts"),
        ...paired("Edit", "/repo/a.ts"), // the same edit target twice is two calls
        ...paired("Bash", "npm test"),
      ];
      const result = JSON.parse(lintRows(rows, ["--json"]).stdout) as LintJsonResult;
      assert.equal(result.stats.totalEvents, 5);
      assert.equal(result.stats.researchTools, 2);
      assert.equal(result.stats.writeTools, 2);
    });

    it("keeps a start row that never completed (a failed or denied call)", () => {
      const [testStart] = paired("Bash", "npm test");
      const rows = [...paired("Read", "/repo/a.ts"), ...paired("Edit", "/repo/a.ts"), testStart];
      const result = JSON.parse(lintRows(rows, ["--json"]).stdout) as LintJsonResult;
      assert.equal(result.stats.totalEvents, 3);
      assert.equal(result.stats.verifyTools, 1, "a test run that exited non-zero has no PostToolUse row");
      assert.deepEqual(lawsOf(result), []);
    });

    it("does not pair rows of different sessions", () => {
      const [start, complete] = paired("Edit", "/repo/a.ts") as Array<Record<string, unknown>>;
      const rows = [{ ...start, session: "sess-a" }, { ...complete, session: "sess-b" }];
      const result = JSON.parse(lintRows(rows, ["--json"]).stdout) as LintJsonResult;
      assert.equal(result.stats.totalEvents, 2);
    });

    it("lints a log the real observer wrote for PreToolUse and PostToolUse", () => {
      const home = join(tmpdir(), `ci-lint-observer-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(home, { recursive: true });
      try {
        const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: join(home, "project") };
        const calls: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
          ["Read", { file_path: "/repo/src/fetch.ts" }],
          ["Edit", { file_path: "/repo/src/fetch.ts", old_string: "a", new_string: "b" }],
          ["Edit", { file_path: "/repo/src/fetch.ts", old_string: "b", new_string: "c" }],
          ["Edit", { file_path: "/repo/src/fetch.ts", old_string: "c", new_string: "d" }],
          ["Bash", { command: "npm test" }],
        ];
        for (const [toolName, toolInput] of calls) {
          for (const toolResponse of [undefined, { stdout: "ok" }]) {
            const run = spawnSync("node", [OBSERVER], {
              input: JSON.stringify({ session_id: "sess-real", tool_name: toolName, tool_input: toolInput, tool_response: toolResponse }),
              env,
              encoding: "utf8",
            });
            assert.equal(run.status, 0, run.stderr);
          }
        }
        const instincts = join(home, ".claude", "instincts");
        const projectDir = readdirSync(instincts).find((entry) => entry !== "global");
        assert.ok(projectDir, "the observer should have written a project bucket");
        const log = join(instincts, projectDir, "observations.jsonl");
        assert.equal(readFileSync(log, "utf8").trim().split("\n").length, 10, "two rows per call");

        const result = spawnSync("node", [LINTER, log, "--strict", "--json"], { encoding: "utf8" });
        const parsed = JSON.parse(result.stdout) as LintJsonResult;
        assert.equal(parsed.stats.totalEvents, 5);
        assert.deepEqual(lawsOf(parsed), []);
        assert.equal(result.status, 0);
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    });
  });
});
