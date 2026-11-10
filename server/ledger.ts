/**
 * The payments ledger (R37, batch F; App flow 3.1, Backend schema section 2). Every naira that comes in is one row in
 * `payments`, against one fee or, until the Business Review and the Full Report become fees (F3, R13), one payment
 * request. This module is the only writer of `payments`, `document_counters` and a fee's paid state and invoice number;
 * the flows that decide who may do what, and the emails, live with their screens (server/finance.ts,
 * server/feePayments.ts, server/payments.ts).
 *
 * Each change runs inside the caller's transaction, after `lockFee`: the fee's row stays locked until the transaction
 * ends, so two payments can never both take what is left, and the fee is always locked before any of its payments, so
 * two changes never wait on each other. A receipt or invoice number is taken in that same transaction, so a save that
 * fails gives its number back and the numbers have no gaps. Nothing about money is deleted: a payment recorded by hand
 * by mistake is cancelled and keeps its receipt number.
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { documentCounters, engagementFeeLines, paymentRefunds, payments, type LedgerPayment } from "../drizzle/schema";
import { lagosDay } from "../shared/agreement";
import { countsTowardsFee, feeBalance, type DocumentNumberKind, type LedgerPaymentMethod, type LedgerPaymentMode } from "../shared/ledger";
import type { Database } from "./accountAuth";

type Reader = Pick<Database, "select">;
/** A transaction (or the database) that can read and write. */
export type LedgerWriter = Pick<Database, "select" | "insert" | "update">;
export type FeeLine = typeof engagementFeeLines.$inferSelect;
/** A payment with what has been refunded against it (refunds recorded by mistake left out). */
export type LedgerEntry = LedgerPayment & { refunded: number };

/** The next number of a kind. Its counter row stays locked until the caller's transaction ends. */
export async function takeNumber(tx: Pick<Database, "insert">, kind: DocumentNumberKind) {
  const [row] = await tx.insert(documentCounters).values({ kind, lastNumber: 1 })
    .onConflictDoUpdate({ target: documentCounters.kind, set: { lastNumber: sql`${documentCounters.lastNumber} + 1` } })
    .returning({ lastNumber: documentCounters.lastNumber });
  return row!.lastNumber;
}

/** The fee's row as it is now, locked until the transaction ends; null when there is no such fee. */
export async function lockFee(tx: Reader, feeLineId: number): Promise<FeeLine | null> {
  return (await tx.select().from(engagementFeeLines).where(eq(engagementFeeLines.id, feeLineId)).for("update"))[0] ?? null;
}

/** Every payment of the fees given, oldest first, each with the refunds against it. */
export async function paymentsOfFees(db: Reader, feeLineIds: readonly number[]): Promise<LedgerEntry[]> {
  if (!feeLineIds.length) return [];
  const rows = await db.select().from(payments).where(inArray(payments.feeLineId, [...feeLineIds])).orderBy(asc(payments.id));
  return withRefunds(db, rows);
}

/** The payment of a payment request (the Full Report, the Business Review's first half), if it is in the ledger. */
export async function paymentsOfRequests(db: Reader, paymentRequestIds: readonly number[]): Promise<LedgerEntry[]> {
  if (!paymentRequestIds.length) return [];
  const rows = await db.select().from(payments).where(inArray(payments.paymentRequestId, [...paymentRequestIds])).orderBy(asc(payments.id));
  return withRefunds(db, rows);
}

async function withRefunds(db: Reader, rows: LedgerPayment[]): Promise<LedgerEntry[]> {
  if (!rows.length) return [];
  const refunds = await db.select({ paymentId: paymentRefunds.paymentId, amount: paymentRefunds.amount }).from(paymentRefunds)
    .where(and(inArray(paymentRefunds.paymentId, rows.map(row => row.id)), isNull(paymentRefunds.cancelledAt)));
  return rows.map(row => ({ ...row, refunded: refunds.filter(refund => refund.paymentId === row.id).reduce((sum, refund) => sum + refund.amount, 0) }));
}

/** The attempt or payment with this Paystack reference, if any. */
export async function paymentByReference(db: Reader, reference: string) {
  return (await db.select().from(payments).where(eq(payments.paystackReference, reference)).limit(1))[0] ?? null;
}

export async function paymentById(db: Reader, paymentId: number) {
  return (await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1))[0] ?? null;
}

