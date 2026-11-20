/**
 * COM-001 — Commercial Pathway Engine regression tests.
 *
 * Covers the four specification scenarios:
 * - A: automation opportunity → Primary Workflow Automation + supporting
 *      Workflow Optimisation; paid next step = Automation Opportunity
 *      Assessment.
 * - B: AI opportunity with a critical governance gate → required-before
 *      proceeding = AI Governance Diagnostic; paid next step gated.
 * - C: weak workflow maturity → Primary Workflow Optimisation; paid =
 *      Workflow Diagnostic (NOT automation first).
 * - D: adoption problem → Primary People & Capability; paid = AI Adoption
 *      Readiness Assessment.
 */
import { describe, expect, it } from "vitest";
import { buildPathwayResult } from "@shared/pulse/pathwayEngine";
import type {
  ConfigCommercial,
  ConfigCommercialRouteReason,
  PulseMethodConfig,
  PulseResult,
} from "@shared/pulse/configTypes";

/** Minimal route definitions mirroring the live v1.0.0 config triggers. */
function baseRoutes() {
  return [
    {
      route_id: "workflow-optimisation",
      label: "Workflow Optimisation",
      trigger_expression: "O-06 >= 2 OR (P-01 <= 1) OR (P-02 <= 1)",
      priority: 1 as const,
      conflict_rule: "Gates first; then highest qualifying opportunity score.",
    },
    {
      route_id: "workflow-automation",
      label: "Workflow Automation",
      trigger_expression: "O-01 >= 2 OR O-02 >= 2",
      priority: 2 as const,
      conflict_rule: "Gates first; then highest qualifying opportunity score.",
    },
    {
      route_id: "ai-enabled-workflow",
      label: "AI-Enabled Workflow Solution",
      trigger_expression: "O-03 >= 2",
      priority: 2 as const,
      conflict_rule: "Gates first; then highest qualifying opportunity score.",
    },
    {
      route_id: "ai-governance-adoption",
      label: "AI Governance & Adoption",
      trigger_expression: "O-04 >= 2 OR GATE-03 OR G-01 <= 1 OR G-02 <= 1",
      priority: 1 as const,
      conflict_rule: "Gates first; then highest qualifying opportunity score.",
    },
    {
      route_id: "people-capability",
      label: "People & Capability",
      trigger_expression:
        "(PE-01 <= 1 OR PE-02 <= 1) AND (O-01 <= 1 AND O-02 <= 1 AND O-03 <= 1)",
      priority: 2 as const,
      conflict_rule: "Gates first; then highest qualifying opportunity score.",
    },
    {
      route_id: "foundation-work",
      label: "Foundation Work",
      trigger_expression:
        "overall_score < 30 OR (S-01 <= 1 AND S-02 <= 1 AND D-01 <= 1)",
      priority: 1 as const,
      conflict_rule: "Gates first; then highest qualifying opportunity score.",
    },
  ];
}

function baseGates() {
  return [
    {
      gate_id: "GATE-01",
      trigger_expression: "S-02 == 0",
      effect: "cap-emerging" as const,
      risk_text: "No named sponsor or accountable owner",
      required_action:
        "Name an accountable owner with authority before active implementation recommendation",
    },
    {
      gate_id: "GATE-03",
      trigger_expression: "(T-03 == 0 OR G-01 == 0) AND AI-USE",
      effect: "high-governance-risk" as const,
      risk_text: "Sensitive data may enter unapproved AI tools",
      required_action:
        "Establish approved AI use and controls before deployment work",
      condition: "AI-USE",
    },
  ];
}

