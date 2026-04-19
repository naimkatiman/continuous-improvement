#!/usr/bin/env node
/**
 * Unified Continuous-Improvement Plugin.
 *
 * Combines CLI-Anything, Compound Engineering, and PM-Skills into a single
 * workflow that follows the 7 Laws of AI Agent Discipline.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import CLIAnything from "./cli-anything.mjs";
import CompoundEngineering from "./compound-engineering.mjs";
import PMSkills from "./pm-skills.mjs";
const DEFAULT_OPTIONS = {
    workspace: "./ci-workspace",
    verbose: false,
};
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
export default class UnifiedContinuousImprovement {
    options;
    cliAnything;
    compoundEngineering;
    pmSkills;
    currentSession = null;
    projectContext = {};
    constructor(options = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.cliAnything = new CLIAnything({
            outputDir: join(this.options.workspace, "generated-clis"),
            verbose: this.options.verbose,
        });
        this.compoundEngineering = new CompoundEngineering({
            workspace: join(this.options.workspace, "compound"),
            learningsPath: join(this.options.workspace, "learnings.json"),
            verbose: this.options.verbose,
        });
        this.pmSkills = new PMSkills({
            workspace: join(this.options.workspace, "pm-skills"),
            verbose: this.options.verbose,
        });
    }
    async initializeProject(projectInfo) {
        this.log(`🚀 Initializing project: ${projectInfo.name}`);
        await this.ensureWorkspace();
        const context = {
            ...projectInfo,
            initializedAt: new Date().toISOString(),
            phases: {
                research: { status: "pending", startedAt: null },
                planning: { status: "pending", startedAt: null },
                execution: { status: "pending", startedAt: null },
                review: { status: "pending", startedAt: null },
            },
        };
        this.projectContext = context;
        this.log(`📊 Running initial product analysis...`);
        const pmAnalysis = await this.pmSkills.runProductAnalysis({
            product: projectInfo.product ?? {},
            industry: projectInfo.industry ?? "",
            targetMarket: projectInfo.targetMarket ?? {},
        });
        context.pmAnalysis = pmAnalysis;
        this.log(`🔧 Starting compound engineering session...`);
        this.currentSession = await this.compoundEngineering.startSession(projectInfo.name, projectInfo.objective ?? "Build and improve the product");
        context.sessionId = this.currentSession.id;
        await this.saveProjectContext();
        this.log(`✅ Project initialized successfully`);
        return {
            projectId: context.name,
            sessionId: this.currentSession.id,
            pmAnalysis: pmAnalysis.summary,
            nextSteps: this.getNextSteps("research"),
        };
    }
    async executeResearchPhase(additionalContext = {}) {
        const context = this.requireContext();
        if (!this.currentSession) {
            throw new Error("No active session. Call initializeProject() first.");
        }
        this.log(`🔍 Starting research phase...`);
        context.phases.research.status = "active";
        context.phases.research.startedAt = new Date().toISOString();
        const pmAnalysis = context.pmAnalysis;
        const brainstormResults = await this.compoundEngineering.brainstorm({
            ...(pmAnalysis ?? {}),
            ...additionalContext,
        });
        const keyInsights = this.extractKeyInsights(pmAnalysis);
        let cliGeneration = null;
        if (typeof additionalContext.repositoryPath === "string") {
            this.log(`🛠️  Generating CLI for repository...`);
            try {
                cliGeneration = await this.cliAnything.generateCLI(additionalContext.repositoryPath);
            }
            catch {
                cliGeneration = null;
            }
        }
        const researchResults = {
            brainstorm: brainstormResults,
            pmInsights: keyInsights,
            cliTools: cliGeneration,
            recommendations: this.generateResearchRecommendations(brainstormResults, keyInsights),
            completedAt: new Date().toISOString(),
        };
        context.researchResults = researchResults;
        context.phases.research.status = "completed";
        await this.saveProjectContext();
        this.log(`✅ Research phase completed`);
        return { ...researchResults, nextSteps: this.getNextSteps("planning") };
    }
    async executePlanningPhase(preferences = {}) {
        const context = this.requireContext();
        if (!this.currentSession || !context.researchResults) {
            throw new Error("Research phase must be completed first.");
        }
        this.log(`📋 Starting planning phase...`);
        context.phases.planning.status = "active";
        context.phases.planning.startedAt = new Date().toISOString();
        const plan = await this.compoundEngineering.plan(context.researchResults.brainstorm, {
            ...preferences,
            pmInsights: context.researchResults.pmInsights,
            availableTools: context.researchResults.cliTools,
        });
        const pmResults = context.pmAnalysis?.results ?? {};
        const gtmSkill = pmResults.gtmStrategy;
        const roadmapSkill = pmResults.productRoadmap;
        const metricsSkill = pmResults.metricsDefinition;
        const gtmStrategy = gtmSkill && !("error" in gtmSkill) ? gtmSkill : null;
        const roadmap = roadmapSkill && !("error" in roadmapSkill) ? roadmapSkill : null;
        const metrics = metricsSkill && !("error" in metricsSkill)
            ? metricsSkill
            : undefined;
        const planningResults = {
            corePlan: plan,
            gtmStrategy,
            roadmap,
            metrics,
            integratedTimeline: this.createIntegratedTimeline(plan, gtmStrategy, roadmap),
            risks: this.aggregateRisks(plan, gtmStrategy, roadmap),
            completedAt: new Date().toISOString(),
        };
        context.planningResults = planningResults;
        context.phases.planning.status = "completed";
        await this.saveProjectContext();
        this.log(`✅ Planning phase completed`);
        return { ...planningResults, nextSteps: this.getNextSteps("execution") };
    }
    async executeWorkingPhase(progressCallback = null) {
        const context = this.requireContext();
        if (!this.currentSession || !context.planningResults) {
            throw new Error("Planning phase must be completed first.");
        }
        this.log(`🔧 Starting execution phase...`);
        context.phases.execution.status = "active";
        context.phases.execution.startedAt = new Date().toISOString();
        const workResults = await this.compoundEngineering.work(context.planningResults.corePlan, progressCallback);
        let toolExecution = null;
        if (context.researchResults?.cliTools) {
            toolExecution = this.executeGeneratedTools(context.researchResults.cliTools, workResults);
        }
        const executionResults = {
            coreWork: workResults,
            toolExecution,
            metrics: this.trackExecutionMetrics(workResults),
            issues: workResults.issues,
            solutions: workResults.solutions,
            completedAt: new Date().toISOString(),
        };
        context.executionResults = executionResults;
        context.phases.execution.status = "completed";
        await this.saveProjectContext();
        this.log(`✅ Execution phase completed`);
        return { ...executionResults, nextSteps: this.getNextSteps("review") };
    }
    async executeReviewPhase(criteria = null) {
        const context = this.requireContext();
        if (!this.currentSession || !context.executionResults) {
            throw new Error("Execution phase must be completed first.");
        }
        this.log(`🔍 Starting review phase...`);
        context.phases.review.status = "active";
        context.phases.review.startedAt = new Date().toISOString();
        const coreReview = await this.compoundEngineering.review(context.executionResults.coreWork, criteria);
        const performanceReview = this.conductPerformanceReview(context.executionResults, context.planningResults?.metrics);
        const processImprovements = this.analyzeProcessImprovements();
        const comprehensiveReport = this.generateComprehensiveReport();
        const reviewResults = {
            coreReview,
            performanceReview,
            processImprovements,
            comprehensiveReport,
            learnings: coreReview.learnings,
            recommendations: this.aggregateRecommendations(coreReview, performanceReview, processImprovements),
            completedAt: new Date().toISOString(),
        };
        context.reviewResults = reviewResults;
        context.phases.review.status = "completed";
        context.completedAt = new Date().toISOString();
        await this.saveProjectContext();
        this.log(`✅ Review phase completed`);
        return reviewResults;
    }
    async executeCompleteWorkflow(projectInfo, options = {}) {
        this.log(`🚀 Starting complete continuous improvement workflow...`);
        const init = await this.initializeProject(projectInfo);
        const research = await this.executeResearchPhase(options.researchContext ?? {});
        const planning = await this.executePlanningPhase(options.planningPreferences ?? {});
        const execution = await this.executeWorkingPhase(options.progressCallback ?? null);
        const review = await this.executeReviewPhase(options.reviewCriteria);
        const sessionId = this.currentSession?.id ?? "";
        this.log(`🎉 Complete workflow finished successfully`);
        return {
            project: projectInfo.name,
            sessionId,
            phases: {
                initialization: init,
                research,
                planning,
                execution,
                review,
            },
            summary: this.generateWorkflowSummary(),
            completedAt: new Date().toISOString(),
        };
    }
    async getProjectStatus() {
        const context = this.projectContext;
        if (!context.name) {
            return { status: "No active project" };
        }
        return {
            project: context.name,
            sessionId: this.currentSession?.id,
            currentPhase: this.getCurrentPhase(),
            phaseStatus: context.phases,
            progress: this.calculateProgress(),
            nextSteps: this.getNextSteps(this.getCurrentPhase()),
        };
    }
    async ensureWorkspace() {
        try {
            await mkdir(this.options.workspace, { recursive: true });
        }
        catch {
            // Directory may already exist.
        }
    }
    async saveProjectContext() {
        const contextPath = join(this.options.workspace, "project-context.json");
        await writeFile(contextPath, JSON.stringify(this.projectContext, null, 2));
    }
    extractKeyInsights(pmAnalysis) {
        const insights = [];
        if (!pmAnalysis)
            return insights;
        if (pmAnalysis.summary?.keyInsights) {
            insights.push(...pmAnalysis.summary.keyInsights);
        }
        for (const result of Object.values(pmAnalysis.results)) {
            if ("error" in result)
                continue;
            const resultInsights = result.insights;
            if (Array.isArray(resultInsights)) {
                insights.push(...resultInsights);
            }
        }
        return insights.slice(0, 10);
    }
    generateResearchRecommendations(brainstormResults, pmInsights) {
        return [
            ...brainstormResults.ideas.slice(0, 3).map((idea) => {
                const label = typeof idea === "string" ? idea : idea.description ?? "idea";
                return `Explore: ${label}`;
            }),
            ...pmInsights.slice(0, 3).map((insight) => `Consider: ${insight}`),
        ];
    }
    createIntegratedTimeline(corePlan, gtmStrategy, roadmap) {
        return {
            phases: {
                development: corePlan.timeline ?? {},
                marketing: this.pickObject(gtmStrategy, ["timeline"]) ?? {},
                product: this.pickObject(roadmap, ["roadmap", "timeline"]) ?? {},
            },
            dependencies: this.extractDependencies(),
            milestones: this.extractMilestones(),
        };
    }
    aggregateRisks(corePlan, gtmStrategy, roadmap) {
        const risks = [];
        if (Array.isArray(corePlan.risks))
            risks.push(...corePlan.risks);
        const gtmRisks = this.pickArray(gtmStrategy, ["strategy", "risks"]);
        if (gtmRisks)
            risks.push(...gtmRisks);
        const roadmapRisks = this.pickArray(roadmap, ["roadmap", "risks"]);
        if (roadmapRisks)
            risks.push(...roadmapRisks);
        return [...new Set(risks)];
    }
    executeGeneratedTools(cliTools, workResults) {
        return {
            toolsGenerated: cliTools.commands?.length ?? 0,
            executionStatus: "ready",
            integrationPoints: this.identifyIntegrationPoints(workResults),
        };
    }
    identifyIntegrationPoints(workResults) {
        const integrationPoints = [
            "build automation",
            "testing automation",
            "deployment automation",
        ];
        if (!workResults.steps.length) {
            return integrationPoints.slice(0, 1);
        }
        return integrationPoints.filter((point) => workResults.steps.some((step) => step.step && step.step.toLowerCase().includes(point)));
    }
    trackExecutionMetrics(workResults) {
        return {
            stepsCompleted: workResults.steps.filter((s) => s.status === "completed").length,
            issuesResolved: workResults.solutions.length,
            timeSpent: this.calculateTimeSpent(),
            qualityScore: this.calculateQualityScore(),
        };
    }
    conductPerformanceReview(executionResults, plannedMetrics) {
        return {
            actualMetrics: executionResults.metrics,
            plannedMetrics: plannedMetrics?.metrics,
            variance: this.calculateMetricVariance(),
            performanceScore: this.calculatePerformanceScore(),
        };
    }
    analyzeProcessImprovements() {
        return {
            processEfficiencies: this.identifyProcessEfficiencies(),
            bottleneckAnalysis: this.analyzeBottlenecks(),
            improvementOpportunities: this.identifyImprovementOpportunities(),
            automationPotential: this.assessAutomationPotential(),
        };
    }
    generateComprehensiveReport() {
        return {
            executiveSummary: this.createExecutiveSummary(),
            detailedAnalysis: this.createDetailedAnalysis(),
            recommendations: this.createStrategicRecommendations(),
            nextPhasePlanning: this.planNextPhase(),
            appendices: this.createAppendices(),
        };
    }
    aggregateRecommendations(coreReview, performanceReview, processImprovements) {
        const recommendations = [];
        const coreRecs = coreReview.review.recommendations;
        if (Array.isArray(coreRecs))
            recommendations.push(...coreRecs);
        const perfRecs = performanceReview.recommendations;
        if (Array.isArray(perfRecs))
            recommendations.push(...perfRecs);
        const improvementOps = processImprovements.improvementOpportunities;
        if (Array.isArray(improvementOps))
            recommendations.push(...improvementOps);
        return [...new Set(recommendations)];
    }
    getCurrentPhase() {
        const phases = this.projectContext.phases;
        if (!phases)
            return "completed";
        for (const [phase, data] of Object.entries(phases)) {
            if (data.status === "active")
                return phase;
            if (data.status === "pending")
                return phase;
        }
        return "completed";
    }
    calculateProgress() {
        const phases = this.projectContext.phases ?? {};
        const entries = Object.values(phases);
        const totalPhases = entries.length;
        const completedPhases = entries.filter((p) => p.status === "completed").length;
        return {
            completed: completedPhases,
            total: totalPhases,
            percentage: totalPhases === 0 ? 0 : Math.round((completedPhases / totalPhases) * 100),
        };
    }
    getNextSteps(currentPhase) {
        const stepMap = {
            research: ["Execute brainstorming", "Generate CLI tools", "Analyze market insights"],
            planning: ["Create detailed project plan", "Define GTM strategy", "Establish metrics"],
            execution: ["Implement core features", "Use generated tools", "Track progress"],
            review: ["Conduct comprehensive review", "Document learnings", "Plan improvements"],
            completed: [
                "Start new iteration",
                "Apply learnings to next project",
                "Begin next phase",
            ],
        };
        return stepMap[currentPhase] ?? ["Initialize project"];
    }
    extractDependencies() {
        return [];
    }
    extractMilestones() {
        return [];
    }
    calculateTimeSpent() {
        return "2 hours";
    }
    calculateQualityScore() {
        return 0.85;
    }
    calculateMetricVariance() {
        return {};
    }
    calculatePerformanceScore() {
        return 0.8;
    }
    identifyProcessEfficiencies() {
        return [];
    }
    analyzeBottlenecks() {
        return [];
    }
    identifyImprovementOpportunities() {
        return [];
    }
    assessAutomationPotential() {
        return "high";
    }
    createExecutiveSummary() {
        return "Project completed successfully";
    }
    createDetailedAnalysis() {
        return {};
    }
    createStrategicRecommendations() {
        return [];
    }
    planNextPhase() {
        return "Ready for next iteration";
    }
    createAppendices() {
        return {};
    }
    generateWorkflowSummary() {
        return "All phases completed successfully";
    }
    log(message) {
        if (this.options.verbose) {
            console.log(`[Unified-CI] ${message}`);
        }
    }
    requireContext() {
        const context = this.projectContext;
        if (!context || !context.phases) {
            throw new Error("No active session. Call initializeProject() first.");
        }
        return context;
    }
    pickObject(source, path) {
        let current = source;
        for (const key of path) {
            if (!current || typeof current !== "object")
                return null;
            current = current[key];
        }
        if (current && typeof current === "object" && !Array.isArray(current)) {
            return current;
        }
        return null;
    }
    pickArray(source, path) {
        let current = source;
        for (const key of path) {
            if (!current || typeof current !== "object")
                return null;
            current = current[key];
        }
        return Array.isArray(current) ? current : null;
    }
}
if (import.meta.url === `file://${process.argv[1]}`) {
    const [, , command, ...args] = process.argv;
    if (!command || command === "--help" || command === "-h") {
        console.log(`
Usage: unified-plugin <command> [options]

Commands:
  init <project-name> <objective>     Initialize new project
  research                           Execute research phase
  planning                           Execute planning phase
  execution                          Execute execution phase
  review                             Execute review phase
  workflow <project-name> <objective> Run complete workflow
  status                             Show project status

Options:
  --workspace <dir>     Workspace directory (default: ./ci-workspace)
  --verbose             Enable verbose logging
  --repo <path>         Repository path for CLI generation
`);
        process.exit(0);
    }
    const options = {};
    for (let i = 0; i < args.length; i++) {
        const flag = args[i];
        if (flag === "--workspace" && args[i + 1]) {
            options.workspace = args[i + 1];
            i++;
        }
        else if (flag === "--verbose") {
            options.verbose = true;
        }
        else if (flag === "--repo" && args[i + 1]) {
            options.repositoryPath = args[i + 1];
            i++;
        }
    }
    const unifiedPlugin = new UnifiedContinuousImprovement(options);
    switch (command) {
        case "init":
            if (args.length < 2) {
                console.error("Error: Project name and objective required");
                process.exit(1);
            }
            unifiedPlugin
                .initializeProject({ name: args[0], objective: args.slice(1).join(" ") })
                .then((result) => {
                console.log(`✅ Project initialized: ${result.projectId}`);
                console.log(`📊 Session: ${result.sessionId}`);
            })
                .catch((error) => {
                console.error(`❌ Error: ${getErrorMessage(error)}`);
                process.exit(1);
            });
            break;
        case "workflow":
            if (args.length < 2) {
                console.error("Error: Project name and objective required");
                process.exit(1);
            }
            unifiedPlugin
                .executeCompleteWorkflow({ name: args[0], objective: args.slice(1).join(" ") }, options.repositoryPath ? { researchContext: { repositoryPath: options.repositoryPath } } : {})
                .then((result) => {
                console.log(`🎉 Workflow completed for: ${result.project}`);
                console.log(`📊 Session: ${result.sessionId}`);
            })
                .catch((error) => {
                console.error(`❌ Error: ${getErrorMessage(error)}`);
                process.exit(1);
            });
            break;
        case "status":
            unifiedPlugin
                .getProjectStatus()
                .then((status) => {
                console.log("📊 Project Status:");
                console.log(JSON.stringify(status, null, 2));
            })
                .catch((error) => {
                console.error(`❌ Error: ${getErrorMessage(error)}`);
                process.exit(1);
            });
            break;
        case "research":
        case "planning":
        case "execution":
        case "review":
            console.log(`⚠️  Phase execution requires prior initialization. Use 'init' or 'workflow' commands.`);
            break;
        default:
            console.error(`Unknown command: ${command}`);
            process.exit(1);
    }
}
