/**
 * The engagement agreement (ET, 6 November 2026): for each engagement, what we will do, what is not included, what the
 * client does, the terms that apply, and the fees with when each is due. The team drafts it (prefilled from the service
 * bought), sends it, and the owner accepts it in their room by typing their name. Any change after sending is a
 * revision the owner accepts again. Fees are in whole naira.
 */
import { DELIVERY_PROMISE, PRODUCTS, perMonthAmount, quarterAmount, stageAmount, type Product } from "./products";
import type { EngagementType } from "./engagementTypes";
import { DIGITAL_MARKETING } from "./engagementTypes";

export const AGREEMENT_STATUSES = ["draft", "sent", "accepted"] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];
export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = { draft: "Draft", sent: "Sent, waiting for the owner", accepted: "Accepted" };

export type FeeLineDraft = { label: string; amount: number; dueOn: string | null };
export type AgreementDraft = { scope: string; outOfScope: string; clientCommitments: string; terms: string; feeLines: FeeLineDraft[] };

/** Limits, shared by the form and the server. */
export const AGREEMENT_LIMITS = { text: 8000, label: 200, feeLines: 24, amount: 100_000_000 } as const;

/** What every agreement says unless the team changes it. */
export const STANDARD_TERMS = `${DELIVERY_PROMISE} Our Terms & Conditions apply. Prices are in naira and include no VAT unless shown. Work starts once the first payment and the records we ask for are in.`;
export const STANDARD_COMMITMENTS = "Send the records on the Data Request, join the Sessions, and tell us early if anything changes.";

const bullets = (lines: readonly string[]) => lines.map(line => `- ${line}`).join("\n");

/** The fee lines a service starts with, from its price on the website. */
export function feeLinesFor(product: Product): FeeLineDraft[] {
  const price = product.price;
  switch (price.kind) {
    case "free": return [];
    case "fixed": return [{ label: product.name, amount: price.amount, dueOn: null }];
    case "milestones": return price.stages.map(stage => ({ label: `${product.name}: ${stage.name.toLowerCase()} (${stage.percent}%)`, amount: stageAmount(price, stage.percent), dueOn: null }));
    case "per_month": return [{ label: `${product.name}: ${price.minMonths} months of records`, amount: perMonthAmount(price, price.minMonths), dueOn: null }];
    case "quarterly": return [{ label: `${product.name}: first quarter`, amount: quarterAmount(price), dueOn: null }];
  }
}

/** Where a new agreement starts: the service's own promise and price, or the type's; the team edits all of it. */
export function defaultAgreement(type: EngagementType, service: string | null): AgreementDraft {
  const product = PRODUCTS.find(item => item.id === (service ?? (type === "business_review" ? "business_review" : type === "six_week_fix" ? "six_week_fix" : "")));
  if (product) {
    return {
      scope: `${product.short}\n\nYou get:\n${bullets(product.youGet)}\n\nDelivery: ${product.delivery}`,
      outOfScope: "Anything not listed above. Work beyond it is agreed and priced separately before it starts.",
      clientCommitments: STANDARD_COMMITMENTS,
      terms: STANDARD_TERMS,
      feeLines: feeLinesFor(product),
    };
  }
  if (type === "digital_marketing") {
    return {
      scope: `A ${DIGITAL_MARKETING.durationDays}-day content programme:\n${bullets(DIGITAL_MARKETING.monthly.map(item => `${item.count} ${item.label.toLowerCase()} a month`))}\n- A Weekly Check-in and a review each month\n- Nothing is published without your approval`,
      outOfScope: "Paid advertising spend, photography or filming days, and accounts we have no access to.",
      clientCommitments: "Send footage and approvals on time, give us partner access to your accounts, and tell us early about offers and events.",
      terms: STANDARD_TERMS,
      feeLines: [],
    };
  }
  return { scope: "", outOfScope: "", clientCommitments: STANDARD_COMMITMENTS, terms: STANDARD_TERMS, feeLines: [] };
}

export const feeTotal = (lines: readonly { amount: number }[]) => lines.reduce((sum, line) => sum + line.amount, 0);
