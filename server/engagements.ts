import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  businessChecks,
  fullReports,
  businessMemberAccess,
  businessMemberships,
  businesses,
  clientOnboardingInvitations,
  engagementCheckins,
  engagementComments,
  engagementDeliverables,
  engagementFiles,
  engagementMeasures,
  engagements,
  engagementSessions,
  engagementTasks,
  engagementTaskComments,
  engagementTeam,
  paymentRequests,
  userPlatformRoles,
  users,
  engagementFileMatches,
  engagementContentItems,
  serviceRequests,
  engagementFeeLines,
} from "../drizzle/schema";
import { authorityAllows, type Authority } from "../shared/platformPermissions";
import {
  ASSESSMENT_TEMPLATE,
  OPEN_TASK_STATUSES,
  clientCanSee,
  clientCanSeeTask,
  DELIVERABLES_NEEDING_APPROVAL,
  ENGAGEMENT_AUDIENCE_LABELS,
  ENGAGEMENT_DELIVERABLE_KIND_LABELS,
  ENGAGEMENT_STAGE_LABELS,
  ENGAGEMENT_TASK_STATUS_LABELS,
  ENGAGEMENT_TEAM_ROLE_LABELS,
  ENGAGEMENT_TEAM_ROLE_ORDER,
  journeyOf,
  type ClientViewer,
  type EngagementAudience,
  type EngagementDeliverableKind,
  type EngagementSessionKind,
  type EngagementSessionStatus,
  type EngagementStage,
  type EngagementTaskKind,
  type EngagementTaskFactor,
  type EngagementTaskSide,
  type EngagementTaskStatus,
  type EngagementTeamRole,
  isAllowedUploadType,
  safeFileName,
  UPLOAD_MAX_BYTES,
  UPLOAD_MAX_MB,
  type EngagementTaskPriority,
  CLIENT_ACCESS_LABELS,
  ENGAGEMENT_REVIEW_ROLES,
  type ClientAccessLevel,
  teamRolesFor,
  cleanResponseLink,
  isVideoFile,
} from "../shared/engagement";
import type { AccountSession, Database } from "./accountAuth";
import { CONTENT_KIND_LABELS, CONTENT_STATUS_LABELS, DATED_TYPES, datedProgress, engagementTitle, engagementTypeOf, ENGAGEMENT_TYPE_LABELS, SERVICE_TYPES, serviceStarter, servicesFor, serviceStep, SERVICE_STEPS, STAGED_TYPES, type ContentKind, type ContentStatus, type DatedEngagementType, type EngagementType } from "../shared/engagementTypes";
import { PRODUCTS, secondHalf } from "../shared/products";
import { inviteBusinessOwner } from "./accountInvitations";
import { slugify } from "./accountAuth";
import { recordAudit } from "./audit";
import { sendSeriesEmails, sendSessionEmails, sessionChange } from "./sessionInvitations";
import { MAX_OCCURRENCES, meetingType, zoomMeetingIdOf, type MeetingTypeId } from "../shared/zoomInvitation";
import { DUE_DAYS } from "../shared/dataRequestTemplates";
import { initialFeeRows } from "./agreements";
import { clientFees, dateBalancesOnDelivery } from "./feePayments";
import { defaultFees, feeHold, isDelivery, lagosDay, starterDueOn } from "../shared/agreement";
import { CURRENT_STATE } from "../shared/businessSupport";
import { workLines } from "../shared/engagementWork";
import { agreedWhatsapp, followUpOwnerOf, recipientOf } from "./teamContact";
import { arrivalFields, dayInWords, earliestRequestDue, hasArrived, REQUEST_MAX_DAYS, REQUESTS_PER_WEEK, weekStartOf } from "../shared/requests";
import { TURNAROUND_LABELS, type EngagementTaskTurnaround } from "../shared/engagement";
import { businessNameOf, namesOf, sendMentionEmails, sendMessageEmails, sendReadyEmail, sendReadyForReviewEmails, sendReceivedEmail, sendRequestEmail, sendTeamItemEmails } from "./requestEmails";
import { mentionedIn } from "../shared/mentions";
import { sharedDebriefFor } from "./debriefs";
import { getDb } from "./db";
import { deliverEmail } from "./email";
import { createSignedUpload, deleteObject, isFileStorageConfigured, objectExists, signedDownloadUrl } from "./fileStorage";
import { randomUUID } from "node:crypto";
import { getTrustedApplicationOrigin } from "./security";
import { BRAND } from "../shared/brand";
import { evaluate, type CheckResult } from "../shared/businessCheck/engine";
import type { Answers } from "../shared/businessCheck/questions";
import { roomInsight } from "../shared/fullReport/insight";
import { reportForCheck } from "./fullReport/service";
import { findSessionBookings, isSessionBookingConfigured, sessionBookingUrl } from "./calendly";

/**
 * The engagement room (shared/engagement.ts). Every function here decides access on the server: the team by
 * permission AND assignment, the client by membership AND what was shared with them. An engagement the caller may not
 * see and one that does not exist get the same answer.
 */

const NOT_FOUND = "This engagement is not available.";
const notFound = () => new TRPCError({ code: "NOT_FOUND", message: NOT_FOUND });

export async function engagementDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

/** Migration 0008 not applied yet: the rest of the platform keeps working and the room says so. */
/** A missing table (0008) or a missing column (0009): the room is not up to date in the database. */
export function isMissingEngagementTable(error: unknown) {
  const code = (error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "42P01" || code === "42703";
}
export const MIGRATION_MISSING_MESSAGE = "The database is missing a table or column this version of the site needs. The note at the top of Admin says which migration to apply.";

/** The calendar date `days` working days (Monday to Friday) after `from`, in Lagos, as YYYY-MM-DD. */
export function addWorkingDays(from: Date, days: number) {
  const lagos = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(from);
  const date = new Date(`${lagos}T12:00:00Z`);
  let added = 0;
  while (added < days) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) added += 1;
  }
  return date.toISOString().slice(0, 10);
}

// ---- Starting and linking ------------------------------------------------------------------------------------------

/**
 * Starts the engagement when the Business Review is paid: the record, the data requests and the two calls
 * from the template, due in three working days. Runs once per business check; a second call changes nothing. If the
 * owner already has an account (invited by hand before paying), the engagement is linked to their business at once.
 */
/**
 * The Business Review's second half (R36): its payment request was the first half, so the engagement opens with the rest
 * as a fee, dated when the Findings are shared. A request paid in full (before 10 November 2026) leaves nothing.
 */
async function businessReviewBalance(db: Pick<Database, "select">, paymentRequestId: number | null) {
  if (paymentRequestId === null) return 0;
  const request = (await db.select({ item: paymentRequests.item, amountNaira: paymentRequests.amountNaira }).from(paymentRequests).where(eq(paymentRequests.id, paymentRequestId)).limit(1))[0];
  if (!request || request.item !== "current_state") return 0;
  // Business Review payment requests ended with F3 (10 November 2026), before the price rose to ₦1,100,000 (11 November):
  // each was priced at the Business Review's price then, so one paid in full at ₦600,000 still leaves nothing.
  return secondHalf(request.amountNaira, PAYMENT_REQUEST_BUSINESS_REVIEW_PRICE);
}

/** The Business Review's price while it was paid on payment requests, before F3 (to 10 November 2026). */
export const PAYMENT_REQUEST_BUSINESS_REVIEW_PRICE = 600_000;

/**
 * The Business Review's starting plan: its Data Request and the team's actions from the template, week 1 due in three
 * working days and week 2 in eight, and its Sessions. Loaded when it is paid, so nothing is due before the client can
 * see it: at once for a link paid before F3 (`startEngagement`), and on the first payment of its fee since F3
 * (server/businessReview.ts).
 */
export async function loadAssessmentPlan(tx: Pick<Database, "insert">, engagementId: number, input: { now: Date; actorUserId: number | null }) {
  const dueFor = (week: number) => addWorkingDays(input.now, week === 1 ? 3 : 8);
  await tx.insert(engagementTasks).values([
    ...ASSESSMENT_TEMPLATE.dataRequests.map(item => ({
      engagementId, kind: "data_request" as const, side: "client" as const, title: item.title, detail: item.detail, dueOn: dueFor(item.week), weekNumber: item.week, sortOrder: item.order, factor: item.factor, createdByUserId: input.actorUserId,
    })),
    ...ASSESSMENT_TEMPLATE.teamActions.map(item => ({
      engagementId, kind: "action" as const, side: "ipf" as const, title: item.title, detail: item.detail, dueOn: dueFor(item.week), weekNumber: item.week, sortOrder: item.order, factor: item.factor, createdByUserId: input.actorUserId,
    })),
  ]);
  await tx.insert(engagementSessions).values(ASSESSMENT_TEMPLATE.sessions.map(item => ({
    engagementId, kind: item.kind, title: item.title, durationMinutes: item.durationMinutes, agenda: item.agenda, weekNumber: item.week, sortOrder: item.order, createdByUserId: input.actorUserId,
  })));
}

export async function startEngagement(db: Database, input: { businessCheckId: number; paymentRequestId: number | null; actorUserId: number | null; now?: Date }) {
  const now = input.now ?? new Date();
  return db.transaction(async tx => {
    const balance = await businessReviewBalance(tx, input.paymentRequestId);
    const accepted = (await tx.select({ businessId: clientOnboardingInvitations.businessId }).from(clientOnboardingInvitations)
      .where(and(eq(clientOnboardingInvitations.businessCheckId, input.businessCheckId), eq(clientOnboardingInvitations.status, "accepted")))
      .orderBy(desc(clientOnboardingInvitations.id)).limit(1))[0];
    const [created] = await tx.insert(engagements)
      .values({ businessCheckId: input.businessCheckId, paymentRequestId: input.paymentRequestId, businessId: accepted?.businessId ?? null })
      .onConflictDoNothing({ target: engagements.businessCheckId })
      .returning({ id: engagements.id });
    if (!created) return { engagementId: null, created: false } as const;
    await loadAssessmentPlan(tx, created.id, { now, actorUserId: input.actorUserId });
    if (balance > 0) await tx.insert(engagementFeeLines).values(initialFeeRows(created.id, [{ label: `${CURRENT_STATE.name}: half on delivery`, amount: balance, dueOn: null }]));
    await recordAudit(tx, { action: "engagement_started", actorUserId: input.actorUserId, details: { engagementId: created.id, businessCheckId: input.businessCheckId, ...(balance > 0 ? { secondHalf: balance } : {}) } });
    return { engagementId: created.id, created: true } as const;
  });
}

/**
 * A new engagement opened by the desk: for a new client (named, emailed an owner invitation) or for an existing client's
 * business (businessId), which adds a project to the account they already have. Service types name the service bought.
 */
export type DirectEngagementInput = { type: EngagementType; startedOn: string; service?: string | null; businessId?: number | null; businessName?: string | null; contactName?: string | null; contactEmail?: string | null };

const addDays = (day: string, days: number) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };

/**
 * An engagement opened directly by the desk (ET, 6 November 2026), for a client who did not come through the Business
 * Health Check (Crown Studio came from the JUMP programme). It creates the business, the engagement of the chosen type
 * with that type's starting Work Plan, Data Request and Sessions, and invites the contact as the owner; someone who
 * already has an account becomes the owner straight away. The invitation link is returned once, to send by hand.
 */
export async function createDirectEngagement(db: Database, actor: StaffActor & { name?: string | null }, input: DirectEngagementInput) {
  requireStart(actor);
  // The service bought, for the types tied to one; the Six-Week Fix is its own service.
  const service = input.type === "six_week_fix" ? "six_week_fix" : SERVICE_TYPES[input.type] ? input.service ?? null : null;
  const product = service ? PRODUCTS.find(item => item.id === service) : undefined;
  if (SERVICE_TYPES[input.type] && (!product || (input.type !== "six_week_fix" && !servicesFor(input.type).some(item => item.id === product.id)))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose the service this engagement is for." });
  }
  const dated = DATED_TYPES[input.type];
  const starter = dated ?? (product ? serviceStarter(product) : null);
  const dueFor = (week: number) => addDays(input.startedOn, (week - 1) * 7 + 3);

  // An existing client: the project joins their business and account; nobody is invited.
  if (input.businessId) {
    const business = (await db.select({ id: businesses.id, name: businesses.name }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1))[0];
    if (!business) throw notFound();
    const owner = (await db.select({ email: users.email }).from(businessMemberships).innerJoin(users, eq(businessMemberships.userId, users.id))
      .where(and(eq(businessMemberships.businessId, business.id), eq(businessMemberships.role, "owner"))).limit(1))[0];
    const engagementId = await db.transaction(async tx => insertDirect(tx, actor, input, { businessId: business.id, service, starter, dueFor, contactName: null, contactEmail: owner?.email ?? null }));
    return { engagementId, invitationUrl: null, deliveryStatus: null, hasAccount: true } as const;
  }

  const businessName = input.businessName?.trim() ?? "";
  const contactName = input.contactName?.trim() ?? "";
  const email = input.contactEmail?.trim().toLowerCase() ?? "";
  if (businessName.length < 2 || contactName.length < 2 || !email.includes("@")) throw new TRPCError({ code: "BAD_REQUEST", message: "Name the business and the client, and give the client's email." });
  const existing = (await db.select({ id: users.id, status: users.status }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1))[0];
  if (existing) {
    const staff = (await db.select({ id: userPlatformRoles.id }).from(userPlatformRoles).where(eq(userPlatformRoles.userId, existing.id)).limit(1)).length > 0;
    if (staff) throw new TRPCError({ code: "BAD_REQUEST", message: "This email belongs to a staff account. Use the client's own email." });
  }
  const { engagementId, businessId } = await db.transaction(async tx => {
    const [business] = await tx.insert(businesses).values({ name: businessName, slug: slugify(businessName), createdByUserId: existing?.id ?? actor.id }).returning({ id: businesses.id });
    if (existing) await tx.insert(businessMemberships).values({ businessId: business.id, userId: existing.id, role: "owner", status: "active" });
    const id = await insertDirect(tx, actor, input, { businessId: business.id, service, starter, dueFor, contactName, contactEmail: email });
    return { engagementId: id, businessId: business.id };
  });
  if (existing) return { engagementId, invitationUrl: null, deliveryStatus: null, hasAccount: true } as const;
  // The welcome email says what we will do, when it starts and each fee (R47).
  const work = workLines({ type: input.type, service, startsOn: input.startedOn, fees: defaultFees(input.type, service, input.startedOn) });
  const invitation = await inviteBusinessOwner(db, { email, fullName: contactName, businessId, businessName, actorUserId: actor.id, inviterName: actor.name || BRAND.organisationName, work });
  return { engagementId, invitationUrl: invitation.invitationUrl, deliveryStatus: invitation.deliveryStatus, hasAccount: false } as const;
}

type Starter = Pick<DatedEngagementType, "dataRequests" | "clientActions" | "teamActions" | "sessions">;

/** The rows a plan's Data Request items and actions become, each dated in its week from the start day (R77). */
function starterTaskRows(engagementId: number, starter: Starter, startsOn: string, actorUserId: number) {
  return [
    ...starter.dataRequests.map(item => ({ kind: "data_request" as const, side: "client" as const, ...item })),
    ...starter.clientActions.map(item => ({ kind: "action" as const, side: "client" as const, ...item })),
    ...starter.teamActions.map(item => ({ kind: "action" as const, side: "ipf" as const, ...item })),
  ].map(item => ({
    engagementId, kind: item.kind, side: item.side, title: item.title, detail: item.detail, dueOn: starterDueOn(startsOn, item.week, item.weekday), weekNumber: item.week, sortOrder: item.order,
    section: item.section ?? null, ref: item.ref ?? null, informs: item.informs ?? null, format: item.format ?? null, priority: item.priority ?? null, turnaround: item.turnaround ?? null, createdByUserId: actorUserId,
  }));
}

/**
 * Brings an open engagement up to its type's current plan (R77, ET 11 November 2026): adds each Session, Data Request
 * item and action of the plan it does not have yet, dated from its start (the kickoff), and changes nothing already
 * there. A Session matches by its title and week, an item by its title, so one the lead removed on purpose comes back
 * and is removed again. Only for a type with a dated plan, such as Digital Marketing.
 */
export async function addMissingPlan(db: Database, actor: StaffActor, input: { engagementId: number }) {
  requireManage(actor);
  const engagement = await requireStaffEngagement(db, actor, input.engagementId);
  const plan = DATED_TYPES[engagement.type];
  if (!plan || !engagement.startedOn) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Only an engagement with a dated plan and a start date, such as Digital Marketing, takes the plan's new items." });
  }
  const startsOn = engagement.startedOn;
  return db.transaction(async tx => {
    const [tasks, sessions] = await Promise.all([
      tx.select({ title: engagementTasks.title }).from(engagementTasks).where(eq(engagementTasks.engagementId, engagement.id)),
      tx.select({ title: engagementSessions.title, weekNumber: engagementSessions.weekNumber }).from(engagementSessions).where(eq(engagementSessions.engagementId, engagement.id)),
    ]);
    const key = (title: string) => title.trim().toLowerCase();
    const haveTasks = new Set(tasks.map(row => key(row.title)));
    const haveSessions = new Set(sessions.map(row => `${key(row.title)}|${row.weekNumber ?? ""}`));
    const newTasks = starterTaskRows(engagement.id, plan, startsOn, actor.id).filter(row => !haveTasks.has(key(row.title)));
    const newSessions = plan.sessions.filter(item => !haveSessions.has(`${key(item.title)}|${item.week}`))
      .map(item => ({ engagementId: engagement.id, kind: item.kind, title: item.title, durationMinutes: item.durationMinutes, agenda: item.agenda, weekNumber: item.week, sortOrder: item.order, createdByUserId: actor.id }));
    if (newTasks.length) await tx.insert(engagementTasks).values(newTasks);
    if (newSessions.length) await tx.insert(engagementSessions).values(newSessions);
    await recordAudit(tx, { action: "engagement_plan_updated", actorUserId: actor.id, details: { engagementId: engagement.id, sessions: newSessions.length, items: newTasks.length } });
    return { success: true, sessions: newSessions.length, items: newTasks.length } as const;
  });
}

/** The engagement row and where it begins: the type's (or the service's) Work Plan, Data Request and Sessions. */
async function insertDirect(tx: Pick<Database, "insert">, actor: StaffActor, input: DirectEngagementInput, at: { businessId: number; service: string | null; starter: Starter | null; dueFor: (week: number) => string; contactName: string | null; contactEmail: string | null }) {
  // An engagement with fees opens to the client once its first fee is paid (R11), online or recorded by hand. Its fees
  // follow what was bought, dated from the start day (R36).
  const feeLines = defaultFees(input.type, at.service, input.startedOn);
  const [created] = await tx.insert(engagements).values({
    businessId: at.businessId, type: input.type, service: at.service, startedOn: input.startedOn, contactName: at.contactName, contactEmail: at.contactEmail, opensOnPayment: feeLines.length > 0,
    // The Six-Week Fix starts in the fix; every other direct engagement is getting set up.
    stage: input.type === "six_week_fix" ? "fix" : "setting_up", fixStartedAt: input.type === "six_week_fix" ? new Date() : null,
  }).returning({ id: engagements.id });
  const starter = at.starter;
  const tasks = starter
    ? starterTaskRows(created.id, starter, input.startedOn, actor.id)
    : [
      ...ASSESSMENT_TEMPLATE.dataRequests.map(item => ({ engagementId: created.id, kind: "data_request" as const, side: "client" as const, title: item.title, detail: item.detail, dueOn: at.dueFor(item.week), weekNumber: item.week, sortOrder: item.order, factor: item.factor, createdByUserId: actor.id })),
      ...ASSESSMENT_TEMPLATE.teamActions.map(item => ({ engagementId: created.id, kind: "action" as const, side: "ipf" as const, title: item.title, detail: item.detail, dueOn: at.dueFor(item.week), weekNumber: item.week, sortOrder: item.order, factor: item.factor, createdByUserId: actor.id })),
    ];
  if (tasks.length) await tx.insert(engagementTasks).values(tasks);
  const sessions = starter ? starter.sessions : ASSESSMENT_TEMPLATE.sessions;
  if (sessions.length) await tx.insert(engagementSessions).values(sessions.map(item => ({ engagementId: created.id, kind: item.kind, title: item.title, durationMinutes: item.durationMinutes, agenda: item.agenda, weekNumber: item.week, sortOrder: item.order, createdByUserId: actor.id })));
  // The fee schedule, from the service's price or the type's monthly fee; the team adjusts it on the engagement.
  const fees = initialFeeRows(created.id, feeLines);
  if (fees.length) await tx.insert(engagementFeeLines).values(fees);
  await recordAudit(tx, { action: "engagement_started", actorUserId: actor.id, targetEmail: at.contactEmail, details: { engagementId: created.id, type: input.type, service: at.service, direct: true, businessId: at.businessId } });
  return created.id;
}

