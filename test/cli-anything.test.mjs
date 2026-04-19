import assert from "node:assert/strict";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import CLIAnything from "../lib/cli-anything.mjs";
describe("CLI-Anything", () => {
    let cliAnything;
    let testDir = "";
    let testRepoPath = "";
    before(async () => {
        testDir = join(process.cwd(), "test-temp");
        testRepoPath = join(testDir, "test-repo");
        await mkdir(testRepoPath, { recursive: true });
        const packageJson = {
            name: "test-app",
            version: "1.0.0",
            description: "Test application for CLI generation",
            scripts: {
                start: "node server.js",
                dev: "nodemon server.js",
                build: "webpack --mode production",
                test: "jest",
                lint: "eslint src/",
            },
            dependencies: { express: "^4.18.0" },
        };
        await writeFile(join(testRepoPath, "package.json"), JSON.stringify(packageJson, null, 2));
        await writeFile(join(testRepoPath, "README.md"), "# Test App\n\nThis is a test application.");
        cliAnything = new CLIAnything({
            outputDir: join(testDir, "generated-clis"),
            verbose: false,
        });
    });
    after(async () => {
        try {
            await rm(testDir, { recursive: true, force: true });
        }
        catch {
            // ignore cleanup errors
        }
    });
    test("should analyze repository structure", async () => {
        const repoInfo = await cliAnything.analyzeRepository(testRepoPath);
        assert.equal(repoInfo.name, "test-app");
        assert.equal(repoInfo.version, "1.0.0");
        assert.equal(repoInfo.description, "Test application for CLI generation");
        assert.equal(repoInfo.projectType, "node-server");
        assert.ok(repoInfo.scripts);
        assert.equal(repoInfo.scripts.start, "node server.js");
    });
    test("should extract commands from repository", async () => {
        const repoInfo = await cliAnything.analyzeRepository(testRepoPath);
        const commands = await cliAnything.extractCommands(testRepoPath, repoInfo);
        assert.ok(commands.length > 0);
        const startCommand = commands.find((cmd) => cmd.name === "start");
        assert.ok(startCommand);
        assert.equal(startCommand.type, "script");
        assert.equal(startCommand.command, "node server.js");
        const devCommand = commands.find((cmd) => cmd.name === "dev");
        assert.ok(devCommand);
        assert.equal(devCommand.category, "lifecycle");
    });
    test("should generate CLI wrapper", async () => {
        const repoInfo = await cliAnything.analyzeRepository(testRepoPath);
        const commands = await cliAnything.extractCommands(testRepoPath, repoInfo);
        const wrapper = await cliAnything.generateCLIWrapper(repoInfo, commands);
        assert.ok(wrapper.includes("testapp"));
        assert.ok(wrapper.includes("CLI wrapper"));
        assert.ok(wrapper.includes("class testappCLI"));
        assert.ok(wrapper.includes("start:"));
        assert.ok(wrapper.includes("dev:"));
    });
    test("should generate complete CLI", async () => {
        const result = await cliAnything.generateCLI(testRepoPath);
        assert.ok(result.outputPath);
        assert.ok(result.repoInfo);
        assert.ok(result.commands);
        assert.ok(result.commands.length > 0);
        await access(result.outputPath);
        const content = await readFile(result.outputPath, "utf8");
        assert.ok(content.includes("test-app"));
        assert.ok(content.includes("CLI wrapper"));
    });
    test("should categorize scripts correctly", () => {
        const testCases = [
            { name: "start", expected: "lifecycle" },
            { name: "dev", expected: "lifecycle" },
            { name: "build", expected: "build" },
            { name: "test", expected: "testing" },
            { name: "lint", expected: "quality" },
            { name: "deploy", expected: "deployment" },
            { name: "custom", expected: "general" },
        ];
        for (const { name, expected } of testCases) {
            assert.equal(cliAnything.categorizeScript(name), expected);
        }
    });
    test("should detect project types", () => {
        const testCases = [
            { packageJson: { dependencies: { express: "4.0.0" } }, expected: "node-server" },
            { packageJson: { dependencies: { react: "18.0.0" } }, expected: "react-app" },
            { packageJson: { dependencies: { next: "13.0.0" } }, expected: "next-app" },
            { packageJson: {}, expected: "generic" },
        ];
        for (const { packageJson, expected } of testCases) {
            assert.equal(cliAnything.detectProjectType(".", packageJson), expected);
        }
    });
});
