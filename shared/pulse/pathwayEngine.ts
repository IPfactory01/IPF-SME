/**
 * COM-001 — Commercial Pathway Engine
 *
 * Deterministic conversion of a scored Pulse result into the staggered
 * commercial pathway hierarchy required by the IPF v0.9.5 commercial
 * specification:
 *
 *   A. Free Readiness Result            (unchanged score/classification)
 *   B. Recommended Pathways             1 Primary + up to 2 Supporting
 *   C. Required before proceeding       critical prerequisites only
 *   D. Recommended paid next step with  one dynamic IPF entry-service card
 *      IPF
 *   E. Free 90-day plan                 (already present in the free result)
 *
 * Design rules (COM-001 §4):
 * - Never filler: supporting pathways appear only when genuinely eligible.
 * - The Primary is never derived from the overall score alone; it requires
 *   an explicit opportunity or prerequisite trigger.
 * - Critical gates are evaluated first and take the prerequisite slot;
 *   they can block or re-rank opportunity pathways.
 * - All copy is assembled from approved reason-code text bound to the
 *   configuration; no LLM-generated rationale.
 * - Every displayed message uses hedged language ("Your responses suggest…").
 *
 * This module is pure data transformation over the PulseResult contract and
 * the active method configuration. It contains no network, DB, or LLM calls.
 */
import type { PulseMethodConfig } from "./configTypes";

export interface PathwayReasonCode {
  /** Stable identifier, e.g. "RC-AUTO-O01". */
  reasonCodeId: string;
  /** Hedged, approved rationale text, e.g. "Your responses suggest a recurring
   *  manual handoff that a redesign could address." */
  text: string;
}

export interface CommercialPathway {
  /** Route id from the configuration, e.g. "workflow-automation". */
  pathwayId: string;
  label: string;
  /** 0 = supporting, 1 = primary. */
  rank: 0 | 1;
  reasonCodes: PathwayReasonCode[];
  /** Single composed "why this appeared" line from approved copy only. */
  reasonText: string;
  /** Single composed "what this means" line from approved copy only. */
  meaningText: string;
}

export interface Prerequisite {
  gateId: string;
  riskText: string;
  requiredAction: string;
  effect: string;
  /** Paid entry product key that resolves this prerequisite, if configured. */
  paidEntryProductId: string | null;
}

export interface PaidNextStep {
  /** Resolved commercial product id. */
  productId: string;
  productName: string;
  productTagline: string;
  /** What IPF will examine during this entry service. */
  examine: string[];
  /** What the client receives from this entry service. */
  receive: string[];
  indicativeDelivery: string | null;
  /** Configured fee in whole Naira, or null when scope-dependent. */
  feeNaira: number | null;
  /** direct_checkout | request_invoice | request_scope */
  paymentMode: "direct_checkout" | "request_invoice" | "request_scope";
  /** Only present when a critical gate precedes this step. */
  gatingNote: string | null;
  /** Pathway likely to follow this entry service, if configured. */
  subsequentStep: string | null;
  termsVersion: string;
}

export interface PathwayResult {
  /** Exactly one, when at least one qualifying pathway exists. */
  primary: CommercialPathway | null;
  /** 0–2 genuinely qualifying supporting pathways. */
  supporting: CommercialPathway[];
  /** Critical prerequisites that must resolve before proceeding. */
  prerequisites: Prerequisite[];
  /** One recommended paid next step with IPF, when configured. */
  paidNextStep: PaidNextStep | null;
  /** Copy note shown at the top of the conversion hierarchy. */
  hierarchyNote: string;
}

/**
 * Catalogue entry in the active method configuration's
 * `commercial_products` list. Stored under the config key
 * `commercial_products` (companion to, and superseding for the public
 * results surface, the legacy `premium_products` list).
 */
