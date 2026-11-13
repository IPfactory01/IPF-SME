import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { describeDatabaseError, migrationState } from "../databaseHealth";
import { CONTENT_KINDS, CONTENT_STATUSES, ENGAGEMENT_TYPES } from "../../shared/engagementTypes";
import {
  ENGAGEMENT_DELIVERABLE_KINDS,
  ENGAGEMENT_SESSION_KINDS,
  ENGAGEMENT_SESSION_STATUSES,
  ENGAGEMENT_STAGES,
  ENGAGEMENT_TASK_FACTORS,
  ENGAGEMENT_TASK_PRIORITIES,
  TASK_FORMAT_MAX,
  TASK_INFORMS_MAX,
  TASK_REF_MAX,
  TASK_SECTION_MAX,
  ENGAGEMENT_TASK_KINDS,
  ENGAGEMENT_TASK_SIDES,
  ENGAGEMENT_TASK_STATUSES,
  ENGAGEMENT_TASK_TURNAROUNDS,
  ENGAGEMENT_TEAM_ROLES,
  MAX_CHECKIN_WEEKS,
  UPLOAD_MAX_BYTES,
} from "../../shared/engagement";
import { authorityAllows } from "../../shared/platformPermissions";
import { AGREEMENT_LIMITS } from "../../shared/agreement";
import { acceptPayment, cancelPayment, cancelRefund, listFinance, recordPayment, recordRefund, reverseWriteOff, writeOff } from "../finance";
import { openRoomNow, saveFees, setFeeTiming, staffFees, staffSendFeeLink } from "../agreements";
import {
  acceptDeliverable,
  approveDeliverable,
  assignTeamMember,
  clientComment,
  clientConfirmUpload,
  clientFileLink,
  clientRequestUpload,
  engagementDb,
  getClientRoom,
  previewClientRoom,
  loadDataRequest,
  requestService,
  listServiceRequests,
  handleServiceRequest,
  listClientBusinesses,
  getStaffEngagement,
  isMissingEngagementTable,
  listAssignableStaff,
  listAwaitingStart,
  listStaffEngagements,
  MIGRATION_MISSING_MESSAGE,
  removeTeamMember,
  respondToTask,
  answerWithLink,
  clientRemoveFile,
  staffRemoveFile,
  saveCheckin,
  saveDeliverable,
  saveMeasure,
  saveProblem,
  saveSession,
  saveSessionNotes,
  saveTask,
  createDirectEngagement,
  saveContentItem,
  deleteContentItem,
  respondToContent,
  canStart,
  canSeeAll,
  clientRequestDrop,
  clientConfirmDrop,
  setNotAvailable,
  matchFile,
  setClientAudience,
  setEngagementStage,
  shareDeliverable,
  shareSessionNotes,
  staffComment,
  staffConfirmUpload,
  staffFileLink,
  shareTeamFile,
  staffRequestUpload,
  startAwaitingEngagement,
  addMissingPlan,
  askClient,
  handInTask,
  assignByRole,
  todayFor,
  bookMeeting,
  staffTaskComment,
  clientTaskComment,
  followUpShared,
} from "../engagements";
import { REQUEST_BRIEF_MAX, REQUEST_TITLE_MAX, TASK_COMMENT_MAX } from "../../shared/requests";
import { MAX_OCCURRENCES, MEETING_TYPE_IDS } from "../../shared/zoomInvitation";
import { checkFileStorage } from "../fileStorage";
import { loadAuthority } from "../platformAccess";
import { accountProcedure, adminProcedure, router } from "../_core/trpc";
import { consumeLimit, LIMITS } from "../rateLimit";

async function enforceLimit(rule: typeof LIMITS.fileUpload | typeof LIMITS.fileDrop | typeof LIMITS.engagementComment, subject: string) {
  if (!(await consumeLimit(rule, subject))) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many requests. Kindly try again later." });
}