function baseReasons(): ConfigCommercialRouteReason[] {
  return [
    {
      route_id: "workflow-automation",
      label: "Workflow Automation",
      reasons: [
        {
          reason_code_id: "RC-AUTO-O01",
          bound_clause: "O-01 >= 2",
          why_text: "a recurring manual handoff that a redesign could address",
          meaning_text:
            "A structured automation opportunity assessment would confirm suitability and controls.",
        },
        {
          reason_code_id: "RC-AUTO-O02",
          bound_clause: "O-02 >= 2",
          why_text: "repeatable tasks consuming staff time each week",
          meaning_text:
            "Automation may reduce that consumption; suitability must be assessed first.",
        },
      ],
    },
    {
      route_id: "workflow-optimisation",
      label: "Workflow Optimisation",
      reasons: [
        {
          reason_code_id: "RC-WF-O06",
          bound_clause: "O-06 >= 2",
          why_text: "visible delays or rework in core processes",
          meaning_text:
            "A workflow diagnostic would map current state and locate the waste.",
        },
      ],
    },
    {
      route_id: "ai-enabled-workflow",
      label: "AI-Enabled Workflow Solution",
      reasons: [
        {
          reason_code_id: "RC-AI-O03",
          bound_clause: "O-03 >= 2",
          why_text: "a decision or analysis step that could benefit from AI",
          meaning_text:
            "An AI use-case assessment would test value, data needs and controls.",
        },
      ],
    },
    {
      route_id: "ai-governance-adoption",
      label: "AI Governance & Adoption",
      reasons: [
        {
          reason_code_id: "RC-GOV-G03",
          bound_clause: "GATE-03",
          why_text: "a governance gap around AI use",
          meaning_text:
            "A governance diagnostic should resolve the gap before wider deployment.",
        },
      ],
    },
    {
      route_id: "people-capability",
      label: "People & Capability",
      reasons: [
        {
          reason_code_id: "RC-PE-PE01",
          bound_clause: "PE-01 <= 1",
          why_text: "capability or adoption uncertainty among staff",
          meaning_text:
            "An adoption readiness assessment would locate the gaps.",
        },
      ],
    },
    {
      route_id: "foundation-work",
      label: "Foundation Work",
      reasons: [
        {
          reason_code_id: "RC-FND-S1D1",
          bound_clause: "S-01 <= 1 AND S-02 <= 1 AND D-01 <= 1",
          why_text: "several foundational elements that need strengthening",
          meaning_text:
            "Foundation work should come before technology-led initiatives.",
        },
      ],
    },
  ];
}

const CATALOGUE: ConfigCommercial = {
  products: [
    {
      product_id: "srv-workflow-diagnostic",
      product_name: "Workflow Diagnostic",
      product_tagline: "Current-state mapping and constraint analysis",
      pathway_id: "workflow-optimisation",
      gate_ids: [],
      examine: ["Current-state process mapping"],
      receive: ["Baseline report with prioritised failure points"],
      duration_display: "5–7 working days",
      fee_naira: null,
      payment_mode: "request_scope",
      terms_version: "v1",
      active: true,
      subsequent_pathway_id: "workflow-automation",
    },
    {
      product_id: "srv-automation-opportunity-assessment",
      product_name: "Automation Opportunity Assessment",
      product_tagline: "Suitability and initial business case for automation",
      pathway_id: "workflow-automation",
      gate_ids: [],
      examine: ["Task-level automation suitability"],
      receive: ["Opportunity assessment with initial business case"],
      duration_display: "7–10 working days",
      fee_naira: null,
      payment_mode: "request_invoice",
      terms_version: "v1",
      active: true,
      subsequent_pathway_id: "ai-enabled-workflow",
    },
    {
      product_id: "srv-ai-use-case-assessment",
      product_name: "AI Use-Case Assessment",
      product_tagline: "Business case, data requirements and controls",
      pathway_id: "ai-enabled-workflow",
      gate_ids: [],
      examine: ["Use-case value and data requirements"],
      receive: ["Use-case assessment with risk and controls review"],
      duration_display: "10–14 working days",
      fee_naira: null,
      payment_mode: "request_scope",
      terms_version: "v1",
      active: true,
      subsequent_pathway_id: "ai-governance-adoption",
    },
    {
      product_id: "srv-ai-governance-diagnostic",
      product_name: "AI Governance Diagnostic",
      product_tagline: "Policy gaps, risk priorities and direction",
      pathway_id: "ai-governance-adoption",
      gate_ids: ["GATE-03", "GATE-04"],
      examine: ["Governance gaps and risk priorities"],
      receive: ["Governance diagnostic with policy direction and next actions"],
      duration_display: "5–7 working days",
      fee_naira: null,
      payment_mode: "request_invoice",
      terms_version: "v1",
      active: true,
      subsequent_pathway_id: "ai-enabled-workflow",
    },
    {
      product_id: "srv-ai-adoption-readiness-assessment",
      product_name: "AI Adoption Readiness Assessment",
      product_tagline: "Role capability gaps and adoption priorities",
      pathway_id: "people-capability",
      gate_ids: [],
      examine: ["Role capability and adoption readiness"],
      receive: ["Readiness assessment with learning direction"],
      duration_display: "7–10 working days",
      fee_naira: null,
      payment_mode: "request_scope",
      terms_version: "v1",
      active: true,
      subsequent_pathway_id: null,
    },
    {
      product_id: "srv-foundation-diagnostic",
      product_name: "Foundation Diagnostic",
      product_tagline: "Foundation strengthening before technology-led work",
      pathway_id: "foundation-work",
      gate_ids: ["GATE-01"],
      examine: ["Data, problem-definition and accountability foundations"],
      receive: ["Foundation baseline with a staged strengthening plan"],
      duration_display: "5–7 working days",
      fee_naira: null,
      payment_mode: "request_scope",
      terms_version: "v1",
      active: true,
      subsequent_pathway_id: "workflow-optimisation",
    },
  ],
  route_reasons: baseReasons(),
  hierarchy_note:
    "What follows is based only on your responses to this assessment.",
};

