/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  people: [] as unknown[],
  error: null as unknown,
  calls: {} as Record<string, unknown[]>,
  resetReply: { resetId: 1, resetUrl: "https://app.example.test/reset/TOKEN123", expiresAt: new Date(), deliveryStatus: "Simulated" } as Record<string, unknown>,
  statusReply: { success: true, changed: true, status: "suspended" } as Record<string, unknown>,
}));
const mutation = (name: string, reply?: () => unknown) => (options?: { onSuccess?: (value: never, variables: never) => void }) => ({
  isPending: false,
  mutate: (input: unknown) => { (api.calls[name] ??= []).push(input); options?.onSuccess?.((reply?.() ?? { success: true }) as never, input as never); },
});
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ people: { list: { invalidate: () => undefined } } }),
    people: {
      list: { useQuery: () => ({ data: api.error ? undefined : api.people, error: api.error }) },
      issuePasswordReset: { useMutation: mutation("issue", () => api.resetReply) },
      setStatus: { useMutation: mutation("setStatus", () => api.statusReply) },
      removeAccess: { useMutation: mutation("removeAccess", () => ({ success: true, sessionsEnded: 2 })) },
      resetTwoStep: { useMutation: mutation("resetTwoStep") },
      setJobTitle: { useMutation: mutation("setJobTitle") },
    },
  },
}));

const { default: PeoplePanel } = await import("@/components/admin/PeoplePanel");

const ada = { id: 1, name: "Ada Okafor", email: "ada@example.test", status: "active", lastSignedIn: new Date("2026-10-09T10:00:00Z"), roles: [], businesses: 1, superAdmin: false, twoStep: false, accessEndsAt: null };
const lewis = { id: 2, name: "Lewis Desk", email: "lewis@example.test", status: "suspended", lastSignedIn: new Date("2026-10-08T10:00:00Z"), roles: ["desk_lead"], businesses: 0, superAdmin: false, twoStep: true, accessEndsAt: null, jobTitle: null };
const kemi = { id: 3, name: "Kemi Contractor", email: "kemi@example.test", status: "active", lastSignedIn: new Date("2026-11-20T10:00:00Z"), roles: ["subject_matter_expert"], businesses: 0, superAdmin: false, twoStep: false, accessEndsAt: new Date("2027-03-09T22:59:59Z") };
const owner = { id: 4, name: "Owner Person", email: "owner@example.test", status: "active", lastSignedIn: new Date("2026-11-20T10:00:00Z"), roles: ["super_admin"], businesses: 0, superAdmin: true, twoStep: true, accessEndsAt: null };
const rowOf = (name: string) => within(screen.getByText(name).closest("tr")!);

