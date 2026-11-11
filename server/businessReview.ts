/**
 * The Business Review on fees (R37, batch F3; App flow 3.2). Sending its payment details opens the client's Business
 * Review engagement, waiting for its first payment, with its two fees; the owner pays the first half on the fee's pay
 * page like any fee, or Finance records money that came another way on it (section 3.1). The first payment opens the
 * room and starts the Business Review: the check moves to Won, the plan loads, dated from that day, and the owner is
 * invited to their client account. A Business Review payment request sent before F3 stays as it was (server/payments.ts).
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { adminAccessAuditEvents, businessChecks, clientOnboardingInvitations, engagementFeeLines, engagements, engagementSessions, engagementTasks, paymentRequests } from "../drizzle/schema";
import { addDays, lagosDay, type FeeLineDraft } from "../shared/agreement";
import { CURRENT_STATE } from "../shared/businessSupport";
import { countsTowardsFee, feeBalance, invoiceNumberLabel, receiptNumberLabel } from "../shared/ledger";
import { PAYMENT_WINDOW_HOURS } from "../shared/payments";
import { firstHalf } from "../shared/products";
import type { Database } from "./accountAuth";
import { initialFeeRows } from "./agreements";
import { recordAudit } from "./audit";
import { resolveBusinessSupportPrice } from "./businessSupportPrices";
import { inviteToClientAccount, type CurrentStateInvitation } from "./clientOnboarding";
import { deliverEmail } from "./email";
import { loadAssessmentPlan } from "./engagements";
import { feePayUrl, feeReference } from "./feePayments";
import { billFee, lockFee, paymentsOfFees } from "./ledger";
import { BEFORE_OPPORTUNITY, paymentDetailsEmail } from "./payments";
import { paystackMode } from "./paystack";
import { ENV } from "./_core/env";

/** The first half is due two days after its link goes: the "pay by" day the email gives (the 48 hours of before F3). */
export const BUSINESS_REVIEW_PAY_WITHIN_DAYS = PAYMENT_WINDOW_HOURS / 24;

/** Its two fees at the server's price: half to start, dated the pay-by day, and half on delivery, dated with the Findings. */
export const businessReviewFees = (whole: number, payBy: string): FeeLineDraft[] => [
  { label: `${CURRENT_STATE.name}: half to start`, amount: firstHalf(whole), dueOn: payBy },
  { label: `${CURRENT_STATE.name}: half on delivery`, amount: whole - firstHalf(whole), dueOn: null },
];

const conflict = (message: string) => new TRPCError({ code: "CONFLICT", message });
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** A Business Review opened on fees (F3): from a check, and not started by a payment request from before F3. */
const onFees = and(isNotNull(engagements.businessCheckId), isNull(engagements.paymentRequestId), eq(engagements.type, "business_review"));

/** The check's Business Review engagement on fees, if it has one. */
export async function businessReviewOnFees(db: Pick<Database, "select">, businessCheckId: number) {
  return (await db.select({ id: engagements.id }).from(engagements).where(and(eq(engagements.businessCheckId, businessCheckId), onFees)).limit(1))[0] ?? null;
}

/**
 * "Send the payment link" for the Business Review (`manage_payments`). Opens the engagement the first time, with its
 * fees; bills the first half (its invoice number); moves a check before Opportunity to Opportunity; and emails the owner
 * the first half's pay link. Sending it again emails the same fee's link. A paid first half is never sent again.
 */
