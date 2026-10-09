import { CURRENT_STATE } from "./businessSupport";

/**
 * The engagement room: one record per paying client, from the Current State Assessment to the plan (concept note §17,
 * PRD F7 and F8). One source of truth for its vocabulary, the stage templates and who sees what. The database stores
 * the identifiers below; people only ever see the labels.
 *
 * Principles agreed on 9 October 2026 (PRD §9):
 *  1. The fix is one problem with one measure; a second problem is the next fix, not a second workstream.
 *  2. Show the client only what the team will keep current: where we are, what we need, what we found.
 *  3. Session notes and findings are for the owner by default; the owner decides what their staff see.
 *  4. Bookings stay on Calendly, conversation on WhatsApp, the team's internal tasks in ClickUp.
 *  5. One free seat for the owner's coordinator; no paid seats in the pilot.
 */

export const ENGAGEMENT_STAGES = ["setting_up", "assessment", "fix", "plan", "closed"] as const;
export type EngagementStage = (typeof ENGAGEMENT_STAGES)[number];

export const ENGAGEMENT_STAGE_LABELS: Record<EngagementStage, string> = {
  setting_up: "Getting set up",
  assessment: CURRENT_STATE.name,
  fix: "The fix",
  plan: "Your plan",
  closed: "Closed",
};

/** What each stage means for the client, in the room's journey. */
export const ENGAGEMENT_STAGE_SUMMARIES: Record<EngagementStage, string> = {
  setting_up: "Three working days: we send what we need from you, name your team and book both calls.",
  assessment: CURRENT_STATE.what,
  fix: "One problem and one number to move. You do the work; we tell you what to do and check it every week.",
  plan: "The plan in your hands, and what support looks like from here.",
  closed: "This engagement is closed.",
};

/** Roles on an engagement team. Separate from platform roles: a role says what kind of person, this says which job here. */
export const ENGAGEMENT_TEAM_ROLES = ["lead", "analyst", "partner", "expert"] as const;
export type EngagementTeamRole = (typeof ENGAGEMENT_TEAM_ROLES)[number];
export const ENGAGEMENT_TEAM_ROLE_LABELS: Record<EngagementTeamRole, string> = { lead: "Engagement lead", analyst: "Analyst", partner: "Partner", expert: "Specialist" };

/**
 * Who may see an item. `team` is IP Factory only. `owner` is the owner (and any business admin) plus the team: the
 * default for session notes and findings, because owners speak frankly on our calls. `business` adds the owner's
 * staff who have full access.
 */
export const ENGAGEMENT_AUDIENCES = ["team", "owner", "business"] as const;
export type EngagementAudience = (typeof ENGAGEMENT_AUDIENCES)[number];
export const ENGAGEMENT_AUDIENCE_LABELS: Record<EngagementAudience, string> = { team: "IP Factory only", owner: "Owner only", business: "Owner and their team" };

/** The owner's staff: `full` sees everything shared with the business; `contributor` sees only what is assigned to them. */
export const CLIENT_ACCESS_LEVELS = ["full", "contributor"] as const;
export type ClientAccessLevel = (typeof CLIENT_ACCESS_LEVELS)[number];
export const CLIENT_ACCESS_LABELS: Record<ClientAccessLevel, { name: string; detail: string }> = {
  full: { name: "Full", detail: "Sees everything you share with your team. Cannot pay or add people." },
  contributor: { name: "Contributor", detail: "Sees only the requests, actions and calls given to them." },
};

/** Seats for the owner's staff included at no cost. A setting, not a price: paid seats are not part of the pilot. */
export const TEAM_SEATS_INCLUDED = 1;

export const ENGAGEMENT_SESSION_KINDS = ["assessment_call", "check_in", "review", "other"] as const;
export type EngagementSessionKind = (typeof ENGAGEMENT_SESSION_KINDS)[number];
export const ENGAGEMENT_SESSION_KIND_LABELS: Record<EngagementSessionKind, string> = { assessment_call: `${CURRENT_STATE.name} call`, check_in: "Weekly check-in", review: "Review", other: "Call" };

export const ENGAGEMENT_SESSION_STATUSES = ["planned", "held", "cancelled"] as const;
export type EngagementSessionStatus = (typeof ENGAGEMENT_SESSION_STATUSES)[number];

/** A data request is something we need from the client; an action is something someone agreed to do by a date. */
export const ENGAGEMENT_TASK_KINDS = ["data_request", "action"] as const;
export type EngagementTaskKind = (typeof ENGAGEMENT_TASK_KINDS)[number];
export const ENGAGEMENT_TASK_SIDES = ["client", "ipf"] as const;
export type EngagementTaskSide = (typeof ENGAGEMENT_TASK_SIDES)[number];

