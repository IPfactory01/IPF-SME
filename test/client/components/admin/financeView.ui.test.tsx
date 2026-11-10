/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Finance with the payments ledger (batch F; App flow 3.1 and 4.7): what is paid and left on each fee, payments that need
 * a look first; for Finance and the Super Admin only, Record a payment, Cancel, Accept and refunds; for a Partner or the
 * Super Admin, Write off and its reversal; and (F4) Money in, from the ledger, with test payments apart, each payment
 * opening to its fee, narrowed to reconcile Paystack and downloaded as a spreadsheet. A stand-in API records each call.
 */
const api = vi.hoisted(() => ({ data: undefined as unknown, calls: {} as Record<string, unknown[]> }));
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
const saved = vi.hoisted(() => ({ files: [] as Array<{ name: string; text: string }> }));
vi.mock("@/lib/csv", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/csv")>()), saveCsv: (name: string, text: string) => void saved.files.push({ name, text }) }));
vi.mock("@/lib/trpc", () => {
  const mutation = (name: string) => (options?: { onSuccess?: (value: never) => void }) => ({
    isPending: false,
    mutate: (input: unknown) => { (api.calls[name] ??= []).push(input); options?.onSuccess?.({ success: true, receipt: "TS-RC-000009", left: 0, opened: false, writtenOff: 270_000 } as never); },
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
          recordRefund: { useMutation: mutation("recordRefund") },
          cancelRefund: { useMutation: mutation("cancelRefund") },
          writeOff: { useMutation: mutation("writeOff") },
          reverseWriteOff: { useMutation: mutation("reverseWriteOff") },
        },
      },
    },
  };
});

const { default: FinanceView } = await import("@/components/admin/FinanceView");

const payment = (over: Record<string, unknown>) => ({
  id: 1, status: "paid", method: "bank_transfer", methodLabel: "Bank transfer", amount: 200_000, refunded: 0, receipt: "TS-RC-000004", receivedOn: "2026-11-10", paidAt: new Date(),
  paystackReference: null, mode: null, note: "Transfer 5521", recordedBy: "Fola Finance", cancelledAt: null, cancelReason: null, cancelledBy: null, canCancel: true,
  refundable: 200_000, refunds: [] as unknown[], ...over,
});
const fee = (over: Record<string, unknown>) => ({
  id: 11, engagementId: 4, label: "Month 1 service fee, payable on starting", amount: 470_000, dueOn: "2026-11-09", paid: false, paidAt: null, paidAmount: 200_000, left: 270_000,
  reference: "TS-F-000011", client: "Crown Studio", engagement: "Digital Marketing", late: true, payments: [payment({})], writtenOff: null as unknown, ...over,
});
const looked = payment({ id: 7, status: "needs_a_look", method: "paystack", methodLabel: "Paystack", amount: 1_000, receipt: null, note: "The amount does not match: ₦1,000 paid, ₦470,000 expected.", recordedBy: null, canCancel: false, paystackReference: "TS-F-000012-1a2b3c4d" });
/** A row of Money in: one payment from the ledger and what it is for. */
const money = (over: Record<string, unknown>) => ({
  key: "payment-1", paymentId: 1, feeLineId: 11 as number | null, paymentRequestId: null as number | null, client: "Crown Studio", engagement: "Digital Marketing" as string | null,
  label: "Month 1 service fee, payable on starting", receivedOn: "2026-11-10", receipt: "TS-RC-000004" as string | null, status: "paid", method: "bank_transfer", methodLabel: "Bank transfer",
  test: false, amount: 200_000, refunded: 0, paystackReference: null as string | null, note: "Transfer 5521" as string | null, recordedBy: "Fola Finance" as string | null, beforeLedger: false, ...over,
});
const moneyIn = () => [
  money({}),
  money({ key: "payment-8", paymentId: 8, receivedOn: "2026-11-10", receipt: "TS-RC-000005", method: "paystack", methodLabel: "Paystack", test: true, amount: 270_000, paystackReference: "TS-F-000011-9f8e7d6c", note: null, recordedBy: null }),
  money({ key: "payment-9", paymentId: 9, receivedOn: "2026-11-02", receipt: "TS-RC-000003", method: "paystack", methodLabel: "Paystack", amount: 100_000, refunded: 30_000, paystackReference: "TS-F-000011-1111aaaa", note: null, recordedBy: null }),
  money({ key: "payment-3", paymentId: 3, feeLineId: null, paymentRequestId: 5, client: "=HYPERLINK(\"https://example.com\")", engagement: null, label: "Business Review", receivedOn: "2026-10-28", receipt: "TS-RC-000002", method: "paystack", methodLabel: "Paystack", amount: 250_000, paystackReference: "TS-BR-000005-0a1b2c3d", note: null, recordedBy: null }),
];
const request = { id: 5, item: "current_state", amount: 250_000, status: "confirmed", reference: "TS-BR-000005", requestedAt: new Date("2026-10-27T10:00:00Z"), confirmedAt: new Date("2026-10-28T10:00:00Z"), fullName: "Ada Obi", businessName: "Ada Foods", title: "Business Review", client: "Ada Foods", paid: true, receipt: "TS-RC-000002" };
const finance = (record: boolean, writeOff = false) => ({
  requests: [request],
  fees: [fee({}), fee({ id: 12, label: "Month 2 service fee, payable before day 31", paidAmount: 0, left: 470_000, late: false, dueOn: "2026-12-09", payments: [looked] })],
  needsALook: [{ ...looked, feeLineId: 12, label: "Month 2 service fee, payable before day 31", client: "Crown Studio", engagement: "Digital Marketing", left: 470_000 }],
  moneyIn: moneyIn(),
  totals: { paid: 520_000, refunded: 30_000, owed: 740_000, owedOnRequests: 0, late: 270_000, writtenOff: 0, test: { paid: 270_000, count: 1 } },
  can: { record, writeOff },
});

