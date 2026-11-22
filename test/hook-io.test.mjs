/**
 * Neutral hook I/O (src/lib/hook-io.mts): the event every hook reads, the
 * decision every hook returns, and the encoder that turns the decision into the
 * bytes an agent reads.
 *
 * The claude encoder is the Claude Code output code the hooks already had,
 * moved: each expected string below is copied from the hook it came from, and
 * fixtures/agent-hooks/claude.json pins the same bytes end to end. An agent id
 * with no encoder must never turn a deny into an allow, so it gets exit 2 with
 * the reason on stderr, the channel the plan's research found Claude Code and
 * most other agents honour (docs/plans/2026-11-21-all-agents.md, "What the
 * research found" item 2).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encode, normalizeEvent, parsePayload, runHook } from "../lib/hook-io.mjs";
const REASON = 'Destructive command requested: rm "a"\nMatched rule: x';
describe("encode, claude", () => {
    it("allow is empty stdout and exit 0", () => {
        assert.deepEqual(encode("claude", "PreToolUse", { kind: "allow" }), { stdout: "", stderr: "", exitCode: 0 });
    });
    it("deny is the PreToolUse permissionDecision JSON with a newline, exit 0 (gateguard emitDeny)", () => {
        const out = encode("claude", "PreToolUse", { kind: "deny", reason: REASON });
        assert.equal(out.stdout, `${JSON.stringify({
            hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: REASON },
        })}\n`);
        assert.equal(out.stderr, "");
        assert.equal(out.exitCode, 0);
    });
    it("notices go to stderr one line each, before the decision, on allow and deny", () => {
        const notices = ["[continuous-improvement] gateguard: one", "[continuous-improvement] gateguard: two"];
        assert.deepEqual(encode("claude", "PreToolUse", { kind: "allow", notices }), {
            stdout: "",
            stderr: `${notices[0]}\n${notices[1]}\n`,
            exitCode: 0,
        });
        const deny = encode("claude", "PreToolUse", { kind: "deny", reason: REASON, notices });
        assert.equal(deny.stderr, `${notices[0]}\n${notices[1]}\n`);
        assert.equal(deny.exitCode, 0);
    });
    it("SessionStart context is the plain text as given (session.mts lessonBlock write)", () => {
        assert.deepEqual(encode("claude", "SessionStart", { kind: "context", text: "## Lessons\n- one\n" }), {
            stdout: "## Lessons\n- one\n",
            stderr: "",
            exitCode: 0,
        });
    });
    it("other context is hookSpecificOutput.additionalContext JSON (recall-briefing, query-cost-nudge)", () => {
        assert.equal(encode("claude", "UserPromptSubmit", { kind: "context", text: "brief" }).stdout, `${JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "brief" } })}\n`);
        assert.equal(encode("claude", "Stop", { kind: "context", text: "nudge" }).stdout, `${JSON.stringify({ hookSpecificOutput: { hookEventName: "Stop", additionalContext: "nudge" } })}\n`);
    });
    it("continue is {decision:block, reason} with a newline, exit 0 (goal-drift-stop, typecheck-stop)", () => {
        assert.deepEqual(encode("claude", "Stop", { kind: "continue", reason: "keep going" }), {
            stdout: `${JSON.stringify({ decision: "block", reason: "keep going" })}\n`,
            stderr: "",
            exitCode: 0,
        });
    });
});
describe("encode, an agent with no encoder fails closed", () => {
    for (const agent of ["", "codex", "Claude", "unknown-agent", "__proto__"]) {
        it(`deny for ${JSON.stringify(agent)} is exit 2, the reason on stderr, empty stdout`, () => {
            const out = encode(agent, "PreToolUse", { kind: "deny", reason: REASON, notices: ["note"] });
            assert.deepEqual(out, { stdout: "", stderr: `note\n${REASON}\n`, exitCode: 2 });
        });
    }
    it("continue is exit 2 with the reason on stderr", () => {
        assert.deepEqual(encode("unknown-agent", "Stop", { kind: "continue", reason: "again" }), {
            stdout: "",
            stderr: "again\n",
            exitCode: 2,
        });
    });
    // Codex blocks on exit 2 only when stderr is non-empty, and Gemini fails open
    // on exit 2 when stdout and stderr are both blank (result.json verify,
    // capability hook_pre_tool). A blank reason must not read as an allow there.
    for (const reason of ["", "  ", "\n"]) {
        it(`deny and continue with the blank reason ${JSON.stringify(reason)} still put a non-blank line on stderr`, () => {
            for (const kind of ["deny", "continue"]) {
                const out = encode("codex", kind === "deny" ? "PreToolUse" : "Stop", { kind, reason });
                assert.equal(out.exitCode, 2);
                assert.equal(out.stdout, "");
                assert.equal(out.stderr, "[continuous-improvement] blocked\n");
            }
        });
    }
    it("allow and context print nothing on stdout and exit 0 (stray stdout can block an agent)", () => {
        assert.deepEqual(encode("unknown-agent", "PreToolUse", { kind: "allow" }), { stdout: "", stderr: "", exitCode: 0 });
        assert.deepEqual(encode("unknown-agent", "SessionStart", { kind: "context", text: "lessons" }), {
            stdout: "",
            stderr: "",
            exitCode: 0,
        });
    });
});
describe("parsePayload", () => {
    it("parses JSON, null and arrays included", () => {
        assert.deepEqual(parsePayload('{"tool_name":"Bash"}'), { ok: true, value: { tool_name: "Bash" } });
        assert.deepEqual(parsePayload("null"), { ok: true, value: null });
        assert.deepEqual(parsePayload("[]"), { ok: true, value: [] });
    });
    it("reports empty and malformed stdin as not ok", () => {
        assert.deepEqual(parsePayload(""), { ok: false });
        assert.deepEqual(parsePayload("{not json"), { ok: false });
        assert.deepEqual(parsePayload(null), { ok: false });
    });
});
describe("normalizeEvent", () => {
    it("reads the Claude Code PreToolUse keys", () => {
        const event = normalizeEvent("claude", "PreToolUse", {
            tool_name: "Bash",
            tool_input: { command: "git status" },
            session_id: "s1",
            cwd: "/repo",
        });
        assert.equal(event.agent, "claude");
        assert.equal(event.event, "PreToolUse");
        assert.equal(event.toolName, "Bash");
        assert.deepEqual(event.toolInput, { command: "git status" });
        assert.equal(event.kind, "shell");
        assert.equal(event.shellFlavor, "posix");
        assert.equal(event.command, "git status");
        assert.deepEqual(event.filePaths, []);
        assert.equal(event.sessionId, "s1");
        assert.equal(event.cwd, "/repo");
    });
    it("gives Claude Code tool names their kind", () => {
        const kindOf = (tool) => normalizeEvent("claude", "PreToolUse", { tool_name: tool }).kind;
        for (const tool of ["Write", "Edit", "MultiEdit", "NotebookEdit"])
            assert.equal(kindOf(tool), "file-write", tool);
        for (const tool of ["Read", "NotebookRead"])
            assert.equal(kindOf(tool), "file-read", tool);
        for (const tool of ["Grep", "Glob", "LS"])
            assert.equal(kindOf(tool), "search", tool);
        for (const tool of ["Bash", "PowerShell", "Monitor"])
            assert.equal(kindOf(tool), "shell", tool);
        assert.equal(kindOf("Skill"), "skill");
        assert.equal(normalizeEvent("claude", "PreToolUse", { tool_name: "PowerShell" }).shellFlavor, "powershell");
    });
    it("reads file paths from file_path and from MultiEdit edits", () => {
        assert.deepEqual(normalizeEvent("claude", "PreToolUse", { tool_name: "Edit", tool_input: { file_path: "a.ts" } }).filePaths, ["a.ts"]);
        assert.deepEqual(normalizeEvent("claude", "PreToolUse", {
            tool_name: "MultiEdit",
            tool_input: { edits: [{ file_path: "a.ts" }, null, { file_path: 3 }, { file_path: "b.ts" }] },
        }).filePaths, ["a.ts", "b.ts"]);
    });
    it("routes another agent's tool name through its profile alias", () => {
        const shell = normalizeEvent("claude", "PreToolUse", {
            tool_name: "run_shell_command",
            tool_input: { command: "ls" },
        });
        assert.equal(shell.kind, "shell");
        assert.equal(shell.command, "ls");
        const patch = normalizeEvent("claude", "PreToolUse", {
            tool_name: "apply_patch",
            tool_input: { command: "*** Begin Patch\n*** Update File: src/a.ts\n*** End Patch" },
        });
        assert.equal(patch.kind, "patch");
        assert.deepEqual(patch.filePaths, ["src/a.ts"]);
    });
    it("reads the prompt and stop_hook_active keys", () => {
        assert.equal(normalizeEvent("claude", "UserPromptSubmit", { prompt: "hi" }).prompt, "hi");
        assert.equal(normalizeEvent("claude", "Stop", { stop_hook_active: true }).stopActive, true);
        assert.equal(normalizeEvent("claude", "Stop", { stop_hook_active: "true" }).stopActive, false);
    });
    it("never throws on a payload that is not an object, and yields an empty event", () => {
        for (const payload of [null, [], 42, "text", true, undefined]) {
            const event = normalizeEvent("claude", "PreToolUse", payload);
            assert.equal(event.toolName, "", String(payload));
            assert.deepEqual(event.toolInput, {});
            assert.equal(event.kind, "other");
            assert.equal(event.command, null);
            assert.deepEqual(event.filePaths, []);
            assert.equal(event.prompt, null);
            assert.equal(event.sessionId, undefined);
            assert.equal(event.cwd, undefined);
            assert.equal(event.stopActive, false);
        }
    });
    it("reads malformed fields as absent", () => {
        const event = normalizeEvent("claude", "PreToolUse", {
            tool_name: 7,
            tool_input: "rm -rf /",
            session_id: 1,
            cwd: "",
            prompt: {},
        });
        assert.equal(event.toolName, "");
        assert.deepEqual(event.toolInput, {});
        assert.equal(event.kind, "other");
        assert.equal(event.sessionId, undefined);
        assert.equal(event.cwd, undefined);
        assert.equal(event.prompt, null);
        assert.deepEqual(normalizeEvent("claude", "PreToolUse", { tool_input: [1, 2] }).toolInput, {});
    });
    it("gives an unknown tool name or an inherited property name kind other", () => {
        for (const tool of ["SomeNewTool", "constructor", "__proto__", "toString"]) {
            assert.equal(normalizeEvent("claude", "PreToolUse", { tool_name: tool }).kind, "other", tool);
        }
    });
    it("keeps the parsed payload for the resolvers that read cwd, working_dir and workspace_roots", () => {
        const payload = { tool_name: "Write", working_dir: "/w" };
        assert.equal(normalizeEvent("claude", "PreToolUse", payload).payload, payload);
    });
});
function capture() {
    const captured = {
        stdout: "",
        stderr: "",
        exitCode: null,
        streams: {
            writeStdout: (text) => {
                captured.stdout += text;
            },
            writeStderr: (text) => {
                captured.stderr += text;
            },
            exit: (code) => {
                captured.exitCode = code;
            },
        },
    };
    return captured;
}
describe("runHook", () => {
    it("writes the encoded output and exits with its code", async () => {
        const io = capture();
        const out = { stdout: "{}\n", stderr: "note\n", exitCode: 2 };
        await runHook(() => out, io.streams);
        assert.equal(io.stdout, "{}\n");
        assert.equal(io.stderr, "note\n");
        assert.equal(io.exitCode, 2);
    });
    it("awaits an async body", async () => {
        const io = capture();
        await runHook(async () => ({ stdout: "x", stderr: "", exitCode: 0 }), io.streams);
        assert.equal(io.stdout, "x");
        assert.equal(io.exitCode, 0);
    });
    it("ends a throw as exit 0 with empty stdout and the error on stderr", async () => {
        const io = capture();
        await runHook(() => {
            throw new TypeError("Cannot read properties of null (reading 'tool_name')");
        }, io.streams);
        assert.equal(io.stdout, "");
        assert.equal(io.exitCode, 0);
        assert.match(io.stderr, /TypeError: Cannot read properties of null \(reading 'tool_name'\)/);
    });
    it("ends a rejection and a thrown non-Error the same way", async () => {
        const rejected = capture();
        await runHook(async () => Promise.reject(new Error("boom")), rejected.streams);
        assert.equal(rejected.stdout, "");
        assert.equal(rejected.exitCode, 0);
        assert.match(rejected.stderr, /boom/);
        const thrown = capture();
        await runHook(() => {
            throw "plain string";
        }, thrown.streams);
        assert.equal(thrown.stdout, "");
        assert.equal(thrown.exitCode, 0);
        assert.match(thrown.stderr, /plain string/);
    });
    // String(error) and error.stack can themselves throw. The formatting must not
    // turn runHook into a rejection that emits nothing.
    const unprintable = [
        ["a null-prototype object", () => Object.create(null)],
        [
            "an object whose toString throws",
            () => ({
                toString() {
                    throw new Error("boom");
                },
            }),
        ],
        [
            "an Error whose stack getter throws",
            () => {
                const error = new Error("stack getter");
                Object.defineProperty(error, "stack", {
                    get() {
                        throw new Error("stack getter");
                    },
                });
                return error;
            },
        ],
    ];
    for (const [label, make] of unprintable) {
        it(`ends a throw of ${label} as exit 0 with a stderr line`, async () => {
            const io = capture();
            await runHook(() => {
                throw make();
            }, io.streams);
            assert.equal(io.stdout, "");
            assert.equal(io.exitCode, 0);
            assert.equal(io.stderr, "[continuous-improvement] hook error: unprintable error\n");
        });
    }
    it("prints nothing a body wrote before it threw", async () => {
        const io = capture();
        await runHook(() => {
            encode("claude", "PreToolUse", { kind: "deny", reason: "r" });
            throw new Error("late");
        }, io.streams);
        assert.equal(io.stdout, "");
        assert.equal(io.exitCode, 0);
    });
});
