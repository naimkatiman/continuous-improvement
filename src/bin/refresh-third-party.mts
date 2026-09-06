#!/usr/bin/env node
/**
 * Refresh vendored third-party snapshots.
 *
 * Reads pinned SHAs from third-party/MANIFEST.md and reruns the documented
 * selective copy for each snapshot, in code, so refreshes are reproducible
 * across Windows / macOS / Linux without bash.
 *
 * The bash recipes in MANIFEST.md remain the authoritative human-readable
 * spec; this driver mirrors them. If you change the selective surface for
 * a snapshot, update MANIFEST.md and the SNAPSHOTS table below together.
 *
 * Usage:
 *   node bin/refresh-third-party.mjs --list
 *       List configured snapshots with their pinned SHAs.
 *
 *   node bin/refresh-third-party.mjs <name> --check
 *       Shallow-clone upstream, compare HEAD to the pinned SHA. No file writes.
 *
 *   node bin/refresh-third-party.mjs <name>
 *       Full refresh: shallow clone, verify HEAD matches the pinned SHA,
 *       wipe the local path, recreate it, copy the selective surface
 *       verbatim, strip every CLAUDE.md inside the snapshot, print a diff
 *       stat. Aborts if the local snapshot path has uncommitted changes
 *       unless --force is passed, and aborts BEFORE the wipe if upstream
 *       removed a skill this repo still routes to, unless --allow-stale-refs
 *       is passed. The two flags are separate on purpose: a dirty-tree
 *       refresh must not silently disable the stale-reference gate.
 *
 *   node bin/refresh-third-party.mjs --all
 *   node bin/refresh-third-party.mjs --all --check
 *       Same as above, applied to every configured snapshot in order.
 *
 *   node bin/refresh-third-party.mjs --help
 *       Print this usage block.
 *
 * Exit codes:
 *   0 — success (or --check found everything up-to-date)
 *   1 — refresh failed, dirty working tree without --force, or --check found drift
 *   2 — bad CLI usage / unknown snapshot name
 */
import { spawnSync, SpawnSyncOptions } from "node:child_process";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { argv, cwd, exit, stderr, stdout } from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const MANIFEST_PATH = join(REPO_ROOT, "third-party", "MANIFEST.md");

interface PostCopyJsonKeyDelete {
  file: string;
  keys: string[];
}

interface Snapshot {
  name: string;
  manifestHeading: string;
  upstream: string;
  localPath: string;
  /** Routing-table prefix for this plugin, e.g. `oh-my-claudecode:<skill>`. */
  routingPrefix: string;
  selectiveDirs: string[];
  selectiveFiles: string[];
  excludePostCopy?: string[];
  postCopyJsonKeyDeletes?: PostCopyJsonKeyDelete[];
}

/**
 * Per-snapshot config. Mirrors the bash recipe blocks in MANIFEST.md.
 * `manifestHeading` is the literal `### <heading>` text used to locate the
 * pinned SHA row in MANIFEST.md.
 */
const SNAPSHOTS: Snapshot[] = [
  {
    name: "oh-my-claudecode",
    manifestHeading: "oh-my-claudecode",
    upstream: "https://github.com/Yeachan-Heo/oh-my-claudecode.git",
    localPath: "third-party/oh-my-claudecode",
    routingPrefix: "oh-my-claudecode",
    selectiveDirs: [
      "agents",
      "skills",
      "missions",
      "templates",
      "examples",
      "docs",
      ".claude-plugin",
    ],
    selectiveFiles: [
      "LICENSE",
      "README.md",
      "AGENTS.md",
      "CHANGELOG.md",
      "SECURITY.md",
    ],
    // Defense in depth. After the selective copy, forcibly delete these
    // paths from the local snapshot. Encodes the "intentionally NOT
    // integrated" contract (OUR_NOTES.md item 2) in data, so a careless
    // future edit that adds "hooks" or "src" to selectiveDirs cannot
    // silently reintroduce the MODULE_NOT_FOUND bug: every entry in
    // OMC's hooks/hooks.json calls \$CLAUDE_PLUGIN_ROOT/scripts/run.cjs,
    // which lives under src/scripts/ — neither is vendored.
    excludePostCopy: ["hooks", "src/scripts"],
    // Packaging patches applied after the selective copy. For each entry,
    // load the JSON file, delete the listed top-level keys, write it back
    // pretty-printed. Use case: upstream's plugin.json points at runtime
    // files we exclude from vendoring (e.g. .mcp.json), so the pointers
    // resolve to missing files at install time. See OUR_NOTES.md item 3.
    postCopyJsonKeyDeletes: [
      { file: ".claude-plugin/plugin.json", keys: ["mcpServers"] },
    ],
  },
  {
    name: "superpowers",
    manifestHeading: "obra/superpowers",
    upstream: "https://github.com/obra/superpowers.git",
    localPath: "third-party/superpowers",
    routingPrefix: "superpowers",
    selectiveDirs: ["skills", "hooks", "docs", "assets", ".claude-plugin"],
    selectiveFiles: [
      "LICENSE",
      "README.md",
      "AGENTS.md",
      "CODE_OF_CONDUCT.md",
      "RELEASE-NOTES.md",
    ],
  },
];

