import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "@server/_core/env";
import { buildBusinessSupportEmailHtml } from "@server/emailTemplates";
import { bankDetails, isMissingPaymentTable, paymentConfirmedEmail, paymentDetailsEmail, paymentStatusesByCheck } from "@server/payments";
import { BRAND } from "@shared/brand";
import { lagosTime } from "@server/lagosTime";

const saved = { bank: ENV.paymentBankName, name: ENV.paymentAccountName, number: ENV.paymentAccountNumber };
afterEach(() => {
  ENV.paymentBankName = saved.bank;
  ENV.paymentAccountName = saved.name;
  ENV.paymentAccountNumber = saved.number;
});
const configure = () => {
  ENV.paymentBankName = "Example Bank";
  ENV.paymentAccountName = "Intellectual Property Factory Ltd";
  ENV.paymentAccountNumber = "0123456789";
};
const clear = () => {
  ENV.paymentBankName = "";
  ENV.paymentAccountName = "";
  ENV.paymentAccountNumber = "";
};

describe("the bank account owners pay into", () => {
  it("uses the hosting settings once all three are set", () => {
    configure();
    expect(bankDetails()).toEqual({ bankName: "Example Bank", accountName: "Intellectual Property Factory Ltd", accountNumber: "0123456789", placeholder: false });
  });

  it("falls back to clearly marked placeholder details until then, even when only some are set", () => {
    clear();
    ENV.paymentBankName = "Example Bank";
    expect(bankDetails()).toMatchObject({ accountNumber: "0000000000", placeholder: true });
  });
});

/** 48 hours after details sent at 3:05 pm Lagos time on Friday 9 October 2026. */
const DEADLINE = new Date("2026-10-11T14:05:00Z");

describe("the payment details email", () => {
  it("says when to pay by, in Lagos time, and that the details hold for 48 hours", () => {
    configure();
    const email = paymentDetailsEmail({ fullName: "Ada Example", item: "current_state", reference: "TS-CS-000012", deadline: DEADLINE });
    expect(lagosTime(DEADLINE)).toMatch(/^Sun, 11 Oct 2026, 3:05\s?pm$/);
    expect(email.body).toContain(`Pay by: ${lagosTime(DEADLINE)} (Lagos time)`);
    expect(email.body).toContain("These details hold for 48 hours. If you need more time, reply to this email and we will send them again.");
    // It sits in the details table with the amount and the reference.
    expect(buildBusinessSupportEmailHtml(email.body)).toMatch(/>Pay by<\/td><td[^>]*>Sun, 11 Oct 2026/);
  });


  it("gives the amount, the account, the reference and how to send proof", () => {
    configure();
    const email = paymentDetailsEmail({ fullName: "Ada Example", item: "full_report", reference: "TS-R-000012" , deadline: DEADLINE });
    expect(email.subject).toBe("Payment details for your full business check report");
    for (const line of ["Dear Ada,", "Amount: ₦100,000", "Bank: Example Bank", "Account name: Intellectual Property Factory Ltd", "Account number: 0123456789", "Reference: TS-R-000012", "Reply to this email with your proof of payment", "Your report is emailed to you the moment you finish it."]) {
      expect(email.body).toContain(line);
    }
    expect(email.body).not.toContain("DO NOT PAY");
  });

  it("says Current State starts once the payment is confirmed", () => {
    configure();
    const email = paymentDetailsEmail({ fullName: "Ada Example", item: "current_state", reference: "TS-CS-000012" , deadline: DEADLINE });
    expect(email.subject).toBe("Payment details for your Current State");
    expect(email.body).toContain("Amount: ₦500,000");
    expect(email.body).toContain("Then your Current State starts. Three working days to get set up, then we start.");
  });

  it("warns in capitals, as a heading, when the details are placeholders", () => {
    clear();
    const email = paymentDetailsEmail({ fullName: "Ada Example", item: "full_report", reference: "TS-R-000012" , deadline: DEADLINE });
    expect(email.body).toContain("TEST DETAILS - DO NOT PAY");
    const html = buildBusinessSupportEmailHtml(email.body);
    expect(html).toContain(`color:${BRAND.palette["highlight-ink"]};font-weight:700;">TEST DETAILS - DO NOT PAY<`);
    expect(html).toMatch(/>Reference<\/td><td[^>]*>TS-R-000012<\/td>/);
  });
});

describe("the payment confirmed email", () => {
  it("sends the report form link, with the report promised the moment the form is finished", () => {
    const email = paymentConfirmedEmail({ fullName: "Ada Example", item: "full_report", reference: "TS-R-000012", reportLink: "https://app.example.test/report/TOKEN" });
    expect(email.subject).toBe("Payment received: your full business check report");
    expect(email.body).toContain("We have received your payment of ₦100,000 (reference TS-R-000012).");
    expect(email.body).toContain("Your report is built from your answers and emailed to you the moment you finish.");
    expect(email.body).toContain("Complete your report form: https://app.example.test/report/TOKEN");
    expect(buildBusinessSupportEmailHtml(email.body)).toMatch(/<a href="https:\/\/app\.example\.test\/report\/TOKEN"[^>]*>Complete your report form<\/a>/);
    expect(email.body).not.toMatch(/working days/);
  });

  it("starts Current State and says what happens next", () => {
    const email = paymentConfirmedEmail({ fullName: "Ada Example", item: "current_state", reference: "TS-CS-000012" });
    expect(email.subject).toBe("Payment received: your Current State starts");
    expect(email.body).toContain("WHAT HAPPENS NEXT");
    expect(email.body).toContain("• We email you a link to set up your client account on The Shift.");
    expect(`${email.subject}\n${email.body}`).not.toMatch(/JUMP|Emmanuel Tarfa/);
  });
});

describe("before migration 0006 is applied", () => {
  it("recognises the missing table and keeps the admin console working", async () => {
    expect(isMissingPaymentTable({ code: "42P01" })).toBe(true);
    expect(isMissingPaymentTable({ cause: { code: "42P01" } })).toBe(true);
    expect(isMissingPaymentTable({ code: "23505" })).toBe(false);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const missing = { select: () => ({ from: () => ({ orderBy: () => Promise.reject(Object.assign(new Error("relation does not exist"), { code: "42P01" })) }) }) };
    expect((await paymentStatusesByCheck(missing as never)).size).toBe(0);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("apply migration 0006"));
    error.mockRestore();
    const broken = { select: () => ({ from: () => ({ orderBy: () => Promise.reject(new Error("connection lost")) }) }) };
    await expect(paymentStatusesByCheck(broken as never)).rejects.toThrow("connection lost");
  });
});