export type EngagementStart = "started" | "exists" | "not_set_up" | "failed";

/** startEngagement for the payment flow: a missing table or any failure is logged and never undoes the payment. */
export async function startEngagementSafely(db: Database, input: { businessCheckId: number; paymentRequestId: number | null; actorUserId: number | null }): Promise<EngagementStart> {
  try {
    return (await startEngagement(db, input)).created ? "started" : "exists";
  } catch (error) {
    if (isMissingEngagementTable(error)) {
      console.error("[Engagements] The engagements table is missing: apply migration 0008. The payment is confirmed; start the engagement once it is applied.");
      return "not_set_up";
    }
    console.error("[Engagements] Payment confirmed, but the engagement could not be started:", error instanceof Error ? error.message : error);
    return "failed";
  }
}

/** Starting an engagement by hand is the desk's call: it needs every engagement in view and the right to work on them. */
export const canStart = (actor: StaffActor) => canSeeAll(actor) && authorityAllows(actor.authority, "manage_engagements");
function requireStart(actor: StaffActor) {
  if (!canStart(actor)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only a Partner, Vice President or Senior Associate can start an engagement by hand." });
  }
}

/**
 * Paid Business Reviews with no engagement: a payment confirmed before migration 0008 was applied, or a start
 * that failed. The safety net, so the order of events can never cost a client their room.
 */
export async function listAwaitingStart(db: Pick<Database, "select">, actor: StaffActor) {
  // Nothing to act on for someone who cannot start one, so nothing is listed.
  if (!canStart(actor)) return [];
  return db.select({
    businessCheckId: paymentRequests.businessCheckId,
    paymentRequestId: paymentRequests.id,
    confirmedAt: paymentRequests.confirmedAt,
    fullName: businessChecks.fullName,
    businessName: businessChecks.businessName,
    email: businessChecks.email,
  }).from(paymentRequests)
    .innerJoin(businessChecks, eq(paymentRequests.businessCheckId, businessChecks.id))
    .leftJoin(engagements, eq(engagements.businessCheckId, paymentRequests.businessCheckId))
    .where(and(eq(paymentRequests.item, "current_state"), eq(paymentRequests.status, "confirmed"), isNull(engagements.id)))
    .orderBy(asc(paymentRequests.confirmedAt));
}

/** Starts the engagement for a paid assessment that has none, exactly as confirming the payment would have. */
export async function startAwaitingEngagement(db: Database, actor: StaffActor, input: { businessCheckId: number }) {
  requireStart(actor);
  const payment = (await db.select({ id: paymentRequests.id }).from(paymentRequests)
    .where(and(eq(paymentRequests.businessCheckId, input.businessCheckId), eq(paymentRequests.item, "current_state"), eq(paymentRequests.status, "confirmed"))).limit(1))[0];
  if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "This Business Review is not paid yet." });
  const result = await startEngagement(db, { businessCheckId: input.businessCheckId, paymentRequestId: payment.id, actorUserId: actor.id });
  const engagement = (await db.select({ id: engagements.id }).from(engagements).where(eq(engagements.businessCheckId, input.businessCheckId)).limit(1))[0];
  return { engagementId: engagement.id, created: result.created } as const;
}

/** The owner accepted the account invitation: their engagement now belongs to their business. Never moves a linked one. */
export async function linkEngagementToBusiness(db: Pick<Database, "update">, input: { businessCheckId: number; businessId: number }) {
  await db.update(engagements).set({ businessId: input.businessId })
    .where(and(eq(engagements.businessCheckId, input.businessCheckId), isNull(engagements.businessId)));
}

// ---- The team's side: scope ----------------------------------------------------------------------------------------

export type StaffActor = { id: number; authority: Authority };

export const canSeeAll = (actor: StaffActor) => authorityAllows(actor.authority, "view_all_businesses");
const canSeeAssigned = (actor: StaffActor) => authorityAllows(actor.authority, "view_assigned_businesses");

/** Engagement ids the person is on. */
async function assignedEngagementIds(db: Pick<Database, "select">, userId: number) {
  const rows = await db.select({ engagementId: engagementTeam.engagementId }).from(engagementTeam).where(eq(engagementTeam.userId, userId));
  return rows.map(row => row.engagementId);
}

/** The engagement, if this person may see it: everyone with view_all_businesses, or someone on its team. */
export async function requireStaffEngagement(db: Pick<Database, "select">, actor: StaffActor, engagementId: number) {
  const engagement = (await db.select().from(engagements).where(eq(engagements.id, engagementId)).limit(1))[0];
  if (!engagement) throw notFound();
  if (canSeeAll(actor)) return engagement;
  if (canSeeAssigned(actor) && (await assignedEngagementIds(db, actor.id)).includes(engagementId)) return engagement;
  throw notFound();
}

/** Seeing is not changing: changes also need the named permission. */
function requirePermission(actor: StaffActor, permission: Parameters<typeof authorityAllows>[1], message: string) {
  if (!authorityAllows(actor.authority, permission)) throw new TRPCError({ code: "FORBIDDEN", message });
}
const requireManage = (actor: StaffActor) => requirePermission(actor, "manage_engagements", "Your role does not include working on engagements.");
/** Hands in work (ET, 6 November 2026): team-side Work Plan items and draft files, seen by IP Factory only. */
export const canContribute = (actor: StaffActor) => authorityAllows(actor.authority, "manage_engagements") || authorityAllows(actor.authority, "contribute_engagements");
/** Internal Session notes: for whoever works on or approves engagements, never a Specialist. */
export const canSeeInternal = (actor: StaffActor) => authorityAllows(actor.authority, "manage_engagements") || authorityAllows(actor.authority, "review_engagements");
/** An engagement's fees: as for internal notes, plus Finance. */
export const canSeeFees = (actor: StaffActor) => canSeeInternal(actor) || authorityAllows(actor.authority, "view_financials");

/**
 * A person's own tasks (R86, ET 13 November 2026): assigned to them, asked of the client by them, added by them as a team
 * item, or a client item that comes to them. Below the lead (Analysts, Specialists) a person sees and works on these
 * only; the lead upwards (canReviewEngagement) sees every task, to coordinate.
 */
export function isOwnTask(task: Pick<typeof engagementTasks.$inferSelect, "side" | "assigneeUserId" | "requestedByUserId" | "createdByUserId">, actorId: number, goesToUserId: number | null) {
  return task.assigneeUserId === actorId || task.requestedByUserId === actorId || (task.side === "ipf" && task.createdByUserId === actorId) || (task.side === "client" && goesToUserId === actorId);
}

/** One task this person may see and work on: theirs, or any when they lead the engagement. Not found otherwise. */
async function requireStaffTask(db: Pick<Database, "select">, actor: StaffActor, taskId: number) {
  const task = (await db.select().from(engagementTasks).where(eq(engagementTasks.id, taskId)).limit(1))[0];
  if (!task || task.status === "cancelled") throw notFound();
  await requireStaffEngagement(db, actor, task.engagementId);
  const team = await db.select({ userId: engagementTeam.userId, role: engagementTeam.role, name: users.name }).from(engagementTeam).innerJoin(users, eq(engagementTeam.userId, users.id)).where(eq(engagementTeam.engagementId, task.engagementId));
  const leads = await canReviewEngagement(db, actor, task.engagementId);
  const goesTo = task.side === "client" ? followUpOwnerOf(team, task) : null;
  if (!leads && !isOwnTask(task, actor.id, goesTo?.userId ?? null)) {
    const people = team.map(member => ({ userId: member.userId, name: member.name ?? "" }));
    const said = await db.select({ body: engagementTaskComments.body }).from(engagementTaskComments).where(eq(engagementTaskComments.taskId, task.id));
    if (!said.some(comment => mentionedIn(comment.body, people).some(person => person.userId === actor.id))) throw notFound();
  }
  return { task, team, leads };
}

/**
 * Today (R52, ET 12 November 2026): one list of what needs this person across the engagements they are on, so nobody
 * opens every project to find their work. A client's message waiting for a reply, a First edit due or late, something
 * the client sent to check, their own request past its day, a meeting this week, files to match, a Deliverable to
 * approve, a fee late. What goes to someone else (another Specialist's request) is left out; whoever leads an
 * engagement sees all of its items. Read only: each item opens the engagement.
 */
export async function todayFor(db: Database, actor: StaffActor, now = Date.now()) {
  const mine = await db.select({ engagementId: engagementTeam.engagementId, role: engagementTeam.role }).from(engagementTeam).where(eq(engagementTeam.userId, actor.id));
  if (!mine.length) return [];
  const ids = mine.map(row => row.engagementId);
  const leads = new Set(mine.filter(row => ENGAGEMENT_REVIEW_ROLES.includes(row.role)).map(row => row.engagementId));
  const [rows, team, tasks, sessions, deliverables, drops, matched, fees] = await Promise.all([
    db.select().from(engagements).where(and(inArray(engagements.id, ids), ne(engagements.stage, "closed"))),
    db.select({ engagementId: engagementTeam.engagementId, userId: engagementTeam.userId, role: engagementTeam.role, name: users.name }).from(engagementTeam).innerJoin(users, eq(engagementTeam.userId, users.id)).where(inArray(engagementTeam.engagementId, ids)),
    db.select().from(engagementTasks).where(and(inArray(engagementTasks.engagementId, ids), ne(engagementTasks.status, "cancelled"))),
    db.select().from(engagementSessions).where(and(inArray(engagementSessions.engagementId, ids), eq(engagementSessions.status, "planned"))),
    db.select({ id: engagementDeliverables.id, engagementId: engagementDeliverables.engagementId, title: engagementDeliverables.title, status: engagementDeliverables.status, kind: engagementDeliverables.kind, updatedAt: engagementDeliverables.updatedAt }).from(engagementDeliverables).where(and(inArray(engagementDeliverables.engagementId, ids), eq(engagementDeliverables.status, "awaiting_approval"))),
    db.select({ id: engagementFiles.id, engagementId: engagementFiles.engagementId }).from(engagementFiles).where(and(inArray(engagementFiles.engagementId, ids), isNull(engagementFiles.taskId), isNull(engagementFiles.deliverableId))),
    db.select({ fileId: engagementFileMatches.fileId }).from(engagementFileMatches).innerJoin(engagementFiles, eq(engagementFileMatches.fileId, engagementFiles.id)).where(inArray(engagementFiles.engagementId, ids)),
    db.select({ engagementId: engagementFeeLines.engagementId, dueOn: engagementFeeLines.dueOn }).from(engagementFeeLines).where(and(inArray(engagementFeeLines.engagementId, ids), isNull(engagementFeeLines.paidAt), isNull(engagementFeeLines.writtenOffAt))),
  ]);
  const today = lagosDay(now);
  const manages = authorityAllows(actor.authority, "manage_engagements");
  const reviews = authorityAllows(actor.authority, "review_engagements");
  const matchedIds = new Set(matched.map(row => row.fileId));
  type Item = { key: string; kind: "reply" | "clock" | "check" | "request" | "meeting" | "files" | "approval" | "fee" | "mention" | "review"; engagementId: number; businessName: string; title: string; detail: string; at: Date | null; late: boolean };
  const items: Item[] = [];
  for (const engagement of rows) {
    const businessName = await businessNameOf(db, engagement);
    const lead = leads.has(engagement.id);
    const crew = team.filter(member => member.engagementId === engagement.id);
    const goesToMe = (task: typeof engagementTasks.$inferSelect) => lead || followUpOwnerOf(crew, task)?.userId === actor.id;
    const all = tasks.filter(task => task.engagementId === engagement.id);
    const own = all.filter(task => task.side === "client");
    const comments = all.length ? await taskCommentsOf(db, engagement.id) : [];
    const people = crew.map(member => ({ userId: member.userId, name: member.name ?? "" }));
    // Tagged in an item's messages (R86): until this person writes on that item after it.
    for (const task of all) {
      const said = comments.filter(comment => comment.taskId === task.id);
      const tagged = [...said].reverse().find(comment => comment.authorUserId !== actor.id && mentionedIn(comment.body, people).some(person => person.userId === actor.id));
      const replied = tagged && said.some(comment => comment.authorUserId === actor.id && comment.id > tagged.id);
      if (tagged && !replied) items.push({ key: `mention-${task.id}`, kind: "mention", engagementId: engagement.id, businessName, title: task.title, detail: `${tagged.authorName || "A colleague"}: ${tagged.body.length > 90 ? `${tagged.body.slice(0, 90)}…` : tagged.body}`, at: tagged.createdAt, late: false });
      // A team item handed in waits on the lead (R86).
      if (lead && task.side === "ipf" && task.status === "received") items.push({ key: `review-${task.id}`, kind: "review", engagementId: engagement.id, businessName, title: task.title, detail: `Handed in by ${crew.find(member => member.userId === (task.assigneeUserId ?? task.createdByUserId))?.name ?? "a colleague"}: mark it done or ask for more`, at: task.updatedAt, late: false });
    }
    for (const task of own) {
      const last = comments.filter(comment => comment.taskId === task.id).at(-1);
      if (last?.fromClient && goesToMe(task)) items.push({ key: `reply-${task.id}`, kind: "reply", engagementId: engagement.id, businessName, title: task.title, detail: `${last.authorName || "The client"}: ${last.body.length > 90 ? `${last.body.slice(0, 90)}…` : last.body}`, at: last.createdAt, late: false });
      if (task.turnaround && task.followUpDueAt && !task.followUpDoneAt && goesToMe(task)) {
        const left = task.followUpDueAt.getTime() - now;
        items.push({ key: `clock-${task.id}`, kind: "clock", engagementId: engagement.id, businessName, title: task.title, detail: `${TURNAROUND_LABELS[task.turnaround]} ${left < 0 ? "is late" : "due"}`, at: task.followUpDueAt, late: left < 0 });
      }
      if (task.status === "received" && manages && goesToMe(task)) items.push({ key: `check-${task.id}`, kind: "check", engagementId: engagement.id, businessName, title: task.title, detail: "Sent by the client: check it, then mark it received or ask for more", at: task.receivedAt, late: false });
      if (task.requestedByUserId === actor.id && OPEN_TASK_STATUSES.includes(task.status) && task.dueOn && task.dueOn < today) items.push({ key: `request-${task.id}`, kind: "request", engagementId: engagement.id, businessName, title: task.title, detail: `Your request, due ${dayInWords(task.dueOn)}, is not answered yet`, at: new Date(`${task.dueOn}T12:00:00Z`), late: true });
    }
    for (const session of sessions.filter(item => item.engagementId === engagement.id && item.scheduledFor && item.scheduledFor.getTime() >= now && item.scheduledFor.getTime() < now + 7 * 86_400_000)) {
      items.push({ key: `meeting-${session.id}`, kind: "meeting", engagementId: engagement.id, businessName, title: session.title, detail: session.meetingLink ? "With the Join link" : "No Join link yet", at: session.scheduledFor, late: false });
    }
    const unsorted = drops.filter(file => file.engagementId === engagement.id && !matchedIds.has(file.id)).length;
    if (unsorted && manages) items.push({ key: `files-${engagement.id}`, kind: "files", engagementId: engagement.id, businessName, title: `${unsorted} ${unsorted === 1 ? "file" : "files"} to match`, detail: "Sent to the drop box: say which Data Request each answers", at: null, late: false });
    if (reviews || lead) for (const item of deliverables.filter(row => row.engagementId === engagement.id)) items.push({ key: `approval-${item.id}`, kind: "approval", engagementId: engagement.id, businessName, title: item.title, detail: "Waiting for your approval before it is shared", at: item.updatedAt, late: false });
    if (canSeeFees(actor) && !engagement.opensOnPayment) {
      const held = feeHold(fees.filter(fee => fee.engagementId === engagement.id).map(fee => ({ dueOn: fee.dueOn, paid: false })), today);
      if (held) items.push({ key: `fee-${engagement.id}`, kind: "fee", engagementId: engagement.id, businessName, title: held.state === "paused" ? "Work paused: a fee is unpaid" : "A fee is late", detail: held.state === "paused" ? "Paying lifts the pause; a new date gives more time" : `Work pauses on ${held.pausesOn} if it is not paid`, at: null, late: true });
    }
  }
  // Late first, then what is soonest; replies and checks oldest first, as they have waited longest.
  return items.sort((a, b) => Number(b.late) - Number(a.late) || (a.at ? a.at.getTime() : Infinity) - (b.at ? b.at.getTime() : Infinity));
}

/** The engagements this person may see, newest first, with what the desk needs at a glance. */
/** The stage in words: a dated engagement's current stage from its start date, else the stored stage. */
export function engagementStageLabel(row: { type: EngagementType; stage: EngagementStage; startedOn: string | null }, now: number) {
  if (!STAGED_TYPES.includes(row.type) && !DATED_TYPES[row.type]) return row.stage === "closed" ? "Closed" : "Open";
  const dated = DATED_TYPES[row.type];
  if (!dated || !row.startedOn) return ENGAGEMENT_STAGE_LABELS[row.stage];
  const progress = datedProgress(dated, row.startedOn, now);
  if (!progress.started) return "Starting soon";
  return progress.stages.find(stage => stage.state === "now")?.title ?? "Complete";
}

