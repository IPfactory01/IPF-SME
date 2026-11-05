/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const api = vi.hoisted(() => ({ calls: { respond: [] as unknown[], comment: [] as unknown[], accept: [] as unknown[], audience: [] as unknown[], requestUpload: [] as unknown[], confirmUpload: [] as unknown[], fileLink: [] as unknown[], requestDrop: [] as unknown[], confirmDrop: [] as unknown[], setNotAvailable: [] as unknown[] } }));
const replies: Record<string, unknown> = {
  requestUpload: { storageKey: "engagements/4/tasks/11/abc-sales.pdf", uploadUrl: "https://example-project.supabase.co/storage/v1/object/upload/sign/engagement-files/engagements/4/tasks/11/abc-sales.pdf?token=up", headers: { "content-type": "application/pdf", "x-upsert": "false" } },
  confirmUpload: { success: true, fileId: 99, status: "received" },
  requestDrop: { storageKey: "engagements/4/inbox/abc-sales.pdf", uploadUrl: "https://example-project.supabase.co/storage/v1/object/upload/sign/engagement-files/engagements/4/inbox/abc-sales.pdf?token=up", headers: { "content-type": "application/pdf", "x-upsert": "false" } },
  confirmDrop: { success: true, fileId: 99 },
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
        requestDrop: { useMutation: mutation("requestDrop") },
        confirmDrop: { useMutation: mutation("confirmDrop") },
        setNotAvailable: { useMutation: mutation("setNotAvailable") },
      },
    },
  },
}));

const { default: EngagementRoom, dueFlag } = await import("@/components/EngagementRoom");

const room = (over: Record<string, unknown> = {}) => ({
  engagementId: 4,
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
    { id: 11, kind: "data_request" as const, side: "client" as const, title: "Your last 12 months of sales", detail: "Monthly totals are enough.", dueOn: "2026-10-14", status: "open" as const, statusLabel: "To do", statusNote: null, mine: false, weekNumber: 1, sortOrder: 1, factor: "internal" as const, section: null as string | null, ref: null as string | null, informs: null as string | null, format: null as string | null, priority: null as "high" | "medium" | "low" | null, files: [] },
    { id: 12, kind: "data_request" as const, side: "client" as const, title: "Your price list", detail: null, dueOn: "2026-10-14", status: "needs_more" as const, statusLabel: "We need a bit more", statusNote: "the delivery prices too", mine: true, weekNumber: 1, sortOrder: 2, factor: "internal" as const, section: null as string | null, ref: null as string | null, informs: null as string | null, format: null as string | null, priority: null as "high" | "medium" | "low" | null, files: [] },
    { id: 13, kind: "data_request" as const, side: "client" as const, title: "Who works in the business", detail: null, dueOn: null, status: "accepted" as const, statusLabel: "Received", statusNote: null, mine: false, weekNumber: 1, sortOrder: 3, factor: "internal" as const, section: null as string | null, ref: null as string | null, informs: null as string | null, format: null as string | null, priority: null as "high" | "medium" | "low" | null, files: [] },
    { id: 14, kind: "action" as const, side: "ipf" as const, title: "Send the cash template", detail: null, dueOn: "2026-10-20", status: "open" as const, statusLabel: "To do", statusNote: null, mine: false, weekNumber: 2, sortOrder: 1, factor: "internal" as const, section: null as string | null, ref: null as string | null, informs: null as string | null, format: null as string | null, priority: null as "high" | "medium" | "low" | null, files: [] },
  ],
  deliverables: [
    { id: 21, kind: "findings" as const, kindLabel: "Findings", title: "What we found", summary: "Cash leaks at the till.", sharedAt: new Date("2026-10-30T12:00:00Z"), audience: "owner" as const, audienceLabel: "Owner only", accepted: false, files: [], comments: [{ body: "Is this every day?", createdAt: new Date(), authorName: "Ada" }] },
  ],
  sentFiles: [] as { id: number; fileName: string; sizeBytes: number; createdAt: Date; mine: boolean; note: string | null; matchedTo: { taskId: number; ref: string | null; title: string }[] }[],
  ...over,
});

