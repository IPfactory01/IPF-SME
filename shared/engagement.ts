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
  fix: "The Fix",
  plan: "Your Plan",
  closed: "Closed",
};

/** What each stage means for the client, in the room's journey. */
export const ENGAGEMENT_STAGE_SUMMARIES: Record<EngagementStage, string> = {
  setting_up: "Three working days: we send your Data Requests, name your team and book both Sessions.",
  assessment: CURRENT_STATE.what,
  fix: "One problem and one Measure of Success. You do the work; we give you the Prescription and check it at a Weekly Check-in.",
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
  contributor: { name: "Contributor", detail: "Sees only the Data Requests, actions and Sessions given to them." },
};

/** Seats for the owner's staff included at no cost. A setting, not a price: paid seats are not part of the pilot. */
export const TEAM_SEATS_INCLUDED = 1;

export const ENGAGEMENT_SESSION_KINDS = ["assessment_call", "check_in", "review", "other"] as const;
export type EngagementSessionKind = (typeof ENGAGEMENT_SESSION_KINDS)[number];
export const ENGAGEMENT_SESSION_KIND_LABELS: Record<EngagementSessionKind, string> = { assessment_call: `${CURRENT_STATE.name} Session`, check_in: "Weekly Check-in", review: "Review", other: "Session" };

export const ENGAGEMENT_SESSION_STATUSES = ["planned", "held", "cancelled"] as const;
export type EngagementSessionStatus = (typeof ENGAGEMENT_SESSION_STATUSES)[number];

/** A data request is something we need from the client; an action is something someone agreed to do by a date. */
export const ENGAGEMENT_TASK_KINDS = ["data_request", "action"] as const;
export type EngagementTaskKind = (typeof ENGAGEMENT_TASK_KINDS)[number];
export const ENGAGEMENT_TASK_SIDES = ["client", "ipf"] as const;
export type EngagementTaskSide = (typeof ENGAGEMENT_TASK_SIDES)[number];
export const ENGAGEMENT_TASK_SIDE_LABELS: Record<EngagementTaskSide, string> = { client: "You", ipf: "IP Factory" };

/**
 * The Current State Assessment tests both internal and external factors (ET, 10 October): internal is the business
 * itself (numbers, prices, people, how the week runs); external is around it (customers, competitors, the market).
 */
export const ENGAGEMENT_TASK_FACTORS = ["internal", "external"] as const;
export type EngagementTaskFactor = (typeof ENGAGEMENT_TASK_FACTORS)[number];
export const ENGAGEMENT_TASK_FACTOR_LABELS: Record<EngagementTaskFactor, string> = { internal: "Internal", external: "External" };

/** The Current State Assessment runs two weeks; the fix six. The room counts days and weeks against these. */
export const ASSESSMENT_WEEKS = 2;
export const ASSESSMENT_DAYS = 14;

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
export const ENGAGEMENT_DELIVERABLE_KIND_LABELS: Record<EngagementDeliverableKind, string> = { findings: "Findings", problem_statement: "Problem Statement", prescription: "Prescription", tools: "Tools", plan: "Plan", other: "Document" };

/** O3: the desk lead approves every prescription and plan before the client sees it. */
export const DELIVERABLES_NEEDING_APPROVAL: readonly EngagementDeliverableKind[] = ["prescription", "plan"];

export const ENGAGEMENT_DELIVERABLE_STATUSES = ["draft", "awaiting_approval", "approved", "shared"] as const;
export type EngagementDeliverableStatus = (typeof ENGAGEMENT_DELIVERABLE_STATUSES)[number];

/**
 * What a new engagement starts with (the Current State Assessment template), drawn from how IP Factory's own
 * assessment proposals scope the work, cut down for a two-week, two-call engagement. The data requests follow the
 * concept note's onboarding list, so the first call is analysis, not collection. The team edits, adds or cancels items.
 */
