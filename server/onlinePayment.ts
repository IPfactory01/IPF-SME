import type { Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { businessChecks, paymentRequests, type BusinessCheck, type PaymentRequest } from "../drizzle/schema";
import { BRAND } from "../shared/brand";
import { formatNaira } from "../shared/businessSupport";
import {
  effectivePaymentStatus, PAY_RETURN_PATH, PAYMENT_ITEM_DETAILS, PAYMENT_ITEM_TITLES, PAYMENT_ITEMS,
  type OnlinePaymentMode, type OnlinePaymentStatus, type PaymentDisplayStatus, type PaymentItem, type PayPageState,
} from "../shared/payments";
import type { Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { getDb } from "./db";
import { BUSINESS_SUPPORT_MAILBOX, deliverEmail } from "./email";
import { lagosTime } from "./lagosTime";
import { assertAmountAllowed, getBusinessSupportPrice } from "./businessSupportPrices";
import { askForFullReport } from "./fullReportRequest";
import { confirmPayment, requestPayment, type OnlineConfirmation } from "./payments";
import { initializeTransaction, isValidPaystackSignature, onlineReference, paymentReferenceOf, paystackMode, verifyTransaction, type VerifiedTransaction } from "./paystack";
import { getTrustedApplicationOrigin } from "./security";

/**
 * Paying online with Paystack's hosted checkout. The owner opens the pay page from the payment details email (keyed by
 * their Business Health Check's unguessable token), the server opens a Paystack transaction for the amount on the payment
 * request, and Paystack sends them back to /pay/return. The payment is confirmed by whichever arrives first, Paystack's
 * signed webhook or the return page, and only after Paystack itself confirms the transaction to the server. Both go
 * through `confirmPayment` (the team's "Confirm by hand" fallback uses it too), with Paystack recorded as a system actor.
 */

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "We could not find this payment. Use the link in your payment email." });

export const ONLINE_PAYMENT_OFF_MESSAGE = "Online payment is not open yet. Please try again later, or reply to your payment email and we will send you a link when it is.";

/** Refuses when Paystack is off (no secret key): nothing online is offered then. Returns the mode otherwise. */
export function requireOnlinePayment(): Exclude<OnlinePaymentMode, "off"> {
  const mode = paystackMode();
  if (mode === "off") throw new TRPCError({ code: "PRECONDITION_FAILED", message: ONLINE_PAYMENT_OFF_MESSAGE });
  return mode;
}

/** The Business Health Check behind a pay link (its unguessable token), and its payment request for the item if one exists. */
async function lookup(db: Pick<Database, "select">, token: string, item: PaymentItem) {
  const check = (await db.select().from(businessChecks).where(eq(businessChecks.publicToken, token)).limit(1))[0];
  if (!check) throw notFound();
  const request = (await db.select().from(paymentRequests)
    .where(and(eq(paymentRequests.businessCheckId, check.id), eq(paymentRequests.item, item))).limit(1))[0];
  return { check, request };
}

/**
 * The owner may start paying for the Full Report themselves, from the link in their summary email, once their check is
 * finished: before they have asked, and after an earlier 48 hours have passed. The Business Review is offered
 * only by the team, after the Discovery Call, so it always needs payment details the team sent.
 */
const ownerMayStart = (check: Pick<BusinessCheck, "completedAt">, item: PaymentItem) => item === "full_report" && Boolean(check.completedAt);

const requestByReference = async (db: Pick<Database, "select">, reference: string) =>
  (await db.select().from(paymentRequests).where(eq(paymentRequests.reference, reference)).limit(1))[0];

// An old record with proof of a bank transfer (from before Paystack only) can still be paid online.
const PAGE_STATE = { requested: "open", expired: "expired", proof_received: "open", confirmed: "paid" } as const satisfies Record<PaymentDisplayStatus, PayPageState>;

