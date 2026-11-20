import assert from "node:assert/strict";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { hashProjectRoot } from "../lib/gateguard-state.mjs";
import {
  PACKAGE_NAME,
  VERSION,
  getPluginHooksConfig,
  getClaudePluginManifest,
  getClaudePluginMarketplaceManifest,
  getClaudeRepoMarketplaceManifest,
  getPluginManifest,
  getToolNames,
} from "../lib/plugin-metadata.mjs";

interface JsonRpcResponse {
  error?: {
    code?: number;
    message?: string;
  };
  result?: any;
}

interface PendingResolver {
  reject: (error: Error) => void;
  resolve: (response: JsonRpcResponse) => void;
  timer: NodeJS.Timeout;
}

class McpTestClient {
  private buffer = Buffer.alloc(0);
  private proc: ChildProcessWithoutNullStreams;
  private resolvers: PendingResolver[] = [];

  constructor(proc: ChildProcessWithoutNullStreams) {
    this.proc = proc;

    proc.stdout.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain();
    });
  }

  private drain(): void {
    // MCP stdio transport spec: NDJSON. Each newline-terminated chunk is one
    // JSON-RPC message; partial lines stay in the buffer until a newline arrives.
    while (this.resolvers.length > 0) {
      const newlineIndex = this.buffer.indexOf(0x0a); // '\n'
      if (newlineIndex === -1) {
        break;
      }

      const lineBytes = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      const line = lineBytes.toString("utf8").replace(/\r$/, "");
      if (line.length === 0) {
        continue;
      }

      const next = this.resolvers.shift();
      if (!next) {
        break;
      }

      clearTimeout(next.timer);
      try {
        next.resolve(JSON.parse(line) as JsonRpcResponse);
      } catch (error) {
        next.resolve({
          error: {
            message: `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    }
  }

  send(message: Record<string, unknown>): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.resolvers.findIndex((resolver) => resolver.timer === timer);
        if (index !== -1) {
          this.resolvers.splice(index, 1);
        }
        reject(new Error(`Timeout waiting for response to ${String(message.method || message.id)}`));
      }, 8000);

      this.resolvers.push({ resolve, reject, timer });
      this.proc.stdin.write(`${JSON.stringify(message)}\n`);
      this.drain();
    });
  }

  destroy(): void {
    for (const resolver of this.resolvers) {
      clearTimeout(resolver.timer);
    }
    this.resolvers = [];
    this.proc.kill();
  }
}

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const MCP_SERVER = join(__dirname, "..", "bin", "mcp-server.mjs");

// Every file under `root`, as sorted forward-slash paths relative to it.
// Hand-rolled because readdirSync's `recursive` option is missing on early Node 18.
function listFilesUnder(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        files.push(relative(root, full).split(sep).join("/"));
      }
    }
  };
  walk(root);
  return files.sort();
}

describe("MCP server — stdio wire format", () => {
  // The MCP stdio transport spec requires newline-delimited JSON-RPC
  // (NDJSON) over stdout/stdin. NOT LSP-style Content-Length framing.
  // Claude Code, the @modelcontextprotocol/sdk reference clients, and every
  // other host parse stdout one line at a time and JSON.parse each line.
  // A server that emits "Content-Length: ...\r\n\r\n{...}" silently hangs
  // in the host's "Connecting…" state because no line ever resolves to JSON.
  it("emits NDJSON responses on stdout (not LSP Content-Length framing)", async () => {
    const tempHome = mkdtempSync(join(tmpdir(), "ci-mcp-wire-"));
    mkdirSync(join(tempHome, ".claude", "instincts", "global"), { recursive: true });

    const proc = spawn("node", [MCP_SERVER, "--mode", "beginner"], {
      env: { ...process.env, HOME: tempHome },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));

    proc.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`,
    );

    await new Promise((resolve) => setTimeout(resolve, 600));

    const stdoutText = Buffer.concat(stdoutChunks).toString("utf8");
    proc.kill();
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      rmSync(tempHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows stdio handle linger
    }

    assert.ok(
      !stdoutText.includes("Content-Length:"),
      `MCP stdio transport must NOT use LSP-style Content-Length framing. ` +
        `Saw "${stdoutText.slice(0, 80)}". This breaks every host parser, including Claude Code.`,
    );

    const firstLine = stdoutText.split("\n")[0];
    assert.ok(firstLine.length > 0, "Expected at least one line of output");
    const parsed = JSON.parse(firstLine);
    assert.equal(parsed.jsonrpc, "2.0");
    assert.equal(parsed.id, 1);
    assert.ok(parsed.result, "Initialize should return a result");
    assert.ok(
      stdoutText.startsWith(firstLine + "\n"),
      "Each NDJSON message must terminate with a newline",
    );
  });
});

describe("MCP server — beginner mode", () => {
  let client: McpTestClient;
  let tempHome = "";

  before(async () => {
    tempHome = mkdtempSync(join(tmpdir(), "ci-mcp-test-"));
    mkdirSync(join(tempHome, ".claude", "instincts", "global"), { recursive: true });

    const proc = spawn("node", [MCP_SERVER, "--mode", "beginner"], {
      env: { ...process.env, HOME: tempHome },
      stdio: ["pipe", "pipe", "pipe"],
    });
    client = new McpTestClient(proc);
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  after(async () => {
    client.destroy();
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      rmSync(tempHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows can briefly keep stdio handles open after the child exits.
    }
  });

  it("responds to initialize", async () => {
    const response = await client.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    assert.equal(response.result.serverInfo.name, PACKAGE_NAME);
    assert.equal(response.result.serverInfo.version, VERSION);
  });

  it("lists beginner tools only (4 tools)", async () => {
    const response = await client.send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const names = response.result.tools.map((tool: { name: string }) => tool.name);
    assert.deepEqual(names, getToolNames("beginner"));
    assert.ok(!names.includes("ci_reinforce"), "Should NOT include expert tools");
  });

  it("ci_gateguard_clear is available in beginner mode and clears the gate canonically", async () => {
    const list = await client.send({ jsonrpc: "2.0", id: 40, method: "tools/list", params: {} });
    const names = list.result.tools.map((tool: { name: string }) => tool.name);
    assert.ok(names.includes("ci_gateguard_clear"), "ci_gateguard_clear must be in beginner tools/list");

    const response = await client.send({
      jsonrpc: "2.0",
      id: 41,
      method: "tools/call",
      params: { name: "ci_gateguard_clear", arguments: { file_paths: ["D:\\proj\\x.ts"] } },
    });
    assert.ok(!response.result.isError, "ci_gateguard_clear should succeed");
    assert.match(response.result.content[0].text, /d:\/proj\/x\.ts/, "reports the canonical cleared key");
  });

  it("ci_gateguard_clear requires at least one path", async () => {
    const response = await client.send({
      jsonrpc: "2.0",
      id: 42,
      method: "tools/call",
      params: { name: "ci_gateguard_clear", arguments: {} },
    });
    assert.ok(response.result.isError, "empty clear request must error");
    assert.match(response.result.content[0].text, /file_paths/);
  });

  it("ci_gateguard_clear honors an in-root state_path and writes to that exact dir (session-scoped routing)", async () => {
    // Inside the instincts root (HOME=tempHome for the server), mirroring the
    // session-scoped path the hook prints. saveState mkdir's it recursively.
    const statePath = join(tempHome, ".claude", "instincts", "scoped-test", "sessions", "sess-statepath", "gateguard-session.json");
    const response = await client.send({
      jsonrpc: "2.0",
      id: 43,
      method: "tools/call",
      params: {
        name: "ci_gateguard_clear",
        arguments: { file_paths: ["D:\\proj\\z.ts"], state_path: statePath },
      },
    });
    assert.ok(!response.result.isError, "clear with an in-root state_path should succeed");
    assert.match(response.result.content[0].text, /gateguard-session\.json/);
    // The marker must land at the supplied state_path, not the default session
    // dir — this is what keeps the MCP clear route session-correct once the hook
    // is session-scoped.
    assert.ok(existsSync(statePath), "state file written at the supplied state_path");
    const state = JSON.parse(readFileSync(statePath, "utf8")) as {
      cleared_files?: Record<string, unknown>;
    };
    assert.ok(state.cleared_files && "d:/proj/z.ts" in state.cleared_files, "canonical key recorded at state_path");
  });

  it("ci_gateguard_clear rejects a state_path that resolves outside the instincts root (no arbitrary write)", async () => {
    // A traversal/arbitrary path outside ~/.claude/instincts must be refused so
    // the clear can't be turned into an arbitrary-write primitive.
    const evil = join(tmpdir(), "ci-gg-evil", "gateguard-session.json");
    const response = await client.send({
      jsonrpc: "2.0",
      id: 44,
      method: "tools/call",
      params: {
        name: "ci_gateguard_clear",
        arguments: { file_paths: ["D:\\proj\\z.ts"], state_path: evil },
      },
    });
    assert.ok(response.result.isError, "a state_path outside ~/.claude/instincts must be rejected");
    assert.match(response.result.content[0].text, /instincts/);
    assert.ok(!existsSync(evil), "must not write the state file outside the instincts root");
  });

  it("ci_status returns project info", async () => {
    const response = await client.send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "ci_status", arguments: {} },
    });
    const text = response.result.content[0].text;
    assert.match(text, /Level:/, "Should include level");
    assert.match(text, /Observations:/, "Should include observation count");
    assert.match(text, /beginner/, "Should show beginner mode");
  });

  it("ci_instincts returns empty message when no instincts", async () => {
    const response = await client.send({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "ci_instincts", arguments: {} },
    });
    assert.match(response.result.content[0].text, /No instincts found/i);
  });

  it("ci_reflect returns reflection template", async () => {
    const response = await client.send({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "ci_reflect", arguments: { summary: "Fixed a login bug" } },
    });
    const text = response.result.content[0].text;
    assert.match(text, /Fixed a login bug/);
    assert.match(text, /What worked/);
    assert.match(text, /What failed/);
  });

  it("rejects expert tools in beginner mode", async () => {
    const response = await client.send({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "ci_reinforce", arguments: { instinct_id: "test", accepted: true } },
    });
    assert.ok(response.result.isError, "Should return error for expert tool in beginner mode");
  });

  it("lists resources", async () => {
    const response = await client.send({ jsonrpc: "2.0", id: 7, method: "resources/list", params: {} });
    assert.ok(response.result.resources.length >= 1, "Should list at least 1 resource");
    const uris = response.result.resources.map((resource: { uri: string }) => resource.uri);
    assert.ok(uris.some((uri: string) => uri.includes("instincts://")));
  });
});

