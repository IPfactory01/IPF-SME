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
import { evaluate } from "@shared/businessCheck/engine";
import type { Answers } from "@shared/businessCheck/questions";
import { journeyOf } from "@shared/engagement";

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
/** A client in week one of the Current State Assessment: what an owner sees in their room. Sample data only. */
const SAMPLE_ROOM = {
  engagementId: 1,
  businessName: "Ada Foods",
  viewer: { kind: "owner" },
  stage: "assessment",
  stageLabel: "Current State Assessment",
  journey: journeyOf("assessment"),
  problemStatement: null,
  team: [{ name: "Femi Adebayo", roleLabel: "Engagement lead" }, { name: "Ngozi Eze", roleLabel: "Analyst" }],
  nextSession: { id: 2, title: "Current State Assessment call 2", scheduledFor: day(7), durationMinutes: 90, meetingLink: "https://zoom.us/" },
  sessions: [
    { id: 1, title: "Current State Assessment call 1", scheduledFor: day(0), durationMinutes: 90, meetingLink: null, status: "held", agenda: null, notesSharedAt: day(0, 16), notesAudience: "owner",
      notes: "What we heard: sales are steady but cash runs out before month end.\nWhat we agreed: we look at pricing and the cost of delivery first.\nBefore call 2: Ada sends the price list with delivery charges; Ngozi sends a one-page cash template." },
    { id: 2, title: "Current State Assessment call 2", scheduledFor: day(7), durationMinutes: 90, meetingLink: "https://zoom.us/", status: "planned", agenda: "Your numbers, what they show, and the one problem to fix first.", notes: null, notesSharedAt: null, notesAudience: null },
  ],
  tasks: [
    { id: 1, kind: "data_request", side: "client", title: "Your price list", detail: "What you sell and what you charge for each, or how you work out a price.", dueOn: "2026-10-27", status: "needs_more", statusLabel: "We need a bit more", statusNote: "the delivery charges too", mine: false },
    { id: 2, kind: "data_request", side: "client", title: "What you spend each month", detail: "Rent, salaries, stock, transport and anything else that goes out regularly. Estimates are fine.", dueOn: "2026-10-27", status: "open", statusLabel: "To do", statusNote: null, mine: false },
    { id: 3, kind: "data_request", side: "client", title: "Your last 12 months of sales", detail: null, dueOn: "2026-10-21", status: "accepted", statusLabel: "Received", statusNote: null, mine: false },
    { id: 4, kind: "data_request", side: "client", title: "Who works in the business", detail: null, dueOn: "2026-10-21", status: "accepted", statusLabel: "Received", statusNote: null, mine: false },
    { id: 5, kind: "action", side: "ipf", title: "Send the one-page cash template", detail: null, dueOn: "2026-10-26", status: "open", statusLabel: "To do", statusNote: null, mine: false },
  ],
  deliverables: [],
};
const SAMPLE_SEATS = { included: 1, used: 0, members: [], invitations: [] };

const responders: Record<string, Responder> = {
  "auth.me": () => null,
  "account.me": () => (previewSession.signedIn ? SAMPLE_OWNER : null),
  "engagement.client.room": () => (previewSession.signedIn ? SAMPLE_ROOM : null),
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
