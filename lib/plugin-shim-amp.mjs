// plugin-shim-amp.mts — The Amp plugin `install --target amp --hooks` writes
// (docs/plans/2026-11-21-all-agents.md, Architecture item 13).
//
// An Amp plugin is a module whose default export takes the PluginAPI and
// registers handlers with `amp.on(event, handler)` (verified research
// 2026-11-21, Amp hook_pre_tool and its skeptic verdicts; @ampcode/plugin is
// type-only and not imported). Request events must return a result:
// - `tool.call` {toolUseID, tool, input, thread:{id}} returns {action:"allow"}
//   or {action:"reject-and-continue", message}; the model then reads "Tool
//   rejected by plugin: <message>" as the tool result and the turn goes on.
// - `tool.result` {toolUseID, tool, input, status, error?, output?, thread}
//   returns nothing to keep the result.
// - `agent.start` {thread, message, id} fires on every user prompt;
//   {message:{content, display:false}} appends hidden text to that turn.
//   session.start cannot return text, so the lessons go here, on the first turn
//   of each thread.
// - `agent.end` {thread, status, messages, ...} returns {action:"continue",
//   userMessage, maxContinuations} to start another turn. maxContinuations 1
//   matches the non-Claude Stop guard: one continuation in a row.
// Tool names and keys (skeptic tool_names): Bash {cmd, cwd}; shell_command
// {command, workdir}, which async_shell_command also reports as; edit_file
// {path, old_str, new_str}; create_file {path, content}; apply_patch
// {patchText}; Read and read_file {path}.
import { createBridge, renderPluginFile } from "./hook-bridge.mjs";
function asRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
const CALLS = {
    Bash: { tool: "Bash", keys: { command: "cmd" } },
    shell_command: { tool: "Bash", keys: { command: "command" } },
    edit_file: { tool: "Edit", keys: { file_path: "path", old_string: "old_str", new_string: "new_str" } },
    create_file: { tool: "Write", keys: { file_path: "path", content: "content" } },
    apply_patch: { tool: "apply_patch", keys: { command: "patchText" } },
    Read: { tool: "Read", keys: { file_path: "path" } },
    read_file: { tool: "Read", keys: { file_path: "path" } },
};
/** An Amp tool call under its Claude name, or null for a tool no guard gates. */
export function ampCall(tool, input) {
    if (typeof tool !== "string" || !Object.hasOwn(CALLS, tool))
        return null;
    const fields = asRecord(input);
    const out = {};
    for (const [to, from] of Object.entries(CALLS[tool].keys))
        if (typeof fields[from] === "string")
            out[to] = fields[from];
    return { tool: CALLS[tool].tool, input: out };
}
const threadOf = (event) => {
    const id = asRecord(asRecord(event).thread).id;
    return typeof id === "string" ? id : undefined;
};
export function createAmpPlugin(options) {
    return (amp) => {
        const bridge = createBridge(options);
        const started = new Set();
        const on = (name, handler) => {
            const api = asRecord(amp);
            if (typeof api.on === "function")
                api.on.call(api, name, handler);
        };
        on("tool.call", async (event) => {
            const fields = asRecord(event);
            const call = ampCall(fields.tool, fields.input);
            if (call === null)
                return { action: "allow" };
            let reason;
            try {
                reason = await bridge.preTool(threadOf(event), call);
            }
            catch {
                reason = options.failClosed ? "[continuous-improvement] the guard failed, and this plugin was installed with --fail-closed, so the call is blocked." : null;
            }
            return reason === null ? { action: "allow" } : { action: "reject-and-continue", message: reason };
        });
        on("tool.result", async (event) => {
            const fields = asRecord(event);
            try {
                const call = ampCall(fields.tool, fields.input) ?? { tool: typeof fields.tool === "string" ? fields.tool : "", input: asRecord(fields.input) };
                await bridge.postTool(threadOf(event), call, fields.output ?? fields.error ?? null);
            }
            catch {
                // an observer failure keeps the tool result as it is
            }
            return undefined;
        });
        on("agent.start", async (event) => {
            const thread = threadOf(event);
            if (thread === undefined || started.has(thread))
                return {};
            started.add(thread);
            try {
                const text = await bridge.lessons(thread);
                return text === null ? {} : { message: { content: text, display: false } };
            }
            catch {
                return {};
            }
        });
        on("agent.end", async (event) => {
            const thread = threadOf(event);
            if (thread === undefined || asRecord(event).status !== "done")
                return undefined;
            try {
                const reason = await bridge.stop(thread);
                return reason === null ? undefined : { action: "continue", userMessage: reason, maxContinuations: 1 };
            }
            catch {
                return undefined;
            }
        });
    };
}
/** The `.amp/plugins/continuous-improvement.ts` text: plain JS, which Amp's Bun loads as TypeScript. */
export function renderAmpPlugin(runtimeDir, failClosed) {
    return renderPluginFile("amp", "plugin-shim-amp.mjs", "createAmpPlugin", runtimeDir, failClosed);
}
