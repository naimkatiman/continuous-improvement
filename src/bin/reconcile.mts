#!/usr/bin/env node

/**
 * reconcile (`ci-reconcile`).
 *
 * Run the `reconcile` skill's ground-truth pass and print the resolved-state
 * block, so Law 1 is a command an agent runs rather than prose it claims to
 * have followed.
 *
 *   node bin/reconcile.mjs                    resolved-state block; exit 1 on a blocker
 *   node bin/reconcile.mjs --json             the same state as JSON
 *   node bin/reconcile.mjs --snapshot         one-line envelope, field-compatible
 *                                             with scripts/git-state-snapshot.sh
 *   node bin/reconcile.mjs --verify-push <br> prove a push landed on origin/<br>
 *   node bin/reconcile.mjs --explain          print the probe set and why each runs
 *   node bin/reconcile.mjs --cwd <dir>        run against another repo root
 *
 * Portability: every probe is `git` argv spawned with `shell: false`. No bash,
 * no coreutils, no `.git/`-relative paths — so it behaves the same in PowerShell,
 * cmd, Git Bash, WSL and a POSIX shell, and it stays correct inside a linked
 * worktree where `.git` is a file rather than a directory.
 *
 * Exit codes:
 *   0 — ground truth established, nothing blocks a mutation
 *   1 — at least one blocker (detached HEAD, in-progress op, unknown upstream)
 *   2 — not a git repository, or git is unavailable
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { argv, cwd, exit, stderr, stdout } from "node:process";

import {
  GROUND_TRUTH_PROBES,
  IN_PROGRESS_MARKERS,
  accountDirty,
  assessGitState,
  classifyHead,
  classifyUpstream,
  hasBlockers,
  isSafeRefName,
  parseRevListCounts,
  renderResolvedState,
  verifyPushLanded,
  type GitStateFinding,
} from "../lib/git-state.mjs";

interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

interface Options {
  json: boolean;
  snapshot: boolean;
  explain: boolean;
  verifyPush: string | null;
  root: string;
}

const NOT_A_REPO = 2;

/** Spawn `git` with no shell. A missing git binary reads as a failed probe. */
function git(args: readonly string[], root: string): GitResult {
  const result = spawnSync("git", [...args], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.error) {
    return { stdout: "", stderr: result.error.message, code: 127 };
  }
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    code: typeof result.status === "number" ? result.status : 1,
  };
}

