/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const api = vi.hoisted(() => ({
  preview: undefined as unknown,
  me: null as unknown,
  seats: undefined as unknown,
  team: [] as unknown[],
  staffInvitations: [] as unknown[],
  acceptReply: undefined as unknown,
  calls: {} as Record<string, unknown[]>,
  inviteReply: { invitationId: 1, invitationUrl: "https://app.example.test/join/TOKEN", deliveryStatus: "Simulated" },
}));
const mutation = (name: string, reply?: () => unknown) => (options?: { onSuccess?: (value: never) => void; onError?: (error: Error) => void }) => ({
  isPending: false,
  mutate: (input: unknown) => { (api.calls[name] ??= []).push(input); options?.onSuccess?.((reply?.() ?? { success: true }) as never); },
});
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ account: { me: { setData: () => undefined } }, invitations: { seats: { list: { invalidate: () => undefined } }, staff: { list: { invalidate: () => undefined }, team: { invalidate: () => undefined } } } }),
    account: { me: { useQuery: () => ({ data: api.me, isLoading: false, refetch: () => undefined }) }, signOut: { useMutation: mutation("signOut") } },
    invitations: {
      preview: { useQuery: () => ({ data: api.preview, isLoading: false }) },
      accept: { useMutation: mutation("accept", () => api.acceptReply) },
      seats: {
        list: { useQuery: () => ({ data: api.seats }) },
        invite: { useMutation: mutation("seatInvite", () => api.inviteReply) },
        revoke: { useMutation: mutation("seatRevoke") },
        remove: { useMutation: mutation("seatRemove") },
        setAccess: { useMutation: mutation("seatAccess") },
      },
      staff: {
        team: { useQuery: () => ({ data: api.team, error: null }) },
        list: { useQuery: () => ({ data: api.staffInvitations }) },
        invite: { useMutation: mutation("staffInvite", () => api.inviteReply) },
        revoke: { useMutation: mutation("staffRevoke") },
      },
    },
  },
}));

const { default: JoinPage } = await import("@/pages/JoinPage");
const { default: TeamSeats } = await import("@/components/TeamSeats");
const { default: StaffPanel } = await import("@/components/admin/StaffPanel");

const renderJoin = () => {
  const location = memoryLocation({ path: "/join/TOKEN-123456789012345678901234", record: true });
  render(<Router hook={location.hook}><Route path="/join/:token" component={JoinPage} /></Router>);
  return location;
};

beforeEach(() => {
  api.preview = undefined;
  api.me = null;
  api.calls = {};
});
afterEach(cleanup);

describe("joining by invitation", () => {
  it("creates an analyst's account with the invited email locked, and opens their landing page", async () => {
    api.preview = { available: true, kind: "staff", email: "ola@example.com", fullName: "Ola Analyst", businessName: null, access: null };
    api.acceptReply = { landingPath: "/admin", user: { email: "ola@example.com" } };
    const location = renderJoin();
    expect(screen.getByText(/invited to the IP Factory team on The Shift/)).toBeTruthy();
    expect((screen.getByLabelText("Email") as HTMLInputElement).readOnly).toBe(true);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct horse 42" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "correct horse 42" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(api.calls.accept).toEqual([{ token: "TOKEN-123456789012345678901234", email: "ola@example.com", fullName: "Ola Analyst", password: "correct horse 42", confirmPassword: "correct horse 42" }]);
    await waitFor(() => expect(location.history.at(-1)).toBe("/admin"));
  });

  it("tells the owner's staff whose business it is and what they will see", () => {
    api.preview = { available: true, kind: "business_member", email: "chidi@example.com", fullName: "Chidi", businessName: "Ada Foods", access: "contributor" };
    renderJoin();
    expect(screen.getByText(/invited to work on Ada Foods with IP Factory\. Sees only the Data Requests, actions and Sessions given to them\./)).toBeTruthy();
  });

  it("checks the password before calling the server, and shows an unusable link plainly", () => {
    api.preview = { available: true, kind: "staff", email: "ola@example.com", fullName: "Ola Analyst", businessName: null, access: null };
    renderJoin();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(api.calls.accept).toBeUndefined();
    cleanup();
    api.preview = { available: false };
    renderJoin();
    expect(screen.getByText("Invitation unavailable")).toBeTruthy();
  });
});

describe("the owner's team card", () => {
  it("invites one person with the access the owner picks, then shows the seat as used", () => {
    api.seats = { included: 1, used: 0, members: [], invitations: [] };
    render(<TeamSeats />);
    fireEvent.change(screen.getByLabelText("Their name"), { target: { value: "Chidi Coordinator" } });
    fireEvent.change(screen.getByLabelText("Their email"), { target: { value: "chidi@example.com" } });
    fireEvent.click(screen.getByLabelText(/^Full\./));
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(api.calls.seatInvite).toEqual([{ fullName: "Chidi Coordinator", email: "chidi@example.com", access: "full" }]);
    expect(screen.getByRole("status").textContent).toContain("https://app.example.test/join/TOKEN");
    cleanup();
    api.seats = { included: 1, used: 1, members: [{ membershipId: 5, name: "Chidi Coordinator", email: "chidi@example.com", access: "full" }], invitations: [] };
    render(<TeamSeats />);
    expect(screen.queryByRole("button", { name: "Invite" })).toBeNull();
    fireEvent.change(screen.getByLabelText("What Chidi Coordinator can see"), { target: { value: "contributor" } });
    expect(api.calls.seatAccess).toEqual([{ membershipId: 5, access: "contributor" }]);
  });
});

describe("the staff panel", () => {
  it("lists staff with their roles, invites with one role and shows the link once when email is not set up", () => {
    api.team = [{ userId: 2, name: "Lewis Osako", email: "lewis@example.com", status: "active", roles: ["super_admin", "desk_lead"] }];
    api.staffInvitations = [{ id: 9, email: "pending@example.com", fullName: "Pending Person", role: "analyst", status: "pending", expiresAt: new Date("2026-10-16T12:00:00Z"), deliveryStatus: "Simulated", createdAt: new Date() }];
    render(<StaffPanel />);
    expect(screen.getByText("Lewis Osako").closest("tr")!.textContent).toContain("Desk");
    expect(within(screen.getByRole("list", { name: "Staff invitations" })).getByText(/Pending Person/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ola Analyst" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ola@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(api.calls.staffInvite).toEqual([{ fullName: "Ola Analyst", email: "ola@example.com", role: "analyst" }]);
    expect((screen.getByLabelText("Invitation link") as HTMLInputElement).value).toBe("https://app.example.test/join/TOKEN");
    expect(screen.getByRole("status").textContent).toContain("Email is not set up yet");
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(api.calls.staffRevoke).toEqual([{ invitationId: 9 }]);
  });
});
