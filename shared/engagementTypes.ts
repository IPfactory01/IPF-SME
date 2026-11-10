/**
 * Engagement types (ET, 6 November 2026): every client room has one structure (Overview; the work; what we found;
 * what you receive), and the type of engagement decides what fills it: the stages on the timeline, the starting Work
 * Plan and Data Request, and the Sessions. The team edits everything after the start; this is only where a new room
 * begins.
 *
 * Business Review is the engagement a paid Business Health Check opens (its template stays in shared/engagement.ts,
 * ASSESSMENT_TEMPLATE, with the seven-step method timeline). Digital marketing is the content programme run for a
 * client directly (the first is Crown Studio, from the JUMP programme), with the scope of the approved prototype:
 * 15 reels, 5 posts and 20 stories a month over 90 days, a weekly check-in and a review each month.
 */
import type { EngagementSessionKind, EngagementTaskPriority } from "./engagement";
import { PRODUCTS, type Product, type WayToBuy } from "./products";

/**
 * The types follow how the website sells (ET, 6 November 2026): an Assessment (the Business Review has its own type, with
 * the seven-step method), Done for You, the Six-Week Fix and a Monthly Service, each tied to the service bought; and
 * Digital Marketing, a Monthly Service on the website with its own type (the content programme). A client may have
 * several engagements over time, one per service they buy.
 */
export const ENGAGEMENT_TYPES = ["business_review", "digital_marketing", "assessment", "done_for_you", "six_week_fix", "monthly_service"] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];
export const ENGAGEMENT_TYPE_LABELS: Record<EngagementType, string> = {
  business_review: "Business Review", digital_marketing: "Digital Marketing", assessment: "Assessment", done_for_you: "Done for You", six_week_fix: "Six-Week Fix", monthly_service: "Monthly Service",
};

/** The types tied to a service on the website, and the way to buy each one covers. */
export const SERVICE_TYPES: Partial<Record<EngagementType, WayToBuy>> = { assessment: "assessment", done_for_you: "done_for_you", six_week_fix: "six_week_fix", monthly_service: "monthly_service" };
/** The product an engagement of this type is, where the type is one product: its fees and its place in the menu. */
export const TYPE_PRODUCT: Partial<Record<EngagementType, string>> = { business_review: "business_review", six_week_fix: "six_week_fix", digital_marketing: "digital_marketing" };
/** The engagement a product is delivered as: its own type where it has one (TYPE_PRODUCT), otherwise its way to buy's. */
export const engagementTypeOf = (product: Pick<Product, "id" | "way">): EngagementType =>
  (Object.keys(TYPE_PRODUCT) as EngagementType[]).find(type => TYPE_PRODUCT[type] === product.id) ?? product.way;
/** The services an engagement of this type can be for: the products delivered as it. The Business Health Check is free. */
export const servicesFor = (type: EngagementType): Product[] =>
  SERVICE_TYPES[type] ? PRODUCTS.filter(product => product.id !== "business_health_check" && engagementTypeOf(product) === type) : [];
/** The engagement's name for people: the service bought, or the type. */
export const engagementTitle = (type: EngagementType, service: string | null) => PRODUCTS.find(product => product.id === service)?.name ?? ENGAGEMENT_TYPE_LABELS[type];
/** Types whose stage the team moves through the method (setting up, assessment, the fix, the plan); every other type is open or closed. */
export const STAGED_TYPES: readonly EngagementType[] = ["business_review", "six_week_fix"];

/** A stage on a dated engagement: from and to are days from the start (day 0 is the start date). */
export type TypeStage = { title: string; summary: string; from: number; to: number };

type StarterItem = { title: string; detail: string; week: number; order: number; section?: string; ref?: string; priority?: EngagementTaskPriority; informs?: string; format?: string };
type StarterSession = { kind: EngagementSessionKind; title: string; week: number; order: number; durationMinutes: number; agenda: string };

