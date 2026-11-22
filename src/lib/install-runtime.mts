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

import { type SpawnSyncOptionsWithStringEncoding, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  type HookArgs,
  type InstallPlan,
  type Ledger,
  type LedgerEntry,
  type PlannedRun,
  type RemoveResult,
  parseLedger,
  planAgentInstall,
  recordInstall,
  removeOwnedConfig,
  runtimesInUse,
  toLedgerFile,
} from "./agent-install-plans.mjs";
import { planTargetWrites } from "./install-targets.mjs";

/** What a runtime needs: the hooks, the bins and their lib, and what the MCP server reads beside them. */
const RUNTIME_PARTS: readonly string[] = ["hooks", "bin", "lib", "instinct-packs", join("templates", "planning-with-files"), "package.json"];

const slash = (path: string): string => path.replace(/\\/g, "/");

export function runtimeDir(instinctsRoot: string, version: string): string {
  return join(instinctsRoot, "runtime", version);
}

/** Copies the runtime for `version` into place and returns its dir. A failed copy leaves the old one untouched. */
export function installRuntime(packageRoot: string, instinctsRoot: string, version: string): string {
  if (!/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(version)) throw new Error(`Refusing runtime version ${JSON.stringify(version)}`);
  const base = join(instinctsRoot, "runtime");
  mkdirSync(base, { recursive: true });
  const staging = mkdtempSync(join(base, `.staging-${version}-`));
  const dest = runtimeDir(instinctsRoot, version);
  try {
    for (const part of RUNTIME_PARTS) {
      const source = join(packageRoot, part);
      if (!existsSync(source)) throw new Error(`The package has no ${part} to copy (${source})`);
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
    } catch (error) {
      renameSync(old, dest);
      throw error;
    }
    rmSync(old, { recursive: true, force: true });
    return dest;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * Removes each runtime version dir the ledger has recorded (`ledger.runtimes`)
 * that no entry uses and that is not `current`. A dir the ledger never
 * recorded stays: a config written outside the ledger may still point at it.
 * Only direct children of <instincts root>/runtime/ are candidates, whatever
 * the ledger says. Best effort: one in use stays.
 */
export function pruneRuntimes(instinctsRoot: string, ledger: Ledger, current: string | null): void {
  const base = join(instinctsRoot, "runtime");
  const recorded = new Set(ledger.runtimes.map(slash));
  const keep = runtimesInUse(ledger);
  for (const name of listDir(base)) {
    const dir = join(base, name);
    if (name.startsWith(".") || !recorded.has(slash(dir)) || keep.has(slash(dir)) || slash(dir) === current) continue;
    try {
      if (statSync(dir).isDirectory()) rmSync(dir, { recursive: true, force: true });
    } catch {
      // a runtime an agent still holds open is left for the next install
    }
  }
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }
}

function listDir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

export interface HookRunIo {
  home: string;
  projectRoot: string;
  packageRoot: string;
  version: string;
  platform: string;
  env: Readonly<Record<string, string | undefined>>;
  instinctsRoot: string;
  /** resolveDocumentsDir(platform), or a stand-in; asked at most once per install. */
  documentsDir: () => string | null;
  skillMd: () => string;
  out: (line: string) => void;
  err: (line: string) => void;
}

type ParsedArgs = Extract<HookArgs, { mode: "install" | "uninstall" }>;

const SAFE_ARG = /^[\w\-./:=@\\]+$/;
const display = (argv: readonly string[]): string => argv.map((arg) => (SAFE_ARG.test(arg) ? arg : JSON.stringify(arg))).join(" ");

// A vendor CLI is usually a .cmd shim on Windows, which only cmd.exe starts.
// `cwd` is the project root for a project-scope command: `grok mcp add --scope
// project` and `devin mcp add -s project` write relative to their cwd.
function runVendor(argv: readonly string[], platform: string, cwd: string | null): string | null {
  const options: SpawnSyncOptionsWithStringEncoding = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...(cwd === null ? {} : { cwd }) };
  const result = platform === "win32"
    ? spawnSync(argv.map((arg) => (SAFE_ARG.test(arg) ? arg : `"${arg.replace(/"/g, '""')}"`)).join(" "), { ...options, shell: true })
    : spawnSync(argv[0]!, argv.slice(1), options);
  if (result.error) return result.error.message;
  return result.status === 0 ? null : `exit ${result.status}: ${(result.stderr || result.stdout || "").trim().split(/\r?\n/)[0] ?? ""}`;
}

