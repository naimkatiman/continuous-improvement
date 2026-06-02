#!/usr/bin/env node
/**
 * CLI-Anything: Turn open-source software into agent-native CLIs.
 *
 * Analyzes a repository and generates an agent-friendly CLI wrapper that
 * language models can drive automatically.
 */
import { existsSync } from "node:fs";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const DEFAULT_OPTIONS = {
    outputDir: "./generated-clis",
    verbose: false,
};
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
export default class CLIAnything {
    options;
    constructor(options = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }
    async generateCLI(repoPath, options = {}) {
        try {
            this.log(`Analyzing repository: ${repoPath}`);
            const repoInfo = await this.analyzeRepository(repoPath);
            const commands = await this.extractCommands(repoPath, repoInfo);
            const cliWrapper = await this.generateCLIWrapper(repoInfo, commands, options);
            const outputPath = await this.saveCLI(repoInfo, cliWrapper);
            this.log(`✅ CLI generated: ${outputPath}`);
            return { outputPath, repoInfo, commands };
        }
        catch (error) {
            throw new Error(`Failed to generate CLI: ${getErrorMessage(error)}`);
        }
    }
    async analyzeRepository(repoPath) {
        const packageJsonPath = join(repoPath, "package.json");
        const readmePath = join(repoPath, "README.md");
        let packageJson = {};
        let readme = "";
        try {
            const packageContent = await readFile(packageJsonPath, "utf8");
            packageJson = JSON.parse(packageContent);
        }
        catch {
            // Not a Node.js project or no package.json.
        }
        try {
            readme = await readFile(readmePath, "utf8");
        }
        catch {
            // No README.
        }
        const projectType = this.detectProjectType(repoPath, packageJson);
        const existingCLI = this.extractExistingCLI(packageJson);
        const hasBin = !!packageJson.bin &&
            (typeof packageJson.bin === "string" ||
                Object.keys(packageJson.bin).length > 0);
        return {
            name: packageJson.name ?? this.extractRepoName(repoPath),
            version: packageJson.version ?? "1.0.0",
            description: packageJson.description ?? "",
            projectType,
            existingCLI,
            hasBin,
            scripts: packageJson.scripts ?? {},
            dependencies: packageJson.dependencies ?? {},
            readme,
        };
    }
    detectProjectType(repoPath, packageJson) {
        const { dependencies = {}, devDependencies = {} } = packageJson;
        const allDeps = { ...dependencies, ...devDependencies };
        if (allDeps.express || allDeps.koa || allDeps.fastify)
            return "node-server";
        if (allDeps.react || allDeps["react-dom"])
            return "react-app";
        if (allDeps.vue)
            return "vue-app";
        if (allDeps.angular)
            return "angular-app";
        if (allDeps.next)
            return "next-app";
        if (allDeps.gatsby)
            return "gatsby-app";
        if (allDeps.python || allDeps["python-shell"])
            return "python-wrapper";
        if (allDeps.docker || allDeps["dockerode"])
            return "docker-tool";
        if (existsSync(join(repoPath, "Dockerfile")))
            return "docker-project";
        if (existsSync(join(repoPath, "requirements.txt")) ||
            existsSync(join(repoPath, "setup.py")) ||
            existsSync(join(repoPath, "pyproject.toml"))) {
            return "python-project";
        }
        if (existsSync(join(repoPath, "Cargo.toml")))
            return "rust-project";
        if (existsSync(join(repoPath, "go.mod")))
            return "go-project";
        return "generic";
    }
    extractExistingCLI(packageJson) {
        const cli = {
            bin: packageJson.bin ?? {},
            scripts: {},
            mainCommand: null,
        };
        if (packageJson.scripts) {
            for (const [name, script] of Object.entries(packageJson.scripts)) {
                if (name.includes("start") ||
                    name.includes("build") ||
                    name.includes("test") ||
                    name.includes("dev") ||
                    name.includes("serve") ||
                    name.includes("run")) {
                    cli.scripts[name] = script;
                }
            }
        }
        if (typeof cli.bin === "object") {
            const keys = Object.keys(cli.bin);
            if (keys.length > 0)
                cli.mainCommand = keys[0] ?? null;
        }
        else if (typeof cli.bin === "string") {
            cli.mainCommand = "main";
        }
        return cli;
    }
    async extractCommands(_repoPath, repoInfo) {
        const commands = [];
        for (const [name, script] of Object.entries(repoInfo.scripts)) {
            commands.push({
                type: "script",
                name,
                command: script,
                description: this.generateScriptDescription(name),
                category: this.categorizeScript(name),
            });
        }
        const { bin } = repoInfo.existingCLI;
        if (typeof bin === "object") {
            for (const [name, path] of Object.entries(bin)) {
                commands.push({
                    type: "binary",
                    name,
                    path,
                    description: `Execute ${name} command`,
                    category: "core",
                });
            }
        }
        commands.push(...this.generateProjectTypeCommands(repoInfo));
        return commands;
    }
    generateProjectTypeCommands(repoInfo) {
        const commands = [];
        switch (repoInfo.projectType) {
            case "node-server":
                commands.push({ type: "generated", name: "start", command: "npm start", description: "Start the server", category: "lifecycle" }, { type: "generated", name: "dev", command: "npm run dev", description: "Start in development mode", category: "development" }, { type: "generated", name: "test", command: "npm test", description: "Run tests", category: "testing" });
                break;
            case "react-app":
            case "next-app":
                commands.push({ type: "generated", name: "dev", command: "npm run dev", description: "Start development server", category: "development" }, { type: "generated", name: "build", command: "npm run build", description: "Build for production", category: "build" }, { type: "generated", name: "test", command: "npm test", description: "Run tests", category: "testing" }, { type: "generated", name: "lint", command: "npm run lint", description: "Run linting", category: "quality" });
                break;
            case "python-project":
                commands.push({ type: "generated", name: "install", command: "pip install -r requirements.txt", description: "Install dependencies", category: "setup" }, { type: "generated", name: "run", command: "python main.py", description: "Run main script", category: "core" }, { type: "generated", name: "test", command: "python -m pytest", description: "Run tests", category: "testing" });
                break;
            case "docker-project":
                commands.push({ type: "generated", name: "build", command: "docker build -t app .", description: "Build Docker image", category: "build" }, { type: "generated", name: "run", command: "docker run -p 3000:3000 app", description: "Run Docker container", category: "core" });
                break;
            default:
                break;
        }
        return commands;
    }
    async generateCLIWrapper(repoInfo, commands, options = {}) {
        const template = await this.getTemplate(options.template ?? "default");
        const className = repoInfo.name.replace(/[^a-zA-Z0-9]/g, "");
        return template
            .replace(/{{NAME}}/g, className)
            .replace(/{{VERSION}}/g, repoInfo.version)
            .replace(/{{DESCRIPTION}}/g, repoInfo.description)
            .replace(/{{COMMANDS}}/g, this.generateCommandsCode(commands))
            .replace(/{{PROJECT_TYPE}}/g, repoInfo.projectType)
            .replace(/{{REPO_INFO}}/g, JSON.stringify(repoInfo, null, 2));
    }
    generateCommandsCode(commands) {
        const commandGroups = this.groupCommands(commands);
        let code = "";
        for (const [category, categoryCommands] of Object.entries(commandGroups)) {
            code += `  // ${category.toUpperCase()} COMMANDS\n`;
            for (const cmd of categoryCommands) {
                const safeName = cmd.name.replace(/[^a-zA-Z0-9]/g, "_");
                code += `  ${safeName}: {
    description: '${cmd.description}',
    execute: async (args = []) => {
      return await this.runCommand('${cmd.command ?? ""}', args);
    }
  },\n`;
            }
            code += "\n";
        }
        return code.trim();
    }
    groupCommands(commands) {
        return commands.reduce((groups, cmd) => {
            const category = cmd.category || "general";
            if (!groups[category])
                groups[category] = [];
            groups[category].push(cmd);
            return groups;
        }, {});
    }
    async getTemplate(templateName) {
        const templates = {
            default: `#!/usr/bin/env node

/**
 * Auto-generated CLI wrapper for {{NAME}}
 * Generated by CLI-Anything tool
 */

import { spawn } from 'node:child_process';

const repoInfo = {{REPO_INFO}};

class {{NAME}}CLI {
  constructor() {
    this.commands = {
{{COMMANDS}}
    };
  }

  async runCommand(command, args = []) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        stdio: 'inherit',
        shell: true
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, code });
        } else {
          reject(new Error(\`Command failed with code \${code}\`));
        }
      });

      process.on('error', reject);
    });
  }

  async execute(commandName, args = []) {
    if (!this.commands[commandName]) {
      throw new Error(\`Unknown command: \${commandName}\`);
    }

    const command = this.commands[commandName];
    console.log(\`Executing: \${command.description}\`);

    try {
      const result = await command.execute(args);
      console.log(\`✅ \${command.description} completed successfully\`);
      return result;
    } catch (error) {
      console.error(\`❌ \${command.description} failed:\`, error.message);
      throw error;
    }
  }

  listCommands() {
    console.log('Available commands for {{NAME}}:');
    Object.entries(this.commands).forEach(([name, cmd]) => {
      console.log(\`  \${name.padEnd(15)} - \${cmd.description}\`);
    });
  }
}

if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const cli = new {{NAME}}CLI();
  const [,, command, ...args] = process.argv;

  if (!command || command === '--help' || command === '-h') {
    cli.listCommands();
    process.exit(0);
  }

  cli.execute(command, args).catch(error => {
    console.error(error);
    process.exit(1);
  });
}

export default {{NAME}}CLI;`,
        };
        return templates[templateName] ?? templates.default;
    }
    async saveCLI(repoInfo, cliWrapper) {
        const outputDir = this.options.outputDir;
        const fileName = `${repoInfo.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-cli.mjs`;
        const outputPath = join(outputDir, fileName);
        try {
            await access(outputDir);
        }
        catch {
            await mkdir(outputDir, { recursive: true });
        }
        await writeFile(outputPath, cliWrapper, "utf8");
        try {
            await chmod(outputPath, 0o755);
        }
        catch {
            // Ignore on Windows.
        }
        return outputPath;
    }
    extractRepoName(repoPath) {
        const segments = repoPath.split(/[\\/]/);
        const last = segments[segments.length - 1] ?? repoPath;
        return last.replace(/[^a-zA-Z0-9]/g, "-");
    }
    generateScriptDescription(name) {
        const descriptions = {
            start: "Start the application",
            dev: "Start in development mode",
            build: "Build the application",
            test: "Run tests",
            lint: "Run linting",
            serve: "Start the server",
            deploy: "Deploy the application",
        };
        return descriptions[name] ?? `Execute script: ${name}`;
    }
    categorizeScript(name) {
        if (["start", "dev", "serve"].includes(name))
            return "lifecycle";
        if (["build", "compile"].includes(name))
            return "build";
        if (["test", "spec"].includes(name))
            return "testing";
        if (["lint", "format", "type-check"].includes(name))
            return "quality";
        if (["deploy", "publish"].includes(name))
            return "deployment";
        return "general";
    }
    log(message) {
        if (this.options.verbose) {
            console.log(`[CLI-Anything] ${message}`);
        }
    }
}
if (import.meta.url === `file://${process.argv[1]}`) {
    const [, , repoPath, ...args] = process.argv;
    if (!repoPath || repoPath === "--help" || repoPath === "-h") {
        console.log(`
Usage: cli-anything <repository-path> [options]

Options:
  --output-dir <dir>    Output directory for generated CLIs (default: ./generated-clis)
  --verbose             Enable verbose logging
  --template <name>     Template to use (default: default)
  --help                Show this help

Examples:
  cli-anything ./my-project
  cli-anything ./my-project --output-dir ./tools --verbose
`);
        process.exit(0);
    }
    const options = {};
    for (let i = 0; i < args.length; i++) {
        const flag = args[i];
        if (flag === "--output-dir" && args[i + 1]) {
            options.outputDir = args[i + 1];
            i++;
        }
        else if (flag === "--verbose") {
            options.verbose = true;
        }
        else if (flag === "--template" && args[i + 1]) {
            options.template = args[i + 1];
            i++;
        }
    }
    const cliAnything = new CLIAnything(options);
    cliAnything
        .generateCLI(repoPath, { template: options.template })
        .then((result) => {
        console.log(`✅ CLI generated successfully!`);
        console.log(`📁 Output: ${result.outputPath}`);
        console.log(`📊 Commands found: ${result.commands.length}`);
    })
        .catch((error) => {
        console.error(`❌ Error: ${getErrorMessage(error)}`);
        process.exit(1);
    });
}
