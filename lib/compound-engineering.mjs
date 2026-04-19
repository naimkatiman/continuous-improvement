#!/usr/bin/env node
/**
 * Compound Engineering: iterative brainstorm → plan → work → review loop.
 *
 * Documents learnings across sessions so the same mistakes aren't repeated.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const DEFAULT_OPTIONS = {
    workspace: "./compound-workspace",
    learningsPath: "./learnings.json",
    verbose: false,
};
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
export default class CompoundEngineering {
    options;
    currentSession = null;
    learnings = new Map();
    constructor(options = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }
    async startSession(projectName, objective) {
        const sessionId = this.generateSessionId();
        const startTime = new Date().toISOString();
        this.currentSession = {
            id: sessionId,
            projectName,
            objective,
            phase: "brainstorming",
            startTime,
            phases: {
                brainstorming: { status: "active", startTime },
                planning: { status: "pending" },
                working: { status: "pending" },
                reviewing: { status: "pending" },
            },
            artifacts: {},
            learnings: [],
            decisions: [],
        };
        await this.ensureWorkspace();
        await this.saveSession();
        await this.loadLearnings();
        this.log(`🚀 Started compound engineering session: ${sessionId}`);
        this.log(`📋 Objective: ${objective}`);
        return this.currentSession;
    }
    async brainstorm(context = {}) {
        const session = this.requireSession();
        session.phase = "brainstorming";
        session.phases.brainstorming.status = "active";
        const relevantLearnings = this.getRelevantLearnings("brainstorming");
        // Prompt is generated purely for downstream callers (e.g. LLMs). We still
        // produce an empty structure so the pipeline continues deterministically.
        void this.generateBrainstormPrompt(session.objective, context, relevantLearnings);
        const brainstormResults = {
            ideas: [],
            constraints: [],
            assumptions: [],
            risks: [],
            opportunities: [],
            timestamp: new Date().toISOString(),
        };
        session.artifacts.brainstorming = brainstormResults;
        await this.saveSession();
        this.log(`💭 Brainstorming phase completed`);
        return brainstormResults;
    }
    async plan(brainstormResults = {}, preferences = {}) {
        const session = this.requireSession();
        session.phase = "planning";
        session.phases.brainstorming.status = "completed";
        session.phases.planning.status = "active";
        const normalized = {
            ideas: brainstormResults.ideas ?? [],
            constraints: brainstormResults.constraints ?? [],
            assumptions: brainstormResults.assumptions ?? [],
            risks: brainstormResults.risks ?? [],
            opportunities: brainstormResults.opportunities ?? [],
            timestamp: brainstormResults.timestamp ?? new Date().toISOString(),
        };
        const relevantLearnings = this.getRelevantLearnings("planning");
        const plan = this.createPlan(session.objective, normalized, preferences, relevantLearnings);
        session.artifacts.planning = plan;
        session.decisions.push(...plan.decisions);
        await this.saveSession();
        this.log(`📋 Planning phase completed`);
        return plan;
    }
    async work(plan, progressCallback = null) {
        const session = this.requireSession();
        session.phase = "working";
        session.phases.planning.status = "completed";
        session.phases.working.status = "active";
        const workLog = {
            steps: [],
            issues: [],
            solutions: [],
            timestamp: new Date().toISOString(),
        };
        for (const step of plan.steps) {
            const stepResult = await this.executeStep(step, progressCallback);
            workLog.steps.push(stepResult);
            if (stepResult.issues.length > 0) {
                workLog.issues.push(...stepResult.issues);
                workLog.solutions.push(...stepResult.solutions);
            }
        }
        session.artifacts.working = workLog;
        await this.saveSession();
        this.log(`🔧 Working phase completed`);
        return workLog;
    }
    async review(workResults = {}, criteria = null) {
        const session = this.requireSession();
        session.phase = "reviewing";
        session.phases.working.status = "completed";
        session.phases.reviewing.status = "active";
        const normalized = {
            steps: workResults.steps ?? [],
            issues: workResults.issues ?? [],
            solutions: workResults.solutions ?? [],
            timestamp: workResults.timestamp ?? new Date().toISOString(),
        };
        const review = this.performReview(session, normalized, criteria);
        const sessionLearnings = this.extractLearnings(session, review);
        session.learnings = sessionLearnings;
        await this.saveLearnings(sessionLearnings);
        session.artifacts.reviewing = review;
        session.phases.reviewing.status = "completed";
        session.endTime = new Date().toISOString();
        await this.saveSession();
        this.log(`🔍 Reviewing phase completed`);
        this.log(`📚 Extracted ${sessionLearnings.length} learnings`);
        return { review, learnings: sessionLearnings };
    }
    generateBrainstormPrompt(objective, context, relevantLearnings) {
        let prompt = `Brainstorm ideas for: ${objective}\n\n`;
        if (Object.keys(context).length > 0) {
            prompt += `Context:\n${JSON.stringify(context, null, 2)}\n\n`;
        }
        if (relevantLearnings.length > 0) {
            prompt += `Relevant past learnings:\n`;
            for (const learning of relevantLearnings) {
                prompt += `- ${learning.summary}\n`;
            }
            prompt += "\n";
        }
        prompt += `Please brainstorm:
1. Potential approaches and solutions
2. Constraints and limitations
3. Key assumptions
4. Potential risks
5. Opportunities and innovations

Structure your response as JSON with keys: ideas, constraints, assumptions, risks, opportunities`;
        return prompt;
    }
    createPlan(objective, brainstormResults, preferences, relevantLearnings) {
        void preferences;
        const plan = {
            objective,
            approach: this.selectApproach(brainstormResults.ideas),
            steps: [],
            timeline: this.estimateTimeline(),
            resources: this.identifyResources(),
            risks: brainstormResults.risks,
            mitigations: this.createMitigations(brainstormResults.risks),
            decisions: [],
            successCriteria: this.defineSuccessCriteria(),
            timestamp: new Date().toISOString(),
        };
        plan.steps = this.createExecutionSteps(plan.approach, brainstormResults.constraints);
        if (relevantLearnings.length > 0) {
            plan.considerations = relevantLearnings.map((l) => l.summary);
        }
        return plan;
    }
    async executeStep(step, progressCallback) {
        const stepResult = {
            step: step.description,
            status: "pending",
            startTime: new Date().toISOString(),
            issues: [],
            solutions: [],
            artifacts: [],
        };
        try {
            this.log(`⚡ Executing: ${step.description}`);
            progressCallback?.(`Starting: ${step.description}`);
            stepResult.status = "in_progress";
            const knownIssues = this.checkForKnownIssues(step);
            if (knownIssues.length > 0) {
                stepResult.issues.push(...knownIssues);
                for (const issue of knownIssues) {
                    stepResult.solutions.push(...this.getKnownSolutions(issue));
                }
            }
            stepResult.status = "completed";
            stepResult.endTime = new Date().toISOString();
            progressCallback?.(`Completed: ${step.description}`);
        }
        catch (error) {
            stepResult.status = "failed";
            stepResult.error = getErrorMessage(error);
            stepResult.endTime = new Date().toISOString();
        }
        return stepResult;
    }
    performReview(session, workResults, criteria) {
        void criteria;
        const review = {
            sessionId: session.id,
            objective: session.objective,
            overallScore: 0,
            strengths: [],
            weaknesses: [],
            improvements: [],
            unexpectedOutcomes: [],
            processMetrics: this.calculateProcessMetrics(session),
            outcomeMetrics: this.calculateOutcomeMetrics(workResults),
            recommendations: [],
            timestamp: new Date().toISOString(),
        };
        for (const [phase, artifact] of Object.entries(session.artifacts)) {
            const phaseReview = this.reviewPhase(phase, artifact);
            review.strengths.push(...phaseReview.strengths);
            review.weaknesses.push(...phaseReview.weaknesses);
            review.improvements.push(...phaseReview.improvements);
        }
        review.overallScore = this.calculateOverallScore(review);
        review.recommendations = this.generateRecommendations(review);
        return review;
    }
    extractLearnings(session, review) {
        const learnings = [];
        for (const learning of session.learnings) {
            learnings.push({
                id: this.generateLearningId(),
                type: learning.type ?? "process",
                category: learning.category ?? "general",
                summary: learning.summary,
                context: learning.context,
                impact: learning.impact ?? "medium",
                confidence: learning.confidence ?? 0.7,
                sessionId: session.id,
                timestamp: new Date().toISOString(),
                tags: this.extractTags(learning),
            });
        }
        if (review.weaknesses.length > 0) {
            learnings.push({
                id: this.generateLearningId(),
                type: "improvement",
                category: "quality",
                summary: `Address identified weaknesses: ${review.weaknesses.slice(0, 3).join(", ")}`,
                context: { weaknesses: review.weaknesses },
                impact: "high",
                confidence: 0.8,
                sessionId: session.id,
                timestamp: new Date().toISOString(),
                tags: ["quality", "improvement"],
            });
        }
        return learnings;
    }
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    }
    generateLearningId() {
        return `learning_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    }
    async ensureWorkspace() {
        try {
            await mkdir(this.options.workspace, { recursive: true });
        }
        catch {
            // Directory may already exist.
        }
    }
    async saveSession() {
        if (!this.currentSession)
            return;
        const sessionPath = join(this.options.workspace, `${this.currentSession.id}.json`);
        await writeFile(sessionPath, JSON.stringify(this.currentSession, null, 2));
    }
    async loadLearnings() {
        try {
            const content = await readFile(this.options.learningsPath, "utf8");
            const parsed = JSON.parse(content);
            this.learnings = new Map(parsed.map((l) => [l.id, l]));
        }
        catch {
            this.learnings = new Map();
        }
    }
    async saveLearnings(newLearnings) {
        for (const learning of newLearnings) {
            this.learnings.set(learning.id, learning);
        }
        const learningsArray = Array.from(this.learnings.values());
        await writeFile(this.options.learningsPath, JSON.stringify(learningsArray, null, 2));
    }
    getRelevantLearnings(phase) {
        return Array.from(this.learnings.values())
            .filter((l) => l.phase === phase || l.category === "general")
            .filter((l) => l.confidence >= 0.5)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5);
    }
    selectApproach(ideas) {
        return ideas[0] ?? { description: "Default approach", pros: [], cons: [] };
    }
    estimateTimeline() {
        return {
            estimated: "2-4 hours",
            phases: {
                brainstorming: "30 minutes",
                planning: "30 minutes",
                working: "1-3 hours",
                reviewing: "30 minutes",
            },
        };
    }
    identifyResources() {
        return {
            tools: [],
            dependencies: [],
            skills: [],
            time: "2-4 hours",
        };
    }
    createMitigations(risks) {
        return risks.map((risk) => ({
            risk,
            mitigation: `Monitor and address ${risk.toLowerCase()} early`,
        }));
    }
    defineSuccessCriteria() {
        return [
            "Objective achieved according to specifications",
            "No critical issues or regressions",
            "Process followed all phases correctly",
            "Learnings documented for future use",
        ];
    }
    createExecutionSteps(_approach, _constraints) {
        return [
            { description: "Set up development environment", estimatedTime: "15 minutes" },
            { description: "Implement core functionality", estimatedTime: "1-2 hours" },
            { description: "Test and validate", estimatedTime: "30 minutes" },
            { description: "Finalize and document", estimatedTime: "15 minutes" },
        ];
    }
    checkForKnownIssues(step) {
        return Array.from(this.learnings.values())
            .filter((l) => l.type === "issue" &&
            l.context &&
            l.context.step === step.description)
            .map((l) => l.summary);
    }
    getKnownSolutions(issue) {
        return Array.from(this.learnings.values())
            .filter((l) => l.type === "solution" &&
            l.context &&
            l.context.issue === issue)
            .map((l) => l.summary);
    }
    reviewPhase(phase, _artifact) {
        return {
            strengths: [`Phase ${phase} completed systematically`],
            weaknesses: [],
            improvements: [],
        };
    }
    calculateProcessMetrics(session) {
        const phases = session.phases;
        const start = session.startTime ? new Date(session.startTime).getTime() : NaN;
        const end = session.endTime ? new Date(session.endTime).getTime() : NaN;
        const totalMs = Number.isFinite(start) && Number.isFinite(end) ? end - start : 0;
        const phaseDurations = {};
        for (const [phase, data] of Object.entries(phases)) {
            if (data.startTime && data.endTime) {
                const phaseMs = new Date(data.endTime).getTime() - new Date(data.startTime).getTime();
                phaseDurations[phase] = `${Math.round(phaseMs / 60000)} minutes`;
            }
        }
        return {
            totalDuration: `${Math.round(totalMs / 60000)} minutes`,
            phaseDurations,
        };
    }
    calculateOutcomeMetrics(workResults) {
        return {
            stepsCompleted: workResults.steps.filter((s) => s.status === "completed").length,
            issuesEncountered: workResults.issues.length,
            solutionsApplied: workResults.solutions.length,
        };
    }
    calculateOverallScore(review) {
        let score = 70;
        score += review.strengths.length * 5;
        score -= review.weaknesses.length * 10;
        score += review.improvements.length * 2;
        return Math.max(0, Math.min(100, score));
    }
    generateRecommendations(review) {
        const recommendations = [];
        if (review.weaknesses.length > 0) {
            recommendations.push("Focus on addressing identified weaknesses in future sessions");
        }
        const totalDuration = review.processMetrics.totalDuration;
        if (typeof totalDuration === "string" && totalDuration.includes("minutes")) {
            const minutes = parseInt(totalDuration, 10);
            if (Number.isFinite(minutes) && minutes > 180) {
                recommendations.push("Consider breaking down large objectives into smaller sessions");
            }
        }
        return recommendations;
    }
    extractTags(learning) {
        const tags = [];
        if (learning.type)
            tags.push(learning.type);
        if (learning.category)
            tags.push(learning.category);
        const tech = learning.context?.technology;
        if (tech)
            tags.push(tech);
        return tags;
    }
    log(message) {
        if (this.options.verbose) {
            console.log(`[CompoundEngineering] ${message}`);
        }
    }
    getSessionSummary(_sessionId) {
        return this.currentSession;
    }
    getAllLearnings() {
        return Array.from(this.learnings.values());
    }
    searchLearnings(query) {
        const lowerQuery = query.toLowerCase();
        return Array.from(this.learnings.values()).filter((l) => l.summary.toLowerCase().includes(lowerQuery) ||
            (l.tags ?? []).some((tag) => tag.toLowerCase().includes(lowerQuery)) ||
            l.category.toLowerCase().includes(lowerQuery));
    }
    requireSession() {
        if (!this.currentSession) {
            throw new Error("No active session. Call startSession() first.");
        }
        return this.currentSession;
    }
}
if (import.meta.url === `file://${process.argv[1]}`) {
    const [, , command, ...args] = process.argv;
    if (!command || command === "--help" || command === "-h") {
        console.log(`
Usage: compound-engineering <command> [options]

Commands:
  start <project-name> <objective>    Start a new session
  list-sessions                       List all sessions
  learnings                           Show all learnings
  search <query>                      Search learnings

Options:
  --workspace <dir>     Workspace directory (default: ./compound-workspace)
  --learnings <file>    Learnings file path (default: ./learnings.json)
  --verbose             Enable verbose logging
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
        else if (flag === "--learnings" && args[i + 1]) {
            options.learningsPath = args[i + 1];
            i++;
        }
        else if (flag === "--verbose") {
            options.verbose = true;
        }
    }
    const compoundEngineering = new CompoundEngineering(options);
    switch (command) {
        case "start":
            if (args.length < 2) {
                console.error("Error: Project name and objective required");
                process.exit(1);
            }
            compoundEngineering
                .startSession(args[0], args.slice(1).join(" "))
                .then((session) => {
                console.log(`✅ Session started: ${session.id}`);
            })
                .catch((error) => {
                console.error(`❌ Error: ${getErrorMessage(error)}`);
                process.exit(1);
            });
            break;
        case "learnings":
            compoundEngineering
                .loadLearnings()
                .then(() => {
                const learnings = compoundEngineering.getAllLearnings();
                console.log(`📚 Found ${learnings.length} learnings:`);
                for (const learning of learnings) {
                    console.log(`  [${learning.confidence.toFixed(2)}] ${learning.summary}`);
                }
            })
                .catch((error) => {
                console.error(`❌ Error: ${getErrorMessage(error)}`);
                process.exit(1);
            });
            break;
        case "search":
            if (args.length === 0) {
                console.error("Error: Search query required");
                process.exit(1);
            }
            compoundEngineering
                .loadLearnings()
                .then(() => {
                const results = compoundEngineering.searchLearnings(args.join(" "));
                console.log(`🔍 Found ${results.length} matching learnings:`);
                for (const learning of results) {
                    console.log(`  [${learning.confidence.toFixed(2)}] ${learning.summary}`);
                }
            })
                .catch((error) => {
                console.error(`❌ Error: ${getErrorMessage(error)}`);
                process.exit(1);
            });
            break;
        default:
            console.error(`Unknown command: ${command}`);
            process.exit(1);
    }
}
