/**
 * The MCP tool descriptions name the instincts store neutrally
 * (docs/plans/2026-11-21-all-agents.md, PR 16). Every agent shares one store,
 * `CI_INSTINCTS_HOME` when it is set and `<home>/.claude/instincts` otherwise
 * (Architecture item 1), so a description that says "~/.claude/instincts/..."
 * tells a Codex or Gemini model to look in the wrong place when the override
 * is set, and reads as if the store were Claude Code's only. The tool names and
 * count stay as they are (verify:tool-count).
 *
 * RED first: four descriptions (ci_gateguard_clear state_path, ci_goal_check
 * goal_file, ci_recall, ci_distill_propose) used ~/.claude/instincts/ as the
 * path base, and the state_path refusal named ~/.claude/instincts/ whatever
 * root the server had resolved.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { getToolDefinitions, getToolNames } from "../lib/plugin-metadata.mjs";
const MCP_SERVER = join(fileURLToPath(new URL(".", import.meta.url)), "..", "bin", "mcp-server.mjs");
const roots = [];
after(() => {
    for (const root of roots)
        rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
// Every description string in a tool definition, the input schema included.
function descriptions(value, out = []) {
    if (Array.isArray(value)) {
        for (const item of value)
            descriptions(item, out);
    }
    else if (value !== null && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
            if (key === "description" && typeof item === "string")
                out.push(item);
            else
                descriptions(item, out);
        }
    }
    return out;
}
describe("MCP tool descriptions name the instincts store neutrally", () => {
    const tools = getToolDefinitions("expert");
    it("no description builds a path on ~/.claude/instincts/", () => {
        for (const tool of tools) {
            for (const text of descriptions(tool)) {
                assert.doesNotMatch(text, /~\/\.claude\/instincts\//, `${tool.name}: ${text}`);
            }
        }
    });
    it("a description that names the store says where it is: CI_INSTINCTS_HOME, else ~/.claude/instincts", () => {
        const naming = tools.flatMap((tool) => descriptions(tool).map((text) => ({ name: tool.name, text })))
            .filter(({ text }) => /instincts root|\.claude\/instincts/.test(text));
        assert.deepEqual([...new Set(naming.map(({ name }) => name))].sort(), ["ci_distill_propose", "ci_gateguard_clear", "ci_goal_check", "ci_recall"]);
        for (const { name, text } of naming) {
            assert.match(text, /CI_INSTINCTS_HOME/, `${name}: ${text}`);
            assert.match(text, /~\/\.claude\/instincts\b/, `${name}: ${text}`);
        }
    });
    it("keeps the 19 expert tools and the beginner subset, by name and order", () => {
        assert.deepEqual(tools.map((tool) => tool.name), getToolNames("expert"));
        assert.equal(tools.length, 19);
        assert.deepEqual(getToolDefinitions("beginner").map((tool) => tool.name), getToolNames("beginner"));
    });
});
describe("the state_path refusal names the root the server resolved", () => {
    function callOnce(env, args) {
        return new Promise((resolve, reject) => {
            const proc = spawn(process.execPath, [MCP_SERVER, "--mode", "beginner"], { env, stdio: ["pipe", "pipe", "pipe"] });
            let buffer = "";
            const timer = setTimeout(() => {
                proc.kill();
                reject(new Error("timeout waiting for tools/call"));
            }, 10_000);
            proc.stdout.setEncoding("utf8");
            proc.stdout.on("data", (chunk) => {
                buffer += chunk;
                for (const line of buffer.split("\n")) {
                    if (!line.trim())
                        continue;
                    let message;
                    try {
                        message = JSON.parse(line);
                    }
                    catch {
                        continue;
                    }
                    if (message.id === 2) {
                        clearTimeout(timer);
                        proc.stdin.end();
                        resolve(message.result);
                    }
                }
            });
            proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`);
            proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "ci_gateguard_clear", arguments: args } })}\n`);
        });
    }
    it("with CI_INSTINCTS_HOME set, the error names that root, not ~/.claude/instincts", async () => {
        const root = realpathSync(mkdtempSync(join(tmpdir(), "ci-mcp-neutral-")));
        roots.push(root);
        const home = join(root, "home");
        const store = join(root, "store");
        mkdirSync(home, { recursive: true });
        mkdirSync(store, { recursive: true });
        const evil = join(root, "elsewhere", "gateguard-session.json");
        const result = await callOnce({ ...process.env, HOME: home, USERPROFILE: home, CI_INSTINCTS_HOME: store }, { file_paths: ["src/x.ts"], state_path: evil });
        assert.equal(result.isError, true);
        const text = result.content[0].text;
        assert.ok(text.includes(store), text);
        assert.doesNotMatch(text, /~\/\.claude/);
        assert.ok(!existsSync(evil));
    });
});
