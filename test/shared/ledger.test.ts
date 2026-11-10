import { describe, expect, it } from "vitest";
import { DOCUMENT_NUMBER_KINDS, invoiceNumberLabel, LEDGER_PAYMENT_STATUSES, receiptNumberLabel } from "@shared/ledger";

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
