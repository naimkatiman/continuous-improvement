// shell-intent.mts — what a shell command line does, as far as the transcript
// linter needs to know.
//
// The linter (bin/lint-transcript.mjs) reads the command of a Bash or
// PowerShell tool call and asks two things: did the call look something up
// without changing anything (research, Law 1), and did it run a test, a build
// or a check (verification, Law 4). Both answers come from the command word of
// each simple command on the line, never from a word that merely appears
// somewhere in it: `node scripts/cat.js` is not a lookup and `ls test/` is not
// a test run, `cd repo && cat a.ts` and `cd repo && npm test` are.
//
// The line is split the way a shell would split it, far enough for that
// purpose: quotes, here-documents, comments, `;` `&&` `||` `|` and newlines,
// `( )` groups, PowerShell script blocks and here-strings, and a command
// handed to a nested shell (bash -c, pwsh -Command, cmd /c). It is not a shell
// parser. Where a line cannot be read the answer is "no".
const HEREDOC_RE = /<<-?[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([A-Za-z_][\w.-]*))/y;
const HERE_STRING_OPENER_RE = /[ \t]*\r?\n/y;
/** The here-document operator at `index` (`<<EOF`, `<<-'EOF'`), or null. `<<<` is a here-string. */
function heredocAt(line, index) {
    if (line[index] !== "<" || line[index + 1] !== "<" || line[index + 2] === "<") {
        return null;
    }
    HEREDOC_RE.lastIndex = index;
    const match = HEREDOC_RE.exec(line);
    return match ? { delimiter: match[1] ?? match[2] ?? match[3] ?? "", length: match[0].length } : null;
}
/**
 * Index just past the body of the here-documents opened on the line that ends
 * at `newlineIndex`. Each body runs to a line that holds only its delimiter.
 */
