import { describe, expect, it } from "vitest";
import { PRICES } from "@shared/businessSupport";
import {
  MENU_PRODUCTS, NEED_DETAILS, NEEDS, nextProduct, payInFullAmount, priceLabel, priceTerms, productById, productBySlug, PRODUCTS,
  menuEntry, productsForNeed, quarterAmount, stageAmount, startingPriceOf, startMode, WAY_DETAILS, WAYS_TO_BUY, type PriceModel,
} from "@shared/products";

/** Operational Business Plan, page 11: the launch menu at the prices ET set on 21 October 2026. */
const PLAN_PRICES: Record<string, string> = {
  business_health_check: "Free",
  full_report: "₦100,000",
  funding_readiness_assessment: "₦150,000",
  business_review: "₦600,000",
  strategy_90_day_plan: "₦450,000",
  pricing_unit_cost_review: "₦750,000",
  bookkeeping_catch_up: "₦100,000 a month of records",
  cash_flow_forecast: "₦300,000",
  // Raised from ₦600,000 by ET on 28 October 2026, above the Business Plan it builds on.
  funding_application_pack: "₦900,000",
  hiring_toolkit: "₦300,000",
  six_week_fix: "₦1,500,000",
  monthly_accounts: "₦200,000 a month",
  monthly_adviser_review: "₦150,000 a month",
  // Added by ET on 28 October 2026, after the plan.
  business_model: "₦300,000",
  financial_model: "₦350,000",
  business_plan: "₦750,000",
  pitch_deck: "₦300,000",
};

describe("the launch menu (Operational Business Plan, 22 October 2026)", () => {
  it("has the thirteen products of page 11 and the four added on 28 October, each at its price", () => {
    expect(PRODUCTS.map((product) => product.id).sort()).toEqual(Object.keys(PLAN_PRICES).sort());
    for (const product of PRODUCTS) expect(priceLabel(product.price), product.id).toBe(PLAN_PRICES[product.id]);
  });

  it("keeps the prices the payment code charges in step with the menu", () => {
    expect(productById("full_report")!.price).toEqual({ kind: "fixed", amount: PRICES.fullReport });
    expect(productById("business_review")!.price).toEqual({ kind: "fixed", amount: PRICES.currentState });
    expect((productById("six_week_fix")!.price as Extract<PriceModel, { kind: "milestones" }>).total).toBe(PRICES.fix);
  });

  it("gives every product a unique id and page, a way to buy and at least one need", () => {
    expect(new Set(PRODUCTS.map((product) => product.id)).size).toBe(PRODUCTS.length);
    expect(new Set(PRODUCTS.map((product) => product.slug)).size).toBe(PRODUCTS.length);
    for (const product of PRODUCTS) {
      expect(productBySlug(product.slug)).toBe(product);
      expect(product.slug).toMatch(/^[a-z0-9-]+$/);
      expect(WAYS_TO_BUY).toContain(product.way);
      expect(product.needs.length).toBeGreaterThan(0);
      for (const need of product.needs) expect(NEEDS).toContain(need);
      expect(product.youGet.length).toBeGreaterThan(0);
    }
  });

  it("points every 'next' at a product that is on the menu", () => {
    for (const product of PRODUCTS) if (product.next) expect(MENU_PRODUCTS, product.id).toContain(nextProduct(product));
  });

  it("lets owners buy finished work themselves only where the plan says so, each with an intake form", () => {
    for (const product of PRODUCTS.filter((item) => item.buy === "self")) {
      expect(["assessment", "done_for_you"], product.id).toContain(product.way);
      expect(product.intake.records.length + product.intake.questions.length, product.id).toBeGreaterThan(0);
      expect(product.workingDays, product.id).toBeGreaterThan(0);
    }
    // The call comes before the link above ₦500,000, and for the review, the fixes and the monthly services (plan page 18).
    for (const id of ["pricing_unit_cost_review", "funding_application_pack", "business_review", "six_week_fix", "monthly_accounts", "monthly_adviser_review"]) expect(productById(id)!.buy, id).toBe("after_call");
  });

  it("charges the Six-Week Fix 50/25/25, or in full at 5% off", () => {
    const fix = productById("six_week_fix")!.price as Extract<PriceModel, { kind: "milestones" }>;
    expect(fix.stages.map((stage) => stage.percent)).toEqual([50, 25, 25]);
    expect(fix.stages.reduce((sum, stage) => sum + stageAmount(fix, stage.percent), 0)).toBe(1_500_000);
    expect(payInFullAmount(fix)).toBe(1_425_000);
    expect(priceTerms(fix)).toContain("₦750,000 at the start");
    expect(productById("six_week_fix")!.variants!.map((variant) => variant.name)).toEqual(["Margin", "Sales", "Cash and Pricing", "Delegation and Structure"]);
  });

  it("charges Monthly Services by the quarter, and the Catch-Up for at least three months", () => {
    expect(quarterAmount(productById("monthly_accounts")!.price as Extract<PriceModel, { kind: "quarterly" }>)).toBe(600_000);
    expect(quarterAmount(productById("monthly_adviser_review")!.price as Extract<PriceModel, { kind: "quarterly" }>)).toBe(450_000);
    expect(priceTerms(productById("bookkeeping_catch_up")!.price)).toContain("At least 3 months (₦300,000)");
    expect(startingPriceOf("done_for_you")).toBe(300_000);
  });

  it("states the boundaries counsel has not yet cleared: management accounts only, no tax advice", () => {
    expect(productById("bookkeeping_catch_up")!.boundary).toMatch(/Management accounts only/);
    expect(productById("monthly_accounts")!.boundary).toMatch(/not tax advice/);
  });

  it("puts every product under a need on the menu, and every way to buy has products", () => {
    for (const product of MENU_PRODUCTS) expect(product.needs.some((need) => productsForNeed(need).includes(product))).toBe(true);
    for (const way of WAYS_TO_BUY) expect(WAY_DETAILS[way].name.length).toBeGreaterThan(0);
    for (const need of NEEDS) expect(NEED_DETAILS[need].name.length).toBeGreaterThan(0);
  });

  it("follows the site copy rules in every product's words", () => {
    const copy = JSON.stringify({ PRODUCTS, WAY_DETAILS, NEED_DETAILS });
    expect(copy).not.toMatch(/\b(door|sprint|playbook|retainer|leverage|holistic|synergy|solutions)\b/i);
    expect(copy).not.toMatch(/\b(color|program|organization|analyze|center)\b/);
  });
});

