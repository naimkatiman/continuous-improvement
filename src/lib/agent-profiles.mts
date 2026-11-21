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
// Claude Code behaviour does not change. Agent selection, output encoders and
// capability flags come in later PRs of the train. Pure: no I/O.

import { parsePatchPaths } from "./patch-paths.mjs";

export type ToolKind = "shell" | "file-write" | "patch" | "file-read" | "search" | "other";
/** How a shell reads its command. `unknown` is classified as both on Windows. */
export type ShellFlavor = "posix" | "powershell" | "unknown";

export interface ToolSpec {
  kind: ToolKind;
  /** Shell tools only. */
  flavor?: ShellFlavor;
}

export interface InputKeys {
  /** Where a shell tool's command string is. */
  command: readonly string[];
  /** Where a file tool's path is. */
  path: readonly string[];
  /** Where a patch tool's patch text is. */
  patch: readonly string[];
}

export interface AgentProfile {
  id: string;
  /** The research entry the names and keys come from. */
  source: string;
  tools: Readonly<Record<string, ToolSpec>>;
  input: InputKeys;
}

/** One inbound tool name, merged over every agent that uses it. */
export interface InboundTool {
  name: string;
  kind: ToolKind;
  /** The shared flavor, or `unknown` when the agents disagree or the tool is no shell. */
  flavor: ShellFlavor;
  agents: string[];
  input: InputKeys;
}

const sh = (flavor: ShellFlavor): ToolSpec => ({ kind: "shell", flavor });
const SHELL: ToolSpec = sh("unknown");
const WRITE: ToolSpec = { kind: "file-write" };
const PATCH: ToolSpec = { kind: "patch" };
const READ: ToolSpec = { kind: "file-read" };
const SEARCH: ToolSpec = { kind: "search" };
const OTHER: ToolSpec = { kind: "other" };
const NONE: readonly string[] = [];

/**
 * The Claude Code tool names: the ones this repo's hooks route and match
 * (gateguard TOOL_ROUTE, the plugin matchers) and Claude Code's other built-in
 * tools. None of them is ever an inbound alias.
 */
export const CLAUDE_TOOL_NAMES: readonly string[] = [
  "Agent", "AskUserQuestion", "Bash", "BashOutput", "Edit", "EnterPlanMode", "ExitPlanMode", "Glob", "Grep",
  "KillShell", "LS", "ListMcpResourcesTool", "Monitor", "MultiEdit", "NotebookEdit", "NotebookRead", "PowerShell",
  "Read", "ReadMcpResourceTool", "Skill", "SlashCommand", "Task", "TaskOutput", "TaskStop", "TodoWrite", "ToolSearch",
  "WebFetch", "WebSearch", "Write",
];

export const AGENT_PROFILES: readonly AgentProfile[] = [
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
    source: "Devin Local 3000.14 (Windsurf), research tool_names (skeptic: confirmed) + hook_payload_example (exec tool_input {command, shell_id}). The input keys of edit, write and read are not documented. The Windows default shell is PowerShell and exec_shell can pick bash, so the flavor is unknown.",
    tools: {
      exec: SHELL, shell_command: SHELL, edit: WRITE, write: WRITE, apply_patch: PATCH, notebook_edit: WRITE,
      read: READ, notebook_read: READ, grep: SEARCH, glob: SEARCH, find_file_by_name: SEARCH,
      webfetch: OTHER, skill: OTHER, todo_write: OTHER, run_subagent: OTHER,
    },
    input: { command: ["command"], path: NONE, patch: NONE },
  },
  {
    id: "droid",
    source: "Factory Droid 1.17, research tool_names + hook_payload_example (Create tool_input {file_path, content}). Claude matchers Bash and Write select Execute and Create; the payload reports the Droid name. Execute's input key is not documented.",
    tools: {
      Execute: SHELL, Edit: WRITE, Create: WRITE, ApplyPatch: PATCH, Read: READ, LS: SEARCH, Glob: SEARCH, Grep: SEARCH,
      Task: OTHER, FetchUrl: OTHER, WebSearch: OTHER,
    },
    input: { command: ["command"], path: ["file_path"], patch: NONE },
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
    source: "Copilot CLI, research tool_names (cli-hooks-reference tool table; skeptic: powershell maps to Bash under PascalCase events). Shell args carry command. Camel-case payloads use toolName/toolArgs, which these hooks do not read yet.",
    tools: {
      bash: sh("posix"), powershell: sh("powershell"), edit: WRITE, str_replace_editor: WRITE, apply_patch: PATCH,
      create: WRITE, view: READ, grep: SEARCH, rg: SEARCH, glob: SEARCH, web_fetch: OTHER, web_search: OTHER,
    },
    input: { command: ["command"], path: NONE, patch: NONE },
  },
  {
    id: "auggie",
    source: "Auggie 1.2.2, research tool_names (bash, read, edit, write, grep, find; legacy 0.x launch-process, view, str-replace-editor, save-file) + hook_payload_example (bash tool_input {command}).",
    tools: {
      bash: sh("posix"), "launch-process": SHELL, read: READ, view: READ, edit: WRITE, write: WRITE,
      "str-replace-editor": WRITE, "save-file": WRITE, grep: SEARCH, find: SEARCH, "web-fetch": OTHER, "web-search": OTHER,
    },
    input: { command: ["command"], path: NONE, patch: NONE },
  },
  {
    id: "junie",
    source: "Junie CLI (Early Access hooks), research tool_names: Bash or powershell, Write, Read, Edit, Glob, Grep, apply_patch (not matched by Edit|Write) + hook_payload_example (Bash tool_input {command}).",
    tools: {
      Bash: sh("posix"), powershell: sh("powershell"), Write: WRITE, Edit: WRITE, apply_patch: PATCH,
      Read: READ, Glob: SEARCH, Grep: SEARCH,
    },
    input: { command: ["command"], path: NONE, patch: NONE },
  },
  {
    id: "goose",
    source: "Goose 1.60, research tool_names: shell {command, timeout_secs}, write {path, content}, edit {path, before, after}, tree, read_image (skeptic: confirmed). Windows shell unverified.",
    tools: { shell: SHELL, write: WRITE, edit: WRITE, tree: SEARCH, read_image: READ },
    input: { command: ["command"], path: ["path"], patch: NONE },
  },
  {
    id: "cline",
    source: "Cline 4.1.27 / CLI 3.0.75, research tool_names (docs.cline.bot/sdk/tools.md: run_commands reads commands/command/cmd, read_files reads files/path/paths/file_paths) + skeptic legacy names. Payloads use preToolUse.toolName, which these hooks do not read yet.",
    tools: {
      run_commands: SHELL, execute_command: SHELL, editor: WRITE, apply_patch: PATCH, replace_in_file: WRITE,
      write_to_file: WRITE, delete_file: WRITE, read_files: READ, read_file: READ, list_files: SEARCH,
      search_codebase: SEARCH, search_files: SEARCH, list_code_definition_names: SEARCH, spawn_agent: OTHER,
    },
    input: { command: ["commands", "command", "cmd"], path: ["path", "paths", "file_paths"], patch: NONE },
  },
];

