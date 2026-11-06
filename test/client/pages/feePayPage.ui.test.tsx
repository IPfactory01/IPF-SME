/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const api = vi.hoisted(() => ({
  page: undefined as unknown,
  pageError: undefined as { message: string } | undefined,
  pageInputs: [] as unknown[],
  startCalls: [] as unknown[],
  startResult: { alreadyPaid: false, url: "https://checkout.paystack.com/fixture" } as unknown,
  opened: [] as string[],
  remembered: [] as string[],
}));

vi.mock("@/lib/payOnline", () => ({
  openCheckout: (url: string) => api.opened.push(url),
  rememberPayPage: (path: string) => api.remembered.push(path),
  rememberedPayPage: () => null,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    onlinePayment: {
      feePage: { useQuery: (input: unknown, options: { enabled: boolean }) => { if (options.enabled) api.pageInputs.push(input); return { data: options.enabled ? api.page : undefined, isLoading: false, error: api.pageError }; } },
      feeStart: {
        useMutation: (options: { onSuccess?: (value: unknown) => void }) => ({
          isPending: false,
          mutate: (input: unknown) => { api.startCalls.push(input); options.onSuccess?.(api.startResult); },
        }),
      },
    },
  },
}));

import FeePayPage from "@/pages/FeePayPage";

const TOKEN = "abcdefghijklmnopqrstuvwxyz012345";
const renderPage = (path = `/pay/fee/12/${TOKEN}`) => {
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}><Route path="/pay/fee/:feeLineId/:token" component={FeePayPage} /></Router>);
};

beforeEach(() => {
  api.page = { businessName: "Crown Studio", engagement: "Digital marketing", label: "Month 2 service fee, payable before day 31", amountNaira: 470_000, dueOn: "2026-12-09", reference: "TS-F-000012", mode: "live", state: "open" };
  api.pageError = undefined;
  api.pageInputs = [];
  api.startCalls = [];
  api.startResult = { alreadyPaid: false, url: "https://checkout.paystack.com/fixture" };
  api.opened = [];
  api.remembered = [];
});
afterEach(cleanup);

describe("paying an engagement fee", () => {
  it("shows the business, the engagement, the fee and its amount, then opens Paystack for that fee", () => {
    renderPage();
    expect(api.pageInputs[0]).toEqual({ feeLineId: 12, token: TOKEN });
    expect(screen.getByText("Payment · Crown Studio")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Digital marketing" })).toBeTruthy();
    expect(screen.getByText("₦470,000")).toBeTruthy();
    expect(screen.getByText("Reference TS-F-000012")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pay ₦470,000 securely with Paystack" }));
    expect(api.startCalls).toEqual([{ feeLineId: 12, token: TOKEN }]);
    expect(api.opened).toEqual(["https://checkout.paystack.com/fixture"]);
    expect(api.remembered).toEqual([`/pay/fee/12/${TOKEN}`]);
  });

  it("says when it is already paid, with no button", () => {
    api.page = { ...(api.page as object), state: "paid" };
    renderPage();
    expect(screen.getByRole("heading", { name: "Already paid" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("refuses a link that is not one of ours without asking the server", () => {
    renderPage("/pay/fee/abc/short");
    expect(screen.getByRole("heading", { name: "This link is not valid" })).toBeTruthy();
    expect(api.pageInputs).toEqual([]);
  });

  it("offers no payment while online payment is off", () => {
    api.page = { ...(api.page as object), mode: "off" };
    renderPage();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Online payment is not open yet/)).toBeTruthy();
  });
});
