/**
 * bin/reconcile.mjs — end-to-end boundary tests against real temp repos.
 *
 * Each case reproduces a state where the pre-2026-08-02 documented procedure
 * gave a wrong or silent answer, and asserts the runner now reports it:
 *   - no configured upstream  (the bare rev-list probe exits 128)
 *   - detached HEAD           (branch --show-current prints "" and exits 0)
 *   - linked worktree mid-merge (`.git` is a file; a .git/-relative probe
 *                                exits 2 exactly as on a clean tree)
 *
 * The CLI is spawned, never imported, so the exit-code contract is what is
 * actually under test. Every fixture lives in a temp dir and is removed after.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, it } from "node:test";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const CLI = join(REPO_ROOT, "bin", "reconcile.mjs");
const SNAPSHOT_SH = join(REPO_ROOT, "scripts", "git-state-snapshot.sh");

/** Fields the shell snapshot documents; the Node envelope must stay a superset. */
const SHELL_ENVELOPE_FIELDS = ["head", "upstream", "dirty", "root", "branch"] as const;

const BASH_SKIP: string | false = (() => {
  const probe = spawnSync("bash", ["-c", "exit 0"], { encoding: "utf8" });
  return probe.error || probe.status !== 0 ? "bash is not available on this host" : false;
})();

function git(root: string, ...args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "pipe" });
}

