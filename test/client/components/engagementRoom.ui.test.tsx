/** @vitest-environment jsdom */

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { journeyOf } from "@shared/engagement";
import { addDays, lagosDay } from "@shared/agreement";
import { AREA_NAMES } from "@shared/businessCheck/questions";
import { evaluate, READINESS_LABELS } from "@shared/businessCheck/engine";
import { buildFullReport } from "@shared/fullReport/build";
import { roomInsight, type RoomInsight } from "@shared/fullReport/insight";
import { MotionGlobalConfig } from "framer-motion";
import { WIDE_QUERY } from "@/hooks/useWide";
import { businessCheckProfiles } from "../../fixtures/businessCheckProfiles";
import { sampleIntake } from "../../fixtures/reportIntake";

const api = vi.hoisted(() => ({ calls: { respond: [] as unknown[], comment: [] as unknown[], accept: [] as unknown[], audience: [] as unknown[], requestUpload: [] as unknown[], confirmUpload: [] as unknown[], fileLink: [] as unknown[], requestDrop: [] as unknown[], confirmDrop: [] as unknown[], setNotAvailable: [] as unknown[], respondToContent: [] as unknown[], requestService: [] as unknown[], acceptAgreement: [] as unknown[], signOut: [] as unknown[], answerWithLink: [] as unknown[], removeFile: [] as unknown[], taskComment: [] as unknown[] } }));
const replies: Record<string, unknown> = {
  requestUpload: { storageKey: "engagements/4/tasks/11/abc-sales.pdf", uploadUrl: "https://example-project.supabase.co/storage/v1/object/upload/sign/engagement-files/engagements/4/tasks/11/abc-sales.pdf?token=up", headers: { "content-type": "application/pdf", "x-upsert": "false" } },
  confirmUpload: { success: true, fileId: 99, status: "received" },
  requestDrop: { storageKey: "engagements/4/inbox/abc-sales.pdf", uploadUrl: "https://example-project.supabase.co/storage/v1/object/upload/sign/engagement-files/engagements/4/inbox/abc-sales.pdf?token=up", headers: { "content-type": "application/pdf", "x-upsert": "false" } },
  confirmDrop: { success: true, fileId: 99 },
  respondToContent: { success: true, status: "approved" },
  fileLink: { url: "https://example-project.supabase.co/storage/v1/object/sign/engagement-files/k?token=down&download=sales.pdf" },
};
// Like the real server, a mutation hands its reply to onSuccess.
const mutation = (bucket: keyof typeof api.calls) => (options?: { onSuccess?: (reply: never) => void }) => ({
  isPending: false,
  mutate: (input: unknown) => { api.calls[bucket].push(input); options?.onSuccess?.((replies[bucket] ?? { success: true }) as never); },
  mutateAsync: async (input: unknown) => { api.calls[bucket].push(input); options?.onSuccess?.((replies[bucket] ?? { success: true }) as never); return replies[bucket] ?? { success: true }; },
});
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ engagement: { client: { room: { invalidate: () => undefined } } }, account: { me: { setData: () => undefined } } }),
    account: { signOut: { useMutation: mutation("signOut") } },
    engagement: {
      client: {
        respondToTask: { useMutation: mutation("respond") },
        comment: { useMutation: mutation("comment") },
        accept: { useMutation: mutation("accept") },
        setAudience: { useMutation: mutation("audience") },
        requestUpload: { useMutation: mutation("requestUpload") },
        confirmUpload: { useMutation: mutation("confirmUpload") },
        fileLink: { useMutation: mutation("fileLink") },
        requestDrop: { useMutation: mutation("requestDrop") },
        confirmDrop: { useMutation: mutation("confirmDrop") },
        setNotAvailable: { useMutation: mutation("setNotAvailable") },
        respondToContent: { useMutation: mutation("respondToContent") },
        requestService: { useMutation: mutation("requestService") },
        acceptAgreement: { useMutation: mutation("acceptAgreement") },
        answerWithLink: { useMutation: mutation("answerWithLink") },
        removeFile: { useMutation: mutation("removeFile") },
        taskComment: { useMutation: mutation("taskComment") },
      },
    },
  },
}));

const { default: EngagementRoom, dueFlag } = await import("@/components/EngagementRoom");

/** A fee as the room receives it (the ledger, batch F): paid in full or owed in full unless the test says otherwise. */
type FeeFixture = { id: number; label: string; amount: number; dueOn: string | null; paid: boolean; reference: string; payPath: string | null };
const feeRow = (row: FeeFixture & Partial<{ paidAmount: number; left: number; writtenOff: boolean; receipts: { number: string; amount: number; refunded: number; receivedOn: string | null }[] }>) =>
  ({ paidAmount: row.paid ? row.amount : 0, left: row.paid ? 0 : row.amount, writtenOff: false, receipts: [] as { number: string; amount: number; refunded: number; receivedOn: string | null }[], ...row });

const room = (over: Record<string, unknown> = {}) => ({
  engagementId: 4,
  fees: [] as ReturnType<typeof feeRow>[],
  awaitingPayment: false,
  hold: null,
  content: [] as { id: number; kind: "reel" | "post" | "story"; kindLabel: string; title: string; month: number; status: "planned" | "in_edit" | "for_approval" | "changes_requested" | "approved" | "published"; statusLabel: string; dueOn: string | null; link: string | null; clientNote: string | null; approvedAt: Date | null; publishedAt: Date | null }[],
  contentTargets: [] as { label: string; count: number }[],
  service: null as string | null,
  title: "Business Review",
  serviceStep: null as number | null,
  projects: [{ id: 4, title: "Business Review", stageLabel: "Business Review", closed: false, current: true }] as { id: number; title: string; stageLabel: string; closed: boolean; current: boolean }[],
  requests: [] as { id: number; service: string; serviceName: string; createdAt: Date }[],
  type: "business_review" as "business_review" | "digital_marketing",
  typeLabel: "Business Review",
  startedOn: null as string | null,
  uploadsEnabled: false,
  businessName: "Ada Foods",
  viewer: { kind: "owner" as const },
  stage: "assessment" as const,
  stageLabel: "Business Review",
  journey: journeyOf("assessment"),
  assessmentStartedAt: null as Date | null,
  fixStartedAt: null as Date | null,
  closedAt: null as Date | null,
  createdAt: new Date("2026-10-16T10:00:00Z"),
  check: { primaryArea: 2, readiness: "intermediate" as const, completedAt: new Date("2026-10-09T10:00:00Z"), reportRequestedAt: null as Date | null, callRequestedAt: new Date("2026-10-09T10:05:00Z") as Date | null, callScheduledFor: new Date("2026-10-13T13:00:00Z") as Date | null },
  report: null as null | { requestedAt: Date; deliveredAt: Date | null },
  debrief: null as null | { heldAt: Date | null; heard: string | null; problemInOwnerWords: string | null; successLooksLike: string | null; tried: string | null; nextSteps: string | null; sharedAt: Date },
  problemStatement: null,
  insight: null as RoomInsight | null,
  booking: null as null | { sessionId: number; title: string; url: string },
  measure: null,
  team: [{ name: "Lewis Lead", roleLabel: "Engagement Manager", jobTitle: null as string | null, whatsapp: null as string | null }, { name: "Ola Analyst", roleLabel: "Analyst", jobTitle: null as string | null, whatsapp: null as string | null }],
  nextSession: { id: 1, title: "Business Review Session 1", scheduledFor: new Date("2026-10-23T09:00:00Z"), durationMinutes: 90, meetingLink: "https://zoom.example.test/j/1" },
  sessions: [
    { id: 1, title: "Business Review Session 1", scheduledFor: new Date("2026-10-23T09:00:00Z"), durationMinutes: 90, meetingLink: "https://zoom.example.test/j/1", status: "planned" as const, weekNumber: 1, sortOrder: 7, agenda: null, notes: null, notesSharedAt: null, notesAudience: null },
    { id: 2, title: "Kick-off", scheduledFor: new Date("2026-10-16T09:00:00Z"), durationMinutes: 30, meetingLink: null, status: "held" as const, weekNumber: null, sortOrder: 0, agenda: null, notes: "We agreed to start with pricing.", notesSharedAt: new Date("2026-10-16T12:00:00Z"), notesAudience: "owner" as const },
  ],
  tasks: [
    { id: 11, responseLink: null as string | null, sendTo: null as { name: string; whatsapp: string } | null, askedBy: null as string | null, writeTo: "Lewis Lead" as string | null, turnaround: null as "first_edit" | "first_draft" | null, receivedAt: null as Date | null, followUpDueAt: null as Date | null, followUpDoneAt: null as Date | null, comments: [] as { id: number; body: string; createdAt: Date; authorName: string; fromTeam: boolean; mine: boolean }[], kind: "data_request" as const, side: "client" as const, title: "Your last 12 months of sales", detail: "Monthly totals are enough.", dueOn: "2026-10-14", status: "open" as const, statusLabel: "To do", statusNote: null, mine: false, weekNumber: 1, sortOrder: 1, factor: "internal" as const, section: null as string | null, ref: null as string | null, informs: null as string | null, format: null as string | null, priority: null as "high" | "medium" | "low" | null, assigneeName: null as string | null, files: [] },
    { id: 12, responseLink: null as string | null, sendTo: null as { name: string; whatsapp: string } | null, askedBy: null as string | null, writeTo: "Lewis Lead" as string | null, turnaround: null as "first_edit" | "first_draft" | null, receivedAt: null as Date | null, followUpDueAt: null as Date | null, followUpDoneAt: null as Date | null, comments: [] as { id: number; body: string; createdAt: Date; authorName: string; fromTeam: boolean; mine: boolean }[], kind: "data_request" as const, side: "client" as const, title: "Your price list", detail: null, dueOn: "2026-10-14", status: "needs_more" as const, statusLabel: "We need a bit more", statusNote: "the delivery prices too", mine: true, weekNumber: 1, sortOrder: 2, factor: "internal" as const, section: null as string | null, ref: null as string | null, informs: null as string | null, format: null as string | null, priority: null as "high" | "medium" | "low" | null, assigneeName: null as string | null, files: [] },
    { id: 13, responseLink: null as string | null, sendTo: null as { name: string; whatsapp: string } | null, askedBy: null as string | null, writeTo: "Lewis Lead" as string | null, turnaround: null as "first_edit" | "first_draft" | null, receivedAt: null as Date | null, followUpDueAt: null as Date | null, followUpDoneAt: null as Date | null, comments: [] as { id: number; body: string; createdAt: Date; authorName: string; fromTeam: boolean; mine: boolean }[], kind: "data_request" as const, side: "client" as const, title: "Who works in the business", detail: null, dueOn: null, status: "accepted" as const, statusLabel: "Received", statusNote: null, mine: false, weekNumber: 1, sortOrder: 3, factor: "internal" as const, section: null as string | null, ref: null as string | null, informs: null as string | null, format: null as string | null, priority: null as "high" | "medium" | "low" | null, assigneeName: null as string | null, files: [] },
    { id: 14, responseLink: null as string | null, sendTo: null as { name: string; whatsapp: string } | null, askedBy: null as string | null, writeTo: "Lewis Lead" as string | null, turnaround: null as "first_edit" | "first_draft" | null, receivedAt: null as Date | null, followUpDueAt: null as Date | null, followUpDoneAt: null as Date | null, comments: [] as { id: number; body: string; createdAt: Date; authorName: string; fromTeam: boolean; mine: boolean }[], kind: "action" as const, side: "ipf" as const, title: "Send the cash template", detail: null, dueOn: "2026-10-20", status: "open" as const, statusLabel: "To do", statusNote: null, mine: false, weekNumber: 2, sortOrder: 1, factor: "internal" as const, section: null as string | null, ref: null as string | null, informs: null as string | null, format: null as string | null, priority: null as "high" | "medium" | "low" | null, assigneeName: null as string | null, files: [] },
  ],
  deliverables: [
    { id: 21, kind: "findings" as const, kindLabel: "Findings", title: "What we found", summary: "Cash leaks at the till.", sharedAt: new Date("2026-10-30T12:00:00Z"), audience: "owner" as const, audienceLabel: "Owner only", accepted: false, files: [], comments: [{ body: "Is this every day?", createdAt: new Date(), authorName: "Ada" }] },
  ],
  people: [{ name: "Ada Okafor", label: "Owner", you: true }, { name: "Bola Ade", label: "Contributor access", you: false }],
  sentFiles: [] as { id: number; fileName: string; sizeBytes: number; createdAt: Date; mine: boolean; note: string | null; matchedTo: { taskId: number; ref: string | null; title: string }[] }[],
  ...over,
});

