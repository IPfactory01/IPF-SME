/**
 * Engagement fees (ET, 6 November 2026). There are no proposals or agreements on the platform: a client agrees by paying,
 * or on the call, under the Terms and Conditions. Each engagement keeps a fee schedule, filled in from the service's
 * price on the website, or for Digital marketing from its monthly fee, and the team records each payment. Fees are in
 * whole naira. (The file keeps its name so the 0019 tables it describes are easy to find.)
 */
import { PRODUCTS, firstHalf, isService, perMonthAmount, quarterAmount, stageAmount, type Product } from "./products";
import type { EngagementType } from "./engagementTypes";
import { DIGITAL_MARKETING } from "./engagementTypes";
import type { EngagementDeliverableKind } from "./engagement";

/** The statuses of the retired engagement_agreements table (0019), kept for the schema; nothing writes them now. */
export const AGREEMENT_STATUSES = ["draft", "sent", "accepted"] as const;

export type FeeLineDraft = { label: string; amount: number; dueOn: string | null };

/** Limits, shared by the form and the server. */
export const AGREEMENT_LIMITS = { label: 200, feeLines: 24, amount: 100_000_000 } as const;

/** A day `days` after a date ("2026-11-09"), as a date. */
export const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * The fee lines a service starts with, from its price on the website and how it is bought (R36, ET 10 November 2026):
 * bought online, paid before we start; agreed on a call, half to start and half on delivery (the Six-Week Fix's stages
 * are those two halves); a Monthly Service, its first quarter. The first part is dated the start day; a second half has
 * no date until delivery (`dateBalancesOnDelivery`).
 */
export function feeLinesFor(product: Product, startsOn: string | null = null): FeeLineDraft[] {
  const price = product.price;
  switch (price.kind) {
    case "free": return [];
    case "fixed": {
      if (!isService(product)) return [{ label: `${product.name}, payable before work begins`, amount: price.amount, dueOn: startsOn }];
      const first = firstHalf(price.amount);
      return [
        { label: `${product.name}: half to start`, amount: first, dueOn: startsOn },
        { label: `${product.name}: half on delivery`, amount: price.amount - first, dueOn: null },
      ];
    }
    case "milestones": return price.stages.map((stage, index) => ({ label: `${product.name}: ${stage.name.toLowerCase()} (${stage.percent}%)`, amount: stageAmount(price, stage.percent), dueOn: index === 0 ? startsOn : null }));
    case "per_month": return [{ label: `${product.name}: ${price.minMonths} months of records`, amount: perMonthAmount(price, price.minMonths), dueOn: startsOn }];
    case "quarterly": return [{ label: `${product.name}: first quarter, payable before it starts`, amount: quarterAmount(price), dueOn: startsOn }];
  }
}

/**
 * Where an engagement's fees start: the service's price, or the type's. Digital marketing is a monthly service fee for
 * the 90 days, each month payable before it begins: on starting, then day 31 and day 61.
 */
export function defaultFees(type: EngagementType, service: string | null, startsOn: string | null = null): FeeLineDraft[] {
  const product = PRODUCTS.find(item => item.id === (service ?? (type === "business_review" ? "business_review" : type === "six_week_fix" ? "six_week_fix" : "")));
  if (product) return feeLinesFor(product, startsOn);
  if (type === "digital_marketing") {
    const fee = DIGITAL_MARKETING.monthlyFee ?? 0;
    const on = (days: number) => (startsOn ? addDays(startsOn, days) : null);
    return [
      { label: "Month 1 service fee, payable on starting", amount: fee, dueOn: on(0) },
      { label: "Month 2 service fee, payable before day 31", amount: fee, dueOn: on(30) },
      { label: "Month 3 service fee, payable before day 61", amount: fee, dueOn: on(60) },
    ];
  }
  return [];
}

/** How many days after delivery a service's second half falls due (ET, 10 November 2026). */
export const BALANCE_DUE_DAYS = 7;

/**
 * Whether sharing this Deliverable is the engagement's delivery, which dates its second half (R36): a Business Review's
 * Findings, a Six-Week Fix's Plan (its result), any work of a Done for You service. Digital marketing and Monthly
 * Services are paid by the month or the quarter, so nothing waits on a delivery.
 */
export function isDelivery(type: EngagementType, kind: EngagementDeliverableKind) {
  if (type === "business_review" || type === "assessment") return kind === "findings";
  if (type === "six_week_fix") return kind === "plan";
  return type === "done_for_you";
}

export const feeTotal = (lines: readonly { amount: number }[]) => lines.reduce((sum, line) => sum + line.amount, 0);
