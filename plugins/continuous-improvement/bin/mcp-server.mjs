#!/usr/bin/env node
/**
 * continuous-improvement MCP Server
 *
 * Exposes instincts, observations, and reflection as MCP tools + resources.
 * Two modes: beginner (3 tools) and expert (all tools).
 *
 * Usage:
 *   node bin/mcp-server.mjs                  # default: beginner mode
 *   node bin/mcp-server.mjs --mode expert    # all tools
 *   node bin/mcp-server.mjs --mode beginner  # explicit beginner
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { PACKAGE_NAME, VERSION, getToolDefinitions, isPluginMode, } from "../lib/plugin-metadata.mjs";
function getHomeDir() {
    return process.env.HOME || process.env.USERPROFILE || homedir();
}
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
function getString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}
function getNumber(value, fallback = 0) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function getBoolean(value, fallback = false) {
    return typeof value === "boolean" ? value : fallback;
}
function toInstinct(value) {
    const record = asRecord(value);
    if (!record) {
        return null;
    }
    const id = getString(record.id);
    const trigger = getString(record.trigger);
    const body = getString(record.body);
    if (!id || !trigger || !body) {
        return null;
    }
    let confidence = getNumber(record.confidence, 0.6);
    // Validate confidence bounds (0.0 - 0.9)
    confidence = Math.max(0, Math.min(0.9, confidence));
    const scopeValue = getString(record.scope);
    const scope = scopeValue === "global" || scopeValue === "project"
        ? scopeValue
        : undefined;
    return {
        id,
        trigger,
        body,
        confidence,
        domain: getString(record.domain) || undefined,
        source: getString(record.source) || undefined,
        scope,
        project_id: getString(record.project_id) || undefined,
        created: getString(record.created) || undefined,
        last_seen: getString(record.last_seen) || undefined,
        observation_count: typeof record.observation_count === "number" ? record.observation_count : undefined,
    };
}
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INSTINCTS_DIR = join(getHomeDir(), ".claude", "instincts");
const GLOBAL_DIR = join(INSTINCTS_DIR, "global");
const PACKS_DIR = join(REPO_ROOT, "instinct-packs");
const PLANNING_TEMPLATES_DIR = join(REPO_ROOT, "templates", "planning-with-files");
const DEFAULT_PLANNING_PHASES = ["Research", "Plan", "Execute", "Verify", "Reflect"];
const PLANNING_FILES = {
    taskPlan: "task_plan.md",
    findings: "findings.md",
    progress: "progress.md",
};
const args = process.argv.slice(2);
const modeIndex = args.indexOf("--mode");
const requestedMode = args[modeIndex + 1];
const MODE = isPluginMode(requestedMode) ? requestedMode : "beginner";
function getProjectHash() {
    try {
        const root = execSync("git rev-parse --show-toplevel 2>/dev/null", { encoding: "utf8" }).trim();
        const hash = createHash("sha256").update(root).digest("hex").slice(0, 12);
        return { root, hash, name: basename(root) };
    }
    catch {
        return { root: "global", hash: "global", name: "global" };
    }
}
function readInstincts(projectHash) {
    const instincts = [];
    const dirs = [GLOBAL_DIR];
    if (projectHash !== "global") {
        dirs.push(join(INSTINCTS_DIR, projectHash));
    }
    for (const dir of dirs) {
        if (!existsSync(dir)) {
            continue;
        }
        for (const file of readdirSync(dir)) {
            if (!file.endsWith(".yaml")) {
                continue;
            }
            try {
                const parsed = parseYamlInstinct(readFileSync(join(dir, file), "utf8"));
                if (parsed) {
                    instincts.push(parsed);
                }
            }
            catch {
                // skip malformed files
            }
        }
    }
    return instincts;
}
function parseYamlInstinct(content) {
    const lines = content.split("\n");
    const meta = {};
    let body = "";
    let inBody = false;
    for (const line of lines) {
        if (line.trim() === "---" && Object.keys(meta).length > 0) {
            inBody = true;
            continue;
        }
        if (inBody) {
            body += `${line}\n`;
            continue;
        }
        const match = line.match(/^(\w[\w_-]*):\s*(.+)/);
        if (!match) {
            continue;
        }
        const rawValue = match[2].trim().replace(/^["']|["']$/g, "");
        const value = rawValue !== "" && !Number.isNaN(Number(rawValue))
            ? Number(rawValue)
            : rawValue;
        meta[match[1]] = value;
    }
    if (typeof meta.id !== "string" || typeof meta.trigger !== "string") {
        return null;
    }
    return {
        id: meta.id,
        trigger: meta.trigger,
        body: body.trim(),
        confidence: typeof meta.confidence === "number" ? meta.confidence : 0.6,
        domain: typeof meta.domain === "string" ? meta.domain : undefined,
        source: typeof meta.source === "string" ? meta.source : undefined,
        scope: meta.scope === "global" || meta.scope === "project" ? meta.scope : undefined,
        project_id: typeof meta.project_id === "string" ? meta.project_id : undefined,
        created: typeof meta.created === "string" ? meta.created : undefined,
        last_seen: typeof meta.last_seen === "string" ? meta.last_seen : undefined,
        observation_count: typeof meta.observation_count === "number" ? meta.observation_count : undefined,
    };
}
function countObservations(projectHash) {
    const observationsFile = join(INSTINCTS_DIR, projectHash, "observations.jsonl");
    if (!existsSync(observationsFile)) {
        return 0;
    }
    try {
        const content = readFileSync(observationsFile, "utf8");
        return content.split("\n").filter((line) => line.trim().length > 0).length;
    }
    catch {
        return 0;
    }
}
function getRecentObservations(projectHash, limit = 50) {
    const observationsFile = join(INSTINCTS_DIR, projectHash, "observations.jsonl");
    if (!existsSync(observationsFile)) {
        return [];
    }
    try {
        const lines = readFileSync(observationsFile, "utf8")
            .split("\n")
            .filter((line) => line.trim().length > 0);
        return lines.slice(-limit).flatMap((line) => {
            try {
                return [JSON.parse(line)];
            }
            catch {
                return [];
            }
        });
    }
    catch {
        return [];
    }
}
function detectLevel(projectHash) {
    const observationCount = countObservations(projectHash);
    const instincts = readInstincts(projectHash);
    const hasHighConfidence = instincts.some((instinct) => instinct.confidence >= 0.7);
    const hasMidConfidence = instincts.some((instinct) => instinct.confidence >= 0.5 && instinct.confidence < 0.7);
    if (hasHighConfidence) {
        return "AUTO-APPLY";
    }
    if (hasMidConfidence) {
        return "SUGGEST";
    }
    if (observationCount >= 20 || instincts.length > 0) {
        return "ANALYZE";
    }
    return "CAPTURE";
}
function writeInstinct(projectHash, instinct) {
    const scope = instinct.scope === "global" ? "global" : "project";
    const dir = scope === "global" ? GLOBAL_DIR : join(INSTINCTS_DIR, projectHash);
    mkdirSync(dir, { recursive: true });
    const today = new Date().toISOString().split("T")[0];
    const yaml = [
        `id: ${instinct.id}`,
        `trigger: "${instinct.trigger}"`,
        `confidence: ${instinct.confidence}`,
        `domain: ${instinct.domain || "workflow"}`,
        `source: ${instinct.source || "manual"}`,
        `scope: ${scope}`,
        `project_id: ${projectHash}`,
        `created: "${instinct.created || today}"`,
        `last_seen: "${instinct.last_seen || today}"`,
        `observation_count: ${instinct.observation_count || 1}`,
        "---",
        instinct.body,
    ].join("\n");
    writeFileSync(join(dir, `${instinct.id}.yaml`), `${yaml}\n`);
}
function updateInstinctConfidence(projectHash, instinctId, delta) {
    const instincts = readInstincts(projectHash);
    const instinct = instincts.find((candidate) => candidate.id === instinctId);
    if (!instinct) {
        return null;
    }
    const newConfidence = Math.max(0, Math.min(0.9, instinct.confidence + delta));
    instinct.confidence = Math.round(newConfidence * 100) / 100;
    instinct.last_seen = new Date().toISOString().split("T")[0];
    writeInstinct(projectHash, instinct);
    return instinct;
}
function getWorkspaceRoot() {
    try {
        const root = execSync("git rev-parse --show-toplevel 2>/dev/null", { encoding: "utf8" }).trim();
        return root || process.cwd();
    }
    catch {
        return process.cwd();
    }
}
function readPlanningTemplate(fileName, fallback) {
    const templatePath = join(PLANNING_TEMPLATES_DIR, fileName);
    if (!existsSync(templatePath)) {
        return fallback;
    }
    try {
        return readFileSync(templatePath, "utf8");
    }
    catch {
        return fallback;
    }
}
function replaceTemplateToken(template, token, value) {
    return template.split(`{{${token}}}`).join(value);
}
function getToday() {
    return new Date().toISOString().split("T")[0];
}
function normalizePhases(value) {
    if (!Array.isArray(value)) {
        return [...DEFAULT_PLANNING_PHASES];
    }
    const phases = value
        .map((phase) => typeof phase === "string" ? phase.trim() : "")
        .filter((phase) => phase.length > 0);
    return phases.length > 0 ? phases : [...DEFAULT_PLANNING_PHASES];
}
function formatPhaseChecklist(phases) {
    return phases.map((phase) => `- [ ] ${phase}`).join("\n");
}
function renderTaskPlan(goal, phases) {
    const fallback = `# Task Plan

## Goal
{{goal}}

## Status
{{status}}

## Phases
{{phases}}

## Key Questions
- [ ] What existing implementation or context should be reviewed first?
- [ ] What constraints or risks need validation before execution?
- [ ] What verification proves the task is complete?

## Decisions Made
- None yet.

## Errors Encountered
| Error | Attempt | Resolution |
| --- | --- | --- |
| None yet | - | - |
`;
    let template = readPlanningTemplate(PLANNING_FILES.taskPlan, fallback);
    template = replaceTemplateToken(template, "goal", goal);
    template = replaceTemplateToken(template, "status", "Not started");
    template = replaceTemplateToken(template, "phases", formatPhaseChecklist(phases));
    template = replaceTemplateToken(template, "date", getToday());
    return template.endsWith("\n") ? template : `${template}\n`;
}
function renderFindings() {
    const fallback = `# Findings

## Research Notes
- Created on {{date}}.
- Record source links, code references, and synthesized findings here.

## Sources
- Add links and short summaries here.
`;
    let template = readPlanningTemplate(PLANNING_FILES.findings, fallback);
    template = replaceTemplateToken(template, "date", getToday());
    return template.endsWith("\n") ? template : `${template}\n`;
}
function renderProgress() {
    const fallback = `# Progress

## Session Log
- {{date}}: Initialized planning files.

## Verification Notes
- Record commands, tests, outputs, and checkpoints here.
`;
    let template = readPlanningTemplate(PLANNING_FILES.progress, fallback);
    template = replaceTemplateToken(template, "date", getToday());
    return template.endsWith("\n") ? template : `${template}\n`;
}
function writePlanningFile(filePath, content, force) {
    const alreadyExists = existsSync(filePath);
    if (alreadyExists && !force) {
        return "preserved";
    }
    writeFileSync(filePath, content);
    return alreadyExists ? "overwritten" : "created";
}
function getMarkdownSection(content, heading) {
    const lines = content.split(/\r?\n/);
    const sectionLines = [];
    let inSection = false;
    for (const line of lines) {
        if (line.startsWith("## ")) {
            if (inSection) {
                break;
            }
            inSection = line.trim() === `## ${heading}`;
            continue;
        }
        if (inSection) {
            sectionLines.push(line);
        }
    }
    return sectionLines.join("\n").trim();
}
function parseTaskPlan(content) {
    const checkedPhases = [];
    const uncheckedPhases = [];
    for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^- \[([ xX])\] (.+)$/);
        if (!match) {
            continue;
        }
        const phase = match[2].trim();
        if (match[1].toLowerCase() === "x") {
            checkedPhases.push(phase);
        }
        else {
            uncheckedPhases.push(phase);
        }
    }
    const inlineStatus = content.match(/^\*\*Status:\*\*\s*(.+)$/m) ?? content.match(/^Status:\s*(.+)$/m);
    const statusFromSection = getMarkdownSection(content, "Status")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
    return {
        status: inlineStatus?.[1]?.trim() || statusFromSection || "Unknown",
        checkedPhases,
        uncheckedPhases,
    };
}
function hasMeaningfulContent(content, placeholders) {
    return content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .filter((line) => !line.startsWith("#"))
        .filter((line) => !/^[-|: ]+$/.test(line))
        .some((line) => line !== "- None yet." &&
        line !== "| None yet | - | - |" &&
        !placeholders.some((placeholder) => line.includes(placeholder)));
}
function getAllTools() {
    return getToolDefinitions(MODE);
}
function text(value) {
    return { content: [{ type: "text", text: value }] };
}
function error(value) {
    return { content: [{ type: "text", text: value }], isError: true };
}
function handleTool(name, params) {
    const project = getProjectHash();
    switch (name) {
        case "ci_status": {
            const level = detectLevel(project.hash);
            const observationCount = countObservations(project.hash);
            const instincts = readInstincts(project.hash);
            const byConfidence = {
                silent: instincts.filter((instinct) => instinct.confidence < 0.5).length,
                suggest: instincts.filter((instinct) => instinct.confidence >= 0.5 && instinct.confidence < 0.7).length,
                autoApply: instincts.filter((instinct) => instinct.confidence >= 0.7).length,
            };
            return text([
                "## continuous-improvement Status",
                "",
                `**Project:** ${project.name}`,
                `**Level:** ${level}`,
                `**Observations:** ${observationCount}`,
                `**Instincts:** ${instincts.length} total`,
                `  - Silent (< 0.5): ${byConfidence.silent}`,
                `  - Suggest (0.5-0.69): ${byConfidence.suggest}`,
                `  - Auto-apply (0.7+): ${byConfidence.autoApply}`,
                "",
                `**Mode:** ${MODE}`,
                level === "CAPTURE" ? "\n_Keep working — hooks are capturing. Analysis begins at 20 observations._" : "",
            ].join("\n"));
        }
        case "ci_instincts": {
            const minConfidence = getNumber(params.min_confidence, 0);
            const instincts = readInstincts(project.hash).filter((instinct) => instinct.confidence >= minConfidence);
            if (instincts.length === 0) {
                return text("No instincts found. Keep working — the system learns from your sessions.");
            }
            const lines = instincts
                .sort((left, right) => right.confidence - left.confidence)
                .map((instinct) => {
                const behavior = instinct.confidence >= 0.7
                    ? "AUTO-APPLY"
                    : instinct.confidence >= 0.5
                        ? "SUGGEST"
                        : "silent";
                return `- **${instinct.id}** (${instinct.confidence}) [${behavior}]\n  Trigger: ${instinct.trigger}\n  ${instinct.body}`;
            });
            return text(`## Instincts for ${project.name}\n\n${lines.join("\n\n")}`);
        }
        case "ci_reflect": {
            const summary = getString(params.summary, "No summary provided");
            const reflection = [
                `## Reflection — ${new Date().toISOString().split("T")[0]}`,
                "",
                `**Session summary:** ${summary}`,
                "",
                "Use this template to reflect:",
                "- **What worked:**",
                "- **What failed:**",
                "- **What I'd do differently:**",
                "- **Rule to add:** (becomes an instinct at 0.6 confidence)",
                "- **Iteration — Next best recommendation:** (one concrete next action, or `None — goal met, stop.`)",
            ].join("\n");
            return text(reflection);
        }
        case "ci_reinforce": {
            if (MODE !== "expert") {
                return error("ci_reinforce requires expert mode. Start server with --mode expert");
            }
            const instinctId = getString(params.instinct_id);
            const delta = getBoolean(params.accepted) ? 0.15 : -0.1;
            const updated = updateInstinctConfidence(project.hash, instinctId, delta);
            if (!updated) {
                return error(`Instinct "${instinctId}" not found`);
            }
            return text(`${getBoolean(params.accepted) ? "Accepted" : "Rejected"} **${updated.id}** — confidence now ${updated.confidence}`);
        }
        case "ci_create_instinct": {
            if (MODE !== "expert") {
                return error("ci_create_instinct requires expert mode");
            }
            const scope = getString(params.scope) === "global" ? "global" : "project";
            const instinct = {
                id: getString(params.id),
                trigger: getString(params.trigger),
                body: getString(params.body),
                confidence: getNumber(params.confidence, 0.6),
                domain: getString(params.domain, "workflow"),
                source: "manual",
                scope,
                observation_count: 1,
            };
            writeInstinct(project.hash, instinct);
            return text(`Created instinct **${instinct.id}** with confidence ${instinct.confidence}`);
        }
        case "ci_observations": {
            if (MODE !== "expert") {
                return error("ci_observations requires expert mode");
            }
            const limit = getNumber(params.limit, 20);
            const observations = getRecentObservations(project.hash, limit);
            if (observations.length === 0) {
                return text("No observations yet. Hooks capture tool calls automatically.");
            }
            const lines = observations.map((observation) => `[${observation.ts}] ${observation.event} — ${observation.tool}`);
            return text(`## Recent Observations (${observations.length})\n\n${lines.join("\n")}`);
        }
        case "ci_export": {
            if (MODE !== "expert") {
                return error("ci_export requires expert mode");
            }
            const scope = getString(params.scope, "all");
            let instincts = readInstincts(project.hash);
            if (scope === "project") {
                instincts = instincts.filter((instinct) => instinct.scope === "project");
            }
            if (scope === "global") {
                instincts = instincts.filter((instinct) => instinct.scope === "global");
            }
            return text(JSON.stringify(instincts, null, 2));
        }
        case "ci_import": {
            if (MODE !== "expert") {
                return error("ci_import requires expert mode");
            }
            const rawJson = getString(params.instincts_json);
            let parsed;
            try {
                parsed = JSON.parse(rawJson);
            }
            catch {
                return error("Invalid JSON. Provide a JSON array of instinct objects.");
            }
            if (!Array.isArray(parsed)) {
                return error("Expected a JSON array");
            }
            const scope = getString(params.scope, "project") === "global" ? "global" : "project";
            const existing = readInstincts(project.hash);
            const existingIds = new Set(existing.map((instinct) => instinct.id));
            let imported = 0;
            for (const candidate of parsed) {
                const instinct = toInstinct(candidate);
                if (!instinct || existingIds.has(instinct.id)) {
                    continue;
                }
                instinct.scope = instinct.scope || scope;
                instinct.source = "imported";
                writeInstinct(project.hash, instinct);
                imported++;
            }
            return text(`Imported ${imported} instincts (${parsed.length - imported} skipped as duplicates)`);
        }
        case "ci_plan_init": {
            if (MODE !== "expert") {
                return error("ci_plan_init requires expert mode");
            }
            const goal = getString(params.goal).trim();
            if (!goal) {
                return error("goal is required");
            }
            const phases = normalizePhases(params.phases);
            const force = getBoolean(params.force, false);
            const workspaceRoot = getWorkspaceRoot();
            const taskPlanStatus = writePlanningFile(join(workspaceRoot, PLANNING_FILES.taskPlan), renderTaskPlan(goal, phases), force);
            const findingsStatus = writePlanningFile(join(workspaceRoot, PLANNING_FILES.findings), renderFindings(), force);
            const progressStatus = writePlanningFile(join(workspaceRoot, PLANNING_FILES.progress), renderProgress(), force);
            return text([
                "## Planning-With-Files Initialized",
                "",
                `**Project root:** ${workspaceRoot}`,
                `**Goal:** ${goal}`,
                `**Force overwrite:** ${force ? "yes" : "no"}`,
                "",
                "**Files:**",
                `- ${PLANNING_FILES.taskPlan}: ${taskPlanStatus}`,
                `- ${PLANNING_FILES.findings}: ${findingsStatus}`,
                `- ${PLANNING_FILES.progress}: ${progressStatus}`,
                "",
                "**Phases:**",
                ...phases.map((phase) => `- [ ] ${phase}`),
            ].join("\n"));
        }
        case "ci_plan_status": {
            if (MODE !== "expert") {
                return error("ci_plan_status requires expert mode");
            }
            const workspaceRoot = getWorkspaceRoot();
            const includeContents = getBoolean(params.include_contents, false);
            const taskPlanPath = join(workspaceRoot, PLANNING_FILES.taskPlan);
            const findingsPath = join(workspaceRoot, PLANNING_FILES.findings);
            const progressPath = join(workspaceRoot, PLANNING_FILES.progress);
            const taskPlanExists = existsSync(taskPlanPath);
            const findingsExists = existsSync(findingsPath);
            const progressExists = existsSync(progressPath);
            if (!taskPlanExists && !findingsExists && !progressExists) {
                return text(`No planning files found in ${workspaceRoot}. Run ci_plan_init or /planning-with-files to create ${PLANNING_FILES.taskPlan}, ${PLANNING_FILES.findings}, and ${PLANNING_FILES.progress}.`);
            }
            const taskPlanContent = taskPlanExists ? readFileSync(taskPlanPath, "utf8") : "";
            const findingsContent = findingsExists ? readFileSync(findingsPath, "utf8") : "";
            const progressContent = progressExists ? readFileSync(progressPath, "utf8") : "";
            const summary = taskPlanExists
                ? parseTaskPlan(taskPlanContent)
                : { status: "No task plan yet", checkedPhases: [], uncheckedPhases: [] };
            const findingsState = findingsExists
                ? hasMeaningfulContent(findingsContent, [
                    "Created on",
                    "Record source links, code references, and synthesized findings here.",
                    "Add links and short summaries here.",
                ])
                    ? "has notes"
                    : "template only"
                : "missing";
            const progressState = progressExists
                ? hasMeaningfulContent(progressContent, [
                    "Initialized planning files.",
                    "Record commands, tests, outputs, and checkpoints here.",
                ])
                    ? "has entries"
                    : "template only"
                : "missing";
            const lines = [
                "## Planning-With-Files Status",
                "",
                `**Project root:** ${workspaceRoot}`,
                "",
                "**Files:**",
                `- ${PLANNING_FILES.taskPlan}: ${taskPlanExists ? "present" : "missing"}`,
                `- ${PLANNING_FILES.findings}: ${findingsExists ? "present" : "missing"} (${findingsState})`,
                `- ${PLANNING_FILES.progress}: ${progressExists ? "present" : "missing"} (${progressState})`,
                "",
                `**Status:** ${summary.status}`,
                `**Completed phases:** ${summary.checkedPhases.length}/${summary.checkedPhases.length + summary.uncheckedPhases.length}`,
                `**Checked phases:** ${summary.checkedPhases.length > 0 ? summary.checkedPhases.join(", ") : "(none)"}`,
                `**Remaining phases:** ${summary.uncheckedPhases.length > 0 ? summary.uncheckedPhases.join(", ") : "(none)"}`,
            ];
            if (includeContents) {
                const filesToInclude = [
                    [PLANNING_FILES.taskPlan, taskPlanContent],
                    [PLANNING_FILES.findings, findingsContent],
                    [PLANNING_FILES.progress, progressContent],
                ];
                for (const [fileName, content] of filesToInclude) {
                    if (!content) {
                        continue;
                    }
                    lines.push("", `## ${fileName}`, "```md", content.trimEnd(), "```");
                }
            }
            return text(lines.join("\n"));
        }
        case "ci_dashboard": {
            if (MODE !== "expert") {
                return error("ci_dashboard requires expert mode");
            }
            const level = detectLevel(project.hash);
            const observationCount = countObservations(project.hash);
            const instincts = readInstincts(project.hash);
            const byConfidence = {
                auto: instincts.filter((instinct) => instinct.confidence >= 0.7),
                suggest: instincts.filter((instinct) => instinct.confidence >= 0.5 && instinct.confidence < 0.7),
                silent: instincts.filter((instinct) => instinct.confidence < 0.5),
            };
            const globalCount = instincts.filter((instinct) => instinct.scope === "global").length;
            const projectCount = instincts.length - globalCount;
            const today = Date.now();
            const stale = instincts.filter((instinct) => {
                if (!instinct.last_seen) {
                    return false;
                }
                const diff = (today - new Date(instinct.last_seen).getTime()) / (1000 * 60 * 60 * 24);
                return diff > 30;
            });
            const autoBar = "█".repeat(Math.min(10, byConfidence.auto.length)) + "░".repeat(Math.max(0, 10 - byConfidence.auto.length));
            const suggestBar = "█".repeat(Math.min(10, byConfidence.suggest.length)) + "░".repeat(Math.max(0, 10 - byConfidence.suggest.length));
            const silentBar = "█".repeat(Math.min(10, byConfidence.silent.length)) + "░".repeat(Math.max(0, 10 - byConfidence.silent.length));
            const top5 = instincts
                .sort((left, right) => right.confidence - left.confidence)
                .slice(0, 5)
                .map((instinct) => `  ${"█".repeat(Math.round(instinct.confidence * 10)) + "░".repeat(10 - Math.round(instinct.confidence * 10))} ${instinct.confidence.toFixed(2)} ${instinct.id}`)
                .join("\n");
            let packInfo = "";
            if (existsSync(PACKS_DIR)) {
                const packs = readdirSync(PACKS_DIR)
                    .filter((file) => file.endsWith(".json"))
                    .map((file) => file.replace(".json", ""));
                packInfo = `\n  Available packs: ${packs.join(", ")}`;
            }
            return text([
                "╔══════════════════════════════════════════════════════════════╗",
                "║              continuous-improvement Dashboard                ║",
                "╠══════════════════════════════════════════════════════════════╣",
                "║                                                              ║",
                `║  Project: ${project.name.padEnd(20)} Level: ${level.padEnd(12)}   ║`,
                `║  Sessions: ~${String(Math.floor(observationCount / 10)).padEnd(17)} Mode: ${MODE.padEnd(13)}  ║`,
                "║                                                              ║",
                "║  ┌─ Observations ────────────────────────────────────────┐   ║",
                `║  │  Total: ${String(observationCount).padEnd(48)} │   ║`,
                "║  └───────────────────────────────────────────────────────┘   ║",
                "║                                                              ║",
                "║  ┌─ Instincts ───────────────────────────────────────────┐   ║",
                `║  │  Total: ${String(instincts.length).padEnd(48)} │   ║`,
                `║  │  ${autoBar} Auto-apply (0.7+): ${String(byConfidence.auto.length).padEnd(20)} │   ║`,
                `║  │  ${suggestBar} Suggest (0.5-0.69): ${String(byConfidence.suggest.length).padEnd(19)} │   ║`,
                `║  │  ${silentBar} Silent (< 0.5): ${String(byConfidence.silent.length).padEnd(23)} │   ║`,
                `║  │  Global: ${String(globalCount).padEnd(10)} Project: ${String(projectCount).padEnd(28)} │   ║`,
                "║  └───────────────────────────────────────────────────────┘   ║",
                "║                                                              ║",
                instincts.length > 0
                    ? [
                        "║  ┌─ Top Instincts ───────────────────────────────────────┐   ║",
                        ...top5.split("\n").map((line) => `║  │${line.padEnd(56)}│   ║`),
                        "║  └───────────────────────────────────────────────────────┘   ║",
                    ].join("\n")
                    : "",
                "║                                                              ║",
                "║  ┌─ Health ──────────────────────────────────────────────┐   ║",
                `║  │  Stale (30+ days): ${String(stale.length).padEnd(38)} │   ║`,
                "║  └───────────────────────────────────────────────────────┘   ║",
                packInfo ? `║${packInfo.padEnd(63)}║` : "",
                "║                                                              ║",
                "╚══════════════════════════════════════════════════════════════╝",
            ].filter(Boolean).join("\n"));
        }
        case "ci_load_pack": {
            if (MODE !== "expert") {
                return error("ci_load_pack requires expert mode");
            }
            const packName = getString(params.pack);
            const packPath = join(PACKS_DIR, `${packName}.json`);
            if (!existsSync(packPath)) {
                const available = existsSync(PACKS_DIR)
                    ? readdirSync(PACKS_DIR)
                        .filter((file) => file.endsWith(".json"))
                        .map((file) => file.replace(".json", ""))
                    : [];
                return error(`Unknown pack: ${packName}. Available: ${available.join(", ")}`);
            }
            const packInstincts = JSON.parse(readFileSync(packPath, "utf8"));
            const existing = readInstincts(project.hash);
            const existingIds = new Set(existing.map((instinct) => instinct.id));
            let loaded = 0;
            for (const candidate of packInstincts) {
                const instinct = toInstinct(candidate);
                if (!instinct || existingIds.has(instinct.id)) {
                    continue;
                }
                instinct.source = `pack-${packName}`;
                instinct.scope = "project";
                instinct.observation_count = 0;
                writeInstinct(project.hash, instinct);
                loaded++;
            }
            return text(`Loaded ${loaded}/${packInstincts.length} instincts from **${packName}** pack (${packInstincts.length - loaded} already existed)`);
        }
        default:
            return error(`Unknown tool: ${name}`);
    }
}
const rl = createInterface({ input: process.stdin, terminal: false });
let buffer = "";
rl.on("line", (line) => {
    buffer += line;
    try {
        const message = JSON.parse(buffer);
        buffer = "";
        handleMessage(message);
    }
    catch {
        // incomplete JSON, keep buffering
    }
});
function send(response) {
    const json = JSON.stringify(response);
    process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}
function handleMessage(message) {
    const id = message.id;
    const method = message.method;
    const params = asRecord(message.params) ?? {};
    switch (method) {
        case "initialize":
            send({
                jsonrpc: "2.0",
                id,
                result: {
                    protocolVersion: "2024-11-05",
                    capabilities: {
                        tools: { listChanged: false },
                        resources: { subscribe: false, listChanged: false },
                    },
                    serverInfo: {
                        name: PACKAGE_NAME,
                        version: VERSION,
                    },
                },
            });
            break;
        case "notifications/initialized":
            break;
        case "tools/list":
            send({
                jsonrpc: "2.0",
                id,
                result: { tools: getAllTools() },
            });
            break;
        case "tools/call": {
            const toolName = getString(params.name);
            const toolArgs = asRecord(params.arguments) ?? {};
            const result = handleTool(toolName, toolArgs);
            send({ jsonrpc: "2.0", id, result });
            break;
        }
        case "resources/list": {
            const project = getProjectHash();
            send({
                jsonrpc: "2.0",
                id,
                result: {
                    resources: [
                        {
                            uri: `instincts://project/${project.hash}`,
                            name: `${project.name} instincts`,
                            description: `Learned instincts for ${project.name}`,
                            mimeType: "application/json",
                        },
                        {
                            uri: "instincts://global",
                            name: "Global instincts",
                            description: "Cross-project instincts",
                            mimeType: "application/json",
                        },
                    ],
                },
            });
            break;
        }
        case "resources/read": {
            const uri = getString(params.uri);
            const project = getProjectHash();
            const instincts = uri === "instincts://global"
                ? readInstincts("global").filter((instinct) => instinct.scope === "global")
                : readInstincts(project.hash);
            send({
                jsonrpc: "2.0",
                id,
                result: {
                    contents: [
                        {
                            uri,
                            text: JSON.stringify(instincts, null, 2),
                            mimeType: "application/json",
                        },
                    ],
                },
            });
            break;
        }
        default:
            if (id !== undefined) {
                send({
                    jsonrpc: "2.0",
                    id,
                    error: { code: -32601, message: `Method not found: ${method}` },
                });
            }
    }
}
console.error(`${PACKAGE_NAME} MCP server v${VERSION} started (mode: ${MODE})`);