export type DatedEngagementType = {
  /** Length in days; the room counts "Day N of M" against it. */
  durationDays: number;
  stages: TypeStage[];
  /** The monthly content the programme delivers, for the content board (built next). */
  monthly: { label: string; count: number }[];
  dataRequests: StarterItem[];
  clientActions: StarterItem[];
  teamActions: StarterItem[];
  sessions: StarterSession[];
};

export const DIGITAL_MARKETING: DatedEngagementType = {
  durationDays: 90,
  stages: [
    { title: "Onboarding", summary: "Brand assets, account access and the content plan for month 1.", from: 0, to: 6 },
    { title: "Month 1", summary: "Reels, posts and stories go out each week; you approve before anything is published.", from: 7, to: 29 },
    { title: "Month 1 review", summary: "What went out, who it reached, the enquiries and sales it brought, and what changes for month 2.", from: 30, to: 30 },
    { title: "Month 2", summary: "The second month's content, shaped by the month 1 numbers.", from: 31, to: 59 },
    { title: "Month 3", summary: "The third month's content, and the plan for after the quarter.", from: 60, to: 89 },
    { title: "Quarter review", summary: "The 90 days in numbers, and what support looks like from here.", from: 90, to: 90 },
  ],
  monthly: [{ label: "Reels", count: 15 }, { label: "Posts", count: 5 }, { label: "Stories", count: 20 }],
  dataRequests: [
    { week: 1, order: 1, section: "A Brand", ref: "A1", priority: "high", title: "Logo, colours and fonts", detail: "Whatever you use today: the logo files, and the colours and fonts if you have them.", informs: "So every reel and post looks like your business", format: "Any" },
    { week: 1, order: 2, section: "A Brand", ref: "A2", priority: "medium", title: "Past content that worked", detail: "Five to ten posts or videos you liked, yours or anyone's.", informs: "The style to build on", format: "Links or screenshots" },
    { week: 1, order: 3, section: "B Accounts", ref: "B1", priority: "high", title: "Access to your accounts", detail: "Instagram and Facebook through Meta Business Suite, TikTok, and your Google Business Profile. We send the steps for each. Never your password.", informs: "Posting, scheduling and the monthly numbers", format: "Partner or manager access" },
    { week: 1, order: 4, section: "C Offers", ref: "C1", priority: "high", title: "Your services and prices", detail: "What you sell, what each costs, and any offer you are running.", informs: "What the content sells", format: "A list or price board photo" },
    { week: 1, order: 5, section: "C Offers", ref: "C2", priority: "medium", title: "Your booking link and opening hours", detail: "Where a customer books, and when you are open.", informs: "The call to action in every post", format: "A link" },
  ],
  clientActions: [
    { week: 1, order: 6, priority: "high", title: "Send week 1 footage", detail: "Six or more vertical clips from this week. We edit within 48 hours of them arriving." },
    { week: 2, order: 1, priority: "high", title: "Approve the first reels", detail: "Nothing is published without your yes. Two rounds of changes are included." },
  ],
  teamActions: [
    { week: 1, order: 7, title: "Content plan for month 1", detail: "The reels, posts and stories for the month, by week, with the offers they carry." },
    { week: 1, order: 8, title: "Baseline numbers", detail: "Reach, engagement, enquiries and sales from each platform today, to measure against." },
  ],
  sessions: [
    { kind: "other", title: "Kick-off", week: 1, order: 0, durationMinutes: 45, agenda: "The 90 days, the content plan, who does what, and the access we need." },
    { kind: "check_in", title: "Weekly check-in", week: 2, order: 2, durationMinutes: 30, agenda: "What went out, what is next, anything to approve." },
    { kind: "review", title: "Month 1 review", week: 5, order: 1, durationMinutes: 45, agenda: "The month in numbers, and what changes for month 2." },
  ],
};

export const DATED_TYPES: Partial<Record<EngagementType, DatedEngagementType>> = { digital_marketing: DIGITAL_MARKETING };