export async function listStaffEngagements(db: Database, actor: StaffActor) {
  let scope: number[] | null = null;
  if (!canSeeAll(actor)) {
    if (!canSeeAssigned(actor)) return [];
    scope = await assignedEngagementIds(db, actor.id);
    if (!scope.length) return [];
  }
  const rows = await db.select({
    id: engagements.id,
    stage: engagements.stage,
    service: engagements.service,
    businessId: engagements.businessId,
    businessCheckId: engagements.businessCheckId,
    createdAt: engagements.createdAt,
    ownerName: businessChecks.fullName,
    ownerEmail: businessChecks.email,
    checkBusinessName: businessChecks.businessName,
    businessName: businesses.name,
    type: engagements.type,
    startedOn: engagements.startedOn,
    contactName: engagements.contactName,
    contactEmail: engagements.contactEmail,
    opensOnPayment: engagements.opensOnPayment,
  }).from(engagements)
    .leftJoin(businessChecks, eq(engagements.businessCheckId, businessChecks.id))
    .leftJoin(businesses, eq(engagements.businessId, businesses.id))
    .where(scope ? inArray(engagements.id, scope) : undefined)
    .orderBy(desc(engagements.id));
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const [team, tasks, sessions, drops, matched, unpaidFees] = await Promise.all([
    db.select({ engagementId: engagementTeam.engagementId, role: engagementTeam.role, name: users.name, userId: engagementTeam.userId }).from(engagementTeam).innerJoin(users, eq(engagementTeam.userId, users.id)).where(inArray(engagementTeam.engagementId, ids)),
    db.select({ engagementId: engagementTasks.engagementId, side: engagementTasks.side, status: engagementTasks.status, dueOn: engagementTasks.dueOn }).from(engagementTasks).where(inArray(engagementTasks.engagementId, ids)),
    db.select({ engagementId: engagementSessions.engagementId, title: engagementSessions.title, scheduledFor: engagementSessions.scheduledFor, status: engagementSessions.status }).from(engagementSessions).where(inArray(engagementSessions.engagementId, ids)),
    // Files in the drop box (on no request or deliverable yet), and which of them the team has matched.
    db.select({ id: engagementFiles.id, engagementId: engagementFiles.engagementId }).from(engagementFiles).where(and(inArray(engagementFiles.engagementId, ids), isNull(engagementFiles.taskId), isNull(engagementFiles.deliverableId))),
    db.select({ fileId: engagementFileMatches.fileId }).from(engagementFileMatches).innerJoin(engagementFiles, eq(engagementFileMatches.fileId, engagementFiles.id)).where(inArray(engagementFiles.engagementId, ids)),
    // Fees with something left to pay (not paid in full, not written off), for Late and Paused (D6): the team sees the
    // state, not the amounts.
    db.select({ engagementId: engagementFeeLines.engagementId, dueOn: engagementFeeLines.dueOn }).from(engagementFeeLines).where(and(inArray(engagementFeeLines.engagementId, ids), isNull(engagementFeeLines.paidAt), isNull(engagementFeeLines.writtenOffAt))),
  ]);
  const now = Date.now();
  const today = lagosDay(now);
  const matchedIds = new Set(matched.map(row => row.fileId));
  return rows.map(row => {
    const open = tasks.filter(task => task.engagementId === row.id && task.side === "client" && (task.status === "open" || task.status === "needs_more"));
    const next = sessions.filter(item => item.engagementId === row.id && item.status === "planned" && item.scheduledFor && item.scheduledFor.getTime() >= now)
      .sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime())[0];
    return {
      id: row.id,
      stage: row.stage,
      stageLabel: engagementStageLabel(row, now),
      type: row.type,
      // The service for a service engagement ("Pitch Deck"), else the type.
      typeLabel: engagementTitle(row.type, row.service),
      businessName: row.businessName ?? row.checkBusinessName ?? row.ownerName ?? row.contactName ?? "",
      ownerName: row.ownerName ?? row.contactName ?? "",
      ownerEmail: row.ownerEmail ?? row.contactEmail ?? "",
      hasAccount: row.businessId !== null,
      createdAt: row.createdAt,
      team: team.filter(member => member.engagementId === row.id).map(member => ({ name: member.name ?? "", role: member.role, roleLabel: ENGAGEMENT_TEAM_ROLE_LABELS[member.role] })),
      openClientRequests: open.length,
      overdueClientRequests: open.filter(task => task.dueOn && task.dueOn < new Date(now).toISOString().slice(0, 10)).length,
      unscheduledSessions: sessions.filter(item => item.engagementId === row.id && item.status === "planned" && !item.scheduledFor).length,
      nextSession: next ? { title: next.title, scheduledFor: next.scheduledFor } : null,
      // The signed-in person's own role here, for My projects; null when they are not on the team.
      myRole: (() => { const mine = team.find(member => member.engagementId === row.id && member.userId === actor.id); return mine ? ENGAGEMENT_TEAM_ROLE_LABELS[mine.role] : null; })(),
      unsortedFiles: drops.filter(file => file.engagementId === row.id && !matchedIds.has(file.id)).length,
      hold: (() => {
        const held = row.opensOnPayment ? null : feeHold(unpaidFees.filter(fee => fee.engagementId === row.id).map(fee => ({ dueOn: fee.dueOn, paid: false })), today);
        return held ? { state: held.state, pausesOn: held.pausesOn } : null;
      })(),
    };
  });
}

/** Everything about one engagement, for the team: this never reaches a client. Internal notes only for canSeeInternal. */
export async function getStaffEngagement(db: Database, actor: StaffActor, engagementId: number) {
  const engagement = await requireStaffEngagement(db, actor, engagementId);
  // A direct engagement (no Business Health Check) names its contact on the engagement itself.
  const check = engagement.businessCheckId !== null
    ? (await db.select({ id: businessChecks.id, fullName: businessChecks.fullName, email: businessChecks.email, whatsapp: businessChecks.whatsapp, businessName: businessChecks.businessName })
      .from(businessChecks).where(eq(businessChecks.id, engagement.businessCheckId)).limit(1))[0]
    : engagement.contactEmail ? { id: null, fullName: engagement.contactName ?? "", email: engagement.contactEmail, whatsapp: null, businessName: null } : undefined;
  // The team sees a Session the owner booked on Calendly without typing it in.
  if (check) await syncSessionBookings(db, engagement, check.email);
  const business = engagement.businessId ? (await db.select({ id: businesses.id, name: businesses.name }).from(businesses).where(eq(businesses.id, engagement.businessId)).limit(1))[0] ?? null : null;
  const [team, sessions, tasks, deliverables, comments, clientPeople, files, measure, checkins, matches, waiting] = await Promise.all([
    db.select({ userId: engagementTeam.userId, role: engagementTeam.role, name: users.name, email: users.email, jobTitle: users.jobTitle }).from(engagementTeam).innerJoin(users, eq(engagementTeam.userId, users.id)).where(eq(engagementTeam.engagementId, engagementId)).orderBy(asc(engagementTeam.id)),
    db.select().from(engagementSessions).where(eq(engagementSessions.engagementId, engagementId)).orderBy(asc(engagementSessions.id)),
    db.select().from(engagementTasks).where(eq(engagementTasks.engagementId, engagementId)).orderBy(asc(engagementTasks.id)),
    db.select().from(engagementDeliverables).where(eq(engagementDeliverables.engagementId, engagementId)).orderBy(asc(engagementDeliverables.id)),
    db.select({ id: engagementComments.id, deliverableId: engagementComments.deliverableId, body: engagementComments.body, createdAt: engagementComments.createdAt, authorName: users.name })
      .from(engagementComments).innerJoin(users, eq(engagementComments.authorUserId, users.id)).where(eq(engagementComments.engagementId, engagementId)).orderBy(asc(engagementComments.id)),
    engagement.businessId ? clientPeopleOf(db, engagement.businessId) : Promise.resolve([]),
    filesOf(db, engagementId),
    measureOf(db, engagementId),
    checkinsOf(db, engagementId),
    matchesOf(db, engagementId),
    // Fees with something left to pay: a second half not dated yet (sharing the main output dates it, R36), and Late
    // or Paused (D6).
    db.select({ dueOn: engagementFeeLines.dueOn }).from(engagementFeeLines).where(and(eq(engagementFeeLines.engagementId, engagementId), isNull(engagementFeeLines.paidAt), isNull(engagementFeeLines.writtenOffAt))),
  ]);
  // Asking the client (R78): who asked for each item, whom it goes to, its conversation, and this person's request this week.
  const [itemComments, askers, review] = await Promise.all([taskCommentsOf(db, engagementId), namesOf(db, tasks.map(task => task.requestedByUserId)), canReviewEngagement(db, actor, engagementId)]);
  const weekStart = new Date(`${weekStartOf(lagosDay())}T00:00:00+01:00`).getTime();
  const askedThisWeek = review ? undefined : tasks.filter(task => task.requestedByUserId === actor.id && task.status !== "cancelled" && task.createdAt.getTime() >= weekStart).sort((a, b) => b.id - a.id)[0];
  const manages = authorityAllows(actor.authority, "manage_engagements");
  const seesAllTasks = await canReviewEngagement(db, actor, engagementId);
  // Tagged in an item's messages, a person may open that item too (R86).
  const me = team.find(member => member.userId === actor.id);
  const taggedIn = new Set(me ? itemComments.filter(comment => mentionedIn(comment.body, team.map(member => ({ userId: member.userId, name: member.name ?? "" }))).some(person => person.userId === actor.id)).map(comment => comment.taskId) : []);
  const held = engagement.opensOnPayment ? null : feeHold(waiting.map(fee => ({ dueOn: fee.dueOn, paid: false })), lagosDay());
  const staffFile = (file: EngagementFile) => ({ id: file.id, fileName: file.fileName, contentType: file.contentType, sizeBytes: file.sizeBytes, audience: file.audience, uploadedByName: file.uploadedByName, createdAt: file.createdAt });
  const filesFor = (where: "taskId" | "deliverableId", id: number) => files.filter(file => file[where] === id || (where === "taskId" && matches.some(match => match.fileId === file.id && match.taskId === id))).map(staffFile);
  return {
    uploadsEnabled: isFileStorageConfigured(),
    engagement: { ...engagement, stageLabel: engagementStageLabel(engagement, Date.now()), typeLabel: engagementTitle(engagement.type, engagement.service) },
    owner: check ? { name: check.fullName, email: check.email, whatsapp: check.whatsapp } : null,
    businessName: business?.name ?? check?.businessName ?? check?.fullName ?? "",
    hasAccount: business !== null,
    team: team.map(member => ({ ...member, roleLabel: ENGAGEMENT_TEAM_ROLE_LABELS[member.role] })),
    clientPeople,
    // Internal notes stay with those who work on or approve engagements.
    sessions: canSeeInternal(actor) ? sessions : sessions.map(item => ({ ...item, internalNotes: null })),
    // Below the lead, a person's own tasks only (R86); the lead upwards sees every task.
    tasks: tasks.filter(task => seesAllTasks || taggedIn.has(task.id) || isOwnTask(task, actor.id, task.side === "client" ? followUpOwnerOf(team, task)?.userId ?? null : null)).map(task => {
      const goesTo = task.side === "client" ? followUpOwnerOf(team, task) : null;
      const own = isOwnTask(task, actor.id, goesTo?.userId ?? null);
      return {
        ...task, statusLabel: ENGAGEMENT_TASK_STATUS_LABELS[task.status], files: filesFor("taskId", task.id),
        askedByName: task.requestedByUserId === null ? null : askers.get(task.requestedByUserId) ?? "",
        goesTo: goesTo ? { userId: goesTo.userId, name: goesTo.name ?? "" } : null,
        // Whether this person may write on it and share its First edit: the server checks again (requireStaffClientItem).
        canAnswer: task.status !== "cancelled" && (seesAllTasks || own),
        // A team item its owner hands in for review (R86): uploads, a link, messages, then Ready for review.
        canHandIn: task.side === "ipf" && (task.assigneeUserId === actor.id || task.createdByUserId === actor.id) && OPEN_TASK_STATUSES.includes(task.status),
        comments: itemComments.filter(comment => comment.taskId === task.id).map(({ taskId: _taskId, ...comment }) => comment),
      };
    }),
    // The drop box: every file the client sent without saying what it answers, with the requests it has been matched to.
    // Unsorted files come first.
    content: (await contentOf(db, engagementId)).map(item => ({ ...item, kindLabel: CONTENT_KIND_LABELS[item.kind], statusLabel: CONTENT_STATUS_LABELS[item.status] })),
    inbox: files.filter(file => file.taskId === null && file.deliverableId === null && !file.fromTeam)
      .map(file => ({ ...staffFile(file), note: file.note, taskIds: matches.filter(match => match.fileId === file.id).map(match => match.taskId) }))
      .sort((a, b) => Number(a.taskIds.length > 0) - Number(b.taskIds.length > 0) || b.id - a.id),
    deliverables: deliverables.map(item => ({ ...item, kindLabel: ENGAGEMENT_DELIVERABLE_KIND_LABELS[item.kind], needsApproval: DELIVERABLES_NEEDING_APPROVAL.includes(item.kind), comments: comments.filter(comment => comment.deliverableId === item.id), files: filesFor("deliverableId", item.id) })),
    measure,
    checkins,
    balanceOnDelivery: waiting.some(fee => fee.dueOn === null),
    hold: held ? { state: held.state, pausesOn: held.pausesOn, dueOn: held.fee.dueOn } : null,
    can: {
      manage: authorityAllows(actor.authority, "manage_engagements"),
      assign: authorityAllows(actor.authority, "assign_engagements"),
      review: await canReviewEngagement(db, actor, engagementId),
      sendSignIn: authorityAllows(actor.authority, "manage_client_onboarding"),
      contribute: canContribute(actor),
      seeInternal: canSeeInternal(actor),
      seeFees: canSeeFees(actor),
      previewAsClient: canPreviewAsClient(actor),
      seeAllTasks: seesAllTasks,
    },
    /** Ask {business} (R78): whether this person may, whether the weekly limit applies to them, and their request this week. */
    ask: {
      allowed: canContribute(actor) && !engagement.opensOnPayment,
      unlimited: review,
      thisWeek: askedThisWeek ? { id: askedThisWeek.id, title: askedThisWeek.title } : null,
    },
    viewerUserId: actor.id,
  };
}

/** The client's people, for assigning their side of a task. */
async function clientPeopleOf(db: Pick<Database, "select">, businessId: number) {
  const rows = await db.select({ userId: users.id, name: users.name, role: businessMemberships.role, access: businessMemberAccess.access })
    .from(businessMemberships)
    .innerJoin(users, eq(businessMemberships.userId, users.id))
    .leftJoin(businessMemberAccess, eq(businessMemberAccess.membershipId, businessMemberships.id))
    .where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.status, "active")))
    .orderBy(asc(businessMemberships.id));
  return rows.map(row => ({ userId: row.userId, name: row.name ?? "", role: row.role, access: row.role === "member" ? row.access ?? "full" : "full" }));
}

/** People who can be put on an engagement team: anyone with an internal role other than finance alone. */
export async function listAssignableStaff(db: Database, actor: StaffActor) {
  requirePermission(actor, "assign_engagements", "Your role does not include assigning engagements.");
  const rows = await db.select({ userId: users.id, name: users.name, email: users.email, role: userPlatformRoles.role }).from(userPlatformRoles)
    .innerJoin(users, eq(userPlatformRoles.userId, users.id)).where(eq(users.status, "active")).orderBy(asc(users.name));
  const people = new Map<number, { userId: number; name: string; email: string; roles: string[] }>();
  for (const row of rows) {
    const person = people.get(row.userId) ?? { userId: row.userId, name: row.name ?? "", email: row.email ?? "", roles: [] };
    person.roles.push(row.role);
    people.set(row.userId, person);
  }
  return Array.from(people.values()).filter(person => person.roles.some(role => role !== "finance"));
}

// ---- Telling the client ------------------------------------------------------------------------------------------

/** The email for something newly shared: its title and a link to the room, never the content itself (plan 2.4). */
export function sharedNoticeEmail(input: { fullName: string; what: string; title: string; url: string }) {
  const name = input.fullName.split(" ")[0] || "there";
  return {
    subject: `Engagement update: ${input.title}`,
    body: [
      `Dear ${name},`,
      "",
      `We have shared ${input.what} with you on ${BRAND.productName}: ${input.title}.`,
      "",
      `Open your room: ${input.url}`,
      "",
      BRAND.organisationName,
    ].join("\n"),
  };
}

/** Everyone on the client's side who can see an item shared with `audience`, with their email. */
async function clientRecipients(db: Pick<Database, "select">, businessId: number, audience: Exclude<EngagementAudience, "team">) {
  const people = await db.select({ name: users.name, email: users.email, role: businessMemberships.role, access: businessMemberAccess.access })
    .from(businessMemberships)
    .innerJoin(users, eq(businessMemberships.userId, users.id))
    .leftJoin(businessMemberAccess, eq(businessMemberAccess.membershipId, businessMemberships.id))
    .where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.status, "active"), eq(users.status, "active")));
  return people.filter(person => person.email && clientCanSee(audience, person.role === "member" ? { kind: "member", access: person.access ?? "full", userId: 0 } : { kind: "owner" }));
}

/** Emails each client who can now see the item. Delivery problems are logged and never undo the share. */
async function notifyShared(db: Pick<Database, "select">, engagementId: number, audience: Exclude<EngagementAudience, "team">, what: string, title: string) {
  try {
    const engagement = (await db.select({ businessId: engagements.businessId }).from(engagements).where(eq(engagements.id, engagementId)).limit(1))[0];
    if (!engagement?.businessId) return;
    const url = `${getTrustedApplicationOrigin()}/dashboard`;
    for (const person of await clientRecipients(db, engagement.businessId, audience)) {
      const message = sharedNoticeEmail({ fullName: person.name ?? "", what, title, url });
      await deliverEmail({ to: person.email!, subject: message.subject, body: message.body, sender: "business_support" });
    }
  } catch (error) {
    console.error("[Engagements] Shared, but the client could not be emailed:", error instanceof Error ? error.message : error);
  }
}

// ---- The team's side: changes --------------------------------------------------------------------------------------

export async function assignTeamMember(db: Database, actor: StaffActor, input: { engagementId: number; userId: number; role: EngagementTeamRole }) {
  requirePermission(actor, "assign_engagements", "Your role does not include assigning engagements.");
  const engagement = await requireStaffEngagement(db, actor, input.engagementId);
  // The Digital Marketer and Content Producer belong to Digital marketing engagements only (R45).
  if (!teamRolesFor(engagement.type).includes(input.role)) throw new TRPCError({ code: "BAD_REQUEST", message: "The Digital Marketer and Content Producer roles are for Digital Marketing engagements." });
  const staff = (await db.select({ userId: userPlatformRoles.userId }).from(userPlatformRoles).innerJoin(users, eq(userPlatformRoles.userId, users.id))
    .where(and(eq(userPlatformRoles.userId, input.userId), eq(users.status, "active"))).limit(1))[0];
  if (!staff) throw new TRPCError({ code: "BAD_REQUEST", message: "Only IP Factory staff can join an engagement team." });
  const existing = (await db.select({ role: engagementTeam.role }).from(engagementTeam).where(and(eq(engagementTeam.engagementId, input.engagementId), eq(engagementTeam.userId, input.userId))).limit(1))[0];
  await db.transaction(async tx => {
    await tx.insert(engagementTeam).values({ engagementId: input.engagementId, userId: input.userId, role: input.role, assignedByUserId: actor.id })
      .onConflictDoUpdate({ target: [engagementTeam.engagementId, engagementTeam.userId], set: { role: input.role, assignedByUserId: actor.id } });
    await recordAudit(tx, { action: "engagement_team_assigned", actorUserId: actor.id, details: { engagementId: input.engagementId, userId: input.userId, role: input.role, ...(existing ? { previousRole: existing.role } : {}) } });
  });
  // The person is told by email when they join or their role changes, unless they did it themselves.
  const notified = existing?.role === input.role || input.userId === actor.id ? false : await notifyAssigned(db, input.engagementId, input.userId, input.role, Boolean(existing));
  return { success: true, added: !existing, notified } as const;
}

export function assignedNoticeEmail(input: { fullName: string; businessName: string; roleLabel: string; changed: boolean; url: string }) {
  const name = input.fullName.split(" ")[0] || "there";
  return {
    subject: input.changed ? `Your role on ${input.businessName}: ${input.roleLabel}` : `You are on ${input.businessName} as ${input.roleLabel}`,
    body: [
      `Dear ${name},`,
      "",
      input.changed
        ? `Your role on the ${input.businessName} engagement is now ${input.roleLabel}.`
        : `You have been added to the ${input.businessName} engagement as ${input.roleLabel}.`,
      "",
      `Open it in the internal area: ${input.url}`,
      "",
      BRAND.organisationName,
    ].join("\n"),
  };
}