const SHA_RE = /^[0-9a-f]{40}$/i;

function log(msg: string): void {
  stdout.write(msg + "\n");
}
function err(msg: string): void {
  stderr.write(msg + "\n");
}

function usage(): void {
  err(
    [
      "Usage:",
      "  node bin/refresh-third-party.mjs --list",
      "  node bin/refresh-third-party.mjs <name> --check",
      "  node bin/refresh-third-party.mjs <name> [--force] [--allow-stale-refs]",
      "  node bin/refresh-third-party.mjs --all [--check] [--force]",
      "  node bin/refresh-third-party.mjs --help",
      "",
      "Configured snapshots: " + SNAPSHOTS.map((s) => s.name).join(", "),
    ].join("\n"),
  );
}

/**
 * Parse the pinned SHA for a snapshot from MANIFEST.md.
 * Strategy: locate `### <heading>`, then the first table row in that
 * section beginning with `| Pinned SHA |`.
 */
async function readPinnedSha(snapshot: Snapshot): Promise<string> {
  const text = await readFile(MANIFEST_PATH, "utf8");
  const lines = text.split(/\r?\n/);
  const headingIdx = lines.findIndex(
    (line) => line.trim() === `### ${snapshot.manifestHeading}`,
  );
  if (headingIdx === -1) {
    throw new Error(
      `MANIFEST.md missing heading "### ${snapshot.manifestHeading}"`,
    );
  }
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("### ")) break;
    const m = line.match(/^\|\s*Pinned SHA\s*\|\s*`?([0-9a-fA-F]{7,40})`?\s*\|/);
    if (m) {
      const sha = m[1].toLowerCase();
      if (!SHA_RE.test(sha)) {
        throw new Error(
          `MANIFEST.md "${snapshot.manifestHeading}": pinned SHA "${sha}" is not a 40-char hex`,
        );
      }
      return sha;
    }
  }
  throw new Error(
    `MANIFEST.md "${snapshot.manifestHeading}": no "| Pinned SHA |" row found`,
  );
}

function runGit(args: string[], opts: SpawnSyncOptions = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    ...opts,
  });
  if (result.error) {
    throw new Error(`git ${args.join(" ")} failed: ${result.error.message}`);
  }
  return result;
}

function gitOk(args: string[], opts: SpawnSyncOptions = {}): string {
  const r = runGit(args, opts);
  if (r.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} exited ${r.status}: ${String(r.stderr || r.stdout)}`,
    );
  }
  return String(r.stdout).trim();
}

/**
 * Shallow-clone upstream into a temp dir and return { dir, headSha }.
 */
async function shallowClone(upstream: string): Promise<{ dir: string; headSha: string }> {
  const dir = join(
    tmpdir(),
    `ci-refresh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  gitOk(["clone", "--depth", "1", upstream, dir]);
  const headSha = gitOk(["-C", dir, "rev-parse", "HEAD"]);
  return { dir, headSha };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask git whether the local snapshot path has uncommitted changes.
 * Runs from REPO_ROOT so worktrees are handled correctly.
 */
function localPathDirty(relPath: string): boolean {
  const r = runGit(
    ["status", "--porcelain", "--", relPath],
    { cwd: REPO_ROOT },
  );
  if (r.status !== 0) {
    throw new Error(
      `git status failed for ${relPath}: ${String(r.stderr || r.stdout)}`,
    );
  }
  return String(r.stdout).trim().length > 0;
}

async function deleteClaudeMdRecursive(root: string): Promise<number> {
  // Node-only equivalent of `find <root> -name CLAUDE.md -type f -delete`.
  // (helpers for our own in-snapshot annotations are defined below)
  const { readdir } = await import("node:fs/promises");
  const stack: string[] = [root];
  let deleted = 0;
  while (stack.length) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
      } else if (ent.isFile() && ent.name === "CLAUDE.md") {
        await rm(full, { force: true });
        deleted++;
      }
    }
  }
  return deleted;
}

