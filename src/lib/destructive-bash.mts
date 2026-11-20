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
 *
 * Heredoc and here-string bodies are data too. They are lifted out before the
 * block split and the pipeline rule run, so a note or a table that mentions a
 * command is not read as one. A body that is a message (`-m "$(cat <<'EOF'`)
 * is dropped whole; any other body keeps the reach it had before the block
 * split existed (the plain split for a heredoc, the substring list for both).
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
  "rmdir /s",
  "del /f /q",
  "del /q /f",
  "Remove-Item -Recurse",
  "Remove-Item -Force",
  "io.directory]::delete(",
];

// Flags whose VALUE is human prose (a commit message, a PR body) or a filename —
// never a command to execute. Their contents must not trip the destructive scan.
const MESSAGE_FLAG_RE =
  /(^|\s)(-m|--message|-F|--file|--body|--body-file|--title|--notes|-C|--reuse-message)(=|\s+)('[^']*'|"[^"]*"|\S+)/g;

/** Blank the value of every message/body flag; the flag itself is preserved. */
export function stripMessageArgs(command: string): string {
  return command.replace(MESSAGE_FLAG_RE, (_match, lead: string, flag: string) => `${lead}${flag} `);
}

interface HereBody {
  text: string;
  /** Offset of the opener in the body-free command text. */
  at: number;
  /** A PowerShell here-string (`@'` … `'@`), as opposed to a Bash heredoc. */
  hereString: boolean;
}

const HEREDOC_OPENER_RE = /^<<(-?)[ \t]*(?:'([^'\n]+)'|"([^"\n]+)"|\\?([A-Za-z_][\w.-]*))/;

// Where the body of a heredoc ends: the first line that is exactly the
// delimiter word (after leading tabs, for `<<-`). Null when no such line exists.
function findHeredocEnd(command: string, from: number, word: string, tabs: boolean): { bodyEnd: number; next: number } | null {
  let pos = from;
  while (pos <= command.length) {
    const nl = command.indexOf("\n", pos);
    const lineEnd = nl === -1 ? command.length : nl;
    let line = command.slice(pos, lineEnd).replace(/\r$/, "");
    if (tabs) line = line.replace(/^\t+/, "");
    if (line === word) return { bodyEnd: pos, next: nl === -1 ? command.length : nl + 1 };
    if (nl === -1) return null;
    pos = nl + 1;
  }
  return null;
}

// Lift heredoc and here-string bodies out of the command. A body is data being
// written somewhere, not a command line, so the block split and the pipeline
// rule must not read it: a note that says "(git clean -fd would remove the
// fixtures)" or a markdown table row `| del | Remove-Item |` is not a command.
// `code` is the command with every body removed; a here-string leaves an empty
// quoted string behind so the statement around it still tokenizes.
function extractHereBodies(command: string): { code: string; bodies: HereBody[] } {
  let code = "";
  const bodies: HereBody[] = [];
  const pending: Array<{ word: string; tabs: boolean; at: number }> = [];
  let quote: '"' | "'" | null = null;
  let i = 0;
  while (i < command.length) {
    const ch = command[i]!;
    // A Bash heredoc opener. It counts inside double quotes too, because the
    // usual commit spelling is `-m "$(cat <<'EOF'`. `<<<` is a here-string of
    // one word and has no body.
    if (ch === "<" && quote !== "'" && command[i + 1] === "<" && command[i + 2] !== "<" && command[i - 1] !== "<") {
      const opener = HEREDOC_OPENER_RE.exec(command.slice(i, i + 256));
      if (opener) {
        pending.push({ word: opener[2] ?? opener[3] ?? opener[4]!, tabs: opener[1] === "-", at: code.length });
        code += opener[0];
        i += opener[0].length;
        continue;
      }
    }
    if (ch === "\n" && pending.length > 0) {
      code += ch;
      i++;
      while (pending.length > 0) {
        const open = pending.shift()!;
        const end = findHeredocEnd(command, i, open.word, open.tabs);
        if (end === null) {
          // No terminator line: not a heredoc after all. The text stays code.
          pending.length = 0;
          break;
        }
        bodies.push({ text: command.slice(i, end.bodyEnd), at: open.at, hereString: false });
        i = end.next;
      }
      continue;
    }
    // A PowerShell here-string: `@'` or `@"` ends its line, and `'@` or `"@`
    // at the start of a later line closes it.
    if (ch === "@" && quote === null && (command[i + 1] === "'" || command[i + 1] === '"')) {
      const q = command[i + 1]!;
      const lineBreak = /^[ \t]*\r?\n/.exec(command.slice(i + 2, i + 64));
      if (lineBreak) {
        const bodyStart = i + 2 + lineBreak[0].length;
        const close = command.indexOf(`\n${q}@`, bodyStart - 1);
        if (close !== -1) {
          bodies.push({ text: command.slice(bodyStart, Math.max(bodyStart, close)), at: code.length, hereString: true });
          code += `${q}${q}`;
          i = close + 3;
          continue;
        }
      }
    }
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    }
    code += ch;
    i++;
  }
  return { code, bodies };
}