describe("starting a product while online ordering is not yet open", () => {
  it("starts finished work with the free call until ordering opens, then lets the owner buy it", () => {
    const forecast = productById("cash_flow_forecast")!;
    expect(startMode(forecast, false)).toBe("after_call");
    expect(startMode(forecast, true)).toBe("self");
    expect(startMode(productById("business_review")!, true)).toBe("after_call");
    expect(startMode(productById("business_health_check")!, false)).toBe("check");
  });
});

describe("the menu by need", () => {
  it("names a different Six-Week Fix problem under each need it is listed in, rather than repeating itself", () => {
    const fix = productById("six_week_fix")!;
    const names = fix.needs.map((need) => menuEntry(fix, need).name);
    expect(names).toEqual(["Six-Week Fix: Margin", "Six-Week Fix: Sales", "Six-Week Fix: Cash and Pricing", "Six-Week Fix: Delegation and Structure"]);
    expect(menuEntry(productById("hiring_toolkit")!, "people").name).toBe("Hiring Toolkit");
  });
});

describe("what comes next", () => {
  it("names the Six-Week Fix problem each Done for You product leads into (plan page 18)", () => {
    expect(productById("pricing_unit_cost_review")!.nextVariant).toBe("margin");
    expect(productById("cash_flow_forecast")!.nextVariant).toBe("cash_pricing");
    expect(productById("hiring_toolkit")!.nextVariant).toBe("delegation_structure");
    for (const product of PRODUCTS) if (product.nextVariant) expect(nextProduct(product)!.variants!.map((variant) => variant.id)).toContain(product.nextVariant);
  });
});

describe("what each product asks the owner for", () => {
  it("never says \"if you have it\" in a record's name: the page adds it for optional records", () => {
    for (const product of PRODUCTS) for (const record of product.intake.records) expect(record.label, `${product.id}: ${record.label}`).not.toMatch(/if you have/i);
  });
});
