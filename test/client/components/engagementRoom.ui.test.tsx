/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { journeyOf } from "@shared/engagement";

const api = vi.hoisted(() => ({ calls: { respond: [] as unknown[], comment: [] as unknown[], accept: [] as unknown[], audience: [] as unknown[] } }));
const mutation = (bucket: keyof typeof api.calls) => (options?: { onSuccess?: () => void }) => ({ isPending: false, mutate: (input: unknown) => { api.calls[bucket].push(input); options?.onSuccess?.(); } });
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
      },
    },
  },
}));

const { default: EngagementRoom } = await import("@/components/EngagementRoom");

const room = (over: Record<string, unknown> = {}) => ({
  engagementId: 4,
  businessName: "Ada Foods",
  viewer: { kind: "owner" as const },
  stage: "assessment" as const,
  stageLabel: "Current State Assessment",
  journey: journeyOf("assessment"),
  problemStatement: null,
  team: [{ name: "Lewis Lead", roleLabel: "Engagement lead" }, { name: "Ola Analyst", roleLabel: "Analyst" }],
  nextSession: { id: 1, title: "Current State Assessment call 1", scheduledFor: new Date("2026-10-23T09:00:00Z"), durationMinutes: 90, meetingLink: "https://zoom.example.test/j/1" },
  sessions: [
    { id: 1, title: "Current State Assessment call 1", scheduledFor: new Date("2026-10-23T09:00:00Z"), durationMinutes: 90, meetingLink: "https://zoom.example.test/j/1", status: "planned" as const, agenda: null, notes: null, notesSharedAt: null, notesAudience: null },
    { id: 2, title: "Kick-off", scheduledFor: new Date("2026-10-16T09:00:00Z"), durationMinutes: 30, meetingLink: null, status: "held" as const, agenda: null, notes: "We agreed to start with pricing.", notesSharedAt: new Date("2026-10-16T12:00:00Z"), notesAudience: "owner" as const },
  ],
  tasks: [
    { id: 11, kind: "data_request" as const, side: "client" as const, title: "Your last 12 months of sales", detail: "Monthly totals are enough.", dueOn: "2026-10-14", status: "open" as const, statusLabel: "To do", statusNote: null, mine: false },
    { id: 12, kind: "data_request" as const, side: "client" as const, title: "Your price list", detail: null, dueOn: "2026-10-14", status: "needs_more" as const, statusLabel: "We need a bit more", statusNote: "the delivery prices too", mine: true },
    { id: 13, kind: "data_request" as const, side: "client" as const, title: "Who works in the business", detail: null, dueOn: null, status: "accepted" as const, statusLabel: "Received", statusNote: null, mine: false },
    { id: 14, kind: "action" as const, side: "ipf" as const, title: "Send the cash template", detail: null, dueOn: "2026-10-20", status: "open" as const, statusLabel: "To do", statusNote: null, mine: false },
  ],
  deliverables: [
    { id: 21, kind: "findings" as const, kindLabel: "Findings", title: "What we found", summary: "Cash leaks at the till.", sharedAt: new Date("2026-10-30T12:00:00Z"), audience: "owner" as const, audienceLabel: "Owner only", accepted: false, comments: [{ body: "Is this every day?", createdAt: new Date(), authorName: "Ada" }] },
  ],
  ...over,
});

beforeEach(() => {
  api.calls = { respond: [], comment: [], accept: [], audience: [] };
});
afterEach(cleanup);

describe("the client's engagement room", () => {
  it("says where we are, what is next in Lagos time, and who the team is", () => {
    render(<EngagementRoom room={room()} />);
    const where = within(screen.getByRole("region", { name: "Current State Assessment" }));
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
});