// The Documents folder the way Windows resolves it, which follows a OneDrive
// Known Folder Move; Cline's VS Code extension finds its global hooks dir the
// same way (getDocumentsPath()). Off Windows, or when PowerShell fails or
// reports nothing usable, null: the planner then falls back to ~/Documents and
// says so. Stdout is forced to UTF-8 so a non-ASCII user name survives.
export function resolveDocumentsDir(platform: string): string | null {
  if (platform !== "win32") return null;
  const result = spawnSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Environment]::GetFolderPath('MyDocuments')",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000, windowsHide: true });
  const dir = result.status === 0 ? (result.stdout ?? "").replace(/^﻿/, "").trim() : "";
  return /^[A-Za-z]:[\\/]/.test(dir) && !/[\r\n]/.test(dir) ? dir : null;
}

function once<T>(fn: () => T): () => T {
  let done = false;
  let value: T;
  return () => {
    if (!done) {
      value = fn();
      done = true;
    }
    return value;
  };
}

function ledgerFile(io: HookRunIo): string {
  return join(io.instinctsRoot, "global", "install-ledger.json");
}

function loadLedger(io: HookRunIo): Ledger | null {
  const ledger = parseLedger(readText(ledgerFile(io)));
  if (ledger === null) io.err(`  ✗ ${slash(ledgerFile(io))} is not a valid install ledger; fix or move it and rerun. Nothing was changed.`);
  return ledger;
}

function saveLedger(io: HookRunIo, ledger: Ledger): void {
  mkdirSync(dirname(ledgerFile(io)), { recursive: true });
  writeFileSync(ledgerFile(io), `${JSON.stringify(ledger, null, 2)}\n`);
}

// `mode`: a hook script the agent executes directly (Cline's sh hook) needs the exec bit.
function writeFile(path: string, content: string, mode?: number): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  if (mode !== undefined) chmodSync(path, mode);
}

/**
 * Writes one agent's config files, then saves `ledger` (which records them),
 * and returns it. If a write or the save fails, every file already written is
 * put back as it was (a created one is deleted) before the error is rethrown.
 */
function writeRecorded(io: HookRunIo, plan: InstallPlan, ledger: Ledger): Ledger {
  const written: Array<{ path: string; previous: string | null }> = [];
  try {
    for (const write of plan.writes) {
      const previous = readText(write.path);
      writeFile(write.path, write.content, write.mode);
      written.push({ path: write.path, previous });
      io.out(`  ✓ ${plan.agent} → ${write.path}`);
    }
    saveLedger(io, ledger);
    return ledger;
  } catch (error) {
    for (const { path, previous } of written.reverse()) {
      try {
        if (previous === null) rmSync(path, { force: true });
        else writeFileSync(path, previous);
        io.err(`  ↺ ${plan.agent}: put back ${path}`);
      } catch {
        io.err(`  ✗ ${plan.agent}: could not put back ${path}; remove the continuous-improvement entries from it by hand.`);
      }
    }
    throw error;
  }
}

function printPlanText(io: HookRunIo, plan: InstallPlan): void {
  for (const step of plan.printed) io.out(`  ▸ ${step.replace(/\n/g, "\n    ")}`);
  for (const note of plan.notes) io.out(`  ℹ ${note}`);
  for (const warning of plan.warnings) io.out(`  ! ${warning}`);
}

