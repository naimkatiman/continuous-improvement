/**
 * The MCP server resolves its project the way the hooks do
 * (docs/plans/2026-11-21-all-agents.md, PR 5). It gets no hook payload, so
 * when the client offers the MCP "Roots" feature (spec 2024-11-05: client
 * capability `roots`, server request `roots/list`, reply `{ roots: [{ uri }] }`,
 * notification `notifications/roots/list_changed`) the server asks for the
 * roots and resolves the first file root like a hook payload cwd. A project
 * env var still wins, and without a usable root the server keeps resolving
 * from its own cwd, as before. One root decides both the <project-hash> bucket
 * and the directory the planning tools read and write.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PROJECT_DIR_ENV } from "../lib/agent-paths.mjs";
import { canonicalizeProjectRoot, hashProjectRoot } from "../lib/gateguard-state.mjs";
const MCP_SERVER = join(fileURLToPath(new URL(".", import.meta.url)), "..", "bin", "mcp-server.mjs");
// A client that keeps every line the server writes, so a test can wait for a
// server request (roots/list) as well as for the answer to its own request.
class Wire {
    proc;
    buffer = "";
    inbox = [];
    waiters = [];
    constructor(proc) {
        this.proc = proc;
        proc.stdout.setEncoding("utf8");
        proc.stdout.on("data", (chunk) => {
            this.buffer += chunk;
            let index;
            while ((index = this.buffer.indexOf("\n")) !== -1) {
                const line = this.buffer.slice(0, index).replace(/\r$/, "");
                this.buffer = this.buffer.slice(index + 1);
                if (line)
                    this.deliver(JSON.parse(line));
            }
        });
    }
    deliver(message) {
        const index = this.waiters.findIndex((waiter) => waiter.match(message));
        if (index === -1) {
            this.inbox.push(message);
            return;
        }
        const [waiter] = this.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
    }
    write(message) {
        this.proc.stdin.write(`${JSON.stringify(message)}\n`);
    }
    next(match, label) {
        const index = this.inbox.findIndex(match);
        if (index !== -1)
            return Promise.resolve(this.inbox.splice(index, 1)[0]);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`timeout waiting for ${label}`)), 8000);
            this.waiters.push({ match, resolve, timer });
        });
    }
    /** Messages that arrived and no test waited for. */
    unclaimed() {
        return [...this.inbox];
    }
    async request(id, method, params = {}) {
        this.write({ jsonrpc: "2.0", id, method, params });
        return this.next((m) => m.id === id && m.method === undefined, `${method} (${id})`);
    }
    async tool(id, name, args = {}) {
        const response = await this.request(id, "tools/call", { name, arguments: args });
        assert.equal(response.error, undefined, JSON.stringify(response));
        return String(response.result.content[0].text);
    }
    rootsRequest() {
        return this.next((m) => m.method === "roots/list", "roots/list");
    }
    close() {
        for (const waiter of this.waiters)
            clearTimeout(waiter.timer);
        this.proc.kill();
    }
}
const fileUri = (path) => pathToFileURL(path).href;
const same = (actual, expected) => assert.equal(canonicalizeProjectRoot(actual), canonicalizeProjectRoot(expected));
describe("MCP server: the client's roots pick the project (expert)", () => {
    let base = "";
    let home = "";
    let store = "";
    let repo = "";
    let sub = "";
    let other = "";
    let plain = "";
    let outside = "";
    const wires = [];
    before(() => {
        base = mkdtempSync(join(tmpdir(), "ci-mcp-roots-"));
        home = join(base, "home");
        store = join(base, "store");
        repo = join(base, "repo");
        sub = join(repo, "packages", "app");
        other = join(base, "other");
        plain = join(base, "plain");
        outside = join(base, "outside");
        for (const dir of [home, store, sub, other, plain, outside])
            mkdirSync(dir, { recursive: true });
        for (const dir of [repo, other]) {
            execFileSync("git", ["init", "-q", dir], { env: { ...process.env, GIT_CEILING_DIRECTORIES: base } });
        }
    });
    after(async () => {
        for (const wire of wires)
            wire.close();
        await new Promise((resolve) => setTimeout(resolve, 200));
        rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    });
    const toplevel = (dir) => execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8" }).trim();
    // Starts the server in `cwd` with no project env var, the host's CI_*,
    // CLAUDE_* and GATEGUARD_* settings removed, and the store at `store`.
    async function start(options) {
        const env = { ...process.env };
        for (const key of Object.keys(env)) {
            if (/^(CI_|CLAUDE_|GATEGUARD_)/i.test(key) || PROJECT_DIR_ENV.includes(key))
                delete env[key];
        }
        Object.assign(env, { HOME: home, USERPROFILE: home, GIT_CEILING_DIRECTORIES: base, CI_INSTINCTS_HOME: store }, options.env);
        const wire = new Wire(spawn(process.execPath, [MCP_SERVER, "--mode", "expert"], { cwd: options.cwd, env, stdio: ["pipe", "pipe", "pipe"] }));
        wires.push(wire);
        const capabilities = options.roots ? { roots: { listChanged: true } } : {};
        const init = await wire.request("init", "initialize", {
            protocolVersion: "2024-11-05",
            capabilities,
            clientInfo: { name: "roots-test", version: "0.0.0" },
        });
        assert.ok(init.result, JSON.stringify(init));
        wire.write({ jsonrpc: "2.0", method: "notifications/initialized" });
        return wire;
    }
    // The directory the planning tools use, from ci_plan_status.
    async function planRoot(wire, id) {
        const text = await wire.tool(id, "ci_plan_status");
        const match = /No planning files found in (.+?)\. Run ci_plan_init/.exec(text) ?? /\*\*Project root:\*\* (.+)/.exec(text);
        assert.ok(match, text);
        return match[1].trim();
    }
    // The gateguard state file the clearance fallback (no state_path) writes.
    async function clearanceFile(wire, id) {
        const text = await wire.tool(id, "ci_gateguard_clear", { file_paths: ["src/a.ts"] });
        const match = /\*\*State file:\*\* (.+)/.exec(text);
        assert.ok(match, text);
        return match[1].trim();
    }
    it("asks a client that offers roots, and uses the repository of the first root for the bucket and the planning files", async () => {
        const wire = await start({ cwd: outside, roots: true });
        const request = await wire.rootsRequest();
        assert.equal(request.jsonrpc, "2.0");
        assert.ok(request.id !== undefined && request.id !== null, "roots/list must be a request, with an id");
        wire.write({ jsonrpc: "2.0", id: request.id, result: { roots: [{ uri: fileUri(sub), name: "app" }] } });
        same(await planRoot(wire, "plan-1"), toplevel(repo));
        const state = await clearanceFile(wire, "clear-1");
        same(state, join(store, hashProjectRoot(toplevel(repo)), "gateguard-session.json"));
        assert.ok(existsSync(state), `no state at ${state}`);
        assert.equal(existsSync(join(home, ".claude", "instincts")), false, "CI_INSTINCTS_HOME was not used");
    });
    it("sends no roots/list to a client without the roots capability, and keeps resolving from its own cwd", async () => {
        const inRepo = await start({ cwd: sub, roots: false });
        same(await planRoot(inRepo, "plan-2"), toplevel(repo));
        const notInRepo = await start({ cwd: outside, roots: false });
        same(await planRoot(notInRepo, "plan-3"), outside);
        same(await clearanceFile(notInRepo, "clear-3"), join(store, hashProjectRoot("global"), "gateguard-session.json"));
        for (const wire of [inRepo, notInRepo]) {
            assert.deepEqual(wire.unclaimed().filter((m) => m.method !== undefined), [], "the server sent a request");
        }
    });
    it("a project env var still wins over the client's root", async () => {
        const wire = await start({ cwd: outside, roots: true, env: { CLAUDE_PROJECT_DIR: plain } });
        const request = await wire.rootsRequest();
        wire.write({ jsonrpc: "2.0", id: request.id, result: { roots: [{ uri: fileUri(repo) }] } });
        same(await planRoot(wire, "plan-4"), plain);
        same(await clearanceFile(wire, "clear-4"), join(store, hashProjectRoot(plain), "gateguard-session.json"));
    });
    it("follows roots/list_changed, ignores a stale or unknown reply, and falls back to its cwd on a reply it cannot use", async () => {
        const wire = await start({ cwd: outside, roots: true });
        const first = await wire.rootsRequest();
        wire.write({ jsonrpc: "2.0", id: first.id, result: { roots: [{ uri: fileUri(repo) }] } });
        same(await planRoot(wire, "plan-5"), toplevel(repo));
        wire.write({ jsonrpc: "2.0", method: "notifications/roots/list_changed" });
        const second = await wire.rootsRequest();
        assert.notEqual(second.id, first.id);
        // A late reply to the first request, and a reply to an id the server never
        // used, change nothing and get no answer.
        wire.write({ jsonrpc: "2.0", id: first.id, result: { roots: [{ uri: fileUri(plain) }] } });
        wire.write({ jsonrpc: "2.0", id: "never-sent", result: { roots: [{ uri: fileUri(plain) }] } });
        wire.write({ jsonrpc: "2.0", id: second.id, result: { roots: [{ uri: fileUri(other) }] } });
        same(await planRoot(wire, "plan-6"), toplevel(other));
        const unusable = [
            { result: { roots: [] } },
            { result: { roots: [{ uri: "https://example.com/repo" }] } },
            { result: { roots: [{ uri: fileUri(join(base, "missing")) }] } },
            { result: { roots: [{ uri: fileUri(plain) }] } },
            { result: "not an object" },
            { error: { code: -32601, message: "Method not found" } },
        ];
        for (const [index, reply] of unusable.entries()) {
            wire.write({ jsonrpc: "2.0", method: "notifications/roots/list_changed" });
            const request = await wire.rootsRequest();
            wire.write({ jsonrpc: "2.0", id: request.id, ...reply });
            same(await planRoot(wire, `plan-bad-${index}`), outside);
            // Back on a usable root before the next case, so each case starts from one.
            wire.write({ jsonrpc: "2.0", method: "notifications/roots/list_changed" });
            const reset = await wire.rootsRequest();
            wire.write({ jsonrpc: "2.0", id: reset.id, result: { roots: [{ uri: fileUri(repo) }] } });
            same(await planRoot(wire, `plan-reset-${index}`), toplevel(repo));
        }
        assert.deepEqual(wire.unclaimed().filter((m) => m.id === first.id || m.id === "never-sent"), [], "the server answered a reply");
    });
});