beforeEach(() => {
  api.calls = { respond: [], comment: [], accept: [], audience: [], requestUpload: [], confirmUpload: [], fileLink: [], requestDrop: [], confirmDrop: [], setNotAvailable: [], respondToContent: [], requestService: [], acceptAgreement: [], signOut: [], answerWithLink: [], removeFile: [], taskComment: [] };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // A tab or chart link writes the address's hash, which the next render would open on.
  window.history.replaceState(null, "", window.location.pathname);
});

describe("the client's room", () => {
  it("opens on now: the stage with its week and day, the next action as Data Request N of M, the next Session with Join, and the team", () => {
    render(<EngagementRoom room={room({ assessmentStartedAt: new Date("2026-10-19T08:00:00Z"), deliverables: [] })} now={new Date("2026-10-22T10:00:00Z").getTime()} />);
    const hero = within(screen.getByRole("region", { name: "Business Review · Week 1 of 2" }));
    // The business names the room; no greeting headline.
    expect(hero.getByText("Ada Foods")).toBeTruthy();
    expect(hero.queryByText(/Welcome back/)).toBeNull();
    expect(hero.getByRole("progressbar", { name: "Day 4 of 14" }).getAttribute("aria-valuenow")).toBe("4");
    // The Overview opens with the next action and the next meeting, side by side, and the team in the column.
    // Data Requests are one next action: how many are outstanding, and the way to the list.
    const action = within(screen.getByRole("region", { name: "Next action · Data Request" }));
    expect(action.getByText("2 items outstanding")).toBeTruthy();
    expect(action.getByText("1 of 3")).toBeTruthy();
    // The Data Request tab is gone (R89): each item is answered in the Work Plan.
    expect(action.getByRole("link", { name: "Open the Work Plan" }).getAttribute("href")).toBe("#plan");
    const meeting = within(screen.getByRole("region", { name: "Next meeting" }));
    expect(meeting.getByText("Business Review Session 1")).toBeTruthy();
    expect(meeting.getByText(/Fri 23 Oct, 10:00 am \(Lagos time\), 90 minutes/)).toBeTruthy();
    expect(meeting.getByRole("link", { name: "Join the Session" }).getAttribute("href")).toBe("https://zoom.example.test/j/1");
    const team = within(screen.getByRole("region", { name: "Your team" }));
    expect(team.getByText("Lewis Lead")).toBeTruthy();
    expect(team.getByText("Ola Analyst")).toBeTruthy();
  });

  it("numbers the Engagement timeline one to seven, marks what is done with its date, and opens the current step by itself", () => {
    render(<EngagementRoom room={room({ debrief: { heldAt: new Date("2026-10-13T13:00:00Z"), heard: "Two outlets and a van.", problemInOwnerWords: "Cash runs out in week three.", successLooksLike: null, tried: null, nextSteps: null, sharedAt: new Date() }, report: { requestedAt: new Date("2026-10-14T09:00:00Z"), deliveredAt: new Date("2026-10-14T10:00:00Z") } })} />);
    const timeline = screen.getByRole("list", { name: "Engagement timeline" });
    const items = within(timeline).getAllByRole("listitem").filter(item => item.id.startsWith("step-"));
    expect(items.map(item => item.querySelector("button")!.textContent)).toEqual([
      "Business Health CheckDone · Fri 9 Oct", "Discovery CallDone · Tue 13 Oct", "Full ReportDone · Wed 14 Oct", "Business ReviewDone · two weeks", "FindingsNowShared Fri 30 Oct", "Six-Week Fix6 weeks, after your Sign-off", "Day-30 Review30 days after the Six-Week Fix ends",
    ]);
    expect(timeline.querySelector('[aria-current="step"]')!.id).toBe("step-5");
    expect(within(timeline).getByRole("button", { name: /^Findings/ }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("heading", { name: "Findings" })).toBeTruthy();
    expect(within(timeline).getByRole("button", { name: /^Discovery Call/ }).getAttribute("aria-expanded")).toBe("false");
    // Opening the Discovery Call shows what the team shared; the Business Health Check shows the main finding and readiness.
    fireEvent.click(within(timeline).getByRole("button", { name: /^Discovery Call/ }));
    const debrief = within(screen.getByRole("region", { name: "Step 2: Discovery Call" }));
    expect(debrief.getByText("Two outlets and a van.")).toBeTruthy();
    expect(debrief.getByText("Cash runs out in week three.")).toBeTruthy();
    fireEvent.click(within(timeline).getByRole("button", { name: /^Business Health Check/ }));
    const check = within(screen.getByRole("region", { name: "Step 1: Business Health Check" }));
    expect(check.getByText(AREA_NAMES[2])).toBeTruthy();
    expect(check.getByText(READINESS_LABELS.intermediate)).toBeTruthy();
  });

  it("shows the Work Plan by week as one line per item, who does it, and opens each item where its detail and buttons are", () => {
    render(<EngagementRoom room={room({ deliverables: [] })} />);
    const plan = within(screen.getByRole("region", { name: "Step 4: Business Review" }));
    const week1 = within(plan.getByRole("list", { name: "Week 1" })).getAllByRole("listitem").map(item => item.getAttribute("aria-label"));
    expect(week1).toEqual(["Your last 12 months of sales", "Your price list", "Who works in the business", "Business Review Session 1"]);
    expect(within(plan.getByRole("list", { name: "Week 2" })).getAllByRole("listitem").map(item => item.getAttribute("aria-label"))).toEqual(["Send the cash template"]);
    const sales = within(plan.getByRole("listitem", { name: "Your last 12 months of sales" }));
    expect(sales.getByText("You")).toBeTruthy();
    expect(within(plan.getByRole("listitem", { name: "Send the cash template" })).getByText("IP Factory")).toBeTruthy();
    expect(within(plan.getByRole("listitem", { name: "Business Review Session 1" })).getByText("Together")).toBeTruthy();
    expect(within(plan.getByRole("listitem", { name: "Your price list" })).getByText("We need a bit more")).toBeTruthy();
    expect(within(plan.getByRole("listitem", { name: "Your price list" })).getByText("for you")).toBeTruthy();
    // No detail or buttons in the timeline: a line opens the item in the List, a Session in Schedule.
    expect(plan.queryByRole("button", { name: "Submitted another way" })).toBeNull();
    expect(plan.queryByText("Monthly totals are enough.")).toBeNull();
    expect(sales.getByRole("link").getAttribute("href")).toBe("#task-11");
    expect(within(plan.getByRole("listitem", { name: "Business Review Session 1" })).getByRole("link").getAttribute("href")).toBe("#meetings");
    expect(plan.getByText("1 of 4 done")).toBeTruthy();
  });

  it("shows the owner the Findings, lets them sign off, comment, and decide whether their staff see it, and shows Session notes in Schedule", () => {
    render(<EngagementRoom room={room()} />);
    const timeline = screen.getByRole("list", { name: "Engagement timeline" });
    // The Findings are out and not yet signed off, so their step is open when the page loads.
    const found = within(screen.getByRole("region", { name: "Step 5: Findings" }));
    expect(found.getByText("Cash leaks at the till.")).toBeTruthy();
    expect(found.getByText(/only you can see this/)).toBeTruthy();
    fireEvent.click(found.getByRole("button", { name: "Sign off the Findings" }));
    expect(api.calls.accept).toEqual([{ deliverableId: 21 }]);
    fireEvent.change(found.getByLabelText("Your comment on What we found"), { target: { value: "Thank you" } });
    fireEvent.click(found.getByRole("button", { name: "Send" }));
    expect(api.calls.comment).toEqual([{ deliverableId: 21, body: "Thank you" }]);
    fireEvent.click(found.getByRole("button", { name: "Share with my team" }));
    expect(api.calls.audience).toEqual([{ item: "deliverable", id: 21, audience: "business" }]);
    expect(timeline).toBeTruthy();
    // The kick-off's notes sit with the meeting in Schedule, where the owner decides who sees them.
    fireEvent.click(screen.getByRole("tab", { name: "Sessions" }));
    const kickoff = within(within(screen.getByRole("list", { name: "Meetings" })).getByRole("listitem", { name: "Kick-off" }));
    expect(kickoff.getByText("We agreed to start with pricing.")).toBeTruthy();
    expect(kickoff.getByText(/only you can see these/)).toBeTruthy();
  });

  it("numbers each week's Work Plan 1, 2, 3 even when the stored order has gaps, and keeps our internal tags to ourselves", () => {
    const base = room({ deliverables: [] });
    const gaps = { ...base, tasks: base.tasks.map((task, index) => ({ ...task, sortOrder: [1, 2, 5, 9][index] ?? task.sortOrder })) };
    render(<EngagementRoom room={gaps} />);
    const plan = within(screen.getByRole("region", { name: "Step 4: Business Review" }));
    const badges = within(plan.getByRole("list", { name: "Week 1" })).getAllByRole("listitem").map(item => item.querySelector("a")!.firstElementChild!.textContent);
    // A finished item shows a tick instead of its number; every other item shows its place in the week.
    expect(badges).toEqual(["1", "2", "", "4"]);
    expect(screen.getByRole("region", { name: "Step 4: Business Review" }).textContent).not.toMatch(/internal|external/i);
  });

  it("asks the owner for Sign-off as the next action once nothing is outstanding", () => {
    render(<EngagementRoom room={room({ tasks: [] })} />);
    expect(screen.getByText("Read the Findings and give your Sign-off")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open the Findings/ }).getAttribute("href")).toBe("#step-5");
  });

  it("does not offer a staff member the owner's decisions, or the Discovery Call", () => {
    render(<EngagementRoom room={room({ viewer: { kind: "member", access: "full" }, tasks: [] })} />);
    expect(screen.queryByRole("button", { name: /Sign off the/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Share with my team" })).toBeNull();
    expect(screen.queryByText(/only you can see/)).toBeNull();
    expect(screen.getAllByText("Nothing outstanding. We will tell you here when there is.").length).toBeGreaterThan(0);
  });

  it("says plainly when nothing is booked, planned or shared yet", () => {
    render(<EngagementRoom room={room({ stage: "setting_up", stageLabel: "Getting set up", journey: journeyOf("setting_up"), nextSession: null, team: [], tasks: [], deliverables: [], sessions: [] })} />);
    expect(screen.getByRole("heading", { name: "Getting set up" })).toBeTruthy();
    expect(screen.getByText("No Session is booked yet. It will show here with a Join link once it is.")).toBeTruthy();
    expect(screen.getByText("We are naming your team now.")).toBeTruthy();
    expect(screen.getByText("Your Work Plan appears here once your team sets it.")).toBeTruthy();
  });

  it("counts the Six-Week Fix in weeks and places what the page passes it, such as the owner's seat card, at the end", () => {
    render(<EngagementRoom room={room({ stage: "fix", stageLabel: "Six-Week Fix", journey: journeyOf("fix"), fixStartedAt: new Date("2026-11-09T08:00:00Z") })} aside={<p>Seat card</p>} now={new Date("2026-11-25T10:00:00Z").getTime()} />);
    expect(screen.getByRole("heading", { name: "Six-Week Fix · Week 3 of 6" })).toBeTruthy();
    expect(screen.getByText("Seat card")).toBeTruthy();
  });
});

describe("the first visit (R46) and What we will do (R47)", () => {
  const planned = [{ id: 1, title: "Business Review Session 1", scheduledFor: new Date("2026-10-23T09:00:00Z"), durationMinutes: 90, meetingLink: null, status: "planned" as const, weekNumber: 1, sortOrder: 1, agenda: null, notes: null, notesSharedAt: null, notesAudience: null }];
  const unpaid = feeRow({ id: 31, label: "Business Review, payable before work begins", amount: 600000, dueOn: "2026-10-20", paid: false, reference: "IPF-F-31", payPath: "/pay/fee/31" });

  it("welcomes the owner until the first Session is held: the experts with WhatsApp, three things to do first, each linked to its place, and what happens next", () => {
    const team = [{ name: "Lewis Lead", roleLabel: "Engagement Manager", jobTitle: null, whatsapp: "2348030000001" }, { name: "Ola Analyst", roleLabel: "Analyst", jobTitle: null, whatsapp: null }];
    const { unmount } = render(<EngagementRoom room={room({ sessions: planned, nextSession: null, booking: { sessionId: 1, title: "Business Review Session 1", url: "https://calendly.example.test/ipf/session-1" }, fees: [unpaid], team })} />);
    const welcome = within(screen.getByRole("region", { name: "Getting started" }));
    const experts = within(welcome.getByRole("list", { name: "Your experts" }));
    expect(experts.getByText("Lewis Lead")).toBeTruthy();
    expect(experts.getByText("Ola Analyst")).toBeTruthy();
    // Only the expert who agreed to share a number has a WhatsApp button.
    expect(experts.getByRole("link", { name: "WhatsApp Lewis" }).getAttribute("href")).toMatch(/^https:\/\/wa\.me\/2348030000001\?text=/);
    expect(experts.queryByRole("link", { name: "WhatsApp Ola" })).toBeNull();
    const week = within(welcome.getByRole("list", { name: "First things to do" }));
    expect(week.getByRole("link", { name: "Book your first Session" }).getAttribute("href")).toBe("https://calendly.example.test/ipf/session-1");
    expect(week.getByRole("link", { name: "Send your first records: 2 on the Data Request" }).getAttribute("href")).toBe("#data");
    expect(week.getByRole("link", { name: "Pay Business Review, payable before work begins: ₦600,000" }).getAttribute("href")).toBe("/pay/fee/31");
    expect(welcome.getByText("We take three working days to get set up; the review starts at your first Session.")).toBeTruthy();
    unmount();

    // Once the first Session is held, the welcome has done its job.
    render(<EngagementRoom room={room()} />);
    expect(screen.queryByRole("region", { name: "Getting started" })).toBeNull();
  });

  it("marks the first Session as booked, and the records as in, once they are", () => {
    const tasks = room().tasks.map(task => ({ ...task, status: "accepted" as const }));
    render(<EngagementRoom room={room({ sessions: [{ ...planned[0]!, scheduledFor: new Date("2026-10-23T09:00:00Z") }], tasks })} />);
    const week = within(screen.getByRole("list", { name: "First things to do" }));
    expect(week.getByText("Your first Session is booked: Fri 23 Oct, 10:00 am")).toBeTruthy();
    expect(week.getByText("Your records on the Data Request are in")).toBeTruthy();
    expect(week.getAllByText("(done)")).toHaveLength(2);
    expect(week.queryAllByRole("link")).toEqual([]);
  });

  it("lists a fee only when it is due this week or late, never one a month away (Marcelle's room, 10 November 2026)", () => {
    // Her Month 1 fee was moved to 30 days after kickoff, and Getting started still said to pay it, "payable on starting".
    const today = lagosDay();
    const monthly = (id: number, label: string, dueOn: string) => feeRow({ id, label, amount: 470000, dueOn, paid: false, reference: `TS-F-00000${id}`, payPath: `/pay/fee/${id}` });
    const fees = [monthly(1, "Month 1 service fee", addDays(today, 30)), monthly(2, "Month 2 service fee", addDays(today, 60))];
    const { unmount } = render(<EngagementRoom room={room({ sessions: [], nextSession: null, booking: null, fees })} />);
    const week = within(screen.getByRole("list", { name: "First things to do" }));
    expect(week.queryByRole("link", { name: /^Pay / })).toBeNull();
    expect(week.getByText("Your team sends you a time for your first Session")).toBeTruthy();
    unmount();
    // Due within seven days, it is a first thing to do; so is one already late.
    for (const dueOn of [addDays(today, 7), addDays(today, -2)]) {
      const { unmount: close } = render(<EngagementRoom room={room({ sessions: [], nextSession: null, booking: null, fees: [monthly(1, "Month 1 service fee", dueOn)] })} />);
      expect(within(screen.getByRole("list", { name: "First things to do" })).getByRole("link", { name: "Pay Month 1 service fee: ₦470,000" }).getAttribute("href")).toBe("/pay/fee/1");
      close();
    }
  });

  it("says the team sends a time when nothing can be booked yet, and shows nothing once the engagement is closed", () => {
    const { unmount } = render(<EngagementRoom room={room({ sessions: [], nextSession: null, booking: null })} />);
    expect(within(screen.getByRole("list", { name: "First things to do" })).getByText("Your team sends you a time for your first Session")).toBeTruthy();
    unmount();
    render(<EngagementRoom room={room({ sessions: [], nextSession: null, stage: "closed", stageLabel: "Closed", journey: journeyOf("closed"), closedAt: new Date("2026-11-01T10:00:00Z") })} />);
    expect(screen.queryByRole("region", { name: "Getting started" })).toBeNull();
  });

  it("shows what we will do, the team, the start and each fee with its date, with nothing to sign", () => {
    render(<EngagementRoom room={room({ startedOn: "2026-10-19", fees: [unpaid, { ...unpaid, id: 32, label: "With the Findings", amount: 300000, dueOn: null, paid: true }] })} />);
    const work = within(screen.getByRole("region", { name: "What we will do" }));
    expect(work.getByText("Two weeks and two Sessions that test your whole business, to find the one problem to fix first and what to do about it.")).toBeTruthy();
    expect(work.getByText("The one problem to fix first, in your words")).toBeTruthy();
    expect(work.getByText("Lewis Lead, Engagement Manager; Ola Analyst, Analyst")).toBeTruthy();
    expect(work.getByText("Mon 19 Oct")).toBeTruthy();
    expect(work.getByText("₦600,000")).toBeTruthy();
    expect(work.getByText(", due Tue 20 Oct")).toBeTruthy();
    expect(work.getByText("₦300,000")).toBeTruthy();
    expect(work.getByText("Nothing to sign. If anything here is not what you agreed, message your team.")).toBeTruthy();
    expect(work.queryByRole("button")).toBeNull();
  });

  it("describes a Digital marketing engagement by its monthly content, and leaves out the fees a contributor cannot see", () => {
    render(<EngagementRoom room={room({ type: "digital_marketing", typeLabel: "Digital marketing", title: "Digital marketing", startedOn: "2026-11-02", fees: [], team: [] })} />);
    const work = within(screen.getByRole("region", { name: "What we will do" }));
    expect(work.getByText("15 reels a month")).toBeTruthy();
    expect(work.getByText("20 stories a month")).toBeTruthy();
    expect(work.queryByText("Fees")).toBeNull();
    expect(work.queryByText("Your team")).toBeNull();
  });
});

/**
 * Opens an item from the Work Plan's weekly cards (R85): unfolds every week, picks the item, and returns its panel,
 * where the client uploads, sends a link, marks it not available and writes.
 */
function openItem(title: string) {
  fireEvent.click(screen.getByRole("tab", { name: /^Work Plan/ }));
  for (const week of screen.queryAllByRole("region", { name: /^(Week \d+|No week)$/ })) {
    const header = within(week).getAllByRole("button")[0]!;
    if (header.getAttribute("aria-expanded") === "false") fireEvent.click(header);
  }
  fireEvent.click(screen.getByRole("button", { name: title }));
  return within(screen.getByRole("complementary", { name: "Task details" }));
}

describe("files in the room", () => {

  it("offers no upload until storage is set up: the client sends a link or on WhatsApp, or says it went another way", () => {
    render(<EngagementRoom room={room()} />);
    const sales = openItem("Your last 12 months of sales");
    expect(sales.queryByLabelText(/^Upload files for/)).toBeNull();
    expect(sales.getByRole("button", { name: "Send a link" })).toBeTruthy();
    expect(sales.getByRole("button", { name: "Submitted another way" })).toBeTruthy();
  });






  it("answers an item with a link to a shared folder, and shows the link once sent (R43)", () => {
    render(<EngagementRoom room={room()} />);
    const sales = openItem("Your last 12 months of sales");
    fireEvent.click(sales.getByRole("button", { name: "Send a link" }));
    expect(sales.getByText(/Google Drive, Dropbox, WeTransfer or iCloud/)).toBeTruthy();
    fireEvent.change(sales.getByLabelText("Link to the folder for Your last 12 months of sales"), { target: { value: "https://drive.google.com/drive/folders/abc" } });
    fireEvent.click(sales.getByRole("button", { name: "Send the link" }));
    expect(api.calls.answerWithLink).toEqual([{ taskId: 11, url: "https://drive.google.com/drive/folders/abc" }]);
    cleanup();
    const base = room();
    render(<EngagementRoom room={room({ tasks: base.tasks.map(task => (task.id === 12 ? { ...task, status: "received" as const, responseLink: "https://www.dropbox.com/scl/fo/xyz" } : task)) })} />);
    const prices = openItem("Your price list");
    expect(prices.getByRole("link", { name: "dropbox.com" }).getAttribute("href")).toBe("https://www.dropbox.com/scl/fo/xyz");
  });

  it("lets the client take back a file until the team has taken it in (R61)", () => {
    const mineFile = { id: 41, fileName: "wrong.pdf", sizeBytes: 2048, createdAt: new Date(), mine: true, fromTeam: false };
    const base = room();
    const tasks = base.tasks.map(task => (task.id === 11 ? { ...task, status: "received" as const, files: [mineFile] } : task.id === 13 ? { ...task, files: [{ ...mineFile, id: 42, fileName: "staff-list.pdf" }] } : task));
    const sentFiles = [
      { id: 43, fileName: "IMG_2041.jpg", sizeBytes: 90_000, createdAt: new Date(), mine: true, note: null, matchedTo: [] },
      { id: 44, fileName: "Sales 2025.xlsx", sizeBytes: 9_000, createdAt: new Date(), mine: true, note: null, matchedTo: [{ taskId: 11, ref: "B1", title: "Your last 12 months of sales" }] },
    ];
    render(<EngagementRoom room={room({ tasks, sentFiles })} />);
    const sales = openItem("Your last 12 months of sales");
    fireEvent.click(sales.getByRole("button", { name: "Remove" }));
    fireEvent.click(sales.getByRole("button", { name: "Remove it" }));
    expect(api.calls.removeFile).toEqual([{ fileId: 41 }]);
    // Accepted by the team: no Remove; asked on WhatsApp instead.
    const staffList = openItem("Who works in the business");
    expect(staffList.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("lets the client mark an item not available, with a note", () => {
    render(<EngagementRoom room={room()} />);
    const sales = openItem("Your last 12 months of sales");
    fireEvent.click(sales.getByRole("button", { name: "Not available" }));
    fireEvent.change(sales.getByLabelText("Note on Your last 12 months of sales"), { target: { value: "We kept no records before March" } });
    fireEvent.click(sales.getByRole("button", { name: "Confirm" }));
    expect(api.calls.setNotAvailable).toEqual([{ taskId: 11, unavailable: true, note: "We kept no records before March" }]);
  });



  it("lists files with who sent them, and opens one through a link the server issues", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const files = [{ id: 99, fileName: "sales.pdf", sizeBytes: 120_000, createdAt: new Date(), mine: true, fromTeam: false }, { id: 100, fileName: "cash-template.xlsx", sizeBytes: 9_000, createdAt: new Date(), mine: false, fromTeam: true }];
    const base = room();
    render(<EngagementRoom room={room({ tasks: [{ ...base.tasks[2], files }], deliverables: [] })} />);
    const panel = openItem("Who works in the business");
    const list = within(panel.getAllByRole("list", { name: "Files" })[0]!);
    expect(list.getByText("sales.pdf")).toBeTruthy();
    expect(list.getByText(/117 KB · you/)).toBeTruthy();
    expect(list.getByText(/9 KB · from your team at IP Factory/)).toBeTruthy();
    fireEvent.click(list.getAllByRole("button", { name: "Download" })[0]);
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://example-project.supabase.co/storage/v1/object/sign/engagement-files/k?token=down&download=sales.pdf", "_blank", "noopener"));
    expect(api.calls.fileLink).toEqual([{ fileId: 99 }]);
  });
});


describe("the Measure of Success", () => {
  it("shows where it started, this week's reading and where it is going, week by week", () => {
    const measure = { name: "Cash in the bank on Friday", definition: "The business account balance after the week's payments.", unit: "₦", baselineValue: 150000, targetValue: 400000,
      latest: { weekNumber: 2, heldOn: "2026-11-20", reading: 210000, nextStep: "Chase the two late invoices." },
      readings: [{ weekNumber: 1, heldOn: "2026-11-13", reading: 160000, nextStep: "Start the daily cash count." }, { weekNumber: 2, heldOn: "2026-11-20", reading: 210000, nextStep: "Chase the two late invoices." }] };
    render(<EngagementRoom room={room({ stage: "fix", stageLabel: "Six-Week Fix", journey: journeyOf("fix"), measure })} />);
    const card = within(screen.getByRole("region", { name: "Cash in the bank on Friday" }));
    expect(card.getByText("₦150,000")).toBeTruthy();
    expect(card.getAllByText("₦210,000")).toHaveLength(2);
    expect(card.getByText("₦400,000")).toBeTruthy();
    expect(card.getByText("Week 2")).toBeTruthy();
    expect(card.getByText("Up ₦60,000 since the start.").className).toContain("text-health-clear");
    expect(within(card.getByRole("table", { name: "Week by week" })).getByText("Chase the two late invoices.")).toBeTruthy();
  });

  it("colours a move the wrong way as a watch, and says when there is no reading yet", () => {
    const measure = { name: "Debtors over 30 days", definition: null, unit: "₦", baselineValue: 900000, targetValue: 300000, latest: { weekNumber: 1, heldOn: "2026-11-13", reading: 950000, nextStep: null }, readings: [{ weekNumber: 1, heldOn: "2026-11-13", reading: 950000, nextStep: null }] };
    render(<EngagementRoom room={room({ stage: "fix", stageLabel: "Six-Week Fix", journey: journeyOf("fix"), measure })} />);
    expect(screen.getByText("Up ₦50,000 since the start.").className).toContain("text-health-watch-strong");
    cleanup();
    render(<EngagementRoom room={room({ stage: "fix", stageLabel: "Six-Week Fix", journey: journeyOf("fix"), measure: { ...measure, latest: null, readings: [] } })} />);
    expect(screen.getByText("The first reading comes with the first Weekly Check-in.")).toBeTruthy();
    expect(screen.getByText("Where it starts")).toBeTruthy();
  });

  it("shows no Measure of Success before the Six-Week Fix has one", () => {
    render(<EngagementRoom room={room({ stage: "fix", stageLabel: "Six-Week Fix", journey: journeyOf("fix") })} />);
    expect(screen.queryByText("Measure of Success")).toBeNull();
  });
});

const checkAnswers = { ...businessCheckProfiles.smallOperatingTrader, p_name: "Ada Foods" } as Record<string, string>;
const report = buildFullReport({ reference: "TS-R-000004", date: new Date("2026-10-14T09:00:00Z"), contact: { fullName: "Ada Example", businessName: "Ada Foods" }, answers: checkAnswers, result: evaluate(checkAnswers), intake: { ...sampleIntake, revenueTarget: 4_000_000 } });
const fromReport = roomInsight({ report, result: null })!;
const fromCheck = roomInsight({ report: null, result: evaluate(checkAnswers) })!;

describe("the room's views", () => {
  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = true;
    window.history.replaceState(null, "", "/dashboard");
  });

  // The same frame for every client, in the order of the client's three questions (5 November): Overview; the work
  // (Work Plan, Data Request when there is one, Sessions); what we found (Business, Founder, only with a Business
  // Health Check or Full Report behind the room); what they receive (Deliverables).
  const names = () => within(screen.getByRole("tablist", { name: "Your engagement" })).getAllByRole("tab").map(tab => tab.textContent!.replace(/\d+$/, ""));

  it("shows the same views for every client, opening on the Overview, without Founder and Business when nothing is behind the room", () => {
    render(<EngagementRoom room={room()} />);
    expect(names()).toEqual(["Overview", "Progress", "Work Plan", "Sessions", "Deliverables"]);
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("list", { name: "Engagement timeline" })).toBeTruthy();
  });

  it("puts Business and Founder under what we found, before Deliverables, counts the stuck areas, and moves between tabs by tap and by arrow key", () => {
    render(<EngagementRoom room={room({ insight: fromReport })} />);
    const tabs = within(screen.getByRole("tablist", { name: "Your engagement" })).getAllByRole("tab");
    expect(names()).toEqual(["Overview", "Progress", "Work Plan", "Sessions", "Business", "Founder", "Deliverables"]);
    expect(tabs[4]!.textContent).toBe(`Business${fromReport.areas.filter(area => area.health === "stuck").length || ""}`);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    // Hidden panels are out of reach: not in the accessibility tree.
    expect(screen.queryByRole("heading", { name: "You, as the founder" })).toBeNull();

    const founder = tabs[5]!;
    fireEvent.click(founder);
    expect(founder.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "You, as the founder" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^1 ?Founder readiness/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^2 ?Strategic intent/ })).toBeTruthy();
    expect(screen.getByText("How the gap closes")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Engagement timeline" })).toBeNull();
    expect(window.location.hash).toBe("#founder");

    fireEvent.keyDown(founder, { key: "ArrowRight" });
    expect(tabs.at(-1)!.getAttribute("aria-selected")).toBe("true");
    expect(tabs.at(-1)!.textContent).toBe("Deliverables");
    expect(document.activeElement).toBe(tabs.at(-1));
    fireEvent.keyDown(tabs.at(-1)!, { key: "Home" });
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  });

  it("measures again when the page changes width without the window doing so, so the next panel never shows at the edge", async () => {
    let width = 800;
    const observers: (() => void)[] = [];
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { observers.push(callback); } observe() { return undefined; } disconnect() { return undefined; } });
    const clientWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
    render(<EngagementRoom room={room()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Deliverables" }));
    const track = screen.getByRole("tabpanel", { name: "Deliverables" }).parentElement!;
    // Deliverables is the fifth panel: the Data Request tab is gone (R89) and Progress follows the Overview (R92).
    await waitFor(() => expect(track.style.transform).toContain("-3200px"));
    width = 1000;
    act(() => { for (const callback of observers) callback(); });
    await waitFor(() => expect(track.style.transform).toContain("-4000px"));
    // A panel never lets wide content (a long table in Founder) spill into the next one.
    for (const panel of screen.getAllByRole("tabpanel", { hidden: true })) expect(panel.className).toContain("overflow-x-clip");
    clientWidth.mockRestore();
  });

  it("opens the tab a link names, and the Overview when a link points inside it", () => {
    window.history.replaceState(null, "", "/dashboard#business");
    render(<EngagementRoom room={room({ insight: fromReport })} />);
    expect(screen.getByRole("tab", { name: /Business/ }).getAttribute("aria-selected")).toBe("true");
    window.location.hash = "#step-4";
    fireEvent(window, new HashChangeEvent("hashchange"));
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
  });

  it("lists every business area with its health; tapping one opens its reading in a sheet that Escape closes", async () => {
    render(<EngagementRoom room={room({ insight: fromReport })} />);
    fireEvent.click(screen.getByRole("tab", { name: /Business/ }));
    const list = screen.getByRole("list", { name: "Areas of your business" });
    const rows = within(list).getAllByRole("button");
    expect(rows).toHaveLength(fromReport.areas.length);
    const withReading = fromReport.areas.find(area => area.reading)!;
    const row = rows[fromReport.areas.indexOf(withReading)];
    fireEvent.click(row);
    const sheet = screen.getByRole("dialog", { name: withReading.area });
    expect(sheet.getAttribute("data-placement")).toBe("bottom");
    expect(within(sheet).getByText("What your answers show")).toBeTruthy();
    expect(within(sheet).getByText(`Recommendation ${withReading.reading!.code}`)).toBeTruthy();
    expect(within(sheet).getByText(withReading.reading!.move)).toBeTruthy();
    expect(document.activeElement).toBe(within(sheet).getByRole("button", { name: "Close" }));

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(row);
  });

  it("without a Full Report, shows what the Business Health Check found and says what the report adds", () => {
    render(<EngagementRoom room={room({ insight: fromCheck })} />);
    fireEvent.click(screen.getByRole("tab", { name: "Founder" }));
    const founder = within(screen.getByRole("tabpanel", { name: "Founder" }));
    expect(founder.getByText("From your Business Health Check")).toBeTruthy();
    expect(founder.getByText(fromCheck.founder.readiness.label)).toBeTruthy();
    expect(founder.getByText(/Your Full Report adds the four money basics/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Business/ }));
    // Nothing to open without a reading: the rows are not buttons that do nothing.
    for (const button of within(screen.getByRole("list", { name: "Areas of your business" })).getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});

/** A laptop or desktop: the browser reports the room's wide-screen query as matching. */
const onWideScreen = () => vi.stubGlobal("matchMedia", (query: string) => ({
  matches: query === WIDE_QUERY, media: query, onchange: null,
  addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
}));

describe("the room on a phone (R71)", () => {
  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = true;
    window.history.replaceState(null, "", "/dashboard");
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  const tablist = () => screen.getByRole("tablist", { name: "Your engagement" });
  const started = () => <EngagementRoom room={room({ assessmentStartedAt: new Date("2026-10-19T08:00:00Z"), deliverables: [] })} now={new Date("2026-10-22T10:00:00Z").getTime()} />;

  it("shrinks the header to one line, the project and its day, off the Overview, and brings it back on the Overview", () => {
    render(started());
    expect(document.querySelector("[data-room-header='full']")).toBeTruthy();
    const title = screen.getByRole("heading", { level: 1 }).textContent!;
    const day = screen.getByRole("progressbar").getAttribute("aria-label")!;
    fireEvent.click(within(tablist()).getByRole("tab", { name: /^Work Plan/ }));
    const compact = document.querySelector("[data-room-header='compact']")!;
    expect(compact).toBeTruthy();
    expect(within(compact as HTMLElement).getByRole("heading", { level: 1 }).textContent).toBe(`${title}${day}`);
    expect(`${title}${day}`).toBe("Business Review · Week 1 of 2Day 4 of 14");
    expect(document.querySelector("[data-room-header='full']")).toBeNull();
    expect(screen.queryByRole("img", { name: /^Team: / })).toBeNull();
    fireEvent.click(within(tablist()).getByRole("tab", { name: "Overview" }));
    expect(document.querySelector("[data-room-header='full']")).toBeTruthy();
  });

  it("brings the selected tab into view inside the tab bar, never scrolling the page", () => {
    const scrolled: unknown[] = [];
    const original = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = function (this: HTMLElement, options: unknown) { if (this.getAttribute("role") === "tablist") scrolled.push(options); } as typeof HTMLElement.prototype.scrollTo;
    try {
      render(<EngagementRoom room={room()} />);
      scrolled.length = 0;
      fireEvent.click(within(tablist()).getByRole("tab", { name: "Deliverables" }));
      expect(scrolled).toHaveLength(1);
      expect(scrolled[0]).toMatchObject({ left: expect.any(Number) });
    } finally {
      HTMLElement.prototype.scrollTo = original;
    }
  });

  it("fades the tab bar at each edge where more tabs sit", () => {
    render(<EngagementRoom room={room()} />);
    const bar = tablist();
    Object.defineProperty(bar, "clientWidth", { value: 390, configurable: true });
    Object.defineProperty(bar, "scrollWidth", { value: 900, configurable: true });
    fireEvent.scroll(bar);
    expect(bar.getAttribute("data-more")).toBe("right");
    bar.scrollLeft = 200;
    fireEvent.scroll(bar);
    expect(bar.getAttribute("data-more")).toBe("both");
    bar.scrollLeft = 510;
    fireEvent.scroll(bar);
    expect(bar.getAttribute("data-more")).toBe("left");
  });

  it("shows a one-line bar at the top once the Overview's header has scrolled away, with the tab bar under it", () => {
    let report: ((entries: { isIntersecting: boolean; boundingClientRect: { top: number } }[]) => void) | null = null;
    vi.stubGlobal("IntersectionObserver", class { constructor(callback: typeof report) { report = callback; } observe() { return undefined; } disconnect() { return undefined; } });
    render(started());
    expect(document.querySelector("[data-room-header='floating']")).toBeNull();
    const title = screen.getByRole("heading", { level: 1 }).textContent!;
    const day = screen.getByRole("progressbar").getAttribute("aria-label")!;
    act(() => report!([{ isIntersecting: false, boundingClientRect: { top: -240 } }]));
    expect(document.querySelector("[data-room-header='floating']")!.textContent).toBe(`${title}${day}`);
    expect((document.querySelector("[data-room-tabs]") as HTMLElement).style.top).toBe("40px");
    act(() => report!([{ isIntersecting: true, boundingClientRect: { top: 0 } }]));
    expect(document.querySelector("[data-room-header='floating']")).toBeNull();
  });
});

describe("the room on a laptop or desktop", () => {
  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = true;
    window.history.replaceState(null, "", "/dashboard");
  });

  it("fits a phone: hidden panels' controls stay inside the panels' clip, and every tab and top-bar link is a full 44 px (design review B1, B10)", () => {
    render(<EngagementRoom room={room({ uploadsEnabled: true })} account={{ name: "Adunni Example", email: "adunni@example.com", role: "owner", internal: false }} />);
    // The drop box's file input is visually hidden (absolute). It must sit inside a positioned clip, or a hidden panel's
    // input widens the page to about 980 px and the owner can drag the room sideways on a phone.
    const clip = screen.getAllByRole("tabpanel", { hidden: true })[0]!.closest("[data-room-panels]")!;
    expect(clip.className).toMatch(/\brelative\b/);
    expect(clip.className).toMatch(/\boverflow-clip\b/);
    for (const tab of within(screen.getByRole("tablist", { name: "Your engagement" })).getAllByRole("tab")) expect(tab.className).toContain("min-h-11");
    expect(screen.getByRole("link", { name: "Account" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Sign out" }).className).toContain("min-h-11");
  });

  it("lets every card in the Overview's and Payments' grids shrink to a phone's width, so a long Work Plan row cannot cut off the cards beside it", () => {
    // A grid item is as wide as its widest line unless it may shrink: the open timeline step made the one phone column
    // 669 px on a 390 px screen, and the panels' clip cut off What we will do and the seat card under it.
    render(<EngagementRoom room={room({ fees: [feeRow({ id: 31, label: "Business Review, payable before work begins", amount: 600000, dueOn: null, paid: false, reference: "IPF-F-31", payPath: "/pay/fee/31" })] })} />);
    const panels = screen.getAllByRole("tabpanel", { hidden: true });
    const grids = panels.flatMap(panel => [...panel.querySelectorAll<HTMLElement>(".grid")]).filter(grid => /\bgap-5\b/.test(grid.className));
    expect(grids.length).toBeGreaterThanOrEqual(3);
    for (const grid of grids) expect(grid.className).toContain("[&>*]:min-w-0");
  });

  it("reads every timeline step at full strength and names the team for screen readers (design review B4)", () => {
    render(<EngagementRoom room={room()} />);
    const timeline = screen.getByRole("list", { name: "Engagement timeline" });
    expect(timeline.querySelector(".opacity-80")).toBeNull();
    expect(screen.getByRole("img", { name: /^Team: / })).toBeTruthy();
  });

  it("keeps one column on a phone, with no rail: the column of cards follows the timeline, the seat card once", () => {
    render(<EngagementRoom room={room()} aside={<p>Seat card</p>} />);
    expect(screen.queryByRole("navigation", { name: "Your room" })).toBeNull();
    expect(screen.getByRole("complementary", { name: "At a glance" })).toBeTruthy();
    expect(screen.getAllByText("Seat card")).toHaveLength(1);
  });

  it("puts what is waiting on the owner and the Deliverables beside the timeline, and the two team cards under it", () => {
    onWideScreen();
    render(<EngagementRoom room={room({ report: { requestedAt: new Date("2026-10-14T09:00:00Z"), deliveredAt: new Date("2026-10-14T10:00:00Z") } })} aside={<p>Seat card</p>} />);
    const glance = within(screen.getByRole("complementary", { name: "At a glance" }));
    // Two open Data Requests (one needing more) and the Findings to sign off; never the team's own action or a received one.
    const waiting = within(glance.getByRole("region", { name: "Waiting on you" }));
    expect(waiting.getByText("3")).toBeTruthy();
    expect(waiting.getByRole("link", { name: "Your Sign-off on the Findings" })).toBeTruthy();
    expect(waiting.getByRole("link", { name: "Your last 12 months of sales" })).toBeTruthy();
    expect(waiting.getByText(/We need a bit more/)).toBeTruthy();
    expect(waiting.queryByText("Send the cash template")).toBeNull();
    expect(waiting.queryByText("Who works in the business")).toBeNull();
    const deliverables = within(glance.getByRole("region", { name: "Deliverables" }));
    expect(deliverables.getByRole("link", { name: "Full Report" })).toBeTruthy();
    expect(deliverables.getByRole("link", { name: "Findings" })).toBeTruthy();
    expect(deliverables.getByText("Your Sign-off")).toBeTruthy();
    // The seat card is shown once, with the team, in the column; the rail is there on a laptop.
    expect(screen.getAllByText("Seat card")).toHaveLength(1);
    expect(glance.getByText("Seat card")).toBeTruthy();
    expect(within(glance.getByRole("region", { name: "Your team" })).getByText("Lewis Lead")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Your room" })).toBeTruthy();

    // A link in the column opens the step that holds it.
    fireEvent.click(waiting.getByRole("link", { name: "Your Sign-off on the Findings" }));
    expect(screen.getByRole("region", { name: "Step 5: Findings" })).toBeTruthy();
  });

  it("lists the views in the rail by group, without group headings", () => {
    onWideScreen();
    render(<EngagementRoom room={room()} />);
    const rail = within(screen.getByRole("navigation", { name: "Your room" }));
    expect(within(rail.getByRole("list", { name: "The work" })).getAllByRole("link").map(link => link.textContent)).toEqual(["Work Plan2", "Sessions"]);
    expect(rail.queryByText("The work")).toBeNull();
    expect(rail.queryByText("What you receive")).toBeNull();
  });

  it("tells a staff member with full access that the Sign-off is the owner's, and says when nothing is waiting", () => {
    onWideScreen();
    render(<EngagementRoom room={room({ viewer: { kind: "member", access: "full" }, tasks: [] })} />);
    const glance = within(screen.getByRole("complementary", { name: "At a glance" }));
    expect(glance.getByText("Nothing outstanding. We will tell you here when there is.")).toBeTruthy();
    expect(glance.getByText("Awaiting Sign-off")).toBeTruthy();
  });

  it("opens an area's detail in a panel from the right, beside the page, instead of a sheet from below", async () => {
    onWideScreen();
    render(<EngagementRoom room={room({ insight: fromReport })} />);
    fireEvent.click(screen.getByRole("tab", { name: /Business/ }));
    const withReading = fromReport.areas.find(area => area.reading)!;
    fireEvent.click(within(screen.getByRole("list", { name: "Areas of your business" })).getAllByRole("button")[fromReport.areas.indexOf(withReading)]);
    expect(screen.getByRole("dialog", { name: withReading.area }).getAttribute("data-placement")).toBe("side");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("a Data Request's detail", () => {
  it("shows numbered questions as a list, one per line, when the item is opened", () => {
    const six = "A few words each is enough. 1. What do you sell, and who buys it? 2. Which decisions wait for you? 3. What would you fix first?";
    const base = room();
    render(<EngagementRoom room={room({ tasks: [{ ...base.tasks[0], detail: six }], deliverables: [] })} />);
    openItem("Your last 12 months of sales");
    const lists = screen.getAllByRole("list").filter(list => list.tagName === "OL" && !list.querySelector("ol") && list.textContent?.includes("Which decisions wait for you?"));
    expect(lists.length).toBeGreaterThan(0);
    expect(within(lists[0]).getAllByRole("listitem").map(item => item.textContent)).toEqual(["What do you sell, and who buys it?", "Which decisions wait for you?", "What would you fix first?"]);
    expect(screen.getAllByText("A few words each is enough.").length).toBeGreaterThan(0);
  });
});

describe("booking the Business Review Sessions", () => {
  it("offers the owner the next Session to book on Calendly, with their details filled in, until it is booked", () => {
    const url = "https://calendly.com/ipfactory-example/session?name=Ada&email=ada%40example.test";
    render(<EngagementRoom room={room({ nextSession: null, booking: { sessionId: 1, title: "Business Review Session 1", url } })} />);
    const book = screen.getByRole("link", { name: "Book Business Review Session 1" });
    expect(book.getAttribute("href")).toBe(url);
    expect(book.getAttribute("target")).toBe("_blank");
    expect(screen.getByText(/It shows here, with the Join link, once you have booked/)).toBeTruthy();
    expect(screen.queryByText(/No Session is booked yet/)).toBeNull();
  });

  it("shows the booked Session instead of a Book button once there is one", () => {
    render(<EngagementRoom room={room({ booking: null })} />);
    expect(screen.queryByRole("link", { name: /^Book / })).toBeNull();
    expect(within(screen.getByRole("region", { name: "Next meeting" })).getByText("Business Review Session 1")).toBeTruthy();
  });
});

describe("the Plan, Meetings and Data requests views", () => {
  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = true;
    window.history.replaceState(null, "", "/dashboard");
  });
  const NOW = new Date("2026-10-13T10:00:00Z").getTime();
  const open = (name: RegExp | string) => fireEvent.click(screen.getByRole("tab", { name }));

  it("cards the plan by week with each week's Sessions, flags who, when and what waits on the client, and opens one to act on it (R85)", () => {
    render(<EngagementRoom room={room()} now={NOW} />);
    open(/^Work Plan/);
    const weeks = screen.getAllByRole("region", { name: /^(Week \d+|No week)$/ });
    expect(weeks.length).toBeGreaterThan(0);
    const all = weeks.map(week => week.textContent ?? "").join(" ");
    expect(all).toContain("Your last 12 months of sales");
    expect(all).toContain("Due in 1 day");
    // Waiting on you narrows the cards to the client's open items.
    fireEvent.click(screen.getByRole("switch", { name: /Waiting on you/ }));
    const waiting = screen.getAllByRole("region", { name: /^(Week \d+|No week)$/ }).map(week => week.textContent ?? "").join(" ");
    expect(waiting).toContain("Your price list");
    expect(waiting).not.toContain("Send the cash template");
    expect(waiting).not.toContain("Who works in the business");
    fireEvent.click(screen.getByRole("button", { name: "Your price list" }));
    const panel = within(screen.getByRole("complementary", { name: "Task details" }));
    expect(panel.getByRole("heading", { name: "Your price list" })).toBeTruthy();
    expect(panel.getByText("We need a bit more: the delivery prices too")).toBeTruthy();
    // A long item scrolls inside its panel (ET, 13 November 2026).
    expect(screen.getByRole("complementary", { name: "Task details" }).className).toMatch(/max-h-\[calc\(100vh-5rem\)\].*overflow-y-auto/);
    expect(panel.getByRole("button", { name: "Submitted another way" })).toBeTruthy();
  });

  it("opens the item a timeline line points to (#task-N) in the List, with its detail and buttons", () => {
    render(<EngagementRoom room={room()} now={NOW} />);
    act(() => { window.location.hash = "#task-12"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
    const panel = within(screen.getByRole("complementary", { name: "Task details" }));
    expect(panel.getByRole("heading", { name: "Your price list" })).toBeTruthy();
    expect(panel.getByRole("button", { name: "Submitted another way" })).toBeTruthy();
  });

  it("shows who each item is with as initials, and its priority with a flag, only High in colour", () => {
    const base = room();
    const tasks = [{ ...base.tasks[0], assigneeName: "Marcelle Tiogo", priority: "high" as const }, { ...base.tasks[1], priority: "medium" as const }, base.tasks[3]];
    render(<EngagementRoom room={room({ tasks })} now={NOW} />);
    open(/^Work Plan/);
    for (const week of screen.queryAllByRole("region", { name: /^(Week \d+|No week)$/ })) { const header = within(week).getAllByRole("button")[0]!; if (header.getAttribute("aria-expanded") === "false") fireEvent.click(header); }
    const row = (title: string) => screen.getByRole("button", { name: title });
    expect(within(row("Your last 12 months of sales")).getByTitle("Marcelle Tiogo").textContent).toContain("MT");
    expect(within(row("Your price list")).getByTitle("Ada Foods").textContent).toContain("AF");
    // IP Factory's own work is one line in its week, not an item (R86).
    expect(screen.queryByRole("button", { name: "Send the cash template" })).toBeNull();
    expect(document.body.textContent).toMatch(/IP Factory's work: 1 piece/);
    expect(within(row("Your last 12 months of sales")).getByText("High").className).toContain("text-health-stuck");
    expect(within(row("Your price list")).getByText("Medium").className).toContain("text-ink-muted");
  });

  it("lists the meetings in date order, with the Join link before and the shared notes after", () => {
    render(<EngagementRoom room={room()} now={NOW} />);
    open("Sessions");
    const meetings = within(screen.getByRole("list", { name: "Meetings" })).getAllByRole("listitem");
    expect(meetings.map(item => item.getAttribute("aria-label"))).toEqual(["Kick-off", "Business Review Session 1"]);
    expect(within(meetings[0]).getByText("We agreed to start with pricing.")).toBeTruthy();
    expect(within(meetings[0]).getByText("Held")).toBeTruthy();
    expect(within(meetings[1]).getByText("Next")).toBeTruthy();
    expect(within(meetings[1]).getByRole("link", { name: "Join the Session" }).getAttribute("href")).toBe("https://zoom.example.test/j/1");
  });

  it("shows where the Data Requests stand at the top of the Work Plan, with no Data Request tab: each item is answered in its task (R89)", () => {
    render(<EngagementRoom room={room()} now={NOW} />);
    expect(screen.queryByRole("tab", { name: /^Data Request/ })).toBeNull();
    open(/^Work Plan/);
    const summary = screen.getByRole("group", { name: "Where your Data Requests stand" });
    expect(summary.textContent).toContain("Requested3");
    expect(summary.textContent).toContain("Outstanding2");
  });


  it("puts each week's Sessions in its card, with Join before and Held after (R85)", () => {
    const base = room();
    const s0 = base.sessions[0]!;
    const sessions = [{ ...s0, id: 1, title: "Kick-off", scheduledFor: new Date("2026-10-07T14:00:00Z"), status: "held" as const, weekNumber: 1 }, { ...s0, id: 2, title: "Weekly Check-in", scheduledFor: new Date("2026-10-14T15:00:00Z"), status: "planned" as const, weekNumber: 2, meetingLink: "https://zoom.example.test/j/2" }];
    render(<EngagementRoom room={room({ startedOn: "2026-10-06", sessions })} now={NOW} />);
    open(/^Work Plan/);
    for (const week of screen.queryAllByRole("region", { name: /^(Week \d+|No week)$/ })) { const header = within(week).getAllByRole("button")[0]!; if (header.getAttribute("aria-expanded") === "false") fireEvent.click(header); }
    const first = within(screen.getByRole("list", { name: "Week 1 Sessions" }));
    expect(first.getByText("Kick-off")).toBeTruthy();
    expect(first.getByText("Held")).toBeTruthy();
    expect(first.queryByRole("link", { name: "Join" })).toBeNull();
    const second = within(screen.getByRole("list", { name: "Week 2 Sessions" }));
    expect(second.getByRole("link", { name: "Join" }).getAttribute("href")).toBe("https://zoom.example.test/j/2");
    expect(screen.getByRole("region", { name: "Week 2" }).textContent).toContain("This week");
  });

  it("shows the client Progress second, their side in tiles and bars, one figure for IP Factory's work, and no one's load by name (R92)", () => {
    render(<EngagementRoom room={room()} now={NOW} />);
    open("Progress");
    const panel = within(screen.getByRole("tabpanel", { name: "Progress" }));
    expect(panel.getAllByText("Done").length).toBeGreaterThan(0);
    expect(panel.getByText("IP Factory's work")).toBeTruthy();
    expect(panel.getByRole("region", { name: "Progress: Data Requests" })).toBeTruthy();
    expect(panel.getByRole("region", { name: "Progress: Work Plan by week" })).toBeTruthy();
    expect(panel.queryByRole("region", { name: "Progress: By person" })).toBeNull();
  });

  it("lets the client search their Work Plan by title or code (ET, 13 November 2026)", () => {
    render(<EngagementRoom room={room()} now={NOW} />);
    open(/^Work Plan/);
    const all = () => { for (const week of screen.queryAllByRole("region", { name: /^(Week \d+|No week)$/ })) { const header = within(week).getAllByRole("button")[0]!; if (header.getAttribute("aria-expanded") === "false") fireEvent.click(header); } return screen.getAllByRole("region", { name: /^(Week \d+|No week)$/ }).map(week => week.textContent ?? "").join(" "); };
    expect(all()).toContain("Your price list");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search the Work Plan" }), { target: { value: "price" } });
    expect(all()).toContain("Your price list");
    expect(all()).not.toContain("Your last 12 months of sales");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search the Work Plan" }), { target: { value: "nothing like this" } });
    expect(screen.getByText("Nothing matches. Try another word.")).toBeTruthy();
  });

  it("shows the client Held only once the team marks it, and never the team's buttons (R90)", () => {
    const base = room();
    const s0 = base.sessions[0]!;
    const sessions = [{ ...s0, id: 1, title: "Kick-off", scheduledFor: new Date("2026-10-07T14:00:00Z"), status: "planned" as const, weekNumber: 1, meetingLink: "https://zoom.example.test/j/1" }];
    render(<EngagementRoom room={room({ startedOn: "2026-10-06", sessions })} now={NOW} />);
    open(/^Work Plan/);
    for (const week of screen.queryAllByRole("region", { name: /^(Week \d+|No week)$/ })) { const header = within(week).getAllByRole("button")[0]!; if (header.getAttribute("aria-expanded") === "false") fireEvent.click(header); }
    const first = within(screen.getByRole("list", { name: "Week 1 Sessions" }));
    expect(first.queryByText("Held")).toBeNull();
    expect(first.queryByRole("link", { name: "Join" })).toBeNull();
    expect(first.queryByRole("button", { name: "Mark as held" })).toBeNull();
  });

  it("ticks what the client has sent as pending review, and shows it Completed once reviewed (R87)", () => {
    const base = room();
    const tasks = base.tasks.map(task => (task.id === 11 ? { ...task, status: "received" as const, statusLabel: "Sent, we are checking" } : task.id === 12 ? { ...task, status: "accepted" as const, statusLabel: "Received" } : task));
    render(<EngagementRoom room={room({ tasks })} now={NOW} />);
    const sent = openItem("Your last 12 months of sales");
    expect(sent.getByText("Sent, pending review")).toBeTruthy();
    expect(sent.getByText(/Ticked: you have sent it/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Your last 12 months of sales" }).textContent).toContain("Sent, pending review");
    expect(screen.getByRole("button", { name: "Your price list" }).textContent).toContain("Completed");
  });

  it("lets the client upload a file inside the item they are looking at (R85)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
    render(<EngagementRoom room={room({ uploadsEnabled: true })} now={NOW} />);
    const sales = openItem("Your last 12 months of sales");
    fireEvent.change(sales.getByLabelText("Upload files for Your last 12 months of sales"), { target: { files: [new File(["%PDF-1.4"], "sales.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(api.calls.confirmUpload).toHaveLength(1));
    expect(api.calls.requestUpload[0]).toMatchObject({ taskId: 11, fileName: "sales.pdf" });
    expect(api.calls.requestDrop).toEqual([]);
  });
;
});

describe("a Digital marketing room", () => {
  it("dates its own stages from the start, shows the day of 90, and holds the Work Plan in the current stage", () => {
    const now = new Date("2026-11-20T10:00:00Z").getTime(); // day 19 from 2 November
    render(<EngagementRoom room={room({ type: "digital_marketing", typeLabel: "Digital marketing", startedOn: "2026-11-02", check: null, deliverables: [] })} now={now} />);
    expect(screen.getByRole("heading", { level: 1, name: "Month 1" })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Day 19 of 90" })).toBeTruthy();
    const timeline = screen.getByRole("list", { name: "Engagement timeline" });
    const titles = within(timeline).getAllByRole("listitem").filter(item => item.id.startsWith("step-")).map(item => item.querySelector("button")!.textContent);
    expect(titles).toEqual(["OnboardingMon 2 Nov to Sun 8 Nov", "Month 1NowMon 9 Nov to Tue 1 Dec", "Month 1 reviewWed 2 Dec", "Month 2Thu 3 Dec to Thu 31 Dec", "Month 2 reviewFri 1 Jan", "Month 3Sat 2 Jan to Sat 30 Jan", "Month 3 reviewSun 31 Jan"]);
    expect(within(screen.getByRole("region", { name: "Step 2: Month 1" })).getByRole("list", { name: "Week 1" })).toBeTruthy();
    // No Business Health Check behind it: no Founder or Business views.
    expect(screen.queryByRole("tab", { name: "Founder" })).toBeNull();
  });

  it("leads with the month's reels, posts and stories, and lets the owner approve or ask for changes on the content board", () => {
    const now = new Date("2026-11-20T10:00:00Z").getTime();
    const item = (id: number, kind: "reel" | "post" | "story", title: string, status: "planned" | "for_approval" | "approved" | "published", month = 1) => ({ id, kind, kindLabel: kind, title, month, status, statusLabel: status, dueOn: null, link: null, clientNote: null, approvedAt: null, publishedAt: null });
    const content = [item(1, "reel", "Reel 6: knotless braids", "for_approval"), item(2, "reel", "Reel 5", "approved"), item(3, "post", "December offer", "published"), item(4, "story", "Behind the chair", "planned"), item(5, "reel", "Month 2 reel", "approved", 2)];
    const targets = [{ label: "Reels", count: 15 }, { label: "Posts", count: 5 }, { label: "Stories", count: 20 }];
    render(<EngagementRoom room={room({ type: "digital_marketing", typeLabel: "Digital marketing", startedOn: "2026-11-02", check: null, deliverables: [], content, contentTargets: targets })} now={now} />);
    // The dashboard counts what is published this month only (R77): an approved reel waits to go out.
    const board = within(screen.getByRole("region", { name: "Dashboard" }));
    expect(board.getByText("Reels, month 1").closest("a")!.textContent).toContain("0 of 15");
    expect(board.getByText("Posts, month 1").closest("a")!.textContent).toContain("1 of 5");
    expect(board.getByText("Stories, month 1").closest("a")!.textContent).toContain("0 of 20");
    // The Content view comes first in the work, counting what waits for approval.
    fireEvent.click(screen.getByRole("tab", { name: /^Content/ }));
    const approval = within(screen.getByRole("region", { name: "For your approval" }));
    const card = within(approval.getByRole("article", { name: "Reel 6: knotless braids" }));
    fireEvent.click(card.getByRole("button", { name: "Approve" }));
    expect(api.calls.respondToContent).toEqual([{ itemId: 1, approve: true, note: null }]);
    fireEvent.click(card.getByRole("button", { name: "Request changes" }));
    expect((card.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(card.getByLabelText("What to change in Reel 6: knotless braids"), { target: { value: "Shorter intro" } });
    fireEvent.click(card.getByRole("button", { name: "Send" }));
    expect(api.calls.respondToContent[1]).toEqual({ itemId: 1, approve: false, note: "Shorter intro" });
    // Month 2 holds its own items.
    expect(screen.queryByRole("article", { name: "Month 2 reel" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Month 2" }));
    expect(within(screen.getByRole("region", { name: "Approved" })).getByRole("article", { name: "Month 2 reel" })).toBeTruthy();
  });

  it("says when the programme starts before its first day", () => {
    render(<EngagementRoom room={room({ type: "digital_marketing", typeLabel: "Digital marketing", startedOn: "2026-12-01", check: null })} now={new Date("2026-11-20T10:00:00Z").getTime()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Starting soon" })).toBeTruthy();
    expect(screen.getByText(/starts on Tue 1 Dec/)).toBeTruthy();
  });
});

describe("the due flag", () => {
  it("says Done, overdue, today, soon, or the date, in Lagos days", () => {
    const now = new Date("2026-10-13T22:30:00Z").getTime(); // 23:30 in Lagos, still the 13th
    expect(dueFlag("2026-10-10", true, now)).toEqual({ text: "Done", tone: "done" });
    expect(dueFlag("2026-10-12", false, now)).toEqual({ text: "Overdue by 1 day", tone: "late" });
    expect(dueFlag("2026-10-13", false, now)).toEqual({ text: "Due today", tone: "soon" });
    expect(dueFlag("2026-10-15", false, now)).toEqual({ text: "Due in 2 days", tone: "soon" });
    expect(dueFlag("2026-10-30", false, now)?.tone).toBe("calm");
    expect(dueFlag(null, false, now)).toBeNull();
  });
});

describe("the team on the room", () => {
  it("puts a WhatsApp button beside each team member who agreed to share their number, the business and project named (R44)", () => {
    render(<EngagementRoom room={room({ team: [{ name: "Lewis Lead", roleLabel: "Engagement Manager", jobTitle: null, whatsapp: "+2348031234567" }, { name: "Ola Analyst", roleLabel: "Analyst", jobTitle: null, whatsapp: null }] })} />);
    const team = within(screen.getByRole("list", { name: "IP Factory" }));
    const chat = team.getByRole("link", { name: "WhatsApp Lewis" });
    expect(chat.getAttribute("href")).toBe(`https://wa.me/2348031234567?text=${encodeURIComponent("Hello Lewis, this is Ada Foods about Business Review.")}`);
    expect(chat.getAttribute("target")).toBe("_blank");
    expect(team.queryByRole("link", { name: "WhatsApp Ola" })).toBeNull();
  });

  it("offers to send an item on WhatsApp to the person it goes to (R44)", () => {
    const base = room();
    render(<EngagementRoom room={room({ tasks: base.tasks.map(task => (task.id === 11 ? { ...task, ref: "B1", sendTo: { name: "Femi Adebayo", whatsapp: "+2348030000002" } } : task)) })} />);
    const sales = openItem("Your last 12 months of sales");
    expect(sales.getByRole("link", { name: "Send on WhatsApp to Femi" }).getAttribute("href")).toBe(`https://wa.me/2348030000002?text=${encodeURIComponent("Hello Femi, here is B1 Your last 12 months of sales.")}`);
  });

  beforeEach(() => { window.history.replaceState(null, "", "/dashboard"); });
  it("shows each person's role on this engagement and their firm title", () => {
    render(<EngagementRoom room={room({ team: [{ name: "Tola Manager", roleLabel: "Engagement Manager", jobTitle: "Senior Associate" }, { name: "Ola Analyst", roleLabel: "Analyst", jobTitle: null }] })} />);
    const team = within(screen.getByRole("region", { name: "Your team" }));
    expect(team.getByText("Engagement Manager · Senior Associate")).toBeTruthy();
    expect(team.getByText("Analyst")).toBeTruthy();
  });

  it("shows the client's own people under the IP Factory team, with what each can see and who is you", () => {
    render(<EngagementRoom room={room()} />);
    const team = within(screen.getByRole("region", { name: "Your team" }));
    expect(within(team.getByRole("list", { name: "IP Factory" })).getAllByRole("listitem")).toHaveLength(2);
    const own = within(team.getByRole("list", { name: "Ada Foods" }));
    expect(own.getByText("Ada Okafor").textContent).toContain("(you)");
    expect(own.getByText("Owner")).toBeTruthy();
    expect(own.getByText("Contributor access")).toBeTruthy();
  });
});


describe("Preview as client", () => {
  it("shows the team the owner's room with every action switched off: no Sign-off, comment, sharing, upload, approval or download", async () => {
    const { RoomPreviewContext } = await import("@/components/room/RoomPreview");
    const file = { id: 31, fileName: "sales.pdf", sizeBytes: 2048, createdAt: new Date("2026-10-20T10:00:00Z"), mine: true, fromTeam: false };
    const preview = room({
      uploadsEnabled: true,
      deliverables: [{ ...room().deliverables[0], files: [file] }],
    });
    render(<RoomPreviewContext.Provider value><EngagementRoom room={preview} /></RoomPreviewContext.Provider>);
    // What the owner reads is all there.
    const found = within(screen.getByRole("region", { name: "Step 5: Findings" }));
    expect(found.getByText("Cash leaks at the till.")).toBeTruthy();
    expect(found.getByText("sales.pdf")).toBeTruthy();
    // What the owner does is not.
    expect(found.queryByRole("button", { name: "Sign off the Findings" })).toBeNull();
    expect(found.queryByLabelText("Your comment on What we found")).toBeNull();
    expect(found.queryByRole("button", { name: "Share with my team" })).toBeNull();
    expect(found.queryByRole("button", { name: /Download/ })).toBeNull();
    // No upload in the preview, inside an item either.
    expect(screen.queryByLabelText(/^Upload files for/)).toBeNull();
    const panel = openItem("Your last 12 months of sales");
    expect(panel.getByText(/The client uploads, sends a link and answers here. Switched off in the preview/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Not available" })).toBeNull();
    expect(Object.values(api.calls).every(calls => calls.length === 0)).toBe(true);
  });

  it("shows a content piece waiting for approval without the Approve and Request changes buttons", async () => {
    const { RoomPreviewContext } = await import("@/components/room/RoomPreview");
    const preview = room({
      type: "digital_marketing", typeLabel: "Digital marketing", startedOn: "2026-10-01",
      contentTargets: [{ label: "Reels", count: 15 }, { label: "Posts", count: 5 }, { label: "Stories", count: 20 }],
      content: [{ id: 41, kind: "reel", kindLabel: "Reel", title: "Opening day reel", month: 2, status: "for_approval", statusLabel: "For your approval", dueOn: null, link: null, clientNote: null, approvedAt: null, publishedAt: null }],
    });
    render(<RoomPreviewContext.Provider value><EngagementRoom room={preview} now={new Date("2026-11-06T10:00:00Z").getTime()} /></RoomPreviewContext.Provider>);
    fireEvent.click(screen.getByRole("tab", { name: /^Content/ }));
    const card = within(screen.getByRole("article", { name: "Opening day reel" }));
    expect(card.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(card.queryByRole("button", { name: "Request changes" })).toBeNull();
  });
});

describe("one client, many projects", () => {
  it("lists the client's projects and opens another, keeping it in the address", () => {
    render(<EngagementRoom room={room({ projects: [{ id: 9, title: "Pitch Deck", stageLabel: "Open", closed: false, current: false }, { id: 4, title: "Business Review", stageLabel: "Business Review", closed: false, current: true }] })} />);
    const projects = within(screen.getByRole("navigation", { name: "Your projects" }));
    expect(projects.getByRole("button", { name: /Business Review/ }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(projects.getByRole("button", { name: /Pitch Deck/ }));
    expect(new URLSearchParams(window.location.search).get("project")).toBe("9");
  });

  it("shows no switcher with one project", () => {
    render(<EngagementRoom room={room()} />);
    expect(screen.queryByRole("navigation", { name: "Your projects" })).toBeNull();
  });

  it("walks a service project through its four steps, read from its work", () => {
    render(<EngagementRoom room={room({ type: "done_for_you", typeLabel: "Done for You", service: "pitch_deck", title: "Pitch Deck", serviceStep: 2, stage: "setting_up" })} />);
    expect(screen.getAllByText("Pitch Deck: In progress").length).toBeGreaterThan(0);
    const steps = Array.from(screen.getByRole("list", { name: "Engagement timeline" }).querySelectorAll(":scope > li"));
    expect(steps.map(item => item.querySelector("button span span span")?.textContent)).toEqual(["Records in", "In progress", "Delivered", "Sign-off"]);
    expect(steps[1]!.getAttribute("aria-current")).toBe("step");
  });
});

describe("the pause, seven days after a missed fee date (D6)", () => {
  const late = { state: "late" as const, dueOn: "2026-12-02", pausesOn: "2026-12-09", label: "Month 2 service fee, payable before day 31", amount: 470000, payPath: "/pay/fee/12/abcdefghijklmnopqrstuvwxyz012345" };

  it("tells the owner a fee is late and when work pauses, with Pay, on every tab", () => {
    render(<EngagementRoom room={room({ hold: late })} />);
    const banner = within(screen.getByRole("region", { name: "A payment is late" }));
    expect(banner.getByText("Month 2 service fee, payable before day 31, ₦470,000, was due on Wed 2 Dec. Work pauses on Wed 9 Dec if it is still unpaid.")).toBeTruthy();
    expect(banner.getByRole("link", { name: /Pay ₦470,000/ }).getAttribute("href")).toBe("/pay/fee/12/abcdefghijklmnopqrstuvwxyz012345");
    // The banner sits above the tabs, so it stays in view on every one.
    fireEvent.click(screen.getByRole("tab", { name: /^Work Plan/ }));
    expect(screen.getByRole("region", { name: "A payment is late" })).toBeTruthy();
  });

  it("says work is paused and what to pay to continue; the room and uploads stay open", () => {
    render(<EngagementRoom room={room({ type: "digital_marketing", typeLabel: "Digital Marketing", title: "Digital Marketing", startedOn: "2026-11-02", hold: { ...late, state: "paused", dueOn: "2026-11-02", pausesOn: "2026-11-09", label: "Month 1 service fee, payable on starting" } })} />);
    const banner = within(screen.getByRole("region", { name: "Work is paused" }));
    expect(banner.getByText("Work on your Digital Marketing is paused")).toBeTruthy();
    expect(banner.getByText(/Pay it and the work starts again\. Your room and uploads stay open\./)).toBeTruthy();
    expect(banner.getByRole("link", { name: /Pay ₦470,000/ })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "Your engagement" })).toBeTruthy();
  });

  it("tells someone who cannot see the fees only that work is paused, and who can pay; no banner without a hold", () => {
    const { unmount } = render(<EngagementRoom room={room({ hold: { state: "paused", dueOn: "2026-11-02", pausesOn: "2026-11-09" } })} />);
    const banner = within(screen.getByRole("region", { name: "Work is paused" }));
    expect(banner.getByText(/The owner of the business can pay it from the room/)).toBeTruthy();
    expect(banner.queryByRole("link")).toBeNull();
    unmount();
    render(<EngagementRoom room={room()} />);
    expect(screen.queryByRole("region", { name: /Work is paused|A payment is late/ })).toBeNull();
  });
});

describe("Fix the next problem", () => {
  it("asks the team for another service with a note, and links to every service", () => {
    render(<EngagementRoom room={room()} />);
    const card = within(screen.getByRole("region", { name: "Fix the next problem" }));
    fireEvent.change(card.getByLabelText("The service you need"), { target: { value: "pitch_deck" } });
    fireEvent.change(card.getByLabelText("What is the problem? (optional)"), { target: { value: "Investor in December" } });
    fireEvent.click(card.getByRole("button", { name: "Ask your team" }));
    expect(api.calls.requestService).toEqual([{ service: "pitch_deck", note: "Investor in December", engagementId: 4 }]);
    expect(card.getByRole("link", { name: /See every service/ }).getAttribute("href")).toBe("/services");
  });

  it("offers every service but the one the room already is, Digital Marketing included (R35)", () => {
    const optionsIn = (type: string, service: string | null) => {
      const { unmount } = render(<EngagementRoom room={room({ type: type as never, typeLabel: "Digital Marketing", service, startedOn: "2026-11-02" })} />);
      const values = Array.from(within(screen.getByRole("region", { name: "Fix the next problem" })).getByLabelText<HTMLSelectElement>("The service you need").options).map(option => option.value);
      unmount();
      return values;
    };
    expect(optionsIn("digital_marketing", null)).not.toContain("digital_marketing");
    const elsewhere = optionsIn("done_for_you", "pitch_deck");
    expect(elsewhere).toContain("digital_marketing");
    expect(elsewhere).not.toContain("pitch_deck");
  });

  it("shows what the client has already asked for", () => {
    render(<EngagementRoom room={room({ requests: [{ id: 1, service: "pitch_deck", serviceName: "Pitch Deck", createdAt: new Date("2026-11-06T10:00:00Z") }] })} />);
    expect(within(screen.getByRole("list", { name: "Your requests" })).getByText("Pitch Deck")).toBeTruthy();
  });
});

describe("payments", () => {
  const fees = [
    feeRow({ id: 11, label: "Month 1 service fee, payable on starting", amount: 470000, dueOn: "2026-11-09", paid: true, reference: "TS-F-000011", payPath: null, receipts: [{ number: "TS-RC-000007", amount: 470000, refunded: 0, receivedOn: "2026-11-09" }] }),
    feeRow({ id: 12, label: "Month 2 service fee, payable before day 31", amount: 470000, dueOn: "2026-12-09", paid: false, reference: "TS-F-000012", payPath: "/pay/fee/12/abcdefghijklmnopqrstuvwxyz012345" }),
  ];

  it("lists the fees with what is paid and a Pay button for each fee due", () => {
    render(<EngagementRoom room={room({ fees })} />);
    fireEvent.click(screen.getByRole("tab", { name: /^Payments/ }));
    const list = within(screen.getByRole("region", { name: "Fees" }));
    expect(list.getByText("Paid")).toBeTruthy();
    expect(list.getByRole("link", { name: "Pay" }).getAttribute("href")).toBe("/pay/fee/12/abcdefghijklmnopqrstuvwxyz012345");
    expect(within(screen.getByRole("region", { name: "Summary" })).getByText("₦940,000")).toBeTruthy();
  });

  it("shows a fee paid in part with what is left and its receipts, Pay for the rest, and a closed fee as nothing more to pay (batch F)", () => {
    const parts = [
      feeRow({ id: 11, label: "Month 1 service fee, payable on starting", amount: 470000, dueOn: "2026-11-09", paid: false, paidAmount: 200000, left: 270000, reference: "TS-F-000011", payPath: "/pay/fee/11/abcdefghijklmnopqrstuvwxyz012345", receipts: [{ number: "TS-RC-000004", amount: 200000, refunded: 0, receivedOn: "2026-11-10" }] }),
      feeRow({ id: 12, label: "Month 2 service fee, payable before day 31", amount: 470000, dueOn: "2026-12-09", paid: true, paidAmount: 0, left: 0, writtenOff: true, reference: "TS-F-000012", payPath: null }),
    ];
    render(<EngagementRoom room={room({ fees: parts })} />);
    fireEvent.click(screen.getByRole("tab", { name: /^Payments/ }));
    const list = within(screen.getByRole("region", { name: "Fees" }));
    expect(list.getByText("₦200,000 of ₦470,000 paid, ₦270,000 left")).toBeTruthy();
    expect(list.getByText(/^Receipt TS-RC-000004 · ₦200,000/)).toBeTruthy();
    expect(list.getByRole("link", { name: "Pay ₦270,000" }).getAttribute("href")).toBe("/pay/fee/11/abcdefghijklmnopqrstuvwxyz012345");
    expect(list.getByText("Nothing more to pay")).toBeTruthy();
    expect(list.queryByText(/written off/i)).toBeNull();
    // The summary adds up: what was paid, what was closed without payment ("Not charged", never the team's word), what is left.
    const summary = within(screen.getByRole("region", { name: "Summary" }));
    expect(summary.getByText("₦940,000")).toBeTruthy();
    expect(summary.getByText("₦200,000")).toBeTruthy();
    expect(summary.getByText("Not charged").nextElementSibling!.textContent).toBe("₦470,000");
    expect(summary.getByText("To pay").nextElementSibling!.textContent).toBe("₦270,000");
  });

  it("lists a service's two halves: the first paid, the second due seven days after delivery until it has a date, and no pay step before then (R36)", () => {
    const halves = [
      feeRow({ id: -4, label: "Business Review: half to start", amount: 300000, dueOn: null, paid: true, reference: "TS-CS-000004", payPath: null }),
      feeRow({ id: 21, label: "Business Review: half on delivery", amount: 300000, dueOn: null, paid: false, reference: "TS-F-000021", payPath: "/pay/fee/21/abcdefghijklmnopqrstuvwxyz012345" }),
    ];
    const planned = [{ id: 1, title: "Business Review Session 1", scheduledFor: new Date("2026-11-12T09:00:00Z"), durationMinutes: 90, meetingLink: null, status: "planned" as const, weekNumber: 1, sortOrder: 1, agenda: null, notes: null, notesSharedAt: null, notesAudience: null }];
    render(<EngagementRoom room={room({ fees: halves, sessions: planned, nextSession: null })} />);
    // The second half is not a first thing to do: it falls due on delivery.
    const week = within(within(screen.getByRole("region", { name: "Getting started" })).getByRole("list", { name: "First things to do" }));
    expect(week.queryByRole("link", { name: /^Pay / })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /^Payments/ }));
    const list = within(screen.getByRole("region", { name: "Fees" }));
    expect(list.getByText("TS-CS-000004")).toBeTruthy();
    expect(list.getByText("Due seven days after delivery · TS-F-000021")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Summary" })).getByText("₦600,000")).toBeTruthy();
  });

  it("shows only the first fee to pay until it is paid, and no tabs", () => {
    render(<EngagementRoom room={room({ fees: fees.map(fee => feeRow({ id: fee.id, label: fee.label, amount: fee.amount, dueOn: fee.dueOn, reference: fee.reference, paid: false, payPath: `/pay/fee/${fee.id}/abcdefghijklmnopqrstuvwxyz012345` })), awaitingPayment: true })} />);
    const gate = within(screen.getByRole("region", { name: "First payment" }));
    expect(gate.getByText("Your room opens once the first payment is made")).toBeTruthy();
    expect(gate.getByText("₦470,000")).toBeTruthy();
    expect(gate.getByRole("link", { name: /Pay securely with Paystack/ }).getAttribute("href")).toBe("/pay/fee/11/abcdefghijklmnopqrstuvwxyz012345");
    expect(screen.queryByRole("tab", { name: /^Overview/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Work Plan/ })).toBeNull();
  });

  it("has no Payments tab when there are no fees", () => {
    render(<EngagementRoom room={room()} />);
    expect(screen.queryByRole("tab", { name: /^Payments/ })).toBeNull();
  });
});

describe("no proposal to sign", () => {
  it("has no Proposal tab and nothing to sign: the room opens on the work", () => {
    render(<EngagementRoom room={room()} />);
    expect(screen.queryByRole("tab", { name: /^Proposal/ })).toBeNull();
    expect(screen.queryByRole("form", { name: /Sign/ })).toBeNull();
    expect(screen.queryByText(/sign the proposal/i)).toBeNull();
  });
});
