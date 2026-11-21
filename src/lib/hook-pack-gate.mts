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

import { gitInvocations, UNKNOWN_DIR, type GitInvocation } from "./destructive-bash.mjs";

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
 * the directories the command line enters before the command, in order: the
 * targets of its `cd` commands, then the command's own `-C <dir>` values; none
 * means the hook's own directory. A branch lookup returns null when it cannot
 * tell. `switchedTo` is the name an earlier `git checkout <name>` on the line
 * gave: a branch, or a path. The lookup answers `switchedTo` when it names a
 * branch of that repository, and the branch checked out there when it does not.
 */
export type BranchLookup = (dirs: readonly string[], switchedTo?: string) => string | null;
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

// One answer per question, however many commands ask it.
function remember<T>(lookup: (dirs: readonly string[], extra?: string) => T): (dirs: readonly string[], extra?: string) => T {
  const answers = new Map<string, T>();
  return (dirs, extra) => {
    const key = `${dirs.join("\n")}\n\n${extra ?? ""}`;
    if (!answers.has(key)) answers.set(key, lookup(dirs, extra));
    return answers.get(key) as T;
  };
}

// Where a git command runs, or null when the command line went somewhere the
// reader cannot name (`cd -`, `popd`).
function directoriesOf(git: GitInvocation): string[] | null {
  return git.dirs.includes(UNKNOWN_DIR) ? null : git.dirs.map(unquote);
}

/**
 * What a `git checkout` or `git switch` leaves checked out: `branch` when the
 * command can only mean a branch (`checkout -b x`, `switch x`), `candidate`
 * when the word is a branch or a path (`checkout x`), `unknown` when the name
 * cannot be read (`checkout -`, `checkout "$b"`, `--track`, `--detach`).
 * Undefined when the command switches nothing (`checkout -- file`).
 */
type Switched = { branch: string } | { candidate: string } | "unknown";

// The flags that create the branch named after them (`checkout -b`, `switch
// -c`), and the ones after which the branch has a name the reader does not
// work out (`--track origin/x`, `--detach`).
const CHECKOUT_CREATE_RE = /^(?:-[A-Za-z]*[bB]|--orphan)$/;
const SWITCH_CREATE_RE = /^(?:-[A-Za-z]*[cC]|--create|--force-create|--orphan)$/;
const UNNAMED_SWITCH_RE = /^(?:-[A-Za-z]*[dt]|--detach|--track(?:=.*)?)$/;
const PLAIN_BRANCH_NAME_RE = /^[\w.@#+][\w./@#+-]*$/;

function switchedBy(git: GitInvocation): Switched | undefined {
  const operands: string[] = [];
  let created: string | undefined;
  let unnamed = false;
  for (let i = 0; i < git.args.length; i++) {
    const word = git.args[i]!;
    if (word === "--") return undefined; // `git checkout [<tree>] -- <paths>` switches nothing
    if (word.startsWith("#")) break;
    if (REDIRECT_RE.test(word)) {
      if (BARE_REDIRECT_RE.test(word)) i++;
    } else if (word === "-") {
      unnamed = true; // the branch checked out before this one
    } else if ((git.sub === "checkout" ? CHECKOUT_CREATE_RE : SWITCH_CREATE_RE).test(word)) {
      created = git.args[++i];
    } else if (UNNAMED_SWITCH_RE.test(word)) {
      unnamed = true;
    } else if (!word.startsWith("-")) {
      operands.push(word);
    }
  }
  const plain = (word: string | undefined): string | null => {
    const name = word === undefined ? "" : unquote(word);
    return PLAIN_BRANCH_NAME_RE.test(name) ? name : null;
  };
  if (created !== undefined) {
    const name = plain(created);
    return name === null ? "unknown" : { branch: name };
  }
  if (unnamed) return "unknown";
  if (operands.length !== 1) return undefined; // nothing named, or `git checkout <tree> <path>`
  const name = plain(operands[0]);
  if (name === null) return "unknown";
  return git.sub === "switch" ? { branch: name } : { candidate: name };
}

// Gated when any push in the command goes to a protected branch. `--dry-run`
// exempts the push it is written on, not the whole command line.
//
// A push that names no branch of its own pushes the branch checked out where
// the push runs, after everything the command line did before it:
//   - a `cd`, `pushd` or `Set-Location` moved it to another directory
//     (`cd ../wt && git push` pushes the branch of ../wt, as `git -C ../wt
//     push` does);
//   - a `git checkout -b x`, `git switch x` or `git checkout x` in that
//     directory changed the branch.
// The current branch is a lookup the hook runs in that directory, called only
// when the command line itself does not say, or a plain value: the branch of
// the hook's own directory. A directory or a branch that cannot be read is
// unknown, and unknown is allowed.
export function evaluatePush(
  command: string,
  currentBranch: string | null | BranchLookup,
  tool?: string,
): { gated: boolean; branch: string | null } {
  const lookup = typeof currentBranch === "function" ? remember(currentBranch) : null;
  const switched = new Map<string, Switched>();
  let seen: string | null = null;
  for (const git of gitCommands(command, tool)) {
    const dirs = directoriesOf(git);
    const where = dirs === null ? null : dirs.join("\n");
    if (git.sub === "checkout" || git.sub === "switch") {
      const to = switchedBy(git);
      if (to !== undefined && where !== null) switched.set(where, to);
      continue;
    }
    if (git.sub !== "push" || git.args.includes("--dry-run")) continue;
    let branch = namedTarget(git);
    if (branch === null && dirs !== null && where !== null) {
      const to = switched.get(where);
      // A plain value is the branch of the hook's own directory: it says
      // nothing about another one, and it cannot tell a branch from a path.
      if (to === undefined) branch = lookup ? lookup(dirs) : dirs.length === 0 ? (currentBranch as string | null) : null;
      else if (to === "unknown") branch = null;
      else if ("branch" in to) branch = to.branch;
      else branch = lookup ? lookup(dirs, to.candidate) : to.candidate;
    }
    if (!branch) continue;
    if (isProtectedBranch(branch)) return { gated: true, branch };
    seen ??= branch;
  }
  return { gated: false, branch: seen };
}

// `--amend` adds no files, so a command with an amending commit is exempt. The
// flag is read from a commit's own arguments: a message that mentions `--amend`
// does not switch the gate off. The staged count is a value, or a lookup the
// hook runs in the directory of the commit (`git -C ../wt commit`, `cd ../wt
// && git commit`). A commit in a directory that cannot be read is not counted.
export function evaluateCommitSize(
  command: string,
  stagedCount: number | StagedLookup,
  tool?: string,
): { gated: boolean } {
  const commits = gitCommands(command, tool).filter((git) => git.sub === "commit");
  if (commits.some((git) => git.args.includes("--amend"))) return { gated: false };
  if (typeof stagedCount !== "function") return { gated: stagedCount > COMMIT_FILE_LIMIT };
  const staged = remember(stagedCount);
  return {
    gated: commits.some((git) => {
      const dirs = directoriesOf(git);
      return dirs !== null && staged(dirs) > COMMIT_FILE_LIMIT;
    }),
  };
}

export function decide(mode: HookPackMode, gated: boolean, reason: string): HookPackDecision {
  if (!gated || mode === "off") return ALLOW;
  return { action: mode === "block" ? "block" : "warn", reason };
}
