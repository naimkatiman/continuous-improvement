// gateguard-decide.mts — The gateguard PreToolUse decision, moved out of the hook.
//
// hooks/gateguard.mjs reads stdin, normalizes it (lib/hook-io.mjs), calls
// decideGateguard and encodes the Decision for the agent. Everything between
// those steps is here, moved from the hook, not rewritten: the routing, the
// destructive-shell and brace-ref rules, the exclusions, the target lock and
// the evidence, strict and off file gates, with every reason string unchanged
// (fixtures/agent-hooks/claude.json pins them). The CI_GATEGUARD_* knobs the
// hook read at load time come in through readGateguardConfig, so the decision
// can be called in-process with any config.
//
// Not pure: the file gate reads and writes this session's clearance state
// (lib/gateguard-state.mjs) and scans the observation log
// (lib/gateguard-evidence.mjs), the same reads and writes the hook made. A
// failed state write never changes the decision.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveInstinctsRoot, resolveProjectRoot } from "./agent-paths.mjs";
import { classifierShells, inboundCommand, inboundPaths, resolveInboundTool, type InboundTool, type ShellFlavor } from "./agent-profiles.mjs";
import { classifyDestructiveBash } from "./destructive-bash.mjs";
import {
  MAX_CLEARED_FILES,
  canonicalizeFileKey,
  canonicalizeProjectRoot,
  hashProjectRoot,
  isCapReached,
  isFileCleared,
  loadState,
  markFileCleared,
  resolveSessionDir,
  saveState,
  type GateguardState,
} from "./gateguard-state.mjs";
import type { Decision, NeutralEvent } from "./hook-io.mjs";

type GateType = "allow" | "mutating-file" | "destructive-bash";

interface ToolInput {
  file_path?: unknown;
  command?: unknown;
  edits?: Array<{ file_path?: unknown }>;
  _gateguard_facts_presented?: unknown;
  [key: string]: unknown;
}

const TOOL_ROUTE: Record<string, GateType> = {
  Read: "allow",
  Grep: "allow",
  Glob: "allow",
  LS: "allow",
  NotebookRead: "allow",
  Write: "mutating-file",
  Edit: "mutating-file",
  MultiEdit: "mutating-file",
  NotebookEdit: "mutating-file",
  Bash: "allow",
  PowerShell: "allow",
  Monitor: "allow",
};

// The tools whose input is a shell command. Claude Code on Windows exposes a
// first-class PowerShell tool with the same { command } input as Bash, and the
// Monitor tool runs its { command } in the same shell as Bash. A destructive
// command is as destructive through any of them, so every shell rule below
// applies to all three. A Monitor call in its { ws } form has no command and
// is allowed.
const SHELL_TOOLS: ReadonlySet<string> = new Set(["Bash", "PowerShell", "Monitor"]);

// The destructive-Bash classifier lives in lib/destructive-bash.mjs: structured
// rules (flag order and spelling do not matter: `rm -r -f`, `git clean -fdx`,
// `git checkout -- .`, `git restore .`, `find -delete`, `git push +ref`,
// `git stash drop`) plus the original substring list as the fallback. The
// message-flag carve-out (`git commit -m "…"`) lives there too. Each rule has
// a stable id the deny reason prints, so a block is explainable. The tool name
// goes with the command: `rm -r build` is Remove-Item -Recurse under the
// PowerShell tool and the unforced POSIX rm under Bash.
function isDestructiveBash(command: string, toolName: string): boolean {
  return classifyDestructiveBash(command, toolName).destructive;
}

// Another agent's shell (Grok run_terminal_command, Qwen run_shell_command,
// Cursor Shell, ...) is read in its flavor, and an unknown flavor on Windows is
// read both ways. Returns the classifier tool name that flagged the command.
function destructiveShellFor(command: string, alias: InboundTool): "Bash" | "PowerShell" | null {
  return classifierShells(alias.flavor).find((shell) => isDestructiveBash(command, shell)) ?? null;
}