export async function sendBusinessReviewLink(db: Database, input: { businessCheckId: number; actorUserId: number | null }) {
  const check = (await db.select({ id: businessChecks.id, fullName: businessChecks.fullName, email: businessChecks.email, pipelineStage: businessChecks.pipelineStage })
    .from(businessChecks).where(eq(businessChecks.id, input.businessCheckId)).limit(1))[0];
  if (!check) throw new TRPCError({ code: "NOT_FOUND", message: "That Business Health Check does not exist." });
  // A link from before F3 that was paid is the Business Review already.
  const paidBefore = (await db.select({ id: paymentRequests.id }).from(paymentRequests)
    .where(and(eq(paymentRequests.businessCheckId, check.id), eq(paymentRequests.item, "current_state"), eq(paymentRequests.status, "confirmed"))).limit(1))[0];
  if (paidBefore) throw conflict("This has already been paid.");
  const stageTo = BEFORE_OPPORTUNITY.includes(check.pipelineStage) ? "opportunity" : check.pipelineStage;
  const sent = await db.transaction(async tx => {
    // One engagement per check (its check id is unique), so sending again reuses the first.
    const accepted = (await tx.select({ businessId: clientOnboardingInvitations.businessId }).from(clientOnboardingInvitations)
      .where(and(eq(clientOnboardingInvitations.businessCheckId, check.id), eq(clientOnboardingInvitations.status, "accepted")))
      .orderBy(desc(clientOnboardingInvitations.id)).limit(1))[0];
    const [created] = await tx.insert(engagements)
      .values({ businessCheckId: check.id, businessId: accepted?.businessId ?? null, type: "business_review", contactName: check.fullName, contactEmail: check.email, opensOnPayment: true })
      .onConflictDoNothing({ target: engagements.businessCheckId })
      .returning({ id: engagements.id });
    let engagementId: number;
    let lowPriceTesting = false;
    if (created) {
      engagementId = created.id;
      // The server's price, never the browser's, fixed on the fees when they are made: sending again sends the fee as
      // it stands (the team changes it in the engagement's Fees).
      const priced = resolveBusinessSupportPrice("current_state");
      lowPriceTesting = priced.lowPriceTesting;
      const fees = businessReviewFees(priced.amountNaira, addDays(lagosDay(), BUSINESS_REVIEW_PAY_WITHIN_DAYS));
      await tx.insert(engagementFeeLines).values(initialFeeRows(engagementId, fees));
      await recordAudit(tx, { action: "engagement_started", actorUserId: input.actorUserId, details: { engagementId, businessCheckId: check.id, awaitingPayment: true, fees: fees.map(fee => fee.amount) } });
    } else {
      const existing = (await tx.select({ id: engagements.id, paymentRequestId: engagements.paymentRequestId }).from(engagements).where(eq(engagements.businessCheckId, check.id)).limit(1))[0]!;
      if (existing.paymentRequestId !== null) throw conflict("This has already been paid.");
      engagementId = existing.id;
    }
    const first = (await tx.select({ id: engagementFeeLines.id }).from(engagementFeeLines).where(eq(engagementFeeLines.engagementId, engagementId))
      .orderBy(asc(engagementFeeLines.sortOrder), asc(engagementFeeLines.id)).limit(1))[0];
    if (!first) throw conflict("This Business Review has no fee to send. Add it in the engagement's Fees.");
    const fee = (await lockFee(tx, first.id))!;
    const { left } = feeBalance(fee, await paymentsOfFees(tx, [fee.id]));
    if (left === 0) throw conflict(fee.writtenOffAt ? "Its first half is written off. Reverse the write-off in Finance to send it again." : "This has already been paid.");
    const invoiceNumber = await billFee(tx, fee);
    if (stageTo !== check.pipelineStage) await tx.update(businessChecks).set({ pipelineStage: stageTo }).where(eq(businessChecks.id, check.id));
    // Recorded before the email goes, with the fee it asks for.
    await recordAudit(tx, {
      action: "payment_details_sent",
      actorUserId: input.actorUserId,
      targetEmail: check.email,
      details: {
        businessCheckId: check.id, item: "current_state", reference: feeReference(fee.id), amountNaira: left, engagementId, feeLineId: fee.id, again: !created,
        ...(lowPriceTesting ? { lowPriceTesting: true } : {}), ...(stageTo !== check.pipelineStage ? { from: check.pipelineStage, to: stageTo } : {}),
      },
    });
    const total = sum((await tx.select({ amount: engagementFeeLines.amount }).from(engagementFeeLines).where(eq(engagementFeeLines.engagementId, engagementId))).map(line => line.amount));
    return { engagementId, fee, left, total, invoiceNumber };
  });

  const { fee, left, total, invoiceNumber } = sent;
  const mode = paystackMode();
  const online = mode !== "off" && Boolean(ENV.cookieSecret);
  const message = paymentDetailsEmail({
    fullName: check.fullName, item: "current_state", reference: feeReference(fee.id), payByDay: fee.dueOn, invoice: invoiceNumberLabel(invoiceNumber),
    // "the first half of ₦1,100,000" only while the first half is whole; a part paid by hand asks for what is left.
    amountNaira: left, totalNaira: left === fee.amount ? total : undefined,
    online: online ? { url: feePayUrl(fee.id), mode: mode === "live" ? "live" : "test" } : null,
  });
  const delivery = await deliverEmail({ to: check.email, subject: message.subject, body: message.body, sender: "business_support", businessCheckId: check.id, idempotencyKey: `engagement_fee_lines:${fee.id}:business_review_details:${Date.now()}` })
    .catch((error: unknown) => ({ status: "Failed" as const, reason: error instanceof Error ? error.message : "Unknown error" }));
  return {
    paymentRequestId: null as number | null, reference: feeReference(fee.id), status: "requested" as const, deliveryStatus: delivery.status,
    deliveryProblem: delivery.status === "Failed" ? delivery.reason : null, pipelineStage: stageTo, engagementId: sent.engagementId as number | null, feeLineId: fee.id as number | null,
  };
}

