import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import UnifiedContinuousImprovement from "../lib/unified-plugin.mjs";
describe("Unified Continuous Improvement Plugin", () => {
    let unifiedPlugin;
    let testDir = "";
    before(() => {
        testDir = join(process.cwd(), "test-unified");
        unifiedPlugin = new UnifiedContinuousImprovement({
            workspace: join(testDir, "workspace"),
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
    const ctx = () => unifiedPlugin.projectContext;
    test("should initialize plugin with correct configuration", () => {
        assert.ok(unifiedPlugin);
        assert.ok(unifiedPlugin.cliAnything);
        assert.ok(unifiedPlugin.compoundEngineering);
        assert.ok(unifiedPlugin.pmSkills);
        assert.equal(unifiedPlugin.options.workspace, join(testDir, "workspace"));
    });
    test("should initialize new project successfully", async () => {
        const result = await unifiedPlugin.initializeProject({
            name: "TestProject",
            objective: "Build a test application",
            industry: "Technology",
            targetMarket: { segment: "SMB" },
        });
        assert.ok(result.projectId);
        assert.equal(result.projectId, "TestProject");
        assert.ok(result.sessionId);
        assert.ok(result.pmAnalysis);
        assert.ok(Array.isArray(result.nextSteps));
        assert.equal(ctx().name, "TestProject");
        assert.ok(unifiedPlugin.currentSession);
        assert.equal(unifiedPlugin.currentSession?.objective, "Build a test application");
    });
    test("should execute research phase", async () => {
        await unifiedPlugin.initializeProject({
            name: "ResearchTest",
            objective: "Test research phase",
        });
        const result = await unifiedPlugin.executeResearchPhase({
            repositoryPath: "./test-repo",
        });
        assert.ok(result.brainstorm);
        assert.ok(result.pmInsights);
        assert.ok(result.recommendations);
        assert.ok(result.completedAt);
        assert.ok(result.brainstorm.ideas);
        assert.ok(result.brainstorm.constraints);
        assert.ok(result.brainstorm.assumptions);
        assert.ok(result.brainstorm.risks);
        assert.ok(result.brainstorm.opportunities);
        assert.equal(ctx().phases.research.status, "completed");
    });
    test("should execute planning phase", async () => {
        await unifiedPlugin.initializeProject({
            name: "PlanningTest",
            objective: "Test planning phase",
        });
        await unifiedPlugin.executeResearchPhase();
        const result = await unifiedPlugin.executePlanningPhase({
            timeline: "2 weeks",
            budget: "$5000",
        });
        assert.ok(result.corePlan);
        assert.ok(result.integratedTimeline);
        assert.ok(result.risks);
        assert.ok(result.completedAt);
        assert.ok(result.corePlan.objective);
        assert.ok(result.corePlan.approach);
        assert.ok(result.corePlan.steps);
        assert.ok(result.corePlan.timeline);
        assert.ok(result.corePlan.successCriteria);
        assert.equal(ctx().phases.planning.status, "completed");
    });
    test("should execute execution phase", async () => {
        await unifiedPlugin.initializeProject({
            name: "ExecutionTest",
            objective: "Test execution phase",
        });
        await unifiedPlugin.executeResearchPhase();
        await unifiedPlugin.executePlanningPhase();
        const progressCallback = (message) => {
            assert.equal(typeof message, "string");
        };
        const result = await unifiedPlugin.executeWorkingPhase(progressCallback);
        assert.ok(result.coreWork);
        assert.ok(result.metrics);
        assert.ok(result.issues);
        assert.ok(result.solutions);
        assert.ok(result.completedAt);
        assert.ok(Array.isArray(result.coreWork.steps));
        assert.equal(ctx().phases.execution.status, "completed");
    });
    test("should execute review phase", async () => {
        await unifiedPlugin.initializeProject({
            name: "ReviewTest",
            objective: "Test review phase",
        });
        await unifiedPlugin.executeResearchPhase();
        await unifiedPlugin.executePlanningPhase();
        await unifiedPlugin.executeWorkingPhase();
        const result = await unifiedPlugin.executeReviewPhase({
            quality: "high",
            performance: "fast",
        });
        assert.ok(result.coreReview);
        assert.ok(result.performanceReview);
        assert.ok(result.processImprovements);
        assert.ok(result.comprehensiveReport);
        assert.ok(result.learnings);
        assert.ok(result.recommendations);
        assert.ok(result.completedAt);
        assert.ok(result.coreReview.review);
        assert.ok(Array.isArray(result.coreReview.learnings));
        assert.equal(ctx().phases.review.status, "completed");
        assert.ok(ctx().completedAt);
    });
    test("should execute complete workflow end-to-end", async () => {
        const result = await unifiedPlugin.executeCompleteWorkflow({
            name: "WorkflowTest",
            objective: "Test complete workflow",
            industry: "Software",
            targetMarket: { segment: "Enterprise" },
        }, {
            researchContext: { repositoryPath: "./test-repo" },
            progressCallback: (message) => {
                assert.equal(typeof message, "string");
            },
        });
        assert.equal(result.project, "WorkflowTest");
        assert.ok(result.sessionId);
        assert.ok(result.phases);
        assert.ok(result.summary);
        assert.ok(result.completedAt);
        assert.ok(result.phases.initialization);
        assert.ok(result.phases.research);
        assert.ok(result.phases.planning);
        assert.ok(result.phases.execution);
        assert.ok(result.phases.review);
        assert.equal(ctx().phases.review.status, "completed");
    });
    test("should get project status", async () => {
        const emptyPlugin = new UnifiedContinuousImprovement({
            workspace: join(testDir, "empty-workspace"),
            verbose: false,
        });
        const emptyStatus = await emptyPlugin.getProjectStatus();
        assert.equal(emptyStatus.status, "No active project");
        await unifiedPlugin.initializeProject({
            name: "StatusTest",
            objective: "Test status reporting",
        });
        const status = await unifiedPlugin.getProjectStatus();
        assert.equal(status.project, "StatusTest");
        assert.ok(status.sessionId);
        assert.ok(status.currentPhase);
        assert.ok(status.phaseStatus);
        assert.ok(status.progress);
        assert.ok(status.nextSteps);
        assert.equal(typeof status.progress.completed, "number");
        assert.equal(typeof status.progress.total, "number");
        assert.equal(typeof status.progress.percentage, "number");
    });
    test("should handle errors gracefully", async () => {
        const newPlugin = new UnifiedContinuousImprovement({
            workspace: join(testDir, "error-test"),
            verbose: false,
        });
        await assert.rejects(() => newPlugin.executeResearchPhase(), /No active session/);
        await newPlugin.initializeProject({
            name: "ErrorTest",
            objective: "Test error handling",
        });
        await assert.rejects(() => newPlugin.executePlanningPhase(), /Research phase must be completed first/);
    });
    test("should generate next steps correctly", () => {
        const nextSteps = unifiedPlugin.getNextSteps("research");
        assert.ok(Array.isArray(nextSteps));
        assert.ok(nextSteps.some((step) => step.toLowerCase().includes("brainstorm")));
        const planningSteps = unifiedPlugin.getNextSteps("planning");
        assert.ok(planningSteps.some((step) => step.toLowerCase().includes("plan")));
        const completedSteps = unifiedPlugin.getNextSteps("completed");
        assert.ok(completedSteps.some((step) => step.includes("next iteration") || step.includes("Apply learnings")));
    });
    test("should calculate progress correctly", () => {
        ctx().phases = {
            research: { status: "completed", startedAt: null },
            planning: { status: "completed", startedAt: null },
            execution: { status: "active", startedAt: null },
            review: { status: "pending", startedAt: null },
        };
        const progress = unifiedPlugin.calculateProgress();
        assert.equal(progress.completed, 2);
        assert.equal(progress.total, 4);
        assert.equal(progress.percentage, 50);
    });
    test("should identify current phase correctly", () => {
        ctx().phases = {
            research: { status: "completed", startedAt: null },
            planning: { status: "active", startedAt: null },
            execution: { status: "pending", startedAt: null },
            review: { status: "pending", startedAt: null },
        };
        assert.equal(unifiedPlugin.getCurrentPhase(), "planning");
        ctx().phases = {
            research: { status: "completed", startedAt: null },
            planning: { status: "completed", startedAt: null },
            execution: { status: "completed", startedAt: null },
            review: { status: "completed", startedAt: null },
        };
        assert.equal(unifiedPlugin.getCurrentPhase(), "completed");
        ctx().phases = {
            research: { status: "pending", startedAt: null },
            planning: { status: "pending", startedAt: null },
            execution: { status: "pending", startedAt: null },
            review: { status: "pending", startedAt: null },
        };
        assert.equal(unifiedPlugin.getCurrentPhase(), "research");
    });
    test("should extract key insights from PM analysis", () => {
        const mockPMAnalysis = {
            summary: {
                totalSkills: 2,
                completedSkills: 2,
                keyInsights: ["Insight 1", "Insight 2"],
                recommendations: [],
                risks: [],
                opportunities: [],
            },
            results: {
                skill1: { insights: ["Skill Insight 1"], timestamp: "t", savedTo: "x" },
                skill2: { insights: ["Skill Insight 2", "Skill Insight 3"], timestamp: "t", savedTo: "x" },
            },
            savedTo: "mock",
        };
        const insights = unifiedPlugin.extractKeyInsights(mockPMAnalysis);
        assert.ok(Array.isArray(insights));
        assert.ok(insights.length <= 10);
        assert.ok(insights.includes("Insight 1"));
        assert.ok(insights.includes("Skill Insight 1"));
    });
    test("should aggregate risks from multiple sources", () => {
        const corePlan = {
            objective: "o",
            approach: "a",
            steps: [],
            timeline: {},
            resources: {},
            risks: ["Risk 1", "Risk 2"],
            mitigations: [],
            decisions: [],
            successCriteria: [],
            timestamp: "t",
        };
        const gtmStrategy = { strategy: { risks: ["Risk 2", "Risk 3"] } };
        const roadmap = { roadmap: { risks: ["Risk 4"] } };
        const risks = unifiedPlugin.aggregateRisks(corePlan, gtmStrategy, roadmap);
        assert.ok(Array.isArray(risks));
        assert.equal(risks.length, 4);
        for (const r of ["Risk 1", "Risk 2", "Risk 3", "Risk 4"]) {
            assert.ok(risks.includes(r));
        }
    });
    test("should derive integrated timeline dependencies and milestones", () => {
        const corePlan = {
            objective: "o",
            approach: "a",
            steps: [
                { description: "Inspect current implementation", estimatedTime: "20 minutes" },
                { description: "Implement smallest slice", estimatedTime: "45 minutes" },
            ],
            timeline: { estimated: "85 minutes" },
            resources: {},
            risks: [],
            mitigations: [],
            decisions: [],
            successCriteria: [],
            timestamp: "t",
        };
        const gtmStrategy = {
            timeline: { totalDuration: "12 weeks" },
            strategy: {
                launch: {
                    phases: [
                        { phase: "Pre-launch", duration: "2 weeks" },
                        { phase: "Launch", duration: "1 week" },
                    ],
                },
            },
        };
        const roadmap = {
            roadmap: {
                timeline: { quarters: { "Q1 2024": ["Inspect current implementation"] } },
                initiatives: [{ name: "Mobile App Launch", timeline: "Q2 2024", priority: "High" }],
                dependencies: ["Mobile app depends on API development"],
            },
        };
        const timeline = unifiedPlugin.createIntegratedTimeline(corePlan, gtmStrategy, roadmap);
        assert.ok(Array.isArray(timeline.dependencies));
        assert.ok(Array.isArray(timeline.milestones));
        assert.ok(timeline.dependencies.some((dependency) => String(dependency).includes("depends on")));
        assert.ok(timeline.milestones.some((milestone) => JSON.stringify(milestone).includes("Mobile App Launch")));
    });
    test("should derive execution metrics from work results", () => {
        const metrics = unifiedPlugin.trackExecutionMetrics({
            steps: [
                {
                    step: "Implement feature slice",
                    status: "completed",
                    startTime: "2024-01-01T10:00:00.000Z",
                    endTime: "2024-01-01T10:40:00.000Z",
                    issues: [],
                    solutions: [],
                    artifacts: [],
                },
                {
                    step: "Run verification and regression checks",
                    status: "completed",
                    startTime: "2024-01-01T10:40:00.000Z",
                    endTime: "2024-01-01T11:00:00.000Z",
                    issues: ["Fix failing test"],
                    solutions: ["Adjusted assertion"],
                    artifacts: [],
                },
            ],
            issues: ["Fix failing test"],
            solutions: ["Adjusted assertion"],
            timestamp: "2024-01-01T11:00:00.000Z",
        });
        assert.equal(metrics.stepsCompleted, 2);
        assert.equal(metrics.issuesResolved, 1);
        assert.equal(metrics.timeSpent, "1 hour");
        assert.ok(metrics.qualityScore >= 0.7);
    });
    test("should generate workflow summary and detailed report from project context", async () => {
        await unifiedPlugin.initializeProject({
            name: "SummaryTest",
            objective: "Validate reporting",
        });
        ctx().phases = {
            research: { status: "completed", startedAt: "2024-01-01T09:00:00.000Z" },
            planning: { status: "completed", startedAt: "2024-01-01T09:30:00.000Z" },
            execution: { status: "completed", startedAt: "2024-01-01T10:00:00.000Z" },
            review: { status: "completed", startedAt: "2024-01-01T11:00:00.000Z" },
        };
        ctx().executionResults = {
            completedAt: "2024-01-01T11:00:00.000Z",
            coreWork: {
                steps: [],
                issues: ["Regression risk"],
                solutions: ["Added verification"],
                timestamp: "2024-01-01T11:00:00.000Z",
            },
            issues: ["Regression risk"],
            metrics: {
                stepsCompleted: 3,
                issuesResolved: 1,
                timeSpent: "1 hour",
                qualityScore: 0.8,
            },
            solutions: ["Added verification"],
            toolExecution: null,
        };
        ctx().reviewResults = {
            completedAt: "2024-01-01T11:30:00.000Z",
            coreReview: {
                review: {
                    sessionId: "session-1",
                    objective: "Validate reporting",
                    overallScore: 88,
                    strengths: ["Kept scope tight"],
                    weaknesses: [],
                    improvements: ["Expand automated coverage"],
                    unexpectedOutcomes: [],
                    processMetrics: {},
                    outcomeMetrics: {},
                    recommendations: ["Expand automated coverage"],
                    timestamp: "2024-01-01T11:30:00.000Z",
                },
                learnings: [],
            },
            comprehensiveReport: {},
            learnings: [],
            performanceReview: {},
            processImprovements: {},
            recommendations: ["Expand automated coverage"],
        };
        const summary = unifiedPlugin.generateWorkflowSummary();
        const report = unifiedPlugin.generateComprehensiveReport();
        assert.match(summary, /SummaryTest/);
        assert.match(summary, /recommendation/);
        assert.match(report.executiveSummary, /SummaryTest/);
        assert.equal(report.detailedAnalysis.progress.percentage, 100);
        assert.ok(Array.isArray(report.recommendations));
    });
    test("should save and load project context", async () => {
        await unifiedPlugin.initializeProject({
            name: "PersistenceTest",
            objective: "Test persistence",
        });
        const contextPath = join(unifiedPlugin.options.workspace, "project-context.json");
        const content = await readFile(contextPath, "utf8");
        const savedContext = JSON.parse(content);
        assert.equal(savedContext.name, "PersistenceTest");
        assert.equal(savedContext.objective, "Test persistence");
        assert.ok(savedContext.initializedAt);
    });
});
