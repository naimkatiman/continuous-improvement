export const PACKAGE_NAME = "continuous-improvement";
export const VERSION = "3.5.0";

export const PLUGIN_MODES = ["beginner", "expert"] as const;

export type PluginMode = typeof PLUGIN_MODES[number];
export type HookType = "PreToolUse" | "PostToolUse" | "SessionStart" | "SessionEnd" | "Stop";

export interface SchemaProperty {
  default?: boolean | number | string | string[];
  description?: string;
  items?: {
    type: string;
  };
  type: string;
}

export interface ToolDefinition {
  description: string;
  inputSchema: {
    properties: Record<string, SchemaProperty>;
    required: string[];
    type: "object";
  };
  name: string;
}

export interface PluginManifestTool {
  name: string;
  what: string;
}

export interface PluginManifest {
  description: string;
  hooks: {
    description: string;
    included: HookType[];
  };
  mode: PluginMode;
  name: string;
  setup: {
    claude_code: {
      mcpServers: Record<string, { args: string[]; command: string }>;
    };
    claude_desktop: {
      mcpServers: Record<string, { args: string[]; command: string }>;
    };
  };
  tools: PluginManifestTool[];
  version: string;
}

export interface PluginAuthor {
  name: string;
  url?: string;
}

export interface PluginHookCommand {
  command: string;
  timeout: number;
  type: "command";
}

export interface PluginHooksConfig {
  description: string;
  hooks: Partial<Record<HookType, Array<{ hooks: PluginHookCommand[] }>>>;
}

export interface ClaudePluginManifest {
  author: {
    name: string;
    url?: string;
  };
  description: string;
  homepage: string;
  keywords: string[];
  license: string;
  name: string;
  repository: string;
  version: string;
}

export interface ClaudeMarketplacePluginEntry {
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  category: string;
  description: string;
  homepage: string;
  name: string;
  source: string;
  version: string;
}

export interface ClaudePluginMarketplaceManifest {
  description: string;
  name: string;
  owner: {
    name: string;
  };
  plugins: ClaudeMarketplacePluginEntry[];
}

interface ToolCatalogEntry extends ToolDefinition {
  manifestWhat: string;
}

interface ModeMetadata {
  description: string;
  hookDescription: string;
  hooks: HookType[];
}

const REPOSITORY_URL = "https://github.com/naimkatiman/continuous-improvement";
const HOMEPAGE_URL = `${REPOSITORY_URL}#readme`;
const AUTHOR: PluginAuthor = {
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
const SHARED_PLUGIN_DESCRIPTION =
  "The 7 Laws of AI Agent Discipline for Claude Code. Stops your agent from skipping research, planning, and verification, and turns repeated patterns into instincts.";

export function isPluginMode(value: string | undefined): value is PluginMode {
  return value === "beginner" || value === "expert";
}

const BEGINNER_TOOL_ENTRIES: ToolCatalogEntry[] = [
  {
    name: "ci_status",
    description:
      "Show current level, instinct count, and observation count for this project. Good starting point to see what the system has learned.",
    manifestWhat: "See what the system has learned about your project",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ci_instincts",
    description:
      "List all learned instincts for this project with their confidence levels and behaviors.",
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
    description:
      "Generate a structured reflection for the current session. Provide a summary of what you worked on.",
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

const EXPERT_TOOL_ENTRIES: ToolCatalogEntry[] = [
  {
    name: "ci_reinforce",
    description:
      "Accept or reject an instinct suggestion. Adjusts confidence: +0.15 for accept, -0.1 for reject.",
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
    description:
      "Manually create a new instinct with a trigger, body, and starting confidence.",
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
    description:
      "Create task_plan.md, findings.md, and progress.md in the project root for persistent file-based planning.",
    manifestWhat: "Create project-root planning files for persistent task memory",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "Goal for the planning workflow" },
        phases: {
          type: "array",
          description:
            "Optional ordered phase names. Defaults to Research, Plan, Execute, Verify, Reflect.",
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
    description:
      "Summarize the status of task_plan.md, findings.md, and progress.md in the project root.",
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
    description:
      "Visual dashboard showing instinct health, observation stats, confidence distribution, and learning progress.",
    manifestWhat:
      "Visual dashboard showing instinct health, confidence distribution, and learning progress",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ci_load_pack",
    description:
      "Load a starter instinct pack (react, python, go) into the current project.",
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

const MODE_METADATA: Record<PluginMode, ModeMetadata> = {
  beginner: {
    description:
      "Beginner mode: see what your agent learned, list its instincts, and request a session reflection. Bundles four discipline skills (gateguard, para-memory-files, tdd-workflow, verification-loop) so research, memory, tests, and verification happen by default.",
    hooks: ["PreToolUse", "PostToolUse"],
    hookDescription:
      "Silently captures every tool call as observations. Lightweight and non-blocking.",
  },
  expert: {
    description:
      "Expert mode: tune confidence, manage instincts, and persist plans on disk. Adds safety, token-budget, and strategic-compact skills plus the /learn-eval command so long sessions stay disciplined and learnings survive context resets.",
    hooks: ["PreToolUse", "PostToolUse", "SessionStart", "SessionEnd"],
    hookDescription:
      "Full hook suite: observation capture + session-level instinct loading and auto-reflection.",
  },
};

function getToolCatalog(mode: PluginMode): ToolCatalogEntry[] {
  return mode === "expert"
    ? [...BEGINNER_TOOL_ENTRIES, ...EXPERT_TOOL_ENTRIES]
    : [...BEGINNER_TOOL_ENTRIES];
}

export function getToolDefinitions(mode: PluginMode): ToolDefinition[] {
  return getToolCatalog(mode).map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));
}

export function getToolNames(mode: PluginMode): string[] {
  return getToolCatalog(mode).map((tool) => tool.name);
}

export function getPluginManifest(mode: PluginMode): PluginManifest {
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

export function getClaudePluginManifest(): ClaudePluginManifest {
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

export function getPluginHooksConfig(): PluginHooksConfig {
  const observeCommand = {
    type: "command" as const,
    command: "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/observe.sh\"",
    timeout: 5,
  };
  const sessionCommand = {
    type: "command" as const,
    command: "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/session.sh\"",
    timeout: 5,
  };
  const threeSectionCloseCommand = {
    type: "command" as const,
    command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/three-section-close.mjs\"",
    timeout: 5,
  };

  return {
    description:
      "Observation, session lifecycle, and 3-section-close discipline hooks for continuous-improvement.",
    hooks: {
      PreToolUse: [{ hooks: [observeCommand] }],
      PostToolUse: [{ hooks: [observeCommand] }],
      SessionStart: [{ hooks: [sessionCommand] }],
      SessionEnd: [{ hooks: [sessionCommand] }],
      Stop: [{ hooks: [threeSectionCloseCommand] }],
    },
  };
}

export function getClaudePluginMarketplaceManifest(): ClaudePluginMarketplaceManifest {
  return {
    name: `${PACKAGE_NAME}-dev`,
    description:
      "Development marketplace for the Continuous Improvement Claude Code plugin.",
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

export function getClaudeRepoMarketplaceManifest(
  extraPlugins: ClaudeMarketplacePluginEntry[] = [],
): ClaudePluginMarketplaceManifest {
  return {
    name: PACKAGE_NAME,
    description:
      "Marketplace for the Continuous Improvement Claude Code plugin.",
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
      ...extraPlugins,
    ],
  };
}