function parseArgs(args: readonly string[]): Options {
  const options: Options = {
    json: false,
    snapshot: false,
    explain: false,
    verifyPush: null,
    root: cwd(),
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--json") options.json = true;
    else if (arg === "--snapshot") options.snapshot = true;
    else if (arg === "--explain") options.explain = true;
    else if (arg === "--verify-push") {
      const value = args[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--verify-push requires a branch name");
      }
      if (!isSafeRefName(value)) {
        throw new Error(`--verify-push branch is not a usable ref name: ${value}`);
      }
      options.verifyPush = value;
      i++;
    } else if (arg === "--cwd") {
      const value = args[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--cwd requires a directory");
      }
      options.root = value;
      i++;
    } else if (arg === "--help" || arg === "-h") {
      options.explain = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

/** Probe each in-progress marker through `--git-path`, which is worktree-correct. */
function probeInProgress(root: string): string[] {
  const present: string[] = [];
  for (const marker of IN_PROGRESS_MARKERS) {
    const resolved = git(["rev-parse", "--git-path", marker.gitPath], root);
    // A failed resolve leaves the marker unprobed rather than absent; the
    // classifier reports that explicitly instead of implying a clean tree.
    if (resolved.code !== 0) continue;
    const path = resolved.stdout.trim();
    if (path.length > 0 && existsSync(path)) present.push(marker.id);
  }
  return present;
}

function explain(): string {
  const rows = GROUND_TRUTH_PROBES.map(
    (probe) =>
      `  git ${probe.args.join(" ")}\n      ${probe.purpose}` +
      (probe.tolerateFailure ? "\n      (a non-zero exit is an answer, not a failure)" : ""),
  );
  const markers = IN_PROGRESS_MARKERS.map(
    (marker) => `  git rev-parse --git-path ${marker.gitPath}   # ${marker.label}`,
  );
  return [
    "reconcile ground-truth probes (source: src/lib/git-state.mts):",
    ...rows,
    "",
    "in-progress operation markers:",
    ...markers,
  ].join("\n");
}

function main(): void {
  let options: Options;
  try {
    options = parseArgs(argv.slice(2));
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    exit(NOT_A_REPO);
    return;
  }

  if (options.explain) {
    stdout.write(`${explain()}\n`);
    exit(0);
    return;
  }

  const root = git(["rev-parse", "--show-toplevel"], options.root);
  if (root.code !== 0) {
    if (options.snapshot) {
      stdout.write('{"error":"not-a-git-repo"}\n');
    } else {
      stderr.write("not a git repository (or git is unavailable)\n");
    }
    exit(NOT_A_REPO);
    return;
  }
  const repoRoot = root.stdout.trim();

  const headSha = git(["rev-parse", "HEAD"], options.root);
  const branchProbe = git(["symbolic-ref", "--quiet", "--short", "HEAD"], options.root);
  const head = classifyHead(branchProbe.stdout, branchProbe.code);

  const upstreamProbe = git(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    options.root,
  );
  const upstreamRef = upstreamProbe.code === 0 ? upstreamProbe.stdout.trim() || null : null;

  // Only ask for counts once an upstream is known to exist — the bare command
  // exits 128 with `fatal: no upstream configured` otherwise.
  const countsProbe =
    upstreamRef === null
      ? null
      : git(["rev-list", "--left-right", "--count", "@{u}...HEAD"], options.root);
  const counts =
    countsProbe !== null && countsProbe.code === 0
      ? parseRevListCounts(countsProbe.stdout)
      : null;

  const status = git(["status", "--porcelain=v1"], options.root);
  const drift = git(["diff", "--name-only", "--ignore-all-space"], options.root);
  const dirty = accountDirty(
    status.code === 0 ? status.stdout : null,
    drift.code === 0 ? drift.stdout : null,
  );

  if (options.snapshot) {
    // Field-compatible with scripts/git-state-snapshot.sh, plus `contentDrift`
    // and `inProgress`, which the shell version cannot report.
    const upstreamSha =
      upstreamRef === null ? "none" : git(["rev-parse", "--short", "@{u}"], options.root).stdout.trim() || "none";
    stdout.write(
      `${JSON.stringify({
        head: git(["rev-parse", "--short", "HEAD"], options.root).stdout.trim(),
        upstream: upstreamSha,
        dirty: dirty.reported,
        root: repoRoot,
        branch: head.branch ?? "detached",
        contentDrift: dirty.contentDrift,
        inProgress: probeInProgress(options.root),
      })}\n`,
    );
    exit(0);
    return;
  }

  if (options.verifyPush !== null) {
    const lsRemote = git(
      ["ls-remote", "origin", `refs/heads/${options.verifyPush}`],
      options.root,
    );
    const verdict = verifyPushLanded({
      localHead: headSha.stdout.trim(),
      lsRemoteStdout: lsRemote.stdout,
      lsRemoteExitCode: lsRemote.code,
    });
    const line = `push ${options.verifyPush}: ${verdict.verdict} — ${verdict.reason}`;
    if (options.json) stdout.write(`${JSON.stringify({ branch: options.verifyPush, ...verdict })}\n`);
    else stdout.write(`${line}\n`);
    exit(verdict.verdict === "landed" ? 0 : 1);
    return;
  }

  const inProgress = probeInProgress(options.root);
  const findings: GitStateFinding[] = assessGitState({
    head,
    upstreamRef,
    counts,
    inProgress,
    dirty,
  });

  const stashes = git(["stash", "list"], options.root);
  const stashCount =
    stashes.code === 0
      ? stashes.stdout.split(/\r?\n/).filter((line) => line.trim().length > 0).length
      : null;
  findings.push({
    id: "stashes",
    label: "stashes",
    detail:
      stashCount === null
        ? "unprobed"
        : stashCount === 0
          ? "none"
          : `${stashCount} — may hold uncommitted work from an earlier session`,
    severity: stashCount === null ? "warn" : "ok",
  });

  const worktrees = git(["worktree", "list", "--porcelain"], options.root);
  const worktreeCount =
    worktrees.code === 0
      ? worktrees.stdout.split(/\r?\n/).filter((line) => line.startsWith("worktree ")).length
      : null;
  findings.push({
    id: "worktrees",
    label: "worktrees",
    detail:
      worktreeCount === null
        ? "unprobed"
        : worktreeCount <= 1
          ? "1 (this one)"
          : `${worktreeCount} — a concurrent writer may hold another; re-read HEAD immediately before each mutation`,
    severity: worktreeCount === null || (worktreeCount ?? 0) > 1 ? "warn" : "ok",
  });

  const blocked = hasBlockers(findings);

  if (options.json) {
    stdout.write(
      `${JSON.stringify(
        {
          root: repoRoot,
          head: headSha.stdout.trim(),
          branch: head.branch,
          headKind: head.kind,
          upstream: upstreamRef,
          relation: classifyUpstream(counts, upstreamRef !== null),
          counts,
          inProgress,
          dirty,
          stashes: stashCount,
          worktrees: worktreeCount,
          findings,
          blocked,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    stdout.write(`${renderResolvedState(findings)}\n`);
    if (blocked) {
      stdout.write("\nBLOCKED — resolve every blocker above before mutating this tree.\n");
    }
  }
  exit(blocked ? 1 : 0);
}

const invokedDirectly =
  argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("reconcile.mjs")) {
  main();
}
