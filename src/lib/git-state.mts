/**
 * git-state: pure classifiers for the `reconcile` ground-truth contract.
 *
 * No I/O. `src/bin/reconcile.mts` does the actual `git` spawning and feeds raw
 * stdout plus exit codes in here; keeping the logic pure lets the unit tests
 * cover every boundary (no configured upstream, detached HEAD, linked worktree,
 * failed remote probe, autocrlf phantom drift) without building a repo per case.
 *
 * This module is also the single source of truth for the ground-truth command
 * set: `GROUND_TRUTH_PROBES` is what `bin/reconcile.mjs` runs and what
 * `bin/check-reconcile-parity.mjs` asserts the reconcile skill and command docs
 * still document. Prose that drifts from this array fails `verify:all`.
 *
 * Every classifier fails closed. "We could not tell" is reported as unknown or
 * unverified, never as clean, even, absent, or landed.
 */

export type UpstreamRelation =
  | "even"
  | "ahead"
  | "behind"
  | "diverged"
  | "no-upstream"
  | "unknown";

export type HeadKind = "branch" | "detached" | "unknown";

export type PushVerdict = "landed" | "not-landed" | "unverified";

export type Severity = "ok" | "warn" | "blocker";

export interface GroundTruthProbe {
  /** Stable identifier used by the renderer and by the parity lint. */
  id: string;
  /** Argv passed to `git` — never through a shell. */
  args: readonly string[];
  /** Why the probe is in the set. */
  purpose: string;
  /** True when a non-zero exit is an expected answer rather than a failure. */
  tolerateFailure: boolean;
}

export interface UpstreamCounts {
  behind: number;
  ahead: number;
}

export interface HeadState {
  kind: HeadKind;
  branch: string | null;
}

export interface InProgressMarker {
  id: string;
  /** Bare argument to `git rev-parse --git-path` — worktree-correct by construction. */
  gitPath: string;
  label: string;
}

export interface PushLandedInput {
  localHead: string | null | undefined;
  lsRemoteStdout: string | null | undefined;
  lsRemoteExitCode: number;
}

export interface PushLandedResult {
  verdict: PushVerdict;
  reason: string;
}

export interface DirtyAccounting {
  /** Paths `git status --porcelain` reports — inflated by autocrlf. */
  reported: number;
  /** Paths with real content drift, or null when the drift probe never ran. */
  contentDrift: number | null;
  /** True when status reports more paths than actually carry content drift. */
  phantomSuspected: boolean;
}

export interface GitStateInput {
  /** Full commit SHA from `git rev-parse HEAD`; null means HEAD could not be pinned. */
  headCommit?: string | null;
  head: HeadState;
  upstreamRef: string | null;
  counts: UpstreamCounts | null;
  /** Ids of `IN_PROGRESS_MARKERS` found present. */
  inProgress: readonly string[];
  dirty: DirtyAccounting;
  protectedBranches?: readonly string[];
}

export interface GitStateFinding {
  id: string;
  label: string;
  detail: string;
  severity: Severity;
}

export interface Baseline {
  head: string;
  branch: string | null;
}

/** Branch names treated as protected unless the caller overrides the list. */
export const DEFAULT_PROTECTED_BRANCHES: readonly string[] = [
  "main",
  "master",
  "release",
  "production",
];

/**
 * The ground-truth command set.
 *
 * Every entry is portable: plain `git` argv with no shell, no `ls`, no
 * coreutils, and no literal `.git/` path — inside a linked worktree `.git` is a
 * *file*, so a `.git/`-relative probe silently reports nothing. Ordering is the
 * order the runner executes and the renderer prints.
 */
