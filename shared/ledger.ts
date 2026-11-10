/**
 * The payments ledger (R37, batch F; App flow 3.1, Backend schema section 2): every naira that comes in is one payment
 * against one fee, or, until the Business Review and the Full Report become fees (F3, R13), one payment request.
 * Nothing about money is deleted: a payment recorded by hand by mistake is cancelled, a refund is recorded against the
 * payment it returns, and a write-off can be reversed.
 */

/** How the money came. */
export const LEDGER_PAYMENT_METHODS = ["paystack", "bank_transfer", "cash", "other"] as const;
export type LedgerPaymentMethod = (typeof LEDGER_PAYMENT_METHODS)[number];

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
