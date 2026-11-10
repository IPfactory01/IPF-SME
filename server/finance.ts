/**
 * Finance (Admin › Finance): money across every client, in one place (App flow 4.7 and 3.1). Payment requests from the
 * Business Health Check route (Full Report, Business Review) and every engagement fee, each with what is paid, what is
 * left and whether it is late, from the payments ledger (server/ledger.ts). Seeing it: view_financials (Finance; Partner,
 * Vice President and Senior Associate; Super Admin).
 *
 * Recording money (batch F, ET 10 November 2026) is for Finance and the Super Admin only (manage_payments): money that
 * came another way, in part or in full, with the day it arrived, how it came and a note such as the bank's reference;
 * cancelling one recorded by mistake, which stays on the record; accepting a Paystack payment that needs a look once
 * it fits the fee; and (F2) recording a refund against the payment it returns, or cancelling one recorded by mistake.
 * Writing off what is left of a fee, and reversing a write-off, is for a Partner or the Super Admin (write_off_fees).
 * Each is in the audit log, and the owner is told what concerns them.
 */
import { TRPCError } from "@trpc/server";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { businessChecks, businesses, engagementFeeLines, engagements, paymentRequests, users } from "../drizzle/schema";
import { lagosDay } from "../shared/agreement";
import { BRAND } from "../shared/brand";
import { formatNaira } from "../shared/businessSupport";
import { dayLabel } from "../shared/engagementWork";
import { engagementTitle } from "../shared/engagementTypes";
import { countsTowardsFee, feeBalance, receiptNumberLabel, type LedgerPaymentMethod } from "../shared/ledger";
import { PAYMENT_ITEM_TITLES } from "../shared/payments";
import { authorityAllows, type Authority } from "../shared/platformPermissions";
import type { Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { deliverEmail } from "./email";
import { feeContext, feeReference, openRoomIfFirstPayment, sendFeeReceipt } from "./feePayments";
import { acceptLooked, addPaymentByHand, addRefund, balanceOf, cancelPaymentByHand, cancelRefundRecord, carryOver, lockFee, paymentById, paymentsOfFees, refreshFeePaid, refundById, refundsOfPayments, reverseFeeWriteOff, writeOffFee, type LedgerEntry } from "./ledger";
import type { paymentRefunds } from "../drizzle/schema";
import { requireOnlinePayment } from "./onlinePayment";
import { verifyTransaction } from "./paystack";
import { getTrustedApplicationOrigin } from "./security";

export type FinanceActor = { id: number; authority: Authority };

const lagosToday = (now: number) => lagosDay(now);

/** How a payment came, as Finance reads it. */
export const PAYMENT_METHOD_LABELS: Record<LedgerPaymentMethod, string> = { paystack: "Paystack", bank_transfer: "Bank transfer", cash: "Cash", other: "Other" };

const refused = (code: "FORBIDDEN" | "BAD_REQUEST" | "CONFLICT" | "NOT_FOUND" | "PRECONDITION_FAILED", message: string) => new TRPCError({ code, message });
const requirePayments = (actor: FinanceActor) => {
  if (!authorityAllows(actor.authority, "manage_payments")) throw refused("FORBIDDEN", "Recording money is for Finance and the Super Admin.");
};
const requireWriteOff = (actor: FinanceActor) => {
  if (!authorityAllows(actor.authority, "write_off_fees")) throw refused("FORBIDDEN", "Only a Partner or the Super Admin can write off a fee.");
};
type Refund = typeof paymentRefunds.$inferSelect;

export async function listFinance(db: Pick<Database, "select">, actor: { authority: Authority }, now = Date.now()) {
  if (!authorityAllows(actor.authority, "view_financials")) throw new TRPCError({ code: "FORBIDDEN", message: "Your role does not include finance." });
  const today = lagosToday(now);
  const requestRows = await db.select({
    id: paymentRequests.id, item: paymentRequests.item, amount: paymentRequests.amountNaira, status: paymentRequests.status, reference: paymentRequests.reference,
    requestedAt: paymentRequests.requestedAt, confirmedAt: paymentRequests.confirmedAt, fullName: businessChecks.fullName, businessName: businessChecks.businessName,
  }).from(paymentRequests).innerJoin(businessChecks, eq(paymentRequests.businessCheckId, businessChecks.id)).orderBy(desc(paymentRequests.id));
  const feeRows = await db.select({
    id: engagementFeeLines.id, engagementId: engagementFeeLines.engagementId, label: engagementFeeLines.label, amount: engagementFeeLines.amount, dueOn: engagementFeeLines.dueOn, paidAt: engagementFeeLines.paidAt,
    writtenOffAmount: engagementFeeLines.writtenOffAmount, writtenOffAt: engagementFeeLines.writtenOffAt, writtenOffByUserId: engagementFeeLines.writtenOffByUserId, writeOffNote: engagementFeeLines.writeOffNote,
    type: engagements.type, service: engagements.service, businessName: businesses.name, contactName: engagements.contactName, checkBusinessName: businessChecks.businessName,
  }).from(engagementFeeLines).innerJoin(engagements, eq(engagementFeeLines.engagementId, engagements.id))
    .leftJoin(businesses, eq(engagements.businessId, businesses.id)).leftJoin(businessChecks, eq(engagements.businessCheckId, businessChecks.id))
    .orderBy(asc(engagementFeeLines.dueOn), asc(engagementFeeLines.id));
  const ledger = await paymentsOfFees(db, feeRows.map(row => row.id));
  const refunds = await refundsOfPayments(db, ledger.map(entry => entry.id));
  const people = await namesOf(db, [...ledger.flatMap(entry => [entry.recordedByUserId, entry.cancelledByUserId]), ...refunds.flatMap(refund => [refund.recordedByUserId, refund.cancelledByUserId]), ...feeRows.map(row => row.writtenOffByUserId)]);
  const requests = requestRows.map(row => ({ ...row, title: PAYMENT_ITEM_TITLES[row.item], client: row.businessName || row.fullName, paid: row.status === "confirmed" }));
  const fees = feeRows.map(row => {
    const own = ledger.filter(entry => entry.feeLineId === row.id);
    const { paid, left } = feeBalance(row, own);
    return {
      id: row.id, engagementId: row.engagementId, label: row.label, amount: row.amount, dueOn: row.dueOn, paid: left === 0, paidAt: row.paidAt,
      paidAmount: paid, left, reference: feeReference(row.id),
      writtenOff: writeOffView(row, people),
      client: row.businessName ?? row.checkBusinessName ?? row.contactName ?? "", engagement: engagementTitle(row.type, row.service),
      // A fee is owed once it is set (there are no proposals to sign), and late once its due date passes with something left.
      late: left > 0 && row.dueOn !== null && row.dueOn < today,
      // Attempts that never moved money are left out; a cancelled payment stays, marked cancelled.
      payments: own.filter(entry => entry.status !== "started" && entry.status !== "failed").map(entry => paymentView(entry, people, refunds)),
    };
  });
  const needsALook = fees.flatMap(fee => fee.payments.filter(payment => payment.status === "needs_a_look").map(payment => ({ ...payment, feeLineId: fee.id, label: fee.label, client: fee.client, engagement: fee.engagement, left: fee.left })));
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  return {
    requests,
    fees,
    needsALook,
    totals: {
      paid: sum(requests.filter(row => row.paid).map(row => row.amount)) + sum(fees.map(row => row.paidAmount)),
      owed: sum(requests.filter(row => !row.paid).map(row => row.amount)) + sum(fees.map(row => row.left)),
      late: sum(fees.filter(row => row.late).map(row => row.left)),
    },
    can: { record: authorityAllows(actor.authority, "manage_payments"), writeOff: authorityAllows(actor.authority, "write_off_fees") },
  };
}

/** The names of the people who recorded or cancelled payments. */
export async function namesOf(db: Pick<Database, "select">, ids: readonly (number | null)[]) {
  const wanted = Array.from(new Set(ids.filter((id): id is number => id !== null)));
  if (!wanted.length) return new Map<number, string>();
  const rows = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, wanted));
  return new Map(rows.map(row => [row.id, row.name ?? row.email ?? "Someone on the team"]));
}