export const ASSESSMENT_TEMPLATE = {
  /** What we need from the client, by week. Week 1 is due in three working days, week 2 in eight. */
  dataRequests: [
    { week: 1, order: 1, factor: "internal" as const, title: "Six quick questions before your first Session", detail: "A few words each is enough. 1. What do you sell, and who buys it? 2. At month end, how do you know whether you made money? 3. Does more than one business run through the same account? 4. Which decisions wait for you? 5. What happens when you are away for a week? 6. If you could fix one thing in three months, what would it be?" },
    { week: 1, order: 2, factor: "internal" as const, title: "Your sales for the last 12 months", detail: "Month by month. A sales book, a till report or photos of your records all work." },
    { week: 1, order: 3, factor: "internal" as const, title: "What you spend each month", detail: "Rent, salaries, stock, power, fuel and loan repayments. A rough list is fine." },
    { week: 1, order: 4, factor: "internal" as const, title: "Your price list", detail: "What you charge for each product or service, and the discounts you give." },
    { week: 1, order: 5, factor: "internal" as const, title: "Who works in the business", detail: "Each role, what they do and what they are paid. Names are optional." },
    { week: 2, order: 1, factor: "internal" as const, title: "Bank statements for the last 6 months", detail: "The business account, and any personal account that business money passes through." },
    { week: 2, order: 2, factor: "internal" as const, title: "Money owed to you, and money you owe", detail: "Unpaid customer bills, supplier debts and loans." },
    { week: 2, order: 3, factor: "internal" as const, title: "Anything you already track", detail: "Spreadsheets, notebooks or app reports. Send them as they are." },
    { week: 2, order: 4, factor: "external" as const, title: "Ten customers: why they buy, and why some stopped", detail: "Names are optional. A line each is enough; we may call two or three of them with you." },
  ],
  /** What the team does in the Work Plan, so the client sees our side of the two weeks as well as theirs. */
  teamActions: [
    { week: 1, order: 6, factor: "external" as const, title: "Your three main competitors and what they charge", detail: "From their price lists, their customers and a visit where we can." },
    { week: 2, order: 5, factor: "internal" as const, title: "Profit by product or outlet, from your numbers", detail: "What each line of the business actually makes once its own costs are counted." },
  ],
  sessions: [
    {
      week: 1,
      order: 7,
      kind: "assessment_call" as const,
      title: `${CURRENT_STATE.name} Session 1`,
      durationMinutes: 90,
      agenda: "Your business today.\n0 to 10 min: welcome, and what the two weeks look like.\n10 to 35: your business in your words, starting from your six answers.\n35 to 65: the numbers: sales, costs and prices, and the gaps we fill together.\n65 to 85: how the business runs: a normal week, who does what, what waits for you.\n85 to 90: what is still missing, and the date of Session 2.",
    },
    {
      week: 2,
      order: 6,
      kind: "assessment_call" as const,
      title: `${CURRENT_STATE.name} Session 2`,
      durationMinutes: 90,
      agenda: "The one problem to fix first.\n0 to 10 min: what we looked at, and what we could not check.\n10 to 40: what we found: the numbers, how the business runs, the problems we see.\n40 to 60: the one problem to fix first, tested against your view.\n60 to 80: what to do about it: the first steps, the tools, and who owns each.\n80 to 90: what happens next, and when it will all be in your room.",
    },
  ],
} as const;

/** The standard shape of the findings deliverable. The team starts from it and edits; headings only, no content. */
export const FINDINGS_OUTLINE = [
  "1. Problem Statement: the one problem to fix first",
  "2. Your business at a glance",
  "3. What the numbers say: sales, costs, profit by product or service, cash, money owed",
  "4. How the business runs: who does what, and what waits for you",
  "5. Your customers and prices",
  "6. Other problems we found, for later",
  "7. What we looked at, and what we could not check",
].join("\n\n");

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

// ---- Files -----------------------------------------------------------------------------------------------------------

export const UPLOAD_MAX_MB = 25;
export const UPLOAD_MAX_BYTES = UPLOAD_MAX_MB * 1024 * 1024;

/** What the room accepts: the documents, photos and spreadsheets a data request asks for. Keyed by extension. */
export const UPLOAD_TYPES: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  heic: ["image/heic", "image/heif"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  xls: ["application/vnd.ms-excel"],
  csv: ["text/csv", "application/vnd.ms-excel", "text/plain"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  doc: ["application/msword"],
  txt: ["text/plain"],
};
export const UPLOAD_ACCEPT = Object.keys(UPLOAD_TYPES).map(extension => `.${extension}`).join(",");

const extensionOf = (fileName: string) => fileName.toLowerCase().split(".").pop() ?? "";

/** Allowed when the extension is known and the browser's type agrees (or says nothing, as some phones do). */
export function isAllowedUploadType(contentType: string, fileName: string) {
  const types = UPLOAD_TYPES[extensionOf(fileName)];
  if (!types) return false;
  return !contentType || contentType === "application/octet-stream" || types.includes(contentType.toLowerCase());
}

/** A storage-safe name: no path, no odd characters, at most 100 characters, the extension kept. */
export function safeFileName(fileName: string) {
  const base = fileName.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
  if (cleaned.length <= 100) return cleaned;
  const extension = extensionOf(cleaned);
  return `${cleaned.slice(0, 100 - extension.length - 1)}.${extension}`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

// ---- The fix: the one number and the weekly check-in -----------------------------------------------------------------

/** The fix runs up to six weeks; a free extension can add a few more. One check-in row per week. */
export const FIX_WEEKS = 6;
export const MAX_CHECKIN_WEEKS = 12;

/** The five questions every weekly check-in answers (concept note §17), in the order they are asked. */
export const CHECKIN_QUESTIONS = [
  { key: "progress", label: "What moved this week?" },
  { key: "blockers", label: "What got in the way?" },
  { key: "nextStep", label: "What is the next step, and by when?" },
  { key: "measureReading", label: "What does the Measure of Success say this week?" },
  { key: "questionsAsked", label: "What did the owner ask?" },
] as const;

/** "₦150,000", "12%", "3.5 days" or "—". */
export function formatMeasure(value: number | string | null | undefined, unit?: string | null) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  const text = Number.isFinite(number) ? number.toLocaleString("en-GB", { maximumFractionDigits: 2 }) : String(value);
  if (!unit) return text;
  if (unit === "₦") return `₦${text}`;
  if (unit === "%") return `${text}%`;
  return `${text} ${unit}`;
}