describe("MCP server — new feature tool handlers (expert)", () => {
  let client: McpTestClient;
  let tempHome = "";
  let tempWorkspace = "";

  before(async () => {
    tempHome = mkdtempSync(join(tmpdir(), "ci-mcp-newtools-"));
    mkdirSync(join(tempHome, ".claude", "instincts", "global"), { recursive: true });
    tempWorkspace = join(tempHome, "workspace");
    mkdirSync(tempWorkspace, { recursive: true });

    const proc = spawn("node", [MCP_SERVER, "--mode", "expert"], {
      env: { ...process.env, HOME: tempHome },
      cwd: tempWorkspace,
      stdio: ["pipe", "pipe", "pipe"],
    });
    client = new McpTestClient(proc);
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  after(async () => {
    client.destroy();
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      rmSync(tempHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows can briefly keep stdio handles open after the child exits.
    }
  });

  // audit #12 — ci_recall must fail fast on an unparseable since instead of
  // silently dropping the filter and returning the full unfiltered history.
  it("ci_recall rejects an unparseable since (audit #12)", async () => {
    const r = await client.send({
      jsonrpc: "2.0",
      id: 60,
      method: "tools/call",
      params: { name: "ci_recall", arguments: { query: "build push", since: "last week" } },
    });
    assert.ok(r.result.isError, "an unparseable since must return an error envelope");
    assert.match(r.result.content[0].text, /since/i);
  });

  it("ci_recall still requires a query", async () => {
    const r = await client.send({
      jsonrpc: "2.0",
      id: 61,
      method: "tools/call",
      params: { name: "ci_recall", arguments: {} },
    });
    assert.ok(r.result.isError);
    assert.match(r.result.content[0].text, /query is required/);
  });

  // audit #7 — ci_distill_promote must reject a path-traversal id before it is
  // joined into a filesystem path (an arbitrary read + rmSync delete primitive).
  it("ci_distill_promote rejects a path-traversal id (audit #7)", async () => {
    const r = await client.send({
      jsonrpc: "2.0",
      id: 62,
      method: "tools/call",
      params: { name: "ci_distill_promote", arguments: { id: "../../../../etc/passwd" } },
    });
    assert.ok(r.result.isError, "a traversal id must be rejected, not joined into a path");
    assert.doesNotMatch(
      r.result.content[0].text,
      /No draft at/,
      "must reject the id before the existsSync path probe",
    );
  });

  it("ci_distill_propose requires an id", async () => {
    const r = await client.send({
      jsonrpc: "2.0",
      id: 63,
      method: "tools/call",
      params: { name: "ci_distill_propose", arguments: {} },
    });
    assert.ok(r.result.isError);
    assert.match(r.result.content[0].text, /id is required/);
  });

  it("ci_distill_candidates returns the empty-state message on a fresh workspace", async () => {
    const r = await client.send({
      jsonrpc: "2.0",
      id: 64,
      method: "tools/call",
      params: { name: "ci_distill_candidates", arguments: {} },
    });
    assert.ok(!r.result.isError);
    assert.match(r.result.content[0].text, /No distillation candidates/);
  });

  it("ci_goal_check reports no goal source on a fresh workspace", async () => {
    const r = await client.send({
      jsonrpc: "2.0",
      id: 65,
      method: "tools/call",
      params: { name: "ci_goal_check", arguments: {} },
    });
    assert.ok(!r.result.isError);
    assert.match(r.result.content[0].text, /No goal source found/);
  });
});

describe("MCP server — expert mode", () => {
  let client: McpTestClient;
  let tempHome = "";
  let tempWorkspace = "";

  before(async () => {
    tempHome = mkdtempSync(join(tmpdir(), "ci-mcp-expert-"));
    mkdirSync(join(tempHome, ".claude", "instincts", "global"), { recursive: true });
    tempWorkspace = join(tempHome, "workspace");
    mkdirSync(tempWorkspace, { recursive: true });

    const proc = spawn("node", [MCP_SERVER, "--mode", "expert"], {
      env: { ...process.env, HOME: tempHome },
      cwd: tempWorkspace,
      stdio: ["pipe", "pipe", "pipe"],
    });
    client = new McpTestClient(proc);
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  after(async () => {
    client.destroy();
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      rmSync(tempHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows can briefly keep stdio handles open after the child exits.
    }
  });

  it("lists all expert tools (19) in expert mode", async () => {
    await client.send({ jsonrpc: "2.0", id: 10, method: "initialize", params: {} });
    const response = await client.send({ jsonrpc: "2.0", id: 11, method: "tools/list", params: {} });
    const names = response.result.tools.map((tool: { name: string }) => tool.name);
    assert.deepEqual(
      names,
      getToolNames("expert"),
      `Expected synced expert tool list, got: ${names.join(", ")}`,
    );
  });

  it("ci_export returns JSON array", async () => {
    const response = await client.send({
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: { name: "ci_export", arguments: { scope: "all" } },
    });
    const parsed = JSON.parse(response.result.content[0].text) as unknown[];
    assert.ok(Array.isArray(parsed), "Export should return JSON array");
  });

  it("ci_create_instinct creates a new instinct", async () => {
    const response = await client.send({
      jsonrpc: "2.0",
      id: 13,
      method: "tools/call",
      params: {
        name: "ci_create_instinct",
        arguments: {
          id: "new-test-instinct",
          trigger: "when writing code",
          body: "Write tests first",
          confidence: 0.7,
        },
      },
    });
    const text = response.result.content[0].text;
    assert.match(text, /Created instinct/);
    assert.match(text, /new-test-instinct/);
  });

  it("ci_import imports and reports count", async () => {
    const importData = JSON.stringify([
      { id: "imported-unique-1", trigger: "when deploying", body: "Check CI first", confidence: 0.5 },
      { id: "imported-unique-2", trigger: "when reviewing", body: "Check coverage", confidence: 0.5 },
    ]);

    const response = await client.send({
      jsonrpc: "2.0",
      id: 14,
      method: "tools/call",
      params: { name: "ci_import", arguments: { instincts_json: importData } },
    });
    assert.match(response.result.content[0].text, /Imported \d+/);
  });

  it("ci_plan_init creates planning files in the workspace root", async () => {
    const response = await client.send({
      jsonrpc: "2.0",
      id: 15,
      method: "tools/call",
      params: {
        name: "ci_plan_init",
        arguments: { goal: "Ship the planning workflow" },
      },
    });
    assert.match(response.result.content[0].text, /Planning-With-Files Initialized/);
    assert.ok(existsSync(join(tempWorkspace, "task_plan.md")));
    assert.ok(existsSync(join(tempWorkspace, "findings.md")));
    assert.ok(existsSync(join(tempWorkspace, "progress.md")));

    const taskPlan = readFileSync(join(tempWorkspace, "task_plan.md"), "utf8");
    assert.match(taskPlan, /Ship the planning workflow/);
    assert.match(taskPlan, /- \[ \] Research/);
  });

  it("ci_plan_init preserves existing files when force is false", async () => {
    const taskPlanPath = join(tempWorkspace, "task_plan.md");
    writeFileSync(taskPlanPath, "# Task Plan\n\n## Status\nCustom status\n");

    await client.send({
      jsonrpc: "2.0",
      id: 16,
      method: "tools/call",
      params: {
        name: "ci_plan_init",
        arguments: { goal: "Should not overwrite existing plan" },
      },
    });

    assert.equal(readFileSync(taskPlanPath, "utf8"), "# Task Plan\n\n## Status\nCustom status\n");
  });

  it("ci_plan_status summarizes checked phases and can include file contents", async () => {
    writeFileSync(
      join(tempWorkspace, "task_plan.md"),
      [
        "# Task Plan",
        "",
        "## Goal",
        "Ship the planning workflow",
        "",
        "## Status",
        "In progress",
        "",
        "## Phases",
        "- [x] Research",
        "- [ ] Plan",
        "- [ ] Execute",
      ].join("\n") + "\n"
    );
    writeFileSync(join(tempWorkspace, "findings.md"), "# Findings\n\n- Found the MCP integration points.\n");
    writeFileSync(join(tempWorkspace, "progress.md"), "# Progress\n\n- Ran initialization.\n");

    const response = await client.send({
      jsonrpc: "2.0",
      id: 17,
      method: "tools/call",
      params: {
        name: "ci_plan_status",
        arguments: { include_contents: true },
      },
    });
    const text = response.result.content[0].text;
    assert.match(text, /\*\*Status:\*\* In progress/);
    assert.match(text, /Checked phases:\*\* Research/);
    assert.match(text, /Remaining phases:\*\* Plan, Execute/);
    assert.match(text, /findings\.md: present \(has notes\)/);
    assert.match(text, /## task_plan\.md/);
    assert.match(text, /# Task Plan/);
  });

  it("ci_goal_check rejects an out-of-range limit through tools/call (item 3 boundary)", async () => {
    // The in-handler guard is the actual safety gate (it shields both
    // getRecentObservations and scoreObservations). It fires before goal-source
    // resolution, so a bad limit errors even with a task_plan.md present.
    for (const [callId, bad] of [[80, 0], [81, -5], [82, 2.5]] as const) {
      const response = await client.send({
        jsonrpc: "2.0",
        id: callId,
        method: "tools/call",
        params: { name: "ci_goal_check", arguments: { limit: bad } },
      });
      assert.ok(response.result.isError, `limit=${bad} must be rejected with isError`);
      assert.match(
        response.result.content[0].text,
        /limit must be a positive integer/,
        `limit=${bad} must return the positive-integer guard message`,
      );
    }
  });

  it("returns error for unknown method", async () => {
    const response = await client.send({ jsonrpc: "2.0", id: 18, method: "nonexistent/method", params: {} });
    assert.ok(response.error, "Should return error for unknown method");
    assert.equal(response.error?.code, -32601);
  });
});

// An instinct id becomes a file name (`<instincts dir>/<id>.yaml`). It is
// model-controlled through ci_create_instinct and ci_import, and read back from
// disk by ci_reinforce and ci_distill_promote, so an unvalidated `../../../x`
// wrote a .yaml file anywhere the process could reach. HOME is a fresh temp dir
// and the traversal ids below climb exactly to it, so an escape stays inside the
// sandbox and shows up as a new file outside .claude/instincts/.
describe("MCP server — an instinct id cannot leave the instincts dir (expert)", () => {
  let client: McpTestClient;
  let tempHome = "";
  let projectDir = "";
  let projectRel = "";
  let nextId = 200;

  const call = (name: string, args: Record<string, unknown>): Promise<JsonRpcResponse> =>
    client.send({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } });

  // Runs one tool call and reports every file it created anywhere under HOME.
  const createdBy = async (
    run: () => Promise<JsonRpcResponse>,
  ): Promise<{ created: string[]; response: JsonRpcResponse }> => {
    const before = new Set(listFilesUnder(tempHome));
    const response = await run();
    const created = listFilesUnder(tempHome).filter((file) => !before.has(file));
    return { created, response };
  };

  before(async () => {
    tempHome = mkdtempSync(join(tmpdir(), "ci-mcp-instinct-id-"));
    mkdirSync(join(tempHome, ".claude", "instincts", "global"), { recursive: true });
    const tempWorkspace = join(tempHome, "workspace");
    mkdirSync(tempWorkspace, { recursive: true });
    // CLAUDE_PROJECT_DIR pins the project hash, so the project instincts dir is
    // known up front instead of depending on whether tmpdir sits in a git repo.
    const projectHash = hashProjectRoot(tempWorkspace);
    projectRel = `.claude/instincts/${projectHash}`;
    projectDir = join(tempHome, ".claude", "instincts", projectHash);

    const proc = spawn("node", [MCP_SERVER, "--mode", "expert"], {
      env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome, CLAUDE_PROJECT_DIR: tempWorkspace },
      cwd: tempWorkspace,
      stdio: ["pipe", "pipe", "pipe"],
    });
    client = new McpTestClient(proc);
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  after(async () => {
    client.destroy();
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      rmSync(tempHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows can briefly keep stdio handles open after the child exits.
    }
  });

  it("ci_create_instinct rejects a path-traversal id and writes nothing", async () => {
    const { created, response } = await createdBy(() =>
      call("ci_create_instinct", { id: "../../../ESCAPED-CREATE", trigger: "when escaping", body: "escape" }),
    );
    assert.deepEqual(created, [], "a traversal id must not create a file, least of all outside the instincts dir");
    assert.ok(response.result.isError, "a traversal id must return a tool error");
    assert.match(response.result.content[0].text, /Invalid instinct id/);
  });

  // Backslash is a path separator on Windows only, a bare separator never
  // escapes but used to throw inside the handler (no response at all), and a
  // missing id used to write a file named ".yaml".
  for (const id of ["..\\..\\..\\ESCAPED-BACKSLASH", "nested/child", ""]) {
    it(`ci_create_instinct rejects the id ${JSON.stringify(id)} and writes nothing`, async () => {
      const { created, response } = await createdBy(() =>
        call("ci_create_instinct", { id, trigger: "when escaping", body: "escape" }),
      );
      assert.deepEqual(created, [], `id ${JSON.stringify(id)} must not create a file`);
      assert.ok(response.result.isError, `id ${JSON.stringify(id)} must return a tool error`);
      assert.match(response.result.content[0].text, /Invalid instinct id/);
    });
  }

  it("ci_import reports a path-traversal entry as rejected and still imports the valid ones", async () => {
    const payload = JSON.stringify([
      { id: "import-safe-one", trigger: "when deploying", body: "Check CI first" },
      { id: "../../../ESCAPED-IMPORT", trigger: "when escaping", body: "escape" },
      { id: "import-safe-two", trigger: "when reviewing", body: "Check coverage" },
    ]);
    const { created, response } = await createdBy(() => call("ci_import", { instincts_json: payload }));
    assert.deepEqual(
      created,
      [`${projectRel}/import-safe-one.yaml`, `${projectRel}/import-safe-two.yaml`],
      "only the two valid entries may be written, both inside the project instincts dir",
    );
    const text = response.result.content[0].text;
    assert.match(text, /Imported 2 instincts \(0 skipped as duplicates\)/);
    assert.match(text, /Rejected 1/);
    assert.ok(text.includes("../../../ESCAPED-IMPORT"), "the rejected entry must be named in the report");
    assert.ok(response.result.isError, "a rejected entry must flag the result as an error");
  });

  it("ci_reinforce refuses to rewrite an on-disk instinct whose id is a path traversal", async () => {
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, "planted-reinforce.yaml"),
      ["id: ../../../ESCAPED-REINFORCE", 'trigger: "when escaping"', "confidence: 0.5", "scope: project", "---", "escape", ""].join("\n"),
    );
    const { created, response } = await createdBy(() =>
      call("ci_reinforce", { instinct_id: "../../../ESCAPED-REINFORCE", accepted: true }),
    );
    assert.deepEqual(created, [], "an on-disk traversal id must not be written back outside the instincts dir");
    assert.ok(response.result.isError, "the refused update must return a tool error");
    assert.match(response.result.content[0].text, /Invalid instinct id/);
  });

  it("ci_distill_promote refuses a draft whose id line is a path traversal and keeps the draft", async () => {
    const draftsDir = join(projectDir, "drafts");
    mkdirSync(draftsDir, { recursive: true });
    const draftPath = join(draftsDir, "draft-edited-id.yaml");
    writeFileSync(
      draftPath,
      ["id: ../../../ESCAPED-PROMOTE", 'trigger: "when escaping"', "confidence: 0.3", "---", "escape", ""].join("\n"),
    );
    const { created, response } = await createdBy(() => call("ci_distill_promote", { id: "draft-edited-id" }));
    assert.deepEqual(created, [], "a traversal id inside a draft must not be promoted outside the instincts dir");
    assert.ok(response.result.isError, "the refused promotion must return a tool error");
    assert.match(response.result.content[0].text, /Invalid instinct id/);
    assert.ok(existsSync(draftPath), "a refused promotion must not consume the draft");
  });

  // The accepted shape must not reject a real id. The longest id the plugin
  // generates itself is draft-workflow-<120-char slug> (src/lib/skill-distill.mts).
  it("a valid id is written as a direct child of the instincts dir, project and global", async () => {
    const longestGenerated = `draft-workflow-${"a".repeat(120)}`;
    const project = await createdBy(() =>
      call("ci_create_instinct", { id: longestGenerated, trigger: "when promoting", body: "keep the name" }),
    );
    assert.ok(!project.response.result.isError, project.response.result.content[0].text);
    assert.deepEqual(project.created, [`${projectRel}/${longestGenerated}.yaml`]);

    const global = await createdBy(() =>
      call("ci_create_instinct", { id: "prefer-grep-before-edit", trigger: "when modifying code", body: "Grep first", scope: "global" }),
    );
    assert.ok(!global.response.result.isError, global.response.result.content[0].text);
    assert.deepEqual(global.created, [".claude/instincts/global/prefer-grep-before-edit.yaml"]);
  });

  it("ci_load_pack still loads every id in every shipped starter pack", async () => {
    const packsDir = join(__dirname, "..", "instinct-packs");
    const packFiles = readdirSync(packsDir).filter((name) => name.endsWith(".json")).sort();
    assert.ok(packFiles.length > 0, "expected at least one shipped starter pack");
    for (const file of packFiles) {
      const pack = file.replace(/\.json$/, "");
      const ids = (JSON.parse(readFileSync(join(packsDir, file), "utf8")) as Array<{ id: string }>).map((entry) => entry.id);
      const { created, response } = await createdBy(() => call("ci_load_pack", { pack }));
      assert.ok(!response.result.isError, response.result.content[0].text);
      assert.deepEqual(
        created,
        ids.map((id) => `${projectRel}/${id}.yaml`).sort(),
        `every id in the ${pack} pack must be written inside the project instincts dir`,
      );
    }
  });

  // Regression: the first id rule was kebab-case only, which is narrower than
  // path safety needs. Instinct YAML is also written by hand during reflection,
  // so ids with an underscore, a capital or a dot exist on disk. They name a
  // direct child of the instincts dir, and the kebab rule locked them out of
  // ci_reinforce, ci_import and ci_distill_promote.
  const SAFE_NON_KEBAB_IDS = ["use_snake_case", "React-Hooks-Deps", "tdd.red-first"];

  for (const id of SAFE_NON_KEBAB_IDS) {
    it(`ci_reinforce updates the on-disk instinct ${id} in place`, async () => {
      mkdirSync(projectDir, { recursive: true });
      const filePath = join(projectDir, `${id}.yaml`);
      writeFileSync(
        filePath,
        [`id: ${id}`, 'trigger: "when writing code"', "confidence: 0.5", "scope: project", "---", "Keep the convention", ""].join("\n"),
      );
      const { created, response } = await createdBy(() => call("ci_reinforce", { instinct_id: id, accepted: true }));
      assert.ok(!response.result.isError, response.result.content[0].text);
      assert.match(response.result.content[0].text, /confidence now 0\.65/);
      assert.deepEqual(created, [], "the instinct must be rewritten in place, not duplicated under another name");
      assert.match(readFileSync(filePath, "utf8"), /^confidence: 0\.65$/m);
    });
  }

  it("ci_import keeps path-safe ids that are not kebab-case", async () => {
    const ids = ["Import_Snake", "Import-Caps", "import.dotted"];
    const payload = JSON.stringify(ids.map((id) => ({ id, trigger: "when importing", body: "Keep it" })));
    const { created, response } = await createdBy(() => call("ci_import", { instincts_json: payload }));
    assert.ok(!response.result.isError, response.result.content[0].text);
    assert.match(response.result.content[0].text, /Imported 3 instincts \(0 skipped as duplicates\)/);
    assert.deepEqual(created, ids.map((id) => `${projectRel}/${id}.yaml`).sort());
  });

  it("ci_distill_promote promotes a draft whose id line is path-safe but not kebab-case", async () => {
    const draftsDir = join(projectDir, "drafts");
    mkdirSync(draftsDir, { recursive: true });
    const draftPath = join(draftsDir, "draft-renamed-recipe.yaml");
    writeFileSync(
      draftPath,
      ["id: my_renamed_recipe", 'trigger: "when repeating the recipe"', "confidence: 0.3", "---", "Run the recipe", ""].join("\n"),
    );
    const { created, response } = await createdBy(() => call("ci_distill_promote", { id: "draft-renamed-recipe" }));
    assert.ok(!response.result.isError, response.result.content[0].text);
    assert.deepEqual(created, [`${projectRel}/my_renamed_recipe.yaml`]);
    assert.equal(existsSync(draftPath), false, "a promoted draft is consumed");
  });

  // Dots are allowed inside an id, never as the first character, so "." and ".."
  // and dot-files stay out. A colon would open an NTFS alternate data stream.
  for (const id of [".", "..", ".hidden", "a/../b", "stream:alt", "tab\tid", "space id"]) {
    it(`ci_create_instinct still rejects the id ${JSON.stringify(id)}`, async () => {
      const { created, response } = await createdBy(() =>
        call("ci_create_instinct", { id, trigger: "when escaping", body: "escape" }),
      );
      assert.deepEqual(created, [], `id ${JSON.stringify(id)} must not create a file`);
      assert.ok(response.result.isError, `id ${JSON.stringify(id)} must return a tool error`);
      assert.match(response.result.content[0].text, /Invalid instinct id/);
    });
  }

  // ci_reinforce rewrites <id>.yaml. Correcting only the id: line of a refused
  // instinct would leave the old file beside the new one, both with the same id.
  it("the ci_reinforce refusal tells the user to rename the file with the id", async () => {
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, "planted-hint.yaml"),
      ["id: ../../../ESCAPED-HINT", 'trigger: "when escaping"', "confidence: 0.5", "scope: project", "---", "escape", ""].join("\n"),
    );
    const { created, response } = await createdBy(() =>
      call("ci_reinforce", { instinct_id: "../../../ESCAPED-HINT", accepted: true }),
    );
    assert.deepEqual(created, []);
    assert.ok(response.result.isError);
    assert.match(response.result.content[0].text, /rename the file to <new id>\.yaml/);
  });

  // A file name has a 255-byte limit on NTFS, ext4 and APFS, so an id of 251+
  // characters made writeFileSync throw ENAMETOOLONG inside the tool handler and
  // the tool call got no response at all. The cap is 160 characters: the longest
  // id the plugin itself writes is draft-workflow-<120-char slug> (135), and 160
  // keeps <home>/.claude/instincts/<hash>/drafts/<id>.yaml under the 260-character
  // Windows path limit for an ordinary user profile.
  const TOO_LONG_ID = "a".repeat(300);

  it("ci_create_instinct rejects a 300-character id, names the limit and writes nothing", async () => {
    const { created, response } = await createdBy(() =>
      call("ci_create_instinct", { id: TOO_LONG_ID, trigger: "when naming", body: "keep it short" }),
    );
    assert.deepEqual(created, [], "an over-long id must not create a file");
    assert.ok(response.result.isError, "an over-long id must return a tool error");
    assert.match(response.result.content[0].text, /Invalid instinct id/);
    assert.match(response.result.content[0].text, /at most 160 characters/);
  });

  it("ci_create_instinct accepts an id of exactly 160 characters", async () => {
    const id = `b${"c".repeat(159)}`;
    const { created, response } = await createdBy(() =>
      call("ci_create_instinct", { id, trigger: "when naming", body: "the limit itself is allowed" }),
    );
    assert.ok(!response.result.isError, response.result.content[0].text);
    assert.deepEqual(created, [`${projectRel}/${id}.yaml`]);
  });

  it("ci_import imports the valid entries around a 300-character id and reports the rejected one", async () => {
    const payload = JSON.stringify([
      { id: "long-import-before", trigger: "when importing", body: "first" },
      { id: TOO_LONG_ID, trigger: "when importing", body: "too long" },
      { id: "long-import-after", trigger: "when importing", body: "last" },
    ]);
    const { created, response } = await createdBy(() => call("ci_import", { instincts_json: payload }));
    assert.deepEqual(created, [`${projectRel}/long-import-after.yaml`, `${projectRel}/long-import-before.yaml`]);
    const text = response.result.content[0].text;
    assert.ok(response.result.isError, "a rejected entry must flag the result as an error");
    assert.match(text, /Imported 2 instincts \(0 skipped as duplicates\)/);
    assert.match(text, /Rejected 1/);
    assert.ok(text.includes(TOO_LONG_ID), "the rejected entry must be named in the report");
    assert.match(text, /at most 160 characters/);
  });

  it("ci_reinforce refuses an on-disk instinct whose id line is 300 characters", async () => {
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, "planted-long.yaml"),
      [`id: ${TOO_LONG_ID}`, 'trigger: "when naming"', "confidence: 0.5", "scope: project", "---", "too long", ""].join("\n"),
    );
    const { created, response } = await createdBy(() =>
      call("ci_reinforce", { instinct_id: TOO_LONG_ID, accepted: true }),
    );
    assert.deepEqual(created, []);
    assert.ok(response.result.isError, "the refused update must return a tool error");
    assert.match(response.result.content[0].text, /at most 160 characters/);
  });

  it("ci_distill_promote refuses a draft whose id line is 300 characters and keeps the draft", async () => {
    const draftsDir = join(projectDir, "drafts");
    mkdirSync(draftsDir, { recursive: true });
    const draftPath = join(draftsDir, "draft-long-id-line.yaml");
    writeFileSync(
      draftPath,
      [`id: ${TOO_LONG_ID}`, 'trigger: "when naming"', "confidence: 0.3", "---", "too long", ""].join("\n"),
    );
    const { created, response } = await createdBy(() => call("ci_distill_promote", { id: "draft-long-id-line" }));
    assert.deepEqual(created, []);
    assert.ok(response.result.isError, "the refused promotion must return a tool error");
    assert.match(response.result.content[0].text, /at most 160 characters/);
    assert.ok(existsSync(draftPath), "a refused promotion must not consume the draft");
  });

  for (const tool of ["ci_distill_propose", "ci_distill_promote"]) {
    it(`${tool} rejects a 300-character draft id and names the limit`, async () => {
      const { created, response } = await createdBy(() => call(tool, { id: `draft-${TOO_LONG_ID}` }));
      assert.deepEqual(created, []);
      assert.ok(response.result.isError, "an over-long draft id must return a tool error");
      assert.match(response.result.content[0].text, /Invalid draft id/);
      assert.match(response.result.content[0].text, /at most 160 characters/);
    });
  }
});

