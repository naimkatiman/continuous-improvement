/**
 * Destructive-command classifier for hooks/gateguard.mjs. It reads the command
 * of the Bash tool and of the PowerShell tool.
 *
 * Two layers, pure and dependency-free so a table test and a future
 * `gateguard-explain` CLI can drive it without spawning the hook:
 *
 *   1. Structured rules: the command is split at unquoted separators
 *      (`|`, `||`, `&&`, `;`, newline, and in a second pass the braces and
 *      parentheses of a block or group) and each simple command is tokenized,
 *      so flag order and spelling stop mattering. `rm -r -f`, `rm -Rf` and
 *      `rm --recursive --force` are the same command; `git clean -fdx` and
 *      `git clean --force -d` are the same command. The command word is
 *      normalised first (`git.exe`, a path to the program, a `$var=` capture),
 *      git's global options are skipped to find the subcommand, and the
 *      command line a shell wrapper runs (`bash -c`, `pwsh -Command`,
 *      `cmd /c`) is classified like any other. Each rule has a stable id the
 *      deny reason prints, so a block is explainable.
 *   2. The substring list, as the fallback for text that no rule reads as a
 *      command: SQL in a quoted argument, a command handed to `ssh` or
 *      `xargs`. A pattern leaves the list only when a rule covers its whole
 *      reach (`format `, the two `Remove-Item` switch-first spellings).
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
 * Data by its command: the substring list also skips the message after git's
 * clustered `-am` and gh's short `-b` / `-t` / `-n`, the quoted pattern of a
 * search command (`grep "rm -rf" docs/`) and the quoted text a print command
 * sends to the terminal (`echo "next: rm -rf build"`). A print command that
 * feeds a pipe or a file keeps its reach (`echo "DROP TABLE t" | psql`).
 *
 * Heredoc and here-string bodies are data too. They are lifted out before the
 * block split and the pipeline rule run, so a note or a table that mentions a
 * command is not read as one. A body that is a message (`-m "$(cat <<'EOF'`)
 * is dropped whole; any other body keeps the reach it had before the block
 * split existed (the plain split for a heredoc, the substring list for both).
 */
