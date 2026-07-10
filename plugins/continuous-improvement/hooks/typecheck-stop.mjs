#!/usr/bin/env node
/**
 * typecheck-stop.mts — Stop hook that runs the project typecheck on changed TS
 * files and, when opted in, returns a block decision so the failure re-enters
 * model context and the agent fixes it before ending the turn — in all modes,
 * including headless `-p` runs where Stop still fires (RISA 4 / G4).
 *
 * Ports the proven detection logic of ~/.claude/scripts/typecheck-changed.sh
 * (skip non-TS repos, skip TS repos with no changed TS file, prefer the npm
 * `typecheck` script) and adds the block mechanism of goal-drift-stop.mts.
 *
 * Mode via CLAUDE_TYPECHECK_GATE: "off" (default) | "warn" | "block".
 *   off   : no-op (the global script's advisory systemMessage stays the default
 *           layer; this hook is the opt-in enforcement layer — zero regression).
 *   warn  : one-line stderr notice; never blocks.
 *   block : {"decision":"block","reason":...} to re-prompt the model.
 *
 * Fail-open by construction: any error, missing root, non-TS repo, no changed
 * TS file, no runnable typecheck, or a run that times out exits 0 (allow). No
 * network. The wiring gives this hook a longer timeout than the 5s hooks
 * because `tsc` is slower; on the internal timeout it fails open.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { decideTypecheckAction, formatTypecheckReason, hasChangedTsFile, parseChangedFiles, pickTypecheckKind, resolveTypecheckMode, } from "../lib/typecheck-gate.mjs";
const SPAWN_TIMEOUT_MS = 25_000;
function resolveProjectRoot() {
    const fromEnv = process.env.CLAUDE_PROJECT_DIR;
    if (fromEnv && fromEnv.trim())
        return fromEnv.trim();
    try {
        const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        return root || null;
    }
    catch {
        return null;
    }
}
function collectChangedFiles(root) {
    const run = (args) => {
        try {
            return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        }
        catch {
            return "";
        }
    };
    const unstaged = run(["diff", "--name-only", "--diff-filter=ACMR"]);
    const staged = run(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
    const untracked = run(["ls-files", "--others", "--exclude-standard"]);
    return [...parseChangedFiles(unstaged), ...parseChangedFiles(staged), ...parseChangedFiles(untracked)];
}
function hasNpmTypecheckScript(root) {
    try {
        const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
        return typeof pkg.scripts?.typecheck === "string";
    }
    catch {
        return false;
    }
}
function localTscPath(root) {
    // node_modules/typescript/bin/tsc is a Node script — invoking it via `node`
    // is cross-platform, unlike node_modules/.bin/tsc (a shell script / .cmd).
    const path = join(root, "node_modules", "typescript", "bin", "tsc");
    return existsSync(path) ? path : null;
}
function runTypecheck(root) {
    const tscPath = localTscPath(root);
    const kind = pickTypecheckKind(hasNpmTypecheckScript(root), tscPath !== null);
    if (!kind)
        return { ran: false, rc: 0, output: "" };
    const result = kind === "npm"
        ? spawnSync("npm", ["run", "--silent", "typecheck"], {
            cwd: root,
            encoding: "utf8",
            shell: true,
            timeout: SPAWN_TIMEOUT_MS,
        })
        : spawnSync(process.execPath, [tscPath, "--noEmit"], {
            cwd: root,
            encoding: "utf8",
            timeout: SPAWN_TIMEOUT_MS,
        });
    // A timeout or spawn failure leaves error set / status null — inconclusive, so
    // fail open (do not block on a check that never produced a verdict).
    if (result.error || typeof result.status !== "number")
        return { ran: false, rc: 0, output: "" };
    return { ran: true, rc: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}
function main() {
    const mode = resolveTypecheckMode(process.env.CLAUDE_TYPECHECK_GATE);
    if (mode === "off")
        return;
    const root = resolveProjectRoot();
    if (!root || !existsSync(join(root, "tsconfig.json")))
        return; // not a TS project
    if (!hasChangedTsFile(collectChangedFiles(root)))
        return; // nothing TS changed — near-zero cost
    const { ran, rc, output } = runTypecheck(root);
    const action = decideTypecheckAction({ mode, ranTypecheck: ran, rc });
    if (action === "block") {
        process.stdout.write(`${JSON.stringify({ decision: "block", reason: formatTypecheckReason(output) })}\n`);
    }
    else if (action === "warn") {
        process.stderr.write(`[continuous-improvement] typecheck: ${formatTypecheckReason(output)}\n`);
    }
}
try {
    main();
}
catch {
    // fail open — never trap a turn on a hook bug
}