beforeEach(() => {
  api.calls = { respond: [], comment: [], accept: [], audience: [], requestUpload: [], confirmUpload: [], fileLink: [], requestDrop: [], confirmDrop: [], setNotAvailable: [] };
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

  it("shows the Work Plan by week and in order, who does each item, and lets the owner mark a Data Request as submitted", () => {
    render(<EngagementRoom room={room({ deliverables: [] })} />);
    const plan = within(screen.getByRole("region", { name: "Step 4: Business Review" }));
    const week1 = within(plan.getByRole("list", { name: "Week 1" })).getAllByRole("listitem").map(item => item.getAttribute("aria-label"));
    expect(week1).toEqual(["Your last 12 months of sales", "Your price list", "Who works in the business", "Business Review Session 1"]);
    expect(within(plan.getByRole("list", { name: "Week 2" })).getAllByRole("listitem").map(item => item.getAttribute("aria-label"))).toEqual(["Send the cash template"]);
    const sales = within(plan.getByRole("listitem", { name: "Your last 12 months of sales" }));
    expect(sales.getByText("You")).toBeTruthy();
    expect(within(plan.getByRole("listitem", { name: "Send the cash template" })).getByText("IP Factory")).toBeTruthy();
    expect(within(plan.getByRole("listitem", { name: "Business Review Session 1" })).getByText("Together")).toBeTruthy();
    expect(within(plan.getByRole("listitem", { name: "Your price list" })).getByText("We need a bit more: the delivery prices too")).toBeTruthy();
    expect(within(plan.getByRole("listitem", { name: "Your price list" })).getByText("for you")).toBeTruthy();
    fireEvent.click(sales.getByRole("button", { name: "Submitted another way" }));
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
    fireEvent.click(within(timeline).getByRole("button", { name: /^Business Review/ }));
    const kickoff = within(screen.getByRole("listitem", { name: "Kick-off" }));
    expect(kickoff.getByText("We agreed to start with pricing.")).toBeTruthy();
    expect(kickoff.getByText(/only you can see these/)).toBeTruthy();
  });

  it("numbers each week's Work Plan 1, 2, 3 even when the stored order has gaps, and keeps our internal tags to ourselves", () => {
    const base = room({ deliverables: [] });
    const gaps = { ...base, tasks: base.tasks.map((task, index) => ({ ...task, sortOrder: [1, 2, 5, 9][index] ?? task.sortOrder })) };
    render(<EngagementRoom room={gaps} />);
    const plan = within(screen.getByRole("region", { name: "Step 4: Business Review" }));
    const badges = within(plan.getByRole("list", { name: "Week 1" })).getAllByRole("listitem").map(item => item.firstElementChild!.textContent);
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
  const openData = () => fireEvent.click(screen.getByRole("tab", { name: /^Data requests/ }));

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
    const list = within(screen.getAllByRole("list", { name: "Files" })[0]);
    expect(list.getByText("sales.pdf")).toBeTruthy();
    expect(list.getByText(/117 KB · you/)).toBeTruthy();
    expect(list.getByText(/9 KB · from your team at IP Factory/)).toBeTruthy();
    fireEvent.click(list.getAllByRole("button", { name: "Download" })[0]);
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://example-project.supabase.co/storage/v1/object/sign/engagement-files/k?token=down&download=sales.pdf", "_blank", "noopener"));
    expect(api.calls.fileLink).toEqual([{ fileId: 99 }]);
  });
});


describe("a Data Request's detail", () => {
  it("shows numbered questions as a list, one per line, in the Work Plan", () => {
    const six = "A few words each is enough. 1. What do you sell, and who buys it? 2. Which decisions wait for you? 3. What would you fix first?";
    const base = room();
    render(<EngagementRoom room={room({ tasks: [{ ...base.tasks[0], detail: six }], deliverables: [] })} />);
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
    open(/^List/);
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

  it("lists the meetings in date order, with the Join link before and the shared notes after", () => {
    render(<EngagementRoom room={room()} now={NOW} />);
    open("Schedule");
    const meetings = within(screen.getByRole("list", { name: "Meetings" })).getAllByRole("listitem");
    expect(meetings.map(item => item.getAttribute("aria-label"))).toEqual(["Kick-off", "Business Review Session 1"]);
    expect(within(meetings[0]).getByText("We agreed to start with pricing.")).toBeTruthy();
    expect(within(meetings[0]).getByText("Held")).toBeTruthy();
    expect(within(meetings[1]).getByText("Next")).toBeTruthy();
    expect(within(meetings[1]).getByRole("link", { name: "Join the Session" }).getAttribute("href")).toBe("https://zoom.example.test/j/1");
  });

  it("shows the Data Request as a list, with requested, received, outstanding and overdue above it", () => {
    render(<EngagementRoom room={room()} now={NOW} />);
    open("Data requests");
    const summary = screen.getByRole("group", { name: "Where your Data Requests stand" });
    expect(summary.textContent).toContain("Requested3");
    expect(summary.textContent).toContain("Outstanding2");
    // The open items come first; the received one last.
    const rows = within(screen.getByRole("region", { name: "Data Request" })).getAllByRole("listitem").map(item => item.getAttribute("aria-label"));
    expect(rows).toEqual(["Your last 12 months of sales", "Your price list", "Who works in the business"]);
    expect(screen.getByRole("listitem", { name: "Your price list" }).textContent).toContain("We need a bit more");
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
});

