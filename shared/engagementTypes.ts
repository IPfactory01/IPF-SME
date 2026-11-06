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

export const ENGAGEMENT_TYPES = ["business_review", "digital_marketing"] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];
export const ENGAGEMENT_TYPE_LABELS: Record<EngagementType, string> = { business_review: "Business Review", digital_marketing: "Digital marketing" };

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
    { title: "Month 1 review", summary: "What went out, what it reached, and what changes for month 2.", from: 30, to: 30 },
    { title: "Month 2", summary: "The second month's content, shaped by the month 1 numbers.", from: 31, to: 59 },
    { title: "Month 3", summary: "The third month's content, and the plan for after the quarter.", from: 60, to: 89 },
    { title: "Quarter review", summary: "The 90 days in numbers, and what support looks like from here.", from: 90, to: 90 },
  ],
  monthly: [{ label: "Reels", count: 15 }, { label: "Posts", count: 5 }, { label: "Stories", count: 20 }],
  dataRequests: [
    { week: 1, order: 1, section: "A Brand", ref: "A1", priority: "high", title: "Logo, colours and fonts", detail: "Whatever you use today: the logo files, and the colours and fonts if you have them.", informs: "So every reel and post looks like your business", format: "Any" },
    { week: 1, order: 2, section: "A Brand", ref: "A2", priority: "medium", title: "Past content that worked", detail: "Five to ten posts or videos you liked, yours or anyone's.", informs: "The style to build on", format: "Links or screenshots" },
    { week: 1, order: 3, section: "B Accounts", ref: "B1", priority: "high", title: "Access to your Instagram and Facebook", detail: "Add us as a partner in Meta Business Suite; we send the steps. Never your password.", informs: "Posting, scheduling and the monthly numbers", format: "Partner access" },
    { week: 1, order: 4, section: "C Offers", ref: "C1", priority: "high", title: "Your services and prices", detail: "What you sell, what each costs, and any offer you are running.", informs: "What the content sells", format: "A list or price board photo" },
    { week: 1, order: 5, section: "C Offers", ref: "C2", priority: "medium", title: "Your booking link and opening hours", detail: "Where a customer books, and when you are open.", informs: "The call to action in every post", format: "A link" },
  ],
  clientActions: [
    { week: 1, order: 6, priority: "high", title: "Send week 1 footage", detail: "Six or more vertical clips from this week. We edit within 48 hours of them arriving." },
    { week: 2, order: 1, priority: "high", title: "Approve the first reels", detail: "Nothing is published without your yes. Two rounds of changes are included." },
  ],
  teamActions: [
    { week: 1, order: 7, title: "Content plan for month 1", detail: "The reels, posts and stories for the month, by week, with the offers they carry." },
    { week: 1, order: 8, title: "Baseline numbers", detail: "Followers, reach and bookings from Instagram today, to measure against." },
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
