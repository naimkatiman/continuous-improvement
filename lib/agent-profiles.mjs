// agent-profiles.mts — What each coding agent calls its tools, as data.
//
// Grok, Codex, Qwen, Cursor 3.x, Devin and Droid load this repo's unchanged
// Claude plugin, and their hook payloads carry their own tool names
// (`run_terminal_command`, `run_shell_command`, `apply_patch`, `Shell`, `exec`,
// `Execute`). The hooks knew only Claude Code's names and allowed the rest, so
// a destructive command through another agent's shell passed. This table maps
// each agent's exact tool names to a kind and, for a shell, the shell flavor,
// with the input keys its payload uses. Every name, key and flavor comes from
// the verified research of 2026-11-21 (docs/plans/2026-11-21-all-agents.md,
// Sources), skeptic corrections applied; each profile cites its entry.
//
// The inbound aliases built from the table are the names no Claude Code tool
// uses. A Claude name (Bash, Write, Edit, Read, ...) resolves to null even when
// another agent also uses it, so every hook keeps its Claude path for it and
// Claude Code behaviour does not change. profileTool() gives a hook that knows
// its agent (lib/hook-io.mjs selectAgent) that agent's own reading of a name,
// Claude names included: Codex's Bash has an unknown flavor. Capability flags
// come in a later PR of the train. Pure: no I/O.
import { parsePatchPaths } from "./patch-paths.mjs";
const sh = (flavor) => ({ kind: "shell", flavor });
const SHELL = sh("unknown");
const WRITE = { kind: "file-write" };
const PATCH = { kind: "patch" };
const READ = { kind: "file-read" };
const SEARCH = { kind: "search" };
const OTHER = { kind: "other" };
const NONE = [];
// For a patch tool whose input key the research does not document: every
// candidate key is read, so a well-formed patch is gated whichever one it uses.
// Unverified; the citing source says so.
const PATCH_KEYS_UNVERIFIED = ["command", "patch", "input"];
// For a file-write tool whose path key the research does not document: the
// common keys, in this order. Unverified; the citing source says so. A call
// naming none of them fails closed (ToolSpec.pathKeys).
const PATH_KEYS_UNVERIFIED = ["path", "file_path", "filePath", "target_file"];
const WRITE_PATH_UNVERIFIED = { kind: "file-write", pathKeys: PATH_KEYS_UNVERIFIED };
/**
 * The Claude Code tool names: the ones this repo's hooks route and match
 * (gateguard TOOL_ROUTE, the plugin matchers) and Claude Code's other built-in
 * tools. None of them is ever an inbound alias.
 */