/** A fee's write-off as Finance and the team see it, or null. */
export function writeOffView(fee: { writtenOffAmount: number | null; writtenOffAt: Date | null; writtenOffByUserId: number | null; writeOffNote: string | null }, people: Map<number, string>) {
  if (fee.writtenOffAt === null || fee.writtenOffAmount === null) return null;
  return { amount: fee.writtenOffAmount, at: fee.writtenOffAt, by: fee.writtenOffByUserId !== null ? people.get(fee.writtenOffByUserId) ?? null : null, note: fee.writeOffNote };
}

/** A refund as Finance and the team see it; a cancelled one stays on the record. */
const refundView = (refund: Refund, people: Map<number, string>) => ({
  id: refund.id, amount: refund.amount, refundedOn: refund.refundedOn, reason: refund.reason, reference: refund.reference,
  recordedBy: people.get(refund.recordedByUserId) ?? null, cancelledAt: refund.cancelledAt, cancelReason: refund.cancelReason,
  cancelledBy: refund.cancelledByUserId !== null ? people.get(refund.cancelledByUserId) ?? null : null,
});

/** A payment as Finance and the team see it: never shown to a client in this form. */
export function paymentView(entry: LedgerEntry, people: Map<number, string>, refunds: readonly Refund[] = []) {
  return {
    id: entry.id, status: entry.status, method: entry.method, methodLabel: PAYMENT_METHOD_LABELS[entry.method], amount: entry.amount, refunded: entry.refunded,
    receipt: entry.receiptNumber !== null ? receiptNumberLabel(entry.receiptNumber) : null, receivedOn: entry.receivedOn, paidAt: entry.paidAt,
    paystackReference: entry.paystackReference, mode: entry.mode, note: entry.note,
    recordedBy: entry.recordedByUserId !== null ? people.get(entry.recordedByUserId) ?? null : null,
    cancelledAt: entry.cancelledAt, cancelReason: entry.cancelReason, cancelledBy: entry.cancelledByUserId !== null ? people.get(entry.cancelledByUserId) ?? null : null,
    /** Money recorded by hand that still counts and has no refund against it. */
    canCancel: entry.method !== "paystack" && entry.status === "paid" && entry.refunded === 0,
    /** What can still be refunded of money that was received: a paid payment, or one that needs a look. */
    refundable: entry.status === "paid" || entry.status === "needs_a_look" ? entry.amount - entry.refunded : 0,
    refunds: refunds.filter(refund => refund.paymentId === entry.id).map(refund => refundView(refund, people)),
  };
}

