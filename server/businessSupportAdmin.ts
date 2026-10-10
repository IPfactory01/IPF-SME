import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminAccessAuditEvents, businessChecks, businessMemberships, businesses, users } from "../drizzle/schema";
import { advancePipeline, PIPELINE_STAGES, type PipelineStage } from "../shared/businessCheck/pipeline";
import type { CheckResult } from "../shared/businessCheck/engine";
import type { Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { findBookedCall, isCalendlyConfigured } from "./calendly";
import type { CheckSummary } from "./businessCheck";
import { latestInvitationStatuses } from "./clientOnboarding";
import { isMissingPaymentTable, paymentRequestsFor, paymentStatusesByCheck } from "./payments";
import { reportStatusFor } from "./fullReport/service";
import { effectivePaymentStatus, paymentDeadline, type PaymentItem } from "../shared/payments";
import { getDb } from "./db";

async function requireDatabase() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

/** What the team sees of a business check. The answers and the result JSON stay out of lists. */
const CHECK_COLUMNS = {
  id: businessChecks.id,
  fullName: businessChecks.fullName,
  businessName: businessChecks.businessName,
  email: businessChecks.email,
  whatsapp: businessChecks.whatsapp,
  stage: businessChecks.stage,
  route: businessChecks.route,
  readiness: businessChecks.readiness,
  primaryArea: businessChecks.primaryArea,
  pipelineStage: businessChecks.pipelineStage,
  callRequestedAt: businessChecks.callRequestedAt,
  callScheduledFor: businessChecks.callScheduledFor,
  reportRequestedAt: businessChecks.reportRequestedAt,
  completedAt: businessChecks.completedAt,
  createdAt: businessChecks.createdAt,
} as const;

/** How many waiting calls are looked up in Calendly per page load, so the admin console stays quick. */
const CALENDLY_SYNC_LIMIT = 10;

type ListedCheck = { id: number; email: string; pipelineStage: PipelineStage; callRequestedAt: Date | null; callScheduledFor: Date | null };

/**
 * Fills in the time of calls that were asked for but have no time yet, from IP Factory's Calendly account (bookings
 * made before CALENDLY_API_TOKEN was set, or in a new tab). Only checks still at the call stage are looked up; each
 * found time is saved, so it is looked up once. Without the token this does nothing.
 */
async function syncCalendlyBookings<T extends ListedCheck>(db: Database, rows: T[]): Promise<T[]> {
  if (!isCalendlyConfigured()) return rows;
  const waiting = rows.filter(row => row.callRequestedAt && !row.callScheduledFor && row.pipelineStage === "call_booked").slice(0, CALENDLY_SYNC_LIMIT);
  if (!waiting.length) return rows;
  const found = new Map<number, Date>();
  await Promise.all(waiting.map(async row => {
    const time = await findBookedCall(row.email);
    if (!time) return;
    await db.update(businessChecks).set({ callScheduledFor: time }).where(and(eq(businessChecks.id, row.id), isNull(businessChecks.callScheduledFor)));
    await recordAudit(db, { action: "business_check_call_booked", targetEmail: row.email, details: { businessCheckId: row.id, scheduledFor: time.toISOString(), source: "calendly_lookup" } });
    found.set(row.id, time);
  }));
  return rows.map(row => (found.has(row.id) ? { ...row, callScheduledFor: found.get(row.id)! } : row));
}

/** Every business check: leads who only left their details, and finished checks. These are prospects, not clients. */
export async function listBusinessChecks(db: Database) {
  const [rows, invitations] = await Promise.all([
    db.select(CHECK_COLUMNS).from(businessChecks).orderBy(desc(businessChecks.createdAt)).limit(500),
    latestInvitationStatuses(db),
  ]);
  const payments = await paymentStatusesByCheck(db);
  return (await syncCalendlyBookings(db, rows)).map(row => ({ ...row, invitationStatus: invitations.get(row.id) ?? null, payments: payments.get(row.id) ?? {} }));
}

/** Business checks whose owner asked for the free discovery call, newest request first. */
export async function listDiscoveryCalls(db: Database) {
  const [rows, invitations] = await Promise.all([
    db.select(CHECK_COLUMNS).from(businessChecks).where(isNotNull(businessChecks.callRequestedAt)).orderBy(desc(businessChecks.callRequestedAt)).limit(500),
    latestInvitationStatuses(db),
  ]);
  const payments = await paymentStatusesByCheck(db);
  return (await syncCalendlyBookings(db, rows)).map(row => ({ ...row, invitationStatus: invitations.get(row.id) ?? null, payments: payments.get(row.id) ?? {} }));
}

const parseJson = <T>(text: string | null): T | null => {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

/** A business check's payment requests for the record drawer; `null` when the payment table is not there yet (0006). */
async function paymentsOf(db: Pick<Database, "select">, businessCheckId: number) {
  try {
    const now = new Date();
    return (await paymentRequestsFor(db, [businessCheckId])).map(({ id, item, amountNaira, reference, status, requestedAt, deliveryStatus, proofReceivedAt, confirmedAt, note }) => (
      { id, item, amountNaira, reference, status, displayStatus: effectivePaymentStatus({ status, requestedAt }, now), payBy: paymentDeadline(requestedAt), requestedAt, deliveryStatus, proofReceivedAt, confirmedAt, note }
    ));
  } catch (error) {
    if (!isMissingPaymentTable(error)) throw error;
    console.error("[Payments] The payment_requests table is missing: apply migration 0006 with pnpm db:migrate.");
    return null;
  }
}

/** Where the full report stands; null when there is none, or the table is not there yet (0007). */
async function reportOf(db: Pick<Database, "select">, businessCheckId: number) {
  try {
    return await reportStatusFor(db, businessCheckId);
  } catch (error) {
    if (!isMissingPaymentTable(error)) throw error;
    console.error("[Payments] The full_reports table is missing: apply migration 0007 with pnpm db:migrate.");
    return null;
  }
}

/**
 * One business check in full, for the record drawer: the saved result and summary exactly as they were stored when the
 * owner finished the check. Nothing is recomputed and the owner's raw answers are not returned.
 */
export async function getBusinessCheckDetail(db: Pick<Database, "select">, businessCheckId: number) {
  const row = (await db.select({
    ...CHECK_COLUMNS,
    heardFrom: businessChecks.heardFrom,
    resultJson: businessChecks.resultJson,
    summaryJson: businessChecks.summaryJson,
  }).from(businessChecks).where(eq(businessChecks.id, businessCheckId)).limit(1))[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That Business Check does not exist." });
  const { resultJson, summaryJson, ...fields } = row;
  const result = parseJson<Pick<CheckResult, "outline" | "primaryArea" | "founder">>(resultJson);
  const summary = parseJson<CheckSummary>(summaryJson);
  const [invitations, stageHistory, payments, report] = await Promise.all([latestInvitationStatuses(db), stageHistoryFor(db, row.id), paymentsOf(db, row.id), reportOf(db, row.id)]);
  return {
    ...fields,
    invitationStatus: invitations.get(row.id) ?? null,
    stageHistory,
    payments,
    report,
    summary: summary ? { found: summary.found, think: summary.think, next: summary.next, offerings: summary.offerings ?? [] } : null,
    outline: result?.outline ?? null,
    primaryAreaNumber: result?.primaryArea?.area ?? row.primaryArea ?? null,
  };
}

/** Audit actions that move a business check or record something about its call, shown as its history. */
const HISTORY_ACTIONS = ["business_check_stage_changed", "business_check_call_outcome", "business_check_call_scheduled", "business_check_call_booked", "payment_details_sent", "payment_proof_received", "payment_confirmed", "full_report_link_sent", "full_report_delivered"] as const;

/** What the team has done to one business check, newest first, with who did it. Read from the audit log. */
async function stageHistoryFor(db: Pick<Database, "select">, businessCheckId: number) {
  const events = await db
    .select({ id: adminAccessAuditEvents.id, action: adminAccessAuditEvents.action, details: adminAccessAuditEvents.details, at: adminAccessAuditEvents.createdAt, by: users.name })
    .from(adminAccessAuditEvents)
    .leftJoin(users, eq(users.id, adminAccessAuditEvents.actorUserId))
    .where(and(inArray(adminAccessAuditEvents.action, [...HISTORY_ACTIONS]), sql`${adminAccessAuditEvents.details}::jsonb ->> 'businessCheckId' = ${String(businessCheckId)}`))
    .orderBy(desc(adminAccessAuditEvents.createdAt), desc(adminAccessAuditEvents.id))
    .limit(100);
  return events.map(event => {
    const details = parseJson<{ from?: PipelineStage; to?: PipelineStage; note?: string; scheduledFor?: string; item?: PaymentItem; reference?: string }>(event.details) ?? {};
    return { id: event.id, action: event.action as (typeof HISTORY_ACTIONS)[number], from: details.from ?? null, to: details.to ?? null, note: details.note ?? null, scheduledFor: details.scheduledFor ?? null, item: details.item ?? null, reference: details.reference ?? null, by: event.by ?? null, at: event.at };
  });
}

/** Stages the team can move a check to. "lead" is where every check starts, so nothing moves back to it. */
export const SETTABLE_STAGES = PIPELINE_STAGES.filter(stage => stage !== "lead") as Exclude<PipelineStage, "lead">[];

/**
 * Moves a business check to any later pipeline stage (after the call, a payment or a decision), with an optional note
 * for the team. A won business is not reopened here, as with call outcomes. Every change is audited.
 */
export async function setPipelineStage(db: Database, input: { businessCheckId: number; stage: Exclude<PipelineStage, "lead">; note?: string; actorUserId: number }) {
  const check = (await db.select({ id: businessChecks.id, email: businessChecks.email, pipelineStage: businessChecks.pipelineStage }).from(businessChecks).where(eq(businessChecks.id, input.businessCheckId)).limit(1))[0];
  if (!check) throw new TRPCError({ code: "NOT_FOUND", message: "That Business Check does not exist." });
  if (check.pipelineStage === input.stage) return { success: true, pipelineStage: check.pipelineStage, changed: false } as const;
  if (check.pipelineStage === "won") throw new TRPCError({ code: "CONFLICT", message: "This business has already been won, so its stage can no longer be changed here." });
  await db.transaction(async tx => {
    await tx.update(businessChecks).set({ pipelineStage: input.stage }).where(eq(businessChecks.id, check.id));
    await recordAudit(tx, {
      action: "business_check_stage_changed",
      actorUserId: input.actorUserId,
      targetEmail: check.email,
      details: { businessCheckId: check.id, from: check.pipelineStage, to: input.stage, ...(input.note ? { note: input.note } : {}) },
    });
  });
  return { success: true, pipelineStage: input.stage, changed: true } as const;
}

async function requestedCheck(db: Pick<Database, "select">, businessCheckId: number) {
  const check = (await db.select({ id: businessChecks.id, email: businessChecks.email, pipelineStage: businessChecks.pipelineStage, callRequestedAt: businessChecks.callRequestedAt }).from(businessChecks).where(eq(businessChecks.id, businessCheckId)).limit(1))[0];
  if (!check) throw new TRPCError({ code: "NOT_FOUND", message: "That Business Check does not exist." });
  if (!check.callRequestedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "This Business Check has not asked for a Debrief." });
  // A paid client's record is not reopened from the call list.
  if (check.pipelineStage === "won") throw new TRPCError({ code: "CONFLICT", message: "This business has already been won, so its Debrief outcome can no longer be changed here." });
  return check;
}

/** Records the time agreed for the call. The owner's request is kept as it was; the stage moves to "call booked" if it was behind. */
export async function scheduleDiscoveryCall(db: Database, input: { businessCheckId: number; scheduledFor: Date; actorUserId: number }) {
  const check = await requestedCheck(db, input.businessCheckId);
  await db.transaction(async tx => {
    await tx.update(businessChecks).set({ callScheduledFor: input.scheduledFor, pipelineStage: advancePipeline(check.pipelineStage, "call_booked") }).where(eq(businessChecks.id, check.id));
    await recordAudit(tx, { action: "business_check_call_scheduled", actorUserId: input.actorUserId, targetEmail: check.email, details: { businessCheckId: check.id, scheduledFor: input.scheduledFor.toISOString() } });
  });
  return { success: true } as const;
}

export const CALL_OUTCOMES = ["fit", "refer", "decline"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/** The existing pipeline stages already say what each outcome means (see PIPELINE_LABELS): no new status field. */
export const OUTCOME_STAGE: Record<CallOutcome, PipelineStage> = { fit: "opportunity", refer: "referred", decline: "lost" };

/** Records the result of the discovery call. Fit does not create an account: onboarding is a separate, deliberate step. */
export async function recordDiscoveryCallOutcome(db: Database, input: { businessCheckId: number; outcome: CallOutcome; actorUserId: number }) {
  const check = await requestedCheck(db, input.businessCheckId);
  const stage = OUTCOME_STAGE[input.outcome];
  await db.transaction(async tx => {
    await tx.update(businessChecks).set({ pipelineStage: stage }).where(eq(businessChecks.id, check.id));
    await recordAudit(tx, { action: "business_check_call_outcome", actorUserId: input.actorUserId, targetEmail: check.email, details: { businessCheckId: check.id, outcome: input.outcome, from: check.pipelineStage, to: stage } });
  });
  return { success: true, pipelineStage: stage } as const;
}

/** Onboarded clients only: one row per active-or-not membership, never a business check. */
export async function listClients(db: Pick<Database, "select">) {
  return db
    .select({
      membershipId: businessMemberships.id,
      businessId: businesses.id,
      businessName: businesses.name,
      businessStatus: businesses.status,
      userId: users.id,
      userName: users.name,
      email: users.email,
      role: businessMemberships.role,
      membershipStatus: businessMemberships.status,
      joinedAt: businessMemberships.createdAt,
      businessCreatedAt: businesses.createdAt,
    })
    .from(businessMemberships)
    .innerJoin(businesses, eq(businessMemberships.businessId, businesses.id))
    .innerJoin(users, eq(businessMemberships.userId, users.id))
    .orderBy(desc(businesses.createdAt), businessMemberships.id)
    .limit(500);
}

export async function businessSupportDb() {
  return requireDatabase();
}

