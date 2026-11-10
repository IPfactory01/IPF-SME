/**
 * The payments ledger (R37, batch F; App flow 3.1, Backend schema section 2): every naira that comes in is one payment
 * against one fee, or, until the Business Review and the Full Report become fees (F3, R13), one payment request.
 * Nothing about money is deleted: a payment recorded by hand by mistake is cancelled, a refund is recorded against the
 * payment it returns, and a write-off can be reversed.
 */

/** How the money came. */
export const LEDGER_PAYMENT_METHODS = ["paystack", "bank_transfer", "cash", "other"] as const;
export type LedgerPaymentMethod = (typeof LEDGER_PAYMENT_METHODS)[number];

/** How a payment came, as Finance and the team read it. */
export const PAYMENT_METHOD_LABELS: Record<LedgerPaymentMethod, string> = { paystack: "Paystack", bank_transfer: "Bank transfer", cash: "Cash", other: "Other" };

/**
 * started: a Paystack checkout opened for what was left · paid: confirmed by Paystack, recorded by hand, or accepted ·
 * failed: Paystack says it did not go through · needs_a_look: money moved but did not fit the fee · refunded: refunded
 * in full · cancelled: recorded by hand by mistake, kept and never counted.
 */
export const LEDGER_PAYMENT_STATUSES = ["started", "paid", "failed", "needs_a_look", "refunded", "cancelled"] as const;
export type LedgerPaymentStatus = (typeof LEDGER_PAYMENT_STATUSES)[number];

/** Whether Paystack ran on its test keys (no real money moved) or its live ones. Empty for money recorded by hand. */
export const LEDGER_PAYMENT_MODES = ["test", "live"] as const;
export type LedgerPaymentMode = (typeof LEDGER_PAYMENT_MODES)[number];

/** The numbered documents: a receipt for each payment received, an invoice for each fee once it is billed. */
export const DOCUMENT_NUMBER_KINDS = ["receipt", "invoice"] as const;
export type DocumentNumberKind = (typeof DOCUMENT_NUMBER_KINDS)[number];

const padded = (value: number) => String(value).padStart(6, "0");

/** A receipt's number as people see it: TS-RC-000001. */
export const receiptNumberLabel = (value: number) => `TS-RC-${padded(value)}`;

/** An invoice's number as people see it: TS-IN-000001. */
export const invoiceNumberLabel = (value: number) => `TS-IN-${padded(value)}`;

/** A payment that counts towards its fee: received, and not cancelled. A refunded one counts less its refunds. */
export const countsTowardsFee = (status: LedgerPaymentStatus) => status === "paid" || status === "refunded";

/**
 * A fee marked paid before the ledger that has no payment yet: it counts as paid in full, and Finance lists it as money
 * in without a receipt number, until the first time it is touched carries it over (server/ledger.ts, `carryOver`).
 */
export const paidBeforeLedger = (fee: { paidAt: Date | string | null }, received: readonly { status: LedgerPaymentStatus }[]) =>
  Boolean(fee.paidAt) && !received.some(payment => countsTowardsFee(payment.status));

/**
 * What has been paid on a fee and what is left. `received` is the fee's payments with the refunds against each (cancelled
 * refunds left out). A fee marked paid in full (`paidAt`) has nothing left; one marked paid before the ledger, with no
 * payment yet, counts as paid in full. A write-off closes the rest without the money.
 */
export function feeBalance(
  fee: { amount: number; paidAt: Date | string | null; writtenOffAmount?: number | null },
  received: readonly { status: LedgerPaymentStatus; amount: number; refunded?: number }[],
) {
  const counted = received.filter(payment => countsTowardsFee(payment.status));
  const fromPayments = counted.reduce((sum, payment) => sum + payment.amount - (payment.refunded ?? 0), 0);
  const paid = paidBeforeLedger(fee, received) ? fee.amount : fromPayments;
  const writtenOff = fee.writtenOffAmount ?? 0;
  const left = fee.paidAt ? 0 : Math.max(0, fee.amount - paid - writtenOff);
  return { paid, writtenOff, left };
}
