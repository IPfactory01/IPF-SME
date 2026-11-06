/** @vitest-environment jsdom */

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { journeyOf } from "@shared/engagement";
import { AREA_NAMES } from "@shared/businessCheck/questions";
import { evaluate, READINESS_LABELS } from "@shared/businessCheck/engine";
import { buildFullReport } from "@shared/fullReport/build";
import { roomInsight, type RoomInsight } from "@shared/fullReport/insight";
import { MotionGlobalConfig } from "framer-motion";
import { WIDE_QUERY } from "@/hooks/useWide";
import { businessCheckProfiles } from "../../fixtures/businessCheckProfiles";
import { sampleIntake } from "../../fixtures/reportIntake";

const api = vi.hoisted(() => ({ calls: { respond: [] as unknown[], comment: [] as unknown[], accept: [] as unknown[], audience: [] as unknown[], requestUpload: [] as unknown[], confirmUpload: [] as unknown[], fileLink: [] as unknown[], requestDrop: [] as unknown[], confirmDrop: [] as unknown[], setNotAvailable: [] as unknown[], respondToContent: [] as unknown[] } }));
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
    useUtils: () => ({ engagement: { client: { room: { invalidate: () => undefined } } } }),
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
      },
    },
  },
}));

const { default: EngagementRoom, dueFlag } = await import("@/components/EngagementRoom");

const room = (over: Record<string, unknown> = {}) => ({
  engagementId: 4,
  content: [] as { id: number; kind: "reel" | "post" | "story"; kindLabel: string; title: string; month: number; status: "planned" | "in_edit" | "for_approval" | "changes_requested" | "approved" | "published"; statusLabel: string; dueOn: string | null; link: string | null; clientNote: string | null; approvedAt: Date | null; publishedAt: Date | null }[],
  contentTargets: [] as { label: string; count: number }[],
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
  team: [{ name: "Lewis Lead", roleLabel: "Engagement Manager", jobTitle: null as string | null }, { name: "Ola Analyst", roleLabel: "Analyst", jobTitle: null as string | null }],
  nextSession: { id: 1, title: "Business Review Session 1", scheduledFor: new Date("2026-10-23T09:00:00Z"), durationMinutes: 90, meetingLink: "https://zoom.example.test/j/1" },
  sessions: [
    { id: 1, title: "Business Review Session 1", scheduledFor: new Date("2026-10-23T09:00:00Z"), durationMinutes: 90, meetingLink: "https://zoom.example.test/j/1", status: "planned" as const, weekNumber: 1, sortOrder: 7, agenda: null, notes: null, notesSharedAt: null, notesAudience: null },
    { id: 2, title: "Kick-off", scheduledFor: new Date("2026-10-16T09:00:00Z"), durationMinutes: 30, meetingLink: null, status: "held" as const, weekNumber: null, sortOrder: 0, agenda: null, notes: "We agreed to start with pricing.", notesSharedAt: new Date("2026-10-16T12:00:00Z"), notesAudience: "owner" as const },
  ],
  tasks: [
    { id: 11, kind: "data_request" as const, side: "client" as const, title: "Your last 12 months of sales", detail: "Monthly totals are enough.", dueOn: "2026-10-14", status: "open" as const, statusLabel: "To do", statusNote: null, mine: false, weekNumber: 1, sortOrder: 1, factor: "internal" as const, section: null as string | null, ref: null as string | null, informs: null as string | null, format: null as string | null, priority: null as "high" | "medium" | "low" | null, assigneeName: null as string | null, files: [] },
    { id: 12, kind: "data_request" as const, side: "client" as const, title: "Your price list", detail: null, dueOn: "2026-10-14", status: "needs_more" as const, statusLabel: "We need a bit more", statusNote: "the delivery prices too", mine: true, weekNumber: 1, sortOrder: 2, factor: "internal" as const, section: null as string | null, ref: null as string | null, informs: null as string | null, format: null as string | null, priority: null as "high" | "medium" | "low" | null, assigneeName: null as string | null, files: [] },
    { id: 13, kind: "data_request" as const, side: "client" as const, title: "Who works in the business", detail: null, dueOn: null, status: "accepted" as const, statusLabel: "Received", statusNote: null, mine: false, weekNumber: 1, sortOrder: 3, factor: "internal" as const, section: null as string | null, ref: null as string | null, informs: null as string | null, format: null as string | null, priority: null as "high" | "medium" | "low" | null, assigneeName: null as string | null, files: [] },
    { id: 14, kind: "action" as const, side: "ipf" as const, title: "Send the cash template", detail: null, dueOn: "2026-10-20", status: "open" as const, statusLabel: "To do", statusNote: null, mine: false, weekNumber: 2, sortOrder: 1, factor: "internal" as const, section: null as string | null, ref: null as string | null, informs: null as string | null, format: null as string | null, priority: null as "high" | "medium" | "low" | null, assigneeName: null as string | null, files: [] },
  ],
  deliverables: [
    { id: 21, kind: "findings" as const, kindLabel: "Findings", title: "What we found", summary: "Cash leaks at the till.", sharedAt: new Date("2026-10-30T12:00:00Z"), audience: "owner" as const, audienceLabel: "Owner only", accepted: false, files: [], comments: [{ body: "Is this every day?", createdAt: new Date(), authorName: "Ada" }] },
  ],
  people: [{ name: "Ada Okafor", label: "Owner", you: true }, { name: "Bola Ade", label: "Contributor access", you: false }],
  sentFiles: [] as { id: number; fileName: string; sizeBytes: number; createdAt: Date; mine: boolean; note: string | null; matchedTo: { taskId: number; ref: string | null; title: string }[] }[],
  ...over,
});