export const GROUND_TRUTH_PROBES: readonly GroundTruthProbe[] = [
  {
    id: "repo-root",
    args: ["rev-parse", "--show-toplevel"],
    purpose: "Confirm we are inside a work tree and learn its root.",
    tolerateFailure: false,
  },
  {
    id: "head-sha",
    args: ["rev-parse", "HEAD"],
    purpose: "Pin the exact commit every later claim is relative to.",
    tolerateFailure: false,
  },
  {
    id: "head-branch",
    args: ["symbolic-ref", "--quiet", "--short", "HEAD"],
    purpose: "Branch name, or a non-zero exit that proves a detached HEAD.",
    tolerateFailure: true,
  },
  {
    id: "upstream-ref",
    args: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    purpose: "Configured upstream, or a non-zero exit that proves there is none.",
    tolerateFailure: true,
  },
  {
    id: "upstream-counts",
    args: ["rev-list", "--left-right", "--count", "@{u}...HEAD"],
    purpose: "Behind/ahead counts; only meaningful once an upstream exists.",
    tolerateFailure: true,
  },
  {
    id: "status-porcelain",
    args: ["status", "--porcelain=v1"],
    purpose: "Reported working-tree changes — inflated by autocrlf on Windows.",
    tolerateFailure: false,
  },
  {
    id: "content-drift",
    args: ["diff", "--name-only", "--ignore-all-space"],
    purpose: "Real content drift — the number to trust when autocrlf is on.",
    tolerateFailure: false,
  },
  {
    id: "stash-list",
    args: ["stash", "list"],
    purpose: "Stashes an earlier session may have left holding real work.",
    tolerateFailure: false,
  },
  {
    id: "worktree-list",
    args: ["worktree", "list", "--porcelain"],
    purpose: "Sibling worktrees another session may be writing to.",
    tolerateFailure: false,
  },
];

/**
 * In-progress operation markers, addressed via `git rev-parse --git-path` so
 * they resolve correctly inside a linked worktree, where `.git` is a file and
 * the real marker lives under `.git/worktrees/<name>/`.
 */
export const IN_PROGRESS_MARKERS: readonly InProgressMarker[] = [
  { id: "merge", gitPath: "MERGE_HEAD", label: "merge in progress" },
  { id: "rebase-merge", gitPath: "rebase-merge", label: "interactive rebase in progress" },
  { id: "rebase-apply", gitPath: "rebase-apply", label: "rebase/am in progress" },
  { id: "cherry-pick", gitPath: "CHERRY_PICK_HEAD", label: "cherry-pick in progress" },
  { id: "revert", gitPath: "REVERT_HEAD", label: "revert in progress" },
  { id: "bisect", gitPath: "BISECT_LOG", label: "bisect in progress" },
];

const SHA = /^[0-9a-f]{7,64}$/i;
const SAFE_REF = /^[A-Za-z0-9._/-]+$/;

/** Split git output on either line ending — git on Windows emits CRLF. */
function toLines(raw: string): string[] {
  return raw.split(/\r?\n/);
}

function isSha(value: string): boolean {
  return SHA.test(value);
}

/**
 * True when `name` is safe to interpolate into a path, an argv entry, or a
 * comparison that authorizes a mutation.
 *
 * Fails closed: null, empty, surrounding whitespace, shell metacharacters,
 * `..`, refspec syntax (`@{`), a leading `-`, empty path components,
 * dot-prefixed or dot-suffixed components, components ending `.lock`, and
 * anything over 255 characters all return false rather than being sanitized
 * into something that then looks valid.
 */
export function isSafeRefName(name: string | null | undefined): boolean {
  if (typeof name !== "string") return false;
  if (name.length === 0 || name.length > 255) return false;
  if (name.trim() !== name) return false;
  if (name.startsWith("-")) return false;
  if (name.endsWith("/") || name.endsWith(".lock")) return false;
  if (name.includes("..") || name.includes("@{")) return false;
  const components = name.split("/");
  if (
    components.some(
      (component) =>
        component.length === 0 ||
        component.startsWith(".") ||
        component.endsWith(".") ||
        component.endsWith(".lock"),
    )
  ) {
    return false;
  }
  return SAFE_REF.test(name);
}

