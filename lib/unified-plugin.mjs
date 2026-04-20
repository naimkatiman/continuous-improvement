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
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function roundTo(value, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
function parseMinutes(value) {
    if (!value) {
        return 0;
    }
    const normalized = value.toLowerCase();
    const hourMatch = normalized.match(/(\d+)\s*hour/);
    if (hourMatch) {
        return Number.parseInt(hourMatch[1] ?? "0", 10) * 60;
    }
    const minuteMatch = normalized.match(/(\d+)\s*minute/);
    if (minuteMatch) {
        return Number.parseInt(minuteMatch[1] ?? "0", 10);
    }
    return 0;
}
function formatMinutes(totalMinutes) {
    const minutes = Math.max(0, Math.round(totalMinutes));
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours === 0) {
        return `${minutes} minutes`;
    }
    if (remainingMinutes === 0) {
        return hours === 1 ? "1 hour" : `${hours} hours`;
    }
    return `${hours}h ${remainingMinutes}m`;
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
            dependencies: this.extractDependencies(corePlan, gtmStrategy, roadmap),
            milestones: this.extractMilestones(corePlan, gtmStrategy, roadmap),
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
        const integrationPoints = this.identifyIntegrationPoints(cliTools, workResults);
        return {
            toolsGenerated: cliTools.commands?.length ?? 0,
            executionStatus: (cliTools.commands?.length ?? 0) === 0
                ? "no-tools-generated"
                : integrationPoints.length > 0
                    ? "integration-ready"
                    : "generated",
            integrationPoints,
        };
    }
    identifyIntegrationPoints(cliTools, workResults) {
        const integrationPoints = new Set();
        for (const command of cliTools.commands ?? []) {
            switch (command.category) {
                case "build":
                    integrationPoints.add("build automation");
                    break;
                case "testing":
                case "quality":
                    integrationPoints.add("testing automation");
                    break;
                case "deployment":
                    integrationPoints.add("deployment automation");
                    break;
                case "development":
                case "lifecycle":
                case "core":
                    integrationPoints.add("developer workflow");
                    break;
                case "setup":
                    integrationPoints.add("environment setup");
                    break;
                default:
                    break;
            }
        }
        for (const step of workResults.steps) {
            const description = step.step.toLowerCase();
            if (description.includes("verify") || description.includes("test")) {
                integrationPoints.add("testing automation");
            }
            if (description.includes("build")) {
                integrationPoints.add("build automation");
            }
            if (description.includes("deploy")) {
                integrationPoints.add("deployment automation");
            }
            if (description.includes("document")) {
                integrationPoints.add("documentation workflow");
            }
        }
        if (integrationPoints.size === 0 && workResults.steps.length > 0) {
            integrationPoints.add("developer workflow");
        }
        return Array.from(integrationPoints);
    }
    trackExecutionMetrics(workResults) {
        return {
            stepsCompleted: workResults.steps.filter((s) => s.status === "completed").length,
            issuesResolved: workResults.solutions.length,
            timeSpent: this.calculateTimeSpent(workResults),
            qualityScore: this.calculateQualityScore(workResults),
        };
    }
    conductPerformanceReview(executionResults, plannedMetrics) {
        const variance = this.calculateMetricVariance(executionResults.metrics, plannedMetrics?.metrics);
        const performanceScore = this.calculatePerformanceScore(executionResults.metrics, variance);
        return {
            actualMetrics: executionResults.metrics,
            plannedMetrics: plannedMetrics?.metrics,
            variance,
            performanceScore,
            recommendations: this.buildPerformanceRecommendations(executionResults.metrics, variance),
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
    extractDependencies(corePlan, gtmStrategy, roadmap) {
        const dependencies = new Set();
        for (let i = 1; i < corePlan.steps.length; i++) {
            const current = corePlan.steps[i]?.description;
            const previous = corePlan.steps[i - 1]?.description;
            if (current && previous) {
                dependencies.add(`${current} depends on ${previous}`);
            }
        }
        const roadmapDependencies = this.pickArray(roadmap, ["roadmap", "dependencies"]);
        if (roadmapDependencies) {
            for (const dependency of roadmapDependencies) {
                if (typeof dependency === "string") {
                    dependencies.add(dependency);
                }
            }
        }
        const launchPhases = this.pickArray(gtmStrategy, ["strategy", "launch", "phases"]);
        if (launchPhases) {
            for (let i = 1; i < launchPhases.length; i++) {
                const previous = this.pickString(launchPhases[i - 1], ["phase"]);
                const current = this.pickString(launchPhases[i], ["phase"]);
                if (previous && current) {
                    dependencies.add(`Launch phase "${current}" follows "${previous}"`);
                }
            }
        }
        return Array.from(dependencies);
    }
    extractMilestones(corePlan, gtmStrategy, roadmap) {
        const milestones = new Map();
        corePlan.steps.forEach((step, index) => {
            milestones.set(step.description, {
                name: step.description,
                source: "core-plan",
                order: index + 1,
                eta: step.estimatedTime ?? null,
            });
        });
        const roadmapInitiatives = this.pickArray(roadmap, ["roadmap", "initiatives"]);
        if (roadmapInitiatives) {
            for (const initiative of roadmapInitiatives) {
                const name = this.pickString(initiative, ["name"]);
                if (!name)
                    continue;
                milestones.set(name, {
                    name,
                    source: "roadmap",
                    timeline: this.pickString(initiative, ["timeline"]),
                    priority: this.pickString(initiative, ["priority"]),
                });
            }
        }
        const launchPhases = this.pickArray(gtmStrategy, ["strategy", "launch", "phases"]);
        if (launchPhases) {
            for (const phase of launchPhases) {
                const name = this.pickString(phase, ["phase"]);
                if (!name)
                    continue;
                milestones.set(name, {
                    name,
                    source: "gtm-launch",
                    duration: this.pickString(phase, ["duration"]),
                });
            }
        }
        return Array.from(milestones.values());
    }
    calculateTimeSpent(workResults) {
        let totalMinutes = 0;
        for (const step of workResults.steps) {
            const actualMinutes = this.durationBetween(step.startTime, step.endTime);
            totalMinutes += actualMinutes > 0 ? actualMinutes : this.estimateStepMinutes(step.step);
        }
        if (totalMinutes === 0 && workResults.steps.length > 0) {
            totalMinutes = workResults.steps.length * 15;
        }
        return formatMinutes(totalMinutes);
    }
    calculateQualityScore(workResults) {
        const totalSteps = Math.max(workResults.steps.length, 1);
        const completedSteps = workResults.steps.filter((step) => step.status === "completed").length;
        const failedSteps = workResults.steps.filter((step) => step.status === "failed").length;
        const unresolvedIssues = Math.max(0, workResults.issues.length - workResults.solutions.length);
        const completionRatio = completedSteps / totalSteps;
        const resolutionRatio = Math.min(workResults.solutions.length, workResults.issues.length || 1) /
            totalSteps;
        const score = 0.45 +
            completionRatio * 0.35 +
            resolutionRatio * 0.15 -
            (failedSteps / totalSteps) * 0.2 -
            (unresolvedIssues / totalSteps) * 0.1;
        return roundTo(clamp(score, 0, 1));
    }
    calculateMetricVariance(actualMetrics, plannedMetrics) {
        const actualMetricKeys = Object.keys(actualMetrics);
        const plannedMetricGroups = plannedMetrics && typeof plannedMetrics === "object" && !Array.isArray(plannedMetrics)
            ? Object.keys(plannedMetrics)
            : [];
        const coverageRatio = plannedMetricGroups.length === 0
            ? 1
            : roundTo(clamp(actualMetricKeys.length / plannedMetricGroups.length, 0, 1));
        return {
            actualMetricKeys,
            plannedMetricGroups,
            coverageRatio,
            missingMetricGroups: plannedMetricGroups.slice(actualMetricKeys.length),
        };
    }
    calculatePerformanceScore(actualMetrics, variance) {
        const coverageRatio = typeof variance.coverageRatio === "number" ? variance.coverageRatio : 0.5;
        const deliveryBonus = actualMetrics.stepsCompleted > 0 ? 0.1 : 0;
        return roundTo(clamp(actualMetrics.qualityScore * 0.6 + coverageRatio * 0.3 + deliveryBonus, 0, 1));
    }
    identifyProcessEfficiencies() {
        const context = this.projectContext;
        const efficiencies = [];
        if (context.researchResults?.pmInsights.length) {
            efficiencies.push(`Research captured ${context.researchResults.pmInsights.length} PM insight(s) before planning`);
        }
        if (context.planningResults?.corePlan.steps.length) {
            efficiencies.push(`Planning broke the work into ${context.planningResults.corePlan.steps.length} executable step(s)`);
        }
        if (context.executionResults?.solutions.length) {
            efficiencies.push(`Execution resolved ${context.executionResults.solutions.length} issue(s) during delivery`);
        }
        if (context.reviewResults?.learnings.length) {
            efficiencies.push(`Review captured ${context.reviewResults.learnings.length} reusable learning(s)`);
        }
        return efficiencies;
    }
    analyzeBottlenecks() {
        const context = this.projectContext;
        const bottlenecks = [];
        if (context.executionResults &&
            context.executionResults.issues.length > context.executionResults.solutions.length) {
            bottlenecks.push("Execution surfaced more issues than documented solutions");
        }
        if (!context.researchResults?.cliTools && context.executionResults?.coreWork.steps.length) {
            bottlenecks.push("No generated CLI integration was available during execution");
        }
        if (context.reviewResults &&
            context.reviewResults.recommendations.length === 0) {
            bottlenecks.push("Review phase closed without concrete follow-up recommendations");
        }
        return bottlenecks.length > 0
            ? bottlenecks
            : ["No material workflow bottlenecks detected from the recorded state"];
    }
    identifyImprovementOpportunities() {
        const context = this.projectContext;
        const opportunities = new Set();
        for (const risk of context.planningResults?.risks ?? []) {
            opportunities.add(`Mitigate planning risk: ${risk}`);
        }
        for (const improvement of context.reviewResults?.coreReview.review.improvements ?? []) {
            opportunities.add(improvement);
        }
        for (const recommendation of context.reviewResults?.recommendations ?? []) {
            opportunities.add(recommendation);
        }
        if (!context.researchResults?.cliTools) {
            opportunities.add("Generate repo-aware CLI tooling for repetitive workflow steps");
        }
        return Array.from(opportunities).slice(0, 6);
    }
    assessAutomationPotential() {
        const context = this.projectContext;
        const toolCount = context.researchResults?.cliTools?.commands.length ?? 0;
        const integrationCount = context.executionResults?.toolExecution?.integrationPoints.length ?? 0;
        if (toolCount >= 5 || integrationCount >= 3) {
            return "high";
        }
        if (toolCount > 0 || integrationCount > 0 || (context.executionResults?.coreWork.steps.length ?? 0) >= 4) {
            return "medium";
        }
        return "low";
    }
    createExecutiveSummary() {
        const context = this.projectContext;
        if (!context.name) {
            return "No active project context is available.";
        }
        const progress = this.calculateProgress();
        const issues = context.executionResults?.issues.length ?? 0;
        const learnings = context.reviewResults?.learnings.length ?? 0;
        return `${context.name} reached ${progress.completed}/${progress.total} workflow phases (${progress.percentage}%) with ${issues} tracked issue(s) and ${learnings} captured learning(s).`;
    }
    createDetailedAnalysis() {
        const context = this.projectContext;
        return {
            project: context.name ?? null,
            objective: context.objective ?? null,
            currentPhase: this.getCurrentPhase(),
            progress: this.calculateProgress(),
            phaseStatus: context.phases ?? {},
            research: {
                pmInsights: context.researchResults?.pmInsights.length ?? 0,
                recommendations: context.researchResults?.recommendations.length ?? 0,
                generatedCliCommands: context.researchResults?.cliTools?.commands.length ?? 0,
            },
            planning: {
                steps: context.planningResults?.corePlan.steps.length ?? 0,
                risks: context.planningResults?.risks.length ?? 0,
                milestones: context.planningResults?.integratedTimeline.milestones.length ?? 0,
            },
            execution: {
                metrics: context.executionResults?.metrics ?? null,
                issues: context.executionResults?.issues.length ?? 0,
                solutions: context.executionResults?.solutions.length ?? 0,
            },
            review: {
                overallScore: context.reviewResults?.coreReview.review.overallScore ?? null,
                recommendations: context.reviewResults?.recommendations.length ?? 0,
            },
        };
    }
    createStrategicRecommendations() {
        const context = this.projectContext;
        const recommendations = new Set();
        for (const nextStep of this.getNextSteps(this.getCurrentPhase())) {
            recommendations.add(nextStep);
        }
        for (const recommendation of context.reviewResults?.recommendations ?? []) {
            recommendations.add(recommendation);
        }
        for (const risk of context.planningResults?.risks.slice(0, 3) ?? []) {
            recommendations.add(`Reduce delivery risk: ${risk}`);
        }
        return Array.from(recommendations).slice(0, 6);
    }
    planNextPhase() {
        const currentPhase = this.getCurrentPhase();
        const strategicRecommendations = this.createStrategicRecommendations();
        if (currentPhase === "completed") {
            return strategicRecommendations[0] ?? "Start the next iteration from review learnings.";
        }
        const nextStep = this.getNextSteps(currentPhase)[0];
        return nextStep
            ? `Continue by prioritizing: ${nextStep}`
            : "Continue with the next queued workflow phase.";
    }
    createAppendices() {
        const context = this.projectContext;
        return {
            sessionId: context.sessionId ?? null,
            cliOutputPath: context.researchResults?.cliTools?.outputPath ?? null,
            topRisks: context.planningResults?.risks.slice(0, 5) ?? [],
            learnings: context.reviewResults?.learnings.slice(0, 5).map((learning) => ({
                summary: learning.summary,
                confidence: learning.confidence,
                category: learning.category,
            })) ?? [],
        };
    }
    generateWorkflowSummary() {
        const context = this.projectContext;
        if (!context.name) {
            return "No workflow has been started.";
        }
        const progress = this.calculateProgress();
        const issues = context.executionResults?.issues.length ?? 0;
        const recommendations = context.reviewResults?.recommendations.length ?? 0;
        const learnings = context.reviewResults?.learnings.length ?? 0;
        return `${context.name}: ${progress.completed}/${progress.total} phases completed, ${issues} issue(s) tracked, ${recommendations} recommendation(s) generated, ${learnings} learning(s) captured.`;
    }
    buildPerformanceRecommendations(actualMetrics, variance) {
        const recommendations = [];
        const coverageRatio = typeof variance.coverageRatio === "number" ? variance.coverageRatio : 1;
        const missingGroups = Array.isArray(variance.missingMetricGroups)
            ? variance.missingMetricGroups
            : [];
        if (actualMetrics.qualityScore < 0.75) {
            recommendations.push("Improve verification depth to raise execution quality");
        }
        if (coverageRatio < 0.75) {
            recommendations.push("Align execution metrics more closely with planned measurement areas");
        }
        if (missingGroups.length > 0) {
            recommendations.push(`Fill metric gaps for: ${missingGroups.slice(0, 2).join(", ")}`);
        }
        return recommendations;
    }
    durationBetween(startTime, endTime) {
        if (!endTime) {
            return 0;
        }
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
            return 0;
        }
        return Math.max(1, Math.round((end - start) / 60000));
    }
    estimateStepMinutes(step) {
        const normalized = step.toLowerCase();
        if (normalized.includes("implement") || normalized.includes("build"))
            return 45;
        if (normalized.includes("verify") ||
            normalized.includes("test") ||
            normalized.includes("validate")) {
            return 20;
        }
        if (normalized.includes("document") || normalized.includes("review"))
            return 15;
        return 30;
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
    pickString(source, path) {
        let current = source;
        for (const key of path) {
            if (!current || typeof current !== "object")
                return null;
            current = current[key];
        }
        return typeof current === "string" ? current : null;
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
