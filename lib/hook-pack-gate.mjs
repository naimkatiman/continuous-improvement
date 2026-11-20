// hook-pack-gate.mts — Pure decision core for the enforcing-hook pack (v1).
//
// No I/O. Given a raw Bash command string, the resolved current branch, the
// staged-file count, and the operator's mode, decide allow / warn / block.
// The hook (src/hooks/hook-pack.mts) wires stdin + git subprocess calls around
// these functions; keeping them pure lets the unit tests cover every branch
// without spawning anything. Lives in lib/ so tests can import it (the
// test-imports-only invariant forbids importing from hooks/).
//
// Fail-open by construction: callers pass safe defaults (null branch, 0 staged)
// on any failure, and an unrecognized mode resolves to warn.
export const COMMIT_FILE_LIMIT = 15;
const ALLOW = { action: "allow", reason: "" };
export function parseMode(raw) {
    const v = (raw ?? "warn").trim().toLowerCase();
    return v === "block" || v === "off" ? v : "warn";
}
// Match `git push` / `git commit` at the start of the command, immediately
// after a shell separator (newline, ;, |, &), or after an opening `{` or `(`.
// Windows PowerShell 5.1 has no `&&`, so a chain is written `A; if ($?) { B }`,
// which puts B inside a script block; `try { B }` and `(B)` do the same. An
// output capture (`$r = git push ...`) and the call operator (`& git ...`) may
// sit in front of the command word, and git may be spelled git.exe or by path,
// quoted when the path has a space. This deliberately does NOT match a mention
// like `echo git push`, where git is an argument, not the command.
const COMMAND_START = String.raw `(?:^|[\n;|&{(])\s*(?:\$[A-Za-z_][\w:]*\s*\+?=\s*)?(?:&\s*)?`;
const GIT_WORD = String.raw `(?:"[^"\n]*[\\/]git(?:\.exe)?"|'[^'\n]*[\\/]git(?:\.exe)?'|(?:[^\s'"]*[\\/])?git(?:\.exe)?)`;
const GIT_PUSH_RE = new RegExp(`${COMMAND_START}${GIT_WORD}\\s+push\\b`);
const GIT_COMMIT_RE = new RegExp(`${COMMAND_START}${GIT_WORD}\\s+commit\\b`);
export function classifyCommand(command) {
    if (GIT_PUSH_RE.test(command))
        return "push";
    if (GIT_COMMIT_RE.test(command))
        return "commit";
    return "other";
}
export function isProtectedBranch(branch) {
    return branch === "main" || branch === "master" || /^release\//.test(branch);
}
// Extract the explicit destination branch of a `git push`, or null when none is
// given (the caller should then fall back to the current branch). Handles
// `git push <remote> <branch>`, `git push -u <remote> <branch>`, and refspecs
// like `HEAD:main` (destination after the colon).
function parsePushTarget(command) {
    // The arguments of the push classifyCommand found, up to the end of that
    // command: a following `}`, `)` or separator is not part of the refspec.
    const push = GIT_PUSH_RE.exec(command);
    if (!push)
        return null;
    const args = command.slice(push.index + push[0].length).split(/[\n;|&{}()]/)[0];
    const operands = args.split(/\s+/).filter((t) => t !== "" && !t.startsWith("-"));
    // operands[0] is the remote; operands[1] is the refspec. Fewer than two means
    // no explicit branch (e.g. `git push` or `git push origin`).
    if (operands.length < 2)
        return null;
    const refspec = operands[1];
    return refspec.includes(":") ? (refspec.split(":").pop() ?? null) : refspec;
}
export function evaluatePush(command, currentBranch) {
    if (/(?:^|\s)--dry-run\b/.test(command))
        return { gated: false, branch: null };
    const branch = parsePushTarget(command) ?? currentBranch;
    if (!branch)
        return { gated: false, branch: null };
    return { gated: isProtectedBranch(branch), branch };
}
export function evaluateCommitSize(command, stagedCount) {
    if (/(?:^|\s)--amend\b/.test(command))
        return { gated: false };
    return { gated: stagedCount > COMMIT_FILE_LIMIT };
}
export function decide(mode, gated, reason) {
    if (!gated || mode === "off")
        return ALLOW;
    return { action: mode === "block" ? "block" : "warn", reason };
}
