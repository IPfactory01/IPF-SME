/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FINDINGS_OUTLINE } from "@shared/engagement";
import { MotionGlobalConfig } from "framer-motion";

const api = vi.hoisted(() => ({
  list: { setUp: true, items: [] as unknown[] } as { setUp: boolean; items: unknown[] },
  detail: null as unknown,
  awaiting: [] as unknown[],
  today: [] as unknown[],
  // The record's sections are the same in the drawer and the workspace (R82): most tests use the desk's drawer.
  seesAll: true,
  storageError: null as { message: string } | null,
  storage: { configured: true, missing: [] as string[], bucket: "engagement-files", bucketFound: true as boolean | null, bucketPublic: false as boolean | null, problem: null as string | null },
  requests: [] as unknown[],
  fees: { feeLines: [], total: 0, suggested: [{ label: "Business Review, payable before work begins", amount: 600000, dueOn: null }], opensOnPayment: false, online: true, can: { edit: true, sendLink: true, recordPayments: false } } as unknown,
  calls: {} as Record<string, unknown[]>,
  failed: {} as Record<string, boolean>,
  refetched: [] as string[],
}));
const replies: Record<string, unknown> = { createDirect: { engagementId: 9, invitationUrl: "https://ipf-sme.example.test/join/OWNER", deliveryStatus: "Simulated", hasAccount: false }, sendSignInLink: { kind: "reset", email: "ada@example.test", url: "https://ipf-sme.example.test/reset/abc", deliveryStatus: "Simulated" }, start: { engagementId: 4, created: true }, sendFeeLink: { url: "https://ipf-sme.example.test/pay/fee/81/abcdefghijklmnopqrstuvwxyz012345", deliveryStatus: "Simulated" }, fileLink: { url: "https://example-project.supabase.co/storage/v1/object/sign/engagement-files/k?token=down&download=sales.pdf" } };
const mutation = (name: string) => (options?: { onSuccess?: (value: never, input: never) => void }) => ({
  isPending: false,
  mutate: (input: unknown) => { (api.calls[name] ??= []).push(input); options?.onSuccess?.((replies[name] ?? { success: true }) as never, input as never); },
  mutateAsync: async (input: unknown) => { (api.calls[name] ??= []).push(input); options?.onSuccess?.((replies[name] ?? { success: true }) as never, input as never); return replies[name] ?? { success: true }; },
});
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ engagement: { staff: { detail: { invalidate: () => undefined }, list: { invalidate: () => undefined }, awaitingStart: { invalidate: () => undefined }, serviceRequests: { invalidate: () => undefined }, fees: { invalidate: () => undefined } }, finance: { list: { invalidate: () => undefined } } } }),
    onboarding: { sendSignInLink: { useMutation: mutation("sendSignInLink") } },
    businessSupport: { emailDeliveryStatus: { useQuery: () => ({ data: [], isLoading: false, error: undefined }) } },
    engagement: {
      // Recording money (batch F): Finance and the Super Admin, from the engagement's Fees or the Finance tab.
      finance: Object.fromEntries(["recordPayment", "cancelPayment", "acceptPayment", "recordRefund", "cancelRefund", "writeOff", "reverseWriteOff"].map(name => [name, { useMutation: mutation(name) }])),
      staff: {
        list: { useQuery: () => ({ data: api.failed.list ? undefined : { seesAll: api.seesAll, ...api.list }, isLoading: false, error: api.failed.list ? new Error("Failed to fetch") : null, refetch: () => { api.refetched.push("list"); } }) },
        today: { useQuery: () => ({ data: api.today }) },
        awaitingStart: { useQuery: () => ({ data: api.failed.awaiting ? undefined : api.awaiting, error: api.failed.awaiting ? new Error("Failed to fetch") : null, refetch: () => { api.refetched.push("awaiting"); } }) },
        storageStatus: { useQuery: () => ({ data: api.storageError ? undefined : api.storage, error: api.storageError, refetch: () => undefined }) },
        detail: { useQuery: () => ({ data: api.detail, isLoading: false, error: null }) },
        assignableStaff: { useQuery: () => ({ data: [{ userId: 9, name: "Ola Analyst", email: "ola@example.test", roles: ["analyst"] }] }) },
        serviceRequests: { useQuery: () => ({ data: api.requests }) },
        clientBusinesses: { useQuery: () => ({ data: [{ id: 31, name: "Ada Foods" }, { id: 32, name: "Crown Studio" }] }) },
        fees: { useQuery: () => ({ data: api.failed.fees ? undefined : api.fees, error: api.failed.fees ? new Error("Failed to fetch") : null, refetch: () => { api.refetched.push("fees"); } }) },
        ...Object.fromEntries(["start", "fileLink", "matchFile", "removeFile", "createDirect", "handleRequest", "saveFees", "sendFeeLink", "openRoomNow", "setFeeTiming", "addMissingPlan", "askClient", "taskComment", "followUpShared", "bookMeeting", "loadDataRequest", "saveContent", "deleteContent", "requestUpload", "confirmUpload", "shareFile", "saveMeasure", "saveCheckin", "setStage", "assign", "removeMember", "saveProblem", "saveSession", "saveNotes", "shareNotes", "saveTask", "saveDeliverable", "approveDeliverable", "shareDeliverable", "comment"].map(name => [name, { useMutation: mutation(name) }])),
      },
    },
  },
}));

const { default: SystemStatus } = await import("@/components/admin/SystemStatus");
const { default: EngagementsView } = await import("@/components/admin/EngagementsView");

