// install-runtime.mts — The stable runtime copy and the install ledger behind
// `install --target <agent> --hooks` (docs/plans/2026-11-21-all-agents.md,
// Architecture items 11 and 12).
//
// The installer copies hooks/, bin/, lib/ and the files they read at run time
// to <instincts root>/runtime/<version>/, and every hook and MCP command it
// renders points there, never at the npx cache, which can be pruned under a
// running agent. The copy is staged and renamed into place, so the previous
// runtime stays until the new one is complete, and an older version is pruned
// only after an install succeeds and no ledger entry points at it.
// <instincts root>/global/install-ledger.json records every file and vendor
// command an install touched, so `--uninstall --target <id>` removes exactly
// that. A vendor registration the uninstall did not undo keeps its entry
// (pending) and its runtime until it is undone (PR 19). What to write is
// planned in agent-install-plans.mjs (pure); this module does the I/O.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseLedger, planAgentInstall, recordInstall, removeOwnedConfig, resolveHookAgent, runtimesInUse, toLedgerFile, } from "./agent-install-plans.mjs";
import { MANAGED_BEGIN, planTargetWrites } from "./install-targets.mjs";
import { readSkillCatalog } from "./skill-export.mjs";
/**
 * What a runtime needs: the hooks, the bins and their lib, what the MCP server
 * reads beside them, and scripts/, which the exported skills' rewritten
 * `${CLAUDE_PLUGIN_ROOT}/scripts/...` paths point at (PR 15).
 */
const RUNTIME_PARTS = ["hooks", "bin", "lib", "instinct-packs", join("templates", "planning-with-files"), "scripts", "package.json"];
const slash = (path) => path.replace(/\\/g, "/");
export function runtimeDir(instinctsRoot, version) {
    return join(instinctsRoot, "runtime", version);
}
/** Copies the runtime for `version` into place and returns its dir. A failed copy leaves the old one untouched. */
export function installRuntime(packageRoot, instinctsRoot, version) {
    if (!/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(version))
        throw new Error(`Refusing runtime version ${JSON.stringify(version)}`);
    const base = join(instinctsRoot, "runtime");
    mkdirSync(base, { recursive: true });
    const staging = mkdtempSync(join(base, `.staging-${version}-`));
    const dest = runtimeDir(instinctsRoot, version);
    try {
        for (const part of RUNTIME_PARTS) {
            const source = join(packageRoot, part);
            if (!existsSync(source))
                throw new Error(`The package has no ${part} to copy (${source})`);
            cpSync(source, join(staging, part), { recursive: true });
        }
        if (!existsSync(dest)) {
            renameSync(staging, dest);
            return dest;
        }
        // Same version again: swap the complete copy in, and put the old one back if that fails.
        const old = join(base, `.old-${version}-${process.pid}-${Date.now()}`);
        renameSync(dest, old);
        try {
            renameSync(staging, dest);
        }
        catch (error) {
            renameSync(old, dest);
            throw error;
        }
        rmSync(old, { recursive: true, force: true });
        return dest;
    }
    finally {
        rmSync(staging, { recursive: true, force: true });
    }
}
/**
 * Removes each runtime version dir the ledger has recorded (`ledger.runtimes`)
 * that no entry uses and that is not `current`, and returns the ledger with
 * every recorded runtime that is gone dropped from `runtimes`. A dir the
 * ledger never recorded stays: a config written outside the ledger may still
 * point at it. Only direct children of <instincts root>/runtime/ are
 * candidates, whatever the ledger says. Best effort: one in use stays.
 */
