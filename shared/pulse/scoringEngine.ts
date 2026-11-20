/**
 * IPF AI & Workflow Readiness Pulse — deterministic scoring engine (PRD §9).
 *
 * Pure function of (active method config, session answers). No database,
 * no LLM, no randomness: given the same answers and the same active method
 * version this always returns the same result, which is what makes the
 * methodology auditable and version-controlled.
 *
 * Scoring (Appendix B):
 *  - Each scored question answer maps to its option raw_score (0–3).
 *  - Dimension score = mean of its question raw scores × (100/3), rounded.
 *  - Overall = weighted mean of dimension scores (dimension_weight),
 *    rounded to the nearest integer (0–100).
 *  - Classification via score band; boundaries at 30/50/70/85.
 *  - Gates evaluate trigger_expression; gated results carry required_action.
 *  - Routes evaluate with priority ordering.
 *  - Recommendations match trigger_expression with approved segment/
 *    pathway filters.
 *  - Evidence-visibility warning when more than one-third of scored
 *    questions were answered "I don't know".
 */

import type {
  PulseMethodConfig,
  PulseResult,
} from "./configTypes";

export interface AnswerRecord {
  /** Option selected (null when skipped). */
  optionId: string | null;
  /** Whether the "I don't know" option was selected. */
  unknown: boolean;
  /** Raw score of the selected option, if it has one. */
  rawScore: number | null;
}

export interface EvaluateInput {
  /** questionId -> answer record */
  answers: Record<string, AnswerRecord>;
}

/**
 * Builds the answer record map from raw per-question selections.
 * unknownIds is the set of option ids marked unknown_flag=true.
 */
export function buildAnswers(
  config: PulseMethodConfig,
  selections: Record<string, string | null | undefined>,
  unknownOptionIds: Set<string>
): Record<string, AnswerRecord> {
  const byOption = new Map<string, { questionId: string; rawScore: number | null }>();
  for (const q of config.questions) {
    for (const o of q.options) {
      byOption.set(o.option_id, {
        questionId: q.question_id,
        rawScore: o.raw_score ?? null,
      });
    }
  }
  const out: Record<string, AnswerRecord> = {};
  for (const [questionId, optionId] of Object.entries(selections)) {
    const info = optionId ? byOption.get(optionId) : undefined;
    out[questionId] = {
      optionId: optionId ?? null,
      unknown: optionId !== null && optionId !== undefined && unknownOptionIds.has(optionId),
      rawScore: info?.rawScore ?? null,
    };
  }
  return out;
}

export function collectUnknownOptionIds(config: PulseMethodConfig): Set<string> {
  const ids = new Set<string>();
  for (const q of config.questions) {
    for (const o of q.options) {
      if (o.unknown_flag) ids.add(o.option_id);
    }
  }
  return ids;
}