const row = { id: 4, stage: "setting_up", stageLabel: "Getting set up", businessName: "Ada Foods", ownerName: "Ada Okafor", ownerEmail: "ada@example.test", hasAccount: true, createdAt: new Date(), team: [], openClientRequests: 5, overdueClientRequests: 2, unscheduledSessions: 2, nextSession: null, myRole: null as string | null, unsortedFiles: 0 };
const task = (over: Record<string, unknown>) => ({ id: 51, engagementId: 4, kind: "data_request", side: "client", title: "Your price list", detail: null, assigneeUserId: null, dueOn: "2026-10-21", status: "open", statusLabel: "To do", statusNote: null, sessionId: null, weekNumber: 1, sortOrder: 4, factor: "internal", createdByUserId: 1, completedAt: null, createdAt: new Date(), updatedAt: new Date(), files: [], requestedByUserId: null, turnaround: null, receivedAt: null, followUpDueAt: null, followUpDoneAt: null, askedByName: null, goesTo: null, canAnswer: false, comments: [], ...over });
const session = { id: 31, engagementId: 4, kind: "assessment_call", title: "Business Review call 1", scheduledFor: null, durationMinutes: 90, meetingLink: null, agenda: null, status: "planned", weekNumber: 1, sortOrder: 7, clientNotes: "Pricing first.", internalNotes: "Watch cash sales.", notesAudience: "owner", notesSharedAt: null, notesSharedByUserId: null, createdByUserId: 1, createdAt: new Date(), updatedAt: new Date() };
const deliverable = (over: Record<string, unknown>) => ({ id: 41, engagementId: 4, kind: "prescription", kindLabel: "Prescription", title: "Daily cash count", summary: "Count every evening.", status: "draft", audience: "owner", approvedByUserId: null, approvedAt: null, sharedByUserId: null, sharedAt: null, clientAcceptedByUserId: null, clientAcceptedAt: null, createdByUserId: 1, createdAt: new Date(), updatedAt: new Date(), needsApproval: true, comments: [], files: [], ...over });
const detail = (given: { manage: boolean; assign: boolean; review: boolean; sendSignIn?: boolean; contribute?: boolean; seeInternal?: boolean; seeFees?: boolean }, deliverables = [deliverable({})], tasks: unknown[] = []) => ({
  uploadsEnabled: true,
  engagement: { id: 4, businessCheckId: 1, businessId: 7, paymentRequestId: 2, stage: "setting_up", stageLabel: "Getting set up", problemArea: null, subProblem: null, problemStatement: null, assessmentStartedAt: null, fixStartedAt: null, closedAt: null, createdAt: new Date(), updatedAt: new Date() },
  owner: { name: "Ada Okafor", email: "ada@example.test", whatsapp: "+234 800 000 0001" },
  businessName: "Ada Foods",
  hasAccount: true,
  team: [],
  clientPeople: [{ userId: 3, name: "Ada Okafor", role: "owner", access: "full" }],
  sessions: [session],
  // Asking the client (R78): every item carries who asked, whom it goes to, its clock and its conversation.
  tasks: tasks.map(item => ({ requestedByUserId: null, turnaround: null, receivedAt: null, followUpDueAt: null, followUpDoneAt: null, askedByName: null, goesTo: null, canAnswer: false, comments: [], ...(item as object) })),
  deliverables,
  measure: null as unknown,
  checkins: [] as unknown[],
  inbox: [] as unknown[],
  content: [] as unknown[],
  can: { contribute: given.manage, seeInternal: given.manage || given.review, seeFees: given.manage || given.review, ...given },
  ask: { allowed: Boolean(given.manage || given.contribute), unlimited: given.review, thisWeek: null as null | { id: number; title: string } },
  viewerUserId: 1,
});

beforeEach(() => {
  api.list = { setUp: true, items: [row] };
  api.awaiting = [];
  api.today = [];
  api.seesAll = true;
  api.storage = { configured: true, missing: [], bucket: "engagement-files", bucketFound: true, bucketPublic: false, problem: null };
  api.storageError = null;
  api.calls = {};
  api.failed = {};
  api.refetched = [];
});
afterEach(cleanup);