/** What has been paid on a locked fee and what is left, from its payments as they are now. */
export async function balanceOf(tx: Reader, fee: FeeLine) {
  return feeBalance(fee, await paymentsOfFees(tx, [fee.id]));
}

/**
 * A fee marked paid before the ledger with no payment yet (paid in the minutes between migration 0022 and the ledger
 * code going live) gets its payment now, as the backfill would have given it.
 */
export async function carryOver(tx: LedgerWriter, fee: FeeLine) {
  if (!fee.paidAt) return;
  const [counted] = await tx.select({ id: payments.id }).from(payments)
    .where(and(eq(payments.feeLineId, fee.id), inArray(payments.status, ["paid", "refunded", "cancelled"]))).limit(1);
  if (counted) return;
  const receiptNumber = await takeNumber(tx, "receipt");
  await tx.insert(payments).values({
    feeLineId: fee.id, method: fee.paidReference ? "paystack" : "other", status: "paid", amount: fee.amount,
    paystackReference: fee.paidReference, receivedOn: lagosDay(fee.paidAt), paidAt: fee.paidAt, receiptNumber,
    note: fee.paidReference ? null : "Marked paid before the ledger",
  });
  await billFee(tx, fee);
}

/**
 * Gives a locked fee its invoice number the first time it is billed (its pay link emailed, or a payment started or
 * recorded against it), and returns it. A fee keeps its number for good.
 */
export async function billFee(tx: LedgerWriter, fee: FeeLine) {
  if (fee.invoiceNumber !== null) return fee.invoiceNumber;
  const invoiceNumber = await takeNumber(tx, "invoice");
  await tx.update(engagementFeeLines).set({ invoiceNumber }).where(eq(engagementFeeLines.id, fee.id));
  fee.invoiceNumber = invoiceNumber;
  return invoiceNumber;
}

/**
 * Brings a locked fee's paid state in line with its payments: `paidAt` (paid in full) is set when they, less refunds,
 * reach its amount, and cleared when a cancellation, a refund or a higher amount opens it again. Returns the balance.
 */
export async function refreshFeePaid(tx: LedgerWriter, fee: FeeLine) {
  const entries = await paymentsOfFees(tx, [fee.id]);
  const balance = feeBalance({ ...fee, paidAt: null }, entries);
  const full = balance.paid >= fee.amount;
  if (full && !fee.paidAt) {
    const paidAt = new Date();
    await tx.update(engagementFeeLines).set({ paidAt }).where(eq(engagementFeeLines.id, fee.id));
    fee.paidAt = paidAt;
  } else if (!full && fee.paidAt) {
    await tx.update(engagementFeeLines).set({ paidAt: null }).where(eq(engagementFeeLines.id, fee.id));
    fee.paidAt = null;
  }
  return { ...balance, left: full ? 0 : balance.left, becamePaid: full };
}

/** Money that came another way, recorded by a person: paid at once, with the next receipt number. */
export async function addPaymentByHand(tx: LedgerWriter, fee: FeeLine, input: { amount: number; receivedOn: string; method: Exclude<LedgerPaymentMethod, "paystack">; note: string; recordedByUserId: number }) {
  const receiptNumber = await takeNumber(tx, "receipt");
  await billFee(tx, fee);
  const [payment] = await tx.insert(payments).values({
    feeLineId: fee.id, method: input.method, status: "paid", amount: input.amount, receivedOn: input.receivedOn, paidAt: new Date(),
    receiptNumber, note: input.note, recordedByUserId: input.recordedByUserId,
  }).returning();
  return payment!;
}

/** A payment recorded by hand by mistake: kept, marked cancelled with who and why, and no longer counted. */
export async function cancelPaymentByHand(tx: LedgerWriter, paymentId: number, input: { cancelledByUserId: number; reason: string }) {
  const [cancelled] = await tx.update(payments).set({ status: "cancelled", cancelledAt: new Date(), cancelledByUserId: input.cancelledByUserId, cancelReason: input.reason })
    .where(and(eq(payments.id, paymentId), eq(payments.status, "paid"))).returning();
  return cancelled ?? null;
}

