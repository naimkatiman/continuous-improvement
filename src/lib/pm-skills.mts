#!/usr/bin/env node

/**
 * PM-Skills: collection of 8 product management plugins.
 *
 * Each skill takes a loosely-typed input and returns a rich result object.
 * All results are persisted under the PM-Skills workspace.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface PMSkillsOptions {
  verbose?: boolean;
  workspace?: string;
}

export interface ResolvedPMSkillsOptions {
  verbose: boolean;
  workspace: string;
}

/** Loosely-typed input bag accepted by every skill. */
export type SkillInput = Record<string, unknown>;

/** Loosely-typed result bag returned by every skill. */
export type SkillResult = Record<string, unknown> & {
  timestamp: string;
  insights?: string[];
  recommendations?: string[];
  risks?: string[];
  opportunities?: string[];
};

export type PersistedSkillResult = SkillResult & { savedTo: string };

export interface PMSkillDefinition {
  category: string;
  description: string;
  execute(input: SkillInput): Promise<SkillResult>;
}

export interface AvailableSkill {
  category: string;
  description: string;
  name: string;
}

export type SkillName =
  | "growthLoops"
  | "marketResearch"
  | "gtmStrategy"
  | "userPersonas"
  | "competitiveAnalysis"
  | "valueProposition"
  | "productRoadmap"
  | "metricsDefinition";

export interface ProductAnalysisSummary {
  completedSkills: number;
  keyInsights: string[];
  opportunities: string[];
  recommendations: string[];
  risks: string[];
  totalSkills: number;
}

export interface ProductAnalysisResult {
  results: Record<string, PersistedSkillResult | { error: string }>;
  savedTo: string;
  summary: ProductAnalysisSummary;
}

