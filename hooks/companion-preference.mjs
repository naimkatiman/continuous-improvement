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
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const OVERRIDES = {
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
function emitAndExit(d) {
    process.stdout.write(`${JSON.stringify(d)}\n`);
    process.exit(0);
}
function readStdin() {
    try {
        return readFileSync(0, "utf8");
    }
    catch {
        return "";
    }
}
function readMode(home) {
    try {
        const raw = readFileSync(join(home, ".claude", "settings.json"), "utf8");
        const settings = JSON.parse(raw);
        const mode = settings.continuous_improvement?.companion_preference;
        if (mode === "companions-first" || mode === "strict-companions")
            return mode;
        return "ci-first";
    }
    catch {
        return "ci-first";
    }
}
function isCompanionInstalled(home, plugin) {
    try {
        return existsSync(join(home, ".claude", "plugins", plugin));
    }
    catch {
        return false;
    }
}
function normalizeSkill(skill) {
    return skill.startsWith("ci:") ? skill.slice(3) : skill;
}
function resolveHome() {
    return process.env.HOME ?? process.env.USERPROFILE ?? homedir();
}
function resolveProjectRoot() {
    const fromEnv = process.env.CLAUDE_PROJECT_DIR;
    if (fromEnv)
        return fromEnv;
    try {
        const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        if (root)
            return root;
    }
    catch {
        // not in a git repo
    }
    return "global";
}
function telemetryPath(home) {
    const hash = createHash("sha256")
        .update(resolveProjectRoot())
        .digest("hex")
        .slice(0, 12);
    return join(home, ".claude", "instincts", hash, "companion-preference.jsonl");
}
/**
 * Append one JSONL line per hook decision. Wrapped to fail open: any write
 * error (read-only dir, disk full, race on mkdir) is swallowed and the hook
 * decision proceeds. Telemetry must never block tool calls.
 */
function writeTelemetry(home, event) {
    try {
        const path = telemetryPath(home);
        const dir = join(path, "..");
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
        appendFileSync(path, `${JSON.stringify(event)}\n`);
    }
    catch {
        // fail-open — telemetry failure never changes the decision
    }
}
function main() {
    const raw = readStdin();
    let payload;
    try {
        payload = JSON.parse(raw);
    }
    catch {
        emitAndExit({ decision: "allow" });
    }
    if (payload.tool_name !== "Skill") {
        emitAndExit({ decision: "allow" });
    }
    const skill = payload.tool_input?.skill;
    if (typeof skill !== "string" || skill.length === 0) {
        emitAndExit({ decision: "allow" });
    }
    const normalized = normalizeSkill(skill);
    const override = OVERRIDES[normalized];
    if (!override) {
        emitAndExit({ decision: "allow" });
    }
    const home = resolveHome();
    const mode = readMode(home);
    const installed = isCompanionInstalled(home, override.plugin);
    const baseEvent = {
        ts: new Date().toISOString(),
        hook: "companion-preference",
        ci_skill: normalized,
        companion: override.companion,
        plugin: override.plugin,
        companion_installed: installed,
    };
    if (mode === "ci-first") {
        // Shadow row: what companions-first would have done. This is the data
        // set that earns a future default-flip decision.
        writeTelemetry(home, { ...baseEvent, mode, action: "observation" });
        emitAndExit({ decision: "allow" });
    }
    if (mode === "companions-first") {
        process.stderr.write(`[continuous-improvement] companion_preference=companions-first → prefer \`${override.companion}\` over \`ci:${normalized}\`.\n`);
        writeTelemetry(home, { ...baseEvent, mode, action: "advisory" });
        emitAndExit({ decision: "allow" });
    }
    // strict-companions: always block; reason depends on install state.
    if (installed) {
        writeTelemetry(home, { ...baseEvent, mode, action: "block" });
        emitAndExit({
            decision: "block",
            reason: `companion_preference=strict-companions: route to \`${override.companion}\` instead of \`ci:${normalized}\`. The CI fallback is suppressed by your setting.`,
        });
    }
    writeTelemetry(home, { ...baseEvent, mode, action: "block-not-installed" });
    emitAndExit({
        decision: "block",
        reason: `companion_preference=strict-companions: companion plugin \`${override.plugin}\` is not installed. Install with \`/plugin install ${override.plugin}@continuous-improvement\` or relax the setting to \`companions-first\` or \`ci-first\` in ~/.claude/settings.json.`,
    });
}
main();
