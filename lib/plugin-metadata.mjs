import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
export const PACKAGE_NAME = "continuous-improvement";
// package.json sits beside lib/ in the repository and in the npm package. The
// plugin bundle ships no package.json, so there the version comes from the
// generated .claude-plugin/plugin.json, which carries the same value.
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_PATH = join(PACKAGE_ROOT, "package.json");
const VERSION_SOURCE = existsSync(PKG_PATH)
    ? PKG_PATH
    : join(PACKAGE_ROOT, ".claude-plugin", "plugin.json");
export const VERSION = JSON.parse(readFileSync(VERSION_SOURCE, "utf8")).version;
export const PLUGIN_MODES = ["beginner", "expert"];
const REPOSITORY_URL = "https://github.com/naimkatiman/continuous-improvement";
const HOMEPAGE_URL = `${REPOSITORY_URL}#readme`;
const AUTHOR = {
    name: "naimkatiman",
    url: "https://github.com/naimkatiman",
};
const KEYWORDS = [
    "claude-code",
    "claude-code-skill",
    "ai-agent",
    "agent-skill",
    "ai-discipline",
    "mulahazah",
    "instinct",
    "hooks",
    "mcp",
    "mcp-server",
    "github-action",
    "transcript-linter",
];
const CLAUDE_PLUGIN_CATEGORY = "productivity";
const SHARED_PLUGIN_DESCRIPTION = "Ambition and discipline for coding agents: the be-ambitious skill and a seven-step loop. A hook denies known destructive shell commands. Opt-in hooks deny pushes to protected branches and edits to the files that wire the guardrails, and hold a turn open on a failing typecheck. Tool calls go to a local searchable log; saved lessons load at session start. Ships 29 bundled skills and an MCP server.";
// Four vendored upstream companions registered alongside the CI plugin.
// Each entry points at a pinned-SHA snapshot under third-party/<name>/.
// See third-party/MANIFEST.md for refresh recipes and per-snapshot
// OUR_NOTES.md for integration scope and overlap matrices. The unified
// /superpowers dispatcher (skills/superpowers.md) routes across all four.
// Product-management coverage is supplied by phuryn/pm-skills as an
// out-of-band marketplace install — see docs/THIRD_PARTY.md for the
// `claude plugin marketplace add phuryn/pm-skills` recipe and the eight
// installable plugins (pm-toolkit, pm-product-strategy, pm-product-discovery,
// pm-market-research, pm-data-analytics, pm-marketing-growth,
// pm-go-to-market, pm-execution).
// The version is not written here: getClaudeRepoMarketplaceManifest reads it
// from each snapshot's own .claude-plugin/plugin.json, so a refresh cannot leave
// the marketplace stating the old one. Skill, agent and command names and
// counts in a description are checked against the snapshot by
// src/test/marketplace-companions.test.mts.
const THIRD_PARTY_COMPANIONS = [
    {
        name: "superpowers",
        description: "Obra's core skills library for Claude Code, 14 skills for TDD, debugging, planning, review and branch work. Skills: brainstorming, dispatching-parallel-agents, executing-plans, finishing-a-development-branch, receiving-code-review, requesting-code-review, subagent-driven-development, systematic-debugging, test-driven-development, using-git-worktrees, using-superpowers, verification-before-completion, writing-plans, writing-skills. Vendored snapshot at third-party/superpowers/ pinned to upstream SHA b36e082. Companion to the /superpowers dispatcher in continuous-improvement plugin.",
        source: "./third-party/superpowers",
        author: {
            name: "Jesse Vincent",
            email: "jesse@fsck.com",
        },
        category: "workflow",
        homepage: "https://github.com/obra/superpowers",
    },
    {
        name: "agent-skills",
        description: "Addy Osmani's production-grade engineering skills for AI coding agents: 21 skills and 3 agents covering the full software development lifecycle. Skills: spec-driven-development, source-driven-development, context-engineering, idea-refine, incremental-implementation, test-driven-development, code-review-and-quality, code-simplification, security-and-hardening, debugging-and-error-recovery, performance-optimization, api-and-interface-design, frontend-ui-engineering, browser-testing-with-devtools, ci-cd-and-automation, deprecation-and-migration, documentation-and-adrs, git-workflow-and-versioning, planning-and-task-breakdown, shipping-and-launch, using-agent-skills. Vendored snapshot at third-party/addy-agent-skills/ pinned to upstream SHA 742dca5.",
        source: "./third-party/addy-agent-skills",
        author: {
            name: "Addy Osmani",
        },
        category: "workflow",
        homepage: "https://github.com/addyosmani/agent-skills",
    },
    {
        name: "ruflo-swarm",
        description: "Agent teams, swarm coordination, Monitor streams, and worktree isolation. Wraps 4 swarm_* + 8 agent_* MCP tools (12 total) plus 6 topologies (hierarchical, mesh, hierarchical-mesh, ring, star, adaptive). Ships 2 skills, 2 agents and 2 commands. Skills: swarm-init and monitor-stream. Commands: /swarm and /watch. Cherry-picked from ruvnet/ruflo monorepo (the other 31 plugins are explicitly out of scope). Vendored snapshot at third-party/ruflo-swarm/ pinned to upstream SHA addb5cd. Activation note: assets reference unpinned npx @claude-flow/cli@latest — supply-chain risk inert until installed.",
        source: "./third-party/ruflo-swarm",
        author: {
            name: "ruvnet",
            url: "https://github.com/ruvnet",
        },
        category: "orchestration",
        homepage: "https://github.com/ruvnet/ruflo",
    },
    {
        name: "oh-my-claudecode",
        description: "Multi-agent orchestration system for Claude Code: 37 skills and 19 agents covering audit, plan, build, verify, ship, release, and ops. Skills include: ralph, ralplan, autopilot, ultragoal, team, trace, release, review, verify, debug, deep-interview, autoresearch, visual-verdict. Vendored snapshot at third-party/oh-my-claudecode/ pinned to upstream SHA 4820f56. Heavy overlap with continuous-improvement /ralph and /superpowers, so pick per task.",
        source: "./third-party/oh-my-claudecode",
        author: {
            name: "Yeachan-Heo",
        },
        category: "orchestration",
        homepage: "https://github.com/Yeachan-Heo/oh-my-claudecode",
    },
];
// Called only through getClaudeRepoMarketplaceManifest (the generator and its
// test, from the repo root, where third-party/ exists). Reading it lazily keeps
// the bundled copy of this module under plugins/ from touching third-party/.
function snapshotVersion(source) {
    const pluginJson = join(PKG_PATH, "..", source, ".claude-plugin", "plugin.json");
    return JSON.parse(readFileSync(pluginJson, "utf8")).version;
}
export function isPluginMode(value) {
    return value === "beginner" || value === "expert";
}
const BEGINNER_TOOL_ENTRIES = [
    {
        name: "ci_status",
        description: "Show current level, instinct count, and observation count for this project. Good starting point to see what the system has learned.",
        manifestWhat: "See what the system has learned about your project",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "ci_instincts",
        description: "List all learned instincts for this project with their confidence levels and behaviors.",
        manifestWhat: "List all learned behaviors with confidence levels",
        inputSchema: {
            type: "object",
            properties: {
                min_confidence: {
                    type: "number",
                    description: "Minimum confidence to show (default: 0)",
                    default: 0,
                },
            },
            required: [],
        },
    },
    {
        name: "ci_reflect",
        description: "Generate a structured reflection for the current session. Provide a summary of what you worked on.",
        manifestWhat: "Reflect on what you did this session",
        inputSchema: {
            type: "object",
            properties: {
                summary: {
                    type: "string",
                    description: "Brief summary of what was done this session",
                },
            },
            required: ["summary"],
        },
    },
    {
        name: "ci_gateguard_clear",
        description: "Clear the GateGuard gate for one or more files after presenting the required facts (importers, affected APIs, data schema, the user's instruction). Records canonical per-file clearance in the session state the hook reads, so the next Edit/Write to those paths is allowed. Clearance matches regardless of drive-letter case or path separator. Available in beginner mode because the gate fires for every install.",
        manifestWhat: "Clear the GateGuard gate for files after presenting facts",
        inputSchema: {
            type: "object",
            properties: {
                file_paths: {
                    type: "array",
                    description: "File paths to clear — the paths named in the GateGuard block reason",
                    items: { type: "string" },
                },
                file_path: {
                    type: "string",
                    description: "A single file path to clear (alternative to file_paths)",
                },
                state_path: {
                    type: "string",
                    description: "State-file path from the GateGuard block reason (the session-scoped gateguard-session.json). Pass it verbatim so the clearance lands in the session the hook is reading; it must resolve inside the instincts root (CI_INSTINCTS_HOME when set, else ~/.claude/instincts; every agent shares it). Omitting it falls back to the unscoped canonical dir — safe only in legacy (no session id) contexts; when the hook is session-scoped, omitting it writes to the wrong dir and the retry will still block.",
                },
            },
            required: [],
        },
    },
];
const EXPERT_TOOL_ENTRIES = [
    {
        name: "ci_reinforce",
        description: "Accept or reject an instinct suggestion. Adjusts confidence: +0.15 for accept, -0.1 for reject.",
        manifestWhat: "Accept or reject instinct suggestions to tune confidence",
        inputSchema: {
            type: "object",
            properties: {
                instinct_id: { type: "string", description: "The instinct ID to reinforce" },
                accepted: {
                    type: "boolean",
                    description: "true = accept (+0.15), false = reject (-0.1)",
                },
            },
            required: ["instinct_id", "accepted"],
        },
    },
    {
        name: "ci_create_instinct",
        description: "Manually create a new instinct with a trigger, body, and starting confidence.",
        manifestWhat: "Manually create instincts with custom triggers and confidence",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Unique instinct ID (kebab-case)" },
                trigger: { type: "string", description: "When this instinct applies" },
                body: { type: "string", description: "The behavior to follow" },
                confidence: {
                    type: "number",
                    description: "Starting confidence 0.0-0.9 (default: 0.6)",
                    default: 0.6,
                },
                domain: {
                    type: "string",
                    description: "Domain: workflow|tooling|testing|patterns|code-style",
                    default: "workflow",
                },
                scope: {
                    type: "string",
                    description: "Scope: project|global",
                    default: "project",
                },
            },
            required: ["id", "trigger", "body"],
        },
    },
    {
        name: "ci_observations",
        description: "View recent tool call observations captured by hooks.",
        manifestWhat: "View raw tool call observations captured by hooks",
        inputSchema: {
            type: "object",
            properties: {
                limit: {
                    type: "number",
                    description: "Number of recent observations to return (default: 20)",
                    default: 20,
                },
            },
            required: [],
        },
    },
    {
        name: "ci_export",
        description: "Export all instincts as a JSON array for sharing or backup.",
        manifestWhat: "Export instincts as JSON for sharing or backup",
        inputSchema: {
            type: "object",
            properties: {
                scope: {
                    type: "string",
                    description: "Which instincts: project|global|all (default: all)",
                    default: "all",
                },
            },
            required: [],
        },
    },
    {
        name: "ci_import",
        description: "Import instincts from a JSON array. Skips duplicates by ID.",
        manifestWhat: "Import instincts from JSON (skip duplicates)",
        inputSchema: {
            type: "object",
            properties: {
                instincts_json: {
                    type: "string",
                    description: "JSON array of instinct objects to import",
                },
                scope: {
                    type: "string",
                    description: "Import to: project|global (default: project)",
                    default: "project",
                },
            },
            required: ["instincts_json"],
        },
    },
    {
        name: "ci_plan_init",
        description: "Create task_plan.md, findings.md, and progress.md in the project root for persistent file-based planning.",
        manifestWhat: "Create project-root planning files for persistent task memory",
        inputSchema: {
            type: "object",
            properties: {
                goal: { type: "string", description: "Goal for the planning workflow" },
                phases: {
                    type: "array",
                    description: "Optional ordered phase names. Defaults to Research, Plan, Execute, Verify, Reflect.",
                    items: { type: "string" },
                },
                force: {
                    type: "boolean",
                    description: "Overwrite existing planning files",
                    default: false,
                },
            },
            required: ["goal"],
        },
    },
    {
        name: "ci_plan_status",
        description: "Summarize the status of task_plan.md, findings.md, and progress.md in the project root.",
        manifestWhat: "Summarize task_plan.md, findings.md, and progress.md status",
        inputSchema: {
            type: "object",
            properties: {
                include_contents: {
                    type: "boolean",
                    description: "Include raw file contents in the response",
                    default: false,
                },
            },
            required: [],
        },
    },
    {
        name: "ci_dashboard",
        description: "Visual dashboard showing instinct health, observation stats, confidence distribution, and learning progress.",
        manifestWhat: "Visual dashboard showing instinct health, confidence distribution, and learning progress",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "ci_load_pack",
        description: "Load a starter instinct pack (react, python, go) into the current project.",
        manifestWhat: "Load starter instinct packs (react, python, go) into the current project",
        inputSchema: {
            type: "object",
            properties: {
                pack: { type: "string", description: "Pack name: react, python, or go" },
            },
            required: ["pack"],
        },
    },
    {
        name: "ci_goal_check",
        description: "Check whether recent tool activity still relates to the stated goal. Reads the '## Goal' section of task_plan.md (plus optional '## Goal Keywords' and '## Goal Scope' sections), scores the last N observations, and reports a drift score with the top off-goal tool calls.",
        manifestWhat: "Detect when a session has drifted from its stated goal",
        inputSchema: {
            type: "object",
            properties: {
                limit: {
                    type: "number",
                    description: "How many recent observations to score (default: 30)",
                    default: 30,
                },
                goal_file: {
                    type: "string",
                    description: "Path to a goal/plan markdown file. Defaults to task_plan.md in the project root, then <hash>/goal.md under the instincts root (CI_INSTINCTS_HOME when set, else ~/.claude/instincts; every agent shares it)",
                },
            },
            required: [],
        },
    },
    {
        name: "ci_recall",
        description: "Search past tool-call observations with BM25 ranking. Answers 'have I seen this before?' against <hash>/observations.jsonl under the instincts root (CI_INSTINCTS_HOME when set, else ~/.claude/instincts; every agent shares it) and returns the most relevant past activity with redacted snippets. Lexical, not semantic.",
        manifestWhat: "Search past sessions for relevant prior activity (episodic recall)",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search terms, e.g. an error message or a past task" },
                k: {
                    type: "number",
                    description: "How many results to return (default: 5)",
                    default: 5,
                },
                since: {
                    type: "string",
                    description: "Only search rows newer than this — ISO timestamp or relative window like '7d', '24h', '30m'",
                },
            },
            required: ["query"],
        },
    },
    {
        name: "ci_distill_candidates",
        description: "List distillation candidates: tool sequences that recurred across multiple successful sessions and could become reusable instincts. Read-only analysis — proposes nothing until you run ci_distill_propose.",
        manifestWhat: "Find repeated successful tool sequences worth turning into skills",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "ci_distill_propose",
        description: "Write a DRAFT instinct for a distillation candidate to <hash>/drafts/ under the instincts root (CI_INSTINCTS_HOME when set, else ~/.claude/instincts; every agent shares it). The draft has a placeholder body for you to edit; it does not affect behavior until promoted.",
        manifestWhat: "Draft a reusable instinct from a repeated successful pattern",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Candidate id from ci_distill_candidates" },
            },
            required: ["id"],
        },
    },
    {
        name: "ci_distill_promote",
        description: "Promote an edited draft into a live project instinct at 0.5 confidence (SUGGEST tier) and consume the draft. Run after editing the draft body produced by ci_distill_propose.",
        manifestWhat: "Promote an edited draft into a live instinct",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Draft id to promote" },
            },
            required: ["id"],
        },
    },
    {
        name: "ci_distill_from_workflow",
        description: "Draft a reusable instinct from the most recent completed-and-verified native Workflow run in this project's observation feed. A Workflow script is an authored recipe, so a single run whose output passed verification is enough — unlike ci_distill_candidates, which needs a pattern repeated across sessions. Writes a DRAFT to drafts/ (a skeleton you edit); it changes no behavior until promoted with ci_distill_promote. Returns a message when no verified workflow run is found.",
        manifestWhat: "Draft a reusable instinct from a verified Workflow run",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
];
const MODE_METADATA = {
    beginner: {
        description: "Beginner mode: see what your agent learned, list its instincts, and request a session reflection. Bundles the ship fast path plus grounding skills (gateguard, tdd-workflow, verification-loop) so one-defect delivery, research, tests, and verification happen by default — every edit starts from facts, not guesses.",
        hooks: ["PreToolUse", "PostToolUse", "UserPromptSubmit"],
        hookDescription: "Silently captures every tool call as observations and routes prompts to the matching skill via the route table. Lightweight and non-blocking.",
    },
    expert: {
        description: "Expert mode: tune confidence, manage instincts, and persist plans on disk. Adds safety, token-budget, and strategic-compact skills plus the /learn-eval command so long sessions stay sharp and learnings survive context resets.",
        hooks: ["PreToolUse", "PostToolUse", "UserPromptSubmit", "SessionStart", "SessionEnd"],
        hookDescription: "Full hook suite: observation capture, lazy prompt routing, session-level instinct loading, and auto-reflection.",
    },
};
function getToolCatalog(mode) {
    return mode === "expert"
        ? [...BEGINNER_TOOL_ENTRIES, ...EXPERT_TOOL_ENTRIES]
        : [...BEGINNER_TOOL_ENTRIES];
}
export function getToolDefinitions(mode) {
    return getToolCatalog(mode).map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
    }));
}
export function getToolNames(mode) {
    return getToolCatalog(mode).map((tool) => tool.name);
}
export function getPluginManifest(mode) {
    const modeMetadata = MODE_METADATA[mode];
    const mcpServerConfig = {
        command: "node",
        args: ["<install-path>/bin/mcp-server.mjs", "--mode", mode],
    };
    return {
        name: PACKAGE_NAME,
        version: VERSION,
        mode,
        description: modeMetadata.description,
        tools: getToolCatalog(mode).map((tool) => ({
            name: tool.name,
            what: tool.manifestWhat,
        })),
        setup: {
            claude_desktop: {
                mcpServers: {
                    [PACKAGE_NAME]: mcpServerConfig,
                },
            },
            claude_code: {
                mcpServers: {
                    [PACKAGE_NAME]: mcpServerConfig,
                },
            },
        },
        hooks: {
            included: [...modeMetadata.hooks],
            description: modeMetadata.hookDescription,
        },
    };
}
// The MCP server `/plugin install` registers, written to `.mcp.json` at the
// bundle root. Claude Code substitutes ${CLAUDE_PLUGIN_ROOT} in `args` and
// starts the server when the plugin is enabled. Expert mode, because /recall,
// /goal-check and /distill call tools the beginner mode does not serve.
export function getPluginMcpConfig() {
    return {
        mcpServers: {
            [PACKAGE_NAME]: {
                command: "node",
                args: ["${CLAUDE_PLUGIN_ROOT}/bin/mcp-server.mjs", "--mode", "expert"],
            },
        },
    };
}
export function getClaudePluginManifest() {
    return {
        name: PACKAGE_NAME,
        version: VERSION,
        description: SHARED_PLUGIN_DESCRIPTION,
        author: AUTHOR,
        homepage: HOMEPAGE_URL,
        repository: REPOSITORY_URL,
        license: "MIT",
        keywords: [...KEYWORDS],
    };
}
export function getPluginHooksConfig() {
    // Cold Node startup on loaded Windows hosts has exceeded five seconds.
    const hookTimeoutSeconds = 30;
    const gateguardCommand = {
        type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/gateguard.mjs\"",
        timeout: hookTimeoutSeconds,
    };
    const companionPreferenceCommand = {
        type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/companion-preference.mjs\"",
        timeout: hookTimeoutSeconds,
    };
    const hookPackCommand = {
        type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/hook-pack.mjs\"",
        timeout: hookTimeoutSeconds,
    };
    const configGuardCommand = {
        type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/config-guard.mjs\"",
        timeout: hookTimeoutSeconds,
    };
    const observeCommand = {
        type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/bin/observe.mjs\"",
        timeout: hookTimeoutSeconds,
    };
    const sessionCommand = {
        type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/session.mjs\"",
        timeout: hookTimeoutSeconds,
    };
    const threeSectionCloseCommand = {
        type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/three-section-close.mjs\"",
        timeout: hookTimeoutSeconds,
    };
    const goalDriftStopCommand = {
        type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/goal-drift-stop.mjs\"",
        timeout: hookTimeoutSeconds,
    };
    const workflowDistillCommand = {
        type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/workflow-distill.mjs\"",
        timeout: hookTimeoutSeconds,
    };
    const typecheckStopCommand = {
        type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/typecheck-stop.mjs\"",
        timeout: hookTimeoutSeconds,
    };
    const queryCostNudgeCommand = {
        type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/query-cost-nudge.mjs\"",
        timeout: hookTimeoutSeconds,
    };
    const routePromptCommand = {
        type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/route-prompt.mjs\"",
        timeout: hookTimeoutSeconds,
    };
    const recallBriefingCommand = {
        type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/recall-briefing.mjs\"",
        timeout: hookTimeoutSeconds,
    };
    return {
        hooks: {
            // Every PreToolUse group has a matcher naming the tools its hook can act
            // on, so a read-only call (Read, Grep, Glob, Task, any MCP tool) starts
            // no PreToolUse process. An Edit or Write starts two (gateguard,
            // config-guard); a shell call starts three (gateguard, hook-pack,
            // config-guard); a Skill call starts one (companion-preference). The
            // shell tools are Bash, the PowerShell tool Claude Code exposes on
            // Windows, and Monitor, whose command runs in the same shell as Bash.
            // gateguard is the first group so its deny is the first decision. The
            // observer only runs on PostToolUse, on every tool: the gateguard
            // evidence file gate reads its rows, and gateguard-blocked calls are
            // intentionally not observed. route-prompt fires on UserPromptSubmit
            // and, only when CI_ROUTE_PROMPT is on (default off), emits a
            // system-reminder when a prompt pattern in hooks/route-table.json
            // matches; otherwise prompts pass through with no output.
            PreToolUse: [
                // gateguard denies only the file tools (the file gate) and the shell
                // tools (destructive commands, unquoted @{...} git refs). Every other
                // tool is allowed with nothing recorded.
                { matcher: "Bash|PowerShell|Monitor|Edit|MultiEdit|Write|NotebookEdit", hooks: [gateguardCommand] },
                // companion-preference acts only on Skill calls; it is a no-op under
                // ci-first (the default) and never blocks under companions-first.
                { matcher: "Skill", hooks: [companionPreferenceCommand] },
                // hook-pack gates a shell `git push` to protected branches and oversized
                // `git commit`s. Warn-default (CLAUDE_CI_HOOKPACK_GATE) — never blocks
                // until the operator opts in.
                { matcher: "Bash|PowerShell|Monitor", hooks: [hookPackCommand] },
                // config-guard watches the files that wire the guardrails
                // (.claude/settings*.json, .mcp.json, hooks.json, .claude/hooks/,
                // .claude/plugins/, .claude-plugin/) and the `claude plugin|mcp|config`
                // CLI forms. Matcher keeps read-only tools off the hot path.
                // Warn-default (CI_CONFIG_GUARD) — denies only under block.
                { matcher: "Bash|PowerShell|Monitor|Edit|MultiEdit|Write|NotebookEdit", hooks: [configGuardCommand] },
            ],
            PostToolUse: [{ hooks: [observeCommand] }],
            UserPromptSubmit: [{ hooks: [routePromptCommand, recallBriefingCommand] }],
            SessionStart: [{ hooks: [sessionCommand] }],
            SessionEnd: [{ hooks: [sessionCommand] }],
            Stop: [{ hooks: [threeSectionCloseCommand, goalDriftStopCommand, workflowDistillCommand, typecheckStopCommand, queryCostNudgeCommand] }],
        },
    };
}
export function getClaudePluginMarketplaceManifest() {
    return {
        name: `${PACKAGE_NAME}-dev`,
        description: "Development marketplace for the Continuous Improvement Claude Code plugin.",
        owner: {
            name: AUTHOR.name,
        },
        plugins: [
            {
                name: PACKAGE_NAME,
                description: SHARED_PLUGIN_DESCRIPTION,
                version: VERSION,
                source: "./",
                author: {
                    name: AUTHOR.name,
                },
                category: CLAUDE_PLUGIN_CATEGORY,
                homepage: REPOSITORY_URL,
            },
        ],
    };
}
export function getClaudeRepoMarketplaceManifest(extraPlugins = []) {
    return {
        name: PACKAGE_NAME,
        description: "Marketplace for the Continuous Improvement Claude Code plugin and four vendored upstream companions (Obra superpowers, addyosmani/agent-skills, ruflo-swarm, oh-my-claudecode). All four companions are pinned-SHA snapshots in third-party/ — see third-party/MANIFEST.md for refresh recipes and per-snapshot OUR_NOTES.md for integration scope. Product-management coverage is provided out-of-band by phuryn/pm-skills via Claude Code's plugin marketplace — see docs/THIRD_PARTY.md.",
        owner: {
            name: AUTHOR.name,
        },
        plugins: [
            {
                name: PACKAGE_NAME,
                description: SHARED_PLUGIN_DESCRIPTION,
                version: VERSION,
                source: `./plugins/${PACKAGE_NAME}`,
                author: {
                    name: AUTHOR.name,
                },
                category: CLAUDE_PLUGIN_CATEGORY,
                homepage: REPOSITORY_URL,
            },
            ...THIRD_PARTY_COMPANIONS.map(({ name, description, ...rest }) => ({
                name,
                description,
                version: snapshotVersion(rest.source),
                ...rest,
            })),
            ...extraPlugins,
        ],
    };
}