/** What the pay page needs, and nothing else: the item, its amount, whether online payment is on, and where it stands. */
export async function onlinePaymentPage(db: Pick<Database, "select">, input: { token: string; item: PaymentItem }) {
  const { check, request } = await lookup(db, input.token, input.item);
  if (!request) {
    // Not asked for yet: the Full Report at today's price, filed when the owner presses pay.
    if (!ownerMayStart(check, input.item)) throw notFound();
    return { item: input.item, name: PAYMENT_ITEM_TITLES[input.item], amountNaira: getBusinessSupportPrice(input.item), mode: paystackMode(), state: "open" as PayPageState };
  }
  const display = effectivePaymentStatus(request);
  return {
    item: request.item,
    name: PAYMENT_ITEM_TITLES[request.item],
    amountNaira: request.amountNaira,
    mode: paystackMode(),
    // An owner's own Full Report link never dead-ends: pressing pay starts a new 48 hours.
    state: display === "expired" && ownerMayStart(check, request.item) ? "open" : PAGE_STATE[display],
  };
}

/**
 * Opens a Paystack transaction for one payment request and returns the checkout page. The amount is the request's own
 * (whole naira, times 100 for kobo): the browser never names an amount. Each attempt has its own reference, because
 * Paystack refuses a reference twice and an owner may abandon a first try.
 */
export async function startOnlinePayment(db: Database, input: { token: string; item: PaymentItem }): Promise<{ alreadyPaid: true } | { alreadyPaid: false; url: string }> {
  requireOnlinePayment();
  const found = await lookup(db, input.token, input.item);
  const { check } = found;
  let request = found.request;
  if (!request) {
    // Paying from the summary email before asking: filed exactly as "Get my Full Report" on the result page would.
    if (!ownerMayStart(check, input.item)) throw notFound();
    await askForFullReport(db, check, { source: "pay_link" });
    request = (await lookup(db, input.token, input.item)).request;
    if (!request) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "We could not open Paystack just now. Please try again in a minute, or reply to your summary email." });
  }
  if (request.status === "confirmed") return { alreadyPaid: true };
  // The link holds for 48 hours; sending it again opens a new window.
  if (effectivePaymentStatus(request) === "expired") {
    if (!ownerMayStart(check, request.item)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This payment link has passed its 48 hours. Reply to your payment email and we will send you a new one." });
    }
    // The owner chose the report themselves: a new 48 hours, with fresh details by email, as if they had asked again.
    await requestPayment(db, { businessCheckId: check.id, item: request.item, actorUserId: null });
    request = (await lookup(db, input.token, input.item)).request ?? request;
  }
  // A stored amount is the authority, but a leftover test price cannot be paid in production once the switch is off.
  assertAmountAllowed(request.amountNaira);
  const email = check.email;
  const reference = onlineReference(request.reference);
  try {
    const { authorizationUrl } = await initializeTransaction({
      email,
      amountKobo: request.amountNaira * 100,
      reference,
      callbackUrl: `${getTrustedApplicationOrigin()}${PAY_RETURN_PATH}`,
      metadata: { paymentRequestId: request.id, businessCheckId: request.businessCheckId, item: request.item },
    });
    return { alreadyPaid: false, url: authorizationUrl };
  } catch (error) {
    console.error(`[Paystack] Could not open a payment for ${request.reference}:`, error instanceof Error ? error.message : "unknown error");
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "We could not open Paystack just now. Please try again in a minute." });
  }
}

/** Why a transaction cannot confirm a payment request, or null when it can. The amount is compared in kobo. */
export type TransactionProblem = "reference" | "status" | "currency" | "amount";

export function transactionProblem(request: Pick<PaymentRequest, "reference" | "amountNaira">, transaction: VerifiedTransaction): TransactionProblem | null {
  if (!transaction.reference.startsWith(`${request.reference}-`)) return "reference";
  if (transaction.status !== "success") return "status";
  if (transaction.currency !== "NGN") return "currency";
  if (!amountMatches(transaction, request.amountNaira * 100)) return "amount";
  return null;
}

/**
 * The amount matches when Paystack charged exactly what we asked, or, when the customer bore Paystack's fee, when the
 * amount Paystack says we requested is ours and the customer paid at least that. Never less than our price.
 */