/**
 * Money that came another way (a bank transfer, cash): recorded against a fee by Finance or the Super Admin, in part or
 * in full, never more than is left and never dated in the future. It is paid at once with the next receipt number, the
 * owner gets the receipt, and the first payment opens a room that waited for it.
 */
export async function recordPayment(db: Database, actor: FinanceActor, input: { feeLineId: number; amount: number; receivedOn: string; method: Exclude<LedgerPaymentMethod, "paystack">; note: string }, today = lagosDay()) {
  requirePayments(actor);
  if (input.receivedOn > today) throw refused("BAD_REQUEST", "The day the money arrived cannot be in the future.");
  const note = input.note.trim();
  if (!note) throw refused("BAD_REQUEST", "Add the bank's reference, or say how the money came.");
  const result = await db.transaction(async tx => {
    const fee = await lockFee(tx, input.feeLineId);
    if (!fee) throw refused("NOT_FOUND", "We could not find this fee.");
    if (fee.writtenOffAt) throw refused("CONFLICT", "This fee is written off. Reverse the write-off first.");
    await carryOver(tx, fee);
    const { left } = await balanceOf(tx, fee);
    if (left === 0) throw refused("CONFLICT", "This fee is already paid.");
    if (input.amount > left) throw refused("BAD_REQUEST", `Only ${formatNaira(left)} is left to pay on this fee.`);
    const payment = await addPaymentByHand(tx, fee, { amount: input.amount, receivedOn: input.receivedOn, method: input.method, note, recordedByUserId: actor.id });
    const after = await refreshFeePaid(tx, fee);
    await recordAudit(tx, { action: "fee_payment_recorded", actorUserId: actor.id, details: { engagementId: fee.engagementId, feeLineId: fee.id, paymentId: payment.id, amount: payment.amount, method: payment.method, receiptNumber: payment.receiptNumber, left: after.left } });
    const opened = await openRoomIfFirstPayment(tx, fee.engagementId);
    return { payment, left: after.left, opened };
  });
  const { payment, left, opened } = result;
  await sendFeeReceipt(db, { feeLineId: input.feeLineId, paymentId: payment.id, amount: payment.amount, left, receiptNumber: payment.receiptNumber!, paid: { on: input.receivedOn }, test: false, opened });
  return { success: true, receipt: receiptNumberLabel(payment.receiptNumber!), left, opened } as const;
}

