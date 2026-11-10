/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Finance with the payments ledger (batch F; App flow 3.1): what is paid and left on each fee, payments that need a look
 * first, and, for Finance and the Super Admin only, Record a payment, Cancel and Accept. A stand-in API records each call.
 */
const api = vi.hoisted(() => ({ data: undefined as unknown, calls: {} as Record<string, unknown[]> }));
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("@/lib/trpc", () => {
  const mutation = (name: string) => (options?: { onSuccess?: (value: never) => void }) => ({
    isPending: false,
    mutate: (input: unknown) => { (api.calls[name] ??= []).push(input); options?.onSuccess?.({ success: true, receipt: "TS-RC-000009", left: 0, opened: false } as never); },
  });
  return {
    trpc: {
      useUtils: () => ({ engagement: { finance: { list: { invalidate: () => undefined } }, staff: { fees: { invalidate: () => undefined } } } }),
      engagement: {
        finance: {
          list: { useQuery: () => ({ data: api.data, isLoading: false, error: null, isFetching: false, refetch: () => undefined, dataUpdatedAt: Date.now() }) },
          recordPayment: { useMutation: mutation("recordPayment") },
          cancelPayment: { useMutation: mutation("cancelPayment") },
          acceptPayment: { useMutation: mutation("acceptPayment") },
        },
      },
    },
  };
});

const { default: FinanceView } = await import("@/components/admin/FinanceView");

const payment = (over: Record<string, unknown>) => ({
  id: 1, status: "paid", method: "bank_transfer", methodLabel: "Bank transfer", amount: 200_000, refunded: 0, receipt: "TS-RC-000004", receivedOn: "2026-11-10", paidAt: new Date(),
  paystackReference: null, mode: null, note: "Transfer 5521", recordedBy: "Fola Finance", cancelledAt: null, cancelReason: null, cancelledBy: null, canCancel: true, ...over,
});
const fee = (over: Record<string, unknown>) => ({
  id: 11, engagementId: 4, label: "Month 1 service fee, payable on starting", amount: 470_000, dueOn: "2026-11-09", paid: false, paidAt: null, paidAmount: 200_000, left: 270_000,
  reference: "TS-F-000011", client: "Crown Studio", engagement: "Digital Marketing", late: true, payments: [payment({})], ...over,
});
const looked = payment({ id: 7, status: "needs_a_look", method: "paystack", methodLabel: "Paystack", amount: 1_000, receipt: null, note: "The amount does not match: ₦1,000 paid, ₦470,000 expected.", recordedBy: null, canCancel: false, paystackReference: "TS-F-000012-1a2b3c4d" });
const finance = (record: boolean) => ({
  requests: [],
  fees: [fee({}), fee({ id: 12, label: "Month 2 service fee, payable before day 31", paidAmount: 0, left: 470_000, late: false, dueOn: "2026-12-09", payments: [looked] })],
  needsALook: [{ ...looked, feeLineId: 12, label: "Month 2 service fee, payable before day 31", client: "Crown Studio", engagement: "Digital Marketing", left: 470_000 }],
  totals: { paid: 200_000, owed: 740_000, late: 270_000 },
  can: { record },
});

beforeEach(() => { api.calls = {}; });
afterEach(cleanup);

describe("Finance with the payments ledger", () => {
  it("shows what is paid and left on each fee, and payments that need a look first", () => {
    api.data = finance(false);
    render(<FinanceView />);
    const look = within(screen.getByRole("region", { name: "Payments that need a look" }));
    expect(look.getByText("Crown Studio · Digital Marketing · Month 2 service fee, payable before day 31")).toBeTruthy();
    expect(look.getByText(/The amount does not match: ₦1,000 paid, ₦470,000 expected\. Paystack reference TS-F-000012-1a2b3c4d\./)).toBeTruthy();
    const fees = within(screen.getByRole("region", { name: "Engagement fees" }));
    expect(fees.getByText("Late: ₦200,000 paid, ₦270,000 left")).toBeTruthy();
    // Without manage_payments nobody is offered a way to record money, cancel or accept.
    expect(screen.queryByRole("button", { name: "Record a payment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    fireEvent.click(fees.getByRole("button", { name: "Payments (1)" }));
    expect(fees.getByText(/TS-RC-000004 · .* · Bank transfer/)).toBeTruthy();
    expect(fees.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(screen.getByText(/Money that came another way is recorded by Finance\./)).toBeTruthy();
  });

  it("lets Finance record a part payment, cancel one recorded by mistake with a reason, and accept one that needs a look", () => {
    api.data = finance(true);
    render(<FinanceView />);
    fireEvent.click(within(screen.getByRole("region", { name: "Payments that need a look" })).getByRole("button", { name: "Accept" }));
    expect(api.calls.acceptPayment).toEqual([{ paymentId: 7 }]);

    const fees = within(screen.getByRole("region", { name: "Engagement fees" }));
    fireEvent.click(fees.getAllByRole("button", { name: "Record a payment" })[0]!);
    const form = within(screen.getByRole("form", { name: "Record a payment for Month 1 service fee, payable on starting" }));
    expect((form.getByLabelText("Amount received") as HTMLInputElement).value).toBe("270000");
    fireEvent.change(form.getByLabelText("How it came"), { target: { value: "cash" } });
    fireEvent.change(form.getByLabelText("Reference or note"), { target: { value: "Cash at the office" } });
    fireEvent.click(form.getByRole("button", { name: "Record ₦270,000" }));
    expect(api.calls.recordPayment).toEqual([{ feeLineId: 11, amount: 270_000, receivedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), method: "cash", note: "Cash at the office" }]);

    fireEvent.click(fees.getByRole("button", { name: "Payments (1)" }));
    fireEvent.click(fees.getByRole("button", { name: "Cancel" }));
    const confirm = fees.getByRole("button", { name: "Cancel the payment" });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.change(fees.getByLabelText("Why is it cancelled?"), { target: { value: "Recorded against the wrong client" } });
    fireEvent.click(confirm);
    expect(api.calls.cancelPayment).toEqual([{ paymentId: 1, reason: "Recorded against the wrong client" }]);
  });
});