// `git commit -F - <<'EOF'` and `gh pr create --body-file - <<'EOF'` read the
// message from stdin, so the heredoc that follows on the same command is the
// message.
const STDIN_MESSAGE_RE = /(?:^|\s)(?:-F|--file|--body-file)(?:=|\s+)-\s[^\n;|&]*$/;

// The bodies that still have to be scanned. A body that is the value of a
// message or body flag (`git commit -m "$(cat <<'EOF' … EOF)"`) is prose and is
// dropped whole, exactly like a quoted message.
function scannableBodies(code: string, bodies: readonly HereBody[]): HereBody[] {
  const messageSpans = [...code.matchAll(MESSAGE_FLAG_RE)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
  return bodies
    .filter((body) => !messageSpans.some(([start, end]) => body.at >= start! && body.at < end!))
    .filter((body) => !STDIN_MESSAGE_RE.test(code.slice(0, body.at)))
    .map((body) => ({ ...body, text: stripMessageArgs(body.text) }));
}

interface SimpleCommand {
  text: string;
  /** True when a single `|` feeds this command, so its input decides what it acts on. */
  piped: boolean;
}

type Feed = "none" | "spaced" | "tight";

// Split at shell separators that sit outside single or double quotes. With
// `blocks`, an unquoted `{`, `}`, `(` or `)` ends a command too, so the body of
// a PowerShell script block (`if ($?) { git clean -fdx }`), a try block or a
// parenthesised group starts a segment of its own.
function splitSimpleCommands(command: string, blocks: boolean): SimpleCommand[] {
  const segments: SimpleCommand[] = [];
  let current = "";
  let feed: Feed = "none";
  let quote: '"' | "'" | null = null;
  const end = (by: string, nextFeed: Feed): void => {
    const text = current.trim();
    current = "";
    if (text === "") {
      // An empty stretch (a line break after `|`, or a `|` that starts a line)
      // does not use up the pipe, but a pipe needs a command on its left.
      if (feed === "none" && segments.length > 0) feed = nextFeed;
      return;
    }
    // `rm|del|erase)` is a `case` pattern and `^(rm|del|rd)$` is a regex
    // alternation: a `|` with no space on either side whose right-hand word
    // runs straight into another `|` or a `)` is not a pipeline.
    const alternation = feed === "tight" && (by === "|" || by === ")");
    segments.push({ text, piped: feed !== "none" && !alternation });
    feed = nextFeed;
  };
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
      end(ch, "none");
      continue;
    }
    if (ch === "|" || ch === "&") {
      // `||`, `&&`, `|`, `&` all end the simple command; collapse a doubled char.
      const doubled = command[i + 1] === ch;
      if (doubled) {
        i++;
        end(ch + ch, "none");
      } else if (ch === "&") {
        end(ch, "none");
      } else {
        const tight = i > 0 && /\S/.test(command[i - 1]!) && /\S/.test(command[i + 1] ?? " ");
        end(ch, tight ? "tight" : "spaced");
      }
      continue;
    }
    current += ch;
  }
  end("", "none");
  return segments;
}

// PowerShell line continuation: an unquoted backtick at the end of a line joins
// the next line to this command, so `Remove-Item` and its switches stay together.
function joinLineContinuations(command: string): string {
  let joined = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "`" && /^\r?\n/.test(command.slice(i + 1, i + 3))) {
      i += command[i + 1] === "\r" ? 2 : 1;
      joined += " ";
      continue;
    }
    joined += ch;
  }
  return joined;
}

// Every simple command the rules should look at. The plain split comes first
// and stays authoritative for what it already caught: a brace expansion between
// a command word and its flag (`find {src,test} -delete`) must not hide the
// flag. The block split adds the commands that only start after `{` or `(`.
// The continuation-joined view is an extra pass, never a replacement: in Bash
// a backtick that ends a line closes a command substitution, and the next line
// is still a command of its own.
function allSimpleCommands(command: string): SimpleCommand[] {
  const segments = [...splitSimpleCommands(command, false), ...splitSimpleCommands(command, true)];
  const joined = joinLineContinuations(command);
  if (joined !== command) {
    segments.push(...splitSimpleCommands(joined, false), ...splitSimpleCommands(joined, true));
  }
  return segments;
}

function tokenize(segment: string): string[] {
  return segment.split(/\s+/).filter((t) => t !== "");
}

