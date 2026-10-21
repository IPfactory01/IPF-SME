import { afterEach, describe, expect, it, vi } from "vitest";
import { PRICES } from "@shared/businessSupport";
import { assertAmountAllowed, displayedPrices, evaluateBusinessSupportPrice, getBusinessSupportPrice, LOW_PRICE_THRESHOLD_NGN, resetPriceWarningsForTests } from "@server/businessSupportPrices";
import { paymentConfirmedEmail, paymentDetailsEmail } from "@server/payments";
import { ownerEmail } from "@server/businessCheck";
import { evaluate } from "@shared/businessCheck/engine";
import { cleanAnswers } from "@shared/businessCheck/engine";

const production = { NODE_ENV: "production" };
afterEach(() => {
  vi.restoreAllMocks();
  resetPriceWarningsForTests();
});
const quiet = () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  return vi.spyOn(console, "warn").mockImplementation(() => undefined);
};

describe("the server-side Business Support price resolver", () => {
  it("keeps the real prices when nothing is configured, or the setting is blank", () => {
    expect(getBusinessSupportPrice("full_report", {})).toBe(100_000);
    expect(getBusinessSupportPrice("current_state", {})).toBe(500_000);
    expect(getBusinessSupportPrice("full_report", { FULL_REPORT_PRICE_NGN: "  " })).toBe(PRICES.fullReport);
    expect(displayedPrices({})).toEqual({ fullReport: 100_000, currentState: 500_000 });
  });

  it("takes a valid override for its own item only", () => {
    const env = { FULL_REPORT_PRICE_NGN: " 150000 " };
    expect(getBusinessSupportPrice("full_report", env)).toBe(150_000);
    expect(getBusinessSupportPrice("current_state", env)).toBe(500_000);
    expect(getBusinessSupportPrice("current_state", { CURRENT_STATE_PRICE_NGN: "450000" })).toBe(450_000);
    expect(displayedPrices({ CURRENT_STATE_PRICE_NGN: "450000" })).toEqual({ fullReport: 100_000, currentState: 450_000 });
  });

  it("rejects values that are not a positive whole number of naira", () => {
    quiet();
    for (const bad of ["abc", "NaN", "Infinity", "-100", "0", "00", "100.5", "1e5", "₦100000", "100,000", "100 000", "0x10", "99999999999999999999", "100000001"]) {
      const outcome = evaluateBusinessSupportPrice("full_report", { FULL_REPORT_PRICE_NGN: bad });
      expect(outcome, bad).toMatchObject({ ok: false, problem: "invalid" });
      expect(() => getBusinessSupportPrice("full_report", { FULL_REPORT_PRICE_NGN: bad }), bad).toThrow();
    }
  });

  it("rejects zero and negative prices without leaking the setting's detail to the browser", () => {
    quiet();
    for (const bad of ["0", "-1"]) {
      expect(() => getBusinessSupportPrice("current_state", { CURRENT_STATE_PRICE_NGN: bad })).toThrowError(expect.objectContaining({ code: "INTERNAL_SERVER_ERROR", message: expect.not.stringContaining("CURRENT_STATE_PRICE_NGN") }));
    }
  });

  it("falls back to the real price for display when a setting is unusable (nothing is chargeable then)", () => {
    quiet();
    expect(displayedPrices({ FULL_REPORT_PRICE_NGN: "-5", CURRENT_STATE_PRICE_NGN: "abc" })).toEqual({ fullReport: 100_000, currentState: 500_000 });
    expect(displayedPrices({ ...production, FULL_REPORT_PRICE_NGN: "100" }).fullReport).toBe(100_000);
  });

  it("in production refuses a price under the safety threshold unless low-price testing is on", () => {
    const warn = quiet();
    expect(LOW_PRICE_THRESHOLD_NGN).toBe(10_000);
    expect(evaluateBusinessSupportPrice("full_report", { ...production, FULL_REPORT_PRICE_NGN: "100" })).toMatchObject({ ok: false, problem: "too_low" });
    expect(() => getBusinessSupportPrice("full_report", { ...production, FULL_REPORT_PRICE_NGN: "9999" })).toThrow();
    for (const off of ["", "false", "0", "yes"]) {
      expect(() => getBusinessSupportPrice("full_report", { ...production, FULL_REPORT_PRICE_NGN: "100", ALLOW_LOW_PRICE_TESTING: off }), off).toThrow();
    }
    // At the threshold and above is an ordinary price.
    expect(getBusinessSupportPrice("full_report", { ...production, FULL_REPORT_PRICE_NGN: "10000" })).toBe(10_000);
    expect(warn).not.toHaveBeenCalled();
  });

  it("permits a low price in production with ALLOW_LOW_PRICE_TESTING=true, and says so once without printing any secret", () => {
    const warn = quiet();
    const env = { ...production, FULL_REPORT_PRICE_NGN: "100", ALLOW_LOW_PRICE_TESTING: "true", PAYSTACK_SECRET_KEY: "sk_live_do_not_print", JWT_SECRET: "do_not_print" };
    expect(getBusinessSupportPrice("full_report", env)).toBe(100);
    expect(getBusinessSupportPrice("full_report", env)).toBe(100);
    expect(evaluateBusinessSupportPrice("full_report", env)).toMatchObject({ ok: true, amountNaira: 100, lowPriceTesting: true });
    expect(warn).toHaveBeenCalledTimes(1);
    const said = String(warn.mock.calls[0][0]);
    expect(said).toContain("ALLOW_LOW_PRICE_TESTING is on");
    expect(said).not.toMatch(/do_not_print|sk_live/);
  });

  it("is not restrictive outside production, where a test price needs no switch", () => {
    expect(getBusinessSupportPrice("full_report", { NODE_ENV: "test", FULL_REPORT_PRICE_NGN: "100" })).toBe(100);
    expect(evaluateBusinessSupportPrice("full_report", { FULL_REPORT_PRICE_NGN: "100" })).toMatchObject({ ok: true, lowPriceTesting: false });
  });

  it("holds a stored low amount to the same safety before it goes to Paystack", () => {
    quiet();
    expect(() => assertAmountAllowed(100, production)).toThrow();
    expect(assertAmountAllowed(100, { ...production, ALLOW_LOW_PRICE_TESTING: "true" })).toBe(true);
    expect(assertAmountAllowed(100_000, production)).toBe(false);
    expect(assertAmountAllowed(100, {})).toBe(false);
  });

  it("is not exposed to the browser: no VITE_ setting names a price or the switch", async () => {
    const { readFileSync } = await import("node:fs");
    const files = ["client/src/lib/servicePrices.ts", "client/src/pages/BusinessCheck.tsx", "client/src/pages/PayPage.tsx"].map(file => readFileSync(file, "utf8")).join("\n");
    expect(files).not.toMatch(/VITE_[A-Z_]*PRICE|ALLOW_LOW_PRICE|import\.meta\.env\.[A-Z_]*PRICE/);
    expect(readFileSync(".env.example", "utf8")).not.toMatch(/VITE_[A-Z_]*PRICE/);
  });
});

