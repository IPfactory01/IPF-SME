import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  ENGAGEMENT_DELIVERABLE_KINDS,
  ENGAGEMENT_SESSION_KINDS,
  ENGAGEMENT_SESSION_STATUSES,
  ENGAGEMENT_STAGES,
  ENGAGEMENT_TASK_KINDS,
  ENGAGEMENT_TASK_SIDES,
  ENGAGEMENT_TASK_STATUSES,
  ENGAGEMENT_TEAM_ROLES,
} from "../../shared/engagement";
import { authorityAllows } from "../../shared/platformPermissions";
import {
  acceptDeliverable,
  approveDeliverable,
  assignTeamMember,
  clientComment,
  engagementDb,
  getClientRoom,
  getStaffEngagement,
  isMissingEngagementTable,
  listAssignableStaff,
  listAwaitingStart,
  listStaffEngagements,
  MIGRATION_MISSING_MESSAGE,
  removeTeamMember,
  respondToTask,
  saveDeliverable,
  saveProblem,
  saveSession,
  saveSessionNotes,
  saveTask,
  setClientAudience,
  setEngagementStage,
  shareDeliverable,
  shareSessionNotes,
  staffComment,
  startAwaitingEngagement,
} from "../engagements";
import { loadAuthority } from "../platformAccess";
import { accountProcedure, adminProcedure, router } from "../_core/trpc";

const id = z.number().int().positive();
const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).transform(value => value || null).nullable();
const sharedAudience = z.enum(["owner", "business"]);

/** A missing table (migration 0008) becomes a clear message instead of a server error. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isMissingEngagementTable(error)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: MIGRATION_MISSING_MESSAGE });
    throw error;
  }
}

/**
 * The team's side. Authentication: the internal area (adminProcedure). Permission: view_all_businesses or
 * view_assigned_businesses to enter; each change also needs manage_engagements, assign_engagements or
 * review_engagements. Scope: an engagement outside the person's assignments is not found (server/engagements.ts).
 */
const staff = adminProcedure.use(async ({ ctx, next }) => {
  const authority = await loadAuthority(await engagementDb(), ctx.user!);
  if (!authorityAllows(authority, "view_all_businesses") && !authorityAllows(authority, "view_assigned_businesses")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your role does not include engagements." });
  }
  return next({ ctx: { ...ctx, actor: { id: ctx.user!.id, authority } } });
});

