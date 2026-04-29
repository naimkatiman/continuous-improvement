#!/usr/bin/env node

/**
 * Skill Law-Tag Check
 *
 * Verifies that every source skill in skills/<name>.md announces — in its
 * YAML frontmatter `description:` — which of the 7 Laws of AI Agent
 * Discipline it enforces. The brand-alignment audit (PR #43) made the Law
 * tag the first clause of every skill description so the discipline shows
 * up every time the skill is loaded; this lint guards against silent
 * regression of that work.
 *
 * Recognized Law tags (case-insensitive):
 *   "Law 1" through "Law 7"
 *   "all 7 Laws"          (used by the orchestrator skill)
 *   "Law activator"       (used by skills that route to other Law-aligned skills)
 *
 * The core skill (root SKILL.md, `tier: core`) is exempt — it IS the 7 Laws
 * spec, not a Law-aligned skill that enforces one. Every other skill must
 * carry a tag.
 *
 * Usage:
 *   node bin/check-skill-law-tag.mjs              # Check the current repo
 *   node bin/check-skill-law-tag.mjs <repo-root>  # Check a specific repo root
 *
 * Exit codes:
 *   0 — every non-core source skill carries a recognized Law tag
 *   1 — at least one skill has a description with no recognized Law tag
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";

import { normalizeTier, parseSkillFrontmatter } from "../lib/skill-tiers.mjs";

const SKILLS_DIR = "skills";
const CORE_SKILL_FILE = "SKILL.md";
const CORE_SKILL_NAME = "continuous-improvement";

export interface LawTagProblem {
  name: string;
  path: string;
  description: string;
}

interface SkillSource {
  name: string;
  path: string;
}

const LAW_TAG_PATTERNS: ReadonlyArray<RegExp> = [
  /\bLaw\s*[1-7]\b/i,
  /\ball\s+7\s+Laws\b/i,
  /\bLaw\s+activator\b/i,
];

export function descriptionHasLawTag(description: string): boolean {
  if (!description) return false;
  return LAW_TAG_PATTERNS.some((p) => p.test(description));
}

export function discoverSkillSources(repoRoot: string): SkillSource[] {
  // Mirrors check-skill-tiers' discovery — the core SKILL.md is included so
  // the caller can decide whether to exempt it. This lint exempts it.
  const out: SkillSource[] = [];

  const corePath = join(repoRoot, CORE_SKILL_FILE);
  try {
    statSync(corePath);
    out.push({ name: CORE_SKILL_NAME, path: corePath });
  } catch {
    // No root SKILL.md — misconfigured repo, but skill-mirror lint covers it.
  }

  const skillsDir = join(repoRoot, SKILLS_DIR);
  let entries: string[];
  try {
    entries = readdirSync(skillsDir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    if (entry === "README.md") continue;
    const fullPath = join(skillsDir, entry);
    try {
      const stat = statSync(fullPath);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }
    out.push({ name: entry.replace(/\.md$/, ""), path: fullPath });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function checkSkillLawTags(repoRoot: string): LawTagProblem[] {
  const sources = discoverSkillSources(repoRoot);
  const problems: LawTagProblem[] = [];
  for (const src of sources) {
    const content = readFileSync(src.path, "utf8");
    const front = parseSkillFrontmatter(content);
    // Exempt the core skill — it IS the 7 Laws spec itself.
    if (normalizeTier(front.tier) === "core") continue;
    const description = (front.description ?? "").toString();
    if (!descriptionHasLawTag(description)) {
      problems.push({
        name: src.name,
        path: src.path,
        description,
      });
    }
  }
  return problems;
}

function main(): void {
  const repoRoot = argv[2] ?? cwd();
  const sources = discoverSkillSources(repoRoot);
  const problems = checkSkillLawTags(repoRoot);
  const checked = sources.length; // includes core, even though we exempt it from problems
  if (problems.length === 0) {
    console.log(
      `OK skill-law-tag: every non-core source skill carries a recognized Law tag (out of ${checked} source(s) discovered).`,
    );
    exit(0);
  }
  console.error(
    `FAIL skill-law-tag: ${problems.length} skill(s) with no recognized Law tag in their description.\n`,
  );
  for (const p of problems) {
    console.error(`  - ${p.name}`);
    console.error(`      file: ${p.path}`);
    console.error(`      description: ${p.description.slice(0, 160)}${p.description.length > 160 ? "..." : ""}`);
  }
  console.error(
    "\nFix: edit the skill's YAML frontmatter `description:` so it announces which of the 7 Laws it enforces.\n" +
      "Recognized tags (case-insensitive): \"Law 1\"–\"Law 7\", \"all 7 Laws\" (orchestrator), \"Law activator\" (dispatcher).\n" +
      "Lead with the tag in the first clause — the brand should fire every time the skill is loaded.\n" +
      "Example: \"Enforces Law 4 (Verify Before Reporting) of the 7 Laws of AI Agent Discipline. <existing description>\"",
  );
  exit(1);
}

const invokedDirectly =
  argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("check-skill-law-tag.mjs")) {
  main();
}