export function pruneRuntimes(instinctsRoot, ledger, current) {
    const base = join(instinctsRoot, "runtime");
    const recorded = new Set(ledger.runtimes.map(slash));
    const keep = runtimesInUse(ledger);
    for (const name of listDir(base)) {
        const dir = join(base, name);
        if (name.startsWith(".") || !recorded.has(slash(dir)) || keep.has(slash(dir)) || slash(dir) === current)
            continue;
        try {
            if (statSync(dir).isDirectory())
                rmSync(dir, { recursive: true, force: true });
        }
        catch {
            // a runtime an agent still holds open is left for the next install
        }
    }
    const runtimes = ledger.runtimes.filter((dir) => keep.has(dir) || slash(dir) === current || existsSync(dir));
    return { ...ledger, runtimes };
}
function readText(path) {
    try {
        return readFileSync(path, "utf8");
    }
    catch (error) {
        const code = error.code;
        if (code === "ENOENT" || code === "ENOTDIR")
            return null;
        throw error;
    }
}
function listDir(path) {
    try {
        return readdirSync(path);
    }
    catch {
        return [];
    }
}
const SAFE_ARG = /^[\w\-./:=@\\]+$/;
const display = (argv) => argv.map((arg) => (SAFE_ARG.test(arg) ? arg : JSON.stringify(arg))).join(" ");
// A vendor CLI is usually a .cmd shim on Windows, which only cmd.exe starts.
// `cwd` is the project root for a project-scope command: `grok mcp add --scope
// project` and `devin mcp add -s project` write relative to their cwd.
function runVendor(argv, platform, cwd) {
    const options = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...(cwd === null ? {} : { cwd }) };
    const result = platform === "win32"
        ? spawnSync(argv.map((arg) => (SAFE_ARG.test(arg) ? arg : `"${arg.replace(/"/g, '""')}"`)).join(" "), { ...options, shell: true })
        : spawnSync(argv[0], argv.slice(1), options);
    if (result.error)
        return result.error.message;
    return result.status === 0 ? null : `exit ${result.status}: ${(result.stderr || result.stdout || "").trim().split(/\r?\n/)[0] ?? ""}`;
}
// An undo whose server is already gone counts as done. Grok 1.0.85 `grok mcp
// remove <name> --scope user` for a server it does not have exits 1 with
// "No MCP server named '<name>' in user config" (PR 19 probe); codex-cli
// 0.171.0 prints "No MCP server named '<name>' found." and exits 0.
const ALREADY_GONE = /\bNo MCP server named\b/;
// The Documents folder the way Windows resolves it, which follows a OneDrive
// Known Folder Move; Cline's VS Code extension finds its global hooks dir the
// same way (getDocumentsPath()). Off Windows, or when PowerShell fails or
// reports nothing usable, null: the planner then falls back to ~/Documents and
// says so. Stdout is forced to UTF-8 so a non-ASCII user name survives.
export function resolveDocumentsDir(platform) {
    if (platform !== "win32")
        return null;
    const result = spawnSync("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-Command",
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Environment]::GetFolderPath('MyDocuments')",
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000, windowsHide: true });
    const dir = result.status === 0 ? (result.stdout ?? "").replace(/^﻿/, "").trim() : "";
    return /^[A-Za-z]:[\\/]/.test(dir) && !/[\r\n]/.test(dir) ? dir : null;
}
function once(fn) {
    let done = false;
    let value;
    return () => {
        if (!done) {
            value = fn();
            done = true;
        }
        return value;
    };
}
function ledgerFile(io) {
    return join(io.instinctsRoot, "global", "install-ledger.json");
}
function loadLedger(io) {
    const ledger = parseLedger(readText(ledgerFile(io)));
    if (ledger === null)
        io.err(`  ✗ ${slash(ledgerFile(io))} is not a valid install ledger; fix or move it and rerun. Nothing was changed.`);
    return ledger;
}
function saveLedger(io, ledger) {
    mkdirSync(dirname(ledgerFile(io)), { recursive: true });
    writeFileSync(ledgerFile(io), `${JSON.stringify(ledger, null, 2)}\n`);
}
// `mode`: a hook script the agent executes directly (Cline's sh hook) needs the exec bit.
function writeFile(path, content, mode) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    if (mode !== undefined)
        chmodSync(path, mode);
}
/**
 * Writes one agent's config files, then saves `ledger` (which records them),
 * and returns it. If a write or the save fails, every file already written is
 * put back as it was (a created one is deleted) before the error is rethrown.
 */