// The classifier readings of a Claude-named shell. Claude Code's own flavor
// keeps the tool name, so its rules do not change; another agent that reports
// the name with an unknown flavor (Codex's Bash runs PowerShell on Windows) is
// read both ways on Windows (plan Architecture item 8).
function claudeShellReadings(toolName: string, flavor: ShellFlavor | null): string[] {
  return flavor === "unknown" ? classifierShells(flavor) : [toolName];
}

function destructiveClaudeShell(command: string, toolName: string, flavor: ShellFlavor | null): string | null {
  return claudeShellReadings(toolName, flavor).find((shell) => isDestructiveBash(command, shell)) ?? null;
}

function classifyTool(toolName: string, toolInput: ToolInput, flavor: ShellFlavor | null): GateType {
  const route = TOOL_ROUTE[toolName] ?? "allow";
  if (route !== "allow") return route;
  if (SHELL_TOOLS.has(toolName) && typeof toolInput.command === "string") {
    if (destructiveClaudeShell(toolInput.command, toolName, flavor) !== null) return "destructive-bash";
  }
  // Other agents' tool names, never a Claude Code one (lib/agent-profiles.mjs).
  const alias = resolveInboundTool(toolName);
  if (alias?.kind === "file-write" || alias?.kind === "patch") return "mutating-file";
  if (alias?.kind === "shell") {
    const command = inboundCommand(alias, toolInput);
    if (command !== null && destructiveShellFor(command, alias) !== null) return "destructive-bash";
  }
  return "allow";
}

function extractFilePaths(toolInput: ToolInput): string[] {
  if (typeof toolInput.file_path === "string") return [toolInput.file_path];
  if (Array.isArray(toolInput.edits) && toolInput.edits.length > 0) {
    return toolInput.edits
      .map((edit) => (edit && typeof edit.file_path === "string" ? edit.file_path : ""))
      .filter((filePath): filePath is string => filePath !== "");
  }
  if (typeof toolInput.command === "string") return [toolInput.command];
  return [];
}

// --- Path exclusions -------------------------------------------------------
// Opt-in: skip the fact-forcing gate for low-risk paths a user edits
// constantly (an LLM-maintained prose wiki, a generated scratch dir). Set the
// CI_GATEGUARD_EXCLUDE env var to a comma-separated list of path substrings;
// each is matched case-insensitively against the forward-slash-normalized file
// path. Unset/empty (the default) changes nothing — every mutating file call is
// gated exactly as before. A call whose targets mix excluded and non-excluded
// paths still gates the non-excluded ones.
function parseExcludeFragments(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((fragment) => fragment.trim().replace(/\\/g, "/").toLowerCase())
    .filter((fragment) => fragment !== "");
}

function matchedExcludeFragment(filePath: string, fragments: readonly string[]): string | null {
  if (fragments.length === 0 || typeof filePath !== "string" || filePath === "") {
    return null;
  }
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return fragments.find((fragment) => normalized.includes(fragment)) ?? null;
}

function isExcludedPath(filePath: string, fragments: readonly string[]): boolean {
  return matchedExcludeFragment(filePath, fragments) !== null;
}

// A fragment every path contains ("/", ".", any single character) is not an
// exclusion, it is an off switch for the whole file gate. It is still honoured —
// the operator set it — but silently honouring it is how a host ends up with the
// headline feature off and nobody noticing (this repo's own author's shell had
// CI_GATEGUARD_EXCLUDE="/,." for weeks). So every exclusion prints one stderr
// line, and a catch-all says plainly that the gate is off. stderr never changes
// the decision: allow stays empty stdout + exit 0.
function isCatchAllFragment(fragment: string): boolean {
  return fragment.length <= 1 || fragment === "./" || fragment === "..";
}