/**
 * Classify HEAD from `git symbolic-ref --quiet --short HEAD`.
 *
 * A detached HEAD makes that command exit non-zero with empty output. This
 * module deliberately never uses `git branch --show-current`, which returns an
 * empty string with exit 0 and so cannot be told apart from a successful read.
 * Returns `{ kind: "unknown", branch: null }` when output is present but is not
 * a usable ref name, so an unparseable branch never reads as a match against an
 * expected one.
 */
export function classifyHead(
  rawBranch: string | null | undefined,
  exitCode = 0,
): HeadState {
  const value = typeof rawBranch === "string" ? rawBranch.trim() : "";
  if (exitCode !== 0 || value.length === 0) {
    return { kind: "detached", branch: null };
  }
  if (!isSafeRefName(value)) return { kind: "unknown", branch: null };
  return { kind: "branch", branch: value };
}

/**
 * Parse `git rev-list --left-right --count @{u}...HEAD` output, which is
 * `"<behind>\t<ahead>"`.
 *
 * Returns null for empty, malformed, negative, or non-integer output. Callers
 * must treat null as "unknown" — never as zero.
 */
export function parseRevListCounts(
  raw: string | null | undefined,
): UpstreamCounts | null {
  if (typeof raw !== "string") return null;
  const first = toLines(raw).find((line) => line.trim().length > 0);
  if (first === undefined) return null;
  const parts = first.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const behind = Number(parts[0]);
  const ahead = Number(parts[1]);
  if (!Number.isInteger(behind) || behind < 0) return null;
  if (!Number.isInteger(ahead) || ahead < 0) return null;
  return { behind, ahead };
}

/**
 * Map counts to an upstream relation.
 *
 * Fails closed: no upstream returns `"no-upstream"`, and an upstream that does
 * exist but whose counts would not parse returns `"unknown"` — never `"even"`.
 */
export function classifyUpstream(
  counts: UpstreamCounts | null,
  hasUpstream: boolean,
): UpstreamRelation {
  if (!hasUpstream) return "no-upstream";
  if (counts === null) return "unknown";
  const { behind, ahead } = counts;
  if (behind === 0 && ahead === 0) return "even";
  if (behind > 0 && ahead > 0) return "diverged";
  return ahead > 0 ? "ahead" : "behind";
}

/**
 * Collect a label for every in-progress operation whose marker is present.
 *
 * `present` is keyed by `InProgressMarker.id`. A marker missing from the map is
 * treated as *unprobed*, not absent, and reported as `"<id>: unprobed"` — a
 * probe that never ran must not masquerade as a clean tree. Returns `[]` only
 * when every known marker was probed and none was present.
 */
export function classifyInProgress(
  present: Readonly<Record<string, boolean>>,
): string[] {
  const found: string[] = [];
  for (const marker of IN_PROGRESS_MARKERS) {
    const state = present[marker.id];
    if (state === undefined) {
      found.push(`${marker.id}: unprobed`);
    } else if (state) {
      found.push(marker.label);
    }
  }
  return found;
}

/**
 * True when `branch` must not be pushed to or committed onto directly.
 *
 * Fails closed: null, an unparseable name, and a detached HEAD all return true,
 * because an unknown branch is not proof of safety. Supports one trailing `/*`
 * wildcard per pattern (`release/*`).
 */
export function isProtectedBranch(
  branch: string | null | undefined,
  patterns: readonly string[] = DEFAULT_PROTECTED_BRANCHES,
): boolean {
  if (!isSafeRefName(branch)) return true;
  const name = branch as string;
  return patterns.some((pattern) =>
    pattern.endsWith("/*")
      ? name.startsWith(pattern.slice(0, -1))
      : name === pattern,
  );
}