export interface CommercialProductConfig {
  product_id: string;
  product_name: string;
  product_tagline: string;
  /** Which pathway this product serves as the entry service for. */
  pathway_id: string;
  /** Critical gate ids this product also satisfies, e.g. ["GATE-03"]. */
  gate_ids: string[];
  /** "What IPF will examine" bullets. */
  examine: string[];
  /** "What you receive" bullets. */
  receive: string[];
  duration_display: string | null;
  /** Whole Naira, or null for scope-dependent fees. */
  fee_naira: number | null;
  payment_mode: "direct_checkout" | "request_invoice" | "request_scope";
  terms_version: string;
  /** false — keep the card visible, show "not currently offered" state. */
  active: boolean;
  /** Pathway id this product is most likely to lead into, if configured. */
  subsequent_pathway_id: string | null;
}

/** Optional per-route reason-code annex in the method configuration. */
export interface CommercialRouteAnnex {
  route_id: string;
  /** Clause-level reasons, each bound to the clause that triggered. */
  reasons: {
    reason_code_id: string;
    /** Clause expression this reason is bound to. */
    bound_clause: string;
    why_text: string;
    meaning_text: string;
  }[];
  label: string;
}

export interface CommercialConfig {
  products: CommercialProductConfig[];
  route_reasons?: CommercialRouteAnnex[];
  /** Approved fallback meaning text per pathway when no annex is configured. */
  pathway_meanings?: Record<string, string>;
  hierarchy_note?: string;
  /**
   * Deterministic segment rules (COM-001 §6): product ids that take priority
   * for a respondent's industry group or staff-size group. Group keys are
   * pipe-separated industry or size ids; matching products keep their
   * original relative order and move to the front of the paid-next-step
   * candidates. Never changes the Primary/Supporting pathway list.
   */
  segment_rules?: {
    industry_groups?: Record<string, string[]>;
    size_groups?: Record<string, string[]>;
  };
}

/** Respondent segment used for segment-aware pathway ordering. */
export interface SegmentCtx {
  industryId?: string;
  sizeId?: string;
}

function readCommercial(config: PulseMethodConfig): CommercialConfig | null {
  const raw = (config as { commercial?: unknown } | undefined)?.commercial;
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Partial<CommercialConfig>;
  if (!Array.isArray(obj.products) || obj.products.length === 0) return null;
  return {
    products: obj.products,
    route_reasons: Array.isArray(obj.route_reasons) ? (obj.route_reasons ?? undefined) : undefined,
    pathway_meanings: obj.pathway_meanings,
    hierarchy_note: obj.hierarchy_note,
    segment_rules: readSegmentRules(obj.segment_rules),
  };
}

function readSegmentRules(
  raw: unknown,
): { industry_groups?: Record<string, string[]>; size_groups?: Record<string, string[]> } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const pick = (name: string): Record<string, string[]> | undefined => {
    const map = obj[name];
    if (!map || typeof map !== "object") return undefined;
    const out: Record<string, string[]> = {};
    for (const [groupKey, ids] of Object.entries(map as Record<string, unknown>)) {
      const list = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
      if (list.length > 0) out[groupKey] = list;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };
  const industry_groups = pick("industry_groups");
  const size_groups = pick("size_groups");
  if (!industry_groups && !size_groups) return undefined;
  return { industry_groups, size_groups };
}

/**
 * Stable-partition the candidate list so that product ids appearing in a
 * segment rule matching the respondent's industry or size move to the front,
 * keeping their original relative order. Empty or non-matching segment rules
 * leave the order unchanged (deterministic fallback).
 */
function applySegmentOrder(
  candidates: string[],
  segment: SegmentCtx | undefined,
  rules: CommercialConfig["segment_rules"] | undefined,
): string[] {
  if (!segment || !rules) return candidates;
  const matchedIds = new Set<string>();
  const groupKeys = [
    ...(segment.industryId ? segment.industryId.split("|").filter(Boolean) : []),
    ...(segment.sizeId ? segment.sizeId.split("|").filter(Boolean) : []),
  ];
  for (const key of groupKeys) {
    const list =
      rules.industry_groups?.[key] ??
      (rules.size_groups?.[key] ?? undefined);
    for (const id of list ?? []) matchedIds.add(id);
  }
  if (matchedIds.size === 0) return candidates;
  return [...candidates.filter((id) => matchedIds.has(id)), ...candidates.filter((id) => !matchedIds.has(id))];
}

