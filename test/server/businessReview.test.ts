import { describe, expect, it } from "vitest";
import { BUSINESS_REVIEW_PAY_WITHIN_DAYS, businessReviewFees } from "@server/businessReview";
import { feeReceiptEmail } from "@server/feePayments";
import { paymentDetailsEmail } from "@server/payments";

/**
 * The Business Review on fees (F3, App flow 3.2): its two fees, the payment details email that carries the first half's
 * link, and the receipt that starts it. The route end to end is in test/db/ledger.db.test.ts and payments.db.test.ts.
 */
describe("the Business Review's fees", () => {
  it("are its two halves at the server's price: the first dated the pay-by day, the second dated when the Findings are shared", () => {
    expect(businessReviewFees(600_000, "2026-11-12")).toEqual([
      { label: "Business Review: half to start", amount: 300_000, dueOn: "2026-11-12" },
      { label: "Business Review: half on delivery", amount: 300_000, dueOn: null },
    ]);
    // An odd test price still adds up: the first half takes the extra naira.
    expect(businessReviewFees(101, "2026-11-12").map(fee => fee.amount)).toEqual([51, 50]);
    // The two days are the 48 hours its link held before F3.
    expect(BUSINESS_REVIEW_PAY_WITHIN_DAYS).toBe(2);
  });
});

describe("the Business Review's emails on its fee", () => {
  const url = "https://app.example.test/pay/fee/31/abcdefghijklmnopqrstuvwxyz012345";
  it("asks for the first half with the fee's reference, invoice and pay-by day, and no 48 hours, since its link stays open", () => {
    const message = paymentDetailsEmail({ fullName: "Ada Example", item: "current_state", reference: "TS-F-000031", payByDay: "2026-11-12", invoice: "TS-IN-000007", amountNaira: 300_000, totalNaira: 600_000, online: { url, mode: "live" } });
    expect(message.subject).toBe("Payment details for your Business Review");
    for (const line of ["Amount: ₦300,000, the first half of ₦600,000", "Reference: TS-F-000031", "Invoice: TS-IN-000007", "Pay by: Thu 12 Nov 2026", `Pay online: ${url}`, "The second half, ₦300,000, is due seven days after we share your Findings. We email you its link then."]) {
      expect(message.body).toContain(line);
    }
    expect(message.body).not.toContain("48 hours");
    expect(message.body).not.toContain("Lagos time");
  });

  it("gives the receipt that starts it, with what happens next, and names the fee once", () => {
    const receipt = feeReceiptEmail({ name: "Ada Example", title: "Business Review", label: "Business Review: half to start", amount: 300_000, left: 0, receipt: "TS-RC-000021", reference: "TS-F-000031", paid: { on: "2026-11-11" }, test: false, opened: true, startsBusinessReview: true });
    expect(receipt.subject).toBe("Payment received: Business Review: half to start");
    expect(receipt.body).toContain("We have received ₦300,000 for the Business Review: half to start. Thank you.");
    expect(receipt.body).toContain("Your Business Review is booked. We take three working days to get set up; the review starts at your first Session.");
    expect(receipt.body).toContain("WHAT HAPPENS NEXT");
    expect(receipt.body).toContain("If you do not have a client account on The Shift yet, we email you a link to set one up.");
    expect(receipt.body).not.toContain("Your room is open");
    // Any other fee keeps its engagement's name beside it, and its usual line about the room.
    const other = feeReceiptEmail({ name: "Ada Example", title: "Digital Marketing", label: "Month 1 service fee, payable on starting", amount: 470_000, left: 0, receipt: "TS-RC-000022", reference: "TS-F-000040", paid: { on: "2026-11-11" }, test: false, opened: true });
    expect(other.body).toContain("We have received ₦470,000 for the Digital Marketing: Month 1 service fee, payable on starting. Thank you.");
    expect(other.body).toContain("Your room is open: ");
    expect(other.body).not.toContain("WHAT HAPPENS NEXT");
  });
});
