/**
 * Paying an engagement fee online (R11, ET, 6 November 2026). Each fee line has its own pay link, keyed by an HMAC of the
 * fee's id under the server's secret, so it cannot be guessed from the sequential id. The link opens a pay page that
 * shows the business, the engagement, the fee and its amount; "Pay securely with Paystack" opens Paystack's checkout for
 * the amount in the database, never one from the browser. The payment confirms itself through Paystack's signed webhook
 * or the return page, after Paystack confirms the transaction to the server, exactly as the Business Review does.
 *
 * An engagement opened before it is paid (`opensOnPayment`) shows the client only the first fee to pay until a fee is
 * paid, online or by hand; the first payment opens the room.
 *
 * With the ledger (batch F, server/ledger.ts) every attempt is a row in `payments`, recorded before Paystack is asked, and
 * Paystack is asked only for what is left on the fee, so a fee paid in part is finished online. A confirmation must
 * match its attempt's amount and still fit the fee; money that does not fit needs a look and waits for Finance.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { businessChecks, businessMemberships, businesses, engagementFeeLines, engagements, engagementTeam, paymentRequests, users } from "../drizzle/schema";
import { addDays, BALANCE_DUE_DAYS, feeHold, lagosDay } from "../shared/agreement";
import { BRAND } from "../shared/brand";
import { CURRENT_STATE, formatNaira } from "../shared/businessSupport";
import { dayLabel } from "../shared/engagementWork";
import { engagementTitle } from "../shared/engagementTypes";
import { countsTowardsFee, feeBalance, receiptNumberLabel } from "../shared/ledger";
import { PAY_RETURN_PATH, type OnlinePaymentMode, type OnlinePaymentStatus } from "../shared/payments";
import { ENV } from "./_core/env";
import type { Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { beginBusinessReview } from "./businessReview";
import { BUSINESS_SUPPORT_MAILBOX, deliverEmail } from "./email";
import { lagosTime } from "./lagosTime";
import { balanceOf, billFee, carryOver, claimAttempt, lockAttempt, lockFee, markFailed, markNeedsALook, paymentByReference, paymentsOfFees, paymentsOfRequests, refreshFeePaid, startAttempt, type FeeLine } from "./ledger";
import { amountMatches, requireOnlinePayment } from "./onlinePayment";
import { initializeTransaction, onlineReference, paystackMode, verifyTransaction } from "./paystack";
import { getTrustedApplicationOrigin } from "./security";
import { mainContactOf } from "./teamContact";

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "We could not find this payment. Use the link in your payment email." });

/** The fee's reference, shown to the client and the prefix of every Paystack attempt for it: TS-F-000123. */
export const feeReference = (feeLineId: number) => `TS-F-${String(feeLineId).padStart(6, "0")}`;
export const feeIdOfReference = (reference: string) => {
  const match = /^TS-F-(\d{6,})$/.exec(reference);
  return match ? Number(match[1]) : null;
};

function secret() {
  const key = ENV.cookieSecret;
  if (!key) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Payment links are not set up on this server." });
  return key;
}
/** The pay link's token: an HMAC of the fee's id. Without the server secret it cannot be made for another fee. */
export const feePayToken = (feeLineId: number) => createHmac("sha256", secret()).update(`engagement-fee:${feeLineId}`).digest("base64url").slice(0, 32);
const tokenMatches = (feeLineId: number, token: string) => {
  const expected = Buffer.from(feePayToken(feeLineId));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
};
export const feePayPath = (feeLineId: number) => `/pay/fee/${feeLineId}/${feePayToken(feeLineId)}`;
export const feePayUrl = (feeLineId: number) => `${getTrustedApplicationOrigin()}${feePayPath(feeLineId)}`;

