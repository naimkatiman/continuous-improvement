#!/usr/bin/env node
/**
 * continuous-improvement MCP Server
 *
 * Exposes instincts, observations, and reflection as MCP tools + resources.
 * Two modes: beginner (4 tools) and expert (all tools).
 *
 * Usage:
 *   node bin/mcp-server.mjs                  # default: beginner mode
 *   node bin/mcp-server.mjs --mode expert    # all tools
 *   node bin/mcp-server.mjs --mode beginner  # explicit beginner
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { PACKAGE_NAME, VERSION, getToolDefinitions, isPluginMode, } from "../lib/plugin-metadata.mjs";
import { formatDriftReport, parseGoalFromPlan, scoreObservations, } from "../lib/goal-state.mjs";
import { buildIndex, formatRecallHits, parseSince, query as queryRecall, } from "../lib/recall-index.mjs";
import { draftFromCandidate, extractTrajectories, findCandidates, formatCandidates, serializeDraft, } from "../lib/skill-distill.mjs";
import { MAX_CLEARED_FILES, clearFiles, resolveSessionDir, } from "../lib/gateguard-state.mjs";
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
// Draft ids are derived from slugified tool n-grams (src/lib/skill-distill.mts)
// and are joined into a filesystem path, so a caller-supplied id must match the
// safe shape before it is used to read/write/delete a draft file.
function isSafeDraftId(id) {
    return /^draft-[a-z0-9-]+$/.test(id);
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
    // Clamp a non-positive or non-integer limit to the default. slice(-0) would
    // otherwise return the ENTIRE history (the limit:0 boundary), and a negative
    // limit would drop rows from the front instead of taking the tail. ci_goal_check
    // pre-rejects bad limits with a clear error(); this guards ci_observations and
    // any other caller that passes a user-supplied limit straight through.
    const cappedLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;
    const observationsFile = join(INSTINCTS_DIR, projectHash, "observations.jsonl");
    if (!existsSync(observationsFile)) {
        return [];
    }
    try {
        const lines = readFileSync(observationsFile, "utf8")
            .split("\n")
            .filter((line) => line.trim().length > 0);
        return lines.slice(-cappedLimit).flatMap((line) => {
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
function readDistillObservations(projectHash) {
    return getRecentObservations(projectHash, 100000).map((observation) => ({
        ts: getString(observation.ts),
        session: getString(observation.session),
        session_id: getString(observation.session_id),
        tool: getString(observation.tool),
        input_summary: getString(observation.input_summary),
        output_summary: getString(observation.output_summary),
    }));
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
                "- **Iteration — Next best recommendations (ranked, top 3):**",
                "  1. <primary — strongest next core-development move>",
                "  2. <alternative — different angle>",
                "  3. <alternative — smaller or larger scope>",
                "  (or just `1. None — goal met, stop.` if the original goal is fully resolved)",
            ].join("\n");
            return text(reflection);
        }
        case "ci_gateguard_clear": {
            // Beginner-available on purpose: the GateGuard hook fires for every
            // install, so the clearance action must too. Resolves the session dir via
            // gateguard-state (canonical), the same way the hook does, so the marker
            // lands where the hook looks regardless of how each process spelled the
            // project root.
            const rawList = Array.isArray(params.file_paths) ? params.file_paths : [];
            const listPaths = rawList.filter((value) => typeof value === "string" && value.length > 0);
            const single = getString(params.file_path).trim();
            const paths = single ? [...listPaths, single] : listPaths;
            if (paths.length === 0) {
                return error("file_paths is required — pass the file path(s) named in the GateGuard block reason, e.g. { file_paths: [\"src/x.ts\"] }.");
            }
            const sessionDir = resolveSessionDir();
            const { cleared, skippedForCap } = clearFiles(sessionDir, paths);
            const lines = [
                "## GateGuard clearance",
                "",
                `**State file:** ${join(sessionDir, "gateguard-session.json")}`,
                `**Cleared (${cleared.length}):** ${cleared.length > 0 ? cleared.join(", ") : "(none — already cleared)"}`,
            ];
            if (skippedForCap.length > 0) {
                lines.push(`**Skipped — session cap of ${MAX_CLEARED_FILES} reached (${skippedForCap.length}):** ${skippedForCap.join(", ")}`, "Start a new session to reset the gate.");
            }
            lines.push("", "Retry the Edit/Write now — it will pass.");
            return text(lines.join("\n"));
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
        case "ci_goal_check": {
            if (MODE !== "expert") {
                return error("ci_goal_check requires expert mode");
            }
            const limit = getNumber(params.limit, 30);
            if (!Number.isInteger(limit) || limit <= 0) {
                return error(`limit must be a positive integer; got ${limit}. Omit it to score the default 30 most recent observations.`);
            }
            const explicit = getString(params.goal_file).trim();
            const workspaceRoot = getWorkspaceRoot();
            const candidates = explicit
                ? [explicit]
                : [
                    join(workspaceRoot, PLANNING_FILES.taskPlan),
                    join(INSTINCTS_DIR, project.hash, "goal.md"),
                ];
            let goalContent = "";
            let goalSource = "";
            for (const candidate of candidates) {
                if (!existsSync(candidate)) {
                    continue;
                }
                try {
                    goalContent = readFileSync(candidate, "utf8");
                    goalSource = candidate;
                    break;
                }
                catch {
                    // try the next candidate
                }
            }
            if (!goalContent) {
                return text(`No goal source found. Looked for: ${candidates.join(", ")}.\nRun ci_plan_init (or /planning-with-files) to create ${PLANNING_FILES.taskPlan} with a '## Goal' section.`);
            }
            const goal = parseGoalFromPlan(goalContent);
            if (!goal) {
                return text(`Found ${goalSource} but it has no '## Goal' section. Add one — ci_plan_init seeds it. Optional '## Goal Keywords' and '## Goal Scope' sections sharpen the drift signal.`);
            }
            const goalObservations = getRecentObservations(project.hash, limit).map((observation) => ({
                ts: getString(observation.ts),
                tool: getString(observation.tool),
                input_summary: getString(observation.input_summary),
                output_summary: getString(observation.output_summary),
            }));
            const report = scoreObservations(goalObservations, goal, { window: limit });
            return text(`## Goal Check\n\n**Goal source:** ${goalSource}\n\n${formatDriftReport(report)}`);
        }
        case "ci_recall": {
            if (MODE !== "expert") {
                return error("ci_recall requires expert mode");
            }
            const queryString = getString(params.query).trim();
            if (!queryString) {
                return error("query is required");
            }
            const k = getNumber(params.k, 5);
            const since = getString(params.since).trim();
            if (since && parseSince(since, Date.now()) === null) {
                return error(`Could not parse since="${since}". Use an ISO timestamp (e.g. 2026-05-01) or a relative window like 7d, 24h, or 30m.`);
            }
            // Recall searches the full history, not just the recent window.
            const recallObservations = getRecentObservations(project.hash, 100000).map((observation) => ({
                ts: getString(observation.ts),
                session: getString(observation.session),
                session_id: getString(observation.session_id),
                tool: getString(observation.tool),
                input_summary: getString(observation.input_summary),
                output_summary: getString(observation.output_summary),
            }));
            if (recallObservations.length === 0) {
                return text("No observations yet. Hooks capture tool calls automatically; recall searches that history.");
            }
            const index = buildIndex(recallObservations);
            const hits = queryRecall(index, queryString, { k, since: since || undefined });
            return text(formatRecallHits(hits, queryString));
        }
        case "ci_distill_candidates": {
            if (MODE !== "expert") {
                return error("ci_distill_candidates requires expert mode");
            }
            const distillObservations = readDistillObservations(project.hash);
            const candidates = findCandidates(extractTrajectories(distillObservations));
            return text(formatCandidates(candidates));
        }
        case "ci_distill_propose": {
            if (MODE !== "expert") {
                return error("ci_distill_propose requires expert mode");
            }
            const id = getString(params.id).trim();
            if (!id) {
                return error("id is required — run ci_distill_candidates to list current candidate ids");
            }
            if (!isSafeDraftId(id)) {
                return error(`Invalid draft id "${id}". Draft ids look like draft-<slug> (lowercase letters, digits, hyphens).`);
            }
            const distillObservations = readDistillObservations(project.hash);
            const candidate = findCandidates(extractTrajectories(distillObservations)).find((entry) => entry.id === id);
            if (!candidate) {
                return error(`No candidate "${id}". Run ci_distill_candidates to list current ids.`);
            }
            const draft = serializeDraft(draftFromCandidate(candidate));
            const draftsDir = join(INSTINCTS_DIR, project.hash, "drafts");
            mkdirSync(draftsDir, { recursive: true });
            const draftPath = join(draftsDir, `${id}.yaml`);
            writeFileSync(draftPath, draft);
            return text([
                "## Draft written",
                "",
                `**Path:** ${draftPath}`,
                "",
                "Edit the body to capture the real recipe (preconditions, concrete steps, gotchas), then promote with:",
                "",
                `  ci_distill_promote id=${id}`,
                "",
                "```yaml",
                draft.trimEnd(),
                "```",
            ].join("\n"));
        }
        case "ci_distill_promote": {
            if (MODE !== "expert") {
                return error("ci_distill_promote requires expert mode");
            }
            const id = getString(params.id).trim();
            if (!id) {
                return error("id is required");
            }
            if (!isSafeDraftId(id)) {
                return error(`Invalid draft id "${id}". Draft ids look like draft-<slug> (lowercase letters, digits, hyphens).`);
            }
            const draftPath = join(INSTINCTS_DIR, project.hash, "drafts", `${id}.yaml`);
            if (!existsSync(draftPath)) {
                return error(`No draft at ${draftPath}. Run ci_distill_propose id=${id} first.`);
            }
            let parsed = null;
            try {
                parsed = parseYamlInstinct(readFileSync(draftPath, "utf8"));
            }
            catch {
                parsed = null;
            }
            if (!parsed) {
                return error(`Draft ${draftPath} could not be parsed as an instinct. Check the YAML shape.`);
            }
            const promoted = {
                ...parsed,
                confidence: 0.5,
                source: "distilled",
                scope: "project",
                observation_count: 1,
            };
            writeInstinct(project.hash, promoted);
            try {
                rmSync(draftPath);
            }
            catch {
                // best-effort cleanup; the live instinct is already written
            }
            return text(`Promoted **${promoted.id}** to a project instinct at confidence ${promoted.confidence} (SUGGEST tier). The draft has been consumed.`);
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
    // MCP stdio transport spec: newline-delimited JSON-RPC over stdout, no
    // Content-Length headers. Claude Code and every @modelcontextprotocol/sdk
    // host parse stdout line-by-line; LSP-style framing produces a silent
    // "Connecting…" hang because no line ever resolves to JSON.
    process.stdout.write(`${JSON.stringify(response)}\n`);
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
