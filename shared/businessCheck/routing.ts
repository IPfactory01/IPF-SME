/**
 * The Business Health Check names the first product to buy and the one after it (Operational Business Plan, page 18:
 * "the check is the start of every sale"). Fixed rules on the answers, in this order:
 *
 *   1. A large business: the Business Review; work across functions goes to Enzo Krypton from there.
 *   2. Three or more areas stuck: several connected problems, so the Business Review.
 *   3. A lender window or a funding need: the Funding Readiness Assessment.
 *   4. Otherwise the main problem area decides (finance, pricing, strategy, people, sales).
 *   5. An owner on their own at an early revenue level is never routed above a Done for You product.
 *
 * Product ids come from shared/products.ts; a test checks each exists and that every route is on the menu.
 */
import { productById, startingAmount } from "../products";
import type { Answers } from "./questions";

export type FirstStep = {
  /** The first product to buy (shared/products.ts id). */
  productId: string;
  /** For the Six-Week Fix: which of its problems. */
  variantId?: string;
  /** Why, in one short sentence the owner recognises. */
  because: string;
  /** What usually follows it. */
  nextProductId?: string;
  nextVariantId?: string;
};

/** What the routing needs from the evaluated check (shared/businessCheck/engine.ts), so this file has no cycle with it. */
export type RoutingInput = {
  answers: Answers;
  route: "advisory" | "programme" | "foundation" | "idea";
  stuckAreas: number[];
  mainArea?: number;
};

const has = (answers: Answers, id: string, ...values: string[]) => {
  const value = answers[id];
  return Array.isArray(value) ? value.some(item => values.includes(item)) : typeof value === "string" && values.includes(value);
};

function step(productId: string, because: string, variantId?: string): FirstStep {
  const product = productById(productId);
  const nextProductId = product?.next;
  return { productId, variantId, because, nextProductId, nextVariantId: product?.nextVariant };
}

function byArea(input: RoutingInput): FirstStep {
  const { answers, mainArea } = input;
  switch (mainArea) {
    case 7:
      if (has(answers, "s7_detail", "mixed_money") || has(answers, "s7_status", "records_unused")) return step("bookkeeping_catch_up", "Your answers say your records are behind or not used to decide.");
      if (has(answers, "s7_detail", "unit_cost")) return step("pricing_unit_cost_review", "Your answers say you don't know what each product really costs you.");
      return step("cash_flow_forecast", "Your answers say cash is tight.");
    case 4:
    case 3:
      if (mainArea === 4 || has(answers, "s3_detail", "price_value")) return step("pricing_unit_cost_review", "Your answers say your prices or margins are unclear.");
      return step("six_week_fix", "Your answers say people like what you sell but don't buy enough of it.", "sales");
    case 5:
      return step("six_week_fix", "Your answers say customers don't come consistently.", "sales");
    case 6:
      if (has(answers, "s6_status", "staff") || has(answers, "s6_detail", "hiring")) return step("hiring_toolkit", "Your answers say you need to hire, or keep, the right people.");
      return step("six_week_fix", "Your answers say nothing moves unless you are there.", "delegation_structure");
    case 8:
    case 9:
    case 10:
      return step("business_review", "Your answers point to questions that touch the whole business.");
    case 0:
      return step("strategy_90_day_plan", "Your answers point to you, the founder, as the place to start: a 90-day plan turns what you know into what the business does next.");
    case 1:
      return step("strategy_90_day_plan", "Your answers say the direction or the priorities are not clear yet.");
    case 2:
      return step("strategy_90_day_plan", "Your answers say you are not yet sure who buys, why, or who else sells to them.");
    default:
      return step("monthly_adviser_review", "Your business looks in good shape on what we asked: the next gains come from regular, sharper decisions.");
  }
}

/** Under this, an owner working alone is pointed to a Done for You product rather than a review or a fix. */
const FOUNDATION_CEILING = 600_000;

export function firstStep(input: RoutingInput): FirstStep {
  const { answers, route, stuckAreas } = input;
  if (route === "advisory") return step("business_review", "At your size, the right start is a Business Review of the whole business.");
  const funding = has(answers, "s7_status", "funding") || has(answers, "s7_detail", "loan") || has(answers, "s1_status", "means") || has(answers, "i_need", "money");
  if (route === "idea") return funding ? step("funding_readiness_assessment", "You need money to start, so the first question is whether a lender would say yes.") : step("strategy_90_day_plan", "Before you commit money, set what the business is for and a first 90 days.");
  if (route !== "foundation" && stuckAreas.length >= 3) return step("business_review", "Several areas are stuck at once, and they are usually one connected problem.");
  if (funding) return step("funding_readiness_assessment", "Your answers say you need funding to grow.");
  const chosen = byArea(input);
  if (route === "foundation") {
    const product = productById(chosen.productId);
    if (!product || product.way !== "done_for_you" || startingAmount(product.price) > FOUNDATION_CEILING) {
      return input.mainArea === 7 ? step("cash_flow_forecast", "Your answers say money is the place to start.") : step("strategy_90_day_plan", "At this stage the biggest lever is a clear plan for the next 90 days.");
    }
  }
  return chosen;
}

/** "Six-Week Fix: Sales", or the product's name. */
export function stepName(productId: string, variantId?: string): string {
  const product = productById(productId);
  if (!product) return "";
  const variant = variantId ? product.variants?.find(item => item.id === variantId) : undefined;
  return variant ? `${product.name}: ${variant.name}` : product.name;
}