/** A fee with its engagement, the business, who pays it and the engagement's name. */
export async function feeContext(db: Pick<Database, "select">, feeLineId: number) {
  const fee = (await db.select().from(engagementFeeLines).where(eq(engagementFeeLines.id, feeLineId)).limit(1))[0];
  if (!fee) return null;
  const engagement = (await db.select().from(engagements).where(eq(engagements.id, fee.engagementId)).limit(1))[0];
  if (!engagement) return null;
  const business = engagement.businessId === null ? undefined : (await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, engagement.businessId)).limit(1))[0];
  const owner = engagement.businessId === null ? undefined : (await db.select({ email: users.email, name: users.name }).from(businessMemberships).innerJoin(users, eq(businessMemberships.userId, users.id))
    .where(and(eq(businessMemberships.businessId, engagement.businessId), eq(businessMemberships.role, "owner"), eq(businessMemberships.status, "active"))).limit(1))[0];
  // An engagement from a Business Health Check, before its owner has an account, is named and paid from the check.
  const check = !business && engagement.businessCheckId !== null
    ? (await db.select({ businessName: businessChecks.businessName, fullName: businessChecks.fullName, email: businessChecks.email }).from(businessChecks).where(eq(businessChecks.id, engagement.businessCheckId)).limit(1))[0]
    : undefined;
  const payer = owner?.email ? { email: owner.email, name: owner.name ?? engagement.contactName ?? "" }
    : engagement.contactEmail ? { email: engagement.contactEmail, name: engagement.contactName ?? "" }
      : check?.email ? { email: check.email, name: check.fullName } : null;
  return { fee, engagement, businessName: business?.name ?? (check?.businessName || null) ?? engagement.contactName ?? check?.fullName ?? "", payer, title: engagementTitle(engagement.type, engagement.service) };
}

async function requireFee(db: Pick<Database, "select">, feeLineId: number, token: string) {
  if (!tokenMatches(feeLineId, token)) throw notFound();
  const found = await feeContext(db, feeLineId);
  if (!found) throw notFound();
  return found;
}

/**
 * The pay page: the business, the engagement, the fee, what is left to pay on it, the mode and whether it is paid, and
 * whom to ask on WhatsApp before paying (R72): the engagement's main contact, only if they agreed to show their number;
 * else the page offers the office. Nothing else.
 */
export async function feePayPage(db: Pick<Database, "select">, input: { feeLineId: number; token: string }) {
  const { fee, engagement, businessName, title } = await requireFee(db, input.feeLineId, input.token);
  const contact = await mainContactOf(db, engagement.id);
  const { paid, left, writtenOff } = feeBalance(fee, await paymentsOfFees(db, [fee.id]));
  return {
    businessName, engagement: title, label: fee.label,
    /** Closed without payment by a Partner: the page says there is nothing more to pay, never the team's word for it. */
    writtenOff: left === 0 && writtenOff > 0,
    /** What the Pay button asks for: what is left on the fee. */
    amountNaira: left || fee.amount,
    totalNaira: fee.amount, paidNaira: paid,
    dueOn: fee.dueOn, reference: feeReference(fee.id), mode: paystackMode(), state: left === 0 ? "paid" as const : "open" as const, contact,
  };
}

/**
 * Opens a Paystack transaction for what is left on the fee and returns the checkout page. The attempt is recorded first,
 * with its amount, so Paystack's confirmation always finds it; it also bills the fee (its invoice number).
 */
export async function startFeePayment(db: Database, input: { feeLineId: number; token: string }): Promise<{ alreadyPaid: true } | { alreadyPaid: false; url: string }> {
  requireOnlinePayment();
  const { payer, engagement } = await requireFee(db, input.feeLineId, input.token);
  if (!payer) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "We do not have an email for this payment yet. Reply to your payment email and we will sort it out." });
  const mode = paystackMode() === "live" ? "live" as const : "test" as const;
  const reference = onlineReference(feeReference(input.feeLineId));
  const attempt = await db.transaction(async tx => {
    const fee = await lockFee(tx, input.feeLineId);
    if (!fee) throw notFound();
    await carryOver(tx, fee);
    const { left } = await balanceOf(tx, fee);
    if (left === 0) return null;
    return startAttempt(tx, fee, { amount: left, reference, mode });
  });
  if (!attempt) return { alreadyPaid: true };
  try {
    const { authorizationUrl } = await initializeTransaction({
      email: payer.email,
      amountKobo: attempt.amount * 100,
      reference,
      callbackUrl: `${getTrustedApplicationOrigin()}${PAY_RETURN_PATH}`,
      metadata: { feeLineId: input.feeLineId, engagementId: engagement.id },
    });
    return { alreadyPaid: false, url: authorizationUrl };
  } catch (error) {
    console.error(`[Paystack] Could not open a payment for ${feeReference(input.feeLineId)}:`, error instanceof Error ? error.message : "unknown error");
    await markFailed(db, attempt.id, "Paystack did not open the payment.").catch(() => undefined);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "We could not open Paystack just now. Please try again in a minute." });
  }
}

