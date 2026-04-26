export const PACKAGE_NAME = "continuous-improvement";
export const VERSION = "3.3.0";
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
    "cursor",
    "codex",
    "gemini-cli",
    "github-action",
    "transcript-linter",
];
const CODEX_PLUGIN_INTERFACE = {
    displayName: "Continuous Improvement",
    shortDescription: "7 Laws, learning hooks, and MCP tools that keep coding agents disciplined.",
    longDescription: "Continuous Improvement packages the 7 Laws of AI Agent Discipline for Codex with reusable skills, slash commands, observation hooks, instinct packs, and an expert MCP server that captures patterns over time.",
    developerName: AUTHOR.name,
    category: "Productivity",
    capabilities: ["Read", "Write"],
    websiteURL: REPOSITORY_URL,
    defaultPrompt: [
        "Apply the 7 Laws before editing this codebase.",
        "Initialize planning-with-files for this task.",
        "Reflect on this session and extract new instincts.",
    ],
    brandColor: "#15803D",
};
const CLAUDE_PLUGIN_CATEGORY = "productivity";
const SHARED_PLUGIN_DESCRIPTION = "The 7 Laws of AI Agent Discipline with Claude Code and Codex-ready skills, hooks, commands, instinct packs, and MCP tools.";
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
        description: "Beginner plugin: 3 core tools for status, instincts, and reflection. Minimal MCP surface, easy to maintain.",
        hooks: ["PreToolUse", "PostToolUse"],
        hookDescription: "Silently captures every tool call as observations. Lightweight and non-blocking.",
    },
    expert: {
        description: "Expert plugin: 12 tools including instinct management, planning files, import/export, observation viewer, dashboard, and instinct packs.",
        hooks: ["PreToolUse", "PostToolUse", "SessionStart", "SessionEnd"],
        hookDescription: "Full hook suite: observation capture + session-level instinct loading and auto-reflection.",
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
export function getCodexPluginManifest() {
    return {
        name: PACKAGE_NAME,
        version: VERSION,
        description: SHARED_PLUGIN_DESCRIPTION,
        author: AUTHOR,
        homepage: HOMEPAGE_URL,
        repository: REPOSITORY_URL,
        license: "MIT",
        keywords: [...KEYWORDS],
        skills: "./skills/",
        hooks: "./hooks/hooks.json",
        mcpServers: "./.mcp.json",
        interface: { ...CODEX_PLUGIN_INTERFACE },
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
export function getCodexPluginHooksConfig() {
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
    return {
        description: "Observation and session lifecycle hooks for continuous-improvement.",
        hooks: {
            PreToolUse: [{ hooks: [observeCommand] }],
            PostToolUse: [{ hooks: [observeCommand] }],
            SessionStart: [{ hooks: [sessionCommand] }],
            SessionEnd: [{ hooks: [sessionCommand] }],
        },
    };
}
export function getCodexPluginMcpConfig() {
    return {
        [PACKAGE_NAME]: {
            command: "node",
            args: ["./bin/mcp-server.mjs", "--mode", "expert"],
        },
    };
}
export function getCodexMarketplaceManifest() {
    return {
        name: PACKAGE_NAME,
        interface: {
            displayName: CODEX_PLUGIN_INTERFACE.displayName,
        },
        plugins: [
            {
                name: PACKAGE_NAME,
                source: {
                    source: "local",
                    path: `./plugins/${PACKAGE_NAME}`,
                },
                policy: {
                    installation: "AVAILABLE",
                    authentication: "ON_INSTALL",
                },
                category: CODEX_PLUGIN_INTERFACE.category,
            },
        ],
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
export function getClaudeRepoMarketplaceManifest() {
    return {
        name: `${PACKAGE_NAME}-dev`,
        description: "Marketplace for the Continuous Improvement Claude Code plugin.",
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
        ],
    };
}
