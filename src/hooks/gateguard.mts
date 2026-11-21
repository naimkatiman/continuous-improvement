#!/usr/bin/env node
/**
 * Runtime PreToolUse gateguard hook.
 *
 * Stdin  : JSON { tool_name, tool_input }
 * Stdout : empty on allow (no output = no opinion, the call proceeds); on
 *          deny, the documented PreToolUse shape:
 *          { hookSpecificOutput: { hookEventName: "PreToolUse",
 *            permissionDecision: "deny", permissionDecisionReason } }
 *          A bare { decision: "allow" } is not schema-valid for PreToolUse
 *          (the deprecated enum is "approve" | "block") and surfaces as a
 *          "Hook JSON output validation failed" error on every tool call.
 * Exit   : 0 always (decision is in stdout, fail-open on parse error).
 *
 * The file gate (Edit, Write, MultiEdit, NotebookEdit) has three modes, picked
 * by CI_GATEGUARD_FILE_GATE:
 * - evidence (the default): allow a new file, a file with a recorded clearance,
 *   and a file this session's observation rows show was looked at
 *   (lib/gateguard-evidence.mjs). A blind edit of an existing file is denied
 *   with a two-line reason. With no observation log the gate cannot judge and
 *   allows.
 * - strict: the three-stage gate per skills/gateguard.md:
 *   - DENY  : first mutating tool call per file, with fact-list reason
 *   - FORCE : agent presents facts (model-side; out of band)
 *   - ALLOW : retry once the per-file marker is recorded in session state
 *             (harness-portable, written out of band via Bash), or
 *             `_gateguard_facts_presented: true` is set where the harness
 *             forwards unknown tool params
 * - off: the file gate is skipped.
 * Any other value is read as evidence and reported on stderr. The shell rules,
 * CI_GATEGUARD_EXCLUDE and CI_GATEGUARD_TARGET_LOCK are the same in every mode.
 *
 * Read-only and exploratory tools (Read, Grep, Glob, routine Bash) bypass
 * unconditionally. Destructive Bash gates EVERY call, not just first. The
 * PowerShell tool is a shell tool too and goes through the same classifier,
 * which is told the tool name (`rm -r` is Remove-Item -Recurse there).
 *
 * Other agents that load this plugin report their own tool names. The ones in
 * lib/agent-profiles.mjs (never a Claude Code name) are routed by kind: a shell
 * is classified in its flavor, both ways on Windows when the flavor is unknown;
 * a file tool is gated on the paths its input keys hold; an apply_patch is
 * gated on the paths in its *** File headers (lib/patch-paths.mjs).
 *
 * V1 honest limitations (see src/lib/gateguard-state.mts header):
 *   honor-system flag, state-file deletion, parallel-hook race.
 *
 * MultiEdit handling gates every edited file individually. The hook blocks
 * unless all edited paths are already cleared, or the agent presents facts
 * for the call and the hook records clearance for each edited path.
 * Block reasons now name the whole batch instead of just the first uncleared
 * path.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifierShells, inboundCommand, inboundPaths, resolveInboundTool, type InboundTool } from "../lib/agent-profiles.mjs";
import { classifyDestructiveBash } from "../lib/destructive-bash.mjs";
import {
  MAX_CLEARED_FILES,
  canonicalizeFileKey,
  canonicalizeProjectRoot,
  hashProjectRoot,
  isCapReached,
  isFileCleared,
  loadState,
  markFileCleared,
  resolveInstinctsRoot,
  resolveProjectRoot,
  resolveSessionDir,
  saveState,
  type GateguardState,
} from "../lib/gateguard-state.mjs";

type GateType = "allow" | "mutating-file" | "destructive-bash";

interface ToolInput {
  file_path?: unknown;
  command?: unknown;
  edits?: Array<{ file_path?: unknown }>;
  _gateguard_facts_presented?: unknown;
  [key: string]: unknown;
}

interface Payload {
  tool_name?: unknown;
  tool_input?: ToolInput;
  session_id?: unknown;
  cwd?: unknown;
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

function classifyTool(toolName: string, toolInput: ToolInput): GateType {
  const route = TOOL_ROUTE[toolName] ?? "allow";
  if (route !== "allow") return route;
  if (SHELL_TOOLS.has(toolName) && typeof toolInput.command === "string") {
    if (isDestructiveBash(toolInput.command, toolName)) return "destructive-bash";
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
const EXCLUDE_FRAGMENTS: readonly string[] = String(process.env.CI_GATEGUARD_EXCLUDE ?? "")
  .split(",")
  .map((fragment) => fragment.trim().replace(/\\/g, "/").toLowerCase())
  .filter((fragment) => fragment !== "");

function matchedExcludeFragment(filePath: string): string | null {
  if (EXCLUDE_FRAGMENTS.length === 0 || typeof filePath !== "string" || filePath === "") {
    return null;
  }
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return EXCLUDE_FRAGMENTS.find((fragment) => normalized.includes(fragment)) ?? null;
}

function isExcludedPath(filePath: string): boolean {
  return matchedExcludeFragment(filePath) !== null;
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
const TARGET_LOCK_ON = String(process.env.CI_GATEGUARD_TARGET_LOCK ?? "").toLowerCase() === "block";

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
type FileGateMode = (typeof FILE_GATE_MODES)[number];
const FILE_GATE_VALUE = String(process.env.CI_GATEGUARD_FILE_GATE ?? "").trim().toLowerCase();
const FILE_GATE_MODE: FileGateMode = FILE_GATE_MODES.find((mode) => mode === FILE_GATE_VALUE) ?? "evidence";
const FILE_GATE_VALUE_UNKNOWN = FILE_GATE_VALUE !== "" && FILE_GATE_VALUE !== FILE_GATE_MODE;

function buildUnknownModeNotice(): string {
  return (
    `[continuous-improvement] gateguard: CI_GATEGUARD_FILE_GATE=${JSON.stringify(process.env.CI_GATEGUARD_FILE_GATE)} ` +
    `is not a mode, using evidence. Accepted values: ${FILE_GATE_MODES.join(", ")}.`
  );
}

// The log bin/observe.mjs appends to for this project: same home, same project
// root, same hash.
function observationLogPath(): string {
  return join(resolveInstinctsRoot(), hashProjectRoot(resolveProjectRoot()), "observations.jsonl");
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

// Resolved from the hook's own location at load time. The block reason must
// print a command the agent can run in its OWN shell, where ${CLAUDE_PLUGIN_ROOT}
// is empty — that variable is only populated while this hook itself executes.
// bin/ is a sibling of hooks/ in both the repo layout and the plugin-bundle
// mirror, so this resolves correctly from either.
const CLEAR_CLI_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "gateguard-clear.mjs");

// Quote a path for the printed clearance command. Forward slashes (node accepts
// them on every platform and they survive a Bash double-quote without escaping)
// inside JSON quotes — JSON.stringify still escapes any embedded quote, so a
// path like a"b.ts stays safe rather than collapsing into a bare-quoted token.
function quotePath(p: string): string {
  return JSON.stringify(p.replace(/\\/g, "/"));
}

function buildMutatingFileReason(toolName: string, filePaths: string[], stateFilePath: string): string {
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
    `  A. Bash (always works — run verbatim): node ${quotePath(CLEAR_CLI_PATH)} --state ${quotePath(stateFilePath)} ${quoted.join(" ")}`,
    `  B. MCP tool (when the continuous-improvement server is connected): ci_gateguard_clear  {file_paths: [${quoted.join(", ")}], state_path: ${quotePath(stateFilePath)}}`,
    "  Both canonicalize paths — drive-letter case and separators don't matter.",
    "  (Harnesses that forward unknown tool params may instead retry the call with",
    "  `_gateguard_facts_presented: true`; Claude Code's strict schema rejects that, so use A or B.)",
  ].join("\n");
}

// The evidence-mode deny. Two lines: what is missing and how to supply it, then
// the clear command for the case where the file was read and the log cannot
// show it (the observer is not running, or the row was rotated away).
function buildUnreadReason(unread: string[], stateFilePath: string): string {
  // The log only holds tool calls. A file the user attached with @, or the IDE
  // attached, is in context with no row, so say what the log shows, not that
  // the file was never read.
  const subject =
    unread.length === 1
      ? `This session's observation log shows no read of ${unread[0]}. Read it`
      : `This session's observation log shows no read of ${unread.length} files (${unread.join(", ")}). Read them`;
  return [
    `${subject}, then retry the same call.`,
    `If it is already in context (a file attached with @ or by the IDE leaves no row in the log), clear the gate and retry: node ${quotePath(CLEAR_CLI_PATH)} --state ${quotePath(stateFilePath)} ${unread.map((p) => quotePath(p)).join(" ")}`,
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

// Allow = empty stdout + exit 0. Emitting JSON here is wrong: PreToolUse has
// no { decision: "allow" } shape, and the invalid output surfaces as a
// per-tool-call "Hook JSON output validation failed" error in the client.
function emitAllow(): void {
  process.exit(0);
}

function emitDeny(reason: string): void {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })}\n`,
  );
  process.exit(0);
}

async function main(): Promise<void> {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    emitAllow();
    return;
  }
  let payload: Payload;
  try {
    payload = JSON.parse(raw) as Payload;
  } catch {
    emitAllow(); // fail-open
    return;
  }
  const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "";
  const toolInput: ToolInput = payload.tool_input ?? {};
  const gate = classifyTool(toolName, toolInput);

  // Unquoted @{…} refs trip the built-in Bash parser — catch them first, for
  // both routine and destructive commands, so the quoted fix surfaces before the
  // opaque post-hoc block (and before the destructive rollback demand).
  // PowerShell reads an unquoted @{u} as a broken hashtable literal, so the
  // same quoted fix applies there.
  if (SHELL_TOOLS.has(toolName) && typeof toolInput.command === "string") {
    const braceHit = findUnquotedBraceRef(toolInput.command);
    if (braceHit) {
      emitDeny(buildBraceRefReason(braceHit));
      return;
    }
  }

  if (gate === "allow") {
    emitAllow();
    return;
  }

  const alias = resolveInboundTool(toolName);
  if (gate === "destructive-bash") {
    if (alias) {
      const cmd = inboundCommand(alias, toolInput) ?? "";
      emitDeny(buildDestructiveBashReason(cmd, destructiveShellFor(cmd, alias) ?? "Bash"));
      return;
    }
    const cmd = typeof toolInput.command === "string" ? toolInput.command : "";
    emitDeny(buildDestructiveBashReason(cmd, toolName));
    return;
  }

  // mutating-file — scope state to THIS session so the clearance cap never
  // bleeds across concurrent same-day sessions. session_id is the standard hook
  // stdin field (see recall-briefing / observe-event); absent → legacy dir.
  const sessionId = typeof payload.session_id === "string" ? payload.session_id : undefined;
  const sessionDir = resolveSessionDir(sessionId);
  const stateFilePath = join(sessionDir, "gateguard-session.json");
  let state = loadState(sessionDir);
  const allTargetPaths = alias ? inboundPaths(alias, toolInput) : extractFilePaths(toolInput);
  const unreadablePatch = alias?.kind === "patch" && allTargetPaths.length === 0;
  const filePaths = allTargetPaths.filter((path) => !isExcludedPath(path));
  if (allTargetPaths.length > 0 && filePaths.length === 0) {
    // Every target is under a CI_GATEGUARD_EXCLUDE path; skip the gate, but say so.
    const fragment = matchedExcludeFragment(allTargetPaths[0]!) ?? EXCLUDE_FRAGMENTS[0]!;
    process.stderr.write(`${buildExcludeNotice(allTargetPaths, fragment)}\n`);
    emitAllow();
    return;
  }

  // Target lock runs before the file gate, in every mode of it, and independent
  // of clearance and evidence: a wrong-repo write is wrong even with perfect
  // facts or a fresh read. Excluded paths were already filtered out above, so
  // an explicitly-excluded scratch dir outside the root is never target-locked.
  if (TARGET_LOCK_ON) {
    const projectRoot = resolveProjectRoot();
    const stray = filePaths.find((path) => isTargetOutsideRoot(path, projectRoot));
    if (stray) {
      emitDeny(buildTargetLockReason(stray, projectRoot));
      return;
    }
  }

  if (FILE_GATE_VALUE_UNKNOWN) process.stderr.write(`${buildUnknownModeNotice()}\n`);
  if (FILE_GATE_MODE === "off") {
    emitAllow();
    return;
  }

  const factsFlagged = toolInput._gateguard_facts_presented === true;

  if (unreadablePatch) {
    if (FILE_GATE_MODE === "strict" && !factsFlagged) {
      emitDeny(buildUnreadablePatchReason(toolName));
      return;
    }
    process.stderr.write(`[continuous-improvement] gateguard: ${buildUnreadablePatchReason(toolName)}\n`);
    emitAllow();
    return;
  }

  if (FILE_GATE_MODE === "evidence") {
    const cwd = typeof payload.cwd === "string" && payload.cwd !== "" ? payload.cwd : process.cwd();
    // A new file has nothing to read, and a recorded clearance is the manual
    // route. Only an existing file without one needs a row to show for it.
    const pending = [...new Set(filePaths)].filter(
      (path) => path !== "" && !isFileCleared(state, path) && existsSync(resolve(cwd, path)),
    );
    if (pending.length === 0) {
      emitAllow();
      return;
    }
    // Loaded here and not at the top: this hook runs before every tool call,
    // and the scan with the observer's summariser behind it is only needed for
    // the first edit of an existing file.
    const { findEvidence } = await import("../lib/gateguard-evidence.mjs");
    const seen = findEvidence(observationLogPath(), sessionId ?? "", cwd, pending);
    if (seen === null) {
      // No observation log: the observer is not installed or has never run, so
      // nothing can show a read. The gate cannot judge.
      emitAllow();
      return;
    }
    state = rememberEvidence(sessionDir, state, pending.filter((path) => seen.has(path)));
    const unread = pending.filter((path) => !seen.has(path));
    if (unread.length === 0) {
      emitAllow();
      return;
    }
    if (!factsFlagged) {
      emitDeny(buildUnreadReason(unread, stateFilePath));
      return;
    }
    // _gateguard_facts_presented, on a harness that forwards it: the attested
    // clearance below, cap included.
  }

  const filePath = firstUnclearedFilePath(toolInput, state);
  const alreadyCleared = filePaths.length > 0 && filePaths.every((path) => isFileCleared(state, path));
  const newFileCount = countDistinctNewFilePaths(filePaths, state);

  if (!factsFlagged && !alreadyCleared) {
    emitDeny(buildMutatingFileReason(toolName, filePaths.length > 0 ? filePaths : [filePath], stateFilePath));
    return;
  }

  if (factsFlagged && !alreadyCleared) {
    if (isCapReached(state) || Object.keys(state.cleared_files).length + newFileCount > MAX_CLEARED_FILES) {
      emitDeny(buildCapReachedReason());
      return;
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

  emitAllow();
}

await main();