export type FeeSettlement = "confirmed" | "already_paid" | "pending" | "failed" | "refused" | "unknown";
const STILL_OPEN = new Set(["ongoing", "pending", "processing", "queued"]);

async function tellOffice(subject: string, lines: string[], key: string) {
  await deliverEmail({ to: BUSINESS_SUPPORT_MAILBOX, sender: "business_support", idempotencyKey: key, subject, body: lines.join("\n") })
    .catch((error: unknown) => console.error("[Paystack] The office notice could not be sent:", error instanceof Error ? error.message : "unknown error"));
}

/**
 * Whether work on the engagement is paused today (D6), and why: the room's rule (`feeHold`) on its fees as they stand,
 * each paid once its payments, less refunds, cover it, and never late once written off. None while the room waits for
 * its first payment, which shows the fee instead.
 */
export async function holdOf(db: Pick<Database, "select">, engagementId: number, today = lagosDay()) {
  const engagement = (await db.select({ opensOnPayment: engagements.opensOnPayment }).from(engagements).where(eq(engagements.id, engagementId)).limit(1))[0];
  if (!engagement || engagement.opensOnPayment) return null;
  const lines = await db.select().from(engagementFeeLines).where(eq(engagementFeeLines.engagementId, engagementId));
  const ledger = await paymentsOfFees(db, lines.map(line => line.id));
  return feeHold(lines.map(line => {
    const { left } = feeBalance(line, ledger.filter(entry => entry.feeLineId === line.id));
    return { id: line.id, label: line.label, dueOn: line.dueOn, left, paid: left === 0 };
  }), today);
}

/**
 * "Work on your {engagement} has resumed" (G2): to the owner, and "Work has resumed: {business}, {engagement}" to the
 * lead, when a payment lifted a pause. Another fee still late is named, with the day work pauses again.
 */
export function workResumedEmails(input: {
  name: string; businessName: string; title: string; label: string; amount: number; receipt: string;
  stillLate: { label: string; left: number; pausesOn: string } | null; test: boolean;
}) {
  const url = `${getTrustedApplicationOrigin()}/dashboard`;
  const test = input.test ? "TEST: " : "";
  const notice = input.test ? ["TEST MODE - NO REAL MONEY MOVED", ""] : [];
  return {
    owner: {
      subject: `${test}Work on your ${input.title} has resumed`,
      body: [
        ...notice,
        `Hello ${input.name.split(" ")[0] ?? ""},`, "",
        `Thank you for your payment. Work on your ${input.title} has resumed.`,
        ...(input.stillLate ? ["", `One fee is still late: ${input.stillLate.label}, with ${formatNaira(input.stillLate.left)} left to pay. Pay it before ${dayLabel(input.stillLate.pausesOn)} to keep the work going.`] : []),
        "", `Open your room: ${url}`, "",
        BRAND.organisationName,
      ].join("\n"),
    },
    team: {
      subject: `${test}Work has resumed: ${input.businessName}, ${input.title}`,
      body: [
        ...notice,
        `${input.businessName} paid ${formatNaira(input.amount)} (${input.label}). Work on their ${input.title} is no longer paused: pick it up again.`,
        ...(input.stillLate ? ["", `One fee is still late: ${input.stillLate.label} (${formatNaira(input.stillLate.left)} left). Work pauses again on ${dayLabel(input.stillLate.pausesOn)} if it is not paid.`] : []),
        "", `Receipt: ${input.receipt}`,
      ].join("\n"),
    },
  };
}

/**
 * Sends the resumed emails once for the payment that lifted a pause: to the owner, and to the engagement's lead (its
 * Engagement Manager or Lead Consultant), or to the office when nobody leads it yet. A failed send is logged.
 */
