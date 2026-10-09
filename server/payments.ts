import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { businessChecks, clientOnboardingInvitations, paymentRequests, type PaymentRequest } from "../drizzle/schema";
import { BRAND } from "../shared/brand";
import { CURRENT_STATE, FULL_REPORT, formatNaira } from "../shared/businessSupport";
import { effectivePaymentStatus, PAYMENT_ITEM_DETAILS, PAYMENT_WINDOW_HOURS, paymentDeadline, paymentReference, type PaymentDisplayStatus, type PaymentItem } from "../shared/payments";
import type { PipelineStage } from "../shared/businessCheck/pipeline";
import { ENV } from "./_core/env";
import type { Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { createOnboardingInvitation, effectiveInvitationStatus } from "./clientOnboarding";
import { deliverEmail } from "./email";
import { issueReportLink } from "./fullReport/service";
import { lagosTime } from "./lagosTime";

/**
 * Payment by bank transfer until online payment (Paystack) is ready: the owner is emailed the amount, the account and a
 * reference; they reply with proof; the team confirms the money arrived. Confirming the Current State Assessment payment
 * wins the business and sends the client account invitation, which is where the Current State Assessment starts.
 */

export const PLACEHOLDER_BANK_DETAILS = { bankName: "Test Bank", accountName: "IP Factory (test account)", accountNumber: "0000000000" } as const;

/** The account owners pay into: PAYMENT_* in the hosting settings, or clearly marked placeholder details until all are set. */
export function bankDetails() {
  if (ENV.paymentBankName && ENV.paymentAccountName && ENV.paymentAccountNumber) {
    return { bankName: ENV.paymentBankName, accountName: ENV.paymentAccountName, accountNumber: ENV.paymentAccountNumber, placeholder: false };
  }
  return { ...PLACEHOLDER_BANK_DETAILS, placeholder: true };
}

const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] || "there";

/** The email with the payment details. Plain text; the business support layout turns it into the branded HTML. */
export function paymentDetailsEmail(input: { fullName: string; item: PaymentItem; reference: string; deadline: Date }) {
  const bank = bankDetails();
  const { amount } = PAYMENT_ITEM_DETAILS[input.item];
  const report = input.item === "full_report";
  return {
    subject: report ? "Payment details for your full business check report" : `Payment details for your ${CURRENT_STATE.name}`,
    body: [
      `Dear ${firstName(input.fullName)},`,
      "",
      report
        ? "Thank you for asking for your full business check report. Here is how to pay for it."
        : `Thank you for choosing to start your ${CURRENT_STATE.name} with us. Here is how to pay for it.`,
      "",
      ...(bank.placeholder ? ["TEST DETAILS - DO NOT PAY", "These are placeholder details while we test this email. Please do not make a transfer to them.", ""] : []),
      "HOW TO PAY",
      `Amount: ${formatNaira(amount)}`,
      `Bank: ${bank.bankName}`,
      `Account name: ${bank.accountName}`,
      `Account number: ${bank.accountNumber}`,
      `Reference: ${input.reference}`,
      `Pay by: ${lagosTime(input.deadline)} (Lagos time)`,
      "",
      "Please put the reference on your transfer, so we can match your payment to you.",
      `These details hold for ${PAYMENT_WINDOW_HOURS} hours. If you need more time, reply to this email and we will send them again.`,
      "",
      "AFTER YOU PAY",
      "Reply to this email with your proof of payment: a screenshot of the transfer or your bank's receipt. We will confirm by email once the payment arrives.",
      report
        ? `Then we send you a short form about your business (about ${FULL_REPORT.formMinutes} minutes). Your report is emailed to you the moment you finish it.`
        : `Then your ${CURRENT_STATE.name} starts. ${CURRENT_STATE.start}`,
      "",
      BRAND.organisationName,
    ].join("\n"),
  };
}

