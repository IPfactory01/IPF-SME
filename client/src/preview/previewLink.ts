/**
 * Stand-in for the server in the static preview build (`pnpm build:preview`).
 * Answers the public calls the way the real server would, without saving or sending anything,
 * so the site can be clicked through without hosting, a database or credentials.
 */
import { TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "../../../server/routers";
import { deriveDiagnostic, type DiagnosticInput } from "../../../server/diagnostic";
import { BRAND } from "@shared/brand";
import { PRICES } from "@shared/businessSupport";
import { evaluate, nextStep } from "@shared/businessCheck/engine";
import type { Answers } from "@shared/businessCheck/questions";
import { journeyOf } from "@shared/engagement";
import { buildFullReport } from "@shared/fullReport/build";
import { roomInsight } from "@shared/fullReport/insight";
import type { ReportIntake } from "@shared/fullReport/intake";

const PREVIEW_NOTICE = "This is a preview: nothing was saved or sent.";

type Responder = (input: unknown) => unknown;

/** The preview's "Client room" page shows a signed-in owner; every other page is signed out. */
export const previewSession = { signedIn: false };

const day = (offset: number, hour = 10) => new Date(Date.UTC(2026, 9, 23 + offset, hour - 1));
const SAMPLE_OWNER = {
  user: { id: 1, fullName: "Ada Okafor", email: "ada@example.com", status: "active" },
  platformRoles: [],
  permissions: [],
  memberships: [{ businessId: 1, businessName: "Ada Foods", role: "owner", status: "active", profileComplete: false, profilePercent: 60 }],
  activeBusiness: { businessId: 1, businessName: "Ada Foods", role: "owner", status: "active", profileComplete: false, profilePercent: 60 },
  landingPath: "/dashboard",
};
/** Ada Foods' Business Health Check: the fixed answers below, every other question answered with its second option. */
function sampleAnswers(): Answers {
  const answers: Answers = { p_stage: "operating", p_type: "maker", p_sector: "food and drink", p_age: "2to5", p_staff: "6to10", p_revenue: "3to5m", p_trend: "flat", f_instinct: "I", f_seen: "D", f_finance: ["cash"], p_name: "Ada Foods" };
  for (let guard = 0; guard < 100; guard++) {
    const step = nextStep(answers);
    if (!step) break;
    const { question } = step;
    if (question.kind === "text") { answers[question.id] = "A kitchen, two outlets and a delivery van in Lagos"; continue; }
    const option = question.options[Math.min(1, question.options.length - 1)];
    answers[question.id] = question.kind === "multi" ? [option.value] : option.value;
  }
  return answers;
}
/** Ada Foods' Report Intake. A fictional business. */
const SAMPLE_INTAKE: ReportIntake = {
  location: "A kitchen in Surulere and two outlets in Lagos, with deliveries by van",
  registration: "business_name",
  products: [
    { name: "Lunch packs", basis: "price", price: 3_500, percent: null, dealSize: null },
    { name: "Party trays", basis: "price", price: 45_000, percent: null, dealSize: null },
    { name: "Office catering", basis: "varies", price: null, percent: null, dealSize: null },
  ],
  bestCustomer: "Offices in Yaba that order lunch for their staff every weekday",
  competitors: ["Two kitchens on the same street", "Delivery apps"],
  pricePosition: "lower",
  topEarner: 0,
  costShare: "50_75",
  marginPercent: null,
  topCustomerShare: "20_50",
  channels: ["word_of_mouth", "walk_in", "social_media"],
  enquiries: "50_200",
  conversion: 3,
  repeat: "occasionally",
  roles: "Me (buying and the big customers), a cook, two outlet staff and a driver",
  tools: ["whatsapp", "paper"],
  lastMonthRevenue: 4_000_000,
  monthlyCosts: 3_700_000,
  biggestCost: "stock",
  cash: "500k_2m",
  owed: "under_1m",
  loans: "none",
  goal: "Open a third outlet and pay salaries on the 25th from the business account",
  revenueTarget: 7_000_000,
};
let sampleInsight: ReturnType<typeof roomInsight> | undefined;
/** The Founder and Business tabs, from a Full Report built the way the live site builds it. */
function previewInsight() {
  if (sampleInsight === undefined) {
    const answers = sampleAnswers();
    const result = evaluate(answers);
    const report = buildFullReport({ reference: "TS-R-000001", date: day(-12), contact: { fullName: "Ada Okafor", businessName: "Ada Foods" }, answers, result, intake: SAMPLE_INTAKE });
    sampleInsight = roomInsight({ report, result: null });
  }
  return sampleInsight;
}

/** A client on day four of the Business Review: what an owner sees in their room. Sample data only. */
const SAMPLE_ROOM = {
  engagementId: 1,
  uploadsEnabled: false,
  businessName: "Ada Foods",
  viewer: { kind: "owner" },
  stage: "assessment",
  stageLabel: "Business Review",
  journey: journeyOf("assessment"),
  createdAt: day(-7),
  assessmentStartedAt: day(-4, 8),
  fixStartedAt: null,
  closedAt: null,
  check: { primaryArea: 2, readiness: "intermediate", completedAt: day(-14), reportRequestedAt: day(-13), callRequestedAt: day(-14), callScheduledFor: day(-10, 14) },
  report: { requestedAt: day(-13), deliveredAt: day(-12) },
  debrief: { heldAt: day(-10, 14), heard: "Two outlets, a kitchen and a van. Sales of about ₦4,000,000 a month, steady for a year.\nMoney runs out in week three; the second outlet's takings pay salaries.\nPrices were last set in 2024. Delivery is charged by guess.", problemInOwnerWords: "I want to pay salaries on the 25th without moving money around, and know which outlet actually makes money.", successLooksLike: "Salaries paid on the 25th from the business account, three months running.", tried: "A bookkeeper for three months in 2025. Stopped when the reports came late.", nextSteps: "The Full Report, then the Business Review from Monday 19 October.", sharedAt: day(-10, 16) },
  problemStatement: null,
  booking: null,
  measure: null,
  team: [{ name: "Femi Adebayo", roleLabel: "Engagement lead" }, { name: "Ngozi Eze", roleLabel: "Analyst" }],
  nextSession: { id: 1, title: "Business Review Session 1", scheduledFor: day(0), durationMinutes: 90, meetingLink: "https://zoom.us/" },
  sessions: [
    { id: 1, title: "Business Review Session 1", scheduledFor: day(0), durationMinutes: 90, meetingLink: "https://zoom.us/", status: "planned", weekNumber: 1, sortOrder: 7, agenda: "Your business today: your six answers, the numbers, and how a normal week runs.", notes: null, notesSharedAt: null, notesAudience: null },
    { id: 2, title: "Business Review Session 2", scheduledFor: day(7), durationMinutes: 90, meetingLink: null, status: "planned", weekNumber: 2, sortOrder: 6, agenda: "What we found, and the one problem to fix first.", notes: null, notesSharedAt: null, notesAudience: null },
  ],
  tasks: [
    { id: 1, kind: "data_request", side: "client", title: "Six quick questions before your first Session", detail: null, dueOn: "2026-10-21", status: "accepted", statusLabel: "Received", statusNote: null, mine: false, weekNumber: 1, sortOrder: 1, factor: "internal", files: [] },
    { id: 2, kind: "data_request", side: "client", title: "Your sales for the last 12 months", detail: null, dueOn: "2026-10-21", status: "accepted", statusLabel: "Received", statusNote: null, mine: false, weekNumber: 1, sortOrder: 2, factor: "internal", files: [] },
    { id: 3, kind: "data_request", side: "client", title: "What you spend each month", detail: "Rent, salaries, stock, power, fuel and loan repayments. A rough list is fine.", dueOn: "2026-10-22", status: "open", statusLabel: "To do", statusNote: null, mine: false, weekNumber: 1, sortOrder: 3, factor: "internal", files: [] },
    { id: 4, kind: "data_request", side: "client", title: "Your price list", detail: "What you charge for each product or service, and the discounts you give.", dueOn: "2026-10-22", status: "needs_more", statusLabel: "We need a bit more", statusNote: "the delivery charges too", mine: false, weekNumber: 1, sortOrder: 4, factor: "internal", files: [] },
    { id: 5, kind: "data_request", side: "client", title: "Who works in the business", detail: null, dueOn: "2026-10-22", status: "accepted", statusLabel: "Received", statusNote: null, mine: false, weekNumber: 1, sortOrder: 5, factor: "internal", files: [] },
    { id: 6, kind: "action", side: "ipf", title: "Your three main competitors and what they charge", detail: null, dueOn: "2026-10-23", status: "open", statusLabel: "To do", statusNote: null, mine: false, weekNumber: 1, sortOrder: 6, factor: "external", files: [] },
    { id: 7, kind: "data_request", side: "client", title: "Bank statements for the last 6 months", detail: null, dueOn: "2026-10-28", status: "open", statusLabel: "To do", statusNote: null, mine: false, weekNumber: 2, sortOrder: 1, factor: "internal", files: [] },
    { id: 8, kind: "data_request", side: "client", title: "Money owed to you, and money you owe", detail: null, dueOn: "2026-10-28", status: "open", statusLabel: "To do", statusNote: null, mine: false, weekNumber: 2, sortOrder: 2, factor: "internal", files: [] },
    { id: 9, kind: "data_request", side: "client", title: "Ten customers: why they buy, and why some stopped", detail: "Names are optional. A line each is enough.", dueOn: "2026-10-29", status: "open", statusLabel: "To do", statusNote: null, mine: false, weekNumber: 2, sortOrder: 4, factor: "external", files: [] },
    { id: 10, kind: "action", side: "ipf", title: "Profit by product or outlet, from your numbers", detail: null, dueOn: "2026-10-28", status: "open", statusLabel: "To do", statusNote: null, mine: false, weekNumber: 2, sortOrder: 5, factor: "internal", files: [] },
  ],
  deliverables: [],
};
const SAMPLE_SEATS = { included: 1, used: 0, members: [], invitations: [] };

const responders: Record<string, Responder> = {
  "auth.me": () => null,
  "account.me": () => (previewSession.signedIn ? SAMPLE_OWNER : null),
  "engagement.client.room": () => (previewSession.signedIn ? { ...SAMPLE_ROOM, insight: previewInsight() } : null),
  "invitations.seats.list": () => SAMPLE_SEATS,
  "registration.capacity": () => ({ boardroomCount: 0 }),
  "registration.submit": (input) => {
    const diagnostic = (input as { diagnostic?: DiagnosticInput }).diagnostic;
    return {
      success: true,
      status: "Pending",
      bookingToken: "preview",
      diagnostic: diagnostic ? deriveDiagnostic(diagnostic) : undefined,
      emailStatus: "Simulated",
      message: `Your answers were received. ${PREVIEW_NOTICE}`,
    };
  },
  "registration.requestPortalLink": () => ({ success: true }),
  "businessCheck.prices": () => PRICES,
  "businessCheck.start": () => ({ token: "preview-token-0000000000" }),
  "businessCheck.saveProgress": () => ({ saved: true }),
  // The live site has the AI write the summary; the preview shows the rules-based version.
  "businessCheck.submit": (input) => {
    const result = evaluate((input as { answers: Answers }).answers);
    return {
      token: "preview-token-0000000000",
      result,
      summary: { ...result.summary, offerings: result.offerings.map((offering) => ({ id: offering.id, name: offering.name, why: offering.summary })) },
      summarySource: "Rules",
      // The real booking page, so the preview shows the same Calendly calendar as the live site.
      discoveryCallUrl: BRAND.discoveryCallUrl,
    };
  },
  "businessCheck.requestNext": (input) => ({ success: true, choice: (input as { choice: string }).choice }),
  // The report form as an owner sees it after paying; building and emailing the report needs the live site.
  "fullReport.form": () => ({ status: "awaiting_intake", fullName: "Ada Example", businessName: "Example Stores", email: "ada@example.com", deliveredAt: null }),
};

const refusals: Record<string, string> = {
  "engagement.client.respondToTask": `On the live site this tells your team you sent it. ${PREVIEW_NOTICE}`,
  "engagement.client.comment": `On the live site your comment reaches your team. ${PREVIEW_NOTICE}`,
  "engagement.client.accept": `On the live site this signs it off. ${PREVIEW_NOTICE}`,
  "engagement.client.setAudience": `On the live site this decides whether your staff see it. ${PREVIEW_NOTICE}`,
  "invitations.seats.invite": `On the live site this emails them a link to join. ${PREVIEW_NOTICE}`,
  "account.signOut": `Signing out works on the live site. ${PREVIEW_NOTICE}`,
  "fullReport.submit": `Your answers are complete. On the live site your report is built now and emailed to you. ${PREVIEW_NOTICE}`,
  "participant.signIn": `Client sign-in works on the live site. ${PREVIEW_NOTICE}`,
};

export const previewLink: TRPCLink<AppRouter> = () => ({ op }) =>
  observable((observer) => {
    const timer = setTimeout(() => {
      if (refusals[op.path]) {
        observer.error(TRPCClientError.from(new Error(refusals[op.path])));
        return;
      }
      const respond = responders[op.path];
      if (!respond && op.type === "mutation") {
        observer.error(TRPCClientError.from(new Error(`Not available in the preview. ${PREVIEW_NOTICE}`)));
        return;
      }
      observer.next({ result: { type: "data", data: respond ? respond(op.input) : null } });
      observer.complete();
    }, 350);
    return () => clearTimeout(timer);
  });