export async function sendWorkResumed(db: Pick<Database, "select">, input: { engagementId: number; feeLineId: number; paymentId: number; amount: number; receiptNumber: number; test: boolean }) {
  const found = await feeContext(db, input.feeLineId);
  if (!found) return;
  const after = await holdOf(db, input.engagementId);
  const messages = workResumedEmails({
    name: found.payer?.name ?? "", businessName: found.businessName, title: found.title, label: found.fee.label, amount: input.amount, receipt: receiptNumberLabel(input.receiptNumber),
    stillLate: after ? { label: after.fee.label, left: after.fee.left, pausesOn: after.pausesOn } : null, test: input.test,
  });
  const failed = (error: unknown) => console.error("[Fees] The resumed email could not be sent:", error instanceof Error ? error.message : "unknown error");
  if (found.payer) await deliverEmail({ to: found.payer.email, sender: "business_support", idempotencyKey: `payments:${input.paymentId}:resumed`, ...messages.owner }).catch(failed);
  const leads = (await db.select({ email: users.email }).from(engagementTeam).innerJoin(users, eq(engagementTeam.userId, users.id))
    .where(and(eq(engagementTeam.engagementId, input.engagementId), inArray(engagementTeam.role, ["manager", "lead"])))).flatMap(lead => (lead.email ? [lead.email] : []));
  for (const to of leads.length ? Array.from(new Set(leads)) : [BUSINESS_SUPPORT_MAILBOX]) {
    await deliverEmail({ to, sender: "business_support", idempotencyKey: `payments:${input.paymentId}:resumed:${to}`, ...messages.team }).catch(failed);
  }
}

/** "Payment received: {fee}": the receipt, for every payment, online or by hand. */
export function feeReceiptEmail(input: {
  name: string; title: string; label: string; amount: number; left: number; receipt: string; reference: string;
  paid: { at: Date } | { on: string }; test: boolean; opened: boolean; startsBusinessReview?: boolean;
}) {
  const url = `${getTrustedApplicationOrigin()}/dashboard`;
  // The payment that starts a Business Review on fees (F3): what happens next, as its confirmation always said.
  const next = input.startsBusinessReview
    ? [
      `Your ${CURRENT_STATE.name} is booked. ${CURRENT_STATE.start}`, "",
      "WHAT HAPPENS NEXT",
      `• If you do not have a client account on ${BRAND.productName} yet, we email you a link to set one up. Your ${CURRENT_STATE.name} lives there: ${url}`,
      `• We agree the time of your first ${CURRENT_STATE.name} Session with you.`,
      `• ${CURRENT_STATE.what}`,
    ]
    : [input.opened ? `Your room is open: ${url}` : `Everything about the engagement is in your room: ${url}`];
  return {
    subject: `${input.test ? "TEST: " : ""}Payment received: ${input.label}`,
    body: [
      ...(input.test ? ["TEST MODE - NO REAL MONEY MOVED", ""] : []),
      `Hello ${input.name.split(" ")[0] ?? ""},`, "",
      // "the Business Review: half to start", not "the Business Review: Business Review: half to start".
      `We have received ${formatNaira(input.amount)} for the ${input.label.startsWith(`${input.title}:`) ? input.label : `${input.title}: ${input.label}`}. Thank you.`,
      ...(input.left > 0 ? [`${formatNaira(input.left)} is left to pay on it.`] : []), "",
      `Receipt: ${input.receipt}`, `Reference: ${input.reference}`,
      "at" in input.paid ? `Paid: ${lagosTime(input.paid.at)} (Lagos time)` : `Received: ${dayLabel(input.paid.on)}`, "",
      ...next, "",
      BRAND.organisationName,
    ].join("\n"),
  };
}

/** Emails the payer the receipt for one payment, once (its idempotency key names the payment). A failed send is logged. */
export async function sendFeeReceipt(db: Pick<Database, "select">, input: { feeLineId: number; paymentId: number; amount: number; left: number; receiptNumber: number; paid: { at: Date } | { on: string }; test: boolean; opened: boolean }) {
  const found = await feeContext(db, input.feeLineId);
  if (!found?.payer) return;
  const { engagement } = found;
  const startsBusinessReview = input.opened && engagement.businessCheckId !== null && engagement.paymentRequestId === null && engagement.type === "business_review";
  const message = feeReceiptEmail({ name: found.payer.name, title: found.title, label: found.fee.label, amount: input.amount, left: input.left, receipt: receiptNumberLabel(input.receiptNumber), reference: feeReference(input.feeLineId), paid: input.paid, test: input.test, opened: input.opened, startsBusinessReview });
  await deliverEmail({ to: found.payer.email, sender: "business_support", idempotencyKey: `payments:${input.paymentId}:receipt`, subject: message.subject, body: message.body })
    .catch((error: unknown) => console.error("[Fees] The receipt could not be sent:", error instanceof Error ? error.message : "unknown error"));
}

