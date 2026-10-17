import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { businessChecks, clientOnboardingInvitations, paymentRequests, type PaymentRequest } from "../drizzle/schema";
import { BRAND } from "../shared/brand";
import { CURRENT_STATE, FULL_REPORT, formatNaira } from "../shared/businessSupport";
import { effectivePaymentStatus, ONLINE_TEST_NOTICE, PAYMENT_ITEM_DETAILS, PAYMENT_WINDOW_HOURS, paymentDeadline, paymentReference, payPath, type PaymentDisplayStatus, type PaymentItem } from "../shared/payments";
import type { PipelineStage } from "../shared/businessCheck/pipeline";
import type { Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { startEngagementSafely, type EngagementStart } from "./engagements";
import { createOnboardingInvitation, effectiveInvitationStatus } from "./clientOnboarding";
import { deliverEmail } from "./email";
import { issueReportLink } from "./fullReport/service";
import { lagosTime } from "./lagosTime";
import { paystackMode } from "./paystack";
import { getTrustedApplicationOrigin } from "./security";

/**
 * Paying for The Shift: online with Paystack only (server/onlinePayment.ts). The owner is emailed the amount, a reference
 * and a "Pay online" link; Paystack's checkout takes card, bank transfer or USSD, and the payment confirms itself through
 * `confirmPayment`. There is no bank account to pay into and no proof of payment to send. Confirming the Current State
 * Assessment payment wins the business and sends the client account invitation, which is where the assessment starts.
 */

const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] || "there";

/** The test-mode warning as an email heading (a colon would make it a details line, so it reads "TEST MODE - …"). */
export const EMAIL_TEST_NOTICE = ONLINE_TEST_NOTICE.replace(": ", " - ");

/** Online payment offered in an email: the pay page and whether Paystack is on its test keys. */
export type OnlinePaymentOffer = { url: string; mode: "test" | "live" };

/** The pay page for an item when Paystack is on, for the payment details email; null when online payment is off. */
export function onlinePaymentOffer(publicToken: string, item: PaymentItem): OnlinePaymentOffer | null {
  const mode = paystackMode();
  return mode === "off" ? null : { url: `${getTrustedApplicationOrigin()}${payPath(publicToken, item)}`, mode };
}

/**
 * The email with the payment link. Plain text; the business support layout turns it into the branded HTML, with the
 * "Pay online" line as a button. Paystack's checkout takes card, bank transfer or USSD, so there are no bank details
 * here and nothing to send back. With online payment off (no Paystack key, which /api/health reports) it says the link
 * is coming, and the team sends it again once Paystack is on.
 */
export function paymentDetailsEmail(input: { fullName: string; item: PaymentItem; reference: string; deadline: Date; online?: OnlinePaymentOffer | null }) {
  const { amount } = PAYMENT_ITEM_DETAILS[input.item];
  const report = input.item === "full_report";
  const afterwards = report
    ? `Then we send you the Report Intake, a short form about your business (about ${FULL_REPORT.formMinutes} minutes). Your Full Report is emailed to you the moment you finish it.`
    : `Then your ${CURRENT_STATE.name} starts. ${CURRENT_STATE.start}`;
  return {
    subject: report ? "Payment details for your Full Report" : `Payment details for your ${CURRENT_STATE.name}`,
    body: [
      `Dear ${firstName(input.fullName)},`,
      "",
      report
        ? "Thank you for asking for your Full Report. Here is how to pay for it."
        : `Thank you for choosing to start your ${CURRENT_STATE.name} with us. Here is how to pay for it.`,
      "",
      ...(input.online?.mode === "test" ? [EMAIL_TEST_NOTICE, "Online payment is in Paystack's test mode while we test it, so paying online moves no real money.", ""] : []),
      "HOW TO PAY",
      `Amount: ${formatNaira(amount)}`,
      `Reference: ${input.reference}`,
      // The owner's own Full Report link reopens by itself; the assessment's holds for the 48 hours after the call.
      ...(report ? [] : [`Pay by: ${lagosTime(input.deadline)} (Lagos time)`]),
      "",
      ...(input.online
        ? [
          "Pay securely with Paystack, by card, bank transfer or USSD. Your payment is confirmed straight away.",
          `Pay online: ${input.online.url}`,
        ]
        : ["Online payment is not open yet. We will email you a link to pay as soon as it is."]),
      "",
      "AFTER YOU PAY",
      "There is nothing more to do. We email you as soon as Paystack confirms your payment.",
      afterwards,
      ...(report ? [] : ["", `If you need more than ${PAYMENT_WINDOW_HOURS} hours, reply to this email and we will send you a new link.`]),
      "",
      BRAND.organisationName,
    ].join("\n"),
  };
}