/** A Paystack checkout opened for what is left on a locked fee: recorded before Paystack is asked, so it is never unknown. */
export async function startAttempt(tx: LedgerWriter, fee: FeeLine, input: { amount: number; reference: string; mode: LedgerPaymentMode }) {
  await billFee(tx, fee);
  const [attempt] = await tx.insert(payments).values({ feeLineId: fee.id, method: "paystack", status: "started", amount: input.amount, paystackReference: input.reference, mode: input.mode }).returning();
  return attempt!;
}

/** The attempt behind a Paystack reference, locked; one opened before the ledger has no row yet and gets one now. */
export async function lockAttempt(tx: LedgerWriter, fee: FeeLine, input: { reference: string; amount: number; mode: LedgerPaymentMode }) {
  const [known] = await tx.select().from(payments).where(eq(payments.paystackReference, input.reference)).for("update");
  if (known) return known;
  const [created] = await tx.insert(payments).values({ feeLineId: fee.id, method: "paystack", status: "started", amount: input.amount, paystackReference: input.reference, mode: input.mode }).returning();
  return created!;
}

/** Paystack confirmed a locked attempt that fits the fee: paid, with the next receipt number. Null if it was not open. */
export async function claimAttempt(tx: LedgerWriter, fee: FeeLine, attempt: LedgerPayment) {
  if (attempt.status !== "started" && attempt.status !== "failed") return null;
  const receiptNumber = await takeNumber(tx, "receipt");
  await billFee(tx, fee);
  const [paid] = await tx.update(payments).set({ status: "paid", paidAt: new Date(), receivedOn: lagosDay(), receiptNumber })
    .where(and(eq(payments.id, attempt.id), inArray(payments.status, ["started", "failed"]))).returning();
  return paid ?? null;
}

/** Money Paystack took that does not fit the fee: kept for Finance to accept or refund, with what it received and why. */
export async function markNeedsALook(tx: LedgerWriter, attempt: LedgerPayment, input: { receivedNaira: number; problem: string }) {
  await tx.update(payments).set({ status: "needs_a_look", note: input.problem.slice(0, 500), receivedOn: lagosDay(), ...(input.receivedNaira > 0 ? { amount: input.receivedNaira } : {}) })
    .where(and(eq(payments.id, attempt.id), inArray(payments.status, ["started", "failed"])));
}

/** Paystack says an attempt did not go through. */
export async function markFailed(db: Pick<Database, "update">, attemptId: number, note?: string) {
  await db.update(payments).set({ status: "failed", ...(note ? { note } : {}) }).where(and(eq(payments.id, attemptId), eq(payments.status, "started")));
}

/** A payment that needed a look, accepted by Finance for the amount Paystack confirms: paid, with the next receipt number. */
export async function acceptLooked(tx: LedgerWriter, fee: FeeLine, payment: LedgerPayment, amount: number) {
  const receiptNumber = await takeNumber(tx, "receipt");
  await billFee(tx, fee);
  const [accepted] = await tx.update(payments).set({ status: "paid", amount, paidAt: new Date(), receivedOn: payment.receivedOn ?? lagosDay(), receiptNumber })
    .where(and(eq(payments.id, payment.id), eq(payments.status, "needs_a_look"))).returning();
  return accepted ?? null;
}

/** A confirmed payment request (the Full Report, the Business Review's first half) goes into the ledger with its receipt. */
export async function addRequestPayment(tx: LedgerWriter, input: { paymentRequestId: number; amount: number; paystackReference: string | null; mode: LedgerPaymentMode | null; note: string | null; recordedByUserId: number | null }) {
  const [already] = await tx.select({ id: payments.id, receiptNumber: payments.receiptNumber }).from(payments).where(eq(payments.paymentRequestId, input.paymentRequestId)).limit(1);
  if (already) return already.receiptNumber;
  const receiptNumber = await takeNumber(tx, "receipt");
  await tx.insert(payments).values({
    paymentRequestId: input.paymentRequestId, method: input.paystackReference ? "paystack" : "other", status: "paid", amount: input.amount,
    paystackReference: input.paystackReference, mode: input.mode, receivedOn: lagosDay(), paidAt: new Date(), receiptNumber, note: input.note, recordedByUserId: input.recordedByUserId,
  });
  return receiptNumber;
}

/** Payments that count, for a quick "has this engagement been paid anything" check. */
export const counted = (entries: readonly LedgerEntry[]) => entries.filter(entry => countsTowardsFee(entry.status));