/** Who sent the Business Review's link last: the person a Paystack payment's invitation is recorded against. */
async function linkSender(db: Pick<Database, "select">, businessCheckId: number) {
  const sent = (await db.select({ actorUserId: adminAccessAuditEvents.actorUserId }).from(adminAccessAuditEvents)
    .where(and(eq(adminAccessAuditEvents.action, "payment_details_sent"), isNotNull(adminAccessAuditEvents.actorUserId),
      sql`${adminAccessAuditEvents.details}::jsonb ->> 'businessCheckId' = ${String(businessCheckId)}`, sql`${adminAccessAuditEvents.details}::jsonb ->> 'item' = 'current_state'`))
    .orderBy(desc(adminAccessAuditEvents.id)).limit(1))[0];
  return sent?.actorUserId ?? null;
}

/** The first payment on the engagement wins the business; a later one (the second half) leaves the stage as it is. */
async function winOnFirstPayment(db: Database, engagementId: number, businessCheckId: number, input: { actorUserId: number | null; via?: "paystack" }) {
  return db.transaction(async tx => {
    const check = (await tx.select({ stage: businessChecks.pipelineStage, email: businessChecks.email }).from(businessChecks).where(eq(businessChecks.id, businessCheckId)).for("update"))[0];
    if (!check || check.stage === "won") return false;
    const lines = await tx.select({ id: engagementFeeLines.id }).from(engagementFeeLines).where(eq(engagementFeeLines.engagementId, engagementId));
    const counted = (await paymentsOfFees(tx, lines.map(line => line.id))).filter(entry => countsTowardsFee(entry.status));
    if (counted.length !== 1) return false;
    const [payment] = counted;
    await tx.update(businessChecks).set({ pipelineStage: "won" }).where(eq(businessChecks.id, businessCheckId));
    await recordAudit(tx, {
      action: "payment_confirmed",
      actorUserId: input.actorUserId,
      targetEmail: check.email,
      details: {
        businessCheckId, item: "current_state", reference: feeReference(payment!.feeLineId!), amountNaira: payment!.amount, engagementId, feeLineId: payment!.feeLineId, paymentId: payment!.id,
        receipt: payment!.receiptNumber !== null ? receiptNumberLabel(payment!.receiptNumber) : null, from: check.stage, to: "won", ...(input.via ? { via: input.via } : {}),
      },
    });
    return true;
  });
}

/** The starting plan, once: a room opened twice (early by a Partner, then paid) loads it the first time only. */
async function loadPlanOnce(db: Database, engagementId: number, actorUserId: number | null) {
  return db.transaction(async tx => {
    await tx.select({ id: engagements.id }).from(engagements).where(eq(engagements.id, engagementId)).for("update");
    const [task] = await tx.select({ id: engagementTasks.id }).from(engagementTasks).where(eq(engagementTasks.engagementId, engagementId)).limit(1);
    const [session] = await tx.select({ id: engagementSessions.id }).from(engagementSessions).where(eq(engagementSessions.engagementId, engagementId)).limit(1);
    if (task || session) return false;
    await loadAssessmentPlan(tx, engagementId, { now: new Date(), actorUserId });
    return true;
  });
}

