/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const api = vi.hoisted(() => ({
  results: [] as Array<{ status: string; item: string; mode: string } | { error: string }>,
  calls: [] as unknown[],
  remembered: null as string | null,
}));

vi.mock("@/lib/payOnline", () => ({ rememberedPayPage: () => api.remembered }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    onlinePayment: {
      status: {
        useMutation: (options: { onSuccess?: (value: unknown) => void; onError?: (error: { message: string }) => void }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            api.calls.push(input);
            const next = api.results.shift();
            if (next && "error" in next) options.onError?.({ message: next.error });
            else if (next) options.onSuccess?.(next);
          },
        }),
      },
    },
  },
}));

import PayReturnPage from "@/pages/PayReturnPage";

const renderPage = (search = "reference=TS-R-000012-1a2b3c4d&trxref=TS-R-000012-1a2b3c4d") => {
  const { hook, searchHook } = memoryLocation({ path: `/pay/return${search ? `?${search}` : ""}` });
  return render(<Router hook={hook} searchHook={searchHook}><Route path="/pay/return" component={PayReturnPage} /></Router>);
};

beforeEach(() => {
  api.results = [];
  api.calls = [];
  api.remembered = null;
});
afterEach(cleanup);

describe("the return page after Paystack", () => {
  it("asks the server about the reference Paystack returned, and shows a paid Full Report with what happens next", () => {
    api.results = [{ status: "paid", item: "full_report", mode: "live" }];
    renderPage();
    expect(api.calls).toEqual([{ reference: "TS-R-000012-1a2b3c4d" }]);
    expect(screen.getByRole("heading", { name: "Payment received" })).toBeTruthy();
    expect(screen.getByText(/Thank you. Your Full Report is paid./)).toBeTruthy();
    const next = screen.getByRole("list", { name: "What happens next" }).textContent;
    expect(next).toContain("We email you a link to the Report Intake");
    expect(next).toContain("emailed to you the moment you finish");
    expect(screen.queryByRole("note", { name: "Test mode" })).toBeNull();
  });

  it("shows the Current State Assessment starting and the account invitation, with the test-mode banner", () => {
    api.results = [{ status: "paid", item: "current_state", mode: "test" }];
    renderPage();
    expect(screen.getByText(/Your Current State Assessment is paid, and it starts now./)).toBeTruthy();
    const next = screen.getByRole("list", { name: "What happens next" }).textContent;
    expect(next).toContain("Three working days to get set up, then we start.");
    expect(next).toContain("We email you a link to set up your client account on Advisory as a Service.");
    expect(screen.getByRole("note", { name: "Test mode" }).textContent).toContain("TEST MODE: NO REAL MONEY MOVES");
  });

  it("says it is still confirming, and checks again on request", () => {
    api.results = [{ status: "pending", item: "full_report", mode: "test" }, { status: "paid", item: "full_report", mode: "test" }];
    renderPage();
    expect(screen.getByRole("heading", { name: "Still confirming" })).toBeTruthy();
    expect(screen.getByText(/Please do not pay again./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(api.calls).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Payment received" })).toBeTruthy();
  });

  it("says the payment was not completed, with a link back to the pay page this tab came from", () => {
    api.results = [{ status: "failed", item: "full_report", mode: "live" }];
    api.remembered = "/pay/CHECKTOKEN1234567890abcdef/full_report";
    renderPage();
    expect(screen.getByRole("heading", { name: "Payment not completed" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Try again" }).getAttribute("href")).toBe("/pay/CHECKTOKEN1234567890abcdef/full_report");
    expect(document.body.textContent).not.toMatch(/bank transfer, using the details|proof of payment/i);
  });

  it("points to the payment email when it does not know the pay page", () => {
    api.results = [{ status: "failed", item: "full_report", mode: "live" }];
    renderPage();
    expect(screen.queryByRole("link", { name: "Try again" })).toBeNull();
    expect(screen.getByText("Use the Pay online button in your payment email to try again.")).toBeTruthy();
  });

  it("reads Paystack's trxref when there is no reference, and asks nothing without either", () => {
    api.results = [{ status: "paid", item: "full_report", mode: "live" }];
    renderPage("trxref=TS-R-000012-5e6f7a8b");
    expect(api.calls).toEqual([{ reference: "TS-R-000012-5e6f7a8b" }]);
    cleanup();
    api.calls = [];
    renderPage("");
    expect(api.calls).toEqual([]);
    expect(screen.getByRole("heading", { name: "We could not find your payment" })).toBeTruthy();
  });

  it("shows the server's message for a reference that is not one of ours", () => {
    api.results = [{ error: "We could not find this payment. Use the link in your payment email." }];
    renderPage("reference=nonsense");
    expect(screen.getByRole("heading", { name: "We could not find your payment" })).toBeTruthy();
    expect(screen.getByText("We could not find this payment. Use the link in your payment email.")).toBeTruthy();
  });
});