function buildExcludeNotice(paths: string[], fragment: string): string {
  const shown = paths.map((p) => p.replace(/\\/g, "/")).join(", ");
  if (isCatchAllFragment(fragment)) {
    return (
      `[continuous-improvement] gateguard: CI_GATEGUARD_EXCLUDE fragment "${fragment}" matches every path, ` +
      `so the file gate is off for this session (skipped ${shown}). ` +
      "Narrow it to a directory, e.g. CI_GATEGUARD_EXCLUDE=docs/wiki, to get the gate back."
    );
  }
  return `[continuous-improvement] gateguard: skipped by CI_GATEGUARD_EXCLUDE (fragment "${fragment}" matched ${shown}).`;
}

// --- Target lock (opt-in) --------------------------------------------------
// A fact-list can't catch a wrong-repo / wrong-worktree write — you can present
// perfect facts about the wrong file. CI_GATEGUARD_TARGET_LOCK=block denies a
// mutating call whose ABSOLUTE target canonicalizes outside the session project
// root. Default (unset) checks nothing, so existing sessions — including
// legitimate out-of-root edits to ~/.claude or /tmp — are unaffected. This is
// the warn-first rollout: ship non-enforcing, flip to block per session.

// Relative paths resolve under cwd (= the project root) and always pass; only an
// absolute path into a different tree can be out-of-root. Drive-letter (d:/,
// D:\), POSIX-absolute (/x), and UNC (\\host) forms all count as absolute.
function isAbsolutePathString(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("/") || p.startsWith("\\\\");
}

function isTargetOutsideRoot(filePath: string, projectRoot: string): boolean {
  if (!isAbsolutePathString(filePath)) return false;
  const root = canonicalizeProjectRoot(projectRoot);
  if (root === "global" || root === "") return false; // no known root — do not guess
  const target = canonicalizeFileKey(filePath);
  return target !== root && !target.startsWith(`${root}/`);
}

function buildTargetLockReason(strayPath: string, projectRoot: string): string {
  return [
    `Target is outside the session project root — refusing a possible wrong-repo / wrong-worktree write.`,
    "",
    `  Target: ${strayPath.replace(/\\/g, "/")}`,
    `  Session root: ${canonicalizeProjectRoot(projectRoot)}`,
    "",
    "If this is intentional, confirm you are in the right worktree (cwd / CLAUDE_PROJECT_DIR),",
    "or unset CI_GATEGUARD_TARGET_LOCK for this session. Target lock is opt-in; it fires only",
    "when CI_GATEGUARD_TARGET_LOCK=block.",
  ].join("\n");
}

// --- File gate mode --------------------------------------------------------
// CI_GATEGUARD_FILE_GATE picks how a mutating file call is judged. `evidence`
// (the default, also for an unset or empty value) asks the observation log
// whether the session looked at the file. `strict` is the fact-list gate, the
// only behaviour before the modes existed. `off` skips the file gate. A value
// that is none of the three is read as `evidence` and reported on stderr, so a
// typo never picks a mode quietly.
const FILE_GATE_MODES = ["evidence", "strict", "off"] as const;
export type FileGateMode = (typeof FILE_GATE_MODES)[number];

function buildUnknownModeNotice(rawValue: string | undefined): string {
  return (
    `[continuous-improvement] gateguard: CI_GATEGUARD_FILE_GATE=${JSON.stringify(rawValue)} ` +
    `is not a mode, using evidence. Accepted values: ${FILE_GATE_MODES.join(", ")}.`
  );
}

// The log bin/observe.mjs appends to for this project: same home, same project
// root, same hash.
function observationLogPath(payload: unknown): string {
  return join(resolveInstinctsRoot(), hashProjectRoot(resolveProjectRoot(payload)), "observations.jsonl");
}

// Record an evidence allow so the file's later edits skip the log scan. The cap
// bounds attested clearances and never turns evidence into a deny: once it is
// full the file is not recorded, and its next edit reads the log again. This is
// a cache, so a failed write changes nothing about the decision.
function rememberEvidence(sessionDir: string, state: GateguardState, paths: string[]): GateguardState {
  let next = state;
  for (const path of paths) {
    if (isCapReached(next)) break;
    next = markFileCleared(next, path);
  }
  if (next === state) return state;
  try {
    saveState(sessionDir, next);
  } catch {
    return state;
  }
  return next;
}

