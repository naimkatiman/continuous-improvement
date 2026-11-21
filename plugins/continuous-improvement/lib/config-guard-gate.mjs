// config-guard-gate.mts — Pure decision core for the config-guard PreToolUse hook.
//
// The guardrails this plugin ships are wired by a handful of files: the
// Claude Code settings files, the MCP config, hooks.json, the user hooks
// directory, the installed-plugins cache, and plugin manifests. Nothing stopped
// an agent from editing those files and switching every gate off, and
// hooks/gateguard.mjs is designed to be cleared per file, not to hard-deny. This
// module decides whether a tool call would mutate one of them. No I/O: the hook
// (src/hooks/config-guard.mts) wires stdin and the mode env var around it, so a
// table test covers every branch without spawning anything. Lives in lib/ so
// tests can import it (the test-imports-only invariant forbids hooks/).
//
// Idea ported from karanb192/claude-code-hooks `config-guard` (MIT); the code
// and the pattern list are ours. Fail-open by construction: an unrecognized mode
// resolves to warn, and a call that names no protected path is always allowed.
import { inboundCommand, inboundPaths, resolveInboundTool } from "./agent-profiles.mjs";
/**
 * Path patterns, matched case-insensitively on the forward-slash form.
 * A trailing "/" means a directory: anything inside it, and the directory
 * itself when the path ends with its name (`.claude/hooks`), since removing or
 * renaming the directory takes every file in it along. Otherwise the pattern
 * must be the whole path or a trailing path segment, so `hooks.json.md` and
 * `config/settings.json` are not matched.
 */
