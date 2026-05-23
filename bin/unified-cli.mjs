#!/usr/bin/env node
/**
 * Unified Continuous Improvement CLI.
 *
 * Comprehensive command-line interface for the unified plugin that combines
 * CLI-Anything, Compound Engineering, and PM-Skills.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import UnifiedContinuousImprovement from "../lib/unified-plugin.mjs";
const DEFAULT_CONFIG = {
    workspace: "./ci-workspace",
    verbose: false,
    defaultMode: "expert",
};
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function parseJsonOption(raw) {
    if (!raw)
        return undefined;
    try {
        return JSON.parse(raw);
    }
    catch (error) {
        throw new Error(`Invalid JSON option: ${getErrorMessage(error)}`);
    }
}
class UnifiedCLI {
    plugin = null;
    config;
    constructor() {
        this.config = this.loadConfig();
    }
    loadConfig() {
        const configPath = join(process.cwd(), ".ci-config.json");
        if (existsSync(configPath)) {
            try {
                const parsed = JSON.parse(readFileSync(configPath, "utf8"));
                return { ...DEFAULT_CONFIG, ...parsed };
            }
            catch {
                console.warn("Warning: Invalid config file, using defaults");
            }
        }
        return { ...DEFAULT_CONFIG };
    }
    initializePlugin(options) {
        this.plugin = new UnifiedContinuousImprovement({
            workspace: options.workspace ?? this.config.workspace,
            verbose: options.verbose ?? this.config.verbose,
        });
        return this.plugin;
    }
    requirePlugin() {
        if (!this.plugin) {
            throw new Error("CLI plugin not initialized");
        }
        return this.plugin;
    }
    async runCommand(command, args, options = {}) {
        this.initializePlugin(options);
        switch (command) {
            case "init":
                return this.handleInit(args, options);
            case "workflow":
                return this.handleWorkflow(args, options);
            case "research":
                return this.handleResearch(options);
            case "planning":
                return this.handlePlanning(options);
            case "execution":
                return this.handleExecution();
            case "review":
                return this.handleReview(options);
            case "status":
                return this.handleStatus();
            case "cli":
                return this.handleCLI(args);
            case "pm":
                return this.handlePM(args, options);
            case "compound":
                return this.handleCompound(args);
            case "learnings":
                return this.handleLearnings(args);
            case "config":
                return this.handleConfig(args);
            default:
                throw new Error(`Unknown command: ${command}`);
        }
    }
    async handleInit(args, options) {
        if (args.length < 2) {
            throw new Error("Usage: ci init <project-name> <objective> [options]");
        }
        const [name, ...objectiveParts] = args;
        const objective = objectiveParts.join(" ");
        console.log(`🚀 Initializing project: ${name}`);
        console.log(`📋 Objective: ${objective}`);
        const plugin = this.requirePlugin();
        const result = await plugin.initializeProject({
            name: name,
            objective,
            product: parseJsonOption(options.product) ?? {},
            industry: options.industry ?? "",
            targetMarket: parseJsonOption(options.targetMarket) ?? {},
        });
        console.log(`✅ Project initialized successfully!`);
        console.log(`🆔 Project ID: ${result.projectId}`);
        console.log(`🔗 Session ID: ${result.sessionId}`);
        console.log(`📊 PM Analysis: ${result.pmAnalysis.totalSkills} skills completed`);
        console.log(`\n🎯 Next steps:`);
        result.nextSteps.forEach((step, i) => {
            console.log(`   ${i + 1}. ${step}`);
        });
        return result;
    }
    async handleWorkflow(args, options) {
        if (args.length < 2) {
            throw new Error("Usage: ci workflow <project-name> <objective> [options]");
        }
        const [name, ...objectiveParts] = args;
        const objective = objectiveParts.join(" ");
        console.log(`🚀 Starting complete workflow for: ${name}`);
        console.log(`📋 Objective: ${objective}`);
        const progressCallback = (message) => {
            console.log(`   ⏳ ${message}`);
        };
        const plugin = this.requirePlugin();
        const result = await plugin.executeCompleteWorkflow({
            name: name,
            objective,
            product: parseJsonOption(options.product) ?? {},
            industry: options.industry ?? "",
            targetMarket: parseJsonOption(options.targetMarket) ?? {},
        }, {
            researchContext: options.repo ? { repositoryPath: options.repo } : {},
            progressCallback,
        });
        console.log(`🎉 Complete workflow finished!`);
        console.log(`🆔 Project: ${result.project}`);
        console.log(`🔗 Session: ${result.sessionId}`);
        for (const [phase] of Object.entries(result.phases)) {
            console.log(`\n📊 ${phase.charAt(0).toUpperCase() + phase.slice(1)} Phase:`);
        }
        return result;
    }
    async handleResearch(options) {
        console.log(`🔍 Starting research phase...`);
        const context = {};
        if (options.repo)
            context.repositoryPath = options.repo;
        if (options.context)
            context.additionalContext = parseJsonOption(options.context);
        const plugin = this.requirePlugin();
        const result = await plugin.executeResearchPhase(context);
        console.log(`✅ Research phase completed!`);
        console.log(`💡 Generated ${result.brainstorm.ideas.length} ideas`);
        console.log(`🔍 Identified ${result.brainstorm.risks.length} risks`);
        if (result.cliTools) {
            console.log(`🛠️  Generated CLI with ${result.cliTools.commands.length} commands`);
        }
        return result;
    }
    async handlePlanning(options) {
        console.log(`📋 Starting planning phase...`);
        const preferences = parseJsonOption(options.preferences) ?? {};
        const plugin = this.requirePlugin();
        const result = await plugin.executePlanningPhase(preferences);
        console.log(`✅ Planning phase completed!`);
        console.log(`📈 Created plan with ${result.corePlan.steps.length} steps`);
        const estimated = result.corePlan.timeline?.estimated;
        if (estimated)
            console.log(`⏱️  Timeline: ${estimated}`);
        console.log(`⚠️  Identified ${result.risks.length} risks`);
        return result;
    }
    async handleExecution() {
        console.log(`🔧 Starting execution phase...`);
        const progressCallback = (message) => {
            console.log(`   ⚡ ${message}`);
        };
        const plugin = this.requirePlugin();
        const result = await plugin.executeWorkingPhase(progressCallback);
        console.log(`✅ Execution phase completed!`);
        console.log(`📋 Completed ${result.coreWork.steps.length} steps`);
        console.log(`🔧 Resolved ${result.issues.length} issues`);
        console.log(`💡 Applied ${result.solutions.length} solutions`);
        return result;
    }
    async handleReview(options) {
        console.log(`🔍 Starting review phase...`);
        const criteria = parseJsonOption(options.criteria);
        const plugin = this.requirePlugin();
        const result = await plugin.executeReviewPhase(criteria);
        console.log(`✅ Review phase completed!`);
        console.log(`📊 Overall score: ${result.coreReview.review.overallScore}/100`);
        console.log(`💡 Generated ${result.learnings.length} learnings`);
        console.log(`📋 Created ${result.recommendations.length} recommendations`);
        return result;
    }
    async handleStatus() {
        const plugin = this.requirePlugin();
        const status = await plugin.getProjectStatus();
        console.log(`📊 Project Status:`);
        console.log(`   Project: ${status.project ?? "No active project"}`);
        console.log(`   Session: ${status.sessionId ?? "N/A"}`);
        console.log(`   Current Phase: ${status.currentPhase ?? "N/A"}`);
        if (status.progress) {
            console.log(`   Progress: ${status.progress.completed}/${status.progress.total} (${status.progress.percentage}%)`);
        }
        if (status.nextSteps && status.nextSteps.length > 0) {
            console.log(`\n🎯 Next Steps:`);
            status.nextSteps.forEach((step, i) => {
                console.log(`   ${i + 1}. ${step}`);
            });
        }
        return status;
    }
    async handleCLI(args) {
        const [subcommand, ...subArgs] = args;
        switch (subcommand) {
            case "generate":
                if (subArgs.length === 0) {
                    throw new Error("Usage: ci cli generate <repository-path>");
                }
                return this.handleCLIGenerate(subArgs[0]);
            case "list":
                return this.handleCLIList();
            default:
                throw new Error("Usage: ci cli <generate|list> [args]");
        }
    }
    async handleCLIGenerate(repoPath) {
        console.log(`🛠️  Generating CLI for: ${repoPath}`);
        const plugin = this.requirePlugin();
        const result = await plugin.cliAnything.generateCLI(repoPath);
        console.log(`✅ CLI generated successfully!`);
        console.log(`📁 Output: ${result.outputPath}`);
        console.log(`🔧 Commands: ${result.commands.length}`);
        console.log(`\n📋 Available Commands:`);
        for (const cmd of result.commands) {
            console.log(`   ${cmd.name.padEnd(15)} - ${cmd.description}`);
        }
        return result;
    }
    handleCLIList() {
        console.log(`🛠️  CLI Generation Tool Status: Ready`);
        console.log(`   Repository Analysis: Supported`);
        console.log(`   Project Types: Node.js, React, Python, Docker, and more`);
        console.log(`   Output Format: Executable JavaScript`);
    }
    async handlePM(args, options) {
        const [subcommand, ...subArgs] = args;
        switch (subcommand) {
            case "analyze":
                return this.handlePMAnalyze(options);
            case "skill":
                return this.handlePMSkill(subArgs);
            case "list":
                return this.handlePMList();
            default:
                throw new Error("Usage: ci pm <analyze|skill|list> [args]");
        }
    }
    async handlePMAnalyze(options) {
        console.log(`📊 Running comprehensive PM analysis...`);
        const productInfo = {
            product: parseJsonOption(options.product) ?? {},
            industry: options.industry ?? "Technology",
            targetMarket: parseJsonOption(options.targetMarket) ?? {},
        };
        const plugin = this.requirePlugin();
        const result = await plugin.pmSkills.runProductAnalysis(productInfo);
        console.log(`✅ PM analysis completed!`);
        console.log(`📊 Summary: ${result.summary.completedSkills}/${result.summary.totalSkills} skills completed`);
        console.log(`💡 Key insights: ${result.summary.keyInsights.length}`);
        console.log(`📋 Recommendations: ${result.summary.recommendations.length}`);
        console.log(`📁 Results saved to: ${result.savedTo}`);
        return result;
    }
    async handlePMSkill(args) {
        if (args.length === 0) {
            throw new Error("Usage: ci pm skill <skill-name>");
        }
        const [skillName] = args;
        console.log(`📊 Executing PM skill: ${skillName}`);
        const input = {
            product: { name: "Sample Product" },
            market: { size: "Medium" },
        };
        const plugin = this.requirePlugin();
        const result = await plugin.pmSkills.executeSkill(skillName, input);
        console.log(`✅ PM skill ${skillName} completed!`);
        console.log(`📁 Results saved to: ${result.savedTo}`);
        return result;
    }
    handlePMList() {
        const plugin = this.requirePlugin();
        const skills = plugin.pmSkills.getAvailableSkills();
        console.log(`📊 Available PM Skills:`);
        for (const skill of skills) {
            console.log(`   ${skill.name.padEnd(20)} - ${skill.description} [${skill.category}]`);
        }
    }
    async handleCompound(args) {
        const [subcommand, ...subArgs] = args;
        switch (subcommand) {
            case "session":
                return this.handleCompoundSession(subArgs);
            case "learnings":
                return this.handleCompoundLearnings();
            default:
                throw new Error("Usage: ci compound <session|learnings> [args]");
        }
    }
    async handleCompoundSession(args) {
        if (args.length < 2) {
            throw new Error("Usage: ci compound session <project-name> <objective>");
        }
        const [name, ...objectiveParts] = args;
        const objective = objectiveParts.join(" ");
        console.log(`🔧 Starting compound engineering session...`);
        const plugin = this.requirePlugin();
        const session = await plugin.compoundEngineering.startSession(name, objective);
        console.log(`✅ Session started!`);
        console.log(`🆔 Session ID: ${session.id}`);
        console.log(`📋 Objective: ${session.objective}`);
        console.log(`🔄 Current Phase: ${session.phase}`);
        return session;
    }
    async handleCompoundLearnings() {
        console.log(`📚 Loading compound engineering learnings...`);
        const plugin = this.requirePlugin();
        await plugin.compoundEngineering.loadLearnings();
        const learnings = plugin.compoundEngineering.getAllLearnings();
        console.log(`📚 Found ${learnings.length} learnings:`);
        for (const learning of learnings) {
            console.log(`   [${learning.confidence.toFixed(2)}] ${learning.summary}`);
        }
        return learnings;
    }
    async handleLearnings(args) {
        const [subcommand, ...subArgs] = args;
        switch (subcommand) {
            case "search":
                return this.handleLearningsSearch(subArgs.join(" "));
            case "all":
                return this.handleLearningsAll();
            default:
                throw new Error("Usage: ci learnings <search|all> [query]");
        }
    }
    async handleLearningsSearch(query) {
        console.log(`🔍 Searching learnings for: "${query}"`);
        const plugin = this.requirePlugin();
        await plugin.compoundEngineering.loadLearnings();
        const results = plugin.compoundEngineering.searchLearnings(query);
        console.log(`🔍 Found ${results.length} matching learnings:`);
        for (const learning of results) {
            console.log(`   [${learning.confidence.toFixed(2)}] ${learning.summary}`);
        }
        return results;
    }
    async handleLearningsAll() {
        console.log(`📚 Loading all learnings...`);
        const plugin = this.requirePlugin();
        await plugin.compoundEngineering.loadLearnings();
        const learnings = plugin.compoundEngineering.getAllLearnings();
        console.log(`📚 Total learnings: ${learnings.length}`);
        const grouped = learnings.reduce((groups, learning) => {
            const type = learning.type || "general";
            if (!groups[type])
                groups[type] = [];
            groups[type].push(learning);
            return groups;
        }, {});
        for (const [type, items] of Object.entries(grouped)) {
            console.log(`\n   ${type.charAt(0).toUpperCase() + type.slice(1)} (${items.length}):`);
            for (const learning of items) {
                console.log(`     [${learning.confidence.toFixed(2)}] ${learning.summary}`);
            }
        }
        return learnings;
    }
    async handleConfig(args) {
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
    handleConfigShow() {
        console.log(`⚙️  Current Configuration:`);
        console.log(`   Workspace: ${this.config.workspace}`);
        console.log(`   Verbose: ${this.config.verbose}`);
        console.log(`   Default Mode: ${this.config.defaultMode}`);
    }
    handleConfigSet(args) {
        if (args.length < 2) {
            throw new Error("Usage: ci config set <key> <value>");
        }
        const [key, value] = args;
        if (!key || value === undefined) {
            throw new Error("Usage: ci config set <key> <value>");
        }
        if (key === "workspace") {
            this.config.workspace = value;
        }
        else if (key === "verbose") {
            this.config.verbose = value === "true";
        }
        else if (key === "defaultMode") {
            this.config.defaultMode = value;
        }
        else {
            throw new Error(`Unknown config key: ${key}`);
        }
        console.log(`✅ Configuration updated: ${key} = ${value}`);
    }
}
function parseGlobalOptions(args) {
    const options = {};
    for (let i = 0; i < args.length; i++) {
        const flag = args[i];
        const next = args[i + 1];
        const consumeValue = (key) => {
            if (next === undefined)
                return;
            options[key] = next;
            args.splice(i, 2);
            i--;
        };
        switch (flag) {
            case "--workspace":
                consumeValue("workspace");
                break;
            case "--verbose":
                options.verbose = true;
                args.splice(i, 1);
                i--;
                break;
            case "--repo":
                consumeValue("repo");
                break;
            case "--product":
                consumeValue("product");
                break;
            case "--industry":
                consumeValue("industry");
                break;
            case "--target-market":
                consumeValue("targetMarket");
                break;
            default:
                break;
        }
    }
    return options;
}
async function main() {
    const [, , command, ...args] = process.argv;
    if (!command || command === "--help" || command === "-h") {
        console.log(`
Unified Continuous Improvement CLI

Usage: ci <command> [args] [options]

Main Commands:
  init <name> <objective>        Initialize new project with comprehensive analysis
  workflow <name> <objective>    Run complete end-to-end workflow
  research                       Execute research phase
  planning                       Execute planning phase
  execution                      Execute execution phase
  review                         Execute review phase
  status                         Show project status

Tool Commands:
  cli generate <repo-path>       Generate CLI for repository
  pm analyze                     Run comprehensive PM analysis
  pm skill <name>                Execute specific PM skill
  pm list                        List available PM skills
  compound session <name> <obj>  Start compound engineering session
  compound learnings             Show compound engineering learnings
  learnings search <query>       Search through all learnings
  learnings all                  Show all learnings

Configuration:
  config show                    Show current configuration
  config set <key> <value>       Set configuration value

Global Options:
  --workspace <dir>              Workspace directory
  --verbose                      Enable verbose logging
  --repo <path>                  Repository path for CLI generation
  --product <json>               Product information as JSON
  --industry <name>              Industry name
  --target-market <json>         Target market as JSON

Examples:
  ci init "MyApp" "Build a task management app"
  ci workflow "MyApp" "Build task management" --repo ./my-app
  ci cli generate ./my-repo
  ci pm analyze --industry "SaaS" --target-market '{"segment":"SMB"}'
  ci learnings search "performance"
`);
        process.exit(0);
    }
    const cli = new UnifiedCLI();
    const options = parseGlobalOptions(args);
    try {
        const result = await cli.runCommand(command, args, options);
        if (options.verbose && result) {
            console.log(`\n🔍 Detailed result:`);
            console.log(JSON.stringify(result, null, 2));
        }
    }
    catch (error) {
        console.error(`❌ Error: ${getErrorMessage(error)}`);
        process.exit(1);
    }
}
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error(`❌ Fatal error: ${getErrorMessage(error)}`);
        process.exit(1);
    });
}
export default UnifiedCLI;
