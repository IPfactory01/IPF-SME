/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const api = vi.hoisted(() => ({
  page: undefined as unknown,
  pageError: undefined as { message: string; data?: { code: string; httpStatus: number } } | undefined,
  refetched: 0,
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
      page: { useQuery: (input: unknown) => { api.pageInputs.push(input); return { data: api.page, isLoading: false, error: api.pageError, refetch: () => { api.refetched += 1; } }; } },
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
  api.refetched = 0;
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

  it("tells a first-time payer who receives the money, the reference once there is one, the receipt, and offers the office on WhatsApp (R72)", () => {
    api.page = { ...(api.page as object), reference: "TS-R-000004" };
    const { unmount } = renderPage();
    const before = within(screen.getByRole("region", { name: "Before you pay" }));
    expect(before.getByText(/Enzo Krypton & Co\., the firm behind IP Factory, through Paystack/)).toBeTruthy();
    expect(before.getByText("TS-R-000004")).toBeTruthy();
    expect(screen.getAllByText("Full Report")).toHaveLength(1);
    const office = before.getByRole("link", { name: "Questions first? WhatsApp IP Factory" });
    expect(decodeURIComponent(office.getAttribute("href")!)).toBe("https://wa.me/2348101603638?text=Hello, I have a question before I pay TS-R-000004: Full Report.");
    expect(payButton()!.className).toMatch(/bg-gradient-to-r from-brand-plum to-highlight-ink/);
    unmount();
    // Before the owner asks for it there is no reference yet: the row is left out, not shown empty.
    api.page = { ...(api.page as object), reference: null };
    renderPage();
    expect(within(screen.getByRole("region", { name: "Before you pay" })).queryByText("Reference")).toBeNull();
  });

  it("offers the Terms & Conditions and Privacy Policy before the button that opens Paystack", () => {
    renderPage();
    expect(screen.getByText(/By proceeding with payment, you agree to the/).textContent).toBe("By proceeding with payment, you agree to the Terms & Conditions and acknowledge the Privacy Policy.");
    expect(screen.getAllByRole("link", { name: "Terms & Conditions" })[0].getAttribute("href")).toBe("/terms");
    expect(screen.getAllByRole("link", { name: "Privacy Policy" })[0].getAttribute("href")).toBe("/privacy");
    expect(api.startCalls).toEqual([]);
  });

  it("asks the server to open Paystack, then sends the owner there and remembers the page for the return", () => {
    renderPage();
    fireEvent.click(payButton()!);
    expect(api.startCalls).toEqual([{ token: TOKEN, item: "full_report" }]);
    expect(api.opened).toEqual(["https://checkout.paystack.com/fixture"]);
    expect(api.remembered).toEqual([`/pay/${TOKEN}/full_report`]);
    expect(screen.getByRole("button", { name: /Opening Paystack/ })).toBeTruthy();
  });

  it("shows no banner in live mode, and the Business Review at its own price", () => {
    api.page = { item: "current_state", name: "Business Review", amountNaira: 500_000, mode: "live", state: "open" };
    renderPage("current_state");
    expect(screen.queryByRole("note", { name: "Test mode" })).toBeNull();
    expect(payButton()!.textContent).toBe("Pay ₦500,000 securely with Paystack");
    expect(screen.getByRole("region", { name: "After you pay" }).textContent).toContain("Your Business Review is booked.");
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
    // The server refused (not found): the link is wrong.
    api.pageError = { message: "We could not find this payment. Use the link in your payment email.", data: { code: "NOT_FOUND", httpStatus: 404 } };
    renderPage();
    expect(screen.getByRole("heading", { name: "This link is not valid" })).toBeTruthy();
    expect(screen.getByText("We could not find this payment. Use the link in your payment email.")).toBeTruthy();
    cleanup();
    renderPage("the_fix");
    expect(screen.getByRole("heading", { name: "This link is not valid" })).toBeTruthy();
  });

  it("does not call the link invalid when the connection fails: it offers Try again (R69)", () => {
    api.page = undefined;
    api.pageError = { message: "Failed to fetch" };
    renderPage();
    expect(screen.getByRole("heading", { name: "We could not open your payment" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "This link is not valid" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(api.refetched).toBe(1);
  });
});
