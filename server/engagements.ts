import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  businessChecks,
  businessMemberAccess,
  businessMemberships,
  businesses,
  clientOnboardingInvitations,
  engagementComments,
  engagementDeliverables,
  engagements,
  engagementSessions,
  engagementTasks,
  engagementTeam,
  paymentRequests,
  userPlatformRoles,
  users,
} from "../drizzle/schema";
import { authorityAllows, type Authority } from "../shared/platformPermissions";
import {
  ASSESSMENT_TEMPLATE,
  clientCanSee,
  clientCanSeeTask,
  DELIVERABLES_NEEDING_APPROVAL,
  ENGAGEMENT_AUDIENCE_LABELS,
  ENGAGEMENT_DELIVERABLE_KIND_LABELS,
  ENGAGEMENT_STAGE_LABELS,
  ENGAGEMENT_TASK_STATUS_LABELS,
  ENGAGEMENT_TEAM_ROLE_LABELS,
  journeyOf,
  type ClientViewer,
  type EngagementAudience,
  type EngagementDeliverableKind,
  type EngagementSessionKind,
  type EngagementSessionStatus,
  type EngagementStage,
  type EngagementTaskKind,
  type EngagementTaskSide,
  type EngagementTaskStatus,
  type EngagementTeamRole,
} from "../shared/engagement";
import type { AccountSession, Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { getDb } from "./db";
import { deliverEmail } from "./email";
import { getTrustedApplicationOrigin } from "./security";
import { BRAND } from "../shared/brand";

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
export function isMissingEngagementTable(error: unknown) {
  const code = (error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "42P01";
}
export const MIGRATION_MISSING_MESSAGE = "The engagement room is not set up in the database yet (migration 0008).";

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
 * Starts the engagement when the Current State Assessment is paid: the record, the data requests and the two calls
 * from the template, due in three working days. Runs once per business check; a second call changes nothing. If the
 * owner already has an account (invited by hand before paying), the engagement is linked to their business at once.
 */
export async function startEngagement(db: Database, input: { businessCheckId: number; paymentRequestId: number | null; actorUserId: number | null; now?: Date }) {
  const now = input.now ?? new Date();
  return db.transaction(async tx => {
    const accepted = (await tx.select({ businessId: clientOnboardingInvitations.businessId }).from(clientOnboardingInvitations)
      .where(and(eq(clientOnboardingInvitations.businessCheckId, input.businessCheckId), eq(clientOnboardingInvitations.status, "accepted")))
      .orderBy(desc(clientOnboardingInvitations.id)).limit(1))[0];
    const [created] = await tx.insert(engagements)
      .values({ businessCheckId: input.businessCheckId, paymentRequestId: input.paymentRequestId, businessId: accepted?.businessId ?? null })
      .onConflictDoNothing({ target: engagements.businessCheckId })
      .returning({ id: engagements.id });
    if (!created) return { engagementId: null, created: false } as const;
    const dueOn = addWorkingDays(now, 3);
    await tx.insert(engagementTasks).values(ASSESSMENT_TEMPLATE.dataRequests.map(item => ({
      engagementId: created.id, kind: "data_request" as const, side: "client" as const, title: item.title, detail: item.detail, dueOn, createdByUserId: input.actorUserId,
    })));
    await tx.insert(engagementSessions).values(ASSESSMENT_TEMPLATE.sessions.map(item => ({
      engagementId: created.id, kind: item.kind, title: item.title, durationMinutes: item.durationMinutes, agenda: item.agenda, createdByUserId: input.actorUserId,
    })));
    await recordAudit(tx, { action: "engagement_started", actorUserId: input.actorUserId, details: { engagementId: created.id, businessCheckId: input.businessCheckId } });
    return { engagementId: created.id, created: true } as const;
  });
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
const canStart = (actor: StaffActor) => canSeeAll(actor) && authorityAllows(actor.authority, "manage_engagements");
function requireStart(actor: StaffActor) {
  if (!canStart(actor)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the desk lead can start an engagement by hand." });
  }
}

/**
 * Paid Current State Assessments with no engagement: a payment confirmed before migration 0008 was applied, or a start
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
  if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "This Current State Assessment is not paid yet." });
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

const canSeeAll = (actor: StaffActor) => authorityAllows(actor.authority, "view_all_businesses");
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

/** The engagements this person may see, newest first, with what the desk needs at a glance. */
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
    businessId: engagements.businessId,
    businessCheckId: engagements.businessCheckId,
    createdAt: engagements.createdAt,
    ownerName: businessChecks.fullName,
    ownerEmail: businessChecks.email,
    checkBusinessName: businessChecks.businessName,
    businessName: businesses.name,
  }).from(engagements)
    .innerJoin(businessChecks, eq(engagements.businessCheckId, businessChecks.id))
    .leftJoin(businesses, eq(engagements.businessId, businesses.id))
    .where(scope ? inArray(engagements.id, scope) : undefined)
    .orderBy(desc(engagements.id));
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const [team, tasks, sessions] = await Promise.all([
    db.select({ engagementId: engagementTeam.engagementId, role: engagementTeam.role, name: users.name }).from(engagementTeam).innerJoin(users, eq(engagementTeam.userId, users.id)).where(inArray(engagementTeam.engagementId, ids)),
    db.select({ engagementId: engagementTasks.engagementId, side: engagementTasks.side, status: engagementTasks.status, dueOn: engagementTasks.dueOn }).from(engagementTasks).where(inArray(engagementTasks.engagementId, ids)),
    db.select({ engagementId: engagementSessions.engagementId, title: engagementSessions.title, scheduledFor: engagementSessions.scheduledFor, status: engagementSessions.status }).from(engagementSessions).where(inArray(engagementSessions.engagementId, ids)),
  ]);
  const now = Date.now();
  return rows.map(row => {
    const open = tasks.filter(task => task.engagementId === row.id && task.side === "client" && (task.status === "open" || task.status === "needs_more"));
    const next = sessions.filter(item => item.engagementId === row.id && item.status === "planned" && item.scheduledFor && item.scheduledFor.getTime() >= now)
      .sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime())[0];
    return {
      id: row.id,
      stage: row.stage,
      stageLabel: ENGAGEMENT_STAGE_LABELS[row.stage],
      businessName: row.businessName ?? row.checkBusinessName ?? row.ownerName,
      ownerName: row.ownerName,
      ownerEmail: row.ownerEmail,
      hasAccount: row.businessId !== null,
      createdAt: row.createdAt,
      team: team.filter(member => member.engagementId === row.id).map(member => ({ name: member.name ?? "", role: member.role, roleLabel: ENGAGEMENT_TEAM_ROLE_LABELS[member.role] })),
      openClientRequests: open.length,
      overdueClientRequests: open.filter(task => task.dueOn && task.dueOn < new Date(now).toISOString().slice(0, 10)).length,
      unscheduledSessions: sessions.filter(item => item.engagementId === row.id && item.status === "planned" && !item.scheduledFor).length,
      nextSession: next ? { title: next.title, scheduledFor: next.scheduledFor } : null,
    };
  });
}

