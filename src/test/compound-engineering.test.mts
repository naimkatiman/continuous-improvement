import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import CompoundEngineering from "../lib/compound-engineering.mjs";
import type { PlanStep, Session, WorkLog } from "../lib/compound-engineering.mjs";

describe("Compound Engineering", () => {
  let compoundEngineering: CompoundEngineering;
  let testDir = "";

  before(() => {
    testDir = join(process.cwd(), "test-compound");
    compoundEngineering = new CompoundEngineering({
      workspace: join(testDir, "workspace"),
      learningsPath: join(testDir, "learnings.json"),
      verbose: false,
    });
  });

  after(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  test("should start a new session", async () => {
    const session = await compoundEngineering.startSession(
      "Test Project",
      "Build a new feature for user management",
    );

    assert.ok(session.id);
    assert.equal(session.projectName, "Test Project");
    assert.equal(session.objective, "Build a new feature for user management");
    assert.equal(session.phase, "brainstorming");
    assert.equal(session.phases.brainstorming.status, "active");
    assert.ok(session.startTime);
  });

  test("should execute brainstorming phase", async () => {
    await compoundEngineering.startSession("Test Project", "Test objective");

    const brainstormResults = await compoundEngineering.brainstorm({
      context: "Some context for brainstorming",
    });

    assert.ok(brainstormResults.ideas);
    assert.ok(brainstormResults.constraints);
    assert.ok(brainstormResults.assumptions);
    assert.ok(brainstormResults.risks);
    assert.ok(brainstormResults.opportunities);
    assert.ok(brainstormResults.timestamp);
  });

  test("should execute planning phase", async () => {
    await compoundEngineering.startSession("Test Project", "Test objective");

    const plan = await compoundEngineering.plan(
      {
        ideas: ["Idea 1", "Idea 2"],
        constraints: ["Constraint 1"],
        assumptions: ["Assumption 1"],
        risks: ["Risk 1"],
        opportunities: ["Opportunity 1"],
      },
      { timeline: "2 weeks", budget: "$1000" },
    );

    assert.ok(plan.objective);
    assert.ok(plan.approach);
    assert.ok(plan.steps);
    assert.ok(plan.timeline);
    assert.ok(plan.resources);
    assert.ok(plan.risks);
    assert.ok(plan.mitigations);
    assert.ok(plan.successCriteria);
    assert.ok(plan.timestamp);
  });

  test("should execute working phase", async () => {
    await compoundEngineering.startSession("Test Project", "Test objective");

    const plan: { steps: PlanStep[] } = {
      steps: [
        { description: "Step 1", estimatedTime: "30 minutes" },
        { description: "Step 2", estimatedTime: "1 hour" },
      ],
    };

    const workResults = await compoundEngineering.work(plan);

    assert.ok(workResults.steps);
    assert.equal(workResults.steps.length, 2);
    assert.ok(workResults.issues);
    assert.ok(workResults.solutions);
    assert.ok(workResults.timestamp);

    for (const step of workResults.steps) {
      assert.ok(step.step);
      assert.ok(step.status);
      assert.ok(step.startTime);
      assert.ok(step.endTime);
    }
  });

  test("should execute reviewing phase", async () => {
    await compoundEngineering.startSession("Test Project", "Test objective");

    const workResults: Partial<WorkLog> = {
      steps: [
        {
          step: "Step 1",
          status: "completed",
          startTime: new Date().toISOString(),
          issues: [],
          solutions: [],
          artifacts: [],
        },
        {
          step: "Step 2",
          status: "completed",
          startTime: new Date().toISOString(),
          issues: [],
          solutions: [],
          artifacts: [],
        },
      ],
      issues: [],
      solutions: [],
    };

    const reviewResults = await compoundEngineering.review(workResults);

    assert.ok(reviewResults.review);
    assert.ok(reviewResults.learnings);
    assert.ok(reviewResults.review.sessionId);
    assert.ok(reviewResults.review.overallScore);
    assert.ok(reviewResults.review.strengths);
    assert.ok(reviewResults.review.weaknesses);
    assert.ok(reviewResults.review.improvements);
    assert.ok(reviewResults.review.recommendations);
  });

  test("should save and load learnings", async () => {
    await compoundEngineering.startSession("Test Project", "Test objective");

    const brainstormResults = await compoundEngineering.brainstorm();
    const plan = await compoundEngineering.plan(brainstormResults);
    const workResults = await compoundEngineering.work(plan);
    await compoundEngineering.review(workResults);

    await compoundEngineering.loadLearnings();

    const allLearnings = compoundEngineering.getAllLearnings();
    assert.ok(Array.isArray(allLearnings));

    const searchResults = compoundEngineering.searchLearnings("test");
    assert.ok(Array.isArray(searchResults));
  });

  test("should generate session IDs and learning IDs correctly", () => {
    const sessionId1 = compoundEngineering.generateSessionId();
    const sessionId2 = compoundEngineering.generateSessionId();

    assert.notEqual(sessionId1, sessionId2);
    assert.ok(sessionId1.startsWith("session_"));
    assert.ok(sessionId2.startsWith("session_"));

    const learningId1 = compoundEngineering.generateLearningId();
    const learningId2 = compoundEngineering.generateLearningId();

    assert.notEqual(learningId1, learningId2);
    assert.ok(learningId1.startsWith("learning_"));
    assert.ok(learningId2.startsWith("learning_"));
  });

  test("createExecutionSteps returns structured steps", () => {
    const steps = compoundEngineering.createExecutionSteps(
      { description: "Test approach" },
      [],
    );
    assert.ok(Array.isArray(steps));
    assert.ok(steps.length > 0);
    for (const s of steps) {
      assert.ok(s.description);
      assert.ok(s.estimatedTime);
    }
  });

  test("should calculate process metrics correctly", () => {
    const mockSession: Session = {
      id: "test-session",
      projectName: "Test",
      objective: "Objective",
      phase: "reviewing",
      startTime: "2024-01-01T10:00:00.000Z",
      endTime: "2024-01-01T12:00:00.000Z",
      phases: {
        brainstorming: { status: "completed", startTime: "2024-01-01T10:00:00.000Z", endTime: "2024-01-01T10:30:00.000Z" },
        planning: { status: "completed", startTime: "2024-01-01T10:30:00.000Z", endTime: "2024-01-01T11:00:00.000Z" },
        working: { status: "completed", startTime: "2024-01-01T11:00:00.000Z", endTime: "2024-01-01T11:45:00.000Z" },
        reviewing: { status: "completed", startTime: "2024-01-01T11:45:00.000Z", endTime: "2024-01-01T12:00:00.000Z" },
      },
      artifacts: {},
      learnings: [],
      decisions: [],
    };

    const metrics = compoundEngineering.calculateProcessMetrics(mockSession);

    assert.ok(metrics.totalDuration);
    const phaseDurations = metrics.phaseDurations as Record<string, string>;
    assert.ok(phaseDurations.brainstorming);
    assert.ok(phaseDurations.planning);
    assert.ok(phaseDurations.working);
    assert.ok(phaseDurations.reviewing);
  });

  test("should calculate outcome metrics correctly", () => {
    const workResults: WorkLog = {
      steps: [
        {
          step: "a",
          status: "completed",
          startTime: "x",
          issues: [],
          solutions: [],
          artifacts: [],
        },
        {
          step: "b",
          status: "completed",
          startTime: "x",
          issues: [],
          solutions: [],
          artifacts: [],
        },
        {
          step: "c",
          status: "failed",
          startTime: "x",
          issues: [],
          solutions: [],
          artifacts: [],
        },
      ],
      issues: ["Issue 1", "Issue 2"],
      solutions: ["Solution 1"],
      timestamp: new Date().toISOString(),
    };

    const metrics = compoundEngineering.calculateOutcomeMetrics(workResults);

    assert.equal(metrics.stepsCompleted, 2);
    assert.equal(metrics.issuesEncountered, 2);
    assert.equal(metrics.solutionsApplied, 1);
  });
});