/**
 * Decide whether a push actually landed, from `git ls-remote` output.
 *
 * Three outcomes, never collapsed into two: a non-zero exit is `"unverified"`
 * (the network or the remote failed, so absence of the ref is unproven and the
 * push may well have landed), an empty successful probe is `"not-landed"` (the
 * ref is genuinely absent), and a present ref is compared by SHA. An
 * unparseable local HEAD or unparseable remote output is `"unverified"`.
 */
export function verifyPushLanded(input: PushLandedInput): PushLandedResult {
  const local = (input.localHead ?? "").trim();
  if (!isSha(local)) {
    return { verdict: "unverified", reason: "local HEAD is not a usable sha" };
  }
  if (input.lsRemoteExitCode !== 0) {
    return {
      verdict: "unverified",
      reason: `git ls-remote exited ${input.lsRemoteExitCode}; absence of the ref is unproven`,
    };
  }
  const raw = (input.lsRemoteStdout ?? "").trim();
  if (raw.length === 0) {
    return { verdict: "not-landed", reason: "remote ref does not exist" };
  }
  const remoteSha = ((toLines(raw)[0] ?? "").trim().split(/\s+/)[0] ?? "");
  if (!isSha(remoteSha)) {
    return { verdict: "unverified", reason: "could not parse a sha from ls-remote output" };
  }
  if (remoteSha.toLowerCase() === local.toLowerCase()) {
    return {
      verdict: "landed",
      reason: `remote tip matches local HEAD ${local.slice(0, 12)}`,
    };
  }
  return {
    verdict: "not-landed",
    reason: `remote tip ${remoteSha.slice(0, 12)} differs from local HEAD ${local.slice(0, 12)}`,
  };
}

/**
 * Reconcile `git status --porcelain` output against real content drift.
 *
 * On an `autocrlf=true` tree status reports line-ending-only modifications that
 * carry no content change, which is why the reconcile skill says to trust
 * `git diff` instead. A `contentDrift` of null means the drift probe never ran;
 * it is reported as null rather than assumed to be zero.
 */
export function accountDirty(
  statusStdout: string | null | undefined,
  diffNamesStdout: string | null | undefined,
): DirtyAccounting {
  const count = (raw: string | null | undefined): number | null =>
    typeof raw === "string"
      ? toLines(raw).filter((line) => line.trim().length > 0).length
      : null;
  const reported = count(statusStdout) ?? 0;
  const contentDrift = count(diffNamesStdout);
  return {
    reported,
    contentDrift,
    phantomSuspected: contentDrift !== null && reported > contentDrift,
  };
}

/**
 * True when the repo moved under us since `before` was captured — the check to
 * run immediately before each mutation on a host with concurrent writers.
 *
 * Fails closed: a missing or unparseable sha on either side counts as shifted,
 * because "we could not tell" must never read as "nothing moved".
 */
export function baselineShifted(
  before: Baseline | null,
  after: Baseline | null,
): boolean {
  if (before === null || after === null) return true;
  const beforeHead = (before.head ?? "").trim();
  const afterHead = (after.head ?? "").trim();
  if (!isSha(beforeHead) || !isSha(afterHead)) return true;
  if (beforeHead.toLowerCase() !== afterHead.toLowerCase()) return true;
  return (before.branch ?? null) !== (after.branch ?? null);
}

/**
 * Turn a probed state into the ordered finding list the resolved-state block
 * renders. Every finding carries a severity; `blocker` means do not mutate.
 */
