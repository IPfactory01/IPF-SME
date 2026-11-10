/**
 * Paying an engagement fee online (R11, ET, 6 November 2026). Each fee line has its own pay link, keyed by an HMAC of the
 * fee's id under the server's secret, so it cannot be guessed from the sequential id. The link opens a pay page that
 * shows the business, the engagement, the fee and its amount; "Pay securely with Paystack" opens Paystack's checkout for
 * the amount in the database, never one from the browser. The payment confirms itself through Paystack's signed webhook
 * or the return page, after Paystack confirms the transaction to the server, exactly as the Business Review does.
 *
 * An engagement opened before it is paid (`opensOnPayment`) shows the client only the first fee to pay until a fee is
 * paid, online or by hand; the first payment opens the room.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { businessMemberships, businesses, engagementFeeLines, engagements, paymentRequests, users } from "../drizzle/schema";
import { addDays, BALANCE_DUE_DAYS } from "../shared/agreement";
import { BRAND } from "../shared/brand";
import { CURRENT_STATE, formatNaira } from "../shared/businessSupport";
import { dayLabel } from "../shared/engagementWork";
import { engagementTitle } from "../shared/engagementTypes";
import { PAY_RETURN_PATH, type OnlinePaymentMode, type OnlinePaymentStatus } from "../shared/payments";
import { ENV } from "./_core/env";
import type { Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { BUSINESS_SUPPORT_MAILBOX, deliverEmail } from "./email";
import { lagosTime } from "./lagosTime";
import { amountMatches, requireOnlinePayment } from "./onlinePayment";
import { initializeTransaction, onlineReference, paystackMode, verifyTransaction } from "./paystack";
import { getTrustedApplicationOrigin } from "./security";
import { mainContactOf } from "./teamContact";

type FeeLine = typeof engagementFeeLines.$inferSelect;

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

async function feeContext(db: Pick<Database, "select">, feeLineId: number) {
  const fee = (await db.select().from(engagementFeeLines).where(eq(engagementFeeLines.id, feeLineId)).limit(1))[0];
  if (!fee) return null;
  const engagement = (await db.select().from(engagements).where(eq(engagements.id, fee.engagementId)).limit(1))[0];
  if (!engagement) return null;
  const business = engagement.businessId === null ? undefined : (await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, engagement.businessId)).limit(1))[0];
  const owner = engagement.businessId === null ? undefined : (await db.select({ email: users.email, name: users.name }).from(businessMemberships).innerJoin(users, eq(businessMemberships.userId, users.id))
    .where(and(eq(businessMemberships.businessId, engagement.businessId), eq(businessMemberships.role, "owner"), eq(businessMemberships.status, "active"))).limit(1))[0];
  const payer = owner?.email ? { email: owner.email, name: owner.name ?? engagement.contactName ?? "" } : engagement.contactEmail ? { email: engagement.contactEmail, name: engagement.contactName ?? "" } : null;
  return { fee, engagement, businessName: business?.name ?? engagement.contactName ?? "", payer, title: engagementTitle(engagement.type, engagement.service) };
}

async function requireFee(db: Pick<Database, "select">, feeLineId: number, token: string) {
  if (!tokenMatches(feeLineId, token)) throw notFound();
  const found = await feeContext(db, feeLineId);
  if (!found) throw notFound();
  return found;
}

/**
 * The pay page: the business, the engagement, the fee, its amount, the mode and whether it is paid, and whom to ask on
 * WhatsApp before paying (R72): the engagement's main contact, only if they agreed to show their number; else the page
 * offers the office. Nothing else.
 */
export async function feePayPage(db: Pick<Database, "select">, input: { feeLineId: number; token: string }) {
  const { fee, engagement, businessName, title } = await requireFee(db, input.feeLineId, input.token);
  const contact = await mainContactOf(db, engagement.id);
  return { businessName, engagement: title, label: fee.label, amountNaira: fee.amount, dueOn: fee.dueOn, reference: feeReference(fee.id), mode: paystackMode(), state: fee.paidAt ? "paid" as const : "open" as const, contact };
}

