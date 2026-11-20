import type { PulseMethodConfig } from "@shared/pulse/configTypes";
import { SECTION_ORDER } from "@shared/pulse/configTypes";

export interface ConfigValidationError {
  path: string;
  message: string;
}

/**
 * Validates an imported method configuration document against the PRD
 * Appendix B shape requirements before it can be activated.
 * Returns an empty array when valid.
 */
export function validateMethodConfig(
  config: PulseMethodConfig,
): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  if (!config || typeof config !== "object") {
    errors.push({ path: "", message: "Document must be a JSON object." });
    return errors;
  }
  const questions = Array.isArray(config.questions) ? config.questions : [];
  const dimensions = Array.isArray(config.dimensions) ? config.dimensions : [];
  const classifications = Array.isArray(config.classifications) ? config.classifications : [];
  const gates = Array.isArray(config.gates) ? config.gates : [];
  const routes = Array.isArray(config.routes) ? config.routes : [];
  const recommendations = Array.isArray(config.recommendations) ? config.recommendations : [];
  const controlledLists = Array.isArray(config.controlled_lists) ? config.controlled_lists : [];

  if (!config.assessment_version || typeof config.assessment_version !== "string") {
    errors.push({ path: "assessment_version", message: "Required string." });
  }
  if (!config.effective_date || isNaN(Date.parse(config.effective_date))) {
    errors.push({ path: "effective_date", message: "Required valid ISO date." });
  }
  if (!["draft", "active", "retired"].includes(config.status)) {
    errors.push({ path: "status", message: "Must be draft, active or retired." });
  }
  if (!config.approved_by) {
    errors.push({ path: "approved_by", message: "Required: approving owner." });
  }

  const questionIds = new Set(questions.map((q) => q.question_id));
  const duplicateIds = questions
    .map((q) => q.question_id)
    .filter((id, i, arr) => arr.indexOf(id) !== i);
  if (duplicateIds.length) {
    errors.push({
      path: "questions",
      message: `Duplicate question ids: ${duplicateIds.join(", ")}.`,
    });
  }

  for (const q of questions) {
    const prefix = `questions.${q.question_id}`;
    if (!questionIds.has(q.question_id)) continue;
    if (!SECTION_ORDER.includes(q.section)) {
      errors.push({ path: `${prefix}.section`, message: `Unknown section ${q.section}.` });
    }
    if (!q.text) errors.push({ path: `${prefix}.text`, message: "Required." });
    // Appendix B: help_text is a required question field — an empty string
    // indicates no help text is approved for that question.
    if (typeof q.help_text !== "string") {
      errors.push({ path: `${prefix}.help_text`, message: "Required string; use \"\" when no help text is approved." });
    }
    if (q.required === undefined) errors.push({ path: `${prefix}.required`, message: "Required." });
    if (!Array.isArray(q.options) || q.options.length < 2) {
      errors.push({ path: `${prefix}.options`, message: "At least two options required." });
    }
    const scoredOptions = q.options.filter((o) => o.raw_score !== undefined);
    for (const o of scoredOptions) {
      if (!Number.isInteger(o.raw_score) || o.raw_score! < 0 || o.raw_score! > 3) {
        errors.push({
          path: `${prefix}.options.${o.option_id}.raw_score`,
          message: "Must be an integer between 0 and 3.",
        });
      }
    }
    const unknowns = q.options.filter((o) => o.unknown_flag);
    if (unknowns.length > 1) {
      errors.push({
        path: `${prefix}.options`,
        message: "At most one unknown option per question.",
      });
    }
  }

  // Exactly 18 scored questions across six dimensions (PRD §8.2)
  const scoredQuestions = questions.filter((q) => q.active && q.section !== "opportunity");
  if (scoredQuestions.length !== 18) {
    errors.push({
      path: "questions",
      message: `Expected 18 active scored questions, found ${scoredQuestions.length}.`,
    });
  }
  const routingQuestions = questions.filter(
    (q) => q.active && q.section === "opportunity",
  );
  if (routingQuestions.length !== 6) {
    errors.push({
      path: "questions",
      message: `Expected 6 active opportunity-routing questions, found ${routingQuestions.length}.`,
    });
  }

  let weightSum = 0;
  for (const d of dimensions) {
    const prefix = `dimensions.${d.dimension_id}`;
    if (d.dimension_id === "opportunity") {
      errors.push({ path: `${prefix}`, message: "Opportunity routing is not scored." });
    }
    if (!Number.isFinite(d.weight) || d.weight < 0 || d.weight > 1) {
      errors.push({ path: `${prefix}.weight`, message: "Weight must be 0–1." });
    }
    weightSum += d.weight;
    for (const qid of d.question_ids) {
      if (!questionIds.has(qid)) {
        errors.push({
          path: `${prefix}.question_ids`,
          message: `References unknown question ${qid}.`,
        });
      }
    }
    if (d.question_ids.length !== 3) {
      errors.push({
        path: `${prefix}.question_ids`,
        message: `Expected 3 questions per dimension, found ${d.question_ids.length}.`,
      });
    }
  }
  if (Math.abs(weightSum - 1) > 1e-9) {
    errors.push({ path: "dimensions", message: `Dimension weights sum to ${weightSum}, must equal 1.` });
  }

  for (let i = 0; i < classifications.length; i++) {
    const c = classifications[i]!;
    const prefix = `classifications[${i}]`;
    if (c.minimum_score > c.maximum_score) {
      errors.push({ path: prefix, message: "minimum_score exceeds maximum_score." });
    }
    if (i > 0) {
      const prev = classifications[i - 1]!;
      if (c.minimum_score !== prev.maximum_score + 1) {
        errors.push({ path: prefix, message: "Classification bands must be contiguous." });
      }
    }
  }
  if (classifications.length < 2) {
    errors.push({ path: "classifications", message: "At least two classification bands required." });
  }
  if (gates.length === 0) {
    errors.push({ path: "gates", message: "At least one critical gate required." });
  }
  if (routes.length === 0) {
    errors.push({ path: "routes", message: "At least one intervention route required." });
  }
  for (const g of gates) {
    if (!g.gate_id || !g.trigger_expression || !g.risk_text || !g.required_action) {
      errors.push({ path: `gates.${g.gate_id}`, message: "Missing required gate fields." });
    }
  }
  for (const r of routes) {
    if (!r.route_id || !r.trigger_expression || !r.label) {
      errors.push({ path: `routes.${r.route_id}`, message: "Missing required route fields." });
    }
  }
  for (const rec of recommendations) {
    if (!rec.recommendation_id || !rec.trigger || !rec.title || !rec.action || !rec.timeframe) {
      errors.push({
        path: `recommendations.${rec.recommendation_id}`,
        message: "Missing required recommendation fields.",
      });
    }
  }

  // Phase 4: optional freemium products priced in Naira (PRD §9).
  const premium = config.premium;
  const premiumUnlockTokens = new Set(["detailed_roadmaps", "roi_projections", "full_pdf"]);
  if (premium) {
    const products = Array.isArray(premium.products) ? premium.products : [];
    if (products.length === 0) {
      errors.push({ path: "premium.products", message: "premium.products must be a non-empty array." });
    }
    const seenProductKeys = new Set<string>();
    products.forEach((product, index) => {
      const prefix = `premium.products[${index}]`;
      if (!product.key || typeof product.key !== "string") {
        errors.push({ path: `${prefix}.key`, message: "key is required." });
      } else if (seenProductKeys.has(product.key)) {
        errors.push({ path: `${prefix}.key`, message: `Duplicate product key: ${product.key}` });
      } else {
        seenProductKeys.add(product.key);
      }
      for (const field of ["title", "tagline", "short_description"] as const) {
        if (!product[field] || typeof product[field] !== "string") {
          errors.push({ path: `${prefix}.${field}`, message: `${field} is required.` });
        }
      }
      if (!Number.isInteger(product.price_naira) || product.price_naira <= 0) {
        errors.push({ path: `${prefix}.price_naira`, message: "price_naira must be a positive whole Naira amount." });
      }
      if (!Array.isArray(product.unlocks) || product.unlocks.length === 0) {
        errors.push({ path: `${prefix}.unlocks`, message: "unlocks must list at least one premium token." });
      } else {
        product.unlocks.forEach((token) => {
          if (!premiumUnlockTokens.has(token)) {
            errors.push({ path: `${prefix}.unlocks`, message: `Unknown unlock token: ${token}` });
          }
        });
      }
    });
  }

  const seenListFields = new Set<string>();
  for (const l of controlledLists) {
    if (!["country", "industry", "employee_range"].includes(l.field)) {
      errors.push({ path: "controlled_lists", message: `Unknown field ${l.field}.` });
    }
    if (seenListFields.has(l.field)) {
      errors.push({ path: "controlled_lists", message: `Duplicate list for ${l.field}.` });
    }
    seenListFields.add(l.field);
    if (!l.values || l.values.length === 0) {
      errors.push({ path: `controlled_lists.${l.field}`, message: "At least one value required." });
    }
  }

  return errors;
}
