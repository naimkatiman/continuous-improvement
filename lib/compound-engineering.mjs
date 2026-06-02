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
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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
function parseEstimatedMinutes(value) {
    if (!value) {
        return 0;
    }
    const normalized = value.toLowerCase();
    const rangeMatch = normalized.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
        const low = Number.parseInt(rangeMatch[1] ?? "0", 10);
        const high = Number.parseInt(rangeMatch[2] ?? "0", 10);
        const average = Math.round((low + high) / 2);
        return normalized.includes("hour") ? average * 60 : average;
    }
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
        const phaseStart = new Date().toISOString();
        session.phase = "brainstorming";
        session.phases.brainstorming.startTime ||= phaseStart;
        session.phases.brainstorming.status = "active";
        const relevantLearnings = this.getRelevantLearnings("brainstorming");
        const brainstormResults = this.generateBrainstormResults(session.objective, context, relevantLearnings);
        session.artifacts.brainstorming = brainstormResults;
        session.phases.brainstorming.endTime = new Date().toISOString();
        session.phases.brainstorming.status = "completed";
        await this.saveSession();
        this.log(`💭 Brainstorming phase completed`);
        return brainstormResults;
    }
    async plan(brainstormResults = {}, preferences = {}) {
        const session = this.requireSession();
        const phaseStart = new Date().toISOString();
        session.phase = "planning";
        session.phases.brainstorming.status = "completed";
        session.phases.brainstorming.endTime ||= phaseStart;
        session.phases.planning.startTime ||= phaseStart;
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
        session.phases.planning.endTime = new Date().toISOString();
        session.phases.planning.status = "completed";
        await this.saveSession();
        this.log(`📋 Planning phase completed`);
        return plan;
    }
    async work(plan, progressCallback = null) {
        const session = this.requireSession();
        const phaseStart = new Date().toISOString();
        session.phase = "working";
        session.phases.planning.status = "completed";
        session.phases.planning.endTime ||= phaseStart;
        session.phases.working.startTime ||= phaseStart;
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
        session.phases.working.endTime = new Date().toISOString();
        session.phases.working.status = "completed";
        await this.saveSession();
        this.log(`🔧 Working phase completed`);
        return workLog;
    }
    async review(workResults = {}, criteria = null) {
        const session = this.requireSession();
        const phaseStart = new Date().toISOString();
        session.phase = "reviewing";
        session.phases.working.status = "completed";
        session.phases.working.endTime ||= phaseStart;
        session.phases.reviewing.startTime ||= phaseStart;
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
        const approach = this.selectApproach(brainstormResults.ideas);
        const steps = this.createExecutionSteps(approach, brainstormResults.constraints);
        const decisions = this.buildPlanDecisions(objective, brainstormResults.constraints, relevantLearnings, preferences);
        const plan = {
            objective,
            approach,
            steps,
            timeline: this.estimateTimeline(steps),
            resources: this.identifyResources(steps, brainstormResults.constraints, relevantLearnings),
            risks: brainstormResults.risks,
            mitigations: this.createMitigations(brainstormResults.risks),
            decisions,
            successCriteria: this.defineSuccessCriteria(objective, brainstormResults.constraints),
            timestamp: new Date().toISOString(),
        };
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
        if (ideas.length === 0) {
            return {
                description: "Incremental implementation with explicit verification checkpoints",
                pros: ["Keeps scope tight", "Reduces regressions"],
                cons: [],
            };
        }
        const scoredIdeas = ideas.map((idea, index) => {
            if (typeof idea === "string") {
                return { idea, score: 1 - index * 0.01 };
            }
            const pros = idea.pros?.length ?? 0;
            const cons = idea.cons?.length ?? 0;
            const hasDescription = idea.description ? 1 : 0;
            return {
                idea,
                score: pros * 2 + hasDescription - cons - index * 0.01,
            };
        });
        scoredIdeas.sort((left, right) => right.score - left.score);
        return scoredIdeas[0]?.idea ?? ideas[0];
    }
    estimateTimeline(steps) {
        const workingMinutes = steps.reduce((total, step) => total + parseEstimatedMinutes(step.estimatedTime), 0);
        const planningMinutes = 20;
        const brainstormingMinutes = 20;
        const reviewingMinutes = 15;
        const totalMinutes = brainstormingMinutes + planningMinutes + workingMinutes + reviewingMinutes;
        return {
            estimated: formatMinutes(totalMinutes),
            phases: {
                brainstorming: formatMinutes(brainstormingMinutes),
                planning: formatMinutes(planningMinutes),
                working: formatMinutes(workingMinutes),
                reviewing: formatMinutes(reviewingMinutes),
            },
        };
    }
    identifyResources(steps, constraints, relevantLearnings) {
        const tools = new Set();
        const dependencies = new Set();
        for (const step of steps) {
            const description = step.description.toLowerCase();
            if (description.includes("review") || description.includes("inspect")) {
                tools.add("code search");
            }
            if (description.includes("implement") ||
                description.includes("build") ||
                description.includes("deliver")) {
                tools.add("editor/runtime");
            }
            if (description.includes("verify") ||
                description.includes("test") ||
                description.includes("validate")) {
                tools.add("test runner");
            }
            if (description.includes("document")) {
                tools.add("documentation");
            }
        }
        for (const constraint of constraints) {
            const normalized = constraint.toLowerCase();
            if (normalized.includes("api"))
                dependencies.add("api contract");
            if (normalized.includes("database") || normalized.includes("schema")) {
                dependencies.add("data model");
            }
            if (normalized.includes("service"))
                dependencies.add("service boundary");
            if (normalized.includes("ui") || normalized.includes("frontend")) {
                dependencies.add("ui surface");
            }
            if (normalized.includes("test"))
                dependencies.add("existing test coverage");
        }
        return {
            tools: Array.from(tools),
            dependencies: Array.from(dependencies),
            skills: relevantLearnings.slice(0, 3).map((learning) => learning.summary),
            time: this.estimateTimeline(steps).estimated,
        };
    }
    createMitigations(risks) {
        return risks.map((risk) => ({
            risk,
            mitigation: `Monitor and address ${risk.toLowerCase()} early`,
        }));
    }
    defineSuccessCriteria(objective, constraints) {
        const criteria = [
            `Deliver the objective: ${objective}`,
            "Complete verification without critical regressions",
            "Document decisions and learnings for the next iteration",
        ];
        if (constraints.length > 0) {
            criteria.push(`Satisfy key constraints: ${constraints.slice(0, 2).join("; ")}`);
        }
        return criteria;
    }
    createExecutionSteps(approach, constraints) {
        const approachDescription = typeof approach === "string"
            ? approach
            : approach.description ?? "the chosen implementation path";
        const normalizedApproach = approachDescription.replace(/\.$/, "").toLowerCase();
        const steps = [
            {
                description: "Inspect the existing implementation surface and confirm the smallest safe change",
                estimatedTime: "20 minutes",
            },
            {
                description: `Implement ${normalizedApproach}`,
                estimatedTime: "45 minutes",
            },
        ];
        if (constraints.length > 0) {
            steps.push({
                description: `Validate constraints and edge cases: ${constraints.slice(0, 2).join("; ")}`,
                estimatedTime: "20 minutes",
            });
        }
        steps.push({
            description: "Run targeted verification and regression checks",
            estimatedTime: "20 minutes",
        }, {
            description: "Document decisions, learnings, and follow-up work",
            estimatedTime: "15 minutes",
        });
        return steps;
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
    reviewPhase(phase, artifact) {
        const strengths = [];
        const weaknesses = [];
        const improvements = [];
        if (phase === "brainstorming") {
            const brainstorm = artifact;
            if (brainstorm.ideas.length > 0) {
                strengths.push(`Brainstorm produced ${brainstorm.ideas.length} concrete approach ideas`);
            }
            else {
                weaknesses.push("Brainstorming did not capture any concrete approaches");
                improvements.push("Capture at least one concrete approach before planning");
            }
            if (brainstorm.risks.length > 0) {
                strengths.push(`Brainstorm surfaced ${brainstorm.risks.length} delivery risks early`);
            }
            else {
                weaknesses.push("Brainstorming did not identify delivery risks");
            }
            if (brainstorm.constraints.length === 0) {
                improvements.push("Record explicit constraints to keep the plan grounded");
            }
        }
        else if (phase === "planning") {
            const plan = artifact;
            if (plan.steps.length > 0) {
                strengths.push(`Plan defines ${plan.steps.length} executable steps`);
            }
            else {
                weaknesses.push("Planning produced no executable steps");
            }
            if (plan.successCriteria.length > 0) {
                strengths.push("Plan includes explicit success criteria");
            }
            else {
                weaknesses.push("Plan is missing success criteria");
                improvements.push("Define verification-oriented success criteria");
            }
            if (plan.risks.length === 0) {
                improvements.push("Capture at least one explicit risk and mitigation");
            }
        }
        else if (phase === "working") {
            const work = artifact;
            const completedSteps = work.steps.filter((step) => step.status === "completed").length;
            const failedSteps = work.steps.filter((step) => step.status === "failed").length;
            if (completedSteps > 0) {
                strengths.push(`Execution completed ${completedSteps}/${work.steps.length} planned steps`);
            }
            if (work.solutions.length > 0) {
                strengths.push(`Execution documented ${work.solutions.length} issue resolution(s)`);
            }
            if (failedSteps > 0) {
                weaknesses.push(`${failedSteps} execution step(s) failed`);
            }
            if (work.issues.length > work.solutions.length) {
                improvements.push("Close the gap between discovered issues and documented solutions");
            }
        }
        else if (phase === "reviewing") {
            const review = artifact;
            if (review.recommendations.length > 0) {
                strengths.push(`Review produced ${review.recommendations.length} follow-up recommendation(s)`);
            }
            else {
                weaknesses.push("Review phase produced no follow-up recommendations");
            }
            if (review.overallScore < 80) {
                improvements.push("Increase verification depth before closing the session");
            }
        }
        if (strengths.length === 0 && weaknesses.length === 0 && improvements.length === 0) {
            strengths.push(`Phase ${phase} completed and recorded`);
        }
        return { strengths, weaknesses, improvements };
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
    generateBrainstormResults(objective, context, relevantLearnings) {
        const contextEntries = Object.entries(context).filter(([, value]) => value !== undefined &&
            value !== null &&
            !(typeof value === "string" && value.trim().length === 0));
        const contextLabels = contextEntries.map(([key]) => this.humanizeKey(key));
        const leadLearning = relevantLearnings[0];
        const ideas = [
            `Deliver the smallest verifiable slice of "${objective}" first`,
            contextLabels.length > 0
                ? `Reuse existing context around ${contextLabels.slice(0, 2).join(" and ")} before introducing new work`
                : "Inspect the current implementation before changing anything",
        ];
        if (leadLearning) {
            ideas.push({
                description: "Apply the strongest relevant prior learning to reduce repeated mistakes",
                pros: [leadLearning.summary],
                cons: [],
            });
        }
        const constraints = contextEntries.map(([key, value]) => `${this.humanizeKey(key)}: ${this.summarizeContextValue(value)}`);
        const assumptions = [
            "The task can be delivered incrementally with verification checkpoints",
            contextEntries.length > 0
                ? "The supplied context reflects the current project constraints"
                : "Additional project constraints will surface during implementation",
        ];
        const risks = [
            "Existing implementation may already cover part of the objective",
            constraints.length > 0
                ? `Constraints may limit the solution space: ${constraints[0]}`
                : "Unstated constraints may appear during execution",
        ];
        const opportunities = [
            "Reuse existing implementation instead of creating parallel paths",
            relevantLearnings.length > 0
                ? "Promote repeatable learnings into default workflow habits"
                : "Capture a reusable learning from this session",
        ];
        return {
            ideas,
            constraints,
            assumptions,
            risks,
            opportunities,
            timestamp: new Date().toISOString(),
        };
    }
    buildPlanDecisions(objective, constraints, relevantLearnings, preferences) {
        const decisions = [
            `Optimize for an incremental delivery path for: ${objective}`,
            "Keep verification as a first-class step instead of a final afterthought",
        ];
        if (constraints.length > 0) {
            decisions.push(`Honor the recorded constraints before expanding scope`);
        }
        if (Object.keys(preferences).length > 0) {
            decisions.push("Respect explicit execution preferences supplied for the session");
        }
        if (relevantLearnings.length > 0) {
            decisions.push(`Reuse prior learning: ${relevantLearnings[0].summary}`);
        }
        return decisions;
    }
    humanizeKey(key) {
        return key
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/[_-]+/g, " ")
            .toLowerCase();
    }
    summarizeContextValue(value) {
        if (typeof value === "string") {
            return value.length > 60 ? `${value.slice(0, 57)}...` : value;
        }
        if (typeof value === "number" || typeof value === "boolean") {
            return String(value);
        }
        if (Array.isArray(value)) {
            return value.slice(0, 3).map((item) => this.summarizeContextValue(item)).join(", ");
        }
        if (value && typeof value === "object") {
            return `object with keys: ${Object.keys(value).slice(0, 3).join(", ")}`;
        }
        return "unspecified";
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