describe("emails show the amount they are given", () => {
  const base = { fullName: "Ada Example", item: "full_report" as const, reference: "TS-R-000012" };
  it("the payment email states the configured price", () => {
    expect(paymentDetailsEmail({ ...base, deadline: new Date(), amountNaira: 100 }).body).toContain("Amount: ₦100\n");
    expect(paymentDetailsEmail({ ...base, item: "current_state", deadline: new Date(), amountNaira: 450_000 }).body).toContain("Amount: ₦450,000\n");
  });
  it("the payment confirmation states the amount stored on the request", () => {
    expect(paymentConfirmedEmail({ ...base, amountNaira: 100, reportLink: "https://app.example.test/report/T" }).body).toContain("payment of ₦100 (reference TS-R-000012)");
  });
  it("the summary email states the Full Report price it is given, and the standard price otherwise", () => {
    const result = evaluate(cleanAnswers({}));
    const contact = { fullName: "Ada Example", email: "ada@example.test" } as never;
    const summary = { ...result.summary, offerings: [] };
    expect(ownerEmail({ contact, result, summary, fullReportPrice: 100 }).body).toContain("It costs ₦100 and comes by email");
    expect(ownerEmail({ contact, result, summary }).body).toContain("It costs ₦100,000 and comes by email");
  });
});
