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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAME, VERSION, getToolDefinitions, isPluginMode, } from "../lib/plugin-metadata.mjs";
import { formatDriftReport, parseGoalFromPlan, scoreObservations, } from "../lib/goal-state.mjs";
import { flatten, parseYamlInstinct } from "../lib/instinct-yaml.mjs";
import { buildIndex, formatRecallHits, parseSince, query as queryRecall, } from "../lib/recall-index.mjs";
import { draftFromCandidate, draftFromWorkflowRun, extractTrajectories, findCandidates, formatCandidates, serializeDraft, workflowRunFromObservations, } from "../lib/skill-distill.mjs";
import { mcpRootsPayload, resolveInstinctsRoot, resolveProjectRoot } from "../lib/agent-paths.mjs";
import { MAX_CLEARED_FILES, canonicalizeFileKey, clearFiles, hashProjectRoot, projectYamlFiles, resolveSessionDir, } from "../lib/gateguard-state.mjs";
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
// Instinct and draft ids become `<id>.yaml`. A file name may be at most 255
// bytes on NTFS, ext4 and APFS, and an id past that made writeFileSync throw
// ENAMETOOLONG inside the tool handler. 160 covers the longest id the plugin
// writes itself (draft-workflow-<120-char slug>, 135, in src/lib/skill-distill.mts;
// starter-pack ids stay under 40) and keeps
// <home>/.claude/instincts/<hash>/drafts/<id>.yaml under the 260-character
// Windows path limit for an ordinary user profile.
const MAX_ID_LENGTH = 160;
// Draft ids are derived from slugified tool n-grams (src/lib/skill-distill.mts)
// and are joined into a filesystem path, so a caller-supplied id must match the
// safe shape before it is used to read/write/delete a draft file.
function isSafeDraftId(id) {
    return id.length <= MAX_ID_LENGTH && /^draft-[a-z0-9-]+$/.test(id);
}
function invalidDraftId(id) {
    return `Invalid draft id "${id}". Draft ids look like draft-<slug> (lowercase letters, digits, hyphens), at most ${MAX_ID_LENGTH} characters.`;
}
// Instinct ids become a file name (`<instincts dir>/<id>.yaml`). They arrive from
// model-controlled tool arguments (ci_create_instinct, ci_import), pack files
// (ci_load_pack) and on-disk YAML (ci_reinforce, ci_distill_promote), so
// writeInstinct checks this shape before it builds a path. The rule is path
// safety, not style: any single file name with no separator, colon or leading
// dot, so "." and ".." and dot-files are out while the underscore, capital and
// dotted ids already on disk (instinct YAML is also written by hand) can still
// be reinforced, imported and promoted. It is a superset of isSafeDraftId, so a
// promoted draft keeps its id.
function isSafeInstinctId(id) {
    return id.length <= MAX_ID_LENGTH && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id);
}
const INSTINCT_ID_RULE = `An instinct id is a single file name: letters, digits, dots, underscores and hyphens, starting with a letter or digit, at most ${MAX_ID_LENGTH} characters (for example prefer-grep-before-edit).`;
function invalidInstinctId(id) {
    return `Invalid instinct id ${JSON.stringify(id)}. ${INSTINCT_ID_RULE} Nothing was written.`;
}
// Report line for the bulk writers (ci_import, ci_load_pack), which keep the
// valid entries and name the ones writeInstinct refused.
function rejectedIdsReport(rejected) {
    const ids = rejected.map((id) => JSON.stringify(id)).join(", ");
    return `Rejected ${rejected.length} with an invalid instinct id, nothing written for these: ${ids}. ${INSTINCT_ID_RULE}`;
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
    const confidence = clampConfidence(getNumber(record.confidence, 0.6));
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
// The store every hook and the observer write: CI_INSTINCTS_HOME, else
// <home>/.claude/instincts (lib/agent-paths.mjs).
const INSTINCTS_DIR = resolveInstinctsRoot(getHomeDir());
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
const GLOBAL_PROJECT = { root: "global", hash: "global", name: "global" };
// The client's first root, from its latest roots/list reply (see
// requestClientRoots), as the payload resolveProjectRoot reads. undefined until
// a usable reply arrives, and for a client without the roots capability.
let clientRoot;
// One project for every tool, resolved like a hook resolves its payload: a
// project env var, then the client's root when it is inside a repository, then
// the git toplevel of the server's cwd, then global.
function getProjectHash() {
    const root = resolveProjectRoot(clientRoot);
    if (root === "global")
        return GLOBAL_PROJECT;
    return { root, hash: hashProjectRoot(root), name: basename(root) };
}
// The directory the planning tools read and write: the project root, or the
// server's cwd when there is none (global).
function workspaceRootOf(project) {
    return project === GLOBAL_PROJECT ? process.cwd() : project.root;
}
// A missing directory holds no instincts; one that exists and cannot be read
// throws, and the request handler answers with that error.
function instinctFilesIn(dir) {
    if (!existsSync(dir)) {
        return [];
    }
    return readdirSync(dir)
        .filter((file) => file.endsWith(".yaml"))
        .sort()
        .map((file) => join(dir, file));
}
// global/ and then the project's files as the SessionStart hook lists them
// (projectYamlFiles), so a lesson the hook prints is one these tools can find.
function readInstincts(project) {
    const files = instinctFilesIn(GLOBAL_DIR);
    if (project.hash !== "global") {
        files.push(...projectYamlFiles(INSTINCTS_DIR, project.root, project.hash, instinctFilesIn));
    }
    const instincts = [];
    for (const file of files) {
        try {
            const parsed = parseYamlInstinct(readFileSync(file, "utf8"));
            if (parsed) {
                instincts.push(parsed);
            }
        }
        catch {
            // skip unreadable files
        }
    }
    return instincts;
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
                // A row that parses to null, a number or an array is not an observation.
                const row = asRecord(JSON.parse(line));
                return row ? [row] : [];
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
        event: getString(observation.event),
    }));
}
function detectLevel(project) {
    const observationCount = countObservations(project.hash);
    const instincts = readInstincts(project);
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
function writeFailed(id, reason) {
    return `Could not write instinct ${JSON.stringify(id)}: ${reason}`;
}
// Every writer stores a confidence in 0 to 0.9, the documented range.
function clampConfidence(value) {
    return Number.isNaN(value) ? 0.6 : Math.max(0, Math.min(0.9, value));
}
// The parser reads one `key: value` per line and the last one wins, so a line
// break inside a header value would add or override a key. Each becomes a space.
function headerValue(value) {
    return value.replace(/[\r\n\v\f\x85\p{Zl}\p{Zp}]+/gu, " ");
}
// The one place an instinct id becomes a filesystem path.
function writeInstinct(projectHash, instinct) {
    const scope = instinct.scope === "global" ? "global" : "project";
    const dir = scope === "global" ? GLOBAL_DIR : join(INSTINCTS_DIR, projectHash);
    const filePath = resolve(dir, `${instinct.id}.yaml`);
    // The containment check is the backstop should the id pattern ever be widened.
    if (!isSafeInstinctId(instinct.id) || dirname(filePath) !== resolve(dir)) {
        return "invalid-id";
    }
    const today = new Date().toISOString().split("T")[0];
    const yaml = [
        `id: ${instinct.id}`,
        `trigger: "${headerValue(instinct.trigger)}"`,
        `confidence: ${clampConfidence(instinct.confidence)}`,
        `domain: ${headerValue(instinct.domain || "workflow")}`,
        `source: ${headerValue(instinct.source || "manual")}`,
        `scope: ${scope}`,
        `project_id: ${headerValue(projectHash)}`,
        `created: "${headerValue(instinct.created || today)}"`,
        `last_seen: "${headerValue(instinct.last_seen || today)}"`,
        `observation_count: ${instinct.observation_count || 1}`,
        "---",
        instinct.body,
    ].join("\n");
    try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(filePath, `${yaml}\n`);
    }
    catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    }
    return "written";
}
// null when no instinct has that id; otherwise what writeInstinct did with it.
function updateInstinctConfidence(project, instinctId, delta) {
    const instincts = readInstincts(project);
    const instinct = instincts.find((candidate) => candidate.id === instinctId);
    if (!instinct) {
        return null;
    }
    const newConfidence = Math.max(0, Math.min(0.9, instinct.confidence + delta));
    instinct.confidence = Math.round(newConfidence * 100) / 100;
    instinct.last_seen = new Date().toISOString().split("T")[0];
    return { instinct, outcome: writeInstinct(project.hash, instinct) };
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
// Result of a bulk write (ci_import, ci_load_pack): the summary, then a line for
// the ids writeInstinct refused and one per entry whose file could not be written.
function bulkResult(summary, rejected, failed) {
    const lines = [summary];
    if (rejected.length > 0) {
        lines.push(rejectedIdsReport(rejected));
    }
    lines.push(...failed);
    return lines.length > 1 ? error(lines.join("\n")) : text(summary);
}
function handleTool(name, params) {
    const project = getProjectHash();
    switch (name) {
        case "ci_status": {
            const level = detectLevel(project);
            const observationCount = countObservations(project.hash);
            const instincts = readInstincts(project);
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
            const instincts = readInstincts(project).filter((instinct) => instinct.confidence >= minConfidence);
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
                // Stored text is data; flatten keeps each field on one line with no raw "<".
                return `- **${flatten(instinct.id, Infinity)}** (${instinct.confidence}) [${behavior}]\n  Trigger: ${flatten(instinct.trigger, Infinity)}\n  ${flatten(instinct.body, Infinity)}`;
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
            // install, so the clearance action must too. The hook's block reason now
            // prints state_path (the session-scoped state file); honoring it writes
            // the marker exactly where the hook looks. Without it the MCP server can't
            // know the caller's session, so it falls back to the unscoped session dir
            // of the project getProjectHash resolves (the client's root counts) —
            // correct only on the legacy unscoped path.
            const rawList = Array.isArray(params.file_paths) ? params.file_paths : [];
            const listPaths = rawList.filter((value) => typeof value === "string" && value.length > 0);
            const single = getString(params.file_path).trim();
            const paths = single ? [...listPaths, single] : listPaths;
            if (paths.length === 0) {
                return error("file_paths is required — pass the file path(s) named in the GateGuard block reason, e.g. { file_paths: [\"src/x.ts\"] }.");
            }
            // state_path is a model-controlled argument, so it could be a traversal
            // string (`../../etc/...`). dirname leaves `..` segments for the OS to
            // resolve at write time, so without a bound this is an arbitrary-write
            // primitive. Resolve + canonicalize, then require containment within the
            // instincts root (the only tree the hook ever prints a state_path inside).
            // The check is on the directory that will be written, so a state_path
            // equal to the root (whose dirname is ~/.claude) is refused.
            const rawStatePath = getString(params.state_path).trim();
            let sessionDir;
            if (rawStatePath) {
                const candidateDir = dirname(resolve(rawStatePath));
                const dirKey = canonicalizeFileKey(candidateDir);
                const rootKey = canonicalizeFileKey(resolveInstinctsRoot());
                if (dirKey !== rootKey && !dirKey.startsWith(`${rootKey}/`)) {
                    return error("state_path must resolve inside ~/.claude/instincts/. Pass it verbatim from the GateGuard block reason.");
                }
                sessionDir = candidateDir;
            }
            else {
                sessionDir = resolveSessionDir(undefined, clientRoot);
            }
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
            const update = updateInstinctConfidence(project, instinctId, delta);
            if (!update) {
                return error(`Instinct "${instinctId}" not found`);
            }
            const updated = update.instinct;
            if (update.outcome === "invalid-id") {
                return error(`${invalidInstinctId(updated.id)} Correct the id: line in that instinct's file and rename the file to <new id>.yaml before reinforcing it.`);
            }
            if (update.outcome !== "written") {
                return error(writeFailed(updated.id, update.outcome.error));
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
                confidence: clampConfidence(getNumber(params.confidence, 0.6)),
                domain: getString(params.domain, "workflow"),
                source: "manual",
                scope,
                observation_count: 1,
            };
            const outcome = writeInstinct(project.hash, instinct);
            if (outcome === "invalid-id") {
                return error(invalidInstinctId(instinct.id));
            }
            if (outcome !== "written") {
                return error(writeFailed(instinct.id, outcome.error));
            }
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
            let instincts = readInstincts(project);
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
            const existing = readInstincts(project);
            const existingIds = new Set(existing.map((instinct) => instinct.id.toLowerCase()));
            const rejected = [];
            const failed = [];
            let imported = 0;
            for (const candidate of parsed) {
                const instinct = toInstinct(candidate);
                if (!instinct || existingIds.has(instinct.id.toLowerCase())) {
                    continue;
                }
                instinct.scope = instinct.scope || scope;
                instinct.source = "imported";
                const outcome = writeInstinct(project.hash, instinct);
                if (outcome === "invalid-id") {
                    rejected.push(instinct.id);
                    continue;
                }
                if (outcome !== "written") {
                    failed.push(writeFailed(instinct.id, outcome.error));
                    continue;
                }
                imported++;
            }
            const summary = `Imported ${imported} instincts (${parsed.length - imported - rejected.length - failed.length} skipped as duplicates)`;
            return bulkResult(summary, rejected, failed);
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
            const workspaceRoot = workspaceRootOf(project);
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
            const workspaceRoot = workspaceRootOf(project);
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
            const workspaceRoot = workspaceRootOf(project);
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
                return error(invalidDraftId(id));
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
        case "ci_distill_from_workflow": {
            if (MODE !== "expert") {
                return error("ci_distill_from_workflow requires expert mode");
            }
            const run = workflowRunFromObservations(readDistillObservations(project.hash));
            if (!run) {
                return text("No completed-and-verified Workflow run found in this project's observations. " +
                    "A run qualifies when a `Workflow` tool call is followed by a passing verify/test/build in the same feed. " +
                    "Run a workflow, verify its output, then try `ci_distill_from_workflow` again.");
            }
            const draftInstinct = draftFromWorkflowRun(run);
            if (!isSafeDraftId(draftInstinct.id)) {
                return error(`Internal error: generated draft id "${draftInstinct.id}" failed the safety check.`);
            }
            const draft = serializeDraft(draftInstinct);
            const draftsDir = join(INSTINCTS_DIR, project.hash, "drafts");
            const draftPath = join(draftsDir, `${draftInstinct.id}.yaml`);
            try {
                mkdirSync(draftsDir, { recursive: true });
                writeFileSync(draftPath, draft);
            }
            catch (err) {
                return error(`Failed to write draft to ${draftPath}: ${err instanceof Error ? err.message : String(err)}`);
            }
            return text([
                "## Draft written from a verified workflow run",
                "",
                `**Workflow:** ${run.name}`,
                `**Path:** ${draftPath}`,
                "",
                "Edit the body to capture the real recipe (preconditions, concrete steps, gotchas), then promote with:",
                "",
                `  ci_distill_promote id=${draftInstinct.id}`,
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
                return error(invalidDraftId(id));
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
            const outcome = writeInstinct(project.hash, promoted);
            if (outcome === "invalid-id") {
                return error(`${invalidInstinctId(promoted.id)} The draft at ${draftPath} was kept: correct its id: line and promote again.`);
            }
            if (outcome !== "written") {
                return error(`${writeFailed(promoted.id, outcome.error)}. The draft at ${draftPath} was kept.`);
            }
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
            const level = detectLevel(project);
            const observationCount = countObservations(project.hash);
            const instincts = readInstincts(project);
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
            // A hand-edited file can hold any confidence; the bar stays 0 to 10 cells.
            const barCells = (confidence) => Math.max(0, Math.min(10, Math.round(confidence * 10)));
            const top5 = instincts
                .sort((left, right) => right.confidence - left.confidence)
                .slice(0, 5)
                .map((instinct) => `  ${"█".repeat(barCells(instinct.confidence)) + "░".repeat(10 - barCells(instinct.confidence))} ${instinct.confidence.toFixed(2)} ${instinct.id}`)
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
            // The pack name is a model-controlled argument that becomes a path, so it
            // has to be the name of a file in the packs directory. Joining it unchecked
            // let `../` reach any .json file on the drive.
            const packName = getString(params.pack);
            const available = existsSync(PACKS_DIR)
                ? readdirSync(PACKS_DIR)
                    .filter((file) => file.endsWith(".json"))
                    .map((file) => file.replace(".json", ""))
                : [];
            if (!available.includes(packName)) {
                return error(`Unknown pack: ${packName}. Available: ${available.join(", ")}`);
            }
            const packPath = join(PACKS_DIR, `${packName}.json`);
            const packInstincts = JSON.parse(readFileSync(packPath, "utf8"));
            const existing = readInstincts(project);
            const existingIds = new Set(existing.map((instinct) => instinct.id.toLowerCase()));
            const rejected = [];
            const failed = [];
            let loaded = 0;
            for (const candidate of packInstincts) {
                const instinct = toInstinct(candidate);
                if (!instinct || existingIds.has(instinct.id.toLowerCase())) {
                    continue;
                }
                instinct.source = `pack-${packName}`;
                instinct.scope = "project";
                instinct.observation_count = 0;
                const outcome = writeInstinct(project.hash, instinct);
                if (outcome === "invalid-id") {
                    rejected.push(instinct.id);
                    continue;
                }
                if (outcome !== "written") {
                    failed.push(writeFailed(instinct.id, outcome.error));
                    continue;
                }
                loaded++;
            }
            const summary = `Loaded ${loaded}/${packInstincts.length} instincts from **${packName}** pack (${packInstincts.length - loaded - rejected.length - failed.length} already existed)`;
            return bulkResult(summary, rejected, failed);
        }
        default:
            return error(`Unknown tool: ${name}`);
    }
}
const rl = createInterface({ input: process.stdin, terminal: false });
let buffer = "";
rl.on("line", (line) => {
    buffer += line;
    let parsed;
    try {
        parsed = JSON.parse(buffer);
    }
    catch {
        // incomplete JSON, keep buffering
        return;
    }
    buffer = "";
    const message = asRecord(parsed);
    if (!message) {
        return;
    }
    // A reply to a request this server sent (roots/list) has no method. It is
    // never answered: JSON-RPC forbids replying to a response.
    if (message.method === undefined && ("result" in message || "error" in message)) {
        handleClientReply(message);
        return;
    }
    // A method handler that throws (a filesystem error, a malformed file on disk)
    // is answered with a JSON-RPC error so the client is not left waiting, and the
    // server goes on reading. tools/call answers its own failures in handleMessage.
    try {
        handleMessage(message);
    }
    catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const label = getString(message.method, "request");
        console.error(`${PACKAGE_NAME} MCP server: ${label} failed: ${reason}`);
        if (message.id !== undefined) {
            send({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: `${label} failed: ${reason}` } });
        }
    }
});
function send(response) {
    // MCP stdio transport spec: newline-delimited JSON-RPC over stdout, no
    // Content-Length headers. Claude Code and every @modelcontextprotocol/sdk
    // host parse stdout line-by-line; LSP-style framing produces a silent
    // "Connecting…" hang because no line ever resolves to JSON.
    process.stdout.write(`${JSON.stringify(response)}\n`);
}
// MCP "Roots" (spec 2024-11-05, client features): a client that declares the
// `roots` capability in initialize answers a `roots/list` request with
// `{ roots: [{ uri, name? }] }` and sends `notifications/roots/list_changed`
// when they change. The server asks once the client is initialized and again
// on each change. Only the reply to the latest request counts, so a slow reply
// to an older one cannot overwrite a newer root. Which agents declare the
// capability is not part of the 2026-11-21 research, so a client that does not
// keeps today's behaviour: no request, the project from env vars and the cwd.
let clientOffersRoots = false;
let rootsRequestCount = 0;
let pendingRootsRequest = null;
function requestClientRoots() {
    rootsRequestCount += 1;
    pendingRootsRequest = `ci-roots-${rootsRequestCount}`;
    send({ jsonrpc: "2.0", id: pendingRootsRequest, method: "roots/list" });
}
function handleClientReply(message) {
    if (pendingRootsRequest === null || message.id !== pendingRootsRequest)
        return;
    pendingRootsRequest = null;
    // A reply with no usable root (an error, no file root) drops the previous
    // root: the server falls back to its env vars and cwd, as with no roots.
    clientRoot = mcpRootsPayload(message.result);
}
function handleMessage(message) {
    const id = message.id;
    const method = message.method;
    const params = asRecord(message.params) ?? {};
    switch (method) {
        case "initialize":
            clientOffersRoots = asRecord(asRecord(params.capabilities)?.roots) !== null;
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
        case "notifications/roots/list_changed":
            if (clientOffersRoots)
                requestClientRoots();
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
            // A tool that throws is answered as a failed tool call (isError), so the
            // model reads the reason; other methods that throw get -32603 below.
            let result;
            try {
                result = handleTool(toolName, toolArgs);
            }
            catch (err) {
                const reason = `${toolName || "tools/call"} failed: ${err instanceof Error ? err.message : String(err)}`;
                console.error(`${PACKAGE_NAME} MCP server: ${reason}`);
                result = error(reason);
            }
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
                ? readInstincts(GLOBAL_PROJECT).filter((instinct) => instinct.scope === "global")
                : readInstincts(project);
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
