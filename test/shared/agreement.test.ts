import { describe, expect, it } from "vitest";
import { BALANCE_DUE_DAYS, defaultFees, isDelivery } from "@shared/agreement";

describe("the fees a new engagement starts with", () => {
  it("fills in Digital marketing as a monthly service fee of ₦470,000 for three months, each payable before it begins", () => {
    expect(defaultFees("digital_marketing", null)).toEqual([
      { label: "Month 1 service fee, payable on starting", amount: 470_000, dueOn: null },
      { label: "Month 2 service fee, payable before day 31", amount: 470_000, dueOn: null },
      { label: "Month 3 service fee, payable before day 61", amount: 470_000, dueOn: null },
    ]);
  });

  it("fills in a service agreed on a call as half to start and half on delivery, and a product as one fee before we start (R36)", () => {
    expect(defaultFees("business_review", null, "2026-11-16")).toEqual([
      { label: "Business Review: half to start", amount: 300_000, dueOn: "2026-11-16" },
      { label: "Business Review: half on delivery", amount: 300_000, dueOn: null },
    ]);
    // The Six-Week Fix too, since 10 November 2026: its two stages are the two halves.
    expect(defaultFees("six_week_fix", null, "2026-11-16")).toEqual([
      { label: "Six-Week Fix: at the start (50%)", amount: 750_000, dueOn: "2026-11-16" },
      { label: "Six-Week Fix: at the result (50%)", amount: 750_000, dueOn: null },
    ]);
    expect(defaultFees("done_for_you", "business_plan", null)).toEqual([
      { label: "Business Plan: half to start", amount: 375_000, dueOn: null },
      { label: "Business Plan: half on delivery", amount: 375_000, dueOn: null },
    ]);
    // Bought online: paid in full before we start, dated the start day.
    expect(defaultFees("done_for_you", "cash_flow_forecast", "2026-11-16")).toEqual([{ label: "13-Week Cash Flow Forecast, payable before work begins", amount: 300_000, dueOn: "2026-11-16" }]);
    // A Monthly Service: its first quarter, before it starts.
    expect(defaultFees("monthly_service", "monthly_accounts", "2026-11-16")).toEqual([{ label: "Monthly Accounts and Cash Report: first quarter, payable before it starts", amount: 600_000, dueOn: "2026-11-16" }]);
  });

  it("dates Digital marketing's three months from the kickoff: on starting, day 31 and day 61", () => {
    expect(defaultFees("digital_marketing", null, "2026-11-02").map((fee) => fee.dueOn)).toEqual(["2026-11-02", "2026-12-02", "2027-01-01"]);
    // The fees come from the product on the website (R35), whether or not the engagement names it.
    expect(defaultFees("digital_marketing", "digital_marketing", "2026-11-02")).toEqual(defaultFees("digital_marketing", null, "2026-11-02"));
  });

  it("knows which shared Deliverable is a service's delivery, which dates its second half seven days later", () => {
    expect(BALANCE_DUE_DAYS).toBe(7);
    expect(isDelivery("business_review", "findings")).toBe(true);
    expect(isDelivery("business_review", "prescription")).toBe(false);
    expect(isDelivery("six_week_fix", "plan")).toBe(true);
    expect(isDelivery("six_week_fix", "prescription")).toBe(false);
    expect(isDelivery("done_for_you", "other")).toBe(true);
    expect(isDelivery("digital_marketing", "findings")).toBe(false);
    expect(isDelivery("monthly_service", "plan")).toBe(false);
  });
});
