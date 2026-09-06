/**
 * Destructive-Bash classifier for hooks/gateguard.mjs.
 *
 * Two layers, pure and dependency-free so a table test and a future
 * `gateguard-explain` CLI can drive it without spawning the hook:
 *
 *   1. Structured rules: the command is split at unquoted separators
 *      (`|`, `||`, `&&`, `;`, newline) and each simple command is tokenized,
 *      so flag order and spelling stop mattering. `rm -r -f`, `rm -Rf` and
 *      `rm --recursive --force` are the same command; `git clean -fdx` and
 *      `git clean --force -d` are the same command. Each rule has a stable id
 *      the deny reason prints, so a block is explainable.
 *   2. The original substring list, kept verbatim as the fallback so nothing
 *      that was caught before stops being caught.
 *
 * What is deliberately NOT here: plain file writes through Bash (`cat > x`,
 * `sed -i`). Gating those would break the operator workflow that uses Bash
 * precisely to write files; that limit is disclosed on the site and README.
 *
 * Message-flag carve-out: the VALUE of a commit message, PR body, title, or
 * note is prose, never a command. It is blanked before any rule runs, so
 * `git commit -m "rm -rf the old helper"` stays allowed. `-c` is not a message
 * flag: `bash -c "rm -rf /"` carries a real command and still gates.
 */

export interface DestructiveVerdict {
  destructive: boolean;
  /** Stable rule id, e.g. `rm-recursive-force` or `substring:git reset --hard`; null when allowed. */
  rule: string | null;
}

export const DESTRUCTIVE_PATTERNS: readonly string[] = [
  "rm -rf",
  "rm -fr",
  "git reset --hard",
  "git push --force",
  "git push -f",
  "--force-with-lease",
  "git branch -D",
  "drop table",
  "drop database",
  "drop schema",
  "truncate ",
  "mkfs",
  "dd if=",
  "format ",
  "rmdir /s",
  "del /f /q",
  "del /q /f",
  "Remove-Item -Recurse",
  "Remove-Item -Force",
];

// Flags whose VALUE is human prose (a commit message, a PR body) or a filename —
// never a command to execute. Their contents must not trip the destructive scan.
const MESSAGE_FLAG_RE =
  /(^|\s)(-m|--message|-F|--file|--body|--body-file|--title|--notes|-C|--reuse-message)(=|\s+)('[^']*'|"[^"]*"|\S+)/g;

/** Blank the value of every message/body flag; the flag itself is preserved. */
export function stripMessageArgs(command: string): string {
  return command.replace(MESSAGE_FLAG_RE, (_match, lead: string, flag: string) => `${lead}${flag} `);
}

// Split at shell separators that sit outside single or double quotes.
function splitSimpleCommands(command: string): string[] {
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
    if (ch === "\n" || ch === ";") {
      segments.push(current);
      current = "";
      continue;
    }
    if (ch === "|" || ch === "&") {
      // `||`, `&&`, `|`, `&` all end the simple command; collapse a doubled char.
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

function tokenize(segment: string): string[] {
  return segment.split(/\s+/).filter((t) => t !== "");
}

// Drop `sudo`, `env`, and leading VAR=value assignments so the command word is
// the first token the rules look at.
function commandTokens(segment: string): string[] {
  const tokens = tokenize(segment);
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t === "sudo" || t === "env" || t === "command" || /^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) {
      i++;
      continue;
    }
    break;
  }
  return tokens.slice(i);
}

// For `git`, skip global options (`-C <dir>`, `-c k=v`, `--git-dir=…`) to find
// the subcommand and its own arguments.
function gitSubcommand(tokens: string[]): { sub: string; args: string[] } | null {
  if (tokens[0] !== "git") return null;
  let i = 1;
  while (i < tokens.length && tokens[i]!.startsWith("-")) {
    const t = tokens[i]!;
    i += t === "-C" || t === "-c" || t === "--git-dir" || t === "--work-tree" ? 2 : 1;
  }
  const sub = tokens[i];
  if (!sub) return null;
  return { sub, args: tokens.slice(i + 1) };
}

const isShortFlag = (t: string): boolean => /^-[A-Za-z]+$/.test(t);
const hasShortLetter = (t: string, letters: RegExp): boolean => isShortFlag(t) && letters.test(t.slice(1));

interface Rule {
  id: string;
  test: (tokens: string[]) => boolean;
}

const STRUCTURED_RULES: readonly Rule[] = [
  {
    id: "rm-recursive-force",
    test: (tokens) => {
      if (tokens[0] !== "rm") return false;
      const flags = tokens.slice(1).filter((t) => t.startsWith("-"));
      const recursive = flags.some((t) => t === "--recursive" || hasShortLetter(t, /[rR]/));
      const force = flags.some((t) => t === "--force" || hasShortLetter(t, /f/));
      return recursive && force;
    },
  },
  {
    id: "git-clean-force",
    test: (tokens) => {
      const git = gitSubcommand(tokens);
      if (!git || git.sub !== "clean") return false;
      const dryRun = git.args.some((t) => t === "--dry-run" || hasShortLetter(t, /n/));
      const force = git.args.some((t) => t === "--force" || hasShortLetter(t, /f/));
      return force && !dryRun;
    },
  },
  {
    id: "git-checkout-discard",
    test: (tokens) => {
      const git = gitSubcommand(tokens);
      if (!git || git.sub !== "checkout") return false;
      const dash = git.args.indexOf("--");
      if (dash !== -1) return git.args.length > dash + 1; // `git checkout -- <pathspec>` discards
      const first = git.args.find((t) => !t.startsWith("-"));
      return first === "." || first === "./";
    },
  },
  {
    id: "git-restore-discard",
    test: (tokens) => {
      const git = gitSubcommand(tokens);
      if (!git || git.sub !== "restore") return false;
      const pathspec = git.args.some((t) => !t.startsWith("-"));
      if (!pathspec) return false;
      const staged = git.args.some((t) => t === "--staged" || hasShortLetter(t, /S/));
      const worktree = git.args.some((t) => t === "--worktree" || hasShortLetter(t, /W/));
      return !staged || worktree; // `--staged` alone only unstages
    },
  },
  {
    id: "find-delete",
    test: (tokens) => tokens[0] === "find" && tokens.includes("-delete"),
  },
  {
    id: "git-push-plus-refspec",
    test: (tokens) => {
      const git = gitSubcommand(tokens);
      if (!git || git.sub !== "push") return false;
      return git.args.some((t) => t.startsWith("+") && t.length > 1);
    },
  },
  {
    id: "git-stash-drop",
    test: (tokens) => {
      const git = gitSubcommand(tokens);
      if (!git || git.sub !== "stash") return false;
      return git.args[0] === "drop" || git.args[0] === "clear";
    },
  },
];

/** Classify one Bash command string. Pure; never throws on odd input. */
export function classifyDestructiveBash(command: string): DestructiveVerdict {
  if (typeof command !== "string" || command.trim() === "") return { destructive: false, rule: null };
  const stripped = stripMessageArgs(command);

  for (const segment of splitSimpleCommands(stripped)) {
    const tokens = commandTokens(segment);
    if (tokens.length === 0) continue;
    for (const rule of STRUCTURED_RULES) {
      if (rule.test(tokens)) return { destructive: true, rule: rule.id };
    }
  }

  const lower = stripped.toLowerCase();
  const hit = DESTRUCTIVE_PATTERNS.find((p) => lower.includes(p.toLowerCase()));
  if (hit !== undefined) return { destructive: true, rule: `substring:${hit}` };
  return { destructive: false, rule: null };
}
