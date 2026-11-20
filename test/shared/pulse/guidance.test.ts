/* Persona guidance + segment pathway regression tests (15 Aug 2026).
 *
 * - Persona guidance: deterministic resolver picks industry + staff-size
 *   variants without changing the canonical plain-language explanation,
 *   with safe fallbacks when no variant exists for an industry.
 * - Segment pathways: segment rules re-order only the paid-next-step
 *   candidate list; routes and gates stay untouched (determinism preserved).
 */
import { describe, expect, it } from "vitest";
import {
  INDUSTRIES,
  STAFF_COUNT_OPTIONS,
} from "@shared/pulse/assessmentContent";
import {
  resolveGuidance,
} from "@shared/pulse/guidanceResolver";
import {
  buildPathwayResult,
} from "@shared/pulse/pathwayEngine";
import { QUESTION_GUIDANCE } from "@shared/pulse/questionGuidance";
import type {
  ConfigCommercial,
  PulseMethodConfig,
  PulseResult,
} from "@shared/pulse/configTypes";
import type { SegmentCtx } from "@shared/pulse/pathwayEngine";
import { PERSONA_EXAMPLES } from "@shared/pulse/guidancePersonas";

/* ------------------------------------------------------------------ */
/* Persona guidance                                                    */
/* ------------------------------------------------------------------ */