// Drop `sudo`, `env`, leading VAR=value assignments and a `cmd /c` wrapper so
// the command word is the first token the rules look at.
function commandTokens(segment: string): string[] {
  const tokens = tokenize(segment);
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t === "sudo" || t === "env" || t === "command" || /^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) {
      i++;
      continue;
    }
    if (/^cmd(?:\.exe)?$/i.test(t) && /^\/[ck]$/i.test(tokens[i + 1] ?? "")) {
      i += 2;
      continue;
    }
    // PowerShell output capture: `$out = git clean -fdx`.
    if (/^\$[A-Za-z_][\w:]*$/.test(t) && /^\+?=$/.test(tokens[i + 1] ?? "")) {
      i += 2;
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

// PowerShell's Remove-Item by cmdlet name or alias. Command names are
// case-insensitive, a switch can sit anywhere after the command word, and any
// unambiguous prefix of a switch name is accepted (`-r`, `-rec`, `-fo`), with
// an optional `:value` suffix (`-Force:$true`).
const PS_REMOVE_COMMANDS: ReadonlySet<string> = new Set(["remove-item", "ri", "rd", "rmdir", "del", "erase"]);
// The names that are only ever the PowerShell cmdlet, for the pipeline rule.
const PS_REMOVE_PIPE_TARGETS: ReadonlySet<string> = new Set(["remove-item", "ri", "rd", "del", "erase"]);
const PS_RECURSE_RE = /^-r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?(?::.*)?$/i;
const PS_FORCE_RE = /^-fo(?:r(?:c(?:e)?)?)?(?::.*)?$/i;
// `rm` is also the POSIX command, whose `-r` and `-f` belong to
// rm-recursive-force. It only counts as Remove-Item when a switch is spelled
// the way POSIX rm cannot be: at least `-re` or `-fo`.
const PS_RECURSE_LONG_RE = /^-re(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?(?::.*)?$/i;

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
    // Either switch gates, the same reach as the "Remove-Item -Recurse" and
    // "Remove-Item -Force" substrings this rule generalises: those only matched
    // with the switch directly after the cmdlet name.
    id: "powershell-remove-item",
    test: (tokens) => {
      const cmd = tokens[0]!.toLowerCase();
      const switches = tokens.slice(1);
      if (cmd === "rm") {
        return switches.some((t) => PS_RECURSE_LONG_RE.test(t) || PS_FORCE_RE.test(t));
      }
      if (!PS_REMOVE_COMMANDS.has(cmd)) return false;
      return switches.some((t) => PS_RECURSE_RE.test(t) || PS_FORCE_RE.test(t));
    },
  },
  {
    // cmd.exe's tree delete, reached through `cmd /c`: `rd /s` and `rmdir /s`.
    id: "cmd-rmdir-tree",
    test: (tokens) => {
      const cmd = tokens[0]!.replace(/^["']/, "").toLowerCase();
      return (cmd === "rd" || cmd === "rmdir") && tokens.slice(1).some((t) => /^\/s$/i.test(t));
    },
  },
  {
    // The DOS/Windows volume formatter, as the command word only. This used to
    // be the substring "format ", which also matched every `-Format`,
    // `-UFormat` and `--output-format` parameter.
    id: "format-volume",
    test: (tokens) => tokens.length > 1 && /^format(?:\.com|\.exe)?$/i.test(tokens[0]!.replace(/^["']/, "")),
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

function matchStructuredRule(tokens: string[]): string | null {
  for (const rule of STRUCTURED_RULES) {
    if (rule.test(tokens)) return rule.id;
  }
  return null;
}

/** Classify one Bash command string. Pure; never throws on odd input. */
export function classifyDestructiveBash(command: string): DestructiveVerdict {
  if (typeof command !== "string" || command.trim() === "") return { destructive: false, rule: null };
  const { code, bodies } = extractHereBodies(command);
  const stripped = stripMessageArgs(code);
  const scanned = scannableBodies(code, bodies);

  for (const segment of allSimpleCommands(stripped)) {
    const tokens = commandTokens(segment.text);
    if (tokens.length === 0) continue;
    const rule = matchStructuredRule(tokens);
    if (rule !== null) return { destructive: true, rule };
    // `Get-ChildItem build -Recurse | Remove-Item`: the pipeline decides what is
    // deleted, which this classifier cannot see, so a piped delete always gates.
    if (segment.piped && PS_REMOVE_PIPE_TARGETS.has(tokens[0]!.toLowerCase())) {
      return { destructive: true, rule: "powershell-remove-item-pipeline" };
    }
  }

  // A heredoc body keeps the reach it always had: a body line that is itself a
  // command (`cat > cleanup.sh <<'EOF'` + `git clean -fdx`) is still read by
  // the plain split. A here-string body sits inside quotes and was only ever
  // reached by the substring list below.
  for (const body of scanned) {
    if (body.hereString) continue;
    for (const segment of splitSimpleCommands(body.text, false)) {
      const tokens = commandTokens(segment.text);
      if (tokens.length === 0) continue;
      const rule = matchStructuredRule(tokens);
      if (rule !== null) return { destructive: true, rule };
    }
  }

  const lower = [stripped, ...scanned.map((body) => body.text)].join("\n").toLowerCase();
  const hit = DESTRUCTIVE_PATTERNS.find((p) => lower.includes(p.toLowerCase()));
  if (hit !== undefined) return { destructive: true, rule: `substring:${hit}` };
  return { destructive: false, rule: null };
}