/** "Your payment record has been corrected: {fee}", to the payer, when a payment recorded by mistake is cancelled. */
export function correctionEmail(input: { name: string; title: string; label: string; amount: number; receivedOn: string | null; receipt: string | null; left: number }) {
  return {
    subject: `Your payment record has been corrected: ${input.label}`,
    body: [
      `Hello ${input.name.split(" ")[0] ?? ""},`, "",
      `We recorded ${formatNaira(input.amount)} for the ${input.title} (${input.label})${input.receivedOn ? `, received ${dayLabel(input.receivedOn)},` : ""} by mistake, and have taken it off your record.${input.receipt ? ` Receipt ${input.receipt} no longer stands.` : ""}`, "",
      ...(input.left > 0 ? [`${formatNaira(input.left)} is left to pay on it. The link to pay is in your room: ${getTrustedApplicationOrigin()}/dashboard#payments`, ""] : []),
      "If you did make this payment, reply to this email with your bank's reference and we will put it right.", "",
      BRAND.organisationName,
    ].join("\n"),
  };
}

/**
 * A payment recorded by hand by mistake: cancelled with a reason, never deleted. It keeps its receipt number, marked
 * cancelled, no longer counts, and its amount is owed again; the owner is told. A Paystack payment is never cancelled,
 * because the money moved: it is refunded. A room it opened stays open.
 */
export async function cancelPayment(db: Database, actor: FinanceActor, input: { paymentId: number; reason: string }) {
  requirePayments(actor);
  const reason = input.reason.trim();
  if (reason.length < 3) throw refused("BAD_REQUEST", "Say why the payment is cancelled.");
  const payment = await paymentById(db, input.paymentId);
  if (!payment || payment.feeLineId === null) throw refused("NOT_FOUND", "We could not find this payment.");
  if (payment.method === "paystack") throw refused("CONFLICT", "Money Paystack took is refunded, not cancelled.");
  const result = await db.transaction(async tx => {
    const fee = await lockFee(tx, payment.feeLineId!);
    if (!fee) throw refused("NOT_FOUND", "We could not find this fee.");
    const entry = (await paymentsOfFees(tx, [fee.id])).find(item => item.id === payment.id);
    if (!entry || entry.status !== "paid") throw refused("CONFLICT", "Only a payment that still counts can be cancelled.");
    if (entry.refunded > 0) throw refused("CONFLICT", "A refund is recorded against this payment, so it cannot be cancelled.");
    const cancelled = await cancelPaymentByHand(tx, entry.id, { cancelledByUserId: actor.id, reason });
    if (!cancelled) throw refused("CONFLICT", "This payment has just changed. Refresh and try again.");
    const after = await refreshFeePaid(tx, fee);
    await recordAudit(tx, { action: "fee_payment_cancelled", actorUserId: actor.id, details: { engagementId: fee.engagementId, feeLineId: fee.id, paymentId: entry.id, amount: entry.amount, receiptNumber: entry.receiptNumber, reason, left: after.left } });
    return { cancelled, left: after.left };
  });
  const found = await feeContext(db, payment.feeLineId);
  if (found?.payer) {
    const message = correctionEmail({ name: found.payer.name, title: found.title, label: found.fee.label, amount: result.cancelled.amount, receivedOn: result.cancelled.receivedOn, receipt: result.cancelled.receiptNumber !== null ? receiptNumberLabel(result.cancelled.receiptNumber) : null, left: result.left });
    await deliverEmail({ to: found.payer.email, sender: "business_support", idempotencyKey: `payments:${payment.id}:cancelled`, subject: message.subject, body: message.body })
      .catch((error: unknown) => console.error("[Fees] The correction could not be sent:", error instanceof Error ? error.message : "unknown error"));
  }
  return { success: true, left: result.left } as const;
}