/**
 * Confirms a fee payment from one Paystack transaction. The transaction is fetched from Paystack again and must belong to
 * the fee, succeed, be in naira, be for its attempt's amount and still fit what is left on the fee. The attempt is claimed
 * once, under the fee's lock, so the webhook and the return page arriving together record one payment and send one
 * receipt. Money that moved but does not fit (another amount, or more than is left, such as a second payment for a fee
 * already paid) needs a look: it is kept on the attempt and sent to Business Support to accept or refund in Finance.
 */
export async function settleFee(db: Database, feeLineId: number, reference: string, source: "webhook" | "return"): Promise<FeeSettlement> {
  const found = await feeContext(db, feeLineId);
  if (!found) return "unknown";
  const { businessName, payer, title } = found;
  const known = await paymentByReference(db, reference);
  if (known && known.feeLineId === feeLineId && (countsTowardsFee(known.status) || known.status === "cancelled")) return "already_paid";
  if (known?.status === "needs_a_look") return "refused";
  const transaction = await verifyTransaction(reference);
  if (!transaction || transaction.reference !== reference) return "failed";
  const ours = transaction.reference.startsWith(`${feeReference(feeLineId)}-`);
  if (ours && transaction.status !== "success") {
    if (STILL_OPEN.has(transaction.status)) return "pending";
    if (known?.status === "started") await markFailed(db, known.id);
    return "failed";
  }
  const mode = known?.mode ?? (paystackMode() === "live" ? "live" : "test");
  const outcome = await db.transaction(async tx => {
    const fee = await lockFee(tx, feeLineId);
    if (!fee) return { kind: "unknown" as const };
    await carryOver(tx, fee);
    const { left } = await balanceOf(tx, fee);
    const pausedBefore = (await holdOf(tx, fee.engagementId))?.state === "paused";
    // An attempt from before the ledger has no row: it was opened for the whole of what was then owed.
    const attempt = await lockAttempt(tx, fee, { reference, amount: known?.amount ?? (left || fee.amount), mode });
    if (countsTowardsFee(attempt.status) || attempt.status === "cancelled") return { kind: "already_paid" as const };
    if (attempt.status === "needs_a_look") return { kind: "refused" as const, fee, problem: null };
    const problem = !ours ? "The Paystack reference does not belong to this fee."
      : transaction.currency !== "NGN" ? `The payment was not in naira (${transaction.currency || "no currency given"}).`
        : !amountMatches(transaction, attempt.amount * 100) ? `The amount does not match: ${Number.isFinite(transaction.amount) ? formatNaira(transaction.amount / 100) : "no amount"} paid, ${formatNaira(attempt.amount)} expected.`
          : left === 0 ? (fee.writtenOffAt ? "This fee was written off, so nothing was left to pay on it." : "This fee was already paid, so this may be a second payment for it.")
            : attempt.amount > left ? `Only ${formatNaira(left)} was left to pay on this fee, so this payment is more than it.`
              : null;
    if (problem) {
      const receivedNaira = Number.isFinite(transaction.amount) && transaction.amount > 0 ? Math.floor(transaction.amount / 100) : 0;
      await markNeedsALook(tx, attempt, { receivedNaira: transaction.currency === "NGN" ? receivedNaira : 0, problem });
      await recordAudit(tx, { action: "engagement_fee_online_refused", actorUserId: null, targetEmail: payer?.email ?? null, details: { engagementId: fee.engagementId, feeLineId: fee.id, paymentId: attempt.id, paystackReference: reference, reason: problem } });
      return { kind: "refused" as const, fee, problem };
    }
    const paid = await claimAttempt(tx, fee, attempt);
    if (!paid) return { kind: "already_paid" as const };
    const after = await refreshFeePaid(tx, fee);
    await recordAudit(tx, { action: "engagement_fee_paid_online", actorUserId: null, targetEmail: payer?.email ?? null, details: { engagementId: fee.engagementId, feeLineId: fee.id, paymentId: paid.id, amount: paid.amount, receiptNumber: paid.receiptNumber, via: "paystack", paystackReference: reference, mode } });
    const opened = await openRoomIfFirstPayment(tx, fee.engagementId);
    // A payment that lifts a pause says so (G2).
    const resumed = pausedBefore && (await holdOf(tx, fee.engagementId))?.state !== "paused";
    return { kind: "confirmed" as const, fee, payment: paid, left: after.left, opened, resumed };
  });
  if (outcome.kind === "unknown") return "unknown";
  if (outcome.kind === "already_paid") return "already_paid";
  if (outcome.kind === "refused") {
    if (outcome.problem) {
      console.error(`[Paystack] ${source}: ${reference} was not confirmed for ${feeReference(feeLineId)}.`);
      await tellOffice(`Paystack payment needs a look: ${feeReference(feeLineId)}`, [
        "A fee payment on Paystack was not confirmed automatically. Check it in Paystack, then accept it in Finance, or refund it in Paystack and record the refund.",
        "", `Reason: ${outcome.problem}`, `Fee: ${outcome.fee.label} (${formatNaira(outcome.fee.amount)})`, `Client: ${businessName}`, `Engagement: ${title}`, `Paystack reference: ${reference}`,
      ], `paystack:${reference}:fee:office`);
    }
    return "refused";
  }
  const { fee, payment, left, opened, resumed } = outcome;
  const test = mode === "test";
  await sendFeeReceipt(db, { feeLineId: fee.id, paymentId: payment.id, amount: payment.amount, left, receiptNumber: payment.receiptNumber!, paid: { at: payment.paidAt! }, test, opened });
  await tellOffice(`${test ? "TEST: " : ""}Paid online: ${businessName}, ${fee.label}`, [
    ...(test ? ["TEST MODE - NO REAL MONEY MOVED", ""] : []),
    `${businessName} paid ${formatNaira(payment.amount)} for the ${title} (${fee.label}) with Paystack. It is recorded: nothing to do.`,
    left > 0 ? `${formatNaira(left)} is left to pay on this fee.` : "",
    "", `Receipt: ${receiptNumberLabel(payment.receiptNumber!)}`, `Reference: ${feeReference(fee.id)}`, `Paystack reference: ${reference}`, opened ? "This was the first payment: the client's room is now open." : "",
  ], `payments:${payment.id}:office`);
  if (resumed) await sendWorkResumed(db, { engagementId: fee.engagementId, feeLineId: fee.id, paymentId: payment.id, amount: payment.amount, receiptNumber: payment.receiptNumber!, test });
  // A Business Review on fees starts on its first payment (F3): Won, its plan and the owner's invitation.
  await beginBusinessReview(db, fee.engagementId, { opened, paid: true, actorUserId: null, via: "paystack" });
  return "confirmed";
}

