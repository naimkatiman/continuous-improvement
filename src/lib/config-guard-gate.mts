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

export type ConfigGuardMode = "off" | "warn" | "block";
export type ConfigGuardAction = "allow" | "warn" | "block";

export interface ConfigGuardDecision {
  action: ConfigGuardAction;
  reason: string;
}

export interface ConfigMutation {
  /** The path (or CLI subcommand) that would be mutated. */
  target: string;
  /** The protected pattern it matched, or "claude-cli". */
  pattern: string;
  via: "file" | "bash" | "claude-cli";
}

/**
 * Path patterns, matched case-insensitively on the forward-slash form.
 * A trailing "/" means a directory: anything inside it, and the directory
 * itself when the path ends with its name (`.claude/hooks`), since removing or
 * renaming the directory takes every file in it along. Otherwise the pattern
 * must be the whole path or a trailing path segment, so `hooks.json.md` and
 * `config/settings.json` are not matched.
 */
export const PROTECTED_PATTERNS: readonly string[] = [
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".mcp.json",
  "hooks.json",
  ".claude/hooks/",
  ".claude/plugins/",
  ".claude-plugin/",
];

const ALLOW: ConfigGuardDecision = { action: "allow", reason: "" };

export function parseMode(raw: string | undefined): ConfigGuardMode {
  const v = (raw ?? "warn").trim().toLowerCase();
  return v === "block" || v === "off" ? v : "warn";
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

// `directoryItself` says whether a protected directory named by its bare name
// (`.claude/hooks`) counts. It does for a delete, a move or a copy into it; it
// does not where the path is only mentioned, because `ls .claude/hooks` and
// `mkdir -p .claude/hooks` change no file in it.
function matchProtected(filePath: string, directoryItself: boolean): string | null {
  if (typeof filePath !== "string" || filePath === "") return null;
  const n = normalizePath(filePath);
  for (const pattern of PROTECTED_PATTERNS) {
    const lp = pattern.toLowerCase();
    if (lp.endsWith("/")) {
      const dir = lp.slice(0, -1);
      if (n.includes(lp) || (directoryItself && (n === dir || n.endsWith(`/${dir}`)))) return pattern;
      continue;
    }
    if (n === lp || n.endsWith(`/${lp}`)) return pattern;
  }
  return null;
}

export function matchProtectedPath(filePath: string): string | null {
  return matchProtected(filePath, true);
}

// --- file tools ------------------------------------------------------------

function fileToolPaths(toolInput: Record<string, unknown>): string[] {
  const paths: string[] = [];
  if (typeof toolInput.file_path === "string") paths.push(toolInput.file_path);
  if (typeof toolInput.notebook_path === "string") paths.push(toolInput.notebook_path);
  if (Array.isArray(toolInput.edits)) {
    for (const edit of toolInput.edits) {
      if (edit && typeof edit === "object" && typeof (edit as { file_path?: unknown }).file_path === "string") {
        paths.push((edit as { file_path: string }).file_path);
      }
    }
  }
  return paths;
}

const FILE_MUTATING_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

// The tools whose input is a shell command. Claude Code on Windows exposes a
// first-class PowerShell tool with the same { command } input as Bash; a write
// to a protected file is the same write through either, so both run the shell
// classifier below (and both report `via: "bash"`).
const SHELL_TOOLS: ReadonlySet<string> = new Set(["Bash", "PowerShell"]);

// --- Bash --------------------------------------------------------------------

// Split at shell separators that sit outside single or double quotes. With
// `blocks`, an unquoted `{`, `}`, `(` or `)` ends a command too, so the body of
// a PowerShell script block (`if ($?) { Copy-Item a b }`) is a segment of its own.
function splitSimpleCommands(command: string, blocks: boolean): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
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
      if (command[i + 1] === ch) i++;
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
function allSimpleCommands(command: string): string[] {
  return [...splitSimpleCommands(command, false), ...splitSimpleCommands(command, true)];
}

function tokenize(segment: string): string[] {
  return segment.split(/\s+/).filter((t) => t !== "");
}

function stripQuotes(token: string): string {
  return token.replace(/^['"]+|['"]+$/g, "");
}

function commandWord(tokens: string[]): { cmd: string; rest: string[] } {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
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
const GENERIC_WRITE_RE =
  /writefilesync|writefile\(|appendfile|unlink|rename\(|copyfile|rmsync|truncate|set-content|out-file|add-content|remove-item|writealltext|writealllines|writeallbytes|appendalltext|appendalllines|\]::delete\(|\]::move\(|\]::copy\(|\bdel\b|\bsed\s+-i\b|\btee\b|>{1,2}/i;
// The indicators above that remove or rename what they name. Next to one of
// these a protected directory named itself counts, as it does for `rm`.
const GENERIC_REMOVE_RE = /unlink|rename\(|rmsync|remove-item|\]::delete\(|\]::move\(|\bdel\b/i;
// A redirect to another descriptor or to the null device writes no file:
// `2>&1`, `>&2`, `2>/dev/null`, `>/dev/null`, `&>/dev/null`, `2>$null`, `*>$null`,
// `>NUL`. It is not a write indicator.
const FD_REDIRECT_RE = /[\d*&]?>{1,2}\s*(?:&(?:\d|-)|(?:\/dev\/null|\$null|nul)(?![\w./\\-]))/gi;

// The path-like values a command names: its bare operands, plus the value of a
// PowerShell colon-bound parameter (`-Path:settings.json`). Switch names and
// the names of space-separated parameters are dropped; their values are
// ordinary operands.
function operandValues(rest: string[]): string[] {
  const values: string[] = [];
  for (const t of rest) {
    if (!t.startsWith("-")) {
      values.push(stripQuotes(t));
      continue;
    }
    const colon = t.indexOf(":");
    if (colon > 1 && colon < t.length - 1) values.push(stripQuotes(t.slice(colon + 1)));
  }
  return values;
}

// The destination of a copy: the value of PowerShell's -Destination when it is
// named (it can come before the source), otherwise the last operand.
function copyDestination(rest: string[]): string | null {
  for (let i = 0; i < rest.length; i++) {
    const named = /^-des[a-z]*(?::(.+))?$/i.exec(rest[i]!);
    if (!named) continue;
    const value = named[1] ?? rest[i + 1];
    return value ? stripQuotes(value) : null;
  }
  const values = operandValues(rest);
  return values[values.length - 1] ?? null;
}

const CLAUDE_CLI_MUTATIONS: Record<string, ReadonlySet<string>> = {
  plugin: new Set(["install", "uninstall", "enable", "disable", "update", "marketplace"]),
  mcp: new Set(["add", "remove", "add-json", "add-from-claude-desktop", "reset-project-choices"]),
  config: new Set(["set", "add", "remove", "reset", "rm"]),
};

function classifyBashSegment(segment: string): ConfigMutation | null {
  const tokens = tokenize(segment);
  if (tokens.length === 0) return null;
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

  // Copy: only the destination can be a protected write; a protected source is
  // a read (a backup).
  if (COPY_COMMANDS.has(cmd)) {
    const dest = copyDestination(rest);
    const pattern = dest ? matchProtectedPath(dest) : null;
    return pattern && dest ? { target: dest, pattern, via: "bash" } : null;
  }

  // Move / rename: the destination is written and the source stops existing
  // under its name, so a protected path on either side is a mutation.
  if (MOVE_COMMANDS.has(cmd)) {
    for (const value of operandValues(rest)) {
      const pattern = matchProtectedPath(value);
      if (pattern) return { target: value, pattern, via: "bash" };
    }
    return null;
  }

  // Redirects: `> path`, `>> path`, `2>path`, `>path`, `&>path`, `*> path`.
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const m = /^((?:\d+|[*&])?>{1,2})(.*)$/.exec(t);
    if (!m) continue;
    const target = m[2] !== "" ? m[2]! : (tokens[i + 1] ?? "");
    const pattern = matchProtected(stripQuotes(target), false);
    if (pattern) return { target: stripQuotes(target), pattern, via: "bash" };
  }

  // Deletes and content writers: any operand that is a protected path. Only a
  // delete takes a directory with it, so only there does the directory named
  // itself count.
  const sedInPlace = cmd === "sed" && rest.some((t) => /^-[a-zA-Z]*i/.test(t) || t === "--in-place");
  const deletes = DELETE_COMMANDS.has(cmd);
  if (deletes || OPERAND_WRITERS.has(cmd) || sedInPlace) {
    for (const clean of operandValues(rest)) {
      const pattern = matchProtected(clean, deletes);
      if (pattern) return { target: clean, pattern, via: "bash" };
    }
    return null;
  }

  // Generic scan: a protected path quoted inside a scripting one-liner, next
  // to a write indicator. Reads (`cat`, `grep`) carry no indicator and pass,
  // with or without `2>/dev/null` behind them.
  const indicators = segment.replace(FD_REDIRECT_RE, " ");
  if (GENERIC_WRITE_RE.test(indicators)) {
    const removes = GENERIC_REMOVE_RE.test(indicators);
    const candidates: string[] = [];
    const quoted = /'([^']+)'|"([^"]+)"/g;
    let q: RegExpExecArray | null;
    while ((q = quoted.exec(segment)) !== null) candidates.push((q[1] ?? q[2])!);
    for (const t of tokens) candidates.push(stripQuotes(t));
    for (const c of candidates) {
      const inner = /['"]([^'"]*?)['"]/.exec(c);
      for (const candidate of [c, inner?.[1] ?? ""]) {
        const pattern = matchProtected(candidate, removes);
        if (pattern) return { target: candidate, pattern, via: "bash" };
      }
      // A path embedded in a longer expression, e.g. writeFileSync('.claude/settings.json','{}')
      const embedded = /(?:^|[('"\s=,])([~A-Za-z0-9_./\\:-]*(?:\.claude\/|\.claude-plugin\/|\.mcp\.json|hooks\.json)[A-Za-z0-9_./\\-]*)/i.exec(c);
      if (embedded) {
        const pattern = matchProtected(embedded[1]!, removes);
        if (pattern) return { target: embedded[1]!, pattern, via: "bash" };
      }
    }
  }
  return null;
}

/** Decide whether a tool call would mutate a guardrail-wiring file. Pure. */
export function classifyMutation(toolName: string, toolInput: Record<string, unknown>): ConfigMutation | null {
  if (FILE_MUTATING_TOOLS.has(toolName)) {
    for (const p of fileToolPaths(toolInput)) {
      const pattern = matchProtectedPath(p);
      if (pattern) return { target: p, pattern, via: "file" };
    }
    return null;
  }
  if (SHELL_TOOLS.has(toolName) && typeof toolInput.command === "string" && toolInput.command.trim() !== "") {
    for (const segment of allSimpleCommands(toolInput.command)) {
      const hit = classifyBashSegment(segment);
      if (hit) return hit;
    }
  }
  return null;
}

export function decide(mode: ConfigGuardMode, gated: boolean, reason: string): ConfigGuardDecision {
  if (!gated || mode === "off") return ALLOW;
  return { action: mode === "block" ? "block" : "warn", reason };
}