async function checkOne(snapshot: Snapshot): Promise<boolean> {
  const pinned = await readPinnedSha(snapshot);
  const { dir, headSha } = await shallowClone(snapshot.upstream);
  try {
    const upToDate = headSha.toLowerCase() === pinned.toLowerCase();
    log(`[${snapshot.name}]`);
    log(`  upstream     : ${snapshot.upstream}`);
    log(`  pinned SHA   : ${pinned}`);
    log(`  upstream HEAD: ${headSha}`);
    log(`  status       : ${upToDate ? "up-to-date" : "would-update"}`);
    return upToDate;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Flat-source files and directories that can name a companion skill. Deliberately
 * excludes `third-party/` — scanning the snapshot being replaced would match the
 * very copy we are about to overwrite and report every removal as still-referenced.
 * The `plugins/` tree is excluded too: it is a build mirror of these files.
 */
export const REFERENCE_SOURCES: readonly string[] = [
  "optional-companions.json",
  "skills",
  "commands",
  "scripts",
  join("src", "hooks"),
];

/** Skill directory names inside a snapshot, sorted. Empty if there is no skills/ dir. */
export function listSkillDirs(snapshotRoot: string): string[] {
  try {
    return readdirSync(join(snapshotRoot, "skills"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** Skills the old snapshot had that the incoming one does not. */
export function findRemovedSkills(oldSkills: string[], newSkills: string[]): string[] {
  const incoming = new Set(newSkills);
  return oldSkills.filter((s) => !incoming.has(s));
}

export interface StaleReference {
  skill: string;
  files: string[];
}

function walkFiles(abs: string, out: string[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(abs, e.name);
    if (e.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
}

/**
 * Removed skills that our own source still routes to, with the files naming them.
 *
 * This is the check that turns a refresh into a loud failure instead of a silent
 * one: when OMC 5.x deleted `ultrawork`, the snapshot became honest while our
 * routing table kept pointing at it, and every gate stayed green. Matching is on
 * the prefixed `<plugin>:<skill>` form with a boundary, so a bare English word
 * ("release", "review") in prose is not a false positive and `omc:ultrawork-plus`
 * does not match `omc:ultrawork`.
 */
export function findStaleReferences(
  repoRoot: string,
  routingPrefix: string,
  removedSkills: string[],
): StaleReference[] {
  if (removedSkills.length === 0) return [];

  const files: string[] = [];
  for (const rel of REFERENCE_SOURCES) {
    const abs = join(repoRoot, rel);
    let isDir = false;
    try {
      isDir = statSync(abs).isDirectory();
    } catch {
      continue;
    }
    if (isDir) walkFiles(abs, files);
    else files.push(abs);
  }

  const stale: StaleReference[] = [];
  for (const skill of removedSkills) {
    const re = new RegExp(
      `${escapeRegExp(routingPrefix)}:${escapeRegExp(skill)}(?![A-Za-z0-9_-])`,
    );
    const hits: string[] = [];
    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      if (re.test(text)) hits.push(relative(repoRoot, file));
    }
    if (hits.length > 0) stale.push({ skill, files: hits.sort() });
  }
  return stale;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Files inside a snapshot directory that we author, not upstream. The refresh
 * wipes the directory wholesale, so these have to be carried across it by hand.
 * `OUR_NOTES.md` is the drift radar the vendoring contract requires;
 * `.fork-only-skills.txt` is the allowlist the Skills Drift Check subtracts.
 */
export const OUR_FILES: readonly string[] = ["OUR_NOTES.md", ".fork-only-skills.txt"];

/** Read whichever of OUR_FILES exist under `localAbs`. Absent files are skipped. */
export async function readOurFiles(localAbs: string): Promise<Map<string, Buffer>> {
  const saved = new Map<string, Buffer>();
  for (const name of OUR_FILES) {
    try {
      saved.set(name, await readFile(join(localAbs, name)));
    } catch {
      // Not every snapshot carries every one of these; absence is normal.
    }
  }
  return saved;
}

/** Write the captured files back under `localAbs`. Returns how many were restored. */
export async function restoreOurFiles(
  localAbs: string,
  saved: Map<string, Buffer>,
): Promise<number> {
  for (const [name, body] of saved) await writeFile(join(localAbs, name), body);
  return saved.size;
}

async function refreshOne(
  snapshot: Snapshot,
  { force, allowStaleRefs }: { force: boolean; allowStaleRefs: boolean },
): Promise<true> {
  const pinned = await readPinnedSha(snapshot);
  const localAbs = join(REPO_ROOT, snapshot.localPath);

  if (!force && (await pathExists(localAbs))) {
    if (localPathDirty(snapshot.localPath)) {
      throw new Error(
        `local snapshot path "${snapshot.localPath}" has uncommitted changes; ` +
          `commit/stash first, or rerun with --force`,
      );
    }
  }

  const { dir, headSha } = await shallowClone(snapshot.upstream);
  try {
    if (headSha.toLowerCase() !== pinned.toLowerCase()) {
      throw new Error(
        `[${snapshot.name}] upstream HEAD ${headSha} != pinned ${pinned}; ` +
          `bump the pinned SHA in third-party/MANIFEST.md first`,
      );
    }

    // Refuse to land a snapshot that would make our own routing table lie.
    // When OMC 5.x deleted `ultrawork`, refreshing made the snapshot honest while
    // optional-companions.json, two skills/superpowers.md tables and the
    // companion-preference OVERRIDES map kept naming it — and every gate stayed
    // green, because nothing compared the two. Checked BEFORE the wipe, so a
    // failure leaves the snapshot untouched and the operator retargets first.
    const removedSkills = findRemovedSkills(listSkillDirs(localAbs), listSkillDirs(dir));
    const staleRefs = findStaleReferences(REPO_ROOT, snapshot.routingPrefix, removedSkills);
    if (staleRefs.length > 0) {
      const detail = staleRefs
        .map((r) => `    ${snapshot.routingPrefix}:${r.skill}\n      ${r.files.join("\n      ")}`)
        .join("\n");
      const message =
        `[${snapshot.name}] upstream removed ${staleRefs.length} skill(s) this repo still routes to:\n${detail}\n` +
        `  Retarget or drop these references first, then re-run the refresh. ` +
        `Pass --allow-stale-refs to land the snapshot anyway and fix them afterwards.`;
      if (!allowStaleRefs) throw new Error(message);
      err(`  WARNING: ${message}`);
    }

    // Our own annotations live inside the snapshot directory, so the wipe below
    // destroys them along with the upstream copy. That silently deleted
    // OUR_NOTES.md on both the superpowers (#304) and oh-my-claudecode (#308)
    // refreshes — the drift radar, removed by the tool whose drift it records.
    // Capture before the wipe, put back after the copy.
    const ourFiles = await readOurFiles(localAbs);

    // Wipe + recreate destination.
    await rm(localAbs, { recursive: true, force: true });
    await mkdir(localAbs, { recursive: true });

    // Copy selective directories.
    let copiedDirs = 0;
    for (const d of snapshot.selectiveDirs) {
      const src = join(dir, d);
      if (!(await pathExists(src))) {
        throw new Error(
          `[${snapshot.name}] expected directory "${d}" missing in upstream`,
        );
      }
      await cp(src, join(localAbs, d), { recursive: true });
      copiedDirs++;
    }
    // Copy selective top-level files.
    let copiedFiles = 0;
    for (const f of snapshot.selectiveFiles) {
      const src = join(dir, f);
      if (!(await pathExists(src))) {
        throw new Error(
          `[${snapshot.name}] expected file "${f}" missing in upstream`,
        );
      }
      await cp(src, join(localAbs, f));
      copiedFiles++;
    }

    // Strip every CLAUDE.md (auto-loads as session context).
    const stripped = await deleteClaudeMdRecursive(localAbs);

    // Put our annotations back. After the CLAUDE.md strip, so a snapshot that
    // ever carries an OUR_* named CLAUDE.md is not re-deleted; before the diff
    // stat, so the printed diff reflects what actually landed on disk.
    const preserved = await restoreOurFiles(localAbs, ourFiles);

    // Defense in depth: forcibly delete excludePostCopy paths from the
    // local snapshot, regardless of whether they were copied. Guards
    // against silent regressions if selectiveDirs is later edited to
    // include a path that the snapshot has explicitly opted out of.
    let excluded = 0;
    for (const p of snapshot.excludePostCopy ?? []) {
      const target = join(localAbs, p);
      if (await pathExists(target)) {
        await rm(target, { recursive: true, force: true });
        excluded++;
      }
    }

    // Packaging patches: drop named top-level keys from JSON files.
    // For pointers to runtime files we exclude from vendoring (e.g.
    // plugin.json's "mcpServers" → ".mcp.json"), leaving the key in
    // would let Claude Code's loader resolve a missing file on every
    // install. One-key minimal mutation; all other fields stay verbatim.
    let patchedKeys = 0;
    for (const patch of snapshot.postCopyJsonKeyDeletes ?? []) {
      const target = join(localAbs, patch.file);
      if (!(await pathExists(target))) {
        throw new Error(
          `[${snapshot.name}] postCopyJsonKeyDeletes: file "${patch.file}" missing after copy`,
        );
      }
      const text = await readFile(target, "utf8");
      const obj = JSON.parse(text) as Record<string, unknown>;
      let changed = false;
      for (const key of patch.keys) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          delete obj[key];
          changed = true;
          patchedKeys++;
        }
      }
      if (changed) {
        await writeFile(target, JSON.stringify(obj, null, 2) + "\n", "utf8");
      }
    }

    // Print git diff stat scoped to the snapshot path.
    const diffStat = runGit(
      ["diff", "--stat", "--", snapshot.localPath],
      { cwd: REPO_ROOT },
    );
    log(`[${snapshot.name}]`);
    log(`  upstream     : ${snapshot.upstream}`);
    log(`  pinned SHA   : ${pinned}`);
    log(`  upstream HEAD: ${headSha}`);
    log(
      `  status       : updated (${copiedDirs} dirs, ${copiedFiles} files, ${stripped} CLAUDE.md stripped, ${preserved} of ours preserved, ${excluded} excluded paths removed, ${patchedKeys} json keys patched)`,
    );
    if (String(diffStat.stdout).trim()) {
      log("  diff --stat  :");
      for (const line of String(diffStat.stdout).trimEnd().split(/\r?\n/)) {
        log(`    ${line}`);
      }
    } else {
      log("  diff --stat  : (no working-tree change)");
    }
    return true;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function listAll(): Promise<void> {
  log("Configured third-party snapshots:");
  for (const s of SNAPSHOTS) {
    let pinned: string;
    try {
      pinned = await readPinnedSha(s);
    } catch (e: unknown) {
      pinned = `<error: ${(e as Error).message}>`;
    }
    log(`  - ${s.name}`);
    log(`      upstream  : ${s.upstream}`);
    log(`      localPath : ${s.localPath}`);
    log(`      pinnedSHA : ${pinned}`);
  }
}

function findSnapshot(name: string): Snapshot | undefined {
  return SNAPSHOTS.find((s) => s.name === name);
}

async function main(): Promise<void> {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    usage();
    exit(args.length === 0 ? 2 : 0);
  }

  if (args.includes("--list")) {
    await listAll();
    exit(0);
  }

  const force = args.includes("--force");
  // Deliberately NOT --force: that means "my tree is dirty, proceed", and a
  // routine dirty-tree refresh must not silently switch off the stale-reference
  // gate as a side effect.
  const allowStaleRefs = args.includes("--allow-stale-refs");
  const check = args.includes("--check");
  const all = args.includes("--all");

  const positional = args.filter((a) => !a.startsWith("--"));

  let targets: Snapshot[];
  if (all) {
    targets = SNAPSHOTS;
  } else if (positional.length === 1) {
    const snap = findSnapshot(positional[0]);
    if (!snap) {
      err(
        `Unknown snapshot "${positional[0]}". Known: ${SNAPSHOTS.map((s) => s.name).join(", ")}`,
      );
      exit(2);
    }
    targets = [snap];
  } else {
    usage();
    exit(2);
  }

  let allUpToDate = true;
  let firstErr: Error | undefined;
  for (const snap of targets) {
    try {
      if (check) {
        const ok = await checkOne(snap);
        if (!ok) allUpToDate = false;
      } else {
        await refreshOne(snap, { force, allowStaleRefs });
      }
    } catch (e: unknown) {
      firstErr = firstErr || (e as Error);
      err(`[${snap.name}] ERROR: ${(e as Error).message}`);
      allUpToDate = false;
    }
  }

  if (firstErr) exit(1);
  if (check && !allUpToDate) exit(1);
  exit(0);
}

// Only run the CLI when invoked as one. Without this, importing the module to
// test its helpers would start a refresh. Same shape as the other bin/ scripts:
// the endsWith fallback covers Windows, where argv[1] is a backslash path and
// never equals the forward-slash file:// URL.
const invokedDirectly =
  argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("refresh-third-party.mjs")) {
  main().catch((e: unknown) => {
    err(`fatal: ${(e as Error).stack || (e as Error).message}`);
    exit(1);
  });
}