/**
 * The email that tells the owner their payment arrived, and what happens next. The report's comes with its form link.
 * A payment made on Paystack's test keys says so in capitals.
 */
export function paymentConfirmedEmail(input: { fullName: string; item: PaymentItem; reference: string; reportLink?: string | null; testMode?: boolean }) {
  const { amount } = PAYMENT_ITEM_DETAILS[input.item];
  const received = [
    `Thank you. We have received your payment of ${formatNaira(amount)} (reference ${input.reference}).`,
    ...(input.testMode ? ["", EMAIL_TEST_NOTICE, "This payment was made in Paystack's test mode, so no real money moved."] : []),
  ].join("\n");
  if (input.item === "full_report") {
    return {
      subject: "Payment received: your Full Report",
      body: [
        `Dear ${firstName(input.fullName)},`,
        "",
        received,
        "",
        ...(input.reportLink
          ? [
              `One step left: complete the Report Intake, a short form about your business (about ${FULL_REPORT.formMinutes} minutes). Your Full Report is built from your answers and emailed to you the moment you finish.`,
              "",
              `Complete your Report Intake: ${input.reportLink}`,
              "",
              "The link is yours alone; please do not share it.",
            ]
          : ["Your Full Report has already been sent to you. Reply to this email if you cannot find it."]),
        "",
        BRAND.organisationName,
      ].join("\n"),
    };
  }
  return {
    subject: `Payment received: your ${CURRENT_STATE.name} starts`,
    body: [
      `Dear ${firstName(input.fullName)},`,
      "",
      received,
      "",
      `Your ${CURRENT_STATE.name} starts now. ${CURRENT_STATE.start}`,
      "",
      "WHAT HAPPENS NEXT",
      `• We email you a link to set up your client account on ${BRAND.productName}. Your ${CURRENT_STATE.name} lives there.`,
      `• We agree the time of your first ${CURRENT_STATE.name} Session with you.`,
      `• ${CURRENT_STATE.what}`,
      "",
      BRAND.organisationName,
    ].join("\n"),
  };
}

/** The payment requests of some business checks (or all), oldest first. */
export async function paymentRequestsFor(db: Pick<Database, "select">, businessCheckIds?: number[]) {
  if (businessCheckIds && !businessCheckIds.length) return [];
  const query = db.select().from(paymentRequests);
  return (businessCheckIds ? query.where(inArray(paymentRequests.businessCheckId, businessCheckIds)) : query).orderBy(paymentRequests.id);
}

/** True when the database has not had migration 0006 (payment_requests) applied yet. */
export function isMissingPaymentTable(error: unknown) {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "42P01";
}

/**
 * Payment status per business check for the admin console, with "expired" for details whose 48 hours have passed. Never breaks the console: if the payment table is missing
 * (migration 0006 not applied yet) it logs why and shows no payments.
 */
export async function paymentStatusesByCheck(db: Pick<Database, "select">, businessCheckIds?: number[]) {
  const byCheck = new Map<number, Partial<Record<PaymentItem, PaymentDisplayStatus>>>();
  const now = new Date();
  try {
    for (const request of await paymentRequestsFor(db, businessCheckIds)) {
      byCheck.set(request.businessCheckId, { ...byCheck.get(request.businessCheckId), [request.item]: effectivePaymentStatus(request, now) });
    }
  } catch (error) {
    if (!isMissingPaymentTable(error)) throw error;
    console.error("[Payments] The payment_requests table is missing: apply migration 0006 with pnpm db:migrate.");
  }
  return byCheck;
}