/** The email that tells the owner their payment arrived, and what happens next. The report's comes with its form link. */
export function paymentConfirmedEmail(input: { fullName: string; item: PaymentItem; reference: string; reportLink?: string | null }) {
  const { amount } = PAYMENT_ITEM_DETAILS[input.item];
  const received = `Thank you. We have received your payment of ${formatNaira(amount)} (reference ${input.reference}).`;
  if (input.item === "full_report") {
    return {
      subject: "Payment received: your full business check report",
      body: [
        `Dear ${firstName(input.fullName)},`,
        "",
        received,
        "",
        ...(input.reportLink
          ? [
              `One step left: answer a short form about your business (about ${FULL_REPORT.formMinutes} minutes). Your report is built from your answers and emailed to you the moment you finish.`,
              "",
              `Complete your report form: ${input.reportLink}`,
              "",
              "The link is yours alone; please do not share it.",
            ]
          : ["Your report has already been sent to you. Reply to this email if you cannot find it."]),
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
      `• We agree the time of your first ${CURRENT_STATE.name} call with you.`,
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
  const check = (await db.select({ id: businessChecks.id, fullName: businessChecks.fullName, email: businessChecks.email, pipelineStage: businessChecks.pipelineStage })
    .from(businessChecks).where(eq(businessChecks.id, businessCheckId)).limit(1))[0];
  if (!check) throw new TRPCError({ code: "NOT_FOUND", message: "That business check does not exist." });
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

  // The window starts when the details go out; sending them again starts a new one.
  const message = paymentDetailsEmail({ fullName: check.fullName, item: input.item, reference, deadline: paymentDeadline(request.requestedAt) });
  const delivery = await deliverEmail({ to: check.email, subject: message.subject, body: message.body, sender: "business_support" })
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

/** The owner sent proof of payment (usually by replying to the payment email); the money is not yet confirmed. */
export async function markProofReceived(db: Database, input: { paymentRequestId: number; actorUserId: number }) {
  const request = await loadRequest(db, input.paymentRequestId);
  if (request.status === "confirmed") throw new TRPCError({ code: "CONFLICT", message: "This payment is already confirmed." });
  if (request.status === "proof_received") return { success: true, changed: false } as const;
  const check = await loadCheck(db, request.businessCheckId);
  await db.transaction(async tx => {
    await tx.update(paymentRequests).set({ status: "proof_received", proofReceivedAt: new Date() }).where(eq(paymentRequests.id, request.id));
    await recordAudit(tx, { action: "payment_proof_received", actorUserId: input.actorUserId, targetEmail: check.email, details: { businessCheckId: check.id, item: request.item, reference: request.reference } });
  });
  return { success: true, changed: true } as const;
}

/** What happened to the client account invitation when a Current State Assessment payment was confirmed. */
export type CurrentStateInvitation = "sent" | "already_invited" | "has_account" | "failed";

/**
 * Confirms the money arrived (the team checked the account), emails the owner, and for the Current State Assessment wins the business
 * and sends the client account invitation unless one is already out or accepted. A confirmed payment is final.
 */
export async function confirmPayment(db: Database, input: { paymentRequestId: number; actorUserId: number; note?: string }) {
  const request = await loadRequest(db, input.paymentRequestId);
  if (request.status === "confirmed") return { success: true, changed: false, invitation: null } as const;
  const check = await loadCheck(db, request.businessCheckId);
  const stageTo: PipelineStage = request.item === "current_state" ? "won" : check.pipelineStage;
  await db.transaction(async tx => {
    await tx.update(paymentRequests)
      .set({ status: "confirmed", confirmedAt: new Date(), confirmedByUserId: input.actorUserId, note: input.note || null })
      .where(eq(paymentRequests.id, request.id));
    if (stageTo !== check.pipelineStage) await tx.update(businessChecks).set({ pipelineStage: stageTo }).where(eq(businessChecks.id, check.id));
    await recordAudit(tx, {
      action: "payment_confirmed",
      actorUserId: input.actorUserId,
      targetEmail: check.email,
      details: { businessCheckId: check.id, item: request.item, reference: request.reference, amountNaira: request.amountNaira, ...(input.note ? { note: input.note } : {}), ...(stageTo !== check.pipelineStage ? { from: check.pipelineStage, to: stageTo } : {}) },
    });
  });

  // The report's form link is issued before the email, so the email can carry it.
  const reportLink = request.item === "full_report" ? await issueReportLink(db, { businessCheckId: check.id, paymentRequestId: request.id }) : null;
  const message = paymentConfirmedEmail({ fullName: check.fullName, item: request.item, reference: request.reference, reportLink });
  await deliverEmail({ to: check.email, subject: message.subject, body: message.body, sender: "business_support" }).catch(() => undefined);

  let invitation: CurrentStateInvitation | null = null;
  if (request.item === "current_state") invitation = await inviteToClientAccount(db, check.id, input.actorUserId);
  return { success: true, changed: true, invitation } as const;
}

/** The Current State Assessment starts in the client account: invite the owner unless an invitation is already out or accepted. */
async function inviteToClientAccount(db: Pick<Database, "select">, businessCheckId: number, actorUserId: number): Promise<CurrentStateInvitation> {
  const latest = (await db.select({ status: clientOnboardingInvitations.status, expiresAt: clientOnboardingInvitations.expiresAt })
    .from(clientOnboardingInvitations).where(eq(clientOnboardingInvitations.businessCheckId, businessCheckId))
    .orderBy(desc(clientOnboardingInvitations.id)).limit(1))[0];
  const status = latest ? effectiveInvitationStatus(latest) : null;
  if (status === "accepted") return "has_account";
  if (status === "pending") return "already_invited";
  try {
    await createOnboardingInvitation({ businessCheckId, actorUserId });
    return "sent";
  } catch (error) {
    if (error instanceof TRPCError && error.code === "CONFLICT") return "has_account";
    console.error("[Payments] Payment confirmed, but the client account invitation could not be sent:", error instanceof Error ? error.message : error);
    return "failed";
  }
}