// The call site only reads this inside the block branch, where at least one
// path is uncleared; an all-cleared batch returns "" and is never consumed.
function firstUnclearedFilePath(toolInput: ToolInput, state: GateguardState): string {
  return extractFilePaths(toolInput).find((path) => !isFileCleared(state, path)) ?? "";
}

function countDistinctNewFilePaths(filePaths: string[], state: GateguardState): number {
  return new Set(
    filePaths.filter((path) => !isFileCleared(state, path)).map((path) => canonicalizeFileKey(path)),
  ).size;
}

function formatFileTarget(filePaths: string[]): string {
  const nonEmpty = filePaths.filter((path) => path !== "");
  if (nonEmpty.length === 0) return "<unknown>";
  if (nonEmpty.length === 1) return nonEmpty[0]!;
  return `${nonEmpty.length} files (${nonEmpty.join(", ")})`;
}

// Quote a path for the printed clearance command. Forward slashes (node accepts
// them on every platform and they survive a Bash double-quote without escaping)
// inside JSON quotes — JSON.stringify still escapes any embedded quote, so a
// path like a"b.ts stays safe rather than collapsing into a bare-quoted token.
function quotePath(p: string): string {
  return JSON.stringify(p.replace(/\\/g, "/"));
}

function buildMutatingFileReason(toolName: string, filePaths: string[], stateFilePath: string, clearCliPath: string): string {
  const target = formatFileTarget(filePaths);
  const pathList = filePaths.filter((p) => p !== "");
  const quoted = (pathList.length > 0 ? pathList : [target]).map((p) => quotePath(p));
  return [
    `Before ${toolName === "Write" ? "creating" : "editing"} ${target}, present these facts:`,
    "",
    "  1. List ALL files that import/require this file (use Grep)",
    "  2. List the public functions/classes affected by this change",
    "  3. If this file reads/writes data files, show field names, structure, and date format",
    "  4. Quote the user's current instruction verbatim",
    "",
    "Then clear the gate and retry the same call. Either route works:",
    `  A. Bash (always works — run verbatim): node ${quotePath(clearCliPath)} --state ${quotePath(stateFilePath)} ${quoted.join(" ")}`,
    `  B. MCP tool (when the continuous-improvement server is connected): ci_gateguard_clear  {file_paths: [${quoted.join(", ")}], state_path: ${quotePath(stateFilePath)}}`,
    "  Both canonicalize paths — drive-letter case and separators don't matter.",
    "  (Harnesses that forward unknown tool params may instead retry the call with",
    "  `_gateguard_facts_presented: true`; Claude Code's strict schema rejects that, so use A or B.)",
  ].join("\n");
}

// The evidence-mode deny. Two lines: what is missing and how to supply it, then
// the clear command for the case where the file was read and the log cannot
// show it (the observer is not running, or the row was rotated away).
function buildUnreadReason(unread: string[], stateFilePath: string, clearCliPath: string): string {
  // The log only holds tool calls. A file the user attached with @, or the IDE
  // attached, is in context with no row, so say what the log shows, not that
  // the file was never read.
  const subject =
    unread.length === 1
      ? `This session's observation log shows no read of ${unread[0]}. Read it`
      : `This session's observation log shows no read of ${unread.length} files (${unread.join(", ")}). Read them`;
  return [
    `${subject}, then retry the same call.`,
    `If it is already in context (a file attached with @ or by the IDE leaves no row in the log), clear the gate and retry: node ${quotePath(clearCliPath)} --state ${quotePath(stateFilePath)} ${unread.map((p) => quotePath(p)).join(" ")}`,
  ].join("\n");
}

function buildNoSessionReason(unread: string[], stateFilePath: string, clearCliPath: string): string {
  return [
    `This hook payload names no session, so no read in the observation log can be matched to this edit of ${unread.join(", ")}.`,
    `Clear the gate and retry: node ${quotePath(clearCliPath)} --state ${quotePath(stateFilePath)} ${unread.map((p) => quotePath(p)).join(" ")}`,
  ].join("\n");
}

