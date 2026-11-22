#!/usr/bin/env node

/**
 * Invariant Count Check
 *
 * `CLAUDE.md` and `AGENTS.md` tell an agent, as a hard instruction, to run
 * `npm run verify:all` and state how many invariants that is plus the full
 * ordered list. `docs/RELEASING.md` states the count in its release checklist.
 * All three are hand-maintained prose, and all three drifted: on 2026-09-06
 * CLAUDE.md and RELEASING.md said 16 against an actual 17, and AGENTS.md — the
 * file Codex reads as its contract — said **12** and listed an incomplete set,
 * having missed skill-count-prose, command-count, landing-version and
 * reconcile-parity entirely.
 *
 * That is worse than a stale number. An agent told "12 invariants" that sees 17
 * OK lines has no way to know whether it ran too much or the doc is wrong, and
 * an agent reading the list as authoritative will not notice an invariant it was
 * never told about.
 *
 * Source of truth: the `verify:all` script in package.json. Everything before
 * the first non-`verify:` step is a content invariant; the rest (today just
 * `typecheck`) is the trailing tail the docs name after the colon. Derived, not
 * hardcoded, so adding an invariant to the chain is the only edit needed to make
 * this check demand the docs follow. A new `verify:*` script must join that
 * chain (or OUTSIDE_CHAIN_VERIFY_SCRIPTS) or this check fails.
 *
 * The same function also fails if `package.json` gains a `verify:*` script that
 * is not in that chain. #312 only checked the docs against the chain, so a new
 * `verify:foo` could sit in scripts forever and never run. `verify:generated`
 * is the one deliberate outsider: it is a CI `git diff` gate, not a content
 * invariant.
 *
 * Two claim shapes are recognised:
 *   long  — "(17 content invariants + typecheck: a, b, …, typecheck)"  count + ordered names
 *   short — "(17 invariants + typecheck)"                              count only
 *
 * Fail-closed: a scanned file with no claim at all is a violation, not a pass.
 *
 * Usage:
 *   node bin/check-invariant-count.mjs              # Check the current repo
 *   node bin/check-invariant-count.mjs <repo-root>  # Check a specific repo root
 *
 * Exit codes:
 *   0 — every claim matches the verify:all chain
 *   1 — a count is stale, a name list is wrong or out of order, a file states
 *       none, or a verify:* script is missing from the chain
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";

/** Files that carry a verify:all claim. Explicit, so dropping one is deliberate. */
export const CLAIM_FILES: string[] = ["CLAUDE.md", "AGENTS.md", join("docs", "RELEASING.md")];

/**
 * `verify:*` scripts that are allowed to live outside `verify:all`.
 * `verify:all` is the chain itself. `verify:generated` is the CI
 * `git diff --exit-code` gate, not a content invariant.
 */
export const OUTSIDE_CHAIN_VERIFY_SCRIPTS: readonly string[] = Object.freeze([
  "verify:all",
  "verify:generated",
]);

export interface VerifyChain {
  invariants: string[];
  trailing: string[];
}

export interface Claim {
  count: number;
  /** Ordered names from the long form, including the trailing tail. null for the short form. */
  names: string[] | null;
}

const LONG_RE = /\((\d+) content invariants \+ typecheck:\s*([^)]+)\)/g;
const SHORT_RE = /\((\d+) invariants \+ typecheck\)/g;

/** Split the verify:all chain into `verify:*` invariants and the trailing steps. */
export function parseVerifyAllChain(chainScript: string): VerifyChain {
  const steps = [...chainScript.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)].map((m) => m[1]);
  const invariants: string[] = [];
  const trailing: string[] = [];
  for (const step of steps) {
    if (step.startsWith("verify:")) invariants.push(step.slice("verify:".length));
    else trailing.push(step);
  }
  return { invariants, trailing };
}

export function parseClaims(content: string): Claim[] {
  const claims: Claim[] = [];
  for (const m of content.matchAll(LONG_RE)) {
    claims.push({
      count: Number(m[1]),
      names: m[2].split(",").map((s) => s.trim()).filter(Boolean),
    });
  }
  for (const m of content.matchAll(SHORT_RE)) {
    claims.push({ count: Number(m[1]), names: null });
  }
  return claims;
}

