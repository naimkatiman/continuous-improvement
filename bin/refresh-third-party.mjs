#!/usr/bin/env node
/**
 * Refresh vendored third-party snapshots.
 *
 * Reads pinned SHAs from third-party/MANIFEST.md and rerunns the documented
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
 *       unless --force is passed.
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
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { argv, cwd, exit, stderr, stdout } from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const MANIFEST_PATH = join(REPO_ROOT, "third-party", "MANIFEST.md");

/**
 * Per-snapshot config. Mirrors the bash recipe blocks in MANIFEST.md.
 * `manifestHeading` is the literal `### <heading>` text used to locate the
 * pinned SHA row in MANIFEST.md.
 */
const SNAPSHOTS = [
  {
    name: "oh-my-claudecode",
    manifestHeading: "oh-my-claudecode",
    upstream: "https://github.com/Yeachan-Heo/oh-my-claudecode.git",
    localPath: "third-party/oh-my-claudecode",
    selectiveDirs: [
      "agents",
      "skills",
      "missions",
      "templates",
      "examples",
      "hooks",
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
  },
  {
    name: "superpowers",
    manifestHeading: "obra/superpowers",
    upstream: "https://github.com/obra/superpowers.git",
    localPath: "third-party/superpowers",
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

function log(msg) {
  stdout.write(msg + "\n");
}
function err(msg) {
  stderr.write(msg + "\n");
}

function usage() {
  err(
    [
      "Usage:",
      "  node bin/refresh-third-party.mjs --list",
      "  node bin/refresh-third-party.mjs <name> --check",
      "  node bin/refresh-third-party.mjs <name> [--force]",
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
async function readPinnedSha(snapshot) {
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

function runGit(args, opts = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    ...opts,
  });
  if (result.error) {
    throw new Error(`git ${args.join(" ")} failed: ${result.error.message}`);
  }
  return result;
}

function gitOk(args, opts = {}) {
  const r = runGit(args, opts);
  if (r.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} exited ${r.status}: ${r.stderr || r.stdout}`,
    );
  }
  return r.stdout.trim();
}

/**
 * Shallow-clone upstream into a temp dir and return { dir, headSha }.
 */
async function shallowClone(upstream) {
  const dir = join(
    tmpdir(),
    `ci-refresh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  gitOk(["clone", "--depth", "1", upstream, dir]);
  const headSha = gitOk(["-C", dir, "rev-parse", "HEAD"]);
  return { dir, headSha };
}

async function pathExists(p) {
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
function localPathDirty(relPath) {
  const r = runGit(
    ["status", "--porcelain", "--", relPath],
    { cwd: REPO_ROOT },
  );
  if (r.status !== 0) {
    throw new Error(
      `git status failed for ${relPath}: ${r.stderr || r.stdout}`,
    );
  }
  return r.stdout.trim().length > 0;
}

async function deleteClaudeMdRecursive(root) {
  // Node-only equivalent of `find <root> -name CLAUDE.md -type f -delete`.
  const { readdir } = await import("node:fs/promises");
  const stack = [root];
  let deleted = 0;
  while (stack.length) {
    const dir = stack.pop();
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

async function checkOne(snapshot) {
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

async function refreshOne(snapshot, { force }) {
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
      `  status       : updated (${copiedDirs} dirs, ${copiedFiles} files, ${stripped} CLAUDE.md stripped)`,
    );
    if (diffStat.stdout.trim()) {
      log("  diff --stat  :");
      for (const line of diffStat.stdout.trimEnd().split(/\r?\n/)) {
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

async function listAll() {
  log("Configured third-party snapshots:");
  for (const s of SNAPSHOTS) {
    let pinned;
    try {
      pinned = await readPinnedSha(s);
    } catch (e) {
      pinned = `<error: ${e.message}>`;
    }
    log(`  - ${s.name}`);
    log(`      upstream  : ${s.upstream}`);
    log(`      localPath : ${s.localPath}`);
    log(`      pinnedSHA : ${pinned}`);
  }
}

function findSnapshot(name) {
  return SNAPSHOTS.find((s) => s.name === name);
}

async function main() {
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
  const check = args.includes("--check");
  const all = args.includes("--all");

  const positional = args.filter((a) => !a.startsWith("--"));

  let targets;
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
  let firstErr;
  for (const snap of targets) {
    try {
      if (check) {
        const ok = await checkOne(snap);
        if (!ok) allUpToDate = false;
      } else {
        await refreshOne(snap, { force });
      }
    } catch (e) {
      firstErr = firstErr || e;
      err(`[${snap.name}] ERROR: ${e.message}`);
      allUpToDate = false;
    }
  }

  if (firstErr) exit(1);
  if (check && !allUpToDate) exit(1);
  exit(0);
}

main().catch((e) => {
  err(`fatal: ${e.stack || e.message}`);
  exit(1);
});
