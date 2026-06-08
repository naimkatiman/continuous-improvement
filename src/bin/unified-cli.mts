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

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import CLIAnything from "../lib/cli-anything.mjs";

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

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(`Fatal error: ${getErrorMessage(error)}`);
    process.exit(1);
  });
}

export default UnifiedCLI;
