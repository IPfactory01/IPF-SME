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
  startError: undefined as { message: string } | undefined,
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
      page: { useQuery: (input: unknown) => { api.pageInputs.push(input); return { data: api.page, isLoading: false, error: api.pageError }; } },
      start: {
        useMutation: (options: { onSuccess?: (value: unknown) => void; onError?: (error: { message: string }) => void }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            api.startCalls.push(input);
            if (api.startError) options.onError?.(api.startError);
            else options.onSuccess?.(api.startResult);
          },
        }),
      },
    },
  },
}));

import PayPage from "@/pages/PayPage";

const TOKEN = "CHECKTOKEN1234567890abcdef";
const renderPage = (item = "full_report") => {
  const { hook } = memoryLocation({ path: `/pay/${TOKEN}/${item}` });
  return render(<Router hook={hook}><Route path="/pay/:token/:item" component={PayPage} /></Router>);
};
const payButton = () => screen.queryByRole("button", { name: /securely with Paystack/ });

beforeEach(() => {
  api.page = { item: "full_report", name: "Full Report", amountNaira: 100_000, mode: "test", state: "open" };
  api.pageError = undefined;
  api.pageInputs = [];
  api.startCalls = [];
  api.startResult = { alreadyPaid: false, url: "https://checkout.paystack.com/fixture" };
  api.startError = undefined;
  api.opened = [];
  api.remembered = [];
});
afterEach(cleanup);

describe("the pay page", () => {
  it("shows the item and its amount in naira in full, with the test-mode banner", () => {
    renderPage();
    expect(api.pageInputs[0]).toEqual({ token: TOKEN, item: "full_report" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Full Report");
    expect(screen.getByText("₦100,000")).toBeTruthy();
    const banner = screen.getByRole("note", { name: "Test mode" });
    expect(banner.textContent).toContain("TEST MODE: NO REAL MONEY MOVES");
    expect(payButton()!.textContent).toBe("Pay ₦100,000 securely with Paystack");
    // Paystack is the only way to pay: its checkout takes card, bank transfer or USSD; there are no bank details here.
    expect(screen.getByText(/pay by card, bank transfer or USSD/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Pay by bank transfer" })).toBeNull();
    expect(document.body.textContent).not.toMatch(/proof of payment|bank details/i);
  });

  it("asks the server to open Paystack, then sends the owner there and remembers the page for the return", () => {
    renderPage();
    fireEvent.click(payButton()!);
    expect(api.startCalls).toEqual([{ token: TOKEN, item: "full_report" }]);
    expect(api.opened).toEqual(["https://checkout.paystack.com/fixture"]);
    expect(api.remembered).toEqual([`/pay/${TOKEN}/full_report`]);
    expect(screen.getByRole("button", { name: /Opening Paystack/ })).toBeTruthy();
  });

  it("shows no banner in live mode, and the Current State Assessment at its own price", () => {
    api.page = { item: "current_state", name: "Current State Assessment", amountNaira: 500_000, mode: "live", state: "open" };
    renderPage("current_state");
    expect(screen.queryByRole("note", { name: "Test mode" })).toBeNull();
    expect(payButton()!.textContent).toBe("Pay ₦500,000 securely with Paystack");
    expect(screen.getByRole("region", { name: "After you pay" }).textContent).toContain("Your Current State Assessment starts.");
  });

  it("says it is already paid, with no button", () => {
    api.page = { ...(api.page as object), state: "paid" };
    renderPage();
    expect(screen.getByRole("heading", { name: "Already paid" })).toBeTruthy();
    expect(screen.getByText("Your Full Report is paid. Thank you.")).toBeTruthy();
    expect(payButton()).toBeNull();
  });

  it("says it is already paid when the payment was confirmed while the page was open", () => {
    api.startResult = { alreadyPaid: true };
    renderPage();
    fireEvent.click(payButton()!);
    expect(screen.getByRole("heading", { name: "Already paid" })).toBeTruthy();
    expect(api.opened).toEqual([]);
  });

  it("offers no way to pay while Paystack is off, and no bank details either", () => {
    api.page = { ...(api.page as object), mode: "off" };
    renderPage();
    expect(payButton()).toBeNull();
    expect(screen.queryByRole("note", { name: "Test mode" })).toBeNull();
    expect(screen.getByText("Online payment is not open yet. Please try again later, or reply to your payment email and we will send you a link when it is.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/bank details|proof of payment/i);
  });

  it("offers nothing once the 48 hours have passed", () => {
    api.page = { ...(api.page as object), state: "expired" };
    renderPage();
    expect(payButton()).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("This payment link has passed its 48 hours. Reply to your payment email and we will send you a new one.");
  });

  it("lets an owner pay online on an old record that noted proof of a bank transfer", () => {
    api.page = { ...(api.page as object), state: "proof_received" };
    renderPage();
    expect(payButton()).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/proof/i);
  });

  it("shows the server's message when Paystack cannot be opened", () => {
    api.startError = { message: "We could not open Paystack just now. Please try again in a minute." };
    renderPage();
    fireEvent.click(payButton()!);
    expect(screen.getByRole("alert").textContent).toBe("We could not open Paystack just now. Please try again in a minute.");
    expect(api.opened).toEqual([]);
  });

  it("says the link is not valid for an unknown payment or an item that is not for sale", () => {
    api.page = undefined;
    api.pageError = { message: "We could not find this payment. Use the link in your payment email." };
    renderPage();
    expect(screen.getByRole("heading", { name: "This link is not valid" })).toBeTruthy();
    expect(screen.getByText("We could not find this payment. Use the link in your payment email.")).toBeTruthy();
    cleanup();
    renderPage("the_fix");
    expect(screen.getByRole("heading", { name: "This link is not valid" })).toBeTruthy();
  });
});