describe("the People panel", () => {
  beforeEach(() => {
    api.people = [ada, lewis];
    api.error = null;
    api.calls = {};
  });
  afterEach(cleanup);

  it("lists everyone with a password account, their roles, status and last sign-in", () => {
    render(<PeoplePanel />);
    expect(screen.getByRole("heading", { name: "People" })).toBeTruthy();
    expect(rowOf("Ada Okafor").getByText("ada@example.test")).toBeTruthy();
    expect(rowOf("Ada Okafor").getByText("Client")).toBeTruthy();
    expect(rowOf("Ada Okafor").getByText("Active")).toBeTruthy();
    expect(rowOf("Lewis Desk").getByText("Suspended")).toBeTruthy();
    expect(rowOf("Lewis Desk").queryByRole("button", { name: "Reset link" })).toBeNull();
    expect(rowOf("Lewis Desk").getByRole("button", { name: "Reinstate" })).toBeTruthy();
  });

  it("issues a reset link and shows it once, saying to send it by hand when no email went out", () => {
    render(<PeoplePanel />);
    fireEvent.click(rowOf("Ada Okafor").getByRole("button", { name: "Reset link" }));
    expect(api.calls.issue).toEqual([{ userId: 1 }]);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Reset link for ada@example.test");
    expect(status.textContent).toContain("copy this link and send it to them yourself");
    expect((screen.getByLabelText("Reset link") as HTMLInputElement).value).toBe("https://app.example.test/reset/TOKEN123");
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByLabelText("Reset link")).toBeNull();
  });

  it("asks for a reason before suspending, records it, and reinstates with one click", () => {
    render(<PeoplePanel />);
    fireEvent.click(rowOf("Ada Okafor").getByRole("button", { name: "Suspend" }));
    const form = within(screen.getByRole("form", { name: "Suspend account" }));
    expect(form.getByText("Suspend Ada Okafor?")).toBeTruthy();
    expect((form.getByRole("button", { name: "Suspend" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(form.getByLabelText("Reason"), { target: { value: "  Unpaid invoice  " } });
    fireEvent.click(form.getByRole("button", { name: "Suspend" }));
    expect(api.calls.setStatus).toEqual([{ userId: 1, status: "suspended", reason: "Unpaid invoice" }]);
    expect(screen.queryByRole("form", { name: "Suspend account" })).toBeNull();

    fireEvent.click(rowOf("Lewis Desk").getByRole("button", { name: "Reinstate" }));
    expect(api.calls.setStatus).toEqual([{ userId: 1, status: "suspended", reason: "Unpaid invoice" }, { userId: 2, status: "active" }]);
  });

  it("shows two-step status and when access ends, and flags staff who have not set up two-step", () => {
    api.people = [lewis, kemi];
    render(<PeoplePanel />);
    expect(rowOf("Lewis Desk").getByText("On")).toBeTruthy();
    expect(rowOf("Kemi Contractor").getByText("Not set up")).toBeTruthy();
    expect(rowOf("Kemi Contractor").getByText(/2027/)).toBeTruthy();
  });

  it("removes access only with a reason, and never offers it for a Super Admin", () => {
    api.people = [kemi, owner];
    render(<PeoplePanel />);
    expect(rowOf("Owner Person").queryByRole("button", { name: "Remove access" })).toBeNull();
    fireEvent.click(rowOf("Kemi Contractor").getByRole("button", { name: "Remove access" }));
    const form = within(screen.getByRole("form", { name: "Remove access" }));
    expect(form.getByText("Remove all access for Kemi Contractor?")).toBeTruthy();
    const confirm = form.getByRole("button", { name: "Remove access now" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(form.getByLabelText("Reason (kept in the audit log)"), { target: { value: " Contract ended " } });
    fireEvent.click(confirm);
    expect(api.calls.removeAccess).toEqual([{ userId: 3, reason: "Contract ended" }]);
    expect(screen.queryByRole("form", { name: "Remove access" })).toBeNull();
  });

  it("sets a staff member's firm title, which clients see beside their role on an engagement", () => {
    render(<PeoplePanel />);
    expect(rowOf("Ada Okafor").queryByRole("combobox")).toBeNull();
    fireEvent.change(rowOf("Lewis Desk").getByRole("combobox", { name: "Firm title for Lewis Desk" }), { target: { value: "Senior Associate" } });
    expect(api.calls.setJobTitle).toEqual([{ userId: 2, jobTitle: "Senior Associate" }]);
  });

  it("resets two-step sign-in for a lost phone", () => {
    render(<PeoplePanel />);
    expect(rowOf("Ada Okafor").queryByRole("button", { name: "Reset two-step" })).toBeNull();
    fireEvent.click(rowOf("Lewis Desk").getByRole("button", { name: "Reset two-step" }));
    expect(api.calls.resetTwoStep).toEqual([{ userId: 2 }]);
  });

  it("shows nothing to someone the server refuses", () => {
    api.error = { message: "Your IPF administrator role does not include this responsibility." };
    const { container } = render(<PeoplePanel />);
    expect(container.textContent).toBe("");
  });
});