const id = z.number().int().positive();
const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).transform(value => value || null).nullable();
const sharedAudience = z.enum(["owner", "business"]);
const upload = { fileName: text(255).min(1, "The file has no name."), contentType: text(128), sizeBytes: z.number().int().positive().max(UPLOAD_MAX_BYTES) };
const storageKey = z.string().min(20).max(512);
const uploadTarget = z.object({ kind: z.enum(["task", "deliverable"]), id });
const reading = z.number().finite().nullable();
const hours = z.number().min(0).max(99.99).nullable();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

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
    const db = await engagementDb();
    try {
      return { setUp: true, items: await listStaffEngagements(db, ctx.actor), canStart: canStart(ctx.actor), seesAll: canSeeAll(ctx.actor), matchesFiles: authorityAllows(ctx.actor.authority, "manage_engagements") };
    } catch (error) {
      if (!isMissingEngagementTable(error)) throw error;
      // A missing table or column: the database is behind this build. Say which migration it lacks, never a guess.
      console.error(`[Engagements] The list cannot load: ${describeDatabaseError(error).reason}`);
      return { setUp: false, items: [], missing: (await migrationState(db))?.missing ?? null };
    }
  }),
  /** Today (R52): what needs this person across the engagements they are on. Their own scope only; read only. */
  today: staff.query(async ({ ctx }) => guarded(async () => todayFor(await engagementDb(), ctx.actor))),
  /** Paid assessments with no engagement yet (the safety net); empty before migration 0008. */
  awaitingStart: staff.query(async ({ ctx }) => {
    try {
      return await listAwaitingStart(await engagementDb(), ctx.actor);
    } catch (error) {
      if (!isMissingEngagementTable(error)) throw error;
      return [];
    }
  }),
  /** Whether file uploads are on, and if not exactly which setting or the bucket is missing. Reads only. */
  storageStatus: staff.query(() => checkFileStorage()),
  start: staff.input(z.object({ businessCheckId: id })).mutation(async ({ ctx, input }) => guarded(async () => startAwaitingEngagement(await engagementDb(), ctx.actor, input))),
  /** Preview as client: the room exactly as the owner sees it, read-only, for staff in the engagement's scope. Logged. */
  previewRoom: staff.input(z.object({ engagementId: id })).query(async ({ ctx, input }) => {
    // It is recorded in the viewer's name, so it is not offered inside Preview as a team member (R76).
    if (ctx.preview) throw new TRPCError({ code: "FORBIDDEN", message: "Close the team preview first: Preview as client is your own action." });
    return guarded(async () => previewClientRoom(await engagementDb(), ctx.actor, input));
  }),
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
    weekNumber: z.number().int().min(1).max(12).nullable().optional(),
  })).mutation(async ({ ctx, input }) => guarded(async () => saveSession(await engagementDb(), ctx.actor, input))),
  /** Book a meeting from Zoom (R81): its kind, the dates read from the pasted invitation, and the Join link. manage_engagements. */
  bookMeeting: staff.input(z.object({
    engagementId: id,
    type: z.enum(MEETING_TYPE_IDS),
    title: text(160).min(1, "Give the meeting a name."),
    starts: z.array(z.coerce.date()).min(1, "Give the meeting a date and time.").max(MAX_OCCURRENCES),
    durationMinutes: z.number().int().min(5).max(480),
    meetingLink: z.string().trim().url("Paste the Zoom invitation, or the Join link, starting https://").max(512),
    agenda: optionalText(4000),
  })).mutation(async ({ ctx, input }) => guarded(async () => bookMeeting(await engagementDb(), ctx.actor, input))),
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
    weekNumber: z.number().int().min(1).max(12).nullable(),
    sortOrder: z.number().int().min(0).max(999),
    factor: z.enum(ENGAGEMENT_TASK_FACTORS).nullable(),
    section: optionalText(TASK_SECTION_MAX).optional(),
    ref: optionalText(TASK_REF_MAX).optional(),
    informs: optionalText(TASK_INFORMS_MAX).optional(),
    format: optionalText(TASK_FORMAT_MAX).optional(),
    priority: z.enum(ENGAGEMENT_TASK_PRIORITIES).nullable().optional(),
  })).mutation(async ({ ctx, input }) => guarded(async () => saveTask(await engagementDb(), ctx.actor, input))),
  saveDeliverable: staff.input(z.object({ engagementId: id, deliverableId: id.optional(), kind: z.enum(ENGAGEMENT_DELIVERABLE_KINDS), title: text(200).min(1, "Give it a title."), summary: optionalText(20000) }))
    .mutation(async ({ ctx, input }) => guarded(async () => saveDeliverable(await engagementDb(), ctx.actor, input))),
  approveDeliverable: staff.input(z.object({ deliverableId: id })).mutation(async ({ ctx, input }) => guarded(async () => approveDeliverable(await engagementDb(), ctx.actor, input))),
  shareDeliverable: staff.input(z.object({ deliverableId: id, audience: sharedAudience })).mutation(async ({ ctx, input }) => guarded(async () => shareDeliverable(await engagementDb(), ctx.actor, input))),
  comment: staff.input(z.object({ deliverableId: id, body: text(4000).min(1) })).mutation(async ({ ctx, input }) => { await enforceLimit(LIMITS.engagementComment, `staff:${ctx.actor.id}`); return guarded(async () => staffComment(await engagementDb(), ctx.actor, input)); }),
  requestUpload: staff.input(z.object({ engagementId: id, target: uploadTarget, ...upload })).mutation(async ({ ctx, input }) => { await enforceLimit(LIMITS.fileUpload, `staff:${ctx.actor.id}`); return guarded(async () => staffRequestUpload(await engagementDb(), ctx.actor, input)); }),
  confirmUpload: staff.input(z.object({ engagementId: id, target: uploadTarget, storageKey, audience: z.enum(["team", "owner", "business"]), ...upload })).mutation(async ({ ctx, input }) => guarded(async () => staffConfirmUpload(await engagementDb(), ctx.actor, input))),
  fileLink: staff.input(z.object({ fileId: id })).mutation(async ({ ctx, input }) => guarded(async () => staffFileLink(await engagementDb(), ctx.actor, input))),
  shareFile: staff.input(z.object({ fileId: id, audience: sharedAudience })).mutation(async ({ ctx, input }) => guarded(async () => shareTeamFile(await engagementDb(), ctx.actor, input))),
  /** Remove any file on the engagement, with the reason recorded; the stored object is deleted (R61). */
  removeFile: staff.input(z.object({ fileId: id, reason: z.string().trim().min(3, "Say why the file is removed.").max(300) })).mutation(async ({ ctx, input }) => guarded(async () => staffRemoveFile(await engagementDb(), ctx.actor, input))),
  /** A whole Data Request in one step: a template, or rows pasted from Excel. */
  loadDataRequest: staff.input(z.object({
    engagementId: id,
    items: z.array(z.object({
      section: optionalText(120), ref: optionalText(32), title: text(200).min(1), detail: optionalText(2000), informs: optionalText(300), format: optionalText(120),
      priority: z.enum(ENGAGEMENT_TASK_PRIORITIES).nullable(), dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    })).min(1).max(120),
  })).mutation(async ({ ctx, input }) => guarded(async () => loadDataRequest(await engagementDb(), ctx.actor, input))),
  /** The engagement's fee schedule, with each fee's payments; payments are recorded in Finance (financeRouter). */
  fees: staff.input(z.object({ engagementId: id })).query(async ({ ctx, input }) => guarded(async () => staffFees(await engagementDb(), ctx.actor, input.engagementId))),
  /** Saved in place: a fee already on the engagement carries its id; a new one has none. */
  saveFees: staff.input(z.object({
    engagementId: id,
    feeLines: z.array(z.object({ id: id.optional(), label: text(AGREEMENT_LIMITS.label), amount: z.number().int().positive().max(AGREEMENT_LIMITS.amount), dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() })).max(AGREEMENT_LIMITS.feeLines),
  })).mutation(async ({ ctx, input }) => guarded(async () => saveFees(await engagementDb(), ctx.actor, input))),
  sendFeeLink: staff.input(z.object({ feeLineId: id })).mutation(async ({ ctx, input }) => guarded(async () => staffSendFeeLink(await engagementDb(), ctx.actor, input))),
  openRoomNow: staff.input(z.object({ engagementId: id })).mutation(async ({ ctx, input }) => guarded(async () => openRoomNow(await engagementDb(), ctx.actor, input))),
  /**
   * Ask the client for something (R78): manage_engagements or contribute_engagements, on an engagement the person is on;
   * one request a week each unless they approve on it; never due sooner than two days away.
   */
  askClient: staff.input(z.object({
    engagementId: id,
    title: text(REQUEST_TITLE_MAX).min(1, "Say what you need."),
    brief: optionalText(REQUEST_BRIEF_MAX),
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the day it is due."),
    turnaround: z.enum(ENGAGEMENT_TASK_TURNAROUNDS).nullable(),
  })).mutation(async ({ ctx, input }) => guarded(async () => askClient(await engagementDb(), ctx.actor, input))),
  /** Write in a client item's conversation (R78): manage_engagements, or the Specialist the item goes to. */
  taskComment: staff.input(z.object({ taskId: id, body: text(TASK_COMMENT_MAX).min(1, "Write your message first.") })).mutation(async ({ ctx, input }) => { await enforceLimit(LIMITS.engagementComment, `staff:${ctx.actor.id}`); return guarded(async () => staffTaskComment(await engagementDb(), ctx.actor, input)); }),
  /** The First edit or draft is shared (R78): as for the conversation, once it has arrived, once. */
  /** Assign by role (R88): team items with no one go to the person in their plan role, else the main contact. */
  assignByRole: staff.input(z.object({ engagementId: id })).mutation(async ({ ctx, input }) => guarded(async () => assignByRole(await engagementDb(), ctx.actor, input))),
  /** Ready for review (R86): the owner of a team item hands it in; the lead is emailed. */
  handIn: staff.input(z.object({ taskId: id })).mutation(async ({ ctx, input }) => guarded(async () => handInTask(await engagementDb(), ctx.actor, input))),
  followUpShared: staff.input(z.object({ taskId: id })).mutation(async ({ ctx, input }) => guarded(async () => followUpShared(await engagementDb(), ctx.actor, input))),
  /** Adds what the type's current plan has and this engagement lacks, dated from its kickoff (R77). Nothing already there changes. */
  addMissingPlan: staff.input(z.object({ engagementId: id })).mutation(async ({ ctx, input }) => guarded(async () => addMissingPlan(await engagementDb(), ctx.actor, input))),
  /** Paid in arrears or in advance from the kickoff (R74): a Partner or the Super Admin, on an engagement paid by the month. */
  setFeeTiming: staff.input(z.object({ engagementId: id, inArrears: z.boolean(), kickoffOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the kickoff date.") }))
    .mutation(async ({ ctx, input }) => guarded(async () => setFeeTiming(await engagementDb(), ctx.actor, input))),
  /** "Fix the next problem": the clients' requests for another service, and handling one. Desk only. */
  serviceRequests: staff.query(async ({ ctx }) => listServiceRequests(await engagementDb(), ctx.actor)),
  handleRequest: staff.input(z.object({ requestId: id, status: z.enum(["done", "declined"]) })).mutation(async ({ ctx, input }) => guarded(async () => handleServiceRequest(await engagementDb(), ctx.actor, input))),
  /** The businesses that already have an engagement, to open another for. Desk only. */
  clientBusinesses: staff.query(async ({ ctx }) => listClientBusinesses(await engagementDb(), ctx.actor)),
  /** Open an engagement directly, for a client who did not come through the Business Health Check. */
  createDirect: staff.input(z.object({
    type: z.enum(ENGAGEMENT_TYPES),
    startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the start date."),
    /** The service bought, for an Assessment, Done for You or Monthly Service. */
    service: z.string().max(64).nullish(),
    /** An existing client's business: the project joins their account and nobody is invited. */
    businessId: id.nullish(),
    businessName: text(255).nullish(),
    contactName: text(200).nullish(),
    contactEmail: z.string().trim().email("Enter the client's email address.").max(320).nullish(),
  })).mutation(async ({ ctx, input }) => guarded(async () => createDirectEngagement(await engagementDb(), { ...ctx.actor, name: ctx.user?.name ?? null }, input))),
  /** The content board: add or update a reel, post or story; remove one. */
  saveContent: staff.input(z.object({
    engagementId: id, itemId: id.optional(), kind: z.enum(CONTENT_KINDS), title: text(200).min(1, "Give it a title."), month: z.number().int().min(1).max(12),
    status: z.enum(CONTENT_STATUSES), dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), link: z.string().trim().url("Paste the full link, starting https://").max(1024).nullable().or(z.literal("").transform(() => null)),
  })).mutation(async ({ ctx, input }) => guarded(async () => saveContentItem(await engagementDb(), ctx.actor, input))),
  deleteContent: staff.input(z.object({ itemId: id })).mutation(async ({ ctx, input }) => guarded(async () => deleteContentItem(await engagementDb(), ctx.actor, input))),
  /** Sort a file the client dropped: the Data Requests it answers (an empty list clears the match). */
  matchFile: staff.input(z.object({ fileId: id, taskIds: z.array(id).max(50) })).mutation(async ({ ctx, input }) => guarded(async () => matchFile(await engagementDb(), ctx.actor, input))),
  saveMeasure: staff.input(z.object({ engagementId: id, name: text(160).min(1, "Name the number."), definition: optionalText(2000), unit: optionalText(32), baselineValue: reading, targetValue: reading }))
    .mutation(async ({ ctx, input }) => guarded(async () => saveMeasure(await engagementDb(), ctx.actor, input))),
  saveCheckin: staff.input(z.object({
    engagementId: id, weekNumber: z.number().int().min(1).max(MAX_CHECKIN_WEEKS), heldOn: dateOnly, progress: optionalText(4000), blockers: optionalText(4000), nextStep: optionalText(4000),
    measureReading: reading, questionsAsked: optionalText(4000), hoursLead: hours, hoursAnalyst: hours, hoursPartner: hours, aiUsed: z.boolean().nullable(),
  })).mutation(async ({ ctx, input }) => guarded(async () => saveCheckin(await engagementDb(), ctx.actor, input))),
});

