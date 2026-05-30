#!/usr/bin/env node
/**
 * PM-Skills: collection of 8 product management plugins.
 *
 * Each skill accepts a loose input bag, normalizes it into a shared product
 * context, and returns strategy output derived from that context.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
const DEFAULT_OPTIONS = {
    workspace: "./pm-workspace",
    verbose: false,
};
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function asArray(value) {
    return Array.isArray(value) ? value : null;
}
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
function getString(value, fallback = "") {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}
function getNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function titleCase(value) {
    return value
        .replace(/[_-]+/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
}
function toSentenceKey(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}
function uniqueStrings(values, limit = 12) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        const trimmed = value.trim();
        if (!trimmed)
            continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push(trimmed);
        if (result.length >= limit)
            break;
    }
    return result;
}
function extractNamedStrings(value) {
    if (typeof value === "string") {
        return value.trim() ? [value.trim()] : [];
    }
    if (Array.isArray(value)) {
        return uniqueStrings(value.flatMap((item) => extractNamedStrings(item)));
    }
    const record = asRecord(value);
    if (!record) {
        return [];
    }
    return uniqueStrings([
        getString(record.name),
        getString(record.title),
        getString(record.role),
        getString(record.type),
        getString(record.segment),
        getString(record.feature),
        getString(record.goal),
        getString(record.benefit),
        getString(record.pain),
        getString(record.gain),
        getString(record.statement),
        getString(record.value),
    ].filter(Boolean));
}
function mergeStringLists(...values) {
    return uniqueStrings(values.flatMap((value) => extractNamedStrings(value)));
}
function parseIntegerFromString(value) {
    const match = value.match(/(\d+)/);
    return match ? Number.parseInt(match[1] ?? "", 10) : null;
}
function inferAudience(marketSegment, businessModel, userRoles) {
    const combined = [marketSegment, businessModel, ...userRoles].join(" ").toLowerCase();
    const b2bMarkers = ["smb", "enterprise", "team", "b2b", "manager", "developer", "admin"];
    return b2bMarkers.some((marker) => combined.includes(marker)) ? "B2B" : "B2C";
}
function defaultGoals(productName, primaryBenefit) {
    return [
        `Increase adoption of ${productName}`,
        `Improve retention through ${primaryBenefit.toLowerCase()}`,
        "Create a repeatable revenue engine",
    ];
}
function defaultFeatures(productType) {
    const type = productType.toLowerCase();
    if (type.includes("saas")) {
        return ["workflow automation", "team collaboration", "usage analytics"];
    }
    if (type.includes("marketplace")) {
        return ["trusted transactions", "supply matching", "rating system"];
    }
    return ["automation", "visibility", "guided onboarding"];
}
function defaultPains(audience, primaryFeature) {
    if (audience === "B2B") {
        return [
            "Manual coordination slows delivery",
            `Existing tools hide insight around ${primaryFeature.toLowerCase()}`,
            "Teams cannot prove ROI quickly enough",
        ];
    }
    return [
        "Setup takes too long",
        `Current options make ${primaryFeature.toLowerCase()} feel complicated`,
        "Users churn before they see value",
    ];
}
function defaultGains(audience, primaryBenefit) {
    if (audience === "B2B") {
        return [
            primaryBenefit,
            "Clearer team visibility",
            "Faster time-to-value for the buying team",
        ];
    }
    return [
        primaryBenefit,
        "Frictionless setup",
        "Confidence that progress is improving",
    ];
}
function defaultUserRoles(audience) {
    return audience === "B2B"
        ? ["operations manager", "product lead", "developer"]
        : ["creator", "power user", "buyer"];
}
function normalizeCompetitors(input, industry) {
    const market = asRecord(input.market);
    const competitorsInput = asArray(input.competitors) ?? asArray(market?.competitors) ?? [];
    const normalized = competitorsInput
        .map((item, index) => {
        const record = asRecord(item);
        if (!record) {
            const name = getString(item);
            return name
                ? {
                    name,
                    type: index === 0 ? "direct" : "indirect",
                    positioning: `Established option in ${industry.toLowerCase()}`,
                    features: [],
                }
                : null;
        }
        const name = getString(record.name);
        if (!name)
            return null;
        const features = mergeStringLists(record.features, record.advantages, record.capabilities);
        return {
            name,
            type: getString(record.type, index === 0 ? "direct" : "indirect"),
            positioning: getString(record.positioning, `${titleCase(name)} targets adjacent ${industry.toLowerCase()} needs`),
            features,
        };
    })
        .filter((item) => item !== null);
    if (normalized.length > 0) {
        return normalized;
    }
    return [
        {
            name: `${titleCase(industry)} Suite Inc.`,
            type: "direct",
            positioning: `Broad incumbent serving ${industry.toLowerCase()} workflows`,
            features: ["broad feature set", "enterprise controls"],
        },
        {
            name: "Manual/In-house Workflow",
            type: "indirect",
            positioning: "Spreadsheets, email, and custom internal process",
            features: ["low switching cost", "familiar workflow"],
        },
    ];
}
function buildSkillContext(input) {
    const product = asRecord(input.product);
    const market = asRecord(input.market);
    const targetMarket = asRecord(input.targetMarket) ?? market;
    const business = asRecord(input.business);
    const customers = asRecord(input.customers);
    const resources = asRecord(input.resources);
    const researchData = asRecord(input.researchData);
    const tentativeRoles = mergeStringLists(input.targetUsers, input.users);
    const marketSegment = getString(targetMarket?.segment, getString(targetMarket?.market, getString(market?.segment, "SMB teams")));
    const businessModel = getString(business?.model, getString(input.metrics, getString(market?.model, "Subscription")));
    const audience = inferAudience(marketSegment, businessModel, tentativeRoles);
    const productName = getString(product?.name, "Product");
    const productType = getString(product?.type, audience === "B2B" ? "SaaS platform" : "digital product");
    const productStage = getString(product?.stage, "Growth");
    const industry = getString(input.industry, getString(market?.industry, "Technology"));
    const budget = getString(input.budget, "$50,000");
    const timeline = getString(input.timeline, "12 weeks");
    const companySize = getString(targetMarket?.size, getString(resources?.team, "Mid-size"));
    const goals = mergeStringLists(input.goals, product?.goals, input.objective);
    const features = mergeStringLists(product?.features, input.features);
    const benefits = mergeStringLists(product?.benefits, input.benefits, customers?.gains);
    const userRoles = uniqueStrings(tentativeRoles.length > 0 ? tentativeRoles : defaultUserRoles(audience), 3);
    const primaryRole = titleCase(userRoles[0] ?? "User");
    const normalizedFeatures = features.length > 0 ? features : defaultFeatures(productType);
    const primaryFeature = normalizedFeatures[0] ?? "automation";
    const normalizedBenefits = benefits.length > 0
        ? benefits
        : [
            audience === "B2B"
                ? `More predictable ${primaryFeature.toLowerCase()} execution`
                : `Faster ${primaryFeature.toLowerCase()} outcomes`,
        ];
    const primaryBenefit = normalizedBenefits[0];
    const pains = mergeStringLists(input.pains, customers?.pains);
    const normalizedPains = pains.length > 0 ? pains : defaultPains(audience, primaryFeature);
    const gains = mergeStringLists(input.gains, customers?.gains, normalizedBenefits);
    const normalizedGains = gains.length > 0 ? gains : defaultGains(audience, primaryBenefit);
    const normalizedGoals = goals.length > 0 ? goals : defaultGoals(productName, primaryBenefit);
    const primaryGoal = normalizedGoals[0];
    const primaryPain = normalizedPains[0];
    const primaryGain = normalizedGains[0];
    const interviews = getNumber(researchData?.interviews) ?? 0;
    const surveys = getNumber(researchData?.surveys) ?? 0;
    const resourcesTeamSize = getNumber(resources?.team) ??
        parseIntegerFromString(getString(resources?.team, "")) ??
        parseIntegerFromString(getString(companySize, ""));
    const competitors = normalizeCompetitors(input, industry);
    const vision = getString(input.vision, `Become the trusted ${industry.toLowerCase()} platform for ${marketSegment.toLowerCase()}`);
    return {
        audience,
        benefits: normalizedBenefits,
        budget,
        businessModel,
        companySize,
        competitors,
        features: normalizedFeatures,
        gains: normalizedGains,
        goals: normalizedGoals,
        industry,
        marketSegment,
        pains: normalizedPains,
        primaryBenefit,
        primaryFeature,
        primaryGain,
        primaryGoal,
        primaryPain,
        primaryRole,
        productName,
        productStage,
        productType,
        researchVolume: interviews + surveys,
        resourcesTeamSize,
        timeline,
        userRoles,
        vision,
    };
}
function splitTimeline(totalDuration) {
    const totalWeeks = parseIntegerFromString(totalDuration);
    if (!totalWeeks || totalWeeks < 4) {
        return {
            preparation: "2 weeks",
            launch: "1 week",
            growth: "4 weeks",
        };
    }
    const preparation = Math.max(2, Math.round(totalWeeks * 0.25));
    const launch = Math.max(1, Math.round(totalWeeks * 0.15));
    const growth = Math.max(2, totalWeeks - preparation - launch);
    return {
        preparation: `${preparation} week${preparation === 1 ? "" : "s"}`,
        launch: `${launch} week${launch === 1 ? "" : "s"}`,
        growth: `${growth} week${growth === 1 ? "" : "s"}`,
    };
}
function buildPrimaryKpis(ctx) {
    const goalText = ctx.goals.join(" ").toLowerCase();
    const primary = [];
    if (goalText.includes("revenue") || goalText.includes("arr") || goalText.includes("mrr")) {
        primary.push({ metric: "monthly_recurring_growth", target: "15-20%", timeframe: "monthly" });
    }
    if (goalText.includes("retain") || goalText.includes("churn")) {
        primary.push({ metric: "logo_retention_rate", target: "85%+", timeframe: "monthly" });
    }
    if (goalText.includes("user") || goalText.includes("adoption") || goalText.includes("acquisition")) {
        primary.push({ metric: "activation_rate", target: "45%+", timeframe: "monthly" });
    }
    if (primary.length === 0) {
        primary.push({ metric: "activation_rate", target: "40%+", timeframe: "monthly" }, { metric: "retention_rate", target: "80%+", timeframe: "monthly" });
    }
    return primary.slice(0, 2);
}
function buildGrowthLoopsResult(ctx) {
    const acquisitionName = ctx.audience === "B2B" ? "Problem-led pipeline" : "Content-led discovery";
    const referralName = ctx.audience === "B2B" ? "Team expansion loop" : "Social proof referral";
    return {
        loops: {
            acquisition: [
                {
                    name: acquisitionName,
                    description: `Attract ${ctx.marketSegment.toLowerCase()} users by framing the cost of ${ctx.primaryPain.toLowerCase()}`,
                    steps: [
                        `Surface the problem: ${ctx.primaryPain}`,
                        `Show how ${ctx.productName} improves ${ctx.primaryBenefit.toLowerCase()}`,
                        `Convert ${ctx.primaryRole.toLowerCase()} into a qualified trial`,
                        "Capture onboarding and qualification signals",
                    ],
                    metrics: uniqueStrings([
                        ctx.audience === "B2B" ? "qualified_pipeline" : "signup_rate",
                        "landing_page_conversion",
                        "trial_start_rate",
                    ]),
                },
            ],
            activation: [
                {
                    name: "First-value onboarding",
                    description: `Help new users reach ${ctx.primaryGain.toLowerCase()} in the first session`,
                    steps: [
                        `Guide ${ctx.primaryRole.toLowerCase()} to the core feature`,
                        `Remove setup friction around ${ctx.primaryFeature.toLowerCase()}`,
                        "Confirm value with a visible success moment",
                        "Prompt the next action before drop-off",
                    ],
                    metrics: uniqueStrings(["time_to_value", "activation_rate", "setup_completion"]),
                },
            ],
            retention: [
                {
                    name: "Habit and workflow retention",
                    description: `Turn ${ctx.primaryFeature.toLowerCase()} into a repeated workflow`,
                    steps: [
                        "Create a recurring use case",
                        "Expose progress and saved effort",
                        "Prompt repeat engagement at the right moment",
                        "Reinforce the outcome with reporting or reminders",
                    ],
                    metrics: uniqueStrings(["retention_rate", "weekly_active_accounts", "feature_adoption"]),
                },
            ],
            referral: [
                {
                    name: referralName,
                    description: `Use delivered value to drive expansion beyond the first ${ctx.primaryRole.toLowerCase()}`,
                    steps: [
                        "Deliver visible outcome",
                        "Prompt invite, share, or stakeholder proof",
                        "Extend value to adjacent teammates or peers",
                        "Increase product utility as usage expands",
                    ],
                    metrics: uniqueStrings(["invite_rate", "expansion_accounts", "referral_conversion"]),
                },
            ],
            revenue: [
                {
                    name: "Value-to-revenue expansion",
                    description: `Map revenue growth to clearer proof of ${ctx.primaryBenefit.toLowerCase()}`,
                    steps: [
                        "Deliver measurable value",
                        "Expose usage or ROI threshold",
                        "Trigger upgrade or expansion motion",
                        "Reinvest customer success proof into retention",
                    ],
                    metrics: uniqueStrings([
                        ctx.businessModel.toLowerCase().includes("usage") ? "usage_expansion" : "expansion_mrr",
                        "paid_conversion_rate",
                        "customer_lifetime_value",
                    ]),
                },
            ],
        },
        insights: [
            `${ctx.productStage} products compound faster when acquisition promises match activation value.`,
            `${ctx.primaryRole} is the critical first user because they feel ${ctx.primaryPain.toLowerCase()} most directly.`,
            `${ctx.businessModel} monetization works best when revenue expansion is tied to visible proof of ${ctx.primaryBenefit.toLowerCase()}.`,
        ],
        recommendations: [
            `Design the first-run experience around solving ${ctx.primaryPain.toLowerCase()}.`,
            `Instrument activation around ${ctx.primaryFeature.toLowerCase()} instead of generic engagement.`,
            `Build expansion prompts after users experience ${ctx.primaryBenefit.toLowerCase()}.`,
        ],
        kpis: {
            acquisition: uniqueStrings(["qualified_pipeline", "signup_rate", "trial_start_rate"], 3),
            activation: uniqueStrings(["activation_rate", "time_to_value", "setup_completion"], 3),
            retention: uniqueStrings(["retention_rate", "feature_adoption", "weekly_active_accounts"], 3),
            referral: uniqueStrings(["invite_rate", "referral_conversion", "team_expansion"], 3),
            revenue: uniqueStrings(["paid_conversion_rate", "net_revenue_retention", "customer_lifetime_value"], 3),
        },
        timestamp: new Date().toISOString(),
    };
}
function buildMarketResearchResult(ctx) {
    const opportunities = uniqueStrings([
        `Position ${ctx.productName} around faster ${ctx.primaryBenefit.toLowerCase()}`,
        `Serve ${ctx.marketSegment.toLowerCase()} teams that are unhappy with broad suites`,
        `Own a wedge around ${ctx.primaryFeature.toLowerCase()} before category leaders react`,
    ]);
    const risks = uniqueStrings([
        ctx.competitors.length > 1
            ? "Incumbents can bundle overlapping features into larger suites"
            : "The category may still need proof that the problem is urgent enough to switch",
        `${ctx.productStage} execution risk could slow customer trust`,
        `Buyers may compare ${ctx.productName} against in-house or manual workflows`,
    ]);
    return {
        research: {
            marketSize: {
                tam: `${ctx.industry} organizations that need ${ctx.primaryBenefit.toLowerCase()}`,
                sam: `${ctx.marketSegment} teams willing to adopt a focused ${ctx.productType.toLowerCase()}`,
                som: `${ctx.marketSegment} buyers reachable within the current ${ctx.timeline} plan`,
                methodology: `Bottom-up demand model anchored on ${ctx.primaryPain.toLowerCase()}`,
                sources: [
                    `${ctx.industry} budget trends`,
                    `${ctx.marketSegment} workflow pain patterns`,
                    "Competitor positioning and customer reviews",
                ],
            },
            trends: [
                {
                    trend: `${ctx.industry} workflow consolidation`,
                    impact: "High",
                    timeline: ctx.timeline,
                    description: `Buyers want fewer tools with faster proof of ${ctx.primaryBenefit.toLowerCase()}.`,
                },
                {
                    trend: ctx.audience === "B2B" ? "Self-serve evaluation before sales contact" : "Instant onboarding expectations",
                    impact: "High",
                    timeline: "Next 2 quarters",
                    description: `${ctx.primaryRole} expects to validate value before deep commitment.`,
                },
                {
                    trend: `Operational visibility around ${ctx.primaryFeature.toLowerCase()}`,
                    impact: "Medium",
                    timeline: "Ongoing",
                    description: "Products that surface measurable outcomes are winning trust faster.",
                },
            ],
            competitors: {
                directCompetitors: ctx.competitors.filter((competitor) => competitor.type !== "indirect"),
                indirectCompetitors: ctx.competitors.filter((competitor) => competitor.type === "indirect"),
                marketShare: ctx.competitors.length > 2
                    ? "Fragmented market with room for differentiated execution"
                    : "Concentrated alternatives with a clear gap for focused positioning",
                positioning: `${ctx.productName} can win by focusing on ${ctx.primaryBenefit.toLowerCase()} for ${ctx.marketSegment.toLowerCase()}.`,
            },
            opportunities,
            threats: risks,
            customerNeeds: {
                painPoints: ctx.pains,
                gains: ctx.gains,
                jobsToBeDone: uniqueStrings([
                    ...ctx.goals,
                    `Adopt ${ctx.primaryFeature.toLowerCase()} without long setup`,
                    `Prove ROI from ${ctx.productName} quickly`,
                ]),
            },
        },
        insights: [
            `${ctx.marketSegment} buyers are most likely to switch when they see a faster path to ${ctx.primaryBenefit.toLowerCase()}.`,
            `Competitive pressure is strongest around broad feature coverage, not focused execution for ${ctx.primaryRole.toLowerCase()}.`,
            `Market traction will depend on whether ${ctx.productName} feels lower-risk than manual or suite-based alternatives.`,
        ],
        recommendations: [
            `Prioritize messaging that quantifies the cost of ${ctx.primaryPain.toLowerCase()}.`,
            `Track competitor claims around ${ctx.primaryFeature.toLowerCase()} and answer them with clearer proof.`,
            `Use customer research to validate which ${ctx.marketSegment.toLowerCase()} segment converts fastest.`,
        ],
        risks,
        opportunities,
        timestamp: new Date().toISOString(),
    };
}
function buildGTMStrategyResult(ctx) {
    const channelPrimary = ctx.audience === "B2B"
        ? ["Founder-led sales", "Case-study content", "Partner introductions"]
        : ["Product-led onboarding", "Creator content", "Community distribution"];
    const channelSecondary = ctx.audience === "B2B"
        ? ["Webinars", "Account-based outreach"]
        : ["Referral program", "Lifecycle email"];
    const split = splitTimeline(ctx.timeline);
    const pricingTiers = ctx.businessModel.toLowerCase().includes("usage")
        ? [
            { name: "Base", price: "$0 setup + usage", features: ["Core workflow", "Usage tracking"] },
            { name: "Scale", price: "Usage + platform fee", features: ["Team controls", "Advanced reporting"] },
        ]
        : [
            { name: "Starter", price: "$29/month", features: [ctx.primaryFeature, "Core onboarding"] },
            { name: "Growth", price: "$99/month", features: ["Team workflows", "Advanced analytics"] },
            { name: "Scale", price: "Custom", features: ["Security controls", "Implementation support"] },
        ];
    const budgetAllocation = ctx.audience === "B2B"
        ? { marketing: "30%", sales: "35%", product: "25%", operations: "10%" }
        : { marketing: "45%", growth: "25%", product: "20%", operations: "10%" };
    return {
        strategy: {
            positioning: {
                statement: `For ${ctx.marketSegment} teams that need to solve ${ctx.primaryPain.toLowerCase()}, ${ctx.productName} is a ${ctx.productType.toLowerCase()} that delivers ${ctx.primaryBenefit.toLowerCase()}.`,
                differentiation: `Focused execution for ${ctx.primaryRole.toLowerCase()} instead of broad but slower suites.`,
                valueProposition: `${ctx.productName} helps teams reach ${ctx.primaryGain.toLowerCase()} with less friction.`,
                messaging: `Lead with the cost of ${ctx.primaryPain.toLowerCase()}, prove ${ctx.primaryBenefit.toLowerCase()}, then show the expansion path.`,
            },
            pricing: {
                model: ctx.businessModel,
                tiers: pricingTiers,
                strategy: `Price against measurable value from ${ctx.primaryFeature.toLowerCase()} adoption.`,
                revenue: `Use ${ctx.businessModel.toLowerCase()} expansion to grow after activation is proven.`,
            },
            channels: {
                primary: channelPrimary,
                secondary: channelSecondary,
                channels: channelPrimary.map((name, index) => ({
                    name,
                    cost: index === 0 ? "Medium" : "Low",
                    reach: ctx.audience === "B2B" ? "Focused" : "Scalable",
                    conversion: index === 0 ? "High" : "Medium",
                })),
            },
            launch: {
                phases: [
                    { phase: "Pre-launch", duration: split.preparation, activities: ["Message testing", "Design partner validation"] },
                    { phase: "Launch", duration: split.launch, activities: ["Public release", "Sales and support enablement"] },
                    { phase: "Expansion", duration: split.growth, activities: ["Retention optimization", "Channel scaling"] },
                ],
                activities: `Sequence launch around fast proof of ${ctx.primaryBenefit.toLowerCase()}.`,
                success: `Hit activation and pipeline goals before broadening spend.`,
            },
            sales: {
                approach: ctx.audience === "B2B" ? "Product-led growth with sales assist for expansion" : "Self-serve conversion with lifecycle nudges",
                team: ctx.audience === "B2B" ? "Founder/AE + customer success loop" : "Growth + lifecycle marketing loop",
                process: `Qualify around ${ctx.primaryPain.toLowerCase()}, close on measurable outcomes, expand on adoption.`,
                tools: "CRM, lifecycle automation, and product analytics",
            },
            marketing: {
                awareness: uniqueStrings([
                    `${ctx.primaryPain} problem framing`,
                    "Case studies",
                    "Thoughtful product education",
                ]),
                consideration: uniqueStrings([
                    "Interactive demo",
                    `${ctx.primaryFeature} proof`,
                    "Customer references",
                ]),
                conversion: uniqueStrings([
                    "Free trial",
                    "ROI proof",
                    ctx.audience === "B2B" ? "Sales-assisted close" : "In-product upgrade prompt",
                ]),
                retention: uniqueStrings([
                    "Customer success onboarding",
                    "Lifecycle education",
                    "Expansion playbooks",
                ]),
            },
        },
        insights: [
            `${ctx.productName} should launch with a narrow message tied to ${ctx.primaryBenefit.toLowerCase()}.`,
            `${ctx.audience} go-to-market will work best when qualification starts with ${ctx.primaryPain.toLowerCase()}.`,
            `Budget should scale only after the team proves repeatable conversion inside the first ${ctx.timeline}.`,
        ],
        recommendations: [
            "Test positioning with a small number of design partners before broader spend.",
            `Anchor pricing to visible value from ${ctx.primaryFeature.toLowerCase()}.`,
            "Treat activation metrics as the gate before expanding channels.",
        ],
        timeline: {
            totalDuration: ctx.timeline,
            phases: {
                preparation: split.preparation,
                launch: split.launch,
                growth: split.growth,
            },
            milestones: uniqueStrings([
                "Validated positioning",
                "First activated cohort",
                "Repeatable conversion motion",
            ]),
        },
        budget: {
            total: ctx.budget,
            allocation: budgetAllocation,
        },
        kpis: {
            acquisition: uniqueStrings(["qualified_pipeline", "signup_rate", "cost_per_qualified_user"], 3),
            revenue: uniqueStrings(["mrr", "arr", "net_revenue_retention"], 3),
            engagement: uniqueStrings(["activation_rate", "retention_rate", "feature_adoption"], 3),
            brand: uniqueStrings(["share_of_voice", "demo_requests", "case_study_pull_through"], 3),
        },
        timestamp: new Date().toISOString(),
    };
}
function roleDefaults(role, ctx) {
    const normalizedRole = role.toLowerCase();
    if (normalizedRole.includes("manager") || normalizedRole.includes("lead")) {
        return {
            goals: uniqueStrings([ctx.primaryGoal, "Increase team throughput", "Reduce coordination drag"], 3),
            painPoints: uniqueStrings([ctx.primaryPain, "Poor visibility into progress", "Hard to prove ROI"], 3),
            behaviors: ["Uses dashboards", "Shares decisions across the team", "Needs stakeholder proof"],
            needs: uniqueStrings([ctx.primaryBenefit, "Clear reporting", "Simple rollout"], 3),
        };
    }
    if (normalizedRole.includes("developer") || normalizedRole.includes("engineer")) {
        return {
            goals: uniqueStrings([ctx.primaryGoal, "Ship reliably", "Reduce manual steps"], 3),
            painPoints: uniqueStrings([ctx.primaryPain, "Tool sprawl", "Interruptions during delivery"], 3),
            behaviors: ["Prefers automation", "Validates details independently", "Dislikes vague workflows"],
            needs: uniqueStrings(["Low-friction setup", ctx.primaryFeature, "Clear technical documentation"], 3),
        };
    }
    return {
        goals: uniqueStrings([ctx.primaryGoal, `Achieve ${ctx.primaryBenefit.toLowerCase()}`], 3),
        painPoints: uniqueStrings([ctx.primaryPain, "Too many steps before value"], 3),
        behaviors: ["Learns by doing", "Values clarity", "Needs visible progress"],
        needs: uniqueStrings([ctx.primaryBenefit, "Fast onboarding", "Trust signals"], 3),
    };
}
function buildUserPersonasResult(ctx) {
    const personas = ctx.userRoles.map((role) => {
        const defaults = roleDefaults(role, ctx);
        return {
            name: `${titleCase(role)} Champion`,
            role: titleCase(role),
            demographics: {
                company: ctx.companySize,
                industry: ctx.industry,
                experience: ctx.productStage === "MVP" ? "Early adopter mindset" : "Process-oriented operator",
            },
            goals: defaults.goals,
            painPoints: defaults.painPoints,
            behaviors: defaults.behaviors,
            needs: defaults.needs,
            researchBasis: `${ctx.researchVolume || 1} research signal(s) informing this persona`,
        };
    });
    const journeys = personas.map((persona) => ({
        persona: persona.name,
        stages: [
            {
                stage: "Awareness",
                actions: [
                    `Recognizes the cost of ${ctx.primaryPain.toLowerCase()}`,
                    `Looks for a faster path to ${ctx.primaryBenefit.toLowerCase()}`,
                ],
                emotions: ["Frustrated", "Hopeful"],
                touchpoints: ["Search", "Peer referral", "Thought leadership"],
            },
            {
                stage: "Evaluation",
                actions: [
                    `Tests whether ${ctx.productName} fits ${persona.role.toLowerCase()} workflows`,
                    "Compares against existing tools or manual process",
                ],
                emotions: ["Curious", "Skeptical"],
                touchpoints: ["Product demo", "Case study", "Trial environment"],
            },
            {
                stage: "Adoption",
                actions: [
                    "Rolls out the first use case",
                    "Measures visible gains",
                    "Invites or proves value to stakeholders",
                ],
                emotions: ["Confident", "Relieved"],
                touchpoints: ["Onboarding", "Support", "Success review"],
            },
        ],
    }));
    return {
        personas,
        journeys,
        insights: [
            `${ctx.userRoles.length} distinct persona lens(es) matter for ${ctx.productName}.`,
            `${ctx.primaryRole} will buy or adopt faster when messaging starts with ${ctx.primaryPain.toLowerCase()}.`,
            `Persona design should reflect the ${ctx.timeline} adoption window and ${ctx.productStage} maturity.`,
        ],
        recommendations: [
            `Design the onboarding path around ${ctx.primaryRole.toLowerCase()} first.`,
            "Use persona-specific proof points in lifecycle messaging.",
            "Validate persona assumptions continuously with interviews and product usage data.",
        ],
        timestamp: new Date().toISOString(),
    };
}
function buildCompetitiveAnalysisResult(ctx) {
    const directCompetitors = ctx.competitors.filter((competitor) => competitor.type !== "indirect");
    const productStrengths = uniqueStrings([
        `Focused on ${ctx.primaryBenefit.toLowerCase()}`,
        `Simpler adoption path for ${ctx.primaryRole.toLowerCase()}`,
        ctx.primaryFeature,
    ]);
    const productWeaknesses = uniqueStrings([
        ctx.productStage === "MVP"
            ? "Smaller reference base than incumbents"
            : "Execution discipline must stay ahead of broader suites",
        "Limited room for vague positioning",
        `Can be compared against manual alternatives if ${ctx.primaryBenefit.toLowerCase()} is not obvious`,
    ]);
    return {
        analysis: {
            directCompetitors: directCompetitors.map((competitor) => ({
                name: competitor.name,
                product: competitor.positioning,
                strengths: uniqueStrings([
                    ...competitor.features,
                    competitor.type === "direct" ? "Known brand presence" : "Low switching friction",
                ], 3),
                weaknesses: uniqueStrings([
                    `Less focused on ${ctx.primaryRole.toLowerCase()}`,
                    `Harder to prove ${ctx.primaryBenefit.toLowerCase()} quickly`,
                ], 3),
                marketShare: competitor.type === "direct" ? "Meaningful" : "Diffuse",
                pricing: competitor.type === "direct" ? "Bundle or enterprise pricing" : "Low explicit cost",
            })),
            indirectCompetitors: ctx.competitors
                .filter((competitor) => competitor.type === "indirect")
                .map((competitor) => ({
                name: competitor.name,
                type: competitor.type,
                threat: "Medium",
                description: competitor.positioning,
            })),
            positioning: {
                position: `${ctx.productName} should own the focused category around ${ctx.primaryFeature.toLowerCase()}.`,
                differentiation: `Deliver ${ctx.primaryBenefit.toLowerCase()} faster than broader alternatives.`,
                advantages: productStrengths,
                disadvantages: productWeaknesses,
            },
            strengths: productStrengths,
            weaknesses: productWeaknesses,
            opportunities: uniqueStrings([
                `Exploit gaps where competitors under-serve ${ctx.marketSegment.toLowerCase()} teams.`,
                `Use faster onboarding as a wedge against slower suite deployment.`,
                `Win on proof of ${ctx.primaryBenefit.toLowerCase()} rather than raw feature count.`,
            ]),
            threats: uniqueStrings([
                "Incumbents may copy a narrow wedge once traction appears.",
                "Price competition can increase if positioning becomes generic.",
                "Manual or in-house workflows can slow category adoption.",
            ]),
        },
        insights: [
            `Competitive advantage will come from clarity and speed around ${ctx.primaryBenefit.toLowerCase()}.`,
            `${ctx.productName} should avoid fighting incumbents on breadth before it wins on focused value.`,
            `${ctx.primaryRole} is the buyer most likely to notice the difference between focused execution and generic feature volume.`,
        ],
        recommendations: [
            "Document a competitor-by-competitor rebuttal for the top buying objections.",
            `Show how ${ctx.productName} reduces the time between signup and ${ctx.primaryGain.toLowerCase()}.`,
            "Use customer proof to defend against bundle and price pressure.",
        ],
        timestamp: new Date().toISOString(),
    };
}
function buildValuePropositionResult(ctx) {
    return {
        analysis: {
            customerJobs: uniqueStrings([
                ...ctx.goals,
                `Reach ${ctx.primaryBenefit.toLowerCase()} without heavy process change`,
            ]),
            pains: ctx.pains,
            gains: ctx.gains,
            products: {
                painRelievers: uniqueStrings([
                    `Automates or simplifies ${ctx.primaryFeature.toLowerCase()}`,
                    `Removes friction around ${ctx.primaryPain.toLowerCase()}`,
                    "Makes progress visible to stakeholders",
                ]),
                gainCreators: uniqueStrings([
                    ctx.primaryBenefit,
                    ctx.primaryGain,
                    "Shorter time-to-value",
                ]),
            },
            valueProposition: {
                headline: `${ctx.productName} helps ${ctx.primaryRole.toLowerCase()} teams achieve ${ctx.primaryBenefit.toLowerCase()}.`,
                subheading: `Replace ${ctx.primaryPain.toLowerCase()} with a clearer path to ${ctx.primaryGain.toLowerCase()}.`,
                benefits: uniqueStrings([
                    ...ctx.benefits,
                    "Faster adoption across the buying team",
                    "Clearer proof of impact",
                ], 4),
                features: ctx.features.slice(0, 4),
            },
            validation: {
                methods: ctx.researchVolume > 0
                    ? ["Customer interviews", "Usage review", "Message testing"]
                    : ["Discovery interviews", "Landing page tests", "Prototype demos"],
                metrics: uniqueStrings(["message_resonance", "activation_rate", "sales_cycle_length"], 3),
                timeline: ctx.timeline,
            },
        },
        insights: [
            `The strongest value proposition starts with the cost of ${ctx.primaryPain.toLowerCase()}.`,
            `${ctx.primaryRole} will adopt faster when ${ctx.productName} feels easier to trust than incumbent options.`,
            `Benefits should be framed as measurable progress toward ${ctx.primaryGoal.toLowerCase()}.`,
        ],
        recommendations: [
            "Lead with the problem and quantified gain before feature detail.",
            `Use ${ctx.primaryFeature.toLowerCase()} as the proof mechanism for the broader promise.`,
            "Validate message resonance with both buyers and end users before scaling spend.",
        ],
        timestamp: new Date().toISOString(),
    };
}
function buildRoadmapInitiatives(ctx) {
    return [
        {
            name: `Accelerate ${ctx.primaryFeature}`,
            priority: "High",
            impact: `Make ${ctx.primaryBenefit.toLowerCase()} easier to realize`,
            effort: "Medium",
            timeline: "Quarter 1",
        },
        {
            name: `Deepen retention around ${ctx.primaryRole}`,
            priority: "High",
            impact: "Improve repeat engagement and expansion readiness",
            effort: "Medium",
            timeline: "Quarter 2",
        },
        {
            name: "Instrument proof and reporting",
            priority: "Medium",
            impact: "Give the team stronger ROI evidence for growth and sales",
            effort: "Low",
            timeline: "Quarter 3",
        },
    ];
}
function buildProductRoadmapResult(ctx) {
    const initiatives = buildRoadmapInitiatives(ctx);
    const nowFeatures = uniqueStrings([ctx.primaryFeature, ctx.features[1] ?? "", "activation instrumentation"], 3);
    const nextFeatures = uniqueStrings(["retention playbooks", "team expansion workflow", ctx.features[2] ?? ""], 3);
    const laterFeatures = uniqueStrings(["advanced reporting", "predictive insights", "ecosystem integrations"], 3);
    return {
        roadmap: {
            vision: {
                statement: ctx.vision,
                timeline: ctx.timeline,
                impact: `Create a durable position in ${ctx.industry.toLowerCase()} by owning ${ctx.primaryBenefit.toLowerCase()}.`,
                metrics: uniqueStrings(["activation_rate", "retention_rate", "net_revenue_retention"], 3),
            },
            strategy: {
                approach: `${ctx.productStage} roadmap focused on adoption before breadth.`,
                focus: `Win the wedge around ${ctx.primaryFeature.toLowerCase()} and expand from there.`,
                differentiation: `Stay easier to adopt for ${ctx.primaryRole.toLowerCase()} than broader competitors.`,
                markets: uniqueStrings([ctx.marketSegment, `${ctx.marketSegment} adjacent buyers`], 2),
            },
            initiatives,
            features: {
                now: nowFeatures.map((feature) => ({ feature, priority: "High" })),
                next: nextFeatures.map((feature) => ({ feature, priority: "Medium" })),
                later: laterFeatures.map((feature) => ({ feature, priority: "Low" })),
            },
            timeline: {
                quarters: {
                    "Quarter 1": nowFeatures,
                    "Quarter 2": nextFeatures,
                    "Quarter 3": laterFeatures,
                },
                resources: `${ctx.resourcesTeamSize ?? "Current"} team focused on the adoption-critical path`,
                milestones: uniqueStrings([
                    "Core activation flow improved",
                    "Retention motion validated",
                    "Expansion-ready reporting shipped",
                ], 3),
            },
            dependencies: uniqueStrings([
                `${initiatives[1].name} depends on stable activation data from Quarter 1`,
                "Proof and reporting depends on consistent event instrumentation",
                "Expansion workflow depends on strong early retention signals",
            ]),
            risks: uniqueStrings([
                `${ctx.productStage} teams can overbuild before activation is stable`,
                "Competing roadmap bets can blur the wedge position",
                "Resource limits can slow retention and instrumentation work",
            ]),
        },
        insights: [
            "Roadmap quality will depend on sequencing adoption work before expansion work.",
            `${ctx.primaryFeature} is the right wedge if it proves ${ctx.primaryBenefit.toLowerCase()} quickly.`,
            "Instrumentation is not optional because it defends both growth and pricing strategy.",
        ],
        recommendations: [
            "Protect Quarter 1 from scope creep outside the activation-critical path.",
            "Use roadmap reviews to decide whether retention or expansion needs the next investment.",
            "Treat reporting as a strategic capability, not a cleanup task.",
        ],
        kpis: {
            product: uniqueStrings(["feature_adoption", "time_to_value", "user_satisfaction"], 3),
            business: uniqueStrings(["pipeline_conversion", "retention_rate", "revenue_growth"], 3),
            development: uniqueStrings(["delivery_predictability", "quality_score", "instrumentation_coverage"], 3),
        },
        timestamp: new Date().toISOString(),
    };
}
function buildMetricsDefinitionResult(ctx) {
    const primaryKpis = buildPrimaryKpis(ctx);
    const secondaryKpis = uniqueStrings([
        "feature_adoption_rate",
        "customer_satisfaction",
        "expansion_pipeline",
    ], 3).map((metric) => ({
        metric,
        target: metric === "customer_satisfaction" ? "4.5/5" : "Improve quarter over quarter",
        timeframe: "quarterly",
    }));
    return {
        metrics: {
            productMetrics: {
                acquisition: uniqueStrings(["qualified_signups", "activation_rate", "time_to_value"], 3),
                engagement: uniqueStrings(["weekly_active_accounts", "feature_adoption", "workflow_completion"], 3),
                retention: uniqueStrings(["logo_retention_rate", "churn_rate", "resurrection_rate"], 3),
                satisfaction: uniqueStrings(["nps", "csat", "support_resolution_time"], 3),
            },
            businessMetrics: {
                revenue: uniqueStrings(["mrr", "arr", "net_revenue_retention"], 3),
                profitability: uniqueStrings(["gross_margin", "payback_period", "unit_economics"], 3),
                efficiency: uniqueStrings(["cac", "ltv", "sales_cycle_length"], 3),
                market: uniqueStrings(["win_rate", "segment_penetration", "competitive_displacement"], 3),
            },
            userMetrics: {
                behavior: uniqueStrings(["journey_completion", "collaboration_depth", "repeat_usage"], 3),
                outcomes: uniqueStrings([
                    toSentenceKey(ctx.primaryBenefit),
                    "time_saved",
                    "error_reduction",
                ], 3),
                satisfaction: uniqueStrings(["task_success_rate", "user_effort_score", "product_confidence"], 3),
            },
            technicalMetrics: {
                performance: uniqueStrings(["load_time", "uptime", "workflow_latency"], 3),
                quality: uniqueStrings(["bug_rate", "test_coverage", "release_regressions"], 3),
                scalability: uniqueStrings(["concurrent_accounts", "event_volume", "response_time"], 3),
                security: uniqueStrings(["vulnerabilities", "incident_count", "compliance_readiness"], 3),
            },
            kpis: {
                primary: primaryKpis,
                secondary: secondaryKpis,
            },
            reporting: {
                dashboards: [
                    { name: "Executive Dashboard", audience: "Leadership", metrics: ["mrr", "retention_rate", "win_rate"] },
                    { name: "Product Dashboard", audience: "Product Team", metrics: ["activation_rate", "feature_adoption", "time_to_value"] },
                    { name: "Growth Dashboard", audience: "Growth Team", metrics: ["qualified_signups", "conversion_rate", "cac"] },
                ],
                frequency: {
                    real_time: ["system_status", "activation_events"],
                    daily: ["signups", "pipeline_creation"],
                    weekly: ["retention", "feature_adoption"],
                    monthly: ["revenue_growth", "segment_penetration"],
                },
                alerts: [
                    { metric: "activation_rate", threshold: "<30%", action: "review onboarding immediately" },
                    { metric: "logo_retention_rate", threshold: "<80%", action: "start retention diagnosis" },
                ],
            },
        },
        insights: [
            `Metrics should prove whether ${ctx.productName} is delivering ${ctx.primaryBenefit.toLowerCase()}.`,
            "Activation and retention deserve equal attention before scaling acquisition aggressively.",
            `Stakeholders need a shared scorecard for ${ctx.timeline} execution, not isolated vanity metrics.`,
        ],
        recommendations: [
            "Instrument the activation path before expanding the dashboard surface.",
            "Map each primary KPI to a single owner and review cadence.",
            "Use outcome metrics to defend pricing and roadmap decisions.",
        ],
        implementation: {
            phases: [
                { phase: "Instrumentation", duration: "2 weeks", deliverables: ["Event taxonomy", "Activation tracking"] },
                { phase: "Dashboarding", duration: "2 weeks", deliverables: ["Executive dashboard", "Product dashboard"] },
                { phase: "Operating Rhythm", duration: "2 weeks", deliverables: ["Metric review cadence", "Alert ownership"] },
            ],
            tools: ["Analytics platform", "Dashboard tool", "Alert routing"],
            governance: `Assign owners across product, growth, and leadership for ${ctx.productName}.`,
        },
        timestamp: new Date().toISOString(),
    };
}
class GrowthLoopsSkill {
    description = "Design and analyze sustainable growth loops for your product";
    category = "growth";
    async execute(input) {
        return buildGrowthLoopsResult(buildSkillContext(input));
    }
}
class MarketResearchSkill {
    description = "Conduct comprehensive market research and analysis";
    category = "research";
    async execute(input) {
        return buildMarketResearchResult(buildSkillContext(input));
    }
}
class GTMStrategySkill {
    description = "Develop go-to-market strategy and execution plan";
    category = "strategy";
    async execute(input) {
        return buildGTMStrategyResult(buildSkillContext(input));
    }
}
class UserPersonasSkill {
    description = "Create detailed user personas and journey maps";
    category = "users";
    async execute(input) {
        return buildUserPersonasResult(buildSkillContext(input));
    }
}
class CompetitiveAnalysisSkill {
    description = "Analyze competitors and competitive positioning";
    category = "competition";
    async execute(input) {
        return buildCompetitiveAnalysisResult(buildSkillContext(input));
    }
}
class ValuePropositionSkill {
    description = "Define and refine value proposition";
    category = "value";
    async execute(input) {
        return buildValuePropositionResult(buildSkillContext(input));
    }
}
class ProductRoadmapSkill {
    description = "Create strategic product roadmap";
    category = "planning";
    async execute(input) {
        return buildProductRoadmapResult(buildSkillContext(input));
    }
}
class MetricsDefinitionSkill {
    description = "Define comprehensive product and business metrics";
    category = "metrics";
    async execute(input) {
        return buildMetricsDefinitionResult(buildSkillContext(input));
    }
}
export default class PMSkills {
    options;
    skills;
    constructor(options = {}) {
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
    async executeSkill(skillName, input) {
        if (!this.isSkillName(skillName)) {
            throw new Error(`Unknown skill: ${skillName}. Available skills: ${Object.keys(this.skills).join(", ")}`);
        }
        await this.ensureWorkspace();
        this.log(`🎯 Executing PM skill: ${skillName}`);
        const result = await this.skills[skillName].execute(input);
        const savedTo = await this.saveResult(skillName, result);
        this.log(`✅ Skill ${skillName} completed. Result saved to: ${savedTo}`);
        return { ...result, savedTo };
    }
    getAvailableSkills() {
        return Object.entries(this.skills).map(([name, skill]) => ({
            name,
            description: skill.description,
            category: skill.category,
        }));
    }
    async runProductAnalysis(productInfo) {
        this.log(`🚀 Running comprehensive product analysis`);
        const results = {};
        const skillOrder = [
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
            }
            catch (error) {
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
    generateAnalysisSummary(results) {
        const summary = {
            totalSkills: Object.keys(results).length,
            completedSkills: Object.values(results).filter((r) => !("error" in r)).length,
            keyInsights: [],
            recommendations: [],
            risks: [],
            opportunities: [],
        };
        for (const result of Object.values(results)) {
            if ("error" in result)
                continue;
            const insights = asArray(result.insights);
            if (insights)
                summary.keyInsights.push(...insights);
            const recommendations = asArray(result.recommendations);
            if (recommendations)
                summary.recommendations.push(...recommendations);
            const risks = asArray(result.risks);
            if (risks)
                summary.risks.push(...risks);
            const opportunities = asArray(result.opportunities);
            if (opportunities)
                summary.opportunities.push(...opportunities);
        }
        summary.keyInsights = uniqueStrings(summary.keyInsights, 12);
        summary.recommendations = uniqueStrings(summary.recommendations, 12);
        summary.risks = uniqueStrings(summary.risks, 12);
        summary.opportunities = uniqueStrings(summary.opportunities, 12);
        return summary;
    }
    async saveResult(skillName, result) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `${skillName}_${timestamp}.json`;
        const filepath = join(this.options.workspace, filename);
        await writeFile(filepath, JSON.stringify(result, null, 2));
        return filepath;
    }
    async saveComprehensiveAnalysis(results, summary) {
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
    async ensureWorkspace() {
        try {
            await mkdir(this.options.workspace, { recursive: true });
        }
        catch {
            // Directory may already exist.
        }
    }
    log(message) {
        if (this.options.verbose) {
            console.log(`[PM-Skills] ${message}`);
        }
    }
    isSkillName(value) {
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
            const mockInput = { product: "Sample Product", market: "Technology" };
            pmSkills
                .executeSkill(skillName, mockInput)
                .then((result) => {
                console.log(`✅ Skill ${skillName} completed successfully`);
                console.log(`📁 Result saved to: ${result.savedTo}`);
            })
                .catch((error) => {
                console.error(`❌ Error: ${getErrorMessage(error)}`);
                process.exit(1);
            });
            break;
        }
        case "analyze": {
            const mockProductInfo = {
                product: "Sample Product",
                industry: "Technology",
                targetMarket: "SMB",
            };
            pmSkills
                .runProductAnalysis(mockProductInfo)
                .then((result) => {
                console.log(`🎉 Product analysis completed`);
                console.log(`📁 Results saved to: ${result.savedTo}`);
                console.log(`📊 Summary: ${result.summary.completedSkills}/${result.summary.totalSkills} skills completed`);
            })
                .catch((error) => {
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