export function findViolations(
  chain: VerifyChain,
  claimsByFile: Record<string, Claim[]>,
): string[] {
  const violations: string[] = [];
  const expectedCount = chain.invariants.length;
  const expectedNames = [...chain.invariants, ...chain.trailing];

  for (const [file, claims] of Object.entries(claimsByFile)) {
    if (claims.length === 0) {
      violations.push(
        `${file}: states no "verify:all" invariant-count claim. Expected "(${expectedCount} invariants + typecheck)" or the long form with the full list.`,
      );
      continue;
    }
    for (const claim of claims) {
      if (claim.count !== expectedCount) {
        violations.push(
          `${file}: claims ${claim.count} invariants but verify:all runs ${expectedCount}.`,
        );
      }
      if (claim.names === null) continue;
      if (claim.names.length !== expectedNames.length) {
        const missing = expectedNames.filter((n) => !claim.names!.includes(n));
        const extra = claim.names.filter((n) => !expectedNames.includes(n));
        violations.push(
          `${file}: the listed steps do not match verify:all.` +
            (missing.length ? ` Missing: ${missing.join(", ")}.` : "") +
            (extra.length ? ` Not in the chain: ${extra.join(", ")}.` : ""),
        );
      } else if (claim.names.some((n, i) => n !== expectedNames[i])) {
        violations.push(
          `${file}: the listed steps are out of order. Expected the chain order: ${expectedNames.join(", ")}.`,
        );
      }
    }
  }
  return violations;
}

/** `verify:*` scripts in package.json that `verify:all` never runs. */
export function findOrphanVerifyScripts(
  scripts: Record<string, string>,
  chain: VerifyChain,
): string[] {
  const chained = new Set(chain.invariants);
  const orphans: string[] = [];
  for (const name of Object.keys(scripts).sort()) {
    if (!name.startsWith("verify:")) continue;
    if (OUTSIDE_CHAIN_VERIFY_SCRIPTS.includes(name)) continue;
    if (!chained.has(name.slice("verify:".length))) orphans.push(name);
  }
  return orphans;
}

export function checkInvariantCount(repoRoot: string): {
  chain: VerifyChain;
  violations: string[];
} {
  const pkgRaw = readFileSync(join(repoRoot, "package.json"), "utf8");
  const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
  const chainScript = pkg.scripts?.["verify:all"];
  if (typeof chainScript !== "string" || chainScript.length === 0) {
    return {
      chain: { invariants: [], trailing: [] },
      violations: [`package.json has no "verify:all" script, so no claim can be checked.`],
    };
  }
  const chain = parseVerifyAllChain(chainScript);
  const scripts = pkg.scripts ?? {};
  const orphans = findOrphanVerifyScripts(scripts, chain);

  const claimsByFile: Record<string, Claim[]> = {};
  for (const rel of CLAIM_FILES) {
    let content: string;
    try {
      content = readFileSync(join(repoRoot, rel), "utf8");
    } catch {
      claimsByFile[rel] = [];
      continue;
    }
    claimsByFile[rel] = parseClaims(content);
  }

  const violations = [
    ...findViolations(chain, claimsByFile),
    ...orphans.map(
      (name) =>
        `package.json script "${name}" is not in the verify:all chain. An invariant nobody runs is worse than none. Add it to the chain or, if it is a deliberate outsider like verify:generated, to OUTSIDE_CHAIN_VERIFY_SCRIPTS.`,
    ),
  ];
  return { chain, violations };
}

function main(): void {
  const repoRoot = argv[2] ?? cwd();
  const { chain, violations } = checkInvariantCount(repoRoot);

  if (violations.length === 0) {
    console.log(
      `OK invariant-count: all ${CLAIM_FILES.length} doc surface(s) state ${chain.invariants.length} invariants + ${chain.trailing.join(", ")}, matching the verify:all chain.`,
    );
    exit(0);
  }

  console.error(`FAIL invariant-count: ${violations.length} violation(s) about verify:all.\n`);
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    `\nFix: verify:all currently runs ${chain.invariants.length} invariants — ` +
      `${[...chain.invariants, ...chain.trailing].join(", ")}. ` +
      `Update the claim in each file above to match, or add the orphaned verify:* script to the chain (or to OUTSIDE_CHAIN_VERIFY_SCRIPTS if it is a deliberate outsider like verify:generated). The chain in package.json is the source of truth.`,
  );
  exit(1);
}

const invokedDirectly =
  argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("check-invariant-count.mjs")) {
  main();
}