beforeEach(() => {
  api.calls = { respond: [], comment: [], accept: [], audience: [], requestUpload: [], confirmUpload: [], fileLink: [], requestDrop: [], confirmDrop: [], setNotAvailable: [], respondToContent: [] };
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
    expect(action.getByRole("link", { name: "Open the Data Request" }).getAttribute("href")).toBe("#data");
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

describe("files in the room", () => {
  const openData = () => fireEvent.click(screen.getByRole("tab", { name: /^Data Request/ }));

  it("offers no upload until storage is set up: the client sends by WhatsApp or email, or says it went another way", () => {
    render(<EngagementRoom room={room()} />);
    openData();
    expect(screen.queryByLabelText("Choose files to send")).toBeNull();
    expect(screen.getByText("info@ipfactory.co")).toBeTruthy();
    expect(screen.queryByLabelText(/^Upload a file for/)).toBeNull();
  });

  it("takes many files at once into the drop box: each goes straight to the bucket, then the server records it unsorted", async () => {
    const put = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", put);
    render(<EngagementRoom room={room({ uploadsEnabled: true })} />);
    openData();
    const sales = new File(["%PDF-1.4"], "sales.pdf", { type: "application/pdf" });
    const prices = new File(["%PDF-1.4"], "prices.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Choose files to send"), { target: { files: [sales, prices] } });
    await waitFor(() => expect(api.calls.confirmDrop).toHaveLength(2));
    expect(api.calls.requestDrop).toEqual([{ fileName: "sales.pdf", contentType: "application/pdf", sizeBytes: 8 }, { fileName: "prices.pdf", contentType: "application/pdf", sizeBytes: 8 }]);
    expect(put).toHaveBeenCalledWith("https://example-project.supabase.co/storage/v1/object/upload/sign/engagement-files/engagements/4/inbox/abc-sales.pdf?token=up", expect.objectContaining({ method: "PUT", body: sales }));
    expect(api.calls.confirmDrop[0]).toEqual({ storageKey: "engagements/4/inbox/abc-sales.pdf", note: null, fileName: "sales.pdf", contentType: "application/pdf", sizeBytes: 8 });
    expect(api.calls.requestUpload).toEqual([]);
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Uploads" })).getAllByText("Received")).toHaveLength(2));
  });

  it("tells the server nothing when the upload to the bucket fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    render(<EngagementRoom room={room({ uploadsEnabled: true })} />);
    openData();
    fireEvent.change(screen.getByLabelText("Choose files to send"), { target: { files: [new File(["x"], "sales.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(api.calls.requestDrop).toHaveLength(1));
    await waitFor(() => expect(screen.getByText(/The upload did not finish/)).toBeTruthy());
    expect(api.calls.confirmDrop).toEqual([]);
  });

  it("lets the client mark an item not available, with a note", () => {
    render(<EngagementRoom room={room()} />);
    openData();
    const sales = within(screen.getByRole("listitem", { name: "Your last 12 months of sales" }));
    fireEvent.click(sales.getByRole("button", { name: /Your last 12 months of sales/ }));
    fireEvent.click(sales.getByRole("button", { name: "Not available" }));
    fireEvent.change(sales.getByLabelText("Note on Your last 12 months of sales"), { target: { value: "We kept no records before March" } });
    fireEvent.click(sales.getByRole("button", { name: "Confirm" }));
    expect(api.calls.setNotAvailable).toEqual([{ taskId: 11, unavailable: true, note: "We kept no records before March" }]);
  });

  it("shows the documents received with the item each was matched to, or that it is under review", () => {
    const sentFiles = [
      { id: 7, fileName: "Sales 2025.xlsx", sizeBytes: 9_000, createdAt: new Date("2026-10-20T10:00:00Z"), mine: true, note: null, matchedTo: [{ taskId: 11, ref: "B1", title: "Your last 12 months of sales" }] },
      { id: 8, fileName: "IMG_2041.jpg", sizeBytes: 90_000, createdAt: new Date("2026-10-21T10:00:00Z"), mine: true, note: null, matchedTo: [] },
    ];
    render(<EngagementRoom room={room({ sentFiles })} />);
    openData();
    const received = within(screen.getByRole("region", { name: /Documents received/ }));
    expect(received.getByText("B1")).toBeTruthy();
    expect(received.getByText("Your last 12 months of sales")).toBeTruthy();
    expect(received.getByText("Under review")).toBeTruthy();
  });

  it("lists files with who sent them, and opens one through a link the server issues", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const files = [{ id: 99, fileName: "sales.pdf", sizeBytes: 120_000, createdAt: new Date(), mine: true, fromTeam: false }, { id: 100, fileName: "cash-template.xlsx", sizeBytes: 9_000, createdAt: new Date(), mine: false, fromTeam: true }];
    const base = room();
    render(<EngagementRoom room={room({ tasks: [{ ...base.tasks[2], files }], deliverables: [] })} />);
    openData();
    fireEvent.click(screen.getByRole("button", { name: /Who works in the business/ }));
    const list = within(screen.getAllByRole("list", { name: "Files" })[0]);
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
    expect(screen.getByText("Up ₦50,000 since the start.").className).toContain("text-health-watch");
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
    expect(names()).toEqual(["Overview", "Work Plan", "Data Request", "Sessions", "Deliverables"]);
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("list", { name: "Engagement timeline" })).toBeTruthy();
  });

  it("puts Business and Founder under what we found, before Deliverables, counts the stuck areas, and moves between tabs by tap and by arrow key", () => {
    render(<EngagementRoom room={room({ insight: fromReport })} />);
    const tabs = within(screen.getByRole("tablist", { name: "Your engagement" })).getAllByRole("tab");
    expect(names()).toEqual(["Overview", "Work Plan", "Data Request", "Sessions", "Business", "Founder", "Deliverables"]);
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

describe("the room on a laptop or desktop", () => {
  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = true;
    window.history.replaceState(null, "", "/dashboard");
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
    expect(within(rail.getByRole("list", { name: "The work" })).getAllByRole("link").map(link => link.textContent)).toEqual(["Work Plan2", "Data Request", "Sessions"]);
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
  it("shows numbered questions as a list, one per line, when the item is opened in the Data Request", () => {
    const six = "A few words each is enough. 1. What do you sell, and who buys it? 2. Which decisions wait for you? 3. What would you fix first?";
    const base = room();
    render(<EngagementRoom room={room({ tasks: [{ ...base.tasks[0], detail: six }], deliverables: [] })} />);
    fireEvent.click(screen.getByRole("tab", { name: /^Data Request/ }));
    fireEvent.click(screen.getByRole("button", { name: /Your last 12 months of sales/ }));
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

  it("groups every task by where it stands, with who owns it and a due flag, and opens one to act on it", () => {
    render(<EngagementRoom room={room()} now={NOW} />);
    open(/^Work Plan/);
    const waiting = within(screen.getByRole("region", { name: "Waiting on you" }));
    expect(waiting.getByText("Your last 12 months of sales")).toBeTruthy();
    // Twice per row: in the Due column and in the line under the title that phones show instead.
    expect(waiting.getAllByText("Due in 1 day")).toHaveLength(4);
    expect(within(screen.getByRole("region", { name: "With IP Factory" })).getByText("Send the cash template")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Done" })).getByText("Who works in the business")).toBeTruthy();
    fireEvent.click(waiting.getByRole("button", { name: /Your price list/ }));
    const panel = within(screen.getByRole("complementary", { name: "Task details" }));
    expect(panel.getByRole("heading", { name: "Your price list" })).toBeTruthy();
    expect(panel.getByText("We need a bit more: the delivery prices too")).toBeTruthy();
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
    const row = (title: string) => screen.getAllByText(title).map(item => item.closest("tr")).find(Boolean)!;
    expect(within(row("Your last 12 months of sales")).getByTitle("Marcelle Tiogo").textContent).toContain("MT");
    expect(within(row("Your price list")).getByTitle("Ada Foods").textContent).toContain("AF");
    expect(within(row("Send the cash template")).getByTitle("IP Factory").textContent).toBe("IPFIP Factory");
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

  it("shows the Data Request as a list, with requested, received, outstanding and overdue above it", () => {
    render(<EngagementRoom room={room()} now={NOW} />);
    open("Data Request");
    const summary = screen.getByRole("group", { name: "Where your Data Requests stand" });
    expect(summary.textContent).toContain("Requested3");
    expect(summary.textContent).toContain("Outstanding2");
    // The open items come first; the received one last.
    const rows = within(screen.getByRole("region", { name: "Data Request" })).getAllByRole("listitem").map(item => item.getAttribute("aria-label"));
    expect(rows).toEqual(["Your last 12 months of sales", "Your price list", "Who works in the business"]);
    expect(screen.getByRole("listitem", { name: "Your price list" }).textContent).toContain("We need a bit more");
  });
});

describe("a Digital marketing room", () => {
  it("dates its own stages from the start, shows the day of 90, and holds the Work Plan in the current stage", () => {
    const now = new Date("2026-11-20T10:00:00Z").getTime(); // day 19 from 2 November
    render(<EngagementRoom room={room({ type: "digital_marketing", typeLabel: "Digital marketing", startedOn: "2026-11-02", check: null, deliverables: [] })} now={now} />);
    expect(screen.getByRole("heading", { level: 1, name: "Month 1" })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Day 19 of 90" })).toBeTruthy();
    const timeline = screen.getByRole("list", { name: "Engagement timeline" });
    const titles = within(timeline).getAllByRole("listitem").filter(item => item.id.startsWith("step-")).map(item => item.querySelector("button")!.textContent);
    expect(titles).toEqual(["OnboardingMon 2 Nov to Sun 8 Nov", "Month 1NowMon 9 Nov to Tue 1 Dec", "Month 1 reviewWed 2 Dec", "Month 2Thu 3 Dec to Thu 31 Dec", "Month 3Fri 1 Jan to Sat 30 Jan", "Quarter reviewSun 31 Jan"]);
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
    // The dashboard counts what is approved or published this month only.
    const board = within(screen.getByRole("region", { name: "Dashboard" }));
    expect(board.getByText("Reels, month 1").closest("a")!.textContent).toContain("1 of 15");
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