/** Best effort: an assignment stands even when the email cannot be sent. Returns whether it was sent. */
async function notifyAssigned(db: Pick<Database, "select">, engagementId: number, userId: number, role: EngagementTeamRole, changed: boolean) {
  try {
    const person = (await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!person?.email) return false;
    const row = (await db.select({ businessName: businesses.name, checkBusiness: businessChecks.businessName, ownerName: businessChecks.fullName }).from(engagements)
      .leftJoin(businessChecks, eq(engagements.businessCheckId, businessChecks.id)).leftJoin(businesses, eq(engagements.businessId, businesses.id))
      .where(eq(engagements.id, engagementId)).limit(1))[0];
    const businessName = row?.businessName ?? row?.checkBusiness ?? row?.ownerName ?? "a client";
    const message = assignedNoticeEmail({ fullName: person.name ?? "", businessName, roleLabel: ENGAGEMENT_TEAM_ROLE_LABELS[role], changed, url: `${getTrustedApplicationOrigin()}/admin` });
    await deliverEmail({ to: person.email, subject: message.subject, body: message.body, sender: "business_support" });
    return true;
  } catch (error) {
    console.error("[Engagements] Assigned, but the team member could not be emailed:", error instanceof Error ? error.message : error);
    return false;
  }
}

export async function removeTeamMember(db: Database, actor: StaffActor, input: { engagementId: number; userId: number }) {
  requirePermission(actor, "assign_engagements", "Your role does not include assigning engagements.");
  await requireStaffEngagement(db, actor, input.engagementId);
  await db.transaction(async tx => {
    await tx.delete(engagementTeam).where(and(eq(engagementTeam.engagementId, input.engagementId), eq(engagementTeam.userId, input.userId)));
    await recordAudit(tx, { action: "engagement_team_removed", actorUserId: actor.id, details: { engagementId: input.engagementId, userId: input.userId } });
  });
  return { success: true } as const;
}

export async function setEngagementStage(db: Database, actor: StaffActor, input: { engagementId: number; stage: EngagementStage }) {
  requireManage(actor);
  const engagement = await requireStaffEngagement(db, actor, input.engagementId);
  if (engagement.stage === input.stage) return { success: true, changed: false } as const;
  const now = new Date();
  await db.transaction(async tx => {
    await tx.update(engagements).set({
      stage: input.stage,
      ...(input.stage === "assessment" && !engagement.assessmentStartedAt ? { assessmentStartedAt: now } : {}),
      ...(input.stage === "fix" && !engagement.fixStartedAt ? { fixStartedAt: now } : {}),
      ...(input.stage === "closed" ? { closedAt: now } : { closedAt: null }),
    }).where(eq(engagements.id, engagement.id));
    await recordAudit(tx, { action: "engagement_stage_changed", actorUserId: actor.id, details: { engagementId: engagement.id, from: engagement.stage, to: input.stage } });
  });
  return { success: true, changed: true } as const;
}

export async function saveProblem(db: Database, actor: StaffActor, input: { engagementId: number; problemArea: number | null; subProblem: string | null; problemStatement: string | null }) {
  requireManage(actor);
  await requireStaffEngagement(db, actor, input.engagementId);
  await db.update(engagements).set({ problemArea: input.problemArea, subProblem: input.subProblem, problemStatement: input.problemStatement }).where(eq(engagements.id, input.engagementId));
  return { success: true } as const;
}

export type SessionInput = { engagementId: number; sessionId?: number; kind: EngagementSessionKind; title: string; scheduledFor: Date | null; durationMinutes: number | null; meetingLink: string | null; agenda: string | null; status: EngagementSessionStatus; weekNumber?: number | null };

export async function saveSession(db: Database, actor: StaffActor, input: SessionInput) {
  requireManage(actor);
  await requireStaffEngagement(db, actor, input.engagementId);
  const values = { kind: input.kind, title: input.title, scheduledFor: input.scheduledFor, durationMinutes: input.durationMinutes, meetingLink: input.meetingLink, agenda: input.agenda, status: input.status, ...(input.weekNumber === undefined ? {} : { weekNumber: input.weekNumber }) };
  if (input.sessionId) {
    const before = (await db.select().from(engagementSessions).where(and(eq(engagementSessions.id, input.sessionId), eq(engagementSessions.engagementId, input.engagementId))).limit(1))[0];
    if (!before) throw notFound();
    const updated = await db.update(engagementSessions).set(values).where(and(eq(engagementSessions.id, input.sessionId), eq(engagementSessions.engagementId, input.engagementId))).returning({ id: engagementSessions.id });
    if (!updated.length) throw notFound();
    // A new time, length, link or title, or a cancellation, goes to everyone on the engagement (R75).
    const change = sessionChange(before, values);
    if (change) await sendSessionEmails(db, { sessionId: input.sessionId, change, includeClient: true });
    return { sessionId: input.sessionId } as const;
  }
  const [created] = await db.insert(engagementSessions).values({ engagementId: input.engagementId, ...values, createdByUserId: actor.id }).returning({ id: engagementSessions.id });
  const change = sessionChange(null, values);
  if (change) await sendSessionEmails(db, { sessionId: created.id, change, includeClient: true });
  return { sessionId: created.id } as const;
}

export type MeetingInput = { engagementId: number; type: MeetingTypeId; title: string; starts: Date[]; durationMinutes: number; meetingLink: string; agenda: string | null; now?: Date };

/**
 * Book a meeting from Zoom (R81, ET 11 November 2026): the team picks the kind of meeting, books it in Zoom and pastes
 * the invitation; the browser reads it (shared/zoomInvitation.ts) and sends the dates and the Join link here. A meeting
 * pasted again (the same Zoom meeting ID) moves its Sessions; otherwise each date fills the plan's Session of that kind
 * still without a time, in order, and any date left over becomes a new Session. Everyone on the engagement is emailed:
 * one date with its calendar invitation (R75), several in one email with a calendar file of them all.
 */
