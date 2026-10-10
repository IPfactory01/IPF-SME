/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FINDINGS_OUTLINE } from "@shared/engagement";

const api = vi.hoisted(() => ({
  list: { setUp: true, items: [] as unknown[] } as { setUp: boolean; items: unknown[] },
  detail: null as unknown,
  awaiting: [] as unknown[],
  storageError: null as { message: string } | null,
  storage: { configured: true, missing: [] as string[], bucket: "engagement-files", bucketFound: true as boolean | null, bucketPublic: false as boolean | null, problem: null as string | null },
  calls: {} as Record<string, unknown[]>,
}));
const replies: Record<string, unknown> = { start: { engagementId: 4, created: true }, fileLink: { url: "https://example-project.supabase.co/storage/v1/object/sign/engagement-files/k?token=down&download=sales.pdf" } };
const mutation = (name: string) => (options?: { onSuccess?: (value: never) => void }) => ({
  isPending: false,
  mutate: (input: unknown) => { (api.calls[name] ??= []).push(input); options?.onSuccess?.((replies[name] ?? { success: true }) as never); },
  mutateAsync: async (input: unknown) => { (api.calls[name] ??= []).push(input); options?.onSuccess?.((replies[name] ?? { success: true }) as never); return replies[name] ?? { success: true }; },
});
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ engagement: { staff: { detail: { invalidate: () => undefined }, list: { invalidate: () => undefined }, awaitingStart: { invalidate: () => undefined } } } }),
    engagement: {
      staff: {
        list: { useQuery: () => ({ data: api.list, isLoading: false, error: null }) },
        awaitingStart: { useQuery: () => ({ data: api.awaiting }) },
        storageStatus: { useQuery: () => ({ data: api.storageError ? undefined : api.storage, error: api.storageError, refetch: () => undefined }) },
        detail: { useQuery: () => ({ data: api.detail, isLoading: false, error: null }) },
        assignableStaff: { useQuery: () => ({ data: [{ userId: 9, name: "Ola Analyst", email: "ola@example.test", roles: ["analyst"] }] }) },
        ...Object.fromEntries(["start", "fileLink", "requestUpload", "confirmUpload", "saveMeasure", "saveCheckin", "setStage", "assign", "removeMember", "saveProblem", "saveSession", "saveNotes", "shareNotes", "saveTask", "saveDeliverable", "approveDeliverable", "shareDeliverable", "comment"].map(name => [name, { useMutation: mutation(name) }])),
      },
    },
  },
}));

const { default: EngagementsView } = await import("@/components/admin/EngagementsView");

const row = { id: 4, stage: "setting_up", stageLabel: "Getting set up", businessName: "Ada Foods", ownerName: "Ada Okafor", ownerEmail: "ada@example.test", hasAccount: true, createdAt: new Date(), team: [], openClientRequests: 5, overdueClientRequests: 2, unscheduledSessions: 2, nextSession: null };
const task = (over: Record<string, unknown>) => ({ id: 51, engagementId: 4, kind: "data_request", side: "client", title: "Your price list", detail: null, assigneeUserId: null, dueOn: "2026-10-21", status: "open", statusLabel: "To do", statusNote: null, sessionId: null, weekNumber: 1, sortOrder: 4, factor: "internal", createdByUserId: 1, completedAt: null, createdAt: new Date(), updatedAt: new Date(), files: [], ...over });
const session = { id: 31, engagementId: 4, kind: "assessment_call", title: "Current State Assessment call 1", scheduledFor: null, durationMinutes: 90, meetingLink: null, agenda: null, status: "planned", weekNumber: 1, sortOrder: 7, clientNotes: "Pricing first.", internalNotes: "Watch cash sales.", notesAudience: "owner", notesSharedAt: null, notesSharedByUserId: null, createdByUserId: 1, createdAt: new Date(), updatedAt: new Date() };
const deliverable = (over: Record<string, unknown>) => ({ id: 41, engagementId: 4, kind: "prescription", kindLabel: "Prescription", title: "Daily cash count", summary: "Count every evening.", status: "draft", audience: "owner", approvedByUserId: null, approvedAt: null, sharedByUserId: null, sharedAt: null, clientAcceptedByUserId: null, clientAcceptedAt: null, createdByUserId: 1, createdAt: new Date(), updatedAt: new Date(), needsApproval: true, comments: [], files: [], ...over });
const detail = (can: { manage: boolean; assign: boolean; review: boolean }, deliverables = [deliverable({})], tasks: unknown[] = []) => ({
  uploadsEnabled: true,
  engagement: { id: 4, businessCheckId: 1, businessId: 7, paymentRequestId: 2, stage: "setting_up", stageLabel: "Getting set up", problemArea: null, subProblem: null, problemStatement: null, assessmentStartedAt: null, fixStartedAt: null, closedAt: null, createdAt: new Date(), updatedAt: new Date() },
  owner: { name: "Ada Okafor", email: "ada@example.test", whatsapp: "+234 800 000 0001" },
  businessName: "Ada Foods",
  hasAccount: true,
  team: [],
  clientPeople: [{ userId: 3, name: "Ada Okafor", role: "owner", access: "full" }],
  sessions: [session],
  tasks,
  deliverables,
  measure: null as unknown,
  checkins: [] as unknown[],
  can,
});