function baseConfig(): PulseMethodConfig {
  return {
    assessment_version: "1.0.0",
    effective_date: "2026-08-14",
    status: "active",
    approved_by: "IPF",
    questions: [],
    dimensions: [],
    classifications: [
      { minimum_score: 0, maximum_score: 100, label: "Band", interpretation: "Band" },
    ],
    gates: baseGates(),
    routes: baseRoutes(),
    recommendations: [],
    controlled_lists: [],
    premium: { products: [] },
    commercial: CATALOGUE,
  };
}

function emptyResult(): PulseResult {
  return {
    overallScore: 0,
    classification: { label: "Emerging", interpretation: "" },
    dimensions: {},
    gates: [],
    routes: [],
    recommendations: [],
    showEvidenceWarning: false,
    unknownCount: 0,
    answeredCount: 24,
    questionScores: {},
  };
}

describe("COM-001 commercial pathway engine", () => {
  it("Scenario A — automation opportunity: primary automation + supporting optimisation; paid = automation assessment", () => {
    const result: PulseResult = {
      ...emptyResult(),
      routes: [
        { routeId: "workflow-automation", priority: 2 },
        { routeId: "workflow-optimisation", priority: 1 },
      ],
      questionScores: { "O-01": 2, "O-06": 2 },
    };
    const out = buildPathwayResult(result, result.questionScores, baseConfig());
    // workflow-optimisation qualifies at config priority 1 → it is the Primary;
    // automation is a genuinely qualifying supporting pathway (max-2 cap).
    expect(out.primary?.pathwayId).toBe("workflow-optimisation");
    expect(out.primary?.rank).toBe(1);
    const labels = [out.primary?.label, ...out.supporting.map((s) => s.label)];
    expect(labels).toContain("Workflow Optimisation");
    expect(labels).toContain("Workflow Automation");
    expect(out.supporting.length).toBeLessThanOrEqual(2);
    expect(out.paidNextStep?.productId).toBe("srv-workflow-diagnostic");
    expect(out.paidNextStep?.paymentMode).toBe("request_scope");
    expect(out.paidNextStep?.gatingNote).toBeNull();
    expect(out.paidNextStep?.subsequentStep).toBe("Automation Opportunity Assessment");
  });

  it("names a pathway from the configuration when neither the approved copy nor the scorer gives a label (The Shift, 20 November 2026)", () => {
    const result: PulseResult = {
      ...emptyResult(),
      routes: [{ routeId: "workflow-optimisation", priority: 1 }],
      questionScores: { "O-01": 2, "O-06": 2 },
    };
    const config = baseConfig();
    const commercial = config.commercial!;
    // The approved copy for this route carries no label of its own.
    const withoutLabel = { ...commercial, route_reasons: (commercial.route_reasons ?? []).map(annex => (annex.route_id === "workflow-optimisation" ? { ...annex, label: undefined } : annex)) } as ConfigCommercial;
    const out = buildPathwayResult(result, result.questionScores, { ...config, commercial: withoutLabel });
    expect(out.primary?.pathwayId).toBe("workflow-optimisation");
    expect(out.primary?.label).toBe("Workflow Optimisation");
  });

  it("Scenario B — AI opportunity with GATE-03: prerequisite first, paid next step is governance diagnostic with gating note", () => {
    const result: PulseResult = {
      ...emptyResult(),
      routes: [{ routeId: "ai-enabled-workflow", priority: 2 }],
      gates: [{
        gateId: "GATE-03",
        riskText: "Sensitive data may enter unapproved AI tools",
        requiredAction: "Establish approved AI use and controls before deployment work",
        effect: "high-governance-risk",
      }],
      questionScores: { "O-03": 2 },
    };
    const out = buildPathwayResult(result, result.questionScores, baseConfig());
    expect(out.prerequisites.length).toBe(1);
    expect(out.prerequisites[0].gateId).toBe("GATE-03");
    expect(out.prerequisites[0].paidEntryProductId).toBe("srv-ai-governance-diagnostic");
    expect(out.paidNextStep?.productId).toBe("srv-ai-governance-diagnostic");
    expect(out.paidNextStep?.gatingNote).toContain("prerequisite");
    expect(out.paidNextStep?.subsequentStep).toBe("AI Use-Case Assessment");
  });

  it("Scenario C — weak workflow maturity: primary workflow optimisation, paid = workflow diagnostic, never automation", () => {
    const result: PulseResult = {
      ...emptyResult(),
      routes: [{ routeId: "workflow-optimisation", priority: 1 }],
      questionScores: { "O-06": 2 },
    };
    const out = buildPathwayResult(result, result.questionScores, baseConfig());
    expect(out.primary?.pathwayId).toBe("workflow-optimisation");
    expect(out.paidNextStep?.productId).toBe("srv-workflow-diagnostic");
    expect(out.paidNextStep?.productId).not.toBe("srv-automation-opportunity-assessment");
    expect(out.supporting.length).toBe(0);
  });

  it("Scenario D — adoption problem: primary people & capability, paid = adoption readiness assessment", () => {
    const result: PulseResult = {
      ...emptyResult(),
      routes: [{ routeId: "people-capability", priority: 2 }],
      questionScores: { "PE-01": 1, "O-01": 1, "O-02": 1, "O-03": 1 },
    };
    const out = buildPathwayResult(result, result.questionScores, baseConfig());
    expect(out.primary?.pathwayId).toBe("people-capability");
    expect(out.paidNextStep?.productId).toBe("srv-ai-adoption-readiness-assessment");
  });

  it("No-filler rule: a route qualifies in the engine but has no approved copy → not shown", () => {
    const config = baseConfig();
    config.commercial = { ...CATALOGUE_ORIGINAL(), route_reasons: [] };
    const result: PulseResult = {
      ...emptyResult(),
      routes: [{ routeId: "workflow-automation", priority: 2 }],
      questionScores: { "O-01": 2 },
    };
    const out = buildPathwayResult(result, result.questionScores, config);
    expect(out.primary).toBeNull();
    expect(out.supporting).toHaveLength(0);
    expect(out.paidNextStep).toBeNull();
  });

  it("Max-2-supporting rule: three qualifying routes cap at 1 primary + 2 supporting", () => {
    const result: PulseResult = {
      ...emptyResult(),
      routes: [
        { routeId: "workflow-automation", priority: 2 },
        { routeId: "workflow-optimisation", priority: 1 },
        { routeId: "ai-enabled-workflow", priority: 2 },
      ],
      questionScores: { "O-01": 2, "O-06": 2, "O-03": 2 },
    };
    const out = buildPathwayResult(result, result.questionScores, baseConfig());
    const all = [out.primary, ...out.supporting].filter((p) => p !== null);
    expect(all.length).toBeLessThanOrEqual(3);
    expect(out.supporting.length).toBeLessThanOrEqual(2);
  });

  it("Reason copy is hedged and clause-bound: reasonText starts with the approved hedge", () => {
    const result: PulseResult = {
      ...emptyResult(),
      routes: [{ routeId: "workflow-automation", priority: 2 }],
      questionScores: { "O-01": 2 },
    };
    const out = buildPathwayResult(result, result.questionScores, baseConfig());
    expect(out.primary?.reasonText).toMatch(/^Your responses suggest /);
    expect(out.primary?.reasonCodes[0].reasonCodeId).toBe("RC-AUTO-O01");
  });

  it("Commercial result keeps hierarchy note and never invents pricing", () => {
    const result: PulseResult = {
      ...emptyResult(),
      routes: [{ routeId: "workflow-optimisation", priority: 1 }],
      questionScores: { "O-06": 2 },
    };
    const out = buildPathwayResult(result, result.questionScores, baseConfig());
    expect(out.hierarchyNote).toContain("responses");
    expect(out.paidNextStep?.feeNaira).toBeNull();
    expect(out.paidNextStep?.productName).toBeTruthy();
  });

  it("Inactive products are excluded from the paid next step", () => {
    const config = baseConfig();
    config.commercial = {
      ...CATALOGUE_ORIGINAL(),
      products: CATALOGUE.products.map((p) =>
        p.product_id === "srv-automation-opportunity-assessment"
          ? { ...p, active: false }
          : p,
      ),
    };
    const result: PulseResult = {
      ...emptyResult(),
      routes: [{ routeId: "workflow-automation", priority: 2 }],
      questionScores: { "O-01": 2 },
    };
    const out = buildPathwayResult(result, result.questionScores, config);
    expect(out.paidNextStep?.productId).not.toBe("srv-automation-opportunity-assessment");
  });
});

/** Local copy of the catalogue for mutation tests without affecting others. */
function CATALOGUE_ORIGINAL(): ConfigCommercial {
  return JSON.parse(JSON.stringify(CATALOGUE)) as ConfigCommercial;
}