export async function bookMeeting(db: Database, actor: StaffActor, input: MeetingInput) {
  requireManage(actor);
  const engagement = await requireStaffEngagement(db, actor, input.engagementId);
  const now = (input.now ?? new Date()).getTime();
  const starts = Array.from(new Set(input.starts.map(start => start.getTime()))).sort((a, b) => a - b).slice(0, MAX_OCCURRENCES).map(time => new Date(time));
  if (!starts.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Give the meeting a date and time." });
  if (starts[0]!.getTime() < now - 5 * 60_000) throw new TRPCError({ code: "BAD_REQUEST", message: "That time has passed. Check the date in the invitation." });
  const type = meetingType(input.type);
  const zoomId = zoomMeetingIdOf(input.meetingLink);
  const sessions = await db.select().from(engagementSessions).where(eq(engagementSessions.engagementId, engagement.id)).orderBy(asc(engagementSessions.weekNumber), asc(engagementSessions.sortOrder), asc(engagementSessions.id));
  const weekOf = (start: Date) => engagement.startedOn ? Math.min(13, Math.max(1, Math.floor((start.getTime() - Date.parse(`${engagement.startedOn}T00:00:00+01:00`)) / (7 * 86_400_000)) + 1)) : null;
  // The same Zoom meeting pasted again: its Sessions, in date order, take the new dates.
  const same = zoomId ? sessions.filter(item => item.status === "planned" && zoomMeetingIdOf(item.meetingLink) === zoomId).sort((a, b) => (a.scheduledFor?.getTime() ?? 0) - (b.scheduledFor?.getTime() ?? 0)) : [];
  const fills = same.length ? same : sessions.filter(item => item.status === "planned" && !item.scheduledFor && (
    type.fills === "review" ? item.kind === "review" : type.fills === "Session" ? item.kind === "assessment_call" : type.fills !== null && item.title.trim().toLowerCase() === type.fills.toLowerCase()));
  const changes: { sessionId: number; before: typeof engagementSessions.$inferSelect | null }[] = [];
  const dropped: number[] = [];
  await db.transaction(async tx => {
    for (let index = 0; index < starts.length; index++) {
      const start = starts[index]!;
      const existing = fills[index];
      const values = { scheduledFor: start, meetingLink: input.meetingLink, durationMinutes: input.durationMinutes, ...(input.agenda ? { agenda: input.agenda } : {}) };
      if (existing) {
        await tx.update(engagementSessions).set(values).where(eq(engagementSessions.id, existing.id));
        changes.push({ sessionId: existing.id, before: existing });
      } else {
        const [created] = await tx.insert(engagementSessions).values({ engagementId: engagement.id, kind: type.kind, title: input.title.trim(), status: "planned", weekNumber: weekOf(start), sortOrder: 50, createdByUserId: actor.id, ...values }).returning({ id: engagementSessions.id });
        changes.push({ sessionId: created.id, before: null });
      }
    }
    // A recurring meeting pasted again with fewer dates: the dates it no longer has are cancelled.
    for (const left of same.slice(starts.length)) {
      await tx.update(engagementSessions).set({ status: "cancelled" }).where(eq(engagementSessions.id, left.id));
      dropped.push(left.id);
    }
    await recordAudit(tx, { action: "engagement_meeting_booked", actorUserId: actor.id, details: { engagementId: engagement.id, type: input.type, sessions: starts.length, filled: changes.filter(item => item.before).length, moved: same.length > 0, cancelled: dropped.length } });
  });
  for (const sessionId of dropped) await sendSessionEmails(db, { sessionId, change: "cancelled", includeClient: true });
  if (changes.length === 1) {
    const { sessionId, before } = changes[0]!;
    const after = (await db.select().from(engagementSessions).where(eq(engagementSessions.id, sessionId)).limit(1))[0]!;
    const change = sessionChange(before, after, now);
    if (change) await sendSessionEmails(db, { sessionId, change, includeClient: true, now });
  } else {
    await sendSeriesEmails(db, { engagementId: engagement.id, sessionIds: changes.map(item => item.sessionId), title: type.id === "other" ? input.title.trim() : type.label, now });
  }
  return { booked: changes.length, filled: changes.filter(item => item.before).length, cancelled: dropped.length } as const;
}

async function requireStaffSession(db: Pick<Database, "select">, actor: StaffActor, sessionId: number) {
  const session = (await db.select().from(engagementSessions).where(eq(engagementSessions.id, sessionId)).limit(1))[0];
  if (!session) throw notFound();
  await requireStaffEngagement(db, actor, session.engagementId);
  return session;
}

/** Saves the notes. Saving never shares: the client sees nothing until someone shares the client version. */
export async function saveSessionNotes(db: Database, actor: StaffActor, input: { sessionId: number; clientNotes: string | null; internalNotes: string | null }) {
  requireManage(actor);
  await requireStaffSession(db, actor, input.sessionId);
  await db.update(engagementSessions).set({ clientNotes: input.clientNotes, internalNotes: input.internalNotes }).where(eq(engagementSessions.id, input.sessionId));
  return { success: true } as const;
}

/** O3: analysts share notes. Shared with the owner by default; the owner (or the team) can widen it to their staff. */
export async function shareSessionNotes(db: Database, actor: StaffActor, input: { sessionId: number; audience: Exclude<EngagementAudience, "team"> }) {
  requireManage(actor);
  const session = await requireStaffSession(db, actor, input.sessionId);
  if (!session.clientNotes?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Write the client's version of the notes before sharing them." });
  await db.transaction(async tx => {
    await tx.update(engagementSessions).set({ notesAudience: input.audience, notesSharedAt: new Date(), notesSharedByUserId: actor.id }).where(eq(engagementSessions.id, session.id));
    await recordAudit(tx, { action: "engagement_notes_shared", actorUserId: actor.id, details: { engagementId: session.engagementId, sessionId: session.id, audience: input.audience } });
  });
  await notifyShared(db, session.engagementId, input.audience, "the Session notes", session.title);
  return { success: true } as const;
}

export type TaskInput = { engagementId: number; taskId?: number; kind: EngagementTaskKind; title: string; detail: string | null; side: EngagementTaskSide; assigneeUserId: number | null; dueOn: string | null; status: EngagementTaskStatus; statusNote: string | null; sessionId: number | null; weekNumber: number | null; sortOrder: number; factor: EngagementTaskFactor | null; section?: string | null; ref?: string | null; informs?: string | null; format?: string | null; priority?: EngagementTaskPriority | null };

export async function saveTask(db: Database, actor: StaffActor, input: TaskInput) {
  // A contributor (a Specialist) adds team-side items only, and changes nothing already there.
  if (!authorityAllows(actor.authority, "manage_engagements")) {
    if (!canContribute(actor)) requireManage(actor);
    if (input.taskId || input.side !== "ipf") throw new TRPCError({ code: "FORBIDDEN", message: "You can add team items to the Work Plan. The lead changes the rest." });
    if (input.assigneeUserId !== null && input.assigneeUserId !== actor.id) throw new TRPCError({ code: "FORBIDDEN", message: "Add the item for yourself; the lead assigns others." });
  }
  const engagement = await requireStaffEngagement(db, actor, input.engagementId);
  // Below the lead, a person changes only their own tasks (R86).
  if (input.taskId && !(await canReviewEngagement(db, actor, engagement.id))) await requireStaffTask(db, actor, input.taskId);
  if (input.assigneeUserId !== null) {
    const allowed = input.side === "client"
      ? engagement.businessId !== null && (await clientPeopleOf(db, engagement.businessId)).some(person => person.userId === input.assigneeUserId)
      : (await db.select({ userId: engagementTeam.userId }).from(engagementTeam).where(and(eq(engagementTeam.engagementId, engagement.id), eq(engagementTeam.userId, input.assigneeUserId))).limit(1)).length === 1;
    if (!allowed) throw new TRPCError({ code: "BAD_REQUEST", message: input.side === "client" ? "That person is not part of the client's business." : "That person is not on the engagement team." });
  }
  if (input.sessionId !== null && !(await db.select({ id: engagementSessions.id }).from(engagementSessions).where(and(eq(engagementSessions.id, input.sessionId), eq(engagementSessions.engagementId, engagement.id))).limit(1)).length) throw notFound();
  const finished = input.status === "accepted" || input.status === "done";
  const values = { kind: input.kind, title: input.title, detail: input.detail, side: input.side, assigneeUserId: input.assigneeUserId, dueOn: input.dueOn, status: input.status, statusNote: input.statusNote, sessionId: input.sessionId, weekNumber: input.weekNumber, sortOrder: input.sortOrder, factor: input.factor, section: input.section ?? null, ref: input.ref ?? null, informs: input.informs ?? null, format: input.format ?? null, priority: input.priority ?? null, completedAt: finished ? new Date() : null };
  if (input.taskId) {
    const before = (await db.select().from(engagementTasks).where(and(eq(engagementTasks.id, input.taskId), eq(engagementTasks.engagementId, engagement.id))).limit(1))[0];
    if (!before) throw notFound();
    // The team marking it received (sent on WhatsApp) starts its clock; asking for more stops it (R78).
    const arrival = arrivalFields({ ...before, side: input.side }, input.status);
    await db.update(engagementTasks).set({ ...values, ...arrival }).where(eq(engagementTasks.id, before.id));
    if (hasArrived(arrival)) await sendReceivedEmail(db, { taskId: before.id, actorUserId: actor.id, how: "recorded by the team" });
    return { taskId: input.taskId } as const;
  }
  const arrival = arrivalFields({ side: input.side, receivedAt: null, turnaround: null }, input.status);
  const [created] = await db.insert(engagementTasks).values({ engagementId: engagement.id, ...values, ...arrival, createdByUserId: actor.id }).returning({ id: engagementTasks.id });
  return { taskId: created.id } as const;
}

export type DataRequestItemInput = { section: string | null; ref: string | null; title: string; detail: string | null; informs: string | null; format: string | null; priority: EngagementTaskPriority | null; dueOn: string | null };

/**
 * Load a whole Data Request in one step (a template, or rows pasted from Excel): each item becomes a client-side Data
 * Request after the ones already there. An item already on the engagement (same title) is skipped, so loading twice adds
 * nothing. A missing date is set from the priority (high in four days, medium in six, low in seven).
 */
export async function loadDataRequest(db: Database, actor: StaffActor, input: { engagementId: number; items: DataRequestItemInput[]; today?: string }) {
  requireManage(actor);
  const engagement = await requireStaffEngagement(db, actor, input.engagementId);
  if (!input.items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "There is nothing to add." });
  const existing = await db.select({ title: engagementTasks.title, sortOrder: engagementTasks.sortOrder }).from(engagementTasks).where(eq(engagementTasks.engagementId, engagement.id));
  const seen = new Set(existing.map(row => row.title.trim().toLowerCase()));
  const today = input.today ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  let order = existing.reduce((max, row) => Math.max(max, row.sortOrder ?? 0), 0);
  const rows: (typeof engagementTasks.$inferInsert)[] = [];
  for (const item of input.items) {
    const key = item.title.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    order += 1;
    rows.push({
      engagementId: engagement.id, kind: "data_request" as const, side: "client" as const, title: item.title.trim().slice(0, 200), detail: item.detail, status: "open" as const,
      section: item.section, ref: item.ref, informs: item.informs, format: item.format, priority: item.priority,
      dueOn: item.dueOn ?? (item.priority ? addDays(today, DUE_DAYS[item.priority]) : null), weekNumber: 1, sortOrder: order, createdByUserId: actor.id,
    });
  }
  if (rows.length) {
    await db.transaction(async tx => {
      await tx.insert(engagementTasks).values(rows);
      await recordAudit(tx, { action: "engagement_data_request_loaded", actorUserId: actor.id, details: { engagementId: engagement.id, added: rows.length } });
    });
  }
  return { added: rows.length, skipped: input.items.length - rows.length } as const;
}

// ---- Asking the client, with a conversation on each item (R78) ------------------------------------------------------

export type AskInput = { engagementId: number; title: string; brief: string | null; dueOn: string; turnaround: EngagementTaskTurnaround | null; today?: string };

/**
 * A team member asks the client for what their work needs (R78, ET 11 November 2026): a client-side action with who
 * asked, a brief and the day it is due, and the owner is emailed. The day is never sooner than two days away. Each
 * person sends at most one request a week on an engagement, Monday to Sunday in Lagos, unless they approve on it, and
 * adds anything more to its conversation, so the client is not asked by everyone at once.
 */
export async function askClient(db: Database, actor: StaffActor, input: AskInput) {
  if (!canContribute(actor)) requireManage(actor);
  const engagement = await requireStaffEngagement(db, actor, input.engagementId);
  const businessName = await businessNameOf(db, engagement);
  if (engagement.opensOnPayment) throw new TRPCError({ code: "BAD_REQUEST", message: `${businessName}'s room opens once the first payment is made. Ask once it is open.` });
  const today = input.today ?? lagosDay();
  const earliest = earliestRequestDue(today);
  if (input.dueOn < earliest) throw new TRPCError({ code: "BAD_REQUEST", message: `Give ${businessName} at least two days: the earliest is ${dayInWords(earliest)}.` });
  if (input.dueOn > addDays(today, REQUEST_MAX_DAYS)) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a day in the next six months." });
  if (!(await canReviewEngagement(db, actor, engagement.id))) {
    const since = new Date(`${weekStartOf(today)}T00:00:00+01:00`);
    const asked = await db.select({ title: engagementTasks.title }).from(engagementTasks)
      .where(and(eq(engagementTasks.engagementId, engagement.id), eq(engagementTasks.requestedByUserId, actor.id), gte(engagementTasks.createdAt, since), ne(engagementTasks.status, "cancelled")))
      .orderBy(desc(engagementTasks.id));
    if (asked.length >= REQUESTS_PER_WEEK) {
      throw new TRPCError({ code: "CONFLICT", message: `You have asked ${businessName} once this week already ("${asked[0]!.title}"). Add this to its conversation, or ask the engagement's lead to send it.` });
    }
  }
  const orders = await db.select({ sortOrder: engagementTasks.sortOrder }).from(engagementTasks).where(eq(engagementTasks.engagementId, engagement.id));
  const sortOrder = Math.min(999, orders.reduce((max, row) => Math.max(max, row.sortOrder ?? 0), 0) + 1);
  // Its week in the Work Plan, counted from the start; the Work Plan runs to week 12.
  const weekNumber = engagement.startedOn
    ? Math.min(12, Math.max(1, Math.floor((Date.parse(`${input.dueOn}T12:00:00Z`) - Date.parse(`${engagement.startedOn}T12:00:00Z`)) / (7 * 86_400_000)) + 1))
    : null;
  const taskId = await db.transaction(async tx => {
    const [created] = await tx.insert(engagementTasks).values({
      engagementId: engagement.id, kind: "action", side: "client", title: input.title.trim(), detail: input.brief, dueOn: input.dueOn, status: "open",
      weekNumber, sortOrder, turnaround: input.turnaround, requestedByUserId: actor.id, createdByUserId: actor.id,
    }).returning({ id: engagementTasks.id });
    await recordAudit(tx, { action: "engagement_request_sent", actorUserId: actor.id, details: { engagementId: engagement.id, taskId: created.id, dueOn: input.dueOn, ...(input.turnaround ? { turnaround: input.turnaround } : {}) } });
    return created.id;
  });
  return { taskId, emailed: await sendRequestEmail(db, { taskId }) } as const;
}

/**
 * Who on the team may answer on a client's item: anyone who works on engagements, or the Specialist it goes to (the
 * person who asked for it; the Content Producer for footage). The lead answers the rest, so the client hears one voice.
 */
/** A client item this person may answer on and share the First edit of: theirs, or any when they lead (R78, R86). */
async function requireStaffClientItem(db: Pick<Database, "select">, actor: StaffActor, taskId: number) {
  const { task } = await requireStaffTask(db, actor, taskId);
  if (task.side !== "client") throw new TRPCError({ code: "BAD_REQUEST", message: "This is the team's own item: there is nothing to share with the client." });
  return task;
}

/** The team writes in an item's conversation; the owner, and the person in the business it is for, are emailed. */
export async function staffTaskComment(db: Database, actor: StaffActor, input: { taskId: number; body: string }) {
  const { task, team } = await requireStaffTask(db, actor, input.taskId);
  const body = input.body.trim();
  await db.insert(engagementTaskComments).values({ engagementId: task.engagementId, taskId: task.id, authorUserId: actor.id, body });
  // On the client's item the client hears; on a team item the conversation stays inside IP Factory, and its owner hears.
  const emailed = task.side === "client"
    ? await sendMessageEmails(db, { taskId: task.id, fromTeam: true, authorUserId: actor.id, body })
    : await sendTeamItemEmails(db, { taskId: task.id, authorUserId: actor.id, body, to: [task.assigneeUserId ?? task.createdByUserId].filter((id): id is number => id !== null) });
  // Whoever is tagged (@name) is emailed too, once (R86).
  const tagged = mentionedIn(body, team.map(member => ({ userId: member.userId, name: member.name ?? "" }))).map(member => member.userId).filter(id => id !== actor.id);
  const mentioned = tagged.length ? await sendMentionEmails(db, { taskId: task.id, authorUserId: actor.id, body, userIds: tagged }) : 0;
  return { success: true, emailed: emailed + mentioned, mentioned: tagged.length } as const;
}

/**
 * The owner of a team item hands it in (R86): it moves to Ready for review, and the engagement's lead (its Engagement
 * Manager or Lead Consultant, else the office) is emailed. The lead then marks it done or asks for more.
 */
export async function handInTask(db: Database, actor: StaffActor, input: { taskId: number }) {
  const { task } = await requireStaffTask(db, actor, input.taskId);
  if (task.side !== "ipf" || (task.assigneeUserId !== actor.id && task.createdByUserId !== actor.id)) throw new TRPCError({ code: "FORBIDDEN", message: "Only the person the item is for hands it in." });
  if (!OPEN_TASK_STATUSES.includes(task.status)) throw new TRPCError({ code: "CONFLICT", message: "This item is already handed in or done." });
  await db.update(engagementTasks).set({ status: "received" }).where(eq(engagementTasks.id, task.id));
  await recordAudit(db, { action: "engagement_task_handed_in", actorUserId: actor.id, details: { engagementId: task.engagementId, taskId: task.id } });
  return { success: true, emailed: await sendReadyForReviewEmails(db, { taskId: task.id, authorUserId: actor.id }) } as const;
}

/** The client writes in an item's conversation; the person on the team it goes to is emailed. */
export async function clientTaskComment(db: Database, session: AccountSession, input: { taskId: number; body: string }) {
  const task = (await db.select().from(engagementTasks).where(eq(engagementTasks.id, input.taskId)).limit(1))[0];
  if (!task) throw notFound();
  const { viewer } = await requireClientEngagement(db, session, task.engagementId);
  if (task.side !== "client" || task.status === "cancelled" || !clientCanSeeTask(task, viewer)) throw notFound();
  const body = input.body.trim();
  await db.insert(engagementTaskComments).values({ engagementId: task.engagementId, taskId: task.id, authorUserId: session.user.id, body });
  await sendMessageEmails(db, { taskId: task.id, fromTeam: false, authorUserId: session.user.id, body });
  return { success: true } as const;
}

/**
 * The First edit or draft is shared (R78): its clock stops, the time against the clock is recorded, and the owner is told
 * it waits for their approval. Only once what it needs has arrived, and only once.
 */
export async function followUpShared(db: Database, actor: StaffActor, input: { taskId: number }) {
  const task = await requireStaffClientItem(db, actor, input.taskId);
  if (!task.turnaround) throw new TRPCError({ code: "BAD_REQUEST", message: "This item has no First edit or draft to share." });
  if (!task.receivedAt) throw new TRPCError({ code: "CONFLICT", message: "It has not arrived yet: the clock starts when it does." });
  const label = TURNAROUND_LABELS[task.turnaround];
  const now = new Date();
  const late = task.followUpDueAt !== null && now.getTime() > task.followUpDueAt.getTime();
  const shared = await db.transaction(async tx => {
    const updated = await tx.update(engagementTasks).set({ followUpDoneAt: now }).where(and(eq(engagementTasks.id, task.id), isNull(engagementTasks.followUpDoneAt))).returning({ id: engagementTasks.id });
    if (updated.length) await recordAudit(tx, { action: "engagement_follow_up_shared", actorUserId: actor.id, details: { engagementId: task.engagementId, taskId: task.id, turnaround: task.turnaround, late } });
    return updated.length > 0;
  });
  if (!shared) throw new TRPCError({ code: "CONFLICT", message: `The ${label.toLowerCase()} is already shared.` });
  return { success: true, late, emailed: await sendReadyEmail(db, { taskId: task.id }) } as const;
}

/** The conversation on each of an engagement's items, oldest first, with who wrote and whether they are the client. */
async function taskCommentsOf(db: Pick<Database, "select">, engagementId: number) {
  const rows = await db.select({
    id: engagementTaskComments.id, taskId: engagementTaskComments.taskId, body: engagementTaskComments.body, createdAt: engagementTaskComments.createdAt,
    authorUserId: engagementTaskComments.authorUserId, authorName: users.name, membershipId: businessMemberships.id,
  }).from(engagementTaskComments)
    .innerJoin(users, eq(engagementTaskComments.authorUserId, users.id))
    .innerJoin(engagements, eq(engagementTaskComments.engagementId, engagements.id))
    .leftJoin(businessMemberships, and(eq(businessMemberships.userId, engagementTaskComments.authorUserId), eq(businessMemberships.businessId, engagements.businessId)))
    .where(eq(engagementTaskComments.engagementId, engagementId)).orderBy(asc(engagementTaskComments.id));
  return rows.map(({ membershipId, ...row }) => ({ ...row, authorName: row.authorName ?? "", fromClient: membershipId !== null }));
}

export type DeliverableInput = { engagementId: number; deliverableId?: number; kind: EngagementDeliverableKind; title: string; summary: string | null };

/** A deliverable is a draft until shared; editing a shared one takes it back to draft so it is reviewed again. */
export async function saveDeliverable(db: Database, actor: StaffActor, input: DeliverableInput) {
  requireManage(actor);
  await requireStaffEngagement(db, actor, input.engagementId);
  const values = { kind: input.kind, title: input.title, summary: input.summary };
  if (input.deliverableId) {
    const updated = await db.update(engagementDeliverables)
      .set({ ...values, status: "draft", approvedAt: null, approvedByUserId: null, sharedAt: null, sharedByUserId: null, clientAcceptedAt: null, clientAcceptedByUserId: null })
      .where(and(eq(engagementDeliverables.id, input.deliverableId), eq(engagementDeliverables.engagementId, input.engagementId))).returning({ id: engagementDeliverables.id });
    if (!updated.length) throw notFound();
    return { deliverableId: input.deliverableId } as const;
  }
  const [created] = await db.insert(engagementDeliverables).values({ engagementId: input.engagementId, ...values, createdByUserId: actor.id }).returning({ id: engagementDeliverables.id });
  return { deliverableId: created.id } as const;
}

async function requireStaffDeliverable(db: Pick<Database, "select">, actor: StaffActor, deliverableId: number) {
  const deliverable = (await db.select().from(engagementDeliverables).where(eq(engagementDeliverables.id, deliverableId)).limit(1))[0];
  if (!deliverable) throw notFound();
  await requireStaffEngagement(db, actor, deliverable.engagementId);
  return deliverable;
}

/** Approval on one engagement: review_engagements across the firm, or leading this engagement (ENGAGEMENT_REVIEW_ROLES). */
export async function canReviewEngagement(db: Pick<Database, "select">, actor: StaffActor, engagementId: number) {
  if (authorityAllows(actor.authority, "review_engagements")) return true;
  const mine = (await db.select({ role: engagementTeam.role }).from(engagementTeam).where(and(eq(engagementTeam.engagementId, engagementId), eq(engagementTeam.userId, actor.id))).limit(1))[0];
  return Boolean(mine && ENGAGEMENT_REVIEW_ROLES.includes(mine.role));
}

/** A Partner, Vice President or Senior Associate, or the engagement's own Engagement Manager or Lead Consultant, approves a prescription or plan. */
export async function approveDeliverable(db: Database, actor: StaffActor, input: { deliverableId: number }) {
  const deliverable = await requireStaffDeliverable(db, actor, input.deliverableId);
  if (!(await canReviewEngagement(db, actor, deliverable.engagementId))) throw new TRPCError({ code: "FORBIDDEN", message: "Only a Partner, Vice President or Senior Associate, or this engagement's Engagement Manager or Lead Consultant, can approve this." });
  if (deliverable.status === "shared") throw new TRPCError({ code: "CONFLICT", message: "This is already shared." });
  await db.transaction(async tx => {
    await tx.update(engagementDeliverables).set({ status: "approved", approvedAt: new Date(), approvedByUserId: actor.id }).where(eq(engagementDeliverables.id, deliverable.id));
    await recordAudit(tx, { action: "engagement_deliverable_approved", actorUserId: actor.id, details: { engagementId: deliverable.engagementId, deliverableId: deliverable.id, kind: deliverable.kind } });
  });
  return { success: true } as const;
}

/** Shares a deliverable with the client. A prescription or plan must be approved first (O3). */
export async function shareDeliverable(db: Database, actor: StaffActor, input: { deliverableId: number; audience: Exclude<EngagementAudience, "team"> }) {
  requireManage(actor);
  const deliverable = await requireStaffDeliverable(db, actor, input.deliverableId);
  if (DELIVERABLES_NEEDING_APPROVAL.includes(deliverable.kind) && deliverable.status !== "approved" && deliverable.status !== "shared") {
    throw new TRPCError({ code: "FORBIDDEN", message: `Every ${ENGAGEMENT_DELIVERABLE_KIND_LABELS[deliverable.kind]} is approved before the client sees it, by a Partner, Vice President or Senior Associate, or this engagement's lead.` });
  }
  await db.transaction(async tx => {
    await tx.update(engagementDeliverables).set({ status: "shared", audience: input.audience, sharedAt: new Date(), sharedByUserId: actor.id }).where(eq(engagementDeliverables.id, deliverable.id));
    await recordAudit(tx, { action: "engagement_deliverable_shared", actorUserId: actor.id, details: { engagementId: deliverable.engagementId, deliverableId: deliverable.id, kind: deliverable.kind, audience: input.audience } });
  });
  await notifyShared(db, deliverable.engagementId, input.audience, `your ${ENGAGEMENT_DELIVERABLE_KIND_LABELS[deliverable.kind]}`, deliverable.title);
  // Sharing a service's main output is its delivery: the second half falls due seven days later (R36). The share has
  // happened by now, so a failure here is logged rather than reported as a failed share; the lead can date it in Fees.
  const engagement = (await db.select({ type: engagements.type }).from(engagements).where(eq(engagements.id, deliverable.engagementId)).limit(1))[0];
  const balancesDated = engagement && isDelivery(engagement.type, deliverable.kind)
    ? await dateBalancesOnDelivery(db, { engagementId: deliverable.engagementId, deliverable: ENGAGEMENT_DELIVERABLE_KIND_LABELS[deliverable.kind], actorUserId: actor.id })
      .catch((error: unknown) => { console.error("[Engagement] The second half was not dated on delivery:", error instanceof Error ? error.message : "unknown error"); return 0; })
    : 0;
  return { success: true, balancesDated } as const;
}

export async function staffComment(db: Database, actor: StaffActor, input: { deliverableId: number; body: string }) {
  const deliverable = await requireStaffDeliverable(db, actor, input.deliverableId);
  await db.insert(engagementComments).values({ engagementId: deliverable.engagementId, deliverableId: deliverable.id, authorUserId: actor.id, body: input.body });
  return { success: true } as const;
}

// ---- The client's side ---------------------------------------------------------------------------------------------

/** The viewer's relation to the business: owner-level (owner, business admin) or a member with an access level. */
export async function clientViewerFor(db: Pick<Database, "select">, session: Pick<AccountSession, "user" | "memberships">, businessId: number): Promise<ClientViewer> {
  const membership = session.memberships.find(item => item.businessId === businessId);
  if (!membership) throw notFound();
  if (membership.role !== "member") return { kind: "owner" };
  const access = (await db.select({ access: businessMemberAccess.access }).from(businessMemberAccess)
    .innerJoin(businessMemberships, eq(businessMemberAccess.membershipId, businessMemberships.id))
    .where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.userId, session.user.id))).limit(1))[0];
  return { kind: "member", access: access?.access ?? "full", userId: session.user.id };
}

/** The client's engagement in the business they are working in, or null. Only what this viewer may see leaves the server. */
/** When each engagement last asked Calendly, so a busy room does not ask on every request. */
const lastSessionSync = new Map<number, number>();
const SESSION_SYNC_INTERVAL_MS = 15_000;

/** Forgets when engagements were last synced (tests). */
export function resetSessionSyncForTests() {
  lastSessionSync.clear();
}

/**
 * Copies the owner's Calendly bookings onto the Business Review Sessions still waiting for a time, in order:
 * the first booking fills Session 1, the next Session 2. A booking whose time is already on a Session is skipped, and
 * a Session the team has already timed is left alone. Records the time, the length and the meeting link, and audits it
 * as the system (Calendly), not a person. Quietly does nothing without the Calendly settings.
 */
export async function syncSessionBookings(db: Pick<Database, "select" | "update" | "insert">, engagement: { id: number; createdAt: Date }, inviteeEmail: string, now = Date.now()) {
  if (!isSessionBookingConfigured() || !inviteeEmail) return 0;
  if (now - (lastSessionSync.get(engagement.id) ?? 0) < SESSION_SYNC_INTERVAL_MS) return 0;
  lastSessionSync.set(engagement.id, now);
  const sessions = await db.select().from(engagementSessions)
    .where(and(eq(engagementSessions.engagementId, engagement.id), eq(engagementSessions.kind, "assessment_call")))
    .orderBy(asc(engagementSessions.weekNumber), asc(engagementSessions.sortOrder), asc(engagementSessions.id));
  const waiting = sessions.filter(item => item.status === "planned" && !item.scheduledFor);
  if (!waiting.length) return 0;
  const timed = new Set(sessions.filter(item => item.scheduledFor).map(item => item.scheduledFor!.getTime()));
  const since = new Date(engagement.createdAt.getTime() - 86_400_000);
  const bookings = (await findSessionBookings(inviteeEmail, since)).filter(booking => !timed.has(booking.start.getTime()));
  let recorded = 0;
  for (let index = 0; index < waiting.length; index++) {
    const session = waiting[index];
    const booking = bookings[index];
    if (!booking) break;
    const minutes = booking.end ? Math.round((booking.end.getTime() - booking.start.getTime()) / 60_000) : null;
    const booked = await db.update(engagementSessions).set({
      scheduledFor: booking.start,
      ...(minutes && minutes > 0 ? { durationMinutes: minutes } : {}),
      ...(booking.joinUrl && !session.meetingLink ? { meetingLink: booking.joinUrl } : {}),
    }).where(and(eq(engagementSessions.id, session.id), isNull(engagementSessions.scheduledFor))).returning({ id: engagementSessions.id });
    await recordAudit(db, { action: "engagement_session_booked", actorUserId: null, details: { engagementId: engagement.id, sessionId: session.id, via: "calendly", scheduledFor: booking.start.toISOString() } });
    // The team hears of it with a calendar invitation; the client booked it on Calendly, which has emailed them (R75).
    if (booked.length && booking.start.getTime() > now) await sendSessionEmails(db, { sessionId: session.id, change: "booked", includeClient: false, now });
    recorded += 1;
  }
  return recorded;
}

function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** What the client room's Founder and Business tabs show: the delivered Full Report, else the Business Health Check result. */
async function insightFor(db: Database, businessCheckId: number, reportDelivered: boolean) {
  const report = reportDelivered ? await reportForCheck(db, businessCheckId) : null;
  if (report) return roomInsight({ report, result: null });
  const check = (await db.select({ answersJson: businessChecks.answersJson, resultJson: businessChecks.resultJson }).from(businessChecks).where(eq(businessChecks.id, businessCheckId)).limit(1))[0];
  if (!check) return null;
  const answers = parseJson<Answers>(check.answersJson);
  // The result the owner saw; an older stored shape is worked out again from their answers.
  const stored = parseJson<CheckResult>(check.resultJson);
  const result = stored && Array.isArray(stored.outline) && stored.founder ? stored : answers ? evaluate(answers) : null;
  return roomInsight({ report: null, result });
}

/** "Book Session N": the first Business Review Session still without a time, for the owner only. */
function bookingFor(sessions: (typeof engagementSessions.$inferSelect)[], viewer: { kind: string }, owner: { email: string; fullName: string } | null) {
  if (viewer.kind !== "owner" || !owner) return null;
  const nextToBook = sessions
    .filter(item => item.kind === "assessment_call" && item.status === "planned" && !item.scheduledFor)
    .sort((a, b) => (a.weekNumber ?? 99) - (b.weekNumber ?? 99) || a.sortOrder - b.sortOrder || a.id - b.id)[0];
  const url = nextToBook ? sessionBookingUrl({ name: owner.fullName, email: owner.email }) : null;
  return nextToBook && url ? { sessionId: nextToBook.id, title: nextToBook.title, url } : null;
}

/**
 * The client's room for one of their business's engagements (a client may have several: a Business Review, then a
 * Pitch Deck). Without a choice, the newest one still open, else the newest. An id from another business is not found.
 */
export async function getClientRoom(db: Database, session: AccountSession, engagementId?: number | null) {
  const business = session.activeBusiness;
  if (!business) return null;
  const all = await db.select().from(engagements).where(eq(engagements.businessId, business.businessId)).orderBy(desc(engagements.id));
  if (engagementId && !all.some(row => row.id === engagementId)) throw notFound();
  const engagement = engagementId ? all.find(row => row.id === engagementId) : all.find(row => row.stage !== "closed") ?? all[0];
  if (!engagement) return null;
  const viewer = await clientViewerFor(db, session, business.businessId);
  return buildClientRoom(db, engagement, viewer, session.user.id, business.businessName);
}

