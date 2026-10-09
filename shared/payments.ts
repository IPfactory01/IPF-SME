import { CURRENT_STATE, FULL_REPORT, formatNaira, PRICES } from "./businessSupport";

/**
 * Paying for The Shift before online payment (Paystack) is ready: the team emails payment details, the owner pays by
 * bank transfer and replies with proof, and the team confirms the money arrived. Confirming the Current State
 * Assessment payment is what starts the Current State Assessment.
 */

export const PAYMENT_ITEMS = ["full_report", "current_state"] as const;
export type PaymentItem = (typeof PAYMENT_ITEMS)[number];

export const PAYMENT_ITEM_DETAILS: Record<PaymentItem, { name: string; amount: number; code: string }> = {
  full_report: { name: FULL_REPORT.name, amount: PRICES.fullReport, code: "R" },
  current_state: { name: CURRENT_STATE.name, amount: PRICES.currentState, code: "CS" },
};

/** requested: details emailed · proof_received: the owner sent proof, not yet checked · confirmed: the money arrived. */
export const PAYMENT_STATUSES = ["requested", "proof_received", "confirmed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  requested: "Awaiting payment",
  proof_received: "Proof received",
  confirmed: "Paid",
};

/**
 * Payment details hold for 48 hours (concept note §7 and §11: the payment link is sent after the call with a 48-hour
 * window). Sending the details again starts a new window. After it, an unpaid request shows as passed so the team can
 * send fresh details or move the business to Lost; money that still arrives can always be confirmed.
 */
export const PAYMENT_WINDOW_HOURS = 48;

export const paymentDeadline = (requestedAt: Date | string) => new Date(new Date(requestedAt).getTime() + PAYMENT_WINDOW_HOURS * 3_600_000);

/** What the team sees. Only a request still awaiting payment can pass its window; proof or payment never expires. */
export type PaymentDisplayStatus = PaymentStatus | "expired";

export function effectivePaymentStatus(request: { status: PaymentStatus; requestedAt: Date | string }, now: Date = new Date()): PaymentDisplayStatus {
  return request.status === "requested" && now.getTime() > paymentDeadline(request.requestedAt).getTime() ? "expired" : request.status;
}

export const PAYMENT_DISPLAY_LABELS: Record<PaymentDisplayStatus, string> = { ...PAYMENT_STATUS_LABELS, expired: "48 hours passed" };

/** The reference the owner puts on the transfer, e.g. TS-R-000123 (report) or TS-CS-000123 (Current State Assessment). */
export function paymentReference(item: PaymentItem, businessCheckId: number) {
  return `TS-${PAYMENT_ITEM_DETAILS[item].code}-${String(businessCheckId).padStart(6, "0")}`;
}

/** "₦100,000 for your full business check report" or "₦500,000 for your Current State Assessment". */
export function describePayment(item: PaymentItem) {
  const { name, amount } = PAYMENT_ITEM_DETAILS[item];
  return `${formatNaira(amount)} for ${item === "full_report" ? name.charAt(0).toLowerCase() + name.slice(1) : `your ${name}`}`;
}