/** A temp repo with one commit, no remote, and therefore no upstream. */
function setupRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "ci-reconcile-"));
  git(root, "init", "--quiet", "--initial-branch=work");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  git(root, "config", "commit.gpgsign", "false");
  writeFileSync(join(root, "file.txt"), "one\n");
  git(root, "add", "file.txt");
  git(root, "commit", "--quiet", "-m", "init");
  return root;
}

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function run(cwd: string, ...args: string[]): RunResult {
  const result = spawnSync(process.execPath, [CLI, "--cwd", cwd, ...args], {
    encoding: "utf8",
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("bin/reconcile.mjs — no configured upstream", () => {
  it("warns and exits 0 instead of failing on `fatal: no upstream configured`", () => {
    const root = setupRepo();
    try {
      const result = run(root);
      assert.equal(result.status, 0);
      assert.match(result.stdout, /no configured upstream/);
      assert.doesNotMatch(result.stdout, /BLOCKED/);
      assert.doesNotMatch(result.stderr, /fatal/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("bin/reconcile.mjs — detached HEAD", () => {
  it("blocks with exit 1 rather than reading an empty branch name as success", () => {
    const root = setupRepo();
    try {
      git(root, "checkout", "--quiet", "--detach", "HEAD");
      const result = run(root);
      assert.equal(result.status, 1);
      assert.match(result.stdout, /BLOCKER/);
      assert.match(result.stdout, /detached/);
      assert.match(result.stdout, /BLOCKED/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("bin/reconcile.mjs — linked worktree with a merge in progress", () => {
  it("detects the merge that a .git-relative probe cannot see", () => {
    const root = setupRepo();
    const worktree = `${root}-wt`;
    try {
      writeFileSync(join(root, "file.txt"), "two\n");
      git(root, "commit", "--quiet", "-am", "second");
      git(root, "branch", "side", "HEAD~1");
      git(root, "worktree", "add", "--quiet", worktree, "side");

      writeFileSync(join(worktree, "file.txt"), "three\n");
      git(worktree, "commit", "--quiet", "-am", "third");
      // Conflicts on purpose; a failed merge is the state under test.
      spawnSync("git", ["merge", "work"], { cwd: worktree, encoding: "utf8" });

      const result = run(worktree);
      assert.equal(result.status, 1);
      assert.match(result.stdout, /merge in progress/);
      assert.match(result.stdout, /BLOCKED/);
    } finally {
      spawnSync("git", ["worktree", "remove", "--force", worktree], { cwd: root });
      rmSync(worktree, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports a clean linked worktree as clean", () => {
    const root = setupRepo();
    const worktree = `${root}-clean-wt`;
    try {
      git(root, "branch", "quiet-side");
      git(root, "worktree", "add", "--quiet", worktree, "quiet-side");
      const result = run(worktree);
      assert.equal(result.status, 0);
      assert.match(result.stdout, /in-progress op\s+ok\s+none/);
    } finally {
      spawnSync("git", ["worktree", "remove", "--force", worktree], { cwd: root });
      rmSync(worktree, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("bin/reconcile.mjs — exit-code contract", () => {
  it("exits 2 outside a git repository", () => {
    const scratch = mkdtempSync(join(tmpdir(), "ci-reconcile-bare-"));
    try {
      const result = run(scratch);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /not a git repository/);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("emits the not-a-git-repo envelope in --snapshot mode outside a repo", () => {
    const scratch = mkdtempSync(join(tmpdir(), "ci-reconcile-bare-snap-"));
    try {
      const result = run(scratch, "--snapshot");
      assert.equal(result.status, 2);
      assert.deepEqual(JSON.parse(result.stdout), { error: "not-a-git-repo" });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("rejects an unknown argument", () => {
    const root = setupRepo();
    try {
      const result = run(root, "--nope");
      assert.equal(result.status, 2);
      assert.match(result.stderr, /unknown argument/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a --verify-push branch that is not a usable ref name", () => {
    const root = setupRepo();
    try {
      const result = run(root, "--verify-push", "main;rm -rf /");
      assert.equal(result.status, 2);
      assert.match(result.stderr, /not a usable ref name/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("bin/reconcile.mjs — --explain and --json", () => {
  it("--explain prints every probe with its purpose", () => {
    const root = setupRepo();
    try {
      const result = run(root, "--explain");
      assert.equal(result.status, 0);
      assert.match(result.stdout, /git rev-parse --show-toplevel/);
      assert.match(result.stdout, /git rev-parse --git-path MERGE_HEAD/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("--json reports the relation and blocked flag", () => {
    const root = setupRepo();
    try {
      const parsed = JSON.parse(run(root, "--json").stdout);
      assert.equal(parsed.relation, "no-upstream");
      assert.equal(parsed.branch, "work");
      assert.equal(parsed.headKind, "branch");
      assert.equal(parsed.blocked, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("bin/reconcile.mjs --snapshot — envelope parity with the shell script", () => {
  it("emits every field scripts/git-state-snapshot.sh documents", () => {
    const root = setupRepo();
    try {
      const envelope = JSON.parse(run(root, "--snapshot").stdout);
      for (const field of SHELL_ENVELOPE_FIELDS) {
        assert.ok(field in envelope, `missing shell-compatible field: ${field}`);
      }
      assert.equal(envelope.branch, "work");
      assert.equal(envelope.upstream, "none");
      // Strictly richer than the shell version, never narrower.
      assert.ok("contentDrift" in envelope);
      assert.ok("inProgress" in envelope);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports branch as `detached` exactly as the shell script does", () => {
    const root = setupRepo();
    try {
      git(root, "checkout", "--quiet", "--detach", "HEAD");
      const envelope = JSON.parse(run(root, "--snapshot").stdout);
      assert.equal(envelope.branch, "detached");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("agrees with the shell script on every shared field", { skip: BASH_SKIP }, () => {
    const root = setupRepo();
    try {
      const node = JSON.parse(run(root, "--snapshot").stdout);
      const shell = spawnSync("bash", [SNAPSHOT_SH.replace(/\\/g, "/")], {
        cwd: root,
        encoding: "utf8",
      });
      assert.equal(shell.status, 0, shell.stderr);
      const shellEnvelope = JSON.parse(shell.stdout);
      for (const field of SHELL_ENVELOPE_FIELDS) {
        if (field === "root") {
          // Both report an absolute path; separators differ across git builds.
          assert.equal(
            String(node[field]).replace(/\\/g, "/").toLowerCase().replace(/^\/+/, ""),
            String(shellEnvelope[field]).replace(/\\/g, "/").toLowerCase().replace(/^\/+/, ""),
          );
          continue;
        }
        assert.equal(node[field], shellEnvelope[field], `field ${field} diverged`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