function skipHeredocBodies(line, newlineIndex, delimiters) {
    let index = newlineIndex + 1;
    for (const delimiter of delimiters) {
        while (index < line.length) {
            const end = line.indexOf("\n", index);
            const bodyLine = line.slice(index, end === -1 ? line.length : end);
            index = end === -1 ? line.length : end + 1;
            if (bodyLine.trim() === delimiter) {
                break;
            }
        }
    }
    return index;
}
/** Split a command line into its simple commands. */
function splitCommands(line) {
    const commands = [];
    const length = line.length;
    let words = [];
    let word = "";
    let inWord = false;
    let piped = false;
    let heredocs = [];
    const endWord = () => {
        if (inWord) {
            words.push(word);
            word = "";
            inWord = false;
        }
    };
    const endCommand = (nextIsPiped) => {
        endWord();
        if (words.length > 0) {
            commands.push({ words, piped });
        }
        words = [];
        piped = nextIsPiped;
    };
    let i = 0;
    while (i < length) {
        const ch = line[i];
        const next = line[i + 1];
        // A backslash (bash) or a backtick (PowerShell) before a newline joins two lines.
        if ((ch === "\\" || ch === "`") && (next === "\n" || (next === "\r" && line[i + 2] === "\n"))) {
            i += next === "\n" ? 2 : 3;
            continue;
        }
        if (ch === "\n") {
            endCommand(false);
            i = skipHeredocBodies(line, i, heredocs);
            heredocs = [];
            continue;
        }
        if (ch === " " || ch === "\t" || ch === "\r") {
            endWord();
            i++;
            continue;
        }
        if (ch === "#" && !inWord) {
            const end = line.indexOf("\n", i);
            i = end === -1 ? length : end;
            continue;
        }
        // PowerShell here-string: @' or @" ends a line, '@ or "@ starts the closing one.
        if (ch === "@" && (next === "'" || next === '"')) {
            HERE_STRING_OPENER_RE.lastIndex = i + 2;
            const opener = HERE_STRING_OPENER_RE.exec(line);
            if (opener) {
                const bodyStart = i + 2 + opener[0].length;
                const close = line.indexOf(`\n${next}@`, bodyStart - 1);
                word += line.slice(bodyStart, close === -1 ? length : close);
                inWord = true;
                i = close === -1 ? length : close + 3;
                continue;
            }
        }
        if (ch === "'") {
            const end = line.indexOf("'", i + 1);
            word += line.slice(i + 1, end === -1 ? length : end);
            inWord = true;
            i = end === -1 ? length : end + 1;
            continue;
        }
        if (ch === '"') {
            let j = i + 1;
            let inSubstitution = false;
            while (j < length && line[j] !== '"') {
                const inner = line[j];
                if ((inner === "\\" || inner === "`") && j + 1 < length && '"\\$`'.includes(line[j + 1])) {
                    word += line[j + 1];
                    j += 2;
                    continue;
                }
                if (inner === "$" && line[j + 1] === "(") {
                    inSubstitution = true;
                }
                // "$(cat <<'EOF' ... EOF)": the body is text, whatever quotes it holds.
                const heredoc = inSubstitution ? heredocAt(line, j) : null;
                if (heredoc) {
                    const lineEnd = line.indexOf("\n", j);
                    if (lineEnd === -1) {
                        j = length;
                        break;
                    }
                    j = skipHeredocBodies(line, lineEnd, [heredoc.delimiter]);
                    continue;
                }
                word += inner;
                j++;
            }
            inWord = true;
            i = j + 1;
            continue;
        }
        if (ch === "\\" && (next === '"' || next === "'")) {
            word += next;
            inWord = true;
            i += 2;
            continue;
        }
        const heredoc = ch === "<" ? heredocAt(line, i) : null;
        if (heredoc) {
            heredocs.push(heredoc.delimiter);
            endWord();
            i += heredoc.length;
            continue;
        }
        if (ch === ";") {
            endCommand(false);
            i++;
            continue;
        }
        if (ch === "&") {
            if (next === "&") {
                endCommand(false);
                i += 2;
                continue;
            }
            const previous = line[i - 1];
            // 2>&1, >&2, &>file: part of a redirection, not a separator.
            if (next === ">" || previous === ">" || previous === "<") {
                word += ch;
                inWord = true;
                i++;
                continue;
            }
            endCommand(false);
            i++;
            continue;
        }
        if (ch === "|") {
            if (next === "|") {
                endCommand(false);
                i += 2;
                continue;
            }
            endCommand(true);
            i += next === "&" ? 2 : 1;
            continue;
        }
        if (ch === "(" || ch === ")" || ch === "`" || ch === "}") {
            endCommand(false);
            i++;
            continue;
        }
        if (ch === "{") {
            if (next === "}") {
                // find -exec ... {} +
                word += "{}";
                inWord = true;
                i += 2;
                continue;
            }
            if (line[i - 1] === "$") {
                // ${VAR}
                const close = line.indexOf("}", i);
                const end = close === -1 ? length : close + 1;
                word += line.slice(i, end);
                i = end;
                continue;
            }
            endCommand(false);
            i++;
            continue;
        }
        word += ch;
        inWord = true;
        i++;
    }
    endCommand(false);
    return commands;
}
const REDIRECTION_RE = /^[\d*]*(?:[<>]|&>)/;
const BARE_REDIRECTION_RE = /^[\d*]*(?:>>?|<|&>>?|>&)$/;
/** The words of a command without its redirections (`> out.txt`, `2>&1`, `< in`). */
function withoutRedirections(words) {
    const kept = [];
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (REDIRECTION_RE.test(word)) {
            if (BARE_REDIRECTION_RE.test(word)) {
                i++; // the target is the next word
            }
            continue;
        }
        kept.push(word);
    }
    return kept;
}
function programName(word) {
    const base = word.slice(Math.max(word.lastIndexOf("/"), word.lastIndexOf("\\")) + 1);
    return base.toLowerCase().replace(/\.(?:exe|cmd|bat|ps1)$/, "");
}
/** Words a shell allows before the command word. */
const LEADING_KEYWORDS = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "time"]);
const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
/** Programs that run the command that follows them. */
const WRAPPERS = new Set(["sudo", "command", "exec", "nohup", "nice", "env", "winpty", "stdbuf", "timeout"]);
const WRAPPER_ARGUMENT_RE = /^(?:-|\d+(?:\.\d+)?[smhd]?$)/;
function invocationOf(command) {
    let words = withoutRedirections(command.words);
    for (;;) {
        const first = words[0];
        if (first === undefined) {
            return null;
        }
        if (LEADING_KEYWORDS.has(first) || ASSIGNMENT_RE.test(first)) {
            words = words.slice(1);
            continue;
        }
        // PowerShell: $log = git log
        if (first.startsWith("$") && words[1] === "=") {
            words = words.slice(2);
            continue;
        }
        const name = programName(first);
        if (WRAPPERS.has(name)) {
            let rest = words.slice(1);
            while (rest[0] !== undefined && (WRAPPER_ARGUMENT_RE.test(rest[0]) || ASSIGNMENT_RE.test(rest[0]))) {
                rest = rest.slice(1);
            }
            words = rest;
            continue;
        }
        return { name, args: words.slice(1), piped: command.piped };
    }
}
const POSIX_SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);
const POWERSHELLS = new Set(["pwsh", "powershell"]);
const MAX_NESTED_SHELLS = 3;
/** The script a nested shell is asked to run (bash -c, pwsh -Command, cmd /c, Invoke-Expression), or null. */
function nestedScript(invocation) {
    const { name, args } = invocation;
    if (name === "invoke-expression" || name === "iex") {
        return args.length > 0 && !invocation.piped ? args.join(" ") : null;
    }
    let scriptAt = -1;
    let wholeTail = false;
    if (POSIX_SHELLS.has(name)) {
        scriptAt = args.findIndex((arg) => /^-[a-z]*c$/.test(arg)) + 1;
    }
    else if (POWERSHELLS.has(name)) {
        scriptAt = args.findIndex((arg) => /^-(?:c|command)$/i.test(arg)) + 1;
        wholeTail = true;
    }
    else if (name === "cmd") {
        scriptAt = args.findIndex((arg) => /^\/[ck]$/i.test(arg)) + 1;
        wholeTail = true;
    }
    if (scriptAt <= 0 || scriptAt >= args.length) {
        return null;
    }
    return wholeTail ? args.slice(scriptAt).join(" ") : args[scriptAt];
}
/** Every command a line runs, with the commands handed to a nested shell in place of that shell. */
function invocations(line, depth = 0) {
    const found = [];
    for (const command of splitCommands(line)) {
        const invocation = invocationOf(command);
        if (!invocation) {
            continue;
        }
        const script = depth < MAX_NESTED_SHELLS ? nestedScript(invocation) : null;
        if (script === null) {
            found.push(invocation);
        }
        else {
            found.push(...invocations(script, depth + 1));
        }
    }
    return found;
}
/** Readers that print what they are pointed at and need no file operand. */
const LISTING_READERS = new Set([
    "rg", "grep", "egrep", "fgrep", "ls", "dir",
    "select-string", "sls", "get-childitem", "gci", "test-path",
]);
/**
 * Readers that print a file. Without a file operand they copy standard input,
 * which is how `cat > notes.txt <<EOF` writes a file.
 */