/**
 * After a payment on a fee, or **Open the room now**: if the engagement is a Business Review on fees, starts it. The
 * first payment moves the check to Won; the room opening (by that payment, or early by a Partner) loads the plan and
 * invites the owner. Each part runs once whatever calls it, and a failure is logged, never thrown: the money is already
 * recorded, and the team can send the invitation from Client Onboarding.
 */
export async function beginBusinessReview(db: Database, engagementId: number, input: { opened: boolean; paid: boolean; actorUserId: number | null; via?: "paystack" }) {
  try {
    const engagement = (await db.select({ id: engagements.id, businessCheckId: engagements.businessCheckId }).from(engagements).where(and(eq(engagements.id, engagementId), onFees)).limit(1))[0];
    if (!engagement || engagement.businessCheckId === null) return null;
    const businessCheckId = engagement.businessCheckId;
    const won = input.paid ? await winOnFirstPayment(db, engagement.id, businessCheckId, input) : false;
    let invitation: CurrentStateInvitation | null = null;
    if (input.opened) {
      await loadPlanOnce(db, engagement.id, input.actorUserId);
      // Paystack has no person to record the invitation against: it is recorded against whoever sent the link.
      invitation = await inviteToClientAccount(db, businessCheckId, input.via
        ? { actorUserId: null, createdByUserId: await linkSender(db, businessCheckId), via: input.via }
        : input.paid ? { actorUserId: input.actorUserId } : { actorUserId: input.actorUserId, overrideReason: "The room was opened before payment (Open the room now)." });
    }
    return { won, invitation };
  } catch (error) {
    console.error("[Business Review] The payment is recorded, but the Business Review could not be started:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Where a Business Review on fees stands, for Pipeline: its first half, paid or not, and the engagement it opened. */
export type BusinessReviewState = {
  engagementId: number; feeLineId: number; label: string; amount: number; total: number; dueOn: string | null; left: number;
  paid: boolean; writtenOff: boolean; late: boolean; paidOn: string | null; receipt: string | null; invoice: string | null; awaitingPayment: boolean;
};

/** The Business Reviews on fees of some checks (or all), by check. */
export async function businessReviewStates(db: Pick<Database, "select">, businessCheckIds?: number[]) {
  const states = new Map<number, BusinessReviewState>();
  if (businessCheckIds && !businessCheckIds.length) return states;
  const rows = await db.select({ id: engagements.id, businessCheckId: engagements.businessCheckId, opensOnPayment: engagements.opensOnPayment }).from(engagements)
    .where(businessCheckIds ? and(onFees, inArray(engagements.businessCheckId, businessCheckIds)) : onFees);
  if (!rows.length) return states;
  const lines = await db.select().from(engagementFeeLines).where(inArray(engagementFeeLines.engagementId, rows.map(row => row.id))).orderBy(asc(engagementFeeLines.sortOrder), asc(engagementFeeLines.id));
  const ledger = await paymentsOfFees(db, lines.map(line => line.id));
  const today = lagosDay();
  for (const row of rows) {
    const own = lines.filter(line => line.engagementId === row.id);
    const first = own[0];
    if (!first || row.businessCheckId === null) continue;
    const received = ledger.filter(entry => entry.feeLineId === first.id);
    const { left } = feeBalance(first, received);
    const last = received.filter(entry => countsTowardsFee(entry.status)).at(-1);
    states.set(row.businessCheckId, {
      engagementId: row.id, feeLineId: first.id, label: first.label, amount: first.amount, total: sum(own.map(line => line.amount)), dueOn: first.dueOn, left,
      paid: left === 0 && first.writtenOffAt === null, writtenOff: first.writtenOffAt !== null, late: left > 0 && first.dueOn !== null && first.dueOn < today,
      paidOn: last?.receivedOn ?? null, receipt: last?.receiptNumber != null ? receiptNumberLabel(last.receiptNumber) : null,
      invoice: first.invoiceNumber !== null ? invoiceNumberLabel(first.invoiceNumber) : null, awaitingPayment: row.opensOnPayment,
    });
  }
  return states;
}
