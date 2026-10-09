/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminCan, visibleAdminSections } from "@/lib/adminSections";
import { READINESS_LABELS } from "@shared/businessCheck/engine";

const hoisted = vi.hoisted(() => {
  const api = {
    checks: [] as unknown[],
    calls: [] as unknown[],
    clients: [] as unknown[],
    candidates: [] as unknown[],
    invitations: [] as unknown[],
    details: {} as Record<number, unknown>,
    metrics: { businessChecks: 3, users: 2, portalUsers: 1, businesses: 1, memberships: 1, pendingInvitations: 0, platformRoleAssignments: 0 },
    error: undefined as { message: string } | undefined,
    mutations: { schedule: [] as unknown[], outcome: [] as unknown[], stage: [] as unknown[], invite: [] as unknown[], revoke: [] as unknown[], requestPayment: [] as unknown[], proof: [] as unknown[], confirmPayment: [] as unknown[], downloadReport: [] as unknown[], resendReportLink: [] as unknown[] },
    inviteResult: { invitationUrl: "https://app.example.test/onboarding/TOKEN123", deliveryStatus: "Simulated", expiresAt: new Date(), invitationId: 1 } as Record<string, unknown>,
  };
  const query = (key: "checks" | "calls" | "clients" | "candidates" | "invitations" | "metrics") => () => ({ data: api[key], isLoading: false, error: api.error });
  const mutation = (bucket: keyof typeof api.mutations, result?: () => unknown) => (options?: { onSuccess?: (data: unknown, variables: unknown) => void }) => ({
    isPending: false,
    mutate: (input: unknown) => {
      api.mutations[bucket].push(input);
      options?.onSuccess?.(result?.() ?? { success: true }, input);
    },
  });
  const invalidate = { invalidate: () => undefined };
  return { api, query, mutation, invalidate };
});
const { api } = hoisted;

vi.mock("@/lib/savePdf", () => ({ savePdf: () => undefined }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      businessSupport: { discoveryCalls: hoisted.invalidate, checks: hoisted.invalidate, checkDetail: hoisted.invalidate },
      onboarding: { candidates: hoisted.invalidate, invitations: hoisted.invalidate, metrics: hoisted.invalidate },
    }),
    businessSupport: {
      checks: { useQuery: hoisted.query("checks") },
      checkDetail: { useQuery: (input: { businessCheckId: number }) => ({ data: hoisted.api.details[input.businessCheckId], isLoading: false, error: hoisted.api.error }) },
      discoveryCalls: { useQuery: hoisted.query("calls") },
      clients: { useQuery: hoisted.query("clients") },
      scheduleCall: { useMutation: hoisted.mutation("schedule") },
      recordOutcome: { useMutation: hoisted.mutation("outcome") },
      setStage: { useMutation: hoisted.mutation("stage", () => ({ success: true, pipelineStage: "won", changed: true })) },
      requestPayment: { useMutation: hoisted.mutation("requestPayment", () => ({ reference: "TS-CS-000001", deliveryStatus: "Simulated" })) },
      markProofReceived: { useMutation: hoisted.mutation("proof") },
      confirmPayment: { useMutation: hoisted.mutation("confirmPayment", () => ({ success: true, changed: true, invitation: "sent" })) },
      downloadReport: { useMutation: hoisted.mutation("downloadReport", () => ({ fileName: "report.pdf", pdf: "JVBERi0=" })) },
      resendReportLink: { useMutation: hoisted.mutation("resendReportLink", () => ({ success: true, deliveryStatus: "Simulated" })) },
    },
    onboarding: {
      candidates: { useQuery: hoisted.query("candidates") },
      invitations: { useQuery: hoisted.query("invitations") },
      metrics: { useQuery: hoisted.query("metrics") },
      invite: { useMutation: hoisted.mutation("invite", () => hoisted.api.inviteResult) },
      revoke: { useMutation: hoisted.mutation("revoke") },
    },
  },
}));

import BusinessSupportConsole from "@/components/admin/BusinessSupportConsole";

const SUPER = {
  isSuperAdmin: true, isOwner: true, permissions: ["manage_client_onboarding", "view_participants"], platformPermissions: ["manage_client_onboarding", "view_all_businesses"],
  email: "owner@example.test", name: "Emmanuel Tarfa", platformRoles: ["super_admin", "admin"],
};
const check = (over: Record<string, unknown> = {}) => ({
  id: 1, fullName: "Ada Okafor", businessName: "Ada Foods", email: "ada@example.test", whatsapp: "+234 800 000 0001", stage: "operating", route: "programme", readiness: "intermediate", primaryArea: 7,
  pipelineStage: "call_booked", callRequestedAt: new Date("2026-10-05T10:00:00Z"), callScheduledFor: null, reportRequestedAt: null, completedAt: new Date("2026-10-05T09:00:00Z"), createdAt: new Date("2026-10-05T08:00:00Z"), invitationStatus: null, payments: {}, ...over,
});
const detailFor = (over: Record<string, unknown> = {}) => ({
  ...check(), heardFrom: null,
  summary: {
    found: "Your prices are guesses and cash is tight.",
    think: "The main problem is financial visibility.",
    next: "Book the free call.",
    offerings: [
      { id: "financial-performance", name: "Financial Performance & Decision Support", why: "Your prices are guesses." },
      { id: "business-model", name: "Business Model & Commercial Strategy", why: "Margins are unclear." },
    ],
  },
  outline: [
    { area: 0, name: "Founder readiness", health: "watch" },
    { area: 1, name: "Strategic intent", health: "clear" },
    { area: 7, name: "Financials", health: "stuck" },
  ],
  primaryAreaNumber: 7,
  stageHistory: [],
  payments: [],
  ...over,
});
const renderConsole = (access: Record<string, unknown> = SUPER, onSection?: (id: string) => void) => {
  void onSection;
  return render(<BusinessSupportConsole access={access as never} team={<div>TEAM PANEL</div>} jump={<div>JUMP REGISTRATION DESK</div>} />);
};
const tabs = () => within(screen.getByRole("navigation", { name: "Admin sections" })).getAllByRole("button").map(button => button.textContent);
const headers = () => screen.getAllByRole("columnheader").map(header => header.textContent);
const rowOf = (name: string) => screen.getByText(name).closest("tr")!;
const openRow = (name: string) => fireEvent.click(rowOf(name));
const drawer = () => within(screen.getByRole("dialog"));
const openSection = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  api.checks = [check(), check({ id: 2, fullName: "Bola Quiet", businessName: "Bola Bakes", email: "bola@example.test", whatsapp: null, pipelineStage: "qualified_lead", callRequestedAt: null })];
  api.calls = [check()];
  api.clients = [];
  api.candidates = [check()];
  api.invitations = [];
  api.details = { 1: detailFor(), 2: detailFor({ id: 2, fullName: "Bola Quiet", businessName: "Bola Bakes", email: "bola@example.test", whatsapp: null, pipelineStage: "qualified_lead", callRequestedAt: null }) };
  api.error = undefined;
  api.mutations = { schedule: [], outcome: [], stage: [], invite: [], revoke: [], requestPayment: [], proof: [], confirmPayment: [], downloadReport: [], resendReportLink: [] };
  api.inviteResult = { invitationUrl: "https://app.example.test/onboarding/TOKEN123", deliveryStatus: "Simulated", expiresAt: new Date(), invitationId: 1 };
});
afterEach(cleanup);

