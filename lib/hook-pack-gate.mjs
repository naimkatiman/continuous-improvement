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
import { gitInvocations } from "./destructive-bash.mjs";
export const COMMIT_FILE_LIMIT = 15;
const ALLOW = { action: "allow", reason: "" };
export function parseMode(raw) {
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
let lastReading = null;
function gitCommands(command, tool) {
    if (lastReading === null || lastReading.command !== command || lastReading.tool !== tool) {
        lastReading = { command, tool, found: gitInvocations(command, tool) };
    }
    return lastReading.found;
}
export function classifyCommand(command, tool) {
    const found = gitCommands(command, tool);
    if (found.some((git) => git.sub === "push"))
        return "push";
    if (found.some((git) => git.sub === "commit"))
        return "commit";
    return "other";
}
export function isProtectedBranch(branch) {
    return branch === "main" || branch === "master" || /^release\//.test(branch);
}
// The explicit destination branch of one `git push`, or null when none is given
// (the caller then falls back to the current branch). Handles
// `git push <remote> <branch>`, `git push -u <remote> <branch>`, and refspecs
// like `HEAD:main` (destination after the colon).
function pushTarget(push) {
    const operands = push.args.filter((t) => !t.startsWith("-"));
    // operands[0] is the remote; operands[1] is the refspec. Fewer than two means
    // no explicit branch (e.g. `git push` or `git push origin`).
    if (operands.length < 2)
        return null;
    const refspec = operands[1];
    return refspec.includes(":") ? (refspec.split(":").pop() ?? null) : refspec;
}
// Gated when any push in the command goes to a protected branch. `--dry-run`
// exempts the push it is written on, not the whole command line.
export function evaluatePush(command, currentBranch, tool) {
    let seen = null;
    for (const git of gitCommands(command, tool)) {
        if (git.sub !== "push" || git.args.includes("--dry-run"))
            continue;
        const branch = pushTarget(git) ?? currentBranch;
        if (!branch)
            continue;
        if (isProtectedBranch(branch))
            return { gated: true, branch };
        seen ??= branch;
    }
    return { gated: false, branch: seen };
}
// `--amend` adds no files, so a command with an amending commit is exempt. The
// flag is read from a commit's own arguments: a message that mentions `--amend`
// does not switch the gate off.
export function evaluateCommitSize(command, stagedCount, tool) {
    const amends = gitCommands(command, tool).some((git) => git.sub === "commit" && git.args.includes("--amend"));
    if (amends)
        return { gated: false };
    return { gated: stagedCount > COMMIT_FILE_LIMIT };
}
export function decide(mode, gated, reason) {
    if (!gated || mode === "off")
        return ALLOW;
    return { action: mode === "block" ? "block" : "warn", reason };
}