beforeEach(() => { api.calls = {}; saved.files = []; });
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

  it("lets Finance record a refund against a payment and cancel one recorded by mistake", () => {
    api.data = finance(true);
    const data = api.data as ReturnType<typeof finance>;
    data.fees[0]!.payments = [payment({ refunds: [{ id: 5, amount: 50_000, refundedOn: "2026-11-10", reason: "Paid twice", reference: "RF-881", recordedBy: "Fola Finance", cancelledAt: null, cancelReason: null, cancelledBy: null }], refundable: 150_000 })];
    render(<FinanceView />);
    const fees = within(screen.getByRole("region", { name: "Engagement fees" }));
    fireEvent.click(fees.getByRole("button", { name: "Payments (1)" }));
    const refunds = within(fees.getByRole("list", { name: "Refunds" }));
    expect(refunds.getByText(/Refund · .* · RF-881/)).toBeTruthy();
    fireEvent.click(refunds.getByRole("button", { name: "Cancel" }));
    fireEvent.change(fees.getByLabelText("Why is the refund cancelled?"), { target: { value: "Recorded twice" } });
    fireEvent.click(fees.getByRole("button", { name: "Cancel the refund" }));
    expect(api.calls.cancelRefund).toEqual([{ refundId: 5, reason: "Recorded twice" }]);

    fireEvent.click(fees.getByRole("button", { name: "Record a refund" }));
    const form = within(screen.getByRole("form", { name: "Record a refund of TS-RC-000004" }));
    expect((form.getByLabelText("Amount refunded") as HTMLInputElement).value).toBe("150000");
    fireEvent.change(form.getByLabelText("Amount refunded"), { target: { value: "20000" } });
    expect(form.getByRole("button", { name: "Record the refund of ₦20,000" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(form.getByLabelText("Why it was refunded"), { target: { value: "Overpaid" } });
    fireEvent.click(form.getByRole("button", { name: "Record the refund of ₦20,000" }));
    expect(api.calls.recordRefund).toEqual([{ paymentId: 1, amount: 20_000, refundedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), reason: "Overpaid", reference: null }]);
  });

  it("offers Write off only to those who may (a Partner or the Super Admin), with a note, and its reversal", () => {
    api.data = finance(true, false);
    const { unmount } = render(<FinanceView />);
    expect(screen.queryByRole("button", { name: "Write off" })).toBeNull();
    unmount();

    api.data = finance(false, true);
    render(<FinanceView />);
    const fees = within(screen.getByRole("region", { name: "Engagement fees" }));
    fireEvent.click(fees.getAllByRole("button", { name: "Write off" })[0]!);
    const form = within(screen.getByRole("form", { name: "Write off Month 1 service fee, payable on starting" }));
    expect(form.getByRole("button", { name: "Write off ₦270,000" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(form.getByLabelText("Why it is written off"), { target: { value: "Agreed with the client" } });
    fireEvent.click(form.getByRole("button", { name: "Write off ₦270,000" }));
    expect(api.calls.writeOff).toEqual([{ feeLineId: 11, note: "Agreed with the client" }]);
    cleanup();

    // A written-off fee says so in Finance (the client never sees the word), and a Partner can reverse it.
    const data = finance(false, true);
    data.fees[0] = fee({ paid: true, left: 0, late: false, writtenOff: { amount: 270_000, at: new Date("2026-11-10T10:00:00Z"), by: "Pat Partner", note: "Agreed with the client" } });
    api.data = data;
    render(<FinanceView />);
    fireEvent.click(screen.getByRole("button", { name: "Everything" }));
    const all = within(screen.getByRole("region", { name: "Engagement fees" }));
    expect(all.getByText("Written off ₦270,000")).toBeTruthy();
    fireEvent.click(all.getByRole("button", { name: "The write-off" }));
    expect(all.getByText(/Written off: ₦270,000, .*, by Pat Partner\. Agreed with the client/)).toBeTruthy();
    fireEvent.click(all.getByRole("button", { name: "Reverse the write-off" }));
    fireEvent.change(all.getByLabelText("Why is the write-off reversed?"), { target: { value: "The client will pay" } });
    fireEvent.click(all.getByRole("button", { name: "Reverse the write-off" }));
    expect(api.calls.reverseWriteOff).toEqual([{ feeLineId: 11, reason: "The client will pay" }]);
  });
});

describe("Money in, from one source (F4)", () => {
  it("shows real money in, less refunds, with test payments apart, and what is owed with where it sits", () => {
    api.data = { ...finance(false), totals: { ...finance(false).totals, owedOnRequests: 250_000, writtenOff: 120_000 } };
    render(<FinanceView />);
    const totals = within(screen.getByRole("group", { name: "Totals" }));
    expect(totals.getByText("₦520,000")).toBeTruthy();
    expect(totals.getByText("₦550,000 received, ₦30,000 refunded")).toBeTruthy();
    expect(totals.getByText("₦250,000 of it on payment requests · ₦120,000 written off")).toBeTruthy();
    expect(screen.getByText("Test payments are kept apart: 1 payment, ₦270,000. No real money moved, so they are not in Paid.")).toBeTruthy();
    // The fees and payment requests come first; a paid request shows its receipt number.
    expect(screen.getByRole("tab", { name: "Fees and requests" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Everything" }));
    expect(within(screen.getByRole("region", { name: "Payment requests" })).getByText(/^Paid .* · TS-RC-000002$/)).toBeTruthy();
  });

  it("lists every payment newest first, keeps test payments apart, and narrows by how it came, month and reference", () => {
    api.data = finance(false);
    render(<FinanceView />);
    fireEvent.click(screen.getByRole("tab", { name: "Money in 3" }));
    const list = within(screen.getByRole("region", { name: "Money in" }));
    const references = () => list.getAllByRole("row").slice(1).map(row => row.querySelectorAll("td")[5]?.textContent ?? "");
    expect(references()).toEqual(["Transfer 5521Recorded by Fola Finance", "TS-F-000011-1111aaaa", "TS-BR-000005-0a1b2c3d"]);
    expect(list.getByText("3 payments: ₦550,000 received, ₦30,000 refunded, ₦520,000 in.")).toBeTruthy();
    expect(list.getByText("₦30,000 refunded")).toBeTruthy();
    expect(list.queryByText("TS-F-000011-9f8e7d6c")).toBeNull();

    fireEvent.change(list.getByLabelText("How it came"), { target: { value: "paystack" } });
    expect(references()).toEqual(["TS-F-000011-1111aaaa", "TS-BR-000005-0a1b2c3d"]);
    fireEvent.change(list.getByLabelText("Month"), { target: { value: "2026-10" } });
    expect(references()).toEqual(["TS-BR-000005-0a1b2c3d"]);
    expect(list.getByText("1 payment: ₦250,000 in.")).toBeTruthy();
    fireEvent.change(list.getByLabelText("Month"), { target: { value: "" } });
    fireEvent.change(list.getByLabelText("Find"), { target: { value: "1111AAAA" } });
    expect(references()).toEqual(["TS-F-000011-1111aaaa"]);
    fireEvent.change(list.getByLabelText("Find"), { target: { value: "TS-RC-000002" } });
    expect(references()).toEqual(["TS-BR-000005-0a1b2c3d"]);

    // Test payments are a list of their own, and never mixed with real money.
    fireEvent.change(list.getByLabelText("Find"), { target: { value: "" } });
    fireEvent.change(list.getByLabelText("How it came"), { target: { value: "" } });
    fireEvent.click(list.getByRole("button", { name: "Test payments (1)" }));
    expect(references()).toEqual(["TS-F-000011-9f8e7d6c"]);
    expect(list.getByText("Paystack test")).toBeTruthy();
    expect(list.getByText("1 test payment: ₦270,000. No real money moved.")).toBeTruthy();
  });

  it("opens each payment's fee, or its payment request, in the fees view", () => {
    api.data = finance(false);
    render(<FinanceView />);
    fireEvent.click(screen.getByRole("tab", { name: "Money in 3" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Money in" })).getAllByRole("button", { name: "Digital Marketing · Month 1 service fee, payable on starting" })[0]!);
    expect(screen.getByRole("tab", { name: "Fees and requests" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Everything" }).getAttribute("aria-pressed")).toBe("true");
    const fees = within(screen.getByRole("region", { name: "Engagement fees" }));
    expect(fees.getByRole("button", { name: "Hide payments" })).toBeTruthy();
    expect(fees.getByText(/TS-RC-000004 · .* · Bank transfer/)).toBeTruthy();
    expect(document.getElementById("fee-11")!.className).toContain("bg-brand-tint");

    fireEvent.click(screen.getByRole("tab", { name: "Money in 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Business Review (payment request)" }));
    expect(document.getElementById("request-5")!.className).toContain("bg-brand-tint");
    expect(document.getElementById("fee-11")!.className).not.toContain("bg-brand-tint");
  });

  it("downloads what is shown as a spreadsheet, with a typed name never run as a formula", () => {
    api.data = finance(false);
    render(<FinanceView />);
    fireEvent.click(screen.getByRole("tab", { name: "Money in 3" }));
    const list = within(screen.getByRole("region", { name: "Money in" }));
    fireEvent.change(list.getByLabelText("How it came"), { target: { value: "paystack" } });
    fireEvent.click(list.getByRole("button", { name: "Download CSV" }));
    expect(saved.files).toHaveLength(1);
    const [file] = saved.files;
    expect(file!.name).toBe("money-in-all.csv");
    const lines = file!.text.replace(/^\uFEFF/, "").trim().split("\r\n");
    expect(lines[0]).toBe('"Received","Receipt","Client","Engagement","For","How","Mode","Paystack reference","Note","Recorded by","Amount (NGN)","Refunded (NGN)","Net (NGN)","Status"');
    expect(lines.slice(1)).toEqual([
      '"2026-11-02","TS-RC-000003","Crown Studio","Digital Marketing","Month 1 service fee, payable on starting","Paystack","Live","TS-F-000011-1111aaaa",,,100000,30000,70000,"Part refunded"',
      '"2026-10-28","TS-RC-000002","\'=HYPERLINK(""https://example.com"")",,"Business Review (payment request)","Paystack","Live","TS-BR-000005-0a1b2c3d",,,250000,0,250000,"Paid"',
    ]);
    // Nothing to download, nothing offered.
    fireEvent.change(list.getByLabelText("Find"), { target: { value: "no such reference" } });
    expect(list.getByText("No payments here.")).toBeTruthy();
    expect(list.getByRole("button", { name: "Download CSV" }).hasAttribute("disabled")).toBe(true);
  });
});