const CLAUDE_PATTERNS = [
    ".claude/settings.json",
    ".claude/settings.local.json",
    ".mcp.json",
    "hooks.json",
    ".claude/hooks/",
    ".claude/plugins/",
    ".claude-plugin/",
];
// The files and directories that wire the other agents' hooks, MCP servers,
// extensions and plugins (all-agents plan, Architecture item 15). Each comes
// from the verified research in result.json (research[] capabilities, with the
// skeptic verify[] verdicts, checked 2026-11-21). `hooks.json` above already
// covers .codex/hooks.json, .cursor/hooks.json and .factory/hooks.json, and a
// hooks/hooks.json inside an extension or plugin. They come after the Claude
// patterns, so a Claude path still reports the pattern it always did.
const AGENT_PATTERNS = [
    // Codex: [mcp_servers], inline [hooks] and plugin enablement (research Codex mcp_servers, hook_pre_tool).
    ".codex/config.toml",
    // Gemini: mcpServers and hooks in settings.json; extensions in ~/.gemini/extensions (mcp_servers, plugin_or_extension_packaging).
    ".gemini/settings.json",
    ".gemini/extensions/",
    // Cursor: project and user mcp.json (mcp_servers).
    ".cursor/mcp.json",
    // Copilot: .github/hooks/*.json, ~/.copilot/hooks/, inline hooks in .github/copilot/settings(.local).json and ~/.copilot/settings.json (hook_pre_tool).
    ".github/hooks/",
    ".github/copilot/settings.json",
    ".github/copilot/settings.local.json",
    ".copilot/hooks/",
    ".copilot/settings.json",
    // Devin Local: .devin/hooks.v1.json, or a hooks key in .devin/config(.local).json or %APPDATA%\devin\config.json (hook_pre_tool).
    ".devin/hooks.v1.json",
    ".devin/config.json",
    ".devin/config.local.json",
    "AppData/Roaming/devin/config.json",
    // Kiro: .kiro/hooks/*.json and ~/.kiro/hooks/, and inline hooks in an agent profile under .kiro/agents/ and
    // ~/.kiro/agents/ (research Kiro hook_pre_tool and subagents; skeptic hook_pre_tool: V2-harness sessions use
    // agent-profile hooks).
    ".kiro/hooks/",
    ".kiro/agents/",
    // Qwen: mcpServers and hooks in settings.json; extensions in <home>/.qwen/extensions (mcp_servers, plugin_or_extension_packaging).
    ".qwen/settings.json",
    ".qwen/extensions/",
    // Grok: hooks/*.json, and config.toml for [mcp_servers], [[hooks.PreToolUse]] and [plugins] enabled
    // (mcp_servers, hook_pre_tool). The Grok TUI is the same binary with GROK_HOME=~/.grok-tui (versions_checked).
    ".grok/hooks/",
    ".grok/config.toml",
    ".grok-tui/hooks/",
    ".grok-tui/config.toml",
    // Cline: the VS Code extension scans ~/Documents/Cline/Hooks and .clinerules/hooks; the CLI also ~/.cline/hooks
    // and .cline/hooks (skeptic verdict hook_pre_tool).
    ".clinerules/hooks/",
    ".cline/hooks/",
    "Documents/Cline/Hooks/",
    // Factory Droid: a hooks key in ~/.factory/settings.json (hook_pre_tool).
    ".factory/settings.json",
    // Auggie: hooks and mcpServers in .augment/settings(.local).json and ~/.augment/settings.json (mcp_servers, hook_pre_tool).
    ".augment/settings.json",
    ".augment/settings.local.json",
    // Junie: hooks in ~/.junie/config.json (hook_pre_tool).
    ".junie/config.json",
    // OpenCode V1: plugins load from .opencode/plugins/ and ~/.config/opencode/plugins/ (plugin_or_extension_packaging).
    ".opencode/plugins/",
    ".config/opencode/plugins/",
    // Amp: plugins live in .amp/plugins/ and ~/.config/amp/plugins/ (hook_pre_tool).
    ".amp/plugins/",
    ".config/amp/plugins/",
    // Agent Plugins (agent-plugins.org v1) under ~/.agents/plugins/ and <project>/.agents/plugins/: Goose loads hooks only from
    // a plugin dir there, and Cline reads the same tree (Goose hook_pre_tool, Cline plugin_or_extension_packaging).
    ".agents/plugins/",
];
export const PROTECTED_PATTERNS = [...CLAUDE_PATTERNS, ...AGENT_PATTERNS];
const ALLOW = { action: "allow", reason: "" };
export function parseMode(raw) {
    const v = (raw ?? "warn").trim().toLowerCase();
    return v === "block" || v === "off" ? v : "warn";
}
function normalizePath(p) {
    return p.replace(/\\/g, "/").toLowerCase();
}
// `directoryItself` says whether a protected directory named by its bare name
// (`.claude/hooks`) counts. It does for a delete, a move or a copy into it; it
// does not where the path is only mentioned, because `ls .claude/hooks` and
// `mkdir -p .claude/hooks` change no file in it.
function matchProtected(filePath, directoryItself) {
    if (typeof filePath !== "string" || filePath === "")
        return null;
    const n = normalizePath(filePath);
    for (const pattern of PROTECTED_PATTERNS) {
        const lp = pattern.toLowerCase();
        if (lp.endsWith("/")) {
            const dir = lp.slice(0, -1);
            if (n.includes(lp) || (directoryItself && (n === dir || n.endsWith(`/${dir}`))))
                return pattern;
            continue;
        }
        if (n === lp || n.endsWith(`/${lp}`))
            return pattern;
    }
    return null;
}
export function matchProtectedPath(filePath) {
    return matchProtected(filePath, true);
}
// --- file tools ------------------------------------------------------------
function fileToolPaths(toolInput) {
    const paths = [];
    if (typeof toolInput.file_path === "string")
        paths.push(toolInput.file_path);
    if (typeof toolInput.notebook_path === "string")
        paths.push(toolInput.notebook_path);
    if (Array.isArray(toolInput.edits)) {
        for (const edit of toolInput.edits) {
            if (edit && typeof edit === "object" && typeof edit.file_path === "string") {
                paths.push(edit.file_path);
            }
        }
    }
    return paths;
}
const FILE_MUTATING_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
// The tools whose input is a shell command. Claude Code on Windows exposes a
// first-class PowerShell tool with the same { command } input as Bash, and the
// Monitor tool runs its { command } in the same shell as Bash; a write to a
// protected file is the same write through any of them, so all three run the
// shell classifier below (and all report `via: "bash"`). A Monitor call in its
// { ws } form has no command and is allowed.
const SHELL_TOOLS = new Set(["Bash", "PowerShell", "Monitor"]);
// --- Bash --------------------------------------------------------------------
// Split at shell separators that sit outside single or double quotes. With
// `blocks`, an unquoted `{`, `}`, `(` or `)` ends a command too, so the body of
// a PowerShell script block (`if ($?) { Copy-Item a b }`) is a segment of its own.
function splitSimpleCommands(command, blocks) {
    const segments = [];
    let current = "";
    let quote = null;
    for (let i = 0; i < command.length; i++) {
        const ch = command[i];
        if (quote) {
            current += ch;
            if (ch === quote)
                quote = null;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            current += ch;
            continue;
        }
        if (ch === "\n" || ch === ";" || (blocks && (ch === "{" || ch === "}" || ch === "(" || ch === ")"))) {
            segments.push(current);
            current = "";
            continue;
        }
        // The `&` of a redirect is not a separator: `2>&1`, `>&2`, `<&3`. Nor is
        // the one that opens `&>file`, which becomes a word of its own.
        if (ch === "&" && (command[i - 1] === ">" || command[i - 1] === "<")) {
            current += ch;
            continue;
        }
        if (ch === "&" && command[i + 1] === ">") {
            current += /\S/.test(current.slice(-1)) ? " &" : "&";
            continue;
        }
        if (ch === "|" || ch === "&") {
            if (command[i + 1] === ch)
                i++;
            segments.push(current);
            current = "";
            continue;
        }
        current += ch;
    }
    segments.push(current);
    return segments.map((s) => s.trim()).filter((s) => s !== "");
}
// The plain split first, so a one-liner that keeps its parentheses in one
// segment (`[IO.File]::WriteAllText(...)`) is still seen whole; then the block
// split, for a command that only starts after `{` or `(`.
function allSimpleCommands(command) {
    return [...splitSimpleCommands(command, false), ...splitSimpleCommands(command, true)];
}
function tokenize(segment) {
    return segment.split(/\s+/).filter((t) => t !== "");
}
function stripQuotes(token) {
    return token.replace(/^['"]+|['"]+$/g, "");
}
// Split at whitespace that sits outside quotes and outside parentheses, so a
// path built by an expression is one argument:
// `(Join-Path $HOME '.claude\settings.json')`, `"$(Resolve-Path .mcp.json)"`.
function splitArguments(segment) {
    const args = [];
    let current = "";
    let quote = null;
    let depth = 0;
    for (const ch of segment) {
        if (quote) {
            if (ch === quote)
                quote = null;
        }
        else if (ch === '"' || ch === "'") {
            quote = ch;
        }
        else if (ch === "(") {
            depth++;
        }
        else if (ch === ")") {
            if (depth > 0)
                depth--;
        }
        else if (depth === 0 && /\s/.test(ch)) {
            if (current !== "")
                args.push(current);
            current = "";
            continue;
        }
        current += ch;
    }
    if (current !== "")
        args.push(current);
    return args;
}
// An argument that is computed, not written out: it opens with `(`, `$(` or
// `@(`, bare or inside quotes.
function isExpression(arg) {
    return /^["']?[$@]?\(/.test(arg);
}
// The protected path one argument names. A literal is matched whole. An
// expression is matched by the literal parts it is built from, one by one and
// joined, which covers `(Join-Path $HOME '.claude\settings.json')` and
// `(Join-Path (Join-Path $HOME '.claude') 'settings.json')`.
function protectedIn(arg, directoryItself) {
    const plain = stripQuotes(arg);
    const whole = matchProtected(plain, directoryItself);
    if (whole)
        return { target: plain, pattern: whole };
    if (!isExpression(arg))
        return null;
    const parts = plain.split(/[\s()'",;]+/).filter((part) => part !== "");
    for (const candidate of [...parts, parts.join("/")]) {
        const pattern = matchProtected(candidate, directoryItself);
        if (pattern)
            return { target: candidate, pattern };
    }
    return null;
}
// PowerShell parameters that name the file a cmdlet writes, and the common
// ones that take no value. Any unambiguous prefix is accepted, as PowerShell
// does (`-Pa`, `-Fo`).
const PATH_PARAMETERS = ["path", "literalpath", "lp", "pspath", "filepath"];
const SWITCH_PARAMETERS = [
    "force",
    "recurse",
    "nonewline",
    "passthru",
    "append",
    "noclobber",
    "whatif",
    "confirm",
    "verbose",
    "debug",
    "asbytestream",
    "notypeinformation",
];
const names = (list, given) => list.some((name) => name.startsWith(given));
// The expression arguments of a write that stand where the path goes. For a
// command whose every operand is a file (`rm`, `tee`, Remove-Item) that is any
// of them. For a PowerShell content writer it is the value of a path parameter
// or, when none is named, the first positional argument: the second one is the
// content (`Set-Content out.txt (Get-Content .mcp.json)` writes out.txt).
function expressionPaths(args, everyOperand) {
    const words = withoutRedirects(args);
    if (everyOperand)
        return words.filter(isExpression);
    const paths = [];
    const pathNamed = words.some((word) => /^-[A-Za-z]+/.test(word) && names(PATH_PARAMETERS, word.slice(1).split(":")[0].toLowerCase()));
    let bound = null;
    let operands = 0;
    for (const word of words) {
        const parameter = /^-([A-Za-z]+)(?::(.+))?$/s.exec(word);
        if (parameter) {
            const name = parameter[1].toLowerCase();
            const isPath = names(PATH_PARAMETERS, name);
            if (parameter[2] !== undefined) {
                if (isPath && isExpression(parameter[2]))
                    paths.push(parameter[2]);
                bound = null;
            }
            else {
                bound = isPath ? "path" : names(SWITCH_PARAMETERS, name) ? null : "other";
            }
            continue;
        }
        const inPathPosition = bound === "path" || (bound === null && !pathNamed && operands === 0);
        if (inPathPosition && isExpression(word))
            paths.push(word);
        if (bound === null)
            operands++;
        bound = null;
    }
    return paths;
}
function commandWord(tokens) {
    let i = 0;
    while (i < tokens.length) {
        const t = tokens[i];
        if (t === "sudo" || t === "env" || t === "command" || /^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) {
            i++;
            continue;
        }
        // PowerShell output capture: `$null = New-Item -Force settings.json`.
        if (/^\$[A-Za-z_][\w:]*$/.test(t) && /^\+?=$/.test(tokens[i + 1] ?? "")) {
            i += 2;
            continue;
        }
        break;
    }
    return { cmd: (tokens[i] ?? "").toLowerCase(), rest: tokens.slice(i + 1) };
}
// Command words by what they do to an operand. PowerShell cmdlets are listed
// with their built-in aliases (sc, ac, clc, ni, ri, cpi, mi, rni) and the
// cmd.exe names PowerShell also aliases (copy, move, ren, del, erase, rd).
// Copy: only the destination is written. Move and rename: the source goes too.
const COPY_COMMANDS = new Set(["cp", "copy-item", "copy", "cpi"]);
const MOVE_COMMANDS = new Set(["mv", "move-item", "move", "mi", "rename-item", "ren", "rni"]);
// Delete: a protected directory named itself goes with everything in it.
const DELETE_COMMANDS = new Set(["rm", "rmdir", "rd", "remove-item", "ri", "del", "erase"]);
// Content writers: an operand is a file that is written or created.
const OPERAND_WRITERS = new Set([
    "tee",
    "truncate",
    "set-content",
    "sc",
    "out-file",
    "add-content",
    "ac",
    "clear-content",
    "clc",
    "new-item",
    "ni",
    "export-clixml",
    "export-csv",
]);
// Mutation indicators for the generic scan (a protected path mentioned inside
// a scripting one-liner such as `node -e "writeFileSync('.claude/settings.json')"`
// or a .NET call such as `[IO.File]::WriteAllText('.mcp.json', '{}')`).
const GENERIC_WRITE_RE = /writefilesync|writefile\(|appendfile|unlink|rename\(|copyfile|rmsync|truncate|set-content|out-file|add-content|remove-item|writealltext|writealllines|writeallbytes|appendalltext|appendalllines|\]::delete\(|\]::move\(|\]::copy\(|\bdel\b|\bsed\s+-i\b|\btee\b|>{1,2}/i;
// The indicators above that remove or rename what they name. Next to one of
// these a protected directory named itself counts, as it does for `rm`.
const GENERIC_REMOVE_RE = /unlink|rename\(|rmsync|remove-item|\]::delete\(|\]::move\(|\bdel\b/i;
// The other agents' patterns embedded in a longer expression, the way the
// generic scan finds `.claude/` inside `writeFileSync(.claude/settings.json)`.
// A separate pass after the Claude one, so a Claude path is found as before.
const AGENT_EMBEDDED_RE = new RegExp(String.raw `(?:^|[('"\s=,])([~A-Za-z0-9_./\\:-]*(?:` +
    AGENT_PATTERNS.map((pattern) => pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\//g, String.raw `[\\/]`)).join("|") +
    String.raw `)[A-Za-z0-9_./\\-]*)`, "i");
// A redirect to another descriptor or to the null device writes no file:
// `2>&1`, `>&2`, `2>/dev/null`, `>/dev/null`, `&>/dev/null`, `2>$null`, `*>$null`,
// `>NUL`. It is not a write indicator.
const FD_REDIRECT_RE = /[\d*&]?>{1,2}\s*(?:&(?:\d|-)|(?:\/dev\/null|\$null|nul)(?![\w./\\-]))/gi;
// The path-like values a command names: its bare operands, plus the value of a
// PowerShell colon-bound parameter (`-Path:settings.json`). Switch names and
// the names of space-separated parameters are dropped; their values are
// ordinary operands.
function operandValues(rest) {
    const values = [];
    for (const t of rest) {
        if (!t.startsWith("-")) {
            values.push(stripQuotes(t));
            continue;
        }
        const colon = t.indexOf(":");
        if (colon > 1 && colon < t.length - 1)
            values.push(stripQuotes(t.slice(colon + 1)));
    }
    return values;
}
// A redirect is not an argument of the command: `2>&1`, `>/dev/null`,
// `2>$null`. A bare operator (`>`, `2>`) takes the next word as its file.
const REDIRECT_WORD_RE = /^(?:\d+|[*&])?[<>]/;
const BARE_REDIRECT_RE = /^(?:\d+|[*&])?[<>]+$/;
function withoutRedirects(words) {
    const kept = [];
    for (let i = 0; i < words.length; i++) {
        if (!REDIRECT_WORD_RE.test(words[i]))
            kept.push(words[i]);
        else if (BARE_REDIRECT_RE.test(words[i]))
            i++;
    }
    return kept;
}
// Where a copy may write. Named, it is the value of PowerShell's -Destination
// (which can come before the source) or of cp's -t / --target-directory.
// Otherwise it is the last positional operand, and "last" needs care, because
// what follows the destination is not a path: a redirect, a switch, a
// colon-bound switch value (`-Confirm:$false`), the value of a named parameter
// (`-ErrorAction Stop`). A word right after a parameter name may be that
// parameter's value or, after a switch, the next path (`cp new.json -f target`),
// so the candidates are the last operand that is certainly positional and every
// operand after it. The first operand of several is a source, never the
// destination: `cp .claude/settings.json backup/` is a backup.
function copyDestinations(rest) {
    const words = withoutRedirects(rest);
    for (let i = 0; i < words.length; i++) {
        const named = /^(?:-des[a-z]*|-t|--target-directory)(?:[:=](.+))?$/i.exec(words[i]);
        if (!named)
            continue;
        const value = named[1] ?? words[i + 1];
        return value ? [value] : [];
    }
    const operands = [];
    for (let i = 0; i < words.length; i++) {
        if (words[i].startsWith("-"))
            continue;
        const before = words[i - 1] ?? "";
        operands.push({ text: words[i], afterName: before.startsWith("-") && !/[:=]/.test(before) });
    }
    let last = operands.length - 1;
    while (last > 0 && operands[last].afterName)
        last--;
    return operands.slice(operands.length > 1 ? Math.max(1, last) : 0).map((operand) => operand.text);
}
// New-Item can name its target in two parts: `-Path .claude -Name settings.json`.
// Returns the joined path, or null when either part is missing.
function newItemTarget(args) {
    const words = withoutRedirects(args);
    let path = null;
    let name = null;
    for (let i = 0; i < words.length; i++) {
        const parameter = /^-([A-Za-z]+)(?::(.+))?$/s.exec(words[i]);
        if (!parameter) {
            path ??= words[i];
            continue;
        }
        const given = parameter[1].toLowerCase();
        if (parameter[2] === undefined && names(SWITCH_PARAMETERS, given))
            continue;
        const value = parameter[2] ?? words[++i];
        if (value === undefined)
            break;
        if ("name".startsWith(given))
            name = value;
        else if (names(PATH_PARAMETERS, given))
            path = value;
    }
    if (path === null || name === null)
        return null;
    const directory = stripQuotes(path);
    const head = isExpression(path) ? directory.split(/[\s()'",;]+/).filter((part) => part !== "").join("/") : directory;
    return `${head}/${stripQuotes(name)}`;
}
// A download writes the file its output option names: `curl -o`, `wget -O`,
// PowerShell's `-OutFile`.
const DOWNLOAD_COMMANDS = new Set(["curl", "curl.exe", "wget", "wget.exe", "invoke-webrequest", "iwr", "invoke-restmethod", "irm"]);
const OUTPUT_OPTION_RE = /^(?:-[oO]|--output|--output-document|-[oO][uU][tT][fF][a-zA-Z]*)(?:[:=](.+))?$/s;
function downloadTarget(args) {
    for (let i = 0; i < args.length; i++) {
        const option = OUTPUT_OPTION_RE.exec(args[i]);
        if (option)
            return option[1] ?? args[i + 1] ?? null;
    }
    return null;
}
const CLAUDE_CLI_MUTATIONS = {
    plugin: new Set(["install", "uninstall", "enable", "disable", "update", "marketplace"]),
    mcp: new Set(["add", "remove", "add-json", "add-from-claude-desktop", "reset-project-choices"]),
    config: new Set(["set", "add", "remove", "reset", "rm"]),
};
// `<cli> <area> <verb>` forms of the other agents' CLIs that rewrite their
// plugin, MCP, extension or hook configuration. An area of two words
// (`plugin marketplace`) is tried before one. Global flags and their values
// may come first. Only the verbs the verified research or a skeptic correction
// names are listed (result.json, checked 2026-11-21 and again 2026-11-22), so
// the listing, inspecting and validating forms stay allowed:
// - codex: research Codex mcp_servers (`codex mcp add`, `codex mcp list|get|remove`) and
//   plugin_or_extension_packaging (`codex plugin add|remove`, `codex plugin marketplace add|upgrade|remove`).
// - gemini: research Gemini mcp_servers (`gemini mcp add`, project scope by default per the skeptic),
//   plugin_or_extension_packaging (`gemini extensions install|link`, `gemini hooks migrate --from-claude`,
//   which writes .gemini/settings.json; unknowns: `gemini hooks` has only `migrate`).
// - qwen: research Qwen mcp_servers (`qwen mcp add`, `qwen mcp list|remove|reconnect|approve|reject`;
//   skeptic: approve|reject act on pending servers) and plugin_or_extension_packaging (`qwen extensions install|link`,
//   "Also uninstall/update/enable/disable/new/settings/sources"; of those, uninstall, update, enable and disable
//   change which extensions load).
// - grok: research Grok mcp_servers (`grok mcp add`, `grok mcp enable|disable`) and
//   plugin_or_extension_packaging (`grok plugin install`, `grok plugin enable|disable|update|uninstall`,
//   `grok plugin marketplace add`; skeptic: `grok plugin --help` lists them).
// - copilot: research Copilot mcp_servers (`copilot mcp add`; skeptic: `remove`, `disable` and `enable` also exist)
//   and plugin_or_extension_packaging (`copilot plugin install` (alias add), uninstall, update, enable, disable,
//   `copilot plugin marketplace add|list|browse|update|remove`; skeptic: "uninstall (remove, rm), marketplace
//   update (refresh)").
// - devin: research Devin mcp_servers (`devin mcp add`, plus enable, disable and remove),
//   plugin_or_extension_packaging (`devin plugins install`, "Manage with plugins list, info, update, remove and
//   prune") and no_model_checks (`devin migrate hooks`
//   writes .devin/hooks.v1.json).
const AGENT_CLI_MUTATIONS = new Map(Object.entries({
    codex: {
        plugin: ["add", "remove"],
        "plugin marketplace": ["add", "upgrade", "remove"],
        mcp: ["add", "remove"],
    },
    gemini: { extensions: ["install", "link"], mcp: ["add"], hooks: ["migrate"] },
    qwen: { extensions: ["install", "link", "uninstall", "update", "enable", "disable"], mcp: ["add", "remove", "approve", "reject"] },
    grok: {
        plugin: ["install", "uninstall", "update", "enable", "disable"],
        "plugin marketplace": ["add"],
        mcp: ["add", "enable", "disable"],
    },
    copilot: {
        plugin: ["install", "add", "uninstall", "remove", "rm", "update", "enable", "disable"],
        "plugin marketplace": ["add", "update", "refresh", "remove"],
        mcp: ["add", "remove", "enable", "disable"],
    },
    devin: { plugins: ["install", "update", "remove", "prune"], mcp: ["add", "enable", "disable", "remove"], migrate: ["hooks"] },
}).map(([cli, areas]) => [cli, new Map(Object.entries(areas).map(([area, verbs]) => [area, new Set(verbs)]))]));
// The CLI a command word names: its last path segment without a Windows
// launcher suffix (`C:\...\grok.exe`, `gemini.cmd`, `/usr/local/bin/qwen`).
// The word comes from splitArguments, so a quoted path with a space is one word.
function cliName(cmd) {
    return stripQuotes(cmd).replace(/^.*[\\/]/, "").replace(/\.(?:exe|cmd)$/, "");
}
function classifyAgentCli({ cmd, rest }) {
    const cli = cliName(cmd);
    const areas = AGENT_CLI_MUTATIONS.get(cli);
    if (!areas)
        return null;
    const words = rest.map((word) => stripQuotes(word).toLowerCase());
    for (let i = 0; i < words.length; i++) {
        for (const depth of [2, 1]) {
            const area = words.slice(i, i + depth).join(" ");
            const verb = words[i + depth];
            if (verb !== undefined && areas.get(area)?.has(verb)) {
                return { target: `${cli} ${area} ${verb}`, pattern: `${cli}-cli`, via: "agent-cli" };
            }
        }
        // Only a global flag (`-c`, `--profile=x`) or the value after one may
        // come before the area: `codex -c x=1 mcp remove`.
        const previous = words[i - 1];
        const isValue = previous !== undefined && previous.startsWith("-") && !previous.includes("=");
        if (!words[i].startsWith("-") && !isValue)
            break;
    }
    return null;
}
function classifyBashSegment(segment) {
    const tokens = tokenize(segment);
    if (tokens.length === 0)
        return null;
    const { cmd, rest } = commandWord(tokens);
    // `claude plugin|mcp|config <mutating-verb>`: the CLI edits the same files.
    if (cmd === "claude") {
        const area = (rest[0] ?? "").toLowerCase();
        const verb = (rest[1] ?? "").toLowerCase();
        const verbs = CLAUDE_CLI_MUTATIONS[area];
        if (verbs && verbs.has(verb)) {
            return { target: `claude ${area} ${verb}`, pattern: "claude-cli", via: "claude-cli" };
        }
        return null;
    }
    // Another agent's CLI verb that rewrites its configuration. A form that is
    // not one goes on through the checks below, so a redirect behind it is seen.
    const agentCli = classifyAgentCli(commandWord(splitArguments(segment)));
    if (agentCli)
        return agentCli;
    // Redirects: `> path`, `>> path`, `2>path`, `>path`, `&>path`, `*> path`.
    // They come first: the output of any command, a copy included, can be sent
    // into a protected file.
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const m = /^((?:\d+|[*&])?>{1,2})(.*)$/.exec(t);
        if (!m)
            continue;
        const target = m[2] !== "" ? m[2] : (tokens[i + 1] ?? "");
        const pattern = matchProtected(stripQuotes(target), false);
        if (pattern)
            return { target: stripQuotes(target), pattern, via: "bash" };
    }
    // The same arguments with a quoted string or a parenthesised expression kept
    // in one piece, for the branches that have to know which argument is a path.
    const args = () => commandWord(splitArguments(segment)).rest;
    // Copy: only the destination can be a protected write; a protected source is
    // a read (a backup).
    if (COPY_COMMANDS.has(cmd)) {
        for (const candidate of copyDestinations(args())) {
            const hit = protectedIn(candidate, true);
            if (hit)
                return { ...hit, via: "bash" };
        }
        return null;
    }
    // Move / rename: the destination is written and the source stops existing
    // under its name, so a protected path on either side is a mutation.
    if (MOVE_COMMANDS.has(cmd)) {
        for (const value of operandValues(rest)) {
            const pattern = matchProtectedPath(value);
            if (pattern)
                return { target: value, pattern, via: "bash" };
        }
        for (const arg of args().filter(isExpression)) {
            const hit = protectedIn(arg, true);
            if (hit)
                return { ...hit, via: "bash" };
        }
        return null;
    }
    // Deletes and content writers: any operand that is a protected path, and a
    // path that an expression builds. Only a delete takes a directory with it,
    // so only there does the directory named itself count.
    const sedInPlace = cmd === "sed" && rest.some((t) => /^-[a-zA-Z]*i/.test(t) || t === "--in-place");
    const deletes = DELETE_COMMANDS.has(cmd);
    if (deletes || OPERAND_WRITERS.has(cmd) || sedInPlace) {
        for (const clean of operandValues(rest)) {
            const pattern = matchProtected(clean, deletes);
            if (pattern)
                return { target: clean, pattern, via: "bash" };
        }
        const everyOperand = deletes || sedInPlace || cmd === "tee" || cmd === "truncate";
        for (const arg of expressionPaths(args(), everyOperand)) {
            const hit = protectedIn(arg, deletes);
            if (hit)
                return { ...hit, via: "bash" };
        }
        const split = cmd === "new-item" || cmd === "ni" ? newItemTarget(args()) : null;
        const pattern = split === null ? null : matchProtected(split, false);
        return pattern && split ? { target: split, pattern, via: "bash" } : null;
    }
    // Downloads: the file named by the output option. Anything else about the
    // command is left to the generic scan below, as before.
    if (DOWNLOAD_COMMANDS.has(cmd)) {
        const target = downloadTarget(args());
        const hit = target === null ? null : protectedIn(target, false);
        if (hit)
            return { ...hit, via: "bash" };
    }
    // Generic scan: a protected path quoted inside a scripting one-liner, next
    // to a write indicator. Reads (`cat`, `grep`) carry no indicator and pass,
    // with or without `2>/dev/null` behind them.
    const indicators = segment.replace(FD_REDIRECT_RE, " ");
    if (GENERIC_WRITE_RE.test(indicators)) {
        const removes = GENERIC_REMOVE_RE.test(indicators);
        const candidates = [];
        const quoted = /'([^']+)'|"([^"]+)"/g;
        let q;
        while ((q = quoted.exec(segment)) !== null)
            candidates.push((q[1] ?? q[2]));
        for (const t of tokens)
            candidates.push(stripQuotes(t));
        for (const c of candidates) {
            const inner = /['"]([^'"]*?)['"]/.exec(c);
            for (const candidate of [c, inner?.[1] ?? ""]) {
                const pattern = matchProtected(candidate, removes);
                if (pattern)
                    return { target: candidate, pattern, via: "bash" };
            }
            // A path embedded in a longer expression, e.g. writeFileSync('.claude/settings.json','{}')
            const embedded = /(?:^|[('"\s=,])([~A-Za-z0-9_./\\:-]*(?:\.claude\/|\.claude-plugin\/|\.mcp\.json|hooks\.json)[A-Za-z0-9_./\\-]*)/i.exec(c);
            if (embedded) {
                const pattern = matchProtected(embedded[1], removes);
                if (pattern)
                    return { target: embedded[1], pattern, via: "bash" };
            }
            const agentEmbedded = AGENT_EMBEDDED_RE.exec(c);
            if (agentEmbedded) {
                const pattern = matchProtected(agentEmbedded[1], removes);
                if (pattern)
                    return { target: agentEmbedded[1], pattern, via: "bash" };
            }
        }
    }
    return null;
}
/** Decide whether a tool call would mutate a guardrail-wiring file. Pure. */
export function classifyMutation(toolName, toolInput) {
    if (FILE_MUTATING_TOOLS.has(toolName)) {
        for (const p of fileToolPaths(toolInput)) {
            const pattern = matchProtectedPath(p);
            if (pattern)
                return { target: p, pattern, via: "file" };
        }
        return null;
    }
    if (SHELL_TOOLS.has(toolName) && typeof toolInput.command === "string" && toolInput.command.trim() !== "") {
        return classifyShellCommand(toolInput.command);
    }
    return classifyAliasMutation(toolName, toolInput);
}
function classifyShellCommand(command) {
    for (const segment of allSimpleCommands(command)) {
        const hit = classifyBashSegment(segment);
        if (hit)
            return hit;
    }
    return null;
}
// Another agent's tool name (lib/agent-profiles.mjs, never a Claude Code one):
// a file or patch tool is judged by the paths it names (a patch's come from its
// *** File headers, a Delete included), a shell by the shell rules above.
function classifyAliasMutation(toolName, toolInput) {
    const alias = resolveInboundTool(toolName);
    if (alias?.kind === "file-write" || alias?.kind === "patch") {
        for (const p of inboundPaths(alias, toolInput)) {
            const pattern = matchProtectedPath(p);
            if (pattern)
                return { target: p, pattern, via: "file" };
        }
        return null;
    }
    const command = alias === null ? null : inboundCommand(alias, toolInput);
    return command !== null && command.trim() !== "" ? classifyShellCommand(command) : null;
}
export function decide(mode, gated, reason) {
    if (!gated || mode === "off")
        return ALLOW;
    return { action: mode === "block" ? "block" : "warn", reason };
}
