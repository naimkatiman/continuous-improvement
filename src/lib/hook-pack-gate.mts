// hook-pack-gate.mts — Pure decision core for the enforcing-hook pack (v1).
//
// No I/O. Given the command string of the Bash or PowerShell tool, the resolved
// current branch, the staged-file count, and the operator's mode, decide
// allow / warn / block.
// The hook (src/hooks/hook-pack.mts) wires stdin + git subprocess calls around
// these functions; keeping them pure lets the unit tests cover every branch
// without spawning anything. Lives in lib/ so tests can import it (the
// test-imports-only invariant forbids importing from hooks/).
//
// Fail-open by construction: callers pass safe defaults (null branch, 0 staged)
// on any failure, and an unrecognized mode resolves to warn.

import { gitInvocations, type GitInvocation } from "./destructive-bash.mjs";

export type HookPackMode = "off" | "warn" | "block";
export type HookPackAction = "allow" | "warn" | "block";

export interface HookPackDecision {
  action: HookPackAction;
  reason: string;
}

export const COMMIT_FILE_LIMIT = 15;

const ALLOW: HookPackDecision = { action: "allow", reason: "" };

export function parseMode(raw: string | undefined): HookPackMode {
  const v = (raw ?? "warn").trim().toLowerCase();
  return v === "block" || v === "off" ? v : "warn";
}

// `git push` and `git commit` are found by the command reader the destructive
// gate uses (gitInvocations in lib/destructive-bash.mjs), not by a pattern over
// the raw text. That one reader gives both gates the same answers:
//   - a command starts the line, follows a separator (newline, ;, |, &) or
//     opens a block or group. Windows PowerShell 5.1 has no `&&`, so a chain is
//     written `A; if ($?) { B }`; `try { B }` and `(B)` hide B the same way;
//   - an output capture (`$r = git push ...`), the call operator, `git.exe`, a
//     path to git, a global option (`git -C ../wt push`) and a shell wrapper
//     (`bash -c "git push"`, `powershell -Command "git push"`) do not hide it;
//   - text that is data is not a command: a commit message, a PR body, a
//     quoted string and a heredoc note that mention `(git push origin main)`
//     are prose, and `echo git push` names git as an argument.
// `tool` is the name of the tool that sent the command ("Bash", "PowerShell");
// it picks the escape character for quotes inside a string.
//
// The hook classifies a command and then evaluates it, so the last reading is
// kept: one pass over the command per hook call, however long the command is.
let lastReading: { command: string; tool: string | undefined; found: GitInvocation[] } | null = null;

function gitCommands(command: string, tool: string | undefined): GitInvocation[] {
  if (lastReading === null || lastReading.command !== command || lastReading.tool !== tool) {
    lastReading = { command, tool, found: gitInvocations(command, tool) };
  }
  return lastReading.found;
}

export function classifyCommand(command: string, tool?: string): "push" | "commit" | "other" {
  const found = gitCommands(command, tool);
  if (found.some((git) => git.sub === "push")) return "push";
  if (found.some((git) => git.sub === "commit")) return "commit";
  return "other";
}

export function isProtectedBranch(branch: string): boolean {
  return branch === "main" || branch === "master" || /^release\//.test(branch);
}

/**
 * What the hook knows about the repository a git command runs in. `dirs` are
 * the values of the command's `-C <dir>` options, in order; none means the
 * hook's own directory. A branch lookup returns null when it cannot tell.
 */
export type BranchLookup = (dirs: readonly string[]) => string | null;
export type StagedLookup = (dirs: readonly string[]) => number;