/**
 * Preview as client: the room of one engagement exactly as its owner sees it, for the team, read-only. The owner's own
 * account decides what is "theirs"; without one yet, the owner view is shown as it will be. Every preview is logged.
 */
/**
 * Preview as client is for those who lead, manage or review engagements (the desk, Analysts, Partners, the Super
 * Admin), never a Specialist: the client's room holds the owner's whole account of their business (ET, 13 November 2026).
 */
export const canPreviewAsClient = (actor: StaffActor) => authorityAllows(actor.authority, "manage_engagements") || authorityAllows(actor.authority, "review_engagements");

export async function previewClientRoom(db: Database, actor: StaffActor, input: { engagementId: number }) {
  const engagement = await requireStaffEngagement(db, actor, input.engagementId);
  if (!canPreviewAsClient(actor)) throw new TRPCError({ code: "FORBIDDEN", message: "Preview as client is for the engagement's lead and the desk, not Specialists." });
  const owner = engagement.businessId === null ? undefined : (await db.select({ userId: businessMemberships.userId }).from(businessMemberships)
    .where(and(eq(businessMemberships.businessId, engagement.businessId), eq(businessMemberships.role, "owner"), eq(businessMemberships.status, "active"))).limit(1))[0];
  const business = engagement.businessId === null ? undefined : (await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, engagement.businessId)).limit(1))[0];
  const check = engagement.businessCheckId === null ? undefined : (await db.select({ businessName: businessChecks.businessName, fullName: businessChecks.fullName }).from(businessChecks).where(eq(businessChecks.id, engagement.businessCheckId)).limit(1))[0];
  const businessName = business?.name ?? check?.businessName ?? check?.fullName ?? engagement.contactName ?? "";
  await recordAudit(db, { action: "engagement_room_previewed", actorUserId: actor.id, details: { engagementId: engagement.id } });
  return buildClientRoom(db, engagement, { kind: "owner" } as ClientViewer, owner?.userId ?? 0, businessName);
}

async function buildClientRoom(db: Database, engagement: typeof engagements.$inferSelect, viewer: ClientViewer, viewerUserId: number, businessName: string) {
  // Sessions the owner booked on Calendly since the last visit appear with their time before anything is read.
  const owner = engagement.businessCheckId !== null
    ? (await db.select({ email: businessChecks.email, fullName: businessChecks.fullName }).from(businessChecks).where(eq(businessChecks.id, engagement.businessCheckId)).limit(1))[0]
    : engagement.contactEmail ? { email: engagement.contactEmail, fullName: engagement.contactName ?? "" } : undefined;
  if (owner) await syncSessionBookings(db, engagement, owner.email);
  const [team, sessions, tasks, deliverables, comments, files, measure, checkins, matches] = await Promise.all([
    db.select({ userId: engagementTeam.userId, name: users.name, role: engagementTeam.role, jobTitle: users.jobTitle, whatsapp: users.whatsapp, whatsappConsentAt: users.whatsappConsentAt }).from(engagementTeam).innerJoin(users, eq(engagementTeam.userId, users.id)).where(eq(engagementTeam.engagementId, engagement.id)).orderBy(asc(engagementTeam.id)),
    db.select().from(engagementSessions).where(eq(engagementSessions.engagementId, engagement.id)).orderBy(asc(engagementSessions.id)),
    db.select().from(engagementTasks).where(eq(engagementTasks.engagementId, engagement.id)).orderBy(asc(engagementTasks.id)),
    db.select().from(engagementDeliverables).where(and(eq(engagementDeliverables.engagementId, engagement.id), eq(engagementDeliverables.status, "shared"))).orderBy(asc(engagementDeliverables.id)),
    db.select({ deliverableId: engagementComments.deliverableId, body: engagementComments.body, createdAt: engagementComments.createdAt, authorName: users.name })
      .from(engagementComments).innerJoin(users, eq(engagementComments.authorUserId, users.id)).where(eq(engagementComments.engagementId, engagement.id)).orderBy(asc(engagementComments.id)),
    filesOf(db, engagement.id),
    measureOf(db, engagement.id),
    checkinsOf(db, engagement.id),
    matchesOf(db, engagement.id),
  ]);
  const [itemComments, askers] = await Promise.all([taskCommentsOf(db, engagement.id), namesOf(db, tasks.map(task => task.requestedByUserId))]);
  const assigneeIds = Array.from(new Set(tasks.map(task => task.assigneeUserId).filter((value): value is number => value !== null)));
  const assigneeNames = new Map((assigneeIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, assigneeIds)) : []).map(row => [row.id, row.name ?? ""]));
  const fullView = viewer.kind === "owner" || viewer.access === "full";
  // The business's other engagements, newest first: the room lists them, and a later one (a Pitch Deck after the Business
  // Review) still shows what the Business Health Check found.
  const projects = engagement.businessId === null ? [engagement] : await db.select().from(engagements).where(eq(engagements.businessId, engagement.businessId)).orderBy(desc(engagements.id));
  // Where the engagement came from: the check's main finding and readiness, and the Discovery Call once the team shares it.
  const checkId = engagement.businessCheckId ?? projects.find(row => row.businessCheckId !== null)?.businessCheckId ?? null;
  const check = checkId === null ? undefined : (await db.select({ primaryArea: businessChecks.primaryArea, readiness: businessChecks.readiness, completedAt: businessChecks.completedAt, reportRequestedAt: businessChecks.reportRequestedAt, callRequestedAt: businessChecks.callRequestedAt, callScheduledFor: businessChecks.callScheduledFor })
    .from(businessChecks).where(eq(businessChecks.id, checkId)).limit(1))[0];
  const report = checkId === null ? null : (await db.select({ deliveredAt: fullReports.deliveredAt, createdAt: fullReports.createdAt }).from(fullReports).where(eq(fullReports.businessCheckId, checkId)).limit(1))[0] ?? null;
  const debrief = fullView && checkId !== null ? await sharedDebriefFor(db, checkId) : null;
  // The Founder and Business tabs: the owner's own Full Report or Business Health Check, never shown to limited-access staff.
  const insight = fullView && checkId !== null ? await insightFor(db, checkId, Boolean(report?.deliveredAt)) : null;
  const visibleDeliverables = deliverables.filter(item => clientCanSee(item.audience, viewer));
  const matchedTo = (fileId: number) => matches.filter(match => match.fileId === fileId).map(match => match.taskId);
  const clientFiles = (where: "taskId" | "deliverableId", id: number) => files
    .filter(file => (file[where] === id || (where === "taskId" && matchedTo(file.id).includes(id))) && clientFileVisible(file, viewer, viewerUserId))
    .map(file => ({ id: file.id, fileName: file.fileName, sizeBytes: file.sizeBytes, createdAt: file.createdAt, mine: file.uploadedByUserId === viewerUserId, fromTeam: file.fromTeam }));
  const now = Date.now();
  // Only booked Sessions reach the client (R81): the plan's Sessions without a time are the team's guide, except the
  // Business Review Session the owner books on Calendly themselves.
  const booking = bookingFor(sessions, viewer, owner ?? null);
  const scheduled = sessions.filter(item => item.status !== "cancelled" && (item.scheduledFor !== null || item.id === booking?.sessionId));
  const next = scheduled.filter(item => item.status === "planned" && item.scheduledFor && item.scheduledFor.getTime() >= now).sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime())[0];
  const notesVisible = (item: (typeof sessions)[number]) => Boolean(item.notesSharedAt && item.clientNotes && clientCanSee(item.notesAudience, viewer));
  const roomFees = await clientFees(db, engagement.id);
  // Late, then paused seven days after a missed date (D6). Everyone in the room sees that work is paused; the fee and
  // its pay link are for the owner and full-access staff. Not while the room waits for its first payment: that shows the fee.
  const held = engagement.opensOnPayment ? null : feeHold(roomFees, lagosDay());
  return {
    engagementId: engagement.id,
    /** The engagement's fees, each with its status and pay link while unpaid: for the owner and full-access staff. */
    fees: fullView ? roomFees : [],
    // What to pay to continue: what is left on the late fee.
    hold: held ? { state: held.state, pausesOn: held.pausesOn, dueOn: held.fee.dueOn, ...(fullView ? { label: held.fee.label, amount: held.fee.left, payPath: held.fee.payPath } : {}) } : null,
    /** Waiting for its first payment (R11): the room shows only the fee to pay until one is paid. */
    awaitingPayment: engagement.opensOnPayment,
    // The content board (Digital marketing): the owner and full-access staff see it and approve.
    content: fullView ? (await contentOf(db, engagement.id)).map(clientContent) : [],
    contentTargets: DATED_TYPES[engagement.type]?.monthly ?? [],
    type: engagement.type,
    typeLabel: ENGAGEMENT_TYPE_LABELS[engagement.type],
    /** The service bought, for a service engagement, and the engagement's name for people. */
    service: engagement.service,
    title: engagementTitle(engagement.type, engagement.service),
    /** Where a service engagement stands, read from its work (1 to 4 of SERVICE_STEPS); null for the other types. */
    serviceStep: SERVICE_TYPES[engagement.type] && !STAGED_TYPES.includes(engagement.type) ? serviceStep({
      recordsOpen: tasks.filter(task => task.side === "client" && task.kind === "data_request" && OPEN_TASK_STATUSES.includes(task.status)).length,
      shared: visibleDeliverables.length, accepted: visibleDeliverables.filter(item => item.clientAcceptedAt !== null).length, closed: engagement.stage === "closed",
    }) : null,
    /** Every engagement of the business, newest first, to move between them. */
    projects: projects.map(row => ({ id: row.id, title: engagementTitle(row.type, row.service), stageLabel: engagementStageLabel(row, now), closed: row.stage === "closed", current: row.id === engagement.id })),
    /** "Fix the next problem": what the business has asked for that the desk has not handled yet. */
    requests: engagement.businessId === null ? [] : (await db.select({ id: serviceRequests.id, service: serviceRequests.service, createdAt: serviceRequests.createdAt }).from(serviceRequests)
      .where(and(eq(serviceRequests.businessId, engagement.businessId), eq(serviceRequests.status, "open"))).orderBy(desc(serviceRequests.id)))
      .map(row => ({ ...row, serviceName: PRODUCTS.find(product => product.id === row.service)?.name ?? row.service })),
    startedOn: engagement.startedOn,
    uploadsEnabled: isFileStorageConfigured(),
    businessName: businessName,
    viewer: viewer.kind === "owner" ? { kind: "owner" as const } : { kind: "member" as const, access: viewer.access },
    stage: engagement.stage,
    stageLabel: engagementStageLabel(engagement, Date.now()),
    journey: journeyOf(engagement.stage),
    assessmentStartedAt: engagement.assessmentStartedAt,
    fixStartedAt: engagement.fixStartedAt,
    closedAt: engagement.closedAt,
    createdAt: engagement.createdAt,
    check: check ? { primaryArea: check.primaryArea, readiness: check.readiness, completedAt: check.completedAt, reportRequestedAt: check.reportRequestedAt, callRequestedAt: check.callRequestedAt, callScheduledFor: check.callScheduledFor } : null,
    report: report ? { requestedAt: report.createdAt, deliveredAt: report.deliveredAt } : null,
    debrief,
    insight,
    problemStatement: fullView ? engagement.problemStatement : null,
    // The one number: the business's own result, so the owner and their full-access staff; never the hours behind it.
    measure: measure && (viewer.kind === "owner" || viewer.access === "full") ? clientMeasure(measure, checkins) : null,
    // Who runs it first (partner, Engagement Manager, Lead Consultant), then analysts and specialists; each with their firm title.
    // A WhatsApp number only when its owner agreed to clients seeing it (R44, K11); never their email.
    team: [...team].sort((a, b) => ENGAGEMENT_TEAM_ROLE_ORDER[a.role] - ENGAGEMENT_TEAM_ROLE_ORDER[b.role])
      .map(member => ({ name: member.name ?? "", roleLabel: ENGAGEMENT_TEAM_ROLE_LABELS[member.role], jobTitle: member.jobTitle ?? null, whatsapp: agreedWhatsapp(member) })),
    // The client's own people on the engagement, owner first, with what each can see. Names only: no email or phone.
    people: (await clientPeopleOf(db, engagement.businessId!)).map(person => ({
      name: person.name, you: person.userId === viewerUserId,
      label: person.role === "owner" ? "Owner" : person.role === "business_admin" ? "Administrator" : `${CLIENT_ACCESS_LABELS[person.access as ClientAccessLevel].name} access`,
    })),
    nextSession: next ? { id: next.id, title: next.title, scheduledFor: next.scheduledFor, durationMinutes: next.durationMinutes, meetingLink: next.meetingLink } : null,
    // The owner books the Business Review Sessions on Calendly, in order, with their details filled in.
    booking,
    sessions: scheduled.map(item => ({
      id: item.id,
      title: item.title,
      scheduledFor: item.scheduledFor,
      durationMinutes: item.durationMinutes,
      meetingLink: item.meetingLink,
      status: item.status,
      weekNumber: item.weekNumber,
      sortOrder: item.sortOrder,
      agenda: item.agenda,
      notes: notesVisible(item) ? item.clientNotes : null,
      notesSharedAt: notesVisible(item) ? item.notesSharedAt : null,
      notesAudience: notesVisible(item) ? item.notesAudience : null,
    })),
    tasks: tasks.filter(task => task.status !== "cancelled" && clientCanSeeTask(task, viewer)).map(task => ({
      // Who it is with, by name, for the initials in the List: the person named on it, or null for the business or the team.
      assigneeName: task.assigneeUserId ? assigneeNames.get(task.assigneeUserId) ?? null : null,
      id: task.id, kind: task.kind, side: task.side, title: task.title, detail: task.detail, dueOn: task.dueOn, status: task.status, statusLabel: ENGAGEMENT_TASK_STATUS_LABELS[task.status], statusNote: task.statusNote, mine: task.assigneeUserId === viewerUserId,
      weekNumber: task.weekNumber, sortOrder: task.sortOrder, factor: task.factor,
      section: task.section, ref: task.ref, informs: task.informs, format: task.format, priority: task.priority,
      responseLink: task.responseLink,
      // Who on the team receives it on WhatsApp: the person who asked, or the engagement's main contact (R44).
      sendTo: task.side === "client" ? recipientOf(team, task.requestedByUserId ?? task.createdByUserId) : null,
      files: clientFiles("taskId", task.id),
      // Asking the client (R78): who asked, whom a message reaches, the conversation, and when the First edit follows.
      askedBy: task.requestedByUserId === null ? null : askers.get(task.requestedByUserId) ?? "",
      writeTo: task.side === "client" ? followUpOwnerOf(team, task)?.name ?? null : null,
      turnaround: task.turnaround, receivedAt: task.receivedAt, followUpDueAt: task.followUpDueAt, followUpDoneAt: task.followUpDoneAt,
      comments: task.side === "client" ? itemComments.filter(comment => comment.taskId === task.id)
        .map(comment => ({ id: comment.id, body: comment.body, createdAt: comment.createdAt, authorName: comment.authorName, fromTeam: !comment.fromClient, mine: comment.authorUserId === viewerUserId })) : [],
    })),
    // What the client's side dropped into the room, newest first, and which visible requests each file was matched to.
    sentFiles: files.filter(file => file.taskId === null && file.deliverableId === null && !file.fromTeam && clientFileVisible(file, viewer, viewerUserId))
      .map(file => ({ id: file.id, fileName: file.fileName, sizeBytes: file.sizeBytes, createdAt: file.createdAt, mine: file.uploadedByUserId === viewerUserId, note: file.note,
        matchedTo: tasks.filter(task => matchedTo(file.id).includes(task.id) && task.status !== "cancelled" && clientCanSeeTask(task, viewer)).map(task => ({ taskId: task.id, ref: task.ref, title: task.title })) }))
      .sort((a, b) => b.id - a.id),
    deliverables: visibleDeliverables.map(item => ({
      id: item.id, kind: item.kind, kindLabel: ENGAGEMENT_DELIVERABLE_KIND_LABELS[item.kind], title: item.title, summary: item.summary, sharedAt: item.sharedAt, audience: item.audience, audienceLabel: ENGAGEMENT_AUDIENCE_LABELS[item.audience], accepted: item.clientAcceptedAt !== null,
      files: clientFiles("deliverableId", item.id),
      comments: comments.filter(comment => comment.deliverableId === item.id).map(comment => ({ body: comment.body, createdAt: comment.createdAt, authorName: comment.authorName ?? "" })),
    })),
  };
}

/** The client's engagement for a task, deliverable or session id, checked against their active business. */
async function requireClientEngagement(db: Pick<Database, "select">, session: AccountSession, engagementId: number) {
  const business = session.activeBusiness;
  if (!business) throw notFound();
  const engagement = (await db.select().from(engagements).where(and(eq(engagements.id, engagementId), eq(engagements.businessId, business.businessId))).limit(1))[0];
  if (!engagement || engagement.businessId === null) throw notFound();
  return { engagement, viewer: await clientViewerFor(db, session, engagement.businessId) };
}

/** The client says they sent a data request ("received" until we check it) or finished an action. */
export async function respondToTask(db: Database, session: AccountSession, input: { taskId: number; note: string | null }) {
  const task = (await db.select().from(engagementTasks).where(eq(engagementTasks.id, input.taskId)).limit(1))[0];
  if (!task) throw notFound();
  const { viewer } = await requireClientEngagement(db, session, task.engagementId);
  if (task.side !== "client" || !clientCanSeeTask(task, viewer)) throw notFound();
  if (task.status !== "open" && task.status !== "needs_more") throw new TRPCError({ code: "CONFLICT", message: "This is already with us." });
  const status: EngagementTaskStatus = task.kind === "data_request" ? "received" : "done";
  const arrival = arrivalFields(task, status);
  await db.transaction(async tx => {
    await tx.update(engagementTasks).set({ status, statusNote: input.note, completedAt: status === "done" ? new Date() : null, ...arrival }).where(eq(engagementTasks.id, task.id));
    await recordAudit(tx, { action: "engagement_task_answered", actorUserId: session.user.id, details: { engagementId: task.engagementId, taskId: task.id, status } });
  });
  if (hasArrived(arrival)) await sendReceivedEmail(db, { taskId: task.id, actorUserId: session.user.id, how: status === "done" ? "marked done in the room" : "marked sent in the room" });
  return { success: true, status } as const;
}

/**
 * The client answers an item with a link to a shared folder (footage, records too large to upload): the team opens it
 * from the item. Nothing is stored but the link (R43). A Data Request becomes "Sent, we are checking"; an action is done.
 */
export async function answerWithLink(db: Database, session: AccountSession, input: { taskId: number; url: string }) {
  const link = cleanResponseLink(input.url);
  if (!link) throw new TRPCError({ code: "BAD_REQUEST", message: "Paste the full link to the folder, starting with https://." });
  const task = (await db.select().from(engagementTasks).where(eq(engagementTasks.id, input.taskId)).limit(1))[0];
  if (!task) throw notFound();
  const { viewer } = await requireClientEngagement(db, session, task.engagementId);
  if (task.side !== "client" || !clientCanSeeTask(task, viewer)) throw notFound();
  if (task.status !== "open" && task.status !== "needs_more") throw new TRPCError({ code: "CONFLICT", message: "This is already with us." });
  const status: EngagementTaskStatus = task.kind === "data_request" ? "received" : "done";
  const arrival = arrivalFields(task, status);
  await db.transaction(async tx => {
    await tx.update(engagementTasks).set({ status, responseLink: link, statusNote: "Sent a link to a folder", completedAt: status === "done" ? new Date() : null, ...arrival }).where(eq(engagementTasks.id, task.id));
    await recordAudit(tx, { action: "engagement_task_answered", actorUserId: session.user.id, details: { engagementId: task.engagementId, taskId: task.id, status, via: "link" } });
  });
  if (hasArrived(arrival)) await sendReceivedEmail(db, { taskId: task.id, actorUserId: session.user.id, how: "a link to a shared folder" });
  return { success: true, status } as const;
}