export function amountMatches(transaction: Pick<VerifiedTransaction, "amount" | "requestedAmount">, expectedKobo: number) {
  if (transaction.amount === expectedKobo) return true;
  return transaction.requestedAmount === expectedKobo && Number.isFinite(transaction.amount) && transaction.amount >= expectedKobo;
}

/** Paystack's statuses for a transaction that may still succeed. */
const STILL_OPEN = new Set(["ongoing", "pending", "processing", "queued"]);

/**
 * What became of one transaction: confirmed now; already paid (by this payment before, or by another means); pending
 * at Paystack; failed (not completed, or unknown to Paystack); refused (money moved but it does not match the request,
 * so the team is told); unknown (not one of ours).
 */
export type Settlement = "confirmed" | "already_paid" | "pending" | "failed" | "refused" | "unknown";

const paidBy = (request: Pick<PaymentRequest, "note">, reference: string) => Boolean(request.note?.includes(reference));

async function checkOf(db: Pick<Database, "select">, businessCheckId: number) {
  return (await db.select({ id: businessChecks.id, fullName: businessChecks.fullName, email: businessChecks.email, businessName: businessChecks.businessName })
    .from(businessChecks).where(eq(businessChecks.id, businessCheckId)).limit(1))[0];
}

type LookReason = Exclude<TransactionProblem, "status"> | "paid_twice";

const PROBLEM_TEXT: Record<LookReason, (transaction: VerifiedTransaction, request: PaymentRequest) => string> = {
  reference: () => "The Paystack reference does not belong to this payment.",
  currency: transaction => `The payment was not in naira (${transaction.currency || "no currency given"}).`,
  amount: (transaction, request) => `The amount does not match: ${Number.isFinite(transaction.amount) ? formatNaira(transaction.amount / 100) : "no amount"} paid, ${formatNaira(request.amountNaira)} expected.`,
  paid_twice: () => "This item was already paid, so this may be a second payment for it.",
};

/**
 * Tells Business Support about a Paystack payment that was not confirmed although money may have moved, so a person
 * checks it in Paystack, then confirms it by hand or refunds it. Recorded in the audit log as the system actor.
 */
async function needsALook(db: Database, request: PaymentRequest, transaction: VerifiedTransaction, problem: LookReason, source: string) {
  const reason = PROBLEM_TEXT[problem](transaction, request);
  console.error(`[Paystack] ${source}: ${transaction.reference} was not confirmed for ${request.reference}: ${problem}.`);
  const check = await checkOf(db, request.businessCheckId);
  await recordAudit(db, {
    action: "payment_online_refused",
    actorUserId: null,
    targetEmail: check?.email ?? null,
    details: { businessCheckId: request.businessCheckId, item: request.item, reference: request.reference, via: "paystack", paystackReference: transaction.reference, mode: paystackMode(), problem, amountKobo: transaction.amount, currency: transaction.currency },
  });
  await deliverEmail({
    to: BUSINESS_SUPPORT_MAILBOX,
    sender: "business_support",
    idempotencyKey: `paystack:${transaction.reference}:${problem}:office`,
    subject: `Paystack payment needs a look: ${request.reference}`,
    body: [
      "A payment on Paystack was not confirmed automatically. Check it in Paystack, then confirm it by hand in the admin console or refund it.",
      "",
      `Reason: ${reason}`,
      `Reference: ${request.reference}`,
      `Paystack reference: ${transaction.reference}`,
      `Owner: ${check ? `${check.fullName} (${check.email})` : "Not found"}`,
      `Item: ${PAYMENT_ITEM_TITLES[request.item]}`,
      "",
      `Business Health Check #${request.businessCheckId}.`,
    ].join("\n"),
  }).catch((error: unknown) => console.error("[Paystack] The office notice could not be sent:", error instanceof Error ? error.message : "unknown error"));
}