const FORCE_BRANCH_DELETE = "git branch -D";
export const DESTRUCTIVE_PATTERNS = [
    "rm -rf",
    "rm -fr",
    "git reset --hard",
    "git push --force",
    "git push -f",
    "--force-with-lease",
    FORCE_BRANCH_DELETE,
    "drop table",
    "drop database",
    "drop schema",
    "truncate ",
    "mkfs",
    "dd if=",
    "rmdir /s",
    "del /f /q",
    "del /q /f",
    "io.directory]::delete(",
];
// Flags whose VALUE is human prose (a commit message, a PR body) or a filename —
// never a command to execute. Their contents must not trip the destructive scan.
// `-C` is not here: before the subcommand it is git's "run in this directory"
// option, and blanking its value made the parser read the subcommand as the
// directory (`git -C ../wt clean -fdx`).
// An unquoted value ends at whitespace or at a separator: in
// `git commit -m wip; git push` the `;` belongs to the shell, not to the message.
const MESSAGE_FLAG_RE = /(^|\s)(-m|--message|-F|--file|--body|--body-file|--title|--notes|--reuse-message)(=|\s+)('[^']*'|"[^"]*"|[^\s;|&]+)/g;
/** Blank the value of every message/body flag; the flag itself is preserved. */
export function stripMessageArgs(command) {
    return command.replace(MESSAGE_FLAG_RE, (_match, lead, flag) => `${lead}${flag} `);
}
const HEREDOC_OPENER_RE = /^<<(-?)[ \t]*(?:'([^'\n]+)'|"([^"\n]+)"|\\?([A-Za-z_][\w.-]*))/;
// Where the body of a heredoc ends: the first line that is exactly the
// delimiter word (after leading tabs, for `<<-`). Null when no such line exists.
function findHeredocEnd(command, from, word, tabs) {
    let pos = from;
    while (pos <= command.length) {
        const nl = command.indexOf("\n", pos);
        const lineEnd = nl === -1 ? command.length : nl;
        let line = command.slice(pos, lineEnd).replace(/\r$/, "");
        if (tabs)
            line = line.replace(/^\t+/, "");
        if (line === word)
            return { bodyEnd: pos, next: nl === -1 ? command.length : nl + 1 };
        if (nl === -1)
            return null;
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
function extractHereBodies(command) {
    let code = "";
    const bodies = [];
    const pending = [];
    let quote = null;
    let i = 0;
    while (i < command.length) {
        const ch = command[i];
        // A Bash heredoc opener. It counts inside double quotes too, because the
        // usual commit spelling is `-m "$(cat <<'EOF'`. `<<<` is a here-string of
        // one word and has no body.
        if (ch === "<" && quote !== "'" && command[i + 1] === "<" && command[i + 2] !== "<" && command[i - 1] !== "<") {
            const opener = HEREDOC_OPENER_RE.exec(command.slice(i, i + 256));
            if (opener) {
                pending.push({ word: opener[2] ?? opener[3] ?? opener[4], tabs: opener[1] === "-", at: code.length });
                code += opener[0];
                i += opener[0].length;
                continue;
            }
        }
        if (ch === "\n" && pending.length > 0) {
            code += ch;
            i++;
            while (pending.length > 0) {
                const open = pending.shift();
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
            const q = command[i + 1];
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
            if (ch === quote)
                quote = null;
        }
        else if (ch === '"' || ch === "'") {
            quote = ch;
        }
        code += ch;
        i++;
    }
    return { code, bodies };
}
// `git commit -F - <<'EOF'` and `gh pr create --body-file - <<'EOF'` read the
// message from stdin, so the heredoc that follows on the same command is the
// message. Only git and gh: another program's `--file -` is its input, and
// `psql --file - <<'SQL'` runs what the heredoc holds.
const STDIN_MESSAGE_RE = /(?:^|[\s;|&(])(?:git|gh)(?:\.exe)?\s(?:[^\n;|&]*\s)?(?:-F|--file|--body-file)(?:=|\s+)-\s[^\n;|&]*$/;
// The bodies that still have to be scanned. A body that is the value of a
// message or body flag (`git commit -m "$(cat <<'EOF' … EOF)"`) is prose and is
// dropped whole, exactly like a quoted message.
function scannableBodies(code, bodies, messages = []) {
    const messageSpans = [
        ...[...code.matchAll(MESSAGE_FLAG_RE)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length]),
        ...messages,
    ];
    return bodies
        .filter((body) => !messageSpans.some(([start, end]) => body.at >= start && body.at < end))
        .filter((body) => !STDIN_MESSAGE_RE.test(code.slice(0, body.at)))
        .map((body) => ({ ...body, text: stripMessageArgs(body.text) }));
}
// Split at shell separators that sit outside single or double quotes. With
// `blocks`, an unquoted `{`, `}`, `(` or `)` ends a command too, so the body of
// a PowerShell script block (`if ($?) { git clean -fdx }`), a try block or a
// parenthesised group starts a segment of its own.
function splitSimpleCommands(command, blocks) {
    const segments = [];
    let current = "";
    let feed = "none";
    let quote = null;
    const end = (by, nextFeed) => {
        const text = current.trim();
        current = "";
        if (text === "") {
            // An empty stretch (a line break after `|`, or a `|` that starts a line)
            // does not use up the pipe, but a pipe needs a command on its left.
            if (feed === "none" && segments.length > 0)
                feed = nextFeed;
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
            end(ch, "none");
            continue;
        }
        if (ch === "|" || ch === "&") {
            // `||`, `&&`, `|`, `&` all end the simple command; collapse a doubled char.
            const doubled = command[i + 1] === ch;
            if (doubled) {
                i++;
                end(ch + ch, "none");
            }
            else if (ch === "&") {
                end(ch, "none");
            }
            else {
                const tight = i > 0 && /\S/.test(command[i - 1]) && /\S/.test(command[i + 1] ?? " ");
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
// Bash line continuation: a backslash before the line break joins the two
// lines, outside single quotes (`git clean \` + `-fdx`). A backslash takes the
// character after it, so `\\` before a line break is a backslash and no join.
// Not under PowerShell, where a backslash that ends a line is the end of a path.
function joinLineContinuations(command, powershell) {
    let joined = "";
    let quote = null;
    for (let i = 0; i < command.length; i++) {
        const ch = command[i];
        if (!powershell && ch === "\\" && quote !== "'" && i + 1 < command.length) {
            const lineBreak = command[i + 1] === "\n" ? 1 : command[i + 1] === "\r" && command[i + 2] === "\n" ? 2 : 0;
            if (lineBreak === 0)
                joined += ch + command[i + 1];
            i += lineBreak === 0 ? 1 : lineBreak;
            continue;
        }
        if (quote) {
            if (ch === quote)
                quote = null;
        }
        else if (ch === '"' || ch === "'") {
            quote = ch;
        }
        else if (ch === "`" && /^\r?\n/.test(command.slice(i + 1, i + 3))) {
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
function allSimpleCommands(command, powershell) {
    const segments = [...splitSimpleCommands(command, false), ...splitSimpleCommands(command, true)];
    const joined = joinLineContinuations(command, powershell);
    if (joined !== command) {
        segments.push(...splitSimpleCommands(joined, false), ...splitSimpleCommands(joined, true));
    }
    return segments;
}
// Split at whitespace outside quotes. A quoted argument stays one word with its
// quotes on, so a directory with a space in it (`git -C "my repo" …`) is one
// option value and a flag-looking word inside a string is not a flag.
function splitWords(segment) {
    const words = [];
    let current = "";
    let quote = null;
    for (let i = 0; i < segment.length; i++) {
        const ch = segment[i];
        if (quote) {
            current += ch;
            if (ch === quote)
                quote = null;
        }
        else if (ch === '"' || ch === "'") {
            quote = ch;
            current += ch;
        }
        else if (/\s/.test(ch)) {
            if (current !== "")
                words.push({ text: current, end: i });
            current = "";
        }
        else {
            current += ch;
        }
    }
    if (current !== "")
        words.push({ text: current, end: segment.length });
    return words;
}
// The command word as the rules compare it: directory off, `.exe` off, lower
// case. `git.exe`, `/usr/bin/git`, `"C:\Program Files\Git\cmd\git.exe"` and
// `Microsoft.PowerShell.Management\Remove-Item` all name the plain command. A
// quoted word with no directory in it is left alone: that is a string literal
// (`"Format complete" | Out-File log.txt`), not a program.
function commandWord(token) {
    const quoted = /^(["'])(.*)\1$/s.exec(token);
    if (quoted && !/[\\/]/.test(quoted[2]))
        return token;
    const bare = quoted ? quoted[2] : token;
    return bare
        .replace(/^.*[\\/]/s, "")
        .replace(/\.exe$/i, "")
        .toLowerCase();
}
// The words a shell allows before the command word of a compound command:
// `then git clean -fdx`, `do git reset --hard`, `while ! git push`.
const SHELL_KEYWORDS = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "time"]);
// Drop `sudo`, `env`, leading VAR=value assignments, a PowerShell capture and
// (with `keywords`) the shell keywords, then normalise the command word, so the
// first word is the command the rules look at. A heredoc body is read without
// `keywords`: a line of a note that opens with "if" or "then" is prose.
function commandWords(segment, keywords = true) {
    const words = splitWords(segment);
    let i = 0;
    while (i < words.length) {
        const t = words[i].text;
        if (t === "sudo" || t === "env" || t === "command" || /^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) {
            i++;
            continue;
        }
        if (keywords && SHELL_KEYWORDS.has(t)) {
            i++;
            continue;
        }
        // PowerShell output capture, with or without spaces around the `=`:
        // `$out = git clean -fdx`, `$out=git clean -fdx`, `$out= git …`, `$out =git …`.
        const capture = /^\$[A-Za-z_][\w:]*(\+?=(.*))?$/s.exec(t);
        if (capture && capture[1] !== undefined) {
            if (capture[2] === "")
                i++;
            else
                words[i].text = capture[2];
            continue;
        }
        const assigned = capture ? /^\+?=(.*)$/s.exec(words[i + 1]?.text ?? "") : null;
        if (assigned) {
            i++;
            if (assigned[1] === "")
                i++;
            else
                words[i].text = assigned[1];
            continue;
        }
        break;
    }
    const rest = words.slice(i);
    if (rest.length > 0)
        rest[0].text = commandWord(rest[0].text);
    return rest;
}
// What follows the command flag of a wrapper, with one layer of quotes peeled:
// `"Remove-Item build -Recurse -Force"` is the command line, not a string.
function peelQuotes(text) {
    const trimmed = text.trim();
    const q = trimmed[0];
    if (q !== '"' && q !== "'")
        return trimmed;
    const close = trimmed.lastIndexOf(q);
    return close > 0 ? `${trimmed.slice(1, close)} ${trimmed.slice(close + 1)}` : trimmed.slice(1);
}
const SH_COMMAND_FLAG_RE = /^-[A-Za-z]*c$/;
// -Command and its prefixes down to -c, and pwsh's -CommandWithArgs / -cwa.
const PS_COMMAND_FLAG_RE = /^-(?:c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?|cwa|commandwithargs)$/i;
// -File runs a script and -EncodedCommand is base64: neither can be read here.
const PS_OPAQUE_FLAG_RE = /^-(?:f(?:i(?:l(?:e)?)?)?|e|ec|en[a-z]*)$/i;
// A shell started to run one command line: `bash -c "…"`, `pwsh -Command "…"`,
// `cmd /c …`, with any other switches first, and `Invoke-Expression "…"`.
// Returns that command line so it can be classified like any other, or null.
// This is how the Bash tool reaches PowerShell and cmd on Windows.
function wrappedCommand(segment, words) {
    const shell = words[0]?.text;
    const args = words.slice(1);
    const after = (word, powershell) => ({ text: peelQuotes(segment.slice(word.end)), powershell });
    if (shell === "bash" || shell === "sh" || shell === "zsh") {
        for (let k = 0; k < args.length; k++) {
            const t = args[k].text;
            if (!/^[-+]/.test(t))
                return null; // the script name: the rest are its own arguments
            if (SH_COMMAND_FLAG_RE.test(t))
                return after(args[k], false);
            if (/^[-+][oO]$/.test(t) || t === "--rcfile" || t === "--init-file")
                k++;
        }
        return null;
    }
    if (shell === "pwsh" || shell === "powershell") {
        for (const word of args) {
            if (PS_COMMAND_FLAG_RE.test(word.text))
                return after(word, true);
            if (PS_OPAQUE_FLAG_RE.test(word.text))
                return null;
        }
        return null;
    }
    if (shell === "cmd") {
        for (const word of args) {
            // `//c` is the Git Bash spelling, which stops MSYS rewriting `/c` as a path.
            if (/^\/{1,2}[ck]$/i.test(word.text))
                return { ...after(word, false), cmd: true };
            if (!word.text.startsWith("/"))
                return null;
        }
        return null;
    }
    if (shell === "invoke-expression" || shell === "iex") {
        if (args.length === 0)
            return null;
        return after(/^-c/i.test(args[0].text) ? args[0] : words[0], true);
    }
    return null;
}
// The git global options that take their value as the next word.
const GIT_VALUE_OPTIONS = new Set([
    "-C",
    "-c",
    "--git-dir",
    "--work-tree",
    "--namespace",
    "--super-prefix",
    "--config-env",
    "--attr-source",
]);
// For `git`, skip global options (`-C <dir>`, `-c k=v`, `--git-dir=…`,
// `--no-pager`) to find the subcommand and its own arguments. Every destructive
// git rule goes through here, so a global option cannot hide the subcommand.
function gitSubcommand(tokens) {
    if (tokens[0] !== "git")
        return null;
    const dirs = [];
    let i = 1;
    while (i < tokens.length && tokens[i].startsWith("-")) {
        if (tokens[i] === "-C" && tokens[i + 1] !== undefined)
            dirs.push(tokens[i + 1]);
        i += GIT_VALUE_OPTIONS.has(tokens[i]) ? 2 : 1;
    }
    const sub = tokens[i];
    if (!sub)
        return null;
    return { sub, args: tokens.slice(i + 1), dirs };
}
const isShortFlag = (t) => /^-[A-Za-z]+$/.test(t);
const hasShortLetter = (t, letters) => isShortFlag(t) && letters.test(t.slice(1));
// PowerShell's Remove-Item by cmdlet name or alias. Command names are
// case-insensitive and a switch can sit anywhere after the command word.
const PS_REMOVE_COMMANDS = new Set(["remove-item", "ri", "rd", "rmdir", "del", "erase"]);
// The names that are only ever the PowerShell cmdlet, for the pipeline rule.
const PS_REMOVE_PIPE_TARGETS = new Set(["remove-item", "ri", "rd", "del", "erase"]);
// Provider drives that hold no file tree: deleting an environment variable, a
// function, an alias or a variable is not a tree delete.
const PS_DATA_PROVIDER_RE = /^["']?(?:env|function|alias|variable):/i;
// The current pipeline item: `ForEach-Object { Remove-Item $_.FullName }`.
const PS_PIPELINE_ITEM_RE = /^["']?\$(?:_|psitem)(?!\w)/i;
const PS_SWITCH_NAMES = ["recurse", "force", "whatif", "confirm", "verbose", "debug"];
const PS_SWITCH_ALIASES = new Set(["wi", "cf", "vb", "db"]);
// PowerShell accepts any unambiguous prefix of a parameter name (`-r`, `-rec`,
// `-fo`) and an optional `:value` suffix. A switch given `:$false` is off.
function psSwitchOn(args, name, minLength) {
    return args.some((t) => {
        const param = /^-([A-Za-z]+)(?::(.*))?$/.exec(t);
        if (!param)
            return false;
        const given = param[1].toLowerCase();
        if (given.length < minLength || !name.startsWith(given))
            return false;
        return !/^\$?(?:false|0)$/i.test(param[2] ?? "");
    });
}
// The paths a Remove-Item call names: every word that is not a parameter, and
// not the value of a parameter other than -Path / -LiteralPath.
function psPathOperands(args) {
    const operands = [];
    for (let i = 0; i < args.length; i++) {
        const param = /^-([A-Za-z]+)(:.*)?$/.exec(args[i]);
        if (!param) {
            operands.push(args[i]);
            continue;
        }
        if (param[2] !== undefined)
            continue;
        const name = param[1].toLowerCase();
        if (PS_SWITCH_NAMES.some((s) => s.startsWith(name)) || PS_SWITCH_ALIASES.has(name))
            continue;
        if ("path".startsWith(name) || "literalpath".startsWith(name) || name === "lp" || name === "pspath")
            continue;
        i++; // any other named parameter (-ErrorAction, -Include, -Filter) takes the next word
    }
    return operands;
}
// The policy for PowerShell's delete, for the cmdlet and every alias:
//   - `-Recurse` gates, alone or with `-Force`: that is the tree delete.
//   - A delete fed by a pipeline gates: the pipeline decides what is deleted,
//     which this classifier cannot see. `$_` as the operand is the same thing.
//   - `-Force` alone on named files or a wildcard passes. It is the PowerShell
//     spelling of `rm -f file`, which passes for Bash.
//   - `-WhatIf` is a dry run and passes, the way `git clean -n` does.
//   - A provider path that holds no file tree passes.
// `powershell` says the command runs in PowerShell (the PowerShell tool, or a
// pwsh wrapper). Returns the rule id, or null.
function powershellDelete(tokens, piped, powershell) {
    const cmd = tokens[0];
    const args = tokens.slice(1);
    if (cmd === "rm" && !powershell) {
        // `rm` is also the POSIX command, whose `-r` and `-f` belong to
        // rm-recursive-force. Outside PowerShell it is read as Remove-Item only
        // when a switch is spelled the way POSIX rm cannot be: at least `-re` or
        // `-fo`. In PowerShell `rm` is the alias, so `rm -r build` is the tree delete.
        if (!psSwitchOn(args, "recurse", 2) && !psSwitchOn(args, "force", 2))
            return null;
    }
    else if (cmd !== "rm" && !PS_REMOVE_COMMANDS.has(cmd)) {
        return null;
    }
    if (psSwitchOn(args, "whatif", 2) || psSwitchOn(args, "wi", 2))
        return null;
    const operands = psPathOperands(args);
    if (operands.length > 0 && operands.every((t) => PS_DATA_PROVIDER_RE.test(t)))
        return null;
    if (psSwitchOn(args, "recurse", 1))
        return "powershell-remove-item";
    // `rm` and `rmdir` read no pipeline as POSIX commands; in PowerShell they do.
    const pipeTarget = powershell || PS_REMOVE_PIPE_TARGETS.has(cmd);
    const fed = (piped && pipeTarget) || operands.some((t) => PS_PIPELINE_ITEM_RE.test(t));
    return fed ? "powershell-remove-item-pipeline" : null;
}
// The substring list used to carry "Remove-Item -Recurse" and "Remove-Item
// -Force". As substrings they also matched inside a quoted argument
// (`Start-Process powershell -ArgumentList "Remove-Item -Recurse …"`), where no
// command starts. That reach is kept, but the text found is judged by the same
// policy, so `-Force` alone and a `-WhatIf` dry run pass here too.
function switchFirstDelete(text) {
    const opener = /remove-item -(?=recurse|force)/gi;
    for (let m = opener.exec(text); m !== null; m = opener.exec(text)) {
        // Read to the end of this command: a separator, or the quote that closes
        // the string the command sits in.
        let end = m.index;
        while (end < text.length) {
            const ch = text[end];
            if (/[;|&\n]/.test(ch))
                break;
            if (ch === '"' || ch === "'") {
                const close = text.indexOf(ch, end + 1);
                if (close === -1 || /[;|&\n]/.test(text.slice(end, close)))
                    break;
                end = close;
            }
            end++;
        }
        const tokens = splitWords(text.slice(m.index, end)).map((word) => word.text);
        tokens[0] = "remove-item";
        const rule = powershellDelete(tokens, false, true);
        if (rule !== null)
            return rule;
    }
    return null;
}
// cmd.exe's "and every subdirectory" switch.
const CMD_SUBTREE_RE = /^\/{1,2}s$/i;
const STRUCTURED_RULES = [
    {
        id: "rm-recursive-force",
        test: (tokens) => {
            if (tokens[0] !== "rm")
                return false;
            const flags = tokens.slice(1).filter((t) => t.startsWith("-"));
            const recursive = flags.some((t) => t === "--recursive" || hasShortLetter(t, /[rR]/));
            const force = flags.some((t) => t === "--force" || hasShortLetter(t, /f/));
            return recursive && force;
        },
    },
    {
        // cmd.exe's tree delete, reached through `cmd /c`: `rd /s` and `rmdir /s`
        // (`//s` when Git Bash passes the switch through).
        id: "cmd-rmdir-tree",
        test: (tokens) => (tokens[0] === "rd" || tokens[0] === "rmdir") && tokens.slice(1).some((t) => CMD_SUBTREE_RE.test(t)),
    },
    {
        // cmd.exe's `del /s` and `erase /s` delete the matching files in every
        // subdirectory.
        id: "cmd-del-tree",
        test: (tokens) => (tokens[0] === "del" || tokens[0] === "erase") && tokens.slice(1).some((t) => CMD_SUBTREE_RE.test(t)),
    },
    {
        // The DOS/Windows volume formatter, as the command word only. This used to
        // be the substring "format ", which also matched every `-Format`,
        // `-UFormat` and `--output-format` parameter. A word that starts with a
        // quote is a string literal (`"Format complete" | Out-File log.txt`).
        id: "format-volume",
        test: (tokens) => tokens.length > 1 && /^format(?:\.com)?$/.test(tokens[0]),
    },
    {
        id: "git-clean-force",
        test: (tokens) => {
            const git = gitSubcommand(tokens);
            if (!git || git.sub !== "clean")
                return false;
            const dryRun = git.args.some((t) => t === "--dry-run" || hasShortLetter(t, /n/));
            const force = git.args.some((t) => t === "--force" || hasShortLetter(t, /f/));
            return force && !dryRun;
        },
    },
    {
        id: "git-checkout-discard",
        test: (tokens) => {
            const git = gitSubcommand(tokens);
            if (!git || git.sub !== "checkout")
                return false;
            const dash = git.args.indexOf("--");
            if (dash !== -1)
                return git.args.length > dash + 1; // `git checkout -- <pathspec>` discards
            const first = git.args.find((t) => !t.startsWith("-"));
            return first === "." || first === "./";
        },
    },
    {
        id: "git-restore-discard",
        test: (tokens) => {
            const git = gitSubcommand(tokens);
            if (!git || git.sub !== "restore")
                return false;
            const pathspec = git.args.some((t) => !t.startsWith("-"));
            if (!pathspec)
                return false;
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
            if (!git || git.sub !== "push")
                return false;
            return git.args.some((t) => t.startsWith("+") && t.length > 1);
        },
    },
    {
        id: "git-stash-drop",
        test: (tokens) => {
            const git = gitSubcommand(tokens);
            if (!git || git.sub !== "stash")
                return false;
            return git.args[0] === "drop" || git.args[0] === "clear";
        },
    },
    {
        id: "git-reset-hard",
        test: (tokens) => {
            const git = gitSubcommand(tokens);
            return git !== null && git.sub === "reset" && git.args.includes("--hard");
        },
    },
    {
        id: "git-push-force",
        test: (tokens) => {
            const git = gitSubcommand(tokens);
            if (!git || git.sub !== "push")
                return false;
            return git.args.some((t) => t === "--force" || t.startsWith("--force-with-lease") || hasShortLetter(t, /f/));
        },
    },
    {
        // `-D`, or `-d` / `--delete` together with `-f` / `--force`.
        id: "git-branch-force-delete",
        test: (tokens) => {
            const git = gitSubcommand(tokens);
            if (!git || git.sub !== "branch")
                return false;
            if (git.args.some((t) => hasShortLetter(t, /D/)))
                return true;
            const del = git.args.some((t) => t === "--delete" || hasShortLetter(t, /d/));
            const force = git.args.some((t) => t === "--force" || hasShortLetter(t, /f/));
            return del && force;
        },
    },
];
// The id of the rule this simple command trips, or null. `piped` says a
// pipeline feeds the command, `powershell` that it runs in PowerShell.
function matchStructuredRule(tokens, piped, powershell) {
    for (const rule of STRUCTURED_RULES) {
        if (rule.test(tokens))
            return rule.id;
    }
    return powershellDelete(tokens, piped, powershell);
}
// Commands that only search: a quoted argument is a pattern or a path, and
// what they send down a pipe is what they found, never the pattern.
const SEARCH_COMMANDS = new Set(["grep", "egrep", "fgrep", "rg", "findstr", "select-string", "sls"]);
// Commands that only print their arguments.
const PRINT_COMMANDS = new Set(["echo", "printf", "write-host", "write-output"]);
// git's short flags that take no value, clustered in front of `m`: `-am`, `-sm`.
// The letters are spelled out so that no PowerShell parameter (`-Confirm`,
// `-From`) and no other program's flag is read as a message flag.
const GIT_MESSAGE_CLUSTER_RE = /^-[aenpqsv]{1,4}m$/;
// gh's short spellings of --body, --title and --notes.
const GH_MESSAGE_FLAG_RE = /^-[btn]$/;
// The parts of a command text that are data because of the command they are
// written on. The substring list is the fallback for text that no rule reads
// as a command (SQL handed to psql, a command handed to ssh or xargs); these
// parts are not such text and it must not read them:
//   - `messages`: the value after a short message flag that only git or gh
//     has (`git commit -am "…"`, `gh pr create -t "…" -b "…"`). The long flags
//     and `-m` are MESSAGE_FLAG_RE's.
//   - `quoted`: the quoted arguments of a search command, and of a print
//     command whose output goes to the terminal. A print command that feeds a
//     pipe or a file, or that sits inside a group, a block or a substitution,
//     keeps its reach: `echo "DROP TABLE t" | psql` runs what it prints.
// One walk over the text, one simple command at a time. An unclosed quote
// yields no span.
function dataSpans(code, powershell) {
    const messages = [];
    const quoted = [];
    let start = 0;
    let quote = null;
    let quoteAt = 0;
    let closedQuotes = [];
    // How many groups and blocks are open, and whether a backtick substitution
    // is: what a command prints in there belongs to whatever reads the group.
    let nesting = 0;
    let substitution = false;
    let redirected = false;
    // One simple command ends at `at`. `plainEnd` says it ended the way a command
    // that prints to the terminal ends: at a `;`, a line break, `&`, `||` or the
    // end of the text, and not at a pipe or at the edge of a group.
    const end = (at, plainEnd) => {
        const text = code.slice(start, at);
        const strings = closedQuotes;
        const toTerminal = plainEnd && !redirected && nesting === 0 && !substitution;
        const offset = start;
        start = at + 1;
        closedQuotes = [];
        redirected = false;
        if (text.trim() === "")
            return;
        const command = commandWords(text)[0]?.text;
        if (command === "git" || command === "gh") {
            const flag = command === "git" ? GIT_MESSAGE_CLUSTER_RE : GH_MESSAGE_FLAG_RE;
            const words = splitWords(text);
            for (let k = 1; k + 1 < words.length; k++) {
                if (!flag.test(words[k].text))
                    continue;
                const value = words[k + 1];
                messages.push([offset + value.end - value.text.length, offset + value.end]);
                k++;
            }
        }
        else if (command !== undefined && (SEARCH_COMMANDS.has(command) || (PRINT_COMMANDS.has(command) && toTerminal))) {
            quoted.push(...strings);
        }
    };
    // A line break after an odd run of the continuation character does not end
    // the command: the backslash in Bash, the backtick in PowerShell.
    const continuesPast = (lineBreak) => {
        const mark = powershell ? "`" : "\\";
        let at = code[lineBreak - 1] === "\r" ? lineBreak - 2 : lineBreak - 1;
        let run = 0;
        while (at >= 0 && code[at] === mark) {
            run++;
            at--;
        }
        return run % 2 === 1;
    };
    for (let i = 0; i < code.length; i++) {
        const ch = code[i];
        if (quote) {
            if (ch === quote) {
                closedQuotes.push([quoteAt + 1, i]);
                quote = null;
            }
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            quoteAt = i;
        }
        else if (ch === ">") {
            redirected = true;
        }
        else if (ch === "\n") {
            if (continuesPast(i))
                continue;
            // A pipeline may put its `|` at the start of the next line.
            let next = i + 1;
            while (code[next] === " " || code[next] === "\t")
                next++;
            end(i, !(code[next] === "|" && code[next + 1] !== "|"));
        }
        else if (ch === "&" && code[i + 1] === ">") {
            redirected = true; // `&>file`
        }
        else if (ch === ";" || ch === "&") {
            end(i, true);
        }
        else if (ch === "|") {
            const doubled = code[i + 1] === "|";
            end(i, doubled);
            if (doubled) {
                i++;
                start = i + 1;
            }
        }
        else if (ch === "(" || ch === "{") {
            end(i, false);
            nesting++;
        }
        else if (ch === ")" || ch === "}") {
            end(i, false);
            if (nesting > 0)
                nesting--;
        }
        else if (ch === "`" && !powershell) {
            end(i, false);
            substitution = !substitution;
        }
    }
    if (quote === null)
        end(code.length, true);
    return { messages, quoted };
}
// `text` with every span turned into blanks: the same length, so offsets hold.
function blankSpans(text, spans) {
    if (spans.length === 0)
        return text;
    let blanked = "";
    let at = 0;
    for (const [from, to] of [...spans].sort((a, b) => a[0] - b[0])) {
        if (from < at)
            continue;
        blanked += text.slice(at, from) + " ".repeat(to - from);
        at = to;
    }
    return blanked + text.slice(at);
}
const ALLOWED = { destructive: false, rule: null };
// A wrapper can wrap a wrapper (`bash -c "pwsh -c '…'"`); past this depth the
// text is no longer something a person or an agent writes.
const MAX_WRAPPER_DEPTH = 4;
/**
 * Classify one shell command string. Pure; never throws on odd input.
 *
 * `tool` is the name of the tool that sent the command. It matters for one
 * word: under "PowerShell", `rm` is the Remove-Item alias and `-r` abbreviates
 * `-Recurse`, so `rm -r build` is a tree delete. Under "Bash", or with no tool
 * named, `rm -r dir` stays the unforced POSIX rm.
 */
export function classifyDestructiveBash(command, tool) {
    return classify(command, tool === "PowerShell", 0);
}
// `cmd` says the text is a cmd.exe command line (the argument of `cmd /c`),
// where `#` starts no comment.
function classify(command, powershell, depth, cmd = false) {
    if (typeof command !== "string" || command.trim() === "")
        return ALLOWED;
    const lifted = extractHereBodies(command);
    // Comments blanked and escaped quotes masked, as collectGit does for the push
    // gate: a comment that mentions a command is not one, and neither an
    // apostrophe in a comment nor an escaped quote may swallow the next command.
    const code = maskEscapedQuotes(lifted.code, powershell, !cmd);
    const stripped = stripMessageArgs(code);
    const data = dataSpans(code, powershell);
    const scanned = scannableBodies(code, lifted.bodies, data.messages);
    for (const segment of allSimpleCommands(stripped, powershell)) {
        const words = commandWords(segment.text);
        if (words.length === 0)
            continue;
        const tokens = words.map((word) => word.text);
        const rule = matchStructuredRule(tokens, segment.piped, powershell);
        if (rule !== null)
            return { destructive: true, rule };
        const wrapped = depth < MAX_WRAPPER_DEPTH ? wrappedCommand(segment.text, words) : null;
        if (wrapped !== null) {
            const inner = classify(unmaskQuotes(wrapped.text), wrapped.powershell, depth + 1, wrapped.cmd === true);
            if (inner.destructive)
                return inner;
        }
    }
    // A heredoc body keeps the reach it always had: a body line that is itself a
    // command (`cat > cleanup.sh <<'EOF'` + `git clean -fdx`) is still read by
    // the plain split. A here-string body sits inside quotes and was only ever
    // reached by the substring list below.
    for (const body of scanned) {
        if (body.hereString)
            continue;
        for (const segment of splitSimpleCommands(maskEscapedQuotes(body.text, false), false)) {
            const tokens = commandWords(segment.text, false).map((word) => word.text);
            if (tokens.length === 0)
                continue;
            const rule = matchStructuredRule(tokens, false, false);
            if (rule !== null)
                return { destructive: true, rule };
        }
    }
    // What is left for the fallback: text that no rule read as a command, without
    // the parts that are data by the command they are written on (see dataSpans).
    const unread = stripMessageArgs(blankSpans(code, [...data.messages, ...data.quoted]));
    const text = [unread, ...scanned.map((body) => body.text)].join("\n");
    const switchFirst = switchFirstDelete(text);
    if (switchFirst !== null)
        return { destructive: true, rule: switchFirst };
    // The substring list reads `git.exe` as `git`, like the rules above. It is
    // compared in lower case except where the case is the meaning: `git branch
    // -d` is the safe delete and only the capital `-D` forces.
    const cased = text.replace(/\bgit\.exe(?=\s)/gi, "git");
    const lower = cased.toLowerCase();
    const hit = DESTRUCTIVE_PATTERNS.find((p) => p === FORCE_BRANCH_DELETE
        ? [...cased.matchAll(/git branch -d/gi)].some((m) => m[0].endsWith("D"))
        : lower.includes(p.toLowerCase()));
    if (hit !== undefined)
        return { destructive: true, rule: `substring:${hit}` };
    return ALLOWED;
}
// Two things make a quote-tracking pass lose its place, and both are taken out
// before any splitting, without changing the length of the text (every offset
// stays valid):
//   - An escaped quote is a character of the string it sits in, not the end of
//     it: `"{\"note\": \"(git push)\"}"` is one Bash string. The escape
//     character is the backslash in Bash and the backtick in PowerShell, where
//     a backslash before a quote is the end of a Windows path (`"C:\repo\"`).
//     The pair is swapped for two private-use characters. Inside single quotes
//     nothing is escaped, except in Bash's `$'…'`.
//   - A comment is not code, and a quote character inside one opens no string:
//     the apostrophe of `# don't forget` must not swallow the lines after it.
//     A `#` that starts a word blanks the rest of its line, and under
//     PowerShell `<#` blanks through its `#>`. Not in a cmd.exe command line
//     (`comments` false), where `#` is an ordinary character.
const ESCAPE_MASK = "\uE000";
const MASKED_DOUBLE = "\uE001";
const MASKED_SINGLE = "\uE002";
function maskEscapedQuotes(text, powershell, comments = true) {
    const escape = powershell ? "`" : "\\";
    if (!text.includes(escape) && !(comments && text.includes("#")))
        return text;
    let masked = "";
    let quote = null;
    let ansi = false;
    let blockComments = powershell && comments;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        // The escape character takes the next character with it, so `\\"` is a
        // backslash and a real quote.
        if (ch === escape && (quote !== "'" || ansi) && i + 1 < text.length) {
            const next = text[i + 1];
            if (next === '"' && quote !== "'")
                masked += ESCAPE_MASK + MASKED_DOUBLE;
            else if (next === "'" && quote !== '"')
                masked += ESCAPE_MASK + MASKED_SINGLE;
            else
                masked += ch + next;
            i++;
            continue;
        }
        if (comments && quote === null && ch === "#" && (i === 0 || /[\s;|&(]/.test(text[i - 1]))) {
            const lineEnd = text.indexOf("\n", i);
            const stop = lineEnd === -1 ? text.length : lineEnd;
            masked += " ".repeat(stop - i);
            i = stop - 1;
            continue;
        }
        // PowerShell's block comment, `<#` to `#>`, blanked with its line breaks
        // kept. With no closing `#>` the text is left as code, and the search for
        // one is not repeated: every later opener would walk the same text again.
        if (blockComments && quote === null && ch === "<" && text[i + 1] === "#" && (i === 0 || /[\s;|&({]/.test(text[i - 1]))) {
            const close = text.indexOf("#>", i + 2);
            if (close === -1) {
                blockComments = false;
            }
            else {
                masked += text.slice(i, close + 2).replace(/[^\r\n]/g, " ");
                i = close + 1;
                continue;
            }
        }
        if (quote) {
            if (ch === quote)
                quote = null;
        }
        else if (ch === '"' || ch === "'") {
            quote = ch;
            ansi = ch === "'" && !powershell && text[i - 1] === "$";
        }
        masked += ch;
    }
    return masked;
}
// The command line a wrapper hands to another shell has lost one layer of
// escaping: `bash -c "git commit -m \"x\""` runs `git commit -m "x"`.
function unmaskQuotes(text) {
    return text.split(ESCAPE_MASK + MASKED_DOUBLE).join('"').split(ESCAPE_MASK + MASKED_SINGLE).join("'");
}
// How deep inside nested groups a command is still read. It bounds the work on
// text that only looks nested: 200 KB of `(a` opens 100,000 groups.
const MAX_GROUP_DEPTH = 12;
// The commands one plain segment holds. The plain split has already cut at
// every separator, so a segment is one command plus the commands that start
// inside its groups and blocks: after each `(` or `{`, up to the matching
// closer. A closer with no opener in the segment ends the command before it
// (`git push origin main)` at the end of a group, `main) git push ;;` in a
// `case`), and what follows starts another. Each command keeps all of its
// words: `${REMOTE}` and `$(git branch --show-current)` are part of the
// command they are written in, not the end of it.
function commandsIn(segment) {
    const commands = [];
    const open = [];
    let start = 0;
    let quote = null;
    for (let i = 0; i < segment.length; i++) {
        const ch = segment[i];
        if (quote) {
            if (ch === quote)
                quote = null;
        }
        else if (ch === '"' || ch === "'") {
            quote = ch;
        }
        else if (ch === "(" || ch === "{") {
            open.push(i);
        }
        else if (ch === ")" || ch === "}") {
            const from = open.pop();
            if (from === undefined) {
                commands.push(segment.slice(start, i));
                start = i + 1;
            }
            else if (open.length < MAX_GROUP_DEPTH) {
                commands.push(segment.slice(from + 1, i));
            }
        }
    }
    commands.push(segment.slice(start));
    // A group still open at the end of the segment runs on into the next one.
    for (const from of open.slice(0, MAX_GROUP_DEPTH))
        commands.push(segment.slice(from + 1));
    return commands;
}
/**
 * Every git command a command line runs, found the way `classify` finds a
 * command: heredoc and here-string bodies lifted out, message values blanked,
 * the split at separators, groups and blocks, the command word normalised,
 * git's global options skipped and the command line of a shell wrapper read in
 * turn. A git command that is only mentioned (in a commit message, a PR body,
 * a quoted string, a here-string) is not returned. A heredoc body keeps the
 * plain split, so a body line that is itself a command still counts
 * (`bash <<'EOF'`).
 *
 * lib/hook-pack-gate.mjs finds `git push` and `git commit` through this, so the
 * push gate and this classifier cannot disagree on what a git command is. Where
 * `classify` is content with any reading that trips a rule, a caller here reads
 * the arguments, so each command comes back with its whole argument list
 * (see commandsIn) instead of once whole and once cut at its first `(` or `{`.
 *
 * `tool` is the name of the tool that sent the command; it picks the escape
 * character (the backtick under "PowerShell", the backslash otherwise).
 */
export function gitInvocations(command, tool) {
    const found = [];
    if (typeof command === "string")
        collectGit(command, tool === "PowerShell", 0, found);
    return found;
}
function collectGit(command, powershell, depth, found) {
    if (command.trim() === "")
        return;
    const lifted = extractHereBodies(command);
    const code = maskEscapedQuotes(lifted.code, powershell);
    const stripped = stripMessageArgs(code);
    const joined = joinLineContinuations(stripped, powershell);
    for (const view of joined === stripped ? [stripped] : [stripped, joined]) {
        for (const segment of splitSimpleCommands(view, false)) {
            for (const text of commandsIn(segment.text)) {
                const words = commandWords(text);
                if (words.length === 0)
                    continue;
                const git = gitSubcommand(words.map((word) => word.text));
                if (git !== null) {
                    found.push(git);
                    continue;
                }
                const wrapped = depth < MAX_WRAPPER_DEPTH ? wrappedCommand(text, words) : null;
                if (wrapped !== null)
                    collectGit(unmaskQuotes(wrapped.text), wrapped.powershell, depth + 1, found);
            }
        }
    }
    for (const body of scannableBodies(code, lifted.bodies)) {
        if (body.hereString)
            continue;
        for (const segment of splitSimpleCommands(maskEscapedQuotes(body.text, false), false)) {
            const git = gitSubcommand(commandWords(segment.text, false).map((word) => word.text));
            if (git !== null)
                found.push(git);
        }
    }
}
