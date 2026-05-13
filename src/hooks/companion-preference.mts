#!/usr/bin/env node
/**
 * Runtime PreToolUse companion-preference hook.
 *
 * Reads ~/.claude/settings.json → continuous_improvement.companion_preference
 * and enforces the Companion-Preference Override contract documented in
 * skills/superpowers.md for `Skill` tool calls.
 *
 *   ci-first       (default): no-op, allow.
 *   companions-first        : advisory stderr on mapped CI→companion pair; allow.
 *   strict-companions       : block mapped CI route. Reason names the companion
 *                             (when installed) or the install hint (when not).
 *
 * Fail-open: any unexpected error reading stdin / parsing settings / probing
 * the filesystem → emit { decision: "allow" } and exit 0. The hook never
 * blocks on its own bugs.
 *
 * Stdin  : JSON { tool_name, tool_input }
 * Stdout : JSON { decision: "allow" | "block", reason?: string }
 * Exit   : 0 always — decision lives in stdout, never in the exit code.
 *
 * OVERRIDES map must stay row-aligned with skills/superpowers.md
 * § "Which rows the override affects" — drift will surface when the test
 * suite or a follow-up audit walks the table against this map.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface Override {
  companion: string;
  plugin: string;
}

const OVERRIDES: Record<string, Override> = {
  "tdd-workflow": {
    companion: "superpowers:test-driven-development",
    plugin: "superpowers",
  },
  "verification-loop": {
    companion: "superpowers:verification-before-completion",
    plugin: "superpowers",
  },
  "context-budget": {
    companion: "agent-skills:context-engineering",
    plugin: "agent-skills",
  },
  ralph: {
    companion: "oh-my-claudecode:ultrawork",
    plugin: "oh-my-claudecode",
  },
  "learn-eval": {
    companion: "oh-my-claudecode:retrospective",
    plugin: "oh-my-claudecode",
  },
};

type Mode = "ci-first" | "companions-first" | "strict-companions";

interface Decision {
  decision: "allow" | "block";
  reason?: string;
}

interface ToolInput {
  skill?: unknown;
}

interface Payload {
  tool_name?: unknown;
  tool_input?: ToolInput;
}

function emitAndExit(d: Decision): never {
  process.stdout.write(`${JSON.stringify(d)}\n`);
  process.exit(0);
}

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function readMode(home: string): Mode {
  try {
    const raw = readFileSync(join(home, ".claude", "settings.json"), "utf8");
    const settings = JSON.parse(raw) as {
      continuous_improvement?: { companion_preference?: unknown };
    };
    const mode = settings.continuous_improvement?.companion_preference;
    if (mode === "companions-first" || mode === "strict-companions") return mode;
    return "ci-first";
  } catch {
    return "ci-first";
  }
}

function isCompanionInstalled(home: string, plugin: string): boolean {
  try {
    return existsSync(join(home, ".claude", "plugins", plugin));
  } catch {
    return false;
  }
}

function normalizeSkill(skill: string): string {
  return skill.startsWith("ci:") ? skill.slice(3) : skill;
}

function resolveHome(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? homedir();
}

function main(): void {
  const raw = readStdin();
  let payload: Payload;
  try {
    payload = JSON.parse(raw) as Payload;
  } catch {
    emitAndExit({ decision: "allow" });
  }
  if (payload.tool_name !== "Skill") {
    emitAndExit({ decision: "allow" });
  }
  const skill = payload.tool_input?.skill;
  if (typeof skill !== "string" || skill.length === 0) {
    emitAndExit({ decision: "allow" });
  }
  const normalized = normalizeSkill(skill as string);
  const override = OVERRIDES[normalized];
  if (!override) {
    emitAndExit({ decision: "allow" });
  }
  const home = resolveHome();
  const mode = readMode(home);
  if (mode === "ci-first") {
    emitAndExit({ decision: "allow" });
  }
  if (mode === "companions-first") {
    process.stderr.write(
      `[continuous-improvement] companion_preference=companions-first → prefer \`${override!.companion}\` over \`ci:${normalized}\`.\n`,
    );
    emitAndExit({ decision: "allow" });
  }
  // strict-companions: always block; reason depends on install state.
  const installed = isCompanionInstalled(home, override!.plugin);
  if (installed) {
    emitAndExit({
      decision: "block",
      reason: `companion_preference=strict-companions: route to \`${override!.companion}\` instead of \`ci:${normalized}\`. The CI fallback is suppressed by your setting.`,
    });
  }
  emitAndExit({
    decision: "block",
    reason: `companion_preference=strict-companions: companion plugin \`${override!.plugin}\` is not installed. Install with \`/plugin install ${override!.plugin}@continuous-improvement\` or relax the setting to \`companions-first\` or \`ci-first\` in ~/.claude/settings.json.`,
  });
}

main();
