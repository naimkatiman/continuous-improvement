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
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { AGENT_IDS, claudeEventName, encode, normalizeEvent, parsePayload, runHook, selectAgent, } from "../lib/hook-io.mjs";
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
    for (const agent of ["", "zed", "Claude", "unknown-agent", "__proto__"]) {
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
                const out = encode("zed", kind === "deny" ? "PreToolUse" : "Stop", { kind, reason });
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
// Plan PR 7: these hooks write every byte through encode, so plan PR 8 can give
// another agent its own output by adding an encoder, not by editing each hook.
// fixtures/agent-hooks/claude.json pins their Claude bytes end to end. A direct
// stdout or stderr write, an exit call, or a hand-built Claude output shape in a
// hook would bypass the encoder. companion-preference and bin/observe are not
// on hook-io yet.
describe("hooks that write through hook-io", () => {
    const HOOKS = [
        "gateguard",
        "hook-pack",
        "config-guard",
        "session",
        "three-section-close",
        "goal-drift-stop",
        "workflow-distill",
        "typecheck-stop",
        "query-cost-nudge",
        "recall-briefing",
        "route-prompt",
    ];
    // Block comments and whole-line comments only: the headers describe the
    // output shapes in prose.
    const code = (name) => readFileSync(new URL(`../hooks/${name}.mjs`, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    for (const name of HOOKS) {
        it(`${name} imports encode and emit from lib/hook-io`, () => {
            const source = code(name);
            assert.match(source, /from "\.\.\/lib\/hook-io\.mjs"/);
            assert.match(source, /\bencode\(/);
            assert.match(source, /\bemit\(/);
        });
        it(`${name} writes no output of its own`, () => {
            const source = code(name);
            for (const pattern of [
                /process\.std(?:out|err)\.write\(/,
                /process\.exit\(/,
                /hookSpecificOutput/,
                /permissionDecision/,
                /decision:\s*"block"/,
            ]) {
                assert.doesNotMatch(source, pattern, `${name} matches ${pattern}`);
            }
        });
    }
});
// Plan PR 8, Architecture item 7: each agent's deny, context and continue
// shapes. Every shape comes from the verified research of 2026-11-21 (the
// Sources table of docs/plans/2026-11-21-all-agents.md, skeptic corrections
// applied), cited on the encoder table in src/lib/hook-io.mts.
describe("encode, per-agent deny", () => {
    const json = (value) => ({ stdout: `${JSON.stringify(value)}\n`, stderr: "note\n", exitCode: 0 });
    const deny = (agent) => encode(agent, "PreToolUse", { kind: "deny", reason: REASON, notices: ["note"] });
    const claudeJson = {
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: REASON },
    };
    for (const agent of ["codex", "qwen", "grok", "droid", "auggie"]) {
        it(`${agent}: the Claude permissionDecision JSON at exit 0`, () => assert.deepEqual(deny(agent), json(claudeJson)));
    }
    it("gemini: top-level decision deny with the reason", () => {
        assert.deepEqual(deny("gemini"), json({ decision: "deny", reason: REASON }));
    });
    it("cursor: the flat permission key with user_message and agent_message", () => {
        assert.deepEqual(deny("cursor"), json({ permission: "deny", user_message: REASON, agent_message: REASON }));
    });
    it("copilot: top-level permissionDecision with permissionDecisionReason", () => {
        assert.deepEqual(deny("copilot"), json({ permissionDecision: "deny", permissionDecisionReason: REASON }));
    });
    it("devin: decision block with the reason", () => {
        assert.deepEqual(deny("devin"), json({ decision: "block", reason: REASON }));
    });
    it("cline: cancel true with errorMessage", () => {
        assert.deepEqual(deny("cline"), json({ cancel: true, errorMessage: REASON }));
    });
    for (const agent of ["kiro", "junie", "goose"]) {
        it(`${agent}: exit 2 with the reason on stderr and empty stdout`, () => {
            assert.deepEqual(deny(agent), { stdout: "", stderr: `note\n${REASON}\n`, exitCode: 2 });
        });
    }
    it("a blank reason gets the fixed line on every agent but claude, whose bytes do not change", () => {
        for (const agent of AGENT_IDS.filter((id) => id !== "claude")) {
            for (const kind of ["deny", "continue"]) {
                const out = encode(agent, kind === "deny" ? "PreToolUse" : "Stop", { kind, reason: " \n" });
                assert.ok(`${out.stdout}${out.stderr}`.includes("[continuous-improvement] blocked"), `${agent} ${kind}`);
            }
        }
        assert.ok(encode("claude", "PreToolUse", { kind: "deny", reason: "" }).stdout.includes('"permissionDecisionReason":""'));
    });
    it("allow is empty stdout and exit 0 on every agent", () => {
        for (const agent of AGENT_IDS) {
            assert.deepEqual(encode(agent, "PreToolUse", { kind: "allow", notices: ["n"] }), { stdout: "", stderr: "n\n", exitCode: 0 });
        }
    });
});
describe("encode, per-agent context", () => {
    const context = (agent, event = "SessionStart") => encode(agent, event, { kind: "context", text: "- lesson\n" });
    const line = (value) => `${JSON.stringify(value)}\n`;
    for (const agent of ["codex", "qwen", "droid", "kiro"]) {
        it(`${agent}: SessionStart context is plain stdout`, () => assert.equal(context(agent).stdout, "- lesson\n"));
    }
    it("codex, qwen and droid: prompt context is the Claude additionalContext JSON; kiro's is plain", () => {
        for (const agent of ["codex", "qwen", "droid"]) {
            assert.equal(context(agent, "UserPromptSubmit").stdout, line({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "- lesson\n" } }));
        }
        assert.equal(context("kiro", "UserPromptSubmit").stdout, "- lesson\n");
    });
    it("gemini: hookSpecificOutput.additionalContext under Gemini's event name", () => {
        assert.equal(context("gemini").stdout, line({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "- lesson\n" } }));
        assert.equal(context("gemini", "UserPromptSubmit").stdout, line({ hookSpecificOutput: { hookEventName: "BeforeAgent", additionalContext: "- lesson\n" } }));
    });
    it("devin: hookSpecificOutput.additionalContext", () => {
        assert.equal(context("devin").stdout, line({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "- lesson\n" } }));
    });
    it("copilot: top-level additionalContext", () => assert.equal(context("copilot").stdout, line({ additionalContext: "- lesson\n" })));
    it("cursor: additional_context", () => assert.equal(context("cursor").stdout, line({ additional_context: "- lesson\n" })));
    it("cline: contextModification with cancel false", () => {
        assert.equal(context("cline").stdout, line({ cancel: false, contextModification: "- lesson\n" }));
    });
    for (const agent of ["grok", "auggie", "junie", "goose"]) {
        it(`${agent}: no verified context channel, so nothing on stdout`, () => {
            assert.deepEqual(context(agent), { stdout: "", stderr: "", exitCode: 0 });
        });
    }
    it("context on a Stop is dropped for every agent but claude (no verified channel there)", () => {
        for (const agent of AGENT_IDS.filter((id) => id !== "claude"))
            assert.equal(context(agent, "Stop").stdout, "", agent);
    });
});
describe("encode, per-agent continue", () => {
    const go = (agent) => encode(agent, "Stop", { kind: "continue", reason: "run the tests" });
    for (const agent of ["codex", "qwen", "grok", "droid", "devin", "kiro", "copilot", "junie", "goose"]) {
        it(`${agent}: decision block with the reason at exit 0`, () => {
            assert.deepEqual(go(agent), { stdout: `${JSON.stringify({ decision: "block", reason: "run the tests" })}\n`, stderr: "", exitCode: 0 });
        });
    }
    it("gemini: decision deny (AfterAgent retry)", () => {
        assert.equal(go("gemini").stdout, `${JSON.stringify({ decision: "deny", reason: "run the tests" })}\n`);
    });
    it("cursor: followup_message", () => {
        assert.equal(go("cursor").stdout, `${JSON.stringify({ followup_message: "run the tests" })}\n`);
    });
    for (const agent of ["auggie", "cline"]) {
        it(`${agent}: no Stop channel, so the reason goes to stderr at exit 0`, () => {
            assert.deepEqual(go(agent), { stdout: "", stderr: "run the tests\n", exitCode: 0 });
        });
    }
});
describe("selectAgent", () => {
    const cursorPayload = { hook_event_name: "preToolUse", cursor_version: "3.20.17", tool_name: "Shell" };
    const claudePayload = { hook_event_name: "PreToolUse", session_id: "s", tool_name: "Bash" };
    it("takes --agent first, then CI_AGENT, then the sniff", () => {
        assert.equal(selectAgent(["--agent", "codex"], { CI_AGENT: "gemini", CURSOR_VERSION: "3" }, cursorPayload), "codex");
        assert.equal(selectAgent(["--agent=kiro"], {}, claudePayload), "kiro");
        assert.equal(selectAgent([], { CI_AGENT: " gemini " }, cursorPayload), "gemini");
        assert.equal(selectAgent([], { CURSOR_VERSION: "3.20.17" }, cursorPayload), "cursor");
    });
    it("is claude with no flag, no CI_AGENT and a Claude payload, whatever agent env is set", () => {
        assert.equal(selectAgent([], {}, claudePayload), "claude");
        for (const env of [{ CURSOR_VERSION: "3" }, { GEMINI_SESSION_ID: "g" }, { DEVIN_PROJECT_DIR: "/r" }, { GROK_SESSION_ID: "x" }]) {
            assert.equal(selectAgent([], env, claudePayload), "claude", JSON.stringify(env));
        }
        for (const payload of [undefined, null, [], 42, "text", {}])
            assert.equal(selectAgent([], {}, payload), "claude");
    });
    it("needs both signals: an agent env var alone or a payload shape alone does not pick the agent", () => {
        assert.notEqual(selectAgent([], {}, cursorPayload), "cursor");
        assert.equal(selectAgent([], { GEMINI_SESSION_ID: "g" }, { hook_event_name: "BeforeTool" }), "gemini");
        assert.notEqual(selectAgent([], {}, { hook_event_name: "BeforeTool" }), "gemini");
        assert.equal(selectAgent([], { DEVIN_PROJECT_DIR: "/r" }, { ...claudePayload, prompt_id: "p" }), "devin");
        assert.equal(selectAgent([], { GROK_SESSION_ID: "x" }, { ...claudePayload, hookEventName: "pre_tool_use" }), "grok");
        assert.equal(selectAgent([], { QWEN_PROJECT_DIR: "/r" }, { ...claudePayload, timestamp: "2026-11-21T00:00:00Z" }), "qwen");
    });
    it("a stray agent env var never changes the deny another agent's own payload gets", () => {
        // Each agent's verified PreToolUse payload, with every other agent's sniff
        // env var set: the deny bytes stay what the payload gets with no env var.
        // Goose (tool_call_id), Cline (string timestamp) and Qwen (prompt_id) carry
        // keys another agent's sniff once read as its own shape, and the stray
        // agent's format is one the real agent does not read as a deny.
        const dir = new URL("../fixtures/agent-matrix/", import.meta.url);
        const fixtures = AGENT_IDS.map((agent) => JSON.parse(readFileSync(new URL(`${agent}.json`, dir), "utf8")));
        const deny = { kind: "deny", reason: "r" };
        const changed = [];
        for (const fixture of fixtures) {
            const payload = fixture.events.PreToolUse.stdin;
            const bare = encode(selectAgent([], {}, payload), "PreToolUse", deny);
            for (const other of fixtures) {
                if (other.agent === fixture.agent || other.selection.sniff === null)
                    continue;
                const agent = selectAgent([], other.selection.sniff.env, payload);
                if (JSON.stringify(encode(agent, "PreToolUse", deny)) !== JSON.stringify(bare))
                    changed.push(`${fixture.agent} payload with ${other.agent} env -> ${agent}`);
            }
        }
        assert.deepEqual(changed, []);
        assert.equal(encode(selectAgent([], { QWEN_PROJECT_DIR: "/r" }, fixtures.find((f) => f.agent === "goose").events.PreToolUse.stdin), "PreToolUse", deny).exitCode, 2);
        assert.equal(encode(selectAgent([], { QWEN_PROJECT_DIR: "/r" }, fixtures.find((f) => f.agent === "cline").events.PreToolUse.stdin), "PreToolUse", deny).exitCode, 2);
        assert.notEqual(selectAgent([], { DEVIN_PROJECT_DIR: "/r" }, fixtures.find((f) => f.agent === "qwen").events.PreToolUse.stdin), "devin");
    });
    it("the Qwen and Devin sniffs need a Claude event name, and Devin's shape rejects Qwen's timestamp", () => {
        assert.equal(selectAgent([], { QWEN_PROJECT_DIR: "/r" }, { event: "PreToolUse", tool_call_id: "c" }), "unknown");
        assert.equal(selectAgent([], { QWEN_PROJECT_DIR: "/r" }, { hookName: "PreToolUse", timestamp: "1763712000000" }), "unknown");
        assert.equal(selectAgent([], { QWEN_PROJECT_DIR: "/r" }, { tool_name: "Bash", timestamp: "t" }), "claude");
        assert.equal(selectAgent([], { DEVIN_PROJECT_DIR: "/r" }, { event: "PreToolUse", prompt_id: "p" }), "unknown");
        assert.equal(selectAgent([], { DEVIN_PROJECT_DIR: "/r" }, { ...claudePayload, prompt_id: "p", timestamp: "t" }), "claude");
        assert.equal(selectAgent([], { DEVIN_PROJECT_DIR: "/r" }, { ...claudePayload, prompt_id: "p", tool_call_id: "c" }), "claude");
    });
    it("the Gemini and Devin sniffs fire at session start, where their events keep the Claude name", () => {
        const gemini = { session_id: "g", transcript_path: "/t.json", cwd: "/r", hook_event_name: "SessionStart", timestamp: "2026-11-21T11:08:00.000Z", source: "startup" };
        assert.equal(selectAgent([], { GEMINI_SESSION_ID: "g" }, gemini), "gemini");
        assert.equal(selectAgent([], { GEMINI_SESSION_ID: "g" }, { ...gemini, hook_event_name: "SessionEnd" }), "gemini");
        assert.equal(selectAgent([], {}, gemini), "claude");
        const { timestamp: _timestamp, ...noTimestamp } = gemini;
        assert.equal(selectAgent([], { GEMINI_SESSION_ID: "g" }, noTimestamp), "claude");
        const devin = { hook_event_name: "SessionStart", source: "startup", session_id: "d", cwd: "/r" };
        assert.equal(selectAgent([], { DEVIN_PROJECT_DIR: "/r" }, devin), "devin");
        assert.equal(selectAgent([], { DEVIN_PROJECT_DIR: "/r" }, { ...devin, source: "resume" }), "devin");
        assert.equal(selectAgent([], {}, devin), "claude");
        // Claude Code's SessionStart carries transcript_path; Qwen's carries a timestamp.
        assert.equal(selectAgent([], { DEVIN_PROJECT_DIR: "/r" }, { ...devin, transcript_path: "/t.jsonl" }), "claude");
        assert.equal(selectAgent([], { DEVIN_PROJECT_DIR: "/r" }, { ...devin, timestamp: "t" }), "claude");
        assert.equal(selectAgent([], { DEVIN_PROJECT_DIR: "/r" }, { ...devin, source: "clear" }), "claude");
    });
    it("a clearly non-Claude payload with no matching profile gets the fail-closed id, never claude", () => {
        for (const payload of [
            cursorPayload,
            { hook_event_name: "BeforeTool", tool_name: "run_shell_command" },
            { toolName: "bash", toolArgs: "{}" },
            { hookName: "PreToolUse", preToolUse: { toolName: "run_commands" } },
            { event: "PreToolUse", tool_name: "shell" },
        ]) {
            const agent = selectAgent([], {}, payload);
            assert.ok(!AGENT_IDS.includes(agent), `${JSON.stringify(payload)} -> ${agent}`);
            assert.equal(encode(agent, "PreToolUse", { kind: "deny", reason: "r" }).exitCode, 2);
        }
    });
    it("an empty or unknown --agent or CI_AGENT value fails closed instead of falling back to claude", () => {
        for (const args of [["--agent"], ["--agent", ""], ["--agent", "zed"], ["--agent="]]) {
            const agent = selectAgent(args, {}, claudePayload);
            assert.equal(encode(agent, "PreToolUse", { kind: "deny", reason: "r" }).exitCode, 2, JSON.stringify(args));
        }
        assert.equal(encode(selectAgent([], { CI_AGENT: "zed" }, claudePayload), "PreToolUse", { kind: "deny", reason: "r" }).exitCode, 2);
        assert.equal(selectAgent([], { CI_AGENT: "  " }, claudePayload), "claude");
    });
    it("accepts an id in any case and ignores inherited property names", () => {
        assert.equal(selectAgent(["--agent", "Cursor"], {}, undefined), "cursor");
        assert.notEqual(selectAgent(["--agent", "__proto__"], {}, undefined), "claude");
        assert.equal(encode(selectAgent(["--agent", "__proto__"], {}, undefined), "PreToolUse", { kind: "deny", reason: "r" }).exitCode, 2);
    });
});
describe("normalizeEvent, other agents' payload keys", () => {
    it("reads Copilot's camelCase toolName and toolArgs, as an object or a JSON string", () => {
        for (const toolArgs of ['{"command":"git status"}', { command: "git status" }]) {
            const event = normalizeEvent("copilot", "PreToolUse", { sessionId: "c1", toolName: "bash", toolArgs });
            assert.equal(event.toolName, "bash");
            assert.equal(event.command, "git status");
            assert.equal(event.sessionId, "c1");
        }
        assert.deepEqual(normalizeEvent("copilot", "PreToolUse", { toolName: "bash", toolArgs: "{not json" }).toolInput, {});
    });
    it("reads Cline's nested preToolUse, with commands as a JSON-encoded array or an array", () => {
        for (const commands of ['["git status","npm test"]', ["git status", "npm test"]]) {
            const event = normalizeEvent("cline", "PreToolUse", {
                hookName: "PreToolUse",
                preToolUse: { toolName: "run_commands", parameters: { commands } },
            });
            assert.equal(event.toolName, "run_commands");
            assert.equal(event.kind, "shell");
            assert.equal(event.command, "git status\nnpm test");
        }
        const plain = normalizeEvent("cline", "PreToolUse", { preToolUse: { toolName: "run_commands", parameters: { commands: "ls" } } });
        assert.equal(plain.command, "ls");
        assert.equal(normalizeEvent("cline", "PreToolUse", { preToolUse: { toolName: 3 } }).toolName, "");
    });
    it("prefers the Claude keys when both are present (Grok sends both)", () => {
        const event = normalizeEvent("grok", "PreToolUse", {
            tool_name: "run_terminal_command",
            tool_input: { command: "ls" },
            toolName: "other",
            toolInput: { command: "rm" },
        });
        assert.equal(event.toolName, "run_terminal_command");
        assert.equal(event.command, "ls");
    });
    it("gives a Claude-named shell the flavor of the agent that reports it", () => {
        assert.equal(normalizeEvent("claude", "PreToolUse", { tool_name: "Bash" }).shellFlavor, "posix");
        assert.equal(normalizeEvent("codex", "PreToolUse", { tool_name: "Bash" }).shellFlavor, "unknown");
        assert.equal(normalizeEvent("copilot", "PreToolUse", { tool_name: "Bash" }).shellFlavor, "unknown");
        assert.equal(normalizeEvent("junie", "PreToolUse", { tool_name: "Bash" }).shellFlavor, "posix");
        assert.equal(normalizeEvent("zed", "PreToolUse", { tool_name: "Bash" }).shellFlavor, "posix");
    });
});
describe("claudeEventName", () => {
    it("maps the native session-start names to SessionStart and passes the rest through", () => {
        for (const name of ["sessionStart", "agentSpawn", "AgentSpawn", "TaskStart"])
            assert.equal(claudeEventName(name), "SessionStart");
        assert.equal(claudeEventName("sessionEnd"), "SessionEnd");
        for (const name of ["SessionStart", "SessionEnd", "PreToolUse", "x", "toString"])
            assert.equal(claudeEventName(name), name);
        for (const value of [undefined, null, 3])
            assert.equal(claudeEventName(value), value);
    });
});
describe("hooks pick their agent through hookAgent", () => {
    const HOOKS = ["gateguard", "hook-pack", "config-guard", "session", "three-section-close", "goal-drift-stop",
        "workflow-distill", "typecheck-stop", "query-cost-nudge", "recall-briefing", "route-prompt"];
    for (const name of HOOKS) {
        it(`${name} encodes for hookAgent(), not a fixed agent`, () => {
            const source = readFileSync(new URL(`../hooks/${name}.mjs`, import.meta.url), "utf8");
            assert.match(source, /\bhookAgent\(\)/);
            assert.doesNotMatch(source, /AGENT\s*=\s*"claude"/);
        });
    }
});