export function runHookInstall(args: ParsedArgs, io: HookRunIo): number {
  const rt = slash(runtimeDir(io.instinctsRoot, io.version));
  const ledger = loadLedger(io);
  if (ledger === null) return 1;
  const documentsDir = once(io.documentsDir);
  const plans = args.agents.map((agent) => planAgentInstall(agent, {
    scope: args.scope, runtimeDir: rt, projectRoot: io.projectRoot, home: io.home, platform: io.platform, env: io.env,
    failClosed: args.failClosed, read: readText, listDir, documentsDir,
  }));
  const failed = plans.filter((plan) => plan.error !== undefined);
  if (failed.length > 0) {
    for (const plan of failed) io.err(`  ✗ ${plan.agent}: ${plan.error}`);
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
    for (const { target, plan } of rules) for (const write of plan.writes) io.out(`  · would write ${write.relPath} (${target} rules)`);
    for (const plan of plans) {
      for (const write of plan.writes) io.out(`  · would ${write.created ? "create" : "update"} ${write.path} (${plan.agent})`);
      for (const run of plan.runs) io.out(args.run ? `  · would run: ${display(run.argv)}` : `  ▸ run yourself: ${display(run.argv)}`);
      printPlanText(io, plan);
    }
    io.out("\nDry run: nothing was written.\n");
    return 0;
  }

  let status = 0;
  let next = ledger;
  const recorded: string[] = [];
  // A project-scope vendor command runs in the project root, where it writes its project config.
  const runCwd = args.scope === "project" ? slash(io.projectRoot) : null;
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
      const entry: LedgerEntry = {
        target: plan.agent, scope: args.scope, project: args.scope === "project" ? slash(io.projectRoot) : null, version: io.version, runtime: rt,
        installedAt: new Date().toISOString(),
        files: plan.writes.map(toLedgerFile),
        runs: plan.runs.map((run: PlannedRun) => ({ ...run, ran: false, cwd: runCwd })),
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
        if (failure === null) io.out(`  ✓ ran: ${display(run.argv)}`);
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
  } catch (error) {
    io.err(`  ✗ Install failed: ${error instanceof Error ? error.message : String(error)}`);
    if (recorded.length > 0) io.err(`  ℹ ${recorded.join(", ")} installed and recorded before the failure; \`--uninstall --target ${recorded.join(",")}\` removes them.`);
    return 1;
  }
  pruneRuntimes(io.instinctsRoot, next, rt);
  io.out(`  ✓ ledger → ${slash(ledgerFile(io))}\n\n${status === 0 ? "Done." : "Done with errors."}\n`);
  return status;
}

export function runHookUninstall(args: ParsedArgs, io: HookRunIo): number {
  const ledger = loadLedger(io);
  if (ledger === null) return 1;
  const project = slash(io.projectRoot);
  const mine = (entry: LedgerEntry): boolean =>
    args.agents.includes(entry.target) && entry.scope === args.scope && (args.scope === "user" || entry.project === project);
  const entries = ledger.entries.filter(mine);
  io.out(`\ncontinuous-improvement agent uninstall (scope: ${args.scope}${args.dryRun ? ", dry run" : ""})\n`);
  if (entries.length === 0) {
    io.out(`  Nothing recorded for ${args.agents.join(", ")} (scope: ${args.scope}) in ${slash(ledgerFile(io))}.\n`);
    return 0;
  }
  let actions: Array<{ path: string; result: RemoveResult }>;
  try {
    actions = entries.flatMap((entry) => entry.files.map((file) => ({ path: file.path, result: removeOwnedConfig(readText(file.path), file) })));
  } catch (error) {
    io.err(`  ✗ ${error instanceof Error ? error.message : String(error)}
Nothing was removed.`);
    return 1;
  }
  const errors = actions.filter(({ result }) => result.kind === "error");
  if (errors.length > 0) {
    for (const { result } of errors) io.err(`  ✗ ${result.kind === "error" ? result.message : ""}`);
    io.err("Nothing was removed.");
    return 1;
  }
  let status = 0;
  for (const { path, result } of actions) {
    if (result.kind === "missing") io.out(`  ℹ ${path} is already gone`);
    else if (args.dryRun) io.out(`  · would ${result.kind === "delete" ? "delete" : "update"} ${path}`);
    else if (result.kind === "delete") {
      rmSync(path, { force: true });
      io.out(`  ✓ deleted ${path}`);
    } else if (result.kind === "write") {
      writeFileSync(path, result.content);
      io.out(`  ✓ removed our entries from ${path}`);
    }
  }
  for (const run of entries.flatMap((entry) => entry.runs)) {
    if (run.undo === null) io.out(`  ▸ ${display(run.argv)} has no undo command; remove what it added by hand.`);
    else if (args.dryRun) io.out(`  · would ${args.run ? "run" : "print"}: ${display(run.undo)}`);
    else if (!run.ran) io.out(`  ▸ if you ran ${display(run.argv)}, undo it: ${display(run.undo)}`);
    else if (!args.run) io.out(`  ▸ run yourself: ${display(run.undo)}`);
    else {
      const failure = runVendor(run.undo, io.platform, run.cwd);
      if (failure === null) io.out(`  ✓ ran: ${display(run.undo)}`);
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
  const next: Ledger = { version: 1, entries: ledger.entries.filter((entry) => !mine(entry)), runtimes: ledger.runtimes };
  saveLedger(io, next);
  pruneRuntimes(io.instinctsRoot, next, null);
  io.out(`\n${status === 0 ? "Done." : "Done with errors."}\n`);
  return status;
}
