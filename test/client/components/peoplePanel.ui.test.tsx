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
    platformRoles: {
      grant: { useMutation: mutation("grant") },
      revoke: { useMutation: mutation("revoke") },
      setLevel: { useMutation: mutation("setLevel", () => ({ success: true, level: "Senior Associate" })) },
    },
  },
}));

const { default: PeoplePanel } = await import("@/components/admin/PeoplePanel");

const ada = { id: 1, name: "Ada Okafor", email: "ada@example.test", status: "active", lastSignedIn: new Date("2026-10-09T10:00:00Z"), roles: [], businesses: 1, superAdmin: false, twoStep: false, accessEndsAt: null };
const lewis = { id: 2, name: "Lewis Desk", email: "lewis@example.test", status: "suspended", lastSignedIn: new Date("2026-10-08T10:00:00Z"), roles: ["desk_lead"], businesses: 0, superAdmin: false, twoStep: true, accessEndsAt: null, jobTitle: null };
const kemi = { id: 3, name: "Kemi Contractor", email: "kemi@example.test", status: "active", lastSignedIn: new Date("2026-11-20T10:00:00Z"), roles: ["subject_matter_expert"], businesses: 0, superAdmin: false, twoStep: false, accessEndsAt: new Date("2027-03-09T22:59:59Z") };
const owner = { id: 4, name: "Owner Person", email: "owner@example.test", status: "active", lastSignedIn: new Date("2026-11-20T10:00:00Z"), roles: ["super_admin"], businesses: 0, superAdmin: true, twoStep: true, accessEndsAt: null };
const rowOf = (name: string) => within(screen.getByText(name).closest("tr")!);

/** Team and Clients each render their own list; most checks here read both, as the two tabs together. */
const Both = () => <><PeoplePanel scope="team" /><PeoplePanel scope="clients" /></>;

describe("the People panel", () => {
  beforeEach(() => {
    api.people = [ada, lewis];
    api.error = null;
    api.calls = {};
  });
  afterEach(cleanup);

  it("lists everyone with a password account, their roles, status and last sign-in", () => {
    render(<Both />);
    expect(screen.getByRole("heading", { name: "IP Factory team" })).toBeTruthy();
    expect(rowOf("Ada Okafor").getByText("ada@example.test")).toBeTruthy();
    expect(rowOf("Ada Okafor").getByText("Client")).toBeTruthy();
    expect(rowOf("Ada Okafor").getByText("Active")).toBeTruthy();
    expect(rowOf("Lewis Desk").getByText("Suspended")).toBeTruthy();
    expect(rowOf("Lewis Desk").queryByRole("button", { name: "Reset link" })).toBeNull();
    expect(rowOf("Lewis Desk").getByRole("button", { name: "Reinstate" })).toBeTruthy();
  });

  it("puts the IP Factory team under Team and client accounts under Clients, each person once", () => {
    const team = render(<PeoplePanel scope="team" />);
    expect(team.queryByRole("region", { name: "Clients" })).toBeNull();
    expect(team.getByRole("heading", { level: 2 }).textContent).toBe("IP Factory team");
    team.unmount();
    const clients = render(<PeoplePanel scope="clients" />);
    expect(clients.queryByRole("region", { name: "IP Factory team" })).toBeNull();
    expect(clients.getByRole("heading", { level: 2 }).textContent).toBe("Client accounts");
    clients.unmount();
  });

  it("keeps the IP Factory team and clients in separate tables", () => {
    render(<Both />);
    expect(within(screen.getByRole("region", { name: "IP Factory team" })).getByText("Lewis Desk")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "IP Factory team" })).queryByText("Ada Okafor")).toBeNull();
    expect(within(screen.getByRole("region", { name: "Clients" })).getByText("Ada Okafor")).toBeTruthy();
  });

  it("keeps a staff member whose access was removed under the IP Factory team, without a level, ready to be given one", () => {
    const removed = { id: 5, name: "Lewis Reinstated", email: "lewis.r@example.test", status: "active", lastSignedIn: null, roles: [], businesses: 0, superAdmin: false, twoStep: false, accessEndsAt: null, jobTitle: "Senior Associate" };
    api.people = [ada, removed];
    render(<Both />);
    const team = within(screen.getByRole("region", { name: "IP Factory team" }));
    expect(team.getByText("Lewis Reinstated")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Clients" })).queryByText("Lewis Reinstated")).toBeNull();
    expect(rowOf("Lewis Reinstated").getByText("No access: choose a level")).toBeTruthy();
    fireEvent.change(rowOf("Lewis Reinstated").getByLabelText("Level of Lewis Reinstated"), { target: { value: "Senior Associate" } });
    expect(api.calls.setLevel).toEqual([{ userId: 5, level: "Senior Associate", expiresOn: null }]);
  });

  it("sets a staff member's level, which sets their access, and asks a Specialist's end date first", () => {
    render(<Both />);
    const row = rowOf("Lewis Desk");
    fireEvent.change(row.getByLabelText("Level of Lewis Desk"), { target: { value: "Senior Associate" } });
    expect(api.calls.setLevel).toEqual([{ userId: 2, level: "Senior Associate", expiresOn: null }]);
    fireEvent.change(row.getByLabelText("Level of Lewis Desk"), { target: { value: "Specialist" } });
    expect(api.calls.setLevel).toHaveLength(1);
    fireEvent.change(row.getByLabelText("Access ends for Lewis Desk"), { target: { value: "2027-03-09" } });
    fireEvent.click(row.getByRole("button", { name: "Save" }));
    expect(api.calls.setLevel[1]).toEqual({ userId: 2, level: "Specialist", expiresOn: "2027-03-09" });
  });

  it("issues a reset link and shows it once, saying to send it by hand when no email went out", () => {
    render(<Both />);
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
    render(<Both />);
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
    render(<Both />);
    expect(rowOf("Lewis Desk").getByText("On")).toBeTruthy();
    expect(rowOf("Kemi Contractor").getByText("Not set up")).toBeTruthy();
    expect(rowOf("Kemi Contractor").getByText(/2027/)).toBeTruthy();
  });

  it("removes access only with a reason, and never offers it for a Super Admin", () => {
    api.people = [kemi, owner];
    render(<Both />);
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

  it("offers a level only for staff, never for a client, and shows what the level gives", () => {
    api.people = [ada, { ...lewis, jobTitle: "Senior Associate" }];
    render(<Both />);
    expect(rowOf("Ada Okafor").queryByRole("combobox")).toBeNull();
    expect((rowOf("Lewis Desk").getByLabelText("Level of Lewis Desk") as HTMLSelectElement).value).toBe("Senior Associate");
    expect(rowOf("Lewis Desk").getByText("Every engagement; assigns people and approves")).toBeTruthy();
  });

  it("resets two-step sign-in for a lost phone", () => {
    render(<Both />);
    expect(rowOf("Ada Okafor").queryByRole("button", { name: "Reset two-step" })).toBeNull();
    fireEvent.click(rowOf("Lewis Desk").getByRole("button", { name: "Reset two-step" }));
    expect(api.calls.resetTwoStep).toEqual([{ userId: 2 }]);
  });

  it("shows nothing to someone the server refuses", () => {
    api.error = { message: "Your IPF administrator role does not include this responsibility." };
    const { container } = render(<Both />);
    expect(container.textContent).toBe("");
  });
});