// --- Unquoted brace-ref detector (RISA 3 / G1) -----------------------------
// An unquoted @{u} / @{upstream} / @{push} / @{0} git ref makes Claude Code's
// built-in Bash parser trip on the braces and block the call post-hoc, costing a
// retry (measured in 4+ sessions). Walk the command tracking quote state and
// report the FIRST @{ that sits outside any quoted span, plus the fixed command
// that single-quotes the whole ref word — so the correction lands before the
// opaque built-in block. A ref already inside single or double quotes is safe
// and passes untouched.
interface BraceRefHit {
  ref: string;
  fixed: string;
}

function isGitBraceSelector(value: string): boolean {
  const selector = value.trim();
  if (/^(?:u|upstream|push|-?\d+)$/i.test(selector)) return true;
  if (/^(?:now|today|yesterday|tomorrow|noon|midnight|tea)$/i.test(selector)) return true;
  if (/^\d{4}-\d{1,2}-\d{1,2}(?:[ T].*)?$/.test(selector)) return true;
  return !selector.startsWith("#") && /(?:^|[.\s])ago$/i.test(selector);
}

function findUnquotedBraceRef(command: string): BraceRefHit | null {
  let quote: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "@" && command[i + 1] === "{") {
      const braceEnd = command.indexOf("}", i + 2);
      if (braceEnd === -1) continue;
      const selector = command.slice(i + 2, braceEnd);
      // Deny only recognized Git selector grammar. PowerShell hashtables can
      // contain comments, quoted braces, or arbitrary key expressions.
      if (!isGitBraceSelector(selector)) {
        i = braceEnd;
        continue;
      }
      // Expand to the whitespace-delimited word that carries this @{ ref, then
      // single-quote that whole word in the suggested fix.
      let wordStart = i;
      while (wordStart > 0 && !/\s/.test(command[wordStart - 1]!)) wordStart--;
      let wordEnd = braceEnd + 1;
      while (wordEnd < command.length && !/\s/.test(command[wordEnd]!)) wordEnd++;
      const word = command.slice(wordStart, wordEnd);
      const ref = command.slice(i, braceEnd + 1);
      const fixed = `${command.slice(0, wordStart)}'${word}'${command.slice(wordEnd)}`;
      return { ref, fixed };
    }
  }
  return null;
}

function buildBraceRefReason(hit: BraceRefHit): string {
  return [
    `Unquoted git ref ${hit.ref} — Claude Code's Bash parser trips on the braces and blocks this`,
    "post-hoc, costing a retry. Quote the ref and run the SAME command:",
    "",
    `  ${hit.fixed}`,
    "",
    "Single quotes stop the shell from touching the braces; git reads the ref as-is.",
  ].join("\n");
}

function buildDestructiveBashReason(command: string, toolName: string): string {
  const rule = classifyDestructiveBash(command, toolName).rule ?? "unknown";
  return [
    `Destructive command requested: ${command}`,
    "",
    "  1. List ALL files/data this command will modify or delete",
    "  2. Write a one-line rollback procedure",
    "  3. Quote the user's current instruction verbatim",
    "",
    `Matched rule: ${rule}`,
    "Destructive Bash gates EVERY call — clearance is not cached.",
  ].join("\n");
}

// An apply_patch whose text has no file header: the gate cannot see what it
// edits. Strict denies it, evidence warns and lets it through.
function buildUnreadablePatchReason(toolName: string): string {
  return (
    `${toolName} names no file the gate can read: the patch has no *** Add File, *** Update File, ` +
    "*** Delete File or *** Move to header. Send the patch with its file headers."
  );
}

