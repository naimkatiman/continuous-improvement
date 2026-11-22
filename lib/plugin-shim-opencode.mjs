// plugin-shim-opencode.mts — The OpenCode plugin `install --target opencode
// --hooks` writes (docs/plans/2026-11-21-all-agents.md, Architecture item 13).
//
// One default export serves both OpenCode lines (verified research 2026-11-21,
// OpenCode plugin_or_extension_packaging and its skeptic verdict): V2
// (@opencode/cli 2.x) loads `{id, setup(ctx)}`, and V1 (opencode-ai >= 1.18.29)
// calls `server()` on the same object for its hook map. V2 fails a V1
// hook-map-only module on every load, and a V1 path plugin in object form must
// carry `id`. `@opencode/plugin` is not imported: its promise `define()` is the
// identity function (@opencode/plugin@2.3.2 dist/promise/plugin.js), so this
// object is what Plugin.define would return. No `tui()`: V1 refuses a default
// export with both.
//
// Hooks, from the same research and skeptic verdicts:
// - V1 `tool.execute.before(input {tool, sessionID, callID}, output {args})`:
//   a throw is the only V1 block (permission.ask is dead code); the model reads
//   it as a failed tool call and the turn goes on.
// - V2 `ctx.tool.hook("execute.before", e {tool, sessionID, input, ...})`: a
//   throw fails that call alone. `execute.after` must not throw (it runs
//   through Effect.promise), so the observer is wrapped.
// - V1 `tool.execute.after(input {tool, sessionID, callID, args}, output)`:
//   output is {title, output, metadata} for built-in tools and the raw MCP
//   {content} result for MCP tools.
// - Lessons: V1 `experimental.chat.system.transform(input {sessionID}, output
//   {system: string[]})` and V2 `ctx.session.hook("context", e)` with
//   e.system.push({type: "text", text}) run on every model request, so the
//   lessons are computed once per session and pushed on each one.
// - Stop: V2 `ctx.session.hook("experimental.idle", e {sessionID,
//   background})`, continued with `ctx.session.synthetic({sessionID, text})`.
//   V1's session.idle only observes, so V1 has no Stop gate. The idle hook
//   does not run after an interruption or failure (skeptic hook_stop verdict),
//   so a user prompt (V2 `ctx.session.hook("prompt", e {sessionID, messageID,
//   prompt, ...})`, skeptic hook_user_prompt verdict) resets the bridge's
//   one-continue guard. The prompt that carries our own synthetic text, or
//   arrives while synthetic() runs, does not: OpenCode has no continuation cap,
//   so that reset would loop.
// - Tool ids (tool_names, skeptic-corrected): V1 bash {command}, edit
//   {filePath, oldString, newString}, write {filePath, content}, read
//   {filePath}, apply_patch {patchText} (the only edit tool on GPT models);
//   V2 shell, edit/write/read with `path`, patch {patchText}.
import { createBridge, missingHostApi, renderPluginFile } from "./hook-bridge.mjs";
const PLUGIN_ID = "continuous-improvement";
function asRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
// The string fields of `args`, renamed to the Claude keys; a missing or non-string field is left out.
function pick(args, keys) {
    const fields = asRecord(args);
    const out = {};
    for (const [to, from] of Object.entries(keys)) {
        const value = from.map((key) => fields[key]).find((item) => typeof item === "string");
        if (value !== undefined)
            out[to] = value;
    }
    return out;
}
const CALLS = {
    bash: { tool: "Bash", keys: { command: ["command"] } },
    shell: { tool: "Bash", keys: { command: ["command"] } },
    edit: { tool: "Edit", keys: { file_path: ["filePath", "path"], old_string: ["oldString"], new_string: ["newString"] } },
    write: { tool: "Write", keys: { file_path: ["filePath", "path"], content: ["content"] } },
    read: { tool: "Read", keys: { file_path: ["filePath", "path"] } },
    apply_patch: { tool: "apply_patch", keys: { command: ["patchText"] } },
    patch: { tool: "apply_patch", keys: { command: ["patchText"] } },
};
/** A V1 or V2 tool call under its Claude name, or null for a tool no guard gates. */
export function openCodeCall(tool, args) {
    if (typeof tool !== "string" || !Object.hasOwn(CALLS, tool))
        return null;
    const spec = CALLS[tool];
    return { tool: spec.tool, input: pick(args, spec.keys) };
}
// The observer records every tool, a gated one under its Claude name.
function observed(tool, args) {
    return openCodeCall(tool, args) ?? { tool: typeof tool === "string" ? tool : "", input: asRecord(args) };
}
const sessionOf = (value) => {
    const id = asRecord(value).sessionID;
    return typeof id === "string" ? id : undefined;
};
export function createOpenCodePlugin(options) {
    let directory;
    const bridge = createBridge({ ...options, cwd: options.cwd ?? (() => directory ?? process.cwd()) });
    const gate = async (sessionId, tool, args) => {
        const call = openCodeCall(tool, args);
        const reason = call === null ? null : await bridge.preTool(sessionId, call);
        if (reason !== null)
            throw new Error(reason);
    };
    const observe = async (sessionId, tool, args, output) => {
        try {
            await bridge.postTool(sessionId, observed(tool, args), output);
        }
        catch {
            // an observer failure never fails the tool call
        }
    };
    const lessons = async (sessionId) => {
        try {
            return await bridge.lessons(sessionId);
        }
        catch {
            return null;
        }
    };
    return {
        id: PLUGIN_ID,
        async setup(ctx) {
            const tool = asRecord(asRecord(ctx).tool);
            const session = asRecord(asRecord(ctx).session);
            if (typeof tool.hook !== "function")
                return missingHostApi("OpenCode", "ctx.tool.hook", options.failClosed);
            // Called as methods, in case a domain reads `this`.
            const hook = async (domain, name, callback) => {
                if (typeof domain.hook === "function")
                    await domain.hook.call(domain, name, callback);
            };
            const synthetic = typeof session.synthetic === "function"
                ? (input) => session.synthetic.call(session, input)
                : undefined;
            await hook(tool, "execute.before", (event) => gate(sessionOf(event), asRecord(event).tool, asRecord(event).input));
            await hook(tool, "execute.after", (event) => {
                const fields = asRecord(event);
                return observe(sessionOf(event), fields.tool, fields.input, fields.status === "completed" ? fields.result : fields.error);
            });
            await hook(session, "context", async (event) => {
                const text = await lessons(sessionOf(event));
                const system = asRecord(event).system;
                if (text !== null && Array.isArray(system))
                    system.push({ type: "text", text });
            });
            // The text each session's last synthetic() admitted, and the sessions inside a synthetic() call.
            const admitted = new Map();
            const admitting = new Set();
            await hook(session, "prompt", async (event) => {
                const sessionId = sessionOf(event);
                if (sessionId === undefined)
                    return;
                const text = admitted.get(sessionId);
                admitted.delete(sessionId);
                let ours = admitting.has(sessionId);
                try {
                    ours ||= text !== undefined && (JSON.stringify(asRecord(event).prompt) ?? "").includes(text);
                }
                catch {
                    ours = true; // unreadable: keep the guard rather than risk a loop
                }
                if (!ours)
                    bridge.resetStop(sessionId);
            });
            await hook(session, "experimental.idle", async (event) => {
                const sessionId = sessionOf(event);
                const background = asRecord(event).background;
                // Work still running wakes the session again when it finishes.
                if (sessionId === undefined || (Array.isArray(background) && background.length > 0) || synthetic === undefined)
                    return;
                try {
                    const reason = await bridge.stop(sessionId);
                    if (reason === null)
                        return;
                    admitted.set(sessionId, reason);
                    admitting.add(sessionId);
                    try {
                        await synthetic({ sessionID: sessionId, text: reason });
                    }
                    catch {
                        // nothing was admitted, so the next idle is a first fire
                        admitted.delete(sessionId);
                        bridge.resetStop(sessionId);
                    }
                    finally {
                        admitting.delete(sessionId);
                    }
                }
                catch {
                    // the session goes idle as it would without the plugin
                }
            });
        },
        async server(input) {
            const dir = asRecord(input).directory;
            if (typeof dir === "string" && dir !== "")
                directory = dir;
            return {
                "tool.execute.before": (hookInput, output) => gate(sessionOf(hookInput), asRecord(hookInput).tool, asRecord(output).args),
                "tool.execute.after": (hookInput, output) => {
                    const result = asRecord(output);
                    return observe(sessionOf(hookInput), asRecord(hookInput).tool, asRecord(hookInput).args, typeof result.output === "string" ? result.output : (output ?? null));
                },
                "experimental.chat.system.transform": async (hookInput, output) => {
                    const text = await lessons(sessionOf(hookInput));
                    const system = asRecord(output).system;
                    if (text !== null && Array.isArray(system))
                        system.push(text);
                },
            };
        },
    };
}
/** The `.opencode/plugins/continuous-improvement.js` text: a default export built from the runtime copy. */
export function renderOpenCodePlugin(runtimeDir, failClosed) {
    return renderPluginFile("opencode", "plugin-shim-opencode.mjs", "createOpenCodePlugin", runtimeDir, failClosed);
}