/**
 * A Paystack payment that needed a look, accepted by Finance once it fits the fee. Paystack is asked again what it
 * received, so only a successful payment in whole naira counts, and never more than is left (refund the difference and
 * record the refund first). It then counts with the next receipt number, and the owner gets the receipt.
 */
export async function acceptPayment(db: Database, actor: FinanceActor, input: { paymentId: number }) {
  requirePayments(actor);
  const payment = await paymentById(db, input.paymentId);
  if (!payment || payment.feeLineId === null) throw refused("NOT_FOUND", "We could not find this payment.");
  if (payment.status !== "needs_a_look" || !payment.paystackReference) throw refused("CONFLICT", "This payment does not need a look.");
  requireOnlinePayment();
  const transaction = await verifyTransaction(payment.paystackReference);
  const receivedKobo = transaction ? transaction.requestedAmount !== undefined && transaction.amount >= transaction.requestedAmount ? transaction.requestedAmount : transaction.amount : Number.NaN;
  if (!transaction || transaction.status !== "success" || transaction.currency !== "NGN" || !Number.isInteger(receivedKobo) || receivedKobo <= 0 || receivedKobo % 100 !== 0) {
    throw refused("CONFLICT", "Paystack does not show this as a payment in naira that can be counted. Refund it instead.");
  }
  const received = receivedKobo / 100;
  const result = await db.transaction(async tx => {
    const fee = await lockFee(tx, payment.feeLineId!);
    if (!fee) throw refused("NOT_FOUND", "We could not find this fee.");
    if (fee.writtenOffAt) throw refused("CONFLICT", "This fee is written off. Reverse the write-off first.");
    await carryOver(tx, fee);
    const entries = await paymentsOfFees(tx, [fee.id]);
    const entry = entries.find(item => item.id === payment.id);
    if (!entry || entry.status !== "needs_a_look") throw refused("CONFLICT", "This payment has just changed. Refresh and try again.");
    const { left } = feeBalance(fee, entries);
    const counts = received - entry.refunded;
    if (counts <= 0) throw refused("CONFLICT", "It has been refunded in full.");
    if (counts > left) throw refused("CONFLICT", `It is more than is left to pay on this fee (${formatNaira(left)}). Refund the difference in Paystack and record the refund first.`);
    const accepted = await acceptLooked(tx, fee, entry, received);
    if (!accepted) throw refused("CONFLICT", "This payment has just changed. Refresh and try again.");
    const after = await refreshFeePaid(tx, fee);
    await recordAudit(tx, { action: "payment_accepted", actorUserId: actor.id, details: { engagementId: fee.engagementId, feeLineId: fee.id, paymentId: accepted.id, amount: accepted.amount, receiptNumber: accepted.receiptNumber, paystackReference: accepted.paystackReference, left: after.left } });
    const opened = await openRoomIfFirstPayment(tx, fee.engagementId);
    return { accepted, left: after.left, opened };
  });
  const { accepted, left, opened } = result;
  await sendFeeReceipt(db, { feeLineId: payment.feeLineId, paymentId: accepted.id, amount: accepted.amount, left, receiptNumber: accepted.receiptNumber!, paid: { on: accepted.receivedOn ?? lagosDay() }, test: accepted.mode === "test", opened });
  return { success: true, receipt: receiptNumberLabel(accepted.receiptNumber!), left, opened } as const;
}

