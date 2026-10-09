/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  list: { setUp: true, items: [] as unknown[] } as { setUp: boolean; items: unknown[] },
  detail: null as unknown,
  calls: {} as Record<string, unknown[]>,
}));
const mutation = (name: string) => (options?: { onSuccess?: () => void }) => ({ isPending: false, mutate: (input: unknown) => { (api.calls[name] ??= []).push(input); options?.onSuccess?.(); } });
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ engagement: { staff: { detail: { invalidate: () => undefined }, list: { invalidate: () => undefined } } } }),
    engagement: {
      staff: {
        list: { useQuery: () => ({ data: api.list, isLoading: false, error: null }) },
        detail: { useQuery: () => ({ data: api.detail, isLoading: false, error: null }) },
        assignableStaff: { useQuery: () => ({ data: [{ userId: 9, name: "Ola Analyst", email: "ola@example.test", roles: ["analyst"] }] }) },
        ...Object.fromEntries(["setStage", "assign", "removeMember", "saveProblem", "saveSession", "saveNotes", "shareNotes", "saveTask", "saveDeliverable", "approveDeliverable", "shareDeliverable", "comment"].map(name => [name, { useMutation: mutation(name) }])),
      },
    },
  },
}));

const { default: EngagementsView } = await import("@/components/admin/EngagementsView");

const row = { id: 4, stage: "setting_up", stageLabel: "Getting set up", businessName: "Ada Foods", ownerName: "Ada Okafor", ownerEmail: "ada@example.test", hasAccount: true, createdAt: new Date(), team: [], openClientRequests: 5, overdueClientRequests: 2, unscheduledSessions: 2, nextSession: null };
const session = { id: 31, engagementId: 4, kind: "assessment_call", title: "Current State Assessment call 1", scheduledFor: null, durationMinutes: 90, meetingLink: null, agenda: null, status: "planned", clientNotes: "Pricing first.", internalNotes: "Watch cash sales.", notesAudience: "owner", notesSharedAt: null, notesSharedByUserId: null, createdByUserId: 1, createdAt: new Date(), updatedAt: new Date() };
const deliverable = (over: Record<string, unknown>) => ({ id: 41, engagementId: 4, kind: "prescription", kindLabel: "Prescription", title: "Daily cash count", summary: "Count every evening.", status: "draft", audience: "owner", approvedByUserId: null, approvedAt: null, sharedByUserId: null, sharedAt: null, clientAcceptedByUserId: null, clientAcceptedAt: null, createdByUserId: 1, createdAt: new Date(), updatedAt: new Date(), needsApproval: true, comments: [], ...over });
const detail = (can: { manage: boolean; assign: boolean; review: boolean }, deliverables = [deliverable({})]) => ({
  engagement: { id: 4, businessCheckId: 1, businessId: 7, paymentRequestId: 2, stage: "setting_up", stageLabel: "Getting set up", problemArea: null, subProblem: null, problemStatement: null, assessmentStartedAt: null, fixStartedAt: null, closedAt: null, createdAt: new Date(), updatedAt: new Date() },
  owner: { name: "Ada Okafor", email: "ada@example.test", whatsapp: "+234 800 000 0001" },
  businessName: "Ada Foods",
  hasAccount: true,
  team: [],
  clientPeople: [{ userId: 3, name: "Ada Okafor", role: "owner", access: "full" }],
  sessions: [session],
  tasks: [],
  deliverables,
  can,
});

beforeEach(() => {
  api.list = { setUp: true, items: [row] };
  api.calls = {};
});
afterEach(cleanup);

describe("the team's engagements", () => {
  it("lists what the desk needs at a glance: no team yet, what is overdue, calls not booked", () => {
    api.detail = detail({ manage: true, assign: true, review: true });
    render(<EngagementsView />);
    const tableRow = screen.getByText("Ada Foods").closest("tr")!;
    for (const text of ["Getting set up", "No one yet", "5 to send", "2 overdue", "2 not booked"]) expect(tableRow.textContent).toContain(text);
  });

  it("says so when the database is not ready, instead of failing", () => {
    api.list = { setUp: false, items: [] };
    render(<EngagementsView />);
    expect(screen.getByRole("note").textContent).toContain("migration 0008");
  });

  it("lets the desk lead add an analyst and approve a prescription before it is shared", () => {
    api.detail = detail({ manage: true, assign: true, review: true });
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    const drawer = within(screen.getByRole("dialog"));
    fireEvent.change(drawer.getByLabelText("Add to the team"), { target: { value: "9" } });
    fireEvent.click(drawer.getByRole("button", { name: "Add" }));
    expect(api.calls.assign).toEqual([{ engagementId: 4, userId: 9, role: "analyst" }]);
    const card = within(drawer.getByLabelText("Daily cash count"));
    expect((card.getByRole("button", { name: "Share with the owner" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(card.getByRole("button", { name: "Approve" }));
    expect(api.calls.approveDeliverable).toEqual([{ deliverableId: 41 }]);
  });

  it("gives an analyst the work but not the team or the approval", () => {
    api.detail = detail({ manage: true, assign: false, review: false });
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    const drawer = within(screen.getByRole("dialog"));
    expect(drawer.queryByLabelText("Add to the team")).toBeNull();
    expect(drawer.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(drawer.getByText("The desk lead approves this before it can be shared.")).toBeTruthy();
  });

  it("saves notes without sharing, and shares only notes that are saved", () => {
    api.detail = detail({ manage: true, assign: false, review: false });
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    const card = within(within(screen.getByRole("dialog")).getByLabelText("Current State Assessment call 1"));
    expect(card.getByText("Not shared yet.")).toBeTruthy();
    fireEvent.click(card.getByRole("button", { name: "Share with the owner" }));
    expect(api.calls.shareNotes).toEqual([{ sessionId: 31, audience: "owner" }]);
    fireEvent.change(card.getByLabelText("Notes for the client"), { target: { value: "Pricing first, then cash." } });
    expect((card.getByRole("button", { name: "Share with the owner" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(card.getByRole("button", { name: "Save notes" }));
    expect(api.calls.saveNotes).toEqual([{ sessionId: 31, clientNotes: "Pricing first, then cash.", internalNotes: "Watch cash sales." }]);
  });
});