function writeRecorded(io, plan, ledger) {
    const written = [];
    try {
        for (const write of plan.writes) {
            const previous = readText(write.path);
            writeFile(write.path, write.content, write.mode);
            written.push({ path: write.path, previous });
            if (write.skill === undefined)
                io.out(`  ✓ ${plan.agent} → ${write.path}`);
        }
        for (const [dir, count] of skillDirs(plan))
            io.out(`  ✓ ${plan.agent} → ${count} skills in ${dir}`);
        saveLedger(io, ledger);
        return ledger;
    }
    catch (error) {
        for (const { path, previous } of written.reverse()) {
            try {
                if (previous === null)
                    rmSync(path, { force: true });
                else
                    writeFileSync(path, previous);
                io.err(`  ↺ ${plan.agent}: put back ${path}`);
            }
            catch {
                io.err(`  ✗ ${plan.agent}: could not put back ${path}; remove the continuous-improvement entries from it by hand.`);
            }
        }
        throw error;
    }
}
// The exported skills are listed as one line per skills dir, not one per SKILL.md.
function skillDirs(plan) {
    const dirs = new Map();
    for (const write of plan.writes) {
        if (write.skill === undefined)
            continue;
        const dir = slash(dirname(dirname(write.path)));
        dirs.set(dir, (dirs.get(dir) ?? 0) + 1);
    }
    return dirs;
}
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
/**
 * The rules files (AGENTS.md, GEMINI.md, ...) a --hooks install of these
 * targets writes, as ledger-recorded writes of the hook agent each belongs to:
 * a managed block is ours to take out again, a whole file only when we created
 * it (or the entry it replaces recorded that). A whole file that was there
 * before is still written, as without --hooks, but not recorded.
 */