/**
 * The client's side. Authentication: a universal account session. Scope: the engagement of the business they are
 * working in, and only what was shared with them (server/engagements.ts); nothing here accepts a business id.
 */
const clientRouter = router({
  /** Null when the business has no engagement yet, or the room is not set up in the database yet. */
  room: accountProcedure.input(z.object({ engagementId: id.nullish() }).optional()).query(async ({ ctx, input }) => {
    try {
      return await getClientRoom(await engagementDb(), ctx.account, input?.engagementId);
    } catch (error) {
      if (isMissingEngagementTable(error)) return null;
      throw error;
    }
  }),
  respondToTask: accountProcedure.input(z.object({ taskId: id, note: optionalText(500) })).mutation(async ({ ctx, input }) => guarded(async () => respondToTask(await engagementDb(), ctx.account, input))),
  comment: accountProcedure.input(z.object({ deliverableId: id, body: text(4000).min(1, "Write your comment first.") })).mutation(async ({ ctx, input }) => { await enforceLimit(LIMITS.engagementComment, `account:${ctx.account.user.id}`); return guarded(async () => clientComment(await engagementDb(), ctx.account, input)); }),
  accept: accountProcedure.input(z.object({ deliverableId: id })).mutation(async ({ ctx, input }) => guarded(async () => acceptDeliverable(await engagementDb(), ctx.account, input))),
  setAudience: accountProcedure.input(z.object({ item: z.enum(["notes", "deliverable"]), id, audience: sharedAudience })).mutation(async ({ ctx, input }) => guarded(async () => setClientAudience(await engagementDb(), ctx.account, input))),
  requestUpload: accountProcedure.input(z.object({ taskId: id, ...upload })).mutation(async ({ ctx, input }) => { await enforceLimit(LIMITS.fileUpload, `account:${ctx.account.user.id}`); return guarded(async () => clientRequestUpload(await engagementDb(), ctx.account, input)); }),
  confirmUpload: accountProcedure.input(z.object({ taskId: id, storageKey, note: optionalText(500), ...upload })).mutation(async ({ ctx, input }) => guarded(async () => clientConfirmUpload(await engagementDb(), ctx.account, input))),
  fileLink: accountProcedure.input(z.object({ fileId: id })).mutation(async ({ ctx, input }) => guarded(async () => clientFileLink(await engagementDb(), ctx.account, input))),
  /** The drop box: send any file without saying which request it answers; the team sorts it. */
  requestDrop: accountProcedure.input(z.object({ ...upload, engagementId: id.nullish() })).mutation(async ({ ctx, input }) => { await enforceLimit(LIMITS.fileDrop, `account:${ctx.account.user.id}`); return guarded(async () => clientRequestDrop(await engagementDb(), ctx.account, input)); }),
  confirmDrop: accountProcedure.input(z.object({ storageKey, note: optionalText(500), ...upload, engagementId: id.nullish() })).mutation(async ({ ctx, input }) => guarded(async () => clientConfirmDrop(await engagementDb(), ctx.account, input))),
  /** "Fix the next problem": ask for another service; the desk confirms it. */
  requestService: accountProcedure.input(z.object({ service: z.string().min(1).max(64), note: optionalText(1000), engagementId: id.nullish() }))
    .mutation(async ({ ctx, input }) => { await enforceLimit(LIMITS.engagementComment, `account:${ctx.account.user.id}`); return guarded(async () => requestService(await engagementDb(), ctx.account, input)); }),
  /** Approve a reel, post or story, or ask for changes with a note. */
  respondToContent: accountProcedure.input(z.object({ itemId: id, approve: z.boolean(), note: optionalText(1000) })).mutation(async ({ ctx, input }) => guarded(async () => respondToContent(await engagementDb(), ctx.account, input))),
  /** "We don't have this", or take it back. */
  setNotAvailable: accountProcedure.input(z.object({ taskId: id, unavailable: z.boolean(), note: optionalText(500) })).mutation(async ({ ctx, input }) => guarded(async () => setNotAvailable(await engagementDb(), ctx.account, input))),
  /** Answer an item with a link to a shared folder (footage, large records); only the link is kept (R43). */
  answerWithLink: accountProcedure.input(z.object({ taskId: id, url: z.string().trim().min(1).max(2048) })).mutation(async ({ ctx, input }) => guarded(async () => answerWithLink(await engagementDb(), ctx.account, input))),
  /** Write in the conversation on an item the client is asked for (R78): anyone in the business who can see it. */
  taskComment: accountProcedure.input(z.object({ taskId: id, body: text(TASK_COMMENT_MAX).min(1, "Write your message first.") })).mutation(async ({ ctx, input }) => { await enforceLimit(LIMITS.engagementComment, `account:${ctx.account.user.id}`); return guarded(async () => clientTaskComment(await engagementDb(), ctx.account, input)); }),
  /** Take back a file the person sent, until the team has taken it in (R61). */
  removeFile: accountProcedure.input(z.object({ fileId: id })).mutation(async ({ ctx, input }) => guarded(async () => clientRemoveFile(await engagementDb(), ctx.account, input))),
});