function buildCapReachedReason(): string {
  return [
    `Gateguard clearance cap reached (${MAX_CLEARED_FILES} distinct files this session).`,
    "The cap is per-session: start a new Claude Code session to reset it, or wait",
    "for the state file to self-heal. It bounds stuck-loop or rogue-agent clearance",
    "from compounding within one session without affecting your other sessions.",
  ].join("\n");
}
export interface GateguardConfig {
  fileGateMode: FileGateMode;
  /** The stderr line for a CI_GATEGUARD_FILE_GATE value that is no mode, else null. */
  fileGateUnknownNotice: string | null;
  excludeFragments: readonly string[];
  /** CI_GATEGUARD_TARGET_LOCK=block. */
  targetLock: boolean;
  /** bin/gateguard-clear.mjs, resolved from the hook's own location. */
  clearCliPath: string;
}

/** The gateguard knobs from an env, parsed the way the hook parsed them at load time. */
export function readGateguardConfig(env: Readonly<Record<string, string | undefined>>, clearCliPath: string): GateguardConfig {
  const rawMode = env.CI_GATEGUARD_FILE_GATE;
  const value = String(rawMode ?? "").trim().toLowerCase();
  const fileGateMode: FileGateMode = FILE_GATE_MODES.find((mode) => mode === value) ?? "evidence";
  return {
    fileGateMode,
    fileGateUnknownNotice: value !== "" && value !== fileGateMode ? buildUnknownModeNotice(rawMode) : null,
    excludeFragments: parseExcludeFragments(env.CI_GATEGUARD_EXCLUDE),
    targetLock: String(env.CI_GATEGUARD_TARGET_LOCK ?? "").toLowerCase() === "block",
    clearCliPath,
  };
}

