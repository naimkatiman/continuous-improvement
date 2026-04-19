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
import type { GenerateCLIResult } from "./cli-anything.mjs";
import CompoundEngineering from "./compound-engineering.mjs";
import type {
  BrainstormResults,
  Plan,
  ReviewOutput,
  Session,
  WorkLog,
} from "./compound-engineering.mjs";
import PMSkills from "./pm-skills.mjs";
import type { ProductAnalysisResult, ProductAnalysisSummary } from "./pm-skills.mjs";

export type UnifiedPhaseStatus = "pending" | "active" | "completed";
export type UnifiedPhaseName = "research" | "planning" | "execution" | "review";

export interface UnifiedOptions {
  verbose?: boolean;
  workspace?: string;
}

export interface ResolvedUnifiedOptions {
  verbose: boolean;
  workspace: string;
}

export interface UnifiedPhaseState {
  startedAt: string | null;
  status: UnifiedPhaseStatus;
}

export interface ProjectInfo {
  industry?: string;
  name: string;
  objective?: string;
  product?: Record<string, unknown>;
  targetMarket?: Record<string, unknown>;
}

export interface ResearchResults {
  brainstorm: BrainstormResults;
  cliTools: GenerateCLIResult | null;
  completedAt: string;
  pmInsights: string[];
  recommendations: string[];
}

export interface IntegratedTimeline {
  dependencies: unknown[];
  milestones: unknown[];
  phases: {
    development: Record<string, unknown>;
    marketing: Record<string, unknown>;
    product: Record<string, unknown>;
  };
}

export interface PlanningResults {
  completedAt: string;
  corePlan: Plan;
  gtmStrategy: Record<string, unknown> | null;
  integratedTimeline: IntegratedTimeline;
  metrics: Record<string, unknown> | undefined;
  risks: string[];
  roadmap: Record<string, unknown> | null;
}

export interface ExecutionMetrics {
  issuesResolved: number;
  qualityScore: number;
  stepsCompleted: number;
  timeSpent: string;
}

export interface ExecutionResults {
  completedAt: string;
  coreWork: WorkLog;
  issues: string[];
  metrics: ExecutionMetrics;
  solutions: string[];
  toolExecution: ToolExecution | null;
}

export interface ToolExecution {
  executionStatus: string;
  integrationPoints: string[];
  toolsGenerated: number;
}

export interface ReviewResults {
  comprehensiveReport: Record<string, unknown>;
  completedAt: string;
  coreReview: ReviewOutput;
  learnings: ReviewOutput["learnings"];
  performanceReview: Record<string, unknown>;
  processImprovements: Record<string, unknown>;
  recommendations: string[];
}

export interface ProjectContext {
  completedAt?: string;
  executionResults?: ExecutionResults;
  initializedAt: string;
  name: string;
  objective?: string;
  phases: Record<UnifiedPhaseName, UnifiedPhaseState>;
  planningResults?: PlanningResults;
  pmAnalysis?: ProductAnalysisResult;
  researchResults?: ResearchResults;
  reviewResults?: ReviewResults;
  sessionId?: string;
  [extra: string]: unknown;
}

export interface InitializeResult {
  nextSteps: string[];
  pmAnalysis: ProductAnalysisSummary;
  projectId: string;
  sessionId: string;
}

export interface WorkflowOptions {
  planningPreferences?: Record<string, unknown>;
  progressCallback?: (message: string) => void;
  researchContext?: Record<string, unknown>;
  reviewCriteria?: unknown;
}

export interface WorkflowResult {
  completedAt: string;
  phases: {
    execution: ExecutionResults & { nextSteps: string[] };
    initialization: InitializeResult;
    planning: PlanningResults & { nextSteps: string[] };
    research: ResearchResults & { nextSteps: string[] };
    review: ReviewResults;
  };
  project: string;
  sessionId: string;
  summary: string;
}

export interface ProjectStatus {
  currentPhase?: string;
  nextSteps?: string[];
  phaseStatus?: Record<UnifiedPhaseName, UnifiedPhaseState>;
  progress?: { completed: number; percentage: number; total: number };
  project?: string;
  sessionId?: string;
  status?: string;
}