async function loadCheck(db: Pick<Database, "select">, businessCheckId: number) {
  const check = (await db.select({ id: businessChecks.id, publicToken: businessChecks.publicToken, fullName: businessChecks.fullName, email: businessChecks.email, pipelineStage: businessChecks.pipelineStage })
    .from(businessChecks).where(eq(businessChecks.id, businessCheckId)).limit(1))[0];
  if (!check) throw new TRPCError({ code: "NOT_FOUND", message: "That Business Check does not exist." });
  return check;
}

/** Stages before the team's own decisions: sending Current State Assessment payment details makes the business an Opportunity. */
const BEFORE_OPPORTUNITY: readonly PipelineStage[] = ["lead", "qualified_lead", "call_booked"];

/**
 * Emails the owner the payment details for an item, creating its payment request (or sending the details again).
 * `actorUserId` is null when it happens automatically (the owner asked for the full report on their result page).
 */
export async function requestPayment(db: Database, input: { businessCheckId: number; item: PaymentItem; actorUserId: number | null }) {
  const check = await loadCheck(db, input.businessCheckId);
  const existing = (await db.select().from(paymentRequests)
    .where(and(eq(paymentRequests.businessCheckId, check.id), eq(paymentRequests.item, input.item))).limit(1))[0];
  if (existing?.status === "confirmed") throw new TRPCError({ code: "CONFLICT", message: "This has already been paid." });

  const reference = paymentReference(input.item, check.id);
  const amountNaira = PAYMENT_ITEM_DETAILS[input.item].amount;
  const stageTo = input.item === "current_state" && BEFORE_OPPORTUNITY.includes(check.pipelineStage) ? "opportunity" : check.pipelineStage;
  // Recorded before the email goes, so a payment can always be matched to its reference.
  const request = await db.transaction(async tx => {
    const [row] = await tx.insert(paymentRequests)
      .values({ businessCheckId: check.id, item: input.item, amountNaira, reference, requestedByUserId: input.actorUserId })
      .onConflictDoUpdate({ target: [paymentRequests.businessCheckId, paymentRequests.item], set: { amountNaira, requestedByUserId: input.actorUserId, requestedAt: new Date() } })
      .returning();
    if (stageTo !== check.pipelineStage) await tx.update(businessChecks).set({ pipelineStage: stageTo }).where(eq(businessChecks.id, check.id));
    await recordAudit(tx, {
      action: "payment_details_sent",
      actorUserId: input.actorUserId,
      targetEmail: check.email,
      details: { businessCheckId: check.id, item: input.item, reference, amountNaira, again: Boolean(existing), ...(stageTo !== check.pipelineStage ? { from: check.pipelineStage, to: stageTo } : {}) },
    });
    return row;
  });

  // The window starts when the details go out; sending them again starts a new one. The pay page is offered while Paystack is on.
  const message = paymentDetailsEmail({ fullName: check.fullName, item: input.item, reference, deadline: paymentDeadline(request.requestedAt), online: onlinePaymentOffer(check.publicToken, input.item) });
  const delivery = await deliverEmail({ to: check.email, subject: message.subject, body: message.body, sender: "business_support", paymentRequestId: request.id, businessCheckId: check.id, idempotencyKey: `payment_requests:${request.id}:details:${request.requestedAt.getTime()}` })
    .catch((error: unknown) => ({ status: "Failed" as const, reason: error instanceof Error ? error.message : "Unknown error" }));
  await db.update(paymentRequests).set({ deliveryStatus: delivery.status }).where(eq(paymentRequests.id, request.id));
  // Why an email failed, for the office notice (for example Resend refusing addresses before the domain is verified).
  const deliveryProblem = delivery.status === "Failed" ? delivery.reason : null;
  return { paymentRequestId: request.id, reference, status: request.status, deliveryStatus: delivery.status, deliveryProblem, pipelineStage: stageTo };
}

async function loadRequest(db: Pick<Database, "select">, paymentRequestId: number): Promise<PaymentRequest> {
  const request = (await db.select().from(paymentRequests).where(eq(paymentRequests.id, paymentRequestId)).limit(1))[0];
  if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "That payment request does not exist." });
  return request;
}

/** What happened to the client account invitation when a Current State Assessment payment was confirmed. */
export type CurrentStateInvitation = "sent" | "already_invited" | "has_account" | "failed";

const NOT_CONFIRMED = { success: true, changed: false, invitation: null, engagement: null } as const;