const DEFAULT_OPTIONS: ResolvedPMSkillsOptions = {
  workspace: "./pm-workspace",
  verbose: false,
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

class GrowthLoopsSkill implements PMSkillDefinition {
  readonly description = "Design and analyze sustainable growth loops for your product";
  readonly category = "growth";

  async execute(_input: SkillInput): Promise<SkillResult> {
    const loops = {
      acquisition: [
        {
          name: "Content-Driven Acquisition",
          description: "Create valuable content that attracts target users",
          steps: ["Create content", "Users discover content", "Users sign up", "Users become advocates"],
          metrics: ["content_views", "signup_rate", "sharing_rate"],
        },
        {
          name: "Viral Product Features",
          description: "Build features that naturally encourage sharing",
          steps: ["User uses feature", "Feature invites others", "New users join", "Loop continues"],
          metrics: ["viral_coefficient", "conversion_rate", "time_to_viral"],
        },
      ],
      activation: [
        {
          name: "Onboarding Experience",
          description: "Guide users to value realization quickly",
          steps: ["User signs up", "Complete onboarding", "Experience core value", "Become active user"],
          metrics: ["onboarding_completion", "time_to_value", "activation_rate"],
        },
      ],
      retention: [
        {
          name: "Habit Formation",
          description: "Create daily/weekly usage patterns",
          steps: ["User uses product", "Receives value", "Forms habit", "Returns regularly"],
          metrics: ["daily_active_users", "retention_rate", "engagement_frequency"],
        },
      ],
      referral: [
        {
          name: "Network Effects",
          description: "Product becomes more valuable as more users join",
          steps: ["User invites others", "Network grows", "Value increases", "More invitations sent"],
          metrics: ["invitation_rate", "network_value", "growth_rate"],
        },
      ],
      revenue: [
        {
          name: "Value-Based Pricing",
          description: "Increase revenue as users realize more value",
          steps: ["User gets value", "Willingness to pay increases", "Upgrade to paid", "More value delivered"],
          metrics: ["conversion_to_paid", "customer_lifetime_value", "expansion_revenue"],
        },
      ],
    };

    return {
      loops,
      insights: [
        "Focus on 1-2 core growth loops before expanding",
        "Measure each step of the funnel to identify bottlenecks",
        "Product-led growth often has the highest LTV/CAC ratio",
      ],
      recommendations: [
        "Implement referral program with clear incentives",
        "Optimize onboarding to reduce time-to-value",
        "Create content strategy aligned with user acquisition",
      ],
      kpis: {
        acquisition: ["monthly_new_users", "cac", "conversion_rates"],
        activation: ["activation_rate", "time_to_value", "onboarding_completion"],
        retention: ["retention_rate", "churn_rate", "engagement_score"],
        referral: ["viral_coefficient", "referral_rate", "network_effects"],
        revenue: ["arr", "ltv", "expansion_revenue"],
      },
      timestamp: new Date().toISOString(),
    };
  }
}

class MarketResearchSkill implements PMSkillDefinition {
  readonly description = "Conduct comprehensive market research and analysis";
  readonly category = "research";

  async execute(_input: SkillInput): Promise<SkillResult> {
    const research = {
      marketSize: {
        tam: "Total Addressable Market estimation",
        sam: "Serviceable Addressable Market",
        som: "Serviceable Obtainable Market",
        methodology: "Top-down and bottom-up analysis",
        sources: ["Industry reports", "Government data", "Company financials"],
      },
      trends: [
        { trend: "AI/ML Integration", impact: "High", timeline: "1-2 years", description: "Increasing adoption of AI in products" },
        { trend: "Remote Work Tools", impact: "Medium", timeline: "Ongoing", description: "Continued demand for remote collaboration" },
      ],
      competitors: {
        directCompetitors: [
          {
            name: "Competitor A",
            strengths: ["Market leader", "Large user base"],
            weaknesses: ["Slow innovation", "High pricing"],
          },
        ],
        indirectCompetitors: [],
        marketShare: "Competitive market share analysis",
        positioning: "Where your product fits in the landscape",
      },
      opportunities: [
        "Underserved customer segments",
        "Technological gaps in current solutions",
        "Changing customer behaviors",
      ],
      threats: ["New market entrants", "Regulatory changes", "Economic downturns"],
      customerNeeds: {
        painPoints: ["Current solutions are expensive", "Poor user experience"],
        gains: ["Increased efficiency", "Cost savings"],
        jobsToBeDone: ["Manage daily tasks", "Collaborate with team"],
      },
    };

    return {
      research,
      insights: [
        "Market is growing but becoming saturated",
        "Customer needs are evolving with technology",
        "Differentiation is key to success",
      ],
      recommendations: [
        "Focus on underserved market segments",
        "Develop clear differentiation strategy",
        "Monitor competitive landscape continuously",
      ],
      risks: [
        "High competition may impact market share",
        "Regulatory changes could affect business model",
        "Economic factors may impact customer spending",
      ],
      opportunities: [
        "Growing market segment with few competitors",
        "Technology creating new possibilities",
        "Changing customer needs opening new markets",
      ],
      timestamp: new Date().toISOString(),
    };
  }
}

class GTMStrategySkill implements PMSkillDefinition {
  readonly description = "Develop go-to-market strategy and execution plan";
  readonly category = "strategy";

  async execute(input: SkillInput): Promise<SkillResult> {
    const budget = typeof input.budget === "string" ? input.budget : "$50,000";
    const timeline = typeof input.timeline === "string" ? input.timeline : "12 weeks";

    const strategy = {
      positioning: {
        statement: "For [target customer] who [need], [product] is a [category] that [benefit]",
        differentiation: "Key differentiators from competitors",
        valueProposition: "Core value proposition",
        messaging: "Key messaging pillars",
      },
      pricing: {
        model: "Subscription-based pricing",
        tiers: [
          { name: "Basic", price: "$9/month", features: ["Core features"] },
          { name: "Pro", price: "$29/month", features: ["Advanced features"] },
        ],
        strategy: "Value-based pricing with competitive analysis",
        revenue: "Projected revenue based on conversion rates",
      },
      channels: {
        primary: ["Direct sales", "Online marketing"],
        secondary: ["Partnerships", "Content marketing"],
        channels: [
          { name: "Direct Website", cost: "Medium", reach: "Global", conversion: "High" },
        ],
      },
      launch: {
        phases: [
          { phase: "Pre-launch", duration: "2 weeks", activities: ["Beta testing"] },
          { phase: "Launch", duration: "1 week", activities: ["Public announcement"] },
          { phase: "Post-launch", duration: "4 weeks", activities: ["Gather feedback"] },
        ],
        activities: "Detailed launch activities",
        success: "Launch success criteria",
      },
      sales: {
        approach: "Product-led growth with sales assistance",
        team: "Sales team structure and roles",
        process: "Sales process from lead to close",
        tools: "Sales tools and technology",
      },
      marketing: {
        awareness: ["Content marketing", "Social media", "PR"],
        consideration: ["Product demos", "Case studies", "Webinars"],
        conversion: ["Free trials", "Pricing page", "Sales calls"],
        retention: ["Email marketing", "Customer success", "Community"],
      },
    };

    return {
      strategy,
      insights: [
        "Multi-channel approach reduces dependency on single channel",
        "Product-led growth scales better than sales-led",
        "Clear positioning is critical for market entry",
      ],
      recommendations: [
        "Start with focused channel strategy before expanding",
        "Invest in product-led growth for long-term scalability",
        "Test messaging with target audience before full launch",
      ],
      timeline: {
        totalDuration: timeline,
        phases: { preparation: "2 weeks", launch: "1 week", growth: "9 weeks" },
        milestones: "Key milestones and dependencies",
      },
      budget: {
        total: budget,
        allocation: { marketing: "40%", sales: "30%", product: "20%", operations: "10%" },
      },
      kpis: {
        acquisition: ["leads", "cac", "conversion_rate"],
        revenue: ["mrr", "arr", "ltv"],
        engagement: ["activation_rate", "retention_rate"],
        brand: ["brand_awareness", "market_share"],
      },
      timestamp: new Date().toISOString(),
    };
  }
}

class UserPersonasSkill implements PMSkillDefinition {
  readonly description = "Create detailed user personas and journey maps";
  readonly category = "users";

  async execute(_input: SkillInput): Promise<SkillResult> {
    const personas = [
      {
        name: "Alex Manager",
        role: "Product Manager",
        demographics: { age: "32", experience: "8 years", company: "Mid-size tech company" },
        goals: ["Ship products faster", "Improve team collaboration"],
        painPoints: ["Poor communication", "Missed deadlines"],
        behaviors: ["Uses multiple tools", "Values efficiency"],
        needs: ["Better visibility", "Simplified workflows"],
      },
      {
        name: "Sam Developer",
        role: "Software Engineer",
        demographics: { age: "28", experience: "5 years", company: "Startup" },
        goals: ["Write clean code", "Learn new technologies"],
        painPoints: ["Technical debt", "Unclear requirements"],
        behaviors: ["Prefers automation", "Values documentation"],
        needs: ["Clear specifications", "Good tools"],
      },
    ];

    const journeys = personas.map((persona) => ({
      persona: persona.name,
      stages: [
        {
          stage: "Awareness",
          actions: ["Discovers problem", "Searches for solutions"],
          emotions: ["Frustrated", "Hopeful"],
          touchpoints: ["Google search", "Colleagues"],
        },
        {
          stage: "Consideration",
          actions: ["Evaluates options", "Tries demos"],
          emotions: ["Curious", "Skeptical"],
          touchpoints: ["Website", "Product demo"],
        },
        {
          stage: "Decision",
          actions: ["Compares features", "Makes purchase"],
          emotions: ["Confident", "Excited"],
          touchpoints: ["Sales call", "Pricing page"],
        },
      ],
    }));

    return {
      personas,
      journeys,
      insights: [
        "Users have different needs based on their roles",
        "Pain points drive purchasing decisions",
        "User experience varies by technical proficiency",
      ],
      recommendations: [
        "Design features for primary persona first",
        "Create onboarding paths for different user types",
        "Address pain points in marketing messaging",
      ],
      timestamp: new Date().toISOString(),
    };
  }
}

class CompetitiveAnalysisSkill implements PMSkillDefinition {
  readonly description = "Analyze competitors and competitive positioning";
  readonly category = "competition";

  async execute(_input: SkillInput): Promise<SkillResult> {
    const analysis = {
      directCompetitors: [
        {
          name: "Competitor A",
          product: "Similar product offering",
          strengths: ["Market leader", "Large user base"],
          weaknesses: ["Expensive", "Poor support"],
          marketShare: "40%",
          pricing: "$50-100/month",
        },
      ],
      indirectCompetitors: [
        {
          name: "Alternative Solution",
          type: "Different approach to same problem",
          threat: "Medium",
          description: "Solves same problem differently",
        },
      ],
      positioning: {
        position: "Where product fits in competitive landscape",
        differentiation: "Key differentiators",
        advantages: "Competitive advantages",
        disadvantages: "Competitive disadvantages",
      },
      strengths: ["Better user experience", "Lower pricing", "More features"],
      weaknesses: ["Smaller market presence", "Limited resources", "Newer product"],
      opportunities: [
        "Gaps in competitor offerings",
        "Underserved market segments",
        "Areas where competitors are weak",
      ],
      threats: ["New competitor entry", "Price wars", "Feature copying"],
    };

    return {
      analysis,
      insights: [
        "Market is crowded but has room for differentiation",
        "Price competition is intense",
        "Customer experience is key differentiator",
      ],
      recommendations: [
        "Focus on unique value proposition",
        "Monitor competitor moves closely",
        "Build competitive moats through network effects",
      ],
      timestamp: new Date().toISOString(),
    };
  }
}

class ValuePropositionSkill implements PMSkillDefinition {
  readonly description = "Define and refine value proposition";
  readonly category = "value";

  async execute(_input: SkillInput): Promise<SkillResult> {
    const analysis = {
      customerJobs: [
        "Manage daily tasks efficiently",
        "Collaborate with team members",
        "Track progress and results",
      ],
      pains: [
        "Wasting time on manual processes",
        "Poor communication with team",
        "Lack of visibility into progress",
      ],
      gains: ["Increased productivity", "Better team collaboration", "Data-driven decisions"],
      products: {
        painRelievers: ["Automates manual tasks", "Improves communication", "Provides visibility"],
        gainCreators: ["Increases efficiency", "Enables collaboration", "Delivers insights"],
      },
      valueProposition: {
        headline: "The most efficient way to manage your team's work",
        subheading: "Save time and improve collaboration with our all-in-one platform",
        benefits: [
          "Save 10+ hours per week",
          "Improve team productivity by 30%",
          "Make data-driven decisions",
        ],
        features: ["Automated workflows", "Real-time collaboration", "Advanced analytics"],
      },
      validation: {
        methods: ["Customer interviews", "A/B testing", "Surveys"],
        metrics: ["Message resonance", "Conversion rates", "Customer feedback"],
        timeline: "4-6 weeks",
      },
    };

    return {
      analysis,
      insights: [
        "Customers value time savings above all",
        "Team collaboration is major pain point",
        "Data insights drive purchasing decisions",
      ],
      recommendations: [
        "Emphasize time savings in messaging",
        "Highlight collaboration features",
        "Showcase data and analytics capabilities",
      ],
      timestamp: new Date().toISOString(),
    };
  }
}

class ProductRoadmapSkill implements PMSkillDefinition {
  readonly description = "Create strategic product roadmap";
  readonly category = "planning";

  async execute(_input: SkillInput): Promise<SkillResult> {
    const initiatives = [
      {
        name: "Mobile App Launch",
        priority: "High",
        impact: "Expand user access",
        effort: "High",
        timeline: "Q2 2024",
      },
      {
        name: "AI Integration",
        priority: "Medium",
        impact: "Enhanced functionality",
        effort: "High",
        timeline: "Q3 2024",
      },
    ];

    const roadmap = {
      vision: {
        statement: "Become the leading platform for team productivity",
        timeline: "3-5 years",
        impact: "Transform how teams work together",
        metrics: ["Market leadership", "Customer satisfaction", "Revenue growth"],
      },
      strategy: {
        approach: "Product-led growth with enterprise expansion",
        focus: "User experience and automation",
        differentiation: "AI-powered insights and workflows",
        markets: ["Start with SMB, expand to enterprise"],
      },
      initiatives,
      features: {
        now: [
          { feature: "Performance improvements", priority: "High" },
          { feature: "UI enhancements", priority: "Medium" },
        ],
        next: [
          { feature: "Mobile app", priority: "High" },
          { feature: "AI features", priority: "Medium" },
        ],
        later: [{ feature: "Advanced analytics", priority: "Low" }],
      },
      timeline: {
        quarters: {
          "Q1 2024": ["Performance improvements", "UI enhancements"],
          "Q2 2024": ["Mobile app launch"],
          "Q3 2024": ["AI integration"],
          "Q4 2024": ["Advanced analytics"],
        },
        resources: "Resource allocation plan",
        milestones: "Key milestones and deliverables",
      },
      dependencies: [
        "Mobile app depends on API development",
        "AI features depend on data infrastructure",
        "Analytics depend on user data collection",
      ],
      risks: [
        "Technical complexity may delay timeline",
        "Resource constraints may impact quality",
        "Market changes may require pivots",
      ],
    };

    return {
      roadmap,
      insights: [
        "Mobile expansion is critical for growth",
        "AI integration provides competitive advantage",
        "Phased approach reduces risk",
      ],
      recommendations: [
        "Focus on core features before expanding",
        "Validate market demand for new initiatives",
        "Build flexibility into roadmap for changes",
      ],
      kpis: {
        product: ["Feature adoption", "User satisfaction", "Performance metrics"],
        business: ["Revenue growth", "Market share", "Customer acquisition"],
        development: ["Velocity", "Quality", "Innovation rate"],
      },
      timestamp: new Date().toISOString(),
    };
  }
}

class MetricsDefinitionSkill implements PMSkillDefinition {
  readonly description = "Define comprehensive product and business metrics";
  readonly category = "metrics";

  async execute(_input: SkillInput): Promise<SkillResult> {
    const metrics = {
      productMetrics: {
        acquisition: ["signups", "activation_rate", "time_to_value"],
        engagement: ["daily_active_users", "session_duration", "feature_adoption"],
        retention: ["retention_rate", "churn_rate", "resurrection_rate"],
        satisfaction: ["nps", "csat", "user_feedback"],
      },
      businessMetrics: {
        revenue: ["mrr", "arr", "revenue_growth_rate"],
        profitability: ["gross_margin", "net_margin", "unit_economics"],
        efficiency: ["cac", "ltv", "ltv_cac_ratio"],
        market: ["market_share", "penetration_rate", "competitive_position"],
      },
      userMetrics: {
        behavior: ["user_journey_completion", "feature_usage", "workflow_efficiency"],
        outcomes: ["productivity_gain", "time_saved", "error_reduction"],
        satisfaction: ["user_effort_score", "task_success_rate", "user_delight"],
      },
      technicalMetrics: {
        performance: ["load_time", "uptime", "error_rate"],
        quality: ["bug_rate", "test_coverage", "code_quality"],
        scalability: ["concurrent_users", "data_volume", "response_time"],
        security: ["vulnerabilities", "incidents", "compliance"],
      },
      kpis: {
        primary: [
          { metric: "monthly_recurring_growth", target: "20%", timeframe: "monthly" },
          { metric: "user_retention_rate", target: "85%", timeframe: "monthly" },
        ],
        secondary: [
          { metric: "customer_satisfaction", target: "4.5/5", timeframe: "quarterly" },
          { metric: "feature_adoption_rate", target: "60%", timeframe: "monthly" },
        ],
      },
      reporting: {
        dashboards: [
          { name: "Executive Dashboard", audience: "Leadership", metrics: ["revenue", "growth", "retention"] },
          { name: "Product Dashboard", audience: "Product Team", metrics: ["usage", "satisfaction", "features"] },
        ],
        frequency: {
          real_time: ["active_users", "system_status"],
          daily: ["signups", "revenue"],
          weekly: ["retention", "satisfaction"],
          monthly: ["growth", "market_share"],
        },
        alerts: [
          { metric: "downtime", threshold: ">5 minutes", action: "immediate_notification" },
          { metric: "churn_rate", threshold: ">10%", action: "weekly_review" },
        ],
      },
    };

    return {
      metrics,
      insights: [
        "Focus on leading indicators, not just lagging",
        "Connect product metrics to business outcomes",
        "Different metrics for different stakeholders",
      ],
      recommendations: [
        "Implement tracking before you need the data",
        "Create single source of truth for metrics",
        "Review and adjust metrics regularly",
      ],
      implementation: {
        phases: [
          { phase: "Infrastructure", duration: "2 weeks", deliverables: ["Tracking setup", "Data pipeline"] },
          { phase: "Dashboard Creation", duration: "3 weeks", deliverables: ["Executive dashboard", "Product dashboard"] },
          { phase: "Process Integration", duration: "2 weeks", deliverables: ["Reporting process", "Alert system"] },
        ],
        tools: ["Analytics platform", "Dashboard tool", "Alert system"],
        governance: "Metrics governance and ownership",
      },
      timestamp: new Date().toISOString(),
    };
  }
}

export default class PMSkills {
  public readonly options: ResolvedPMSkillsOptions;
  public readonly skills: Record<SkillName, PMSkillDefinition>;

  constructor(options: PMSkillsOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.skills = {
      growthLoops: new GrowthLoopsSkill(),
      marketResearch: new MarketResearchSkill(),
      gtmStrategy: new GTMStrategySkill(),
      userPersonas: new UserPersonasSkill(),
      competitiveAnalysis: new CompetitiveAnalysisSkill(),
      valueProposition: new ValuePropositionSkill(),
      productRoadmap: new ProductRoadmapSkill(),
      metricsDefinition: new MetricsDefinitionSkill(),
    };
  }

  async executeSkill(skillName: string, input: SkillInput): Promise<PersistedSkillResult> {
    if (!this.isSkillName(skillName)) {
      throw new Error(
        `Unknown skill: ${skillName}. Available skills: ${Object.keys(this.skills).join(", ")}`,
      );
    }

    await this.ensureWorkspace();
    this.log(`🎯 Executing PM skill: ${skillName}`);

    const result = await this.skills[skillName].execute(input);
    const savedTo = await this.saveResult(skillName, result);
    this.log(`✅ Skill ${skillName} completed. Result saved to: ${savedTo}`);

    return { ...result, savedTo };
  }

  getAvailableSkills(): AvailableSkill[] {
    return (Object.entries(this.skills) as Array<[SkillName, PMSkillDefinition]>).map(
      ([name, skill]) => ({
        name,
        description: skill.description,
        category: skill.category,
      }),
    );
  }

  async runProductAnalysis(productInfo: SkillInput): Promise<ProductAnalysisResult> {
    this.log(`🚀 Running comprehensive product analysis`);

    const results: Record<string, PersistedSkillResult | { error: string }> = {};
    const skillOrder: SkillName[] = [
      "marketResearch",
      "userPersonas",
      "competitiveAnalysis",
      "valueProposition",
      "growthLoops",
      "gtmStrategy",
      "productRoadmap",
      "metricsDefinition",
    ];

    for (const skillName of skillOrder) {
      try {
        this.log(`📊 Running ${skillName}...`);
        results[skillName] = await this.executeSkill(skillName, productInfo);
      } catch (error) {
        const message = getErrorMessage(error);
        this.log(`⚠️  Skill ${skillName} failed: ${message}`);
        results[skillName] = { error: message };
      }
    }

    const summary = this.generateAnalysisSummary(results);
    const savedTo = await this.saveComprehensiveAnalysis(results, summary);

    this.log(`🎉 Product analysis completed. Saved to: ${savedTo}`);
    return { results, summary, savedTo };
  }

  generateAnalysisSummary(
    results: Record<string, PersistedSkillResult | { error: string }>,
  ): ProductAnalysisSummary {
    const summary: ProductAnalysisSummary = {
      totalSkills: Object.keys(results).length,
      completedSkills: Object.values(results).filter((r) => !("error" in r)).length,
      keyInsights: [],
      recommendations: [],
      risks: [],
      opportunities: [],
    };

    for (const result of Object.values(results)) {
      if ("error" in result) continue;

      const insights = asArray(result.insights);
      if (insights) summary.keyInsights.push(...(insights as string[]));

      const recommendations = asArray(result.recommendations);
      if (recommendations) summary.recommendations.push(...(recommendations as string[]));

      const risks = asArray(result.risks);
      if (risks) summary.risks.push(...(risks as string[]));

      const opportunities = asArray(result.opportunities);
      if (opportunities) summary.opportunities.push(...(opportunities as string[]));
    }

    return summary;
  }

  async saveResult(skillName: string, result: SkillResult): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${skillName}_${timestamp}.json`;
    const filepath = join(this.options.workspace, filename);
    await writeFile(filepath, JSON.stringify(result, null, 2));
    return filepath;
  }

  async saveComprehensiveAnalysis(
    results: Record<string, PersistedSkillResult | { error: string }>,
    summary: ProductAnalysisSummary,
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `product_analysis_${timestamp}.json`;
    const filepath = join(this.options.workspace, filename);

    const analysis = {
      timestamp: new Date().toISOString(),
      summary,
      results,
    };

    await writeFile(filepath, JSON.stringify(analysis, null, 2));
    return filepath;
  }

  async ensureWorkspace(): Promise<void> {
    try {
      await mkdir(this.options.workspace, { recursive: true });
    } catch {
      // Directory may already exist.
    }
  }

  log(message: string): void {
    if (this.options.verbose) {
      console.log(`[PM-Skills] ${message}`);
    }
  }

  private isSkillName(value: string): value is SkillName {
    return Object.prototype.hasOwnProperty.call(this.skills, value);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , command, skillName, ...args] = process.argv;

  if (!command || command === "--help" || command === "-h") {
    console.log(`
Usage: pm-skills <command> [skill-name] [options]

Commands:
  list                          List all available PM skills
  execute <skill-name>          Execute a specific skill
  analyze                       Run comprehensive product analysis

Available Skills:
  growthLoops           - Design sustainable growth loops
  marketResearch        - Conduct market research
  gtmStrategy          - Develop go-to-market strategy
  userPersonas         - Create user personas
  competitiveAnalysis  - Analyze competition
  valueProposition     - Define value proposition
  productRoadmap       - Create product roadmap
  metricsDefinition    - Define product metrics

Options:
  --workspace <dir>     Workspace directory (default: ./pm-workspace)
  --verbose             Enable verbose logging
`);
    process.exit(0);
  }

  const options: PMSkillsOptions = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--workspace" && args[i + 1]) {
      options.workspace = args[i + 1];
      i++;
    } else if (flag === "--verbose") {
      options.verbose = true;
    }
  }

  const pmSkills = new PMSkills(options);

  switch (command) {
    case "list": {
      const skills = pmSkills.getAvailableSkills();
      console.log("🎯 Available PM Skills:");
      for (const skill of skills) {
        console.log(`  ${skill.name.padEnd(20)} - ${skill.description} [${skill.category}]`);
      }
      break;
    }

    case "execute": {
      if (!skillName) {
        console.error("Error: Skill name required");
        process.exit(1);
      }
      const mockInput: SkillInput = { product: "Sample Product", market: "Technology" };
      pmSkills
        .executeSkill(skillName, mockInput)
        .then((result) => {
          console.log(`✅ Skill ${skillName} completed successfully`);
          console.log(`📁 Result saved to: ${result.savedTo}`);
        })
        .catch((error: unknown) => {
          console.error(`❌ Error: ${getErrorMessage(error)}`);
          process.exit(1);
        });
      break;
    }

    case "analyze": {
      const mockProductInfo: SkillInput = {
        product: "Sample Product",
        industry: "Technology",
        targetMarket: "SMB",
      };
      pmSkills
        .runProductAnalysis(mockProductInfo)
        .then((result) => {
          console.log(`🎉 Product analysis completed`);
          console.log(`📁 Results saved to: ${result.savedTo}`);
          console.log(
            `📊 Summary: ${result.summary.completedSkills}/${result.summary.totalSkills} skills completed`,
          );
        })
        .catch((error: unknown) => {
          console.error(`❌ Error: ${getErrorMessage(error)}`);
          process.exit(1);
        });
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}