const FILE_READERS = new Set(["cat", "head", "tail", "less", "more", "type", "get-content", "gc"]);
const GIT_READ_SUBCOMMANDS = new Set(["grep", "show", "log", "diff", "status", "blame"]);
const GIT_OPTIONS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);
const GH_READ_VERBS = new Set(["view", "list", "status", "diff", "checks"]);
function operands(args) {
    return args.filter((arg) => !arg.startsWith("-"));
}
function gitSubcommand(args) {
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (GIT_OPTIONS_WITH_VALUE.has(arg)) {
            i++;
        }
        else if (!arg.startsWith("-")) {
            return arg;
        }
    }
    return "";
}
/** The HTTP method a `-X`/`--request`/`--method` option names, upper-cased, or null. */
function explicitMethod(args) {
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "-X" || arg === "--request" || arg === "--method") {
            return (args[i + 1] ?? "").toUpperCase();
        }
        const joined = /^(?:-X|--request=|--method=)(.+)$/.exec(arg);
        if (joined) {
            return joined[1].toUpperCase();
        }
    }
    return null;
}
function isReadMethod(method) {
    return method === null || method === "GET" || method === "HEAD";
}
/** `gh <noun> view|list|...`, `gh search ...`, or a `gh api` call that sends nothing. */
function isReadOnlyGh(args) {
    const [noun, verb] = operands(args);
    if (noun === "api") {
        const method = explicitMethod(args);
        if (method !== null) {
            return isReadMethod(method);
        }
        // A field without an explicit method turns the request into a POST.
        return !args.some((arg) => /^(?:-f|-F|--field|--raw-field|--input)(?:=|$)/.test(arg));
    }
    return noun === "search" || noun === "status" || (verb !== undefined && GH_READ_VERBS.has(verb));
}
/** A curl that uploads nothing: no body, no form, no file, and GET or HEAD. */
function isReadOnlyCurl(args) {
    if (!isReadMethod(explicitMethod(args))) {
        return false;
    }
    return !args.some((arg) => /^--(?:data|form|json|upload-file)/.test(arg) || /^-[A-Za-z]*[dFT]$/.test(arg) || /^-[dFT]./.test(arg));
}
/** A find that deletes nothing and hands its matches to nothing but another reader. */
function isReadOnlyFind(args) {
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "-delete") {
            return false;
        }
        if (arg === "-exec" || arg === "-execdir" || arg === "-ok") {
            const program = programName(args[i + 1] ?? "");
            if (!LISTING_READERS.has(program) && !FILE_READERS.has(program)) {
                return false;
            }
        }
    }
    return true;
}
/** sed that prints selected lines (-n) and does not edit in place (-i). */
function isReadOnlySed(args) {
    const prints = args.some((arg) => /^-[A-Za-z]*n[A-Za-z]*$/.test(arg) || arg === "--quiet" || arg === "--silent");
    const edits = args.some((arg) => /^-[A-Za-z]*i/.test(arg) || arg.startsWith("--in-place"));
    return prints && !edits;
}
/** The PowerShell spellings of date, pwd and a random number: they look nothing up. */
const UNINFORMATIVE_GET_CMDLETS = new Set(["get-date", "get-location", "get-random"]);
function isLookup(invocation) {
    const { name, args } = invocation;
    // A filter on another command's output looks nothing up: `npm install | tail -5`.
    if (invocation.piped) {
        return false;
    }
    if (LISTING_READERS.has(name)) {
        return true;
    }
    if (FILE_READERS.has(name)) {
        return operands(args).length > 0;
    }
    switch (name) {
        case "sed":
            return isReadOnlySed(args);
        case "find":
            return isReadOnlyFind(args);
        case "git":
            return GIT_READ_SUBCOMMANDS.has(gitSubcommand(args));
        case "gh":
            return isReadOnlyGh(args);
        case "curl":
            return isReadOnlyCurl(args);
        default:
            // A PowerShell Get cmdlet retrieves and changes nothing: Get-Process, Get-ScheduledTask.
            return name.startsWith("get-") && !UNINFORMATIVE_GET_CMDLETS.has(name);
    }
}
/**
 * True when a shell command line looks something up and the lookup changes
 * nothing: a reader (cat, head, tail, less, sed -n, rg, grep, ls, find without
 * -delete, Select-String, Test-Path, Get-Content, Get-ChildItem and any other
 * PowerShell Get cmdlet), a read-only git or gh command (git
 * grep/show/log/diff/status/blame, gh view/list, a gh api call that sends
 * nothing), or a curl that uploads nothing, at a command position of the line.
 */