const unquote = (word: string): string => /^(["'])(.*)\1$/s.exec(word)?.[2] ?? word;

// A redirect is not an argument of the command: `2>/dev/null`, `>push.log`,
// `2>$null`, and the `2>` the reader leaves of `2>&1` when it splits at `&`. A
// bare operator (`>`, `2>`) takes the next word as its file.
const REDIRECT_RE = /^(?:\d+|[*&])?[<>]/;
const BARE_REDIRECT_RE = /^(?:\d+|[*&])?[<>]+$/;
// The `git push` options whose value is the next word.
const PUSH_VALUE_OPTIONS: ReadonlySet<string> = new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec"]);
// A substitution that prints the current branch, in Bash `$(…)` or PowerShell `(…)`.
const CURRENT_BRANCH_RE =
  /^["']?\$?\(\s*git\s+(?:branch\s+--show-current|rev-parse\s+--abbrev-ref\s+HEAD|symbolic-ref\s+(?:--short\s+)?HEAD)\s*\)/;

// The branch one `git push` names as its destination, or null when it pushes
// the current branch: no refspec (`git push`, `git push origin`), `HEAD`, `@`,
// or a substitution that prints the current branch. Reads through quotes, a
// leading `+`, `src:dst` and a `refs/heads/` prefix.
function namedTarget(push: GitInvocation): string | null {
  // Where the first two operands sit: the remote, then the first refspec.
  const operands: number[] = [];
  for (let i = 0; i < push.args.length && operands.length < 2; i++) {
    const word = push.args[i]!;
    if (word.startsWith("#")) break; // a comment runs to the end of the line
    if (REDIRECT_RE.test(word)) {
      if (BARE_REDIRECT_RE.test(word)) i++;
    } else if (word.startsWith("-")) {
      if (PUSH_VALUE_OPTIONS.has(word)) i++;
    } else {
      operands.push(i);
    }
  }
  const at = operands[1];
  if (at === undefined) return null;
  if (CURRENT_BRANCH_RE.test(push.args.slice(at).join(" "))) return null;
  const refspec = unquote(push.args[at]!).replace(/^\+/, "");
  const destination = refspec.slice(refspec.lastIndexOf(":") + 1).replace(/^refs\/heads\//, "");
  return destination === "" || destination === "HEAD" || destination === "@" ? null : destination;
}

// One answer per directory, however many commands ask.
function remember<T>(lookup: (dirs: readonly string[]) => T): (git: GitInvocation) => T {
  const answers = new Map<string, T>();
  return (git) => {
    const dirs = git.dirs.map(unquote);
    const key = dirs.join("\n");
    if (!answers.has(key)) answers.set(key, lookup(dirs));
    return answers.get(key) as T;
  };
}

// Gated when any push in the command goes to a protected branch. `--dry-run`
// exempts the push it is written on, not the whole command line. The current
// branch is a value, or a lookup the hook runs in the directory of the push
// (`git -C ../wt push` pushes the branch checked out in ../wt); the lookup is
// only called for a push that names no branch of its own.
export function evaluatePush(
  command: string,
  currentBranch: string | null | BranchLookup,
  tool?: string,
): { gated: boolean; branch: string | null } {
  const current = remember(typeof currentBranch === "function" ? currentBranch : () => currentBranch);
  let seen: string | null = null;
  for (const git of gitCommands(command, tool)) {
    if (git.sub !== "push" || git.args.includes("--dry-run")) continue;
    const branch = namedTarget(git) ?? current(git);
    if (!branch) continue;
    if (isProtectedBranch(branch)) return { gated: true, branch };
    seen ??= branch;
  }
  return { gated: false, branch: seen };
}

// `--amend` adds no files, so a command with an amending commit is exempt. The
// flag is read from a commit's own arguments: a message that mentions `--amend`
// does not switch the gate off. The staged count is a value, or a lookup the
// hook runs in the directory of the commit (`git -C ../wt commit`).
export function evaluateCommitSize(
  command: string,
  stagedCount: number | StagedLookup,
  tool?: string,
): { gated: boolean } {
  const commits = gitCommands(command, tool).filter((git) => git.sub === "commit");
  if (commits.some((git) => git.args.includes("--amend"))) return { gated: false };
  if (typeof stagedCount !== "function") return { gated: stagedCount > COMMIT_FILE_LIMIT };
  const staged = remember(stagedCount);
  return { gated: commits.some((git) => staged(git) > COMMIT_FILE_LIMIT) };
}

export function decide(mode: HookPackMode, gated: boolean, reason: string): HookPackDecision {
  if (!gated || mode === "off") return ALLOW;
  return { action: mode === "block" ? "block" : "warn", reason };
}