export const CLAUDE_TOOL_NAMES = [
    "Agent", "AskUserQuestion", "Bash", "BashOutput", "Edit", "EnterPlanMode", "ExitPlanMode", "Glob", "Grep",
    "KillShell", "LS", "ListMcpResourcesTool", "Monitor", "MultiEdit", "NotebookEdit", "NotebookRead", "PowerShell",
    "Read", "ReadMcpResourceTool", "Skill", "SlashCommand", "Task", "TaskOutput", "TaskStop", "TodoWrite", "ToolSearch",
    "WebFetch", "WebSearch", "Write",
];
export const AGENT_PROFILES = [
    {
        id: "codex",
        source: "Codex CLI 0.171.0, research tool_names + hook_payload_example (skeptic hook_pre_tool: names and tool_input.command hold). Bash also runs PowerShell on Windows; apply_patch carries the patch in command; exec_command is the model-facing shell whose cmd hook payloads normalize to Bash.",
        tools: { Bash: SHELL, apply_patch: PATCH, exec_command: SHELL, update_plan: OTHER, spawn_agent: OTHER },
        input: { command: ["command", "cmd"], path: NONE, patch: ["command"] },
    },
    {
        id: "grok",
        source: "Grok Build 1.0.85, research tool_names (skeptic: confirmed) + hook_payload_example. run_terminal_command in payloads, run_terminal_cmd as the --tools id, Shell/StrReplace/Write/EditNotebook on the daemon and Cursor route with the path in `path`; WriteInput takes file_path (alias filePath); ReadFileInput shows target_file and file_path.",
        tools: {
            run_terminal_command: SHELL, run_terminal_cmd: SHELL, Shell: SHELL,
            search_replace: WRITE, hashline_edit: WRITE, write: WRITE, StrReplace: WRITE, EditNotebook: WRITE, Write: WRITE,
            read_file: READ, hashline_read: READ, grep: SEARCH, list_dir: SEARCH,
            web_search: OTHER, web_fetch: OTHER, spawn_subagent: OTHER,
        },
        input: { command: ["command"], path: ["file_path", "filePath", "path", "target_file"], patch: NONE },
    },
    {
        id: "qwen",
        source: "Qwen Code 0.28.0, research tool_names (ToolNames enum) + hook_payload_example; skeptic hook_pre_tool (a): Monitor is the alias of monitor. exec (Code Mode) is left out: its input is not documented.",
        tools: {
            run_shell_command: SHELL, monitor: SHELL, edit: WRITE, write_file: WRITE, notebook_edit: WRITE,
            read_file: READ, grep_search: SEARCH, glob: SEARCH, list_directory: SEARCH,
            web_fetch: OTHER, web_search: OTHER, skill: OTHER, agent: OTHER, todo_write: OTHER,
        },
        input: { command: ["command"], path: ["file_path"], patch: NONE },
    },
    {
        id: "gemini",
        source: "Gemini CLI 0.41.2, research tool_names (file-system.md, shell.md); skeptic tool_names adds save_memory (writes GEMINI.md, so a file write) and google_web_search.",
        tools: {
            run_shell_command: SHELL, replace: WRITE, write_file: WRITE, save_memory: WRITE,
            read_file: READ, read_many_files: READ, grep_search: SEARCH, search_file_content: SEARCH, glob: SEARCH,
            list_directory: SEARCH, web_fetch: OTHER, google_web_search: OTHER, activate_skill: OTHER,
        },
        input: { command: ["command"], path: ["file_path"], patch: NONE },
    },
    {
        id: "cursor",
        source: "Cursor 2.5.26 / 3.20.17, research tool_names + skeptic tool_names (2.5.26 enum: Read, Write, Delete, List, Grep, Shell, Fetch, ...; no Task or WebFetch). Shell tool_input {command, cwd}; Write, Read and Delete take file_path.",
        tools: { Shell: SHELL, Write: WRITE, Delete: WRITE, Read: READ, List: SEARCH, Grep: SEARCH, Fetch: OTHER },
        input: { command: ["command"], path: ["file_path"], patch: NONE },
    },
    {
        id: "devin",
        source: "Devin Local 3000.14 (Windsurf), research tool_names (skeptic: confirmed) + hook_payload_example (exec tool_input {command, shell_id}). The input keys of edit, write and read are not documented. The Windows default shell is PowerShell and exec_shell can pick bash, so the flavor is unknown. apply_patch's input key is not documented: patch keys command, patch and input are unverified candidates.",
        tools: {
            exec: SHELL, shell_command: SHELL, edit: WRITE, write: WRITE, apply_patch: PATCH, notebook_edit: WRITE,
            read: READ, notebook_read: READ, grep: SEARCH, glob: SEARCH, find_file_by_name: SEARCH,
            webfetch: OTHER, skill: OTHER, todo_write: OTHER, run_subagent: OTHER,
        },
        input: { command: ["command"], path: NONE, patch: PATCH_KEYS_UNVERIFIED },
    },
    {
        id: "droid",
        source: "Factory Droid 1.17, research tool_names + hook_payload_example (Create tool_input {file_path, content}). Claude matchers Bash and Write select Execute and Create; the payload reports the Droid name. Execute's input key is not documented. ApplyPatch's input key is not documented: patch keys command, patch and input are unverified candidates.",
        tools: {
            Execute: SHELL, Edit: WRITE, Create: WRITE, ApplyPatch: PATCH, Read: READ, LS: SEARCH, Glob: SEARCH, Grep: SEARCH,
            Task: OTHER, FetchUrl: OTHER, WebSearch: OTHER,
        },
        input: { command: ["command"], path: ["file_path"], patch: PATCH_KEYS_UNVERIFIED },
    },
    {
        id: "kiro",
        source: "Kiro CLI V3 / IDE 1.x, research tool_names (kiro.dev/docs/tools.md) + skeptic tool_names: execute_bash is macOS/Linux, execute_pwsh Windows; 2.x names read, fs_read, fsRead, shell, execute_cmd, write. Only read_file's path key is documented; command is not.",
        tools: {
            execute_bash: sh("posix"), execute_pwsh: sh("powershell"), execute_cmd: SHELL, shell: SHELL,
            fs_write: WRITE, fs_append: WRITE, str_replace: WRITE, delete_file: WRITE, write: WRITE,
            read_file: READ, read: READ, fs_read: READ, fsRead: READ,
            list_directory: SEARCH, file_search: SEARCH, grep_search: SEARCH, grep: SEARCH, glob: SEARCH,
            web_fetch: OTHER, remote_web_search: OTHER, invoke_sub_agent: OTHER,
        },
        input: { command: ["command"], path: ["path"], patch: NONE },
    },
    {
        id: "copilot",
        source: "Copilot CLI, research tool_names (cli-hooks-reference tool table; skeptic: powershell maps to Bash under PascalCase events). Shell args carry command. Camel-case payloads use toolName/toolArgs (lib/hook-io.mjs reads them). Under PascalCase events powershell is reported as Bash, so Copilot's Bash has an unknown flavor. apply_patch's input key is not documented: patch keys command, patch and input are unverified candidates. str_replace_editor and create name no argument keys in the research (tool_names: `edit` (also `str_replace_editor`, `apply_patch`), `create` (file write)): their path keys path, file_path, filePath and target_file are unverified candidates, and a call naming none of them is denied, not allowed.",
        tools: {
            Bash: SHELL, bash: sh("posix"), powershell: sh("powershell"), edit: WRITE, str_replace_editor: WRITE_PATH_UNVERIFIED, apply_patch: PATCH,
            create: WRITE_PATH_UNVERIFIED, view: READ, grep: SEARCH, rg: SEARCH, glob: SEARCH, web_fetch: OTHER, web_search: OTHER,
        },
        input: { command: ["command"], path: NONE, patch: PATCH_KEYS_UNVERIFIED },
    },
    {
        id: "auggie",
        source: "Auggie 1.2.2, research tool_names (bash, read, edit, write, grep, find; legacy 0.x launch-process, view, str-replace-editor, save-file) + hook_payload_example (bash tool_input {command}). The legacy str-replace-editor and save-file name no argument keys in the research: their path keys path, file_path, filePath and target_file are unverified candidates, and a call naming none of them is denied, not allowed.",
        tools: {
            bash: sh("posix"), "launch-process": SHELL, read: READ, view: READ, edit: WRITE, write: WRITE,
            "str-replace-editor": WRITE_PATH_UNVERIFIED, "save-file": WRITE_PATH_UNVERIFIED, grep: SEARCH, find: SEARCH, "web-fetch": OTHER, "web-search": OTHER,
        },
        input: { command: ["command"], path: NONE, patch: NONE },
    },
    {
        id: "junie",
        source: "Junie CLI (Early Access hooks), research tool_names: Bash or powershell, Write, Read, Edit, Glob, Grep, apply_patch (not matched by Edit|Write) + hook_payload_example (Bash tool_input {command}). apply_patch's input key is not documented: patch keys command, patch and input are unverified candidates.",
        tools: {
            Bash: sh("posix"), powershell: sh("powershell"), Write: WRITE, Edit: WRITE, apply_patch: PATCH,
            Read: READ, Glob: SEARCH, Grep: SEARCH,
        },
        input: { command: ["command"], path: NONE, patch: PATCH_KEYS_UNVERIFIED },
    },
    {
        id: "goose",
        source: "Goose 1.60, research tool_names: shell {command, timeout_secs}, write {path, content}, edit {path, before, after}, tree, read_image (skeptic: confirmed). Windows shell unverified.",
        tools: { shell: SHELL, write: WRITE, edit: WRITE, tree: SEARCH, read_image: READ },
        input: { command: ["command"], path: ["path"], patch: NONE },
    },
    {
        id: "cline",
        source: "Cline 4.1.27 / CLI 3.0.75, research tool_names (docs.cline.bot/sdk/tools.md: run_commands reads commands/command/cmd, read_files reads files/path/paths/file_paths) + skeptic legacy names. Payloads use preToolUse.toolName and parameters (lib/hook-io.mjs reads them). apply_patch's input key is not documented: patch keys command, patch and input are unverified candidates.",
        tools: {
            run_commands: SHELL, execute_command: SHELL, editor: WRITE, apply_patch: PATCH, replace_in_file: WRITE,
            write_to_file: WRITE, delete_file: WRITE, read_files: READ, read_file: READ, list_files: SEARCH,
            search_codebase: SEARCH, search_files: SEARCH, list_code_definition_names: SEARCH, spawn_agent: OTHER,
        },
        input: { command: ["commands", "command", "cmd"], path: ["path", "paths", "file_paths"], patch: PATCH_KEYS_UNVERIFIED },
    },
];
const CLAUDE_NAMES = new Set(CLAUDE_TOOL_NAMES);
function union(left, right) {
    return [...new Set([...left, ...right])];
}
// A tool's own path keys (ToolSpec.pathKeys) replace its profile's.
function inputFor(profile, spec) {
    return spec.pathKeys === undefined ? profile.input : { ...profile.input, path: spec.pathKeys };
}
function buildInbound() {
    const inbound = new Map();
    for (const profile of AGENT_PROFILES) {
        for (const [name, spec] of Object.entries(profile.tools)) {
            if (CLAUDE_NAMES.has(name))
                continue;
            const flavor = spec.flavor ?? "unknown";
            const seen = inbound.get(name);
            if (seen === undefined) {
                inbound.set(name, { name, kind: spec.kind, flavor, agents: [profile.id], input: inputFor(profile, spec), pathRequired: spec.pathKeys !== undefined });
                continue;
            }
            const input = inputFor(profile, spec);
            // Two agents that disagree on a kind would be a table error (a test
            // pins it); the shell reading wins so the call is still gated.
            inbound.set(name, {
                name,
                kind: seen.kind === "shell" || spec.kind === "shell" ? "shell" : seen.kind,
                flavor: seen.flavor === flavor ? flavor : "unknown",
                agents: [...seen.agents, profile.id],
                input: {
                    command: union(seen.input.command, input.command),
                    path: union(seen.input.path, input.path),
                    patch: union(seen.input.patch, input.patch),
                },
                pathRequired: seen.pathRequired || spec.pathKeys !== undefined,
            });
        }
    }
    return inbound;
}
const INBOUND = buildInbound();
/** The merged alias for a tool name no Claude Code tool uses, or null (a Claude name, an unknown name, not a string). */
export function resolveInboundTool(name) {
    return typeof name === "string" ? (INBOUND.get(name) ?? null) : null;
}
function stringsAt(input, keys) {
    if (input === null || typeof input !== "object" || Array.isArray(input))
        return [];
    const fields = input;
    return keys.map((key) => (Object.hasOwn(fields, key) ? fields[key] : undefined)).filter((v) => typeof v === "string");
}
const PROFILES_BY_ID = new Map(AGENT_PROFILES.map((profile) => [profile.id, profile]));
/** How `agent`'s own profile reads a tool name, Claude names included, or null (no profile, unknown name). */
export function profileTool(agent, name) {
    const tools = PROFILES_BY_ID.get(agent)?.tools;
    return tools !== undefined && Object.hasOwn(tools, name) ? tools[name] : null;
}
/** A shell tool's command string, or null when the tool is no shell or the key is missing. */
export function inboundCommand(tool, input) {
    return tool.kind === "shell" ? (stringsAt(input, tool.input.command)[0] ?? null) : null;
}
/** A patch tool's patch text, or null. */
export function inboundPatchText(tool, input) {
    return tool.kind === "patch" ? (stringsAt(input, tool.input.patch)[0] ?? null) : null;
}
/** The files a file or patch tool names, once each. A patch's come from its headers. */
export function inboundPaths(tool, input) {
    if (tool.kind === "patch")
        return [...new Set(stringsAt(input, tool.input.patch).flatMap(parsePatchPaths))];
    if (tool.kind !== "file-write" && tool.kind !== "file-read")
        return [];
    return [...new Set(stringsAt(input, tool.input.path).filter((path) => path !== ""))];
}
/**
 * The tool names the shell classifiers (destructive-bash, hook-pack-gate) take
 * for a flavor: "Bash" reads POSIX, "PowerShell" reads PowerShell. An unknown
 * flavor on Windows could be either, so it is read as both and a hook denies
 * when either reading does. Elsewhere an unknown shell is POSIX.
 */
export function classifierShells(flavor, platform = process.platform) {
    if (flavor === "posix")
        return ["Bash"];
    if (flavor === "powershell")
        return ["PowerShell"];
    return platform === "win32" ? ["Bash", "PowerShell"] : ["Bash"];
}
