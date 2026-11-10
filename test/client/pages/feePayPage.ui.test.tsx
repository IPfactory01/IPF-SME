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
      feePage: { useQuery: (input: unknown, options: { enabled: boolean }) => { if (options.enabled) api.pageInputs.push(input); return { data: options.enabled ? api.page : undefined, isLoading: false, error: api.pageError, refetch: () => { api.refetched += 1; } }; } },
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
  api.refetched = 0;
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
    // The reference sits with what the payer checks before paying (R72).
    expect(within(screen.getByRole("region", { name: "Before you pay" })).getByText("TS-F-000012")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pay ₦470,000 securely with Paystack" }));
    expect(api.startCalls).toEqual([{ feeLineId: 12, token: TOKEN }]);
    expect(api.opened).toEqual(["https://checkout.paystack.com/fixture"]);
    expect(api.remembered).toEqual([`/pay/fee/12/${TOKEN}`]);
  });

  it("tells a first-time payer, before Pay, who receives the money, the reference and the receipt, each said once (R72)", () => {
    renderPage();
    const before = within(screen.getByRole("region", { name: "Before you pay" }));
    expect(before.getByText(/Enzo Krypton & Co\., the firm behind IP Factory, through Paystack/)).toBeTruthy();
    // The name on the Paystack account, which a statement printing the full name also matches.
    expect(before.getByText(/Look for/).textContent).toContain("Look for Enzo on Paystack's page and on your bank statement.");
    expect(before.getByText("Enzo").tagName).toBe("SPAN");
    expect(before.getByText("By email, as soon as Paystack confirms your payment.")).toBeTruthy();
    // What it is for is the heading above the box; neither it nor the receipt is said a second time.
    expect(screen.getAllByText("Month 2 service fee, payable before day 31")).toHaveLength(1);
    expect(screen.getByText(/You go to Paystack's secure page/).textContent).not.toMatch(/receipt/i);
    // It comes before the button, and the button is the page's one gradient action, with 8 px corners.
    const button = screen.getByRole("button", { name: "Pay ₦470,000 securely with Paystack" });
    expect(screen.getByRole("region", { name: "Before you pay" }).compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.className).toMatch(/bg-gradient-to-r from-brand-plum to-highlight-ink/);
    expect(button.className).toContain("rounded-lg");
    expect(button.className).not.toContain("rounded-none");
  });

  it("offers the engagement's main contact on WhatsApp when they agreed to show their number, else the office (R72)", () => {
    api.page = { ...(api.page as object), contact: { name: "Lewis Lead", whatsapp: "+2348030000001" } };
    const { unmount } = renderPage();
    const lead = screen.getByRole("link", { name: "Questions first? WhatsApp Lewis" });
    expect(lead.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/2348030000001\?text=/);
    expect(decodeURIComponent(lead.getAttribute("href")!.split("text=")[1]!)).toBe("Hello Lewis, I have a question before I pay TS-F-000012: Month 2 service fee, payable before day 31.");
    expect(lead.getAttribute("target")).toBe("_blank");
    unmount();
    api.page = { ...(api.page as object), contact: null };
    renderPage();
    expect(screen.getByRole("link", { name: "Questions first? WhatsApp IP Factory" }).getAttribute("href")).toMatch(/^https:\/\/wa\.me\/2348101603638\?text=/);
  });

  it("says when it is already paid, with no button", () => {
    api.page = { ...(api.page as object), state: "paid" };
    renderPage();
    expect(screen.getByRole("heading", { name: "Already paid" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers Try again when the connection fails, and calls the link invalid only when the server refuses it (R69)", () => {
    api.page = undefined;
    api.pageError = { message: "Failed to fetch" };
    renderPage();
    expect(screen.getByRole("heading", { name: "We could not open your payment" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(api.refetched).toBe(1);
    cleanup();
    api.pageError = { message: "This payment link is not valid.", data: { code: "NOT_FOUND", httpStatus: 404 } };
    renderPage();
    expect(screen.getByRole("heading", { name: "This link is not valid" })).toBeTruthy();
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

describe("a fee paid in part (the ledger, batch F)", () => {
  it("asks only for what is left, and says how much of the fee is paid already", () => {
    api.page = { ...(api.page as Record<string, unknown>), amountNaira: 270_000, totalNaira: 470_000, paidNaira: 200_000 };
    renderPage();
    expect(screen.getByText("₦270,000")).toBeTruthy();
    expect(screen.getByText("₦200,000 of ₦470,000 is paid already. This is what is left.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pay ₦270,000 securely with Paystack/ })).toBeTruthy();
  });
});

describe("a fee closed without payment (F2)", () => {
  it("says there is nothing more to pay, never the team's word for it", () => {
    api.page = { ...(api.page as Record<string, unknown>), state: "paid", writtenOff: true };
    renderPage();
    expect(screen.getByRole("heading", { name: "Nothing more to pay" })).toBeTruthy();
    expect(screen.getByText("There is nothing more to pay on Month 2 service fee, payable before day 31 for the Digital marketing.")).toBeTruthy();
    expect(screen.queryByText(/written off/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Pay/ })).toBeNull();
  });
});
