import { describe, expect, it } from "vitest";
import { DOCUMENT_NUMBER_KINDS, feeBalance, invoiceNumberLabel, LEDGER_PAYMENT_STATUSES, receiptNumberLabel } from "@shared/ledger";

describe("the payments ledger's vocabulary", () => {
  it("shows receipt and invoice numbers with six digits, and more once they pass a million", () => {
    expect(receiptNumberLabel(1)).toBe("TS-RC-000001");
    expect(invoiceNumberLabel(42)).toBe("TS-IN-000042");
    expect(receiptNumberLabel(1_234_567)).toBe("TS-RC-1234567");
  });

  it("keeps a cancelled payment as a status, so nothing about money is deleted", () => {
    expect(LEDGER_PAYMENT_STATUSES).toEqual(["started", "paid", "failed", "needs_a_look", "refunded", "cancelled"]);
    expect(DOCUMENT_NUMBER_KINDS).toEqual(["receipt", "invoice"]);
  });
});

describe("a fee's balance", () => {
  const fee = { amount: 470_000, paidAt: null, writtenOffAmount: null };
  it("counts paid payments less their refunds, and never a cancelled, failed or unchecked one", () => {
    expect(feeBalance(fee, [])).toEqual({ paid: 0, writtenOff: 0, left: 470_000 });
    expect(feeBalance(fee, [
      { status: "paid", amount: 200_000 },
      { status: "cancelled", amount: 470_000 },
      { status: "needs_a_look", amount: 470_000 },
      { status: "failed", amount: 470_000 },
      { status: "started", amount: 270_000 },
      { status: "refunded", amount: 50_000, refunded: 50_000 },
      { status: "paid", amount: 100_000, refunded: 20_000 },
    ])).toEqual({ paid: 280_000, writtenOff: 0, left: 190_000 });
  });

  it("leaves nothing once paid in full or written off, and counts a fee paid before the ledger as paid in full", () => {
    expect(feeBalance({ ...fee, paidAt: new Date() }, [{ status: "paid", amount: 470_000 }])).toEqual({ paid: 470_000, writtenOff: 0, left: 0 });
    expect(feeBalance({ ...fee, paidAt: "2026-11-09T10:00:00Z" }, [])).toEqual({ paid: 470_000, writtenOff: 0, left: 0 });
    expect(feeBalance({ ...fee, writtenOffAmount: 270_000 }, [{ status: "paid", amount: 200_000 }])).toEqual({ paid: 200_000, writtenOff: 270_000, left: 0 });
  });
});