/** The first fee paid, online or by hand, opens an engagement that waited for it. True when this call opened it. */
export async function openRoomIfFirstPayment(db: Pick<Database, "update">, engagementId: number) {
  const opened = await db.update(engagements).set({ opensOnPayment: false }).where(and(eq(engagements.id, engagementId), eq(engagements.opensOnPayment, true))).returning({ id: engagements.id });
  return opened.length > 0;
}

/** For the return page: where a fee payment stands, from the attempt's reference. "paid" only for the attempt that paid. */
export async function feePaymentStatus(db: Database, feeLineId: number, reference: string): Promise<{ status: OnlinePaymentStatus; item: "fee"; mode: OnlinePaymentMode }> {
  const mode = paystackMode();
  const answer = (status: OnlinePaymentStatus) => ({ status, item: "fee" as const, mode });
  const paidByThis = async () => {
    const attempt = await paymentByReference(db, reference);
    return Boolean(attempt && attempt.feeLineId === feeLineId && countsTowardsFee(attempt.status));
  };
  const fee = (await db.select({ id: engagementFeeLines.id }).from(engagementFeeLines).where(eq(engagementFeeLines.id, feeLineId)).limit(1))[0];
  if (!fee) return answer(mode === "off" ? "pending" : "failed");
  if (await paidByThis()) return answer("paid");
  if (mode === "off") return answer("pending");
  try {
    const settlement = await settleFee(db, feeLineId, reference, "return");
    if (settlement === "confirmed") return answer("paid");
    if (settlement === "already_paid") return answer((await paidByThis()) ? "paid" : "pending");
    if (settlement === "failed" || settlement === "unknown") return answer("failed");
    return answer("pending");
  } catch (error) {
    console.error(`[Paystack] Could not check ${reference} for the return page:`, error instanceof Error ? error.message : "unknown error");
    return answer("pending");
  }
}

