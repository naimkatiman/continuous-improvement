/**
 * check-reconcile-parity — the single-source-of-truth lint over the reconcile
 * docs. Each case pins one side of the contract, including the case that the
 * lint itself originally got wrong: a probe named only in prose used to satisfy
 * Side A while the fenced block agents copy had already dropped it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, it } from "node:test";

import { GROUND_TRUTH_PROBES } from "../lib/git-state.mjs";
import {
  checkDoc,
  checkRepo,
  fencedBlocks,
  normalizeForMatch,
  probeCommand,
} from "../bin/check-reconcile-parity.mjs";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SKILL = readFileSync(join(REPO_ROOT, "skills", "reconcile.md"), "utf8");
const COMMAND = readFileSync(join(REPO_ROOT, "commands", "reconcile.md"), "utf8");

describe("fencedBlocks", () => {
  it("keeps fenced content and drops prose", () => {
    const body = "prose one\n```\nfenced one\n```\nprose two\n```sh\nfenced two\n```\n";
    const out = fencedBlocks(body);
    assert.match(out, /fenced one/);
    assert.match(out, /fenced two/);
    assert.doesNotMatch(out, /prose/);
  });

  it("returns an empty string for a doc with no fenced block", () => {
    assert.equal(fencedBlocks("just prose\n"), "");
  });
});

describe("normalizeForMatch", () => {
  it("strips shell quoting so '@{u}' and @{u} compare equal", () => {
    assert.equal(
      normalizeForMatch("git rev-list --count '@{u}...HEAD'"),
      normalizeForMatch("git rev-list --count @{u}...HEAD"),
    );
  });

  it("collapses runs of whitespace introduced by column alignment", () => {
    assert.equal(normalizeForMatch("git  stash    list"), "git stash list");
  });

  it("returns an empty string for absent input", () => {
    assert.equal(normalizeForMatch(null), "");
    assert.equal(normalizeForMatch(undefined), "");
  });
});

describe("checkDoc — the shipped docs reconcile", () => {
  it("finds no violation in skills/reconcile.md", () => {
    assert.deepEqual(checkDoc("skills/reconcile.md", SKILL), []);
  });

  it("finds no violation in commands/reconcile.md", () => {
    assert.deepEqual(checkDoc("commands/reconcile.md", COMMAND), []);
  });

  it("clears the whole repo", () => {
    assert.deepEqual(checkRepo(REPO_ROOT), []);
  });
});

describe("checkDoc — Side A, every probe is prescribed in a fenced block", () => {
  it("flags a probe dropped from the fenced block even when prose still names it", () => {
    // Regression: Side A originally scanned the whole document, so the prose
    // bullet mentioning `git diff --name-only --ignore-all-space` kept the check
    // green after the copyable block had lost the command.
    const mutated = SKILL.replace(
      "git diff --name-only --ignore-all-space",
      "git diff --stat",
    );
    assert.match(mutated, /git diff --name-only --ignore-all-space/); // prose copy survives
    const violations = checkDoc("skills/reconcile.md", mutated);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.kind, "missing-probe");
    assert.match(violations[0]?.detail ?? "", /content-drift/);
  });

  it("flags every probe when the doc has no fenced block at all", () => {
    const violations = checkDoc("skills/reconcile.md", "# reconcile\n\nno code here\n");
    const missing = violations.filter((v) => v.kind === "missing-probe");
    assert.equal(missing.length, GROUND_TRUTH_PROBES.length);
  });

  it("accepts a probe written with the shell quoting the docs use", () => {
    const probe = GROUND_TRUTH_PROBES.find((p) => p.id === "upstream-counts");
    assert.ok(probe);
    const quoted = SKILL.replace(
      probeCommand(probe.args),
      "git rev-list --left-right --count '@{u}...HEAD'",
    );
    const missing = checkDoc("skills/reconcile.md", quoted).filter(
      (v) => v.kind === "missing-probe",
    );
    assert.deepEqual(missing, []);
  });
});

describe("checkDoc — Side B, no fenced block prescribes a retired form", () => {
  it("flags a fenced block that lists a .git-relative marker path", () => {
    const mutated = COMMAND.replace(
      "git stash list",
      "git stash list\nls .git/MERGE_HEAD 2>/dev/null",
    );
    const retired = checkDoc("commands/reconcile.md", mutated).filter(
      (v) => v.kind === "retired-form",
    );
    assert.equal(retired.length, 1);
    assert.match(retired[0]?.detail ?? "", /linked worktree/);
  });

  it("flags a fenced block that prescribes branch --show-current", () => {
    const mutated = SKILL.replace("git stash list", "git branch --show-current\ngit stash list");
    const retired = checkDoc("skills/reconcile.md", mutated).filter(
      (v) => v.kind === "retired-form",
    );
    assert.equal(retired.length, 1);
  });

  it("stays silent when prose merely explains why a form was retired", () => {
    const withProse = `${SKILL}\n\nDo not use the --show-current form of git branch, and never list a .git/ marker path.\n`;
    assert.deepEqual(checkDoc("skills/reconcile.md", withProse), []);
  });
});

describe("checkDoc — Side C and fail-closed inputs", () => {
  it("flags a doc that drops the --git-path guidance", () => {
    const mutated = SKILL.replace(/rev-parse --git-path/g, "rev-parse --show-toplevel");
    const missing = mutated.length === SKILL.length ? [] : checkDoc("skills/reconcile.md", mutated);
    assert.ok(missing.some((v) => v.kind === "missing-substring"));
  });

  it("treats a missing file as a violation, not a pass", () => {
    const violations = checkDoc("commands/reconcile.md", null);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.kind, "missing-file");
  });

  it("treats an empty file as a violation, not a pass", () => {
    const violations = checkDoc("skills/reconcile.md", "   \n\n");
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.kind, "empty");
  });

  it("reports a missing repo root rather than clearing it", () => {
    const violations = checkRepo(join(REPO_ROOT, "does-not-exist"));
    assert.equal(violations.length, 2);
    for (const violation of violations) assert.equal(violation.kind, "missing-file");
  });
});