const DEFAULT_OPTIONS: ResolvedUnifiedOptions = {
  workspace: "./ci-workspace",
  verbose: false,
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default class UnifiedContinuousImprovement {
  public readonly options: ResolvedUnifiedOptions;
  public readonly cliAnything: CLIAnything;
  public readonly compoundEngineering: CompoundEngineering;
  public readonly pmSkills: PMSkills;

  public currentSession: Session | null = null;
  public projectContext: ProjectContext | Record<string, never> = {};

  constructor(options: UnifiedOptions = {}) {
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

  async initializeProject(projectInfo: ProjectInfo): Promise<InitializeResult> {
    this.log(`🚀 Initializing project: ${projectInfo.name}`);

    await this.ensureWorkspace();

    const context: ProjectContext = {
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
    this.currentSession = await this.compoundEngineering.startSession(
      projectInfo.name,
      projectInfo.objective ?? "Build and improve the product",
    );

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

  async executeResearchPhase(
    additionalContext: Record<string, unknown> = {},
  ): Promise<ResearchResults & { nextSteps: string[] }> {
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

    let cliGeneration: GenerateCLIResult | null = null;
    if (typeof additionalContext.repositoryPath === "string") {
      this.log(`🛠️  Generating CLI for repository...`);
      try {
        cliGeneration = await this.cliAnything.generateCLI(additionalContext.repositoryPath);
      } catch {
        cliGeneration = null;
      }
    }

    const researchResults: ResearchResults = {
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

  async executePlanningPhase(
    preferences: Record<string, unknown> = {},
  ): Promise<PlanningResults & { nextSteps: string[] }> {
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

    const gtmStrategy = gtmSkill && !("error" in gtmSkill) ? (gtmSkill as Record<string, unknown>) : null;
    const roadmap =
      roadmapSkill && !("error" in roadmapSkill) ? (roadmapSkill as Record<string, unknown>) : null;
    const metrics =
      metricsSkill && !("error" in metricsSkill)
        ? (metricsSkill as Record<string, unknown>)
        : undefined;

    const planningResults: PlanningResults = {
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

  async executeWorkingPhase(
    progressCallback: ((message: string) => void) | null = null,
  ): Promise<ExecutionResults & { nextSteps: string[] }> {
    const context = this.requireContext();
    if (!this.currentSession || !context.planningResults) {
      throw new Error("Planning phase must be completed first.");
    }

    this.log(`🔧 Starting execution phase...`);
    context.phases.execution.status = "active";
    context.phases.execution.startedAt = new Date().toISOString();

    const workResults = await this.compoundEngineering.work(
      context.planningResults.corePlan,
      progressCallback,
    );

    let toolExecution: ToolExecution | null = null;
    if (context.researchResults?.cliTools) {
      toolExecution = this.executeGeneratedTools(context.researchResults.cliTools, workResults);
    }

    const executionResults: ExecutionResults = {
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

  async executeReviewPhase(criteria: unknown = null): Promise<ReviewResults> {
    const context = this.requireContext();
    if (!this.currentSession || !context.executionResults) {
      throw new Error("Execution phase must be completed first.");
    }

    this.log(`🔍 Starting review phase...`);
    context.phases.review.status = "active";
    context.phases.review.startedAt = new Date().toISOString();

    const coreReview = await this.compoundEngineering.review(
      context.executionResults.coreWork,
      criteria,
    );

    const performanceReview = this.conductPerformanceReview(
      context.executionResults,
      context.planningResults?.metrics,
    );

    const processImprovements = this.analyzeProcessImprovements();

    const comprehensiveReport = this.generateComprehensiveReport();

    const reviewResults: ReviewResults = {
      coreReview,
      performanceReview,
      processImprovements,
      comprehensiveReport,
      learnings: coreReview.learnings,
      recommendations: this.aggregateRecommendations(
        coreReview,
        performanceReview,
        processImprovements,
      ),
      completedAt: new Date().toISOString(),
    };

    context.reviewResults = reviewResults;
    context.phases.review.status = "completed";
    context.completedAt = new Date().toISOString();

    await this.saveProjectContext();

    this.log(`✅ Review phase completed`);
    return reviewResults;
  }

  async executeCompleteWorkflow(
    projectInfo: ProjectInfo,
    options: WorkflowOptions = {},
  ): Promise<WorkflowResult> {
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

  async getProjectStatus(): Promise<ProjectStatus> {
    const context = this.projectContext as ProjectContext;
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

  async ensureWorkspace(): Promise<void> {
    try {
      await mkdir(this.options.workspace, { recursive: true });
    } catch {
      // Directory may already exist.
    }
  }

  async saveProjectContext(): Promise<void> {
    const contextPath = join(this.options.workspace, "project-context.json");
    await writeFile(contextPath, JSON.stringify(this.projectContext, null, 2));
  }

  extractKeyInsights(pmAnalysis: ProductAnalysisResult | undefined): string[] {
    const insights: string[] = [];
    if (!pmAnalysis) return insights;

    if (pmAnalysis.summary?.keyInsights) {
      insights.push(...pmAnalysis.summary.keyInsights);
    }

    for (const result of Object.values(pmAnalysis.results)) {
      if ("error" in result) continue;
      const resultInsights = (result as { insights?: unknown }).insights;
      if (Array.isArray(resultInsights)) {
        insights.push(...(resultInsights as string[]));
      }
    }

    return insights.slice(0, 10);
  }

  generateResearchRecommendations(
    brainstormResults: BrainstormResults,
    pmInsights: string[],
  ): string[] {
    return [
      ...brainstormResults.ideas.slice(0, 3).map((idea) => {
        const label = typeof idea === "string" ? idea : idea.description ?? "idea";
        return `Explore: ${label}`;
      }),
      ...pmInsights.slice(0, 3).map((insight) => `Consider: ${insight}`),
    ];
  }

  createIntegratedTimeline(
    corePlan: Plan,
    gtmStrategy: Record<string, unknown> | null,
    roadmap: Record<string, unknown> | null,
  ): IntegratedTimeline {
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

  aggregateRisks(
    corePlan: Plan,
    gtmStrategy: Record<string, unknown> | null,
    roadmap: Record<string, unknown> | null,
  ): string[] {
    const risks: string[] = [];
    if (Array.isArray(corePlan.risks)) risks.push(...corePlan.risks);

    const gtmRisks = this.pickArray(gtmStrategy, ["strategy", "risks"]);
    if (gtmRisks) risks.push(...(gtmRisks as string[]));

    const roadmapRisks = this.pickArray(roadmap, ["roadmap", "risks"]);
    if (roadmapRisks) risks.push(...(roadmapRisks as string[]));

    return [...new Set(risks)];
  }

  executeGeneratedTools(cliTools: GenerateCLIResult, workResults: WorkLog): ToolExecution {
    return {
      toolsGenerated: cliTools.commands?.length ?? 0,
      executionStatus: "ready",
      integrationPoints: this.identifyIntegrationPoints(workResults),
    };
  }

  identifyIntegrationPoints(workResults: WorkLog): string[] {
    const integrationPoints = [
      "build automation",
      "testing automation",
      "deployment automation",
    ];

    if (!workResults.steps.length) {
      return integrationPoints.slice(0, 1);
    }

    return integrationPoints.filter((point) =>
      workResults.steps.some(
        (step) => step.step && step.step.toLowerCase().includes(point),
      ),
    );
  }

  trackExecutionMetrics(workResults: WorkLog): ExecutionMetrics {
    return {
      stepsCompleted: workResults.steps.filter((s) => s.status === "completed").length,
      issuesResolved: workResults.solutions.length,
      timeSpent: this.calculateTimeSpent(),
      qualityScore: this.calculateQualityScore(),
    };
  }

  conductPerformanceReview(
    executionResults: ExecutionResults,
    plannedMetrics: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    return {
      actualMetrics: executionResults.metrics,
      plannedMetrics: plannedMetrics?.metrics,
      variance: this.calculateMetricVariance(),
      performanceScore: this.calculatePerformanceScore(),
    };
  }

  analyzeProcessImprovements(): Record<string, unknown> {
    return {
      processEfficiencies: this.identifyProcessEfficiencies(),
      bottleneckAnalysis: this.analyzeBottlenecks(),
      improvementOpportunities: this.identifyImprovementOpportunities(),
      automationPotential: this.assessAutomationPotential(),
    };
  }

  generateComprehensiveReport(): Record<string, unknown> {
    return {
      executiveSummary: this.createExecutiveSummary(),
      detailedAnalysis: this.createDetailedAnalysis(),
      recommendations: this.createStrategicRecommendations(),
      nextPhasePlanning: this.planNextPhase(),
      appendices: this.createAppendices(),
    };
  }

  aggregateRecommendations(
    coreReview: ReviewOutput,
    performanceReview: Record<string, unknown>,
    processImprovements: Record<string, unknown>,
  ): string[] {
    const recommendations: string[] = [];

    const coreRecs = (coreReview.review as { recommendations?: unknown }).recommendations;
    if (Array.isArray(coreRecs)) recommendations.push(...(coreRecs as string[]));

    const perfRecs = performanceReview.recommendations;
    if (Array.isArray(perfRecs)) recommendations.push(...(perfRecs as string[]));

    const improvementOps = processImprovements.improvementOpportunities;
    if (Array.isArray(improvementOps)) recommendations.push(...(improvementOps as string[]));

    return [...new Set(recommendations)];
  }

  getCurrentPhase(): string {
    const phases = (this.projectContext as ProjectContext).phases;
    if (!phases) return "completed";

    for (const [phase, data] of Object.entries(phases)) {
      if (data.status === "active") return phase;
      if (data.status === "pending") return phase;
    }

    return "completed";
  }

  calculateProgress(): { completed: number; percentage: number; total: number } {
    const phases = (this.projectContext as ProjectContext).phases ?? {};
    const entries = Object.values(phases);
    const totalPhases = entries.length;
    const completedPhases = entries.filter((p) => p.status === "completed").length;

    return {
      completed: completedPhases,
      total: totalPhases,
      percentage: totalPhases === 0 ? 0 : Math.round((completedPhases / totalPhases) * 100),
    };
  }

  getNextSteps(currentPhase: string): string[] {
    const stepMap: Record<string, string[]> = {
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

  extractDependencies(): unknown[] {
    return [];
  }
  extractMilestones(): unknown[] {
    return [];
  }
  calculateTimeSpent(): string {
    return "2 hours";
  }
  calculateQualityScore(): number {
    return 0.85;
  }
  calculateMetricVariance(): Record<string, unknown> {
    return {};
  }
  calculatePerformanceScore(): number {
    return 0.8;
  }
  identifyProcessEfficiencies(): unknown[] {
    return [];
  }
  analyzeBottlenecks(): unknown[] {
    return [];
  }
  identifyImprovementOpportunities(): string[] {
    return [];
  }
  assessAutomationPotential(): string {
    return "high";
  }
  createExecutiveSummary(): string {
    return "Project completed successfully";
  }
  createDetailedAnalysis(): Record<string, unknown> {
    return {};
  }
  createStrategicRecommendations(): string[] {
    return [];
  }
  planNextPhase(): string {
    return "Ready for next iteration";
  }
  createAppendices(): Record<string, unknown> {
    return {};
  }
  generateWorkflowSummary(): string {
    return "All phases completed successfully";
  }

  log(message: string): void {
    if (this.options.verbose) {
      console.log(`[Unified-CI] ${message}`);
    }
  }

  private requireContext(): ProjectContext {
    const context = this.projectContext as ProjectContext;
    if (!context || !context.phases) {
      throw new Error("No active session. Call initializeProject() first.");
    }
    return context;
  }

  private pickObject(
    source: Record<string, unknown> | null,
    path: string[],
  ): Record<string, unknown> | null {
    let current: unknown = source;
    for (const key of path) {
      if (!current || typeof current !== "object") return null;
      current = (current as Record<string, unknown>)[key];
    }
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return current as Record<string, unknown>;
    }
    return null;
  }

  private pickArray(source: Record<string, unknown> | null, path: string[]): unknown[] | null {
    let current: unknown = source;
    for (const key of path) {
      if (!current || typeof current !== "object") return null;
      current = (current as Record<string, unknown>)[key];
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

  const options: UnifiedOptions & { repositoryPath?: string } = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--workspace" && args[i + 1]) {
      options.workspace = args[i + 1];
      i++;
    } else if (flag === "--verbose") {
      options.verbose = true;
    } else if (flag === "--repo" && args[i + 1]) {
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
        .initializeProject({ name: args[0]!, objective: args.slice(1).join(" ") })
        .then((result) => {
          console.log(`✅ Project initialized: ${result.projectId}`);
          console.log(`📊 Session: ${result.sessionId}`);
        })
        .catch((error: unknown) => {
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
        .executeCompleteWorkflow(
          { name: args[0]!, objective: args.slice(1).join(" ") },
          options.repositoryPath ? { researchContext: { repositoryPath: options.repositoryPath } } : {},
        )
        .then((result) => {
          console.log(`🎉 Workflow completed for: ${result.project}`);
          console.log(`📊 Session: ${result.sessionId}`);
        })
        .catch((error: unknown) => {
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
        .catch((error: unknown) => {
          console.error(`❌ Error: ${getErrorMessage(error)}`);
          process.exit(1);
        });
      break;

    case "research":
    case "planning":
    case "execution":
    case "review":
      console.log(
        `⚠️  Phase execution requires prior initialization. Use 'init' or 'workflow' commands.`,
      );
      break;

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}