export function assessGitState(input: GitStateInput): GitStateFinding[] {
  const findings: GitStateFinding[] = [];
  const protectedList = input.protectedBranches ?? DEFAULT_PROTECTED_BRANCHES;

  if (Object.hasOwn(input, "headCommit")) {
    const commit = (input.headCommit ?? "").trim();
    findings.push({
      id: "head-commit",
      label: "HEAD commit",
      detail: isSha(commit)
        ? commit.slice(0, 12)
        : "unborn or not a usable commit — create or verify the first commit before mutating",
      severity: isSha(commit) ? "ok" : "blocker",
    });
  }

  if (input.head.kind === "branch") {
    const onProtected = isProtectedBranch(input.head.branch, protectedList);
    findings.push({
      id: "head",
      label: "HEAD",
      detail: onProtected
        ? `on protected branch ${input.head.branch} — branch before mutating`
        : `on ${input.head.branch}`,
      severity: onProtected ? "warn" : "ok",
    });
  } else if (input.head.kind === "detached") {
    findings.push({
      id: "head",
      label: "HEAD",
      detail: "detached — no branch to commit onto, push, or name in a PR",
      severity: "blocker",
    });
  } else {
    findings.push({
      id: "head",
      label: "HEAD",
      detail: "branch name unparseable — treat repo identity as unknown",
      severity: "blocker",
    });
  }

  const relation = classifyUpstream(input.counts, input.upstreamRef !== null);
  const upstreamRows: Record<UpstreamRelation, { detail: string; severity: Severity }> = {
    even: { detail: `even with ${input.upstreamRef}`, severity: "ok" },
    ahead: {
      detail: `${input.counts?.ahead ?? "?"} ahead of ${input.upstreamRef}`,
      severity: "ok",
    },
    behind: {
      detail: `${input.counts?.behind ?? "?"} behind ${input.upstreamRef} — pull --ff-only first`,
      severity: "warn",
    },
    diverged: {
      detail:
        `diverged from ${input.upstreamRef} ` +
        `(${input.counts?.behind ?? "?"} behind / ${input.counts?.ahead ?? "?"} ahead) — ` +
        "rebase or merge deliberately, never blind --force",
      severity: "warn",
    },
    "no-upstream": {
      detail:
        "no configured upstream — compare against origin/<default> explicitly before classifying",
      severity: "warn",
    },
    unknown: {
      detail:
        "upstream exists but counts did not parse — relationship unknown, do not assume even",
      severity: "blocker",
    },
  };
  findings.push({ id: "upstream", label: "upstream", ...upstreamRows[relation] });

  const ops = classifyInProgress(
    Object.fromEntries(
      IN_PROGRESS_MARKERS.map((marker) => [marker.id, input.inProgress.includes(marker.id)]),
    ),
  );
  findings.push({
    id: "in-progress",
    label: "in-progress op",
    detail: ops.length === 0 ? "none" : `${ops.join(", ")} — another actor may own this tree`,
    severity: ops.length === 0 ? "ok" : "blocker",
  });

  const { reported, contentDrift, phantomSuspected } = input.dirty;
  findings.push({
    id: "dirty",
    label: "working tree",
    detail:
      contentDrift === null
        ? `${reported} path(s) reported by status; content drift unprobed`
        : phantomSuspected
          ? `${reported} reported by status but only ${contentDrift} with content drift — ` +
            "stage by explicit filename, never git add -A"
          : `${contentDrift} path(s) with content drift`,
    severity: contentDrift === null ? "warn" : "ok",
  });

  return findings;
}

/** True when any finding blocks mutation. */
export function hasBlockers(findings: readonly GitStateFinding[]): boolean {
  return findings.some((finding) => finding.severity === "blocker");
}

const SEVERITY_TAG: Record<Severity, string> = {
  ok: "ok",
  warn: "WARN",
  blocker: "BLOCKER",
};

/**
 * Render the resolved-state block an operator reads before mutating. Returns a
 * single "state unknown" line when no probe produced a finding, so an empty
 * result never renders as a clean tree.
 */
export function renderResolvedState(findings: readonly GitStateFinding[]): string {
  if (findings.length === 0) {
    return "reconcile (resolved): no probes ran — state unknown";
  }
  const width = Math.max(...findings.map((finding) => finding.label.length));
  const rows = findings.map(
    (finding) =>
      `  ${finding.label.padEnd(width)}  ${SEVERITY_TAG[finding.severity].padEnd(7)}  ${finding.detail}`,
  );
  return ["reconcile (resolved):", ...rows].join("\n");
}