/** Where a dated engagement stands on a given day: the day number and each stage's state. */
export function datedProgress(type: DatedEngagementType, startedOn: string, now: number) {
  const start = new Date(`${startedOn}T00:00:00+01:00`).getTime();
  const day = Math.max(0, Math.floor((now - start) / 86_400_000));
  const stages = type.stages.map(stage => ({ ...stage, state: day > stage.to ? "done" as const : day >= stage.from ? "now" as const : "next" as const }));
  return { day: Math.min(day + 1, type.durationDays), started: now >= start, stages };
}

// ---- The content board (Digital marketing) --------------------------------------------------------------------------

export const CONTENT_KINDS = ["reel", "post", "story"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];
export const CONTENT_KIND_LABELS: Record<ContentKind, string> = { reel: "Reel", post: "Post", story: "Story" };

/**
 * Where a piece of content stands: the team plans and edits it, the client approves it (or asks for changes), then it
 * goes out. Nothing is published without the client's approval.
 */
export const CONTENT_STATUSES = ["planned", "in_edit", "for_approval", "changes_requested", "approved", "published"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  planned: "Planned", in_edit: "In edit", for_approval: "For your approval", changes_requested: "Changes requested", approved: "Approved", published: "Published",
};
/** Counted towards the month's numbers once the client has approved it. */
export const CONTENT_COUNTED: readonly ContentStatus[] = ["approved", "published"];

/** The engagement month a day falls in (1 for days 1 to 30, and so on), capped at the programme's last month. */
export const monthOfDay = (day: number, durationDays: number) => Math.min(Math.max(1, Math.ceil(durationDays / 30)), Math.max(1, Math.ceil(day / 30)));


// ---- Service engagements (Assessment, Done for You, Monthly Service) ----------------------------------------------------

/**
 * Where a service engagement stands, read from its work rather than set by hand: the records first, then the work,
 * then the Deliverable shared, then the client's Sign-off.
 */
export const SERVICE_STEPS = ["Records in", "In progress", "Delivered", "Sign-off"] as const;
export function serviceStep(input: { recordsOpen: number; shared: number; accepted: number; closed: boolean }): number {
  if (input.closed || (input.shared > 0 && input.accepted >= input.shared)) return 4;
  if (input.shared > 0) return 3;
  if (input.recordsOpen > 0) return 1;
  return 2;
}

/**
 * Where a service engagement begins: the records and questions the service asks for on the website become the Data
 * Request, the team's drafting and review are on the Work Plan, and there is a Kick-off and a Handover call (every piece
 * of work ends with one).
 */
export function serviceStarter(product: Product): Pick<DatedEngagementType, "dataRequests" | "clientActions" | "teamActions" | "sessions"> {
  const records = product.intake.records.map((record, index) => ({ week: 1, order: index + 1, section: "A Records", ref: `A${index + 1}`, priority: (record.required ? "high" : "medium") as EngagementTaskPriority, title: record.label, detail: record.detail }));
  const questions = product.intake.questions.map((question, index) => ({ week: 1, order: records.length + index + 1, section: "B Questions", ref: `B${index + 1}`, priority: (question.required ? "high" : "medium") as EngagementTaskPriority, title: question.label, detail: question.hint ?? "Answer in a few lines; a voice note is fine.", format: "A short answer" }));
  return {
    dataRequests: [...records, ...questions],
    clientActions: [],
    teamActions: [
      { week: 1, order: 20, title: `Draft the ${product.name}`, detail: "From the records and answers, once they are complete." },
      { week: 2, order: 21, title: "Consultant review", detail: "A named consultant checks the work before the client sees it." },
    ],
    sessions: [
      { kind: "other", title: "Kick-off", week: 1, order: 0, durationMinutes: 30, agenda: `What the ${product.name} is for, the records we need, and the delivery date.` },
      { kind: "review", title: "Handover", week: 3, order: 1, durationMinutes: 45, agenda: `Walk through the ${product.name}, answer questions, agree what to do next.` },
    ],
  };
}
