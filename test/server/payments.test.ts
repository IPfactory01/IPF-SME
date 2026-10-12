import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "@server/_core/env";
import { buildBusinessSupportEmailHtml } from "@server/emailTemplates";
import { bankDetails, EMAIL_TEST_NOTICE, isMissingPaymentTable, onlinePaymentNote, onlinePaymentOffer, paymentConfirmedEmail, paymentDetailsEmail, paymentStatusesByCheck } from "@server/payments";
import { BRAND } from "@shared/brand";
import { lagosTime } from "@server/lagosTime";

const saved = { bank: ENV.paymentBankName, name: ENV.paymentAccountName, number: ENV.paymentAccountNumber, paystack: ENV.paystackSecretKey };
afterEach(() => {
  ENV.paymentBankName = saved.bank;
  ENV.paymentAccountName = saved.name;
  ENV.paymentAccountNumber = saved.number;
  ENV.paystackSecretKey = saved.paystack;
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
    expect(email.subject).toBe("Payment details for your Full Report");
    for (const line of ["Dear Ada,", "Amount: ₦100,000", "Bank: Example Bank", "Account name: Intellectual Property Factory Ltd", "Account number: 0123456789", "Reference: TS-R-000012", "Reply to this email with your proof of payment", "Your Full Report is emailed to you the moment you finish it."]) {
      expect(email.body).toContain(line);
    }
    expect(email.body).not.toContain("DO NOT PAY");
  });

  it("says Current State Assessment starts once the payment is confirmed", () => {
    configure();
    const email = paymentDetailsEmail({ fullName: "Ada Example", item: "current_state", reference: "TS-CS-000012" , deadline: DEADLINE });
    expect(email.subject).toBe("Payment details for your Current State Assessment");
    expect(email.body).toContain("Amount: ₦500,000");
    expect(email.body).toContain("Then your Current State Assessment starts. Three working days to get set up, then we start.");
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

describe("the payment details email with online payment", () => {
  const PAY_URL = "https://app.example.test/pay/CHECKTOKEN1234567890/full_report";
  const online = (mode: "test" | "live") => paymentDetailsEmail({ fullName: "Ada Example", item: "full_report", reference: "TS-R-000012", deadline: DEADLINE, online: { url: PAY_URL, mode } });

  it("leads with a Pay online button and keeps the bank details below as the alternative", () => {
    configure();
    const email = online("live");
    expect(email.subject).toBe("Payment details for your Full Report");
    const body = email.body;
    for (const line of ["Amount: ₦100,000", "Reference: TS-R-000012", `Pay by: ${lagosTime(DEADLINE)} (Lagos time)`, "PAY ONLINE", `Pay online: ${PAY_URL}`, "OR PAY BY BANK TRANSFER", "Bank: Example Bank", "Account number: 0123456789"]) {
      expect(body).toContain(line);
    }
    expect(body.indexOf("PAY ONLINE")).toBeLessThan(body.indexOf("OR PAY BY BANK TRANSFER"));
    // Nobody who paid online is asked for proof.
    expect(body).toContain("Paid online? There is nothing more to do.");
    expect(body).toContain("Paid by bank transfer? Reply to this email with your proof of payment");
    expect(body).not.toContain("TEST MODE");
    const html = buildBusinessSupportEmailHtml(body);
    expect(html).toContain(`<a href="${PAY_URL}"`);
    expect(html).toMatch(/>Pay online<\/a>/);
  });

  it("says in capitals, as a heading, that no real money moves in test mode", () => {
    configure();
    const email = online("test");
    expect(email.body).toContain(EMAIL_TEST_NOTICE);
    expect(EMAIL_TEST_NOTICE).toBe("TEST MODE - NO REAL MONEY MOVES");
    expect(email.body.indexOf(EMAIL_TEST_NOTICE)).toBeLessThan(email.body.indexOf("PAY ONLINE"));
    expect(buildBusinessSupportEmailHtml(email.body)).toContain(`color:${BRAND.palette["highlight-ink"]};font-weight:700;">TEST MODE - NO REAL MONEY MOVES<`);
  });

  it("still warns that placeholder bank details are not real", () => {
    clear();
    expect(online("live").body).toContain("TEST DETAILS - DO NOT PAY");
  });

  it("offers the pay page only while Paystack is on, keyed by the Business Check's token", () => {
    ENV.paystackSecretKey = "";
    expect(onlinePaymentOffer("CHECKTOKEN1234567890", "full_report")).toBeNull();
    ENV.paystackSecretKey = "sk_test_fixture_not_a_real_key";
    expect(onlinePaymentOffer("CHECKTOKEN1234567890", "current_state")).toEqual({ url: "http://localhost:3000/pay/CHECKTOKEN1234567890/current_state", mode: "test" });
    ENV.paystackSecretKey = "sk_live_fixture_not_a_real_key";
    expect(onlinePaymentOffer("CHECKTOKEN1234567890", "full_report")?.mode).toBe("live");
  });

  it("is unchanged, with no button, while online payment is off", () => {
    configure();
    const email = paymentDetailsEmail({ fullName: "Ada Example", item: "full_report", reference: "TS-R-000012", deadline: DEADLINE, online: null });
    expect(email.body).not.toMatch(/Pay online|PAY ONLINE|Paystack/);
    expect(email.body).toContain("HOW TO PAY");
  });
});

describe("a payment confirmed online", () => {
  it("is noted with Paystack's reference, marked TEST in test mode", () => {
    expect(onlinePaymentNote({ provider: "paystack", reference: "TS-R-000012-1a2b3c4d", mode: "live" })).toBe("Paid online with Paystack, reference TS-R-000012-1a2b3c4d");
    expect(onlinePaymentNote({ provider: "paystack", reference: "TS-R-000012-1a2b3c4d", mode: "test" })).toBe("TEST: Paid online with Paystack, reference TS-R-000012-1a2b3c4d");
  });

  it("tells the owner in capitals when it was a test payment", () => {
    const email = paymentConfirmedEmail({ fullName: "Ada Example", item: "current_state", reference: "TS-CS-000012", testMode: true });
    expect(email.body).toContain(EMAIL_TEST_NOTICE);
    expect(email.body).toContain("This payment was made in Paystack's test mode, so no real money moved.");
    expect(paymentConfirmedEmail({ fullName: "Ada Example", item: "current_state", reference: "TS-CS-000012" }).body).not.toContain("TEST MODE");
  });
});

describe("the payment confirmed email", () => {
  it("sends the Report Intake link, with the report promised the moment the form is finished", () => {
    const email = paymentConfirmedEmail({ fullName: "Ada Example", item: "full_report", reference: "TS-R-000012", reportLink: "https://app.example.test/report/TOKEN" });
    expect(email.subject).toBe("Payment received: your Full Report");
    expect(email.body).toContain("We have received your payment of ₦100,000 (reference TS-R-000012).");
    expect(email.body).toContain("Your Full Report is built from your answers and emailed to you the moment you finish.");
    expect(email.body).toContain("Complete your Report Intake: https://app.example.test/report/TOKEN");
    expect(buildBusinessSupportEmailHtml(email.body)).toMatch(/<a href="https:\/\/app\.example\.test\/report\/TOKEN"[^>]*>Complete your Report Intake<\/a>/);
    expect(email.body).not.toMatch(/working days/);
  });

  it("starts Current State Assessment and says what happens next", () => {
    const email = paymentConfirmedEmail({ fullName: "Ada Example", item: "current_state", reference: "TS-CS-000012" });
    expect(email.subject).toBe("Payment received: your Current State Assessment starts");
    expect(email.body).toContain("WHAT HAPPENS NEXT");
    expect(email.body).toContain("• We email you a link to set up your client account on The Shift.");
    expect(`${email.subject}\n${email.body}`).not.toMatch(/JUMP|Emmanuel Tarfa/);
  });
});

describe("the name of the paid assessment", () => {
  it("is always Current State Assessment in payment emails, never the short Current State (decided 9 October)", () => {
    const emails = [
      paymentDetailsEmail({ fullName: "Ada Example", item: "current_state", reference: "TS-CS-000012", deadline: DEADLINE }),
      paymentConfirmedEmail({ fullName: "Ada Example", item: "current_state", reference: "TS-CS-000012" }),
    ];
    for (const email of emails) {
      const text = `${email.subject}\n${email.body}`;
      expect(text).toContain("Current State Assessment");
      expect(text).not.toMatch(/Current State(?! Assessment)/);
    }
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