export function isReadOnlyLookup(commandLine) {
    return invocations(commandLine).some(isLookup);
}
/** Programs that are a test runner, a type checker or a linter whatever their arguments. */
const CHECK_PROGRAMS = new Set([
    "vitest", "jest", "mocha", "ava", "tap", "tsc", "eslint", "pytest", "py.test", "invoke-pester",
]);
/** Programs that verify when given one of these subcommands or targets. */
const CHECK_SUBCOMMANDS = new Map([
    ["go", new Set(["test", "vet", "build"])],
    ["cargo", new Set(["test", "build", "check", "clippy"])],
    ["dotnet", new Set(["test", "build"])],
    ["deno", new Set(["test"])],
    ["playwright", new Set(["test"])],
    ["craco", new Set(["test", "build"])],
    ["react-scripts", new Set(["test", "build"])],
    ["vite", new Set(["build"])],
    ["next", new Set(["build", "lint"])],
    ["mvn", new Set(["test", "verify"])],
    ["mvnw", new Set(["test", "verify"])],
    ["gradle", new Set(["test", "check", "build"])],
    ["gradlew", new Set(["test", "check", "build"])],
    ["make", new Set(["test", "check", "build"])],
]);
/** Build tools take several targets (`mvn clean verify`); the others one subcommand. */
const TARGET_TOOLS = new Set(["mvn", "mvnw", "gradle", "gradlew", "make"]);
const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const PACKAGE_MANAGER_OPTIONS_WITH_VALUE = new Set([
    "--prefix", "-C", "--dir", "--cwd", "--filter", "-F", "--workspace",
]);
/** A script run without `run` (`pnpm build`, `yarn test:unit`) counts when its name says what it checks. */
const CHECK_SCRIPT_NAME_RE = /^(?:test|build|lint|typecheck|type-check|check|verify)(?::|$)/;
/** Programs that run the program named after their own options: npx tsc, bunx vitest. */
const PACKAGE_RUNNERS = new Set(["npx", "pnpx", "bunx", "cross-env", "dotenv"]);
/** Environment managers that run a program after `run` or `exec`: uv run pytest, bundle exec rspec. */
const ENVIRONMENT_RUNNERS = new Set(["uv", "poetry", "pipenv", "pdm", "hatch", "bundle"]);
const NODE_OPTIONS_WITH_VALUE = new Set([
    "--import", "-r", "--require", "--loader", "--experimental-loader", "--env-file", "--conditions", "-C",
    "--test-reporter", "--test-reporter-destination", "--test-name-pattern", "--test-skip-pattern",
    "--test-concurrency", "--test-timeout", "--test-shard",
]);
const MAX_RUNNER_DEPTH = 4;
/** `args` without leading options, assignments and the values of `optionsWithValue`. */
function afterOptions(args, optionsWithValue = new Set()) {
    let i = 0;
    while (i < args.length) {
        const arg = args[i];
        if (optionsWithValue.has(arg)) {
            i += 2;
        }
        else if (arg.startsWith("-") || ASSIGNMENT_RE.test(arg)) {
            i++;
        }
        else {
            break;
        }
    }
    return args.slice(i);
}
/** `words` read as a command of their own: the program a wrapper was asked to run. */
function runsCheck(words, depth) {
    const [program, ...args] = words;
    return program !== undefined && depth < MAX_RUNNER_DEPTH && isCheck(programName(program), args, depth + 1);
}
/** npm test, npm run <script>, pnpm exec tsc, yarn lint, bun test. */
function isPackageManagerCheck(name, args, depth) {
    const withValue = name === "npm" ? new Set([...PACKAGE_MANAGER_OPTIONS_WITH_VALUE, "-w"]) : PACKAGE_MANAGER_OPTIONS_WITH_VALUE;
    const [subcommand, ...rest] = afterOptions(args, withValue);
    if (subcommand === undefined) {
        return false;
    }
    if (subcommand === "test" || subcommand === "t" || subcommand === "tst") {
        return true;
    }
    if (subcommand === "run" || subcommand === "run-script") {
        return afterOptions(rest).length > 0;
    }
    if (subcommand === "exec" || subcommand === "x" || subcommand === "dlx") {
        return runsCheck(afterOptions(rest), depth);
    }
    // pnpm, yarn and bun run a script or a local binary named directly.
    return name !== "npm" && (CHECK_SCRIPT_NAME_RE.test(subcommand) || runsCheck([subcommand, ...rest], depth));
}
/** node --test, or node running a check program's own script (node_modules/vitest/vitest.mjs). */
function isNodeCheck(args, depth) {
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--test") {
            return true;
        }
        if (arg === "-e" || arg === "--eval" || arg === "-p" || arg === "--print") {
            return false;
        }
        if (NODE_OPTIONS_WITH_VALUE.has(arg)) {
            i++;
        }
        else if (!arg.startsWith("-")) {
            const script = programName(arg).replace(/\.[cm]?js$/, "");
            return runsCheck([script, ...args.slice(i + 1)], depth);
        }
    }
    return false;
}
/** python -m pytest, python -m unittest. */
function isPythonCheck(args) {
    const module = args[args.indexOf("-m") + 1];
    return args.includes("-m") && (module === "pytest" || module === "unittest");
}
function isCheck(name, args, depth = 0) {
    if (CHECK_PROGRAMS.has(name)) {
        return true;
    }
    const subcommands = CHECK_SUBCOMMANDS.get(name);
    if (subcommands) {
        const words = operands(args).filter((arg) => !arg.startsWith("+"));
        return TARGET_TOOLS.has(name) ? words.some((word) => subcommands.has(word)) : subcommands.has(words[0] ?? "");
    }
    if (PACKAGE_MANAGERS.has(name)) {
        return isPackageManagerCheck(name, args, depth);
    }
    if (name === "node") {
        return isNodeCheck(args, depth);
    }
    if (/^(?:python[\d.]*|py)$/.test(name)) {
        return isPythonCheck(args);
    }
    if (PACKAGE_RUNNERS.has(name)) {
        const separator = args.indexOf("--");
        return runsCheck(afterOptions(separator === -1 ? args : args.slice(separator + 1), new Set(["-p", "--package", "-e"])), depth);
    }
    if (ENVIRONMENT_RUNNERS.has(name)) {
        const [subcommand, ...rest] = afterOptions(args);
        return (subcommand === "run" || subcommand === "exec") && runsCheck(afterOptions(rest, new Set(["--with", "-p", "--python"])), depth);
    }
    return false;
}
/**
 * True when a shell command line runs a test, a build or a check, with the
 * runner at a command position of the line: npm/pnpm/yarn/bun test or
 * run <script>; vitest, jest, mocha, tsc, eslint, playwright test, craco or
 * react-scripts test/build, vite build or next build/lint, direct or through
 * npx; node --test; pytest, python -m pytest or unittest; go test/vet/build;
 * cargo test/build/check/clippy; dotnet test/build; mvn test or verify; gradle
 * or make test/check/build; deno test; Invoke-Pester. The word test or build
 * in a path, a search pattern or a quoted string does not count.
 */
export function isVerificationRun(commandLine) {
    return invocations(commandLine).some((invocation) => isCheck(invocation.name, invocation.args));
}
