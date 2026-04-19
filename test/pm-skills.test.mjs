import assert from "node:assert/strict";
import { access, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import PMSkills from "../lib/pm-skills.mjs";
describe("PM-Skills", () => {
    let pmSkills;
    let testDir = "";
    before(() => {
        testDir = join(process.cwd(), "test-pm");
        pmSkills = new PMSkills({
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
    test("should list available skills", () => {
        const skills = pmSkills.getAvailableSkills();
        assert.ok(Array.isArray(skills));
        assert.equal(skills.length, 8);
        const skillNames = skills.map((s) => s.name);
        for (const name of [
            "growthLoops",
            "marketResearch",
            "gtmStrategy",
            "userPersonas",
            "competitiveAnalysis",
            "valueProposition",
            "productRoadmap",
            "metricsDefinition",
        ]) {
            assert.ok(skillNames.includes(name));
        }
    });
    test("should execute growth loops skill", async () => {
        const result = await pmSkills.executeSkill("growthLoops", {
            product: { name: "Test Product" },
            users: [{ type: "business" }],
            metrics: { revenue: "subscription" },
        });
        const loops = result.loops;
        assert.ok(loops);
        assert.ok(loops.acquisition);
        assert.ok(loops.activation);
        assert.ok(loops.retention);
        assert.ok(loops.referral);
        assert.ok(loops.revenue);
        assert.ok(result.insights);
        assert.ok(result.recommendations);
        assert.ok(result.kpis);
        assert.ok(result.timestamp);
        assert.ok(result.savedTo);
    });
    test("should execute market research skill", async () => {
        const result = await pmSkills.executeSkill("marketResearch", {
            product: { name: "Test Product" },
            industry: "Technology",
            targetMarket: { segment: "SMB" },
        });
        const research = result.research;
        assert.ok(research);
        assert.ok(research.marketSize);
        assert.ok(research.trends);
        assert.ok(research.competitors);
        assert.ok(research.opportunities);
        assert.ok(research.threats);
        assert.ok(research.customerNeeds);
        assert.ok(result.insights);
        assert.ok(result.recommendations);
        assert.ok(result.risks);
        assert.ok(result.opportunities);
        assert.ok(result.timestamp);
    });
    test("should execute GTM strategy skill", async () => {
        const result = await pmSkills.executeSkill("gtmStrategy", {
            product: { name: "Test Product" },
            market: { size: "Large", competition: "Medium" },
            budget: "$50,000",
            timeline: "12 weeks",
        });
        const strategy = result.strategy;
        assert.ok(strategy);
        assert.ok(strategy.positioning);
        assert.ok(strategy.pricing);
        assert.ok(strategy.channels);
        assert.ok(strategy.launch);
        assert.ok(strategy.sales);
        assert.ok(strategy.marketing);
        assert.ok(result.insights);
        assert.ok(result.recommendations);
        assert.ok(result.timeline);
        assert.ok(result.budget);
        assert.ok(result.kpis);
        assert.ok(result.timestamp);
    });
    test("should execute user personas skill", async () => {
        const result = await pmSkills.executeSkill("userPersonas", {
            targetUsers: [{ role: "manager" }, { role: "developer" }],
            researchData: { interviews: 10, surveys: 50 },
        });
        const personas = result.personas;
        assert.ok(result.personas);
        assert.ok(result.journeys);
        assert.ok(Array.isArray(personas));
        assert.ok(personas.length > 0);
        assert.ok(personas[0].name);
        assert.ok(personas[0].role);
        assert.ok(personas[0].demographics);
        assert.ok(personas[0].goals);
        assert.ok(personas[0].painPoints);
        assert.ok(result.insights);
        assert.ok(result.recommendations);
        assert.ok(result.timestamp);
    });
    test("should execute competitive analysis skill", async () => {
        const result = await pmSkills.executeSkill("competitiveAnalysis", {
            product: { name: "Test Product", features: ["A", "B"] },
            competitors: [{ name: "Competitor A", features: ["A", "C"] }],
            market: { growth: "High" },
        });
        const analysis = result.analysis;
        assert.ok(analysis);
        assert.ok(analysis.directCompetitors);
        assert.ok(analysis.indirectCompetitors);
        assert.ok(analysis.positioning);
        assert.ok(analysis.strengths);
        assert.ok(analysis.weaknesses);
        assert.ok(analysis.opportunities);
        assert.ok(analysis.threats);
        assert.ok(result.insights);
        assert.ok(result.recommendations);
        assert.ok(result.timestamp);
    });
    test("should execute value proposition skill", async () => {
        const result = await pmSkills.executeSkill("valueProposition", {
            product: { name: "Test Product", benefits: ["Efficiency", "Cost savings"] },
            customers: { pains: ["Manual work"], gains: ["Automation"] },
            market: { competition: "High" },
        });
        const analysis = result.analysis;
        assert.ok(analysis);
        assert.ok(analysis.customerJobs);
        assert.ok(analysis.pains);
        assert.ok(analysis.gains);
        assert.ok(analysis.products);
        assert.ok(analysis.valueProposition);
        assert.ok(analysis.validation);
        assert.ok(result.insights);
        assert.ok(result.recommendations);
        assert.ok(result.timestamp);
    });
    test("should execute product roadmap skill", async () => {
        const result = await pmSkills.executeSkill("productRoadmap", {
            product: { name: "Test Product", stage: "MVP" },
            vision: "Become market leader",
            goals: ["Increase users", "Improve retention"],
            resources: { team: 5, budget: "$100k" },
        });
        const roadmap = result.roadmap;
        assert.ok(roadmap);
        assert.ok(roadmap.vision);
        assert.ok(roadmap.strategy);
        assert.ok(roadmap.initiatives);
        assert.ok(roadmap.features);
        assert.ok(roadmap.timeline);
        assert.ok(roadmap.dependencies);
        assert.ok(roadmap.risks);
        assert.ok(result.insights);
        assert.ok(result.recommendations);
        assert.ok(result.kpis);
        assert.ok(result.timestamp);
    });
    test("should execute metrics definition skill", async () => {
        const result = await pmSkills.executeSkill("metricsDefinition", {
            product: { type: "SaaS", stage: "Growth" },
            business: { model: "Subscription", market: "B2B" },
            goals: ["Revenue growth", "User retention"],
        });
        const metrics = result.metrics;
        assert.ok(metrics);
        assert.ok(metrics.productMetrics);
        assert.ok(metrics.businessMetrics);
        assert.ok(metrics.userMetrics);
        assert.ok(metrics.technicalMetrics);
        assert.ok(metrics.kpis);
        assert.ok(metrics.reporting);
        assert.ok(result.insights);
        assert.ok(result.recommendations);
        assert.ok(result.implementation);
        assert.ok(result.timestamp);
    });
    test("should run comprehensive product analysis", async () => {
        const productInfo = {
            product: { name: "Test Product", type: "SaaS" },
            industry: "Technology",
            targetMarket: { segment: "SMB", size: "Medium" },
        };
        const result = await pmSkills.runProductAnalysis(productInfo);
        assert.ok(result.results);
        assert.ok(result.summary);
        assert.ok(result.savedTo);
        assert.equal(Object.keys(result.results).length, 8);
        assert.equal(result.summary.totalSkills, 8);
        assert.ok(result.summary.completedSkills >= 0);
        assert.ok(Array.isArray(result.summary.keyInsights));
        assert.ok(Array.isArray(result.summary.recommendations));
        assert.ok(Array.isArray(result.summary.risks));
        assert.ok(Array.isArray(result.summary.opportunities));
    });
    test("should handle invalid skill names", async () => {
        await assert.rejects(() => pmSkills.executeSkill("invalidSkill", {}), /Unknown skill/);
    });
    test("should save results to workspace", async () => {
        const result = await pmSkills.executeSkill("growthLoops", { product: { name: "Test" } });
        await access(result.savedTo);
        const content = await readFile(result.savedTo, "utf8");
        const parsed = JSON.parse(content);
        assert.ok(parsed.loops);
        assert.ok(parsed.timestamp);
    });
});