/**
 * Emails the client the pay link for one fee (the team's "Send the payment link"), for what is left on it. Needs a fee
 * with something left to pay, Paystack on and an email for the client; it bills the fee (its invoice number). Returns the
 * link, shown once, in case the email does not arrive.
 */
export async function sendFeeLink(db: Database, input: { feeLineId: number; actorUserId: number }) {
  requireOnlinePayment();
  const found = await feeContext(db, input.feeLineId);
  if (!found) throw notFound();
  const { payer, title, businessName, engagement } = found;
  if (!payer) throw new TRPCError({ code: "BAD_REQUEST", message: "There is no client email on this engagement." });
  const billed = await db.transaction(async tx => {
    const fee = await lockFee(tx, input.feeLineId);
    if (!fee) throw notFound();
    await carryOver(tx, fee);
    const balance = await balanceOf(tx, fee);
    if (balance.left === 0) return null;
    await billFee(tx, fee);
    return { fee, ...balance };
  });
  if (!billed) throw new TRPCError({ code: "BAD_REQUEST", message: "This fee is already paid." });
  const { fee, paid, left } = billed;
  const url = feePayUrl(fee.id);
  const test = paystackMode() === "test";
  const delivery = await deliverEmail({
    to: payer.email, sender: "business_support",
    subject: `${test ? "TEST: " : ""}${fee.label}: ${formatNaira(left)} for the ${title}`,
    body: [
      ...(test ? ["TEST MODE - NO REAL MONEY MOVES", ""] : []),
      `Hello ${payer.name.split(" ")[0] ?? ""},`, "",
      `Your payment for the ${title} is ready: ${fee.label}, ${formatNaira(left)}${fee.dueOn ? `, due ${lagosTime(new Date(`${fee.dueOn}T12:00:00Z`)).split(",")[0]}` : ""}.`,
      paid > 0 ? `${formatNaira(paid)} of its ${formatNaira(fee.amount)} is paid already.` : "",
      engagement.opensOnPayment ? "Your room opens as soon as it is paid." : "",
      "", `Pay online: ${url}`, "", "Paystack takes card, bank transfer or USSD. Any questions, reply to this email.", "", `Reference: ${feeReference(fee.id)}`, "", BRAND.organisationName,
    ].join("\n"),
  }).catch((error: unknown) => ({ status: "Failed" as const, reason: error instanceof Error ? error.message : "Unknown error" }));
  await recordAudit(db, { action: "engagement_fee_link_sent", actorUserId: input.actorUserId, targetEmail: payer.email, details: { engagementId: engagement.id, feeLineId: fee.id, amount: left, business: businessName } });
  return { url, deliveryStatus: delivery.status };
}

/**
 * The fees a client sees in their room (owner and full-access staff): each with what is paid and what is left, its
 * receipts, and while something is left, its pay link. A Business Review started from the check paid its first half on
 * the check's payment request (R36): it is shown first, paid, so the room lists both halves.
 */