/** Everything about one engagement, for the team. Internal notes included: this never reaches a client. */
export async function getStaffEngagement(db: Database, actor: StaffActor, engagementId: number) {
  const engagement = await requireStaffEngagement(db, actor, engagementId);
  const check = (await db.select({ id: businessChecks.id, fullName: businessChecks.fullName, email: businessChecks.email, whatsapp: businessChecks.whatsapp, businessName: businessChecks.businessName })
    .from(businessChecks).where(eq(businessChecks.id, engagement.businessCheckId)).limit(1))[0];
  const business = engagement.businessId ? (await db.select({ id: businesses.id, name: businesses.name }).from(businesses).where(eq(businesses.id, engagement.businessId)).limit(1))[0] ?? null : null;
  const [team, sessions, tasks, deliverables, comments, clientPeople] = await Promise.all([
    db.select({ userId: engagementTeam.userId, role: engagementTeam.role, name: users.name, email: users.email }).from(engagementTeam).innerJoin(users, eq(engagementTeam.userId, users.id)).where(eq(engagementTeam.engagementId, engagementId)).orderBy(asc(engagementTeam.id)),
    db.select().from(engagementSessions).where(eq(engagementSessions.engagementId, engagementId)).orderBy(asc(engagementSessions.id)),
    db.select().from(engagementTasks).where(eq(engagementTasks.engagementId, engagementId)).orderBy(asc(engagementTasks.id)),
    db.select().from(engagementDeliverables).where(eq(engagementDeliverables.engagementId, engagementId)).orderBy(asc(engagementDeliverables.id)),
    db.select({ id: engagementComments.id, deliverableId: engagementComments.deliverableId, body: engagementComments.body, createdAt: engagementComments.createdAt, authorName: users.name })
      .from(engagementComments).innerJoin(users, eq(engagementComments.authorUserId, users.id)).where(eq(engagementComments.engagementId, engagementId)).orderBy(asc(engagementComments.id)),
    engagement.businessId ? clientPeopleOf(db, engagement.businessId) : Promise.resolve([]),
  ]);
  return {
    engagement: { ...engagement, stageLabel: ENGAGEMENT_STAGE_LABELS[engagement.stage] },
    owner: check ? { name: check.fullName, email: check.email, whatsapp: check.whatsapp } : null,
    businessName: business?.name ?? check?.businessName ?? check?.fullName ?? "",
    hasAccount: business !== null,
    team: team.map(member => ({ ...member, roleLabel: ENGAGEMENT_TEAM_ROLE_LABELS[member.role] })),
    clientPeople,
    sessions,
    tasks: tasks.map(task => ({ ...task, statusLabel: ENGAGEMENT_TASK_STATUS_LABELS[task.status] })),
    deliverables: deliverables.map(item => ({ ...item, kindLabel: ENGAGEMENT_DELIVERABLE_KIND_LABELS[item.kind], needsApproval: DELIVERABLES_NEEDING_APPROVAL.includes(item.kind), comments: comments.filter(comment => comment.deliverableId === item.id) })),
    can: {
      manage: authorityAllows(actor.authority, "manage_engagements"),
      assign: authorityAllows(actor.authority, "assign_engagements"),
      review: authorityAllows(actor.authority, "review_engagements"),
    },
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
    subject: `New in your room: ${input.title}`,
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
  await requireStaffEngagement(db, actor, input.engagementId);
  const staff = (await db.select({ userId: userPlatformRoles.userId }).from(userPlatformRoles).innerJoin(users, eq(userPlatformRoles.userId, users.id))
    .where(and(eq(userPlatformRoles.userId, input.userId), eq(users.status, "active"))).limit(1))[0];
  if (!staff) throw new TRPCError({ code: "BAD_REQUEST", message: "Only IP Factory staff can join an engagement team." });
  await db.transaction(async tx => {
    await tx.insert(engagementTeam).values({ engagementId: input.engagementId, userId: input.userId, role: input.role, assignedByUserId: actor.id })
      .onConflictDoUpdate({ target: [engagementTeam.engagementId, engagementTeam.userId], set: { role: input.role, assignedByUserId: actor.id } });
    await recordAudit(tx, { action: "engagement_team_assigned", actorUserId: actor.id, details: { engagementId: input.engagementId, userId: input.userId, role: input.role } });
  });
  return { success: true } as const;
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

export type SessionInput = { engagementId: number; sessionId?: number; kind: EngagementSessionKind; title: string; scheduledFor: Date | null; durationMinutes: number | null; meetingLink: string | null; agenda: string | null; status: EngagementSessionStatus };

export async function saveSession(db: Database, actor: StaffActor, input: SessionInput) {
  requireManage(actor);
  await requireStaffEngagement(db, actor, input.engagementId);
  const values = { kind: input.kind, title: input.title, scheduledFor: input.scheduledFor, durationMinutes: input.durationMinutes, meetingLink: input.meetingLink, agenda: input.agenda, status: input.status };
  if (input.sessionId) {
    const updated = await db.update(engagementSessions).set(values).where(and(eq(engagementSessions.id, input.sessionId), eq(engagementSessions.engagementId, input.engagementId))).returning({ id: engagementSessions.id });
    if (!updated.length) throw notFound();
    return { sessionId: input.sessionId } as const;
  }
  const [created] = await db.insert(engagementSessions).values({ engagementId: input.engagementId, ...values, createdByUserId: actor.id }).returning({ id: engagementSessions.id });
  return { sessionId: created.id } as const;
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
  await notifyShared(db, session.engagementId, input.audience, "the notes from a call", session.title);
  return { success: true } as const;
}

export type TaskInput = { engagementId: number; taskId?: number; kind: EngagementTaskKind; title: string; detail: string | null; side: EngagementTaskSide; assigneeUserId: number | null; dueOn: string | null; status: EngagementTaskStatus; statusNote: string | null; sessionId: number | null };

export async function saveTask(db: Database, actor: StaffActor, input: TaskInput) {
  requireManage(actor);
  const engagement = await requireStaffEngagement(db, actor, input.engagementId);
  if (input.assigneeUserId !== null) {
    const allowed = input.side === "client"
      ? engagement.businessId !== null && (await clientPeopleOf(db, engagement.businessId)).some(person => person.userId === input.assigneeUserId)
      : (await db.select({ userId: engagementTeam.userId }).from(engagementTeam).where(and(eq(engagementTeam.engagementId, engagement.id), eq(engagementTeam.userId, input.assigneeUserId))).limit(1)).length === 1;
    if (!allowed) throw new TRPCError({ code: "BAD_REQUEST", message: input.side === "client" ? "That person is not part of the client's business." : "That person is not on the engagement team." });
  }
  if (input.sessionId !== null && !(await db.select({ id: engagementSessions.id }).from(engagementSessions).where(and(eq(engagementSessions.id, input.sessionId), eq(engagementSessions.engagementId, engagement.id))).limit(1)).length) throw notFound();
  const finished = input.status === "accepted" || input.status === "done";
  const values = { kind: input.kind, title: input.title, detail: input.detail, side: input.side, assigneeUserId: input.assigneeUserId, dueOn: input.dueOn, status: input.status, statusNote: input.statusNote, sessionId: input.sessionId, completedAt: finished ? new Date() : null };
  if (input.taskId) {
    const updated = await db.update(engagementTasks).set(values).where(and(eq(engagementTasks.id, input.taskId), eq(engagementTasks.engagementId, engagement.id))).returning({ id: engagementTasks.id });
    if (!updated.length) throw notFound();
    return { taskId: input.taskId } as const;
  }
  const [created] = await db.insert(engagementTasks).values({ engagementId: engagement.id, ...values, createdByUserId: actor.id }).returning({ id: engagementTasks.id });
  return { taskId: created.id } as const;
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

/** The desk lead (review_engagements) approves a prescription or plan; whoever wrote it cannot approve it alone. */
export async function approveDeliverable(db: Database, actor: StaffActor, input: { deliverableId: number }) {
  requirePermission(actor, "review_engagements", "Only the desk lead or a partner can approve this.");
  const deliverable = await requireStaffDeliverable(db, actor, input.deliverableId);
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
    throw new TRPCError({ code: "FORBIDDEN", message: `The desk lead approves every ${ENGAGEMENT_DELIVERABLE_KIND_LABELS[deliverable.kind].toLowerCase()} before the client sees it.` });
  }
  await db.transaction(async tx => {
    await tx.update(engagementDeliverables).set({ status: "shared", audience: input.audience, sharedAt: new Date(), sharedByUserId: actor.id }).where(eq(engagementDeliverables.id, deliverable.id));
    await recordAudit(tx, { action: "engagement_deliverable_shared", actorUserId: actor.id, details: { engagementId: deliverable.engagementId, deliverableId: deliverable.id, kind: deliverable.kind, audience: input.audience } });
  });
  await notifyShared(db, deliverable.engagementId, input.audience, `your ${ENGAGEMENT_DELIVERABLE_KIND_LABELS[deliverable.kind].toLowerCase()}`, deliverable.title);
  return { success: true } as const;
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
export async function getClientRoom(db: Database, session: AccountSession) {
  const business = session.activeBusiness;
  if (!business) return null;
  const engagement = (await db.select().from(engagements).where(eq(engagements.businessId, business.businessId)).orderBy(desc(engagements.id)).limit(1))[0];
  if (!engagement) return null;
  const viewer = await clientViewerFor(db, session, business.businessId);
  const [team, sessions, tasks, deliverables, comments] = await Promise.all([
    db.select({ name: users.name, role: engagementTeam.role }).from(engagementTeam).innerJoin(users, eq(engagementTeam.userId, users.id)).where(eq(engagementTeam.engagementId, engagement.id)).orderBy(asc(engagementTeam.id)),
    db.select().from(engagementSessions).where(eq(engagementSessions.engagementId, engagement.id)).orderBy(asc(engagementSessions.id)),
    db.select().from(engagementTasks).where(eq(engagementTasks.engagementId, engagement.id)).orderBy(asc(engagementTasks.id)),
    db.select().from(engagementDeliverables).where(and(eq(engagementDeliverables.engagementId, engagement.id), eq(engagementDeliverables.status, "shared"))).orderBy(asc(engagementDeliverables.id)),
    db.select({ deliverableId: engagementComments.deliverableId, body: engagementComments.body, createdAt: engagementComments.createdAt, authorName: users.name })
      .from(engagementComments).innerJoin(users, eq(engagementComments.authorUserId, users.id)).where(eq(engagementComments.engagementId, engagement.id)).orderBy(asc(engagementComments.id)),
  ]);
  const visibleDeliverables = deliverables.filter(item => clientCanSee(item.audience, viewer));
  const now = Date.now();
  const scheduled = sessions.filter(item => item.status !== "cancelled");
  const next = scheduled.filter(item => item.status === "planned" && item.scheduledFor && item.scheduledFor.getTime() >= now).sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime())[0];
  const notesVisible = (item: (typeof sessions)[number]) => Boolean(item.notesSharedAt && item.clientNotes && clientCanSee(item.notesAudience, viewer));
  return {
    engagementId: engagement.id,
    businessName: business.businessName,
    viewer: viewer.kind === "owner" ? { kind: "owner" as const } : { kind: "member" as const, access: viewer.access },
    stage: engagement.stage,
    stageLabel: ENGAGEMENT_STAGE_LABELS[engagement.stage],
    journey: journeyOf(engagement.stage),
    problemStatement: viewer.kind === "owner" || viewer.access === "full" ? engagement.problemStatement : null,
    team: team.map(member => ({ name: member.name ?? "", roleLabel: ENGAGEMENT_TEAM_ROLE_LABELS[member.role] })),
    nextSession: next ? { id: next.id, title: next.title, scheduledFor: next.scheduledFor, durationMinutes: next.durationMinutes, meetingLink: next.meetingLink } : null,
    sessions: scheduled.map(item => ({
      id: item.id,
      title: item.title,
      scheduledFor: item.scheduledFor,
      durationMinutes: item.durationMinutes,
      meetingLink: item.meetingLink,
      status: item.status,
      agenda: item.agenda,
      notes: notesVisible(item) ? item.clientNotes : null,
      notesSharedAt: notesVisible(item) ? item.notesSharedAt : null,
      notesAudience: notesVisible(item) ? item.notesAudience : null,
    })),
    tasks: tasks.filter(task => task.status !== "cancelled" && clientCanSeeTask(task, viewer)).map(task => ({
      id: task.id, kind: task.kind, side: task.side, title: task.title, detail: task.detail, dueOn: task.dueOn, status: task.status, statusLabel: ENGAGEMENT_TASK_STATUS_LABELS[task.status], statusNote: task.statusNote, mine: task.assigneeUserId === session.user.id,
    })),
    deliverables: visibleDeliverables.map(item => ({
      id: item.id, kind: item.kind, kindLabel: ENGAGEMENT_DELIVERABLE_KIND_LABELS[item.kind], title: item.title, summary: item.summary, sharedAt: item.sharedAt, audience: item.audience, audienceLabel: ENGAGEMENT_AUDIENCE_LABELS[item.audience], accepted: item.clientAcceptedAt !== null,
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
  await db.transaction(async tx => {
    await tx.update(engagementTasks).set({ status, statusNote: input.note, completedAt: status === "done" ? new Date() : null }).where(eq(engagementTasks.id, task.id));
    await recordAudit(tx, { action: "engagement_task_answered", actorUserId: session.user.id, details: { engagementId: task.engagementId, taskId: task.id, status } });
  });
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

