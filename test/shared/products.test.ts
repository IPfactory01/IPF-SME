import { describe, expect, it } from "vitest";
import { PRICES } from "@shared/businessSupport";
import { DIGITAL_MARKETING } from "@shared/engagementTypes";
import {
  countWord, firstHalf, firstPaymentLink, isService, secondHalf, startingAmount, MENU_PRODUCTS, NEED_DETAILS, NEEDS, nextProduct, payInFullAmount, paymentTerms, priceLabel, priceTerms, productById, productBySlug, PRODUCTS,
  menuEntry, productsForNeed, quarterAmount, stageAmount, startingPriceOf, startMode, WAY_DETAILS, WAYS_TO_BUY, type PriceModel,
} from "@shared/products";

/** Operational Business Plan, page 11: the launch menu at the prices ET set on 21 October 2026. */
const PLAN_PRICES: Record<string, string> = {
  business_health_check: "Free",
  full_report: "₦100,000",
  funding_readiness_assessment: "₦150,000",
  business_review: "₦600,000",
  strategy_90_day_plan: "₦450,000",
  // Lowered from ₦750,000 by ET on 28 October 2026.
  pricing_unit_cost_review: "₦400,000",
  bookkeeping_catch_up: "₦100,000 a month of records",
  cash_flow_forecast: "₦300,000",
  // Raised from ₦600,000 by ET on 28 October 2026, above the Business Plan it builds on.
  funding_application_pack: "₦900,000",
  hiring_toolkit: "₦300,000",
  six_week_fix: "₦1,500,000",
  // Shown by the quarter they are paid in (ET, 28 October 2026); the month is shown beside it.
  monthly_accounts: "₦600,000 a quarter",
  monthly_adviser_review: "₦450,000 a quarter",
  // Added by ET on 28 October 2026, after the plan.
  business_model: "₦300,000",
  financial_model: "₦350,000",
  business_plan: "₦750,000",
  pitch_deck: "₦300,000",
  // On the menu from 10 November 2026 (R35): the first client's programme, paid month by month (R36).
  digital_marketing: "₦470,000 a month",
};

describe("the launch menu (Operational Business Plan, 22 October 2026)", () => {
  it("has the thirteen products of page 11, the four added on 28 October and Digital Marketing, each at its price", () => {
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

  it("charges the Six-Week Fix half at the start and half at the result (ET, 10 November 2026), or in full at 5% off", () => {
    const fix = productById("six_week_fix")!.price as Extract<PriceModel, { kind: "milestones" }>;
    expect(fix.stages.map((stage) => stage.percent)).toEqual([50, 50]);
    expect(fix.stages.reduce((sum, stage) => sum + stageAmount(fix, stage.percent), 0)).toBe(1_500_000);
    expect(payInFullAmount(fix)).toBe(1_425_000);
    expect(priceTerms(fix)).toContain("₦750,000 at the start, ₦750,000 at the result");
    expect(productById("six_week_fix")!.variants!.map((variant) => variant.name)).toEqual(["Margin", "Sales", "Cash and Pricing", "Delegation and Structure"]);
  });

  it("pays a service agreed on a call half to start and half on delivery, and anything bought online before we start (R36)", () => {
    // The services: one-off work sold after the free call. Monthly Services are billed by the quarter instead.
    expect(PRODUCTS.filter(isService).map((product) => product.id)).toEqual(["business_review", "business_plan", "pricing_unit_cost_review", "funding_application_pack", "six_week_fix"]);
    for (const product of PRODUCTS.filter((item) => item.buy === "self")) expect(isService(product), product.id).toBe(false);
    expect(paymentTerms(productById("business_review")!)).toBe("₦300,000 to start and ₦300,000 on delivery, by transfer or card.");
    expect(paymentTerms(productById("pitch_deck")!)).toBe("Paid before we start, by transfer or card.");
    // Two halves always add up to the price, in whole naira.
    expect([firstHalf(750_001), 750_001 - firstHalf(750_001)]).toEqual([375_001, 375_000]);
    // The second half, from what was paid: the rest of the price, never more than the first half, nothing after a whole price.
    expect(secondHalf(300_000, 600_000)).toBe(300_000);
    expect(secondHalf(375_001, 750_001)).toBe(375_000);
    expect(secondHalf(600_000, 600_000)).toBe(0);
    expect(secondHalf(50, 600_000)).toBe(50);
    expect(secondHalf(300_000, 700_000)).toBe(300_000);
    expect(WAY_DETAILS.done_for_you.charge).toMatch(/Bought online, it is paid before we start; agreed on a call, half to start and half on delivery/);
    expect(WAY_DETAILS.six_week_fix.charge).toMatch(/^Half at the start and half at the result/);
  });

  it("sells Digital Marketing as a Monthly Service for sales, month by month for three months, with the programme the room runs (R35)", () => {
    const marketing = productById("digital_marketing")!;
    expect([marketing.way, marketing.needs, marketing.buy, marketing.slug]).toEqual(["monthly_service", ["sales"], "after_call", "digital-marketing"]);
    expect(marketing.price).toEqual({ kind: "monthly", perMonth: 470_000, months: 3 });
    expect(priceTerms(marketing.price)).toBe("₦470,000 a month for three months, each paid before the month starts.");
    // Not a service paid in halves: its own terms, and the link for its first month after the call.
    expect(isService(marketing)).toBe(false);
    expect(paymentTerms(marketing)).toBe(priceTerms(marketing.price));
    expect(startingAmount(marketing.price)).toBe(470_000);
    expect([firstPaymentLink(marketing), firstPaymentLink(productById("business_plan")!), firstPaymentLink(productById("pitch_deck")!)]).toEqual(["the link for the first month", "the link for the first half", "your payment link"]);
    // The page promises the pieces the programme delivers each month.
    for (const item of DIGITAL_MARKETING.monthly) expect(marketing.youGet[0]).toContain(`${item.count} ${item.label.toLowerCase()}`);
    expect([countWord(3), countWord(12), countWord(13)]).toEqual(["three", "twelve", "13"]);
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