/**
 * Clause-level trigger match: given a route trigger expression, return the
 * sub-clauses that evaluated true for the supplied evaluation context.
 * Implemented by re-tokenising known clause patterns; deliberately simple —
 * the expressions in v1.0.0 are short OR/AND compositions of comparisons.
 */
export interface ClauseCtx {
  /** questionId -> rawScore */
  questionScores: Record<string, number | null>;
  gateTriggered: Record<string, boolean>;
  overallScore: number;
}

function clauseMatches(clause: string, ctx: ClauseCtx): boolean {
  // clause forms: "X >= n" | "X <= n" | "X == n" | "X" (gate/atom)
  const comp = clause.match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*(>=|<=|==)\s*(\d+(?:\.\d+)?)$/);
  if (comp) {
    const id = comp[1];
    const op = comp[2];
    const n = parseFloat(comp[3]);
    let v: number | null = null;
    if (id === "overall_score") v = ctx.overallScore;
    else if (ctx.gateTriggered[id] !== undefined) v = ctx.gateTriggered[id] ? 1 : 0;
    else v = ctx.questionScores[id] ?? null;
    if (v === null) return false;
    if (op === ">=") return v >= n;
    if (op === "<=") return v <= n;
    return Math.abs(v - n) < 1e-9;
  }
  const atom = /^([A-Za-z_][A-Za-z0-9_.-]*)$/.exec(clause.trim());
  if (atom) {
    const id = atom[1];
    if (ctx.gateTriggered[id] !== undefined) return ctx.gateTriggered[id];
    if (id === "AI-USE") {
      return Object.values(ctx.questionScores).some((s) => s !== null);
    }
    return (ctx.questionScores[id] ?? null) !== null;
  }
  return false;
}

function findMatchingClauses(expr: string, ctx: ClauseCtx): string[] {
  // Split the trigger expression on top-level AND/OR, stripping parens, then
  // test each atomic clause. Order matters for reason ranking.
  const normalized = expr.replace(/\(/g, "").replace(/\)/g, "");
  return normalized
    .split(/\s+(?:AND|OR)\s+/)
    .map((c) => c.trim())
    .filter(Boolean)
    .filter((c) => clauseMatches(c, ctx));
}

/**
 * Build the deterministic commercial pathway result for a scored assessment.
 *
 * @param result  the scored PulseResult (gates, routes, question scores)
 * @param questionScores questionId -> rawScore map from the scoring engine
 * @param config  the full active method configuration
 */