const staffRouter = router({
  list: staff.query(async ({ ctx }) => {
    try {
      return { setUp: true, items: await listStaffEngagements(await engagementDb(), ctx.actor) };
    } catch (error) {
      if (!isMissingEngagementTable(error)) throw error;
      return { setUp: false, items: [] };
    }
  }),
  /** Paid assessments with no engagement yet (the safety net); empty before migration 0008. */
  awaitingStart: staff.query(async ({ ctx }) => {
    try {
      return await listAwaitingStart(await engagementDb(), ctx.actor);
    } catch (error) {
      if (!isMissingEngagementTable(error)) throw error;
      return [];
    }
  }),
  start: staff.input(z.object({ businessCheckId: id })).mutation(async ({ ctx, input }) => guarded(async () => startAwaitingEngagement(await engagementDb(), ctx.actor, input))),
  detail: staff.input(z.object({ engagementId: id })).query(async ({ ctx, input }) => guarded(async () => getStaffEngagement(await engagementDb(), ctx.actor, input.engagementId))),
  assignableStaff: staff.query(async ({ ctx }) => listAssignableStaff(await engagementDb(), ctx.actor)),
  assign: staff.input(z.object({ engagementId: id, userId: id, role: z.enum(ENGAGEMENT_TEAM_ROLES) })).mutation(async ({ ctx, input }) => guarded(async () => assignTeamMember(await engagementDb(), ctx.actor, input))),
  removeMember: staff.input(z.object({ engagementId: id, userId: id })).mutation(async ({ ctx, input }) => guarded(async () => removeTeamMember(await engagementDb(), ctx.actor, input))),
  setStage: staff.input(z.object({ engagementId: id, stage: z.enum(ENGAGEMENT_STAGES) })).mutation(async ({ ctx, input }) => guarded(async () => setEngagementStage(await engagementDb(), ctx.actor, input))),
  saveProblem: staff.input(z.object({ engagementId: id, problemArea: z.number().int().min(0).max(10).nullable(), subProblem: optionalText(255), problemStatement: optionalText(4000) }))
    .mutation(async ({ ctx, input }) => guarded(async () => saveProblem(await engagementDb(), ctx.actor, input))),
  saveSession: staff.input(z.object({
    engagementId: id,
    sessionId: id.optional(),
    kind: z.enum(ENGAGEMENT_SESSION_KINDS),
    title: text(160).min(1, "Give the call a title."),
    scheduledFor: z.coerce.date().nullable(),
    durationMinutes: z.number().int().min(5).max(480).nullable(),
    meetingLink: z.string().trim().url("Paste the full meeting link, starting https://").max(512).nullable().or(z.literal("").transform(() => null)),
    agenda: optionalText(4000),
    status: z.enum(ENGAGEMENT_SESSION_STATUSES),
  })).mutation(async ({ ctx, input }) => guarded(async () => saveSession(await engagementDb(), ctx.actor, input))),
  saveNotes: staff.input(z.object({ sessionId: id, clientNotes: optionalText(20000), internalNotes: optionalText(20000) }))
    .mutation(async ({ ctx, input }) => guarded(async () => saveSessionNotes(await engagementDb(), ctx.actor, input))),
  shareNotes: staff.input(z.object({ sessionId: id, audience: sharedAudience })).mutation(async ({ ctx, input }) => guarded(async () => shareSessionNotes(await engagementDb(), ctx.actor, input))),
  saveTask: staff.input(z.object({
    engagementId: id,
    taskId: id.optional(),
    kind: z.enum(ENGAGEMENT_TASK_KINDS),
    title: text(200).min(1, "Say what is needed."),
    detail: optionalText(2000),
    side: z.enum(ENGAGEMENT_TASK_SIDES),
    assigneeUserId: id.nullable(),
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    status: z.enum(ENGAGEMENT_TASK_STATUSES),
    statusNote: optionalText(500),
    sessionId: id.nullable(),
  })).mutation(async ({ ctx, input }) => guarded(async () => saveTask(await engagementDb(), ctx.actor, input))),
  saveDeliverable: staff.input(z.object({ engagementId: id, deliverableId: id.optional(), kind: z.enum(ENGAGEMENT_DELIVERABLE_KINDS), title: text(200).min(1, "Give it a title."), summary: optionalText(20000) }))
    .mutation(async ({ ctx, input }) => guarded(async () => saveDeliverable(await engagementDb(), ctx.actor, input))),
  approveDeliverable: staff.input(z.object({ deliverableId: id })).mutation(async ({ ctx, input }) => guarded(async () => approveDeliverable(await engagementDb(), ctx.actor, input))),
  shareDeliverable: staff.input(z.object({ deliverableId: id, audience: sharedAudience })).mutation(async ({ ctx, input }) => guarded(async () => shareDeliverable(await engagementDb(), ctx.actor, input))),
  comment: staff.input(z.object({ deliverableId: id, body: text(4000).min(1) })).mutation(async ({ ctx, input }) => guarded(async () => staffComment(await engagementDb(), ctx.actor, input))),
});

/**
 * The client's side. Authentication: a universal account session. Scope: the engagement of the business they are
 * working in, and only what was shared with them (server/engagements.ts); nothing here accepts a business id.
 */
const clientRouter = router({
  /** Null when the business has no engagement yet, or the room is not set up in the database yet. */
  room: accountProcedure.query(async ({ ctx }) => {
    try {
      return await getClientRoom(await engagementDb(), ctx.account);
    } catch (error) {
      if (isMissingEngagementTable(error)) return null;
      throw error;
    }
  }),
  respondToTask: accountProcedure.input(z.object({ taskId: id, note: optionalText(500) })).mutation(async ({ ctx, input }) => guarded(async () => respondToTask(await engagementDb(), ctx.account, input))),
  comment: accountProcedure.input(z.object({ deliverableId: id, body: text(4000).min(1, "Write your comment first.") })).mutation(async ({ ctx, input }) => guarded(async () => clientComment(await engagementDb(), ctx.account, input))),
  accept: accountProcedure.input(z.object({ deliverableId: id })).mutation(async ({ ctx, input }) => guarded(async () => acceptDeliverable(await engagementDb(), ctx.account, input))),
  setAudience: accountProcedure.input(z.object({ item: z.enum(["notes", "deliverable"]), id, audience: sharedAudience })).mutation(async ({ ctx, input }) => guarded(async () => setClientAudience(await engagementDb(), ctx.account, input))),
});

export const engagementRouter = router({ staff: staffRouter, client: clientRouter });