/**
 * Finance: money across every client (payment requests and engagement fees). Authentication: the internal area. Seeing
 * it: view_financials. Recording money by hand, cancelling it, accepting a payment that needs a look, and recording or
 * cancelling a refund: manage_payments (Finance and the Super Admin, ET 10 November 2026), on any fee: Finance works
 * across every client. Writing off a fee, and reversing a write-off: write_off_fees (Partners and the Super Admin).
 */
const finance = adminProcedure.use(async ({ ctx, next }) => next({ ctx: { ...ctx, actor: { id: ctx.user!.id, authority: await loadAuthority(await engagementDb(), ctx.user!) } } }));
const financeRouter = router({
  list: finance.query(async ({ ctx }) => guarded(async () => listFinance(await engagementDb(), ctx.actor))),
  recordPayment: finance.input(z.object({
    feeLineId: id,
    amount: z.number().int("Whole naira only.").positive("Enter the amount received.").max(AGREEMENT_LIMITS.amount),
    receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the day the money arrived."),
    method: z.enum(["bank_transfer", "cash", "other"]),
    note: text(500).min(1, "Add the bank's reference, or say how the money came."),
  })).mutation(async ({ ctx, input }) => guarded(async () => recordPayment(await engagementDb(), ctx.actor, input))),
  cancelPayment: finance.input(z.object({ paymentId: id, reason: text(500).min(3, "Say why the payment is cancelled.") }))
    .mutation(async ({ ctx, input }) => guarded(async () => cancelPayment(await engagementDb(), ctx.actor, input))),
  acceptPayment: finance.input(z.object({ paymentId: id })).mutation(async ({ ctx, input }) => guarded(async () => acceptPayment(await engagementDb(), ctx.actor, input))),
  recordRefund: finance.input(z.object({
    paymentId: id,
    amount: z.number().int("Whole naira only.").positive("Enter the amount refunded.").max(AGREEMENT_LIMITS.amount),
    refundedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the day of the refund."),
    reason: text(500).min(3, "Say why the money was refunded."),
    reference: text(100).nullable(),
  })).mutation(async ({ ctx, input }) => guarded(async () => recordRefund(await engagementDb(), ctx.actor, input))),
  cancelRefund: finance.input(z.object({ refundId: id, reason: text(500).min(3, "Say why the refund is cancelled.") }))
    .mutation(async ({ ctx, input }) => guarded(async () => cancelRefund(await engagementDb(), ctx.actor, input))),
  writeOff: finance.input(z.object({ feeLineId: id, note: text(500).min(3, "Say why the fee is written off.") }))
    .mutation(async ({ ctx, input }) => guarded(async () => writeOff(await engagementDb(), ctx.actor, input))),
  reverseWriteOff: finance.input(z.object({ feeLineId: id, reason: text(500).min(3, "Say why the write-off is reversed.") }))
    .mutation(async ({ ctx, input }) => guarded(async () => reverseWriteOff(await engagementDb(), ctx.actor, input))),
});

export const engagementRouter = router({ staff: staffRouter, client: clientRouter, finance: financeRouter });
