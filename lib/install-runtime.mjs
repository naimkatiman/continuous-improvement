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
// that. What to write is planned in agent-install-plans.mjs (pure); this module
// does the I/O.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseLedger, planAgentInstall, recordInstall, removeOwnedConfig, runtimesInUse, } from "./agent-install-plans.mjs";
import { planTargetWrites } from "./install-targets.mjs";
/** What a runtime needs: the hooks, the bins and their lib, and what the MCP server reads beside them. */
const RUNTIME_PARTS = ["hooks", "bin", "lib", "instinct-packs", join("templates", "planning-with-files"), "package.json"];
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
/** Removes every runtime version dir not in `keep` (slash paths). Best effort: one in use stays. */
export function pruneRuntimes(instinctsRoot, keep) {
    const base = join(instinctsRoot, "runtime");
    for (const name of listDir(base)) {
        const dir = join(base, name);
        if (name.startsWith(".") || keep.has(slash(dir)))
            continue;
        try {
            if (statSync(dir).isDirectory())
                rmSync(dir, { recursive: true, force: true });
        }
        catch {
            // a runtime an agent still holds open is left for the next install
        }
    }
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
function runVendor(argv, platform) {
    const result = platform === "win32"
        ? spawnSync(argv.map((arg) => (SAFE_ARG.test(arg) ? arg : `"${arg.replace(/"/g, '""')}"`)).join(" "), { shell: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
        : spawnSync(argv[0], argv.slice(1), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (result.error)
        return result.error.message;
    return result.status === 0 ? null : `exit ${result.status}: ${(result.stderr || result.stdout || "").trim().split(/\r?\n/)[0] ?? ""}`;
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
function writeFile(path, content) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
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
    const plans = args.agents.map((agent) => planAgentInstall(agent, {
        scope: args.scope, runtimeDir: rt, projectRoot: io.projectRoot, home: io.home, platform: io.platform, env: io.env,
        failClosed: args.failClosed, read: readText, listDir,
    }));
    const failed = plans.filter((plan) => plan.error !== undefined);
    if (failed.length > 0) {
        for (const plan of failed)
            io.err(`  ✗ ${plan.agent}: ${plan.error}`);
        io.err("Nothing was written.");
        return 1;
    }
    // codex and windsurf also keep their rules file, written as without --hooks. Its
    // plan's "hooks are Claude Code-only" note is not printed: here they get hooks.
    const skillMd = args.rulesTargets.length > 0 ? io.skillMd() : "";
    const rules = args.rulesTargets.map((target) => ({ target, plan: planTargetWrites(target, skillMd, (rel) => readText(join(io.projectRoot, rel))) }));
    io.out(`\ncontinuous-improvement agent install (scope: ${args.scope}${args.dryRun ? ", dry run" : ""})\n`);
    if (args.dryRun) {
        io.out(`  · would copy the runtime → ${rt}`);
        for (const { target, plan } of rules)
            for (const write of plan.writes)
                io.out(`  · would write ${write.relPath} (${target} rules)`);
        for (const plan of plans) {
            for (const write of plan.writes)
                io.out(`  · would ${write.created ? "create" : "update"} ${write.path} (${plan.agent})`);
            for (const run of plan.runs)
                io.out(args.run ? `  · would run: ${display(run.argv)}` : `  ▸ run yourself: ${display(run.argv)}`);
            printPlanText(io, plan);
        }
        io.out("\nDry run: nothing was written.\n");
        return 0;
    }
    let status = 0;
    let next = ledger;
    try {
        installRuntime(io.packageRoot, io.instinctsRoot, io.version);
        io.out(`  ✓ runtime → ${rt}`);
        for (const { target, plan } of rules) {
            for (const write of plan.writes) {
                writeFile(join(io.projectRoot, write.relPath), write.content);
                io.out(`  ✓ ${target} → ${write.relPath}`);
            }
        }
        for (const plan of plans) {
            for (const write of plan.writes) {
                writeFile(write.path, write.content);
                io.out(`  ✓ ${plan.agent} → ${write.path}`);
            }
            const runs = plan.runs.map((run) => {
                if (!args.run) {
                    io.out(`  ▸ run yourself: ${display(run.argv)}`);
                    return { ...run, ran: false };
                }
                const failure = runVendor(run.argv, io.platform);
                if (failure === null)
                    io.out(`  ✓ ran: ${display(run.argv)}`);
                else {
                    io.err(`  ✗ ${display(run.argv)} failed (${failure}); run it yourself.`);
                    status = 1;
                }
                return { ...run, ran: failure === null };
            });
            printPlanText(io, plan);
            const entry = {
                target: plan.agent, scope: args.scope, project: args.scope === "project" ? slash(io.projectRoot) : null, version: io.version, runtime: rt,
                installedAt: new Date().toISOString(),
                files: plan.writes.map(({ path, created, hooksAt, hookCommands, mcpAt, mcp }) => ({ path, created, hooksAt, hookCommands, mcpAt, mcp })),
                runs,
            };
            next = recordInstall(next, entry);
        }
        saveLedger(io, next);
    }
    catch (error) {
        io.err(`  ✗ Install failed: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
    }
    pruneRuntimes(io.instinctsRoot, new Set([...runtimesInUse(next), rt]));
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
    if (entries.length === 0) {
        io.out(`  Nothing recorded for ${args.agents.join(", ")} (scope: ${args.scope}) in ${slash(ledgerFile(io))}.\n`);
        return 0;
    }
    let actions;
    try {
        actions = entries.flatMap((entry) => entry.files.map((file) => ({ path: file.path, result: removeOwnedConfig(readText(file.path), file) })));
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
    for (const { path, result } of actions) {
        if (result.kind === "missing")
            io.out(`  ℹ ${path} is already gone`);
        else if (args.dryRun)
            io.out(`  · would ${result.kind === "delete" ? "delete" : "update"} ${path}`);
        else if (result.kind === "delete") {
            rmSync(path, { force: true });
            io.out(`  ✓ deleted ${path}`);
        }
        else if (result.kind === "write") {
            writeFileSync(path, result.content);
            io.out(`  ✓ removed our entries from ${path}`);
        }
    }
    for (const run of entries.flatMap((entry) => entry.runs)) {
        if (run.undo === null)
            io.out(`  ▸ ${display(run.argv)} has no undo command; remove what it added by hand.`);
        else if (args.dryRun)
            io.out(`  · would ${args.run ? "run" : "print"}: ${display(run.undo)}`);
        else if (!run.ran)
            io.out(`  ▸ if you ran ${display(run.argv)}, undo it: ${display(run.undo)}`);
        else if (!args.run)
            io.out(`  ▸ run yourself: ${display(run.undo)}`);
        else {
            const failure = runVendor(run.undo, io.platform);
            if (failure === null)
                io.out(`  ✓ ran: ${display(run.undo)}`);
            else {
                io.err(`  ✗ ${display(run.undo)} failed (${failure}); run it yourself.`);
                status = 1;
            }
        }
    }
    if (args.dryRun) {
        io.out("\nDry run: nothing was removed.\n");
        return 0;
    }
    const next = { version: 1, entries: ledger.entries.filter((entry) => !mine(entry)) };
    saveLedger(io, next);
    pruneRuntimes(io.instinctsRoot, runtimesInUse(next));
    io.out(`\n${status === 0 ? "Done." : "Done with errors."}\n`);
    return status;
}