async function requireClientDeliverable(db: Pick<Database, "select">, session: AccountSession, deliverableId: number) {
  const deliverable = (await db.select().from(engagementDeliverables).where(eq(engagementDeliverables.id, deliverableId)).limit(1))[0];
  if (!deliverable || deliverable.status !== "shared") throw notFound();
  const { viewer } = await requireClientEngagement(db, session, deliverable.engagementId);
  if (!clientCanSee(deliverable.audience, viewer)) throw notFound();
  return { deliverable, viewer };
}

export async function clientComment(db: Database, session: AccountSession, input: { deliverableId: number; body: string }) {
  const { deliverable } = await requireClientDeliverable(db, session, input.deliverableId);
  await db.insert(engagementComments).values({ engagementId: deliverable.engagementId, deliverableId: deliverable.id, authorUserId: session.user.id, body: input.body });
  return { success: true } as const;
}

/** The owner's sign-off on a deliverable. Only owner-level people sign off. */
export async function acceptDeliverable(db: Database, session: AccountSession, input: { deliverableId: number }) {
  const { deliverable, viewer } = await requireClientDeliverable(db, session, input.deliverableId);
  if (viewer.kind !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can sign this off." });
  if (deliverable.clientAcceptedAt) return { success: true, changed: false } as const;
  await db.transaction(async tx => {
    await tx.update(engagementDeliverables).set({ clientAcceptedAt: new Date(), clientAcceptedByUserId: session.user.id }).where(eq(engagementDeliverables.id, deliverable.id));
    await recordAudit(tx, { action: "engagement_deliverable_accepted", actorUserId: session.user.id, details: { engagementId: deliverable.engagementId, deliverableId: deliverable.id } });
  });
  return { success: true, changed: true } as const;
}

/** The owner shares something with their staff, or takes it back to themselves. Only owner-level people decide this. */
export async function setClientAudience(db: Database, session: AccountSession, input: { item: "notes" | "deliverable"; id: number; audience: Exclude<EngagementAudience, "team"> }) {
  if (input.item === "deliverable") {
    const { deliverable, viewer } = await requireClientDeliverable(db, session, input.id);
    if (viewer.kind !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner decides who sees this." });
    await db.update(engagementDeliverables).set({ audience: input.audience }).where(eq(engagementDeliverables.id, deliverable.id));
  } else {
    const item = (await db.select().from(engagementSessions).where(eq(engagementSessions.id, input.id)).limit(1))[0];
    if (!item || !item.notesSharedAt) throw notFound();
    const { viewer } = await requireClientEngagement(db, session, item.engagementId);
    if (viewer.kind !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner decides who sees this." });
    await db.update(engagementSessions).set({ notesAudience: input.audience }).where(eq(engagementSessions.id, item.id));
  }
  await recordAudit(db, { action: "engagement_audience_changed", actorUserId: session.user.id, details: { item: input.item, id: input.id, audience: input.audience } });
  return { success: true } as const;
}


// ---- Files -----------------------------------------------------------------------------------------------------------

const UPLOADS_OFF = "File upload is not set up yet. Send it on WhatsApp or by email, then tick \"I have sent this\".";
const requireUploads = () => {
  if (!isFileStorageConfigured()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: UPLOADS_OFF });
};

export type UploadTarget = { kind: "task" | "deliverable"; id: number };
export type UploadInput = { fileName: string; contentType: string; sizeBytes: number };

function validateUpload(input: UploadInput) {
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > UPLOAD_MAX_BYTES) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Files up to ${UPLOAD_MAX_MB} MB.` });
  }
  if (isVideoFile(input.fileName)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Videos are not uploaded here. Paste a link to the folder (Google Drive, Dropbox, WeTransfer or iCloud), or send it on WhatsApp." });
  }
  if (!isAllowedUploadType(input.contentType, input.fileName)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "PDF, photos, spreadsheets, Word documents and voice notes only." });
  }
}

const keyPrefix = (engagementId: number, target: UploadTarget) => `engagements/${engagementId}/${target.kind}s/${target.id}/`;
const newStorageKey = (engagementId: number, target: UploadTarget, fileName: string) => `${keyPrefix(engagementId, target)}${randomUUID()}-${safeFileName(fileName)}`;
/** Confirm only a key minted by requestUpload: one UUID-prefixed, path-safe leaf under this exact target. */
const isTargetStorageKey = (key: string, prefix: string) => {
  if (!key.startsWith(prefix)) return false;
  const leaf = key.slice(prefix.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,100}$/i.test(leaf);
};

/**
 * Every file on an engagement, with who uploaded it. "From the team" means the uploader is not a member of the
 * client's business: clients can only upload once they have an account, so anyone else is IP Factory.
 */
async function filesOf(db: Pick<Database, "select">, engagementId: number) {
  const rows = await db.select({
    id: engagementFiles.id, taskId: engagementFiles.taskId, deliverableId: engagementFiles.deliverableId, fileName: engagementFiles.fileName, contentType: engagementFiles.contentType,
    sizeBytes: engagementFiles.sizeBytes, audience: engagementFiles.audience, uploadedByUserId: engagementFiles.uploadedByUserId, uploadedByName: users.name, createdAt: engagementFiles.createdAt, note: engagementFiles.note,
    membershipId: businessMemberships.id,
  }).from(engagementFiles)
    .innerJoin(users, eq(engagementFiles.uploadedByUserId, users.id))
    .innerJoin(engagements, eq(engagementFiles.engagementId, engagements.id))
    .leftJoin(businessMemberships, and(eq(businessMemberships.userId, engagementFiles.uploadedByUserId), eq(businessMemberships.businessId, engagements.businessId)))
    .where(eq(engagementFiles.engagementId, engagementId)).orderBy(asc(engagementFiles.id));
  return rows.map(({ membershipId, ...row }) => ({ ...row, fromTeam: membershipId === null }));
}
type EngagementFile = Awaited<ReturnType<typeof filesOf>>[number];

/** A client sees a file they uploaded, or one whose audience includes them. The container's own rule applies as well. */
const clientFileVisible = (file: Pick<EngagementFile, "uploadedByUserId" | "audience">, viewer: ClientViewer, userId: number) =>
  file.uploadedByUserId === userId || clientCanSee(file.audience, viewer);

async function requireClientTaskForUpload(db: Pick<Database, "select">, session: AccountSession, taskId: number) {
  const task = (await db.select().from(engagementTasks).where(eq(engagementTasks.id, taskId)).limit(1))[0];
  if (!task) throw notFound();
  const { viewer } = await requireClientEngagement(db, session, task.engagementId);
  if (task.side !== "client" || task.status === "cancelled" || !clientCanSeeTask(task, viewer)) throw notFound();
  return task;
}

/** Step one of a client upload against a data request: where to put the file. Nothing is recorded yet. */
export async function clientRequestUpload(db: Database, session: AccountSession, input: UploadInput & { taskId: number }) {
  requireUploads();
  validateUpload(input);
  const task = await requireClientTaskForUpload(db, session, input.taskId);
  const storageKey = newStorageKey(task.engagementId, { kind: "task", id: task.id }, input.fileName);
  const upload = await createSignedUpload(storageKey, input.contentType);
  return { storageKey, uploadUrl: upload.url, headers: upload.headers };
}

/**
 * Step two: the browser finished the PUT. The key must belong to this task, the object must exist, then the file is
 * recorded and the request moves to "received" (a second file on a received request changes nothing else).
 */
export async function clientConfirmUpload(db: Database, session: AccountSession, input: UploadInput & { taskId: number; storageKey: string; note: string | null }) {
  requireUploads();
  validateUpload(input);
  const task = await requireClientTaskForUpload(db, session, input.taskId);
  if (!isTargetStorageKey(input.storageKey, keyPrefix(task.engagementId, { kind: "task", id: task.id }))) throw notFound();
  if (!(await objectExists(input.storageKey))) throw new TRPCError({ code: "BAD_REQUEST", message: "The upload did not finish. Try again." });
  const open = task.status === "open" || task.status === "needs_more";
  const arrival = open ? arrivalFields(task, "received") : {};
  const result = await db.transaction(async tx => {
    const [file] = await tx.insert(engagementFiles).values({
      engagementId: task.engagementId, taskId: task.id, storageKey: input.storageKey, fileName: input.fileName.trim().slice(0, 255), contentType: input.contentType || "application/octet-stream",
      sizeBytes: input.sizeBytes, audience: "owner", uploadedByUserId: session.user.id,
    }).returning({ id: engagementFiles.id });
    if (open) await tx.update(engagementTasks).set({ status: "received", statusNote: input.note || "Uploaded to the room", ...arrival }).where(eq(engagementTasks.id, task.id));
    await recordAudit(tx, { action: "engagement_file_uploaded", actorUserId: session.user.id, details: { engagementId: task.engagementId, taskId: task.id, fileId: file.id, ...(open ? { status: "received" } : {}) } });
    return { success: true, fileId: file.id, status: open ? "received" as const : task.status } as const;
  });
  if (hasArrived(arrival)) await sendReceivedEmail(db, { taskId: task.id, actorUserId: session.user.id, how: "a file in the room" });
  return result;
}

/** A short-lived link to a file the client may see: their own upload, or one shared with them on a visible item. */
export async function clientFileLink(db: Database, session: AccountSession, input: { fileId: number }) {
  requireUploads();
  const file = (await db.select().from(engagementFiles).where(eq(engagementFiles.id, input.fileId)).limit(1))[0];
  if (!file) throw notFound();
  const { viewer } = await requireClientEngagement(db, session, file.engagementId);
  if (!clientFileVisible(file, viewer, session.user.id)) throw notFound();
  if (file.taskId !== null) {
    const task = (await db.select().from(engagementTasks).where(eq(engagementTasks.id, file.taskId)).limit(1))[0];
    if (!task || task.status === "cancelled" || !clientCanSeeTask(task, viewer)) throw notFound();
  } else if (file.deliverableId !== null) {
    const deliverable = (await db.select().from(engagementDeliverables).where(eq(engagementDeliverables.id, file.deliverableId)).limit(1))[0];
    if (!deliverable || deliverable.status !== "shared" || !clientCanSee(deliverable.audience, viewer)) throw notFound();
  }
  return { url: await signedDownloadUrl(file.storageKey, file.fileName) };
}

// ---- The content board: reels, posts and stories, approved by the client before they go out ------------------------

async function contentOf(db: Pick<Database, "select">, engagementId: number) {
  return db.select().from(engagementContentItems).where(eq(engagementContentItems.engagementId, engagementId)).orderBy(asc(engagementContentItems.month), asc(engagementContentItems.sortOrder), asc(engagementContentItems.id));
}

const clientContent = (item: typeof engagementContentItems.$inferSelect) => ({
  id: item.id, kind: item.kind, kindLabel: CONTENT_KIND_LABELS[item.kind], title: item.title, month: item.month, status: item.status, statusLabel: CONTENT_STATUS_LABELS[item.status],
  dueOn: item.dueOn, link: item.link, clientNote: item.clientNote, approvedAt: item.approvedAt, publishedAt: item.publishedAt,
});

export type ContentInput = { engagementId: number; itemId?: number; kind: ContentKind; title: string; month: number; status: ContentStatus; dueOn: string | null; link: string | null };

/** The team adds or updates a piece of content. Moving it to Published stamps the date; the client's approval stands. */
export async function saveContentItem(db: Database, actor: StaffActor, input: ContentInput) {
  requireManage(actor);
  const engagement = await requireStaffEngagement(db, actor, input.engagementId);
  const values = { kind: input.kind, title: input.title.trim(), month: input.month, status: input.status, dueOn: input.dueOn, link: input.link, ...(input.status === "published" ? { publishedAt: new Date() } : {}) };
  if (input.itemId) {
    const updated = await db.update(engagementContentItems).set(values).where(and(eq(engagementContentItems.id, input.itemId), eq(engagementContentItems.engagementId, engagement.id))).returning({ id: engagementContentItems.id });
    if (!updated.length) throw notFound();
    await recordAudit(db, { action: "engagement_content_saved", actorUserId: actor.id, details: { engagementId: engagement.id, itemId: input.itemId, status: input.status } });
    return { itemId: input.itemId } as const;
  }
  const [created] = await db.insert(engagementContentItems).values({ engagementId: engagement.id, ...values, createdByUserId: actor.id }).returning({ id: engagementContentItems.id });
  await recordAudit(db, { action: "engagement_content_saved", actorUserId: actor.id, details: { engagementId: engagement.id, itemId: created.id, status: input.status } });
  return { itemId: created.id } as const;
}

export async function deleteContentItem(db: Database, actor: StaffActor, input: { itemId: number }) {
  requireManage(actor);
  const item = (await db.select().from(engagementContentItems).where(eq(engagementContentItems.id, input.itemId)).limit(1))[0];
  if (!item) throw notFound();
  await requireStaffEngagement(db, actor, item.engagementId);
  await db.transaction(async tx => {
    await tx.delete(engagementContentItems).where(eq(engagementContentItems.id, item.id));
    await recordAudit(tx, { action: "engagement_content_deleted", actorUserId: actor.id, details: { engagementId: item.engagementId, itemId: item.id } });
  });
  return { success: true } as const;
}

/**
 * The client approves a piece of content, or asks for changes with a note. Only something waiting for their approval,
 * and only the owner or someone with full access.
 */
export async function respondToContent(db: Database, session: AccountSession, input: { itemId: number; approve: boolean; note: string | null }) {
  const item = (await db.select().from(engagementContentItems).where(eq(engagementContentItems.id, input.itemId)).limit(1))[0];
  if (!item) throw notFound();
  const { viewer } = await requireClientEngagement(db, session, item.engagementId);
  if (!(viewer.kind === "owner" || viewer.access === "full")) throw notFound();
  if (item.status !== "for_approval") throw new TRPCError({ code: "CONFLICT", message: "This is not waiting for your approval." });
  if (!input.approve && !input.note?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Say what to change." });
  const set = input.approve
    ? { status: "approved" as const, approvedAt: new Date(), approvedByUserId: session.user.id, clientNote: null }
    : { status: "changes_requested" as const, clientNote: input.note!.trim() };
  await db.transaction(async tx => {
    await tx.update(engagementContentItems).set(set).where(eq(engagementContentItems.id, item.id));
    await recordAudit(tx, { action: input.approve ? "engagement_content_approved" : "engagement_content_changes_requested", actorUserId: session.user.id, details: { engagementId: item.engagementId, itemId: item.id } });
  });
  return { success: true, status: set.status } as const;
}

// ---- The drop box: the client sends everything at once; the team sorts it against the Data Requests ------------------

const dropPrefix = (engagementId: number) => `engagements/${engagementId}/inbox/`;

async function matchesOf(db: Pick<Database, "select">, engagementId: number) {
  return db.select({ fileId: engagementFileMatches.fileId, taskId: engagementFileMatches.taskId }).from(engagementFileMatches)
    .innerJoin(engagementFiles, eq(engagementFileMatches.fileId, engagementFiles.id)).where(eq(engagementFiles.engagementId, engagementId));
}

/**
 * The engagement a drop is for: the one the client has open in their room, which must be their business's; without one,
 * the newest. Anyone in the business may send files; only the owner and the sender see them.
 */
async function requireClientRoomEngagement(db: Pick<Database, "select">, session: AccountSession, engagementId?: number | null) {
  const business = session.activeBusiness;
  if (!business) throw notFound();
  const engagement = (await db.select({ id: engagements.id }).from(engagements)
    .where(engagementId ? and(eq(engagements.businessId, business.businessId), eq(engagements.id, engagementId)) : eq(engagements.businessId, business.businessId)).orderBy(desc(engagements.id)).limit(1))[0];
  if (!engagement) throw notFound();
  return engagement;
}

/** Step one of a drop: where to put the file. Nothing is recorded yet. */
export async function clientRequestDrop(db: Database, session: AccountSession, input: UploadInput & { engagementId?: number | null }) {
  requireUploads();
  validateUpload(input);
  const engagement = await requireClientRoomEngagement(db, session, input.engagementId);
  const storageKey = `${dropPrefix(engagement.id)}${randomUUID()}-${safeFileName(input.fileName)}`;
  const upload = await createSignedUpload(storageKey, input.contentType);
  return { storageKey, uploadUrl: upload.url, headers: upload.headers };
}

/** Step two: the file arrived. It is recorded unsorted (no request yet); the team matches it. */
export async function clientConfirmDrop(db: Database, session: AccountSession, input: UploadInput & { storageKey: string; note: string | null; engagementId?: number | null }) {
  requireUploads();
  validateUpload(input);
  const engagement = await requireClientRoomEngagement(db, session, input.engagementId);
  if (!isTargetStorageKey(input.storageKey, dropPrefix(engagement.id))) throw notFound();
  if (!(await objectExists(input.storageKey))) throw new TRPCError({ code: "BAD_REQUEST", message: "The upload did not finish. Try again." });
  return db.transaction(async tx => {
    const [file] = await tx.insert(engagementFiles).values({
      engagementId: engagement.id, storageKey: input.storageKey, fileName: input.fileName.trim().slice(0, 255), contentType: input.contentType || "application/octet-stream",
      sizeBytes: input.sizeBytes, audience: "owner", uploadedByUserId: session.user.id, note: input.note,
    }).returning({ id: engagementFiles.id });
    await recordAudit(tx, { action: "engagement_file_dropped", actorUserId: session.user.id, details: { engagementId: engagement.id, fileId: file.id } });
    return { success: true, fileId: file.id } as const;
  });
}

/**
 * "We don't have this": a valid answer to a Data Request, so it stops waiting on the client. They can take it back
 * while the team has not acted on it.
 */
export async function setNotAvailable(db: Database, session: AccountSession, input: { taskId: number; unavailable: boolean; note: string | null }) {
  const task = (await db.select().from(engagementTasks).where(eq(engagementTasks.id, input.taskId)).limit(1))[0];
  if (!task) throw notFound();
  const { viewer } = await requireClientEngagement(db, session, task.engagementId);
  if (task.side !== "client" || task.kind !== "data_request" || task.status === "cancelled" || !clientCanSeeTask(task, viewer)) throw notFound();
  if (input.unavailable && task.status !== "open" && task.status !== "needs_more") throw new TRPCError({ code: "CONFLICT", message: "This is already with us." });
  if (!input.unavailable && task.status !== "not_available") throw new TRPCError({ code: "CONFLICT", message: "This is already with us." });
  const status: EngagementTaskStatus = input.unavailable ? "not_available" : "open";
  await db.transaction(async tx => {
    await tx.update(engagementTasks).set({ status, statusNote: input.unavailable ? input.note : null }).where(eq(engagementTasks.id, task.id));
    await recordAudit(tx, { action: "engagement_task_answered", actorUserId: session.user.id, details: { engagementId: task.engagementId, taskId: task.id, status } });
  });
  return { success: true, status } as const;
}

/**
 * The team says which Data Requests a dropped file answers (replacing what it said before). A request still waiting on
 * the client moves to "Sent, we are checking"; the team then marks it Received or asks for more, as for any request.
 */
export async function matchFile(db: Database, actor: StaffActor, input: { fileId: number; taskIds: number[] }) {
  requireManage(actor);
  const file = (await db.select().from(engagementFiles).where(eq(engagementFiles.id, input.fileId)).limit(1))[0];
  if (!file || file.taskId !== null || file.deliverableId !== null) throw notFound();
  await requireStaffEngagement(db, actor, file.engagementId);
  const wanted = Array.from(new Set(input.taskIds));
  const requests = wanted.length ? await db.select().from(engagementTasks).where(and(inArray(engagementTasks.id, wanted), eq(engagementTasks.engagementId, file.engagementId), eq(engagementTasks.kind, "data_request"))) : [];
  if (requests.length !== wanted.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Match the file to this engagement's Data Requests only." });
  return db.transaction(async tx => {
    await tx.delete(engagementFileMatches).where(eq(engagementFileMatches.fileId, file.id));
    if (wanted.length) await tx.insert(engagementFileMatches).values(wanted.map(taskId => ({ fileId: file.id, taskId, matchedByUserId: actor.id })));
    const waiting = requests.filter(task => task.status === "open" || task.status === "needs_more" || task.status === "not_available");
    for (const task of waiting) await tx.update(engagementTasks).set({ status: "received", statusNote: "From the files you sent", ...arrivalFields(task, "received") }).where(eq(engagementTasks.id, task.id));
    await recordAudit(tx, { action: "engagement_file_matched", actorUserId: actor.id, details: { engagementId: file.engagementId, fileId: file.id, taskIds: wanted } });
    return { success: true, moved: waiting.length, arrived: waiting.filter(task => !task.receivedAt).map(task => task.id) } as const;
  }).then(async ({ arrived, ...result }) => {
    for (const taskId of arrived) await sendReceivedEmail(db, { taskId, actorUserId: actor.id, how: "a file in the drop box" });
    return result;
  });
}

async function requireStaffTarget(db: Pick<Database, "select">, actor: StaffActor, engagementId: number, target: UploadTarget) {
  await requireStaffEngagement(db, actor, engagementId);
  const exists = target.kind === "task"
    ? await db.select({ id: engagementTasks.id }).from(engagementTasks).where(and(eq(engagementTasks.id, target.id), eq(engagementTasks.engagementId, engagementId))).limit(1)
    : await db.select({ id: engagementDeliverables.id }).from(engagementDeliverables).where(and(eq(engagementDeliverables.id, target.id), eq(engagementDeliverables.engagementId, engagementId))).limit(1);
  if (!exists.length) throw notFound();
}

/** The team attaches a file to a request (what we owe the client) or a deliverable. Audience as for notes: owner by default. */
/**
 * A contributor (a Specialist) uploads a draft to a Deliverable, for IP Factory only, for the lead to share; or the brief
 * on a request they sent the client (R78), which the client sees.
 */
async function requireUploader(db: Pick<Database, "select">, actor: StaffActor, engagementId: number, target: UploadTarget, audience: EngagementAudience | null) {
  if (authorityAllows(actor.authority, "manage_engagements")) return;
  if (!canContribute(actor)) return requireManage(actor);
  if (target.kind === "deliverable" && (audience === null || audience === "team")) return;
  // Their own team item (R86): what they hand in, for IP Factory only until the lead shares it.
  if (target.kind === "task" && (audience === null || audience === "team")) {
    const own = (await db.select({ engagementId: engagementTasks.engagementId, side: engagementTasks.side, assigneeUserId: engagementTasks.assigneeUserId, createdByUserId: engagementTasks.createdByUserId }).from(engagementTasks).where(eq(engagementTasks.id, target.id)).limit(1))[0];
    if (own && own.engagementId === engagementId && own.side === "ipf" && (own.assigneeUserId === actor.id || own.createdByUserId === actor.id)) return;
  }
  if (target.kind === "task" && audience !== "team") {
    const task = (await db.select({ engagementId: engagementTasks.engagementId, requestedByUserId: engagementTasks.requestedByUserId }).from(engagementTasks).where(eq(engagementTasks.id, target.id)).limit(1))[0];
    if (task && task.engagementId === engagementId && task.requestedByUserId === actor.id) return;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "You can add draft files to a Deliverable, for IP Factory only, and a brief to a request you sent. The lead shares the rest." });
}

export async function staffRequestUpload(db: Database, actor: StaffActor, input: UploadInput & { engagementId: number; target: UploadTarget }) {
  requireUploads();
  await requireUploader(db, actor, input.engagementId, input.target, null);
  validateUpload(input);
  await requireStaffTarget(db, actor, input.engagementId, input.target);
  const storageKey = newStorageKey(input.engagementId, input.target, input.fileName);
  const upload = await createSignedUpload(storageKey, input.contentType);
  return { storageKey, uploadUrl: upload.url, headers: upload.headers };
}

export async function staffConfirmUpload(db: Database, actor: StaffActor, input: UploadInput & { engagementId: number; target: UploadTarget; storageKey: string; audience: EngagementAudience }) {
  requireUploads();
  await requireUploader(db, actor, input.engagementId, input.target, input.audience);
  validateUpload(input);
  await requireStaffTarget(db, actor, input.engagementId, input.target);
  if (!isTargetStorageKey(input.storageKey, keyPrefix(input.engagementId, input.target))) throw notFound();
  if (!(await objectExists(input.storageKey))) throw new TRPCError({ code: "BAD_REQUEST", message: "The upload did not finish. Try again." });
  return db.transaction(async tx => {
    const [file] = await tx.insert(engagementFiles).values({
      engagementId: input.engagementId, taskId: input.target.kind === "task" ? input.target.id : null, deliverableId: input.target.kind === "deliverable" ? input.target.id : null,
      storageKey: input.storageKey, fileName: input.fileName.trim().slice(0, 255), contentType: input.contentType || "application/octet-stream", sizeBytes: input.sizeBytes, audience: input.audience, uploadedByUserId: actor.id,
    }).returning({ id: engagementFiles.id });
    await recordAudit(tx, { action: "engagement_file_uploaded", actorUserId: actor.id, details: { engagementId: input.engagementId, [input.target.kind === "task" ? "taskId" : "deliverableId"]: input.target.id, fileId: file.id, audience: input.audience } });
    return { success: true, fileId: file.id } as const;
  });
}

/** The lead shares a draft a Specialist handed in (IP Factory only) with the owner, or the owner and their team. */
export async function shareTeamFile(db: Database, actor: StaffActor, input: { fileId: number; audience: Exclude<EngagementAudience, "team"> }) {
  requireManage(actor);
  const file = (await db.select().from(engagementFiles).where(eq(engagementFiles.id, input.fileId)).limit(1))[0];
  if (!file) throw notFound();
  await requireStaffEngagement(db, actor, file.engagementId);
  if (file.audience !== "team") throw new TRPCError({ code: "BAD_REQUEST", message: "This file is already shared." });
  await db.transaction(async tx => {
    await tx.update(engagementFiles).set({ audience: input.audience }).where(eq(engagementFiles.id, file.id));
    await recordAudit(tx, { action: "engagement_file_shared", actorUserId: actor.id, details: { engagementId: file.engagementId, fileId: file.id, audience: input.audience } });
  });
  return { success: true } as const;
}

/**
 * Removing a file (R61): the stored object is deleted, then the record and its matches. An item that was "Sent, we are
 * checking" only because of this file goes back to "To do". Recorded, with who removed it and, for the team, why.
 */
async function removeFile(db: Database, file: typeof engagementFiles.$inferSelect, by: { userId: number; side: "client" | "team"; reason?: string }) {
  try {
    await deleteObject(file.storageKey);
  } catch {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "We could not remove the file just now. Try again in a moment." });
  }
  await db.transaction(async tx => {
    await tx.delete(engagementFiles).where(eq(engagementFiles.id, file.id));
    if (file.taskId !== null) {
      const task = (await tx.select().from(engagementTasks).where(eq(engagementTasks.id, file.taskId)).limit(1))[0];
      // Only the client's own files answer an item: a brief the team attached to it does not (R78).
      const owner = (await tx.select({ businessId: engagements.businessId }).from(engagements).where(eq(engagements.id, file.engagementId)).limit(1))[0];
      const left = owner?.businessId == null ? [] : await tx.select({ id: engagementFiles.id }).from(engagementFiles)
        .innerJoin(businessMemberships, and(eq(businessMemberships.userId, engagementFiles.uploadedByUserId), eq(businessMemberships.businessId, owner.businessId)))
        .where(eq(engagementFiles.taskId, file.taskId)).limit(1);
      if (task && task.status === "received" && left.length === 0 && !task.responseLink) {
        await tx.update(engagementTasks).set({ status: "open", statusNote: null, ...arrivalFields(task, "open") }).where(eq(engagementTasks.id, task.id));
      }
    }
    await recordAudit(tx, { action: "engagement_file_removed", actorUserId: by.userId, details: { engagementId: file.engagementId, fileId: file.id, by: by.side, ...(by.reason ? { reason: by.reason } : {}) } });
  });
  return { success: true } as const;
}

/** The client takes back a file they sent, until the team has matched it to a request or accepted the request. */
export async function clientRemoveFile(db: Database, session: AccountSession, input: { fileId: number }) {
  requireUploads();
  const file = (await db.select().from(engagementFiles).where(eq(engagementFiles.id, input.fileId)).limit(1))[0];
  if (!file) throw notFound();
  await requireClientEngagement(db, session, file.engagementId);
  if (file.uploadedByUserId !== session.user.id || file.deliverableId !== null) throw notFound();
  const checked = file.taskId === null
    ? (await db.select({ taskId: engagementFileMatches.taskId }).from(engagementFileMatches).where(eq(engagementFileMatches.fileId, file.id)).limit(1)).length > 0
    : !["open", "received", "needs_more"].includes((await db.select({ status: engagementTasks.status }).from(engagementTasks).where(eq(engagementTasks.id, file.taskId)).limit(1))[0]?.status ?? "");
  if (checked) throw new TRPCError({ code: "CONFLICT", message: "Your team has already taken this file in. Ask them on WhatsApp to remove it." });
  return removeFile(db, file, { userId: session.user.id, side: "client" });
}

/** The team removes any file on an engagement in scope (a wrong or private file), with the reason recorded. */
export async function staffRemoveFile(db: Database, actor: StaffActor, input: { fileId: number; reason: string }) {
  requireUploads();
  requireManage(actor);
  const reason = input.reason.trim();
  if (reason.length < 3) throw new TRPCError({ code: "BAD_REQUEST", message: "Say why the file is removed." });
  const file = (await db.select().from(engagementFiles).where(eq(engagementFiles.id, input.fileId)).limit(1))[0];
  if (!file) throw notFound();
  await requireStaffEngagement(db, actor, file.engagementId);
  return removeFile(db, file, { userId: actor.id, side: "team", reason: reason.slice(0, 300) });
}

/** The team opens any file on an engagement in scope. */
export async function staffFileLink(db: Database, actor: StaffActor, input: { fileId: number }) {
  requireUploads();
  const file = (await db.select().from(engagementFiles).where(eq(engagementFiles.id, input.fileId)).limit(1))[0];
  if (!file) throw notFound();
  await requireStaffEngagement(db, actor, file.engagementId);
  return { url: await signedDownloadUrl(file.storageKey, file.fileName) };
}

// ---- The fix: the one number and the weekly check-in -----------------------------------------------------------------

const asNumber = (value: string | null) => (value === null ? null : Number(value));
const asNumeric = (value: number | null) => (value === null ? null : String(value));

async function measureOf(db: Pick<Database, "select">, engagementId: number) {
  const row = (await db.select().from(engagementMeasures).where(eq(engagementMeasures.engagementId, engagementId)).limit(1))[0];
  return row ? { ...row, baselineValue: asNumber(row.baselineValue), targetValue: asNumber(row.targetValue) } : null;
}
async function checkinsOf(db: Pick<Database, "select">, engagementId: number) {
  const rows = await db.select().from(engagementCheckins).where(eq(engagementCheckins.engagementId, engagementId)).orderBy(asc(engagementCheckins.weekNumber));
  return rows.map(row => ({ ...row, measureReading: asNumber(row.measureReading), hoursLead: asNumber(row.hoursLead), hoursAnalyst: asNumber(row.hoursAnalyst), hoursPartner: asNumber(row.hoursPartner) }));
}
type Measure = NonNullable<Awaited<ReturnType<typeof measureOf>>>;
type Checkin = Awaited<ReturnType<typeof checkinsOf>>[number];

/** What the client sees of the number: the definition, where it started, where it is going, and each week's reading and next step. */
function clientMeasure(measure: Measure, checkins: Checkin[]) {
  const readings = checkins.map(row => ({ weekNumber: row.weekNumber, heldOn: row.heldOn, reading: row.measureReading, nextStep: row.nextStep }));
  const latest = [...readings].reverse().find(row => row.reading !== null) ?? null;
  return { name: measure.name, definition: measure.definition, unit: measure.unit, baselineValue: measure.baselineValue, targetValue: measure.targetValue, latest, readings };
}

export type MeasureInput = { engagementId: number; name: string; definition: string | null; unit: string | null; baselineValue: number | null; targetValue: number | null };

/** The fix's one number (D3): set in fix week 1, one per engagement; saving again updates it. */
export async function saveMeasure(db: Database, actor: StaffActor, input: MeasureInput) {
  requireManage(actor);
  await requireStaffEngagement(db, actor, input.engagementId);
  const values = { name: input.name, definition: input.definition, unit: input.unit, baselineValue: asNumeric(input.baselineValue), targetValue: asNumeric(input.targetValue) };
  await db.transaction(async tx => {
    await tx.insert(engagementMeasures).values({ engagementId: input.engagementId, ...values, createdByUserId: actor.id })
      .onConflictDoUpdate({ target: engagementMeasures.engagementId, set: values });
    await recordAudit(tx, { action: "engagement_measure_saved", actorUserId: actor.id, details: { engagementId: input.engagementId, name: input.name } });
  });
  return { success: true } as const;
}

export type CheckinInput = {
  engagementId: number; weekNumber: number; heldOn: string | null; progress: string | null; blockers: string | null; nextStep: string | null;
  measureReading: number | null; questionsAsked: string | null; hoursLead: number | null; hoursAnalyst: number | null; hoursPartner: number | null; aiUsed: boolean | null;
};

/**
 * One row per fix week, recorded in order: a check-in cannot start without last week's record (concept note §9), so
 * week N needs week N-1 first. Saving a week again updates it.
 */
export async function saveCheckin(db: Database, actor: StaffActor, input: CheckinInput) {
  requireManage(actor);
  await requireStaffEngagement(db, actor, input.engagementId);
  if (input.weekNumber > 1) {
    const previous = await db.select({ id: engagementCheckins.id }).from(engagementCheckins)
      .where(and(eq(engagementCheckins.engagementId, input.engagementId), eq(engagementCheckins.weekNumber, input.weekNumber - 1))).limit(1);
    if (!previous.length) throw new TRPCError({ code: "CONFLICT", message: `Record week ${input.weekNumber - 1} first: a Weekly Check-in cannot start without last week's record.` });
  }
  const values = {
    heldOn: input.heldOn, progress: input.progress, blockers: input.blockers, nextStep: input.nextStep, measureReading: asNumeric(input.measureReading), questionsAsked: input.questionsAsked,
    hoursLead: asNumeric(input.hoursLead), hoursAnalyst: asNumeric(input.hoursAnalyst), hoursPartner: asNumeric(input.hoursPartner), aiUsed: input.aiUsed, recordedByUserId: actor.id,
  };
  await db.transaction(async tx => {
    await tx.insert(engagementCheckins).values({ engagementId: input.engagementId, weekNumber: input.weekNumber, ...values })
      .onConflictDoUpdate({ target: [engagementCheckins.engagementId, engagementCheckins.weekNumber], set: values });
    await recordAudit(tx, { action: "engagement_checkin_recorded", actorUserId: actor.id, details: { engagementId: input.engagementId, weekNumber: input.weekNumber } });
  });
  return { success: true } as const;
}