beforeEach(() => {
  api.list = { setUp: true, items: [row] };
  api.awaiting = [];
  api.storage = { configured: true, missing: [], bucket: "engagement-files", bucketFound: true, bucketPublic: false, problem: null };
  api.storageError = null;
  api.calls = {};
});
afterEach(cleanup);

describe("the team's engagements", () => {
  it("shows the Work Plan by week and in order, and saves the week, the order and the factor with a task", async () => {
    api.detail = detail({ manage: true, assign: true, review: true }, [deliverable({})], [
      task({ id: 52, title: "Bank statements for the last 6 months", weekNumber: 2, sortOrder: 1 }),
      task({ id: 51, title: "Your price list", weekNumber: 1, sortOrder: 4 }),
      task({ id: 53, title: "Your three main competitors and what they charge", side: "ipf", kind: "action", weekNumber: 1, sortOrder: 6, factor: "external" }),
    ]);
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods"));
    const plan = await screen.findByRole("heading", { name: "Work Plan" });
    const section = plan.closest("section")!;
    const labels = within(section).getAllByLabelText(/price list|Bank statements|competitors/).map(card => card.getAttribute("aria-label"));
    expect(labels).toEqual(["Your price list", "Your three main competitors and what they charge", "Bank statements for the last 6 months"]);
    expect(section.textContent).toContain("Week 1");
    expect(section.textContent).toContain("Week 2");
    const card = within(section).getByLabelText("Your price list");
    expect((within(card).getByLabelText("Week") as HTMLSelectElement).value).toBe("1");
    expect((within(card).getByLabelText("Factor") as HTMLSelectElement).value).toBe("internal");
    fireEvent.change(within(card).getByLabelText("Week"), { target: { value: "2" } });
    fireEvent.change(within(card).getByLabelText("Order in the week"), { target: { value: "9" } });
    fireEvent.change(within(card).getByLabelText("Factor"), { target: { value: "external" } });
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));
    expect(api.calls.saveTask[0]).toMatchObject({ taskId: 51, weekNumber: 2, sortOrder: 9, factor: "external" });
  });

  it("lists what the desk needs at a glance: no team yet, what is overdue, calls not booked", () => {
    api.detail = detail({ manage: true, assign: true, review: true });
    render(<EngagementsView />);
    const tableRow = screen.getByText("Ada Foods").closest("tr")!;
    for (const text of ["Getting set up", "No one yet", "5 to send", "2 overdue", "2 not booked"]) expect(tableRow.textContent).toContain(text);
  });

  it("says whether file uploads are on, and if not exactly which setting or bucket is still missing", () => {
    api.detail = detail({ manage: true, assign: true, review: true });
    render(<EngagementsView />);
    expect(screen.getByRole("status", { name: "File uploads" }).textContent).toContain("File uploads: on.");
    cleanup();
    api.storage = { ...api.storage, configured: false, missing: ["SUPABASE_URL"], bucketFound: null, bucketPublic: null };
    render(<EngagementsView />);
    let line = screen.getByRole("status", { name: "File uploads" }).textContent ?? "";
    expect(line).toContain("File uploads: off.");
    expect(line).toContain("SUPABASE_URL: the project URL from Supabase → Project Settings → API");
    expect(line).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(line).toContain("then redeploy");
    cleanup();
    api.storage = { ...api.storage, configured: true, missing: [], bucketFound: false, bucketPublic: null };
    render(<EngagementsView />);
    line = screen.getByRole("status", { name: "File uploads" }).textContent ?? "";
    expect(line).toContain("there is no bucket named engagement-files");
    cleanup();
    api.storage = { ...api.storage, bucketFound: true, bucketPublic: true };
    render(<EngagementsView />);
    line = screen.getByRole("status", { name: "File uploads" }).textContent ?? "";
    expect(line).toContain("the bucket is public");
    expect(line).toContain('switch "Public bucket" off');
    cleanup();
    api.storage = { ...api.storage, bucketFound: null, bucketPublic: null, problem: "Storage refused the service key. Check SUPABASE_SERVICE_ROLE_KEY is the service_role key, not the anon key." };
    render(<EngagementsView />);
    expect(screen.getByRole("status", { name: "File uploads" }).textContent).toContain("not the anon key");
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
  });

  it("says so when the storage check itself fails, rather than showing nothing", () => {
    api.detail = detail({ manage: true, assign: true, review: true });
    api.storageError = { message: "Your role does not include engagements." };
    render(<EngagementsView />);
    expect(screen.getByRole("status", { name: "File uploads" }).textContent).toBe("Could not check file storage: Your role does not include engagements.");
  });

  it("flags a paid assessment with no engagement and starts it from the list", () => {
    api.detail = detail({ manage: true, assign: true, review: true });
    api.awaiting = [{ businessCheckId: 12, paymentRequestId: 3, confirmedAt: new Date("2026-10-15T10:00:00Z"), fullName: "Bola Quiet", businessName: "Bola Bakes", email: "bola@example.test" }];
    render(<EngagementsView />);
    const panel = within(screen.getByRole("region", { name: "Paid, but no engagement yet" }));
    expect(panel.getByText("Bola Bakes")).toBeTruthy();
    fireEvent.click(panel.getByRole("button", { name: "Start engagement" }));
    expect(api.calls.start).toEqual([{ businessCheckId: 12 }]);
  });

  it("shows no such panel when every paid assessment has its engagement", () => {
    render(<EngagementsView />);
    expect(screen.queryByRole("region", { name: "Paid, but no engagement yet" })).toBeNull();
  });

  it("offers the standard outline for a new findings deliverable, and only then", () => {
    api.detail = detail({ manage: true, assign: false, review: false }, []);
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    const drawer = within(screen.getByRole("dialog"));
    fireEvent.click(drawer.getByRole("button", { name: "Add a deliverable" }));
    const card = within(drawer.getByLabelText("New deliverable"));
    fireEvent.click(card.getByRole("button", { name: "Start from the standard findings outline" }));
    expect((card.getByLabelText("What it says") as HTMLTextAreaElement).value).toBe(FINDINGS_OUTLINE);
    expect(card.queryByRole("button", { name: "Start from the standard findings outline" })).toBeNull();
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

describe("files on the team's side", () => {
  it("lists a request's files with who sent them and who may see them, opens one, and offers to attach when storage is set up", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const task = { id: 7, engagementId: 4, kind: "data_request", title: "Your price list", detail: null, side: "client", assigneeUserId: null, dueOn: "2026-10-27", status: "received", statusLabel: "Sent, we are checking", statusNote: "Uploaded to the room", sessionId: null, createdByUserId: 1, completedAt: null, createdAt: new Date(), updatedAt: new Date(),
      files: [{ id: 99, fileName: "prices.pdf", contentType: "application/pdf", sizeBytes: 120_000, audience: "owner", uploadedByName: "Ada Okafor", createdAt: new Date() }] };
    api.detail = detail({ manage: true, assign: false, review: false }, [], [task]);
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    const card = within(within(screen.getByRole("dialog")).getByLabelText("Your price list"));
    expect(card.getByText(/117 KB · Ada Okafor · owner only/)).toBeTruthy();
    fireEvent.click(card.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith(expect.stringContaining("download=sales.pdf"), "_blank", "noopener"));
    expect(api.calls.fileLink).toEqual([{ fileId: 99 }]);
    expect(card.getByLabelText("Attach a file to task 7")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe("the fix on the team's side", () => {
  it("sets the number, then records week 1 with the five questions, the reading and the hours", () => {
    api.detail = detail({ manage: true, assign: false, review: false }, []);
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    const drawer = within(screen.getByRole("dialog"));
    fireEvent.change(drawer.getByLabelText("The number we watch"), { target: { value: "Cash in the bank on Friday" } });
    fireEvent.change(drawer.getByLabelText("Unit"), { target: { value: "₦" } });
    fireEvent.change(drawer.getByLabelText("Where it starts"), { target: { value: "150000" } });
    fireEvent.change(drawer.getByLabelText("Where it should get to"), { target: { value: "400000" } });
    fireEvent.click(drawer.getByRole("button", { name: "Set the number" }));
    expect(api.calls.saveMeasure).toEqual([{ engagementId: 4, name: "Cash in the bank on Friday", definition: "", unit: "₦", baselineValue: 150000, targetValue: 400000 }]);

    fireEvent.click(drawer.getByRole("button", { name: "Record week 1" }));
    const week = within(drawer.getByLabelText("Week 1"));
    fireEvent.change(week.getByLabelText("What moved this week?"), { target: { value: "Daily cash count started." } });
    fireEvent.change(week.getByLabelText("What is the next step, and by when?"), { target: { value: "Chase late invoices by Friday." } });
    fireEvent.change(week.getByLabelText("What does the number say this week?"), { target: { value: "160000" } });
    fireEvent.change(week.getByLabelText("Analyst hours"), { target: { value: "2.5" } });
    fireEvent.click(week.getByRole("button", { name: "Record week 1" }));
    expect(api.calls.saveCheckin).toEqual([expect.objectContaining({ engagementId: 4, weekNumber: 1, progress: "Daily cash count started.", nextStep: "Chase late invoices by Friday.", measureReading: 160000, hoursAnalyst: 2.5, hoursLead: null, aiUsed: false })]);
  });

  it("offers the next week only, in order", () => {
    const checkin = { id: 1, engagementId: 4, weekNumber: 1, heldOn: "2026-11-13", progress: "Started.", blockers: null, nextStep: "Keep going.", measureReading: 160000, questionsAsked: null, hoursLead: 1, hoursAnalyst: 2, hoursPartner: null, aiUsed: true, recordedByUserId: 1, createdAt: new Date(), updatedAt: new Date() };
    api.detail = { ...detail({ manage: true, assign: false, review: false }, []), measure: { id: 1, engagementId: 4, name: "Cash", definition: null, unit: "₦", baselineValue: 150000, targetValue: 400000, createdByUserId: 1, createdAt: new Date(), updatedAt: new Date() }, checkins: [checkin] };
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    const drawer = within(screen.getByRole("dialog"));
    expect(drawer.getByText(/Week 1/).textContent).toContain("₦160,000");
    expect(drawer.getByRole("button", { name: "Record week 2" })).toBeTruthy();
    expect(drawer.queryByRole("button", { name: "Record week 1" })).toBeNull();
    expect(drawer.getByRole("button", { name: "Save week 1" })).toBeTruthy();
  });
});