const CLAUDE_NAMES: ReadonlySet<string> = new Set(CLAUDE_TOOL_NAMES);

function union(left: readonly string[], right: readonly string[]): string[] {
  return [...new Set([...left, ...right])];
}

function buildInbound(): ReadonlyMap<string, InboundTool> {
  const inbound = new Map<string, InboundTool>();
  for (const profile of AGENT_PROFILES) {
    for (const [name, spec] of Object.entries(profile.tools)) {
      if (CLAUDE_NAMES.has(name)) continue;
      const flavor = spec.flavor ?? "unknown";
      const seen = inbound.get(name);
      if (seen === undefined) {
        inbound.set(name, { name, kind: spec.kind, flavor, agents: [profile.id], input: profile.input });
        continue;
      }
      // Two agents that disagree on a kind would be a table error (a test
      // pins it); the shell reading wins so the call is still gated.
      inbound.set(name, {
        name,
        kind: seen.kind === "shell" || spec.kind === "shell" ? "shell" : seen.kind,
        flavor: seen.flavor === flavor ? flavor : "unknown",
        agents: [...seen.agents, profile.id],
        input: {
          command: union(seen.input.command, profile.input.command),
          path: union(seen.input.path, profile.input.path),
          patch: union(seen.input.patch, profile.input.patch),
        },
      });
    }
  }
  return inbound;
}

const INBOUND: ReadonlyMap<string, InboundTool> = buildInbound();

/** The merged alias for a tool name no Claude Code tool uses, or null (a Claude name, an unknown name, not a string). */
export function resolveInboundTool(name: unknown): InboundTool | null {
  return typeof name === "string" ? (INBOUND.get(name) ?? null) : null;
}

function stringsAt(input: unknown, keys: readonly string[]): string[] {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return [];
  const fields = input as Record<string, unknown>;
  return keys.map((key) => (Object.hasOwn(fields, key) ? fields[key] : undefined)).filter((v): v is string => typeof v === "string");
}

/** A shell tool's command string, or null when the tool is no shell or the key is missing. */
export function inboundCommand(tool: InboundTool, input: unknown): string | null {
  return tool.kind === "shell" ? (stringsAt(input, tool.input.command)[0] ?? null) : null;
}

/** A patch tool's patch text, or null. */
export function inboundPatchText(tool: InboundTool, input: unknown): string | null {
  return tool.kind === "patch" ? (stringsAt(input, tool.input.patch)[0] ?? null) : null;
}

/** The files a file or patch tool names, once each. A patch's come from its headers. */
export function inboundPaths(tool: InboundTool, input: unknown): string[] {
  if (tool.kind === "patch") return [...new Set(stringsAt(input, tool.input.patch).flatMap(parsePatchPaths))];
  if (tool.kind !== "file-write" && tool.kind !== "file-read") return [];
  return [...new Set(stringsAt(input, tool.input.path).filter((path) => path !== ""))];
}

/**
 * The tool names the shell classifiers (destructive-bash, hook-pack-gate) take
 * for a flavor: "Bash" reads POSIX, "PowerShell" reads PowerShell. An unknown
 * flavor on Windows could be either, so it is read as both and a hook denies
 * when either reading does. Elsewhere an unknown shell is POSIX.
 */
export function classifierShells(flavor: ShellFlavor, platform: string = process.platform): Array<"Bash" | "PowerShell"> {
  if (flavor === "posix") return ["Bash"];
  if (flavor === "powershell") return ["PowerShell"];
  return platform === "win32" ? ["Bash", "PowerShell"] : ["Bash"];
}