/**
 * open: not done yet · received: the client sent it, we have not checked · accepted: it is what we needed ·
 * needs_more: we need more (the note says what) · done: an action is finished · cancelled: no longer needed.
 */
export const ENGAGEMENT_TASK_STATUSES = ["open", "received", "accepted", "needs_more", "done", "cancelled"] as const;
export type EngagementTaskStatus = (typeof ENGAGEMENT_TASK_STATUSES)[number];
export const ENGAGEMENT_TASK_STATUS_LABELS: Record<EngagementTaskStatus, string> = { open: "To do", received: "Sent, we are checking", accepted: "Received", needs_more: "We need a bit more", done: "Done", cancelled: "No longer needed" };

/** Statuses that still ask something of whoever owns the task. */
export const OPEN_TASK_STATUSES: readonly EngagementTaskStatus[] = ["open", "needs_more"];

export const ENGAGEMENT_DELIVERABLE_KINDS = ["findings", "problem_statement", "prescription", "tools", "plan", "other"] as const;
export type EngagementDeliverableKind = (typeof ENGAGEMENT_DELIVERABLE_KINDS)[number];
export const ENGAGEMENT_DELIVERABLE_KIND_LABELS: Record<EngagementDeliverableKind, string> = { findings: "Findings", problem_statement: "Problem statement", prescription: "Prescription", tools: "Tools", plan: "Plan", other: "Document" };

/** O3: the desk lead approves every prescription and plan before the client sees it. */
export const DELIVERABLES_NEEDING_APPROVAL: readonly EngagementDeliverableKind[] = ["prescription", "plan"];

export const ENGAGEMENT_DELIVERABLE_STATUSES = ["draft", "awaiting_approval", "approved", "shared"] as const;
export type EngagementDeliverableStatus = (typeof ENGAGEMENT_DELIVERABLE_STATUSES)[number];

/**
 * What a new engagement starts with (the Current State Assessment template). The data requests are the concept
 * note's onboarding list, so the first call is analysis, not collection. The team edits, adds or cancels items.
 */
export const ASSESSMENT_TEMPLATE = {
  dataRequests: [
    { title: "Your last 12 months of sales", detail: "Monthly totals are enough: a spreadsheet, your sales book or a bank statement export." },
    { title: "What you spend each month", detail: "Rent, salaries, stock, transport and anything else that goes out regularly. Estimates are fine." },
    { title: "Your price list", detail: "What you sell and what you charge for each, or how you work out a price." },
    { title: "Who works in the business", detail: "Names or roles, what each person does, and who they report to." },
    { title: "Anything you already track", detail: "Reports, dashboards or notebooks you look at to run the business. Skip this if there is nothing." },
  ],
  sessions: [
    { kind: "assessment_call" as const, title: `${CURRENT_STATE.name} call 1`, durationMinutes: 90 },
    { kind: "assessment_call" as const, title: `${CURRENT_STATE.name} call 2`, durationMinutes: 90 },
  ],
} as const;

/** The client's journey, in order, with where they are now. */
export function journeyOf(stage: EngagementStage) {
  const steps = ENGAGEMENT_STAGES.filter(item => item !== "closed");
  const at = stage === "closed" ? steps.length : steps.indexOf(stage);
  return steps.map((item, index) => ({ stage: item, label: ENGAGEMENT_STAGE_LABELS[item], summary: ENGAGEMENT_STAGE_SUMMARIES[item], state: index < at ? "done" as const : index === at ? "current" as const : "next" as const }));
}

/** How the client side of a viewer relates to the business: owner-level, a full-access member, or a contributor. */
export type ClientViewer = { kind: "owner" } | { kind: "member"; access: ClientAccessLevel; userId: number };

/** Whether a client viewer may see an item shared with `audience` (the team always may; that is checked elsewhere). */
export function clientCanSee(audience: EngagementAudience, viewer: ClientViewer): boolean {
  if (audience === "team") return false;
  if (viewer.kind === "owner") return true;
  return audience === "business" && viewer.access === "full";
}

/** Whether a client viewer sees a task: owners and full members see every client-side task; contributors only their own. */
export function clientCanSeeTask(task: { side: EngagementTaskSide; assigneeUserId: number | null }, viewer: ClientViewer): boolean {
  if (task.side !== "client") return viewer.kind === "owner" || viewer.access === "full";
  if (viewer.kind === "owner" || viewer.access === "full") return true;
  return task.assigneeUserId === viewer.userId;
}
