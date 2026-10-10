/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { journeyOf } from "@shared/engagement";

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
  check: { primaryArea: 2, readiness: "intermediate" as const, completedAt: new Date("2026-10-09T10:00:00Z"), reportRequestedAt: null as Date | null },
  debrief: null as null | { heldAt: Date | null; heard: string | null; problemInOwnerWords: string | null; successLooksLike: string | null; tried: string | null; nextSteps: string | null; sharedAt: Date },
  problemStatement: null,
  measure: null,
  team: [{ name: "Lewis Lead", roleLabel: "Engagement lead" }, { name: "Ola Analyst", roleLabel: "Analyst" }],
  nextSession: { id: 1, title: "Current State Assessment call 1", scheduledFor: new Date("2026-10-23T09:00:00Z"), durationMinutes: 90, meetingLink: "https://zoom.example.test/j/1" },
  sessions: [
    { id: 1, title: "Current State Assessment call 1", scheduledFor: new Date("2026-10-23T09:00:00Z"), durationMinutes: 90, meetingLink: "https://zoom.example.test/j/1", status: "planned" as const, weekNumber: 1, sortOrder: 7, agenda: null, notes: null, notesSharedAt: null, notesAudience: null },
    { id: 2, title: "Kick-off", scheduledFor: new Date("2026-10-16T09:00:00Z"), durationMinutes: 30, meetingLink: null, status: "held" as const, weekNumber: null, sortOrder: 0, agenda: null, notes: "We agreed to start with pricing.", notesSharedAt: new Date("2026-10-16T12:00:00Z"), notesAudience: "owner" as const },
  ],
  tasks: [
    { id: 11, kind: "data_request" as const, side: "client" as const, title: "Your last 12 months of sales", detail: "Monthly totals are enough.", dueOn: "2026-10-14", status: "open" as const, statusLabel: "To do", statusNote: null, mine: false, weekNumber: 1, sortOrder: 1, factor: "internal" as const, files: [] },
    { id: 12, kind: "data_request" as const, side: "client" as const, title: "Your price list", detail: null, dueOn: "2026-10-14", status: "needs_more" as const, statusLabel: "We need a bit more", statusNote: "the delivery prices too", mine: true, weekNumber: 1, sortOrder: 2, factor: "internal" as const, files: [] },
    { id: 13, kind: "data_request" as const, side: "client" as const, title: "Who works in the business", detail: null, dueOn: null, status: "accepted" as const, statusLabel: "Received", statusNote: null, mine: false, weekNumber: 1, sortOrder: 3, factor: "internal" as const, files: [] },
    { id: 14, kind: "action" as const, side: "ipf" as const, title: "Send the cash template", detail: null, dueOn: "2026-10-20", status: "open" as const, statusLabel: "To do", statusNote: null, mine: false, weekNumber: 2, sortOrder: 4, factor: "internal" as const, files: [] },
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

describe("the client's engagement room", () => {
  it("opens with the business, the greeting, where we are, what is next in Lagos time, who the team is and what to send first", () => {
    render(<EngagementRoom room={room()} greeting="Welcome back, Ada" />);
    const where = within(screen.getByRole("region", { name: "Ada Foods" }));
    expect(where.getByText("Welcome back, Ada")).toBeTruthy();
    expect(where.getByText("Current State Assessment.")).toBeTruthy();
    const shortcut = where.getByText("2 things to send").closest("a")!;
    expect(shortcut.getAttribute("href")).toBe("#what-we-need");
    expect(shortcut.textContent).toBe("2 things to send · first by Wed 14 Oct");
    expect(where.getByRole("list", { name: "Your journey" }).querySelector('[aria-current="step"]')!.textContent).toContain("Current State Assessment");
    expect(where.getByText("Next: Current State Assessment call 1")).toBeTruthy();
    expect(where.getByText(/Fri 23 Oct, 10:00 am \(Lagos time\), 90 minutes/)).toBeTruthy();
    expect(where.getByRole("link", { name: "Join the call" }).getAttribute("href")).toBe("https://zoom.example.test/j/1");
    expect(where.getByText("Lewis Lead")).toBeTruthy();
  });

  it("lists what we need, says what more is needed, and lets the owner say they sent it", () => {
    render(<EngagementRoom room={room()} />);
    const need = within(screen.getByRole("region", { name: "2 things to send" }));
    expect(need.getByText("We need a bit more: the delivery prices too")).toBeTruthy();
    expect(need.getByText("for you")).toBeTruthy();
    expect(need.getByText("Already with us (1)")).toBeTruthy();
    expect(need.getByText("Send the cash template")).toBeTruthy();
    fireEvent.click(need.getAllByRole("button", { name: "I have sent this" })[0]);
    fireEvent.change(need.getByLabelText("How you sent Your last 12 months of sales"), { target: { value: "On WhatsApp" } });
    fireEvent.click(need.getByRole("button", { name: "Confirm" }));
    expect(api.calls.respond).toEqual([{ taskId: 11, note: "On WhatsApp" }]);
  });

  it("shows the owner what was shared, lets them sign off, comment, and decide whether their staff see it", () => {
    render(<EngagementRoom room={room()} />);
    const found = within(screen.getByRole("region", { name: "Shared with you" }));
    expect(found.getByText("Cash leaks at the till.")).toBeTruthy();
    expect(found.getAllByText(/only you can see/)).toHaveLength(2);
    expect(found.getByText("We agreed to start with pricing.")).toBeTruthy();
    fireEvent.click(found.getByRole("button", { name: "Sign this off" }));
    expect(api.calls.accept).toEqual([{ deliverableId: 21 }]);
    fireEvent.change(found.getByLabelText("Your comment on What we found"), { target: { value: "Thank you" } });
    fireEvent.click(found.getByRole("button", { name: "Send" }));
    expect(api.calls.comment).toEqual([{ deliverableId: 21, body: "Thank you" }]);
    fireEvent.click(found.getAllByRole("button", { name: "Share with my team" })[0]);
    expect(api.calls.audience).toEqual([{ item: "deliverable", id: 21, audience: "business" }]);
  });

  it("does not offer a staff member the owner's decisions", () => {
    render(<EngagementRoom room={room({ viewer: { kind: "member", access: "full" } })} />);
    expect(screen.queryByRole("button", { name: "Sign this off" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Share with my team" })).toBeNull();
    expect(screen.queryByText(/only you can see/)).toBeNull();
  });

  it("says plainly when nothing is booked, owed or shared yet", () => {
    render(<EngagementRoom room={room({ nextSession: null, team: [], tasks: [], deliverables: [], sessions: [] })} />);
    expect(screen.getByText("We will book your next call with you and it will show here.")).toBeTruthy();
    expect(screen.getByText("We are naming your team now.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Nothing outstanding" })).toBeTruthy();
    expect(screen.getByText("Notes from each call reach you the same day. Findings follow the second call.")).toBeTruthy();
  });

  it("gives the empty state a date once a call is booked, and no shortcut when there is nothing to send", () => {
    const planned = room().sessions[0];
    render(<EngagementRoom room={room({ tasks: [], deliverables: [], sessions: [planned] })} />);
    expect(screen.getByText("Notes from Current State Assessment call 1 reach you the same day, Fri 23 Oct. Findings follow the second call.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /to send/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "1 call" })).toBeTruthy();
  });

  it("lists each call with its date and whether it was held or is booked, soonest first", () => {
    render(<EngagementRoom room={room()} />);
    const calls = within(screen.getByRole("region", { name: "2 calls" }));
    const items = calls.getAllByRole("listitem").map(item => item.textContent);
    expect(items[0]).toContain("Kick-off");
    expect(items[0]).toContain("Held");
    expect(items[1]).toContain("Current State Assessment call 1");
    expect(items[1]).toContain("Booked");
    expect(items[1]).toContain("Fri 23 Oct, 10:00 am");
  });

  it("places what the page passes it, such as the owner's seat card, in the side column", () => {
    render(<EngagementRoom room={room()} aside={<p>Seat card</p>} />);
    expect(screen.getByText("Seat card")).toBeTruthy();
  });
});

describe("files in the room", () => {
  it("offers no upload until storage is set up: the owner tells us they sent it another way", () => {
    render(<EngagementRoom room={room()} />);
    expect(screen.queryByLabelText(/^Upload a file for/)).toBeNull();
    expect(screen.getAllByRole("button", { name: "I have sent this" }).length).toBeGreaterThan(0);
  });

  it("uploads straight to the bucket, then tells the server, with the file's own details", async () => {
    const put = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", put);
    render(<EngagementRoom room={room({ uploadsEnabled: true })} />);
    const file = new File(["%PDF-1.4"], "sales.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Upload a file for Your last 12 months of sales"), { target: { files: [file] } });
    await waitFor(() => expect(api.calls.confirmUpload).toHaveLength(1));
    expect(api.calls.requestUpload).toEqual([{ taskId: 11, fileName: "sales.pdf", contentType: "application/pdf", sizeBytes: 8 }]);
    expect(put).toHaveBeenCalledWith("https://example-project.supabase.co/storage/v1/object/upload/sign/engagement-files/engagements/4/tasks/11/abc-sales.pdf?token=up", expect.objectContaining({ method: "PUT", headers: { "content-type": "application/pdf", "x-upsert": "false" }, body: file }));
    expect(api.calls.confirmUpload).toEqual([{ taskId: 11, storageKey: "engagements/4/tasks/11/abc-sales.pdf", note: null, fileName: "sales.pdf", contentType: "application/pdf", sizeBytes: 8 }]);
    expect(screen.getAllByRole("button", { name: "I sent it another way" })).toHaveLength(2);
  });

  it("tells the server nothing when the upload to the bucket fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    render(<EngagementRoom room={room({ uploadsEnabled: true })} />);
    fireEvent.change(screen.getByLabelText("Upload a file for Your last 12 months of sales"), { target: { files: [new File(["x"], "sales.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(api.calls.requestUpload).toHaveLength(1));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(api.calls.confirmUpload).toEqual([]);
  });

  it("lists files with who sent them, and opens one through a link the server issues", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const files = [{ id: 99, fileName: "sales.pdf", sizeBytes: 120_000, createdAt: new Date(), mine: true, fromTeam: false }, { id: 100, fileName: "cash-template.xlsx", sizeBytes: 9_000, createdAt: new Date(), mine: false, fromTeam: true }];
    const base = room();
    render(<EngagementRoom room={room({ tasks: [{ ...base.tasks[2], files }] })} />);
    fireEvent.click(screen.getByText("Already with us (1)"));
    const list = within(screen.getByRole("list", { name: "Files" }));
    expect(list.getByText("sales.pdf")).toBeTruthy();
    expect(list.getByText(/117 KB · you/)).toBeTruthy();
    expect(list.getByText(/9 KB · from your team at IP Factory/)).toBeTruthy();
    fireEvent.click(list.getAllByRole("button", { name: "Download" })[0]);
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://example-project.supabase.co/storage/v1/object/sign/engagement-files/k?token=down&download=sales.pdf", "_blank", "noopener"));
    expect(api.calls.fileLink).toEqual([{ fileId: 99 }]);
  });
});

describe("the one number we watch", () => {
  it("shows where it started, this week's reading and where it is going, week by week", () => {
    const measure = { name: "Cash in the bank on Friday", definition: "The business account balance after the week's payments.", unit: "₦", baselineValue: 150000, targetValue: 400000,
      latest: { weekNumber: 2, heldOn: "2026-11-20", reading: 210000, nextStep: "Chase the two late invoices." },
      readings: [{ weekNumber: 1, heldOn: "2026-11-13", reading: 160000, nextStep: "Start the daily cash count." }, { weekNumber: 2, heldOn: "2026-11-20", reading: 210000, nextStep: "Chase the two late invoices." }] };
    render(<EngagementRoom room={room({ stage: "fix", stageLabel: "The fix", measure })} />);
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
    render(<EngagementRoom room={room({ measure })} />);
    expect(screen.getByText("Up ₦50,000 since the start.").className).toContain("text-health-watch");
    cleanup();
    render(<EngagementRoom room={room({ measure: { ...measure, latest: null, readings: [] } })} />);
    expect(screen.getByText("The first reading comes with the first weekly check-in.")).toBeTruthy();
    expect(screen.getByText("Where it starts")).toBeTruthy();
  });

  it("shows no number card before the fix has one", () => {
    render(<EngagementRoom room={room()} />);
    expect(screen.queryByText("The one number we watch")).toBeNull();
  });
});
