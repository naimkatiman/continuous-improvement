#!/usr/bin/env node
/**
 * Reconcile-Parity Invariant Check
 *
 * The ground-truth git command set exists in three places at once: the runner
 * (`bin/reconcile.mjs`), the skill (`skills/reconcile.md`) and the slash command
 * (`commands/reconcile.md`). Prose copies drift — the `'@{u}'` Bash-quoting fix
 * had to be applied by hand to both docs, and a portability fix applied to one
 * copy leaves the other telling agents to run the broken form.
 *
 * `GROUND_TRUTH_PROBES` in src/lib/git-state.mts is the single source of truth.
 * This lint asserts the docs still document exactly that set, and that neither
 * doc has regressed to a command proven non-portable on 2026-08-02:
 *
 *   Side A — a fenced code block in each doc prescribes every probe in
 *            GROUND_TRUTH_PROBES verbatim. Fenced blocks only: a probe named in
 *            prose but dropped from the copyable block would otherwise pass
 *            while the command an agent actually runs had lost it.
 *   Side B — no fenced code block in either doc *prescribes* a retired form:
 *              `ls .git/...`            (`.git` is a FILE in a linked worktree,
 *                                        so the probe silently reports nothing)
 *              `branch --show-current`  (empty stdout + exit 0 on a detached
 *                                        HEAD is indistinguishable from success)
 *            Only fenced blocks are scanned, so the prose stays free to explain
 *            why each form was retired without tripping its own lint.
 *   Side C — both docs document `rev-parse --git-path`, the worktree-correct way
 *            to locate an in-progress-operation marker.
 *
 * Fail-closed: a missing file or an empty doc is a violation, not a silent pass.
 *
 * Usage:
 *   node bin/check-reconcile-parity.mjs              # Check the current repo
 *   node bin/check-reconcile-parity.mjs <repo-root>  # Check a specific repo root
 *
 * Exit codes:
 *   0 — both docs match the shipped probe set and carry no retired form
 *   1 — at least one drift
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";
import { GROUND_TRUTH_PROBES } from "../lib/git-state.mjs";
const DOCS = ["skills/reconcile.md", "commands/reconcile.md"];
const RETIRED_FORMS = [
    {
        pattern: /\bls\s+[^\n`]*\.git\//,
        label: "ls .git/<marker>",
        why: "`.git` is a FILE inside a linked worktree, so this probe exits 2 exactly as it does on a clean tree — a real merge reads as no operation in progress",
    },
    {
        pattern: /\bbranch\s+--show-current\b/,
        label: "git branch --show-current",
        why: "returns an empty string with exit 0 on a detached HEAD, which cannot be told apart from a successful read; use `symbolic-ref --quiet --short HEAD`",
    },
];
const REQUIRED_SUBSTRINGS = [
    {
        needle: "rev-parse --git-path",
        why: "the only worktree-correct way to locate MERGE_HEAD / rebase-merge / rebase-apply",
    },
];
/**
 * Normalize a doc or a command for comparison: collapse whitespace and drop the
 * shell quoting docs add around `@{u}` refspecs. Returns "" for absent input.
 */
export function normalizeForMatch(text) {
    if (typeof text !== "string")
        return "";
    return text.replace(/[`'"]/g, "").replace(/\s+/g, " ");
}
/** The literal command line a doc must contain for a probe, before normalization. */
export function probeCommand(args) {
    return `git ${args.join(" ")}`;
}
/**
 * Concatenate the bodies of every fenced code block in `body`.
 *
 * Retired forms are only a defect when a doc *prescribes* them, so Side B scans
 * fenced blocks alone — prose may name a retired command to explain it. Returns
 * "" when the doc has no fenced block.
 */
export function fencedBlocks(body) {
    const lines = body.split(/\r?\n/);
    const collected = [];
    let inside = false;
    for (const line of lines) {
        if (/^\s*```/.test(line)) {
            inside = !inside;
            continue;
        }
        if (inside)
            collected.push(line);
    }
    return collected.join("\n");
}
/** Check one doc body against the shipped probe set. Returns [] when reconciled. */
export function checkDoc(doc, body) {
    if (body === null)
        return [{ doc, kind: "missing-file", detail: "file does not exist" }];
    if (body.trim().length === 0)
        return [{ doc, kind: "empty", detail: "file is empty" }];
    const violations = [];
    const prescribed = fencedBlocks(body);
    const prescribedHaystack = normalizeForMatch(prescribed);
    // Side A scans fenced blocks only. A probe named in prose but absent from the
    // copyable block would otherwise satisfy the check while the command an agent
    // actually runs had silently dropped it.
    for (const probe of GROUND_TRUTH_PROBES) {
        const command = probeCommand(probe.args);
        if (!prescribedHaystack.includes(normalizeForMatch(command))) {
            violations.push({
                doc,
                kind: "missing-probe",
                detail: `no fenced block prescribes probe "${probe.id}": ${command}`,
            });
        }
    }
    for (const retired of RETIRED_FORMS) {
        if (retired.pattern.test(prescribed)) {
            violations.push({
                doc,
                kind: "retired-form",
                detail: `a fenced block still prescribes \`${retired.label}\` — ${retired.why}`,
            });
        }
    }
    const haystack = normalizeForMatch(body);
    for (const required of REQUIRED_SUBSTRINGS) {
        if (!haystack.includes(normalizeForMatch(required.needle))) {
            violations.push({
                doc,
                kind: "missing-substring",
                detail: `does not mention \`${required.needle}\` — ${required.why}`,
            });
        }
    }
    return violations;
}
/** Read every doc under `repoRoot` and collect violations across all of them. */
export function checkRepo(repoRoot) {
    return DOCS.flatMap((doc) => {
        const path = join(repoRoot, doc);
        const body = existsSync(path) ? readFileSync(path, "utf8") : null;
        return checkDoc(doc, body);
    });
}
function main() {
    const repoRoot = argv[2] ?? cwd();
    const violations = checkRepo(repoRoot);
    if (violations.length === 0) {
        console.log(`OK reconcile-parity: ${DOCS.length} doc(s) document all ${GROUND_TRUTH_PROBES.length} ground-truth probe(s), no retired forms.`);
        return;
    }
    console.error(`FAIL reconcile-parity: ${violations.length} drift(s).`);
    console.error("");
    for (const violation of violations) {
        console.error(`  ${violation.doc} — ${violation.detail}`);
    }
    console.error("");
    console.error("Fix: GROUND_TRUTH_PROBES in src/lib/git-state.mts is the source of truth. Update the");
    console.error("doc prose to match it (or change the probe set there first), then `npm run build` so the");
    console.error("plugin mirrors regenerate.");
    exit(1);
}
const invokedDirectly = argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("check-reconcile-parity.mjs")) {
    main();
}