/** Opens a Paystack transaction for the fee, for its amount in the database, and returns the checkout page. */
export async function startFeePayment(db: Database, input: { feeLineId: number; token: string }): Promise<{ alreadyPaid: true } | { alreadyPaid: false; url: string }> {
  requireOnlinePayment();
  const { fee, payer, engagement } = await requireFee(db, input.feeLineId, input.token);
  if (fee.paidAt) return { alreadyPaid: true };
  if (!payer) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "We do not have an email for this payment yet. Reply to your payment email and we will sort it out." });
  try {
    const { authorizationUrl } = await initializeTransaction({
      email: payer.email,
      amountKobo: fee.amount * 100,
      reference: onlineReference(feeReference(fee.id)),
      callbackUrl: `${getTrustedApplicationOrigin()}${PAY_RETURN_PATH}`,
      metadata: { feeLineId: fee.id, engagementId: engagement.id },
    });
    return { alreadyPaid: false, url: authorizationUrl };
  } catch (error) {
    console.error(`[Paystack] Could not open a payment for ${feeReference(fee.id)}:`, error instanceof Error ? error.message : "unknown error");
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
 * Confirms a fee from one Paystack transaction. The transaction is fetched from Paystack again and must match the fee's
 * reference, succeed, be in naira and be for the fee's amount. The fee is claimed once (paidAt is set only where it is
 * empty), so the webhook and the return page arriving together send one receipt. Money that moved but does not match, or
 * a second payment for a fee already paid, is sent to Business Support to check in Paystack.
 */
export async function settleFee(db: Database, feeLineId: number, reference: string, source: "webhook" | "return"): Promise<FeeSettlement> {
  const found = await feeContext(db, feeLineId);
  if (!found) return "unknown";
  const { fee, engagement, businessName, payer, title } = found;
  if (fee.paidAt && fee.paidReference === reference) return "already_paid";
  const transaction = await verifyTransaction(reference);
  if (!transaction || transaction.reference !== reference) return "failed";
  const ours = transaction.reference.startsWith(`${feeReference(fee.id)}-`);
  if (ours && transaction.status !== "success") return STILL_OPEN.has(transaction.status) ? "pending" : "failed";
  const problem = !ours ? "The Paystack reference does not belong to this fee."
    : transaction.currency !== "NGN" ? `The payment was not in naira (${transaction.currency || "no currency given"}).`
      : !amountMatches(transaction, fee.amount * 100) ? `The amount does not match: ${Number.isFinite(transaction.amount) ? formatNaira(transaction.amount / 100) : "no amount"} paid, ${formatNaira(fee.amount)} expected.`
        : fee.paidAt ? "This fee was already paid, so this may be a second payment for it." : null;
  if (problem) {
    console.error(`[Paystack] ${source}: ${reference} was not confirmed for ${feeReference(fee.id)}.`);
    await recordAudit(db, { action: "engagement_fee_online_refused", actorUserId: null, targetEmail: payer?.email ?? null, details: { engagementId: engagement.id, feeLineId: fee.id, paystackReference: reference, reason: problem } });
    await tellOffice(`Paystack payment needs a look: ${feeReference(fee.id)}`, [
      "A fee payment on Paystack was not confirmed automatically. Check it in Paystack, then tick Paid on the engagement's Fees or refund it.",
      "", `Reason: ${problem}`, `Fee: ${fee.label} (${formatNaira(fee.amount)})`, `Client: ${businessName}`, `Engagement: ${title}`, `Paystack reference: ${reference}`,
    ], `paystack:${reference}:fee:office`);
    return "refused";
  }
  const mode = paystackMode();
  const claimed = await db.update(engagementFeeLines).set({ paidAt: new Date(), paidReference: reference })
    .where(and(eq(engagementFeeLines.id, fee.id), isNull(engagementFeeLines.paidAt))).returning({ id: engagementFeeLines.id });
  if (!claimed.length) return "already_paid";
  await recordAudit(db, { action: "engagement_fee_paid_online", actorUserId: null, targetEmail: payer?.email ?? null, details: { engagementId: engagement.id, feeLineId: fee.id, amount: fee.amount, via: "paystack", paystackReference: reference, mode } });
  const opened = await openRoomIfFirstPayment(db, engagement.id);
  const test = mode === "test";
  if (payer) {
    await deliverEmail({
      to: payer.email, sender: "business_support", idempotencyKey: `engagement_fee_lines:${fee.id}:paid:client`,
      subject: `${test ? "TEST: " : ""}Payment received: ${fee.label}`,
      body: [
        ...(test ? ["TEST MODE - NO REAL MONEY MOVED", ""] : []),
        `Hello ${payer.name.split(" ")[0] ?? ""},`, "",
        `We have received ${formatNaira(fee.amount)} for the ${title}: ${fee.label}. Thank you.`, "",
        `Reference: ${feeReference(fee.id)}`, `Paid: ${lagosTime(new Date())} (Lagos time)`, "",
        opened ? `Your room is open: ${getTrustedApplicationOrigin()}/dashboard` : `Everything about the engagement is in your room: ${getTrustedApplicationOrigin()}/dashboard`, "",
        BRAND.organisationName,
      ].join("\n"),
    }).catch((error: unknown) => console.error("[Paystack] The receipt could not be sent:", error instanceof Error ? error.message : "unknown error"));
  }
  await tellOffice(`${test ? "TEST: " : ""}Paid online: ${businessName}, ${fee.label}`, [
    ...(test ? ["TEST MODE - NO REAL MONEY MOVED", ""] : []),
    `${businessName} paid ${formatNaira(fee.amount)} for the ${title} (${fee.label}) with Paystack. It is marked Paid: nothing to do.`,
    "", `Reference: ${feeReference(fee.id)}`, `Paystack reference: ${reference}`, opened ? "This was the first payment: the client's room is now open." : "",
  ], `engagement_fee_lines:${fee.id}:paid:office`);
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
  const fee = (await db.select().from(engagementFeeLines).where(eq(engagementFeeLines.id, feeLineId)).limit(1))[0];
  if (!fee) return answer(mode === "off" ? "pending" : "failed");
  const paidByThis = Boolean(fee.paidAt) && fee.paidReference === reference;
  if (mode === "off") return answer(paidByThis ? "paid" : "pending");
  try {
    const settlement = await settleFee(db, feeLineId, reference, "return");
    if (settlement === "confirmed") return answer("paid");
    if (settlement === "already_paid") return answer(paidByThis || (await db.select({ paidReference: engagementFeeLines.paidReference }).from(engagementFeeLines).where(eq(engagementFeeLines.id, feeLineId)).limit(1))[0]?.paidReference === reference ? "paid" : "pending");
    if (settlement === "failed") return answer("failed");
    return answer("pending");
  } catch (error) {
    console.error(`[Paystack] Could not check ${reference} for the return page:`, error instanceof Error ? error.message : "unknown error");
    return answer(paidByThis ? "paid" : "pending");
  }
}