function rulesWrites(args, io, ledger) {
    const recorded = new Map();
    const unrecorded = [];
    const skipped = [];
    if (args.rulesTargets.length === 0)
        return { recorded, unrecorded, skipped };
    const skillMd = io.skillMd();
    for (const target of args.rulesTargets) {
        const agent = resolveHookAgent(target) ?? target;
        const plan = planTargetWrites(target, skillMd, (rel) => readText(join(io.projectRoot, rel)));
        for (const write of plan.writes) {
            // A rules file belongs to one project. Outside one, the cwd fallback is often the home, where
            // no agent reads AGENTS.md or GEMINI.md as yours (probe defect 9).
            if (io.inProject === false) {
                skipped.push(`${write.relPath} (${target} rules) is not written: no project directory here (${slash(io.projectRoot)}), and a rules file belongs to one project. Run the install inside the project to write it.`);
                continue;
            }
            const path = slash(join(io.projectRoot, write.relPath));
            // Created when it is not there, or when any install recorded creating it (this slot's last one, or
            // the same agent at the other scope), so whichever uninstall of them comes last deletes it.
            const created = readText(path) === null || ledger.entries.some((entry) => entry.files.some((file) => slash(file.path) === path && file.created));
            const base = { path, content: write.content, created, hooksAt: null, hookCommands: [], mcpAt: null, mcp: null };
            let entryWrite = null;
            if (write.content.includes(MANAGED_BEGIN))
                entryWrite = { ...base, managedBlock: true };
            else if (created)
                entryWrite = { ...base, script: { sha256: sha256(write.content) } };
            if (entryWrite === null)
                unrecorded.push({ target, path, content: write.content });
            else
                recorded.set(agent, [...(recorded.get(agent) ?? []), entryWrite]);
        }
    }
    return { recorded, unrecorded, skipped };
}
function printPlanText(io, plan) {
    for (const step of plan.printed)
        io.out(`  ▸ ${step.replace(/\n/g, "\n    ")}`);
    for (const note of plan.notes)
        io.out(`  ℹ ${note}`);
    for (const warning of plan.warnings)
        io.out(`  ! ${warning}`);
}
export function runHookInstall(args, io) {
    const rt = slash(runtimeDir(io.instinctsRoot, io.version));
    const ledger = loadLedger(io);
    if (ledger === null)
        return 1;
    const documentsDir = once(io.documentsDir);
    let catalog;
    try {
        catalog = readSkillCatalog(io.packageRoot);
    }
    catch (error) {
        io.err(`  ✗ The package's skills cannot be read: ${error instanceof Error ? error.message : String(error)}`);
        io.err("Nothing was written.");
        return 1;
    }
    const planned = args.agents.map((agent) => planAgentInstall(agent, {
        scope: args.scope, runtimeDir: rt, projectRoot: io.projectRoot, home: io.home, platform: io.platform, env: io.env,
        failClosed: args.failClosed, read: readText, listDir, documentsDir, catalog,
    }));
    const failed = planned.filter((plan) => plan.error !== undefined);
    if (failed.length > 0) {
        for (const plan of failed)
            io.err(`  ✗ ${plan.agent}: ${plan.error}`);
        io.err("Nothing was written.");
        return 1;
    }
    // codex, gemini, cursor, copilot and windsurf also keep their rules file, recorded with
    // the agent's entry (PR 19). Its plan's "hooks are Claude Code-only" note is not
    // printed: here they get hooks.
    const rules = rulesWrites(args, io, ledger);
    const plans = planned.map((plan) => ({ ...plan, writes: [...plan.writes, ...(rules.recorded.get(plan.agent) ?? [])] }));
    io.out(`\ncontinuous-improvement agent install (scope: ${args.scope}${args.dryRun ? ", dry run" : ""})\n`);
    for (const line of rules.skipped)
        io.out(`  ℹ ${line}`);
    if (args.dryRun) {
        io.out(`  · would copy the runtime → ${rt}`);
        for (const { target, path } of rules.unrecorded)
            io.out(`  · would write ${path} (${target} rules, there before, so the uninstall keeps it)`);
        for (const plan of plans) {
            for (const write of plan.writes)
                if (write.skill === undefined)
                    io.out(`  · would ${write.created ? "create" : "update"} ${write.path} (${plan.agent})`);
            for (const [dir, count] of skillDirs(plan))
                io.out(`  · would write ${count} skills to ${dir} (${plan.agent})`);
            for (const run of plan.runs)
                io.out(args.run ? `  · would run: ${display(run.argv)}` : `  ▸ run yourself: ${display(run.argv)}`);
            printPlanText(io, plan);
        }
        io.out("\nDry run: nothing was written.\n");
        return 0;
    }
    let status = 0;
    let next = ledger;
    const recorded = [];
    // A project-scope vendor command runs in the project root, where it writes its project config.
    const runCwd = args.scope === "project" ? slash(io.projectRoot) : null;
    try {
        installRuntime(io.packageRoot, io.instinctsRoot, io.version);
        io.out(`  ✓ runtime → ${rt}`);
        for (const { target, path, content } of rules.unrecorded) {
            writeFile(path, content);
            io.out(`  ✓ ${target} → ${path} (there before, so the uninstall keeps it)`);
        }
        for (const plan of plans) {
            const files = plan.writes.map(toLedgerFile);
            const paths = new Set(files.map((file) => slash(file.path)));
            // A user entry is one slot for every project: a rules file an earlier user install wrote into
            // another project stays recorded, so the uninstall still removes it.
            const previous = args.scope === "user" ? ledger.entries.find((other) => other.target === plan.agent && other.scope === "user") : undefined;
            const carried = (previous?.files ?? []).filter((file) => (file.managedBlock === true || (file.script !== undefined && file.skill === undefined)) && !paths.has(slash(file.path)));
            const entry = {
                target: plan.agent, scope: args.scope, project: args.scope === "project" ? slash(io.projectRoot) : null, version: io.version, runtime: rt,
                installedAt: new Date().toISOString(),
                files: [...files, ...carried],
                runs: plan.runs.map((run) => ({ ...run, ran: false, cwd: runCwd })),
            };
            // The agent's files and its ledger entry land together: a failure puts its
            // files back as they were, so no config is on disk that the ledger lacks.
            next = writeRecorded(io, plan, recordInstall(next, entry));
            recorded.push(plan.agent);
            if (plan.runs.length === 0) {
                printPlanText(io, plan);
                continue;
            }
            const runs = entry.runs.map((run) => {
                if (!args.run) {
                    io.out(`  ▸ run yourself: ${display(run.argv)}`);
                    return run;
                }
                const failure = runVendor(run.argv, io.platform, run.cwd);
                if (failure === null)
                    io.out(`  ✓ ran: ${display(run.argv)}`);
                else {
                    io.err(`  ✗ ${display(run.argv)} failed (${failure}); run it yourself.`);
                    status = 1;
                }
                return { ...run, ran: failure === null };
            });
            printPlanText(io, plan);
            if (runs.some((run) => run.ran)) {
                next = recordInstall(next, { ...entry, runs });
                saveLedger(io, next);
            }
        }
    }
    catch (error) {
        io.err(`  ✗ Install failed: ${error instanceof Error ? error.message : String(error)}`);
        if (recorded.length > 0)
            io.err(`  ℹ ${recorded.join(", ")} installed and recorded before the failure; \`--uninstall --target ${recorded.join(",")}\` removes them.`);
        return 1;
    }
    saveLedger(io, pruneRuntimes(io.instinctsRoot, next, rt));
    io.out(`  ✓ ledger → ${slash(ledgerFile(io))}\n\n${status === 0 ? "Done." : "Done with errors."}\n`);
    return status;
}
export function runHookUninstall(args, io) {
    const ledger = loadLedger(io);
    if (ledger === null)
        return 1;
    const project = slash(io.projectRoot);
    const mine = (entry) => args.agents.includes(entry.target) && entry.scope === args.scope && (args.scope === "user" || entry.project === project);
    const entries = ledger.entries.filter(mine);
    io.out(`\ncontinuous-improvement agent uninstall (scope: ${args.scope}${args.dryRun ? ", dry run" : ""})\n`);
    if (entries.length === 0)
        io.out(`  Nothing recorded for ${args.agents.join(", ")} (scope: ${args.scope}) in ${slash(ledgerFile(io))}.`);
    // An agent with nothing at this scope may be recorded at the other one (probe defect 8).
    for (const agent of args.agents.filter((id) => !entries.some((entry) => entry.target === id))) {
        for (const other of ledger.entries.filter((entry) => entry.target === agent && entry.scope !== args.scope)) {
            io.out(other.scope === "user"
                ? `  ℹ ${agent} is recorded at scope user: \`--uninstall --target ${agent} --scope user\` removes it.`
                : `  ℹ ${agent} is recorded at scope project in ${other.project}: run \`--uninstall --target ${agent}\` there.`);
        }
    }
    if (entries.length === 0) {
        io.out("");
        return 0;
    }
    // A whole file or rules block we own that another install also recorded (a skill copy
    // two agents share, such as ~/.agents/skills) stays until the last one goes.
    const owned = (file) => file.script !== undefined || file.managedBlock === true;
    const shared = new Set(ledger.entries.filter((entry) => !mine(entry)).flatMap((entry) => entry.files.filter(owned).map((file) => slash(file.path))));
    let actions;
    let kept = 0;
    // Agents that share a whole file and go together (`--target codex,devin`) remove it once.
    const seen = new Set();
    try {
        actions = entries.flatMap((entry) => entry.files.flatMap((file) => {
            if (owned(file)) {
                if (seen.has(slash(file.path)))
                    return [];
                seen.add(slash(file.path));
                if (shared.has(slash(file.path))) {
                    kept++;
                    return [];
                }
            }
            return [{ path: file.path, skill: file.skill !== undefined, result: removeOwnedConfig(readText(file.path), file) }];
        }));
    }
    catch (error) {
        io.err(`  ✗ ${error instanceof Error ? error.message : String(error)}
Nothing was removed.`);
        return 1;
    }
    const errors = actions.filter(({ result }) => result.kind === "error");
    if (errors.length > 0) {
        for (const { result } of errors)
            io.err(`  ✗ ${result.kind === "error" ? result.message : ""}`);
        io.err("Nothing was removed.");
        return 1;
    }
    let status = 0;
    let skills = 0;
    if (kept > 0)
        io.out(`  ℹ kept ${kept} files another install also recorded`);
    for (const { path, skill, result } of actions) {
        if (result.kind === "missing")
            io.out(`  ℹ ${path} is already gone`);
        else if (args.dryRun)
            io.out(`  · would ${result.kind === "delete" ? "delete" : "update"} ${path}`);
        else if (result.kind === "delete") {
            rmSync(path, { force: true });
            if (!skill)
                io.out(`  ✓ deleted ${path}`);
            else {
                skills++;
                try {
                    rmdirSync(dirname(path)); // the skill's own dir, only when nothing else is left in it
                }
                catch {
                    // a file the user added beside SKILL.md keeps the dir
                }
            }
        }
        else if (result.kind === "write") {
            writeFileSync(path, result.content);
            io.out(`  ✓ removed our entries from ${path}`);
        }
    }
    if (skills > 0)
        io.out(`  ✓ deleted ${skills} skill copies`);
    // A vendor registration that ran and is not undone (no --run, a failed undo, or a
    // command with none) still points at the entry's runtime, so the entry stays,
    // pending, with only those runs, and the runtime stays with it (probe defect 1).
    const pending = new Map();
    for (const entry of entries) {
        const left = [];
        for (const run of entry.runs) {
            if (!run.ran) {
                io.out(run.undo === null ? `  ▸ if you ran ${display(run.argv)}, remove what it added by hand.` : `  ▸ if you ran ${display(run.argv)}, undo it: ${display(run.undo)}`);
            }
            else if (run.undo === null) {
                // Nothing can undo it: the uninstall after the one that said so takes it as removed by hand.
                if (entry.pending)
                    io.out(`  ℹ ${display(run.argv)}: taken as removed by hand`);
                else {
                    io.out(`  ▸ ${display(run.argv)} has no undo command; remove what it added by hand, then run this uninstall again.`);
                    left.push(run);
                }
            }
            else if (args.dryRun) {
                io.out(`  · would ${args.run ? "run" : "print"}: ${display(run.undo)}`);
            }
            else if (!args.run) {
                if (run.undoFailed)
                    io.out(`  ▸ ${display(run.undo)} failed before: taken as removed by hand. If it is still there, run that yourself.`);
                else {
                    io.out(`  ▸ run yourself: ${display(run.undo)}`);
                    left.push(run);
                }
            }
            else {
                const failure = runVendor(run.undo, io.platform, run.cwd);
                if (failure === null)
                    io.out(`  ✓ ran: ${display(run.undo)}`);
                else if (ALREADY_GONE.test(failure))
                    io.out(`  ✓ ${display(run.undo)}: already removed (${failure})`);
                else {
                    io.err(`  ✗ ${display(run.undo)} failed (${failure}); run it yourself.`);
                    status = 1;
                    // A second failure (the vendor CLI uninstalled, or a missing server reported in other words)
                    // is taken as removed by hand, as an undo of null is, so the entry cannot stay pending forever.
                    if (run.undoFailed)
                        io.out(`  ▸ ${display(run.undo)} failed again: taken as removed by hand. If ${entry.target} still lists continuous-improvement, remove it by hand.`);
                    else
                        left.push({ ...run, undoFailed: true });
                }
            }
        }
        if (left.length === 0 || args.dryRun)
            continue;
        pending.set(entry, { ...entry, files: [], runs: left, pending: true });
        const scopeFlag = entry.scope === "user" ? " --scope user" : "";
        const finish = left.some((run) => run.undo !== null && run.undoFailed !== true)
            ? `\`--uninstall --target ${entry.target}${scopeFlag} --run\` runs that undo and finishes the uninstall`
            : left.some((run) => run.undoFailed === true)
                ? `\`--uninstall --target ${entry.target}${scopeFlag}\` then finishes the uninstall, taking it as removed (with --run it tries the undo once more)`
                : `\`--uninstall --target ${entry.target}${scopeFlag}\` then finishes the uninstall`;
        io.out(`  ℹ ${entry.target} stays in the ledger as pending, and so does its runtime ${entry.runtime}, while that registration points at it: ${finish}.`);
    }
    if (args.dryRun) {
        io.out("\nDry run: nothing was removed.\n");
        return 0;
    }
    const remaining = ledger.entries.flatMap((entry) => (!mine(entry) ? [entry] : pending.has(entry) ? [pending.get(entry)] : []));
    saveLedger(io, pruneRuntimes(io.instinctsRoot, { version: 1, entries: remaining, runtimes: ledger.runtimes }, null));
    io.out(`\n${status === 0 ? "Done." : "Done with errors."}\n`);
    return status;
}
