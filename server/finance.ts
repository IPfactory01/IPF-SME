/**
 * Finance (Admin › Finance): money across every client, in one place (App flow 4.7 and 3.1). Payment requests from the
 * Business Health Check route (Full Report, Business Review) and every engagement fee, each with what is paid, what is
 * left and whether it is late, from the payments ledger (server/ledger.ts). Seeing it: view_financials (Finance; Partner,
 * Vice President and Senior Associate; Super Admin).
 *
 * Recording money (batch F, ET 10 November 2026) is for Finance and the Super Admin only (manage_payments): money that
 * came another way, in part or in full, with the day it arrived, how it came and a note such as the bank's reference;
 * cancelling one recorded by mistake, which stays on the record; and accepting a Paystack payment that needs a look once
 * it fits the fee. Each sends the owner what it changes, and each is in the audit log.
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
import { acceptLooked, addPaymentByHand, balanceOf, cancelPaymentByHand, carryOver, lockFee, paymentById, paymentsOfFees, refreshFeePaid, type LedgerEntry } from "./ledger";
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

export async function listFinance(db: Pick<Database, "select">, actor: { authority: Authority }, now = Date.now()) {
  if (!authorityAllows(actor.authority, "view_financials")) throw new TRPCError({ code: "FORBIDDEN", message: "Your role does not include finance." });
  const today = lagosToday(now);
  const requestRows = await db.select({
    id: paymentRequests.id, item: paymentRequests.item, amount: paymentRequests.amountNaira, status: paymentRequests.status, reference: paymentRequests.reference,
    requestedAt: paymentRequests.requestedAt, confirmedAt: paymentRequests.confirmedAt, fullName: businessChecks.fullName, businessName: businessChecks.businessName,
  }).from(paymentRequests).innerJoin(businessChecks, eq(paymentRequests.businessCheckId, businessChecks.id)).orderBy(desc(paymentRequests.id));
  const feeRows = await db.select({
    id: engagementFeeLines.id, engagementId: engagementFeeLines.engagementId, label: engagementFeeLines.label, amount: engagementFeeLines.amount, dueOn: engagementFeeLines.dueOn, paidAt: engagementFeeLines.paidAt,
    writtenOffAmount: engagementFeeLines.writtenOffAmount,
    type: engagements.type, service: engagements.service, businessName: businesses.name, contactName: engagements.contactName, checkBusinessName: businessChecks.businessName,
  }).from(engagementFeeLines).innerJoin(engagements, eq(engagementFeeLines.engagementId, engagements.id))
    .leftJoin(businesses, eq(engagements.businessId, businesses.id)).leftJoin(businessChecks, eq(engagements.businessCheckId, businessChecks.id))
    .orderBy(asc(engagementFeeLines.dueOn), asc(engagementFeeLines.id));
  const ledger = await paymentsOfFees(db, feeRows.map(row => row.id));
  const people = await namesOf(db, ledger.flatMap(entry => [entry.recordedByUserId, entry.cancelledByUserId]));
  const requests = requestRows.map(row => ({ ...row, title: PAYMENT_ITEM_TITLES[row.item], client: row.businessName || row.fullName, paid: row.status === "confirmed" }));
  const fees = feeRows.map(row => {
    const own = ledger.filter(entry => entry.feeLineId === row.id);
    const { paid, left } = feeBalance(row, own);
    return {
      id: row.id, engagementId: row.engagementId, label: row.label, amount: row.amount, dueOn: row.dueOn, paid: left === 0, paidAt: row.paidAt,
      paidAmount: paid, left, reference: feeReference(row.id),
      client: row.businessName ?? row.checkBusinessName ?? row.contactName ?? "", engagement: engagementTitle(row.type, row.service),
      // A fee is owed once it is set (there are no proposals to sign), and late once its due date passes with something left.
      late: left > 0 && row.dueOn !== null && row.dueOn < today,
      // Attempts that never moved money are left out; a cancelled payment stays, marked cancelled.
      payments: own.filter(entry => entry.status !== "started" && entry.status !== "failed").map(entry => paymentView(entry, people)),
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
    can: { record: authorityAllows(actor.authority, "manage_payments") },
  };
}

/** The names of the people who recorded or cancelled payments. */
export async function namesOf(db: Pick<Database, "select">, ids: readonly (number | null)[]) {
  const wanted = Array.from(new Set(ids.filter((id): id is number => id !== null)));
  if (!wanted.length) return new Map<number, string>();
  const rows = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, wanted));
  return new Map(rows.map(row => [row.id, row.name ?? row.email ?? "Someone on the team"]));
}

/** A payment as Finance and the team see it: never shown to a client in this form. */
export function paymentView(entry: LedgerEntry, people: Map<number, string>) {
  return {
    id: entry.id, status: entry.status, method: entry.method, methodLabel: PAYMENT_METHOD_LABELS[entry.method], amount: entry.amount, refunded: entry.refunded,
    receipt: entry.receiptNumber !== null ? receiptNumberLabel(entry.receiptNumber) : null, receivedOn: entry.receivedOn, paidAt: entry.paidAt,
    paystackReference: entry.paystackReference, mode: entry.mode, note: entry.note,
    recordedBy: entry.recordedByUserId !== null ? people.get(entry.recordedByUserId) ?? null : null,
    cancelledAt: entry.cancelledAt, cancelReason: entry.cancelReason, cancelledBy: entry.cancelledByUserId !== null ? people.get(entry.cancelledByUserId) ?? null : null,
    /** Money recorded by hand that still counts and has no refund against it. */
    canCancel: entry.method !== "paystack" && entry.status === "paid" && entry.refunded === 0,
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

/** Whether a fee's payments include any that count, for the engagement's own checks. */
export const anyCounted = (entries: readonly LedgerEntry[]) => entries.some(entry => countsTowardsFee(entry.status));
