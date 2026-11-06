/**
 * Engagement fees (ET, 6 November 2026). There are no proposals or agreements on the platform: a client agrees by paying,
 * or on the call, under the Terms and Conditions. Each engagement keeps a fee schedule, filled in from the service's
 * price on the website, or for Digital marketing from its monthly fee, and the team records each payment. Fees are in
 * whole naira. (The file keeps its name so the 0019 tables it describes are easy to find.)
 */
import { PRODUCTS, perMonthAmount, quarterAmount, stageAmount, type Product } from "./products";
import type { EngagementType } from "./engagementTypes";
import { DIGITAL_MARKETING } from "./engagementTypes";

/** The statuses of the retired engagement_agreements table (0019), kept for the schema; nothing writes them now. */
export const AGREEMENT_STATUSES = ["draft", "sent", "accepted"] as const;

export type FeeLineDraft = { label: string; amount: number; dueOn: string | null };

/** Limits, shared by the form and the server. */
export const AGREEMENT_LIMITS = { label: 200, feeLines: 24, amount: 100_000_000 } as const;

/** The fee lines a service starts with, from its price on the website. */
export function feeLinesFor(product: Product): FeeLineDraft[] {
  const price = product.price;
  switch (price.kind) {
    case "free": return [];
    case "fixed": return [{ label: `${product.name}, payable before work begins`, amount: price.amount, dueOn: null }];
    case "milestones": return price.stages.map(stage => ({ label: `${product.name}: ${stage.name.toLowerCase()} (${stage.percent}%)`, amount: stageAmount(price, stage.percent), dueOn: null }));
    case "per_month": return [{ label: `${product.name}: ${price.minMonths} months of records`, amount: perMonthAmount(price, price.minMonths), dueOn: null }];
    case "quarterly": return [{ label: `${product.name}: first quarter, payable before it starts`, amount: quarterAmount(price), dueOn: null }];
  }
}

/**
 * Where an engagement's fees start: the service's price, or the type's. Digital marketing is a monthly service fee for
 * the 90 days, each month payable before it begins, the first on starting.
 */
export function defaultFees(type: EngagementType, service: string | null): FeeLineDraft[] {
  const product = PRODUCTS.find(item => item.id === (service ?? (type === "business_review" ? "business_review" : type === "six_week_fix" ? "six_week_fix" : "")));
  if (product) return feeLinesFor(product);
  if (type === "digital_marketing") {
    const fee = DIGITAL_MARKETING.monthlyFee ?? 0;
    return [
      { label: "Month 1 service fee, payable on starting", amount: fee, dueOn: null },
      { label: "Month 2 service fee, payable before day 31", amount: fee, dueOn: null },
      { label: "Month 3 service fee, payable before day 61", amount: fee, dueOn: null },
    ];
  }
  return [];
}

export const feeTotal = (lines: readonly { amount: number }[]) => lines.reduce((sum, line) => sum + line.amount, 0);
