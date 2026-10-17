import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "@server/_core/env";
import { buildBusinessSupportEmailHtml } from "@server/emailTemplates";
import { EMAIL_TEST_NOTICE, isMissingPaymentTable, onlinePaymentNote, onlinePaymentOffer, paymentConfirmedEmail, paymentDetailsEmail, paymentStatusesByCheck } from "@server/payments";
import { BRAND } from "@shared/brand";
import { lagosTime } from "@server/lagosTime";

const saved = { paystack: ENV.paystackSecretKey };
afterEach(() => {
  ENV.paystackSecretKey = saved.paystack;
});

/** 48 hours after the link was sent at 3:05 pm Lagos time on Friday 9 October 2026. */
const DEADLINE = new Date("2026-10-11T14:05:00Z");
const PAY_URL = "https://app.example.test/pay/CHECKTOKEN1234567890/full_report";
const email = (item: "full_report" | "current_state", mode: "test" | "live" | null = "live") =>
  paymentDetailsEmail({ fullName: "Ada Example", item, reference: item === "full_report" ? "TS-R-000012" : "TS-CS-000012", deadline: DEADLINE, online: mode ? { url: PAY_URL, mode } : null });

describe("the payment email: Paystack only", () => {
  it("gives the amount, the reference and a Pay online button, and no bank details or proof of payment", () => {
    const message = email("full_report");
    expect(message.subject).toBe("Payment details for your Full Report");
    for (const line of ["Dear Ada,", "Amount: ₦100,000", "Reference: TS-R-000012", "Pay securely with Paystack, by card, bank transfer or USSD.", `Pay online: ${PAY_URL}`, "There is nothing more to do. We email you as soon as Paystack confirms your payment.", "Your Full Report is emailed to you the moment you finish it."]) {
      expect(message.body).toContain(line);
    }
    expect(message.body).not.toMatch(/Bank:|Account name|Account number|proof of payment|BANK TRANSFER|DO NOT PAY/);
    const html = buildBusinessSupportEmailHtml(message.body);
    expect(html).toContain(`<a href="${PAY_URL}"`);
    expect(html).toMatch(/>Pay online<\/a>/);
  });

  it("gives the Current State Assessment a pay-by time in Lagos time, and a new link on request after 48 hours", () => {
    const message = email("current_state");
    expect(message.subject).toBe("Payment details for your Current State Assessment");
    expect(message.body).toContain("Amount: ₦500,000");
    expect(lagosTime(DEADLINE)).toMatch(/^Sun, 11 Oct 2026, 3:05\s?pm$/);
    expect(message.body).toContain(`Pay by: ${lagosTime(DEADLINE)} (Lagos time)`);
    expect(message.body).toContain("If you need more than 48 hours, reply to this email and we will send you a new link.");
    expect(message.body).toContain("Then your Current State Assessment starts. Three working days to get set up, then we start.");
    expect(buildBusinessSupportEmailHtml(message.body)).toMatch(/>Pay by<\/td><td[^>]*>Sun, 11 Oct 2026/);
  });

  it("gives the Full Report no pay-by time: the owner's own link opens again by itself", () => {
    expect(email("full_report").body).not.toMatch(/Pay by:|48 hours/);
  });

  it("says in capitals, as a heading, that no real money moves in test mode", () => {
    const message = email("full_report", "test");
    expect(EMAIL_TEST_NOTICE).toBe("TEST MODE - NO REAL MONEY MOVES");
    expect(message.body.indexOf(EMAIL_TEST_NOTICE)).toBeLessThan(message.body.indexOf("HOW TO PAY"));
    expect(buildBusinessSupportEmailHtml(message.body)).toContain(`color:${BRAND.palette["highlight-ink"]};font-weight:700;">TEST MODE - NO REAL MONEY MOVES<`);
    expect(email("full_report", "live").body).not.toContain("TEST MODE");
  });

  it("says the link is coming, with no way to pay offered, while Paystack is off", () => {
    const message = email("full_report", null);
    expect(message.body).toContain("Online payment is not open yet. We will email you a link to pay as soon as it is.");
    expect(message.body).not.toMatch(/Pay online:|Bank:|proof of payment/);
  });

  it("offers the pay page only while Paystack is on, keyed by the Business Check's token", () => {
    ENV.paystackSecretKey = "";
    expect(onlinePaymentOffer("CHECKTOKEN1234567890", "full_report")).toBeNull();
    ENV.paystackSecretKey = "sk_test_fixture_not_a_real_key";
    expect(onlinePaymentOffer("CHECKTOKEN1234567890", "current_state")).toEqual({ url: "http://localhost:3000/pay/CHECKTOKEN1234567890/current_state", mode: "test" });
    ENV.paystackSecretKey = "sk_live_fixture_not_a_real_key";
    expect(onlinePaymentOffer("CHECKTOKEN1234567890", "full_report")?.mode).toBe("live");
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
