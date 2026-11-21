/**
 * The agent profile table and the inbound tool aliases built from it.
 *
 * Other coding agents that load this repo's Claude plugin report their own
 * tool names (Grok `run_terminal_command`, Qwen `run_shell_command`, Codex
 * `apply_patch`, Cursor `Shell`), and the hooks allowed every name they did not
 * know. The aliases fix that, and they must never touch a Claude Code call:
 * no alias may be a name Claude Code emits, and a Claude name resolves to null
 * so every hook keeps its Claude path. See docs/plans/2026-11-21-all-agents.md,
 * "Claude regression guard" item 3.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_PROFILES, CLAUDE_TOOL_NAMES, classifierShells, inboundCommand, inboundPatchText, inboundPaths, resolveInboundTool, } from "../lib/agent-profiles.mjs";
describe("agent profiles", () => {
    it("cites a source and names at least one tool for every agent", () => {
        assert.ok(AGENT_PROFILES.length >= 6);
        const ids = new Set();
        for (const profile of AGENT_PROFILES) {
            assert.match(profile.id, /^[a-z][a-z0-9-]*$/);
            assert.ok(!ids.has(profile.id), `duplicate profile ${profile.id}`);
            ids.add(profile.id);
            assert.ok(profile.source.length > 20, `${profile.id} has no source`);
            assert.ok(Object.keys(profile.tools).length > 0, `${profile.id} has no tools`);
        }
        for (const id of ["codex", "grok", "qwen", "cursor", "devin", "droid"]) {
            assert.ok(ids.has(id), `missing profile ${id}`);
        }
    });
    it("gives a flavor to shell tools only", () => {
        for (const profile of AGENT_PROFILES) {
            for (const [name, spec] of Object.entries(profile.tools)) {
                if (spec.kind === "shell")
                    assert.ok(spec.flavor, `${profile.id}.${name} is a shell with no flavor`);
                else
                    assert.equal(spec.flavor, undefined, `${profile.id}.${name} is not a shell but has a flavor`);
            }
        }
    });
    it("never maps one tool name to two kinds across agents", () => {
        const kinds = new Map();
        for (const profile of AGENT_PROFILES) {
            for (const [name, spec] of Object.entries(profile.tools)) {
                const seen = kinds.get(name);
                assert.ok(seen === undefined || seen === spec.kind, `${name} is ${seen} and ${spec.kind}`);
                kinds.set(name, spec.kind);
            }
        }
    });
});
describe("resolveInboundTool", () => {
    it("returns null for every Claude Code tool name, so the Claude path is unchanged", () => {
        for (const name of CLAUDE_TOOL_NAMES)
            assert.equal(resolveInboundTool(name), null, name);
    });
    it("returns null for the Claude names that other agents also use", () => {
        // Codex and Junie report Bash, Cursor and Droid report Write, Read, Edit and Grep.
        for (const name of ["Bash", "Write", "Read", "Edit", "Grep", "Glob", "LS", "Task", "PowerShell", "Monitor"]) {
            assert.equal(resolveInboundTool(name), null, name);
        }
    });
    it("returns null for unknown, empty and non-string names", () => {
        for (const name of ["", "not_a_tool", "mcp__server__tool", "BASH", "run_terminal_command ", undefined, null, 7, {}]) {
            assert.equal(resolveInboundTool(name), null, String(name));
        }
    });
    it("does not resolve inherited object keys", () => {
        for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
            assert.equal(resolveInboundTool(name), null, name);
        }
    });
    it("resolves each live fail-open shell name to a shell", () => {
        for (const name of ["run_terminal_command", "run_shell_command", "exec_command", "Shell", "execute_bash", "exec", "Execute"]) {
            const tool = resolveInboundTool(name);
            assert.ok(tool, name);
            assert.equal(tool.kind, "shell", name);
        }
    });
    it("names the agents that use a tool and merges their flavors", () => {
        const shell = resolveInboundTool("run_shell_command");
        assert.ok(shell);
        assert.ok(shell.agents.includes("qwen"));
        assert.ok(shell.agents.includes("gemini"));
        assert.equal(shell.flavor, "unknown");
        assert.equal(resolveInboundTool("execute_pwsh")?.flavor, "powershell");
        assert.equal(resolveInboundTool("execute_bash")?.flavor, "posix");
    });
    it("resolves the patch tools and the file tools", () => {
        assert.equal(resolveInboundTool("apply_patch")?.kind, "patch");
        assert.equal(resolveInboundTool("ApplyPatch")?.kind, "patch");
        assert.equal(resolveInboundTool("search_replace")?.kind, "file-write");
        assert.equal(resolveInboundTool("write_file")?.kind, "file-write");
        assert.equal(resolveInboundTool("edit")?.kind, "file-write");
        assert.equal(resolveInboundTool("Create")?.kind, "file-write");
        assert.equal(resolveInboundTool("read_file")?.kind, "file-read");
        assert.equal(resolveInboundTool("grep_search")?.kind, "search");
    });
});
describe("inbound input readers", () => {
    it("reads the command of a shell tool from its agents' keys", () => {
        const tool = resolveInboundTool("run_terminal_command");
        assert.equal(inboundCommand(tool, { command: "npm test" }), "npm test");
        assert.equal(inboundCommand(tool, { command: 7 }), null);
        assert.equal(inboundCommand(tool, {}), null);
        assert.equal(inboundCommand(tool, null), null);
        assert.equal(inboundCommand(tool, "npm test"), null);
        assert.equal(inboundCommand(tool, ["npm test"]), null);
    });
    it("reads the cmd key Codex's model-facing exec_command uses", () => {
        const tool = resolveInboundTool("exec_command");
        assert.equal(inboundCommand(tool, { cmd: "ls" }), "ls");
    });
    it("reads every path key of a file tool, once each", () => {
        const edit = resolveInboundTool("edit");
        assert.deepEqual(inboundPaths(edit, { file_path: "a.ts" }), ["a.ts"]);
        assert.deepEqual(inboundPaths(edit, { path: "b.ts" }), ["b.ts"]);
        assert.deepEqual(inboundPaths(edit, { file_path: "a.ts", path: "a.ts" }), ["a.ts"]);
        assert.deepEqual(inboundPaths(edit, { file_path: "", path: 3 }), []);
        assert.deepEqual(inboundPaths(edit, undefined), []);
    });
    it("reads a patch tool's paths out of its patch text", () => {
        const patch = resolveInboundTool("apply_patch");
        assert.deepEqual(inboundPaths(patch, { command: "*** Begin Patch\n*** Update File: package.json\n*** End Patch" }), ["package.json"]);
        assert.deepEqual(inboundPaths(patch, { command: "not a patch" }), []);
        assert.deepEqual(inboundPaths(patch, {}), []);
    });
    it("reads no paths from a shell tool and no command from a file tool", () => {
        assert.deepEqual(inboundPaths(resolveInboundTool("exec"), { command: "cat a.ts", file_path: "a.ts" }), []);
        assert.equal(inboundCommand(resolveInboundTool("write_file"), { command: "x", file_path: "a.ts" }), null);
    });
    it("reads a patch tool's patch text and nothing from other kinds", () => {
        const patch = "*** Update File: a.ts";
        assert.equal(inboundPatchText(resolveInboundTool("apply_patch"), { command: patch }), patch);
        assert.equal(inboundPatchText(resolveInboundTool("apply_patch"), { command: 1 }), null);
        assert.equal(inboundPatchText(resolveInboundTool("exec"), { command: patch }), null);
    });
});
describe("classifierShells", () => {
    it("classifies a known flavor once", () => {
        assert.deepEqual(classifierShells("posix", "win32"), ["Bash"]);
        assert.deepEqual(classifierShells("powershell", "linux"), ["PowerShell"]);
    });
    it("classifies an unknown flavor as both shells on Windows and as POSIX elsewhere", () => {
        assert.deepEqual(classifierShells("unknown", "win32"), ["Bash", "PowerShell"]);
        assert.deepEqual(classifierShells("unknown", "linux"), ["Bash"]);
        assert.deepEqual(classifierShells("unknown", "darwin"), ["Bash"]);
    });
});
