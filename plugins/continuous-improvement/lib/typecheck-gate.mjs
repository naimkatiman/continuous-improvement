/**
 * Pure decision helpers for the typecheck Stop gate (RISA 4 / G4).
 *
 * The hook (src/hooks/typecheck-stop.mts) does the I/O — git, spawning the
 * typecheck, emitting the decision. Everything here is pure and unit-tested so
 * the mode/selection/formatting logic is provable without spawning a compiler.
 *
 * Mode via CLAUDE_TYPECHECK_GATE: "off" (default) | "warn" | "block".
 *   - off   : no-op. The default. The global ~/.claude typecheck-changed.sh
 *             already emits an advisory systemMessage; this hook stays silent
 *             until opted in, so there is no double-advisory and no regression.
 *   - warn  : print a one-line notice to stderr; never blocks.
 *   - block : emit {"decision":"block","reason":...} so the failure re-enters
 *             model context — the fix headless/autonomous -p loops need.
 */
export function resolveTypecheckMode(raw) {
    const value = (raw ?? "").trim().toLowerCase();
    return value === "block" || value === "warn" ? value : "off";
}
// Matches the extensions typecheck-changed.sh screens for. `.d.ts` ends in
// `.ts` so it counts — a changed ambient declaration can still break the build.
const TS_FILE_RE = /\.(ts|tsx|mts|cts)$/;
export function hasChangedTsFile(files) {
    return files.some((file) => TS_FILE_RE.test(file.trim()));
}
// Split a `git diff --name-only` blob into a clean path list (drops blank lines).
export function parseChangedFiles(gitOutput) {
    return (gitOutput ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}
// Prefer the project's own `typecheck` npm script (authoritative — it encodes
// the project's exact flags), else a local tsc, else null (a TS project with no
// runnable typecheck stays silent rather than guessing).
export function pickTypecheckKind(hasNpmTypecheckScript, hasLocalTsc) {
    if (hasNpmTypecheckScript)
        return "npm";
    if (hasLocalTsc)
        return "tsc";
    return null;
}
export function formatTypecheckReason(output, maxLines = 15) {
    const tail = (output ?? "")
        .split(/\r?\n/)
        .filter((line) => line.length > 0)
        .slice(-maxLines)
        .join("\n");
    return `Typecheck FAILED on changed TS files — fix before ending the turn:\n${tail}`;
}
// The single decision point. `ranTypecheck` is false when the gate short-circuited
// (mode off, no TS project, no changed TS file, no runnable typecheck, or the run
// timed out) — all of which allow. A conclusive non-zero rc maps to the mode.
export function decideTypecheckAction(input) {
    if (input.mode === "off")
        return "allow";
    if (!input.ranTypecheck)
        return "allow";
    if (input.rc === 0)
        return "allow";
    return input.mode;
}