/** A payment Paystack confirmed: the attempt's reference and whether it ran on the test keys. */
export type OnlineConfirmation = { provider: "paystack"; reference: string; mode: "test" | "live" };

/**
 * Who confirms a payment: a person on the team (their note is optional), or Paystack. Paystack is a system actor: it
 * has no account, so it is recorded as a null actor together with how the money arrived. Nobody else confirms.
 */
export type PaymentConfirmer = { actorUserId: number; note?: string; online?: undefined } | { actorUserId: null; online: OnlineConfirmation; note?: undefined };

const ONLINE_NOTE = "Paid online with Paystack, reference ";
const TEST_NOTE = "TEST: ";

/** The note on a payment Paystack confirmed, as the team sees it on the payment and in its history. */
export function onlinePaymentNote(online: OnlineConfirmation) {
  return `${online.mode === "test" ? TEST_NOTE : ""}${ONLINE_NOTE}${online.reference}`;
}

/** What the audit rows record about how the money arrived, for a Paystack confirmation; nothing for the team's. */
const viaDetails = (online: OnlineConfirmation | undefined) => (online ? { via: online.provider, paystackReference: online.reference, mode: online.mode } : {});

/**
 * Confirms the money arrived (the team checked the account, or Paystack confirmed it), emails the owner, and for the
 * Current State Assessment wins the business, starts the engagement and sends the client account invitation unless one
 * is already out or accepted. A confirmed payment is final. The team and Paystack go through this same path.
 *
 * The confirmation is claimed in one conditional statement inside one transaction, together with the stage, the audit
 * row and (for the report) the Report Intake link: two confirmations together (two people, or Paystack's webhook and
 * the owner's return page) confirm once, send one email and issue one invitation, and a confirmed report payment
 * always has a link that can be sent again.
 */
export async function confirmPayment(db: Database, input: { paymentRequestId: number } & PaymentConfirmer) {
  const request = await loadRequest(db, input.paymentRequestId);
  if (request.status === "confirmed") return NOT_CONFIRMED;
  const check = await loadCheck(db, request.businessCheckId);
  const stageTo: PipelineStage = request.item === "current_state" ? "won" : check.pipelineStage;
  const note = input.online ? onlinePaymentNote(input.online) : input.note || null;
  const via = viaDetails(input.online);
  let outcome: { reportLink: string | null } | null;
  try {
    outcome = await db.transaction(async tx => {
      const [claimed] = await tx.update(paymentRequests)
        .set({ status: "confirmed", confirmedAt: new Date(), confirmedByUserId: input.actorUserId, note })
        .where(and(eq(paymentRequests.id, request.id), ne(paymentRequests.status, "confirmed"))).returning({ id: paymentRequests.id });
      if (!claimed) return null;
      if (stageTo !== check.pipelineStage) await tx.update(businessChecks).set({ pipelineStage: stageTo }).where(eq(businessChecks.id, check.id));
      await recordAudit(tx, {
        action: "payment_confirmed",
        actorUserId: input.actorUserId,
        targetEmail: check.email,
        details: { businessCheckId: check.id, item: request.item, reference: request.reference, amountNaira: request.amountNaira, ...(note ? { note } : {}), ...via, ...(stageTo !== check.pipelineStage ? { from: check.pipelineStage, to: stageTo } : {}) },
      });
      // The report's Report Intake link is issued in the same transaction, so the email can carry it and a failure here confirms nothing.
      const reportLink = request.item === "full_report" ? await issueReportLink(tx, { businessCheckId: check.id, paymentRequestId: request.id }) : null;
      return { reportLink };
    });
  } catch (error) {
    if (isMissingPaymentTable(error)) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The Full Report table is not set up yet (migration 0007). Nothing was confirmed." });
    throw error;
  }
  if (!outcome) return NOT_CONFIRMED;

  // Email after the commit: a delivery problem never undoes a confirmation. What happened to the email is recorded, so
  // the console can show it and send it again.
  const message = paymentConfirmedEmail({ fullName: check.fullName, item: request.item, reference: request.reference, reportLink: outcome.reportLink, testMode: input.online?.mode === "test" });
  const delivery = await deliverEmail({ to: check.email, subject: message.subject, body: message.body, sender: "business_support", paymentRequestId: request.id, businessCheckId: check.id, idempotencyKey: `payment_requests:${request.id}:confirmed` })
    .catch((error: unknown) => ({ status: "Failed" as const, reason: error instanceof Error ? error.message : "Unknown error" }));
  await recordAudit(db, { action: "payment_confirmation_sent", actorUserId: input.actorUserId, targetEmail: check.email, details: { businessCheckId: check.id, item: request.item, reference: request.reference, delivery: delivery.status, again: false, ...via } });

  let invitation: CurrentStateInvitation | null = null;
  let engagement: EngagementStart | null = null;
  if (request.item === "current_state") {
    // The engagement first, so an owner who accepts the invitation at once lands in a room that exists.
    engagement = await startEngagementSafely(db, { businessCheckId: check.id, paymentRequestId: request.id, actorUserId: input.actorUserId });
    // A Paystack confirmation has no person to record the invitation against: it is recorded against whoever on the
    // team sent the payment details, and audited as the system actor.
    invitation = await inviteToClientAccount(db, check.id, input.online
      ? { actorUserId: null, createdByUserId: request.requestedByUserId, via: input.online.provider }
      : { actorUserId: input.actorUserId });
  }
  return { success: true, changed: true, invitation, engagement } as const;
}

