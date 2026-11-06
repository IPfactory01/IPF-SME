/**
 * The engagement agreement (ET, 6 November 2026): for each engagement, what we will do, what is not included, what the
 * client does, the terms that apply, and the fees with when each is due. The team drafts it (prefilled from the service
 * bought), sends it, and the owner accepts it in their room by typing their name. Any change after sending is a
 * revision the owner accepts again. Fees are in whole naira.
 */
import { PRODUCTS, perMonthAmount, quarterAmount, stageAmount, type Product } from "./products";
import type { EngagementType } from "./engagementTypes";
import { DIGITAL_MARKETING } from "./engagementTypes";

export const AGREEMENT_STATUSES = ["draft", "sent", "accepted"] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];
export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = { draft: "Draft", sent: "Sent, waiting for the owner to sign", accepted: "Signed" };

export type FeeLineDraft = { label: string; amount: number; dueOn: string | null };
export type AgreementDraft = { scope: string; outOfScope: string; clientCommitments: string; terms: string; feeLines: FeeLineDraft[] };

/** Limits, shared by the form and the server. */
export const AGREEMENT_LIMITS = { text: 8000, label: 200, feeLines: 24, amount: 100_000_000 } as const;

/**
 * What every proposal says unless the team changes it, in the house register (ipf-writing-style v1.4): professional,
 * third person, the client by role. The text is set as a document in the room (ProposalText): a line ending in a colon
 * is a subheading and "- Item: detail" lines form a two-column table.
 */
export const STANDARD_TERMS = "IP Factory confirms the delivery date once the client's records are complete. Where IP Factory cannot deliver as agreed, it provides a remedy in line with its Terms and Conditions: a refund, a service credit or an agreed alternative. Fees are stated in naira and exclude VAT unless shown. Work begins once the first payment and the requested records are received.";
export const STANDARD_COMMITMENTS = "The client provides the records listed in the Data Request by the dates shown, attends the scheduled Sessions, and informs IP Factory promptly of any change that affects the work.";
const STANDARD_EXCLUSIONS = "Work outside the scope above. Any additional work is scoped and priced separately before it starts.";

const bullets = (lines: readonly string[]) => lines.map(line => `- ${line}`).join("\n");

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

/** Digital marketing milestones as the proposal states them, by day of the 90. */
const DIGITAL_MARKETING_MILESTONES = [
  "Onboarding (days 1 to 7): brand assets collected, account access granted and the month 1 content plan agreed",
  "Month 1 (days 8 to 30): content produced and published each week, each piece approved by the client before publication",
  "Month 1 review (day 31): reach, engagement and enquiries against the baseline, and the changes for month 2",
  "Month 2 (days 32 to 60): content shaped by the month 1 results",
  "Month 3 (days 61 to 89): content for the final month and the plan for the following quarter",
  "Quarter review (day 90): results for the quarter and a recommendation on continued support",
];

/** Where a new proposal starts: the service's own promise and price, or the type's; the team edits all of it. */
export function defaultAgreement(type: EngagementType, service: string | null): AgreementDraft {
  const product = PRODUCTS.find(item => item.id === (service ?? (type === "business_review" ? "business_review" : type === "six_week_fix" ? "six_week_fix" : "")));
  if (product) {
    return {
      scope: `${product.short}\n\nDeliverables:\n${bullets(product.youGet)}\n\nDelivery:\n${product.delivery}`,
      outOfScope: STANDARD_EXCLUSIONS,
      clientCommitments: STANDARD_COMMITMENTS,
      terms: STANDARD_TERMS,
      feeLines: feeLinesFor(product),
    };
  }
  if (type === "digital_marketing") {
    const fee = DIGITAL_MARKETING.monthlyFee ?? 0;
    return {
      scope: [
        `IP Factory plans, produces and publishes the client's social media content for ${DIGITAL_MARKETING.durationDays} days. No content is published without the client's approval.`,
        "Monthly deliverables:",
        bullets(DIGITAL_MARKETING.monthly.map(item => `${item.label}: ${item.count} a month`)),
        "Reporting and reviews:",
        bullets(["Weekly check-in: progress, the content schedule and items awaiting approval", "Month 1 review: performance against the baseline and changes for month 2", "Quarter review: results for the 90 days and a recommendation on continued support"]),
        "Milestones:",
        bullets(DIGITAL_MARKETING_MILESTONES),
      ].join("\n\n"),
      outOfScope: "Paid advertising spend, photography or filming days, and the management of accounts to which IP Factory has not been given access. Any additional work is scoped and priced separately before it starts.",
      clientCommitments: "The client provides raw footage each week, reviews and approves content within the turnaround agreed at onboarding, grants IP Factory partner access to its Instagram and Facebook accounts through Meta Business Suite, and informs IP Factory of offers and events in advance.",
      terms: `${STANDARD_TERMS} The service fee is payable monthly in advance: the first month on signing, and each later month before it begins.`,
      feeLines: [
        { label: "Month 1 service fee, payable on signing", amount: fee, dueOn: null },
        { label: "Month 2 service fee, payable before day 31", amount: fee, dueOn: null },
        { label: "Month 3 service fee, payable before day 61", amount: fee, dueOn: null },
      ],
    };
  }
  return { scope: "", outOfScope: STANDARD_EXCLUSIONS, clientCommitments: STANDARD_COMMITMENTS, terms: STANDARD_TERMS, feeLines: [] };
}

export const feeTotal = (lines: readonly { amount: number }[]) => lines.reduce((sum, line) => sum + line.amount, 0);
