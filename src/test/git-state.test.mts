/**
 * git-state — boundary tests for the reconcile ground-truth contract.
 *
 * Every case below is a regression for a defect reproduced against real git on
 * 2026-08-02 (see docs/plans/2026-08-02-reconcile-hardening.md):
 *   1. no configured upstream    -> `rev-list @{u}...HEAD` exits 128
 *   2. detached HEAD             -> `branch --show-current` prints "" with exit 0
 *   3. linked worktree           -> `.git` is a file, so `ls .git/MERGE_HEAD`
 *                                   exits 2 exactly as it does on a clean tree
 *   4. autocrlf tree             -> `status --porcelain` overstates real drift
 *
 * Allow and deny paths are asserted for each: the deny path must fail *closed*.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_PROTECTED_BRANCHES,
  GROUND_TRUTH_PROBES,
  IN_PROGRESS_MARKERS,
  accountDirty,
  assessGitState,
  baselineShifted,
  classifyHead,
  classifyInProgress,
  classifyUpstream,
  hasBlockers,
  isProtectedBranch,
  isSafeRefName,
  parseRevListCounts,
  renderResolvedState,
  verifyPushLanded,
  type GitStateInput,
} from "../lib/git-state.mjs";

describe("GROUND_TRUTH_PROBES — single source of truth", () => {
  it("is non-empty and has unique ids", () => {
    assert.ok(GROUND_TRUTH_PROBES.length > 0);
    const ids = GROUND_TRUTH_PROBES.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("is portable: no shell, no coreutils, no literal .git/ path (defect 3)", () => {
    for (const probe of GROUND_TRUTH_PROBES) {
      assert.ok(probe.args.length > 0, `${probe.id} has no args`);
      for (const arg of probe.args) {
        assert.doesNotMatch(arg, /[|;&><`$]/, `${probe.id} arg "${arg}" needs a shell`);
        assert.doesNotMatch(
          arg,
          /(^|[^A-Za-z0-9])\.git[\\/]/,
          `${probe.id} arg "${arg}" hardcodes .git/, which is a FILE in a linked worktree`,
        );
      }
      assert.notEqual(probe.args[0], "ls", `${probe.id} shells out to ls`);
    }
  });

  it("never uses `branch --show-current`, which is silent on a detached HEAD (defect 2)", () => {
    for (const probe of GROUND_TRUTH_PROBES) {
      const joined = probe.args.join(" ");
      assert.doesNotMatch(joined, /^branch .*--show-current/, `${probe.id} uses --show-current`);
    }
  });

  it("tolerates failure exactly on the probes that answer with a non-zero exit", () => {
    const tolerant = GROUND_TRUTH_PROBES.filter((p) => p.tolerateFailure).map((p) => p.id);
    assert.deepEqual(tolerant.sort(), ["head-branch", "upstream-counts", "upstream-ref"]);
  });

  it("probes both reported status and real content drift (defect 4)", () => {
    const ids = GROUND_TRUTH_PROBES.map((p) => p.id);
    assert.ok(ids.includes("status-porcelain"));
    assert.ok(ids.includes("content-drift"));
  });
});

describe("IN_PROGRESS_MARKERS", () => {
  it("addresses markers by --git-path name, never by a .git-relative path (defect 3)", () => {
    for (const marker of IN_PROGRESS_MARKERS) {
      assert.doesNotMatch(marker.gitPath, /[\\/]/, `${marker.id} is path-qualified`);
    }
  });

  it("covers merge, both rebase flavours, cherry-pick, revert and bisect", () => {
    const ids = IN_PROGRESS_MARKERS.map((m) => m.id).sort();
    assert.deepEqual(ids, [
      "bisect",
      "cherry-pick",
      "merge",
      "rebase-apply",
      "rebase-merge",
      "revert",
    ]);
  });
});

describe("isSafeRefName — identity boundary", () => {
  it("accepts ordinary branch names", () => {
    for (const name of ["main", "feat/reconcile-hardening", "release/3.21.x", "v3.21.0"]) {
      assert.equal(isSafeRefName(name), true, name);
    }
  });

  it("rejects anything that could escape a path or an argv slot", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "   ",
      " main",
      "main ",
      "-delete-me",
      "../../etc/passwd",
      "a..b",
      "main;rm -rf /",
      "main branch",
      "refs/heads/main.lock",
      "feature/main.lock/child",
      "refs/heads/.hidden",
      "release/3.21.x.",
      "feature//double-slash",
      "trailing/",
      "HEAD@{1}",
      "x".repeat(256),
    ]) {
      assert.equal(isSafeRefName(bad as string), false, JSON.stringify(bad));
    }
  });
});

describe("classifyHead — detached HEAD is not a silent success (defect 2)", () => {
  it("reads a branch name from a zero-exit symbolic-ref", () => {
    assert.deepEqual(classifyHead("feat/x", 0), { kind: "branch", branch: "feat/x" });
  });

  it("treats a non-zero exit as detached", () => {
    assert.deepEqual(classifyHead("", 1), { kind: "detached", branch: null });
  });

  it("treats empty output as detached even when the exit code is 0", () => {
    // `git branch --show-current` on a detached HEAD: empty stdout, exit 0.
    assert.deepEqual(classifyHead("", 0), { kind: "detached", branch: null });
    assert.deepEqual(classifyHead("   \n", 0), { kind: "detached", branch: null });
  });

  it("treats an unparseable branch name as unknown, never as a match", () => {
    assert.deepEqual(classifyHead("main;rm -rf /", 0), { kind: "unknown", branch: null });
  });
});

describe("parseRevListCounts", () => {
  it("parses the tab-separated behind/ahead pair", () => {
    assert.deepEqual(parseRevListCounts("44\t6"), { behind: 44, ahead: 6 });
    assert.deepEqual(parseRevListCounts("0\t0\n"), { behind: 0, ahead: 0 });
  });

  it("parses identically from CRLF output", () => {
    assert.deepEqual(parseRevListCounts("44\t6\r\n"), parseRevListCounts("44\t6\n"));
  });

  it("returns null — never zero — for empty or malformed output", () => {
    for (const bad of [null, undefined, "", "   ", "44", "44\t6\t9", "a\tb", "-1\t2", "1.5\t2"]) {
      assert.equal(parseRevListCounts(bad as string), null, JSON.stringify(bad));
    }
  });
});

describe("classifyUpstream — fails closed (defect 1)", () => {
  it("classifies the four normal relations", () => {
    assert.equal(classifyUpstream({ behind: 0, ahead: 0 }, true), "even");
    assert.equal(classifyUpstream({ behind: 0, ahead: 3 }, true), "ahead");
    assert.equal(classifyUpstream({ behind: 3, ahead: 0 }, true), "behind");
    assert.equal(classifyUpstream({ behind: 44, ahead: 6 }, true), "diverged");
  });

  it("returns no-upstream instead of throwing when the branch tracks nothing", () => {
    // Real git: `rev-list --left-right --count '@{u}...HEAD'`
    //   -> fatal: no upstream configured for branch 'x', exit 128.
    assert.equal(classifyUpstream(null, false), "no-upstream");
  });

  it("returns unknown — NOT even — when an upstream exists but counts did not parse", () => {
    assert.equal(classifyUpstream(null, true), "unknown");
  });
});

describe("classifyInProgress — a linked worktree must not read as clean (defect 3)", () => {
  it("returns [] only when every marker was probed and none was present", () => {
    const allProbedAbsent = Object.fromEntries(IN_PROGRESS_MARKERS.map((m) => [m.id, false]));
    assert.deepEqual(classifyInProgress(allProbedAbsent), []);
  });

  it("reports a present marker by label", () => {
    const present = Object.fromEntries(IN_PROGRESS_MARKERS.map((m) => [m.id, false]));
    present["merge"] = true;
    assert.deepEqual(classifyInProgress(present), ["merge in progress"]);
  });

  it("reports an unprobed marker instead of implying it is absent", () => {
    // The old `ls .git/MERGE_HEAD` inside a worktree exits 2 — indistinguishable
    // from "no merge in progress". An unprobed marker must never read as clean.
    const result = classifyInProgress({});
    assert.equal(result.length, IN_PROGRESS_MARKERS.length);
    for (const entry of result) assert.match(entry, /unprobed$/);
  });
});

describe("isProtectedBranch — fails closed", () => {
  it("protects the default set", () => {
    for (const name of DEFAULT_PROTECTED_BRANCHES) {
      assert.equal(isProtectedBranch(name), true, name);
    }
  });

  it("does not protect an ordinary feature branch", () => {
    assert.equal(isProtectedBranch("feat/reconcile-hardening"), false);
  });

  it("supports a trailing /* wildcard", () => {
    assert.equal(isProtectedBranch("release/3.21.x", ["release/*"]), true);
    assert.equal(isProtectedBranch("feat/x", ["release/*"]), false);
  });

  it("treats an absent or unparseable branch as protected", () => {
    assert.equal(isProtectedBranch(null), true);
    assert.equal(isProtectedBranch(""), true);
    assert.equal(isProtectedBranch("main;rm -rf /"), true);
  });
});

describe("verifyPushLanded — three outcomes, never collapsed", () => {
  const sha = "a49681a1c0ffee00ba5eba11deadbeef12345678";

  it("confirms a landed push when the remote tip matches", () => {
    const r = verifyPushLanded({
      localHead: sha,
      lsRemoteStdout: `${sha}\trefs/heads/feat/x\n`,
      lsRemoteExitCode: 0,
    });
    assert.equal(r.verdict, "landed");
  });

  it("reports not-landed when the remote ref is absent on a successful probe", () => {
    const r = verifyPushLanded({ localHead: sha, lsRemoteStdout: "", lsRemoteExitCode: 0 });
    assert.equal(r.verdict, "not-landed");
  });

  it("reports not-landed when the remote tip is a different sha", () => {
    const r = verifyPushLanded({
      localHead: sha,
      lsRemoteStdout: `0000000000000000000000000000000000000001\trefs/heads/feat/x\n`,
      lsRemoteExitCode: 0,
    });
    assert.equal(r.verdict, "not-landed");
  });

  it("reports unverified — not not-landed — when ls-remote itself failed", () => {
    // A network failure must never be reported as "the push did not land",
    // and must never be reported as success either.
    const r = verifyPushLanded({ localHead: sha, lsRemoteStdout: "", lsRemoteExitCode: 128 });
    assert.equal(r.verdict, "unverified");
  });

  it("reports unverified when the local HEAD is not a usable sha", () => {
    assert.equal(
      verifyPushLanded({ localHead: "", lsRemoteStdout: "", lsRemoteExitCode: 0 }).verdict,
      "unverified",
    );
  });

  it("reports unverified when ls-remote output carries no parseable sha", () => {
    assert.equal(
      verifyPushLanded({ localHead: sha, lsRemoteStdout: "garbage\n", lsRemoteExitCode: 0 }).verdict,
      "unverified",
    );
  });
});

describe("accountDirty — status overstates drift on autocrlf (defect 4)", () => {
  it("counts real content drift separately from reported status lines", () => {
    const r = accountDirty(" M a\n M b\n M c\n", "a\n");
    assert.equal(r.reported, 3);
    assert.equal(r.contentDrift, 1);
    assert.equal(r.phantomSuspected, true);
  });

  it("does not suspect phantoms when the two agree", () => {
    const r = accountDirty(" M a\n", "a\n");
    assert.equal(r.phantomSuspected, false);
  });

  it("reports an unprobed drift count as null rather than zero", () => {
    const r = accountDirty(" M a\n", null);
    assert.equal(r.contentDrift, null);
    assert.equal(r.phantomSuspected, false);
  });

  it("counts identically from CRLF output", () => {
    assert.equal(accountDirty(" M a\r\n M b\r\n", null).reported, 2);
  });
});

describe("baselineShifted — pre-mutation re-verification", () => {
  const a = "a49681a1c0ffee00ba5eba11deadbeef12345678";
  const b = "b49681a1c0ffee00ba5eba11deadbeef12345678";

  it("is false when nothing moved", () => {
    assert.equal(baselineShifted({ head: a, branch: "main" }, { head: a, branch: "main" }), false);
  });

  it("is true when HEAD moved", () => {
    assert.equal(baselineShifted({ head: a, branch: "main" }, { head: b, branch: "main" }), true);
  });

  it("is true when the branch changed under us", () => {
    assert.equal(baselineShifted({ head: a, branch: "main" }, { head: a, branch: "other" }), true);
  });

  it("is true when either side is missing or unparseable", () => {
    assert.equal(baselineShifted(null, { head: a, branch: "main" }), true);
    assert.equal(baselineShifted({ head: a, branch: "main" }, null), true);
    assert.equal(baselineShifted({ head: "", branch: "main" }, { head: a, branch: "main" }), true);
  });
});

describe("assessGitState / hasBlockers / renderResolvedState", () => {
  const clean: GitStateInput = {
    head: { kind: "branch", branch: "feat/x" },
    upstreamRef: "origin/feat/x",
    counts: { behind: 0, ahead: 0 },
    inProgress: [],
    dirty: { reported: 0, contentDrift: 0, phantomSuspected: false },
  };

  it("clears a clean feature branch", () => {
    const findings = assessGitState(clean);
    assert.equal(hasBlockers(findings), false);
  });

  it("blocks on a detached HEAD", () => {
    const findings = assessGitState({ ...clean, head: { kind: "detached", branch: null } });
    assert.equal(hasBlockers(findings), true);
  });

  it("blocks on an in-progress merge", () => {
    const findings = assessGitState({ ...clean, inProgress: ["merge"] });
    assert.equal(hasBlockers(findings), true);
  });

  it("blocks when an upstream exists but its counts did not parse", () => {
    const findings = assessGitState({ ...clean, counts: null });
    assert.equal(hasBlockers(findings), true);
  });

  it("warns — but does not block — with no upstream configured", () => {
    const findings = assessGitState({ ...clean, upstreamRef: null, counts: null });
    assert.equal(hasBlockers(findings), false);
    const upstream = findings.find((f) => f.id === "upstream");
    assert.equal(upstream?.severity, "warn");
  });

  it("warns when HEAD is on a protected branch", () => {
    const findings = assessGitState({
      ...clean,
      head: { kind: "branch", branch: "main" },
      upstreamRef: "origin/main",
    });
    assert.equal(findings.find((f) => f.id === "head")?.severity, "warn");
  });

  it("renders one aligned row per finding under a resolved header", () => {
    const out = renderResolvedState(assessGitState(clean));
    assert.match(out, /^reconcile \(resolved\):/);
    assert.equal(out.split("\n").length, assessGitState(clean).length + 1);
  });

  it("says the state is unknown rather than clean when no probe ran", () => {
    assert.match(renderResolvedState([]), /unknown/);
    assert.equal(hasBlockers([]), false);
  });
});