/** Tells Business Support that Paystack confirmed a payment: nobody pressed a button, so nobody on the team knows yet. */
async function tellOfficePaid(db: Database, request: PaymentRequest, online: OnlineConfirmation, result: Awaited<ReturnType<typeof confirmPayment>>) {
  const check = await checkOf(db, request.businessCheckId);
  const test = online.mode === "test";
  const next = request.item === "full_report"
    ? ["The payment confirmation with the Report Intake link has been emailed to the owner."]
    : [
      "The business is now Won.",
      `Engagement: ${result.engagement === "started" || result.engagement === "exists" ? "started" : "NOT STARTED. Start it from Engagements."}`,
      `Client account invitation: ${result.invitation === "sent" ? "sent" : result.invitation === "already_invited" ? "already out" : result.invitation === "has_account" ? "they already have an account" : "NOT SENT. Send it from Client Onboarding."}`,
    ];
  await deliverEmail({
    to: BUSINESS_SUPPORT_MAILBOX,
    sender: "business_support",
    idempotencyKey: `payment_requests:${request.id}:paid_online:office`,
    subject: `${test ? "TEST: " : ""}Paid online: ${check?.businessName || check?.fullName || request.reference}, ${PAYMENT_ITEM_TITLES[request.item]}`,
    body: [
      ...(test ? ["TEST MODE - NO REAL MONEY MOVED", ""] : []),
      `${check?.fullName ?? "The owner"} paid ${formatNaira(request.amountNaira)} for the ${PAYMENT_ITEM_TITLES[request.item]} with Paystack. It is confirmed: nothing to do in the admin console.`,
      "",
      `Email: ${check?.email ?? "Not found"}`,
      `Business: ${check?.businessName || "Not given"}`,
      `Reference: ${request.reference}`,
      `Paystack reference: ${online.reference}`,
      `Confirmed: ${lagosTime(new Date())} (Lagos time)`,
      "",
      ...next,
      "",
      `Business Health Check #${request.businessCheckId}. ${BRAND.organisationName}`,
    ].join("\n"),
  }).catch((error: unknown) => console.error("[Paystack] The office notice could not be sent:", error instanceof Error ? error.message : "unknown error"));
}

/**
 * Confirms a payment request from one Paystack transaction, through the same path the team uses. The transaction is
 * fetched from Paystack again, never taken from the caller, and must pass every check in `transactionProblem` before
 * anything changes. Safe to run any number of times, and from the webhook and the return page at once: the
 * confirmation is claimed once, so the owner gets one email. Throws only when Paystack or the database cannot be
 * reached, so the caller can try again.
 */
async function settle(db: Database, request: PaymentRequest, reference: string, source: "webhook" | "return"): Promise<Settlement> {
  // Already confirmed by this very payment (a repeat delivery, or the other of webhook and return page): nothing to ask.
  if (request.status === "confirmed" && paidBy(request, reference)) return "already_paid";
  const transaction = await verifyTransaction(reference);
  if (!transaction || transaction.reference !== reference) {
    console.warn(`[Paystack] ${source}: Paystack does not know ${reference}; nothing was confirmed.`);
    return "failed";
  }
  const problem = transactionProblem(request, transaction);
  if (problem === "status") return STILL_OPEN.has(transaction.status) ? "pending" : "failed";
  if (problem) {
    await needsALook(db, request, transaction, problem, source);
    return "refused";
  }
  const mode = paystackMode();
  if (mode === "off") throw new Error("Paystack was switched off while a payment was being confirmed.");
  const online: OnlineConfirmation = { provider: "paystack", reference, mode };
  if (request.status !== "confirmed") {
    const result = await confirmPayment(db, { paymentRequestId: request.id, actorUserId: null, online });
    if (result.changed) {
      await tellOfficePaid(db, request, online, result);
      return "confirmed";
    }
  }
  // Confirmed before this payment arrived: by the team by hand, or by another attempt. Money may have moved twice.
  const now = await requestByReference(db, request.reference);
  if (now && !paidBy(now, reference)) await needsALook(db, now, transaction, "paid_twice", source);
  return "already_paid";
}

/** Confirms from a Paystack reference (the webhook). "unknown" when the reference is not one of ours. */
export async function settleOnlinePayment(db: Database, reference: string, source: "webhook" | "return"): Promise<Settlement> {
  const prefix = paymentReferenceOf(reference);
  const request = prefix ? await requestByReference(db, prefix) : undefined;
  if (!request) return "unknown";
  return settle(db, request, reference, source);
}

