/**
 * Multi-platform install targets for the 7-Laws skill.
 *
 * Pure planning layer — no filesystem access. The installer
 * (src/bin/install.mts) feeds in the SKILL.md text plus a reader callback and
 * executes the returned write plan against the project root. Keeping this
 * pure lets the per-target contracts be unit-tested without temp dirs.
 *
 * v1 contract (docs/plans/2026-06-11-multi-platform-installer.md):
 * - Non-Claude targets receive the skill text only; hooks, the MCP server,
 *   and instinct learning stay Claude Code-only and every plan says so.
 * - Shared files (GEMINI.md, AGENTS.md, .rules, CONVENTIONS.md,
 *   copilot-instructions.md) are merged through a managed block so existing
 *   user content is never clobbered and reinstalls are idempotent.
 * - Own-file targets (cursor, windsurf) are written whole.
 */
export const MANAGED_BEGIN = "<!-- continuous-improvement:begin (managed block — reinstall via `npx continuous-improvement install --target <name>`; edits inside are overwritten) -->";
export const MANAGED_END = "<!-- continuous-improvement:end -->";
const TARGET_SPECS = {
    gemini: { label: "Gemini CLI", mode: "managed", relPath: "GEMINI.md" },
    codex: { label: "Codex CLI (agents.md standard)", mode: "managed", relPath: "AGENTS.md" },
    cursor: { label: "Cursor", mode: "whole", relPath: ".cursor/rules/continuous-improvement.mdc" },
    windsurf: { label: "Windsurf", mode: "whole", relPath: ".windsurf/rules/continuous-improvement.md" },
    zed: { label: "Zed", mode: "managed", relPath: ".rules" },
    aider: { label: "Aider", mode: "managed", relPath: "CONVENTIONS.md" },
    copilot: { label: "GitHub Copilot", mode: "managed", relPath: ".github/copilot-instructions.md" },
};
export const TARGET_IDS = ["claude", ...Object.keys(TARGET_SPECS)];
export function resolveTargets(csv) {
    const targets = [];
    const unknown = [];
    for (const raw of csv.split(",")) {
        const name = raw.trim().toLowerCase();
        if (name === "")
            continue;
        if (!TARGET_IDS.includes(name)) {
            if (!unknown.includes(name))
                unknown.push(name);
            continue;
        }
        if (!targets.includes(name))
            targets.push(name);
    }
    return { targets, unknown };
}
export function stripFrontmatter(skillMd) {
    if (!skillMd.startsWith("---\n") && !skillMd.startsWith("---\r\n"))
        return skillMd;
    const close = skillMd.indexOf("\n---", 3);
    if (close === -1)
        return skillMd;
    const afterClose = skillMd.indexOf("\n", close + 1);
    if (afterClose === -1)
        return "";
    return skillMd.slice(afterClose + 1).replace(/^\s*\n/, "");
}
export function mergeManagedBlock(existing, block) {
    if (existing === null || existing.trim() === "") {
        return `${block}\n`;
    }
    const beginAt = existing.indexOf(MANAGED_BEGIN);
    const endAt = existing.indexOf(MANAGED_END);
    if (beginAt !== -1 && endAt !== -1 && endAt > beginAt) {
        const before = existing.slice(0, beginAt);
        const after = existing.slice(endAt + MANAGED_END.length);
        return `${before}${block}${after}`;
    }
    return `${existing.trimEnd()}\n\n${block}\n`;
}
function renderManagedBlock(skillMd) {
    return `${MANAGED_BEGIN}\n${stripFrontmatter(skillMd).trim()}\n${MANAGED_END}`;
}
function renderCursorRule(skillMd) {
    return [
        "---",
        "description: 7 Laws of AI Agent Discipline — continuous-improvement framework",
        "alwaysApply: true",
        "---",
        "",
        stripFrontmatter(skillMd).trim(),
        "",
    ].join("\n");
}
const AIDER_CONF_PATH = ".aider.conf.yml";
const AIDER_MINIMAL_CONF = [
    "# Written by `npx continuous-improvement install --target aider`.",
    "# Loads the 7 Laws conventions into every Aider session.",
    "read: [CONVENTIONS.md]",
    "",
].join("\n");
export function planTargetWrites(targetId, skillMd, readExisting) {
    if (targetId === "claude") {
        throw new Error("claude is handled by the standard installer flow, not planTargetWrites");
    }
    const spec = TARGET_SPECS[targetId];
    if (!spec) {
        throw new Error(`Unknown install target: ${targetId}. Valid: ${TARGET_IDS.join(", ")}`);
    }
    const writes = [];
    const notes = [
        `${spec.label} gets the 7-Laws skill text only — hooks, the MCP server, and instinct learning are Claude Code-only.`,
    ];
    if (spec.mode === "whole") {
        const content = targetId === "cursor" ? renderCursorRule(skillMd) : `${stripFrontmatter(skillMd).trim()}\n`;
        writes.push({ relPath: spec.relPath, content });
    }
    else {
        const block = renderManagedBlock(skillMd);
        writes.push({ relPath: spec.relPath, content: mergeManagedBlock(readExisting(spec.relPath), block) });
    }
    if (targetId === "aider") {
        const existingConf = readExisting(AIDER_CONF_PATH);
        if (existingConf === null) {
            writes.push({ relPath: AIDER_CONF_PATH, content: AIDER_MINIMAL_CONF });
        }
        else {
            notes.push(`${AIDER_CONF_PATH} already exists — add CONVENTIONS.md to its \`read:\` list yourself (e.g. \`read: [CONVENTIONS.md]\`); the installer never rewrites an existing conf.`);
        }
    }
    return { notes, writes };
}