// ---- "Fix the next problem": a client asks for another service ------------------------------------------------------

/**
 * Anyone in the business asks, from their room, for another service. The desk is emailed and sees it in Engagements;
 * nothing is charged or opened until they confirm. One open request per service at a time.
 */
export async function requestService(db: Database, session: AccountSession, input: { service: string; note: string | null; engagementId?: number | null }) {
  const business = session.activeBusiness;
  if (!business) throw notFound();
  const product = PRODUCTS.find(item => item.id === input.service && item.id !== "business_health_check");
  if (!product) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a service." });
  if (input.engagementId) await requireClientRoomEngagement(db, session, input.engagementId);
  const open = (await db.select({ id: serviceRequests.id }).from(serviceRequests)
    .where(and(eq(serviceRequests.businessId, business.businessId), eq(serviceRequests.service, product.id), eq(serviceRequests.status, "open"))).limit(1))[0];
  if (open) return { success: true, requestId: open.id, already: true } as const;
  const [created] = await db.insert(serviceRequests).values({ businessId: business.businessId, engagementId: input.engagementId ?? null, requestedByUserId: session.user.id, service: product.id, note: input.note?.trim() || null }).returning({ id: serviceRequests.id });
  await recordAudit(db, { action: "service_requested", actorUserId: session.user.id, details: { requestId: created.id, businessId: business.businessId, service: product.id } });
  try {
    await deliverEmail({
      to: BRAND.businessSupportMailbox, sender: "business_support",
      subject: `${business.businessName} asked for the ${product.name}`,
      body: `${session.user.fullName || "A client"} at ${business.businessName} asked for the ${product.name} from their client room.${input.note?.trim() ? `\n\nTheir note: ${input.note.trim()}` : ""}\n\nConfirm it with them, send the payment link, then open the engagement from the request in Engagements: ${getTrustedApplicationOrigin()}/admin`,
    });
  } catch (error) {
    console.error("[Engagements] Service requested, but the desk could not be emailed:", error instanceof Error ? error.message : error);
  }
  return { success: true, requestId: created.id, already: false } as const;
}

/** The desk's list of requests not yet handled, and the clients' businesses to open an engagement for. Desk only. */
export async function listServiceRequests(db: Database, actor: StaffActor) {
  if (!canStart(actor)) return [];
  const rows = await db.select({ id: serviceRequests.id, businessId: serviceRequests.businessId, businessName: businesses.name, service: serviceRequests.service, note: serviceRequests.note, createdAt: serviceRequests.createdAt, requestedBy: users.name })
    .from(serviceRequests).innerJoin(businesses, eq(serviceRequests.businessId, businesses.id)).innerJoin(users, eq(serviceRequests.requestedByUserId, users.id))
    .where(eq(serviceRequests.status, "open")).orderBy(asc(serviceRequests.id));
  return rows.map(row => {
    const product = PRODUCTS.find(item => item.id === row.service);
    // The engagement the service is delivered as: Digital Marketing opens its content programme, not a Monthly Service.
    const type: EngagementType = product ? engagementTypeOf(product) : "done_for_you";
    return { ...row, serviceName: product?.name ?? row.service, type };
  });
}

export async function handleServiceRequest(db: Database, actor: StaffActor, input: { requestId: number; status: "done" | "declined" }) {
  requireStart(actor);
  const updated = await db.update(serviceRequests).set({ status: input.status, handledByUserId: actor.id, handledAt: new Date() })
    .where(and(eq(serviceRequests.id, input.requestId), eq(serviceRequests.status, "open"))).returning({ id: serviceRequests.id });
  if (!updated.length) throw notFound();
  await recordAudit(db, { action: "service_request_handled", actorUserId: actor.id, details: { requestId: input.requestId, status: input.status } });
  return { success: true } as const;
}

/** The businesses that already have an engagement, for "New engagement for an existing client". Desk only. */
export async function listClientBusinesses(db: Database, actor: StaffActor) {
  if (!canStart(actor)) return [];
  const rows = await db.selectDistinct({ id: businesses.id, name: businesses.name }).from(businesses).innerJoin(engagements, eq(engagements.businessId, businesses.id)).orderBy(asc(businesses.name));
  return rows;
}
