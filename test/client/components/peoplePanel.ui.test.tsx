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
    },
  },
}));

const { default: PeoplePanel } = await import("@/components/admin/PeoplePanel");

const ada = { id: 1, name: "Ada Okafor", email: "ada@example.test", status: "active", lastSignedIn: new Date("2026-10-09T10:00:00Z"), roles: [], businesses: 1, superAdmin: false };
const lewis = { id: 2, name: "Lewis Desk", email: "lewis@example.test", status: "suspended", lastSignedIn: new Date("2026-10-08T10:00:00Z"), roles: ["desk_lead"], businesses: 0, superAdmin: false };
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

  it("shows nothing to someone the server refuses", () => {
    api.error = { message: "Your IPF administrator role does not include this responsibility." };
    const { container } = render(<PeoplePanel />);
    expect(container.textContent).toBe("");
  });
});