interface Token {
  kind: "num" | "qid" | "op" | "gate" | "atom" | "kw";
  value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  // Word token: starts with a letter or underscore, contains letters, digits,
  // hyphens, underscores and dots (covers S-02, GATE-01, overall_score, AI-USE).
  // Then standalone operators, parens and numbers.
  const re = /([A-Za-z_][A-Za-z0-9_.-]*)|([<>]=?|==)|([()])|(\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  let lastEnd = 0;
  while ((m = re.exec(expr)) !== null) {
    if (m.index > lastEnd) {
      // characters skipped between matches (e.g. whitespace) — advance only
      lastEnd = m.index;
    }
    lastEnd = m.index + m[0].length;
    const v = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (!v) continue;
    let kind: Token["kind"] = "qid";
    if (m[4] !== undefined) kind = "num";
    else if (m[2] !== undefined) kind = "op";
    else if (m[3] !== undefined) kind = "op"; // paren
    else if (/^(AND|OR|NOT|TRUE|FALSE)$/.test(v)) kind = "kw";
    else if (/^(TRUE|FALSE|overall_score|AI-USE)$/.test(v)) kind = "atom";
    else if (/^[A-Z]+-\d+$/.test(v)) kind = "atom"; // gates like GATE-01
    else kind = "qid";
    tokens.push({ kind, value: v });
  }
  return tokens;
}

interface Parser {
  tokens: Token[];
  pos: number;
  questionScores: Record<string, number | null>;
  gateTriggered: Record<string, boolean>;
  overallScore: number;
}

function peek(p: Parser): Token | undefined {
  return p.tokens[p.pos];
}

function consume(p: Parser): Token {
  const t = p.tokens[p.pos++];
  if (!t) throw new Error("Unexpected end of expression");
  return t;
}

function parseOr(p: Parser): boolean {
  let left = parseAnd(p);
  while (peek(p)?.kind === "kw" && peek(p)?.value === "OR") {
    consume(p);
    const right = parseAnd(p);
    left = left || right;
  }
  return left;
}

function parseAnd(p: Parser): boolean {
  let left = parseUnary(p);
  while (peek(p)?.kind === "kw" && peek(p)?.value === "AND") {
    consume(p);
    const right = parseUnary(p);
    left = left && right;
  }
  return left;
}

function parseUnary(p: Parser): boolean {
  if (peek(p)?.kind === "kw" && peek(p)?.value === "NOT") {
    consume(p);
    return !parseUnary(p);
  }
  if (peek(p)?.value === "(") {
    consume(p);
    const inner = parseOr(p);
    if (consume(p).value !== ")") throw new Error("Missing closing parenthesis");
    return inner;
  }
  return parseComparison(p);
}

function parseComparison(p: Parser): boolean {
  const left = consume(p);
  const next = peek(p);
  if (next?.kind === "op") {
    consume(p);
    const right = consume(p);
    if (right.kind !== "num") {
      throw new Error(`Comparison right side must be numeric, got ${right.value}`);
    }
    const rhs = Number(right.value);
    const lhs = resolveScalar(p, left);
    if (lhs === null) return false;
    switch (next.value) {
      case "==": return lhs === rhs;
      case "<": return lhs < rhs;
      case ">": return lhs > rhs;
      case "<=": return lhs <= rhs;
      case ">=": return lhs >= rhs;
    }
  }
  // Bare atom: gate tokens read from the trigger map (evaluated lazily with
  // the optional gate condition, e.g. GATE-01 with condition "AI-USE");
  // question ids and keywords resolve truthfully as below.
  if (left.kind === "atom" || left.kind === "qid") {
    if (/^GATE-\d+$/.test(left.value)) {
      return !!p.gateTriggered[left.value];
    }
    if (left.value === "AI-USE") {
      // True when any AI-USE question reports actual AI use (raw_score not null
      // and not unknown). Mirrors the approved "AI use reported" condition.
      return Object.values(p.questionScores).some((s) => s !== null);
    }
    if (left.value === "TRUE") return true;
    if (left.value === "FALSE") return false;
    return false;
  }
  if (left.kind === "num") return Number(left.value) !== 0;
  throw new Error(`Invalid expression token: ${left.value}`);
}

function resolveScalar(p: Parser, t: Token): number | null {
  if (t.kind === "num") return Number(t.value);
  if (t.value === "overall_score") return p.overallScore;
  if (t.kind === "qid" || t.kind === "atom") {
    const q = t.kind === "atom" && /^[A-Z]+-\d+$/.test(t.value) ? t.value : null;
    if (q && q in p.questionScores) return p.questionScores[q];
    return null;
  }
  return null;
}

/**
 * Evaluates a trigger expression against scored answers. Throws on syntax
 * errors so configuration problems are surfaced instead of silently
 * returning false.
 */
export function evaluateExpression(
  expression: string,
  ctx: {
    questionScores: Record<string, number | null>;
    gateTriggered: Record<string, boolean>;
    overallScore: number;
  }
): boolean {
  const p: Parser = {
    tokens: tokenize(expression),
    pos: 0,
    questionScores: ctx.questionScores,
    gateTriggered: ctx.gateTriggered,
    overallScore: ctx.overallScore,
  };
  const result = parseOr(p);
  if (p.pos !== p.tokens.length) {
    throw new Error(`Unconsumed expression tokens at ${p.tokens[p.pos]?.value}`);
  }
  return result;
}

function dimensionScore(
  questionIds: string[],
  questions: PulseMethodConfig["questions"],
  answers: Record<string, AnswerRecord>
): { score: number; answered: number; unknowns: number } | null {
  const byId = new Map(questions.map((q) => [q.question_id, q]));
  const scoredQuestions = questionIds
    .map((id) => byId.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q && q.active !== false);
  if (scoredQuestions.length === 0) return null;
  let total = 0;
  let answered = 0;
  let unknowns = 0;
  for (const q of scoredQuestions) {
    const a = answers[q.question_id];
    if (!a) continue;
    if (a.rawScore === null && !a.unknown) continue; // unanswered (skipped) — not evidence
    answered++;
    if (a.unknown) {
      // "I do not know": counts as answered, scores 0, flags evidence gap (PRD §9)
      unknowns++;
      continue;
    }
    total += a.rawScore!;
  }
  if (answered === 0) return { score: 0, answered, unknowns };
  return { score: Math.round((total / answered / 3) * 100), answered, unknowns };
}

export function evaluate(config: PulseMethodConfig, input: EvaluateInput): PulseResult {
  const answers = input.answers;

  // Dimension scores from the configured weight set
  const dimensionScores: Record<string, number> = {};
  let totalAnswered = 0;
  let totalUnknowns = 0;
  for (const w of config.dimensions) {
    const d = dimensionScore(w.question_ids, config.questions, answers);
    if (d) {
      dimensionScores[w.dimension_id] = d.score;
      totalAnswered += d.answered;
      totalUnknowns += d.unknowns;
    }
  }

  // Overall weighted composite
  const totalWeight = config.dimensions.reduce((s, w) => s + (w.weight ?? 1), 0);
  let weighted = 0;
  for (const w of config.dimensions) {
    weighted += (dimensionScores[w.dimension_id] ?? 0) * (w.weight ?? 1);
  }
  const overallScore = totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;

  // Classification by band (boundaries 30 / 50 / 70 / 85 per Appendix B)
  const classification = [...config.classifications]
    .sort((a, b) => a.minimum_score - b.minimum_score)
    .find((c) => overallScore >= c.minimum_score && overallScore <= c.maximum_score);

  // Gates
  const questionScores: Record<string, number | null> = {};
  for (const q of config.questions) {
    questionScores[q.question_id] = answers[q.question_id]?.rawScore ?? null;
  }
  const gatesCtx = { questionScores, gateTriggered: {} as Record<string, boolean>, overallScore };
  const triggeredGates: PulseResult["gates"] = [];
  for (const g of config.gates) {
    if (!g.trigger_expression) continue;
    try {
      const baseTriggered = evaluateExpression(g.trigger_expression, gatesCtx);
      if (!baseTriggered) continue;
      // Gate condition (e.g. "AI-USE"): gate only applies when the condition
      // is additionally satisfied — a gated workflow must actually be in use
      // before its risk is enforced (PRD §9.2).
      const condition = g.condition?.trim() || null;
      if (condition === "AI-USE") {
        const aiUseReported = Object.values(questionScores).some((s) => s !== null);
        if (!aiUseReported) continue;
      } else if (condition) {
        // Unknown condition value in configuration — fail open per PRD:
        // the base expression governs; log to admin via config review.
      }
      gatesCtx.gateTriggered[g.gate_id] = true;
      triggeredGates.push({
        gateId: g.gate_id,
        riskText: g.risk_text,
        requiredAction: g.required_action,
        effect: g.effect,
      });
    } catch {
      // Misformed expression in configuration is surfaced to admin, not to
      // the respondent; the gate is not triggered.
    }
  }

  // Routes: evaluate all, then order by priority (1 primary first)
  const routesCtx = { ...gatesCtx };
  const eligibleRoutes: PulseResult["routes"] = [];
  for (const r of config.routes) {
    if (!r.trigger_expression) continue;
    try {
      if (evaluateExpression(r.trigger_expression, routesCtx)) {
        eligibleRoutes.push({ routeId: r.route_id, priority: r.priority });
      }
    } catch {
      // route left out
    }
  }
  const sortedRoutes = [...eligibleRoutes].sort((a, b) => a.priority - b.priority);

  // Recommendations: match trigger with segment/pathway approval
  const recommended: PulseResult["recommendations"] = [];
  for (const rec of config.recommendations) {
    if (rec.status === "retired") continue;
    if (rec.segment !== null || rec.pathway !== null) continue; // v1.0.0 has no segment/pathway scoping approved
    try {
      if (rec.trigger && evaluateExpression(rec.trigger, routesCtx)) {
        recommended.push({
          recommendationId: rec.recommendation_id,
          title: rec.title,
          action: rec.action,
          timeframe: rec.timeframe,
          pathway: rec.pathway,
        });
      }
    } catch {
      // left out
    }
  }

  // Evidence-visibility warning: unknowns > 1/3 of answered scored questions
  const showEvidenceWarning =
    totalAnswered > 0 && totalUnknowns / totalAnswered > 1 / 3;

  return {
    overallScore,
    classification: classification
      ? { label: classification.label, interpretation: classification.interpretation }
      : { label: "Unscored", interpretation: "No applicable classification band." },
    dimensions: dimensionScores,
    gates: triggeredGates,
    routes: sortedRoutes,
    recommendations: recommended,
    showEvidenceWarning,
    unknownCount: totalUnknowns,
    answeredCount: totalAnswered,
    questionScores,
  };
}

