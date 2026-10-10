/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { journeyOf } from "@shared/engagement";
import { AREA_NAMES } from "@shared/businessCheck/questions";
import { READINESS_LABELS } from "@shared/businessCheck/engine";

const api = vi.hoisted(() => ({ calls: { respond: [] as unknown[], comment: [] as unknown[], accept: [] as unknown[], audience: [] as unknown[], requestUpload: [] as unknown[], confirmUpload: [] as unknown[], fileLink: [] as unknown[] } }));
const replies: Record<string, unknown> = {
  requestUpload: { storageKey: "engagements/4/tasks/11/abc-sales.pdf", uploadUrl: "https://example-project.supabase.co/storage/v1/object/upload/sign/engagement-files/engagements/4/tasks/11/abc-sales.pdf?token=up", headers: { "content-type": "application/pdf", "x-upsert": "false" } },
  confirmUpload: { success: true, fileId: 99, status: "received" },
  fileLink: { url: "https://example-project.supabase.co/storage/v1/object/sign/engagement-files/k?token=down&download=sales.pdf" },
};
const mutation = (bucket: keyof typeof api.calls) => (options?: { onSuccess?: () => void }) => ({
  isPending: false,
  mutate: (input: unknown) => { api.calls[bucket].push(input); options?.onSuccess?.(); },
  mutateAsync: async (input: unknown) => { api.calls[bucket].push(input); options?.onSuccess?.(); return replies[bucket] ?? { success: true }; },
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
      },
    },
  },
}));

const { default: EngagementRoom } = await import("@/components/EngagementRoom");

const room = (over: Record<string, unknown> = {}) => ({
  engagementId: 4,
  uploadsEnabled: false,
  businessName: "Ada Foods",
  viewer: { kind: "owner" as const },
  stage: "assessment" as const,
  stageLabel: "Current State Assessment",
  journey: journeyOf("assessment"),
  assessmentStartedAt: null as Date | null,
  fixStartedAt: null as Date | null,
  closedAt: null as Date | null,
  createdAt: new Date("2026-10-16T10:00:00Z"),
  check: { primaryArea: 2, readiness: "intermediate" as const, completedAt: new Date("2026-10-09T10:00:00Z"), reportRequestedAt: null as Date | null, callRequestedAt: new Date("2026-10-09T10:05:00Z") as Date | null, callScheduledFor: new Date("2026-10-13T13:00:00Z") as Date | null },
  report: null as null | { requestedAt: Date; deliveredAt: Date | null },
  debrief: null as null | { heldAt: Date | null; heard: string | null; problemInOwnerWords: string | null; successLooksLike: string | null; tried: string | null; nextSteps: string | null; sharedAt: Date },
  problemStatement: null,
  measure: null,
  team: [{ name: "Lewis Lead", roleLabel: "Engagement lead" }, { name: "Ola Analyst", roleLabel: "Analyst" }],
  nextSession: { id: 1, title: "Current State Assessment Session 1", scheduledFor: new Date("2026-10-23T09:00:00Z"), durationMinutes: 90, meetingLink: "https://zoom.example.test/j/1" },
  sessions: [
    { id: 1, title: "Current State Assessment Session 1", scheduledFor: new Date("2026-10-23T09:00:00Z"), durationMinutes: 90, meetingLink: "https://zoom.example.test/j/1", status: "planned" as const, weekNumber: 1, sortOrder: 7, agenda: null, notes: null, notesSharedAt: null, notesAudience: null },
    { id: 2, title: "Kick-off", scheduledFor: new Date("2026-10-16T09:00:00Z"), durationMinutes: 30, meetingLink: null, status: "held" as const, weekNumber: null, sortOrder: 0, agenda: null, notes: "We agreed to start with pricing.", notesSharedAt: new Date("2026-10-16T12:00:00Z"), notesAudience: "owner" as const },
  ],
  tasks: [
    { id: 11, kind: "data_request" as const, side: "client" as const, title: "Your last 12 months of sales", detail: "Monthly totals are enough.", dueOn: "2026-10-14", status: "open" as const, statusLabel: "To do", statusNote: null, mine: false, weekNumber: 1, sortOrder: 1, factor: "internal" as const, files: [] },
    { id: 12, kind: "data_request" as const, side: "client" as const, title: "Your price list", detail: null, dueOn: "2026-10-14", status: "needs_more" as const, statusLabel: "We need a bit more", statusNote: "the delivery prices too", mine: true, weekNumber: 1, sortOrder: 2, factor: "internal" as const, files: [] },
    { id: 13, kind: "data_request" as const, side: "client" as const, title: "Who works in the business", detail: null, dueOn: null, status: "accepted" as const, statusLabel: "Received", statusNote: null, mine: false, weekNumber: 1, sortOrder: 3, factor: "internal" as const, files: [] },
    { id: 14, kind: "action" as const, side: "ipf" as const, title: "Send the cash template", detail: null, dueOn: "2026-10-20", status: "open" as const, statusLabel: "To do", statusNote: null, mine: false, weekNumber: 2, sortOrder: 1, factor: "internal" as const, files: [] },
  ],
  deliverables: [
    { id: 21, kind: "findings" as const, kindLabel: "Findings", title: "What we found", summary: "Cash leaks at the till.", sharedAt: new Date("2026-10-30T12:00:00Z"), audience: "owner" as const, audienceLabel: "Owner only", accepted: false, files: [], comments: [{ body: "Is this every day?", createdAt: new Date(), authorName: "Ada" }] },
  ],
  ...over,
});