/**
 * Emails the client the pay link for one fee (the team's "Send the payment link"). Needs a fee not yet paid, Paystack on
 * and an email for the client. Returns the link, shown once, in case the email does not arrive.
 */
export async function sendFeeLink(db: Database, input: { feeLineId: number; actorUserId: number }) {
  requireOnlinePayment();
  const found = await feeContext(db, input.feeLineId);
  if (!found) throw notFound();
  const { fee, payer, title, businessName, engagement } = found;
  if (fee.paidAt) throw new TRPCError({ code: "BAD_REQUEST", message: "This fee is already paid." });
  if (!payer) throw new TRPCError({ code: "BAD_REQUEST", message: "There is no client email on this engagement." });
  const url = feePayUrl(fee.id);
  const test = paystackMode() === "test";
  const delivery = await deliverEmail({
    to: payer.email, sender: "business_support",
    subject: `${test ? "TEST: " : ""}${fee.label}: ${formatNaira(fee.amount)} for the ${title}`,
    body: [
      ...(test ? ["TEST MODE - NO REAL MONEY MOVES", ""] : []),
      `Hello ${payer.name.split(" ")[0] ?? ""},`, "",
      `Your payment for the ${title} is ready: ${fee.label}, ${formatNaira(fee.amount)}${fee.dueOn ? `, due ${lagosTime(new Date(`${fee.dueOn}T12:00:00Z`)).split(",")[0]}` : ""}.`,
      engagement.opensOnPayment ? "Your room opens as soon as it is paid." : "",
      "", `Pay online: ${url}`, "", "Paystack takes card, bank transfer or USSD. Any questions, reply to this email.", "", `Reference: ${feeReference(fee.id)}`, "", BRAND.organisationName,
    ].join("\n"),
  }).catch((error: unknown) => ({ status: "Failed" as const, reason: error instanceof Error ? error.message : "Unknown error" }));
  await recordAudit(db, { action: "engagement_fee_link_sent", actorUserId: input.actorUserId, targetEmail: payer.email, details: { engagementId: engagement.id, feeLineId: fee.id, amount: fee.amount, business: businessName } });
  return { url, deliveryStatus: delivery.status };
}

