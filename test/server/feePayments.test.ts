import { describe, expect, it } from "vitest";
import { workResumedEmails } from "@server/feePayments";

/**
 * "Work on your {engagement} has resumed" (G2, App flow 4.4 #7b): the owner's and the lead's emails when a payment lifts
 * a pause. When they are sent, and to whom, is in test/db/ledger.db.test.ts.
 */
describe("the work resumed emails", () => {
  const base = { name: "Funmi Example", businessName: "Crown Studio", title: "Digital Marketing", label: "Month 2 service fee, payable before day 31", amount: 470_000, receipt: "TS-RC-000031", stillLate: null, test: false };

  it("thank the owner and tell the lead to pick the work up again, with the receipt", () => {
    const { owner, team } = workResumedEmails(base);
    expect(owner.subject).toBe("Work on your Digital Marketing has resumed");
    expect(owner.body).toContain("Hello Funmi,");
    expect(owner.body).toContain("Thank you for your payment. Work on your Digital Marketing has resumed.");
    expect(owner.body).toContain("Open your room: ");
    expect(owner.body).not.toContain("still late");
    expect(team.subject).toBe("Work has resumed: Crown Studio, Digital Marketing");
    expect(team.body).toContain("Crown Studio paid ₦470,000 (Month 2 service fee, payable before day 31). Work on their Digital Marketing is no longer paused: pick it up again.");
    expect(team.body).toContain("Receipt: TS-RC-000031");
  });

  it("name another fee that is still late, and the day work pauses again", () => {
    const { owner, team } = workResumedEmails({ ...base, stillLate: { label: "Month 3 service fee, payable before day 61", left: 470_000, pausesOn: "2026-11-17" } });
    expect(owner.body).toContain("One fee is still late: Month 3 service fee, payable before day 61, with ₦470,000 left to pay. Pay it before Tue 17 Nov 2026 to keep the work going.");
    expect(team.body).toContain("One fee is still late: Month 3 service fee, payable before day 61 (₦470,000 left). Work pauses again on Tue 17 Nov 2026 if it is not paid.");
  });

  it("say TEST MODE when no real money moved", () => {
    const { owner, team } = workResumedEmails({ ...base, test: true });
    expect(owner.subject).toBe("TEST: Work on your Digital Marketing has resumed");
    expect(team.subject).toBe("TEST: Work has resumed: Crown Studio, Digital Marketing");
    expect(owner.body.startsWith("TEST MODE - NO REAL MONEY MOVED")).toBe(true);
  });
});

describe("the office's alert for a Paystack notification the server could not process (G3)", () => {
  it("says what happened and what to do, with the reference and when, and never the error", async () => {
    const { unprocessedWebhookEmail } = await import("@server/onlinePayment");
    const message = unprocessedWebhookEmail("TS-F-000031-1a2b3c4d", new Date("2026-11-10T09:14:00Z"));
    expect(message.subject).toBe("Paystack notification not processed: TS-F-000031-1a2b3c4d");
    expect(message.body).toContain("Paystack sends it again for up to three days, and the payer's return page can confirm it too.");
    expect(message.body).toContain("If it does not show as paid within the hour, check the payment in Paystack.");
    expect(message.body).toContain("Reference: TS-F-000031-1a2b3c4d");
    expect(message.body).toContain("When: Tue, 10 Nov 2026, 10:14 am (Lagos time)");
  });
});