describe("which sections each person sees (decided from what the server resolved)", () => {
  it("shows the Super Admin every section, in funnel order, opening on Business Checks", () => {
    expect(visibleAdminSections(SUPER).map(section => section.id)).toEqual(["checks", "calls", "onboarding", "clients", "team", "jump"]);
    renderConsole();
    expect(tabs()).toEqual(["Business Checks", "Discovery Calls", "Client Onboarding", "Clients", "Admin Team", "JUMP Programme (Legacy)"]);
    expect(screen.getByRole("button", { name: "Business Checks" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("heading", { name: "Business Checks" })).toBeTruthy();
    expect(screen.queryByText("JUMP REGISTRATION DESK")).toBeNull();
  });

  it("keeps the JUMP desk, unmixed, in its own legacy section", () => {
    renderConsole();
    expect(screen.queryByText("JUMP REGISTRATION DESK")).toBeNull();
    openSection("JUMP Programme (Legacy)");
    expect(screen.getByText("JUMP REGISTRATION DESK")).toBeTruthy();
    expect(screen.queryByText("Ada Okafor")).toBeNull();
  });

  it("keeps Client Onboarding reachable for the Super Admin, from the server's answer alone", () => {
    renderConsole();
    openSection("Client Onboarding");
    expect(screen.getByRole("heading", { name: "Client Onboarding" })).toBeTruthy();
    expect(adminCan({ isSuperAdmin: true, permissions: [] }, "manage_client_onboarding")).toBe(true);
    expect(visibleAdminSections({ isSuperAdmin: true, permissions: [] }).map(section => section.id)).toContain("onboarding");
  });

  it("shows an administrator only what they were granted", () => {
    const onboarding = { permissions: ["manage_client_onboarding"], platformPermissions: ["manage_client_onboarding"] };
    expect(visibleAdminSections(onboarding).map(section => section.id)).toEqual(["checks", "calls", "onboarding"]);
    expect(visibleAdminSections({ permissions: [], platformPermissions: ["view_all_businesses"] }).map(section => section.id)).toEqual(["clients"]);
    expect(visibleAdminSections({ permissions: ["view_participants"] }).map(section => section.id)).toEqual(["jump"]);
    expect(visibleAdminSections({ permissions: [] })).toEqual([]);
    expect(visibleAdminSections(undefined)).toEqual([]);
    expect(adminCan({ permissions: [], isOwner: false }, "manage_client_onboarding")).toBe(false);
  });

  it("says plainly when an account has no responsibilities yet, instead of showing an empty console", () => {
    renderConsole({ permissions: [], platformPermissions: [], email: "analyst@example.test", name: "Ayo Analyst", platformRoles: ["analyst"] });
    expect(screen.getByRole("note").textContent).toMatch(/no admin responsibilities/);
    expect(screen.queryByRole("navigation", { name: "Admin sections" })).toBeNull();
    expect(screen.getByText("Ayo Analyst")).toBeTruthy();
    expect(screen.getByText("Analyst")).toBeTruthy();
  });

  it("shows who is signed in as a name and a role, with the address underneath, not one noisy line", () => {
    renderConsole();
    const who = screen.getByLabelText("Signed in");
    expect(within(who).getByText("Emmanuel Tarfa")).toBeTruthy();
    expect(within(who).getByText("Super Admin")).toBeTruthy();
    expect(within(who).getByText("owner@example.test")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Signed in as|super admin, admin/);
  });

  it("falls back to the email when no name is known, and lists several roles without repeating Admin", () => {
    renderConsole({ ...SUPER, name: null, platformRoles: ["super_admin", "admin", "desk_lead"] });
    const who = screen.getByLabelText("Signed in");
    expect(within(who).getByText("owner@example.test")).toBeTruthy();
    expect(within(who).getByText("Super Admin · Desk Lead")).toBeTruthy();
  });
});

describe("Business Checks table", () => {
  it("shows five compact columns and nothing else", () => {
    renderConsole();
    expect(headers()).toEqual(["Prospect", "Business", "Business Check", "Main Finding", "Status"]);
  });

  it("does not spread database fields across the table", () => {
    renderConsole();
    for (const raw of ["Email", "WhatsApp", "Route", "Readiness", "Completed", "Call requested", "Call requested date", "Stage", "Main area"]) expect(headers()).not.toContain(raw);
    const text = rowOf("Ada Okafor").textContent!;
    expect(text).not.toContain("Programme");
    expect(text).not.toContain(READINESS_LABELS.intermediate);
    expect(within(rowOf("Ada Okafor")).queryByRole("button", { name: /^View$/ })).toBeNull();
  });

  it("identifies the prospect on three lines and shows the finding and check state compactly", () => {
    renderConsole();
    const row = rowOf("Ada Okafor");
    for (const text of ["Ada Okafor", "ada@example.test", "+234 800 000 0001", "Ada Foods", "Completed", "5 Oct 2026", "Financials", "Intermediate readiness"]) expect(row.textContent).toContain(text);
  });

  it("shows an unfinished check as not finished, with when it started", () => {
    api.checks = [check({ completedAt: null, readiness: null, route: null, primaryArea: null, pipelineStage: "lead", callRequestedAt: null })];
    renderConsole();
    const row = rowOf("Ada Okafor");
    expect(row.textContent).toContain("Not finished");
    expect(row.textContent).toContain("Started 5 Oct 2026");
    expect(within(row).getByText("Lead")).toBeTruthy();
  });

  it("shows a call with no time yet as 'Call requested', and as 'Call booked' only once its time is known", () => {
    renderConsole();
    expect(within(rowOf("Ada Okafor")).getByText("Call requested")).toBeTruthy();
    expect(within(rowOf("Ada Okafor")).queryByText("Call booked")).toBeNull();
    cleanup();
    api.checks = [check({ callScheduledFor: new Date("2026-10-08T13:00:00Z") })];
    renderConsole();
    expect(within(rowOf("Ada Okafor")).getByText("Call booked")).toBeTruthy();
  });

  it("labels each stage in plain words", () => {
    api.checks = [
      check({ id: 1, fullName: "P One", pipelineStage: "opportunity" }),
      check({ id: 2, fullName: "P Two", pipelineStage: "referred" }),
      check({ id: 3, fullName: "P Three", pipelineStage: "lost" }),
      check({ id: 4, fullName: "P Four", pipelineStage: "opportunity", invitationStatus: "pending" }),
      check({ id: 5, fullName: "P Five", pipelineStage: "opportunity", invitationStatus: "accepted" }),
      check({ id: 6, fullName: "P Six", pipelineStage: "qualified_lead", callRequestedAt: null }),
    ];
    renderConsole();
    for (const [name, label] of [["P One", "Opportunity"], ["P Two", "Referred"], ["P Three", "Lost"], ["P Four", "Onboarding"], ["P Five", "Onboarded"], ["P Six", "Qualified lead"]]) {
      expect(within(rowOf(name)).getByText(label)).toBeTruthy();
    }
  });

  it("shows restrained summary counts from the data already loaded", () => {
    api.checks = [check(), check({ id: 2, fullName: "B", callRequestedAt: null, pipelineStage: "qualified_lead", reportRequestedAt: new Date("2026-10-06T10:00:00Z") }), check({ id: 3, fullName: "C", pipelineStage: "opportunity" }), check({ id: 4, fullName: "D", completedAt: null, callRequestedAt: null, pipelineStage: "lead" })];
    renderConsole();
    const counts = Object.fromEntries(Array.from(screen.getByLabelText("Summary").children).map(item => [item.querySelector("dt")!.textContent, item.querySelector("dd")!.textContent]));
    expect(counts).toEqual({ "Total checks": "4", Completed: "3", "Call requested": "2", "Ready to onboard": "1", "Reports requested": "1" });
  });

  it("searches and filters, and keeps them when a record is opened and closed", () => {
    renderConsole();
    fireEvent.change(screen.getByLabelText("Search business checks"), { target: { value: "bola" } });
    expect(screen.queryByText("Ada Okafor")).toBeNull();
    expect(screen.getByText("Bola Quiet")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search business checks"), { target: { value: "" } });
    // The stage tabs replace the old "Call requested only" checkbox.
    expect(screen.queryByLabelText("Call requested only")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Call booked 1" }));
    expect(screen.queryByText("Bola Quiet")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Qualified lead 1" }));
    expect(screen.queryByText("Ada Okafor")).toBeNull();
    expect(screen.getByText("Bola Quiet")).toBeTruthy();
    // Open and close a record: the table is exactly as it was.
    openRow("Bola Quiet");
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("tab", { name: "Qualified lead 1" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText("Ada Okafor")).toBeNull();
    expect(screen.getByText("Bola Quiet")).toBeTruthy();
  });

  it("shows the server's refusal", () => {
    api.error = { message: "Your role does not include this responsibility." };
    renderConsole();
    expect(screen.getByRole("alert").textContent).toContain("does not include");
  });
});

describe("Business Check record drawer", () => {
  it("opens from anywhere on the row, with the right prospect", () => {
    renderConsole();
    expect(screen.queryByRole("dialog")).toBeNull();
    openRow("Bola Quiet");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Bola Quiet")).toBeTruthy();
    expect(within(dialog).getByText("Bola Bakes")).toBeTruthy();
    expect(within(dialog).queryByText("Ada Okafor")).toBeNull();
    expect(within(dialog).getByText("bola@example.test")).toBeTruthy();
    expect(within(dialog).getByText("Not given")).toBeTruthy();
  });

  it("is reachable by keyboard: each row has a real focusable button that opens the record", () => {
    renderConsole();
    const button = within(rowOf("Ada Okafor")).getByRole("button", { name: "Open record for Ada Okafor" }) as HTMLButtonElement;
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(rowOf("Ada Okafor").className).toMatch(/cursor-pointer/);
    expect(rowOf("Ada Okafor").className).toMatch(/hover:/);
    expect(rowOf("Ada Okafor").className).toMatch(/focus-within:/);
    fireEvent.click(button); // what Enter and Space do on a button
    expect(drawer().getByText("Ada Foods")).toBeTruthy();
  });

  it("shows the saved findings, outline and recommendations without recalculating anything", () => {
    renderConsole();
    openRow("Ada Okafor");
    const detail = drawer();
    expect(detail.getByText("Your prices are guesses and cash is tight.")).toBeTruthy();
    expect(detail.getByText(/The main problem is financial visibility\./)).toBeTruthy();
    expect(detail.getByText(READINESS_LABELS.intermediate)).toBeTruthy();
    expect(detail.getByText("Programme")).toBeTruthy();
    // Outline: every area with its health, and the starting point flagged.
    const outline = detail.getByRole("heading", { name: "Business outline" }).closest("section")!;
    expect(within(outline).getByText("Founder readiness").closest("li")!.textContent).toContain("Watch");
    expect(within(outline).getByText("Strategic intent").closest("li")!.textContent).toContain("Clear");
    const start = within(outline).getByText("Financials").closest("li")!;
    expect(start.textContent).toContain("Stuck");
    expect(start.textContent).toContain("Start here");
    expect(within(outline).getAllByText("Start here")).toHaveLength(1);
    // Recommended support: exactly what the check produced.
    const support = detail.getByRole("heading", { name: "Recommended support" }).closest("section")!;
    expect(within(support).getByText("Financial Performance & Decision Support")).toBeTruthy();
    expect(within(support).getByText("Business Model & Commercial Strategy")).toBeTruthy();
    expect(within(support).getByText("Margins are unclear.")).toBeTruthy();
  });

  it("shows the funnel with dates and the current stage in plain words", () => {
    api.details[1] = detailFor({ callScheduledFor: new Date("2026-10-08T13:00:00Z") });
    renderConsole();
    openRow("Ada Okafor");
    const funnel = drawer().getByRole("heading", { name: "Funnel" }).closest("section")!;
    for (const text of ["Check completed", "Call requested", "Call booked for", "5 Oct 2026", "Current stage", "Call booked"]) expect(funnel.textContent).toContain(text);
  });

  it("offers only the action that fits: a requested call leads to Discovery Calls", () => {
    renderConsole();
    openRow("Ada Okafor");
    expect(drawer().queryByRole("button", { name: "Continue to Client Onboarding" })).toBeNull();
    fireEvent.click(drawer().getByRole("button", { name: "Go to Discovery Call" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Discovery Calls" })).toBeTruthy();
  });

  it("offers Client Onboarding for a fit, and nothing for a check with no next step", () => {
    api.checks = [check({ pipelineStage: "opportunity" }), check({ id: 2, fullName: "Bola Quiet", callRequestedAt: null, pipelineStage: "qualified_lead" })];
    api.details = { 1: detailFor({ pipelineStage: "opportunity" }), 2: detailFor({ id: 2, fullName: "Bola Quiet", callRequestedAt: null, pipelineStage: "qualified_lead" }) };
    renderConsole();
    openRow("Bola Quiet");
    expect(drawer().queryByText("Next step")).toBeNull();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    openRow("Ada Okafor");
    fireEvent.click(drawer().getByRole("button", { name: "Continue to Client Onboarding" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Client Onboarding" })).toBeTruthy();
  });

  it("copes with a check that was never finished", () => {
    api.checks = [check({ completedAt: null, readiness: null, route: null, primaryArea: null, pipelineStage: "lead", callRequestedAt: null })];
    api.details[1] = detailFor({ completedAt: null, readiness: null, route: null, primaryArea: null, pipelineStage: "lead", callRequestedAt: null, summary: null, outline: null, primaryAreaNumber: null });
    renderConsole();
    openRow("Ada Okafor");
    expect(drawer().getByText("The owner has not finished the check.")).toBeTruthy();
    expect(drawer().getByText("No result yet.")).toBeTruthy();
    expect(drawer().queryByRole("heading", { name: "Business outline" })).toBeNull();
    expect(drawer().queryByRole("heading", { name: "Recommended support" })).toBeNull();
  });

  it("lets the admin copy the email and open WhatsApp, and uses only digits in the link", () => {
    renderConsole();
    openRow("Ada Okafor");
    expect(drawer().getByRole("link", { name: "ada@example.test" }).getAttribute("href")).toBe("mailto:ada@example.test");
    expect(drawer().getByRole("link", { name: "+234 800 000 0001" }).getAttribute("href")).toBe("https://wa.me/2348000000001");
    expect(drawer().getByRole("button", { name: "Copy email" })).toBeTruthy();
    expect(drawer().getByRole("button", { name: "Copy WhatsApp number" })).toBeTruthy();
  });
});

describe("Discovery Calls table", () => {
  const open = () => { renderConsole(); openSection("Discovery Calls"); };

  it("shows five compact columns and nothing else", () => {
    open();
    expect(headers()).toEqual(["Prospect", "Business", "Requested", "Scheduled For", "Status"]);
    const row = rowOf("Ada Okafor");
    for (const text of ["ada@example.test", "Ada Foods", "5 Oct 2026", "No time yet", "Call requested"]) expect(row.textContent).toContain(text);
  });

  it("keeps scheduling and outcome controls out of the table", () => {
    open();
    const table = screen.getByRole("table");
    expect(table.querySelector("input")).toBeNull();
    expect(table.querySelector("select")).toBeNull();
    for (const name of ["Mark call scheduled", "Mark fit", "Refer", "Decline", "Fit", "Opportunity", "Lost", "Save call schedule"]) expect(within(table).queryByRole("button", { name })).toBeNull();
    expect(within(table).getAllByRole("button")).toHaveLength(1); // only the row's own open button
  });

  it("shows when a call is scheduled", () => {
    api.calls = [check({ callScheduledFor: new Date("2026-10-08T13:00:00Z") })];
    open();
    const row = rowOf("Ada Okafor");
    expect(row.textContent).toContain("8 Oct 2026");
    expect(row.textContent).toMatch(/\d{1,2}:\d{2} [AP]M/);
    expect(row.textContent).toContain("Call booked");
  });

  it("shows restrained summary counts", () => {
    api.calls = [check(), check({ id: 2, fullName: "Two", callScheduledFor: new Date("2026-10-08T13:00:00Z") }), check({ id: 3, fullName: "Three", pipelineStage: "opportunity" }), check({ id: 4, fullName: "Four", pipelineStage: "lost" })];
    open();
    const counts = Object.fromEntries(Array.from(screen.getByLabelText("Summary").children).map(item => [item.querySelector("dt")!.textContent, item.querySelector("dd")!.textContent]));
    expect(counts).toEqual({ "Call requests": "4", "No time yet": "1", Booked: "1", Opportunity: "1" });
  });

  it("searches and filters by status", () => {
    api.calls = [check(), check({ id: 2, fullName: "Bola Quiet", email: "bola@example.test", pipelineStage: "opportunity" }), check({ id: 3, fullName: "Cee Decline", email: "cee@example.test", pipelineStage: "lost" })];
    open();
    expect(Array.from((screen.getByLabelText("Filter by status") as HTMLSelectElement).options).map(option => option.textContent)).toEqual(["All", "Call requested", "Call booked", "Opportunity", "Referred", "Lost"]);
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "fit" } });
    expect(screen.queryByText("Ada Okafor")).toBeNull();
    expect(screen.getByText("Bola Quiet")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "declined" } });
    expect(screen.getByText("Cee Decline")).toBeTruthy();
    expect(screen.queryByText("Bola Quiet")).toBeNull();
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Search discovery calls"), { target: { value: "cee@" } });
    expect(screen.queryByText("Ada Okafor")).toBeNull();
    expect(screen.getByText("Cee Decline")).toBeTruthy();
  });

  it("says so when no one has asked yet", () => {
    api.calls = [];
    open();
    expect(screen.getByText("No one has asked for a discovery call yet.")).toBeTruthy();
  });
});

describe("Discovery Call record drawer", () => {
  const open = (name = "Ada Okafor") => { renderConsole(); openSection("Discovery Calls"); openRow(name); };

  it("opens from the row with the prospect, contact and request details", () => {
    open();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Ada Okafor")).toBeTruthy();
    expect(within(dialog).getByText("Ada Foods")).toBeTruthy();
    expect(within(dialog).getAllByText("Call requested").length).toBeGreaterThan(0);
    expect(within(dialog).getByRole("link", { name: "ada@example.test" }).getAttribute("href")).toBe("mailto:ada@example.test");
    expect(within(dialog).getByRole("link", { name: "+234 800 000 0001" }).getAttribute("href")).toBe("https://wa.me/2348000000001");
    const request = within(dialog).getByRole("heading", { name: "Request" }).closest("section")!;
    for (const text of ["5 Oct 2026", "Financials", "Intermediate readiness"]) expect(request.textContent).toContain(text);
  });

  it("saves the call time with the existing action, only once a date and time are chosen", () => {
    open();
    const save = drawer().getByRole("button", { name: "Save call schedule" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(drawer().getByLabelText("Date"), { target: { value: "2026-10-12" } });
    expect(save.disabled).toBe(true);
    fireEvent.change(drawer().getByLabelText("Time"), { target: { value: "14:30" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(api.mutations.schedule).toEqual([{ businessCheckId: 1, scheduledFor: new Date("2026-10-12T14:30") }]);
  });

  it("shows the scheduled time and allows rescheduling", () => {
    api.calls = [check({ callScheduledFor: new Date("2026-10-08T13:00:00Z") })];
    open();
    const schedule = drawer().getByRole("heading", { name: "Schedule discovery call" }).closest("section")!;
    expect(schedule.textContent).toContain("Scheduled for");
    expect(schedule.textContent).toContain("8 Oct 2026");
    expect(drawer().queryByRole("button", { name: "Save call schedule" })).toBeNull();
    fireEvent.click(drawer().getByRole("button", { name: "Reschedule call" }));
    expect(api.mutations.schedule).toHaveLength(1);
  });

  it("offers Opportunity, Refer and Lost with different weight, and records them with the existing actions", () => {
    open();
    expect(drawer().getByRole("heading", { name: "Record call outcome" })).toBeTruthy();
    const fit = drawer().getByRole("button", { name: "Opportunity" });
    const refer = drawer().getByRole("button", { name: "Refer" });
    const decline = drawer().getByRole("button", { name: "Lost" });
    expect(fit.className).toMatch(/bg-brand/);
    expect(refer.className).not.toMatch(/bg-brand/);
    expect(decline.className).toMatch(/rose/);
    fireEvent.click(fit);
    fireEvent.click(refer);
    fireEvent.click(decline);
    expect(api.mutations.outcome).toEqual([
      { businessCheckId: 1, outcome: "fit" },
      { businessCheckId: 1, outcome: "refer" },
      { businessCheckId: 1, outcome: "decline" },
    ]);
  });

  it("after a fit, says it is suitable to proceed and leads to Client Onboarding without creating a link", () => {
    api.calls = [check({ pipelineStage: "opportunity" })];
    open();
    const card = screen.getByRole("region", { name: "Suitable to proceed" });
    expect(within(card).getByText("Confirm commercial approval/payment before sending the onboarding invitation.")).toBeTruthy();
    expect(drawer().getByText(/Recorded:/).textContent).toContain("Opportunity");
    fireEvent.click(within(card).getByRole("button", { name: "Continue to Client Onboarding" }));
    expect(api.mutations.invite).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Client Onboarding" })).toBeTruthy();
  });

  it("does not offer the suitable-to-proceed card, or the outcome buttons, at the wrong time", () => {
    open();
    expect(screen.queryByRole("region", { name: "Suitable to proceed" })).toBeNull();
    cleanup();
    api.calls = [check({ pipelineStage: "opportunity", invitationStatus: "pending" })];
    open();
    expect(screen.queryByRole("heading", { name: "Record call outcome" })).toBeNull();
    expect(drawer().getByText("An onboarding link has been generated for this prospect.")).toBeTruthy();
  });

  it("closes and leaves the table as it was", () => {
    open();
    fireEvent.click(drawer().getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Discovery Calls" })).toBeTruthy();
    expect(screen.getByText("Ada Okafor")).toBeTruthy();
  });
});

describe("Client Onboarding view", () => {
  const open = () => { renderConsole(); openSection("Client Onboarding"); };

  it("warns that payment is not automated before any link is generated", () => {
    open();
    expect(screen.getByRole("note").textContent).toBe("Payment confirmation is not automated yet. Confirm the client is approved to proceed before generating an onboarding link.");
  });

  it("shows the call, the stage, the email and the link state for each business check", () => {
    api.candidates = [check({ invitationStatus: "pending" }), check({ id: 2, fullName: "Bola Quiet", email: "bola@example.test", callRequestedAt: null, pipelineStage: "qualified_lead", invitationStatus: null })];
    open();
    const ada = rowOf("Ada Okafor");
    for (const text of ["Ada Foods", "ada@example.test", "Requested 5 Oct 2026", "Call requested", "Link sent, waiting"]) expect(ada.textContent).toContain(text);
    const bola = rowOf("Bola Quiet");
    for (const text of ["Not requested", "Qualified lead", "None"]) expect(bola.textContent).toContain(text);
  });

  it("generates a link and, when no email went out, says to copy it and send it manually", () => {
    open();
    fireEvent.click(screen.getAllByRole("button", { name: "Invite to onboard" })[0]);
    expect(api.mutations.invite).toEqual([{ businessCheckId: 1 }]);
    const link = screen.getByLabelText("Onboarding link") as HTMLInputElement;
    expect(link.value).toBe("https://app.example.test/onboarding/TOKEN123");
    expect(screen.getByRole("status").textContent).toContain("Email not sent. Copy this secure link and send it to the client manually.");
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByLabelText("Onboarding link")).toBeNull();
  });

  it("does not tell the admin to send it manually when the email really went out", () => {
    api.inviteResult = { ...api.inviteResult, deliveryStatus: "Sent" };
    open();
    fireEvent.click(screen.getAllByRole("button", { name: "Invite to onboard" })[0]);
    const status = screen.getByRole("status").textContent!;
    expect(status).toContain("also emailed to the client");
    expect(status).not.toContain("Email not sent");
  });

  it("separates the people and workspaces from the prospects in the counts", () => {
    open();
    const counts = Object.fromEntries(Array.from(document.querySelectorAll("dl > div")).map(item => [item.querySelector("dt")!.textContent, item.querySelector("dd")!.textContent]));
    expect(counts).toMatchObject({ "Business checks": "3", "Portal users": "1", Businesses: "1", Memberships: "1" });
  });
});

describe("Clients view", () => {
  it("lists onboarded businesses and their people, never prospects", () => {
    api.clients = [{ membershipId: 1, businessId: 7, businessName: "Richie Tech", businessStatus: "active", userId: 3, userName: "Richie Okafor", email: "richie@example.test", role: "owner", membershipStatus: "active", joinedAt: new Date("2026-10-06T10:00:00Z"), businessCreatedAt: new Date("2026-10-06T10:00:00Z") }];
    renderConsole();
    openSection("Clients");
    const row = screen.getByText("Richie Tech").closest("tr")!;
    for (const text of ["Richie Okafor", "richie@example.test", "Owner", "6 Oct 2026"]) expect(row.textContent).toContain(text);
    expect(screen.getByText(/1 business, 1 membership\./)).toBeTruthy();
    expect(screen.queryByText("Ada Okafor")).toBeNull();
  });

  it("says so when there are no clients yet", () => {
    renderConsole();
    openSection("Clients");
    expect(screen.getByText("No clients have been onboarded yet.")).toBeTruthy();
  });
});

describe("the commercial pipeline in Business Checks", () => {
  it("shows every pipeline stage as a tab with its count, and filters the table by stage", () => {
    api.checks = [
      check({ id: 1, fullName: "P One", pipelineStage: "opportunity" }),
      check({ id: 2, fullName: "P Two", pipelineStage: "won" }),
      check({ id: 3, fullName: "P Three", pipelineStage: "nurture" }),
      check({ id: 4, fullName: "P Four", pipelineStage: "won" }),
      check({ id: 5, fullName: "P Five", pipelineStage: "lead", completedAt: null, callRequestedAt: null }),
    ];
    renderConsole();
    const names = within(screen.getByRole("tablist", { name: "Pipeline stage" })).getAllByRole("tab").map(tab => tab.textContent);
    expect(names).toEqual(["All 5", "Lead 1", "Qualified lead 0", "Call booked 0", "Opportunity 1", "Won 2", "Lost 0", "Nurture 1", "Referred 0"]);
    fireEvent.click(screen.getByRole("tab", { name: "Won 2" }));
    expect(screen.getByText("P Two")).toBeTruthy();
    expect(screen.getByText("P Four")).toBeTruthy();
    expect(screen.queryByText("P One")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "All 5" }));
    expect(screen.getByText("P One")).toBeTruthy();
  });

  it("moves a check to any later stage, including Won and Nurture, with an optional note", () => {
    renderConsole();
    openRow("Ada Okafor");
    const move = within(drawer().getByText("Move to").closest("section")!);
    // The current stage and the starting stage are not offered.
    expect(move.queryByRole("button", { name: "Call requested" })).toBeNull();
    expect(move.queryByRole("button", { name: "Lead" })).toBeNull();
    for (const name of ["Qualified lead", "Opportunity", "Won", "Lost", "Nurture", "Referred"]) expect(move.getByRole("button", { name })).toBeTruthy();
    fireEvent.change(move.getByLabelText("Note (optional)"), { target: { value: "  Paid by transfer  " } });
    fireEvent.click(move.getByRole("button", { name: "Won" }));
    fireEvent.click(move.getByRole("button", { name: "Nurture" }));
    expect(api.mutations.stage).toEqual([{ businessCheckId: 1, stage: "won", note: "Paid by transfer" }, { businessCheckId: 1, stage: "nurture", note: undefined }]);
  });

  it("shows the team's moves with who, when, from, to and the note, and treats a won business as final", () => {
    api.details[1] = detailFor({
      pipelineStage: "won",
      stageHistory: [
        { id: 3, action: "business_check_stage_changed", from: "opportunity", to: "won", note: "Paid by transfer", scheduledFor: null, by: "Emmanuel Tarfa", at: new Date("2026-10-07T10:00:00Z") },
        { id: 2, action: "business_check_call_outcome", from: "call_booked", to: "opportunity", note: null, scheduledFor: null, by: "Emmanuel Tarfa", at: new Date("2026-10-06T10:00:00Z") },
        { id: 1, action: "business_check_call_scheduled", from: null, to: null, note: null, scheduledFor: "2026-10-06T09:00:00.000Z", by: null, at: new Date("2026-10-05T10:00:00Z") },
        { id: 0, action: "business_check_call_booked", from: null, to: null, note: null, scheduledFor: "2026-10-06T08:00:00.000Z", by: null, at: new Date("2026-10-05T09:00:00Z") },
      ],
    });
    renderConsole();
    openRow("Ada Okafor");
    const history = drawer().getByRole("list", { name: "Stage history" });
    const items = within(history).getAllByRole("listitem").map(item => item.textContent);
    expect(items[0]).toMatch(/^Won from Opportunity.*Emmanuel Tarfa · 7 Oct 2026.*Paid by transfer$/);
    expect(items[1]).toMatch(/^Opportunity from Call booked/);
    expect(items[2]).toMatch(/^Call time recorded for 6 Oct 2026.*Team ·/);
    expect(items[3]).toMatch(/^Booked on Calendly for 6 Oct 2026.*Team ·/);
    expect(drawer().getByText("This business has been won, so its stage is final.")).toBeTruthy();
    expect(drawer().queryByLabelText("Note (optional)")).toBeNull();
  });
});

describe("full report requests in Business Checks", () => {
  it("marks a lead who asked for the ₦100,000 report in the list, beside their stage", () => {
    api.checks = [check({ reportRequestedAt: new Date("2026-10-06T10:00:00Z") }), check({ id: 2, fullName: "Bola Quiet", businessName: "Bola Bakes", email: "bola@example.test" })];
    renderConsole();
    expect(within(rowOf("Ada Okafor")).getByText("Report requested")).toBeTruthy();
    expect(within(rowOf("Bola Quiet")).queryByText("Report requested")).toBeNull();
  });

  it("shows when the report was requested in the record and its funnel", () => {
    api.details[1] = detailFor({ reportRequestedAt: new Date("2026-10-06T10:00:00Z") });
    renderConsole();
    openRow("Ada Okafor");
    expect(drawer().getByText("Full report (₦100,000)")).toBeTruthy();
    expect(drawer().getByText("Requested 6 Oct 2026")).toBeTruthy();
    const funnel = drawer().getByRole("heading", { name: "Funnel" }).closest("section")!;
    expect(funnel.textContent).toContain("Full report requested");
  });

  it("says the report was not requested when it was not", () => {
    api.details[1] = detailFor({ reportRequestedAt: null });
    renderConsole();
    openRow("Ada Okafor");
    expect(drawer().getByText("Not requested")).toBeTruthy();
  });
});

describe("payments in Business Checks", () => {
  // As the server sends it: the status the team sees (displayStatus) and the end of the 48-hour window (payBy).
  const payment = (over: Record<string, unknown> = {}) => {
    const row = {
      id: 7, item: "current_state", amountNaira: 500_000, reference: "TS-CS-000001", status: "requested", requestedAt: new Date("2026-10-08T10:00:00Z"),
      deliveryStatus: "Simulated", proofReceivedAt: null, confirmedAt: null, note: null, ...over,
    } as Record<string, unknown> & { status: string; requestedAt: Date };
    return { displayStatus: row.status, payBy: new Date(row.requestedAt.getTime() + 48 * 3_600_000), ...row };
  };
  const payments = () => within(drawer().getByRole("heading", { name: "Payments" }).closest("section")!);

  it("shows where each payment stands beside the stage in the list", () => {
    api.checks = [
      check({ reportRequestedAt: new Date("2026-10-06T10:00:00Z"), payments: { full_report: "confirmed", current_state: "proof_received" } }),
      check({ id: 2, fullName: "Bola Quiet", businessName: "Bola Bakes", email: "bola@example.test", payments: { full_report: "requested" } }),
    ];
    renderConsole();
    expect(within(rowOf("Ada Okafor")).getByText("Report paid")).toBeTruthy();
    expect(within(rowOf("Ada Okafor")).getByText("Current State Assessment: proof received")).toBeTruthy();
    expect(within(rowOf("Bola Quiet")).getByText("Report: awaiting payment")).toBeTruthy();
    expect(within(rowOf("Bola Quiet")).queryByText("Report requested")).toBeNull();
  });

  it("sends Current State Assessment payment details from the record", () => {
    renderConsole();
    openRow("Ada Okafor");
    expect(payments().getByText("Your full business check report")).toBeTruthy();
    expect(payments().getByText("₦500,000")).toBeTruthy();
    expect(payments().getAllByText("Payment details not sent.")).toHaveLength(2);
    const currentState = within(payments().getByRole("listitem", { name: "Current State Assessment" }));
    fireEvent.click(currentState.getByRole("button", { name: "Send payment details" }));
    expect(api.mutations.requestPayment).toEqual([{ businessCheckId: 1, item: "current_state" }]);
  });

  it("notes proof, and confirms only after saying what confirming does", () => {
    api.details[1] = detailFor({ payments: [payment()] });
    renderConsole();
    openRow("Ada Okafor");
    const currentState = within(payments().getByRole("listitem", { name: "Current State Assessment" }));
    expect(currentState.getByText("Awaiting payment")).toBeTruthy();
    expect(currentState.getByText("TS-CS-000001")).toBeTruthy();
    fireEvent.click(currentState.getByRole("button", { name: "Proof received" }));
    expect(api.mutations.proof).toEqual([{ paymentRequestId: 7 }]);

    fireEvent.click(currentState.getByRole("button", { name: "Confirm payment" }));
    expect(api.mutations.confirmPayment).toEqual([]);
    expect(currentState.getByText(/the business moves to Won and they get a link to set up their client account, where the Current State Assessment starts/)).toBeTruthy();
    fireEvent.change(currentState.getByLabelText("Note (optional)"), { target: { value: " GTB ref 123 " } });
    fireEvent.click(currentState.getByRole("button", { name: "Yes, the money is in" }));
    expect(api.mutations.confirmPayment).toEqual([{ paymentRequestId: 7, note: "GTB ref 123" }]);
  });

  it("shows a paid item as final, with no actions", () => {
    api.details[1] = detailFor({ payments: [payment({ status: "confirmed", confirmedAt: new Date("2026-10-09T10:00:00Z"), note: "GTB ref 123" })] });
    renderConsole();
    openRow("Ada Okafor");
    const currentState = within(payments().getByRole("listitem", { name: "Current State Assessment" }));
    expect(currentState.getByText("Paid")).toBeTruthy();
    expect(currentState.getByText("Paid, confirmed 9 Oct 2026")).toBeTruthy();
    expect(currentState.queryByRole("button")).toBeNull();
  });

  it("shows the 48-hour window: the pay-by time while it runs, and what to do once it has passed", () => {
    api.checks = [check({ payments: { current_state: "expired" } })];
    api.details[1] = detailFor({ payments: [payment()] });
    renderConsole();
    expect(within(rowOf("Ada Okafor")).getByText("Current State Assessment: 48 hours passed")).toBeTruthy();
    openRow("Ada Okafor");
    expect(within(payments().getByRole("listitem", { name: "Current State Assessment" })).getByText(/pay by 10 Oct 2026/)).toBeTruthy();
    cleanup();

    api.details[1] = detailFor({ payments: [payment({ displayStatus: "expired" })] });
    renderConsole();
    openRow("Ada Okafor");
    const currentState = within(payments().getByRole("listitem", { name: "Current State Assessment" }));
    expect(currentState.getByText("48 hours passed")).toBeTruthy();
    expect(currentState.getByText(/Send the details again for a new window, or move the business to Lost/)).toBeTruthy();
    // Money that still arrives can be recorded and confirmed.
    expect(currentState.getByRole("button", { name: "Send the details again" })).toBeTruthy();
    expect(currentState.getByRole("button", { name: "Proof received" })).toBeTruthy();
    expect(currentState.getByRole("button", { name: "Confirm payment" })).toBeTruthy();
  });

  it("says when the payment table is not in the database yet", () => {
    api.details[1] = detailFor({ payments: null });
    renderConsole();
    openRow("Ada Okafor");
    expect(payments().getByText("Payments are not set up in the database yet (migration 0006).")).toBeTruthy();
  });

  it("shows where a paid report stands: waiting for the form, with a resend, or sent, with a download", () => {
    const paid = payment({ id: 9, item: "full_report", amountNaira: 100_000, reference: "TS-R-000001", status: "confirmed", confirmedAt: new Date("2026-10-09T10:00:00Z") });
    api.details[1] = detailFor({ payments: [paid], report: { status: "awaiting_intake", createdAt: new Date("2026-10-09T10:00:00Z"), deliveredAt: null, deliveryStatus: "Simulated" } });
    renderConsole();
    openRow("Ada Okafor");
    const report = within(payments().getByRole("listitem", { name: "Your full business check report" }));
    expect(report.getByText(/Waiting for the owner's answers/)).toBeTruthy();
    fireEvent.click(report.getByRole("button", { name: "Send the form link again" }));
    expect(api.mutations.resendReportLink).toEqual([{ businessCheckId: 1 }]);
    cleanup();

    api.details[1] = detailFor({ payments: [paid], report: { status: "delivered", createdAt: new Date("2026-10-09T10:00:00Z"), deliveredAt: new Date("2026-10-09T11:00:00Z"), deliveryStatus: "Sent" } });
    renderConsole();
    openRow("Ada Okafor");
    const sent = within(payments().getByRole("listitem", { name: "Your full business check report" }));
    expect(sent.getByText("Report sent 9 Oct 2026")).toBeTruthy();
    fireEvent.click(sent.getByRole("button", { name: "Download the report" }));
    expect(api.mutations.downloadReport).toEqual([{ businessCheckId: 1 }]);
  });
});