/** The item a request reference is for, from its code (TS-R-… the Full Report, TS-CS-… the assessment), or null. */
function itemOfReference(paymentReference: string): PaymentItem | null {
  const code = /^TS-([A-Z]{1,3})-/.exec(paymentReference)?.[1];
  return PAYMENT_ITEMS.find(item => PAYMENT_ITEM_DETAILS[item].code === code) ?? null;
}

/**
 * Where a payment stands, for the return page, from the attempt's Paystack reference. Confirms it through the shared
 * path if Paystack's webhook has not yet. Answers only paid, pending or failed, the item and the mode: nothing about
 * the owner. A payment that moved money but does not match shows as pending while the team looks at it.
 *
 * Request references are sequential, so anyone can invent an attempt reference for someone else's request. "paid" is
 * therefore answered only for the attempt that paid (its reference is on the confirmation, or Paystack confirms it as a
 * success); an invented one answers exactly as it would for an unpaid request, or for no request at all.
 */
export async function onlinePaymentStatus(db: Database, reference: string): Promise<{ status: OnlinePaymentStatus; item: PaymentItem; mode: OnlinePaymentMode }> {
  const prefix = paymentReferenceOf(reference);
  const item = prefix ? itemOfReference(prefix) : null;
  if (!prefix || !item) throw notFound();
  const mode = paystackMode();
  const answer = (status: OnlinePaymentStatus) => ({ status, item, mode });
  const request = await requestByReference(db, prefix);
  if (!request) return answer(mode === "off" ? "pending" : "failed");
  const paidByThis = request.status === "confirmed" && paidBy(request, reference);
  if (mode === "off") return answer(paidByThis ? "paid" : "pending");
  let settlement: Settlement;
  try {
    settlement = await settle(db, request, reference, "return");
  } catch (error) {
    console.error(`[Paystack] Could not check ${reference} for the return page:`, error instanceof Error ? error.message : "unknown error");
    return answer(paidByThis ? "paid" : "pending");
  }
  if (settlement === "confirmed" || settlement === "already_paid") return answer("paid");
  if (settlement === "failed") return answer("failed");
  return answer("pending");
}

type PaystackEvent = { event: string; reference: string | null };

function parseEvent(raw: Buffer): PaystackEvent | null {
  try {
    const parsed = JSON.parse(raw.toString("utf8")) as { event?: unknown; data?: { reference?: unknown } };
    return { event: typeof parsed?.event === "string" ? parsed.event : "", reference: typeof parsed?.data?.reference === "string" ? parsed.data.reference : null };
  } catch {
    return null;
  }
}

/**
 * POST /api/paystack/webhook. Registered before the JSON parser and outside the browser-origin guard
 * (server/_core/app.ts, server/security.ts): Paystack signs the exact bytes it sends and has no browser Origin, so the
 * signature is the check. A bad or missing signature is 401 and nothing happens. A signed event is answered 200 once
 * handled or deliberately ignored (other events, repeats, payments that are not ours or do not match); 500 only when
 * Paystack or the database could not be reached, so Paystack sends it again and the confirmation is not lost.
 */
export async function handlePaystackWebhook(req: Request, res: Response) {
  const raw = Buffer.isBuffer(req.body) ? req.body : null;
  if (!raw || !isValidPaystackSignature(raw, req.headers["x-paystack-signature"])) {
    res.status(401).json({ message: "Invalid signature." });
    return;
  }
  const event = parseEvent(raw);
  if (event?.event !== "charge.success" || !event.reference) {
    res.status(200).json({ received: true });
    return;
  }
  try {
    const db = await getDb();
    if (!db) throw new Error("the database is not available");
    const settlement = await settleOnlinePayment(db, event.reference, "webhook");
    if (settlement === "unknown") console.warn(`[Paystack] webhook: ${event.reference} is not a payment of ours; ignored.`);
    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[Paystack] webhook not processed; Paystack will send it again:", error instanceof Error ? error.message : "unknown error");
    res.status(500).json({ message: "Not processed. Please send it again." });
  }
}
