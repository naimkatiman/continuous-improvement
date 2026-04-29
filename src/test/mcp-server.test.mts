import assert from "node:assert/strict";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

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
    while (this.resolvers.length > 0) {
      const bufferString = this.buffer.toString("utf8");
      const headerMatch = bufferString.match(/^Content-Length: (\d+)\r\n\r\n/);
      if (!headerMatch) {
        break;
      }

      const headerLength = headerMatch[0].length;
      const bodyLength = Number.parseInt(headerMatch[1], 10);
      if (this.buffer.length < headerLength + bodyLength) {
        break;
      }

      const bodyString = this.buffer.slice(headerLength, headerLength + bodyLength).toString("utf8");
      this.buffer = this.buffer.slice(headerLength + bodyLength);

      const next = this.resolvers.shift();
      if (!next) {
        break;
      }

      clearTimeout(next.timer);
      try {
        next.resolve(JSON.parse(bodyString) as JsonRpcResponse);
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

describe("MCP server — beginner mode", () => {
  let client: McpTestClient;
  let tempHome = "";

  before(async () => {
    tempHome = join(tmpdir(), `ci-mcp-test-${Date.now()}`);
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

  it("lists beginner tools only (3 tools)", async () => {
    const response = await client.send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const names = response.result.tools.map((tool: { name: string }) => tool.name);
    assert.deepEqual(names, getToolNames("beginner"));
    assert.ok(!names.includes("ci_reinforce"), "Should NOT include expert tools");
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

describe("MCP server — expert mode", () => {
  let client: McpTestClient;
  let tempHome = "";
  let tempWorkspace = "";

  before(async () => {
    tempHome = join(tmpdir(), `ci-mcp-expert-${Date.now()}`);
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

  it("lists all 12 tools in expert mode", async () => {
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

  it("returns error for unknown method", async () => {
    const response = await client.send({ jsonrpc: "2.0", id: 18, method: "nonexistent/method", params: {} });
    assert.ok(response.error, "Should return error for unknown method");
    assert.equal(response.error?.code, -32601);
  });
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