describe("the team's engagements", () => {
  it("offers the lead the plan's missing Sessions and items on a Digital Marketing engagement, and nobody else (R77)", async () => {
    api.calls = {};
    const marketing = detail({ manage: true, assign: true, review: true }, [], []) as { engagement: Record<string, unknown> };
    marketing.engagement = { ...marketing.engagement, type: "digital_marketing" };
    api.detail = marketing;
    const { unmount } = render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods"));
    const plan = within(await screen.findByRole("group", { name: "The plan" }));
    fireEvent.click(plan.getByRole("button", { name: "Add what's missing from the plan" }));
    expect(api.calls.addMissingPlan).toEqual([{ engagementId: row.id }]);
    unmount();
    // Another type has no dated plan; a contributor does not manage the plan.
    api.detail = detail({ manage: true, assign: true, review: true }, [], []);
    const second = render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods"));
    await screen.findByLabelText("Role on the engagement");
    expect(screen.queryByRole("group", { name: "The plan" })).toBeNull();
    second.unmount();
    const contributor = detail({ manage: false, assign: false, review: false }, [], []) as { engagement: Record<string, unknown> };
    contributor.engagement = { ...contributor.engagement, type: "digital_marketing" };
    api.detail = contributor;
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods"));
    await screen.findByRole("dialog");
    expect(screen.queryByRole("group", { name: "The plan" })).toBeNull();
  });

  it("offers the Digital Marketer and the Content Producer only on a Digital marketing engagement (R45)", async () => {
    const options = async () => {
      render(<EngagementsView />);
      fireEvent.click(screen.getByText("Ada Foods"));
      const select = await screen.findByLabelText("Role on the engagement");
      const labels = Array.from((select as HTMLSelectElement).options).map(option => option.textContent);
      cleanup();
      return labels;
    };
    api.detail = detail({ manage: true, assign: true, review: true }, [], []);
    expect(await options()).not.toContain("Digital Marketer");
    const marketing = detail({ manage: true, assign: true, review: true }, [], []) as { engagement: Record<string, unknown> };
    marketing.engagement = { ...marketing.engagement, type: "digital_marketing" };
    api.detail = marketing;
    expect(await options()).toEqual(expect.arrayContaining(["Digital Marketer", "Content Producer"]));
  });

  it("says when the list could not load, with Try again, instead of an empty list (R69)", () => {
    api.failed.list = true;
    render(<EngagementsView />);
    expect(screen.getByRole("alert").textContent).toContain("We could not load this. Check your connection and try again.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(api.refetched).toEqual(["list"]);
  });

  it("never hides a failed check for paid clients with no engagement (R69)", () => {
    api.failed.awaiting = true;
    render(<EngagementsView />);
    expect(screen.getByRole("alert").textContent).toContain("We could not load this.");
    expect(screen.getByText("Ada Foods")).toBeTruthy();
  });

  it("says when an engagement's fees could not load, in the Fees section (R69)", async () => {
    api.detail = detail({ manage: true, assign: true, review: true }, [], []);
    api.failed.fees = true;
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods"));
    const fees = await screen.findByRole("heading", { name: "Fees" });
    expect(fees.closest("section")!.textContent).toContain("We could not load this.");
  });

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
    for (const text of ["Getting set up", "No one yet", "5 outstanding", "2 overdue", "2 not booked"]) expect(tableRow.textContent).toContain(text);
  });

  it("marks an engagement Paused seven days after a missed fee date, and says on the record what lifts it (D6)", () => {
    const before = api.list;
    api.list = { setUp: true, items: [{ ...row, hold: { state: "paused", pausesOn: "2026-11-09" } }], canStart: true, seesAll: true } as never;
    api.detail = { ...detail({ manage: true, assign: true, review: true }), hold: { state: "paused", pausesOn: "2026-11-09", dueOn: "2026-11-02" } } as never;
    render(<EngagementsView />);
    const tableRow = screen.getAllByText("Ada Foods")[0]!.closest("tr")!;
    expect(within(tableRow).getByText("Paused").getAttribute("title")).toBe("Work paused on 9 Nov 2026, seven days after a missed fee date");
    fireEvent.click(tableRow);
    expect(within(screen.getByRole("dialog")).getByText("Work is paused: a fee is more than seven days late (since 9 Nov 2026). Paying it, or a new date in Fees, lifts the pause. The client's room stays open.")).toBeTruthy();
    api.list = before;
  });

  it("marks a late fee before it pauses, and nothing when the fees are in order", () => {
    const before = api.list;
    api.list = { setUp: true, items: [{ ...row, hold: { state: "late", pausesOn: "2026-12-09" } }], canStart: true, seesAll: true } as never;
    const { unmount } = render(<EngagementsView />);
    expect(within(screen.getAllByText("Ada Foods")[0]!.closest("tr")!).getByText("Fee late").getAttribute("title")).toBe("A fee is late; work pauses on 9 Dec 2026");
    unmount();
    api.list = { setUp: true, items: [{ ...row, hold: null }], canStart: true, seesAll: true } as never;
    render(<EngagementsView />);
    expect(screen.queryByText(/^(Paused|Fee late)$/)).toBeNull();
    api.list = before;
  });

  it("shows file uploads in System status (Team), not on the Engagements list", () => {
    api.detail = detail({ manage: true, assign: true, review: true });
    render(<EngagementsView />);
    expect(screen.queryByRole("status", { name: "File uploads" })).toBeNull();
  });

  it("says whether file uploads are on, and if not exactly which setting or bucket is still missing", () => {
    api.detail = detail({ manage: true, assign: true, review: true });
    render(<SystemStatus />);
    expect(screen.getByRole("status", { name: "File uploads" }).textContent).toContain("File uploads: on.");
    cleanup();
    api.storage = { ...api.storage, configured: false, missing: ["SUPABASE_URL"], bucketFound: null, bucketPublic: null };
    render(<SystemStatus />);
    let line = screen.getByRole("status", { name: "File uploads" }).textContent ?? "";
    expect(line).toContain("File uploads: off.");
    expect(line).toContain("SUPABASE_URL: the project URL from Supabase → Project Settings → API");
    expect(line).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(line).toContain("then redeploy");
    cleanup();
    api.storage = { ...api.storage, configured: true, missing: [], bucketFound: false, bucketPublic: null };
    render(<SystemStatus />);
    line = screen.getByRole("status", { name: "File uploads" }).textContent ?? "";
    expect(line).toContain("there is no bucket named engagement-files");
    cleanup();
    api.storage = { ...api.storage, bucketFound: true, bucketPublic: true };
    render(<SystemStatus />);
    line = screen.getByRole("status", { name: "File uploads" }).textContent ?? "";
    expect(line).toContain("the bucket is public");
    expect(line).toContain('switch "Public bucket" off');
    cleanup();
    api.storage = { ...api.storage, bucketFound: null, bucketPublic: null, problem: "Storage refused the service key. Check SUPABASE_SERVICE_ROLE_KEY is the service_role key, not the anon key." };
    render(<SystemStatus />);
    expect(screen.getByRole("status", { name: "File uploads" }).textContent).toContain("not the anon key");
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
  });

  it("says so when the storage check itself fails, rather than showing nothing", () => {
    api.detail = detail({ manage: true, assign: true, review: true });
    api.storageError = { message: "Your role does not include engagements." };
    render(<SystemStatus />);
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
    fireEvent.click(card.getByRole("button", { name: "Start from the standard Findings outline" }));
    expect((card.getByLabelText("What it says") as HTMLTextAreaElement).value).toBe(FINDINGS_OUTLINE);
    expect(card.queryByRole("button", { name: "Start from the standard Findings outline" })).toBeNull();
  });

  it("names the migration the database is missing, instead of failing or guessing an old one", () => {
    // The live case on 10 November 2026: a column from 0022 missing read as "migration 0008 is not applied".
    api.list = { setUp: false, items: [], missing: "0022" } as never;
    render(<EngagementsView />);
    expect(screen.getByRole("note").textContent).toBe("The engagements cannot load: the database is missing migration 0022. Run its script from drizzle/supabase in the Supabase SQL Editor of the project the site uses, then reload.");
    cleanup();
    api.list = { setUp: false, items: [], missing: null } as never;
    render(<EngagementsView />);
    expect(screen.getByRole("note").textContent).toBe("The engagements cannot load: the database is missing a table or column this version of the site needs. Apply the latest migration, then reload.");
    expect(screen.getByRole("note").textContent).not.toContain("0008");
  });

  it("lets a Partner, Vice President or Senior Associate add an analyst and approve a prescription before it is shared", () => {
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

  it("keeps a team member out of the Add list and changes their role on their own row, so adding never replaces anyone", () => {
    api.detail = { ...detail({ manage: true, assign: true, review: true }), team: [{ userId: 9, role: "analyst", roleLabel: "Analyst", name: "Ola Analyst", email: "ola@example.test", jobTitle: "Senior Business Analyst" }] };
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    const drawer = within(screen.getByRole("dialog"));
    const add = drawer.getByLabelText("Add to the team") as HTMLSelectElement;
    expect(Array.from(add.options).map(option => option.textContent)).toEqual(["Everyone with a staff account is on the team"]);
    expect(drawer.getByText(/Invite one in People/)).toBeTruthy();
    fireEvent.change(drawer.getByLabelText("Role of Ola Analyst"), { target: { value: "manager" } });
    expect(api.calls.assign).toEqual([{ engagementId: 4, userId: 9, role: "manager" }]);
  });

  it("gives an analyst the work but not the team or the approval", () => {
    api.detail = detail({ manage: true, assign: false, review: false });
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    const drawer = within(screen.getByRole("dialog"));
    expect(drawer.queryByLabelText("Add to the team")).toBeNull();
    expect(drawer.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(drawer.getByText("A Partner, Vice President or Senior Associate, or this engagement's lead, approves this before it can be shared.")).toBeTruthy();
  });

  it("lists each booked Session once with Edit, and the plan's Sessions without a time as one line (R81)", () => {
    const base = detail({ manage: true, assign: false, review: false });
    const plan = (id: number, title: string, scheduledFor: Date | null) => ({ ...session, id, kind: "check_in", title, scheduledFor });
    api.detail = { ...base, sessions: [plan(61, "Kick-off", new Date("2026-11-18T09:00:00Z")), plan(62, "Weekly Check-in", null), plan(63, "Weekly Check-in", null), plan(64, "Month 1 review", null)] };
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    const dialog = within(screen.getByRole("dialog"));
    const list = within(dialog.getByRole("list", { name: "Booked Sessions" }));
    expect(list.getAllByRole("listitem").map(item => item.getAttribute("aria-label"))).toEqual(["Kick-off"]);
    expect(dialog.getByText("Still to book from the plan: Weekly Check-in (2), Month 1 review.")).toBeTruthy();
    // No form until Edit.
    expect(dialog.queryByLabelText("Meeting link")).toBeNull();
    fireEvent.click(list.getByRole("button", { name: "Edit" }));
    expect(dialog.getByLabelText("Meeting link")).toBeTruthy();
  });

  it("saves notes without sharing, and shares only notes that are saved", () => {
    const base = detail({ manage: true, assign: false, review: false });
    api.detail = { ...base, sessions: [{ ...session, scheduledFor: new Date("2026-11-18T09:00:00Z") }] };
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    fireEvent.click(within(within(screen.getByRole("dialog")).getByRole("list", { name: "Booked Sessions" })).getByRole("button", { name: "Edit" }));
    const card = within(within(screen.getByRole("dialog")).getAllByLabelText("Business Review call 1").at(-1)!);
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
  it("opens the link a client sent for an item, and removes a file only with a reason (R43, R61)", () => {
    const item = { id: 7, engagementId: 4, kind: "data_request", title: "Your price list", detail: null, side: "client", assigneeUserId: null, dueOn: "2026-10-27", status: "received", statusLabel: "Sent, we are checking", statusNote: "Sent a link to a folder", sessionId: null, weekNumber: null, sortOrder: 0, factor: null, responseLink: "https://drive.google.com/drive/folders/abc",
      files: [{ id: 99, fileName: "prices.pdf", contentType: "application/pdf", sizeBytes: 120_000, audience: "owner", uploadedByName: "Ada Okafor", createdAt: new Date() }] };
    api.detail = detail({ manage: true, assign: false, review: false }, [], [item]);
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    const card = within(within(screen.getByRole("dialog")).getByLabelText("Your price list"));
    expect(card.getByRole("link", { name: "Open the link" }).getAttribute("href")).toBe("https://drive.google.com/drive/folders/abc");
    fireEvent.click(card.getByRole("button", { name: "Remove" }));
    const confirm = card.getByRole("button", { name: "Remove the file" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(card.getByLabelText("Why prices.pdf is removed"), { target: { value: "Holds another customer's prices" } });
    fireEvent.click(confirm);
    expect(api.calls.removeFile).toEqual([{ fileId: 99, reason: "Holds another customer's prices" }]);
  });

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
    fireEvent.change(drawer.getByLabelText("Measure of Success"), { target: { value: "Cash in the bank on Friday" } });
    fireEvent.change(drawer.getByLabelText("Unit"), { target: { value: "₦" } });
    fireEvent.change(drawer.getByLabelText("Where it starts"), { target: { value: "150000" } });
    fireEvent.change(drawer.getByLabelText("Where it should get to"), { target: { value: "400000" } });
    fireEvent.click(drawer.getByRole("button", { name: "Set the Measure of Success" }));
    expect(api.calls.saveMeasure).toEqual([{ engagementId: 4, name: "Cash in the bank on Friday", definition: "", unit: "₦", baselineValue: 150000, targetValue: 400000 }]);

    fireEvent.click(drawer.getByRole("button", { name: "Record week 1" }));
    const week = within(drawer.getByLabelText("Week 1"));
    fireEvent.change(week.getByLabelText("What moved this week?"), { target: { value: "Daily cash count started." } });
    fireEvent.change(week.getByLabelText("What is the next step, and by when?"), { target: { value: "Chase late invoices by Friday." } });
    fireEvent.change(week.getByLabelText("What does the Measure of Success say this week?"), { target: { value: "160000" } });
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

describe("send sign-in link on the client's record", () => {
  it("sends the right link for the business check, says what it did, and shows the link once in case email fails", async () => {
    api.detail = detail({ manage: true, assign: true, review: true, sendSignIn: true });
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods"));
    expect(await screen.findByText(/Emails a link to choose a new password/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in link" }));
    expect(api.calls.sendSignInLink).toEqual([{ businessCheckId: 1 }]);
    const shown = screen.getByText("https://ipf-sme.example.test/reset/abc").closest("[role=status]")!;
    expect(shown.textContent).toContain("Password reset link for ada@example.test · not emailed: send it yourself");
    expect(shown.textContent).toContain("Shown once.");
  });

  it("is not offered to someone without the client onboarding capability", async () => {
    api.detail = detail({ manage: true, assign: true, review: true, sendSignIn: false });
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods"));
    await screen.findByText("The client");
    expect(screen.queryByRole("button", { name: "Send sign-in link" })).toBeNull();
  });
});

describe("the drop box on the team's side", () => {
  it("lists what the client sent with the unsorted count, and saves which Data Requests a file answers", () => {
    const tasks = [task({ id: 51, title: "Your price list", ref: "B3", section: "B Money" }), task({ id: 52, title: "Your sales for the last 12 months", ref: "B1", section: "B Money" }), task({ id: 53, kind: "action", side: "ipf", title: "Send the cash template" })];
    api.detail = { ...detail({ manage: true, assign: false, review: false }, [], tasks), inbox: [{ id: 99, fileName: "Sales and prices.xlsx", contentType: "application/vnd.ms-excel", sizeBytes: 9_000, audience: "owner", uploadedByName: "Ada Okafor", createdAt: new Date(), note: "From our accountant", taskIds: [] }] };
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Files the client sent (1 to sort)")).toBeTruthy();
    const file = within(dialog.getByLabelText("Sales and prices.xlsx"));
    expect(file.getByText("“From our accountant”")).toBeTruthy();
    // Data Requests only, by reference: an action is not something a file answers.
    expect(file.queryByText(/Send the cash template/)).toBeNull();
    const save = file.getByRole("button", { name: "Save the match" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(file.getByLabelText(/Your sales for the last 12 months/));
    fireEvent.click(file.getByLabelText(/Your price list/));
    fireEvent.click(save);
    expect(api.calls.matchFile).toEqual([{ fileId: 99, taskIds: [52, 51] }]);
  });

  it("saves a Data Request's section, reference, purpose, format and priority", () => {
    api.detail = detail({ manage: true, assign: false, review: false }, [], [task({ id: 51, title: "Your price list" })]);
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    const card = within(within(screen.getByRole("dialog")).getByLabelText("Your price list"));
    fireEvent.change(card.getByLabelText("Section"), { target: { value: "B Money" } });
    fireEvent.change(card.getByLabelText("Reference"), { target: { value: "B3" } });
    fireEvent.change(card.getByLabelText("Priority"), { target: { value: "high" } });
    fireEvent.change(card.getByLabelText("Why we ask (what it informs)"), { target: { value: "Whether prices cover costs" } });
    fireEvent.change(card.getByLabelText("Format that is fine"), { target: { value: "Any" } });
    fireEvent.click(card.getByRole("button", { name: "Save" }));
    expect(api.calls.saveTask).toEqual([expect.objectContaining({ taskId: 51, section: "B Money", ref: "B3", priority: "high", informs: "Whether prices cover costs", format: "Any" })]);
  });
});

describe("the team's workspace (R82)", () => {
  beforeEach(() => { MotionGlobalConfig.skipAnimations = true; window.history.replaceState(null, "", "/admin"); });
  const soon = new Date(Date.now() + 2 * 86_400_000);
  const team = [
    { userId: 1, role: "content_producer", roleLabel: "Content Producer", name: "Kemi Producer", email: "kemi@example.test", jobTitle: null },
    { userId: 2, role: "manager", roleLabel: "Engagement Manager", name: "Lewis Lead", email: "lewis@example.test", jobTitle: null },
  ];

  it("opens a project as a full page in the room's layout for someone who does not see every engagement, and goes back", () => {
    api.seesAll = false;
    api.list = { setUp: true, items: [{ ...row, myRole: "Content Producer" }, { ...row, id: 5, businessName: "Bola Bakery", myRole: "Content Producer" }] };
    api.detail = { ...detail({ manage: false, assign: false, review: false, contribute: true, seeFees: false }, [], [task({ id: 51, title: "Send week 3 footage" })]), team, sessions: [{ ...session, title: "Weekly Check-in", scheduledFor: soon, meetingLink: "https://us02web.zoom.us/j/81234567890" }] };
    api.today = [
      { key: "reply-51", kind: "reply", engagementId: 4, businessName: "Ada Foods", title: "Send week 3 footage", detail: "Ada Okafor: Is landscape fine?", at: new Date(), late: false },
      { key: "files-5", kind: "files", engagementId: 5, businessName: "Bola Bakery", title: "2 files to match", detail: "Sent to the drop box", at: null, late: false },
    ];
    render(<EngagementsView />);
    fireEvent.click(within(screen.getByRole("region", { name: /My projects/ })).getByRole("button", { name: "Open Ada Foods" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    const page = within(screen.getByRole("region", { name: "Ada Foods workspace" }));
    expect(page.getByRole("heading", { level: 1 }).textContent).toBe("Ada Foods");
    expect(page.getByText("You are the Content Producer")).toBeTruthy();
    expect(page.getByRole("img", { name: "Team: Kemi Producer, Lewis Lead" })).toBeTruthy();
    // The tabs, in order; no Fees for someone who does not see them.
    expect(page.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Overview1", "Work Plan1", "Sessions", "Deliverables"]);
    // What needs them here is this engagement's only; the next meeting has its Join link.
    const needs = within(page.getByRole("region", { name: /What needs you here/ }));
    expect(needs.getAllByRole("group").map(card => card.getAttribute("aria-label"))).toEqual(["Client wrote: Send week 3 footage"]);
    const next = within(page.getByRole("region", { name: "Next meeting" }));
    expect(next.getByText("Weekly Check-in")).toBeTruthy();
    expect(next.getByRole("link", { name: "Join" }).getAttribute("href")).toBe("https://us02web.zoom.us/j/81234567890");
    // The Work Plan tab holds the record's own Work Plan, with Ask.
    fireEvent.click(page.getByRole("tab", { name: /^Work Plan/ }));
    expect(page.getByRole("tab", { name: /^Work Plan/ }).getAttribute("aria-selected")).toBe("true");
    expect(page.getByRole("button", { name: "Ask Ada Foods" })).toBeTruthy();
    fireEvent.click(page.getByRole("button", { name: "All my projects" }));
    expect(screen.queryByRole("region", { name: "Ada Foods workspace" })).toBeNull();
    expect(screen.getByRole("region", { name: /My projects/ })).toBeTruthy();
    expect(window.location.hash).toBe("");
  });

  it("gives a lead who sees fees the Fees tab and the count to approve", () => {
    api.seesAll = false;
    api.list = { setUp: true, items: [{ ...row, myRole: "Engagement Manager" }] };
    api.detail = { ...detail({ manage: true, assign: false, review: true, seeFees: true }, [deliverable({ status: "awaiting_approval" })]), team };
    render(<EngagementsView />);
    fireEvent.click(screen.getByRole("button", { name: "Open Ada Foods" }));
    const page = within(screen.getByRole("region", { name: "Ada Foods workspace" }));
    expect(page.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Overview", "Work Plan", "Sessions", "Deliverables1", "Fees"]);
    expect(page.getByRole("tab", { name: /^Deliverables/ }).textContent).toBe("Deliverables1");
    expect(page.getByText("Nothing needs you on Ada Foods right now.")).toBeTruthy();
  });

  it("keeps the drawer for the desk, who see every engagement", () => {
    api.list = { setUp: true, items: [{ ...row, myRole: "Engagement Manager" }] };
    api.detail = detail({ manage: true, assign: true, review: true });
    render(<EngagementsView />);
    fireEvent.click(screen.getByRole("button", { name: "Open Ada Foods" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Ada Foods workspace" })).toBeNull();
  });
});

describe("my projects", () => {
  it("puts the engagements the person is on first, with their role and what needs them, and opens one", () => {
    api.list = { setUp: true, items: [{ ...row, myRole: "Lead Consultant", unsortedFiles: 3 }, { ...row, id: 5, businessName: "Bola Bakery", myRole: null }] };
    api.detail = detail({ manage: true, assign: false, review: false });
    render(<EngagementsView />);
    const mine = within(screen.getByRole("region", { name: /My projects/ }));
    expect(mine.getAllByRole("button")).toHaveLength(1);
    const card = mine.getByRole("button", { name: "Open Ada Foods" });
    expect(card.textContent).toContain("Lead Consultant");
    expect(card.textContent).toContain("3files to sort");
    expect(card.textContent).toContain("2overdue");
    fireEvent.click(card);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("starts the day from Today: what needs this person, late first, each card opening the engagement (R52)", () => {
    const now = Date.now();
    api.list = { setUp: true, items: [{ ...row, myRole: "Content Producer" }] };
    api.detail = detail({ manage: false, assign: false, review: false, contribute: true });
    api.today = [
      { key: "clock-51", kind: "clock", engagementId: 4, businessName: "Ada Foods", title: "Send week 3 footage", detail: "First edit is late", at: new Date(now - 3 * 3_600_000), late: true },
      { key: "reply-52", kind: "reply", engagementId: 4, businessName: "Ada Foods", title: "A video of the new menu", detail: "Ada Okafor: Is landscape fine?", at: new Date(now - 3_600_000), late: false },
    ];
    render(<EngagementsView />);
    const today = within(screen.getByRole("region", { name: /Today/ }));
    expect(today.getByRole("heading").textContent).toBe("Today (2)");
    const cards = today.getAllByRole("button");
    expect(cards.map(card => card.getAttribute("aria-label"))).toEqual(["Clock: Send week 3 footage, Ada Foods", "Client wrote: A video of the new menu, Ada Foods"]);
    expect(cards[0]!.textContent).toContain("3 hours late");
    expect(cards[1]!.textContent).toContain("Is landscape fine?");
    fireEvent.click(cards[1]!);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("says so when nothing needs the person", () => {
    api.list = { setUp: true, items: [{ ...row, myRole: "Lead Consultant" }] };
    render(<EngagementsView />);
    expect(within(screen.getByRole("region", { name: /Today/ })).getByText("Nothing needs you right now across your projects.")).toBeTruthy();
  });

  it("is not shown to someone on no engagement", () => {
    api.list = { setUp: true, items: [row] };
    render(<EngagementsView />);
    expect(screen.queryByRole("region", { name: /My projects/ })).toBeNull();
  });
});

describe("what the list says, for the desk and for an analyst", () => {
  it("tells an analyst on no project where projects come from, and never that every engagement is a Business Review", () => {
    api.list = { setUp: true, items: [], canStart: false, seesAll: false } as never;
    render(<EngagementsView />);
    expect(screen.getByText("You are not on any project yet. When a lead adds you to one, it appears here and you get an email.")).toBeTruthy();
    expect(screen.getByText(/The projects you are on, of every type/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/One starts when a Business Review payment is confirmed/);
  });

  it("tells the desk how each type starts: a Business Review when it is paid, any other with New engagement", () => {
    api.list = { setUp: true, items: [], canStart: true, seesAll: true } as never;
    render(<EngagementsView />);
    expect(screen.getByText(/Every engagement, of every type\. A Business Review starts when it is paid; open any other, such as Digital Marketing, with New engagement/)).toBeTruthy();
    expect(screen.getByText("No engagements yet. A Business Review starts when its payment is confirmed; open any other type with New engagement.")).toBeTruthy();
  });
});

describe("a new engagement opened directly", () => {
  it("is offered to the desk only, opens with the chosen type, and shows the client's link once to send by hand", () => {
    api.list = { setUp: true, items: [row], canStart: false } as never;
    render(<EngagementsView />);
    expect(screen.queryByRole("button", { name: "New engagement" })).toBeNull();
    cleanup();
    api.list = { setUp: true, items: [row], canStart: true } as never;
    render(<EngagementsView />);
    fireEvent.click(screen.getByRole("button", { name: "New engagement" }));
    const form = within(screen.getByRole("region", { name: "New engagement" }));
    fireEvent.change(form.getByLabelText("Type"), { target: { value: "digital_marketing" } });
    fireEvent.change(form.getByLabelText("Start date"), { target: { value: "2026-11-09" } });
    fireEvent.change(form.getByLabelText("Business name"), { target: { value: "Crown Studio" } });
    fireEvent.change(form.getByLabelText("Client name"), { target: { value: "Marie Tiogo" } });
    fireEvent.change(form.getByLabelText("Client email"), { target: { value: "marie@example.com" } });
    fireEvent.click(form.getByRole("button", { name: "Open the engagement" }));
    expect(api.calls.createDirect).toEqual([{ type: "digital_marketing", startedOn: "2026-11-09", businessName: "Crown Studio", contactName: "Marie Tiogo", contactEmail: "marie@example.com" }]);
    expect((form.getByLabelText("Client invitation link") as HTMLInputElement).value).toBe("https://ipf-sme.example.test/join/OWNER");
  });
});

describe("the content board on the team's side", () => {
  it("adds a reel to a Digital marketing engagement and shows the client's request for changes", () => {
    const base = detail({ manage: true, assign: false, review: false }, []);
    api.detail = { ...base, engagement: { ...base.engagement, type: "digital_marketing" }, content: [{ id: 7, engagementId: 4, kind: "reel", kindLabel: "Reel", title: "Reel 6", month: 1, status: "changes_requested", statusLabel: "Changes requested", dueOn: null, link: null, clientNote: "Shorter intro", approvedByUserId: null, approvedAt: null, publishedAt: null, sortOrder: 0, createdByUserId: 1, createdAt: new Date(), updatedAt: new Date() }] };
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("The client asked for changes: Shorter intro")).toBeTruthy();
    fireEvent.click(dialog.getByRole("button", { name: "Add a piece of content" }));
    const card = within(dialog.getByLabelText("New piece of content"));
    fireEvent.change(card.getByLabelText("Title"), { target: { value: "Reel 7: silk press" } });
    fireEvent.change(card.getByLabelText("Status"), { target: { value: "for_approval" } });
    fireEvent.click(card.getByRole("button", { name: "Save" }));
    expect(api.calls.saveContent).toEqual([{ engagementId: 4, itemId: undefined, kind: "reel", title: "Reel 7: silk press", month: 1, status: "for_approval", dueOn: null, link: null }]);
  });

  it("is not shown for a Business Review", () => {
    api.detail = detail({ manage: true, assign: false, review: false }, []);
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "Add a piece of content" })).toBeNull();
  });
});


describe("another project for an existing client, and the clients' requests", () => {
  it("opens a Done for You for an existing client: the business and the service, nobody invited", () => {
    api.list = { setUp: true, items: [row], canStart: true, seesAll: true } as never;
    api.calls = {};
    render(<EngagementsView />);
    fireEvent.click(screen.getByRole("button", { name: "New engagement" }));
    const form = within(screen.getByRole("region", { name: "New engagement" }));
    fireEvent.change(form.getByLabelText("Client"), { target: { value: "existing" } });
    fireEvent.change(form.getByLabelText("Type"), { target: { value: "done_for_you" } });
    expect(form.getByRole("button", { name: "Open the engagement" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(form.getByLabelText("Service"), { target: { value: "pitch_deck" } });
    fireEvent.change(form.getByLabelText("Business"), { target: { value: "31" } });
    fireEvent.change(form.getByLabelText("Start date"), { target: { value: "2026-11-09" } });
    expect(form.queryByLabelText("Client email")).toBeNull();
    fireEvent.click(form.getByRole("button", { name: "Open the engagement" }));
    expect(api.calls.createDirect).toEqual([{ type: "done_for_you", startedOn: "2026-11-09", service: "pitch_deck", businessId: 31 }]);
  });

  it("lists the clients' requests and opens the engagement from one, filled in, or declines it", () => {
    api.list = { setUp: true, items: [row], canStart: true, seesAll: true } as never;
    api.requests = [{ id: 7, businessId: 31, businessName: "Ada Foods", service: "pitch_deck", serviceName: "Pitch Deck", type: "done_for_you", note: "Investor in December", requestedBy: "Ada Okafor", createdAt: new Date("2026-11-06T10:00:00Z") }];
    api.calls = {};
    render(<EngagementsView />);
    const inbox = within(screen.getByRole("region", { name: /Clients asking for another service/ }));
    expect(inbox.getByText(/Investor in December/)).toBeTruthy();
    fireEvent.click(inbox.getByRole("button", { name: "Decline" }));
    expect(api.calls.handleRequest).toEqual([{ requestId: 7, status: "declined" }]);
    fireEvent.click(inbox.getByRole("button", { name: "Open the engagement" }));
    const form = within(screen.getByRole("region", { name: "New engagement" }));
    expect((form.getByLabelText("Service") as HTMLSelectElement).value).toBe("pitch_deck");
    expect((form.getByLabelText("Business") as HTMLSelectElement).value).toBe("31");
    api.requests = [];
  });
});

describe("fees on the team's side", () => {
  it("starts from the service's price, saves the fees in naira, and has nothing to send to the client", () => {
    api.list = { setUp: true, items: [row], canStart: true, seesAll: true } as never;
    api.calls = {};
    api.detail = detail({ manage: true, assign: true, review: true });
    render(<EngagementsView />);
    fireEvent.click(screen.getAllByText("Ada Foods")[0]!.closest("tr")!);
    const section = within(within(screen.getByRole("dialog")).getByText("Fees").closest("section")!);
    expect((section.getByLabelText("Amount 1") as HTMLInputElement).value).toBe("600000");
    fireEvent.click(section.getByRole("button", { name: "Add a fee" }));
    fireEvent.change(section.getByLabelText("Fee 2"), { target: { value: "Travel to Abuja" } });
    fireEvent.change(section.getByLabelText("Amount 2"), { target: { value: "50000" } });
    expect(section.getByText("Total ₦650,000")).toBeTruthy();
    expect(section.queryByRole("button", { name: /Send/ })).toBeNull();
    fireEvent.click(section.getByRole("button", { name: "Save the fees" }));
    expect(api.calls.saveFees).toEqual([{ engagementId: row.id, feeLines: [{ label: "Business Review, payable before work begins", amount: 600000, dueOn: null }, { label: "Travel to Abuja", amount: 50000, dueOn: null }] }]);
  });

  it("offers opening the room before payment only to a Partner or the Super Admin, and says so to everyone else", () => {
    api.list = { setUp: true, items: [row], canStart: true, seesAll: true } as never;
    api.calls = {};
    const before = api.fees;
    api.fees = { feeLines: [{ id: 81, label: "Month 1 service fee, payable on starting", amount: 470000, dueOn: "2026-11-09", paidAt: null, paidOnline: false, reference: "TS-F-000081", paidAmount: 0, left: 470000, billed: false, invoice: null, payments: [] }], total: 470000, suggested: null, opensOnPayment: true, online: true, can: { edit: true, sendLink: true, approveUnpaidWork: false, recordPayments: false } } as unknown;
    api.detail = detail({ manage: true, assign: true, review: true });
    render(<EngagementsView />);
    fireEvent.click(screen.getAllByText("Ada Foods")[0]!.closest("tr")!);
    const section = within(within(screen.getByRole("dialog")).getByText("Fees").closest("section")!);
    expect(section.queryByRole("button", { name: "Open the room now" })).toBeNull();
    expect(section.getByText("Only a Partner can open it before payment, or move the first fee past the start date.")).toBeTruthy();
    // Recording money is for Finance and the Super Admin (ET, 10 November 2026): the team is told who does it.
    expect(section.queryByRole("button", { name: "Record a payment" })).toBeNull();
    expect(section.getByText(/Money that came another way is recorded by Finance/)).toBeTruthy();
    api.fees = before;
  });

  it("lets a Partner pay a Digital Marketing client in arrears from the kickoff, and tells anyone else who may (R74)", () => {
    api.list = { setUp: true, items: [row], canStart: true, seesAll: true } as never;
    api.calls = {};
    const before = api.fees;
    const can = { edit: true, sendLink: true, approveUnpaidWork: true, recordPayments: false, writeOff: false };
    const fees = { feeLines: [{ id: 81, label: "Month 1 service fee, payable on starting", amount: 470000, dueOn: "2026-11-11", paidAt: null, paidOnline: false, reference: "TS-F-000081", paidAmount: 0, left: 470000, billed: false, invoice: null, payments: [], writtenOff: null }], total: 470000, suggested: null, opensOnPayment: true, online: true, timing: { offered: true, inArrears: false, kickoffOn: "2026-11-11" }, can };
    api.fees = fees as never;
    api.detail = detail({ manage: true, assign: true, review: true });
    const { unmount } = render(<EngagementsView />);
    fireEvent.click(screen.getAllByText("Ada Foods")[0]!.closest("tr")!);
    const timing = within(within(screen.getByRole("dialog")).getByRole("region", { name: "How the fees are paid" }));
    expect(timing.getByText("Paid in advance: each month's fee falls due on the month's first day, from the kickoff on 11 Nov 2026.")).toBeTruthy();
    fireEvent.change(timing.getByLabelText("Kickoff"), { target: { value: "2026-11-18" } });
    fireEvent.click(timing.getByRole("button", { name: "Pay in arrears" }));
    expect(api.calls.setFeeTiming).toEqual([{ engagementId: row.id, inArrears: true, kickoffOn: "2026-11-18" }]);
    unmount();

    // Paid in arrears: the kickoff can move, or the client go back to paying in advance.
    api.fees = { ...fees, timing: { offered: true, inArrears: true, kickoffOn: "2026-11-11" } } as never;
    const second = render(<EngagementsView />);
    fireEvent.click(screen.getAllByText("Ada Foods")[0]!.closest("tr")!);
    const inArrears = within(within(screen.getByRole("dialog")).getByRole("region", { name: "How the fees are paid" }));
    expect(inArrears.getByText("Paid in arrears: each month's fee falls due 30, 60 and 90 days after the kickoff on 11 Nov 2026.")).toBeTruthy();
    expect((inArrears.getByRole("button", { name: "Move the fees to this kickoff" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(inArrears.getByRole("button", { name: "Pay in advance" }));
    expect(api.calls.setFeeTiming).toContainEqual({ engagementId: row.id, inArrears: false, kickoffOn: "2026-11-11" });
    second.unmount();

    // Anyone else sees how it is paid, and who may change it.
    api.fees = { ...fees, can: { ...can, approveUnpaidWork: false } } as never;
    render(<EngagementsView />);
    fireEvent.click(screen.getAllByText("Ada Foods")[0]!.closest("tr")!);
    const others = within(within(screen.getByRole("dialog")).getByRole("region", { name: "How the fees are paid" }));
    expect(others.getByText("Only a Partner or the Super Admin can change how this engagement is paid.")).toBeTruthy();
    expect(others.queryByRole("button", { name: "Pay in arrears" })).toBeNull();
    api.fees = before;
  });

  it("sends a fee's payment link, opens the room early (a Partner), and records a payment by hand", () => {
    api.list = { setUp: true, items: [row], canStart: true, seesAll: true } as never;
    api.calls = {};
    const before = api.fees;
    api.fees = { feeLines: [{ id: 81, label: "Month 1 service fee, payable on starting", amount: 470000, dueOn: "2026-11-09", paidAt: null, paidOnline: false, reference: "TS-F-000081", paidAmount: 0, left: 470000, billed: false, invoice: null, payments: [] }], total: 470000, suggested: null, opensOnPayment: true, online: true, can: { edit: true, sendLink: true, approveUnpaidWork: true, recordPayments: true } };
    api.detail = detail({ manage: true, assign: true, review: true });
    render(<EngagementsView />);
    fireEvent.click(screen.getAllByText("Ada Foods")[0]!.closest("tr")!);
    const section = within(within(screen.getByRole("dialog")).getByText("Fees").closest("section")!);
    expect(section.queryByRole("button", { name: "Save the fees" })).toBeNull();
    expect(section.getByText(/opens once the first fee is paid/)).toBeTruthy();
    fireEvent.click(section.getByRole("button", { name: "Send link" }));
    expect(api.calls.sendFeeLink).toEqual([{ feeLineId: 81 }]);
    expect(section.getByText("https://ipf-sme.example.test/pay/fee/81/abcdefghijklmnopqrstuvwxyz012345")).toBeTruthy();
    fireEvent.click(section.getByRole("button", { name: "Open the room now" }));
    expect(api.calls.openRoomNow).toEqual([{ engagementId: row.id }]);
    // Money that came another way: recorded with the amount, the day, how and the bank's reference (Finance or the
    // Super Admin, who sees this button; the server checks again). The Paid tick is gone.
    expect(section.queryByRole("checkbox")).toBeNull();
    fireEvent.click(section.getByRole("button", { name: "Record a payment" }));
    const form = within(section.getByRole("form", { name: "Record a payment for Month 1 service fee, payable on starting" }));
    expect((form.getByLabelText("Amount received") as HTMLInputElement).value).toBe("470000");
    fireEvent.change(form.getByLabelText("Amount received"), { target: { value: "200000" } });
    expect(form.getByRole("button", { name: "Record ₦200,000" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(form.getByLabelText("Reference or note"), { target: { value: "Transfer 3301" } });
    fireEvent.click(form.getByRole("button", { name: "Record ₦200,000" }));
    expect(api.calls.recordPayment).toEqual([{ feeLineId: 81, amount: 200000, receivedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), method: "bank_transfer", note: "Transfer 3301" }]);
    api.fees = before;
  });
});

describe("a Specialist on the engagement", () => {
  it("sees no internal notes and no fees, adds team items only, and hands in files for IP Factory only", () => {
    api.calls = {};
    api.detail = detail({ manage: false, assign: false, review: false, contribute: true }, [deliverable({ files: [] })]);
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    const drawer = within(screen.getByRole("dialog"));
    expect(drawer.queryByText("Fees")).toBeNull();
    expect(drawer.queryByLabelText(/Internal notes/)).toBeNull();
    expect(drawer.getByText("IP Factory only: the lead shares it with the client")).toBeTruthy();
    expect(drawer.queryByLabelText("Who sees the file")).toBeNull();
    expect(drawer.queryByRole("button", { name: "Load a Data Request" })).toBeNull();
    fireEvent.click(drawer.getByRole("button", { name: "Add a team item" }));
    const card = within(drawer.getByLabelText("New request or action"));
    expect((card.getByLabelText("Whose job") as HTMLSelectElement).value).toBe("ipf");
    expect((card.getByLabelText("Whose job") as HTMLSelectElement).disabled).toBe(true);
    fireEvent.change(card.getByLabelText("What"), { target: { value: "Draft the competitor scan" } });
    fireEvent.click(card.getByRole("button", { name: "Save" }));
    expect(api.calls.saveTask).toEqual([expect.objectContaining({ side: "ipf", title: "Draft the competitor scan", assigneeUserId: null })]);
  });

  it("lets the lead share a Specialist's draft with the owner", () => {
    api.calls = {};
    api.detail = detail({ manage: true, assign: true, review: true }, [deliverable({ files: [{ id: 77, fileName: "calendar.pdf", contentType: "application/pdf", sizeBytes: 1000, audience: "team", uploadedByName: "Sola Specialist", createdAt: new Date() }] })]);
    render(<EngagementsView />);
    fireEvent.click(screen.getByText("Ada Foods").closest("tr")!);
    const drawer = within(screen.getByRole("dialog"));
    const files = within(drawer.getAllByRole("list", { name: "Files" }).find(list => within(list).queryByText("calendar.pdf"))!);
    expect(files.getByText(/ip factory only/)).toBeTruthy();
    fireEvent.click(files.getByRole("button", { name: "Share with the owner" }));
    expect(api.calls.shareFile).toEqual([{ fileId: 77, audience: "owner" }]);
  });
});

describe("loading a Data Request in one step", () => {
  it("loads the Small business baseline after a preview by section, or rows pasted from Excel", () => {
    api.list = { setUp: true, items: [row], canStart: true, seesAll: true } as never;
    api.detail = detail({ manage: true, assign: true, review: true });
    api.calls = {};
    render(<EngagementsView />);
    fireEvent.click(screen.getAllByText("Ada Foods")[0]!.closest("tr")!);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Load a Data Request" }));
    const panel = within(screen.getByRole("region", { name: "Load a Data Request" }));
    expect(panel.getByText("3 Money")).toBeTruthy();
    fireEvent.click(panel.getByRole("button", { name: "Add 18 items" }));
    expect((api.calls.loadDataRequest as { items: unknown[] }[])[0]!.items).toHaveLength(18);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Load a Data Request" }));
    const again = within(screen.getByRole("region", { name: "Load a Data Request" }));
    fireEvent.change(again.getByLabelText("Load from"), { target: { value: "paste" } });
    fireEvent.change(again.getByLabelText("Rows pasted from Excel"), { target: { value: "ID\tItem requested\tPriority\n1.1\tSales by month\tHigh\n1.2\tTop customers\tLow" } });
    fireEvent.click(again.getByRole("button", { name: "Add 2 items" }));
    expect((api.calls.loadDataRequest as { items: { title: string }[] }[])[1]!.items.map(item => item.title)).toEqual(["Sales by month", "Top customers"]);
  });
});