beforeEach(() => {
  api.calls = { respond: [], comment: [], accept: [], audience: [], requestUpload: [], confirmUpload: [], fileLink: [] };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the client's room", () => {
  it("opens on now: the stage with its week and day, the next action as Data Request N of M, the next Session with Join, and the team", () => {
    render(<EngagementRoom room={room({ assessmentStartedAt: new Date("2026-10-19T08:00:00Z"), deliverables: [] })} greeting="Welcome back, Ada" now={new Date("2026-10-22T10:00:00Z").getTime()} />);
    const hero = within(screen.getByRole("region", { name: "Current State Assessment · Week 1 of 2" }));
    expect(hero.getByText("Welcome back, Ada · Ada Foods")).toBeTruthy();
    expect(hero.getByRole("progressbar", { name: "Day 4 of 14" }).getAttribute("aria-valuenow")).toBe("4");
    expect(hero.getByText("Next action · Data Request 1 of 3")).toBeTruthy();
    expect(hero.getByText("Your last 12 months of sales")).toBeTruthy();
    expect(hero.getByText("By Wed 14 Oct")).toBeTruthy();
    expect(hero.getByText("Current State Assessment Session 1")).toBeTruthy();
    expect(hero.getByText(/Fri 23 Oct, 10:00 am \(Lagos time\), 90 minutes/)).toBeTruthy();
    expect(hero.getByRole("link", { name: "Join the Session" }).getAttribute("href")).toBe("https://zoom.example.test/j/1");
    expect(screen.getByRole("heading", { name: "Lewis Lead and Ola Analyst" })).toBeTruthy();
  });

  it("numbers the Engagement timeline one to seven, marks what is done with its date, and opens the current step by itself", () => {
    render(<EngagementRoom room={room({ debrief: { heldAt: new Date("2026-10-13T13:00:00Z"), heard: "Two outlets and a van.", problemInOwnerWords: "Cash runs out in week three.", successLooksLike: null, tried: null, nextSteps: null, sharedAt: new Date() }, report: { requestedAt: new Date("2026-10-14T09:00:00Z"), deliveredAt: new Date("2026-10-14T10:00:00Z") } })} />);
    const timeline = screen.getByRole("list", { name: "Engagement timeline" });
    const items = within(timeline).getAllByRole("listitem").filter(item => item.id.startsWith("step-"));
    expect(items.map(item => item.querySelector("button")!.textContent)).toEqual([
      "Business CheckDone · Fri 9 Oct", "DebriefDone · Tue 13 Oct", "Full ReportDone · Wed 14 Oct", "Current State AssessmentDone · two weeks", "FindingsNowShared Fri 30 Oct", "The Fix6 weeks, after your Sign-off", "Day-30 Review30 days after The Fix ends",
    ]);
    expect(timeline.querySelector('[aria-current="step"]')!.id).toBe("step-5");
    expect(within(timeline).getByRole("button", { name: /^Findings/ }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("heading", { name: "Findings" })).toBeTruthy();
    expect(within(timeline).getByRole("button", { name: /^Debrief/ }).getAttribute("aria-expanded")).toBe("false");
    // Opening the Debrief shows what the team shared; the Business Check shows the main finding and readiness.
    fireEvent.click(within(timeline).getByRole("button", { name: /^Debrief/ }));
    const debrief = within(screen.getByRole("region", { name: "Step 2: Debrief" }));
    expect(debrief.getByText("Two outlets and a van.")).toBeTruthy();
    expect(debrief.getByText("Cash runs out in week three.")).toBeTruthy();
    fireEvent.click(within(timeline).getByRole("button", { name: /^Business Check/ }));
    const check = within(screen.getByRole("region", { name: "Step 1: Business Check" }));
    expect(check.getByText(AREA_NAMES[2])).toBeTruthy();
    expect(check.getByText(READINESS_LABELS.intermediate)).toBeTruthy();
  });

  it("shows the Work Plan by week and in order, who does each item, and lets the owner mark a Data Request as submitted", () => {
    render(<EngagementRoom room={room({ deliverables: [] })} />);
    const plan = within(screen.getByRole("region", { name: "Step 4: Current State Assessment" }));
    const week1 = within(plan.getByRole("list", { name: "Week 1" })).getAllByRole("listitem").map(item => item.getAttribute("aria-label"));
    expect(week1).toEqual(["Your last 12 months of sales", "Your price list", "Who works in the business", "Current State Assessment Session 1"]);
    expect(within(plan.getByRole("list", { name: "Week 2" })).getAllByRole("listitem").map(item => item.getAttribute("aria-label"))).toEqual(["Send the cash template"]);
    const sales = within(plan.getByRole("listitem", { name: "Your last 12 months of sales" }));
    expect(sales.getByText("You")).toBeTruthy();
    expect(within(plan.getByRole("listitem", { name: "Send the cash template" })).getByText("IP Factory")).toBeTruthy();
    expect(within(plan.getByRole("listitem", { name: "Current State Assessment Session 1" })).getByText("Together")).toBeTruthy();
    expect(within(plan.getByRole("listitem", { name: "Your price list" })).getByText("We need a bit more: the delivery prices too")).toBeTruthy();
    expect(within(plan.getByRole("listitem", { name: "Your price list" })).getByText("for you")).toBeTruthy();
    fireEvent.click(sales.getByRole("button", { name: "Mark as submitted" }));
    fireEvent.change(sales.getByLabelText("How you sent Your last 12 months of sales"), { target: { value: "On WhatsApp" } });
    fireEvent.click(sales.getByRole("button", { name: "Confirm" }));
    expect(api.calls.respond).toEqual([{ taskId: 11, note: "On WhatsApp" }]);
  });

  it("shows the owner the Findings, lets them sign off, comment, and decide whether their staff see it, and shows Session notes in the plan", () => {
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
    // The kick-off's notes sit on its row in the plan; the assessment is done once the Findings are out.
    fireEvent.click(within(timeline).getByRole("button", { name: /^Current State Assessment/ }));
    const kickoff = within(screen.getByRole("listitem", { name: "Kick-off" }));
    expect(kickoff.getByText("We agreed to start with pricing.")).toBeTruthy();
    expect(kickoff.getByText(/only you can see these/)).toBeTruthy();
  });

  it("asks the owner for Sign-off as the next action once nothing is outstanding", () => {
    render(<EngagementRoom room={room({ tasks: [] })} />);
    expect(screen.getByText("Read the Findings and give your Sign-off")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open the Findings/ }).getAttribute("href")).toBe("#step-5");
  });

  it("does not offer a staff member the owner's decisions, or the Debrief", () => {
    render(<EngagementRoom room={room({ viewer: { kind: "member", access: "full" }, tasks: [] })} />);
    expect(screen.queryByRole("button", { name: /Sign off the/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Share with my team" })).toBeNull();
    expect(screen.queryByText(/only you can see/)).toBeNull();
    expect(screen.getByText("Nothing outstanding. We will tell you here when there is.")).toBeTruthy();
  });

  it("says plainly when nothing is booked, planned or shared yet", () => {
    render(<EngagementRoom room={room({ stage: "setting_up", stageLabel: "Getting set up", journey: journeyOf("setting_up"), nextSession: null, team: [], tasks: [], deliverables: [], sessions: [] })} />);
    expect(screen.getByRole("heading", { name: "Getting set up" })).toBeTruthy();
    expect(screen.getByText("No Session is booked yet. It will show here with a Join link once it is.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "We are naming your team now." })).toBeTruthy();
    expect(screen.getByText("Your Work Plan appears here once your team sets it.")).toBeTruthy();
  });

  it("counts The Fix in weeks and places what the page passes it, such as the owner's seat card, at the end", () => {
    render(<EngagementRoom room={room({ stage: "fix", stageLabel: "The Fix", journey: journeyOf("fix"), fixStartedAt: new Date("2026-11-09T08:00:00Z") })} aside={<p>Seat card</p>} now={new Date("2026-11-25T10:00:00Z").getTime()} />);
    expect(screen.getByRole("heading", { name: "The Fix · Week 3 of 6" })).toBeTruthy();
    expect(screen.getByText("Seat card")).toBeTruthy();
  });
});

describe("files in the room", () => {
  it("offers no upload until storage is set up: the owner tells us they sent it another way", () => {
    render(<EngagementRoom room={room()} />);
    expect(screen.queryByLabelText(/^Upload a file for/)).toBeNull();
    expect(screen.getAllByRole("button", { name: "Mark as submitted" }).length).toBeGreaterThan(0);
  });

  it("uploads straight to the bucket, then tells the server, with the file's own details", async () => {
    const put = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", put);
    render(<EngagementRoom room={room({ uploadsEnabled: true })} />);
    const file = new File(["%PDF-1.4"], "sales.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getAllByLabelText("Upload a file for Your last 12 months of sales")[0], { target: { files: [file] } });
    await waitFor(() => expect(api.calls.confirmUpload).toHaveLength(1));
    expect(api.calls.requestUpload).toEqual([{ taskId: 11, fileName: "sales.pdf", contentType: "application/pdf", sizeBytes: 8 }]);
    expect(put).toHaveBeenCalledWith("https://example-project.supabase.co/storage/v1/object/upload/sign/engagement-files/engagements/4/tasks/11/abc-sales.pdf?token=up", expect.objectContaining({ method: "PUT", headers: { "content-type": "application/pdf", "x-upsert": "false" }, body: file }));
    expect(api.calls.confirmUpload).toEqual([{ taskId: 11, storageKey: "engagements/4/tasks/11/abc-sales.pdf", note: null, fileName: "sales.pdf", contentType: "application/pdf", sizeBytes: 8 }]);
    expect(screen.getAllByRole("button", { name: "Sent another way" }).length).toBeGreaterThan(0);
  });

  it("tells the server nothing when the upload to the bucket fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    render(<EngagementRoom room={room({ uploadsEnabled: true })} />);
    fireEvent.change(screen.getAllByLabelText("Upload a file for Your last 12 months of sales")[0], { target: { files: [new File(["x"], "sales.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(api.calls.requestUpload).toHaveLength(1));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(api.calls.confirmUpload).toEqual([]);
  });

  it("lists files with who sent them, and opens one through a link the server issues", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const files = [{ id: 99, fileName: "sales.pdf", sizeBytes: 120_000, createdAt: new Date(), mine: true, fromTeam: false }, { id: 100, fileName: "cash-template.xlsx", sizeBytes: 9_000, createdAt: new Date(), mine: false, fromTeam: true }];
    const base = room();
    render(<EngagementRoom room={room({ tasks: [{ ...base.tasks[2], files }], deliverables: [] })} />);
    const list = within(screen.getByRole("list", { name: "Files" }));
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
    render(<EngagementRoom room={room({ stage: "fix", stageLabel: "The Fix", journey: journeyOf("fix"), measure })} />);
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
    render(<EngagementRoom room={room({ stage: "fix", stageLabel: "The Fix", journey: journeyOf("fix"), measure })} />);
    expect(screen.getByText("Up ₦50,000 since the start.").className).toContain("text-health-watch");
    cleanup();
    render(<EngagementRoom room={room({ stage: "fix", stageLabel: "The Fix", journey: journeyOf("fix"), measure: { ...measure, latest: null, readings: [] } })} />);
    expect(screen.getByText("The first reading comes with the first Weekly Check-in.")).toBeTruthy();
    expect(screen.getByText("Where it starts")).toBeTruthy();
  });

  it("shows no Measure of Success before The Fix has one", () => {
    render(<EngagementRoom room={room({ stage: "fix", stageLabel: "The Fix", journey: journeyOf("fix") })} />);
    expect(screen.queryByText("Measure of Success")).toBeNull();
  });
});
