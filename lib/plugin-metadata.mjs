import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
export const PACKAGE_NAME = "continuous-improvement";
const PKG_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
export const VERSION = JSON.parse(readFileSync(PKG_PATH, "utf8")).version;
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
const SHARED_PLUGIN_DESCRIPTION = "Stops Claude Code from skipping research, claiming 'done' without verifying, and repeating yesterday's mistakes. The 7 Laws of AI Agent Discipline — 13 enforcement skills, gating hooks, and the Mulahazah auto-leveling instinct engine.";
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
const THIRD_PARTY_COMPANIONS = [
    {
        name: "superpowers",
        description: "Obra's core skills library: TDD, debugging, brainstorming, writing-plans, executing-plans, dispatching-parallel-agents, using-git-worktrees, finishing-a-development-branch, subagent-driven-development, requesting-code-review, receiving-code-review, systematic-debugging, verification-before-completion, writing-skills, using-superpowers. Vendored snapshot at third-party/superpowers/ pinned to upstream SHA f2cbfbe (v5.1.0). Companion to the /superpowers dispatcher in continuous-improvement plugin.",
        version: "5.1.0",
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
        description: "Addy Osmani's production-grade engineering skills for AI coding agents — 21 skills covering the full software development lifecycle: spec-driven-development, source-driven-development, context-engineering, idea-refine, incremental-implementation, test-driven-development, code-review-and-quality, code-simplification, security-and-hardening, debugging-and-error-recovery, performance-optimization, api-and-interface-design, frontend-ui-engineering, browser-testing-with-devtools, ci-cd-and-automation, deprecation-and-migration, documentation-and-adrs, git-workflow-and-versioning, planning-and-task-breakdown, shipping-and-launch, using-agent-skills. Vendored snapshot at third-party/addy-agent-skills/ pinned to upstream SHA 742dca5 (v1.0.0).",
        version: "1.0.0",
        source: "./third-party/addy-agent-skills",
        author: {
            name: "Addy Osmani",
        },
        category: "workflow",
        homepage: "https://github.com/addyosmani/agent-skills",
    },
    {
        name: "ruflo-swarm",
        description: "Agent teams, swarm coordination, Monitor streams, and worktree isolation. Wraps 4 swarm_* + 8 agent_* MCP tools (12 total) plus 6 topologies (hierarchical, mesh, hierarchical-mesh, ring, star, adaptive). Slash commands /swarm and /watch. Skills swarm-init and monitor-stream. Cherry-picked from ruvnet/ruflo monorepo (the other 31 plugins are explicitly out of scope). Vendored snapshot at third-party/ruflo-swarm/ pinned to upstream SHA addb5cd (v0.2.0). Activation note: assets reference unpinned npx @claude-flow/cli@latest — supply-chain risk inert until installed.",
        version: "0.2.0",
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
        description: "Multi-agent orchestration system for Claude Code — 39 skills + 19 agents covering audit, plan, build, verify, ship, release, retrospective, and ops. Includes ralph (autonomous PRD loop), release, ultrawork, ultraqa, team, trace, visual-verdict, debug, deep-dive, deep-interview, autopilot, autoresearch. Vendored snapshot at third-party/oh-my-claudecode/ pinned to upstream SHA aacde3e (v4.13.6). Heavy overlap with continuous-improvement /ralph and /superpowers — pick per task.",
        version: "4.13.6",
        source: "./third-party/oh-my-claudecode",
        author: {
            name: "Yeachan-Heo",
        },
        category: "orchestration",
        homepage: "https://github.com/Yeachan-Heo/oh-my-claudecode",
    },
];
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
];
const MODE_METADATA = {
    beginner: {
        description: "Beginner mode: see what your agent learned, list its instincts, and request a session reflection. Bundles four discipline skills (gateguard, para-memory-files, tdd-workflow, verification-loop) so research, memory, tests, and verification happen by default.",
        hooks: ["PreToolUse", "PostToolUse", "UserPromptSubmit"],
        hookDescription: "Silently captures every tool call as observations and routes prompts to the matching discipline skill via the route table. Lightweight and non-blocking.",
    },
    expert: {
        description: "Expert mode: tune confidence, manage instincts, and persist plans on disk. Adds safety, token-budget, and strategic-compact skills plus the /learn-eval command so long sessions stay disciplined and learnings survive context resets.",
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
    const gateguardCommand = {
        type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/gateguard.mjs\"",
        timeout: 5,
    };
    const companionPreferenceCommand = {
        type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/companion-preference.mjs\"",
        timeout: 5,
    };
    const observeCommand = {
        type: "command",
        command: "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/observe.sh\"",
        timeout: 5,
    };
    const sessionCommand = {
        type: "command",
        command: "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/session.sh\"",
        timeout: 5,
    };
    const threeSectionCloseCommand = {
        type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/three-section-close.mjs\"",
        timeout: 5,
    };
    const routePromptCommand = {
        type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/route-prompt.mjs\"",
        timeout: 5,
    };
    return {
        description: "Gateguard fact-forcing PreToolUse, companion-preference enforcement, observation, session lifecycle, 3-section-close discipline, and UserPromptSubmit lazy-routing hooks for continuous-improvement.",
        hooks: {
            // gateguard runs FIRST on PreToolUse so its block decision short-circuits
            // before companion-preference sees the call. companion-preference runs
            // second on Skill tool calls; it is a no-op under ci-first (the default)
            // and never blocks under companions-first. observe.sh only runs on
            // PostToolUse: gateguard-blocked calls are intentionally not observed so
            // PreToolUse stays at two subprocesses on the hot path. route-prompt
            // fires on UserPromptSubmit and emits a system-reminder when a prompt
            // pattern in hooks/route-table.json matches; non-matching prompts pass
            // through with no output.
            PreToolUse: [
                { hooks: [gateguardCommand, companionPreferenceCommand] },
            ],
            PostToolUse: [{ hooks: [observeCommand] }],
            UserPromptSubmit: [{ hooks: [routePromptCommand] }],
            SessionStart: [{ hooks: [sessionCommand] }],
            SessionEnd: [{ hooks: [sessionCommand] }],
            Stop: [{ hooks: [threeSectionCloseCommand] }],
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
            ...THIRD_PARTY_COMPANIONS,
            ...extraPlugins,
        ],
    };
}