export async function clientFees(db: Pick<Database, "select">, engagementId: number) {
  const lines = await db.select().from(engagementFeeLines).where(eq(engagementFeeLines.engagementId, engagementId)).orderBy(asc(engagementFeeLines.sortOrder), asc(engagementFeeLines.id));
  const online = paystackMode() !== "off" && Boolean(ENV.cookieSecret);
  const started = (await db.select({ paymentRequestId: engagements.paymentRequestId }).from(engagements).where(eq(engagements.id, engagementId)).limit(1))[0];
  const request = started?.paymentRequestId ? (await db.select().from(paymentRequests).where(eq(paymentRequests.id, started.paymentRequestId)).limit(1))[0] : undefined;
  const ledger = await paymentsOfFees(db, lines.map(line => line.id));
  const receiptsOf = (entries: typeof ledger) => entries.filter(entry => countsTowardsFee(entry.status) && entry.receiptNumber !== null)
    .map(entry => ({ number: receiptNumberLabel(entry.receiptNumber!), amount: entry.amount, refunded: entry.refunded, receivedOn: entry.receivedOn }));
  const firstHalfPaid = request && request.item === "current_state" && request.status === "confirmed" && lines.some(line => line.label === `${CURRENT_STATE.name}: half on delivery`)
    ? [{ id: -request.id, label: `${CURRENT_STATE.name}: half to start`, amount: request.amountNaira, dueOn: null, paid: true, paidAmount: request.amountNaira, left: 0, writtenOff: false, reference: request.reference, payPath: null, receipts: receiptsOf(await paymentsOfRequests(db, [request.id])) }]
    : [];
  return [...firstHalfPaid, ...lines.map((line: FeeLine) => {
    const own = ledger.filter(entry => entry.feeLineId === line.id);
    const balance = feeBalance(line, own);
    return {
      id: line.id, label: line.label, amount: line.amount, dueOn: line.dueOn,
      /** Nothing left to pay: paid in full, or closed by a write-off. */
      paid: balance.left === 0,
      paidAmount: balance.paid, left: balance.left, writtenOff: balance.left === 0 && balance.writtenOff > 0,
      reference: feeReference(line.id), payPath: balance.left > 0 && online ? feePayPath(line.id) : null,
      receipts: receiptsOf(own),
    };
  })];
}

/**
 * A service's delivery (R36): sharing its main output dates every unpaid fee that has no date yet seven days ahead
 * (BALANCE_DUE_DAYS, ET 10 November 2026), bills it (its invoice number) and emails the owner each one's pay link. A fee
 * that already has a date is left alone, so sharing again sends nothing. `deliverable` is what was shared, by its method
 * name ("Findings", "Plan"). Returns how many fees it dated.
 */
export async function dateBalancesOnDelivery(db: Database, input: { engagementId: number; deliverable: string; actorUserId: number; today?: string }) {
  const today = input.today ?? lagosDay();
  const dueOn = addDays(today, BALANCE_DUE_DAYS);
  const dated = await db.transaction(async tx => {
    const rows = await tx.update(engagementFeeLines).set({ dueOn })
      .where(and(eq(engagementFeeLines.engagementId, input.engagementId), isNull(engagementFeeLines.paidAt), isNull(engagementFeeLines.dueOn), isNull(engagementFeeLines.writtenOffAt)))
      .returning();
    const billed: { id: number; label: string; amount: number; left: number }[] = [];
    for (const row of rows) {
      await billFee(tx, row);
      billed.push({ id: row.id, label: row.label, amount: row.amount, left: (await balanceOf(tx, row)).left || row.amount });
    }
    if (billed.length) await recordAudit(tx, { action: "engagement_fees_dated_on_delivery", actorUserId: input.actorUserId, details: { engagementId: input.engagementId, dueOn, feeLineIds: billed.map(fee => fee.id), total: billed.reduce((sum, fee) => sum + fee.amount, 0) } });
    return billed;
  });
  if (!dated.length) return 0;
  const found = await feeContext(db, dated[0]!.id);
  if (!found?.payer) return dated.length;
  const { payer, title } = found;
  const online = paystackMode() !== "off" && Boolean(ENV.cookieSecret);
  const test = paystackMode() === "test";
  for (const fee of dated) {
    await deliverEmail({
      to: payer.email, sender: "business_support", idempotencyKey: `engagement_fee_lines:${fee.id}:due-on-delivery`,
      subject: `${test ? "TEST: " : ""}${fee.label}: ${formatNaira(fee.left)} due by ${dayLabel(dueOn)}`,
      body: [
        ...(test ? ["TEST MODE - NO REAL MONEY MOVES", ""] : []),
        `Hello ${payer.name.split(" ")[0] ?? ""},`, "",
        `We have shared your ${input.deliverable} for your ${title} in your room.`,
        `The second half, ${formatNaira(fee.left)}, is due by ${dayLabel(dueOn)}.`, "",
        online ? `Pay online: ${feePayUrl(fee.id)}` : "Reply to this email and we will send you a link to pay.", "",
        "Paystack takes card, bank transfer or USSD. Any questions, reply to this email.", "", `Reference: ${feeReference(fee.id)}`, "", BRAND.organisationName,
      ].join("\n"),
    }).catch((error: unknown) => console.error("[Fees] The second half's link could not be sent:", error instanceof Error ? error.message : "unknown error"));
  }
  return dated.length;
}
