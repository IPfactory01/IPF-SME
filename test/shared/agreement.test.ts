import { describe, expect, it } from "vitest";
import { defaultFees } from "@shared/agreement";

describe("the fees a new engagement starts with", () => {
  it("fills in Digital marketing as a monthly service fee of ₦470,000 for three months, each payable before it begins", () => {
    expect(defaultFees("digital_marketing", null)).toEqual([
      { label: "Month 1 service fee, payable on starting", amount: 470_000, dueOn: null },
      { label: "Month 2 service fee, payable before day 31", amount: 470_000, dueOn: null },
      { label: "Month 3 service fee, payable before day 61", amount: 470_000, dueOn: null },
    ]);
  });

  it("fills in a service from its price on the website", () => {
    expect(defaultFees("business_review", null)).toEqual([{ label: "Business Review, payable before work begins", amount: 600_000, dueOn: null }]);
    expect(defaultFees("done_for_you", "cash_flow_forecast")).toEqual([{ label: "13-Week Cash Flow Forecast, payable before work begins", amount: 300_000, dueOn: null }]);
  });
});