/** "Your refund: {fee}", to the payer, once a refund is recorded against their payment. */
export function refundEmail(input: { name: string; title: string; label: string; amount: number; refundedOn: string; receipt: string | null; reference: string | null; test: boolean }) {
  return {
    subject: `${input.test ? "TEST: " : ""}Your refund: ${input.label}`,
    body: [
      ...(input.test ? ["TEST MODE - NO REAL MONEY MOVED", ""] : []),
      `Hello ${input.name.split(" ")[0] ?? ""},`, "",
      `We have refunded ${formatNaira(input.amount)} of your payment for the ${input.title} (${input.label}) on ${dayLabel(input.refundedOn)}.${input.receipt ? ` It was paid with receipt ${input.receipt}.` : ""}`,
      "A bank can take a few days to show it.", "",
      ...(input.reference ? [`Refund reference: ${input.reference}`, ""] : []),
      "Any questions, reply to this email.", "",
      BRAND.organisationName,
    ].join("\n"),
  };
}

/**
 * Money returned against a fee's payment, recorded once it has gone back through Paystack or the bank (F2). Never more
 * than is left of the payment; refunded in full, the payment is marked refunded. The amount is owed on the fee again
 * unless a Partner writes it off, and the owner is told.
 */
export async function recordRefund(db: Database, actor: FinanceActor, input: { paymentId: number; amount: number; refundedOn: string; reason: string; reference: string | null }, today = lagosDay()) {
  requirePayments(actor);
  if (input.refundedOn > today) throw refused("BAD_REQUEST", "The day of the refund cannot be in the future.");
  const reason = input.reason.trim();
  if (reason.length < 3) throw refused("BAD_REQUEST", "Say why the money was refunded.");
  const reference = input.reference?.trim() || null;
  const payment = await paymentById(db, input.paymentId);
  if (!payment) throw refused("NOT_FOUND", "We could not find this payment.");
  if (payment.feeLineId === null) throw refused("CONFLICT", "This payment is not against a fee.");
  const result = await db.transaction(async tx => {
    const fee = await lockFee(tx, payment.feeLineId!);
    if (!fee) throw refused("NOT_FOUND", "We could not find this fee.");
    const entry = (await paymentsOfFees(tx, [fee.id])).find(item => item.id === payment.id);
    if (!entry || (entry.status !== "paid" && entry.status !== "needs_a_look")) throw refused("CONFLICT", "Only money that was received, and not refunded in full, can be refunded.");
    const refundable = entry.amount - entry.refunded;
    if (input.amount > refundable) throw refused("BAD_REQUEST", `Only ${formatNaira(refundable)} of this payment is left to refund.`);
    const refund = await addRefund(tx, entry, { amount: input.amount, refundedOn: input.refundedOn, reason, reference, recordedByUserId: actor.id });
    const after = await refreshFeePaid(tx, fee);
    await recordAudit(tx, { action: "payment_refund_recorded", actorUserId: actor.id, details: { engagementId: fee.engagementId, feeLineId: fee.id, paymentId: entry.id, refundId: refund.id, amount: refund.amount, reason, ...(reference ? { reference } : {}), left: after.left } });
    return { refund, entry, left: after.left };
  });
  const found = await feeContext(db, payment.feeLineId);
  if (found?.payer) {
    const message = refundEmail({ name: found.payer.name, title: found.title, label: found.fee.label, amount: result.refund.amount, refundedOn: result.refund.refundedOn, receipt: result.entry.receiptNumber !== null ? receiptNumberLabel(result.entry.receiptNumber) : null, reference, test: result.entry.mode === "test" });
    await deliverEmail({ to: found.payer.email, sender: "business_support", idempotencyKey: `payment_refunds:${result.refund.id}:client`, subject: message.subject, body: message.body })
      .catch((error: unknown) => console.error("[Fees] The refund email could not be sent:", error instanceof Error ? error.message : "unknown error"));
  }
  return { success: true, left: result.left } as const;
}