/**
 * Sends the "payment received" email again for a confirmed Current State Assessment payment (an owner who lost it). The
 * report's confirmation carries a one-time link, so for it the console sends the Report Intake link again instead.
 */
export async function resendPaymentConfirmation(db: Database, input: { paymentRequestId: number; actorUserId: number }) {
  const request = await loadRequest(db, input.paymentRequestId);
  if (request.status !== "confirmed") throw new TRPCError({ code: "CONFLICT", message: "This payment is not confirmed yet." });
  if (request.item !== "current_state") throw new TRPCError({ code: "CONFLICT", message: "For the Full Report, send the Report Intake link again instead." });
  const check = await loadCheck(db, request.businessCheckId);
  // A payment Paystack confirmed on its test keys says so again.
  const testMode = request.confirmedByUserId === null && Boolean(request.note?.startsWith(`${TEST_NOTE}${ONLINE_NOTE}`));
  const message = paymentConfirmedEmail({ fullName: check.fullName, item: request.item, reference: request.reference, reportLink: null, testMode });
  const delivery = await deliverEmail({ to: check.email, subject: message.subject, body: message.body, sender: "business_support", paymentRequestId: request.id, businessCheckId: check.id, idempotencyKey: `payment_requests:${request.id}:confirmed:${Date.now()}` })
    .catch((error: unknown) => ({ status: "Failed" as const, reason: error instanceof Error ? error.message : "Unknown error" }));
  await recordAudit(db, { action: "payment_confirmation_sent", actorUserId: input.actorUserId, targetEmail: check.email, details: { businessCheckId: check.id, item: request.item, reference: request.reference, delivery: delivery.status, again: true } });
  return { success: true, deliveryStatus: delivery.status } as const;
}

/** The Current State Assessment starts in the client account: invite the owner unless an invitation is already out or accepted. */
async function inviteToClientAccount(db: Pick<Database, "select">, businessCheckId: number, actor: { actorUserId: number | null; createdByUserId?: number | null; via?: "paystack" }): Promise<CurrentStateInvitation> {
  const latest = (await db.select({ status: clientOnboardingInvitations.status, expiresAt: clientOnboardingInvitations.expiresAt })
    .from(clientOnboardingInvitations).where(eq(clientOnboardingInvitations.businessCheckId, businessCheckId))
    .orderBy(desc(clientOnboardingInvitations.id)).limit(1))[0];
  const status = latest ? effectiveInvitationStatus(latest) : null;
  if (status === "accepted") return "has_account";
  if (status === "pending") return "already_invited";
  try {
    await createOnboardingInvitation({ businessCheckId, ...actor });
    return "sent";
  } catch (error) {
    if (error instanceof TRPCError && error.code === "CONFLICT") return "has_account";
    console.error("[Payments] Payment confirmed, but the client account invitation could not be sent:", error instanceof Error ? error.message : error);
    return "failed";
  }
}