export function buildPathwayResult(
  result: {
    gates: { gateId: string; riskText: string; requiredAction: string; effect: string }[];
    // The scorer gives no label; the approved annex or the configuration names the route.
    routes: { routeId: string; priority: number; label?: string }[];
    showEvidenceWarning: boolean;
    unknownCount: number;
  },
  questionScores: Record<string, number | null>,
  config: PulseMethodConfig,
  segment: SegmentCtx = {},
): PathwayResult {
  const commercial = readCommercial(config);

  // ---------- Step 1: critical prerequisites (gates) ----------
  const prerequisites: Prerequisite[] = [];
  for (const g of result.gates) {
    let paidEntry: CommercialProductConfig | null = null;
    if (commercial) {
      paidEntry =
        commercial.products.find(
          (p) => p.active && p.gate_ids.includes(g.gateId),
        ) ?? null;
    }
    prerequisites.push({
      gateId: g.gateId,
      riskText: g.riskText,
      requiredAction: g.requiredAction,
      effect: g.effect,
      paidEntryProductId: paidEntry?.product_id ?? null,
    });
  }

  // ---------- Step 2: rank opportunity pathways ----------
  // Routes arrive sorted by config priority; a blocking prerequisite means
  // the opportunity pathways sit below it in the commercial hierarchy but
  // still render. The Primary is the first qualifying opportunity route;
  // supporting pathways are up to two further qualifying routes.
  const annexByRoute = new Map<string, CommercialRouteAnnex>();
  for (const annex of commercial?.route_reasons ?? []) annexByRoute.set(annex.route_id, annex);
  const clauseCtx: ClauseCtx = {
    questionScores,
    gateTriggered: Object.fromEntries(result.gates.map((g) => [g.gateId, true])),
    overallScore: (result as { overallScore?: number }).overallScore ?? 0,
  };

  const pathways: CommercialPathway[] = [];
  for (const route of result.routes) {
    // Find the matching clause(s) in the config's trigger expression.
    const routeConfig = config.routes.find((r) => r.route_id === route.routeId);
    const clauses = routeConfig?.trigger_expression
      ? findMatchingClauses(routeConfig.trigger_expression, clauseCtx)
      : [];
    if (clauses.length === 0) continue; // not genuinely eligible — no filler

    const annex = annexByRoute.get(route.routeId);
    const reasons: PathwayReasonCode[] = clauses
      .map((clause) => {
        const match = annex?.reasons?.find((r) => r.bound_clause === clause);
        if (!match) return null;
        return { reasonCodeId: match.reason_code_id, text: match.why_text };
      })
      .filter((r): r is PathwayReasonCode => Boolean(r));
    if (reasons.length === 0) continue; // approved copy is authoritative — if
    // a clause triggered without approved copy, the pathway is not shown.

    const meanings = reasons
      .map((r) => annex?.reasons?.find((m) => m.reason_code_id === r.reasonCodeId)?.meaning_text)
      .filter((t): t is string => Boolean(t));

    pathways.push({
      pathwayId: route.routeId,
      label: annex?.label ?? route.label ?? routeConfig?.label ?? route.routeId,
      rank: route.priority === 1 ? 1 : 0,
      reasonCodes: reasons,
      reasonText: `Your responses suggest ${reasons[0].text.toLowerCase()}`,
      meaningText: meanings[0] ?? "",
    });
  }

  const primary = pathways.find((p) => p.rank === 1) ?? pathways[0] ?? null;
  const supporting = pathways.filter((p) => p !== primary).slice(0, 2);

  // ---------- Step 3: paid next step ----------
  let paidNextStep: PaidNextStep | null = null;
  if (commercial) {
    const targets: string[] = [];
    for (const prereq of prerequisites) {
      if (prereq.paidEntryProductId) targets.push(prereq.paidEntryProductId);
    }
    if (primary) {
      const primaryProduct = commercial.products.find(
        (p) => p.active && p.pathway_id === primary.pathwayId,
      );
      if (primaryProduct) targets.push(primaryProduct.product_id);
    }
    for (const s of supporting) {
      const supportingProduct = commercial.products.find(
        (p) => p.active && p.pathway_id === s.pathwayId,
      );
      if (supportingProduct && !targets.includes(supportingProduct.product_id)) {
        targets.push(supportingProduct.product_id);
      }
    }
    const orderedTargets = applySegmentOrder(targets, segment, commercial.segment_rules);
    if (orderedTargets.length > 0) {
      const productId = orderedTargets[0];
      const product = commercial.products.find((p) => p.product_id === productId)!;
      const blockingGates = prerequisites.filter((p) => p.paidEntryProductId === productId);
      let gatingNote: string | null = null;
      if (blockingGates.length > 0) {
        gatingNote =
          `Your responses indicate a prerequisite that should be resolved first: ${blockingGates[0].riskText.toLowerCase()}. ` +
          `This diagnostic is designed to close that gap before wider work is considered.`;
      }
      const subsequent: CommercialProductConfig | null = product.subsequent_pathway_id
        ? (commercial.products.find((p) => p.pathway_id === product.subsequent_pathway_id) ?? null)
        : null;
      paidNextStep = {
        productId: product.product_id,
        productName: product.product_name,
        productTagline: product.product_tagline,
        examine: product.examine,
        receive: product.receive,
        indicativeDelivery: product.duration_display,
        feeNaira: product.fee_naira,
        paymentMode: product.payment_mode,
        gatingNote,
        subsequentStep: subsequent ? subsequent.product_name : null,
        termsVersion: product.terms_version,
      };
    }
  }

  return {
    primary,
    supporting,
    prerequisites,
    paidNextStep,
    hierarchyNote:
      commercial?.hierarchy_note ??
      "What follows is based only on your responses to this assessment. It is a professional direction of travel, not a diagnosis of your business.",
  };
}