/** A refund recorded by mistake: cancelled with a reason, never deleted; it no longer counts, and the payment counts again. */
export async function cancelRefund(db: Database, actor: FinanceActor, input: { refundId: number; reason: string }) {
  requirePayments(actor);
  const reason = input.reason.trim();
  if (reason.length < 3) throw refused("BAD_REQUEST", "Say why the refund is cancelled.");
  const refund = await refundById(db, input.refundId);
  const payment = refund ? await paymentById(db, refund.paymentId) : null;
  if (!refund || !payment || payment.feeLineId === null) throw refused("NOT_FOUND", "We could not find this refund.");
  const left = await db.transaction(async tx => {
    const fee = await lockFee(tx, payment.feeLineId!);
    if (!fee) throw refused("NOT_FOUND", "We could not find this fee.");
    const cancelled = await cancelRefundRecord(tx, refund.id, { cancelledByUserId: actor.id, reason });
    if (!cancelled) throw refused("CONFLICT", "This refund is already cancelled.");
    const after = await refreshFeePaid(tx, fee);
    await recordAudit(tx, { action: "payment_refund_cancelled", actorUserId: actor.id, details: { engagementId: fee.engagementId, feeLineId: fee.id, paymentId: payment.id, refundId: refund.id, amount: refund.amount, reason, left: after.left } });
    return after.left;
  });
  return { success: true, left } as const;
}

/**
 * What is left of a fee, written off by a Partner or the Super Admin with a note (F2, ET 10 November 2026): nothing more
 * is owed, it is never late and it never pauses the work; the client sees "Nothing more to pay". It covers what is left
 * at that moment, so a later refund is owed again. It opens no room: Open the room now does. No email: the Partner tells
 * the client.
 */
export async function writeOff(db: Database, actor: FinanceActor, input: { feeLineId: number; note: string }) {
  requireWriteOff(actor);
  const note = input.note.trim();
  if (note.length < 3) throw refused("BAD_REQUEST", "Say why the fee is written off.");
  const amount = await db.transaction(async tx => {
    const fee = await lockFee(tx, input.feeLineId);
    if (!fee) throw refused("NOT_FOUND", "We could not find this fee.");
    if (fee.writtenOffAt) throw refused("CONFLICT", "This fee is already written off.");
    await carryOver(tx, fee);
    const { left } = await balanceOf(tx, fee);
    if (left === 0) throw refused("CONFLICT", "Nothing is left to pay on this fee.");
    await writeOffFee(tx, fee, { amount: left, note, writtenOffByUserId: actor.id });
    await recordAudit(tx, { action: "fee_written_off", actorUserId: actor.id, details: { engagementId: fee.engagementId, feeLineId: fee.id, amount: left, note } });
    return left;
  });
  return { success: true, writtenOff: amount } as const;
}

/** A write-off reversed by a Partner or the Super Admin, with a reason: what was written off is owed again. */
export async function reverseWriteOff(db: Database, actor: FinanceActor, input: { feeLineId: number; reason: string }) {
  requireWriteOff(actor);
  const reason = input.reason.trim();
  if (reason.length < 3) throw refused("BAD_REQUEST", "Say why the write-off is reversed.");
  const left = await db.transaction(async tx => {
    const fee = await lockFee(tx, input.feeLineId);
    if (!fee) throw refused("NOT_FOUND", "We could not find this fee.");
    if (!fee.writtenOffAt) throw refused("CONFLICT", "This fee is not written off.");
    const was = { amount: fee.writtenOffAmount, note: fee.writeOffNote, by: fee.writtenOffByUserId };
    await reverseFeeWriteOff(tx, fee);
    const after = await refreshFeePaid(tx, fee);
    await recordAudit(tx, { action: "fee_write_off_reversed", actorUserId: actor.id, details: { engagementId: fee.engagementId, feeLineId: fee.id, amount: was.amount, note: was.note, writtenOffByUserId: was.by, reason, left: after.left } });
    return after.left;
  });
  return { success: true, left } as const;
}

/** Whether a fee's payments include any that count, for the engagement's own checks. */
export const anyCounted = (entries: readonly LedgerEntry[]) => entries.some(entry => countsTowardsFee(entry.status));