/** The gateguard decision for one PreToolUse event. `notices` are the stderr lines, in order. */
export async function decideGateguard(event: NeutralEvent, config: GateguardConfig): Promise<Decision> {
  const notices: string[] = [];
  const allow = (): Decision => ({ kind: "allow", notices });
  const deny = (reason: string): Decision => ({ kind: "deny", reason, notices });
  const { toolName, payload } = event;
  const toolInput: ToolInput = event.toolInput;
  const gate = classifyTool(toolName, toolInput, event.shellFlavor);

  // Unquoted @{…} refs trip the built-in Bash parser — catch them first, for
  // both routine and destructive commands, so the quoted fix surfaces before the
  // opaque post-hoc block (and before the destructive rollback demand).
  // PowerShell reads an unquoted @{u} as a broken hashtable literal, so the
  // same quoted fix applies there.
  if (SHELL_TOOLS.has(toolName) && typeof toolInput.command === "string") {
    const braceHit = findUnquotedBraceRef(toolInput.command);
    if (braceHit) return deny(buildBraceRefReason(braceHit));
  }

  if (gate === "allow") return allow();

  const alias = resolveInboundTool(toolName);
  if (gate === "destructive-bash") {
    if (alias) {
      const cmd = inboundCommand(alias, toolInput) ?? "";
      return deny(buildDestructiveBashReason(cmd, destructiveShellFor(cmd, alias) ?? "Bash"));
    }
    const cmd = typeof toolInput.command === "string" ? toolInput.command : "";
    return deny(buildDestructiveBashReason(cmd, destructiveClaudeShell(cmd, toolName, event.shellFlavor) ?? toolName));
  }

  // mutating-file — scope state to THIS session so the clearance cap never
  // bleeds across concurrent same-day sessions. session_id is the standard hook
  // stdin field (see recall-briefing / observe-event); absent → legacy dir.
  const sessionId = event.sessionId;
  const sessionDir = resolveSessionDir(sessionId, payload);
  const stateFilePath = join(sessionDir, "gateguard-session.json");
  let state = loadState(sessionDir);
  const allTargetPaths = alias ? inboundPaths(alias, toolInput) : extractFilePaths(toolInput);
  const unreadablePatch = alias?.kind === "patch" && allTargetPaths.length === 0;
  const filePaths = allTargetPaths.filter((path) => !isExcludedPath(path, config.excludeFragments));
  if (allTargetPaths.length > 0 && filePaths.length === 0) {
    // Every target is under a CI_GATEGUARD_EXCLUDE path; skip the gate, but say so.
    const fragment = matchedExcludeFragment(allTargetPaths[0]!, config.excludeFragments) ?? config.excludeFragments[0]!;
    notices.push(buildExcludeNotice(allTargetPaths, fragment));
    return allow();
  }

  // Target lock runs before the file gate, in every mode of it, and independent
  // of clearance and evidence: a wrong-repo write is wrong even with perfect
  // facts or a fresh read. Excluded paths were already filtered out above, so
  // an explicitly-excluded scratch dir outside the root is never target-locked.
  if (config.targetLock) {
    const projectRoot = resolveProjectRoot(payload);
    const stray = filePaths.find((path) => isTargetOutsideRoot(path, projectRoot));
    if (stray) return deny(buildTargetLockReason(stray, projectRoot));
  }

  if (config.fileGateUnknownNotice !== null) notices.push(config.fileGateUnknownNotice);
  if (config.fileGateMode === "off") return allow();

  const factsFlagged = toolInput._gateguard_facts_presented === true;

  if (unreadablePatch) {
    if (config.fileGateMode === "strict" && !factsFlagged) return deny(buildUnreadablePatchReason(toolName));
    notices.push(`[continuous-improvement] gateguard: ${buildUnreadablePatchReason(toolName)}`);
    return allow();
  }

  if (config.fileGateMode === "evidence") {
    const cwd = event.cwd ?? process.cwd();
    // A new file has nothing to read, and a recorded clearance is the manual
    // route. Only an existing file without one needs a row to show for it.
    const pending = [...new Set(filePaths)].filter(
      (path) => path !== "" && !isFileCleared(state, path) && existsSync(resolve(cwd, path)),
    );
    if (pending.length === 0) return allow();
    // Loaded here and not at the top: this hook runs before every tool call,
    // and the scan with the observer's summariser behind it is only needed for
    // the first edit of an existing file.
    const { findEvidence } = await import("./gateguard-evidence.mjs");
    const seen = findEvidence(observationLogPath(payload), sessionId ?? "", cwd, pending);
    // No observation log: the observer is not installed or has never run, so
    // nothing can show a read. The gate cannot judge.
    if (seen === null) return allow();
    // Another agent's payload that names no session: a row with session "" may
    // be any conversation's or any agent's, so no read counts and the clear CLI
    // is the route. Claude Code always sends session_id; its path is unchanged.
    const anonymous = event.agent !== "claude" && !sessionId;
    if (anonymous) seen.clear();
    state = rememberEvidence(sessionDir, state, pending.filter((path) => seen.has(path)));
    const unread = pending.filter((path) => !seen.has(path));
    if (unread.length === 0) return allow();
    if (!factsFlagged) {
      return deny(anonymous ? buildNoSessionReason(unread, stateFilePath, config.clearCliPath) : buildUnreadReason(unread, stateFilePath, config.clearCliPath));
    }
    // _gateguard_facts_presented, on a harness that forwards it: the attested
    // clearance below, cap included.
  }

  const filePath = firstUnclearedFilePath(toolInput, state);
  const alreadyCleared = filePaths.length > 0 && filePaths.every((path) => isFileCleared(state, path));
  const newFileCount = countDistinctNewFilePaths(filePaths, state);

  if (!factsFlagged && !alreadyCleared) {
    return deny(
      buildMutatingFileReason(toolName, filePaths.length > 0 ? filePaths : [filePath], stateFilePath, config.clearCliPath),
    );
  }

  if (factsFlagged && !alreadyCleared) {
    if (isCapReached(state) || Object.keys(state.cleared_files).length + newFileCount > MAX_CLEARED_FILES) {
      return deny(buildCapReachedReason());
    }
    let nextState = state;
    for (const path of filePaths) {
      nextState = markFileCleared(nextState, path);
    }
    // A failed save (a parallel hook holding the state file open on Windows)
    // must not fail the hook: Copilot denies on any non-zero preToolUse exit.
    // A lost clearance only re-asks for facts on the next call.
    try {
      if (filePaths.length > 0) saveState(sessionDir, nextState);
    } catch {
      // fall through to the allow
    }
  }

  return allow();
}
