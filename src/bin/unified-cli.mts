#!/usr/bin/env node

/**
 * CLI-Anything command (`ci`).
 *
 * Thin front-end over the CLIAnything library: turns a repository into an
 * agent-native CLI wrapper that a language model can drive.
 *
 * The former Compound Engineering and PM-Skills tools (and the unified-plugin
 * orchestrator that combined all three) were removed in 3.13.0 - Compound
 * Engineering overlapped the Mulahazah instinct engine and PM-Skills overlapped
 * the out-of-band phuryn/pm-skills marketplace install. See CHANGELOG [3.13.0].
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveInstinctsRoot, resolveProjectRoot } from "../lib/agent-paths.mjs";
import CLIAnything from "../lib/cli-anything.mjs";
import {
  isInstinctLoadOff,
  isLessonPathAllowed,
  LESSON_FORMATS,
  LESSON_SCOPES,
  lessonRoute,
  lessonRouteNote,
  type LessonScope,
  projectLessonRoute,
  readLessonSources,
  renderForRoute,
  renderLessonBlock,
  renderLessons,
} from "../lib/lesson-render.mjs";
import { resolveHomeDir } from "../lib/resolve-home-dir.mjs";

interface Config {
  verbose: boolean;
  workspace: string;
}

interface ParsedOptions {
  verbose?: boolean;
  workspace?: string;
}

const DEFAULT_CONFIG: Config = {
  workspace: "./ci-workspace",
  verbose: false,
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class UnifiedCLI {
  private readonly config: Config;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    const configPath = join(process.cwd(), ".ci-config.json");
    if (existsSync(configPath)) {
      try {
        const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Partial<Config>;
        return { ...DEFAULT_CONFIG, ...parsed };
      } catch {
        console.warn("Warning: invalid config file, using defaults");
      }
    }
    return { ...DEFAULT_CONFIG };
  }

  async runCommand(
    command: string,
    args: string[],
    options: ParsedOptions = {},
  ): Promise<unknown> {
    switch (command) {
      case "generate":
        return this.handleGenerate(args, options);
      case "list":
        return this.handleList();
      case "config":
        return this.handleConfig(args);
      case "lessons":
        return handleLessons(args);
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  private async handleGenerate(args: string[], options: ParsedOptions): Promise<unknown> {
    const repoPath = args[0];
    if (!repoPath) {
      throw new Error("Usage: ci generate <repository-path>");
    }

    const cliAnything = new CLIAnything({
      outputDir: options.workspace ?? this.config.workspace,
      verbose: options.verbose ?? this.config.verbose,
    });
    const result = await cliAnything.generateCLI(repoPath);

    console.log(`Generated CLI for: ${repoPath}`);
    console.log(`  Output: ${result.outputPath}`);
    console.log(`  Commands: ${result.commands.length}`);
    for (const cmd of result.commands) {
      console.log(`    ${cmd.name.padEnd(15)} ${cmd.description}`);
    }

    return result;
  }

  private handleList(): void {
    console.log("CLI-Anything status: ready");
    console.log("  Repository analysis: supported");
    console.log("  Project types: Node.js, React, Python, Docker, and more");
    console.log("  Output format: executable JavaScript");
  }

  private handleConfig(args: string[]): unknown {
    const [subcommand, ...subArgs] = args;
    switch (subcommand) {
      case "show":
        return this.handleConfigShow();
      case "set":
        return this.handleConfigSet(subArgs);
      default:
        throw new Error("Usage: ci config <show|set> [key] [value]");
    }
  }

  private handleConfigShow(): void {
    console.log("Current configuration:");
    console.log(`  Workspace: ${this.config.workspace}`);
    console.log(`  Verbose: ${this.config.verbose}`);
  }

  private handleConfigSet(args: string[]): void {
    const [key, value] = args;
    if (!key || value === undefined) {
      throw new Error("Usage: ci config set <key> <value>");
    }

    if (key === "workspace") {
      this.config.workspace = value;
    } else if (key === "verbose") {
      this.config.verbose = value === "true";
    } else {
      throw new Error(`Unknown config key: ${key}`);
    }

    console.log(`Configuration updated: ${key} = ${value}`);
  }
}

const LESSONS_USAGE = `Usage: ci lessons --format <${LESSON_FORMATS.join("|")}> [--scope ${LESSON_SCOPES.join("|")}] [--write]`;

function parseLessonsArgs(args: readonly string[]): { format: string; scope: LessonScope | null; write: boolean } {
  let format: string | undefined;
  let scope: string | undefined;
  let write = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--write") write = true;
    else if (arg === "--format") format = args[++i];
    else if (arg.startsWith("--format=")) format = arg.slice("--format=".length);
    else if (arg === "--scope") scope = args[++i] ?? "";
    else if (arg.startsWith("--scope=")) scope = arg.slice("--scope=".length);
    else throw new Error(`${LESSONS_USAGE}\nUnexpected argument: ${arg}`);
  }
  if (!format) throw new Error(LESSONS_USAGE);
  if (scope !== undefined && !LESSON_SCOPES.includes(scope)) {
    throw new Error(`${LESSONS_USAGE}\nUnknown --scope: ${JSON.stringify(scope)}. Valid: ${LESSON_SCOPES.join(", ")}`);
  }
  return { format, scope: (scope as LessonScope | undefined) ?? null, write };
}

// The project directory a project-scope route is written in: the root that
// picks the instincts bucket, when it is an absolute, existing directory.
function projectDir(): string {
  const root = resolveProjectRoot();
  let usable = false;
  try {
    usable = isAbsolute(root) && statSync(root).isDirectory();
  } catch { }
  if (!usable) {
    throw new Error(`no project directory (${root}): run inside the project, or pass --scope user to write the user-level file`);
  }
  return root;
}

function lessonCount(block: string): number {
  return block.split("\n").filter((line) => line.startsWith("- ")).length;
}

// `ci lessons --format <agent> [--scope project|user] [--write]`
// (docs/plans/2026-11-21-all-agents.md, Architecture item 10). A hook agent
// gets the SessionStart bytes its encoder writes, for this project and
// global/, and nothing when CI_INSTINCT_LOAD is off, as hooks/session.mjs does.
// A static route is written only with --write. By the owner decision "User-level
// config writes" the default scope is the project: the route inside it, with
// this project's lessons and global/. `--scope user` writes the user-level file
// instead, with global/ only, because that file loads in every repository.
function handleLessons(args: readonly string[]): void {
  const { format, scope: givenScope, write } = parseLessonsArgs(args);
  const home = resolveHomeDir();
  if (!home) throw new Error("no home directory: set HOME or USERPROFILE");
  const userRoute = lessonRoute(format, home, process.env, process.platform);
  const instinctsRoot = resolveInstinctsRoot(home);
  if (userRoute === null) {
    const hookRoute = `${format} reads the lessons from its SessionStart hook (hooks/session.mjs --agent ${format})`;
    if (write) throw new Error(`${hookRoute}; there is no static route to write`);
    if (givenScope !== null) throw new Error(`${hookRoute}; --scope applies only to a static route`);
    if (isInstinctLoadOff(process.env.CI_INSTINCT_LOAD)) return;
    const { contents, projectCount } = readLessonSources(instinctsRoot, resolveProjectRoot());
    process.stdout.write(renderLessons(format, renderLessonBlock(contents, projectCount), null));
    return;
  }
  const scope: LessonScope = givenScope ?? "project";
  let route = userRoute;
  let block: string;
  if (scope === "user") {
    block = renderLessonBlock(readLessonSources(instinctsRoot, null).contents, 0);
  } else {
    const root = projectDir();
    const projectRoute = projectLessonRoute(format, root);
    if (projectRoute === null) throw new Error(`no project route for ${format}`);
    route = projectRoute;
    const { contents, projectCount } = readLessonSources(instinctsRoot, root);
    block = renderLessonBlock(contents, projectCount);
  }
  if (!isLessonPathAllowed(route.path, home)) {
    throw new Error(`refusing to write ${route.path}: nothing is written under ${join(home, ".agents")}`);
  }
  if (!write) {
    process.stdout.write(renderForRoute(route, block, null));
    console.error(`Would write ${route.path} (--scope ${scope}); pass --write to write it.`);
    return;
  }
  const existing = route.mode === "managed" && existsSync(route.path) ? readFileSync(route.path, "utf8") : null;
  const content = renderForRoute(route, block, existing);
  mkdirSync(dirname(route.path), { recursive: true });
  writeFileSync(route.path, content);
  console.log(`Wrote ${lessonCount(block)} lessons to ${route.path}`);
  const note = lessonRouteNote(format, route.path, home, process.env, scope);
  if (note) console.log(note);
}

function parseGlobalOptions(args: string[]): ParsedOptions {
  const options: ParsedOptions = {};

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const next = args[i + 1];

    switch (flag) {
      case "--workspace":
        if (next !== undefined) {
          options.workspace = next;
          args.splice(i, 2);
          i--;
        }
        break;
      case "--verbose":
        options.verbose = true;
        args.splice(i, 1);
        i--;
        break;
      default:
        break;
    }
  }

  return options;
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(`
CLI-Anything (ci) - turn a repository into an agent-native CLI

Usage: ci <command> [args] [options]

Commands:
  generate <repo-path>      Analyze a repository and generate an agent-native CLI wrapper
  list                      Show CLI-Anything capabilities
  config show               Show current configuration
  config set <key> <value>  Set a configuration value (workspace | verbose)
  lessons --format <agent>  Print the saved lessons as <agent> reads them
          [--write]         Write the agent's lessons rules file (grok, auggie,
                            junie, goose, zed, aider); nothing is written without it
          [--scope project|user]
                            Where that file lives: the project (default), or the
                            user-level file, written only with --scope user

Global Options:
  --workspace <dir>         Workspace directory (default: ./ci-workspace)
  --verbose                 Enable verbose logging

Examples:
  ci generate ./my-repo
  ci config set workspace ./out
`);
    process.exit(0);
  }

  const cli = new UnifiedCLI();
  const options = parseGlobalOptions(args);

  try {
    const result = await cli.runCommand(command, args, options);
    if (options.verbose && result) {
      console.log("\nDetailed result:");
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(`Error: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}

// argv[1] is a native path (backslashes on Windows) and may be an npm bin
// symlink, so compare real paths rather than a file:// string.
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main().catch((error: unknown) => {
    console.error(`Fatal error: ${getErrorMessage(error)}`);
    process.exit(1);
  });
}

export default UnifiedCLI;