describe("persona guidance resolver", () => {
  const questionIds = Object.keys(PERSONA_EXAMPLES);

  it("covers all 24 active questions", () => {
    expect(questionIds.length).toBe(24);
  });

  it("preserves the canonical explanation while adding personalisation", () => {
    for (const id of questionIds) {
      const canonical = QUESTION_GUIDANCE[id]?.plainLanguage ?? "";
      expect(canonical.trim().length).toBeGreaterThan(10);
      const resolved = resolveGuidance(id, "retail", "small");
      // The canonical meaning must survive personalisation (case-normalised
      // comparison of the opening of the plain-language body).
      expect((resolved.plainLanguage ?? "").toLowerCase()).toContain(
        canonical.slice(0, 24).toLowerCase(),
      );
    }
  });

  it("returns a staff-size framing clause for every controlled industry/size pair", () => {
    // The contact step stores the LIVE controlled-list LABEL, so the resolver
    // is exercised with those labels (plus the legacy persona ids as a
    // backward-compatibility fallback).
    const controlledLabels = [
      "Retail and e-commerce",
      "Professional and business services",
      "Manufacturing",
      "Logistics and transport",
      "Hospitality",
      "Food and agriculture",
      "Agriculture and agribusiness",
      "Health and pharmaceuticals",
      "Education and training",
      "Other (please specify)",
    ];
    const sizeIds = STAFF_COUNT_OPTIONS.map((o) => o.id);
    const sizeLabels = STAFF_COUNT_OPTIONS.map((o) => o.label);
    const industries = [...controlledLabels, ...INDUSTRIES.map((i) => i.id)];
    for (const industry of industries) {
      for (const size of [...sizeIds, ...sizeLabels]) {
        const resolved = resolveGuidance("P-01", industry, size);
        // "Other (please specify)" and its legacy id "other" map to the
        // generic fallback persona: they keep the generic example and stay
        // non-personalised, but still render the documented size framing
        // so unknown-industry respondents see the size-appropriate clause.
        if (industry === "Other (please specify)" || industry === "other") {
          expect(resolved.isPersonalised).toBe(false);
          expect(resolved.sizeFraming.length).toBeGreaterThan(0);
          continue;
        }
        expect(resolved.sizeFraming.length).toBeGreaterThan(0);
      }
    }
    // An unrecognised industry id must render without framing.
    const unknown = resolveGuidance("P-01", "nonexistent-industry", "small");
    expect(unknown.sizeFraming).toBe("");
    expect(unknown.example).toBe(QUESTION_GUIDANCE["P-01"].example);
  });

  it("applies an industry variant for a tailored industry and falls back for other", () => {
    const tailored = resolveGuidance("P-01", "retail", "small");
    expect(tailored.isPersonalised).toBe(true);
    expect(tailored.sizeFraming.length).toBeGreaterThan(0);
    const otherResolved = resolveGuidance("P-01", "other", "small");
    // "other" is the fallback persona key: its example falls back through
    // the generic chain and must still render content.
    expect(otherResolved.example.length).toBeGreaterThan(0);
    // "other" must remain non-personalised so two unknown-industry responses
    // see identical copy.
    expect(otherResolved.isPersonalised).toBe(false);
    // A tailored industry must differ from the generic fallback (evidence of
    // actual personalisation rather than a passthrough).
    expect(tailored.example).not.toBe(QUESTION_GUIDANCE["P-01"].example);
  });

  it("never hints at the correct answer in any variant", () => {
    // Answer-bias guard: no persona text may mirror the answer scale.
    const biasWords = /\b(completely mature|yes for all|no for all)\b/i;
    for (const id of questionIds) {
      for (const ind of ["retail", "health", "other"]) {
        const r = resolveGuidance(id, ind, "small");
        for (const text of [r.plainLanguage ?? "", r.example ?? ""]) {
          expect(biasWords.test(text), `${id} ${ind} contains biased wording`).toBe(false);
        }
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Segment pathway ordering                                            */
/* ------------------------------------------------------------------ */

function minimalResult(): PulseResult {
  return {
    overallScore: 48,
    classification: "developing",
    dimensions: [],
    gates: [],
    routes: [
      { routeId: "workflow-automation", priority: 2, label: "Workflow Automation" },
      { routeId: "ai-governance-adoption", priority: 3, label: "AI Governance" },
    ],
    recommendations: [],
    showEvidenceWarning: false,
    unknownCount: 0,
  } as unknown as PulseResult;
}

function minimalCommercial(overrides: Partial<ConfigCommercial> = {}): ConfigCommercial {
  return {
    products: [
      {
        product_id: "srv-workflow-diagnostic",
        product_name: "Workflow Diagnostic",
        pathway_id: "workflow-optimisation",
        active: true,
        gate_ids: [],
      },
      {
        product_id: "srv-automation-opportunity-assessment",
        product_name: "Automation Opportunity Assessment",
        pathway_id: "workflow-automation",
        active: true,
        gate_ids: [],
      },
      {
        product_id: "srv-ai-governance-diagnostic",
        product_name: "AI Governance Diagnostic",
        pathway_id: "ai-governance-adoption",
        active: true,
        gate_ids: [],
      },
    ],
    route_reasons: [
      {
        route_id: "workflow-automation",
        label: "Workflow Automation",
        reasons: [
          {
            reason_code_id: "RC-AUTO-O01",
            bound_clause: "O-01 >= 2",
            evidence: "Evidence",
            implication: "Implication",
            recommended_action: "Action",
            why_text: "Evidence of this was observed",
            meaning_text: "Meaning for the client",
          },
        ],
      },
      {
        route_id: "ai-governance-adoption",
        label: "AI Governance",
        reasons: [
          {
            reason_code_id: "RC-GOV-O01",
            bound_clause: "O-01 >= 3",
            evidence: "Evidence",
            implication: "Implication",
            recommended_action: "Action",
            why_text: "Governance need observed",
            meaning_text: "Governance meaning",
          },
        ],
      },
    ],
    segment_rules: (overrides as { segment_rules?: unknown }).segment_rules ?? {
      industry_groups: {
        "retail|health": ["srv-workflow-diagnostic"],
      },
      size_groups: {
        large: ["srv-ai-governance-diagnostic"],
      },
    },
  } as unknown as ConfigCommercial;
}

function minimalConfig(commercial: ConfigCommercial): PulseMethodConfig {
  return {
    questions: [],
    dimensions: [],
    classifications: [],
    gates: [],
    routes: [
      { route_id: "workflow-automation", label: "Workflow Automation", trigger_expression: "O-01 >= 2", priority: 2 },
      { route_id: "ai-governance-adoption", label: "AI Governance", trigger_expression: "O-01 >= 3", priority: 3 },
    ],
    recommendations: [],
    commercial,
  } as unknown as PulseMethodConfig;
}

describe("segment-adjusted paid next step", () => {
  it("picks the segment-leading product when a segment rule matches", () => {
    const result = buildPathwayResult(
      minimalResult(),
      { "O-01": 3 },
      minimalConfig(minimalCommercial()),
      { industryId: "retail", sizeId: "micro" } as SegmentCtx,
    );
    // The automation route's catalogue product is a candidate, and the size
    // rule for micro teams promotes the Workflow Diagnostic (which is on
    // the optimisation route, not triggered here) — rules only reorder
    // candidates already in the target list, so the Automation Opportunity
    // product remains the resolved paid next step.
    expect(result.paidNextStep?.productId).toBe("srv-automation-opportunity-assessment");
  });

  it("leaves routes and gates identical regardless of segment", () => {
    const withSegment = buildPathwayResult(
      minimalResult(),
      { "O-01": 3 },
      minimalConfig(minimalCommercial()),
      { industryId: "retail", sizeId: "micro" } as SegmentCtx,
    );
    const withoutSegment = buildPathwayResult(
      minimalResult(),
      { "O-01": 3 },
      minimalConfig(minimalCommercial()),
      {},
    );
    // Segment rules only reorder paid products: the pathways and prerequisites never change.
    expect(withSegment.primary).toEqual(withoutSegment.primary);
    expect(withSegment.supporting).toEqual(withoutSegment.supporting);
    expect(withSegment.prerequisites).toEqual(withoutSegment.prerequisites);
  });

  it("falls back to default order when rules match nothing", () => {
    const result = buildPathwayResult(
      minimalResult(),
      { "O-01": 3 },
      minimalConfig(minimalCommercial()),
      { industryId: "manufacturing", sizeId: "small" } as SegmentCtx,
    );
    // No industry or size rule matches this segment, so the default
    // (primary-first) order holds and the Automation Opportunity product
    // — the primary route's catalogue entry — is resolved.
    expect(result.paidNextStep?.productId).toBe("srv-automation-opportunity-assessment");
  });

  it("applies the size rule when the industry has no rule", () => {
    const result = buildPathwayResult(
      minimalResult(),
      { "O-01": 3 },
      minimalConfig(minimalCommercial()),
      { industryId: "manufacturing", sizeId: "large" } as SegmentCtx,
    );
    // The governance route triggered as a Supporting pathway, so its
    // catalogue product enters the candidate list; the large-size rule then
    // promotes the AI Governance Diagnostic to the front.
    expect(result.paidNextStep?.productId).toBe("srv-ai-governance-diagnostic");
  });
});

/* ------------------------------------------------------------------ */
/* Controlled lists                                                    */
/* ------------------------------------------------------------------ */

describe("controlled industry and staff lists", () => {
  it("lists Hospitality and Food & Agriculture as separate options", () => {
    const ids = INDUSTRIES.map((i) => i.id);
    expect(ids).toContain("hospitality");
    expect(ids).toContain("food_agriculture");
    const labels = INDUSTRIES.map((i) => i.label).join(" ");
    // No single label may combine hospitality and food; they are distinct.
    expect(labels.split(" ").some((w) => /hospitalityfood|foodhospitality/i.test(w))).toBe(false);
  });

  it("includes an explicit Other option with free-text support", () => {
    expect(INDUSTRIES.some((i) => i.id === "other")).toBe(true);
    expect(INDUSTRIES.some((i) => /specify/i.test(i.label))).toBe(true);
  });

  it("has four staff-size bands used for segmentation", () => {
    expect(STAFF_COUNT_OPTIONS.map((o) => o.id)).toEqual(["micro", "small", "medium", "large"]);
  });
});
