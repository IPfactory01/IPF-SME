/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FAILED_TEXT } from "@/components/states";

/**
 * Every read in the admin console and the owner's seat card, with the connection down: each says it could not load and
 * offers Try again, and none shows an empty list or disappears (R69). A stand-in for the whole API in which every read
 * fails and every write does nothing.
 */
const api = vi.hoisted(() => {
  const state = { retries: 0 };
  const failing = () => ({ data: undefined, error: new Error("Failed to fetch"), isLoading: false, isFetching: false, refetch: () => { state.retries += 1; } });
  const mutation = () => ({ mutate: () => undefined, mutateAsync: async () => undefined, isPending: false });
  const node = (): unknown => new Proxy(() => undefined, {
    get: (_target, key) => (key === "useQuery" ? failing : key === "useMutation" ? mutation : key === "useUtils" ? () => node() : node()),
    apply: () => undefined,
  });
  return { state, trpc: node() };
});
vi.mock("@/lib/trpc", () => ({ trpc: api.trpc }));
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));

const views: [string, () => Promise<React.ReactElement>][] = [
  ["Finance", async () => { const { default: View } = await import("@/components/admin/FinanceView"); return <View />; }],
  ["Clients", async () => { const { default: View } = await import("@/components/admin/ClientsView"); return <View />; }],
  ["Business Health Checks", async () => { const { default: View } = await import("@/components/admin/BusinessChecksView"); return <View onOpenSection={() => undefined} />; }],
  ["Discovery Calls", async () => { const { default: View } = await import("@/components/admin/DiscoveryCallsView"); return <View onOpenSection={() => undefined} />; }],
  ["Client Onboarding", async () => { const { default: View } = await import("@/components/ClientOnboardingPanel"); return <View />; }],
  ["A Business Health Check record", async () => { const { default: View } = await import("@/components/admin/BusinessCheckDetail"); return <View businessCheckId={7} onOpenSection={() => undefined} onClose={() => undefined} />; }],
  ["Staff invitations", async () => { const { default: View } = await import("@/components/admin/StaffPanel"); return <View />; }],
  ["System status", async () => { const { default: View } = await import("@/components/admin/SystemStatus"); return <View />; }],
  ["The owner's seat card", async () => { const { default: View } = await import("@/components/TeamSeats"); return <View />; }],
];

beforeEach(() => { api.state.retries = 0; });
afterEach(cleanup);

describe("every admin read on a dropped connection (R69)", () => {
  it.each(views)("%s says it could not load and offers Try again", async (_name, view) => {
    render(await view());
    expect(screen.getAllByRole("alert").some((alert) => alert.textContent?.includes(FAILED_TEXT))).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0]!);
    expect(api.state.retries).toBeGreaterThan(0);
  });
});