/**
 * The fees a client sees in their room (owner and full-access staff): each with its status and, when unpaid, its pay link.
 * A Business Review started from the check paid its first half on the check's payment request (R36): it is shown first,
 * paid, so the room lists both halves.
 */
export async function clientFees(db: Pick<Database, "select">, engagementId: number) {
  const lines = await db.select().from(engagementFeeLines).where(eq(engagementFeeLines.engagementId, engagementId)).orderBy(asc(engagementFeeLines.sortOrder), asc(engagementFeeLines.id));
  const online = paystackMode() !== "off" && Boolean(ENV.cookieSecret);
  const started = (await db.select({ paymentRequestId: engagements.paymentRequestId }).from(engagements).where(eq(engagements.id, engagementId)).limit(1))[0];
  const request = started?.paymentRequestId ? (await db.select().from(paymentRequests).where(eq(paymentRequests.id, started.paymentRequestId)).limit(1))[0] : undefined;
  const firstHalfPaid = request && request.item === "current_state" && request.status === "confirmed" && lines.some(line => line.label === `${CURRENT_STATE.name}: half on delivery`)
    ? [{ id: -request.id, label: `${CURRENT_STATE.name}: half to start`, amount: request.amountNaira, dueOn: null, paid: true, reference: request.reference, payPath: null }]
    : [];
  return [...firstHalfPaid, ...lines.map((line: FeeLine) => ({ id: line.id, label: line.label, amount: line.amount, dueOn: line.dueOn, paid: line.paidAt !== null, reference: feeReference(line.id), payPath: !line.paidAt && online ? feePayPath(line.id) : null }))];
}

/**
 * A service's delivery (R36): sharing its main output dates every unpaid fee that has no date yet seven days ahead
 * (BALANCE_DUE_DAYS, ET 10 November 2026) and emails the owner each one's pay link. A fee that already has a date is
 * left alone, so sharing again sends nothing. `deliverable` is what was shared, by its method name ("Findings", "Plan").
 * Returns how many fees it dated.
 */
export async function dateBalancesOnDelivery(db: Database, input: { engagementId: number; deliverable: string; actorUserId: number; today?: string }) {
  const today = input.today ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  const dueOn = addDays(today, BALANCE_DUE_DAYS);
  const dated = await db.update(engagementFeeLines).set({ dueOn })
    .where(and(eq(engagementFeeLines.engagementId, input.engagementId), isNull(engagementFeeLines.paidAt), isNull(engagementFeeLines.dueOn)))
    .returning({ id: engagementFeeLines.id, label: engagementFeeLines.label, amount: engagementFeeLines.amount });
  if (!dated.length) return 0;
  await recordAudit(db, { action: "engagement_fees_dated_on_delivery", actorUserId: input.actorUserId, details: { engagementId: input.engagementId, dueOn, feeLineIds: dated.map(fee => fee.id), total: dated.reduce((sum, fee) => sum + fee.amount, 0) } });
  const found = await feeContext(db, dated[0]!.id);
  if (!found?.payer) return dated.length;
  const { payer, title } = found;
  const online = paystackMode() !== "off" && Boolean(ENV.cookieSecret);
  const test = paystackMode() === "test";
  for (const fee of dated) {
    await deliverEmail({
      to: payer.email, sender: "business_support", idempotencyKey: `engagement_fee_lines:${fee.id}:due-on-delivery`,
      subject: `${test ? "TEST: " : ""}${fee.label}: ${formatNaira(fee.amount)} due by ${dayLabel(dueOn)}`,
      body: [
        ...(test ? ["TEST MODE - NO REAL MONEY MOVES", ""] : []),
        `Hello ${payer.name.split(" ")[0] ?? ""},`, "",
        `We have shared your ${input.deliverable} for your ${title} in your room.`,
        `The second half, ${formatNaira(fee.amount)}, is due by ${dayLabel(dueOn)}.`, "",
        online ? `Pay online: ${feePayUrl(fee.id)}` : "Reply to this email and we will send you a link to pay.", "",
        "Paystack takes card, bank transfer or USSD. Any questions, reply to this email.", "", `Reference: ${feeReference(fee.id)}`, "", BRAND.organisationName,
      ].join("\n"),
    }).catch((error: unknown) => console.error("[Fees] The second half's link could not be sent:", error instanceof Error ? error.message : "unknown error"));
  }
  return dated.length;
}