describe("Plugin configs", () => {
  it("beginner.json matches the shared plugin manifest", () => {
    const config = JSON.parse(
      readFileSync(join(__dirname, "..", "plugins", "beginner.json"), "utf8"),
    ) as ReturnType<typeof getPluginManifest>;
    assert.deepEqual(config, getPluginManifest("beginner"));
  });

  it("expert.json matches the shared plugin manifest", () => {
    const config = JSON.parse(
      readFileSync(join(__dirname, "..", "plugins", "expert.json"), "utf8"),
    ) as ReturnType<typeof getPluginManifest>;
    assert.deepEqual(config, getPluginManifest("expert"));
  });

  it("claude plugin manifest matches the shared plugin metadata", () => {
    const config = JSON.parse(
      readFileSync(
        join(__dirname, "..", "plugins", PACKAGE_NAME, ".claude-plugin", "plugin.json"),
        "utf8",
      ),
    ) as ReturnType<typeof getClaudePluginManifest>;
    assert.deepEqual(config, getClaudePluginManifest());
  });

  it("claude plugin marketplace manifest matches the shared plugin metadata", () => {
    const config = JSON.parse(
      readFileSync(
        join(__dirname, "..", "plugins", PACKAGE_NAME, ".claude-plugin", "marketplace.json"),
        "utf8",
      ),
    ) as ReturnType<typeof getClaudePluginMarketplaceManifest>;
    assert.deepEqual(config, getClaudePluginMarketplaceManifest());
  });

  it("repo-level claude marketplace manifest matches the shared plugin metadata", () => {
    const config = JSON.parse(
      readFileSync(
        join(__dirname, "..", ".claude-plugin", "marketplace.json"),
        "utf8",
      ),
    ) as ReturnType<typeof getClaudeRepoMarketplaceManifest>;
    // PM plugins were removed from the repo-level marketplace as part of the
    // 7 Laws focus pass. Generator passes [] to getClaudeRepoMarketplaceManifest;
    // this assertion mirrors that exact call shape.
    assert.deepEqual(
      config,
      getClaudeRepoMarketplaceManifest([]),
    );
  });

  it("plugin hooks config matches the shared plugin metadata", () => {
    const config = JSON.parse(
      readFileSync(
        join(__dirname, "..", "plugins", PACKAGE_NAME, "hooks", "hooks.json"),
        "utf8",
      ),
    ) as ReturnType<typeof getPluginHooksConfig>;
    assert.deepEqual(config, getPluginHooksConfig());
  });

  it("bundles the core skill into the plugin package", () => {
    const source = readFileSync(join(__dirname, "..", "SKILL.md"), "utf8");
    const bundled = readFileSync(
      join(__dirname, "..", "plugins", PACKAGE_NAME, "skills", PACKAGE_NAME, "SKILL.md"),
      "utf8",
    );
    assert.equal(bundled, source);
  });
});
