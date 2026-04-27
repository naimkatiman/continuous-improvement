#!/usr/bin/env node

/**
 * Skill Mirror Check
 *
 * Verifies that every skill exists as both a plugin copy
 * (plugins/continuous-improvement/skills/<name>/SKILL.md) and a standalone
 * copy (skills/<name>.md, or root SKILL.md for the core continuous-improvement
 * skill), and that the two copies are byte-identical.
 *
 * Enforces the "Skill mirror rule" from CONTRIBUTING.md so the curl-install
 * path and the plugin-bundle path produce the same skill content.
 *
 * Usage:
 *   node bin/check-skill-mirror.mjs              # Check the current repo
 *   node bin/check-skill-mirror.mjs <repo-root>  # Check a specific repo root
 *
 * Exit codes:
 *   0 — every pair matches
 *   1 — at least one drift detected (missing standalone or content mismatch)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";

const PLUGIN_SKILLS_DIR = "plugins/continuous-improvement/skills";
const CORE_SKILL_NAME = "continuous-improvement";

interface SkillPair {
  name: string;
  pluginPath: string;
  standalonePath: string;
}

export interface DriftReport {
  name: string;
  reason: "missing-standalone" | "content-drift";
  pluginPath: string;
  standalonePath: string;
  pluginLines?: number;
  standaloneLines?: number;
}

export function discoverPairs(repoRoot: string): SkillPair[] {
  const pluginDir = join(repoRoot, PLUGIN_SKILLS_DIR);
  let entries: string[];
  try {
    entries = readdirSync(pluginDir);
  } catch {
    return [];
  }
  const pairs: SkillPair[] = [];
  for (const name of entries) {
    const skillDir = join(pluginDir, name);
    let stat;
    try {
      stat = statSync(skillDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const skillFile = join(skillDir, "SKILL.md");
    try {
      statSync(skillFile);
    } catch {
      continue;
    }
    const standalonePath =
      name === CORE_SKILL_NAME
        ? join(repoRoot, "SKILL.md")
        : join(repoRoot, "skills", `${name}.md`);
    pairs.push({ name, pluginPath: skillFile, standalonePath });
  }
  return pairs.sort((a, b) => a.name.localeCompare(b.name));
}

export function checkPairs(repoRoot: string): DriftReport[] {
  const pairs = discoverPairs(repoRoot);
  const drifts: DriftReport[] = [];
  for (const pair of pairs) {
    let standaloneContent: string;
    try {
      standaloneContent = readFileSync(pair.standalonePath, "utf8");
    } catch {
      drifts.push({
        name: pair.name,
        reason: "missing-standalone",
        pluginPath: pair.pluginPath,
        standalonePath: pair.standalonePath,
      });
      continue;
    }
    const pluginContent = readFileSync(pair.pluginPath, "utf8");
    if (pluginContent !== standaloneContent) {
      drifts.push({
        name: pair.name,
        reason: "content-drift",
        pluginPath: pair.pluginPath,
        standalonePath: pair.standalonePath,
        pluginLines: pluginContent.split("\n").length,
        standaloneLines: standaloneContent.split("\n").length,
      });
    }
  }
  return drifts;
}

function main(): void {
  const repoRoot = argv[2] ?? cwd();
  const pairs = discoverPairs(repoRoot);
  const drifts = checkPairs(repoRoot);
  if (drifts.length === 0) {
    console.log(
      `OK skill-mirror: all ${pairs.length} skill pair(s) match between plugin and standalone copies.`,
    );
    exit(0);
  }
  console.error(
    `FAIL skill-mirror: ${drifts.length} drift(s) detected across ${pairs.length} skill pair(s).\n`,
  );
  for (const d of drifts) {
    if (d.reason === "missing-standalone") {
      console.error(
        `  - ${d.name}: plugin copy exists but standalone copy is missing.`,
      );
      console.error(`      plugin:     ${d.pluginPath}`);
      console.error(`      standalone: ${d.standalonePath} (NOT FOUND)`);
    } else {
      console.error(
        `  - ${d.name}: content drift between plugin and standalone copy (${d.pluginLines} vs ${d.standaloneLines} lines).`,
      );
      console.error(`      plugin:     ${d.pluginPath}`);
      console.error(`      standalone: ${d.standalonePath}`);
    }
  }
  console.error(
    "\nFix per CONTRIBUTING.md \"Skill mirror rule\": every change to a skill must be applied to both the plugin copy and the standalone copy in the same PR. The two distribution paths (curl-install and plugin-bundle) must produce identical content.",
  );
  exit(1);
}

const invokedDirectly =
  argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("check-skill-mirror.mjs")) {
  main();
}
