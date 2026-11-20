/**
 * Configuration types for the IPF AI & Workflow Readiness Pulse method.
 *
 * Every question, option, weight, gate, route, recommendation and controlled
 * list is configuration-driven and versioned (PRD §8.4, NFR-007).
 * This module is client-agnostic TypeScript: it defines the shape that the
 * server validates and stores, and that the client renders from.
 * The client never receives weights, scoring rules or administrative fields
 * beyond what is required for rendering (FR-017); rendering data is projected
 * server-side.
 */

export type SectionId =
  | "strategy"
  | "process"
  | "data"
  | "technology"
  | "people"
  | "governance"
  | "opportunity";

export const SECTION_ORDER: SectionId[] = [
  "strategy",
  "process",
  "data",
  "technology",
  "people",
  "governance",
  "opportunity",
];

export interface ConfigOption {
  option_id: string;
  label: string;
  /** raw_score 0–3. Present for scored options. */
  raw_score?: number;
  /** Marks "I do not know"; stored separately, scored 0, flags evidence gap. */
  unknown_flag?: boolean;
  /** Question-level risk trigger identifier (e.g. "GATE-03-AI-USE") if this option can trigger a gate. */
  risk_trigger?: string;
}

export interface ConfigQuestion {
  question_id: string;
  section: SectionId;
  text: string;
  help_text: string;
  required: boolean;
  /** 1-based position within its section. */
  display_order: number;
  active: boolean;
  /** Option shown in the UI. All share the 0–3 evidence scale; unknown where configured. */
  options: ConfigOption[];
  /** Question-level trigger shorthand consumed by gate/route expressions (e.g. "GATE-02"). */
  trigger?: string;
}

export interface ConfigDimension {
  dimension_id: string;
  name: string;
  /** Weight in the overall readiness score; summed must equal 1. */
  weight: number;
  question_ids: string[];
  /** Plain-English explanation shown beside the dimension score in the result. */
  explanation: string;
}

export interface ConfigClassification {
  minimum_score: number;
  maximum_score: number;
  label: string;
  interpretation: string;
}

export interface ConfigGate {
  gate_id: string;
  /** Expression referencing a question id and option condition, e.g. "S-02 == 0". */
  trigger_expression: string;
  effect:
    | "cap-emerging"
    | "route-workflow"
    | "high-governance-risk"
    | "no-wider-deployment"
    | "route-foundation"
    | "security-review-required";
  risk_text: string;
  required_action: string;
  /** Optional extra condition, e.g. "AI-USE" meaning the gate applies when AI use is reported. */
  condition?: string;
}

export interface ConfigRoute {
  route_id: string;
  label: string;
  /** Expression over opportunity questions / routed scores, e.g. "O-01 >= 2 OR O-02 >= 2". */
  trigger_expression: string;
  /** 1 = primary eligibility, 2 = supporting eligibility. */
  priority: 1 | 2;
  conflict_rule: string;
}

export interface ConfigRecommendation {
  recommendation_id: string;
  /** Expression over question ids, score ranges, gates, segments and pathway, e.g. "P-03 < 3". */
  trigger: string;
  /** Explicitly nullable: approved empty value when not segment-scoped. */
  segment: string | null;
  /** Explicitly nullable: approved empty value when not pathway-scoped. */
  pathway: string | null;
  title: string;
  action: string;
  timeframe: "0-30 days" | "31-60 days" | "61-90 days";
  status: "active" | "retired";
}

export interface ControlledList {
  field: "country" | "industry" | "employee_range";
  values: string[];
  default_value?: string;
}

/**
 * Premium unlock token returned to the client and recorded on paid orders.
 * - detailed_roadmaps: detailed per-dimension 90-day roadmaps
 * - roi_projections: cost-savings & ROI projections
 * - full_pdf: complete branded PDF report
 */
export type PremiumUnlock = "detailed_roadmaps" | "roi_projections" | "full_pdf";

export interface ConfigPremiumProduct {
  key: string;
  title: string;
  tagline: string;
  short_description: string;
  /** Price in whole Naira (no kobo) — shown as ₦ on the checkout cards. */
  price_naira: number;
  unlocks: PremiumUnlock[];
}

export interface ConfigPremium {
  products: ConfigPremiumProduct[];
}

/**
 * COM-001 — Commercial product catalogue entry stored under the
 * `commercial` config key. Authoritative for the public results surface;
 * companion to the legacy `premium` unlock store.
 */
export type CommercialPaymentMode = "direct_checkout" | "request_invoice" | "request_scope";

export interface ConfigCommercialProduct {
  product_id: string;
  product_name: string;
  product_tagline: string;
  /** Route id this product serves as the entry service for. */
  pathway_id: string;
  /** Critical gate ids this product also satisfies, e.g. ["GATE-03"]. */
  gate_ids: string[];
  /** "What IPF will examine" bullets. */
  examine: string[];
  /** "What you receive" bullets. */
  receive: string[];
  duration_display: string | null;
  /** Whole Naira, or null when scope-dependent. */
  fee_naira: number | null;
  payment_mode: CommercialPaymentMode;
  terms_version: string;
  active: boolean;
  /** Product (pathway) this entry service is most likely to lead into. */
  subsequent_pathway_id: string | null;
}

export interface ConfigCommercialRouteReason {
  route_id: string;
  label: string;
  reasons: {
    reason_code_id: string;
    bound_clause: string;
    why_text: string;
    meaning_text: string;
  }[];
}

export interface ConfigCommercial {
  products: ConfigCommercialProduct[];
  route_reasons?: ConfigCommercialRouteReason[];
  pathway_meanings?: Record<string, string>;
  hierarchy_note?: string;
}

export interface PulseMethodConfig {
  /** PRD B.1: assessment_version, effective_date, status, approved_by */
  assessment_version: string;
  effective_date: string;
  status: "draft" | "active" | "retired";
  approved_by: string;
  questions: ConfigQuestion[];
  dimensions: ConfigDimension[];
  classifications: ConfigClassification[];
  gates: ConfigGate[];
  routes: ConfigRoute[];
  recommendations: ConfigRecommendation[];
  controlled_lists: ControlledList[];
  /** Phase 4 freemium products (PRD §9): Naira-priced premium outputs. */
  premium?: ConfigPremium;
  /** COM-001 commercial catalogue; optional on older configurations. */
  commercial?: ConfigCommercial;
}

/**
 * Result document produced by the deterministic Pulse scoring engine.
 * Serialized to assessment_results.resultJson (PRD Appendix C).
 */
export interface PulseResult {
  overallScore: number;
  classification: { label: string; interpretation: string };
  /** dimension_id -> score 0–100 */
  dimensions: Record<string, number>;
  gates: {
    gateId: string;
    riskText: string;
    requiredAction: string;
    effect: string;
  }[];
  routes: { routeId: string; priority: number }[];
  recommendations: {
    recommendationId: string;
    title: string;
    action: string;
    timeframe: string;
    pathway: string | null;
  }[];
  showEvidenceWarning: boolean;
  unknownCount: number;
  answeredCount: number;
  /** Per-question raw scores (0–3 or null) for deterministic reason binding. */
  questionScores: Record<string, number | null>;
}
