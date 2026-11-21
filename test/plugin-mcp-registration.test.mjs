/**
 * The plugin install ("/plugin install") must register the MCP server that
 * /recall, /goal-check, /distill and /dashboard call, and the server it names
 * must run from the bundle alone: a plugin user has plugins/continuous-improvement/
 * and nothing else from this repository.
 *
 * Contract (code.claude.com/docs/en/plugins/components#mcp-servers): a plugin
 * declares stdio servers in `.mcp.json` at the plugin root, and Claude Code
 * substitutes ${CLAUDE_PLUGIN_ROOT} in `command` and `args` before it spawns one.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAME, VERSION } from "../lib/plugin-metadata.mjs";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const BUNDLE_DIR = join(REPO_ROOT, "plugins", PACKAGE_NAME);
const REGISTRATION_PATH = join(BUNDLE_DIR, ".mcp.json");
// The generated manifest verify:tool-count reads as the honest expert tool count.
const EXPERT_MANIFEST_PATH = join(REPO_ROOT, "plugins", "expert.json");
const PLUGIN_ROOT_VARIABLE = "${CLAUDE_PLUGIN_ROOT}";
// Claude Code leaves an MCP tool out when its full name is over 128 characters.
const MAX_TOOL_NAME_LENGTH = 128;
const REQUEST_TIMEOUT_MS = 20_000;
function readRegistration() {
    assert.ok(existsSync(REGISTRATION_PATH), `the plugin bundle declares no MCP server: ${REGISTRATION_PATH} does not exist`);
    const parsed = JSON.parse(readFileSync(REGISTRATION_PATH, "utf8"));
    const servers = parsed.mcpServers ?? {};
    const server = servers[PACKAGE_NAME];
    assert.ok(server, `.mcp.json has no "${PACKAGE_NAME}" server, got: ${Object.keys(servers).join(", ")}`);
    return { server, serverKeys: Object.keys(servers) };
}
// What Claude Code does to `command` and each `args` element of a plugin server.
function expandPluginRoot(value) {
    return value.split(PLUGIN_ROOT_VARIABLE).join(BUNDLE_DIR);
}
function expertToolNames() {
    const manifest = JSON.parse(readFileSync(EXPERT_MANIFEST_PATH, "utf8"));
    return manifest.tools.map((tool) => tool.name);
}
// mcp__plugin_<plugin-name>_<server-name>__<tool-name>, with every character
// outside A-Z a-z 0-9 _ - replaced by an underscore.
function pluginScopedToolName(serverKey, toolName) {
    const clean = (value) => value.replace(/[^A-Za-z0-9_-]/g, "_");
    return `mcp__plugin_${clean(PACKAGE_NAME)}_${clean(serverKey)}__${toolName}`;
}
const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"']+)\1/g;
// Every module reachable from `entry` through relative import specifiers.
function walkRelativeImports(entry, bundleDir) {
    const seen = new Set();
    const missing = [];
    const outsideBundle = [];
    const queue = [resolve(entry)];
    const label = (file) => relative(bundleDir, file).split(sep).join("/");
    while (queue.length > 0) {
        const file = queue.pop();
        if (seen.has(file))
            continue;
        seen.add(file);
        for (const match of readFileSync(file, "utf8").matchAll(RELATIVE_IMPORT)) {
            const target = resolve(dirname(file), match[2]);
            if (!target.startsWith(resolve(bundleDir) + sep)) {
                outsideBundle.push(`${label(file)} imports ${match[2]}`);
            }
            else if (!existsSync(target)) {
                missing.push(`${label(file)} imports ${match[2]}`);
            }
            else {
                queue.push(target);
            }
        }
    }
    return { missing, modules: [...seen].map(label).sort(), outsideBundle };
}
// Newline-delimited JSON-RPC over stdio. A server that dies before answering
// rejects the request with its stderr, so a crash reads as a crash, not a timeout.
class StdioClient {
    proc;
    buffer = "";
    exit = null;
    nextId = 1;
    pending = new Map();
    stderr = "";
    constructor(proc) {
        this.proc = proc;
        proc.stdout.on("data", (chunk) => {
            this.buffer += chunk.toString("utf8");
            this.drain();
        });
        proc.stderr.on("data", (chunk) => {
            this.stderr += chunk.toString("utf8");
        });
        proc.stdin.on("error", () => {
            // EPIPE after the server exits; the exit handler reports it.
        });
        proc.on("error", (error) => this.fail(`could not start: ${error.message}`));
        proc.on("exit", (code, signal) => this.fail(`exited (code ${code}, signal ${signal})`));
    }
    drain() {
        let newline = this.buffer.indexOf("\n");
        while (newline !== -1) {
            const line = this.buffer.slice(0, newline).trim();
            this.buffer = this.buffer.slice(newline + 1);
            newline = this.buffer.indexOf("\n");
            if (line.length === 0)
                continue;
            const message = JSON.parse(line);
            const waiting = typeof message.id === "number" ? this.pending.get(message.id) : undefined;
            if (!waiting || typeof message.id !== "number")
                continue;
            this.pending.delete(message.id);
            clearTimeout(waiting.timer);
            if (message.error) {
                waiting.reject(new Error(`server returned an error: ${message.error.message}`));
            }
            else {
                waiting.resolve(message.result);
            }
        }
    }
    fail(reason) {
        if (this.exit === null)
            this.exit = reason;
        for (const [id, waiting] of this.pending) {
            this.pending.delete(id);
            clearTimeout(waiting.timer);
            waiting.reject(new Error(this.describeExit()));
        }
    }
    describeExit() {
        return `bundled MCP server ${this.exit}. stderr:\n${this.stderr.trim()}`;
    }
    request(method, params = {}) {
        return new Promise((resolvePromise, rejectPromise) => {
            if (this.exit !== null) {
                rejectPromise(new Error(this.describeExit()));
                return;
            }
            const id = this.nextId++;
            const timer = setTimeout(() => {
                this.pending.delete(id);
                rejectPromise(new Error(`no answer to ${method} within ${REQUEST_TIMEOUT_MS} ms. stderr:\n${this.stderr.trim()}`));
            }, REQUEST_TIMEOUT_MS);
            this.pending.set(id, { reject: rejectPromise, resolve: resolvePromise, timer });
            this.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
        });
    }
    destroy() {
        for (const waiting of this.pending.values())
            clearTimeout(waiting.timer);
        this.pending.clear();
        this.proc.kill();
    }
}
describe("plugin bundle MCP registration", () => {
    it("registers one stdio server that runs the bundled mcp-server.mjs in expert mode", () => {
        const { server, serverKeys } = readRegistration();
        assert.deepEqual(serverKeys, [PACKAGE_NAME]);
        assert.equal(server.command, "node");
        assert.deepEqual(server.args, [`${PLUGIN_ROOT_VARIABLE}/bin/mcp-server.mjs`, "--mode", "expert"]);
        const serverPath = expandPluginRoot(server.args[0]);
        assert.ok(existsSync(serverPath), `the registration names ${server.args[0]}, which the bundle does not ship`);
    });
    it("keeps every plugin-scoped tool name within Claude Code's 128-character limit", () => {
        const { serverKeys } = readRegistration();
        const tooLong = expertToolNames()
            .map((tool) => pluginScopedToolName(serverKeys[0], tool))
            .filter((name) => name.length > MAX_TOOL_NAME_LENGTH);
        assert.deepEqual(tooLong, []);
    });
    it("resolves every relative import reachable from the registered server inside the bundle", () => {
        const { server } = readRegistration();
        const closure = walkRelativeImports(expandPluginRoot(server.args[0]), BUNDLE_DIR);
        assert.deepEqual(closure.missing, [], "modules the bundled server imports but the bundle does not ship");
        assert.deepEqual(closure.outsideBundle, [], "imports that leave the plugin bundle");
        // Guards the walk itself: a specifier pattern that matched nothing would pass vacuously.
        assert.ok(closure.modules.includes("lib/plugin-metadata.mjs") && closure.modules.includes("lib/redact-secrets.mjs"), `expected the walk to reach the direct and the transitive lib imports, got: ${closure.modules.join(", ")}`);
    });
});
describe("plugin bundle MCP server, started the way the registration starts it", () => {
    let client;
    let tempHome = "";
    let tempRoot = "";
    let toolNames = [];
    // Every instinct file the server has written under the temp HOME.
    const instinctFiles = () => {
        const found = [];
        const walk = (dir) => {
            if (!existsSync(dir))
                return;
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                if (entry.isDirectory())
                    walk(join(dir, entry.name));
                else if (entry.name.endsWith(".yaml"))
                    found.push(entry.name);
            }
        };
        walk(join(tempHome, ".claude", "instincts"));
        return found.sort();
    };
    const loadPack = async (pack) => (await client.request("tools/call", { name: "ci_load_pack", arguments: { pack } }));
    before(async () => {
        const { server } = readRegistration();
        tempRoot = mkdtempSync(join(tmpdir(), "ci-plugin-mcp-"));
        tempHome = join(tempRoot, "home");
        const tempWorkspace = join(tempRoot, "workspace");
        mkdirSync(tempHome, { recursive: true });
        mkdirSync(tempWorkspace, { recursive: true });
        const proc = spawn(expandPluginRoot(server.command), server.args.map(expandPluginRoot), {
            cwd: tempWorkspace,
            // Claude Code exports these two to a plugin's stdio server.
            env: {
                ...process.env,
                CLAUDE_PLUGIN_ROOT: BUNDLE_DIR,
                CLAUDE_PROJECT_DIR: tempWorkspace,
                HOME: tempHome,
                USERPROFILE: tempHome,
            },
            stdio: ["pipe", "pipe", "pipe"],
        });
        client = new StdioClient(proc);
        const initialized = (await client.request("initialize", {
            capabilities: {},
            clientInfo: { name: "plugin-mcp-registration-test", version: "0" },
            protocolVersion: "2024-11-05",
        }));
        assert.deepEqual(initialized.serverInfo, { name: PACKAGE_NAME, version: VERSION });
        const listed = (await client.request("tools/list"));
        toolNames = listed.tools.map((tool) => tool.name);
    });
    after(async () => {
        client?.destroy();
        await new Promise((done) => setTimeout(done, 200));
        try {
            rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
        catch {
            // Windows can briefly keep stdio handles open after the child exits.
        }
    });
    it("lists exactly the expert tool set", () => {
        assert.deepEqual(toolNames, expertToolNames());
    });
    it("serves every ci_* tool a bundled command names", () => {
        const commandsDir = join(BUNDLE_DIR, "commands");
        const named = new Set();
        for (const file of readdirSync(commandsDir).filter((name) => name.endsWith(".md"))) {
            for (const match of readFileSync(join(commandsDir, file), "utf8").matchAll(/\bci_[a-z_]+\b/g)) {
                named.add(match[0]);
            }
        }
        assert.ok(named.has("ci_recall") && named.has("ci_goal_check") && named.has("ci_distill_candidates"));
        assert.deepEqual([...named].filter((tool) => !toolNames.includes(tool)), []);
    });
    it("answers ci_status, the cheapest read-only tool", async () => {
        const result = (await client.request("tools/call", { name: "ci_status", arguments: {} }));
        assert.ok(!result.isError, result.content[0].text);
        assert.match(result.content[0].text, /## continuous-improvement Status/);
        assert.match(result.content[0].text, /\*\*Observations:\*\* 0/);
        assert.match(result.content[0].text, /\*\*Mode:\*\* expert/);
    });
    // ci_load_pack turns the pack name into a path. The name comes from the model,
    // so anything but the name of a pack the bundle ships has to be refused before
    // a file is read: with `../` in it the name reached any .json file on the
    // drive, and that file's entries were written into the instinct store at the
    // confidence the file claimed.
    it("ci_load_pack refuses a pack name that leaves the bundle's packs and writes nothing", async () => {
        // A real instinct array outside the bundle: the repository's own react pack.
        assert.ok(existsSync(join(REPO_ROOT, "instinct-packs", "react.json")));
        const names = [
            "../../../instinct-packs/react",
            "..\\..\\..\\instinct-packs\\react",
            "../instinct-packs/react",
            "./react",
            "",
        ];
        for (const pack of names) {
            const result = await loadPack(pack);
            assert.ok(result.isError, `pack ${JSON.stringify(pack)} was loaded: ${result.content[0].text}`);
            assert.match(result.content[0].text, /Unknown pack/);
            assert.match(result.content[0].text, /Available: .*\breact\b/);
            assert.deepEqual(instinctFiles(), [], `pack ${JSON.stringify(pack)} wrote instinct files`);
        }
    });
    // The bundle's plugin.json holds a JSON object. Iterating it threw inside the
    // handler, and a tool that throws sends no response at all.
    it("ci_load_pack answers with a tool error when the name points at a .json file that is no pack", async () => {
        assert.ok(existsSync(join(BUNDLE_DIR, ".claude-plugin", "plugin.json")));
        const result = await loadPack("../.claude-plugin/plugin");
        assert.ok(result.isError, result.content[0].text);
        assert.match(result.content[0].text, /Unknown pack/);
        assert.deepEqual(instinctFiles(), []);
    });
    it("ci_load_pack loads a shipped pack by its plain name", async () => {
        const shipped = JSON.parse(readFileSync(join(BUNDLE_DIR, "instinct-packs", "react.json"), "utf8"));
        const result = await loadPack("react");
        assert.ok(!result.isError, result.content[0].text);
        assert.deepEqual(instinctFiles(), shipped.map((entry) => `${entry.id}.yaml`).sort());
    });
});
